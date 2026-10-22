import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useLoad, type Route } from '../app/store';
import * as repo from '../db/repo';
import { METHOD_COLORS } from '../db/defaults';
import { cx, Page } from '../components/ui';
import { downloadInvoice, RegisterPayment, remindPayment } from '../components/payments';
import { daysBetween, eur, fmtShort, iso, MO, MONTHS_CAP, today } from '../lib/format';
import { saveFile } from '../lib/platform';

const G = 'grid grid-cols-[96px_minmax(180px,1.4fr)_minmax(160px,1.6fr)_100px_100px_130px_130px] gap-2.5 px-5';
type F = 'all' | 'paid' | 'pending';

export function Payments({ route }: { route: Extract<Route, { name: 'payments' }> }) {
  const { go, toast, bump, settings } = useApp();
  const [rows] = useLoad(() => repo.listPayments(), []);
  const [f, setF] = useState<F>('all');
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<number | null>(null);
  const [modal, setModal] = useState(!!route.register);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); search.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const R = rows ?? [];
  const t = today(), ym = t.slice(0, 7), year = t.slice(0, 4), mi = +t.slice(5, 7) - 1;
  const prevYm = iso(new Date(+year, mi - 1, 1)).slice(0, 7);
  const month = R.filter((r) => r.date.startsWith(ym));
  const mIn = month.filter((r) => r.paid).reduce((a, r) => a + r.amount, 0);
  // Confronto con lo stesso periodo (stessi giorni) del mese precedente.
  const prevSame = R.filter((r) => r.paid && r.date.startsWith(prevYm) && +r.date.slice(8) <= +t.slice(8)).reduce((a, r) => a + r.amount, 0);
  const due = R.filter((r) => !r.paid);
  const oldest = due.map((r) => r.date).sort()[0];
  const months = Array.from({ length: 12 }, (_, i) => (i > mi ? null : R.filter((r) => r.paid && r.date.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`)).reduce((a, r) => a + r.amount, 0)));
  const max = Math.max(1, ...months.map((v) => v ?? 0));
  const yearIn = months.reduce<number>((a, v) => a + (v ?? 0), 0);
  const byM: Record<string, number> = {};
  month.filter((r) => r.paid).forEach((r) => { byM[r.method] = (byM[r.method] ?? 0) + r.amount; });
  const methods = Object.entries(byM).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v, c: METHOD_COLORS[l] ?? '#C9B99A', pct: Math.round((v / Math.max(1, mIn)) * 100) }));
  const FILTERS: [F, string, (r: typeof R[number]) => boolean][] = [['all', 'Tutti', () => true], ['paid', 'Saldati', (r) => r.paid], ['pending', 'In sospeso', (r) => !r.paid]];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return R.filter(FILTERS.find((x) => x[0] === f)![2]).filter((r) => !s || (r.name ?? '').toLowerCase().includes(s) || (r.invoice ?? '').toLowerCase().includes(s) || r.description.toLowerCase().includes(s));
  }, [R, f, q]);
  const hv = hover != null && months[hover] != null ? `${MONTHS_CAP[hover]}: € ${eur(months[hover]!)}${hover === mi ? ' (in corso)' : ''}` : 'Passa sopra le barre per i dettagli';

  const exportAccountant = async () => {
    const yr = R.filter((r) => r.date.startsWith(year));
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Data', 'Numero fattura', 'Paziente', 'Codice fiscale', 'Prestazione', 'Metodo', 'Importo', 'Bollo', 'Stato'];
    const pts = new Map((await repo.listPatients()).map((p) => [p.id, p]));
    const lines = yr.map((r) => [r.date, r.invoice, r.name, pts.get(r.patient_id)?.cf, r.description, r.method, r.amount.toFixed(2).replace('.', ','),
      settings?.bill.bollo && r.amount > 77.47 && r.paid ? '2,00' : '', r.paid ? 'Saldato' : 'In sospeso'].map(esc).join(';'));
    const path = await saveFile(`Movimenti_${year}_commercialista.csv`, '﻿' + [head.join(';'), ...lines].join('\r\n'), [{ name: 'CSV', extensions: ['csv'] }]);
    if (path) toast(`Esportati ${yr.length} movimenti del ${year}`);
  };

  return (
    <Page gap="gap-[18px]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div><h1 className="m-0 text-[28px] font-semibold tracking-[-.02em]">Pagamenti</h1><div className="text-muted text-[13px] mt-0.5">{MONTHS_CAP[mi]} {year} · aggiornato oggi</div></div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportAccountant}>Esporta per commercialista</button>
          <button className="btn-primary" onClick={() => setModal(true)}>+ Registra pagamento</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="card rounded-[14px] px-4 py-3.5 flex flex-col gap-1.5"><div className="label">Incassato {MONTHS_CAP[mi].toLowerCase()}</div><div className="text-2xl font-semibold tracking-[-.02em]">€ {eur(mIn)}</div>
          <div className={cx('text-xs font-medium', mIn >= prevSame ? 'text-ok' : 'text-label')}>{prevSame ? `${mIn >= prevSame ? '+' : '−'}${Math.abs(Math.round((mIn / prevSame - 1) * 100))}% vs stesso periodo di ${MO[(mi + 11) % 12]}` : 'primo mese con incassi'}</div></div>
        <div className="rounded-[14px] px-4 py-3.5 flex flex-col gap-1.5 border warn-card"><div className="label !text-warn">Da incassare</div><div className="text-2xl font-semibold tracking-[-.02em] text-warn">€ {eur(due.reduce((a, r) => a + r.amount, 0))}</div>
          <div className="text-xs text-warn font-medium">{due.length ? `${due.length} pagament${due.length === 1 ? 'o' : 'i'} · il più vecchio ${daysBetween(oldest, t)} gg` : 'nessun pagamento in sospeso'}</div></div>
        <div className="card rounded-[14px] px-4 py-3.5 flex flex-col gap-1.5"><div className="label">Incassato {year}</div><div className="text-2xl font-semibold tracking-[-.02em]">€ {eur(yearIn)}</div><div className="text-xs text-muted">gen – {MO[mi]}</div></div>
        <div className="card rounded-[14px] px-4 py-3.5 flex flex-col gap-1.5"><div className="label">Fatture emesse</div><div className="text-2xl font-semibold tracking-[-.02em]">{month.filter((r) => r.invoice).length}</div><div className="text-xs text-muted">{MONTHS_CAP[mi].toLowerCase()}{settings?.bill.sdi ? ' · da trasmettere a SdI' : ''}</div></div>
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-5 items-stretch">
        <div className="card px-[22px] py-[18px] flex flex-col gap-3.5">
          <div className="flex justify-between items-baseline"><div className="font-semibold text-base">Incassi mensili</div><div className="text-xs text-label">{hv}</div></div>
          <div onMouseLeave={() => setHover(null)} className="grid grid-cols-12 gap-2.5 items-end h-[170px]">
            {months.map((v, i) => (
              <div key={i} onMouseEnter={() => setHover(i)} className="h-full flex flex-col justify-end items-center gap-1.5">
                {v == null ? <div className="w-full h-1 rounded-sm bg-line2" />
                  : <div className={cx('w-full rounded-t-md rounded-b-sm transition-colors', i === mi ? 'bg-primary' : hover === i ? 'bg-sage-500' : 'bg-sage-bar')} style={{ height: Math.max(3, Math.round((v / max) * 100)) + '%' }} />}
                <span className="font-mono text-[11px] text-subtle">{MO[i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card px-5 py-[18px] flex flex-col gap-3">
          <div className="font-semibold text-base">Metodi · {MONTHS_CAP[mi].toLowerCase()}</div>
          <div className="flex h-2.5 rounded-[5px] overflow-hidden gap-0.5">{methods.map((m) => <div key={m.l} style={{ width: m.pct + '%', background: m.c }} />)}{!methods.length && <div className="flex-1 bg-line2" />}</div>
          {methods.map((m) => (
            <div key={m.l} className="flex items-center gap-2.5 text-[13px]"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: m.c }} /><span className="flex-1">{m.l}</span><span className="tabular-nums font-semibold">€ {eur(m.v)}</span><span className="font-mono text-xs text-label w-9 text-right">{m.pct}%</span></div>
          ))}
          {!methods.length && <div className="text-[13px] text-label">Nessun incasso questo mese.</div>}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-surface border border-ctl rounded-ctl px-3 w-[300px] focus-within:border-primary">
          <span className="w-3 h-3 rounded-full border-[1.8px] border-subtle flex-none" />
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca paziente o n. fattura…" className="flex-1 border-0 outline-none py-2.5 text-[13.5px] bg-transparent" onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); } }} />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map(([id, label, fn]) => id === f
            ? <button key={id} className="px-3 py-[7px] rounded-full border border-primary bg-primary text-on-primary text-[13px] font-semibold flex gap-[7px] items-center whitespace-nowrap">{label}<span className="font-mono text-[11px] font-medium text-[#BFD6CE]">{R.filter(fn).length}</span></button>
            : <button key={id} onClick={() => setF(id)} className="px-3 py-[7px] rounded-full border border-ctl bg-surface text-ink2 text-[13px] font-medium flex gap-[7px] items-center whitespace-nowrap hover:border-sage-500">{label}<span className="font-mono text-[11px] font-medium text-subtle">{R.filter(fn).length}</span></button>)}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className={cx(G, 'py-2.5 bg-surface2 border-b border-line2 th whitespace-nowrap')}><span>Data</span><span>Paziente</span><span>Descrizione</span><span>Metodo</span><span className="text-right">Importo</span><span className="pl-3.5">Stato</span><span className="text-right">Documento</span></div>
        {list.map((r) => {
          const d = daysBetween(r.date, t);
          return (
            <div key={r.id} className={cx(G, 'py-3 border-b border-line2 items-center text-[13.5px] row-hover')}>
              <span className="whitespace-nowrap">{r.date.startsWith(year) ? fmtShort(r.date) : fmtShort(r.date) + ' ' + r.date.slice(2, 4)}</span>
              <a onClick={() => go({ name: 'patient', id: r.patient_id, tab: 'pay' })} className="!text-ink font-medium truncate">{r.name}</a>
              <span className="text-ink2 truncate">{r.description}</span>
              <span className="text-muted">{r.method}</span>
              <span className="text-right font-semibold tabular-nums">€ {eur(r.amount)}</span>
              <span className="pl-3.5">{r.paid ? <span className="pill-ok">Saldato</span>
                : <button title="Segna come saldato" className="pill-warn border-0 hover:brightness-95" onClick={async () => { const inv = await repo.markPaid(r.id); bump(); toast(`Saldato · fattura ${inv} emessa`); }}>{d <= 0 ? 'In sospeso · oggi' : `In sospeso · ${d} gg`}</button>}</span>
              <span className="text-right whitespace-nowrap">{r.paid
                ? <a className="text-[13px] font-medium" onClick={async () => { if (await downloadInvoice(r, settings!)) toast('Fattura salvata'); }} title="Scarica fattura PDF"><span className="font-mono text-[11.5px] text-subtle mr-1.5">{r.invoice}</span>↓</a>
                : <a className="text-[13px] font-medium !text-warn" onClick={() => remindPayment(r, settings!)}>Sollecita</a>}</span>
            </div>
          );
        })}
        {rows && !list.length && <div className="py-10 px-5 text-center text-muted text-[13px]">Nessun pagamento trovato.</div>}
        <div className="flex justify-between items-center px-5 py-3 text-[13px] text-muted"><span>{list.length} movimenti</span><span className="font-semibold text-ink">Totale filtrato € {eur(list.reduce((a, r) => a + r.amount, 0))}</span></div>
      </div>
      {modal && <RegisterPayment patientId={route.patientId} onClose={() => setModal(false)} />}
    </Page>
  );
}
