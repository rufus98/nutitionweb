// Pagamenti e fatture. Gli importi sono salvati in centesimi; la numerazione delle fatture è per anno
// (invoice_year + invoice_number, univoci) e viene assegnata nella stessa istruzione che salda il pagamento.
import { db } from '../connection';
import type { Row } from '../driver';
import { bool, toCents } from '../sql';
import type { Payment } from '../types';
import { today } from '../../lib/format';
import { getSettings } from './settings';

export const formatInvoice = (year: number, n: number) => `FT ${n}/${String(year).slice(2)}`;

const toPayment = (r: Row): Payment => ({
  id: r.id, patient_id: r.patient_id ?? null, date: r.date, description: r.description, method: r.method,
  amount: Number(r.amount), paid: bool(r.paid), paid_at: r.paid_at ?? null,
  invoice_year: r.invoice_year ?? null, invoice_number: r.invoice_number ?? null, invoice: r.invoice ?? null,
  name: r.name, cf: r.cf ?? null, phone: r.phone ?? null,
});

export async function listPayments(patientId?: number): Promise<Payment[]> {
  const where = patientId ? 'WHERE patient_id = ?' : '';
  return (await (await db()).query(`SELECT * FROM payments_view ${where} ORDER BY date DESC, id DESC`, patientId ? [patientId] : [])).map(toPayment);
}
export async function getPayment(id: number): Promise<Payment | null> {
  const [r] = await (await db()).query('SELECT * FROM payments_view WHERE id = ?', [id]);
  return r ? toPayment(r) : null;
}

/** Numero minimo impostato in Impostazioni → Fatturazione (vale solo per l'anno in corso). */
async function minNumber(year: number) {
  return year === +today().slice(0, 4) ? Math.max(1, (await getSettings()).bill.invoiceMin || 1) : 1;
}
/** Sottoquery: prossimo numero libero dell'anno (parametri: anno, minimo). */
const NEXT_NUMBER = '(SELECT max(coalesce(max(invoice_number), 0) + 1, ?) FROM payments WHERE invoice_year = ?)';

/** Prossimo numero fattura dell'anno, per la visualizzazione: "FT 213/26". */
export async function nextInvoice(date = today()): Promise<string> {
  const year = +date.slice(0, 4);
  const [r] = await (await db()).query<{ n: number }>(`SELECT ${NEXT_NUMBER} AS n`, [await minNumber(year), year]);
  return formatInvoice(year, Number(r.n));
}

export interface NewPayment {
  patient_id: number;
  date: string;
  description: string;
  method: string;
  amount: number;
  paid: boolean;
  /** solo per importazioni/dati demo: numero fattura già assegnato */
  invoice?: { year: number; number: number } | null;
}

/** Registra un pagamento. Se è saldato riceve subito il numero di fattura; restituisce "FT n/aa" o null. */
export async function addPayment(p: NewPayment): Promise<string | null> {
  const d = await db();
  const year = +p.date.slice(0, 4);
  const invoice = p.paid ? (p.invoice ?? null) : null;
  const numberSql = !p.paid ? 'NULL' : invoice ? '?' : NEXT_NUMBER;
  const numberParams = !p.paid ? [] : invoice ? [invoice.number] : [await minNumber(year), year];
  const r = await d.execute(
    `INSERT INTO payments (patient_id, patient_name, patient_cf, date, description, method, amount_cents, paid, paid_at, invoice_year, invoice_number)
     SELECT id, first || ' ' || last, cf, ?, ?, ?, ?, ?, ?, ?, ${numberSql} FROM patients WHERE id = ?`,
    [p.date, p.description, p.method, toCents(p.amount), p.paid, p.paid ? p.date : null, p.paid ? (invoice?.year ?? year) : null, ...numberParams, p.patient_id],
  );
  if (!r.rowsAffected) throw new Error('Paziente non trovato');
  return (await getPayment(r.lastInsertId))?.invoice ?? null;
}

/** Segna come saldato e assegna il numero di fattura dell'anno in corso (se non ne ha già uno). */
export async function markPaid(id: number): Promise<string> {
  const date = today(), year = +date.slice(0, 4);
  await (await db()).execute(
    `UPDATE payments SET paid = 1, paid_at = coalesce(paid_at, ?),
       invoice_year = coalesce(invoice_year, ?), invoice_number = coalesce(invoice_number, ${NEXT_NUMBER})
     WHERE id = ?`, [date, year, await minNumber(year), year, id]);
  return (await getPayment(id))?.invoice ?? '';
}

/** Elimina un pagamento non ancora fatturato (le fatture emesse non si cancellano). */
export async function deletePayment(id: number) {
  const r = await (await db()).execute('DELETE FROM payments WHERE id = ? AND invoice_number IS NULL', [id]);
  if (!r.rowsAffected) throw new Error('Una fattura emessa non può essere eliminata');
}
