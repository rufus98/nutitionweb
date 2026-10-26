import { useState } from 'react';
import { useApp } from '../../app/store';
import * as repo from '../../db/repo';
import type { Patient } from '../../db/types';
import { Modal, ModalHeader, Toggle } from '../../components/ui';
import { waLink } from '../../lib/format';
import { copyText, openExternal } from '../../lib/platform';
import { savePlanPdf as savePlanPdfFile } from '../../lib/planExport';
import { accessMessage, patientLink, useRemoteAccess } from './AppAccess';

/**
 * "Link paziente pronto" (dal design). Con il server dell'app paziente configurato invia il link di attivazione
 * (prima volta, il paziente sceglie la password) oppure il link personale; senza server si invia il PDF del piano.
 */
export function ShareModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { settings, toast } = useApp();
  const s = settings!;
  const r = useRemoteAccess(patient);
  const [copied, setCopied] = useState(false);
  if (r.access === undefined) return null;
  const a = r.access;
  const studio = s.prof.name || 'lo studio';

  const savePlanPdf = async () => {
    const plans = await repo.listPlans(patient.id);
    const p = plans.find((x) => x.status === 'published') ?? plans[0];
    if (!p) return;
    const path = await savePlanPdfFile(patient, p, s);
    if (path) toast('PDF del piano salvato: allegalo al messaggio');
  };
  const send = (msg: string) => (
    <div className="grid grid-cols-2 gap-2.5">
      <button onClick={() => openExternal(waLink(patient.phone, msg))} className="p-3 rounded-xl bg-ok-bg text-ok font-semibold text-center border-0 hover:brightness-[.97]">Invia su WhatsApp</button>
      <button disabled={!patient.email} title={patient.email ? '' : 'Email del paziente mancante'} onClick={() => openExternal(`mailto:${patient.email}?subject=${encodeURIComponent('Il tuo piano nutrizionale')}&body=${encodeURIComponent(msg)}`)}
        className="p-3 rounded-xl border border-ctl bg-surface text-ink font-semibold text-center hover:bg-surface2 disabled:opacity-50">Invia per email</button>
    </div>
  );
  const message = (msg: string) => <div className="bg-canvas rounded-xl px-3.5 py-3 text-[13px] text-ink2 leading-normal selectable whitespace-pre-line"><div className="label mb-1">Messaggio</div>{msg}</div>;

  // Server non configurato: si condivide il PDF del piano.
  if (!r.cfg) {
    const msg = `Ciao ${patient.first}, ti invio il tuo nuovo piano nutrizionale in PDF. Per qualsiasi dubbio scrivimi pure. — ${studio}`;
    return (
      <Modal onClose={onClose} labelledBy="share-title">
        <ModalHeader id="share-title" title="Invia il piano" onClose={onClose} sub="Il server dell'app paziente non è configurato (Impostazioni → App paziente & link): invia il PDF del piano." />
        <button onClick={savePlanPdf} className="py-3 rounded-xl border border-ctl bg-surface font-semibold hover:bg-surface2">Salva il PDF del piano da inviare</button>
        {send(msg)}
        {message(msg)}
      </Modal>
    );
  }

  // Server configurato ma accesso non ancora creato.
  if (!a) {
    return (
      <Modal onClose={onClose} labelledBy="share-title">
        <ModalHeader id="share-title" title="Crea il link di accesso" onClose={onClose} sub={`${patient.first} riceverà un link di attivazione, sceglierà la sua password e troverà il piano nell'app.`} />
        {r.problem ? <div className="text-[13px] text-warn bg-warn-bg rounded-[10px] px-3.5 py-2.5">{r.problem}.</div>
          : <button className="btn-primary py-3" disabled={r.busy} onClick={r.create}>{r.busy ? 'Creazione…' : 'Crea link di accesso'}</button>}
      </Modal>
    );
  }

  const activation = !!a.activation_url && !!a.activation_expires_at && new Date(a.activation_expires_at).getTime() > Date.now() && a.status !== 'disabled';
  const link = activation ? a.activation_url! : patientLink(s, patient.token);
  const msg = accessMessage(s, patient, a);
  const on = a.status !== 'disabled';
  return (
    <Modal onClose={onClose} labelledBy="share-title">
      <ModalHeader id="share-title" title={activation ? 'Link di attivazione pronto' : 'Link paziente'} onClose={onClose}
        sub={activation ? `${patient.first} lo apre, sceglie la password e trova subito il piano. Vale una sola volta.` : `${patient.first} apre il suo link e inserisce la password.`} />
      <div className="flex gap-2 items-center border border-ctl rounded-xl py-1.5 pr-1.5 pl-3.5">
        <span className={'flex-1 min-w-0 truncate font-mono text-[13px] font-medium selectable ' + (on ? 'text-strong' : 'text-subtle')} title={link}>{link.replace('https://', '')}</span>
        {copied ? <span className="px-3.5 py-2 rounded-[9px] bg-ok-bg text-ok font-semibold text-[13px]">Copiato ✓</span>
          : <button onClick={async () => { await copyText(link); setCopied(true); }} className="px-3.5 py-2 rounded-[9px] border-0 bg-strong text-surface font-semibold text-[13px] flex-none">Copia link</button>}
      </div>
      {!activation && a.status === 'pending' && <div className="text-[12.5px] text-warn bg-warn-bg rounded-[10px] px-3 py-2">Il link di attivazione è scaduto. <button className="link-btn text-[12.5px]" disabled={r.busy} onClick={r.create}>Creane uno nuovo</button></div>}
      {send(msg)}
      {message(msg)}
      <div className="flex justify-between items-center text-[13px] text-muted border-t border-line2 pt-3.5">
        <span>Accesso con link e password · disattivabile in qualsiasi momento</span>
        <span className="flex items-center gap-2 text-ink font-medium">{on ? 'Attivo' : 'Disattivato'}<Toggle on={on} onClick={() => r.enable(!on)} label="Accesso attivo" /></span>
      </div>
    </Modal>
  );
}
