// Database MySQL esterno (es. Aiven) usato direttamente dall'app desktop: niente server per lo studio e nessuna chiave da generare.
// L'app scrive nelle stesse tabelle che legge il server dei pazienti (server/, tabelle patient_access…): email, nome, oggetto con
// tutti i dati della dieta e il codice di attivazione (solo il suo SHA-256). La password la sceglie il paziente: la salva il server,
// solo come hash scrypt. Le query girano nel comando Rust `remote_sql` (src-tauri/src/remote_db.rs).
import { isTauri } from '../db/driver';

export interface DbConn { host: string; port: number; database: string; user: string; password: string; ssl: boolean; ca?: string }
export interface SqlResult { rows: Record<string, any>[]; affected: number; version: string }
export type SqlExecutor = (conn: DbConn, sql: string, params: unknown[]) => Promise<SqlResult>;

const VIEW_VERSION = 1;
const MIGRATION = '001_accessi_pazienti';

const tauriExecutor: SqlExecutor = async (conn, sql, params) => {
  if (!isTauri()) throw new Error("Il collegamento diretto al database funziona solo nell'app per Windows");
  const { invoke } = await import('@tauri-apps/api/core');
  try { return await invoke<SqlResult>('remote_sql', { conn, sql, params }); }
  catch (e) { throw new Error(dbErrorText(e)); }
};
let executor: SqlExecutor = tauriExecutor;
/** Per i test: al posto del comando Rust. */
export const setSqlExecutor = (fn: SqlExecutor | null) => { executor = fn ?? tauriExecutor; };
const run = (c: DbConn, sql: string, params: unknown[] = []) => executor(c, sql, params);

/** Messaggi leggibili per gli errori più comuni di MySQL e della connessione cifrata. */
export function dbErrorText(e: unknown): string {
  const m = String((e as any)?.message ?? e);
  if (/Access denied/i.test(m)) return 'Utente o password del database non corretti';
  if (/Unknown database/i.test(m)) return 'Il database indicato non esiste';
  if (/failed to lookup address|Name or service not known|No such host|nodename nor servname/i.test(m)) return 'Indirizzo del database non trovato';
  if (/refused|actively refused|rifiut/i.test(m)) return 'Il database non accetta connessioni su quella porta';
  if (/timed out|timeout|tempo/i.test(m)) return 'Il database non risponde (tempo scaduto): se è su un piano gratuito potrebbe essere spento, riaccendilo dal pannello del servizio';
  if (/UnknownIssuer|unknown issuer|invalid peer certificate|certificate|NotValid|BadSignature/i.test(m)) return 'Il certificato del database non è verificabile: incolla il certificato CA del servizio (per Aiven: "CA certificate")';
  if (/secure transport|SSL connection is required|insecure/i.test(m)) return 'Il database accetta solo connessioni cifrate: attiva "Connessione cifrata (SSL/TLS)"';
  if (/max_connections|Too many connections/i.test(m)) return 'Il database ha raggiunto il numero massimo di connessioni: riprova tra poco';
  return `Database: ${m.slice(0, 200)}`;
}

// ——— Connessione e tabelle ———

/** Prova la connessione e restituisce la versione di MySQL. */
export async function testConn(c: DbConn): Promise<string> { return `MySQL ${(await run(c, 'select 1 as ok')).version}`; }

/** Crea le tabelle se mancano (stesso schema del server: server/sql/schema.mysql.sql) e le segna come già create per il server. */
export async function ensureSchema(c: DbConn): Promise<void> {
  const has = async (t: string) => (await run(c, 'select 1 as x from information_schema.tables where table_schema = database() and table_name = ?', [t])).rows.length > 0;
  if (await has('nutrea_migrations')) {
    const done = await run(c, 'select 1 as x from nutrea_migrations where name = ?', [MIGRATION]);
    if (done.rows.length) return;
  }
  await run(c, "create table if not exists patient_access (id int unsigned not null auto_increment primary key, token varchar(64) not null, email varchar(254) not null, first_name varchar(100) not null, status varchar(16) not null default 'pending', password_hash varchar(255) null, password_set_at datetime null, activation_hash varchar(64) null, activation_expires_at datetime null, view_json longtext not null, view_version int not null, pdf_name varchar(255) null, pdf_b64 longtext null, log_access boolean not null default '0', consent_at datetime null, failed_logins int not null default '0', locked_until datetime null, last_login_at datetime null, created_at datetime not null, updated_at datetime not null, unique key patient_access_token_unique (token))");
  await run(c, 'create table if not exists patient_session (id varchar(64) not null, access_id int unsigned not null, created_at datetime not null, expires_at datetime not null, primary key (id), index patient_session_access_id_index (access_id), constraint patient_session_access_id_foreign foreign key (access_id) references patient_access (id) on delete cascade)');
  await run(c, 'create table if not exists patient_access_log (id int unsigned not null auto_increment primary key, access_id int unsigned not null, event varchar(20) not null, at datetime not null, index patient_access_log_access_id_at_index (access_id, at), constraint patient_access_log_access_id_foreign foreign key (access_id) references patient_access (id) on delete cascade)');
  await run(c, 'create table if not exists nutrea_migrations (id int unsigned not null auto_increment primary key, name varchar(255), batch int, migration_time timestamp)');
  await run(c, 'insert into nutrea_migrations (name, batch, migration_time) values (?, 1, utc_timestamp())', [MIGRATION]);
}

