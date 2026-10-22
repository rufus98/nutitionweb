import { useState } from 'react';
import { useApp } from '../../app/store';
import * as repo from '../../db/repo';
import type { Patient, Visit } from '../../db/types';
import { Drawer, Field, UnitInput } from '../../components/ui';
import { fmtShort, numOrNull, numStr, today } from '../../lib/format';

const FF: [keyof Visit, string, string][] = [['kg', 'Peso', 'kg'], ['fat', 'Massa grassa', '%'], ['vita', 'Vita', 'cm'], ['fianchi', 'Fianchi', 'cm'], ['torace', 'Torace', 'cm'], ['braccio', 'Braccio', 'cm'], ['coscia', 'Coscia', 'cm'], ['polso', 'Polso', 'cm']];
const TYPES = ['Prima visita', 'Controllo', 'Controllo + nuovo piano', 'Visita online', 'Misure iniziali'];

/** Pannello "Nuova visita" (anche per modificare una visita esistente). */
export function VisitDrawer({ patient, visits, visit, onClose }: { patient: Patient; visits: Visit[]; visit: Visit | null; onClose: () => void }) {
  const { bump, toast, confirm } = useApp();
  const last = [...visits].reverse().find((v) => v.kg != null);
  const [f, setF] = useState<Record<string, string>>(() => visit
    ? { date: visit.date, type: visit.type, note: visit.note ?? '', goal: visit.goal ?? '', ...Object.fromEntries(FF.map(([k]) => [k, numStr(visit[k] as number | null)])) }
    : { date: today(), type: visits.length ? 'Controllo' : 'Prima visita', note: '', goal: '' });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    const vals = Object.fromEntries(FF.map(([k]) => [k, numOrNull(f[k])]));
    const v = { patient_id: patient.id, date: f.date || today(), type: f.type, note: f.note || null, goal: f.goal || null, ...vals } as any;
    if (visit) await repo.updateVisit(visit.id, v);
    else await repo.addVisit(v);
    bump();
    toast(visit ? 'Visita aggiornata' : 'Visita salvata · grafico e misure aggiornati');
    onClose();
  };
  const del = async () => {
    if (!visit) return;
    if (await confirm({ title: 'Eliminare la visita?', body: `La visita del ${fmtShort(visit.date)} e le misure registrate verranno eliminate.`, ok: 'Elimina', danger: true })) {
      await repo.deleteVisit(visit.id);
      bump();
      toast('Visita eliminata');
      onClose();
    }
  };

  return (
    <Drawer onClose={onClose} title={visit ? 'Modifica visita' : 'Nuova visita'}
      sub={`${patient.first} ${patient.last}${last ? ' · ultima visita ' + fmtShort(last.date) : ''}`}
      footer={<>
        {visit && <button className="btn-secondary px-4 mr-auto !text-err" onClick={del}>Elimina</button>}
        <button className="btn-secondary px-4" onClick={onClose}>Annulla</button>
        <button className="btn-primary px-[18px]" onClick={save} title="Ctrl+Invio">Salva visita</button>
      </>}>
      <div className="contents" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); } }}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Data visita"><input type="date" className="field" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Tipo"><select className="field" value={f.type} onChange={(e) => set('type', e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        </div>
        <div className="label -mb-2">Parametri antropometrici</div>
        <div className="grid grid-cols-2 gap-2.5">
          {FF.map(([k, label, unit], i) => (
            <label key={k} className="flex flex-col gap-[5px]"><span className="text-[12.5px] text-ink2">{label}</span>
              <UnitInput value={f[k] ?? ''} onChange={(v) => set(k, v)} unit={unit} autoFocus={i === 0} placeholder={last && last[k] != null ? numStr(last[k] as number) : ''} /></label>
          ))}
        </div>
        <Field label="Note anamnestiche"><textarea rows={4} className="field resize-y" placeholder="Aderenza, sintomi, sonno, variazioni terapia…" value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
        <Field label="Obiettivi prossimo periodo"><input className="field" placeholder="Es. −1,5 kg, 8.000 passi/giorno" value={f.goal} onChange={(e) => set('goal', e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}
