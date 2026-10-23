import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useLoad } from '../app/store';
import * as repo from '../db/repo';
import type { PatientRow } from '../db/types';
import { Avatar, cx, Empty, Page, WaDot } from '../components/ui';
import { ago, daysBetween, fmtSmart, initials, n1, signed, today, waLink } from '../lib/format';
import { openExternal, saveFile } from '../lib/platform';

const PAGE = 20;
const GRID = 'grid grid-cols-[minmax(200px,2fr)_minmax(160px,1.2fr)_minmax(96px,1fr)_minmax(84px,.8fr)_minmax(84px,.9fr)_minmax(92px,.8fr)_minmax(112px,1fr)_14px] gap-2.5 px-5 items-center';
type F = 'all' | 'active' | 'recall' | 'pending' | 'draft';
const FILTERS: [F, string, (r: PatientRow) => boolean][] = [
  ['all', 'Tutti', () => true],
  ['active', 'In percorso', (r) => r.active],
  ['recall', 'Da ricontattare', (r) => r.active && !r.next_visit],
  ['pending', 'Pagamenti in sospeso', (r) => r.due > 0],
  ['draft', 'Piano da inviare', (r) => r.plan === 'ready' || r.plan === 'draft'],
];
type SortKey = 'name' | 'phone' | 'last' | 'next' | 'delta' | 'plan' | 'due';
const COLS: [SortKey, string][] = [['name', 'Paziente'], ['phone', 'Telefono'], ['last', 'Ultima visita'], ['next', 'Prossima'], ['delta', 'Peso · Δ'], ['plan', 'Piano'], ['due', 'Pagamenti']];
const KEY: Record<SortKey, (r: PatientRow) => string | number> = {
  name: (r) => `${r.first} ${r.last}`.toLowerCase(), phone: (r) => r.phone, last: (r) => r.last_visit ?? '', next: (r) => r.next_visit ?? '9999',
  delta: (r) => (r.kg ?? 0) - (r.kg_start ?? 0), plan: (r) => r.plan, due: (r) => r.due,
};

export const goalLabel = (r: { goal: string | null; target_kg: number | null; kg_start?: number | null }) => {
  const g = r.goal ?? '';
  if (r.target_kg && r.kg_start && r.kg_start - r.target_kg >= 1) return `${g} · −${Math.round(r.kg_start - r.target_kg)} kg`;
  return g;
};

