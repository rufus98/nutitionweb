// Collegamento con il server dell'app paziente (cartella server/ del repository).
//
// Flusso: il nutrizionista crea la scheda → "Crea link di accesso" → l'app invia al server email, nome e l'oggetto
// con tutti i dati della dieta (PatientView) → il server crea il link di attivazione → il paziente lo apre, sceglie
// la password (salvata dal server solo come hash) e da lì accede con il suo link e la password.
// Dopo, ogni modifica (piano condiviso, visite, appuntamenti, impostazioni) viene inviata in automatico.
//
// Due modi: direttamente nel database MySQL (modalità attuale, remoteDb.ts) oppure tramite un server dello studio con chiave (non più configurabile dall'app).
import * as repo from '../db/repo';
import type { Patient, RemoteAccess, Settings } from '../db/types';
import { buildPatientView } from '../patientApp/buildView';
import { today } from './format';
import * as rdb from './remoteDb';

/**
 * Dove l'app desktop scrive i dati dei pazienti: direttamente nel database MySQL (`db`, senza server dello studio e senza chiavi),
 * oppure tramite un server dello studio (`url` + `key`, vedi server/).
 */
export interface RemoteConfig { url: string; key: string; db?: rdb.DbConn; /** Indirizzo della web app dei pazienti, per i link di attivazione (solo con `db`). */ origin?: string }

/** Collegamento configurato in Impostazioni → Amministrazione, oppure null. Il database diretto ha la precedenza. */
export function remoteConfig(s: Settings | null | undefined): RemoteConfig | null {
  const db = s?.remote?.db;
  if (db?.host && db.user && db.database) return { url: '', key: '', db: { ...db, ca: db.ca?.trim() || undefined }, origin: `https://${(s!.appDomain ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '')}` };
  const url = s?.remote?.url.trim().replace(/\/+$/, '');
  const key = s?.remote?.key.trim();
  return url && key ? { url, key } : null;
}

export class RemoteError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

/** Le stesse operazioni del server, eseguite direttamente sul database. */
async function direct<T>(cfg: RemoteConfig, method: string, path: string, body?: any): Promise<T> {
  const db = cfg.db!;
  const m = /^\/api\/studio\/access\/([^/]+)(\/activation|\/pdf)?$/.exec(path);
  try {
    if (path === '/api/studio/ping') return { ok: true, viewVersion: 1, db: await rdb.testConn(db) } as T;
    if (!m) throw new Error(`Operazione non supportata: ${method} ${path}`);
    const [, token, sub] = m;
    if (method === 'PUT' && !sub) return await rdb.upsertAccess(db, token, body) as T;
    if (method === 'POST' && sub === '/activation') return await rdb.createActivation(db, token, cfg.origin ?? '') as T;
    if (method === 'PUT' && sub === '/pdf') return await rdb.setPdf(db, token, body) as T;
    if (method === 'GET' && !sub) return await rdb.getAccess(db, token) as T;
    if (method === 'DELETE' && !sub) { await rdb.deleteAccess(db, token); return undefined as T; }
    throw new Error(`Operazione non supportata: ${method} ${path}`);
  } catch (e: any) {
    throw new RemoteError(e instanceof RemoteError ? e.message : rdb.dbErrorText(e).replace(/^Database: /, ''), e?.status ?? 0);
  }
}

