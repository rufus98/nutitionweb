// Visite: data, tipo, peso, composizione corporea, circonferenze, note e obiettivi.
import { db } from '../connection';
import type { Row } from '../driver';
import { insertStmt, num, updateStmt } from '../sql';
import type { Visit } from '../types';

export const VISIT_FIELDS = ['date', 'type', 'kg', 'fat', 'vita', 'fianchi', 'torace', 'braccio', 'coscia', 'polso', 'note', 'goal'] as const;
export type NewVisit = Omit<Visit, 'id'>;

const toVisit = (r: Row): Visit => ({
  id: r.id, patient_id: r.patient_id, date: r.date, type: r.type, kg: num(r.kg), fat: num(r.fat), vita: num(r.vita), fianchi: num(r.fianchi),
  torace: num(r.torace), braccio: num(r.braccio), coscia: num(r.coscia), polso: num(r.polso), note: r.note ?? null, goal: r.goal ?? null,
});

export async function listVisits(patientId: number): Promise<Visit[]> {
  return (await (await db()).query('SELECT * FROM visits WHERE patient_id = ? ORDER BY date, id', [patientId])).map(toVisit);
}
export async function addVisit(v: NewVisit): Promise<number> {
  const st = insertStmt('visits', ['patient_id', ...VISIT_FIELDS], v);
  return (await (await db()).execute(st.sql, st.params)).lastInsertId;
}
export async function updateVisit(id: number, patch: Partial<NewVisit>) {
  const st = updateStmt('visits', VISIT_FIELDS, id, patch);
  if (st) await (await db()).execute(st.sql, st.params);
}
export async function deleteVisit(id: number) {
  await (await db()).execute('DELETE FROM visits WHERE id = ?', [id]);
}
