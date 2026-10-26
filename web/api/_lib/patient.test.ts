// @vitest-environment node
// API dei pazienti sul database: il record lo scrive l'app desktop (come remoteDb.ts), qui attivazione, login, dati,
// consenso, PDF, uscita, blocco dopo 5 errori e link disattivato. SQLite in memoria al posto di MySQL, stesse query.
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from './crypto.js';
import { handle, type Db } from './patient.js';

const TOKEN = 'gF7k2q9XaB', CODE = 'codice-di-attivazione', PASSWORD = 'Mele e pere 2026';
let t = new Date('2026-10-26T10:00:00Z');
let sq: DatabaseSync;
let db: Db;

const conv = (p: unknown) => (p instanceof Date ? p.toISOString() : typeof p === 'boolean' ? Number(p) : p) as any;
const sqlite = (s: DatabaseSync): Db => ({
  async query(sql, params = []) {
    const st = s.prepare(sql);
    if (/^\s*select/i.test(sql)) return st.all(...params.map(conv)) as any[];
    st.run(...params.map(conv));
    return [];
  },
  async transaction(fn) {
    s.exec('begin');
    try { const r = await fn(db); s.exec('commit'); return r; } catch (e) { s.exec('rollback'); throw e; }
  },
});

const view = { v: 1, studio: { name: 'Dott.ssa Elena Marchi', whatsapp: '39051' }, consent: { required: true }, features: { pdf: true }, links: {} };
/** Come l'app desktop: accesso creato con l'oggetto della dieta e il link di attivazione (solo SHA-256 del codice). */
function seed(over: Record<string, unknown> = {}) {
  const row = { token: TOKEN, email: 'giulia@example.com', first_name: 'Giulia', status: 'pending', view_json: JSON.stringify(view), view_version: 1, log_access: 1,
    activation_hash: sha256(CODE), activation_expires_at: '2026-11-02 10:00:00', pdf_name: 'piano.pdf', pdf_b64: Buffer.from('%PDF-1.4 prova').toString('base64'),
    created_at: '2026-10-26 09:00:00', updated_at: '2026-10-26 09:00:00', ...over };
  sq.prepare(`insert into patient_access (${Object.keys(row).join(', ')}) values (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row).map(conv));
}

const call = (method: string, path: string, opts: { body?: unknown; session?: string; ip?: string } = {}) => handle(
  new Request(`https://app.example.it${path}`, {
    method, body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    headers: { 'Content-Type': 'application/json', ...(opts.session ? { Authorization: `Bearer ${opts.session}` } : {}) },
  }),
  { db, now: () => t, ip: opts.ip ?? '1.2.3.4' },
);

beforeEach(() => {
  t = new Date('2026-10-26T10:00:00Z');
  sq = new DatabaseSync(':memory:');
  sq.exec(`
    create table patient_access (id integer primary key autoincrement, token varchar(64) not null unique, email varchar(254) not null, first_name varchar(100) not null, status varchar(16) not null default 'pending', password_hash varchar(255), password_set_at datetime, activation_hash varchar(64), activation_expires_at datetime, view_json text not null, view_version int not null, pdf_name varchar(255), pdf_b64 text, log_access boolean not null default 0, consent_at datetime, failed_logins int not null default 0, locked_until datetime, last_login_at datetime, created_at datetime not null, updated_at datetime not null);
    create table patient_session (id varchar(64) primary key, access_id int not null references patient_access(id) on delete cascade, created_at datetime not null, expires_at datetime not null);
    create table patient_access_log (id integer primary key autoincrement, access_id int not null references patient_access(id) on delete cascade, event varchar(20) not null, at datetime not null);
  `);
  db = sqlite(sq);
});

