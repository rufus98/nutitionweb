// Accesso del paziente alla web app: scheda "App paziente" nel profilo e messaggi da inviare.
// La logica di rete è in src/lib/remote.ts; qui ci sono solo stati e azioni dell'interfaccia.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import * as repo from '../../db/repo';
import type { Patient, RemoteAccess, Settings } from '../../db/types';
import { fillTemplate, fmtDate, fmtShort } from '../../lib/format';
import { accessProblem, accessStatus, createAccessLink, pushPatient, remoteConfig, setAccessEnabled } from '../../lib/remote';
import { cx } from '../../components/ui';
import { REMOTE_SYNCED } from '../../app/useRemoteSync';

export const patientLink = (s: Settings, token: string | null) => `https://${s.appDomain}/p/${token ?? ''}`;

const timeOf = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const valid = (a: RemoteAccess | null) => !!a?.activation_url && !!a.activation_expires_at && new Date(a.activation_expires_at).getTime() > Date.now();

/** Messaggio da inviare: link di attivazione (prima volta / password dimenticata) oppure link personale. */
export function accessMessage(s: Settings, p: Patient, a: RemoteAccess | null) {
  const studio = s.prof.name || 'lo studio';
  if (a && valid(a) && a.status !== 'disabled') {
    const first = a.status === 'pending';
    return `Ciao ${p.first}, ${first ? 'ecco il link per attivare la tua app con il piano nutrizionale' : 'ecco il link per impostare una nuova password della tua app'}:\n${a.activation_url}\n${first ? 'Al primo accesso sceglierai una password personale, che servirà insieme al tuo link.' : 'Scegli la nuova password: quella vecchia non varrà più.'} Il link vale fino al ${fmtDate(a.activation_expires_at!.slice(0, 10))}. — ${studio}`;
  }
  return fillTemplate(s.tpl[1] ?? '', { nome: p.first, link: patientLink(s, p.token), studio });
}

/** Stato e azioni sull'accesso remoto di un paziente. */
export function useRemoteAccess(p: Patient) {
  const { settings, bump, toast } = useApp();
  const cfg = remoteConfig(settings);
  const [access, setAccess] = useState<RemoteAccess | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => repo.getRemoteAccess(p.id).then(setAccess), [p.id]);
  useEffect(() => { reload(); }, [reload, p]);
  useEffect(() => { window.addEventListener(REMOTE_SYNCED, reload); return () => window.removeEventListener(REMOTE_SYNCED, reload); }, [reload]);
  // Ultimo accesso e stato aggiornati dal server quando si apre la scheda.
  useEffect(() => {
    if (!cfg || !p.token) return;
    repo.getRemoteAccess(p.id).then((a) => a && accessStatus(cfg, p.token!).then((st) =>
      repo.saveRemoteAccess(p.id, { status: st.status, last_login_at: st.lastLoginAt }).then(reload)).catch(() => {}));
  }, [cfg?.url, cfg?.key, p.id, p.token]);

  const run = async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | null> => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(ok); return r; }
    catch (e: any) { toast(e?.message ?? String(e)); return null; }
    finally { setBusy(false); await reload(); bump(); }
  };
  return {
    cfg, access, busy, reload,
    problem: accessProblem(p),
    create: () => run(() => createAccessLink(cfg!, p.id)),
    enable: (on: boolean) => run(() => setAccessEnabled(cfg!, p.id, on), on ? 'Accesso riattivato' : `Accesso disattivato: ${p.first} non può più aprire l'app`),
    retry: () => run(() => pushPatient(cfg!, p.id, { force: true }), 'Dati inviati al server'),
  };
}

const STATUS: Record<RemoteAccess['status'] | 'none', [string, string]> = {
  none: ['Non creato', 'pill-neutral'], pending: ['Da attivare', 'pill-warn'], active: ['Attivo', 'pill-ok'], disabled: ['Disattivato', 'pill-neutral'],
};