async function call<T>(cfg: RemoteConfig, method: string, path: string, body?: unknown): Promise<T> {
  if (cfg.db) return direct<T>(cfg, method, path, body);
  let res: Response;
  try {
    res = await fetch(cfg.url + path, {
      method,
      headers: { Authorization: `Bearer ${cfg.key}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new RemoteError(`Server non raggiungibile (${new URL(cfg.url).host}): controlla la connessione e l'indirizzo`);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = res.status === 401 ? 'Chiave dello studio non valida' : data?.error ?? `Errore del server (${res.status})`;
    throw new RemoteError(msg, res.status);
  }
  return data as T;
}

/** Stato dell'accesso restituito dal server. */
interface Summary { status: RemoteAccess['status']; hasPassword: boolean; activationPending: boolean; activationExpiresAt: string | null; lastLoginAt: string | null; consentAt: string | null; hasPdf: boolean }

export async function ping(cfg: RemoteConfig) {
  const r = await call<{ ok: boolean; viewVersion: number; db: string }>(cfg, 'GET', '/api/studio/ping');
  if (r.viewVersion !== 1) throw new RemoteError(`Versione del server non compatibile (dati v${r.viewVersion}): aggiorna l'app o il server`);
  return r;
}

const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Motivo per cui non si può creare l'accesso per questo paziente, oppure null. */
export function accessProblem(p: Pick<Patient, 'email' | 'token'>): string | null {
  if (!p.email?.trim()) return "Aggiungi l'email del paziente nella scheda (Modifica dati)";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email.trim())) return "L'email del paziente non è valida";
  if (!p.token) return 'Il paziente non ha ancora un link personale';
  return null;
}

/**
 * Invia al server i dati attuali del paziente (solo se cambiati dall'ultimo invio, salvo `force`).
 * Restituisce lo stato aggiornato. Gli errori vengono anche annotati in remote_access.error.
 */
export async function pushPatient(cfg: RemoteConfig, patientId: number, opts: { force?: boolean } = {}): Promise<RemoteAccess> {
  const [patient, settings, plans, visits, appointments, state] = await Promise.all([
    repo.getPatient(patientId), repo.getSettings(), repo.listPlans(patientId), repo.listVisits(patientId), repo.patientAppointments(patientId), repo.getRemoteAccess(patientId),
  ]);
  if (!patient) throw new RemoteError('Paziente non trovato');
  const problem = accessProblem(patient);
  if (problem) { await repo.saveRemoteAccess(patientId, { error: problem }); throw new RemoteError(problem); }
  // Solo la versione pubblicata ("Condividi"): bozze e piani salvati restano nello studio.
  const plan = plans.find((x) => x.status === 'published') ?? null;
  const view = buildPatientView({ patient, plan, visits, appointments, settings, today: today() });
  const body = { email: patient.email!.trim(), firstName: patient.first, view, active: patient.link_on, logAccess: settings.priv.log };
  const hash = await sha256(JSON.stringify(body));
  try {
    let summary: Summary | null = null;
    if (opts.force || hash !== state?.view_hash) summary = await call<Summary>(cfg, 'PUT', `/api/studio/access/${patient.token}`, body);
    // PDF originale del piano: si carica quando cambia, si toglie se il piano non ne ha.
    const docId = plan?.has_pdf ? plan.document_id : null;
    if (opts.force || docId !== (state?.pdf_document_id ?? null)) {
      const b64 = plan && docId ? await repo.getPlanPdf(plan.id) : null;
      summary = await call<Summary>(cfg, 'PUT', `/api/studio/access/${patient.token}/pdf`, b64 ? { name: plan!.pdf_name ?? 'piano.pdf', b64 } : null);
    }
    if (!summary && opts.force) summary = await call<Summary>(cfg, 'GET', `/api/studio/access/${patient.token}`);
    // Consenso dato dal paziente nella web app: si annota anche nella scheda.
    if (summary?.consentAt && !patient.consent_app) await repo.updatePatient(patientId, { consent_app: true });
    await repo.saveRemoteAccess(patientId, {
      view_hash: hash, pdf_document_id: docId, synced_at: new Date().toISOString(), error: null,
      ...(summary ? { status: summary.status, last_login_at: summary.lastLoginAt, ...(summary.activationPending ? {} : { activation_url: null, activation_expires_at: null }) } : {}),
    });
  } catch (e: any) {
    await repo.saveRemoteAccess(patientId, { error: e?.message ?? String(e) });
    throw e;
  }
  return (await repo.getRemoteAccess(patientId))!;
}

/**
 * "Crea link di accesso" (o "Nuovo link di attivazione" se il paziente ha dimenticato la password):
 * attiva il link, invia i dati e chiede al server un link di attivazione valido 7 giorni.
 */
export async function createAccessLink(cfg: RemoteConfig, patientId: number): Promise<{ url: string; expiresAt: string }> {
  const patient = await repo.getPatient(patientId);
  if (!patient) throw new RemoteError('Paziente non trovato');
  const problem = accessProblem(patient);
  if (problem) throw new RemoteError(problem);
  if (!patient.link_on) await repo.updatePatient(patientId, { link_on: true });
  await pushPatient(cfg, patientId, { force: true });
  const r = await call<{ activationUrl: string; expiresAt: string }>(cfg, 'POST', `/api/studio/access/${patient.token}/activation`);
  await repo.saveRemoteAccess(patientId, { activation_url: r.activationUrl, activation_expires_at: r.expiresAt });
  return { url: r.activationUrl, expiresAt: r.expiresAt };
}

/** Disattiva o riattiva l'accesso: con il link disattivato il paziente vede "Link disattivato" e le sessioni si chiudono. */
export async function setAccessEnabled(cfg: RemoteConfig, patientId: number, on: boolean) {
  await repo.updatePatient(patientId, { link_on: on });
  return pushPatient(cfg, patientId, { force: true });
}

/** Stato dal server (ultimo accesso, registro). */
export async function accessStatus(cfg: RemoteConfig, token: string) {
  return call<Summary & { log: { event: string; at: string }[] }>(cfg, 'GET', `/api/studio/access/${token}`);
}

/**
 * Sincronizzazione automatica: invia i dati cambiati dei pazienti con l'accesso creato e cancella dal server
 * quelli eliminati nello studio. Non si ferma al primo errore (che resta annotato sul paziente).
 */
export async function syncAll(cfg: RemoteConfig): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (const token of await repo.listRemoteDeletions()) {
    try { await call(cfg, 'DELETE', `/api/studio/access/${token}`); await repo.removeRemoteDeletion(token); } catch { failed++; }
  }
  for (const a of await repo.listRemoteAccess()) {
    const before = a.view_hash;
    try { const after = await pushPatient(cfg, a.patient_id); if (after.view_hash !== before) sent++; } catch { failed++; }
  }
  return { sent, failed };
}

