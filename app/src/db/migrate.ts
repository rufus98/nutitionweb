// Esecuzione delle migrazioni dello schema.
//
// Ogni file `migrations/NNNN_descrizione.sql` è una migrazione: viene eseguita una sola volta, in una
// transazione, e registrata in `schema_migrations`. Le migrazioni già distribuite non si modificano:
// per cambiare lo schema si aggiunge un nuovo file con il numero successivo (vedi src/db/README.md).
import type { Driver } from './driver';

export interface Migration { version: number; name: string; sql: string }

const files = import.meta.glob('./migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const MIGRATIONS: Migration[] = Object.entries(files)
  .map(([path, sql]) => {
    const m = /\/(\d{4})_([\w-]+)\.sql$/.exec(path);
    if (!m) throw new Error(`Nome migrazione non valido: ${path} (atteso NNNN_descrizione.sql)`);
    return { version: Number(m[1]), name: m[2], sql };
  })
  .sort((a, b) => a.version - b.version);

// Controllo di coerenza: numeri consecutivi da 1, senza buchi né doppioni.
MIGRATIONS.forEach((m, i) => {
  if (m.version !== i + 1) throw new Error(`Migrazioni non consecutive: attesa ${i + 1}, trovata ${m.version} (${m.name})`);
});

export const LATEST_VERSION = MIGRATIONS.length;

export interface MigrateOptions {
  /** Chiamato prima di applicare migrazioni a un database che contiene già dati (backup di sicurezza). */
  beforeMigrate?: (from: number, to: number) => Promise<void>;
}

export async function currentVersion(db: Driver): Promise<number> {
  await ensureHistory(db);
  const [r] = await db.query<{ v: number | null }>('SELECT max(version) AS v FROM schema_migrations');
  return Number(r?.v ?? 0);
}

async function ensureHistory(db: Driver) {
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  // Database creati dalle prime versioni dell'app: la versione era in PRAGMA user_version.
  const [{ n }] = await db.query<{ n: number }>('SELECT count(*) AS n FROM schema_migrations');
  if (Number(n) === 0) {
    const [{ user_version }] = await db.query<{ user_version: number }>('PRAGMA user_version');
    const legacy = Math.min(Number(user_version), MIGRATIONS.length);
    if (legacy > 0) {
      await db.transaction(MIGRATIONS.slice(0, legacy).map((m) => ({
        sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, 'precedente')", params: [m.version, m.name],
      })));
    }
  }
}

/** Porta il database all'ultima versione. Restituisce le versioni applicate. */
export async function migrate(db: Driver, opts: MigrateOptions = {}): Promise<number[]> {
  const from = await currentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > from);
  if (!pending.length) return [];
  if (from > 0 && opts.beforeMigrate) await opts.beforeMigrate(from, LATEST_VERSION);
  const applied: number[] = [];
  for (const m of pending) {
    // Le migrazioni che ricostruiscono tabelle richiedono le chiavi esterne disattivate
    // (il PRAGMA non ha effetto dentro una transazione); vengono verificate prima del COMMIT.
    await db.execute('PRAGMA foreign_keys = OFF');
    try {
      await db.transaction([
        { sql: m.sql, script: true },
        { sql: 'CREATE TEMP TABLE IF NOT EXISTS _fk_check (violations INTEGER NOT NULL CHECK (violations = 0))' },
        { sql: 'INSERT INTO _fk_check SELECT count(*) FROM pragma_foreign_key_check' },
        { sql: 'DROP TABLE _fk_check' },
        { sql: 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)', params: [m.version, m.name] },
        { sql: `PRAGMA user_version = ${m.version}` },
      ]);
    } catch (e: any) {
      throw new Error(`Migrazione ${m.version} (${m.name}) non riuscita: ${e?.message ?? e}`);
    } finally {
      await db.execute('PRAGMA foreign_keys = ON');
    }
    applied.push(m.version);
  }
  return applied;
}
