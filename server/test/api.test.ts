// Flusso completo: lo studio invia i dati → link di attivazione → il paziente sceglie la password → accede.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { buildApp } from '../src/app.js';
import { connect, migrate } from '../src/db.js';
import { sha256, verifyPassword } from '../src/crypto.js';
import type { Config } from '../src/config.js';

const KEY = 'nutrea_test_key';
// Di base SQLite in memoria; con TEST_DB_CLIENT=pg|mysql2|mssql e TEST_DATABASE_URL gli stessi test girano su quel database.
const testDb: Config['db'] = process.env.TEST_DB_CLIENT
  ? { client: process.env.TEST_DB_CLIENT as Config['db']['client'], connection: process.env.TEST_DATABASE_URL! }
  : { client: 'better-sqlite3', connection: { filename: ':memory:' } };
const config: Config = {
  port: 0, host: '127.0.0.1', db: testDb,
  studioKeyHash: sha256(KEY), webOrigin: 'https://app.esempio.it', corsOrigins: '*',
  sessionDays: 30, activationDays: 7, migrateOnStart: true, trustProxy: false,
};
const TOKEN = 'gF7k2q9XaBcD1234';
const view = (extra: object = {}) => ({ v: 1, patient: { first: 'Giulia', targetKg: 74 }, plan: { version: 3, since: '2026-09-15', hasPdf: true, data: { title: 'Ricomposizione', days: [{ label: 'Lun', meals: [] }], notes: [] } }, visits: [], nextAppointment: null, studio: { name: 'Dott.ssa Elena Marchi' }, features: { checks: true, weight: true, meas: true, pdf: true, install: true }, consent: { required: true, studio: 'Dott.ssa Elena Marchi' }, links: { pdf: null }, ...extra });
const PDF_B64 = Buffer.from('%PDF-1.4\n% test\n').toString('base64');

let db: Knex;
let app: Awaited<ReturnType<typeof buildApp>>;
let clock = new Date('2026-10-26T10:00:00Z');
const studio = { authorization: `Bearer ${KEY}` };
const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: payload as any, headers });
const publish = (body: object = {}) => call('PUT', `/api/studio/access/${TOKEN}`, { email: 'Giulia.Ferrante@Example.it', firstName: 'Giulia', view: view(), active: true, logAccess: true, ...body }, studio);
const activationCode = async () => new URL((await call('POST', `/api/studio/access/${TOKEN}/activation`, undefined, studio)).json().activationUrl).searchParams.get('a')!;

beforeEach(async () => {
  clock = new Date('2026-10-26T10:00:00Z');
  db = connect(config.db);
  await db.migrate.rollback(undefined, true); // database reale: si riparte da tabelle vuote
  await migrate(db);
  app = await buildApp({ db, config, now: () => clock });
});
afterEach(async () => { await app.close(); await db.destroy(); });

describe('studio', () => {
  it('richiede la chiave dello studio', async () => {
    expect((await call('GET', '/api/studio/ping')).statusCode).toBe(401);
    expect((await call('GET', '/api/studio/ping', undefined, { authorization: 'Bearer altra' })).statusCode).toBe(401);
    expect((await call('GET', '/api/studio/ping', undefined, studio)).json()).toMatchObject({ ok: true, viewVersion: 1 });
  });

  it('salva l’oggetto con tutti i dati della dieta e l’email, senza password', async () => {
    const r = await publish();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: 'pending', hasPassword: false });
    const row = await db('patient_access').where({ token: TOKEN }).first();
    expect(row.email).toBe('giulia.ferrante@example.it');
    expect(JSON.parse(row.view_json).plan.data.title).toBe('Ricomposizione');
    expect(row.password_hash).toBeNull();
    // Dati non validi
    expect((await publish({ email: 'non-una-email' })).statusCode).toBe(400);
    expect((await publish({ view: { v: 99 } })).statusCode).toBe(400);
    expect((await call('PUT', '/api/studio/access/../x', {}, studio)).statusCode).toBeGreaterThanOrEqual(400);
  });

  it('link di attivazione: codice salvato solo come hash, scade dopo 7 giorni', async () => {
    await publish();
    const r = (await call('POST', `/api/studio/access/${TOKEN}/activation`, undefined, studio)).json();
    expect(r.activationUrl).toMatch(/^https:\/\/app\.esempio\.it\/p\/gF7k2q9XaBcD1234\?a=[A-Za-z0-9_-]{43}$/);
    const code = new URL(r.activationUrl).searchParams.get('a')!;
    const row = await db('patient_access').where({ token: TOKEN }).first();
    expect(row.activation_hash).toBe(sha256(code));
    expect(JSON.stringify(row)).not.toContain(code);
    clock = new Date('2026-11-03T10:00:01Z');
    expect((await call('POST', `/api/p/${TOKEN}/activate`, { code, password: 'una-password-lunga' })).json().code).toBe('activation');
  });
});

