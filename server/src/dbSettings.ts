// Database configurato dall'amministratore (Impostazioni → Amministrazione dell'app desktop, avviata come amministratore).
// I dati di connessione si salvano cifrati (AES-256-GCM con CONFIG_KEY) in DATA_DIR/database.json.enc:
// senza la chiave, il file non rivela host, utente o password.
import { X509Certificate, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
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
  /** Certificato della CA che firma il database (PEM), per i servizi con CA propria come Aiven. Senza, valgono le CA pubbliche. */
  ca?: string;
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
  const ca = String(b.ca ?? '').trim() || undefined;
  if (ca) caInfo(ca);
  return { client, host, port, database, user, password: b.password == null ? undefined : String(b.password), ssl: !!b.ssl || !!ca, ...(ca ? { ca } : {}) };
}

/** Intestatario e scadenza del certificato CA; errore leggibile se non è un certificato PEM. */
export function caInfo(ca: string): { subject: string; validTo: string } {
  if (ca.length > 32_000 || !ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('Certificato CA non valido: incolla il file .pem (inizia con -----BEGIN CERTIFICATE-----)');
  try {
    const c = new X509Certificate(ca);
    return { subject: /CN=([^\n,]+)/.exec(c.subject)?.[1] ?? c.subject.split('\n')[0], validTo: new Date(c.validTo).toISOString() };
  } catch {
    throw new Error('Certificato CA non valido: il file .pem non si legge');
  }
}

/**
 * Impostazioni da un indirizzo come quello che mostrano Aiven e gli altri servizi gestiti
 * (mysql://utente:password@host:porta/database?ssl-mode=REQUIRED, postgres://…?sslmode=require).
 */
export function settingsFromUrl(url: string, ca?: string): DbSettings {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('DATABASE_URL non valido'); }
  const client: DbClient | undefined = ({ 'mysql:': 'mysql2', 'mysql2:': 'mysql2', 'postgres:': 'pg', 'postgresql:': 'pg' } as const)[u.protocol as 'mysql:'];
  if (!client) throw new Error(`Indirizzo del database non supportato: ${u.protocol}`);
  const mode = (u.searchParams.get('ssl-mode') ?? u.searchParams.get('sslmode') ?? u.searchParams.get('ssl') ?? '').toLowerCase();
  return validateSettings({
    client, host: u.hostname.replace(/^\[|\]$/g, ''), port: u.port ? Number(u.port) : undefined, database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), ssl: !!mode && !['disabled', 'disable', 'false', '0'].includes(mode), ca,
  });
}

/** Configurazione per knex. */
export function toConnection(s: DbSettings, dataDir: string): NonNullable<Config['db']> {
  switch (s.client) {
    case 'better-sqlite3': return { client: s.client, connection: { filename: isAbsolute(s.filename!) ? s.filename! : join(dataDir, s.filename!) } };
    // Il certificato del database si verifica sempre (con la CA indicata o con quelle pubbliche).
    case 'pg': return { client: s.client, connection: { host: s.host, port: s.port, user: s.user, password: s.password ?? '', database: s.database, ssl: s.ssl ? { rejectUnauthorized: true, ...(s.ca ? { ca: s.ca } : {}) } : false, connectionTimeoutMillis: 10_000 } };
    // Date in UTC: non dipendono dal fuso orario del server o del database.
    case 'mysql2': return { client: s.client, connection: { host: s.host, port: s.port, user: s.user, password: s.password ?? '', database: s.database, ssl: s.ssl ? { rejectUnauthorized: true, ...(s.ca ? { ca: s.ca } : {}) } : undefined, charset: 'utf8mb4', timezone: 'Z', connectTimeout: 10_000 } };
    case 'mssql': return { client: s.client, connection: { server: s.host, port: s.port, user: s.user, password: s.password ?? '', database: s.database, options: { encrypt: !!s.ssl, trustServerCertificate: !s.ssl, ...(s.ca ? { cryptoCredentialsDetails: { ca: s.ca } } : {}) } } };
  }
}

/** Impostazioni da mostrare all'amministratore: mai la password. */
export const publicSettings = (s: DbSettings) => {
  const { password, ...rest } = s;
  let ca: { subject: string; validTo: string } | null = null;
  try { if (s.ca) ca = caInfo(s.ca); } catch { /* già controllato al salvataggio */ }
  return { ...rest, hasPassword: !!password, caInfo: ca };
};

const FILE = 'database.json.enc';

/**
 * Chiave per cifrare la configurazione del database: CONFIG_KEY se impostata, altrimenti una chiave casuale creata
 * al primo salvataggio in DATA_DIR/config.key (leggibile solo dall'utente del server). Così non c'è nulla da generare.
 */
export function resolveConfigKey(dataDir: string, key: Buffer | null, create = true): Buffer | null {
  if (key) return key;
  const path = join(dataDir, 'config.key');
  if (existsSync(path)) return Buffer.from(readFileSync(path, 'utf8').trim(), 'hex');
  if (!create) return null;
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const k = randomBytes(32);
  writeFileSync(path, k.toString('hex'), { mode: 0o600 });
  return k;
}

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
