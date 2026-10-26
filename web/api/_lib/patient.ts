// API dei pazienti eseguite direttamente sul database: niente server, solo funzioni serverless (api/patient.ts) che
// leggono e scrivono le tabelle in cui scrive l'app desktop (patient_access, patient_session, patient_access_log).
// Stesso contratto e stesse regole di sicurezza di server/src/app.ts:
//   POST /api/p/:token/activate   { code, password } → imposta la password, apre la sessione
//   POST /api/p/:token/login      { password }       → apre la sessione
//   GET  /api/p/:token                                → dati (sessione), 401 { state: 'activate' | 'login' }
//   GET  /api/p/:token/pdf · POST /api/p/:token/consent · POST /api/p/:token/logout
import { hashPassword, passwordProblem, randomCode, sameHash, sha256, verifyPassword } from './crypto.js';

export type Row = Record<string, any>;
/** Accesso al database: query con parametri "?" e transazioni. */
export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
export interface Deps { db: Db; ip?: string; now?: () => Date }

/** Database non configurato o non raggiungibile: 503, la web app mostra la copia salvata del piano. */
export class DbUnavailable extends Error {}

const TOKEN = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_FAILED = 5, LOCK_MINUTES = 15, SESSION_DAYS = 30;

interface AccessRow {
  id: number; token: string; email: string; first_name: string; status: 'pending' | 'active' | 'disabled';
  password_hash: string | null; activation_hash: string | null; activation_expires_at: unknown;
  view_json: string; pdf_name: string | null; pdf_b64: string | null; log_access: unknown; consent_at: unknown;
  failed_logins: number; locked_until: unknown;
}

/** Date di MySQL: Date (mysql2) oppure "YYYY-MM-DD HH:MM:SS" in UTC, come le scrive l'app desktop. */
export const toDate = (v: unknown): Date | null =>
  v == null || v === '' ? null : v instanceof Date ? v : new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(String(v)) ? String(v).replace(' ', 'T') + 'Z' : String(v));

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ER_TOO_MANY_USER_CONNECTIONS']);
const isConnectionError = (e: any) => e instanceof DbUnavailable || CONNECTION_CODES.has(e?.code) || e?.fatal === true;

// Nessuna risposta va in cache o nei motori di ricerca: contengono dati sanitari.
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { ...HEADERS, ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }) } });
/** Le risposte di errore si lanciano e si restituiscono così come sono. */
const fail = (status: number, error: string, extra: object = {}) => json(status, { error, ...extra });

/** Tentativi di login/attivazione per IP al minuto. In memoria, quindi per istanza: il blocco per link (5 errori) è nel database. */
const attempts = new Map<string, number[]>();
function limited(ip: string, t: number, max = 20, windowMs = 60_000) {
  const recent = (attempts.get(ip) ?? []).filter((x) => t - x < windowMs);
  recent.push(t);
  attempts.set(ip, recent);
  if (attempts.size > 10_000) for (const [k, v] of attempts) if (t - v[v.length - 1] >= windowMs) attempts.delete(k);
  return recent.length > max;
}

