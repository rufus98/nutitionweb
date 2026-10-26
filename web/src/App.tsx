// Web app dei pazienti: /p/{token} apre il piano condiviso dallo studio; "/" riapre l'ultimo link usato.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PatientApp } from '@app/patientApp/PatientApp';
import { ApiError, loadView, sendConsent, type LoadError, type Loaded } from './api';
import { lastToken, rememberToken, tokenStore, useInstall, useTokenManifest } from './device';

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function App() {
  const token = /^\/p\/([^/?#]+)\/?$/.exec(location.pathname)?.[1] ?? null;
  if (!token) return <Home />;
  return <PatientPage token={decodeURIComponent(token)} />;
}

function PatientPage({ token }: { token: string }) {
  const [state, setState] = useState<{ data?: Loaded; error?: LoadError; loading: boolean }>({ loading: true });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    loadView(token)
      .then((data) => { setState({ data, loading: false }); rememberToken(token); })
      .catch((e) => setState({ error: e instanceof ApiError ? e.kind : 'server', loading: false }));
  }, [token]);
  useEffect(load, [load]);
  // Al ritorno sull'app (o al ritorno della connessione) i dati si aggiornano.
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('online', again);
    document.addEventListener('visibilitychange', again);
    return () => { window.removeEventListener('online', again); document.removeEventListener('visibilitychange', again); };
  }, [load]);

  const view = state.data?.view;
  useEffect(() => { if (view) document.title = `Il mio piano · ${view.studio.name}`; }, [view]);
  useTokenManifest(token, view?.studio.name ?? 'Nutrea');
  const install = useInstall(token, !!view?.features.install);
  const store = useMemo(() => tokenStore(token), [token]);

  if (view) {
    return (
      <Frame>
        <PatientApp view={view} env={{ today: localToday(), store, install, offlineSince: state.data!.offlineSince, onConsent: () => sendConsent(token) }} />
      </Frame>
    );
  }
  if (state.loading) return <Frame><Loading /></Frame>;
  return <Frame><ErrorScreen kind={state.error!} retry={load} /></Frame>;
}

/** Sul telefono a tutto schermo; su schermi larghi una colonna centrata come un telefono. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="h-[100dvh] bg-[#E9E7E1] sm:py-6">
      <div className="h-full max-w-[480px] mx-auto bg-[#F6F5F1] sm:rounded-[28px] sm:overflow-hidden sm:shadow-[0_20px_60px_rgba(15,30,32,.18)] pt-[env(safe-area-inset-top)]">
        {children}
      </div>
    </div>
  );
}

function Logo() {
  return <div className="w-12 h-12 rounded-[13px] bg-[#0F3B40] text-[#A9C6B1] grid place-items-center font-bold text-xl">n</div>;
}

function Loading() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4" role="status" aria-label="Caricamento del piano">
      <Logo />
      <div className="w-40 h-1.5 rounded bg-[#E6E4DE] overflow-hidden"><div className="h-full w-1/3 rounded bg-[#7FA08A] animate-[load_1.1s_ease-in-out_infinite]" /></div>
    </div>
  );
}

const ERRORS: Record<LoadError, { title: string; text: string; retry?: boolean }> = {
  'not-found': { title: 'Link non valido', text: 'Controlla di aver aperto il link completo che ti ha inviato lo studio, oppure chiedine uno nuovo.' },
  revoked: { title: 'Link disattivato', text: 'Lo studio ha disattivato questo link. Contatta lo studio per riceverne uno nuovo.' },
  offline: { title: 'Sei offline', text: 'Serve una connessione per aprire il piano la prima volta. Dalla volta successiva lo trovi anche senza rete.', retry: true },
  server: { title: 'Servizio non raggiungibile', text: 'Al momento il piano non si può caricare. Riprova tra qualche minuto.', retry: true },
  outdated: { title: 'Aggiorna la pagina', text: "È disponibile una versione più recente dell'app: ricarica la pagina.", retry: true },
};

function ErrorScreen({ kind, retry }: { kind: LoadError; retry: () => void }) {
  const e = ERRORS[kind];
  return (
    <div className="h-full flex flex-col justify-center gap-5 px-7 text-[#18211F]">
      <Logo />
      <div><h1 className="m-0 text-[26px] font-semibold tracking-[-.02em] leading-tight">{e.title}</h1><p className="mt-2 mb-0 text-[15px] leading-[1.55] text-[#5E6866]">{e.text}</p></div>
      {e.retry && <button onClick={() => (kind === 'outdated' ? location.reload() : retry())} className="h-[54px] rounded-[15px] border-0 bg-[#1E5A5F] text-white font-semibold text-base">Riprova</button>}
    </div>
  );
}

/** Pagina iniziale: riapre l'ultimo piano (es. dall'icona sulla Home) o spiega come accedere. */
function Home() {
  const last = lastToken();
  useEffect(() => { if (last) location.replace(`/p/${encodeURIComponent(last)}`); }, [last]);
  if (last) return <Frame><Loading /></Frame>;
  return (
    <Frame>
      <div className="h-full flex flex-col justify-center gap-5 px-7 text-[#18211F]">
        <Logo />
        <div>
          <h1 className="m-0 text-[26px] font-semibold tracking-[-.02em] leading-tight">Il tuo piano nutrizionale</h1>
          <p className="mt-2 mb-0 text-[15px] leading-[1.55] text-[#5E6866]">Apri il link personale che ti ha inviato lo studio su WhatsApp o per email: non servono password.</p>
        </div>
        <a href="/p/demo" className="text-[15px] font-semibold text-[#1E5A5F] no-underline">Guarda un esempio →</a>
      </div>
    </Frame>
  );
}
