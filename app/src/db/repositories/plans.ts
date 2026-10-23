// Piani nutrizionali: versioni (bozza → pubblicata → archiviata) e PDF originali (tabella documents).
// Regole garantite dal database: al massimo una bozza e una versione pubblicata per paziente,
// numeri di versione univoci, PDF eliminato quando nessuna versione lo usa più.
import { db } from '../connection';
import type { Row, Stmt } from '../driver';
import { bool, friendlyError } from '../sql';
import { normalizePlanData } from '../planData';
import { randomToken } from './patients';
import type { Plan, PlanData } from '../types';
import { today } from '../../lib/format';

const PLAN_SELECT = `SELECT pl.id, pl.patient_id, pl.version, pl.status, pl.document_id, d.name AS pdf_name, (pl.document_id IS NOT NULL) AS has_pdf,
  pl.data, pl.created_at, pl.published_at FROM plans pl LEFT JOIN documents d ON d.id = pl.document_id`;

const toPlan = (r: Row): Plan => {
  let raw: unknown = null;
  try { raw = JSON.parse(r.data); } catch { /* documento illeggibile: piano vuoto */ }
  return {
    id: r.id, patient_id: r.patient_id, version: r.version, status: r.status, document_id: r.document_id ?? null,
    pdf_name: r.pdf_name ?? null, has_pdf: bool(r.has_pdf), data: normalizePlanData(raw), created_at: r.created_at, published_at: r.published_at ?? null,
  };
};

export async function listPlans(patientId: number): Promise<Plan[]> {
  return (await (await db()).query(`${PLAN_SELECT} WHERE pl.patient_id = ? ORDER BY pl.version DESC`, [patientId])).map(toPlan);
}

export interface PlanOverview extends Plan { name: string; phone: string; link_on: boolean; token: string | null }
/** Per ogni paziente la versione più recente non archiviata (bozza o pubblicata). */
export async function listAllPlans(): Promise<PlanOverview[]> {
  const rows = await (await db()).query(
    `${PLAN_SELECT.replace('FROM plans pl', ", p.first || ' ' || p.last AS name, p.phone, p.link_on, p.token FROM plans pl JOIN patients p ON p.id = pl.patient_id")}
     WHERE pl.status <> 'archived'
       AND pl.version = (SELECT max(version) FROM plans x WHERE x.patient_id = pl.patient_id AND x.status <> 'archived')
     ORDER BY coalesce(pl.published_at, pl.created_at) DESC`);
  return rows.map((r) => ({ ...toPlan(r), name: r.name, phone: r.phone, link_on: bool(r.link_on), token: r.token ?? null }));
}

/** PDF originale in base64. */
export async function getPlanPdf(planId: number): Promise<string | null> {
  const [r] = await (await db()).query<{ data_b64: string }>('SELECT d.data_b64 FROM plans pl JOIN documents d ON d.id = pl.document_id WHERE pl.id = ?', [planId]);
  return r?.data_b64 ?? null;
}

/** Origine del PDF della nuova bozza: un file caricato ora, oppure lo stesso PDF di una versione esistente. */
export type PlanPdf = { file: { name: string; b64: string } } | { fromPlanId: number } | null;

/**
 * Crea la bozza della versione successiva (sostituendo l'eventuale bozza esistente), in un'unica transazione.
 * Restituisce l'id della nuova versione.
 */
export async function createPlan(patientId: number, data: PlanData, pdf: PlanPdf = null): Promise<number> {
  const stmts: Stmt[] = [{ sql: "DELETE FROM plans WHERE patient_id = ? AND status = 'draft'", params: [patientId] }];
  let documentSql = 'NULL';
  const documentParams: unknown[] = [];
  if (pdf && 'file' in pdf) {
    stmts.push({ sql: 'INSERT INTO documents (name, mime, size, data_b64) VALUES (?, ?, ?, ?)', params: [pdf.file.name, 'application/pdf', Math.floor((pdf.file.b64.length * 3) / 4), pdf.file.b64] });
    documentSql = 'last_insert_rowid()';
  } else if (pdf && 'fromPlanId' in pdf) {
    documentSql = '(SELECT document_id FROM plans WHERE id = ?)';
    documentParams.push(pdf.fromPlanId);
  }
  stmts.push({
    sql: `INSERT INTO plans (patient_id, version, status, document_id, data, created_at)
          VALUES (?, (SELECT coalesce(max(version), 0) + 1 FROM plans WHERE patient_id = ?), 'draft', ${documentSql}, ?, ?)`,
    params: [patientId, patientId, ...documentParams, JSON.stringify(data), today()],
  });
  try {
    const res = await (await db()).transaction(stmts);
    return res[res.length - 1].lastInsertId;
  } catch (e) { throw friendlyError(e); }
}

export async function savePlanData(id: number, data: PlanData) {
  await (await db()).execute('UPDATE plans SET data = ? WHERE id = ?', [JSON.stringify(data), id]);
}

export async function deletePlan(id: number) {
  await (await db()).execute('DELETE FROM plans WHERE id = ?', [id]);
}

/** Pubblica la bozza: archivia la versione pubblicata precedente e attiva il link del paziente (stesso token). */
export async function publishPlan(id: number) {
  const patient = '(SELECT patient_id FROM plans WHERE id = ?)';
  await (await db()).transaction([
    { sql: `UPDATE plans SET status = 'archived' WHERE patient_id = ${patient} AND status = 'published'`, params: [id] },
    { sql: "UPDATE plans SET status = 'published', published_at = ? WHERE id = ? AND status = 'draft'", params: [today(), id] },
    { sql: `UPDATE patients SET link_on = 1, token = coalesce(token, ?) WHERE id = ${patient}`, params: [randomToken(), id] },
  ]);
}
