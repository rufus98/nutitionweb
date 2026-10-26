// Sincronizzazione automatica con il server dell'app paziente: poco dopo ogni modifica ai dati (version),
// ogni 5 minuti e al ritorno della connessione. Invia solo i pazienti i cui dati sono cambiati (vedi lib/remote.ts).
import { useEffect, useRef } from 'react';
import { useApp } from './store';
import { remoteConfig, syncAll, type RemoteConfig } from '../lib/remote';

/** Evento emesso a fine sincronizzazione: le schede aperte ricaricano lo stato. */
export const REMOTE_SYNCED = 'nutrea:remote-synced';

export function useRemoteSync() {
  const { settings, version } = useApp();
  const cfg = remoteConfig(settings);
  const cfgRef = useRef<RemoteConfig | null>(cfg);
  cfgRef.current = cfg;
  const running = useRef(false), again = useRef(false);

  const run = async () => {
    const c = cfgRef.current;
    if (!c) return;
    if (running.current) { again.current = true; return; }
    running.current = true;
    try { await syncAll(c); } catch { /* gli errori restano annotati sui singoli pazienti */ }
    finally {
      running.current = false;
      window.dispatchEvent(new Event(REMOTE_SYNCED));
      if (again.current) { again.current = false; run(); }
    }
  };

  useEffect(() => {
    if (!cfg) return;
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [version, settings, cfg?.url, cfg?.key]);

  useEffect(() => {
    if (!cfg) return;
    const i = setInterval(run, 5 * 60_000);
    window.addEventListener('online', run);
    return () => { clearInterval(i); window.removeEventListener('online', run); };
  }, [cfg?.url, cfg?.key]);
}
