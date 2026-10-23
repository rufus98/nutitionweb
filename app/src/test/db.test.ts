// Test del livello dati: migrazioni, vincoli dello schema, repository.
// Ogni test usa un database SQLite in memoria (sql.js) nuovo.
import { beforeEach, describe, expect, it } from 'vitest';
import { setDriver, sqlJsDriver, type Driver } from '../db/driver';
import { resetConnection } from '../db/connection';
import { currentVersion, LATEST_VERSION, migrate, MIGRATIONS } from '../db/migrate';
import * as repo from '../db/repo';
import { seedDemo } from '../db/seed';
import { today } from '../lib/format';

let d: Driver;
async function freshDb() {
  d = await sqlJsDriver(false);
  setDriver(d);
  resetConnection();
  await repo.init();
}

const newPatient = (over: Partial<repo.NewPatient> = {}): repo.NewPatient => ({
  first: 'Anna', last: 'Bianchi', phone: '333 1234567', email: null, dob: null, birthplace: null, cf: 'BNCNNA90A41A944X', job: null,
  sex: 'F', contact: 'WhatsApp', tags: [], drugs: null, activity: null, notes: null, height: 165, goal: null, target_kg: null, source: null,
  consent_privacy: true, consent_app: true, consent_marketing: false, ...over,
});

/** Lo schema completo dopo tutte le migrazioni (per il file di riferimento src/db/schema.sql). */
async function schemaSql(db: Driver) {
  const rows = await db.query<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'view' THEN 3 ELSE 4 END, name");
  return '-- Generato dai test (npm run db:schema): schema risultante da tutte le migrazioni. Non modificare a mano.\n\n' + rows.map((r) => r.sql.trim() + ';').join('\n\n') + '\n';
}

describe('migrazioni', () => {
  it('portano un database vuoto all\'ultima versione, una sola volta', async () => {
    const db = await sqlJsDriver(false);
    expect(await migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await currentVersion(db)).toBe(LATEST_VERSION);
    expect(await migrate(db)).toEqual([]);
    const [{ foreign_keys }] = await db.query<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(foreign_keys).toBe(1);
  });

  it('lo schema corrisponde al file di riferimento src/db/schema.sql', async () => {
    const db = await sqlJsDriver(false);
    await migrate(db);
    await expect(await schemaSql(db)).toMatchFileSnapshot('../db/schema.sql');
  });

  it('aggiornano un archivio della prima versione conservando i dati', async () => {
    // Database come lo creava la versione 1.0 (schema v2, booleani testuali, fatture come testo, PDF in base64).
    const db = await sqlJsDriver(false);
    for (const m of MIGRATIONS.slice(0, 2)) await db.transaction([{ sql: m.sql, script: true }]);
    await db.execute('PRAGMA user_version = 2');
    await db.execute("INSERT INTO patients (code, first, last, phone, cf, created_at, active, link_on, tags) VALUES ('PZ-0401', 'Giulia', 'Ferrante', '+39 347', 'FRRGLI', '2026-03-10', 'true', 1, '[\"Ipotiroidismo\"]')");
    await db.execute("INSERT INTO patients (code, first, last, phone, created_at, sex, contact, tags) VALUES ('PZ-0402', 'Marco', 'Bellini', '333', '2026-04-01', 'X', 'Piccione', 'non json')");
    await db.execute("INSERT INTO visits (patient_id, date, kg, fat) VALUES (1, '2026-03-10', 84.6, 33.1), (1, 'data-errata', 80, 1)");
    await db.execute("INSERT INTO payments (patient_id, date, description, method, amount, paid, invoice) VALUES (1, '2026-03-10', 'Prima visita', 'POS', 120, 1, 'FT 7/26'), (1, '2026-10-14', 'Controllo', 'POS', 70.1, 0, NULL)");
    await db.execute("INSERT INTO appointments (patient_id, date, time, type, duration) VALUES (1, '2026-11-11', '10:00', 'controllo', 30)");
    await db.execute(`INSERT INTO plans (patient_id, version, status, pdf_name, pdf_b64, data, created_at, published_at) VALUES
      (1, 1, 'published', 'v1.pdf', 'QUJD', '{"title":"Avvio","days":[]}', '2026-03-10', '2026-03-10'),
      (1, 2, 'published', NULL, NULL, '{"title":"Ricomposizione","days":[]}', '2026-09-15', '2026-09-15'),
      (1, 3, 'draft', NULL, NULL, 'non json', '2026-10-20', NULL)`);
    await db.execute("INSERT INTO settings VALUES ('main', '{\"prof\":{\"name\":\"Dott.ssa Test\"}}'), ('onboarded', '1'), ('rem-1', '1')");

    const backups: string[] = [];
    expect(await migrate(db, { beforeMigrate: async (f, t) => { backups.push(`${f}->${t}`); } })).toEqual([3, 4, 5]);
    expect(backups).toEqual(['2->5']);

    setDriver(db); resetConnection();
    const [g, m] = await repo.listPatients().then((l) => [l.find((p) => p.code === 'PZ-0401')!, l.find((p) => p.code === 'PZ-0402')!]);
    expect(g).toMatchObject({ first: 'Giulia', active: true, tags: ['Ipotiroidismo'], kg: 84.6, due: 70.1 });
    expect(m).toMatchObject({ sex: 'F', contact: 'WhatsApp', tags: [] }); // valori non validi normalizzati
    expect(await repo.listVisits(g.id)).toHaveLength(1);                   // la visita con data errata non è migrabile
    const pays = await repo.listPayments(g.id);
    expect(pays.map((p) => [p.invoice, p.amount, p.paid])).toEqual([[null, 70.1, false], ['FT 7/26', 120, true]]);
    expect(await repo.nextInvoice('2026-12-01')).toBe('FT 8/26');
    expect((await repo.patientAppointments(g.id))[0].reminder_sent_at).toBeTruthy();
    const plans = await repo.listPlans(g.id);
    expect(plans.map((p) => [p.version, p.status, p.has_pdf, !!p.saved_at])).toEqual([[3, 'draft', false, false], [2, 'published', false, true], [1, 'archived', true, true]]);
    expect(plans[0].data.days).toEqual([]);                                 // JSON illeggibile → piano vuoto
    expect(await repo.getPlanPdf(plans[2].id)).toBe('QUJD');
    expect((await repo.getSettings()).prof.name).toBe('Dott.ssa Test');
    expect(await repo.getFlag('onboarded')).toBe('1');
    const keys = await db.query<{ key: string }>('SELECT key FROM settings ORDER BY key');
    expect(keys.map((k) => k.key)).toEqual(['main', 'onboarded']);
  });
});

