// Contratto dei dati dell'app paziente: è la risposta di GET /api/p/{token} (vedi web/README.md)
// e ciò che l'anteprima dell'app desktop mostra. Contiene solo quello che serve al paziente:
// niente BMI, massa grassa, note cliniche o dati di pagamento.
import type { ApptType, PlanData } from '../db/types';

/** Versione del formato: va aumentata solo con modifiche non compatibili. */
export const PATIENT_VIEW_VERSION = 1;

export interface PatientView {
  v: typeof PATIENT_VIEW_VERSION;
  patient: { first: string; targetKg: number | null };
  /** Piano condiviso (pubblicato); null se lo studio non ne ha ancora condiviso uno. */
  plan: { version: number; since: string; data: PlanData; hasPdf: boolean } | null;
  /** Visite in ordine di data, solo con i valori che lo studio sceglie di mostrare (vedi features). */
  visits: { date: string; kg: number | null; cm: Partial<Record<Circ, number>> }[];
  nextAppointment: { date: string; time: string; type: ApptType } | null;
  studio: {
    name: string; title: string; city: string; address: string; hours: string;
    phone: string; email: string; whatsapp: string; photo: string | null;
  };
  /** Funzioni attivate dallo studio (Impostazioni → App paziente). */
  features: { checks: boolean; weight: boolean; meas: boolean; pdf: boolean; install: boolean };
  /** Consenso informato da accettare al primo accesso (se attivo nello studio e non ancora dato). */
  consent: { required: boolean; studio: string };
  /** Collegamenti forniti dal server (relativi all'origine dell'app). */
  links: { pdf: string | null };
}

export const CIRCS = ['vita', 'fianchi', 'torace', 'braccio', 'coscia'] as const;
export type Circ = (typeof CIRCS)[number];
