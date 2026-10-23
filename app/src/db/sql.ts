// Utilità condivise dai repository: conversioni di valori e costruzione di INSERT/UPDATE da elenchi di colonne.
import type { Row, Stmt } from './driver';

/** 0/1 (o i vecchi 'true'/'false') → boolean. */
export const bool = (v: unknown) => v === 1 || v === true || v === '1' || v === 'true';

export const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function parseJson<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** Euro → centesimi interi (evita gli errori di arrotondamento dei numeri decimali). */
export const toCents = (eur: number) => Math.round(eur * 100);

/**
 * INSERT con le sole colonne indicate. I valori `undefined` diventano NULL; booleani e oggetti
 * vengono convertiti dal driver (1/0 e JSON).
 */
export function insertStmt(table: string, columns: readonly string[], values: Row): Stmt {
  return { sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, params: columns.map((c) => values[c]) };
}

/** UPDATE delle sole colonne consentite presenti in `patch`; null se non c'è nulla da aggiornare. */
export function updateStmt(table: string, allowed: readonly string[], id: number, patch: Row): Stmt | null {
  const cols = allowed.filter((c) => c in patch);
  if (!cols.length) return null;
  return { sql: `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, params: [...cols.map((c) => patch[c]), id] };
}

/** Errore leggibile per le violazioni dei vincoli del database. */
export function friendlyError(e: unknown): Error {
  const msg = String((e as any)?.message ?? e);
  if (/UNIQUE constraint failed: plans/.test(msg)) return new Error('Esiste già una bozza o una versione pubblicata per questo paziente');
  if (/UNIQUE constraint failed: payments\.invoice/.test(msg)) return new Error('Numero di fattura già usato');
  if (/CHECK constraint failed/.test(msg)) return new Error('Dati non validi: ' + msg.replace(/.*CHECK constraint failed:\s*/, ''));
  if (/FOREIGN KEY constraint failed/.test(msg)) return new Error('Il dato collegato non esiste più');
  return e instanceof Error ? e : new Error(msg);
}