describe('vincoli dello schema', () => {
  beforeEach(freshDb);

  it('rifiutano valori non validi', async () => {
    const p = await repo.createPatient(newPatient());
    const bad = [
      ["UPDATE patients SET sex = 'X' WHERE id = ?", [p.id]],
      ["UPDATE patients SET dob = '31/12/1990' WHERE id = ?", [p.id]],
      ["UPDATE patients SET active = 2 WHERE id = ?", [p.id]],
      ["UPDATE patients SET tags = 'abc' WHERE id = ?", [p.id]],
      ["INSERT INTO visits (patient_id, date, kg) VALUES (?, '2026-01-01', 900)", [p.id]],
      ["INSERT INTO appointments (patient_id, date, time, type, duration) VALUES (?, '2026-01-01', '9:00', 'controllo', 30)", [p.id]],
      ["INSERT INTO appointments (patient_id, date, time, type, duration) VALUES (?, '2026-01-01', '09:00', 'altro', 30)", [p.id]],
      ["INSERT INTO visits (patient_id, date) VALUES (9999, '2026-01-01')", []],
    ] as const;
    for (const [sql, params] of bad) await expect(d.execute(sql, [...params]), sql).rejects.toThrow();
  });

  it('al massimo una bozza e una versione pubblicata per paziente', async () => {
    const p = await repo.createPatient(newPatient());
    await repo.createPlan(p.id, repo.emptyPlanData());
    await expect(d.execute("INSERT INTO plans (patient_id, version, status, data, created_at) VALUES (?, 9, 'draft', '{}', '2026-01-01')", [p.id])).rejects.toThrow(/UNIQUE/);
  });

  it('numeri di fattura univoci per anno', async () => {
    const p = await repo.createPatient(newPatient());
    await repo.addPayment({ patient_id: p.id, date: '2026-01-10', description: 'Controllo', method: 'POS', amount: 70, paid: true, invoice: { year: 2026, number: 5 } });
    await expect(repo.addPayment({ patient_id: p.id, date: '2026-02-10', description: 'Controllo', method: 'POS', amount: 70, paid: true, invoice: { year: 2026, number: 5 } })).rejects.toThrow();
  });
});

