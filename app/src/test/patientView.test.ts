// Dati dell'app paziente: cosa arriva al telefono (e cosa no) e lista della spesa.
import { describe, expect, it } from 'vitest';
import { buildPatientView, hoursLabel } from '../patientApp/buildView';
import { PATIENT_VIEW_VERSION } from '../patientApp/view';
import { choiceFoods, shoppingList } from '../lib/shopping';
import { DEFAULT_SETTINGS } from '../db/defaults';
import { emptyPlanData } from '../db/planData';
import type { Appointment, Patient, Plan, Settings, Visit } from '../db/types';

const patient = { id: 1, first: 'Giulia', last: 'Ferrante', target_kg: 74, consent_app: true, notes: 'nota clinica riservata', cf: 'FRRGLI90A41A944X' } as unknown as Patient;
const visit = (date: string, kg: number, vita: number): Visit => ({ id: 0, patient_id: 1, date, type: 'Controllo', kg, fat: 31, vita, fianchi: 100, torace: null, braccio: null, coscia: null, polso: 16, note: 'privata', goal: null });
const plan = (): Plan => {
  const data = emptyPlanData('weekly');
  data.days[0].meals[0].items = [{ f: 'Yogurt greco', g: '150 g' }, { f: 'Fiocchi d’avena', g: '30 g' }];
  data.days[1].meals[0].items = [{ f: 'Yogurt greco', g: '150 g' }];
  data.days[0].meals[2].items = [{ f: 'Scegli tra', g: '', head: true, kind: 'choice' }, { f: 'Riso', g: '70 g' }, { f: 'Farro', g: '70 g' }];
  return { id: 9, patient_id: 1, version: 3, status: 'published', document_id: 4, pdf_name: 'p.pdf', has_pdf: true, data, created_at: '2026-09-15', saved_at: '2026-09-15', published_at: '2026-09-15' };
};
const settings = (patch: (s: Settings) => void = () => {}) => { const s = structuredClone(DEFAULT_SETTINGS); s.prof.name = 'Dott.ssa Elena Marchi'; s.prof.addr = 'Via Santo Stefano 42, Bologna'; s.prof.phone = '051 000 0000'; patch(s); return s; };
const appts = [
  { id: 1, patient_id: 1, date: '2026-10-01', time: '09:00', type: 'controllo', duration: 30, remind: true, reminder_sent_at: null, note: 'interna' },
  { id: 2, patient_id: 1, date: '2026-11-11', time: '17:30', type: 'controllo', duration: 30, remind: true, reminder_sent_at: null, note: null },
  { id: 3, patient_id: 1, date: '2026-12-02', time: '10:00', type: 'online', duration: 30, remind: true, reminder_sent_at: null, note: null },
] as Appointment[];

describe('dati dell’app paziente', () => {
  it('contengono solo ciò che serve al paziente', () => {
    const v = buildPatientView({ patient, plan: plan(), visits: [visit('2026-09-01', 84.6, 98), visit('2026-03-10', 86, 102)], appointments: appts, settings: settings(), today: '2026-10-26', pdfUrl: '/api/p/x/pdf' });
    expect(v.v).toBe(PATIENT_VIEW_VERSION);
    expect(v.visits.map((x) => [x.date, x.kg, x.cm])).toEqual([['2026-03-10', 86, { vita: 102, fianchi: 100 }], ['2026-09-01', 84.6, { vita: 98, fianchi: 100 }]]);
    expect(v.nextAppointment).toEqual({ date: '2026-11-11', time: '17:30', type: 'controllo' });
    expect(v.studio).toMatchObject({ city: 'Bologna', whatsapp: '390510000000' });
    expect(v.links.pdf).toBe('/api/p/x/pdf');
    // Niente note cliniche, codice fiscale, massa grassa, polso o note interne.
    const text = JSON.stringify(v);
    for (const secret of ['nota clinica', 'FRRGLI', 'privata', 'interna']) expect(text).not.toContain(secret);
    expect(JSON.stringify(v.visits)).not.toMatch(/fat|polso/); // le macro del piano ("fat" in grammi) invece servono
  });

  it('rispettano le funzioni scelte dallo studio', () => {
    const v = buildPatientView({ patient: { ...patient, consent_app: false }, plan: plan(), visits: [visit('2026-09-01', 80, 90)], appointments: [], settings: settings((s) => { s.app.weight = false; s.app.meas = false; s.app.pdf = false; s.priv.consent = true; }), today: '2026-10-26', pdfUrl: '/x' });
    expect(v.visits[0]).toEqual({ date: '2026-09-01', kg: null, cm: {} });
    expect(v.patient.targetKg).toBeNull();
    expect(v.links.pdf).toBeNull();
    expect(v.consent.required).toBe(true);
    expect(buildPatientView({ patient, plan: null, visits: [], appointments: [], settings: settings(), today: '2026-10-26' }).plan).toBeNull();
  });

  it('orari dello studio in breve', () => {
    const h = (day: string, on = true, a = '09:00', d = '19:00') => ({ day, on, a, b: '13:00', c: '14:00', d });
    expect(hoursLabel([h('Lunedì'), h('Martedì'), h('Mercoledì'), h('Giovedì'), h('Venerdì'), h('Sabato', false)])).toBe('Lun–Ven 09:00–19:00');
    expect(hoursLabel([h('Lunedì'), h('Martedì', true, '09:00', '13:00')])).toBe('Lun 09:00–19:00 · Mar 09:00–13:00');
  });

  it('lista della spesa: somma delle voci fisse e alimenti a scelta a parte', () => {
    const p = plan().data;
    expect(shoppingList(p)).toEqual([{ f: 'Fiocchi d’avena', unit: 'g', n: 30 }, { f: 'Yogurt greco', unit: 'g', n: 300 }]);
    expect(choiceFoods(p)).toEqual(['Farro', 'Riso']);
  });
});
