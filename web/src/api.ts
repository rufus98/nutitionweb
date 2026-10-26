// Accesso ai dati del paziente: GET /api/p/{token} (contratto in README.md e in app/src/patientApp/view.ts).
// L'ultima risposta resta salvata sul telefono per aprire il piano anche senza connessione;
// se lo studio disattiva il link (410) la copia salvata viene cancellata.
import { PATIENT_VIEW_VERSION, type PatientView } from '@app/patientApp/view';
import { demoView } from './demo';

/** Origine del server delle API; vuota = stessa origine della web app. */
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export type LoadError = 'not-found' | 'revoked' | 'offline' | 'outdated' | 'server';
export class ApiError extends Error {
  constructor(readonly kind: LoadError, message = kind) { super(message); }
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

const cacheKey = (token: string) => `nutrea:${token}:view`;

export async function loadView(token: string, deps: Deps = defaults()): Promise<Loaded> {
  if (token === 'demo') return { view: demoView(deps.now()), offlineSince: null };
  if (!validToken(token)) throw new ApiError('not-found');
  let res: Response;
  try {
    res = await deps.fetch(`${BASE}/api/p/${token}`, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'omit' });
  } catch {
    return fromCache(token, deps, 'offline');
  }
  if (res.status === 404) { deps.storage.removeItem(cacheKey(token)); throw new ApiError('not-found'); }
  if (res.status === 410) { deps.storage.removeItem(cacheKey(token)); throw new ApiError('revoked'); }
  if (!res.ok) return fromCache(token, deps, 'server');
  let view: PatientView;
  try { view = await res.json(); } catch { return fromCache(token, deps, 'server'); } // es. pagina HTML di un proxy
  if (view?.v !== PATIENT_VIEW_VERSION) throw new ApiError('outdated');
  try { deps.storage.setItem(cacheKey(token), JSON.stringify({ at: deps.now().toISOString(), view })); } catch { /* memoria piena o non disponibile */ }
  return { view, offlineSince: null };
}

function fromCache(token: string, deps: Deps, kind: LoadError): Loaded {
  try {
    const saved = JSON.parse(deps.storage.getItem(cacheKey(token)) ?? 'null') as { at: string; view: PatientView } | null;
    if (saved?.view?.v === PATIENT_VIEW_VERSION) {
      const at = new Date(saved.at);
      return { view: saved.view, offlineSince: at.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) };
    }
  } catch { /* copia illeggibile */ }
  throw new ApiError(kind);
}

/** Registra il consenso informato dato al primo accesso, anche nella copia offline (per non richiederlo di nuovo). */
export async function sendConsent(token: string, deps: Pick<Deps, 'fetch' | 'storage'> = defaults()) {
  if (token === 'demo') return;
  const res = await deps.fetch(`${BASE}/api/p/${token}/consent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accepted: true }), credentials: 'omit' });
  if (!res.ok) throw new ApiError(res.status === 410 ? 'revoked' : 'server');
  try {
    const saved = JSON.parse(deps.storage.getItem(cacheKey(token)) ?? 'null');
    if (saved?.view) { saved.view.consent.required = false; deps.storage.setItem(cacheKey(token), JSON.stringify(saved)); }
  } catch { /* copia assente o illeggibile */ }
}
