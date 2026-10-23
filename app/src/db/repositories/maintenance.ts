// Manutenzione: esportazione completa, svuotamento dell'archivio, controllo di integrità e statistiche.
import { db } from '../connection';
import type { Row } from '../driver';
import { currentVersion } from '../migrate';

/** Tabelle dei dati (in ordine di dipendenza: prima i "genitori"). */
export const DATA_TABLES = ['patients', 'documents', 'plans', 'visits', 'appointments', 'payments', 'settings'] as const;

/** Tutte le righe di tutte le tabelle (per l'esportazione ZIP). */
export async function dumpAll(): Promise<Record<string, Row[]>> {
  const d = await db();
  const out: Record<string, Row[]> = {};
  for (const t of DATA_TABLES) out[t] = await d.query(`SELECT * FROM ${t}`);
  out.schema_migrations = await d.query('SELECT * FROM schema_migrations');
  return out;
}

/** Svuota l'archivio clinico (pazienti e tutto ciò che li riguarda, compresi i pagamenti). Le impostazioni restano. */
export async function wipeAll() {
  await (await db()).transaction(['payments', 'appointments', 'visits', 'plans', 'documents', 'patients'].map((t) => ({ sql: `DELETE FROM ${t}` })));
}

export interface DbStats { schemaVersion: number; counts: Record<string, number>; integrity: string; documentsBytes: number }
export async function databaseStats(): Promise<DbStats> {
  const d = await db();
  const counts: Record<string, number> = {};
  for (const t of DATA_TABLES) counts[t] = Number((await d.query<{ n: number }>(`SELECT count(*) AS n FROM ${t}`))[0].n);
  const [{ integrity_check }] = await d.query<{ integrity_check: string }>('PRAGMA integrity_check');
  const [{ bytes }] = await d.query<{ bytes: number }>('SELECT coalesce(sum(size), 0) AS bytes FROM documents');
  return { schemaVersion: await currentVersion(d), counts, integrity: integrity_check, documentsBytes: Number(bytes) };
}
