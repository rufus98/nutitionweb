// Connessione al database e migrazioni (elencate qui, così funzionano anche dopo la compilazione).
import knexFactory, { type Knex } from 'knex';
import type { Config } from './config.js';
import * as m001 from './migrations/001_accessi_pazienti.js';

const MIGRATIONS: Record<string, { up: (k: Knex) => Promise<void>; down: (k: Knex) => Promise<void> }> = {
  '001_accessi_pazienti': m001,
};

const source: Knex.MigrationSource<string> = {
  getMigrations: async () => Object.keys(MIGRATIONS).sort(),
  getMigrationName: (m) => m,
  getMigration: async (m) => MIGRATIONS[m],
};

export function connect(db: NonNullable<Config['db']>): Knex {
  const sqlite = db.client === 'better-sqlite3';
  return knexFactory({
    client: db.client,
    connection: db.connection as Knex.StaticConnectionConfig,
    useNullAsDefault: sqlite,
    // SQLite in memoria (test): una sola connessione, altrimenti ognuna vedrebbe un database diverso.
    // Poche connessioni: bastano per lo studio e i pazienti, e i piani gratuiti (es. Aiven) ne ammettono un numero limitato.
    pool: sqlite ? { min: 1, max: 1, afterCreate: (c: any, done: any) => { c.pragma('foreign_keys = ON'); done(); } } : { min: 0, max: 5 },
    // Database spento o irraggiungibile: errore dopo 15 secondi invece di 60.
    acquireConnectionTimeout: 15_000,
    migrations: { migrationSource: source, tableName: 'nutrea_migrations' },
  });
}

export async function migrate(knex: Knex) {
  const [, applied] = await knex.migrate.latest();
  return applied as string[];
}

/** Le date tornano come Date, numero o stringa a seconda del database. */
export const toDate = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v)));

/** Risposta 503 quando il database non è configurato o non è raggiungibile. */
export class DbUnavailable extends Error {
  readonly statusCode = 503;
  constructor(message = "Database non configurato: l'amministratore deve configurarlo") { super(message); }
}

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ER_TOO_MANY_USER_CONNECTIONS', '57P01', '57P03', '53300', 'ESOCKET', 'ETIMEOUT']);

/**
 * Il database non risponde (spento, irraggiungibile, troppe connessioni): non è un errore dell'applicazione.
 * Succede per esempio con i piani gratuiti che spengono il database dopo un periodo di inattività.
 */
export const isConnectionError = (e: any): boolean =>
  CONNECTION_CODES.has(e?.code) || e?.name === 'KnexTimeoutError' || e?.fatal === true || /Connection terminated|Connection is closed|connect ETIMEDOUT/i.test(String(e?.message ?? ''));

/** Versione del server di database, da mostrare all'amministratore. */
async function serverVersion(k: Knex, client: string): Promise<string> {
  const sql = client === 'pg' ? 'select version() as v' : client === 'mysql2' ? 'select version() as v' : client === 'mssql' ? 'select @@version as v' : 'select sqlite_version() as v';
  const r: any = await k.raw(sql);
  const row = Array.isArray(r) ? (Array.isArray(r[0]) ? r[0][0] : r[0]) : r.rows?.[0] ?? r;
  return String(row?.v ?? '').split('\n')[0].slice(0, 120);
}

export interface DbStatus {
  configured: boolean;
  /** Da dove viene la configurazione: variabili d'ambiente o pannello dell'amministratore. */
  source: 'env' | 'admin' | null;
  client: string | null;
  version: string | null;
  connectedAt: string | null;
  error: string | null;
}

/**
 * Connessione al database sostituibile mentre il server è in funzione: quando l'amministratore configura un nuovo
 * database, il server si collega, crea le tabelle e passa al nuovo database senza riavvio.
 */
export class DatabaseManager {
  private current: Knex | null = null;
  status: DbStatus = { configured: false, source: null, client: null, version: null, connectedAt: null, error: null };

  constructor(knex?: Knex, client?: string) {
    if (knex) { this.current = knex; this.status = { ...this.status, configured: true, source: 'env', client: client ?? null, connectedAt: new Date().toISOString() }; }
  }

  /** Prova una connessione senza usarla: restituisce la versione del database o lancia l'errore. */
  static async test(conn: NonNullable<Config['db']>): Promise<string> {
    const k = connect(conn);
    try { return await serverVersion(k, conn.client); } finally { await k.destroy(); }
  }

  /** Si collega, applica le migrazioni e sostituisce la connessione in uso. */
  async use(conn: NonNullable<Config['db']>, source: 'env' | 'admin', opts: { migrate?: boolean } = {}) {
    const k = connect(conn);
    try {
      const version = await serverVersion(k, conn.client);
      if (opts.migrate !== false) await migrate(k);
      const old = this.current;
      this.current = k;
      this.status = { configured: true, source, client: conn.client, version, connectedAt: new Date().toISOString(), error: null };
      if (old) await old.destroy().catch(() => {});
    } catch (e) {
      await k.destroy().catch(() => {});
      throw e;
    }
  }

  /** Errore all'avvio: il server resta acceso (per permettere all'amministratore di correggere) e lo segnala. */
  fail(message: string, source: 'env' | 'admin' | null, client: string | null) {
    this.status = { ...this.status, configured: false, source, client, error: message };
  }

  /** Il database in uso; DbUnavailable (503) se non c'è. */
  get(): Knex {
    if (!this.current) throw new DbUnavailable(this.status.error ? `Database non raggiungibile: ${this.status.error}` : undefined);
    return this.current;
  }

  /** Oggetto che si comporta come knex ma usa sempre il database corrente. */
  proxy(): Knex {
    const self = this;
    return new Proxy(function () {} as unknown as Knex, {
      apply: (_t, _this, args) => (self.get() as any)(...args),
      get: (_t, prop) => { const k: any = self.get(); const v = k[prop]; return typeof v === 'function' ? v.bind(k) : v; },
    });
  }

  async close() { await this.current?.destroy(); this.current = null; }
}
