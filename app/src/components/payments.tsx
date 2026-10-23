import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import * as repo from '../db/repo';
import { PAYMENT_METHODS } from '../db/defaults';
import type { Payment, Settings } from '../db/types';
import { fillTemplate, fmtShort, num, today, waLink } from '../lib/format';
import { invoicePdf } from '../lib/documents';
import { openExternal, saveFile } from '../lib/platform';
import { cx, Field, Modal, ModalHeader, Segmented } from './ui';

/** Salva la fattura in PDF. */
export async function downloadInvoice(p: Payment, settings: Settings) {
  const name = `Fattura_${(p.invoice ?? '').replace(/\W+/g, '-')}_${p.name.split(' ').slice(-1)[0] ?? ''}.pdf`;
  return saveFile(name, invoicePdf(p, settings), [{ name: 'PDF', extensions: ['pdf'] }]);
}

/** Sollecito su WhatsApp con il modello "Sollecito pagamento" delle impostazioni. */
export function remindPayment(p: Payment, settings: Settings) {
  const first = (p.name ?? '').split(' ')[0];
  const text = fillTemplate(settings.tpl[2] ?? '', { nome: first, importo: String(p.amount), data: fmtShort(p.date), studio: settings.prof.name || 'lo studio' });
  return openExternal(waLink(p.phone ?? '', text));
}

/** Modale "Registra pagamento" (dal design Pagamenti); le prestazioni arrivano dalle tariffe in Impostazioni. */
export function RegisterPayment({ onClose, patientId }: { onClose: () => void; patientId?: number }) {
  const { settings, toast, bump } = useApp();
  const rates = settings?.rates ?? [];
  const [patients, setPatients] = useState<{ id: number; name: string }[]>([]);
  const [f, setF] = useState({ pid: patientId ?? 0, svc: Math.min(1, rates.length - 1), amount: String(rates[1]?.price ?? rates[0]?.price ?? ''), method: 'POS', paid: true, date: today() });
  useEffect(() => {
    repo.listPatients().then((l) => {
      const ps = l.map((p) => ({ id: p.id, name: `${p.first} ${p.last}` })).sort((a, b) => a.name.localeCompare(b.name));
      setPatients(ps);
      setF((x) => (x.pid ? x : { ...x, pid: ps[0]?.id ?? 0 }));
    });
  }, []);
  const amt = num(f.amount);
  const ok = f.pid && !isNaN(amt) && amt > 0 && rates[f.svc];

  const save = async () => {
    if (!ok) return;
    const inv = await repo.addPayment({ patient_id: f.pid, date: f.date, description: rates[f.svc].name, method: f.method, amount: amt, paid: f.paid });
    bump();
    toast(f.paid ? `Pagamento registrato · fattura ${inv} emessa` : 'Pagamento registrato come in sospeso');
    onClose();
  };

  return (
    <Modal onClose={onClose} width={460}>
      <div className="-mt-1 flex flex-col gap-3.5" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save(); }}>
        <ModalHeader title="Registra pagamento" onClose={onClose} />
        <Field label="Paziente">
          <select className="field" value={f.pid} onChange={(e) => setF({ ...f, pid: +e.target.value })} disabled={!!patientId}>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="flex flex-col gap-1.5"><span className="label">Prestazione</span>
          <div className="grid grid-cols-2 gap-1.5">
            {rates.map((r, i) => (
              <button key={i} onClick={() => setF({ ...f, svc: i, amount: String(r.price) })}
                className={cx('px-2.5 py-[9px] rounded-ctl text-[13px] text-left flex justify-between gap-2',
                  i === f.svc ? 'border-[1.5px] border-primary bg-tint2 font-semibold text-strong' : 'border border-ctl bg-surface font-medium hover:border-sage-500')}>
                <span className="truncate">{r.name}</span><span className={i === f.svc ? '' : 'text-label'}>€ {r.price}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Importo">
            <div className="unit-field"><span className="text-subtle">€</span><input inputMode="decimal" className="!px-1.5" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
          </Field>
          <Field label="Metodo">
            <select className="field" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </Field>
        </div>
        <Segmented options={[{ v: 'paid', l: 'Saldato · emetti fattura' }, { v: 'pending', l: 'In sospeso' }]} value={f.paid ? 'paid' : 'pending'} onChange={(v) => setF({ ...f, paid: v === 'paid' })} />
        <div className="flex gap-2.5 justify-end pt-1">
          <button className="btn-secondary px-4" onClick={onClose}>Annulla</button>
          <button className="btn-primary px-[18px]" onClick={save} disabled={!ok} title="Ctrl+Invio">Registra</button>
        </div>
      </div>
    </Modal>
  );
}