export async function handle(req: Request, { db, ip = '', now = () => new Date() }: Deps): Promise<Response> {
  // /api/p/:token[/azione], oppure /api/patient?token=…&action=… dopo il rewrite di vercel.json.
  const url = new URL(req.url);
  const m = /^\/api\/p\/([^/]+)(?:\/([a-z]+))?\/?$/.exec(url.pathname);
  const token = m ? decodeURIComponent(m[1]) : url.searchParams.get('token') ?? '';
  const action = (m ? m[2] : url.searchParams.get('action')) ?? '';
  const route = `${req.method} ${action}`;

  const find = async () => (await db.query<AccessRow>('select * from patient_access where token = ?', [token]))[0];
  const log = async (a: AccessRow, event: string) => { if (Number(a.log_access)) await db.query('insert into patient_access_log (access_id, event, at) values (?, ?, ?)', [a.id, event, now()]); };
  const body = async () => (await req.json().catch(() => undefined)) as Record<string, unknown> | undefined;

  /** Ciò che si mostra prima del login (a chi ha il link): nome di battesimo e contatti dello studio, per chiedere aiuto. */
  const publicInfo = (a: AccessRow) => {
    let studio = { name: '', whatsapp: '' };
    try { const v = JSON.parse(a.view_json); studio = { name: v.studio?.name ?? '', whatsapp: v.studio?.whatsapp ?? '' }; } catch { /* dati illeggibili */ }
    return { firstName: a.first_name, studio };
  };
  /** Accesso dal link: 404 se non esiste, 410 se disattivato dallo studio. */
  const patientAccess = async () => {
    if (!TOKEN.test(token)) throw fail(404, 'Link non valido');
    const a = await find();
    if (!a) throw fail(404, 'Link non valido');
    if (a.status === 'disabled') throw fail(410, 'Link disattivato dallo studio');
    return a;
  };
  /** Sessione valida per questo accesso; altrimenti 401 con lo stato (attivare o accedere). */
  const session = async () => {
    const a = await patientAccess();
    const s = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    const row = s ? (await db.query('select * from patient_session where id = ? and access_id = ?', [sha256(s), a.id]))[0] : undefined;
    if (!row || toDate(row.expires_at)!.getTime() <= now().getTime()) {
      if (row) await db.query('delete from patient_session where id = ?', [row.id]);
      throw fail(401, 'Accesso richiesto', { state: a.password_hash ? 'login' : 'activate', ...publicInfo(a) });
    }
    return { a, sessionId: row.id as string };
  };
  const openSession = async (a: AccessRow) => {
    const code = randomCode();
    const expiresAt = new Date(now().getTime() + SESSION_DAYS * 864e5);
    await db.query('insert into patient_session (id, access_id, created_at, expires_at) values (?, ?, ?, ?)', [sha256(code), a.id, now(), expiresAt]);
    return json(200, { session: code, expiresAt: expiresAt.toISOString() });
  };

  try {
    switch (route) {
      case 'POST activate': {
        if (limited(ip, now().getTime())) return fail(429, 'Troppi tentativi: riprova tra qualche minuto');
        const a = await patientAccess();
        const b = await body();
        const valid = typeof b?.code === 'string' && !!a.activation_hash && sameHash(sha256(b.code), a.activation_hash)
          && (toDate(a.activation_expires_at)?.getTime() ?? 0) > now().getTime();
        if (!valid) return fail(400, 'Link di attivazione scaduto o già usato: chiedi allo studio di inviartene uno nuovo', { code: 'activation' });
        const problem = passwordProblem(b!.password, a.email);
        if (problem) return fail(400, problem, { code: 'password' });
        const hash = await hashPassword(b!.password as string);
        await db.transaction(async (tx) => {
          // Nuova password: le sessioni precedenti (es. su un telefono perso) non valgono più.
          await tx.query('delete from patient_session where access_id = ?', [a.id]);
          await tx.query("update patient_access set password_hash = ?, password_set_at = ?, status = 'active', activation_hash = null, activation_expires_at = null, failed_logins = 0, locked_until = null, last_login_at = ?, updated_at = ? where id = ?",
            [hash, now(), now(), now(), a.id]);
        });
        await log(a, 'activate');
        return openSession(a);
      }
      case 'POST login': {
        if (limited(ip, now().getTime())) return fail(429, 'Troppi tentativi: riprova tra qualche minuto');
        const a = await patientAccess();
        if (!a.password_hash) return fail(401, 'Accesso non ancora attivato: usa il link di attivazione ricevuto dallo studio', { state: 'activate', ...publicInfo(a) });
        const lockedUntil = toDate(a.locked_until);
        if (lockedUntil && lockedUntil.getTime() > now().getTime()) return fail(429, `Troppi tentativi errati: riprova dopo le ${lockedUntil.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}`);
        const password = (await body())?.password;
        if (typeof password !== 'string' || !(await verifyPassword(password, a.password_hash))) {
          const failed = a.failed_logins + 1;
          await db.query('update patient_access set failed_logins = ?, locked_until = ? where id = ?',
            [failed >= MAX_FAILED ? 0 : failed, failed >= MAX_FAILED ? new Date(now().getTime() + LOCK_MINUTES * 60_000) : null, a.id]);
          return fail(401, failed >= MAX_FAILED ? `Password non corretta. Troppi tentativi: riprova tra ${LOCK_MINUTES} minuti` : 'Password non corretta', { state: 'login', attemptsLeft: Math.max(0, MAX_FAILED - failed) });
        }
        await db.query('update patient_access set failed_logins = 0, locked_until = null, last_login_at = ? where id = ?', [now(), a.id]);
        await log(a, 'login');
        return openSession(a);
      }
      case 'GET ': {
        const { a } = await session();
        const view = JSON.parse(a.view_json);
        view.consent = { ...view.consent, required: !!view.consent?.required && !a.consent_at };
        view.links = { ...view.links, pdf: a.pdf_b64 && view.features?.pdf ? `/api/p/${a.token}/pdf` : null };
        await log(a, 'view');
        return json(200, view);
      }
      case 'GET pdf': {
        const { a } = await session();
        if (!a.pdf_b64) return fail(404, 'PDF non disponibile');
        return new Response(Buffer.from(a.pdf_b64, 'base64'), { status: 200, headers: {
          ...HEADERS, 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${(a.pdf_name ?? 'piano.pdf').replace(/[^\w.\- ]/g, '_')}"`,
        } });
      }
      case 'POST consent': {
        const { a } = await session();
        if (!a.consent_at) await db.query('update patient_access set consent_at = ? where id = ?', [now(), a.id]);
        await log(a, 'consent');
        return json(204);
      }
      case 'POST logout': {
        const { a, sessionId } = await session();
        await db.query('delete from patient_session where id = ?', [sessionId]);
        await log(a, 'logout');
        return json(204);
      }
      default:
        return fail(404, 'Percorso non trovato');
    }
  } catch (e: any) {
    if (e instanceof Response) return e;
    // Al paziente un messaggio semplice: la web app mostra la copia salvata del piano, se c'è. Il dettaglio resta nel log.
    if (isConnectionError(e)) { console.warn(`Database non raggiungibile: ${e?.code ?? ''} ${String(e?.message).slice(0, 160)}`); return fail(503, 'Servizio momentaneamente non disponibile: riprova tra qualche minuto'); }
    console.error(e);
    return fail(500, 'Errore interno del server');
  }
}