describe('repository', () => {
  beforeEach(freshDb);

  it('pazienti: codici progressivi, aggiornamento solo dei campi ammessi', async () => {
    const a = await repo.createPatient(newPatient());
    const b = await repo.createPatient(newPatient({ first: 'Luca' }));
    expect([a.code, b.code]).toEqual(['PZ-0401', 'PZ-0402']);
    expect(a.token).toMatch(/^\w{8}$/);
    await repo.updatePatient(a.id, { phone: '+39 000', id: 99, code: 'PZ-9999' } as any);
    expect(await repo.getPatient(a.id)).toMatchObject({ id: a.id, code: 'PZ-0401', phone: '+39 000' });
    expect(await repo.patientCount()).toBe(2);
  });

  it('eliminare un paziente cancella i dati clinici ma conserva i pagamenti', async () => {
    const p = await repo.createPatient(newPatient());
    await repo.addVisit({ patient_id: p.id, date: '2026-01-10', type: 'Controllo', kg: 70, fat: null, vita: null, fianchi: null, torace: null, braccio: null, coscia: null, polso: null, note: null, goal: null });
    await repo.addAppointment({ patient_id: p.id, date: '2026-12-01', time: '09:00', type: 'controllo', duration: 30, remind: true, note: null });
    await repo.createPlan(p.id, repo.emptyPlanData(), { file: { name: 'a.pdf', b64: 'QUJD' } });
    const inv = await repo.addPayment({ patient_id: p.id, date: '2026-01-10', description: 'Controllo', method: 'POS', amount: 70, paid: true });
    await repo.deletePatient(p.id);
    for (const t of ['visits', 'appointments', 'plans', 'documents']) expect((await d.query(`SELECT * FROM ${t}`)).length, t).toBe(0);
    const [pay] = await repo.listPayments();
    expect(pay).toMatchObject({ patient_id: null, name: 'Anna Bianchi', cf: 'BNCNNA90A41A944X', invoice: inv });
  });

  it('pagamenti: importi in centesimi e numerazione per anno', async () => {
    const p = await repo.createPatient(newPatient());
    const add = (date: string, amount: number, paid = true) => repo.addPayment({ patient_id: p.id, date, description: 'Controllo', method: 'POS', amount, paid });
    expect(await add('2025-12-30', 70)).toBe('FT 1/25');
    expect(await add('2026-01-02', 0.1 + 0.2)).toBe('FT 1/26');
    expect(await add('2026-01-03', 90)).toBe('FT 2/26');
    expect(await add('2026-01-04', 60, false)).toBeNull();
    const [cents] = await d.query<{ amount_cents: number }>("SELECT amount_cents FROM payments WHERE date = '2026-01-02'");
    expect(cents.amount_cents).toBe(30);
    const pending = (await repo.listPayments(p.id)).find((x) => !x.paid)!;
    const inv = await repo.markPaid(pending.id);
    expect(inv).toMatch(/^FT \d+\/\d\d$/);
    expect(await repo.markPaid(pending.id)).toBe(inv);          // saldare di nuovo non cambia numero
    await expect(repo.deletePayment(pending.id)).rejects.toThrow(/fattura/);
    const s = await repo.getSettings();
    s.bill.invoiceMin = 500;
    await repo.saveSettings(s);
    expect(await repo.nextInvoice()).toMatch(/^FT 500\//);
  });

  it('piani: bozza unica, pubblicazione, PDF condiviso tra versioni', async () => {
    const p = await repo.createPatient(newPatient());
    const v1 = await repo.createPlan(p.id, repo.emptyPlanData(), { file: { name: 'piano.pdf', b64: 'QUJD' } });
    await repo.publishPlan(v1);
    const v2 = await repo.createPlan(p.id, repo.emptyPlanData('onoff'), { fromPlanId: v1 });
    const v2b = await repo.createPlan(p.id, repo.emptyPlanData('onoff'), { fromPlanId: v1 }); // sostituisce la bozza
    expect((await repo.listPlans(p.id)).map((x) => [x.version, x.status])).toEqual([[2, 'draft'], [1, 'published']]);
    expect(v2).toBeGreaterThan(v1);
    expect((await d.query('SELECT * FROM documents')).length).toBe(1);
    await repo.publishPlan(v2b);
    const plans = await repo.listPlans(p.id);
    expect(plans.map((x) => [x.version, x.status, x.pdf_name])).toEqual([[2, 'published', 'piano.pdf'], [1, 'archived', 'piano.pdf']]);
    expect(plans[0].data.days.map((x) => x.label)).toEqual(['ON', 'OFF', 'RESET']);
    expect((await repo.getPatientRow(p.id))!.plan).toBe('on');
    await repo.deletePlan(v1);
    expect((await d.query('SELECT * FROM documents')).length).toBe(1);   // ancora usato dalla v2
    await repo.deletePlan(v2b);
    expect((await d.query('SELECT * FROM documents')).length).toBe(0);   // nessuno lo usa più
  });

  it('piani: salvare non condivide; il paziente vede il piano solo dopo la condivisione', async () => {
    const p = await repo.createPatient(newPatient());
    const id = await repo.createPlan(p.id, repo.emptyPlanData());
    expect((await repo.getPatientRow(p.id))!.plan).toBe('draft');
    await repo.markPlanSaved(id);
    let [plan] = await repo.listPlans(p.id);
    expect([plan.status, plan.saved_at]).toEqual(['draft', today()]);
    expect((await repo.getPatientRow(p.id))!.plan).toBe('ready');
    await repo.reopenPlan(id);                                           // "Modifica ancora"
    expect((await repo.listPlans(p.id))[0].saved_at).toBeNull();
    await repo.markPlanSaved(id);
    await repo.publishPlan(id);                                          // "Condividi"
    [plan] = await repo.listPlans(p.id);
    expect([plan.status, plan.saved_at, plan.published_at]).toEqual(['published', today(), today()]);
    expect((await repo.getPatientRow(p.id))!.plan).toBe('on');
    await repo.reopenPlan(id);                                           // non tocca un piano già condiviso
    expect((await repo.listPlans(p.id))[0].saved_at).toBe(today());
  });

  it('agenda: spostare un appuntamento azzera il promemoria inviato', async () => {
    const p = await repo.createPatient(newPatient());
    const a = { patient_id: p.id, date: '2026-12-01', time: '09:00', type: 'controllo' as const, duration: 30, remind: true, note: null };
    const id = await repo.addAppointment(a);
    await repo.markReminderSent(id);
    await repo.updateAppointment(id, { ...a, note: 'nota' });
    expect((await repo.patientAppointments(p.id))[0].reminder_sent_at).toBeTruthy();
    await repo.updateAppointment(id, { ...a, time: '10:00' });
    expect((await repo.patientAppointments(p.id))[0].reminder_sent_at).toBeNull();
  });

  it('agenda: trascinare sposta o ridimensiona, e lo spostamento si può annullare', async () => {
    const p = await repo.createPatient(newPatient());
    const id = await repo.addAppointment({ patient_id: p.id, date: '2026-12-01', time: '09:00', type: 'controllo', duration: 30, remind: true, note: 'porta esami' });
    await repo.markReminderSent(id);
    const sent = (await repo.patientAppointments(p.id))[0].reminder_sent_at;
    const get = async () => (await repo.patientAppointments(p.id))[0];

    await repo.rescheduleAppointment(id, { date: '2026-12-01', time: '09:00', duration: 45 });   // solo durata
    expect(await get()).toMatchObject({ duration: 45, reminder_sent_at: sent, note: 'porta esami', type: 'controllo' });
    await repo.rescheduleAppointment(id, { date: '2026-12-02', time: '11:15', duration: 45 });   // altro giorno
    expect(await get()).toMatchObject({ date: '2026-12-02', time: '11:15', reminder_sent_at: null });
    await repo.rescheduleAppointment(id, { date: '2026-12-01', time: '09:00', duration: 30 }, sent); // annulla
    expect(await get()).toMatchObject({ date: '2026-12-01', time: '09:00', duration: 30, reminder_sent_at: sent });
    await expect(repo.rescheduleAppointment(id, { date: '2026-12-01', time: '25:00', duration: 30 })).rejects.toThrow();
  });

  it('impostazioni: i valori salvati si uniscono ai predefiniti', async () => {
    await d.execute("INSERT INTO settings (key, value) VALUES ('main', '{\"prof\":{\"name\":\"Studio\"}}')");
    const s = await repo.getSettings();
    expect(s.prof.name).toBe('Studio');
    expect(s.rates.length).toBeGreaterThan(0);
  });

  it('dati demo, statistiche, svuotamento', async () => {
    await seedDemo();
    const list = await repo.listPatients();
    expect(list).toHaveLength(20);
    const giulia = list.find((x) => x.first === 'Giulia')!;
    expect(giulia).toMatchObject({ kg: 76.8, due: 70, plan: 'on' });
    expect(await repo.listPlans(giulia.id)).toHaveLength(3);
    const st = await repo.databaseStats();
    expect(st).toMatchObject({ schemaVersion: LATEST_VERSION, integrity: 'ok' });
    expect(st.counts.patients).toBe(20);
    await repo.wipeAll();
    expect((await repo.databaseStats()).counts).toMatchObject({ patients: 0, payments: 0, documents: 0 });
  });
});
