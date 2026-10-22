import { beforeAll, describe, expect, it } from 'vitest';
import { sqlJsDb, setDb } from '../db/db';
import * as repo from '../db/repo';
import { seedDemo } from '../db/seed';
import { addDays, ageFrom, bmiOf, fillTemplate, mondayOf, n1, phoneDigits, signed } from '../lib/format';
import { makePdf } from '../lib/pdf';
import { makeZip } from '../lib/zip';

describe('formattazione', () => {
  it('numeri e segni all\'italiana', () => {
    expect(n1(76.84)).toBe('76,8');
    expect(signed(-7.8)).toBe('−7,8');
    expect(signed(0)).toBe('±0,0');
  });
  it('date', () => {
    expect(mondayOf('2026-10-22')).toBe('2026-10-19');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(ageFrom('1988-02-12', '2026-10-21')).toBe(38);
  });
  it('BMI, telefono, modelli', () => {
    expect(bmiOf(76.8, 166)!.toFixed(1)).toBe('27.9');
    expect(phoneDigits('+39 347 218 5590')).toBe('393472185590');
    expect(phoneDigits('347 218 5590')).toBe('393472185590');
    expect(fillTemplate('Ciao {nome}, {x}', { nome: 'Giulia' })).toBe('Ciao Giulia, {x}');
  });
});

describe('piani vuoti', () => {
  it('settimanale e ON/OFF/RESET', async () => {
    const { sections } = await import('../lib/planGroups');
    expect(repo.emptyPlanData().days.map((d) => d.label)).toEqual(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
    const f = repo.emptyPlanData('onoff');
    expect(f.days.map((d) => d.label)).toEqual(['ON', 'OFF', 'RESET']);
    const pranzo = f.days[0].meals.find((m) => m.name === 'Pranzo')!;
    expect(sections(pranzo.items).map((x) => x.kind)).toEqual(['choice', 'choice', 'fixed']);
    expect(sections(f.days[0].meals[0].items).map((x) => x.kind)).toEqual(['variant']);
  });
});

describe('documenti', () => {
  it('PDF valido', () => {
    const pdf = new TextDecoder('latin1').decode(makePdf([[{ text: 'Totale € 70 — già' }]]));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Count 1');
  });
  it('ZIP con firma e directory centrale', () => {
    const z = makeZip([{ name: 'a.txt', data: 'ciao' }]);
    expect([...z.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(z)).toContain('a.txt');
  });
});

describe('database', () => {
  beforeAll(async () => { setDb(await sqlJsDb(false)); await repo.init(); });

  it('crea paziente, visita, pagamento e appuntamento', async () => {
    const p = await repo.createPatient({ first: 'Anna', last: 'Bianchi', phone: '333 1234567', email: null, dob: null, birthplace: null, cf: null, job: null, sex: 'F', contact: 'WhatsApp', tags: ['Lattosio'], drugs: null, activity: null, notes: null, height: 165, goal: 'Perdita di peso', target_kg: 65, source: null, consent_privacy: false, consent_app: true, consent_marketing: false });
    expect(p.code).toMatch(/^PZ-\d{4}$/);
    expect(p.tags).toEqual(['Lattosio']);
    await repo.addVisit({ patient_id: p.id, date: '2026-01-10', type: 'Prima visita', kg: 72, fat: null, vita: 90, fianchi: null, torace: null, braccio: null, coscia: null, polso: null, note: null, goal: null });
    await repo.addVisit({ patient_id: p.id, date: '2026-02-10', type: 'Controllo', kg: 70.5, fat: null, vita: 88, fianchi: null, torace: null, braccio: null, coscia: null, polso: null, note: null, goal: null });
    const inv = await repo.addPayment({ patient_id: p.id, date: '2026-02-10', description: 'Controllo', method: 'POS', amount: 70, paid: true });
    expect(inv).toBe('FT 1/26');
    await repo.addPayment({ patient_id: p.id, date: '2026-02-10', description: 'Controllo', method: 'POS', amount: 70, paid: false });
    await repo.addAppointment({ patient_id: p.id, date: '2999-01-01', time: '09:00', type: 'controllo', duration: 30, remind: true, note: null });
    const row = (await repo.getPatientRow(p.id))!;
    expect(row.kg).toBe(70.5);
    expect(row.kg_start).toBe(72);
    expect(row.due).toBe(70);
    expect(row.next_visit).toBe('2999-01-01');
    expect(row.plan).toBe('none');
  });

  it('pubblica un piano e archivia il precedente', async () => {
    const [p] = await repo.listPatients();
    const v1 = await repo.createPlan(p.id, repo.emptyPlanData(), null, null);
    await repo.publishPlan(v1);
    const v2 = await repo.createPlan(p.id, repo.emptyPlanData(), null, null);
    expect((await repo.getPatientRow(p.id))!.plan).toBe('draft');
    await repo.publishPlan(v2);
    const plans = await repo.listPlans(p.id);
    expect(plans.map((x) => [x.version, x.status])).toEqual([[2, 'published'], [1, 'archived']]);
    expect((await repo.getPatientRow(p.id))!.plan).toBe('on');
  });

  it('carica i dati demo', async () => {
    await repo.wipeAll();
    await seedDemo();
    const list = await repo.listPatients();
    expect(list).toHaveLength(20);
    const giulia = list.find((x) => x.first === 'Giulia')!;
    expect(giulia.kg).toBe(76.8);
    expect(giulia.due).toBe(70);
    expect(giulia.plan).toBe('on');
    expect((await repo.listPlans(giulia.id)).length).toBe(3);
  });
});
