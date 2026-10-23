// Pazienti: anagrafica, consensi, link dell'app paziente.
import { db } from '../connection';
import type { Row } from '../driver';
import { bool, insertStmt, num, parseJson, updateStmt } from '../sql';
import type { Patient, PatientRow } from '../types';
import { today } from '../../lib/format';

/** Colonne modificabili dall'interfaccia (tutto tranne id, codice, date tecniche). */
export const PATIENT_FIELDS = ['first', 'last', 'phone', 'email', 'dob', 'birthplace', 'cf', 'job', 'sex', 'contact', 'tags', 'drugs', 'activity', 'notes',
  'height', 'goal', 'target_kg', 'source', 'consent_privacy', 'consent_app', 'consent_marketing', 'active', 'token', 'link_on'] as const;

export type NewPatient = Omit<Patient, 'id' | 'code' | 'created_at' | 'token' | 'link_on' | 'active'> & { active?: boolean; created_at?: string };

export const randomToken = (n = 8) => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (x) => a[x % a.length]).join('');
};

export const toPatient = (r: Row): Patient => ({
  id: r.id, code: r.code, first: r.first, last: r.last, phone: r.phone, email: r.email ?? null, dob: r.dob ?? null,
  birthplace: r.birthplace ?? null, cf: r.cf ?? null, job: r.job ?? null, sex: r.sex, contact: r.contact,
  tags: parseJson<string[]>(r.tags, []), drugs: r.drugs ?? null, activity: r.activity ?? null, notes: r.notes ?? null,
  height: num(r.height), goal: r.goal ?? null, target_kg: num(r.target_kg), source: r.source ?? null,
  consent_privacy: bool(r.consent_privacy), consent_app: bool(r.consent_app), consent_marketing: bool(r.consent_marketing),
  active: bool(r.active), token: r.token ?? null, link_on: bool(r.link_on), created_at: r.created_at,
});

const toPatientRow = (r: Row): PatientRow => {
  const p = toPatient(r);
  const plan = r.plan_status === 'published' ? (p.link_on ? 'on' : 'off') : r.plan_status === 'draft' ? 'draft' : 'none';
  return { ...p, last_visit: r.last_visit ?? null, next_visit: r.next_visit ?? null, kg: num(r.kg), kg_start: num(r.kg_start), plan, due: Number(r.due ?? 0) };
};

export async function listPatients(): Promise<PatientRow[]> {
  return (await (await db()).query('SELECT * FROM patient_summary ORDER BY last COLLATE NOCASE, first COLLATE NOCASE')).map(toPatientRow);
}
export async function getPatientRow(id: number): Promise<PatientRow | null> {
  const [r] = await (await db()).query('SELECT * FROM patient_summary WHERE id = ?', [id]);
  return r ? toPatientRow(r) : null;
}
export async function getPatient(id: number): Promise<Patient | null> {
  const [r] = await (await db()).query('SELECT * FROM patients WHERE id = ?', [id]);
  return r ? toPatient(r) : null;
}
export async function patientCount(): Promise<number> {
  const [r] = await (await db()).query<{ n: number }>('SELECT count(*) AS n FROM patients');
  return Number(r?.n ?? 0);
}

/** Crea la scheda: il codice PZ-NNNN progressivo è calcolato nella stessa istruzione (nessun doppione). */
export async function createPatient(p: NewPatient): Promise<Patient> {
  const values: Row = { ...p, tags: p.tags ?? [], active: p.active ?? true, token: randomToken(), link_on: p.consent_app, created_at: p.created_at ?? today() };
  const cols = [...PATIENT_FIELDS, 'created_at'];
  const ins = insertStmt('patients', cols, values);
  const sql = ins.sql.replace('INSERT INTO patients (', 'INSERT INTO patients (code, ')
    .replace('VALUES (', "VALUES ((SELECT 'PZ-' || printf('%04d', coalesce(max(CAST(substr(code, 4) AS INTEGER)), 400) + 1) FROM patients), ");
  const r = await (await db()).execute(sql, ins.params);
  return (await getPatient(r.lastInsertId))!;
}

export async function updatePatient(id: number, patch: Partial<Patient>) {
  const st = updateStmt('patients', PATIENT_FIELDS, id, patch);
  if (st) await (await db()).execute(st.sql, st.params);
}

/** Elimina la scheda con visite, agenda e piani (chiavi esterne ON DELETE CASCADE).
 *  I pagamenti restano nel registro fiscale con il nome registrato. */
export async function deletePatient(id: number) {
  await (await db()).execute('DELETE FROM patients WHERE id = ?', [id]);
}

export async function revokeAllLinks(): Promise<number> {
  return (await (await db()).execute('UPDATE patients SET link_on = 0 WHERE link_on = 1')).rowsAffected;
}
