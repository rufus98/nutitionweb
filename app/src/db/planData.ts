// Il contenuto di un piano nutrizionale è un documento JSON (colonna plans.data), letto e salvato intero.
// Questo modulo crea i piani vuoti e normalizza i documenti letti dal database, così che l'interfaccia
// riceva sempre la stessa forma anche da piani salvati con versioni precedenti dell'app.
import type { PlanData, PlanDay, PlanItem, PlanMeal, PlanNote } from './types';
import { DEFAULT_NOTES, noteFromTemplate } from './noteTemplates';

export type PlanKind = 'weekly' | 'onoff';

/** Tipologia di un piano: a giorni tipo ON/OFF/RESET oppure settimanale (o a giorni liberi). */
export const planKindOf = (plan: PlanData): PlanKind =>
  plan.days.length > 0 && plan.days.every((d) => ['ON', 'OFF', 'RESET'].includes(d.label.trim().toUpperCase())) ? 'onoff' : 'weekly';

/** Piano vuoto: settimanale (Lun–Dom, pasti semplici) oppure a giorni tipo ON/OFF/RESET
 *  con colazione e spuntini a opzioni e pranzo/cena a gruppi "scegli 1 tra". */
export function emptyPlanData(kind: PlanKind = 'weekly'): PlanData {
  const base = { title: '', kcal: null, protein: null, carbs: null, fat: null };
  if (kind === 'weekly') {
    const meals = [['col', 'Colazione', '07:30'], ['sp', 'Spuntino', '10:30'], ['pr', 'Pranzo', '13:00'], ['me', 'Merenda', '16:30'], ['ce', 'Cena', '20:00']];
    return {
      ...base, notes: DEFAULT_NOTES.weekly.map(noteFromTemplate),
      days: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((label) => ({
        label, meals: meals.map(([key, name, time]) => ({ key, name, time, note: '', items: [] })),
      })),
    };
  }
  const options = (): PlanItem[] => [{ f: 'Opzione A', g: '', head: true, kind: 'variant' }, { f: '', g: '' }];
  const choices = (): PlanItem[] => [
    { f: 'Seleziona una fonte di carboidrati tra', g: '', head: true, kind: 'choice' }, { f: '', g: '' },
    { f: 'Aggiungi una fonte proteica tra', g: '', head: true, kind: 'choice' }, { f: '', g: '' },
    { f: 'In aggiunta', g: '', head: true, kind: 'fixed' }, { f: 'Contorno a scelta', g: '200 g' }, { f: 'Olio evo', g: '10 g' },
  ];
  const meals = () => [
    { key: 'colazione', name: 'Colazione', time: '07:30', note: '', items: options() },
    { key: 'spuntino', name: 'Spuntino', time: '10:30', note: '', items: [{ f: 'Frutto a scelta', g: '150 g' }] },
    { key: 'pranzo', name: 'Pranzo', time: '13:00', note: '', items: choices() },
    { key: 'spuntino', name: 'Spuntino', time: '16:30', note: '', items: options() },
    { key: 'cena', name: 'Cena', time: '20:00', note: '', items: choices() },
  ];
  return {
    ...base,
    notes: DEFAULT_NOTES.onoff.map(noteFromTemplate),
    days: ['ON', 'OFF', 'RESET'].map((label) => ({ label, meals: meals() })),
  };
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const numOrNull = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
const KINDS = ['variant', 'choice', 'fixed', 'dish'];

function normItem(raw: any): PlanItem {
  const it: PlanItem = { f: str(raw?.f), g: str(raw?.g) };
  if (raw?.flag) it.flag = true;
  if (raw?.head) it.head = true;
  if (KINDS.includes(raw?.kind)) it.kind = raw.kind;
  if (raw?.sub) it.sub = true;
  if (Array.isArray(raw?.alts) && raw.alts.length) it.alts = raw.alts.map((a: any) => ({ f: str(a?.f), g: str(a?.g) }));
  return it;
}
function normMeal(raw: any, i: number): PlanMeal {
  const name = str(raw?.name, `Pasto ${i + 1}`);
  return { key: str(raw?.key, name.toLowerCase()), name, time: str(raw?.time), note: str(raw?.note), items: Array.isArray(raw?.items) ? raw.items.map(normItem) : [] };
}
function normDay(raw: any, i: number): PlanDay {
  const d: PlanDay = { label: str(raw?.label, `Giorno ${i + 1}`), meals: Array.isArray(raw?.meals) ? raw.meals.map(normMeal) : [] };
  for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) { const v = numOrNull(raw?.[k]); if (v != null) d[k] = v; }
  return d;
}

