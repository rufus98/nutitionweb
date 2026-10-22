import { getDb, type Row } from './db';
import { migrate } from './schema';
import type { Appointment, ApptType, Patient, PatientRow, Payment, Plan, PlanData, PlanItem, Settings, Visit } from './types';
import { DEFAULT_SETTINGS } from './defaults';
import { today } from '../lib/format';

// ---------- conversioni riga ↔ oggetto ----------
const b = (v: unknown) => v === 1 || v === true || v === '1' || v === 'true';
const toPatient = (r: Row): Patient => ({
  ...(r as any),
  tags: safeJson<string[]>(r.tags, []),
  consent_privacy: b(r.consent_privacy),
  consent_app: b(r.consent_app),
  consent_marketing: b(r.consent_marketing),
  active: b(r.active),
  link_on: b(r.link_on),
});
const toPayment = (r: Row): Payment => ({ ...(r as any), paid: b(r.paid), amount: Number(r.amount) });
const toAppt = (r: Row): Appointment => ({ ...(r as any), remind: b(r.remind) });
const toPlan = (r: Row): Plan => ({ ...(r as any), has_pdf: b(r.has_pdf), data: safeJson<PlanData>(r.data, emptyPlanData()) });

function safeJson<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

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

// ---------- avvio ----------
let ready: Promise<void> | null = null;
export function init(): Promise<void> {
  if (!ready) ready = (async () => { await migrate(await getDb()); })();
  return ready;
}
async function db() {
  await init();
  return getDb();
}

export const randomToken = (n = 8) => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (x) => a[x % a.length]).join('');
};

// ---------- pazienti ----------
export type NewPatient = Omit<Patient, 'id' | 'code' | 'created_at' | 'token' | 'link_on' | 'active'> & { active?: boolean; created_at?: string };

const PATIENT_ROW_SQL = `
  SELECT p.*,
    (SELECT max(date) FROM visits v WHERE v.patient_id = p.id) AS last_visit,
    (SELECT min(date) FROM appointments a WHERE a.patient_id = p.id AND a.date >= ?) AS next_visit,
    (SELECT kg FROM visits v WHERE v.patient_id = p.id AND kg IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1) AS kg,
    (SELECT kg FROM visits v WHERE v.patient_id = p.id AND kg IS NOT NULL ORDER BY date ASC, id ASC LIMIT 1) AS kg_start,
    (SELECT status FROM plans pl WHERE pl.patient_id = p.id AND pl.status != 'archived' ORDER BY version DESC LIMIT 1) AS plan_status,
    (SELECT coalesce(sum(amount), 0) FROM payments y WHERE y.patient_id = p.id AND y.paid = 0) AS due
  FROM patients p`;

const toPatientRow = (r: Row): PatientRow => {
  const p = toPatient(r);
  const plan = r.plan_status === 'published' ? (p.link_on ? 'on' : 'off') : r.plan_status === 'draft' ? 'draft' : 'none';
  return { ...p, last_visit: r.last_visit ?? null, next_visit: r.next_visit ?? null, kg: r.kg ?? null, kg_start: r.kg_start ?? null, plan, due: Number(r.due ?? 0) };
};

export async function listPatients(): Promise<PatientRow[]> {
  const rows = await (await db()).select(PATIENT_ROW_SQL + ' ORDER BY p.last, p.first', [today()]);
  return rows.map(toPatientRow);
}
export async function getPatientRow(id: number): Promise<PatientRow | null> {
  const rows = await (await db()).select(PATIENT_ROW_SQL + ' WHERE p.id = ?', [today(), id]);
  return rows[0] ? toPatientRow(rows[0]) : null;
}
export async function patientCount(): Promise<number> {
  const [r] = await (await db()).select<{ n: number }>('SELECT count(*) AS n FROM patients');
  return Number(r?.n ?? 0);
}
export async function nextPatientCode(): Promise<string> {
  const [r] = await (await db()).select<{ n: number | null }>("SELECT max(CAST(substr(code, 4) AS INTEGER)) AS n FROM patients");
  return 'PZ-' + String((r?.n ?? 400) + 1).padStart(4, '0');
}

