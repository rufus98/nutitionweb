// Collegamento al database MySQL (es. Aiven) dalle variabili d'ambiente, lo stesso in cui scrive l'app desktop:
//   DATABASE_URL=mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:19116/defaultdb?ssl-mode=REQUIRED
//   DB_SSL_CA=<contenuto del file "CA certificate"> (oppure il percorso del file .pem)
// Il pool resta aperto tra un'invocazione e l'altra della stessa istanza; poche connessioni, perché le istanze sono tante.
import { readFileSync } from 'node:fs';
import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { DbUnavailable, type Db } from './patient.js';

let pool: Pool | null = null;

/**
 * Certificato PEM ricostruito: nei campi su una riga (es. variabili di Netlify) gli a capo diventano spazi o "\n" scritti
 * come testo, e il certificato non è più valido. Si riprende il contenuto base64 di ogni blocco e si rimette a 64 caratteri.
 */
export function normalizePem(raw: string): string {
  const blocks = [...raw.replace(/\\r|\\n/g, '\n').matchAll(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/g)];
  return blocks.map(([, label, body]) => `-----BEGIN ${label}-----\n${body.replace(/\s+/g, '').match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`).join('');
}

function createPool(env: NodeJS.ProcessEnv): Pool {
  if (!env.DATABASE_URL) throw new DbUnavailable('DATABASE_URL non impostata');
  const u = new URL(env.DATABASE_URL);
  const mode = (u.searchParams.get('ssl-mode') ?? u.searchParams.get('sslmode') ?? u.searchParams.get('ssl') ?? '').toLowerCase();
  const ssl = !['disabled', 'disable', 'false', '0'].includes(mode);
  // Il certificato si può incollare nella variabile (anche su una riga) o indicare come file.
  const caVar = env.DB_SSL_CA?.trim().replace(/^["']|["']$/g, '');
  const caText = caVar && !caVar.includes('-----BEGIN') ? readFileSync(caVar, 'utf8') : caVar;
  const ca = caText ? normalizePem(caText) : '';
  if (caText && !ca) throw new DbUnavailable('DB_SSL_CA non contiene un certificato (-----BEGIN CERTIFICATE----- … -----END CERTIFICATE-----)');
  return mysql.createPool({
    host: u.hostname, port: u.port ? Number(u.port) : 3306, database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    ssl: ssl ? { ca: ca || undefined, rejectUnauthorized: true } : undefined,
    timezone: 'Z', // date in UTC, come le scrive l'app desktop
    connectionLimit: Number(env.DB_POOL_MAX ?? 2), connectTimeout: 10_000, enableKeepAlive: true,
  });
}

const wrap = (c: Pool | PoolConnection): Db => ({
  async query(sql, params = []) {
    const [rows] = await c.query(sql, params);
    return (Array.isArray(rows) ? rows : []) as any[];
  },
  async transaction(fn) {
    const conn = 'getConnection' in c ? await c.getConnection() : c;
    try {
      await conn.beginTransaction();
      const r = await fn(wrap(conn));
      await conn.commit();
      return r;
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      if (conn !== c) conn.release();
    }
  },
});

/** Database dalle variabili d'ambiente; se manca la configurazione ogni query risponde 503. */
export function dbFromEnv(env = process.env): Db {
  try { pool ??= createPool(env); } catch (e) {
    const err = e instanceof DbUnavailable ? e : new DbUnavailable(`Configurazione del database non valida: ${(e as Error).message}`);
    return { query: async () => { throw err; }, transaction: async () => { throw err; } };
  }
  return wrap(pool);
}

/** Indirizzo del paziente per il limite di tentativi (dietro il proxy di Vercel). */
export const clientIp = (req: Request) => req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '';
