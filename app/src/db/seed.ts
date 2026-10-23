// Dati demo tratti dal design (studio della Dott.ssa Marchi). Le date originali sono
// spostate di un numero intero di settimane, così l'agenda resta allineata ai giorni della settimana.
import * as repo from './repo';
import { db } from './connection';
import { DEFAULT_SETTINGS, DEMO_PROFILE } from './defaults';
import type { ApptType, PlanData, PlanMeal } from './types';
import { addDays, daysBetween, mondayOf, today } from '../lib/format';
import { bytesToB64 } from '../lib/pdf';
import { planPdf } from '../lib/documents';

const BASE = '2026-10-21';
const rnd = (seed: number) => { const x = Math.sin(seed) * 1e4; return x - Math.floor(x); };

// name, phone, goal, last, next, kgNow, kgStart, plan, due, active
const P: [string, string, string, string, string, number, number, 'on' | 'draft' | 'none', number, number][] = [
  ['Giulia Ferrante', '347 218 5590', 'Ricomposizione · −8 kg', '2026-10-14', '2026-11-11', 76.8, 84.6, 'on', 70, 1],
  ['Marco Bellini', '333 904 1127', 'Ipertensione · −10 kg', '2026-10-17', '2026-11-07', 91.2, 98.5, 'on', 0, 1],
  ['Sara Lombardo', '340 552 7781', 'Gravidanza 2° trim.', '2026-10-20', '2026-11-17', 64.1, 61.0, 'on', 0, 1],
  ['Luca Esposito', '328 117 4402', 'Performance ciclismo', '2026-09-02', '', 72.4, 74.0, 'on', 0, 1],
  ['Chiara Rinaldi', '349 663 2018', 'Endometriosi · antinfiammatoria', '2026-10-09', '2026-11-06', 58.3, 59.8, 'on', 90, 1],
  ['Andrea Conti', '338 270 9915', 'Diabete tipo 2 · −12 kg', '2026-10-15', '2026-11-12', 102.6, 112.0, 'on', 0, 1],
  ['Francesca Greco', '331 448 6620', 'Svezzamento post-parto', '2026-10-21', '', 67.9, 67.9, 'draft', 120, 1],
  ['Paolo Marini', '345 981 3307', 'Colesterolo · −5 kg', '2026-08-28', '', 84.0, 86.2, 'on', 0, 1],
  ['Elisa Ferri', '347 302 1184', 'DCA · follow-up con psicologa', '2026-10-13', '2026-10-27', 52.6, 50.9, 'on', 0, 1],
  ['Davide Santoro', '329 775 0491', 'Massa muscolare', '2026-10-02', '2026-10-30', 78.8, 75.5, 'on', 0, 1],
  ['Martina Galli', '334 610 2256', 'Celiachia · educazione', '2026-07-18', '', 61.2, 62.0, 'none', 0, 0],
  ['Roberto De Luca', '339 857 4413', 'Reflusso · −6 kg', '2026-10-06', '2026-11-03', 88.1, 92.3, 'on', 70, 1],
  ['Valentina Moretti', '346 129 8870', 'Ricomposizione', '2026-10-18', '2026-11-15', 69.5, 72.8, 'on', 0, 1],
  ['Giorgio Barbieri', '335 404 6632', 'Over 65 · sarcopenia', '2026-09-25', '2026-10-23', 70.2, 69.4, 'on', 0, 1],
  ['Alessia Fontana', '342 903 5519', 'PCOS · −7 kg', '2026-10-11', '2026-11-08', 74.6, 79.9, 'on', 0, 1],
  ['Simone Caruso', '320 688 1045', 'Prima visita', '2026-10-21', '', 95.4, 95.4, 'draft', 0, 1],
  ['Laura Pellegrini', '348 216 7790', 'Mantenimento', '2026-05-30', '', 63.0, 70.1, 'none', 0, 0],
  ['Matteo Ricci', '333 570 2284', 'Running · maratona', '2026-10-08', '2026-11-05', 68.7, 70.0, 'on', 0, 1],
  ['Federica Gentile', '340 739 9102', 'Ipotiroidismo · −6 kg', '2026-10-16', '2026-11-13', 71.8, 76.4, 'on', 0, 1],
  ['Tommaso Villa', '347 845 3367', 'Adolescente · educazione', '2026-09-19', '', 58.9, 60.3, 'on', 60, 1],
];
const MALE = new Set(['Marco', 'Luca', 'Andrea', 'Paolo', 'Davide', 'Roberto', 'Giorgio', 'Simone', 'Matteo', 'Tommaso']);
const TAGS: Record<string, string[]> = {
  'Giulia Ferrante': ['Ipotiroidismo', 'Intolleranza lattosio'], 'Marco Bellini': ['Ipertensione'], 'Sara Lombardo': ['Gravidanza'],
  'Andrea Conti': ['Diabete tipo 2'], 'Martina Galli': ['Celiachia'], 'Roberto De Luca': ['Reflusso'], 'Alessia Fontana': ['PCOS'],
  'Federica Gentile': ['Ipotiroidismo'], 'Elisa Ferri': ['DCA (storico)'], 'Paolo Marini': ['Colesterolo alto'], 'Chiara Rinaldi': ['No carne rossa'],
};