const P_COLS = ['first', 'last', 'phone', 'email', 'dob', 'birthplace', 'cf', 'job', 'sex', 'contact', 'tags', 'drugs', 'activity', 'notes', 'height', 'goal', 'target_kg', 'source', 'consent_privacy', 'consent_app', 'consent_marketing', 'active'] as const;
const pVal = (p: any, k: string) => (k === 'tags' ? JSON.stringify(p.tags ?? []) : k === 'active' ? (p.active ?? true) : p[k] ?? null);

export async function createPatient(p: NewPatient): Promise<Patient> {
  const d = await db();
  const code = await nextPatientCode();
  const cols = [...P_COLS, 'code', 'token', 'link_on', 'created_at'];
  const vals = [...P_COLS.map((k) => pVal(p, k)), code, randomToken(), p.consent_app ? 1 : 0, p.created_at ?? today()];
  const r = await d.execute(`INSERT INTO patients (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals);
  return (await getPatient(r.lastInsertId))!;
}
export async function updatePatient(id: number, p: Partial<Patient>) {
  const keys = Object.keys(p).filter((k) => (P_COLS as readonly string[]).includes(k) || k === 'link_on' || k === 'token');
  if (!keys.length) return;
  await (await db()).execute(`UPDATE patients SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, [...keys.map((k) => pVal(p, k)), id]);
}
export async function getPatient(id: number): Promise<Patient | null> {
  const rows = await (await db()).select('SELECT * FROM patients WHERE id = ?', [id]);
  return rows[0] ? toPatient(rows[0]) : null;
}
export async function deletePatient(id: number) {
  const d = await db();
  // Cancellazione esplicita: con il pool di connessioni del plugin SQL il PRAGMA foreign_keys non vale per tutte le connessioni.
  for (const t of ['visits', 'payments', 'appointments', 'plans']) await d.execute(`DELETE FROM ${t} WHERE patient_id = ?`, [id]);
  await d.execute('DELETE FROM patients WHERE id = ?', [id]);
}
export async function revokeAllLinks() {
  return (await (await db()).execute('UPDATE patients SET link_on = 0 WHERE link_on = 1')).rowsAffected;
}