// ——— Accessi dei pazienti ———

export interface AccessSummary { status: 'pending' | 'active' | 'disabled'; hasPassword: boolean; activationPending: boolean; activationExpiresAt: string | null; lastLoginAt: string | null; consentAt: string | null; hasPdf: boolean }

const pad = (n: number) => String(n).padStart(2, '0');
/** Data nel formato di MySQL, in UTC. */
const sqlDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const fromSql = (v: unknown): Date | null => (typeof v === 'string' && v ? new Date(v.replace(' ', 'T') + 'Z') : v instanceof Date ? v : null);
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomCode = (bytes = 32) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const findRow = async (c: DbConn, token: string) => (await run(c, 'select * from patient_access where token = ?', [token])).rows[0] as Record<string, any> | undefined;
const summary = (a: Record<string, any>, now = new Date()): AccessSummary => ({
  status: a.status, hasPassword: !!a.password_hash,
  activationPending: !!a.activation_hash && (fromSql(a.activation_expires_at)?.getTime() ?? 0) > now.getTime(),
  activationExpiresAt: fromSql(a.activation_expires_at)?.toISOString() ?? null,
  lastLoginAt: fromSql(a.last_login_at)?.toISOString() ?? null,
  consentAt: fromSql(a.consent_at)?.toISOString() ?? null,
  hasPdf: !!a.pdf_b64,
});

export class AccessNotFound extends Error { constructor() { super('Accesso non trovato: invia prima i dati del paziente'); } }

/** Crea o aggiorna l'accesso con i dati del paziente (come PUT /api/studio/access/:token del server). */
export async function upsertAccess(c: DbConn, token: string, b: { email: string; firstName: string; view: { v: number }; active: boolean; logAccess: boolean }): Promise<AccessSummary> {
  const email = b.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Email del paziente non valida');
  if (!b.firstName.trim()) throw new Error('Nome del paziente mancante');
  if (b.view?.v !== VIEW_VERSION) throw new Error(`Formato dei dati non supportato (atteso v${VIEW_VERSION})`);
  await ensureSchema(c);
  const now = sqlDate(new Date());
  const existing = await findRow(c, token);
  const first = b.firstName.trim().slice(0, 100), json = JSON.stringify(b.view);
  if (!existing) {
    await run(c, 'insert into patient_access (token, email, first_name, view_json, view_version, log_access, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [token, email, first, json, VIEW_VERSION, b.logAccess ? 1 : 0, b.active ? 'pending' : 'disabled', now, now]);
  } else {
    const status = !b.active ? 'disabled' : existing.password_hash ? 'active' : 'pending';
    await run(c, 'update patient_access set email = ?, first_name = ?, view_json = ?, view_version = ?, log_access = ?, status = ?, updated_at = ? where id = ?',
      [email, first, json, VIEW_VERSION, b.logAccess ? 1 : 0, status, now, existing.id]);
    if (!b.active) await run(c, 'delete from patient_session where access_id = ?', [existing.id]); // disattivato: fuori subito
  }
  return summary((await findRow(c, token))!);
}

/** Nuovo link di attivazione: il codice in chiaro resta solo nel link, nel database c'è il suo SHA-256. */
export async function createActivation(c: DbConn, token: string, webOrigin: string, days = 7): Promise<{ activationUrl: string; expiresAt: string }> {
  const a = await findRow(c, token);
  if (!a) throw new AccessNotFound();
  if (a.status === 'disabled') throw new Error('Accesso disattivato: riattivalo prima di inviare il link');
  const code = randomCode(), expires = new Date(Date.now() + days * 864e5);
  await run(c, 'update patient_access set activation_hash = ?, activation_expires_at = ?, updated_at = ? where id = ?', [await sha256(code), sqlDate(expires), sqlDate(new Date()), a.id]);
  return { activationUrl: `${webOrigin.replace(/\/$/, '')}/p/${token}?a=${code}`, expiresAt: expires.toISOString() };
}

/** PDF originale del piano (o null per toglierlo). */
export async function setPdf(c: DbConn, token: string, pdf: { name: string; b64: string } | null): Promise<AccessSummary> {
  const a = await findRow(c, token);
  if (!a) throw new Error('Accesso non trovato');
  if (pdf && (!/^[A-Za-z0-9+/=]+$/.test(pdf.b64) || !atob(pdf.b64.slice(0, 8)).startsWith('%PDF'))) throw new Error('Il file non è un PDF');
  await run(c, 'update patient_access set pdf_name = ?, pdf_b64 = ?, updated_at = ? where id = ?', [pdf ? (pdf.name || 'piano.pdf').slice(0, 255) : null, pdf?.b64 ?? null, sqlDate(new Date()), a.id]);
  return summary((await findRow(c, token))!);
}

export async function getAccess(c: DbConn, token: string): Promise<AccessSummary & { log: { event: string; at: string }[] }> {
  const a = await findRow(c, token);
  if (!a) throw new Error('Accesso non trovato');
  const log = (await run(c, 'select event, at from patient_access_log where access_id = ? order by at desc limit 100', [a.id])).rows;
  return { ...summary(a), log: log.map((e) => ({ event: e.event, at: fromSql(e.at)!.toISOString() })) };
}

export async function deleteAccess(c: DbConn, token: string): Promise<void> {
  const a = await findRow(c, token);
  if (a) await run(c, 'delete from patient_access where id = ?', [a.id]); // sessioni e registro seguono (on delete cascade)
}