export function PatientList() {
  const { go, toast } = useApp();
  const [rows] = useLoad(repo.listPatients);
  const [q, setQ] = useState('');
  const [f, setF] = useState<F>('all');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'last', dir: -1 });
  const [page, setPage] = useState(0);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); search.current?.focus(); search.current?.select(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => setPage(0), [q, f, sort]);

  const all = rows ?? [];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase(), d = s.replace(/\D/g, '');
    const fn = FILTERS.find((x) => x[0] === f)![2];
    const k = KEY[sort.k];
    return all.filter(fn)
      .filter((r) => !s || `${r.first} ${r.last}`.toLowerCase().includes(s) || (r.goal ?? '').toLowerCase().includes(s) || (r.email ?? '').toLowerCase().includes(s) || (d.length > 0 && r.phone.replace(/\D/g, '').includes(d)))
      .sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [all, q, f, sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  const activeN = all.filter((r) => r.active).length;

  const exportCsv = async () => {
    const head = ['ID', 'Nome', 'Cognome', 'Telefono', 'Email', 'Data di nascita', 'Codice fiscale', 'Obiettivo', 'Ultima visita', 'Prossima visita', 'Peso attuale', 'Peso iniziale', 'Piano', 'In sospeso (€)', 'Consenso privacy'];
    const planL = { on: 'Link attivo', off: 'Link revocato', ready: 'Salvato, da condividere', draft: 'In preparazione', none: '' };
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = list.map((r) => [r.code, r.first, r.last, r.phone, r.email, r.dob, r.cf, goalLabel(r), r.last_visit, r.next_visit, r.kg != null ? n1(r.kg) : '', r.kg_start != null ? n1(r.kg_start) : '', planL[r.plan], r.due || '', r.consent_privacy ? 'sì' : 'da firmare'].map(esc).join(';'));
    const path = await saveFile(`Pazienti_${today()}.csv`, '﻿' + [head.join(';'), ...lines].join('\r\n'), [{ name: 'CSV', extensions: ['csv'] }]);
    if (path) toast(`Esportati ${list.length} pazienti`);
  };

  return (
    <Page gap="gap-[18px]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div><h1 className="m-0 text-[28px] font-semibold tracking-[-.02em]">Pazienti</h1><div className="text-muted text-[13px] mt-0.5">{all.length} in archivio · {activeN} in percorso attivo</div></div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={!list.length}>Esporta CSV</button>
          <button className="btn-primary" onClick={() => go({ name: 'new' })} title="Ctrl+N">+ Nuovo paziente</button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-surface border border-ctl rounded-ctl px-3 w-[340px] focus-within:border-primary">
          <span className="w-3 h-3 rounded-full border-[1.8px] border-subtle flex-none" />
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, telefono, email…" className="flex-1 border-0 outline-none py-2.5 text-[13.5px] bg-transparent"
            onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); } if (e.key === 'Enter' && shown[0]) go({ name: 'patient', id: shown[0].id }); }} />
          {q && <button onClick={() => setQ('')} className="border-0 bg-transparent text-subtle text-base leading-none" aria-label="Cancella ricerca">×</button>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(([id, label, fn]) => {
            const n = all.filter(fn).length;
            return id === f ? (
              <button key={id} className="px-3 py-[7px] rounded-full border border-primary bg-primary text-on-primary text-[13px] font-semibold flex gap-[7px] items-center whitespace-nowrap flex-none">{label}<span className="font-mono text-[11px] font-medium text-[#BFD6CE]">{n}</span></button>
            ) : (
              <button key={id} onClick={() => setF(id)} className="px-3 py-[7px] rounded-full border border-ctl bg-surface text-ink2 text-[13px] font-medium flex gap-[7px] items-center whitespace-nowrap flex-none hover:border-sage-500">{label}<span className="font-mono text-[11px] font-medium text-subtle">{n}</span></button>
            );
          })}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className={cx(GRID, 'py-2.5 bg-surface2 border-b border-line2 th')}>
          {COLS.map(([id, label]) => (
            <button key={id} onClick={() => setSort((s) => ({ k: id, dir: s.k === id ? (-s.dir as 1 | -1) : 1 }))}
              className="bg-transparent border-0 p-0 text-left flex gap-[5px] items-center whitespace-nowrap uppercase tracking-[.05em] text-label hover:text-ink" style={{ font: 'inherit' }}>
              {label}<span className="text-accent">{sort.k === id ? (sort.dir > 0 ? '↑' : '↓') : ''}</span>
            </button>
          ))}
          <span />
        </div>
        {rows === undefined && <div className="h-40" />}
        {shown.map((r) => {
          const d = (r.kg ?? 0) - (r.kg_start ?? 0);
          const dd = r.last_visit ? daysBetween(r.last_visit, today()) : null;
          return (
            <div key={r.id} role="link" tabIndex={0} onClick={() => go({ name: 'patient', id: r.id })} onKeyDown={(e) => e.key === 'Enter' && go({ name: 'patient', id: r.id })}
              className={cx(GRID, 'py-3 border-b border-line2 text-[13.5px] row-hover cursor-pointer outline-none focus-visible:bg-surface2')}>
              <div className="flex gap-[11px] items-center min-w-0">
                <Avatar text={initials(r.first, r.last)} />
                <div className="min-w-0"><div className="font-semibold truncate">{r.first} {r.last}</div><div className="text-xs text-label truncate">{goalLabel(r) || '—'}</div></div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12.5px] text-ink2 whitespace-nowrap">{r.phone}</span>
                <span role="button" title="WhatsApp" onClick={(e) => { e.stopPropagation(); openExternal(waLink(r.phone)); }} className="w-[26px] h-[26px] rounded-[7px] bg-ok-bg grid place-items-center cursor-pointer hover:brightness-95 flex-none"><WaDot /></span>
              </div>
              <div>{r.last_visit ? <><div>{fmtSmart(r.last_visit)}</div><div className="text-xs text-label">{ago(dd!)}</div></> : <span className="text-subtle">—</span>}</div>
              <div>{r.next_visit ? <span>{fmtSmart(r.next_visit)}</span> : r.active ? <span className="pill-warn">Da fissare</span> : <span className="text-xs text-subtle">—</span>}</div>
              <div className="tabular-nums">
                {r.kg != null ? <><span className="font-semibold">{n1(r.kg)}</span> <span className="text-xs text-label">kg</span>
                  <div className={cx('text-xs font-medium', d < 0 ? 'text-ok' : 'text-label')}>{signed(d)} kg</div></> : <span className="text-subtle">—</span>}
              </div>
              <div>
                {r.plan === 'on' && <span className="pill-ok">Link attivo</span>}
                {r.plan === 'off' && <span className="pill-neutral">Link revocato</span>}
                {r.plan === 'ready' && <span className="pill-warn">Da condividere</span>}
                {r.plan === 'draft' && <span className="pill-neutral">In preparazione</span>}
                {r.plan === 'none' && <span className="text-xs text-subtle">—</span>}
              </div>
              <div>{r.due > 0 ? <span className="pill-warn">€ {r.due} in sospeso</span> : <span className="text-xs font-semibold text-ok">Saldato</span>}</div>
              <span className="text-subtle text-base text-right">›</span>
            </div>
          );
        })}
        {rows && !shown.length && (all.length
          ? <Empty title="Nessun paziente trovato" sub="Prova a cambiare ricerca o filtro." />
          : <Empty title="Ancora nessun paziente" sub="Crea la prima scheda per iniziare."><button className="btn-primary" onClick={() => go({ name: 'new' })}>+ Nuovo paziente</button></Empty>)}
        <div className="flex justify-between items-center px-5 py-3 text-[13px] text-muted">
          <span>{shown.length} di {list.length} mostrati · {all.length} totali</span>
          {pages > 1 && (
            <div className="flex gap-1 items-center">
              {Array.from({ length: pages }, (_, i) => i).filter((i) => pages <= 7 || i === 0 || i === pages - 1 || Math.abs(i - page) <= 1).map((i, k, arr) => (
                <span key={i} className="flex gap-1 items-center">
                  {k > 0 && i - arr[k - 1] > 1 && <span className="px-1.5 py-[5px]">…</span>}
                  <button onClick={() => setPage(i)} className={cx('px-2.5 py-[5px] rounded-[7px] border-0', i === page ? 'bg-strong text-surface font-semibold' : 'bg-transparent hover:bg-sunken')}>{i + 1}</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
