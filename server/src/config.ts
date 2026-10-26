// Configurazione da variabili d'ambiente (vedi .env.example).
export type DbClient = 'pg' | 'mysql2' | 'mssql' | 'better-sqlite3';

export interface Config {
  port: number;
  host: string;
  db: { client: DbClient; connection: string | Record<string, unknown> };
  /** SHA-256 (esadecimale) della chiave dello studio: la chiave vera sta solo nell'app desktop. */
  studioKeyHash: string;
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
  const client = (env.DB_CLIENT?.trim() || 'pg') as DbClient;
  if (!CLIENTS.includes(client)) throw new Error(`DB_CLIENT non valido: ${client}. Valori ammessi: ${CLIENTS.join(', ')}`);
  const studioKeyHash = need('STUDIO_KEY_SHA256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(studioKeyHash)) throw new Error('STUDIO_KEY_SHA256 deve essere lo SHA-256 esadecimale della chiave (npm run studio-key)');
  const origins = env.CORS_ORIGINS?.trim() || '*';
  return {
    port: Number(env.PORT || 8080),
    host: env.HOST || '0.0.0.0',
    db: { client, connection: client === 'better-sqlite3' ? { filename: env.DATABASE_URL || './nutrea.sqlite' } : need('DATABASE_URL') },
    studioKeyHash,
    webOrigin: need('WEB_ORIGIN').replace(/\/$/, ''),
    corsOrigins: origins === '*' ? '*' : origins.split(',').map((o) => o.trim()).filter(Boolean),
    sessionDays: Number(env.SESSION_DAYS || 30),
    activationDays: Number(env.ACTIVATION_DAYS || 7),
    migrateOnStart: env.MIGRATE_ON_START !== '0',
    trustProxy: env.TRUST_PROXY === '1',
  };
}
