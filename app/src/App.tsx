import { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp, type Route } from './app/store';
import { Sidebar, NAV } from './components/Sidebar';
import { Palette, ShortcutsHelp } from './components/Palette';
import { Modal, Spinner } from './components/ui';
import * as repo from './db/repo';
import { seedDemo } from './db/seed';
import { NewPatient } from './screens/NewPatient';
import { PatientList } from './screens/PatientList';
import { PatientRecord } from './screens/PatientRecord';
import { Agenda } from './screens/Agenda';
import { Payments } from './screens/Payments';
import { SettingsScreen } from './screens/Settings';
import { Today } from './screens/Today';
import { Plans } from './screens/Plans';
import { LockScreen } from './screens/Lock';

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'today': return <Today />;
    case 'patients': return <PatientList />;
    case 'new': return <NewPatient />;
    case 'patient': return <PatientRecord key={route.id} id={route.id} tab={route.tab} action={route.action} />;
    case 'agenda': return <Agenda route={route} />;
    case 'plans': return <Plans />;
    case 'payments': return <Payments route={route} />;
    case 'settings': return <SettingsScreen />;
  }
}

function Shell() {
  const { route, go, back, toastMsg, confirmState, settings } = useApp();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => { if (settings && locked === null) setLocked(!!(settings.priv.pin && settings.pin)); }, [settings, locked]);

  const toastRef = useRef(toastMsg);
  toastRef.current = toastMsg;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl+Z annulla l'ultima azione offerta dal messaggio (es. lo spostamento di un appuntamento), fuori dai campi di testo.
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && toastRef.current?.action && !(e.target as HTMLElement).closest('input, textarea, [contenteditable]')) {
        e.preventDefault(); toastRef.current.action.run(); return;
      }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); return; }
      if (mod && e.key.toLowerCase() === 'n' && !e.shiftKey) { e.preventDefault(); go({ name: 'new' }); return; }
      if (mod && !e.shiftKey && !e.altKey) {
        const n = NAV.find((x) => x.key === e.key);
        if (n) { e.preventDefault(); go({ name: n.id } as Route); return; }
        // Disattiva le scorciatoie del browser che non hanno senso in un'app (stampa, salva pagina, ricarica…).
        if (['p', 'r', 'u', 'g', 'j', 'o', 'f', 'h', 'd'].includes(e.key.toLowerCase())) e.preventDefault();
      }
      // Tasti del browser (ricarica, trova, navigazione con cursore) non pertinenti in un'app desktop.
      if (['F3', 'F5', 'F7', 'BrowserBack', 'BrowserForward'].includes(e.key)) e.preventDefault();
      if (e.key === 'F1') { e.preventDefault(); setHelp(true); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    const onMouse = (e: MouseEvent) => { if (e.button === 3) { e.preventDefault(); back(); } };
    // Menu contestuale del browser solo nei campi di testo (copia/incolla).
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('input, textarea, [contenteditable], .selectable')) e.preventDefault();
    };
    const onPal = () => setPalette(true);
    window.addEventListener('open-palette', onPal);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    window.addEventListener('contextmenu', onCtx);
    return () => { window.removeEventListener('open-palette', onPal); window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouse); window.removeEventListener('contextmenu', onCtx); };
  }, [go, back]);

  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;

  return (
    <div className="grid h-full min-w-[1280px] grid-cols-[232px_minmax(0,1fr)]">
      <Sidebar />
      <Screen route={route} />
      {palette && <Palette onClose={() => setPalette(false)} />}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      {confirmState && (
        <Modal onClose={() => confirmState.resolve(false)} width={440}>
          <div><div className="text-[19px] font-semibold">{confirmState.title}</div>{confirmState.body && <div className="text-[13.5px] text-muted mt-1.5 leading-normal">{confirmState.body}</div>}</div>
          <div className="flex justify-end gap-2.5">
            <button className="btn-secondary" onClick={() => confirmState.resolve(false)}>{confirmState.cancel ?? 'Annulla'}</button>
            <button autoFocus className={confirmState.danger ? 'btn-danger' : 'btn-primary'} onClick={() => confirmState.resolve(true)}>{confirmState.ok ?? 'Conferma'}</button>
          </div>
        </Modal>
      )}
      {toastMsg && (
        <div role="status" className="fixed bottom-6 left-1/2 bg-side text-white px-[18px] py-[11px] rounded-xl text-[13.5px] font-medium z-40 shadow-[0_10px_30px_rgba(15,30,32,.25)] animate-[toastIn_.18s_ease] -translate-x-1/2 flex items-center gap-4">
          {toastMsg.msg}
          {toastMsg.action && <button onClick={toastMsg.action.run} title="Ctrl+Z" className="border-0 bg-transparent p-0 text-sage-400 font-semibold text-[13.5px] hover:underline">{toastMsg.action.label}</button>}
        </div>
      )}
    </div>
  );
}

/** Primo avvio: archivio vuoto o dati dimostrativi. */
function Welcome({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const start = async (demo: boolean) => {
    setBusy(true);
    if (demo) await seedDemo();
    await repo.setFlag('onboarded', '1');
    onDone();
  };
  return (
    <div className="h-full grid place-items-center bg-canvas">
      <div className="card p-10 w-[560px] flex flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[10px] bg-sage-400 text-[#0F3B40] grid place-items-center font-bold text-lg">n</div>
          <div className="font-semibold text-xl tracking-[-.01em]">Nutrea <span className="text-sage-500 font-medium">Studio</span></div>
        </div>
        <div>
          <div className="text-[26px] font-semibold tracking-[-.02em]">Configuriamo il tuo studio</div>
          <div className="text-muted mt-1.5 leading-normal">I dati restano su questo computer, in un database locale. Puoi iniziare con un archivio vuoto oppure esplorare l'app con i pazienti di esempio (li potrai eliminare da Impostazioni → Privacy).</div>
        </div>
        {busy ? <div className="flex items-center gap-3 text-muted"><Spinner /> Preparazione dell'archivio…</div> : (
          <div className="grid grid-cols-2 gap-2.5">
            <button className="btn-primary py-3.5 text-sm" onClick={() => start(false)}>Inizia con archivio vuoto</button>
            <button className="btn-secondary py-3.5 text-sm" onClick={() => start(true)}>Carica dati di esempio</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<'loading' | 'welcome' | 'ready' | { error: string }>('loading');
  useEffect(() => {
    repo.init().then(() => repo.getFlag('onboarded')).then((f) => setState(f ? 'ready' : 'welcome')).catch((e) => setState({ error: String(e?.message ?? e) }));
  }, []);
  if (state === 'loading') return <div className="h-full grid place-items-center"><Spinner size={28} /></div>;
  if (typeof state === 'object') return <div className="h-full grid place-items-center text-err p-10">Impossibile aprire il database: {state.error}</div>;
  if (state === 'welcome') return <Welcome onDone={() => setState('ready')} />;
  return <AppProvider><Shell /></AppProvider>;
}