/** Porta un documento JSON (anche incompleto o di una versione precedente) nella forma attuale di PlanData. */
export function normalizePlanData(raw: unknown): PlanData {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const out: PlanData = {
    title: str(r.title), kcal: numOrNull(r.kcal), protein: numOrNull(r.protein), carbs: numOrNull(r.carbs), fat: numOrNull(r.fat),
    notes: Array.isArray(r.notes)
      ? r.notes.map((n: any) => ({ title: str(n?.title).trim(), text: str(n?.text).trim() })).filter((n: PlanNote) => n.title || n.text)
      : notesFromText(str(r.general)), // piani salvati prima delle sezioni: un unico testo
    days: Array.isArray(r.days) ? r.days.map(normDay) : [],
  };
  if (r.import && typeof r.import === 'object') out.import = r.import;
  return out;
}

/** Riga che fa da titolo: breve e terminata da ":" ("Metodi di cottura:") oppure tutta maiuscola ("ACQUA"). */
function headingOf(line: string): string | null {
  const t = line.trim();
  if (!t || t.length > 45 || /^[-•*\d]/.test(t)) return null;
  if (t.endsWith(':') && t.split(/\s+/).length <= 6) return t.slice(0, -1).trim();
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && !t.includes(':')) return t[0] + t.slice(1).toLowerCase();
  return null;
}

/**
 * Divide un testo libero (indicazioni generali di piani precedenti o lette da un PDF) in sezioni con titolo.
 * Riconosce i titoli su una riga propria ("Acqua:", "SURGELATI"), i titoli in linea all'inizio di una riga
 * ("*Grammature speciali: …") e quelli in maiuscolo dentro una riga ("… ecc.). BILANCIA PESA-ALIMENTI Prima …").
 */
export function notesFromText(text: string): PlanNote[] {
  const notes: PlanNote[] = [];
  let cur: PlanNote = { title: '', text: '' };
  const push = () => { cur.text = cur.text.trim(); if (cur.title || cur.text) notes.push(cur); };
  const lines = text.replace(/\r/g, '')
    // titoli in maiuscolo finiti in mezzo a una riga dalla lettura del PDF
    .replace(/([.!?)])\s+([A-ZÀ-Ù][A-ZÀ-Ù'’-]+(?:\s[A-ZÀ-Ù'’-]{2,})+)\s+(?=[A-ZÀ-Ù][a-zà-ù])/g, '$1\n$2\n')
    .split('\n');
  lines.forEach((line, i) => {
    // Una frase che introduce un elenco ("Di seguito alcune regole:" seguita da "- …") non è un titolo.
    const next = lines.slice(i + 1).find((l) => l.trim());
    const h = next && /^\s*([-•–]|\d+[).])\s/.test(next) ? null : headingOf(line);
    const inline = /^\*?([A-ZÀ-Ù][^:]{2,40}?):\s+(.{20,})$/.exec(line.trim());
    if (h) { push(); cur = { title: h, text: '' }; }
    else if (inline && /[a-zà-ù]/.test(inline[1]) && inline[1].split(/\s+/).length <= 4) { push(); cur = { title: inline[1].trim(), text: inline[2] }; }
    else cur.text += (cur.text ? '\n' : '') + line.trim();
  });
  push();
  return notes;
}

/** Testo semplice delle indicazioni (per anteprime e ricerche). */
export const notesToText = (notes: PlanNote[]) => notes.map((n) => (n.title ? n.title + ':\n' : '') + n.text).join('\n\n');
