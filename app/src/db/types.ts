export type Sex = 'F' | 'M';
export type ApptType = 'prima' | 'controllo' | 'online';

export interface Patient {
  id: number;
  code: string;
  first: string;
  last: string;
  phone: string;
  email: string | null;
  dob: string | null;
  birthplace: string | null;
  cf: string | null;
  job: string | null;
  sex: Sex;
  contact: string;
  tags: string[];
  drugs: string | null;
  activity: string | null;
  notes: string | null;
  height: number | null;
  goal: string | null;
  target_kg: number | null;
  source: string | null;
  consent_privacy: boolean;
  consent_app: boolean;
  consent_marketing: boolean;
  active: boolean;
  token: string | null;
  link_on: boolean;
  created_at: string;
}

export type PlanStatus = 'on' | 'off' | 'draft' | 'none';

/** Riga dell'elenco pazienti: anagrafica + dati derivati da visite, agenda, piani e pagamenti. */
export interface PatientRow extends Patient {
  last_visit: string | null;
  next_visit: string | null;
  kg: number | null;
  kg_start: number | null;
  plan: PlanStatus;
  due: number;
}

export interface Visit {
  id: number;
  patient_id: number;
  date: string;
  type: string;
  kg: number | null;
  fat: number | null;
  vita: number | null;
  fianchi: number | null;
  torace: number | null;
  braccio: number | null;
  coscia: number | null;
  polso: number | null;
  note: string | null;
  goal: string | null;
}

export interface Payment {
  id: number;
  patient_id: number;
  date: string;
  description: string;
  method: string;
  amount: number;
  paid: boolean;
  invoice: string | null;
  /** valorizzato dalle query con join */
  name?: string;
  phone?: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  date: string;
  time: string;
  type: ApptType;
  duration: number;
  remind: boolean;
  note: string | null;
  name?: string;
  phone?: string;
  goal?: string | null;
}

export interface PlanItem {
  f: string;
  g: string;
  /** da verificare (lettura del PDF incerta) */
  flag?: boolean;
  /** intestazione: variante del pasto, gruppo "a scelta tra" o piatto composto */
  head?: boolean;
  /** ingrediente di un piatto composto */
  sub?: boolean;
  /** alimenti alternativi con la quantità equivalente */
  alts?: { f: string; g: string }[];
}
export interface PlanMeal { key: string; name: string; time: string; note: string; items: PlanItem[] }
export interface PlanDay { label: string; meals: PlanMeal[]; kcal?: number; protein?: number; carbs?: number; fat?: number }
export interface PlanData {
  title: string;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  general: string;
  days: PlanDay[];
  /** Riepilogo della lettura automatica del PDF (mostrato nell'editor finché non viene chiuso). */
  import?: {
    file: string;
    format: 'progeo' | 'layout';
    patientName: string | null;
    visit: { date: string | null; kg: number | null; height: number | null } | null;
    stats: { days: number; meals: number; items: number; flagged: number };
    warnings: string[];
  };
}
export interface Plan {
  id: number;
  patient_id: number;
  version: number;
  status: 'draft' | 'published' | 'archived';
  pdf_name: string | null;
  has_pdf: boolean;
  data: PlanData;
  created_at: string;
  published_at: string | null;
}

export interface Rate { name: string; price: number; dur: string }
export interface Hours { day: string; on: boolean; a: string; b: string; c: string; d: string }
export interface Settings {
  prof: { name: string; title: string; albo: string; piva: string; addr: string; phone: string; email: string; pec: string };
  hours: Hours[];
  rates: Rate[];
  bill: { sdi: boolean; ts: boolean; bollo: boolean; regime: string; cassa: string; iva: string; /** numero minimo per la prossima fattura dell'anno */ invoiceMin: number };
  dur: { prima: number; controllo: number; online: number; buffer: number };
  expiry: string;
  appDomain: string;
  /** true quando il server che pubblica l'app paziente è attivo (per ora sempre false). */
  appServer: boolean;
  app: { weight: boolean; meas: boolean; pdf: boolean; checks: boolean; install: boolean };
  tpl: string[];
  priv: { pin: boolean; consent: boolean; log: boolean };
  pin: string;
  logo: string | null;
  photo: string | null;
}
