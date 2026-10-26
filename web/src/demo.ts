// Dati dimostrativi per /p/demo (dal design "App Paziente"): servono a provare l'app senza server.
// Le date sono relative a oggi, così il demo resta sempre attuale.
import type { PlanDay, PlanItem } from '@app/db/types';
import { noteFromTemplate } from '@app/db/noteTemplates';
import type { PatientView } from '@app/patientApp/view';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (d: Date, days: number) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };

type Menu = Record<'col' | 'sp' | 'pr' | 'me' | 'ce', [string, string][]>;
const A: Menu = { col: [['Yogurt greco delattosato', '150 g'], ["Fiocchi d'avena", '30 g'], ['Mirtilli', '80 g']], sp: [['Mela', '150 g'], ['Mandorle', '15 g']], pr: [['Riso basmati', '70 g'], ['Petto di pollo', '120 g'], ['Zucchine grigliate', '200 g'], ['Olio EVO', '10 g']], me: [['Kefir', '125 ml']], ce: [['Merluzzo', '180 g'], ['Patate', '200 g'], ['Verdure al vapore', '200 g'], ['Olio EVO', '10 g']] };
const B: Menu = { col: [['Pane integrale', '50 g'], ['Ricotta delattosata', '60 g'], ['Miele', '10 g']], sp: [['Frutta di stagione', '150 g'], ['Noci', '15 g']], pr: [['Pasta integrale', '70 g'], ['Ceci lessati', '150 g'], ['Pomodorini', '150 g'], ['Olio EVO', '10 g']], me: [['Gallette di riso', '2 pz'], ['Hummus', '30 g']], ce: [['Uova', '2 pz'], ['Pane integrale', '50 g'], ['Spinaci', '200 g'], ['Olio EVO', '10 g']] };
const C: Menu = { col: [["Bevanda d'avena", '200 ml'], ['Fette biscottate integrali', '4 pz'], ['Marmellata s/zucchero', '20 g']], sp: [['Kiwi', '2 pz'], ['Mandorle', '15 g']], pr: [['Farro', '70 g'], ['Salmone', '120 g'], ['Insalata mista', '150 g'], ['Olio EVO', '10 g']], me: [['Yogurt greco delattosato', '125 g']], ce: [['Fesa di tacchino', '130 g'], ['Quinoa', '50 g'], ['Finocchi', '200 g'], ['Olio EVO', '10 g']] };
const MEALS = [['col', 'Colazione', '07:30', 'Levotiroxina 30 min prima di colazione'], ['sp', 'Spuntino', '10:30', ''], ['pr', 'Pranzo', '13:00', ''], ['me', 'Merenda', '16:30', ''], ['ce', 'Cena', '20:00', '']] as const;
const items = (l: [string, string][]): PlanItem[] => l.map(([f, g]) => ({ f, g }));

export function demoView(now: Date): PatientView {
  const days: PlanDay[] = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((label, i) => ({
    label,
    meals: MEALS.map(([k, name, time, note]) => ({
      key: k, name, time,
      note: i === 6 && k === 'pr' ? 'Pasto libero: porzione moderata' : note,
      items: i === 6 && k === 'pr' ? [] : items([A, B, C][i % 3][k]),
    })),
  }));
  // La colazione del sabato ha due opzioni, come nei piani reali.
  days[5].meals[0].items = [{ f: 'Dolce', g: '', head: true, kind: 'variant' }, ...items(C.col), { f: 'Salata', g: '', head: true, kind: 'variant' }, ...items([['Pane integrale', '50 g'], ['Bresaola', '40 g'], ['Spremuta', '200 ml']])];
  const kg = [86.4, 84.6, 83.1, 81.9, 81.2, 80.0, 79.4, 78.1, 76.8];
  const cm = (i: number) => ({ vita: 98 - i, fianchi: 106 - i * 0.75, torace: 101 - i * 0.45, braccio: 31 - i * 0.2, coscia: 59 - i * 0.4 });
  return {
    v: 1,
    patient: { first: 'Giulia', targetKg: 74 },
    plan: {
      version: 3, since: iso(shift(now, -40)), hasPdf: true,
      data: {
        title: 'Ricomposizione', kcal: 1650, protein: 95, carbs: 198, fat: 53, days,
        notes: [
          { title: '', text: "Usa solo latticini delattosati. Pesa gli alimenti a crudo. Domenica a pranzo hai un pasto libero: goditelo con una porzione moderata." },
          noteFromTemplate('acqua'), noteFromTemplate('cottura'), noteFromTemplate('pesi'),
        ],
      },
    },
    visits: kg.map((k, i) => ({ date: iso(shift(now, -(kg.length - 1 - i) * 28 - 5)), kg: k, cm: cm(i) })),
    nextAppointment: { date: iso(shift(now, 16)), time: '17:30', type: 'controllo' },
    studio: {
      name: 'Dott.ssa Elena Marchi', title: 'Biologa nutrizionista', city: 'Bologna', address: 'Via Santo Stefano 42, Bologna',
      hours: 'Lun–Ven 09:00–19:00', phone: '051 000 0000', email: 'studio@example.org', whatsapp: '390510000000', photo: null,
    },
    features: { checks: true, weight: true, meas: true, pdf: true, install: true },
    consent: { required: false, studio: 'Dott.ssa Elena Marchi' },
    links: { pdf: null },
  };
}
