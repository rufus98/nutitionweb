// Database configurato dall'amministratore (Impostazioni → Amministrazione dell'app desktop, avviata come amministratore).
// I dati di connessione si salvano cifrati (AES-256-GCM con CONFIG_KEY) in DATA_DIR/database.json.enc:
// senza la chiave, il file non rivela host, utente o password.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Config, DbClient } from './config.js';

export interface DbSettings {
  client: DbClient;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  /** Connessione cifrata (TLS) verso il database. */
  ssl?: boolean;
  /** Solo SQLite: file sul server (relativo a DATA_DIR). */
  filename?: string;
}

export const DEFAULT_PORTS: Record<DbClient, number | null> = { pg: 5432, mysql2: 3306, mssql: 1433, 'better-sqlite3': null };

/** Controlla i dati inviati dall'amministratore; restituisce le impostazioni pulite o lancia un errore leggibile. */
export function validateSettings(x: unknown): DbSettings {
  const b = (x ?? {}) as Record<string, unknown>;
  const client = b.client as DbClient;
  if (!(client in DEFAULT_PORTS)) throw new Error('Tipo di database non valido');
  if (client === 'better-sqlite3') {
    const filename = String(b.filename ?? '').trim() || 'nutrea.sqlite';
    if (!/^[\w.\-/]+$/.test(filename) || filename.includes('..')) throw new Error('Nome del file SQLite non valido');
    return { client, filename };
  }
  const host = String(b.host ?? '').trim();
  if (!host || !/^[\w.\-:[\]]+$/.test(host)) throw new Error('Indirizzo del database (host) non valido');
  const port = b.port == null || b.port === '' ? DEFAULT_PORTS[client]! : Number(b.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta non valida');
  const database = String(b.database ?? '').trim();
  if (!database || !/^[\w\-$]+$/.test(database)) throw new Error('Nome del database non valido');
  const user = String(b.user ?? '').trim();
  if (!user) throw new Error('Utente del database mancante');
  return { client, host, port, database, user, password: b.password == null ? undefined : String(b.password), ssl: !!b.ssl };
}

/** Configurazione per knex. */
export function toConnection(s: DbSettings, dataDir: string): NonNullable<Config['db']> {
  switch (s.client) {
    case 'better-sqlite3': return { client: s.client, connection: { filename: isAbsolute(s.filename!) ? s.filename! : join(dataDir, s.filename!) } };
    case 'pg': return { client: s.client, connection: { host: s.host, port: s.port, user: s.user, password: s.password ?? '', database: s.database, ssl: s.ssl ? { rejectUnauthorized: true } : false } };
    case 'mysql2': return { client: s.client, connection: { host: s.host, port: s.port, user: s.user, password: s.password ?? '', database: s.database, ssl: s.ssl ? {} : undefined, charset: 'utf8mb4' } };
    case 'mssql': return { client: s.client, connection: { server: s.host, port: s.port, user: s.user, password: s.password ?? '', database: s.database, options: { encrypt: !!s.ssl, trustServerCertificate: !s.ssl } } };
  }
}

/** Impostazioni da mostrare all'amministratore: mai la password. */
export const publicSettings = (s: DbSettings) => {
  const { password, ...rest } = s;
  return { ...rest, hasPassword: !!password };
};

const FILE = 'database.json.enc';

export function saveSettings(dataDir: string, key: Buffer, s: DbSettings) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(s), 'utf8'), c.final()]);
  const body = JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
  // Scrittura atomica: prima un file temporaneo, poi la sostituzione.
  const tmp = join(dataDir, FILE + '.tmp');
  writeFileSync(tmp, body, { mode: 0o600 });
  renameSync(tmp, join(dataDir, FILE));
}

export function loadSettings(dataDir: string, key: Buffer | null): DbSettings | null {
  const path = join(dataDir, FILE);
  if (!existsSync(path)) return null;
  if (!key) throw new Error(`Trovata la configurazione cifrata del database (${path}) ma manca CONFIG_KEY`);
  const f = JSON.parse(readFileSync(path, 'utf8'));
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(f.iv, 'base64'));
  d.setAuthTag(Buffer.from(f.tag, 'base64'));
  try {
    return JSON.parse(Buffer.concat([d.update(Buffer.from(f.data, 'base64')), d.final()]).toString('utf8'));
  } catch {
    throw new Error('Impossibile leggere la configurazione del database: CONFIG_KEY non corrisponde');
  }
}