// ---------- visite ----------
export type NewVisit = Omit<Visit, 'id'>;
const V_COLS = ['patient_id', 'date', 'type', 'kg', 'fat', 'vita', 'fianchi', 'torace', 'braccio', 'coscia', 'polso', 'note', 'goal'] as const;
export async function listVisits(patientId: number): Promise<Visit[]> {
  return (await db()).select<Visit>('SELECT * FROM visits WHERE patient_id = ? ORDER BY date ASC, id ASC', [patientId]);
}
export async function addVisit(v: NewVisit) {
  return (await db()).execute(`INSERT INTO visits (${V_COLS.join(',')}) VALUES (${V_COLS.map(() => '?').join(',')})`, V_COLS.map((k) => (v as any)[k] ?? null));
}
export async function updateVisit(id: number, v: Partial<NewVisit>) {
  const keys = Object.keys(v).filter((k) => (V_COLS as readonly string[]).includes(k) && k !== 'patient_id');
  if (!keys.length) return;
  await (await db()).execute(`UPDATE visits SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, [...keys.map((k) => (v as any)[k] ?? null), id]);
}
export async function deleteVisit(id: number) {
  await (await db()).execute('DELETE FROM visits WHERE id = ?', [id]);
}

// ---------- pagamenti ----------
export async function listPayments(patientId?: number): Promise<Payment[]> {
  const sql = `SELECT y.*, p.first || ' ' || p.last AS name, p.phone AS phone FROM payments y JOIN patients p ON p.id = y.patient_id
    ${patientId ? 'WHERE y.patient_id = ?' : ''} ORDER BY y.date DESC, y.id DESC`;
  return (await (await db()).select(sql, patientId ? [patientId] : [])).map(toPayment);
}
/** Prossimo numero fattura dell'anno: 'FT 213/26'. */
export async function nextInvoice(date = today()): Promise<string> {
  const yy = date.slice(2, 4);
  const rows = await (await db()).select<{ invoice: string }>("SELECT invoice FROM payments WHERE invoice LIKE ?", [`FT %/${yy}`]);
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.invoice.slice(3)) || 0), 0);
  const min = date.slice(0, 4) === today().slice(0, 4) ? (await getSettings()).bill.invoiceMin || 1 : 1;
  return `FT ${Math.max(max + 1, min)}/${yy}`;
}
export async function addPayment(p: Omit<Payment, 'id' | 'invoice'> & { invoice?: string | null }) {
  const invoice = p.invoice !== undefined ? p.invoice : p.paid ? await nextInvoice(p.date) : null;
  await (await db()).execute('INSERT INTO payments (patient_id, date, description, method, amount, paid, invoice) VALUES (?,?,?,?,?,?,?)',
    [p.patient_id, p.date, p.description, p.method, p.amount, p.paid ? 1 : 0, invoice]);
  return invoice;
}
export async function markPaid(id: number): Promise<string> {
  const d = await db();
  const [row] = await d.select<{ invoice: string | null }>('SELECT invoice FROM payments WHERE id = ?', [id]);
  const inv = row?.invoice || (await nextInvoice());
  await d.execute('UPDATE payments SET paid = 1, invoice = ? WHERE id = ?', [inv, id]);
  return inv;
}
export async function deletePayment(id: number) {
  await (await db()).execute('DELETE FROM payments WHERE id = ?', [id]);
}

// ---------- agenda ----------
export const APPT_TYPES: Record<ApptType, [string, number]> = { prima: ['Prima visita', 60], controllo: ['Controllo', 30], online: ['Online', 30] };
export async function listAppointments(from: string, to: string): Promise<Appointment[]> {
  const rows = await (await db()).select(
    `SELECT a.*, p.first || ' ' || p.last AS name, p.phone AS phone, p.goal AS goal FROM appointments a JOIN patients p ON p.id = a.patient_id
     WHERE a.date >= ? AND a.date <= ? ORDER BY a.date, a.time`, [from, to]);
  return rows.map(toAppt);
}
export async function patientAppointments(patientId: number): Promise<Appointment[]> {
  return (await (await db()).select('SELECT * FROM appointments WHERE patient_id = ? ORDER BY date, time', [patientId])).map(toAppt);
}
export async function addAppointment(a: Omit<Appointment, 'id'>) {
  return (await (await db()).execute('INSERT INTO appointments (patient_id, date, time, type, duration, remind, note) VALUES (?,?,?,?,?,?,?)',
    [a.patient_id, a.date, a.time, a.type, a.duration, a.remind ? 1 : 0, a.note ?? null])).lastInsertId;
}
export async function updateAppointment(id: number, a: Omit<Appointment, 'id'>) {
  await (await db()).execute('UPDATE appointments SET patient_id = ?, date = ?, time = ?, type = ?, duration = ?, remind = ?, note = ? WHERE id = ?',
    [a.patient_id, a.date, a.time, a.type, a.duration, a.remind ? 1 : 0, a.note ?? null, id]);
}
export async function deleteAppointment(id: number) {
  await (await db()).execute('DELETE FROM appointments WHERE id = ?', [id]);
}

// ---------- piani nutrizionali ----------
const PLAN_COLS = 'id, patient_id, version, status, pdf_name, (pdf_b64 IS NOT NULL) AS has_pdf, data, created_at, published_at';
export async function listPlans(patientId: number): Promise<Plan[]> {
  return (await (await db()).select(`SELECT ${PLAN_COLS} FROM plans WHERE patient_id = ? ORDER BY version DESC`, [patientId])).map(toPlan);
}
export interface PlanOverview extends Plan { name: string; phone: string; link_on: boolean; token: string | null }
export async function listAllPlans(): Promise<PlanOverview[]> {
  const rows = await (await db()).select(
    `SELECT pl.id, pl.patient_id, pl.version, pl.status, pl.pdf_name, (pl.pdf_b64 IS NOT NULL) AS has_pdf, pl.data, pl.created_at, pl.published_at,
       p.first || ' ' || p.last AS name, p.phone AS phone, p.link_on AS link_on, p.token AS token
     FROM plans pl JOIN patients p ON p.id = pl.patient_id
     WHERE pl.status != 'archived' AND pl.version = (SELECT max(version) FROM plans x WHERE x.patient_id = pl.patient_id AND x.status != 'archived')
     ORDER BY coalesce(pl.published_at, pl.created_at) DESC`);
  return rows.map((r) => ({ ...toPlan(r), name: r.name, phone: r.phone, link_on: b(r.link_on), token: r.token }));
}
export async function getPlanPdf(id: number): Promise<string | null> {
  const [r] = await (await db()).select<{ pdf_b64: string | null }>('SELECT pdf_b64 FROM plans WHERE id = ?', [id]);
  return r?.pdf_b64 ?? null;
}
/** Crea una nuova bozza (versione successiva). */
export async function createPlan(patientId: number, data: PlanData, pdfName: string | null, pdfB64: string | null): Promise<number> {
  const d = await db();
  const [r] = await d.select<{ v: number | null }>('SELECT max(version) AS v FROM plans WHERE patient_id = ?', [patientId]);
  // Una sola bozza alla volta per paziente.
  await d.execute("DELETE FROM plans WHERE patient_id = ? AND status = 'draft'", [patientId]);
  const res = await d.execute('INSERT INTO plans (patient_id, version, status, pdf_name, pdf_b64, data, created_at) VALUES (?,?,?,?,?,?,?)',
    [patientId, (r?.v ?? 0) + 1, 'draft', pdfName, pdfB64, JSON.stringify(data), today()]);
  return res.lastInsertId;
}
export async function savePlanData(id: number, data: PlanData) {
  await (await db()).execute('UPDATE plans SET data = ? WHERE id = ?', [JSON.stringify(data), id]);
}
export async function deletePlan(id: number) {
  await (await db()).execute('DELETE FROM plans WHERE id = ?', [id]);
}
/** Pubblica la bozza: la versione pubblicata precedente viene archiviata, il token del paziente resta lo stesso. */
export async function publishPlan(id: number) {
  const d = await db();
  const [p] = await d.select<{ patient_id: number }>('SELECT patient_id FROM plans WHERE id = ?', [id]);
  if (!p) return;
  await d.execute("UPDATE plans SET status = 'archived' WHERE patient_id = ? AND status = 'published'", [p.patient_id]);
  await d.execute("UPDATE plans SET status = 'published', published_at = ? WHERE id = ?", [today(), id]);
  await d.execute('UPDATE patients SET link_on = 1, token = coalesce(token, ?) WHERE id = ?', [randomToken(), p.patient_id]);
}

// ---------- impostazioni ----------
export async function getSettings(): Promise<Settings> {
  const rows = await (await db()).select<{ value: string }>("SELECT value FROM settings WHERE key = 'main'");
  const saved = safeJson<Partial<Settings>>(rows[0]?.value, {});
  return deepMerge(structuredClone(DEFAULT_SETTINGS), saved);
}
export async function saveSettings(s: Settings) {
  await (await db()).execute("INSERT INTO settings (key, value) VALUES ('main', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify(s)]);
}
export async function getFlag(key: string): Promise<string | null> {
  const rows = await (await db()).select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return rows[0]?.value ?? null;
}
export async function setFlag(key: string, value: string) {
  await (await db()).execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}
function deepMerge<T>(base: T, over: any): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return (over ?? base) as T;
  for (const k of Object.keys(over)) {
    const bv = (base as any)[k];
    (base as any)[k] = bv && typeof bv === 'object' && !Array.isArray(bv) ? deepMerge(bv, over[k]) : over[k];
  }
  return base;
}

// ---------- esportazione / svuotamento ----------
export async function dumpAll() {
  const d = await db();
  const out: Record<string, Row[]> = {};
  for (const t of ['patients', 'visits', 'payments', 'appointments', 'plans', 'settings']) out[t] = await d.select(`SELECT * FROM ${t}`);
  return out;
}
export async function wipeAll() {
  const d = await db();
  for (const t of ['visits', 'payments', 'appointments', 'plans', 'patients']) await d.execute(`DELETE FROM ${t}`);
}
