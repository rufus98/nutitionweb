// Formattazione all'italiana usata in tutto il design (virgola decimale, mesi abbreviati, segno − tipografico).

export const MO = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const MONTHS_CAP = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));
export const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Data locale → 'YYYY-MM-DD'. */
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM-DD' → Date locale a mezzanotte. */
export const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => iso(new Date());
export const addDays = (s: string, n: number) => {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const daysBetween = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 864e5);
/** Lunedì della settimana che contiene la data. */
export const mondayOf = (s: string) => {
  const d = parseIso(s);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return iso(d);
};

/** '2026-10-14' → '14 ott 2026' */
export const fmtDate = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${+d} ${MO[+m - 1]} ${y}`;
};
/** '2026-10-14' → '14 ott' */
export const fmtShort = (s: string) => {
  const [, m, d] = s.split('-');
  return `${+d} ${MO[+m - 1]}`;
};
/** Omette l'anno se è quello corrente. */
export const fmtSmart = (s: string) => (s.slice(0, 4) === today().slice(0, 4) ? fmtShort(s) : fmtDate(s));

export const ago = (days: number) =>
  days === 0 ? 'oggi' : days === 1 ? 'ieri' : days < 30 ? days + ' giorni fa' : Math.round(days / 30) === 1 ? '1 mese fa' : Math.round(days / 30) + ' mesi fa';

export const n1 = (v: number) => v.toFixed(1).replace('.', ',');
export const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±') + n1(Math.abs(v));
export const eur = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });

/** Accetta '72,5' o '72.5'; restituisce NaN se vuoto. */
export const num = (v: unknown) => parseFloat(String(v ?? '').replace(',', '.'));
export const numOrNull = (v: unknown) => {
  const x = num(v);
  return isNaN(x) ? null : x;
};
/** Numero → stringa per un campo di input ('72,5'). */
export const numStr = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));

export const initials = (first: string, last: string) => ((first || 'N')[0] + (last || 'P')[0]).toUpperCase();
export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export const ageFrom = (dob?: string | null, ref = today()) => {
  if (!dob) return null;
  const a = parseIso(dob), r = parseIso(ref);
  let y = r.getFullYear() - a.getFullYear();
  if (r.getMonth() < a.getMonth() || (r.getMonth() === a.getMonth() && r.getDate() < a.getDate())) y--;
  return isNaN(y) ? null : y;
};

export const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};
export const toHHMM = (m: number) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

export const bmiOf = (kg?: number | null, cm?: number | null) => (kg && cm ? kg / (cm / 100) ** 2 : null);
export const bmiCategory = (b: number | null) =>
  !b ? '' : b < 18.5 ? 'Sottopeso' : b < 25 ? 'Normopeso' : b < 30 ? 'Sovrappeso' : 'Obesità';

/** Solo cifre, con prefisso 39 se manca (per wa.me / tel:). */
export const phoneDigits = (phone: string) => {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length <= 10) d = '39' + d;
  return d;
};
export const waLink = (phone: string, text?: string) =>
  'https://wa.me/' + phoneDigits(phone) + (text ? '?text=' + encodeURIComponent(text) : '');
export const telLink = (phone: string) => 'tel:+' + phoneDigits(phone);

/** Sostituisce {variabili} nei modelli di messaggio. */
export const fillTemplate = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
