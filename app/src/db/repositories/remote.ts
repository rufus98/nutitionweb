// Stato locale della sincronizzazione con il server dell'app paziente (vedi src/lib/remote.ts).
import { db } from '../connection';
import { updateStmt } from '../sql';
import type { RemoteAccess } from '../types';

const FIELDS = ['status', 'view_hash', 'pdf_document_id', 'activation_url', 'activation_expires_at', 'last_login_at', 'synced_at', 'error'] as const;

export async function getRemoteAccess(patientId: number): Promise<RemoteAccess | null> {
  const [r] = await (await db()).query<RemoteAccess>('SELECT * FROM remote_access WHERE patient_id = ?', [patientId]);
  return r ?? null;
}

/** Pazienti con il link di accesso creato: sono quelli da tenere sincronizzati. */
export async function listRemoteAccess(): Promise<RemoteAccess[]> {
  return (await db()).query<RemoteAccess>('SELECT * FROM remote_access ORDER BY patient_id');
}

export async function saveRemoteAccess(patientId: number, patch: Partial<Omit<RemoteAccess, 'patient_id'>>) {
  const d = await db();
  await d.execute('INSERT OR IGNORE INTO remote_access (patient_id) VALUES (?)', [patientId]);
  const stmt = updateStmt('remote_access', FIELDS, patientId, patch, 'patient_id');
  if (stmt) await d.execute(stmt.sql, stmt.params);
}

export async function listRemoteDeletions(): Promise<string[]> {
  return (await (await db()).query<{ token: string }>('SELECT token FROM remote_deletions ORDER BY created_at')).map((r) => r.token);
}
export async function removeRemoteDeletion(token: string) {
  await (await db()).execute('DELETE FROM remote_deletions WHERE token = ?', [token]);
}

/**
 * Il server è passato a un altro database: i dati vanno inviati di nuovo a tutti (la sincronizzazione lo farà da sola).
 * Lo stato torna "da attivare" finché il server non dice altrimenti.
 */
export async function resetRemoteSync() {
  await (await db()).execute("UPDATE remote_access SET view_hash = NULL, pdf_document_id = NULL, synced_at = NULL, error = NULL");
}
