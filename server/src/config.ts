// Configurazione da variabili d'ambiente (vedi .env.example).
import { readFileSync } from 'node:fs';
import { settingsFromUrl, toConnection } from './dbSettings.js';

export type DbClient = 'pg' | 'mysql2' | 'mssql' | 'better-sqlite3';

export interface Config {
  port: number;
  host: string;
  /** Database da variabili d'ambiente; null = da configurare dall'amministratore (modalità configurazione). */
  db: { client: DbClient; connection: string | Record<string, unknown> } | null;
  /** Chiave AES-256 (64 caratteri esadecimali) per cifrare la configurazione del database; se manca, il server ne crea una in DATA_DIR. */
  configKey: Buffer | null;
  /** Cartella dei dati del server (configurazione cifrata, eventuale file SQLite). */
  dataDir: string;
  /** SHA-256 (esadecimale) della chiave dello studio: la chiave vera sta solo nell'app desktop. */
  /** Facoltativo: abilita le API dello studio (non usate dall'app attuale, che scrive direttamente nel database). */
  studioKeyHash: string | null;
  /** Indirizzo pubblico della web app dei pazienti, per i link di attivazione (es. https://app.diet.it). */
  webOrigin: string;
  /** Origini ammesse per CORS ("*" va bene: l'accesso è con token Bearer, senza cookie). */
  corsOrigins: string[] | '*';
  sessionDays: number;
  activationDays: number;
  migrateOnStart: boolean;
  trustProxy: boolean;
}

const CLIENTS: DbClient[] = ['pg', 'mysql2', 'mssql', 'better-sqlite3'];

/** Legge .env (se c'è) senza sovrascrivere le variabili già impostate dall'ambiente (Docker, systemd…). */
export function loadDotEnv(file = '.env') {
  try { process.loadEnvFile(file); } catch { /* file assente: si usano solo le variabili d'ambiente */ }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (k: string) => { const v = env[k]?.trim(); if (!v) throw new Error(`Variabile d'ambiente mancante: ${k} (vedi .env.example)`); return v; };
  const url = env.DATABASE_URL?.trim();
  // Il tipo si ricava anche dall'indirizzo (mysql://… è MySQL), così basta incollare l'URI del servizio.
  const client = (env.DB_CLIENT?.trim() || (url?.startsWith('mysql') ? 'mysql2' : 'pg')) as DbClient;
  if (!CLIENTS.includes(client)) throw new Error(`DB_CLIENT non valido: ${client}. Valori ammessi: ${CLIENTS.join(', ')}`);
  const dataDir = env.DATA_DIR?.trim() || './data';
  const hex64 = (k: string) => { const v = env[k]?.trim().toLowerCase(); if (!v) return null; if (!/^[0-9a-f]{64}$/.test(v)) throw new Error(`${k} deve essere di 64 caratteri esadecimali `); return v; };
  const configKey = hex64('CONFIG_KEY');
  const studioKeyHash = env.STUDIO_KEY_SHA256?.trim().toLowerCase() || null;
  if (studioKeyHash && !/^[0-9a-f]{64}$/.test(studioKeyHash)) throw new Error('STUDIO_KEY_SHA256 deve essere lo SHA-256 esadecimale della chiave (npm run studio-key)');
  const origins = env.CORS_ORIGINS?.trim() || '*';
  return {
    port: Number(env.PORT || 8080),
    host: env.HOST || '0.0.0.0',
    db: url ? dbFromUrl(client, url, env, dataDir) : null,
    configKey: configKey ? Buffer.from(configKey, 'hex') : null,
    dataDir,
    studioKeyHash,
    webOrigin: need('WEB_ORIGIN').replace(/\/$/, ''),
    corsOrigins: origins === '*' ? '*' : origins.split(',').map((o) => o.trim()).filter(Boolean),
    sessionDays: Number(env.SESSION_DAYS || 30),
    activationDays: Number(env.ACTIVATION_DAYS || 7),
    migrateOnStart: env.MIGRATE_ON_START !== '0',
    trustProxy: env.TRUST_PROXY === '1',
  };
}

/**
 * PostgreSQL e MySQL: l'indirizzo diventa una configurazione completa, con SSL da ?ssl-mode=/?sslmode= e il certificato
 * della CA da DB_SSL_CA (percorso del file .pem, es. quello scaricato da Aiven). Gli altri database usano l'indirizzo così com'è.
 */
function dbFromUrl(client: DbClient, url: string, env: NodeJS.ProcessEnv, dataDir: string): NonNullable<Config['db']> {
  if (client === 'better-sqlite3') return { client, connection: { filename: url } };
  if (client === 'mssql') return { client, connection: url };
  const caPath = env.DB_SSL_CA?.trim();
  let ca: string | undefined;
  if (caPath) {
    try { ca = readFileSync(caPath, 'utf8'); } catch { throw new Error(`DB_SSL_CA: file non trovato (${caPath})`); }
  }
  const s = settingsFromUrl(url, ca);
  if (s.client !== client) throw new Error(`DATABASE_URL (${s.client}) non corrisponde a DB_CLIENT (${client})`);
  return toConnection(s, dataDir);
}
