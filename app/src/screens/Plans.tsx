import { useMemo, useState } from 'react';
import { useApp, useLoad } from '../app/store';
import * as repo from '../db/repo';
import { Avatar, cx, Empty, Page } from '../components/ui';
import { fmtSmart, initialsOf } from '../lib/format';

type F = 'all' | 'on' | 'draft' | 'off' | 'none';

async function load() {
  const [plans, patients] = await Promise.all([repo.listAllPlans(), repo.listPatients()]);
  const withPlan = new Set(plans.map((p) => p.patient_id));
  return { plans, missing: patients.filter((p) => p.active && !withPlan.has(p.id)) };
}

/** "Piani nutrizionali": tutti i piani in un elenco (non presente nel design originale, costruita con lo stesso linguaggio visivo). */
export function Plans() {
  const { go } = useApp();
  const [data] = useLoad(load, []);
  const [f, setF] = useState<F>('all');
  const [q, setQ] = useState('');
  const plans = data?.plans ?? [], missing = data?.missing ?? [];
  const state = (p: typeof plans[number]): F => (p.status === 'draft' ? 'draft' : p.link_on ? 'on' : 'off');
  const FILTERS: [F, string, number][] = [['all', 'Tutti', plans.length], ['on', 'Link attivo', plans.filter((p) => state(p) === 'on').length], ['draft', 'Bozze da inviare', plans.filter((p) => p.status === 'draft').length], ['off', 'Link revocato', plans.filter((p) => state(p) === 'off').length], ['none', 'Pazienti senza piano', missing.length]];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return plans.filter((p) => f === 'all' || state(p) === f).filter((p) => !s || p.name.toLowerCase().includes(s) || p.data.title.toLowerCase().includes(s));
  }, [plans, f, q]);
  const G = 'grid grid-cols-[minmax(200px,1.6fr)_minmax(200px,1.6fr)_110px_110px_120px_14px] gap-3 px-5 items-center';

  return (
    <Page gap="gap-[18px]">
      <div><h1 className="m-0 text-[28px] font-semibold tracking-[-.02em]">Piani nutrizionali</h1><div className="text-muted text-[13px] mt-0.5">{plans.filter((p) => p.status === 'published').length} pubblicati · {plans.filter((p) => p.status === 'draft').length} in bozza</div></div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-surface border border-ctl rounded-ctl px-3 w-[300px] focus-within:border-primary">
          <span className="w-3 h-3 rounded-full border-[1.8px] border-subtle flex-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca paziente o piano…" className="flex-1 border-0 outline-none py-2.5 text-[13.5px] bg-transparent" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(([id, label, n]) => id === f
            ? <button key={id} className="px-3 py-[7px] rounded-full border border-primary bg-primary text-on-primary text-[13px] font-semibold flex gap-[7px] items-center whitespace-nowrap">{label}<span className="font-mono text-[11px] font-medium text-[#BFD6CE]">{n}</span></button>
            : <button key={id} onClick={() => setF(id)} className="px-3 py-[7px] rounded-full border border-ctl bg-surface text-ink2 text-[13px] font-medium flex gap-[7px] items-center whitespace-nowrap hover:border-sage-500">{label}<span className="font-mono text-[11px] font-medium text-subtle">{n}</span></button>)}
        </div>
      </div>

      {f === 'none' ? (
        <div className="card overflow-hidden">
          {missing.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3 border-b border-line2 row-hover">
              <Avatar text={initialsOf(`${p.first} ${p.last}`)} />
              <div className="flex-1 min-w-0"><div className="font-semibold truncate">{p.first} {p.last}</div><div className="text-xs text-label truncate">{p.goal || '—'}</div></div>
              <button className="btn-primary py-2" onClick={() => go({ name: 'patient', id: p.id, tab: 'diet' })}>Prepara piano →</button>
            </div>
          ))}
          {!missing.length && <Empty title="Tutti i pazienti attivi hanno un piano" />}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className={cx(G, 'py-2.5 bg-surface2 border-b border-line2 th')}><span>Paziente</span><span>Piano</span><span>Stato</span><span>Aggiornato</span><span>Documento</span><span /></div>
          {list.map((p) => {
            const st = state(p);
            return (
              <div key={p.id} role="link" tabIndex={0} onClick={() => go({ name: 'patient', id: p.patient_id, tab: 'diet' })} onKeyDown={(e) => e.key === 'Enter' && go({ name: 'patient', id: p.patient_id, tab: 'diet' })}
                className={cx(G, 'py-3 border-b border-line2 text-[13.5px] row-hover cursor-pointer outline-none focus-visible:bg-surface2')}>
                <div className="flex gap-[11px] items-center min-w-0"><Avatar text={initialsOf(p.name)} /><span className="font-semibold truncate">{p.name}</span></div>
                <div className="min-w-0"><div className="truncate">v{p.version}{p.data.title ? ' · ' + p.data.title : ''}</div><div className="text-xs text-label">{p.data.kcal ? p.data.kcal.toLocaleString('it-IT') + ' kcal · ' : ''}{p.data.days.length} giorni</div></div>
                <div>{st === 'on' ? <span className="pill-ok">Link attivo</span> : st === 'draft' ? <span className="pill-neutral">Non inviato</span> : <span className="pill-neutral">Link revocato</span>}</div>
                <span>{fmtSmart(p.published_at ?? p.created_at)}</span>
                <span className="text-xs text-label truncate">{p.has_pdf ? <span className="font-mono text-[11px] font-semibold text-accent border-[1.5px] border-accent rounded-[3px] px-[3px] py-px mr-1.5">PDF</span> : null}{p.has_pdf ? 'originale' : '—'}</span>
                <span className="text-subtle text-base text-right">›</span>
              </div>
            );
          })}
          {data && !list.length && <Empty title="Nessun piano trovato" sub={plans.length ? 'Prova a cambiare ricerca o filtro.' : 'Carica il primo piano dalla scheda di un paziente.'} />}
        </div>
      )}
    </Page>
  );
}
