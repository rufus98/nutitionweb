// Accesso ai dati del paziente (contratto in README.md e in server/src/app.ts).
// Link personale /p/{token} + password scelta dal paziente: dopo l'attivazione o il login il server dà un codice di
// sessione (30 giorni), salvato sul telefono. L'ultima risposta resta salvata per aprire il piano anche offline;
// se lo studio disattiva il link (410) o il link non esiste più (404), sessione e copia vengono cancellate.
import { PATIENT_VIEW_VERSION, type PatientView } from '@app/patientApp/view';
import { demoView } from './demo';

/** Origine del server delle API; vuota = stessa origine della web app. */
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export type LoadError = 'not-found' | 'revoked' | 'offline' | 'outdated' | 'server';
export class ApiError extends Error {
  constructor(readonly kind: LoadError, message = kind) { super(message); }
}

/** Serve l'accesso: prima volta (scegliere la password) o login. Con nome e contatti dello studio per chiedere aiuto. */
export interface AuthNeeded { state: 'activate' | 'login'; firstName: string; studio: { name: string; whatsapp: string } }
export class AuthError extends Error {
  constructor(readonly info: AuthNeeded) { super('auth'); }
}

/** Errore mostrato nel modulo di accesso (password sbagliata, link scaduto, troppi tentativi…). */
export class FormError extends Error {
  constructor(message: string, readonly code?: 'activation' | 'password' | 'locked') { super(message); }
}

export interface Loaded {
  view: PatientView;
  /** Data e ora della copia salvata quando il server non è raggiungibile; null se i dati sono freschi. */
  offlineSince: string | null;
}

/** Il token è nell'URL del link inviato dallo studio: lettere, numeri, "-" e "_". */
export const validToken = (t: string) => /^[A-Za-z0-9_-]{6,64}$/.test(t);

export interface Deps { fetch: typeof fetch; storage: Storage; now: () => Date }
const defaults = (): Deps => ({ fetch: (...a) => fetch(...a), storage: localStorage, now: () => new Date() });

const key = (token: string, what: 'view' | 'session') => `nutrea:${token}:${what}`;
const session = (token: string, d: Pick<Deps, 'storage'>) => { try { return d.storage.getItem(key(token, 'session')); } catch { return null; } };
const forget = (token: string, d: Pick<Deps, 'storage'>) => { d.storage.removeItem(key(token, 'session')); d.storage.removeItem(key(token, 'view')); };
const authHeaders = (token: string, d: Pick<Deps, 'storage'>): Record<string, string> => { const s = session(token, d); return s ? { Authorization: `Bearer ${s}` } : {}; };

export async function loadView(token: string, deps: Deps = defaults()): Promise<Loaded> {
  if (token === 'demo') return { view: demoView(deps.now()), offlineSince: null };
  if (!validToken(token)) throw new ApiError('not-found');
  let res: Response;
  try {
    res = await deps.fetch(`${BASE}/api/p/${token}`, { headers: { Accept: 'application/json', ...authHeaders(token, deps) }, cache: 'no-store', credentials: 'omit' });
  } catch {
    return fromCache(token, deps, 'offline');
  }
  if (res.status === 404) { forget(token, deps); throw new ApiError('not-found'); }
  if (res.status === 410) { forget(token, deps); throw new ApiError('revoked'); }
  if (res.status === 401) {
    // Sessione scaduta o mai aperta: niente dati finché il paziente non accede di nuovo.
    deps.storage.removeItem(key(token, 'session'));
    deps.storage.removeItem(key(token, 'view'));
    const b = await res.json().catch(() => ({}));
    throw new AuthError({ state: b.state === 'activate' ? 'activate' : 'login', firstName: b.firstName ?? '', studio: { name: b.studio?.name ?? '', whatsapp: b.studio?.whatsapp ?? '' } });
  }
  if (!res.ok) return fromCache(token, deps, 'server');
  let view: PatientView;
  try { view = await res.json(); } catch { return fromCache(token, deps, 'server'); } // es. pagina HTML di un proxy
  if (view?.v !== PATIENT_VIEW_VERSION) throw new ApiError('outdated');
  try { deps.storage.setItem(key(token, 'view'), JSON.stringify({ at: deps.now().toISOString(), view })); } catch { /* memoria piena o non disponibile */ }
  return { view, offlineSince: null };
}