// Visite di Giulia (dal design): data, kg, fat, vita, fianchi, torace, braccio, coscia, tipo, note, obiettivo
const V0: [string, number, number, number, number, number, number, number, string, string, string][] = [
  ['2026-03-10', 84.6, 33.1, 96, 108, 102, 32, 61, 'Prima visita', 'Anamnesi completa. Fame nervosa serale, 5.000 passi/giorno.', 'avvio piano 1.450 kcal'],
  ['2026-04-07', 83.1, 32.4, 94.5, 107, 101.5, 31.8, 60.4, 'Controllo', 'Buona aderenza, gonfiore ridotto con delattosati.', '−1,5 kg'],
  ['2026-05-05', 81.9, 31.6, 93, 106, 101, 31.5, 60, 'Controllo', 'Inserito pilates 2×/sett. Sonno migliorato.', '−1,2 kg'],
  ['2026-05-26', 81.2, 31.1, 92.4, 105.2, 100.4, 31.3, 59.6, 'Controllo + nuovo piano', 'Passaggio a 1.500 kcal, più proteine a colazione.', 'mantenere massa magra'],
  ['2026-06-23', 80.0, 30.4, 91, 104.5, 100, 31.1, 59.2, 'Controllo', 'Ok weekend, attenzione aperitivi.', '−1 kg'],
  ['2026-07-21', 79.4, 30.0, 90.2, 104, 99.6, 31, 58.9, 'Controllo', 'Vacanze gestite bene, peso stabile.', 'consolidare'],
  ['2026-08-25', 78.1, 29.2, 89.5, 103.2, 99.2, 30.8, 58.6, 'Controllo', 'Ripresa routine, energia buona.', '−1 kg'],
  ['2026-09-15', 77.6, 28.9, 88.6, 102.6, 98.8, 30.6, 58.2, 'Controllo + nuovo piano', 'Ricomposizione 1.650 kcal con carboidrati periallenamento.', 'ricomposizione'],
  ['2026-10-14', 76.8, 28.3, 88, 102, 98.5, 30.5, 58, 'Controllo', "Ottimo trend. TSH nella norma all'ultimo esame.", '74 kg entro gennaio'],
];
const NOTES = ['Buona aderenza al piano.', 'Qualche difficoltà nel weekend, da monitorare.', 'Energia buona, sonno regolare.', 'Aumentata attività fisica.', 'Ridotto gonfiore serale.', 'Introdotti spuntini proteici.'];