describe('paziente', () => {
  it('attivazione: sceglie la password, che nel database è solo un hash scrypt', async () => {
    await publish();
    const code = await activationCode();
    expect((await call('GET', `/api/p/${TOKEN}`)).json()).toMatchObject({ state: 'activate', firstName: 'Giulia', studio: { name: 'Dott.ssa Elena Marchi' } });
    expect((await call('POST', `/api/p/${TOKEN}/activate`, { code, password: 'corta' })).json()).toMatchObject({ code: 'password' });
    expect((await call('POST', `/api/p/${TOKEN}/activate`, { code: 'sbagliato', password: 'una-password-lunga' })).statusCode).toBe(400);
    const ok = await call('POST', `/api/p/${TOKEN}/activate`, { code, password: 'Mele e pere 2026' });
    expect(ok.statusCode).toBe(200);
    const { session } = ok.json();
    const row = await db('patient_access').where({ token: TOKEN }).first();
    expect(row.status).toBe('active');
    expect(row.password_hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(row.password_hash).not.toContain('Mele');
    expect(await verifyPassword('Mele e pere 2026', row.password_hash)).toBe(true);
    expect(row.activation_hash).toBeNull();
    // Il codice vale una volta sola
    expect((await call('POST', `/api/p/${TOKEN}/activate`, { code, password: 'altra password lunga' })).statusCode).toBe(400);
    // Con la sessione arrivano i dati, il consenso e il PDF
    const auth = { authorization: `Bearer ${session}` };
    const data = (await call('GET', `/api/p/${TOKEN}`, undefined, auth)).json();
    expect(data.plan.data.title).toBe('Ricomposizione');
    expect(data.consent.required).toBe(true);
    expect(data.links.pdf).toBeNull();
    await call('PUT', `/api/studio/access/${TOKEN}/pdf`, { name: 'piano.pdf', b64: PDF_B64 }, studio);
    expect((await call('GET', `/api/p/${TOKEN}`, undefined, auth)).json().links.pdf).toBe(`/api/p/${TOKEN}/pdf`);
    const pdf = await call('GET', `/api/p/${TOKEN}/pdf`, undefined, auth);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.startsWith('%PDF')).toBe(true);
    expect((await call('GET', `/api/p/${TOKEN}/pdf`)).statusCode).toBe(401);
    expect((await call('POST', `/api/p/${TOKEN}/consent`, undefined, auth)).statusCode).toBe(204);
    expect((await call('GET', `/api/p/${TOKEN}`, undefined, auth)).json().consent.required).toBe(false);
    expect((await call('GET', `/api/p/${TOKEN}`, undefined, auth)).headers['cache-control']).toBe('no-store');
    // Registro accessi per lo studio
    const st = (await call('GET', `/api/studio/access/${TOKEN}`, undefined, studio)).json();
    expect(st.log.map((e: { event: string }) => e.event)).toEqual(expect.arrayContaining(['activate', 'view', 'consent']));
  }, 30000);

  it('login con il link e la password, blocco dopo 5 tentativi errati, uscita', async () => {
    await publish();
    await call('POST', `/api/p/${TOKEN}/activate`, { code: await activationCode(), password: 'Mele e pere 2026' });
    expect((await call('GET', `/api/p/${TOKEN}`)).json()).toMatchObject({ state: 'login' });
    for (let i = 0; i < 4; i++) expect((await call('POST', `/api/p/${TOKEN}/login`, { password: 'sbagliata' })).json().attemptsLeft).toBe(4 - i);
    expect((await call('POST', `/api/p/${TOKEN}/login`, { password: 'sbagliata' })).statusCode).toBe(401);
    expect((await call('POST', `/api/p/${TOKEN}/login`, { password: 'Mele e pere 2026' })).statusCode).toBe(429); // bloccato
    clock = new Date(clock.getTime() + 16 * 60_000);
    const ok = await call('POST', `/api/p/${TOKEN}/login`, { password: 'Mele e pere 2026' });
    expect(ok.statusCode).toBe(200);
    const auth = { authorization: `Bearer ${ok.json().session}` };
    expect((await call('GET', `/api/p/${TOKEN}`, undefined, auth)).statusCode).toBe(200);
    expect((await call('POST', `/api/p/${TOKEN}/logout`, undefined, auth)).statusCode).toBe(204);
    expect((await call('GET', `/api/p/${TOKEN}`, undefined, auth)).statusCode).toBe(401);
    // Sessione scaduta dopo 30 giorni
    const again = (await call('POST', `/api/p/${TOKEN}/login`, { password: 'Mele e pere 2026' })).json();
    clock = new Date(clock.getTime() + 31 * 864e5);
    expect((await call('GET', `/api/p/${TOKEN}`, undefined, { authorization: `Bearer ${again.session}` })).statusCode).toBe(401);
  }, 30000);

  it('link disattivato dallo studio: 410 e sessioni chiuse; eliminazione: 404', async () => {
    await publish();
    const s = (await call('POST', `/api/p/${TOKEN}/activate`, { code: await activationCode(), password: 'Mele e pere 2026' })).json().session;
    expect((await publish({ active: false })).json().status).toBe('disabled');
    expect((await call('GET', `/api/p/${TOKEN}`, undefined, { authorization: `Bearer ${s}` })).statusCode).toBe(410);
    expect((await call('POST', `/api/p/${TOKEN}/login`, { password: 'Mele e pere 2026' })).statusCode).toBe(410);
    expect((await call('POST', `/api/studio/access/${TOKEN}/activation`, undefined, studio)).statusCode).toBe(409);
    expect((await publish({ active: true })).json()).toMatchObject({ status: 'active', hasPassword: true });
    expect((await call('GET', `/api/p/${TOKEN}`, undefined, { authorization: `Bearer ${s}` })).statusCode).toBe(401); // va rifatto il login
    expect((await call('DELETE', `/api/studio/access/${TOKEN}`, undefined, studio)).statusCode).toBe(204);
    expect((await call('POST', `/api/p/${TOKEN}/login`, { password: 'Mele e pere 2026' })).statusCode).toBe(404);
    expect(Number((await db('patient_session').count({ n: '*' }).first())?.n)).toBe(0);
  }, 30000);

  it('nuovo link di attivazione (password dimenticata) sostituisce la password e chiude le sessioni', async () => {
    await publish();
    const old = (await call('POST', `/api/p/${TOKEN}/activate`, { code: await activationCode(), password: 'Mele e pere 2026' })).json().session;
    const fresh = await call('POST', `/api/p/${TOKEN}/activate`, { code: await activationCode(), password: 'Nuova password 2027' });
    expect(fresh.statusCode).toBe(200);
    expect((await call('GET', `/api/p/${TOKEN}`, undefined, { authorization: `Bearer ${old}` })).statusCode).toBe(401);
    expect((await call('POST', `/api/p/${TOKEN}/login`, { password: 'Mele e pere 2026' })).statusCode).toBe(401);
    expect((await call('POST', `/api/p/${TOKEN}/login`, { password: 'Nuova password 2027' })).statusCode).toBe(200);
  }, 30000);
});
