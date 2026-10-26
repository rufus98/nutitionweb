// Configurazione del database dall'amministratore: chiave dedicata, prova, cambio a caldo, salvataggio cifrato.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { DatabaseManager } from '../src/db.js';
import { sha256 } from '../src/crypto.js';
import { loadSettings, saveSettings, toConnection } from '../src/dbSettings.js';
import type { Config } from '../src/config.js';

const ADMIN = 'nutrea_admin_test', STUDIO = 'nutrea_studio_test';
let dir: string, manager: DatabaseManager, app: Awaited<ReturnType<typeof buildApp>>;
const config = (over: Partial<Config> = {}): Config => ({
  port: 0, host: '127.0.0.1', db: null, studioKeyHash: sha256(STUDIO), webOrigin: 'https://app.esempio.it', corsOrigins: '*',
  sessionDays: 30, activationDays: 7, migrateOnStart: true, trustProxy: false,
  adminKeyHash: sha256(ADMIN), configKey: Buffer.alloc(32, 7), dataDir: dir, ...over,
});
const as = (key: string) => ({ authorization: `Bearer ${key}` });
const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, headers = as(ADMIN)) => app.inject({ method, url, payload: payload as any, headers });
const view = { v: 1, patient: { first: 'Giulia' }, studio: { name: 'Studio' }, features: {}, consent: { required: false }, links: { pdf: null } };
const pg = process.env.TEST_DB_CLIENT === 'pg' && process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'nutrea-admin-'));
  manager = new DatabaseManager();
  app = await buildApp({ database: manager, config: config() });
});
afterEach(async () => { await app.close(); await manager.close(); rmSync(dir, { recursive: true, force: true }); });