/** Scheda "App paziente" nel profilo: crea il link, segue l'attivazione, disattiva, mostra la sincronizzazione. */
export function AppAccessCard({ p, onEditPatient, onSend }: { p: Patient; onEditPatient: () => void; onSend: () => void }) {
  const { go, confirm, settings } = useApp();
  const r = useRemoteAccess(p);
  const a = r.access;
  if (a === undefined) return null;
  const st = STATUS[a?.status ?? 'none'];
  const createAndSend = async () => { if (await r.create()) onSend(); };

  return (
    <div className="card px-5 py-[18px] flex flex-col gap-3">
      <div className="flex justify-between items-center"><div className="font-semibold text-[15px]">App paziente</div><span className={cx(st[1], 'py-0.5 px-2')}>{st[0]}</span></div>
      {!r.cfg ? <>
        <div className="text-[13px] text-label">Per dare a {p.first} l'accesso con link e password, collega il server dell'app paziente.</div>
        <button className="btn-secondary py-[9px]" onClick={() => go({ name: 'settings' })}>Configura il server →</button>
      </> : r.problem ? <>
        <div className="text-[13px] text-label">{r.problem}.</div>
        <button className="btn-secondary py-[9px]" onClick={onEditPatient}>Modifica dati</button>
      </> : !a ? <>
        <div className="text-[13px] text-ink2 leading-snug">Crea il link: {p.first} riceverà un link di attivazione e sceglierà la sua password. I dati della dieta vengono inviati al server e aggiornati da soli.</div>
        <button className="btn-primary py-[9px]" disabled={r.busy} onClick={createAndSend}>{r.busy ? 'Creazione…' : 'Crea link di accesso'}</button>
      </> : <>
        <div className="text-[13px] text-ink2 leading-snug">
          {a.status === 'pending' && (valid(a) ? <>In attesa che {p.first} scelga la password · link valido fino al {fmtShort(a.activation_expires_at!.slice(0, 10))}</> : <>Il link di attivazione è scaduto: creane uno nuovo.</>)}
          {a.status === 'active' && <>{p.first} accede con il suo link e la password{a.last_login_at ? <> · ultimo accesso {timeOf(a.last_login_at)}</> : null}.</>}
          {a.status === 'disabled' && <>Accesso disattivato: {p.first} vede "Link disattivato".</>}
        </div>
        <div className="flex items-center gap-2 bg-canvas rounded-ctl px-2.5 py-2"><span className="flex-1 font-mono text-xs text-ink2 truncate selectable">{patientLink(settings!, p.token).replace('https://', '')}</span></div>
        {a.status !== 'disabled' ? (
          <div className="grid grid-cols-2 gap-2">
            {valid(a) ? <button className="btn-primary py-[9px] col-span-2" onClick={onSend}>Invia link di attivazione</button>
              : a.status === 'pending' ? <button className="btn-primary py-[9px] col-span-2" disabled={r.busy} onClick={createAndSend}>Nuovo link di attivazione</button>
                : <button className="btn-secondary py-[9px] col-span-2" onClick={onSend}>Invia il link</button>}
            {a.status === 'active' && !valid(a) && <button className="btn-secondary py-[9px] col-span-2" disabled={r.busy} title="Il paziente sceglie una nuova password; quella vecchia non vale più" onClick={createAndSend}>Password dimenticata: nuovo link</button>}
          </div>
        ) : <button className="btn-secondary py-[9px]" disabled={r.busy} onClick={() => r.enable(true)}>Riattiva accesso</button>}
        <div className="flex justify-between items-center gap-2 text-[12px] border-t border-line2 pt-2.5">
          {a.error
            ? <span className="text-warn leading-snug">Non sincronizzato: {a.error} <button className="link-btn text-[12px]" disabled={r.busy} onClick={r.retry}>Riprova</button></span>
            : <span className="text-label">{a.synced_at ? `Dati aggiornati ${timeOf(a.synced_at)}` : 'In attesa di invio'}</span>}
          {a.status !== 'disabled' && <button className="border-0 bg-transparent p-0 text-err text-[12px] font-medium hover:underline flex-none" disabled={r.busy}
            onClick={async () => { if (await confirm({ title: "Disattivare l'accesso?", body: `${p.first} non potrà più aprire l'app e verrà disconnesso subito. Puoi riattivarlo quando vuoi.`, ok: 'Disattiva', danger: true })) r.enable(false); }}>Disattiva</button>}
        </div>
      </>}
    </div>
  );
}
