// Flusso completo app desktop → server → paziente, con il server vero (cartella server/) e un database SQLite in memoria.
// Lo studio crea la scheda e il link → il paziente sceglie la password → lo studio condivide il piano → i dati si aggiornano
// → l'accesso si disattiva → il paziente viene eliminato anche dal server.
// Si salta se le dipendenze del server non sono installate (cd server && npm install).
import { existsSync } from 'fs';
import { resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setDriver, sqlJsDriver } from '../db/driver';
import { resetConnection } from '../db/connection';
import * as repo from '../db/repo';
import { createAccessLink, pushPatient, setAccessEnabled, syncAll, type RemoteConfig } from '../lib/remote';

const SERVER = resolve(__dirname, '../../../server');
const KEY = 'nutrea_e2e_key';
const PDF_B64 = Buffer.from('%PDF-1.4\n% piano di prova\n').toString('base64');

describe.skipIf(!existsSync(resolve(SERVER, 'node_modules')))('app desktop → server → paziente', () => {
  let server: any, serverDb: any, cfg: RemoteConfig;
  const api = (path: string, init: RequestInit = {}) => fetch(cfg.url + path, init);
  const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  beforeAll(async () => {
    // Percorsi calcolati: tsc dell'app non deve seguire il codice del server (ha le sue dipendenze).
    const { buildApp } = await import(/* @vite-ignore */ resolve(SERVER, 'src/app.ts'));
    const { connect, migrate } = await import(/* @vite-ignore */ resolve(SERVER, 'src/db.ts'));
    const { sha256 } = await import(/* @vite-ignore */ resolve(SERVER, 'src/crypto.ts'));
    const config = { port: 0, host: '127.0.0.1', db: { client: 'better-sqlite3', connection: { filename: ':memory:' } }, studioKeyHash: sha256(KEY), webOrigin: 'https://app.esempio.it', corsOrigins: '*', sessionDays: 30, activationDays: 7, migrateOnStart: true, trustProxy: false };
    serverDb = connect(config.db);
    await migrate(serverDb);
    server = await buildApp({ db: serverDb, config });
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    cfg = { url: address, key: KEY };

    setDriver(await sqlJsDriver(false));
    resetConnection();
    await repo.init();
    const s = await repo.getSettings();
    s.remote = cfg;
    s.prof.name = 'Dott.ssa Elena Marchi';
    s.priv.log = true;
    await repo.saveSettings(s);
  }, 30000);
  afterAll(async () => { await server?.close(); await serverDb?.destroy(); });

  it('dalla scheda al piano sul telefono del paziente', async () => {
    // 1. Il nutrizionista crea la scheda (con email) e il link di accesso.
    const p = await repo.createPatient({
      first: 'Giulia', last: 'Ferrante', phone: '347 2185590', email: 'Giulia.Ferrante@example.it', dob: '1990-01-01', birthplace: null, cf: 'FRRGLI90A41A944X', job: null,
      sex: 'F', contact: 'WhatsApp', tags: [], drugs: null, activity: null, notes: 'nota clinica riservata', height: 165, goal: null, target_kg: 74, source: null,
      consent_privacy: true, consent_app: true, consent_marketing: false,
    });
    const link = await createAccessLink(cfg, p.id);
    expect(link.url).toMatch(new RegExp(`^https://app\\.esempio\\.it/p/${p.token}\\?a=`));
    expect(await repo.getRemoteAccess(p.id)).toMatchObject({ status: 'pending', error: null, activation_url: link.url });

    // Nel database remoto: email, nome e oggetto con i dati; nessuna password; niente note cliniche o codice fiscale.
    let row = await serverDb('patient_access').where({ token: p.token }).first();
    expect(row).toMatchObject({ email: 'giulia.ferrante@example.it', first_name: 'Giulia', status: 'pending', password_hash: null });
    expect(row.view_json).not.toMatch(/nota clinica|FRRGLI/);

    // 2. Il paziente apre il link di attivazione e sceglie la password.
    const code = new URL(link.url).searchParams.get('a');
    const act = await api(`/api/p/${p.token}/activate`, json({ code, password: 'Mele e pere 2026' }));
    expect(act.status).toBe(200);
    const auth = { headers: { Authorization: `Bearer ${(await act.json()).session}` } };
    row = await serverDb('patient_access').where({ token: p.token }).first();
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain('Mele');
    expect((await (await api(`/api/p/${p.token}`, auth)).json()).plan).toBeNull(); // nessun piano condiviso ancora

    // 3. Lo studio crea e condivide il piano (con PDF): la sincronizzazione automatica lo invia.
    const planData = repo.emptyPlanData();
    planData.title = 'Ricomposizione';
    planData.days[0].meals[0].items = [{ f: 'Yogurt greco', g: '150 g' }];
    const planId = await repo.createPlan(p.id, planData, { file: { name: 'piano.pdf', b64: PDF_B64 } });
    expect((await syncAll(cfg)).sent).toBe(0);              // bozza: non va al paziente
    await repo.publishPlan(planId);
    await repo.addVisit({ patient_id: p.id, date: '2026-10-01', type: 'Controllo', kg: 80.4, fat: 30, vita: 90, fianchi: null, torace: null, braccio: null, coscia: null, polso: null, note: 'privata', goal: null });
    expect(await syncAll(cfg)).toEqual({ sent: 1, failed: 0 });
    expect(await syncAll(cfg)).toEqual({ sent: 0, failed: 0 }); // nessuna modifica: niente invio
    const data = await (await api(`/api/p/${p.token}`, auth)).json();
    expect(data.plan).toMatchObject({ version: 1, data: { title: 'Ricomposizione' } });
    expect(data.visits).toEqual([{ date: '2026-10-01', kg: 80.4, cm: { vita: 90 } }]);
    expect(data.links.pdf).toBe(`/api/p/${p.token}/pdf`);
    expect((await (await api(data.links.pdf, auth)).text()).startsWith('%PDF')).toBe(true);
    expect(await repo.getRemoteAccess(p.id)).toMatchObject({ status: 'active', error: null });

    // 4. Lo studio disattiva l'accesso: il paziente vede "Link disattivato".
    await setAccessEnabled(cfg, p.id, false);
    expect((await api(`/api/p/${p.token}`, auth)).status).toBe(410);
    await setAccessEnabled(cfg, p.id, true);
    expect((await api(`/api/p/${p.token}`, auth)).status).toBe(401); // va rifatto il login

    // 5. Paziente eliminato nello studio → cancellato anche dal server.
    await repo.deletePatient(p.id);
    expect(await syncAll(cfg)).toEqual({ sent: 0, failed: 0 });
    expect(await serverDb('patient_access').where({ token: p.token }).first()).toBeUndefined();
    expect(await repo.listRemoteDeletions()).toEqual([]);
  }, 60000);

  it('errori leggibili: email mancante, chiave sbagliata, server spento', async () => {
    const p = await repo.createPatient({
      first: 'Marco', last: 'Bellini', phone: '333 9041127', email: null, dob: null, birthplace: null, cf: null, job: null, sex: 'M', contact: 'WhatsApp', tags: [],
      drugs: null, activity: null, notes: null, height: null, goal: null, target_kg: null, source: null, consent_privacy: true, consent_app: true, consent_marketing: false,
    });
    await expect(createAccessLink(cfg, p.id)).rejects.toThrow(/email/i);
    await repo.updatePatient(p.id, { email: 'marco@example.it' });
    await expect(createAccessLink({ ...cfg, key: 'sbagliata' }, p.id)).rejects.toThrow('Chiave dello studio non valida');
    await expect(pushPatient({ url: 'http://127.0.0.1:9', key: KEY }, p.id, { force: true })).rejects.toThrow(/non raggiungibile/);
    expect((await repo.getRemoteAccess(p.id))?.error).toMatch(/non raggiungibile/);
  }, 30000);
});
