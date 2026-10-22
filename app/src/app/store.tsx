import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as repo from '../db/repo';
import type { Settings } from '../db/types';

export type Route =
  | { name: 'today' }
  | { name: 'patients' }
  | { name: 'new' }
  | { name: 'patient'; id: number; tab?: 'overview' | 'visits' | 'diet' | 'pay'; action?: 'visit' }
  | { name: 'agenda'; date?: string; patientId?: number; select?: number; book?: boolean }
  | { name: 'plans' }
  | { name: 'payments'; patientId?: number; register?: boolean }
  | { name: 'settings' };

interface Ctx {
  route: Route;
  go: (r: Route) => void;
  back: () => void;
  canBack: boolean;
  toast: (msg: string) => void;
  toastMsg: string | null;
  settings: Settings | null;
  setSettings: (s: Settings) => Promise<void>;
  /** Contatore che cambia dopo ogni modifica ai dati: le schermate lo usano per ricaricare. */
  version: number;
  bump: () => void;
  patientCount: number;
  /** Una schermata con modifiche non salvate registra qui una domanda di conferma. */
  setGuard: (msg: string | null) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  confirmState: (ConfirmOpts & { resolve: (v: boolean) => void }) | null;
}
export interface ConfirmOpts { title: string; body?: string; ok?: string; cancel?: string; danger?: boolean }

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'today' }]);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [settings, setS] = useState<Settings | null>(null);
  const [version, setVersion] = useState(0);
  const [patientCount, setCount] = useState(0);
  const guard = useRef<string | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { repo.getSettings().then(setS); }, []);
  useEffect(() => { repo.patientCount().then(setCount); }, [version]);

  const [confirmState, setConfirm] = useState<Ctx['confirmState']>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => {
    setConfirm({ ...o, resolve: (v) => { setConfirm(null); resolve(v); } });
  }), []);
  const confirmLeave = async () =>
    !guard.current || (await confirm({ title: 'Uscire senza salvare?', body: guard.current, ok: 'Esci senza salvare', cancel: 'Resta qui', danger: true }));
  const go = useCallback(async (r: Route) => {
    if (!(await confirmLeave())) return;
    guard.current = null;
    setStack((s) => [...s.slice(-30), r]);
  }, []);
  const back = useCallback(async () => {
    if (!(await confirmLeave())) return;
    guard.current = null;
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);
  const toast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(null), 2400);
  }, []);
  const setSettings = useCallback(async (s: Settings) => { await repo.saveSettings(s); setS(s); }, []);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const setGuard = useCallback((m: string | null) => { guard.current = m; }, []);

  return (
    <AppCtx.Provider value={{ route: stack[stack.length - 1], go, back, canBack: stack.length > 1, toast, toastMsg, settings, setSettings, version, bump, patientCount, setGuard, confirm, confirmState }}>
      {children}
    </AppCtx.Provider>
  );
}

/** Carica dati asincroni e li ricarica quando cambiano le dipendenze o la versione globale dei dati. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): [T | undefined, () => void] {
  const { version } = useApp();
  const [data, setData] = useState<T>();
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    fn().then((d) => alive && setData(d));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, n, ...deps]);
  return [data, () => setN((x) => x + 1)];
}
