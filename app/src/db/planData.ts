// Il contenuto di un piano nutrizionale è un documento JSON (colonna plans.data), letto e salvato intero.
// Questo modulo crea i piani vuoti e normalizza i documenti letti dal database, così che l'interfaccia
// riceva sempre la stessa forma anche da piani salvati con versioni precedenti dell'app.
import type { PlanData, PlanDay, PlanItem, PlanMeal } from './types';

export type PlanKind = 'weekly' | 'onoff';

/** Piano vuoto: settimanale (Lun–Dom, pasti semplici) oppure a giorni tipo ON/OFF/RESET
 *  con colazione e spuntini a opzioni e pranzo/cena a gruppi "scegli 1 tra". */
export function emptyPlanData(kind: PlanKind = 'weekly'): PlanData {
  const base = { title: '', kcal: null, protein: null, carbs: null, fat: null };
  if (kind === 'weekly') {
    const meals = [['col', 'Colazione', '07:30'], ['sp', 'Spuntino', '10:30'], ['pr', 'Pranzo', '13:00'], ['me', 'Merenda', '16:30'], ['ce', 'Cena', '20:00']];
    return {
      ...base, general: '',
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
    general: 'ON: giorni di allenamento.\nOFF: giorni di riposo.\nRESET: da seguire il giorno successivo a un pasto libero.',
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
    general: str(r.general),
    days: Array.isArray(r.days) ? r.days.map(normDay) : [],
  };
  if (r.import && typeof r.import === 'object') out.import = r.import;
  return out;
}