/**
 * Compila i campi dall'indirizzo che mostrano Aiven e gli altri servizi gestiti ("Service URI"):
 * mysql://avnadmin:password@mysql-….aivencloud.com:12691/defaultdb?ssl-mode=REQUIRED
 */
export function parseDbUri(uri: string): { client: 'mysql2' | 'pg' | 'mssql'; host: string; port: number | ''; database: string; user: string; password: string; ssl: boolean } {
  let u: URL;
  try { u = new URL(uri.trim()); } catch { throw new Error('Indirizzo non valido: copia il "Service URI" completo dal pannello del servizio'); }
  const client = ({ 'mysql:': 'mysql2', 'postgres:': 'pg', 'postgresql:': 'pg', 'sqlserver:': 'mssql' } as Record<string, 'mysql2' | 'pg' | 'mssql'>)[u.protocol];
  if (!client) throw new Error(`Tipo di database non supportato: ${u.protocol.replace(':', '')}`);
  const mode = (u.searchParams.get('ssl-mode') ?? u.searchParams.get('sslmode') ?? u.searchParams.get('ssl') ?? '').toLowerCase();
  // Aiven nasconde "utente:password" dietro "CLICK_TO:REVEAL_PASSWORD" finché non si rivela la password: non sono dati veri.
  const hidden = u.username === 'CLICK_TO' && u.password === 'REVEAL_PASSWORD';
  return {
    client, host: u.hostname, port: u.port ? Number(u.port) : '', database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    user: hidden ? '' : decodeURIComponent(u.username), password: hidden ? '' : decodeURIComponent(u.password), ssl: !mode || !['disabled', 'disable', 'false', '0'].includes(mode),
  };
}
