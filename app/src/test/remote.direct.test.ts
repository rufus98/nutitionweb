// L'app desktop scrive direttamente nel database MySQL (senza server dello studio) e il server dei pazienti legge le stesse tabelle:
// scheda → link → il paziente attiva e accede → il piano condiviso arriva → disattivazione → eliminazione.
// Gira con un MySQL vero (come Aiven: TLS con CA propria): TEST_MYSQL_URL=mysql://utente:password@host:porta/db?ssl-mode=REQUIRED e TEST_MYSQL_CA=ca.pem.
// Al posto del comando Rust `remote_sql` usa il driver mysql2 del server, con la stessa semantica (UTC, date come testo).
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setDriver, sqlJsDriver } from '../db/driver';
import { resetConnection } from '../db/connection';
import * as repo from '../db/repo';
import { createAccessLink, remoteConfig, setAccessEnabled, syncAll, type RemoteConfig } from '../lib/remote';
import { setSqlExecutor, type DbConn } from '../lib/remoteDb';

const SERVER = resolve(__dirname, '../../../server');
const URL_ = process.env.TEST_MYSQL_URL, CA = process.env.TEST_MYSQL_CA;
const PDF_B64 = Buffer.from('%PDF-1.4\n% piano di prova\n').toString('base64');

describe.skipIf(!URL_ || !CA || !existsSync(resolve(SERVER, 'node_modules')))('app desktop → MySQL diretto → server dei pazienti', () => {
  let server: any, serverDb: any, cfg: RemoteConfig, base: string;
  const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  beforeAll(async () => {
    const u = new URL(URL_!);
    const db: DbConn = { host: u.hostname, port: Number(u.port || 3306), database: u.pathname.slice(1), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), ssl: true, ca: readFileSync(CA!, 'utf8') };
    const mysql = await import(/* @vite-ignore */ resolve(SERVER, 'node_modules/mysql2/promise.js'));
    setSqlExecutor(async (c, sql, params) => {
      const conn = await mysql.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database, ssl: { ca: c.ca, rejectUnauthorized: true }, timezone: 'Z', dateStrings: true });
      try {
        const [res]: any = await conn.execute(sql, params);
        const [[v]]: any = await conn.query('select version() as v');
        return Array.isArray(res) ? { rows: res, affected: 0, version: v.v } : { rows: [], affected: res.affectedRows, version: v.v };
      } finally { await conn.end(); }
    });
    // Pulizia: tabelle di una prova precedente.
    const clean = await mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password, database: db.database, ssl: { ca: db.ca } });
    for (const t of ['patient_session', 'patient_access_log', 'patient_access', 'nutrea_migrations', 'nutrea_migrations_lock']) await clean.query(`drop table if exists ${t}`);
    await clean.end();

    // Il server dei pazienti parte DOPO l'app: le tabelle le ha create l'app e le migrazioni risultano già fatte.
    setDriver(await sqlJsDriver(false));
    resetConnection();
    await repo.init();
    const s = await repo.getSettings();
    s.remote = { url: '', key: '', db };
    s.appDomain = 'app.esempio.it';
    s.prof.name = 'Dott.ssa Elena Marchi';
    s.priv.log = true;
    await repo.saveSettings(s);
    cfg = remoteConfig(await repo.getSettings())!;
    expect(cfg.db).toBeTruthy();
    expect(cfg.origin).toBe('https://app.esempio.it');

    const { buildApp } = await import(/* @vite-ignore */ resolve(SERVER, 'src/app.ts'));
    const { connect, migrate } = await import(/* @vite-ignore */ resolve(SERVER, 'src/db.ts'));
    const { toConnection } = await import(/* @vite-ignore */ resolve(SERVER, 'src/dbSettings.ts'));
    const { sha256 } = await import(/* @vite-ignore */ resolve(SERVER, 'src/crypto.ts'));
    // Prima di creare il primo link le tabelle non ci sono: le crea l'app (createAccessLink → ensureSchema).
    const p0 = await repo.createPatient({
      first: 'Giulia', last: 'Ferrante', phone: '347 2185590', email: 'Giulia.Ferrante@example.it', dob: '1990-01-01', birthplace: null, cf: 'FRRGLI90A41A944X', job: null,
      sex: 'F', contact: 'WhatsApp', tags: [], drugs: null, activity: null, notes: 'nota clinica riservata', height: 165, goal: null, target_kg: 74, source: null,
      consent_privacy: true, consent_app: true, consent_marketing: false,
    });
    (globalThis as any).__p = p0;
    const config = { port: 0, host: '127.0.0.1', db: null, studioKeyHash: sha256('x'), webOrigin: 'https://app.esempio.it', corsOrigins: '*', sessionDays: 30, activationDays: 7, migrateOnStart: true, trustProxy: false, configKey: null, dataDir: '.' };
    const conn = toConnection({ client: 'mysql2', host: db.host, port: db.port, database: db.database, user: db.user, password: db.password, ssl: true, ca: db.ca }, '.');
    serverDb = connect(conn);
    (globalThis as any).__migrate = () => migrate(serverDb);
    server = await buildApp({ db: serverDb, config });
    base = await server.listen({ port: 0, host: '127.0.0.1' });
  }, 60000);
  afterAll(async () => { setSqlExecutor(null); await server?.close(); await serverDb?.destroy(); });

  it('dalla scheda al piano sul telefono del paziente, passando solo dal database', async () => {
    const p = (globalThis as any).__p;
    const link = await createAccessLink(cfg, p.id);
    expect(link.url).toMatch(new RegExp(`^https://app\\.esempio\\.it/p/${p.token}\\?a=`));
    // Il server, avviato dopo, trova le migrazioni già segnate e non ricrea nulla.
    expect(await (globalThis as any).__migrate()).toEqual([]);

    let row = await serverDb('patient_access').where({ token: p.token }).first();
    expect(row).toMatchObject({ email: 'giulia.ferrante@example.it', first_name: 'Giulia', status: 'pending', password_hash: null });
    expect(row.view_json).not.toMatch(/nota clinica|FRRGLI/);
    expect(row.activation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.activation_hash).not.toContain(new URL(link.url).searchParams.get('a')!);

    // Il paziente attiva con il link e sceglie la password: la salva il server, solo come hash.
    const act = await fetch(`${base}/api/p/${p.token}/activate`, json({ code: new URL(link.url).searchParams.get('a'), password: 'Mele e pere 2026' }));
    expect(act.status).toBe(200);
    const auth = { headers: { Authorization: `Bearer ${(await act.json()).session}` } };
    row = await serverDb('patient_access').where({ token: p.token }).first();
    expect(row.password_hash).toMatch(/^scrypt\$/);

    // Lo studio condivide il piano (con PDF) e la sincronizzazione lo invia.
    const planData = repo.emptyPlanData();
    planData.title = 'Ricomposizione';
    const planId = await repo.createPlan(p.id, planData, { file: { name: 'piano.pdf', b64: PDF_B64 } });
    await repo.publishPlan(planId);
    expect(await syncAll(cfg)).toEqual({ sent: 1, failed: 0 });
    expect(await syncAll(cfg)).toEqual({ sent: 0, failed: 0 });
    const data = await (await fetch(`${base}/api/p/${p.token}`, auth)).json();
    expect(data.plan).toMatchObject({ version: 1, data: { title: 'Ricomposizione' } });
    expect((await (await fetch(base + data.links.pdf, auth)).text()).startsWith('%PDF')).toBe(true);
    expect(await repo.getRemoteAccess(p.id)).toMatchObject({ status: 'active', error: null });

    // Disattivazione e riattivazione.
    await setAccessEnabled(cfg, p.id, false);
    expect((await fetch(`${base}/api/p/${p.token}`, auth)).status).toBe(410);
    await setAccessEnabled(cfg, p.id, true);
    expect((await fetch(`${base}/api/p/${p.token}`, auth)).status).toBe(401);

    // Paziente eliminato nello studio: sparisce dal database.
    await repo.deletePatient(p.id);
    expect(await syncAll(cfg)).toEqual({ sent: 0, failed: 0 });
    expect(await serverDb('patient_access').where({ token: p.token }).first()).toBeUndefined();
  }, 90000);
});