describe('API dei pazienti direttamente sul database', () => {
  it('prima volta: chiede di attivare, poi con codice e password apre la sessione e mostra i dati', async () => {
    seed();
    const before = await call('GET', `/api/p/${TOKEN}`);
    expect(before.status).toBe(401);
    expect(await before.json()).toMatchObject({ state: 'activate', firstName: 'Giulia', studio: { name: 'Dott.ssa Elena Marchi' } });
    expect(before.headers.get('cache-control')).toBe('no-store');

    const bad = await call('POST', `/api/p/${TOKEN}/activate`, { body: { code: 'sbagliato', password: PASSWORD } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe('activation');

    const act = await call('POST', `/api/p/${TOKEN}/activate`, { body: { code: CODE, password: PASSWORD } });
    expect(act.status).toBe(200);
    const { session } = await act.json();
    const row = sq.prepare('select * from patient_access').get() as any;
    expect(row).toMatchObject({ status: 'active', activation_hash: null });
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(sq.prepare('select id from patient_session').get()).toEqual({ id: sha256(session) }); // solo l'hash del codice

    const data = await call('GET', `/api/p/${TOKEN}`, { session });
    expect(data.status).toBe(200);
    expect(await data.json()).toMatchObject({ v: 1, consent: { required: true }, links: { pdf: `/api/p/${TOKEN}/pdf` } });

    // Il codice di attivazione vale una volta sola.
    expect((await call('POST', `/api/p/${TOKEN}/activate`, { body: { code: CODE, password: PASSWORD } })).status).toBe(400);
  });

  it('login, consenso, PDF e uscita; registro accessi', async () => {
    seed();
    await call('POST', `/api/p/${TOKEN}/activate`, { body: { code: CODE, password: PASSWORD } });
    const login = await call('POST', `/api/p/${TOKEN}/login`, { body: { password: PASSWORD } });
    expect(login.status).toBe(200);
    const { session } = await login.json();

    expect((await call('POST', `/api/p/${TOKEN}/consent`, { session })).status).toBe(204);
    expect((await (await call('GET', `/api/p/${TOKEN}`, { session })).json()).consent.required).toBe(false);

    const pdf = await call('GET', `/api/p/${TOKEN}/pdf`, { session });
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).toMatch(/^%PDF/);

    expect((await call('POST', `/api/p/${TOKEN}/logout`, { session })).status).toBe(204);
    expect((await call('GET', `/api/p/${TOKEN}`, { session })).status).toBe(401);
    expect((sq.prepare('select event from patient_access_log order by id').all() as any[]).map((e) => e.event))
      .toEqual(['activate', 'login', 'consent', 'view', 'logout']);
  });

  it('5 password sbagliate bloccano il link per 15 minuti; la sessione scade dopo 30 giorni', async () => {
    seed();
    const { session } = await (await call('POST', `/api/p/${TOKEN}/activate`, { body: { code: CODE, password: PASSWORD } })).json();
    for (let i = 0; i < 4; i++) expect((await call('POST', `/api/p/${TOKEN}/login`, { body: { password: 'non è questa' }, ip: `10.0.0.${i}` })).status).toBe(401);
    const fifth = await call('POST', `/api/p/${TOKEN}/login`, { body: { password: 'non è questa' } });
    expect((await fifth.json()).error).toMatch(/Troppi tentativi/);
    expect((await call('POST', `/api/p/${TOKEN}/login`, { body: { password: PASSWORD } })).status).toBe(429);
    t = new Date(t.getTime() + 16 * 60_000);
    expect((await call('POST', `/api/p/${TOKEN}/login`, { body: { password: PASSWORD } })).status).toBe(200);

    t = new Date(t.getTime() + 31 * 864e5);
    expect((await call('GET', `/api/p/${TOKEN}`, { session })).status).toBe(401);
  });

  it('link inesistente, non valido o disattivato dallo studio', async () => {
    seed({ status: 'disabled' });
    expect((await call('GET', '/api/p/inesistente')).status).toBe(404);
    expect((await call('GET', '/api/p/x')).status).toBe(404);
    expect((await call('GET', `/api/p/${TOKEN}`)).status).toBe(410);
  });

  it('funziona anche con il percorso riscritto da vercel.json', async () => {
    seed();
    const r = await call('GET', `/api/patient?token=${TOKEN}`);
    expect(r.status).toBe(401);
  });

  it('database spento o non configurato: 503 con un messaggio semplice', async () => {
    const down: Db = { query: async () => { throw Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }); }, transaction: async () => { throw new Error(); } };
    const r = await handle(new Request(`https://app.example.it/api/p/${TOKEN}`), { db: down });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/non disponibile/);
  });
});