// Movimenti dal design "Pagamenti": data, paziente, descrizione, metodo, importo, saldato
const T0: [string, string, string, string, number, boolean][] = [
  ['2026-10-21', 'Francesca Greco', 'Prima visita + piano', 'POS', 120, false],
  ['2026-10-21', 'Simone Caruso', 'Prima visita + piano', 'Satispay', 120, true],
  ['2026-10-20', 'Sara Lombardo', 'Controllo', 'Bonifico', 70, true],
  ['2026-10-18', 'Valentina Moretti', 'Controllo + bioimpedenza', 'POS', 110, true],
  ['2026-10-17', 'Marco Bellini', 'Controllo', 'Contanti', 70, true],
  ['2026-10-16', 'Federica Gentile', 'Controllo', 'POS', 70, true],
  ['2026-10-15', 'Andrea Conti', 'Pacchetto 3 controlli', 'Bonifico', 170, true],
  ['2026-10-14', 'Giulia Ferrante', 'Controllo', 'Satispay', 70, false],
  ['2026-10-13', 'Elisa Ferri', 'Controllo', 'POS', 70, true],
  ['2026-10-11', 'Alessia Fontana', 'Controllo', 'PayPal', 70, true],
  ['2026-10-09', 'Chiara Rinaldi', 'Controllo + nuovo piano', 'Bonifico', 90, false],
  ['2026-10-08', 'Matteo Ricci', 'Consulenza online', 'PayPal', 60, true],
  ['2026-10-06', 'Roberto De Luca', 'Controllo', 'POS', 70, false],
  ['2026-10-02', 'Davide Santoro', 'Controllo + nuovo piano', 'Satispay', 90, true],
  ['2026-09-25', 'Giorgio Barbieri', 'Controllo', 'Contanti', 70, true],
  ['2026-09-19', 'Tommaso Villa', 'Consulenza online', 'Bonifico', 60, false],
  ['2026-09-15', 'Giulia Ferrante', 'Controllo + aggiornamento piano', 'POS', 90, true],
  ['2026-08-25', 'Giulia Ferrante', 'Visita di controllo', 'Contanti', 70, true],
  ['2026-07-21', 'Giulia Ferrante', 'Visita di controllo', 'Bonifico', 70, true],
  ['2026-05-26', 'Giulia Ferrante', 'Pacchetto 3 controlli', 'Bonifico', 170, true],
  ['2026-03-10', 'Giulia Ferrante', 'Prima visita + piano', 'POS', 120, true],
];
// Incassi mensili gen–set dal grafico del design: completati con movimenti generati.
const MONTHS = [2940, 3380, 4120, 3860, 4410, 4050, 3320, 1980, 4630];

// Agenda della settimana corrente (dal design): giorno 0=lun, ora, paziente (indice in AGENDA_PAT), tipo
const AGENDA_PAT = ['Giulia Ferrante', 'Marco Bellini', 'Sara Lombardo', 'Luca Esposito', 'Chiara Rinaldi', 'Andrea Conti', 'Francesca Greco', 'Paolo Marini', 'Elisa Ferri', 'Davide Santoro', 'Roberto De Luca', 'Valentina Moretti', 'Giorgio Barbieri', 'Alessia Fontana', 'Simone Caruso', 'Matteo Ricci', 'Federica Gentile'];
const W0: [number, string, number, ApptType][] = [
  [0, '09:00', 2, 'prima'], [0, '10:30', 0, 'controllo'], [0, '11:00', 7, 'controllo'], [0, '15:00', 13, 'online'], [0, '16:30', 4, 'controllo'],
  [1, '09:30', 5, 'controllo'], [1, '10:00', 9, 'controllo'], [1, '14:30', 14, 'prima'], [1, '17:00', 11, 'online'],
  [2, '09:00', 6, 'prima'], [2, '10:30', 8, 'controllo'], [2, '11:30', 1, 'controllo'], [2, '15:30', 12, 'controllo'], [2, '17:30', 0, 'controllo'],
  [3, '09:00', 16, 'controllo'], [3, '09:30', 10, 'controllo'], [3, '11:00', 3, 'online'], [3, '14:00', 15, 'prima'], [3, '16:00', 4, 'controllo'],
  [4, '10:00', 5, 'online'], [4, '11:00', 2, 'controllo'], [4, '15:00', 7, 'controllo'], [4, '16:00', 13, 'prima'],
  [5, '09:30', 9, 'controllo'], [5, '10:30', 11, 'controllo'],
];

