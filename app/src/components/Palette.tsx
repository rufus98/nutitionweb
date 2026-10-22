import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, type Route } from '../app/store';
import * as repo from '../db/repo';
import type { PatientRow } from '../db/types';
import { Avatar, cx, Modal } from './ui';
import { initials } from '../lib/format';

/** Ricerca rapida (Ctrl+K): pazienti e azioni frequenti. */
export function Palette({ onClose }: { onClose: () => void }) {
  const { go } = useApp();
  const [q, setQ] = useState('');
  const [list, setList] = useState<PatientRow[]>([]);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { repo.listPatients().then(setList); }, []);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase(), d = s.replace(/\D/g, '');
    const all: { label: string; hint: string; route: Route }[] = [
      { label: 'Nuovo paziente', hint: 'Ctrl+N', route: { name: 'new' } },
      { label: 'Nuovo appuntamento', hint: 'Agenda', route: { name: 'agenda', book: true } },
      { label: 'Registra pagamento', hint: 'Pagamenti', route: { name: 'payments', register: true } },
    ];
    const actions = all.filter((a) => !s || a.label.toLowerCase().includes(s));
    const pts = list.filter((p) => !s || `${p.first} ${p.last}`.toLowerCase().includes(s) || (p.goal ?? '').toLowerCase().includes(s) || (d.length > 2 && p.phone.replace(/\D/g, '').includes(d)))
      .slice(0, 8).map((p) => ({ label: `${p.first} ${p.last}`, hint: p.goal ?? '', route: { name: 'patient', id: p.id } as Route, p }));
    return [...pts, ...actions] as { label: string; hint: string; route: Route; p?: PatientRow }[];
  }, [q, list]);

  useEffect(() => setI(0), [q]);
  useEffect(() => { ref.current?.querySelector('[data-sel="1"]')?.scrollIntoView({ block: 'nearest' }); }, [i]);
  const pick = (k: number) => { const it = items[k]; if (it) { onClose(); go(it.route); } };

  return (
    <Modal onClose={onClose} width={560}>
      <div className="-m-6 flex flex-col">
        <div className="flex items-center gap-2.5 px-5 border-b border-line2">
          <span className="w-3 h-3 rounded-full border-[1.8px] border-subtle flex-none" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca paziente, telefono o azione…"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); pick(i); }
            }}
            className="flex-1 border-0 outline-none py-4 text-[15px] bg-transparent" />
          <span className="kbd">Esc</span>
        </div>
        <div ref={ref} className="max-h-[360px] overflow-auto p-2">
          {items.length === 0 && <div className="p-6 text-center text-muted text-[13px]">Nessun risultato</div>}
          {items.map((it, k) => (
            <button key={k} data-sel={k === i ? '1' : '0'} onMouseEnter={() => setI(k)} onClick={() => pick(k)}
              className={cx('w-full flex items-center gap-3 px-3 py-2 rounded-ctl border-0 text-left', k === i ? 'bg-tint' : 'bg-transparent')}>
              {it.p ? <Avatar text={initials(it.p.first, it.p.last)} size={30} /> : <span className="w-[30px] h-[30px] rounded-full bg-sunken grid place-items-center text-accent font-semibold">+</span>}
              <span className="flex-1 min-w-0"><span className="block font-medium truncate">{it.label}</span><span className="block text-xs text-label truncate">{it.hint}</span></span>
              {k === i && <span className="kbd">↵</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export const SHORTCUTS: [string, string][] = [
  ['Ctrl+K', 'Cerca paziente o azione'],
  ['Ctrl+N', 'Nuovo paziente'],
  ['Ctrl+1 … 6', 'Oggi, Pazienti, Agenda, Piani, Pagamenti, Impostazioni'],
  ['Ctrl+F', 'Cerca nella pagina (elenchi)'],
  ['Ctrl+S', 'Salva (impostazioni, piano)'],
  ['Ctrl+Invio', 'Conferma il modulo aperto'],
  ['Alt+←', 'Torna alla schermata precedente'],
  ['Esc', 'Chiudi finestra o pannello'],
  ['F1', 'Mostra queste scorciatoie'],
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} width={460}>
      <div className="flex justify-between items-start"><div className="text-[19px] font-semibold">Scorciatoie da tastiera</div><button className="btn-x" onClick={onClose}>×</button></div>
      <div className="grid grid-cols-[130px_1fr] gap-y-2.5 text-[13.5px]">
        {SHORTCUTS.map(([k, d]) => (<Fragment key={k}><span className="font-mono text-[12.5px] text-accent">{k}</span><span>{d}</span></Fragment>))}
      </div>
    </Modal>
  );
}
