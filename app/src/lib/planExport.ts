// PDF di un piano salvato: raccoglie i dati del paziente (ultima visita per il peso) e lo impagina.
import * as repo from '../db/repo';
import type { Patient, Plan, Settings } from '../db/types';
import { planPdf } from './planPdf';
import { saveFile } from './platform';

export async function planPdfFor(patient: Patient, plan: Pick<Plan, 'data' | 'version'>, prof: Pick<Settings['prof'], 'name' | 'title'>): Promise<Uint8Array> {
  const visits = await repo.listVisits(patient.id);
  const last = [...visits].sort((a, b) => (a.date < b.date ? 1 : -1)).find((v) => v.kg != null) ?? null;
  return planPdf({
    plan: plan.data,
    patient: { first: patient.first, last: patient.last, sex: patient.sex, dob: patient.dob, height: patient.height },
    visit: last ? { date: last.date, kg: last.kg } : null,
    studio: { name: prof.name || 'Studio di nutrizione', title: prof.title },
    version: plan.version,
  });
}

export const planPdfName = (patient: Patient, plan: Pick<Plan, 'version'>) =>
  `Piano_${patient.last}_${patient.first}_v${plan.version}.pdf`.replace(/[^\w.\-]+/g, '_');

/** Chiede dove salvare il PDF del piano. Restituisce il percorso, o null se annullato. */
export async function savePlanPdf(patient: Patient, plan: Pick<Plan, 'data' | 'version'>, s: Settings) {
  return saveFile(planPdfName(patient, plan), await planPdfFor(patient, plan, s.prof), [{ name: 'PDF', extensions: ['pdf'] }]);
}
