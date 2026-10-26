// Costruisce i dati dell'app paziente a partire dall'archivio dello studio.
// Funzione pura (nessun accesso al database): la usa l'anteprima dell'app desktop e la userà il server
// che pubblica GET /api/p/{token}, così le due cose mostrano sempre gli stessi dati.
import type { Appointment, Hours, Patient, Plan, Settings, Visit } from '../db/types';
import { phoneDigits } from '../lib/format';
import { CIRCS, PATIENT_VIEW_VERSION, type Circ, type PatientView } from './view';

export interface ViewSource {
  patient: Patient;
  /** Versione pubblicata (condivisa) del piano, se c'è. */
  plan: Plan | null;
  visits: Visit[];
  appointments: Appointment[];
  settings: Settings;
  /** Data di oggi (AAAA-MM-GG) per scegliere il prossimo appuntamento. */
  today: string;
  /** URL del PDF originale, se il server lo pubblica. */
  pdfUrl?: string | null;
}

/** "Lun–Ven 09:00–19:00" se i giorni aperti sono consecutivi con lo stesso orario, altrimenti giorno per giorno. */
export function hoursLabel(hours: Hours[]): string {
  const open = hours.map((h, i) => ({ h, i })).filter(({ h }) => h.on && h.a);
  if (!open.length) return '';
  const span = (h: Hours) => `${h.a}–${h.d || h.b}`;
  const same = open.every(({ h }) => span(h) === span(open[0].h)) && open[open.length - 1].i - open[0].i === open.length - 1;
  if (same) return `${open[0].h.day.slice(0, 3)}${open.length > 1 ? '–' + open[open.length - 1].h.day.slice(0, 3) : ''} ${span(open[0].h)}`;
  return open.map(({ h }) => `${h.day.slice(0, 3)} ${span(h)}`).join(' · ');
}

export function buildPatientView(src: ViewSource): PatientView {
  const { patient, plan, settings: s } = src;
  const f = s.app;
  const visits = [...src.visits]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
    .map((v) => ({
      date: v.date,
      kg: f.weight ? v.kg : null,
      cm: f.meas ? Object.fromEntries(CIRCS.filter((k) => v[k] != null).map((k) => [k, v[k]!])) as Partial<Record<Circ, number>> : {},
    }));
  const next = src.appointments.filter((a) => a.date >= src.today).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1))[0];
  return {
    v: PATIENT_VIEW_VERSION,
    patient: { first: patient.first, targetKg: f.weight ? patient.target_kg : null },
    plan: plan ? { version: plan.version, since: plan.published_at ?? plan.created_at, data: plan.data, hasPdf: plan.has_pdf } : null,
    visits,
    nextAppointment: next ? { date: next.date, time: next.time, type: next.type } : null,
    studio: {
      name: s.prof.name || 'Il tuo studio',
      title: s.prof.title,
      city: s.prof.addr.split(',').pop()?.trim() ?? '',
      address: s.prof.addr,
      hours: hoursLabel(s.hours),
      phone: s.prof.phone,
      email: s.prof.email,
      whatsapp: s.prof.phone ? phoneDigits(s.prof.phone) : '',
      photo: s.photo || s.logo || null,
    },
    features: { ...f },
    consent: { required: s.priv.consent && !patient.consent_app, studio: s.prof.name || 'lo studio' },
    links: { pdf: f.pdf && plan?.has_pdf ? src.pdfUrl ?? null : null },
  };
}
