import { useState } from 'react';
import { useApp } from '../../app/store';
import * as repo from '../../db/repo';
import type { Patient } from '../../db/types';
import { Modal, ModalHeader, Toggle } from '../../components/ui';
import { fillTemplate, waLink } from '../../lib/format';
import { copyText, openExternal, saveFile } from '../../lib/platform';
import { planPdf } from '../../lib/documents';

/** "Link paziente pronto" (dal design). Finché il server dell'app paziente non è attivo,
 *  il link non è raggiungibile: si condivide il PDF del piano generato dall'app. */
export function ShareModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { settings, bump, toast } = useApp();
  const [copied, setCopied] = useState(false);
  const [linkOn, setLinkOn] = useState(patient.link_on);
  const s = settings!;
  const link = `${s.appDomain}/p/${patient.token}`;
  const live = s.appServer;
  const studio = s.prof.name || 'lo studio';
  const msg = live
    ? fillTemplate(s.tpl[1] ?? '', { nome: patient.first, link: 'https://' + link, studio })
    : `Ciao ${patient.first}, ti invio il tuo nuovo piano nutrizionale in PDF. Per qualsiasi dubbio scrivimi pure. — ${studio}`;

  const toggle = async () => {
    const v = !linkOn;
    setLinkOn(v);
    await repo.updatePatient(patient.id, { link_on: v });
    bump();
    toast(v ? 'Link riattivato' : 'Link disattivato: il paziente non può più aprirlo');
  };
  const savePlanPdf = async () => {
    const plans = await repo.listPlans(patient.id);
    const p = plans.find((x) => x.status === 'published') ?? plans[0];
    if (!p) return;
    const path = await saveFile(`Piano_${patient.last}_${patient.first}_v${p.version}.pdf`, planPdf(`${patient.first} ${patient.last}`, p.data, [s.prof.name, s.prof.title].filter(Boolean).join(' · ')), [{ name: 'PDF', extensions: ['pdf'] }]);
    if (path) toast('PDF del piano salvato: allegalo al messaggio');
  };

  return (
    <Modal onClose={onClose} labelledBy="share-title">
      <ModalHeader id="share-title" title={live ? 'Link paziente pronto' : 'Piano pubblicato'} onClose={onClose}
        sub={live ? `${patient.first} potrà aprirlo senza password e aggiungerlo alla Home.` : `Il link personale di ${patient.first} è pronto e si attiverà con il server dell'app paziente.`} />
      <div className="flex gap-2 items-center border border-ctl rounded-xl py-1.5 pr-1.5 pl-3.5">
        <span className={'flex-1 font-mono text-[13.5px] font-medium selectable ' + (live && linkOn ? 'text-strong' : 'text-subtle')}>{link}</span>
        {!live ? <span className="px-3.5 py-2 rounded-[9px] bg-sunken text-label font-semibold text-[13px]">Non ancora online</span>
          : copied ? <span className="px-3.5 py-2 rounded-[9px] bg-ok-bg text-ok font-semibold text-[13px]">Copiato ✓</span>
            : <button onClick={async () => { await copyText('https://' + link); setCopied(true); }} className="px-3.5 py-2 rounded-[9px] border-0 bg-strong text-surface font-semibold text-[13px]">Copia link</button>}
      </div>
      {!live && (
        <button onClick={savePlanPdf} className="py-3 rounded-xl border border-ctl bg-surface font-semibold hover:bg-surface2">Salva il PDF del piano da inviare</button>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => openExternal(waLink(patient.phone, msg))} className="p-3 rounded-xl bg-ok-bg text-ok font-semibold text-center border-0 hover:brightness-[.97]">Invia su WhatsApp</button>
        <button disabled={!patient.email} title={patient.email ? '' : 'Email del paziente mancante'} onClick={() => openExternal(`mailto:${patient.email}?subject=${encodeURIComponent('Il tuo piano nutrizionale')}&body=${encodeURIComponent(msg)}`)}
          className="p-3 rounded-xl border border-ctl bg-surface text-ink font-semibold text-center hover:bg-surface2 disabled:opacity-50">Invia per email</button>
      </div>
      <div className="bg-canvas rounded-xl px-3.5 py-3 text-[13px] text-ink2 leading-normal selectable">
        <div className="label mb-1">Messaggio</div>{msg}
      </div>
      <div className="flex justify-between items-center text-[13px] text-muted border-t border-line2 pt-3.5">
        <span>Link personale · revocabile in qualsiasi momento</span>
        <span className="flex items-center gap-2 text-ink font-medium">{linkOn ? 'Attivo' : 'Disattivato'}<Toggle on={linkOn} onClick={toggle} label="Link attivo" /></span>
      </div>
    </Modal>
  );
}
