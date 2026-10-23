// Agenda: appuntamenti con tipo, durata e promemoria WhatsApp.
import { db } from '../connection';
import type { Row } from '../driver';
import { bool } from '../sql';
import type { Appointment, ApptType } from '../types';

/** Etichetta e durata predefinita per tipo (la durata effettiva è in Impostazioni → Orari). */
export const APPT_TYPES: Record<ApptType, [string, number]> = { prima: ['Prima visita', 60], controllo: ['Controllo', 30], online: ['Online', 30] };

export type NewAppointment = Omit<Appointment, 'id' | 'name' | 'phone' | 'goal' | 'reminder_sent_at'>;

const toAppt = (r: Row): Appointment => ({
  id: r.id, patient_id: r.patient_id, date: r.date, time: r.time, type: r.type, duration: Number(r.duration),
  remind: bool(r.remind), reminder_sent_at: r.reminder_sent_at ?? null, note: r.note ?? null,
  ...(r.name !== undefined ? { name: r.name, phone: r.phone, goal: r.goal ?? null } : {}),
});

export async function listAppointments(from: string, to: string): Promise<Appointment[]> {
  return (await (await db()).query(
    `SELECT a.*, p.first || ' ' || p.last AS name, p.phone, p.goal FROM appointments a JOIN patients p ON p.id = a.patient_id
     WHERE a.date BETWEEN ? AND ? ORDER BY a.date, a.time`, [from, to])).map(toAppt);
}
export async function patientAppointments(patientId: number): Promise<Appointment[]> {
  return (await (await db()).query('SELECT * FROM appointments WHERE patient_id = ? ORDER BY date, time', [patientId])).map(toAppt);
}
export async function addAppointment(a: NewAppointment): Promise<number> {
  return (await (await db()).execute('INSERT INTO appointments (patient_id, date, time, type, duration, remind, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [a.patient_id, a.date, a.time, a.type, a.duration, a.remind, a.note])).lastInsertId;
}
/** Spostare un appuntamento azzera il promemoria già inviato. */
export async function updateAppointment(id: number, a: NewAppointment) {
  await (await db()).execute(
    `UPDATE appointments SET patient_id = ?, date = ?, time = ?, type = ?, duration = ?, remind = ?, note = ?,
       reminder_sent_at = CASE WHEN date = ? AND time = ? THEN reminder_sent_at END
     WHERE id = ?`, [a.patient_id, a.date, a.time, a.type, a.duration, a.remind, a.note, a.date, a.time, id]);
}
export async function deleteAppointment(id: number) {
  await (await db()).execute('DELETE FROM appointments WHERE id = ?', [id]);
}
export async function markReminderSent(id: number) {
  await (await db()).execute("UPDATE appointments SET reminder_sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [id]);
}
