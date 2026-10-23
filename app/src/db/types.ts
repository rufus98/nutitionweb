// Tipi del dominio usati dall'interfaccia. Corrispondono alle tabelle descritte in src/db/README.md;
// la conversione riga ↔ oggetto (booleani 0/1, importi in centesimi, JSON) è nei repository.

export type Sex = 'F' | 'M';
export type ContactPref = 'WhatsApp' | 'Telefono' | 'Email';
export type ApptType = 'prima' | 'controllo' | 'online';
export type PlanState = 'draft' | 'published' | 'archived';

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
  contact: ContactPref;
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
  /** giorno di apertura della scheda (YYYY-MM-DD) */
  created_at: string;
}

/** Stato del piano nella lista pazienti: link attivo/revocato, salvato da condividere, bozza in preparazione, nessuno. */
export type PlanStatus = 'on' | 'off' | 'ready' | 'draft' | 'none';

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
  /** null se il paziente è stato eliminato (il pagamento resta nel registro fiscale) */
  patient_id: number | null;
  date: string;
  description: string;
  method: string;
  /** euro (nel database: centesimi interi) */
  amount: number;
  paid: boolean;
  paid_at: string | null;
  invoice_year: number | null;
  invoice_number: number | null;
  /** numero formattato, es. "FT 12/26" */
  invoice: string | null;
  /** nome del paziente (o quello registrato al momento del pagamento) */
  name: string;
  cf: string | null;
  phone: string | null;
}

export interface Appointment {
  id: number;
  patient_id: number;
  date: string;
  time: string;
  type: ApptType;
  duration: number;
  remind: boolean;
  /** istante in cui è stato inviato il promemoria WhatsApp */
  reminder_sent_at?: string | null;
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
  /** tipo di intestazione: variante alternativa, gruppo "scegli 1 tra", parte fissa, piatto composto */
  kind?: 'variant' | 'choice' | 'fixed' | 'dish';
  /** ingrediente di un piatto composto */
  sub?: boolean;
  /** alimenti alternativi con la quantità equivalente */
  alts?: { f: string; g: string }[];
}
export interface PlanMeal { key: string; name: string; time: string; note: string; items: PlanItem[] }
export interface PlanDay { label: string; meals: PlanMeal[]; kcal?: number; protein?: number; carbs?: number; fat?: number }
/** Sezione delle indicazioni generali. Titolo vuoto = testo introduttivo senza intestazione.
 *  Nel testo, le righe che iniziano con "- " sono elenchi puntati. */
export interface PlanNote { title: string; text: string }
export interface PlanData {
  title: string;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  /** Indicazioni generali divise in sezioni (es. "Acqua", "Metodi di cottura"), come nei PDF di riferimento. */
  notes: PlanNote[];
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
  status: PlanState;
  /** PDF originale (tabella documents), condiviso tra le versioni copiate */
  document_id: number | null;
  pdf_name: string | null;
  has_pdf: boolean;
  data: PlanData;
  created_at: string;
  /** Bozza finita e salvata, da condividere (null = ancora in preparazione) */
  saved_at: string | null;
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
