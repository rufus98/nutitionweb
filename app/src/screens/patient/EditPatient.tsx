import { useState } from 'react';
import { useApp } from '../../app/store';
import * as repo from '../../db/repo';
import { ACTIVITIES, CHIP_GROUPS, GOALS } from '../../db/defaults';
import type { Patient } from '../../db/types';
import { Checkbox, cx, Field, Modal, ModalHeader, Segmented, UnitInput } from '../../components/ui';
import { numOrNull, numStr } from '../../lib/format';

/** Modifica anagrafica, note cliniche, obiettivo e consensi; archiviazione ed eliminazione. */
export function EditPatient({ patient: p, onClose, onConsentPdf }: { patient: Patient; onClose: () => void; onConsentPdf: () => void }) {
  const { bump, toast, confirm, go } = useApp();
  const [f, setF] = useState({ ...p, height: numStr(p.height), target_kg: numStr(p.target_kg) } as any);
  const set = (k: string, v: unknown) => setF((s: any) => ({ ...s, [k]: v }));
  const ok = f.first?.trim() && f.last?.trim() && f.phone?.trim();
  const allChips = CHIP_GROUPS.flatMap((g) => g[2]);
  const extraTags = (f.tags as string[]).filter((t) => !allChips.includes(t));

  const save = async () => {
    if (!ok) return;
    await repo.updatePatient(p.id, { ...f, first: f.first.trim(), last: f.last.trim(), phone: f.phone.trim(), cf: f.cf ? f.cf.toUpperCase() : null, height: numOrNull(f.height), target_kg: numOrNull(f.target_kg) });
    bump();
    toast('Scheda aggiornata');
    onClose();
  };
  const del = async () => {
    if (await confirm({ title: `Eliminare ${p.first} ${p.last}?`, body: 'Verranno eliminati definitivamente anche visite, misure, piani e appuntamenti del paziente. Pagamenti e fatture restano nel registro contabile. Per conservare tutto, archivia il paziente.', ok: 'Elimina definitivamente', danger: true })) {
      await repo.deletePatient(p.id);
      bump();
      toast('Paziente eliminato');
      onClose();
      go({ name: 'patients' });
    }
  };
  const toggleTag = (t: string) => set('tags', f.tags.includes(t) ? f.tags.filter((x: string) => x !== t) : [...f.tags, t]);

  const txt = (k: string, label: string, type = 'text') => (
    <Field label={label}><input type={type} className={cx(!f[k]?.trim?.() && ['first', 'last', 'phone'].includes(k) ? 'field-err' : 'field')} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></Field>
  );

  return (
    <Modal onClose={onClose} width={720}>
      <ModalHeader title="Modifica scheda" sub={`${p.code} · ${p.first} ${p.last}`} onClose={onClose} />
      <div className="flex flex-col gap-4" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save(); }}>
        <div className="grid grid-cols-3 gap-3">
          {txt('first', 'Nome *')}{txt('last', 'Cognome *')}{txt('phone', 'Telefono *', 'tel')}
          {txt('email', 'Email', 'email')}{txt('dob', 'Data di nascita', 'date')}{txt('birthplace', 'Luogo di nascita')}
          {txt('cf', 'Codice fiscale')}{txt('job', 'Professione')}
          <Field label="Altezza"><UnitInput value={f.height} onChange={(v) => set('height', v)} unit="cm" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5"><span className="label">Sesso biologico</span><Segmented options={[{ v: 'F', l: 'F' }, { v: 'M', l: 'M' }]} value={f.sex} onChange={(v) => set('sex', v)} /></div>
          <Field label="Obiettivo"><select className="field" value={GOALS.includes(f.goal) ? f.goal : ''} onChange={(e) => set('goal', e.target.value)}>
            {!GOALS.includes(f.goal) && <option value="">{f.goal || '—'}</option>}{GOALS.map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Peso obiettivo"><UnitInput value={f.target_kg} onChange={(v) => set('target_kg', v)} unit="kg" /></Field>
        </div>
        <div className="flex flex-col gap-2"><span className="label">Tag clinici</span>
          <div className="flex gap-1.5 flex-wrap">
            {[...allChips, ...extraTags].map((t) => f.tags.includes(t)
              ? <button key={t} onClick={() => toggleTag(t)} className="px-2.5 py-[5px] rounded-full border border-warn-line bg-tag-bg text-tag-ink text-xs font-semibold">✓ {t}</button>
              : <button key={t} onClick={() => toggleTag(t)} className="px-2.5 py-[5px] rounded-full border border-ctl bg-surface text-ink2 text-xs font-medium hover:border-sage-500">{t}</button>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Farmaci / integratori"><input className="field" value={f.drugs ?? ''} onChange={(e) => set('drugs', e.target.value)} /></Field>
          <Field label="Attività fisica"><select className="field" value={f.activity ?? 'Sedentaria'} onChange={(e) => set('activity', e.target.value)}>{ACTIVITIES.map((a) => <option key={a}>{a}</option>)}</select></Field>
        </div>
        <Field label="Note cliniche (una per riga)"><textarea rows={4} className="field resize-y" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="flex flex-col gap-2.5 border-t border-line2 pt-4">
          {([['consent_privacy', 'Consenso privacy firmato', 'GDPR art. 9 · trattamento dati sanitari'], ['consent_app', "Accesso all'app paziente", 'Link personale con piano e progressi'], ['consent_marketing', 'Comunicazioni dello studio', 'Newsletter e promemoria non clinici'], ['active', 'In percorso attivo', "Se disattivato, il paziente risulta archiviato"]] as const).map(([k, l, h]) => (
            <button key={k} role="checkbox" aria-checked={!!f[k]} onClick={() => set(k, !f[k])} className="flex gap-3 items-start border-0 bg-transparent p-0 text-left text-[13.5px]">
              <Checkbox on={!!f[k]} /><span><span className="font-medium">{l}</span><span className="block text-[12.5px] text-label">{h}</span></span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2.5 items-center border-t border-line2 pt-4">
        <button className="btn-secondary !text-err" onClick={del}>Elimina paziente</button>
        <button className="btn-secondary" onClick={onConsentPdf}>Modulo consenso PDF</button>
        <span className="flex-1" />
        <button className="btn-secondary px-4" onClick={onClose}>Annulla</button>
        <button className="btn-primary px-[18px]" onClick={save} disabled={!ok}>Salva modifiche</button>
      </div>
    </Modal>
  );
}