describe('amministrazione del database', () => {
  it('senza database il server risponde ma chiede la configurazione', async () => {
    expect((await call('GET', '/api/studio/ping', undefined, as(STUDIO))).json()).toMatchObject({ ok: true, database: false });
    const r = await call('PUT', '/api/studio/access/abcdef12', { email: 'a@b.it', firstName: 'A', view }, as(STUDIO));
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toMatch(/Database non configurato/);
    expect((await app.inject({ method: 'GET', url: '/api/p/abcdef12' })).statusCode).toBe(503);
  });

  it('serve la chiave dell’amministratore (non quella dello studio), con limite ai tentativi', async () => {
    expect((await call('GET', '/api/admin/database', undefined, {} as any)).statusCode).toBe(401);
    expect((await call('GET', '/api/admin/database', undefined, as(STUDIO))).statusCode).toBe(401);
    for (let i = 0; i < 8; i++) await call('GET', '/api/admin/database', undefined, as('sbagliata'));
    expect((await call('GET', '/api/admin/database', undefined, as('sbagliata'))).statusCode).toBe(429);
    expect((await call('GET', '/api/admin/database')).json()).toMatchObject({ configured: false, source: null, canSave: true });
  });

  it('senza ADMIN_KEY_SHA256 l’amministrazione non esiste', async () => {
    await app.close();
    app = await buildApp({ database: manager, config: config({ adminKeyHash: null }) });
    expect((await call('GET', '/api/admin/database')).statusCode).toBe(404);
  });

  it('prova, configura e cambia database a caldo; la configurazione resta dopo il riavvio', async () => {
    expect((await call('POST', '/api/admin/database/test', { client: 'pg', host: '', database: 'x', user: 'u' })).json().error).toMatch(/host/);
    expect((await call('POST', '/api/admin/database/test', { client: 'pg', host: '127.0.0.1', port: 9, database: 'nutrea', user: 'u', password: 'p' })).json().error).toMatch(/non accetta connessioni/);
    expect((await call('POST', '/api/admin/database/test', { client: 'better-sqlite3', filename: 'uno.sqlite' })).json()).toMatchObject({ ok: true, version: expect.stringMatching(/^3\./) });

    const r = await call('PUT', '/api/admin/database', { client: 'better-sqlite3', filename: 'uno.sqlite' });
    expect(r.json()).toMatchObject({ configured: true, source: 'admin', client: 'better-sqlite3', settings: { filename: 'uno.sqlite' } });
    expect((await call('PUT', '/api/studio/access/abcdef12', { email: 'a@b.it', firstName: 'A', view }, as(STUDIO))).statusCode).toBe(200);

    // Una configurazione sbagliata non tocca il database in uso.
    expect((await call('PUT', '/api/admin/database', { client: 'pg', host: '127.0.0.1', port: 9, database: 'nutrea', user: 'u', password: 'p' })).statusCode).toBe(400);
    expect((await call('GET', '/api/studio/access/abcdef12', undefined, as(STUDIO))).statusCode).toBe(200);

    // Nuovo database: il server ci passa subito (l'accesso creato prima è nell'altro database).
    await call('PUT', '/api/admin/database', { client: 'better-sqlite3', filename: 'due.sqlite' });
    expect((await call('GET', '/api/studio/access/abcdef12', undefined, as(STUDIO))).statusCode).toBe(404);

    // "Riavvio": la configurazione salvata riporta allo stesso database.
    const saved = loadSettings(dir, Buffer.alloc(32, 7))!;
    expect(saved).toEqual({ client: 'better-sqlite3', filename: 'due.sqlite' });
    const m2 = new DatabaseManager();
    await m2.use(toConnection(saved, dir), 'admin');
    expect(await m2.get()('patient_access').count({ n: '*' }).first()).toMatchObject({ n: 0 });
    await m2.close();
  });

  it('configurazione salvata cifrata: host, utente e password non sono leggibili; serve la stessa CONFIG_KEY', () => {
    const key = Buffer.alloc(32, 9);
    saveSettings(dir, key, { client: 'pg', host: 'db.studio-segreto.it', port: 5432, database: 'nutrea', user: 'nutrea_app', password: 'password-segreta-123', ssl: true });
    const raw = readFileSync(join(dir, 'database.json.enc'), 'utf8');
    for (const secret of ['studio-segreto', 'nutrea_app', 'password-segreta']) expect(raw).not.toContain(secret);
    expect(loadSettings(dir, key)).toMatchObject({ host: 'db.studio-segreto.it', password: 'password-segreta-123' });
    expect(() => loadSettings(dir, Buffer.alloc(32, 1))).toThrow(/CONFIG_KEY/);
    expect(() => loadSettings(dir, null)).toThrow(/CONFIG_KEY/);
  });

  it('la password non viene mai restituita; senza CONFIG_KEY non si salva', async () => {
    await call('PUT', '/api/admin/database', { client: 'better-sqlite3', filename: 'uno.sqlite' });
    expect(JSON.stringify((await call('GET', '/api/admin/database')).json())).not.toMatch(/password"/);
    await app.close();
    app = await buildApp({ database: manager, config: config({ configKey: null }) });
    expect((await call('PUT', '/api/admin/database', { client: 'better-sqlite3', filename: 'x.sqlite' })).statusCode).toBe(409);
  });

  it.skipIf(!pg)('PostgreSQL reale: configurazione, tabelle create, password riutilizzata se non reinviata', async () => {
    const s = { client: 'pg', host: pg!.hostname, port: Number(pg!.port || 5432), database: pg!.pathname.slice(1), user: decodeURIComponent(pg!.username), password: decodeURIComponent(pg!.password) };
    const r = await call('PUT', '/api/admin/database', s);
    expect(r.json()).toMatchObject({ configured: true, client: 'pg', version: expect.stringMatching(/PostgreSQL/), settings: { host: s.host, hasPassword: !!s.password } });
    const { password: _p, ...withoutPassword } = s;
    expect((await call('PUT', '/api/admin/database', withoutPassword)).statusCode).toBe(200);
    expect((await call('PUT', '/api/studio/access/abcdef12', { email: 'a@b.it', firstName: 'A', view }, as(STUDIO))).statusCode).toBe(200);
  });
});