// Piano di esempio (dal design): tre giornate tipo ruotate sui 7 giorni.
type T = Record<string, [string, string, number?][]>;
const A: T = { col: [['Yogurt greco delattosato', '150 g'], ["Fiocchi d'avena", '30 g'], ['Mirtilli', '80 g']], sp: [['Mela', '150 g'], ['Mandorle', '15 g']], pr: [['Riso basmati', '70 g'], ['Petto di pollo', '120 g'], ['Zucchine grigliate', '200 g'], ['Olio EVO', '10 g']], me: [['Kefir', '125 ml']], ce: [['Merluzzo', '180 g'], ['Patate', '200 g'], ['Verdure al vapore', '200 g'], ['Olio EVO', '10 g']] };
const B: T = { col: [['Pane integrale', '50 g'], ['Ricotta delattosata', '60 g'], ['Miele', '10 g']], sp: [['Frutta di stagione', '150 g'], ['Noci', '15 g']], pr: [['Pasta integrale', '70 g'], ['Ceci lessati', '150 g', 1], ['Pomodorini', '150 g'], ['Olio EVO', '10 g']], me: [['Gallette di riso', '2 pz'], ['Hummus', '30 g']], ce: [['Uova', '2 pz'], ['Pane integrale', '50 g'], ['Spinaci', '200 g'], ['Olio EVO', '10 g']] };
const C: T = { col: [["Bevanda d'avena", '200 ml'], ['Fette biscottate integrali', '4 pz'], ['Marmellata s/zucchero', '20 g']], sp: [['Kiwi', '2 pz'], ['Mandorle', '15 g']], pr: [['Farro', '70 g'], ['Salmone', '120 g', 1], ['Insalata mista', '150 g'], ['Olio EVO', '10 g']], me: [['Yogurt greco delattosato', '125 g']], ce: [['Fesa di tacchino', '130 g'], ['Quinoa', '50 g'], ['Finocchi', '200 g'], ['Olio EVO', '10 g']] };
const MEALS: [string, string, string, string][] = [['col', 'Colazione', '07:30', 'Levotiroxina 30 min prima'], ['sp', 'Spuntino', '10:30', ''], ['pr', 'Pranzo', '13:00', ''], ['me', 'Merenda', '16:30', ''], ['ce', 'Cena', '20:00', "Bere 1,5–2 L d'acqua nella giornata"]];

export function samplePlan(title: string, kcal: number, flags = false, thyroid = true): PlanData {
  const days = (['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const).map((label, i) => {
    const t = [A, B, C, A, B, C, A][i];
    return {
      label,
      meals: MEALS.map(([key, name, time, note]): PlanMeal => ({
        key, name, time,
        note: i === 6 && key === 'pr' ? 'Pasto libero consentito (porzione moderata)' : key === 'col' && !thyroid ? '' : note,
        items: t[key].map(([f, g, fl]) => ({ f, g, ...(flags && fl && (i === 4 || i === 5) ? { flag: true } : {}) })),
      })),
    };
  });
  const p = Math.round(kcal * 0.23 / 4), c = Math.round(kcal * 0.48 / 4), f = Math.round(kcal * 0.29 / 9);
  return { title, kcal, protein: p, carbs: c, fat: f, general: "Bere 1,5–2 L d'acqua al giorno. Verdura a volontà a pranzo e cena. Preferire cotture semplici.", days };
}