function fromCache(token: string, deps: Deps, kind: LoadError): Loaded {
  try {
    const saved = JSON.parse(deps.storage.getItem(key(token, 'view')) ?? 'null') as { at: string; view: PatientView } | null;
    if (saved?.view?.v === PATIENT_VIEW_VERSION && session(token, deps)) {
      const at = new Date(saved.at);
      return { view: saved.view, offlineSince: at.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) };
    }
  } catch { /* copia illeggibile */ }
  throw new ApiError(kind);
}

async function openSession(token: string, path: 'activate' | 'login', body: object, deps: Pick<Deps, 'fetch' | 'storage'>) {
  let res: Response;
  try {
    res = await deps.fetch(`${BASE}/api/p/${token}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' });
  } catch {
    throw new FormError('Connessione assente: riprova quando sei online');
  }
  const b = await res.json().catch(() => ({}));
  if (res.ok && b.session) { deps.storage.setItem(key(token, 'session'), b.session); return; }
  if (res.status === 404) throw new ApiError('not-found');
  if (res.status === 410) throw new ApiError('revoked');
  throw new FormError(b.error ?? 'Accesso non riuscito: riprova', res.status === 429 ? 'locked' : b.code);
}

/** Primo accesso (o password dimenticata): con il codice del link di attivazione il paziente sceglie la password. */
export const activate = (token: string, code: string, password: string, deps: Pick<Deps, 'fetch' | 'storage'> = defaults()) =>
  openSession(token, 'activate', { code, password }, deps);

/** Accesso con il link personale e la password. */
export const login = (token: string, password: string, deps: Pick<Deps, 'fetch' | 'storage'> = defaults()) =>
  openSession(token, 'login', { password }, deps);

/** Esce da questo telefono: chiude la sessione sul server e cancella i dati salvati qui. */
export async function logout(token: string, deps: Pick<Deps, 'fetch' | 'storage'> = defaults()) {
  if (token === 'demo') return;
  try { await deps.fetch(`${BASE}/api/p/${token}/logout`, { method: 'POST', headers: authHeaders(token, deps), credentials: 'omit' }); } catch { /* offline: la sessione scade da sola */ }
  forget(token, deps);
}

/** Registra il consenso informato dato al primo accesso, anche nella copia offline (per non richiederlo di nuovo). */
export async function sendConsent(token: string, deps: Pick<Deps, 'fetch' | 'storage'> = defaults()) {
  if (token === 'demo') return;
  const res = await deps.fetch(`${BASE}/api/p/${token}/consent`, { method: 'POST', headers: authHeaders(token, deps), credentials: 'omit' });
  if (!res.ok) throw new ApiError(res.status === 410 ? 'revoked' : 'server');
  try {
    const saved = JSON.parse(deps.storage.getItem(key(token, 'view')) ?? 'null');
    if (saved?.view) { saved.view.consent.required = false; deps.storage.setItem(key(token, 'view'), JSON.stringify(saved)); }
  } catch { /* copia assente o illeggibile */ }
}

/** PDF originale: richiede la sessione, quindi si scarica e si apre come file locale. */
export async function fetchPdf(token: string, path: string, deps: Pick<Deps, 'fetch' | 'storage'> = defaults()): Promise<Blob> {
  const res = await deps.fetch(`${BASE}${path}`, { headers: authHeaders(token, deps), credentials: 'omit' });
  if (!res.ok) throw new ApiError(res.status === 410 ? 'revoked' : 'server');
  return res.blob();
}