export async function seedDemo() {
  const weeks = Math.round(daysBetween(BASE, today()) / 7);
  const D = (s: string) => (s ? addDays(s, weeks * 7) : '');
  const ids: Record<string, number> = {};

  for (const [i, r] of P.entries()) {
    const [name, phone, goalRaw, , , , start] = r;
    const [first, ...rest] = name.split(' ');
    const last = rest.join(' ');
    const m = /·\s*−(\d+)\s*kg/.exec(goalRaw);
    const goal = goalRaw.replace(/\s*·\s*−\d+\s*kg/, '');
    const isG = i === 0;
    const sex = MALE.has(first) ? 'M' : 'F';
    const p = await repo.createPatient({
      first, last, phone: '+39 ' + phone,
      email: `${first}.${last.replace(/\s/g, '')}@mail.it`.toLowerCase(),
      dob: isG ? '1988-02-12' : `${1960 + Math.floor(rnd(i) * 45)}-${String(1 + Math.floor(rnd(i + 3) * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd(i + 7) * 27)).padStart(2, '0')}`,
      birthplace: isG ? 'Bologna' : ['Bologna', 'Modena', 'Ferrara', 'Imola', 'Ravenna'][i % 5],
      cf: isG ? 'FRRGLI88B52A944K' : null,
      job: isG ? 'Architetta · sedentaria' : null,
      sex, contact: 'WhatsApp', tags: TAGS[name] ?? [],
      drugs: isG ? 'Levotiroxina 50 µg, a digiuno' : null,
      activity: isG ? 'Leggera (1–2×/sett.)' : 'Sedentaria',
      notes: isG ? 'Ipotiroidismo in terapia (levotiroxina 50 µg, a digiuno)\nIntolleranza al lattosio — usare alternative delattosate\nAllenamento: pilates 2×/settimana' : null,
      height: isG ? 166 : sex === 'M' ? 172 + Math.round(rnd(i) * 14) : 158 + Math.round(rnd(i) * 12),
      goal, target_kg: isG ? 74 : m ? Math.round(start - Number(m[1])) : null,
      source: 'Passaparola', consent_privacy: true, consent_app: r[7] !== 'none', consent_marketing: false,
      active: !!r[9], created_at: D(isG ? V0[0][0] : r[3]),
    });
    ids[name] = p.id;
    if (r[7] === 'none') await repo.updatePatient(p.id, { link_on: false });
  }

  // Visite
  for (const [i, r] of P.entries()) {
    const pid = ids[r[0]];
    if (i === 0) {
      for (const v of V0) await repo.addVisit({ patient_id: pid, date: D(v[0]), kg: v[1], fat: v[2], vita: v[3], fianchi: v[4], torace: v[5], braccio: v[6], coscia: v[7], polso: null, type: v[8], note: v[9], goal: v[10] });
      continue;
    }
    const [, , , lastD, , now, start] = r;
    const n = now === start ? 1 : 2 + Math.floor(rnd(i * 5) * 6);
    const male = MALE.has(r[0].split(' ')[0]);
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 1 : k / (n - 1);
      const kg = Math.round((start + (now - start) * t + (k && k < n - 1 ? (rnd(i * 11 + k) - 0.5) * 0.6 : 0)) * 10) / 10;
      const ratio = kg / start;
      const c = (base: number) => Math.round(base * (0.55 + 0.45 * ratio) * 10) / 10;
      await repo.addVisit({
        patient_id: pid, date: D(addDays(lastD, -(n - 1 - k) * 28)), kg,
        fat: Math.round(((male ? 24 : 31) * (0.7 + 0.3 * ratio)) * 10) / 10,
        vita: c(start * (male ? 1.02 : 1.14)), fianchi: c(start * (male ? 1.12 : 1.3)), torace: c(start * (male ? 1.18 : 1.2)),
        braccio: c(start * 0.38), coscia: c(start * 0.72), polso: null,
        type: k === 0 ? 'Prima visita' : 'Controllo', note: k === 0 ? 'Anamnesi completa, impostato il piano.' : NOTES[(i + k) % NOTES.length],
        goal: k === n - 1 ? 'consolidare' : '−1 kg',
      });
    }
  }

  // Pagamenti: storico generato (gen–set) + movimenti del design. Fatture numerate in ordine di data.
  const pays: [string, number, string, string, number, boolean][] = [];
  const names = P.map((r) => r[0]);
  const designSum = (mi: number) => T0.filter((t) => +t[0].slice(5, 7) === mi + 1 && t[5]).reduce((a, t) => a + t[4], 0);
  const SV: [string, number][] = [['Controllo', 70], ['Controllo', 70], ['Controllo + nuovo piano', 90], ['Prima visita + piano', 120], ['Consulenza online', 60], ['Bioimpedenziometria', 40]];
  MONTHS.forEach((total, mi) => {
    let left = total - designSum(mi), k = 0;
    while (left > 0) {
      let [desc, amt] = SV[Math.floor(rnd(mi * 101 + k) * SV.length)];
      if (amt > left) { desc = 'Controllo'; amt = left; }
      const day = 1 + Math.floor(rnd(mi * 37 + k * 3) * 27);
      const date = `2026-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const who = names[1 + Math.floor(rnd(mi * 13 + k * 7) * (names.length - 1))];
      pays.push([date, ids[who], desc, ['POS', 'Bonifico', 'Satispay', 'Contanti', 'PayPal'][Math.floor(rnd(k + mi) * 5)], amt, true]);
      left -= amt; k++;
    }
  });
  for (const t of T0) pays.push([t[0], ids[t[1]], t[2], t[3], t[4], t[5]]);
  pays.sort((a, b) => a[0].localeCompare(b[0]));
  const counters: Record<number, number> = {};
  for (const [date, pid, desc, method, amount, paid] of pays) {
    const d = D(date), year = +d.slice(0, 4);
    await repo.addPayment({ patient_id: pid, date: d, description: desc, method, amount, paid, invoice: paid ? { year, number: (counters[year] = (counters[year] ?? 0) + 1) } : null });
  }

  // Agenda: settimana corrente dal design + prossime visite dell'elenco pazienti.
  const mon = mondayOf(D(BASE));
  const taken = new Set<string>();
  for (const [d, time, pi, type] of W0) {
    const date = addDays(mon, d);
    taken.add(date + time);
    await repo.addAppointment({ patient_id: ids[AGENDA_PAT[pi]], date, time, type, duration: repo.APPT_TYPES[type][1], remind: true, note: null });
  }
  for (const r of P) {
    if (!r[4]) continue;
    let date = D(r[4]);
    if (new Date(date).getDay() === 0) date = addDays(date, 1);
    const existing = await repo.patientAppointments(ids[r[0]]);
    if (existing.some((a) => a.date === date)) continue;
    const time = ['09:00', '10:00', '11:00', '15:00', '16:00', '17:00'].find((t) => !taken.has(date + t)) ?? '18:00';
    taken.add(date + time);
    await repo.addAppointment({ patient_id: ids[r[0]], date, time, type: 'controllo', duration: 30, remind: true, note: null });
  }

  // Piani nutrizionali
  const studio = DEMO_PROFILE.name + ' · ' + DEMO_PROFILE.title;
  for (const [i, r] of P.entries()) {
    const pid = ids[r[0]];
    if (r[7] === 'none') continue;
    const thyroid = i === 0 || r[0] === 'Federica Gentile';
    const versions: [string, number, string][] = i === 0
      ? [['Avvio', 1450, '2026-03-10'], ['Ipocalorico', 1500, '2026-05-26'], ['Ricomposizione', 1650, '2026-09-15']]
      : [[r[2].split(' · ')[0], [1500, 1650, 1800, 2000][i % 4], r[3]]];
    for (const [title, kcal, date] of versions) {
      const data = samplePlan(title, kcal, false, thyroid);
      const pdf = bytesToB64(planPdf(r[0], data, studio));
      const id = await repo.createPlan(pid, data, { file: { name: `Piano_${r[0].split(' ')[1]}_${date.slice(5, 7)}${date.slice(2, 4)}.pdf`, b64: pdf } });
      if (r[7] === 'on') {
        await repo.publishPlan(id);
        await rawDate(id, D(date));
      } else if (r[0] === 'Francesca Greco') {
        await repo.markPlanSaved(id); // un piano salvato in attesa di condivisione, l'altro ancora in preparazione
      }
    }
  }

  const s = structuredClone(DEFAULT_SETTINGS);
  s.prof = { ...DEMO_PROFILE };
  await repo.saveSettings(s);
  await repo.setFlag('demo', '1');
}

/** I dati demo hanno date storiche: le versioni dei piani le riportano. */
async function rawDate(planId: number, date: string) {
  await (await db()).execute('UPDATE plans SET created_at = ?, saved_at = ?, published_at = ? WHERE id = ?', [date, date, date, planId]);
}
