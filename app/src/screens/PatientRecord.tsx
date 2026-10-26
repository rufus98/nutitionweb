import { useState } from 'react';
import { useApp, useLoad } from '../app/store';
import * as repo from '../db/repo';
import type { Patient, Payment, Visit } from '../db/types';
import { Avatar, Breadcrumb, cx, Empty, Page, Segmented, WaDot } from '../components/ui';
import { WeightChart } from '../components/WeightChart';
import { downloadInvoice, RegisterPayment, remindPayment } from '../components/payments';
import { VisitDrawer } from './patient/VisitDrawer';
import { EditPatient } from './patient/EditPatient';
import { DietTab } from './patient/DietTab';
import { AppAccessCard } from './patient/AppAccess';
import { ShareModal } from './patient/ShareModal';
import { ageFrom, bmiCategory, bmiOf, eur, fmtDate, fmtShort, fmtSmart, initials, n1, signed, telLink, today, waLink } from '../lib/format';
import { openExternal, saveFile } from '../lib/platform';
import { consentPdf } from '../lib/documents';

type Tab = 'overview' | 'visits' | 'diet' | 'pay';
const KEYS = ['vita', 'fianchi', 'torace', 'braccio', 'coscia'] as const;
const LBL: Record<string, string> = { vita: 'Vita', fianchi: 'Fianchi', torace: 'Torace', braccio: 'Braccio', coscia: 'Coscia' };

async function loadAll(id: number) {
  const [p, visits, pays, plans, appts] = await Promise.all([repo.getPatientRow(id), repo.listVisits(id), repo.listPayments(id), repo.listPlans(id), repo.patientAppointments(id)]);
  return { p, visits, pays, plans, appts };
}

export function PatientRecord({ id, tab: initialTab, action }: { id: number; tab?: Tab; action?: 'visit' }) {
  const { go, toast, bump, settings, confirm } = useApp();
  const [data] = useLoad(() => loadAll(id), [id]);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const [drawer, setDrawer] = useState<Visit | 'new' | null>(action === 'visit' ? 'new' : null);
  const [edit, setEdit] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [share, setShare] = useState(false);
  const [mode, setMode] = useState<'cm' | 'pct'>('cm');

  if (!data) return <Page><div /></Page>;
  const { p, visits, pays, plans, appts } = data;
  if (!p) return <Page><Empty title="Paziente non trovato" sub="Potrebbe essere stato eliminato."><button className="btn-secondary" onClick={() => go({ name: 'patients' })}>Torna all'elenco</button></Empty></Page>;

  const name = `${p.first} ${p.last}`;
  const kgV = visits.filter((v) => v.kg != null);
  const f0 = kgV[0], fl = kgV[kgV.length - 1], prev = kgV[kgV.length - 2];
  const age = ageFrom(p.dob);
  const active = plans.find((x) => x.status === 'published');
  const draft = plans.find((x) => x.status === 'draft');
  const nextAppt = appts.find((a) => a.date >= today());

  const markConsent = async () => {
    if (await confirm({ title: 'Registrare il consenso firmato?', body: `Conferma di aver ricevuto l'informativa privacy firmata da ${name}.`, ok: 'Registra consenso' })) {
      await repo.updatePatient(p.id, { consent_privacy: true });
      bump();
      toast('Consenso privacy registrato');
    }
  };

  const tabs: [Tab, string, string | number][] = [['overview', 'Overview', '—'], ['visits', 'Visite & Misure', visits.length], ['diet', 'Piano nutrizionale', active ? 'v' + active.version : draft ? (draft.saved_at ? 'salvato' : 'bozza') : '—'], ['pay', 'Pagamenti', pays.length]];

  return (
    <Page pt="pt-5">
      <div className="flex items-center justify-between gap-4">
        <Breadcrumb items={[{ label: 'Pazienti', onClick: () => go({ name: 'patients' }) }, { label: name }]} />
        <button onClick={() => window.dispatchEvent(new Event('open-palette'))} className="flex items-center gap-2 bg-surface border border-line rounded-ctl px-3 py-2 w-[320px] text-subtle text-[13px] text-left hover:border-ctl">
          <span className="flex-1">Cerca paziente, visita, piano…</span><span className="kbd">Ctrl K</span>
        </button>
      </div>

      <section className="card px-6 py-[22px] flex items-center gap-5 flex-wrap">
        <Avatar text={initials(p.first, p.last)} size={64} />
        <div className="flex-1 min-w-[260px] flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="m-0 text-[26px] font-semibold tracking-[-.02em] selectable">{name}</h1>
            {p.active ? <span className="pill-ok">In percorso</span> : <span className="pill-neutral">Archiviato</span>}
            {!p.consent_privacy && <button onClick={markConsent} title="Segna il consenso come firmato" className="pill-warn border-0">Consenso da firmare</button>}
          </div>
          <div className="text-muted text-[13px]">
            {[age != null ? age + ' anni' : null, p.sex, p.height ? p.height + ' cm' : null, 'Paziente dal ' + fmtDate(p.created_at)].filter(Boolean).join(' · ')} · ID <span className="font-mono selectable">{p.code}</span>
          </div>
          <div className="flex gap-1.5 flex-wrap mt-0.5">
            {p.tags.map((t) => <span key={t} className="tag">{t}</span>)}
            {p.target_kg && <span className="text-xs px-[9px] py-[3px] rounded-tag bg-tint2 text-accent">Obiettivo {n1(p.target_kg).replace(',0', '')} kg</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-mono text-[13px] font-medium text-ink2 pr-1.5 selectable">{p.phone}</div>
          <button className="btn-wa" onClick={() => openExternal(waLink(p.phone))}><WaDot />WhatsApp</button>
          <button className="btn-secondary py-[9px]" onClick={() => openExternal(telLink(p.phone))}>Chiama</button>
          {p.email && <button className="btn-secondary py-[9px]" onClick={() => openExternal('mailto:' + p.email)}>Email</button>}
          <button className="btn-primary" onClick={() => setDrawer('new')}>+ Nuova visita</button>
        </div>
      </section>

      <div className="flex gap-1 border-b border-line" role="tablist">
        {tabs.map(([tid, label, count]) => (
          <button key={tid} role="tab" aria-selected={tab === tid} onClick={() => setTab(tid)}
            className={cx('bg-transparent border-0 border-b-2 -mb-px px-3.5 py-2.5 text-sm flex gap-2 items-center', tab === tid ? 'border-primary font-semibold text-strong' : 'border-transparent font-medium text-[rgb(var(--muted))] hover:text-ink')}>
            {label}<span className={cx('font-mono text-[11px] font-medium rounded-[5px] px-1.5 py-px', tab === tid ? 'text-accent bg-tint2' : 'text-subtle bg-sunken')}>{count}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] gap-5 items-start">
          <div className="flex flex-col gap-5 min-w-0">
            <div className="grid grid-cols-4 gap-3">
              {kpis(p, f0, fl, prev, kgV.length).map((k) => (
                <div key={k.label} className="card rounded-[14px] px-4 py-3.5 flex flex-col gap-1.5">
                  <div className="label">{k.label}</div>
                  <div className="text-2xl font-semibold tracking-[-.02em] tabular-nums">{k.value}<span className="text-[13px] font-medium text-label ml-[3px]">{k.unit}</span></div>
                  <div className={cx('text-xs font-medium', k.muted ? 'text-label' : 'text-ok')}>{k.sub}</div>
                </div>
              ))}
            </div>
            <div className="card px-[22px] py-5 flex flex-col gap-3.5">
              <div className="flex justify-between items-baseline">
                <div><div className="font-semibold text-base">Andamento peso</div><div className="text-xs text-label">{kgV.length} rilevazioni{f0 && fl && kgV.length > 1 ? ` · ${fmtShort(f0.date).split(' ')[1]} – ${fmtShort(fl.date).split(' ')[1]} ${fl.date.slice(0, 4)}` : ''}</div></div>
                <div className="flex gap-3.5 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-[3px] bg-accent rounded-sm" />Peso (kg)</span>
                  {p.target_kg && <span className="flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed border-orange" />Obiettivo</span>}
                </div>
              </div>
              <WeightChart points={kgV.map((v) => ({ date: v.date, kg: v.kg! }))} target={p.target_kg} />
            </div>
            <div className="card px-[22px] py-5 flex flex-col gap-3.5">
              <div className="flex justify-between items-baseline"><div className="font-semibold text-base">Circonferenze</div><div className="text-xs text-label">{visits[0] ? `Variazione dalla prima visita (${fmtShort(visits[0].date)})` : ''}</div></div>
              <Circonferenze visits={visits} />
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="card px-5 py-[18px] flex flex-col gap-3">
              <div className="flex justify-between items-center"><div className="font-semibold text-[15px]">Anagrafica</div><button className="link-btn" onClick={() => setEdit(true)}>Modifica</button></div>
              <div className="grid grid-cols-[96px_1fr] gap-y-[9px] text-[13px] selectable">
                <span className="text-label">Nascita</span><span>{[p.dob && fmtDate(p.dob), p.birthplace].filter(Boolean).join(' · ') || '—'}</span>
                <span className="text-label">Telefono</span><a onClick={() => openExternal(telLink(p.phone))} className="font-mono text-[12.5px]">{p.phone}</a>
                <span className="text-label">Email</span>{p.email ? <a onClick={() => openExternal('mailto:' + p.email)} className="truncate">{p.email}</a> : <span>—</span>}
                <span className="text-label">Professione</span><span>{p.job || '—'}</span>
                <span className="text-label">Codice fisc.</span><span className="font-mono text-[12.5px]">{p.cf || '—'}</span>
              </div>
            </div>
            <NoteCliniche p={p} onEdit={() => setEdit(true)} />
            <div className="card px-5 py-[18px] flex flex-col gap-3">
              <div className="flex justify-between items-center"><div className="font-semibold text-[15px]">Piano attivo</div>
                {active ? (p.link_on ? <span className="pill-ok py-0.5 px-2">Link attivo</span> : <span className="pill-neutral py-0.5 px-2">Link revocato</span>) : draft ? (draft.saved_at ? <span className="pill-warn py-0.5 px-2">Da condividere</span> : <span className="pill-neutral py-0.5 px-2">Bozza</span>) : null}</div>
              {active ? <>
                <div className="text-[13px] text-ink2">{[active.data.title, active.data.kcal && active.data.kcal.toLocaleString('it-IT') + ' kcal', `v${active.version} del ${fmtDate(active.published_at ?? active.created_at)}`].filter(Boolean).join(' · ')}</div>
              </> : <div className="text-[13px] text-label">{draft ? (draft.saved_at ? `Piano v${draft.version} salvato, non ancora condiviso.` : 'Bozza in preparazione, non ancora condivisa.') : 'Nessun piano ancora caricato.'}</div>}
              <button className="btn-secondary py-[9px]" onClick={() => setTab('diet')}>{active ? 'Aggiorna piano →' : 'Prepara piano →'}</button>
            </div>
            <AppAccessCard p={p} onEditPatient={() => setEdit(true)} onSend={() => setShare(true)} />
            <div className="card px-5 py-[18px] flex flex-col gap-2.5">
              <div className="flex justify-between items-center"><div className="font-semibold text-[15px]">Pagamenti</div><button className="link-btn" onClick={() => setTab('pay')}>Tutti →</button></div>
              {pays.slice(0, 3).map((x) => (
                <div key={x.id} className="flex justify-between items-center text-[13px] py-1.5 border-t border-line2">
                  <div><div>{x.description}</div><div className="text-xs text-label">{fmtDate(x.date)}</div></div>
                  <div className="text-right"><div className="font-semibold">€ {eur(x.amount)}</div>
                    {x.paid ? <div className="text-[11.5px] text-ok font-semibold">Saldato</div> : <div className="text-[11.5px] text-warn font-semibold">In sospeso</div>}</div>
                </div>
              ))}
              {!pays.length && <div className="text-[13px] text-label">Nessun pagamento registrato.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'visits' && (
        <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] gap-5 items-start">
          <div className="flex flex-col gap-5 min-w-0">
            <div className="card overflow-hidden">
              <div className="px-[22px] pt-[18px] pb-3 flex justify-between items-baseline"><div className="font-semibold text-base">Peso & composizione</div><div className="text-xs text-label">{p.height ? `Altezza ${p.height} cm` : 'Altezza non indicata'}</div></div>
              <div className="grid grid-cols-[1.3fr_1fr_1fr_.8fr_1fr] px-[22px] py-2 bg-surface2 border-y border-line2 th"><span>Data</span><span className="text-right">Peso</span><span className="text-right">Δ prec.</span><span className="text-right">BMI</span><span className="text-right">Massa grassa</span></div>
              {[...visits].reverse().map((v) => {
                const i = kgV.indexOf(v), pv = i > 0 ? kgV[i - 1] : null, b = bmiOf(v.kg, p.height);
                return (
                  <div key={v.id} className="grid grid-cols-[1.3fr_1fr_1fr_.8fr_1fr] px-[22px] py-2.5 border-b border-line2 tabular-nums text-[13.5px] row-hover">
                    <span>{fmtDate(v.date)}</span>
                    <span className="text-right font-semibold">{v.kg != null ? n1(v.kg) + ' kg' : '—'}</span>
                    <span className={cx('text-right font-medium', pv && v.kg! - pv.kg! > 0 ? 'text-label' : 'text-ok')}>{pv && v.kg != null ? signed(v.kg - pv.kg!) : '—'}</span>
                    <span className="text-right">{b ? n1(b) : '—'}</span>
                    <span className="text-right">{v.fat != null ? n1(v.fat) + ' %' : '—'}</span>
                  </div>
                );
              })}
              {!visits.length && <Empty title="Nessuna visita" sub="Registra la prima visita per iniziare il monitoraggio." />}
            </div>
            <MeasuresTable visits={visits} mode={mode} setMode={setMode} />
          </div>
          <div className="card px-5 py-[18px] flex flex-col gap-1">
            <div className="flex justify-between items-center mb-2"><div className="font-semibold text-base">Storico visite</div><button className="btn-primary px-3 py-[7px] rounded-[9px] text-[12.5px]" onClick={() => setDrawer('new')}>+ Nuova visita</button></div>
            {[...visits].reverse().map((v) => (
              <button key={v.id} onClick={() => setDrawer(v)} title="Modifica visita" className="grid grid-cols-[14px_1fr] gap-3 text-left bg-transparent border-0 p-0 rounded-lg group">
                <div className="flex flex-col items-center"><span className="w-2.5 h-2.5 rounded-full border-2 border-sage-500 bg-surface mt-[5px]" /><span className="flex-1 w-px bg-line" /></div>
                <div className="pb-4 flex flex-col gap-[3px]">
                  <div className="flex justify-between"><span className="font-semibold group-hover:text-accent">{v.type}</span><span className="font-mono text-xs text-label">{fmtDate(v.date)}</span></div>
                  {v.note && <div className="text-[13px] text-ink2 [text-wrap:pretty]">{v.note}</div>}
                  <div className="text-xs text-accent font-medium">{[v.kg != null && n1(v.kg) + ' kg', v.goal && 'Obiettivo: ' + v.goal].filter(Boolean).join(' · ')}</div>
                </div>
              </button>
            ))}
            {!visits.length && <div className="text-[13px] text-label py-2">Ancora nessuna visita.</div>}
          </div>
        </div>
      )}

      {tab === 'diet' && <DietTab patient={p} plans={plans} />}

      {tab === 'pay' && <PayTab pays={pays} next={nextAppt?.date} onRegister={() => setPayModal(true)} />}

      {drawer && <VisitDrawer patient={p} visits={visits} visit={drawer === 'new' ? null : drawer} onClose={() => setDrawer(null)} />}
      {edit && <EditPatient patient={p} onClose={() => setEdit(false)} onConsentPdf={async () => { await saveFile(`Consenso_${p.last}_${p.first}.pdf`, consentPdf(p, settings!), [{ name: 'PDF', extensions: ['pdf'] }]); }} />}
      {payModal && <RegisterPayment patientId={p.id} onClose={() => setPayModal(false)} />}
      {share && <ShareModal patient={p} onClose={() => setShare(false)} />}
    </Page>
  );
}

function kpis(p: Patient, f0?: Visit, fl?: Visit, prev?: Visit, n = 0) {
  if (!fl) return [
    { label: 'Peso attuale', value: '—', unit: '', sub: 'nessuna rilevazione', muted: true },
    { label: "Dall'inizio", value: '—', unit: '', sub: '', muted: true },
    { label: 'BMI', value: '—', unit: '', sub: p.height ? '' : 'altezza mancante', muted: true },
    { label: 'Obiettivo', value: p.target_kg ? n1(p.target_kg) : '—', unit: p.target_kg ? 'kg' : '', sub: '', muted: true },
  ];
  const d = fl.kg! - f0!.kg!;
  const b = bmiOf(fl.kg, p.height), b0 = bmiOf(f0!.kg, p.height);
  const left = p.target_kg != null ? fl.kg! - p.target_kg : null;
  return [
    { label: 'Peso attuale', value: n1(fl.kg!), unit: 'kg', sub: prev ? signed(fl.kg! - prev.kg!) + " kg dall'ultima" : 'prima rilevazione', muted: !prev || fl.kg! > prev.kg! },
    { label: "Dall'inizio", value: signed(d), unit: 'kg', sub: signed((d / f0!.kg!) * 100) + '% · ' + n + (n === 1 ? ' visita' : ' visite'), muted: d >= 0 },
    { label: 'BMI', value: b ? n1(b) : '—', unit: '', sub: b ? (n > 1 && b0 ? 'da ' + n1(b0) + ' · ' : '') + bmiCategory(b).toLowerCase() : 'altezza mancante', muted: !b },
    left != null
      ? { label: Math.abs(left) < 0.05 ? 'Obiettivo' : 'Mancano', value: n1(Math.abs(left)), unit: 'kg', sub: Math.abs(left) < 0.05 ? 'raggiunto' : `all'obiettivo ${n1(p.target_kg!).replace(',0', '')} kg`, muted: false }
      : { label: 'Massa grassa', value: fl.fat != null ? n1(fl.fat) : '—', unit: fl.fat != null ? '%' : '', sub: f0?.fat != null && fl.fat != null && n > 1 ? signed(fl.fat - f0.fat) + ' punti' : '', muted: true },
  ];
}

function Circonferenze({ visits }: { visits: Visit[] }) {
  const rows = KEYS.map((k) => {
    const vs = visits.filter((v) => v[k] != null);
    if (!vs.length) return null;
    const a = vs[0][k]!, b = vs[vs.length - 1][k]!;
    return { k, a, b, d: b - a };
  }).filter(Boolean) as { k: string; a: number; b: number; d: number }[];
  if (!rows.length) return <div className="text-[13px] text-label py-2">Nessuna circonferenza registrata.</div>;
  const maxD = Math.max(0.1, ...rows.map((r) => -r.d));
  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <div key={r.k} className="grid grid-cols-[110px_1fr_90px_74px_64px] items-center gap-3.5 py-2.5 border-t border-line2">
          <div className="font-medium">{LBL[r.k]}</div>
          <div className="h-1.5 bg-sunken rounded-[3px] relative overflow-hidden"><div className="absolute left-0 top-0 bottom-0 bg-sage-500 rounded-[3px]" style={{ width: Math.max(0, Math.round((-r.d / maxD) * 100)) + '%' }} /></div>
          <div className="font-mono text-xs text-label text-right">{n1(r.a)} → {n1(r.b)}</div>
          <div className={cx('font-semibold text-right tabular-nums', r.d <= 0 ? 'text-ok' : 'text-label')}>{signed(r.d)} cm</div>
          <div className={cx('font-mono text-xs font-medium text-right', r.d <= 0 ? 'text-ok' : 'text-label')}>{signed((r.d / r.a) * 100)}%</div>
        </div>
      ))}
    </div>
  );
}

function MeasuresTable({ visits, mode, setMode }: { visits: Visit[]; mode: 'cm' | 'pct'; setMode: (m: 'cm' | 'pct') => void }) {
  const vs = visits.filter((v) => KEYS.some((k) => v[k] != null));
  const delta = (a: number | null, b: number | null) => (a == null || b == null ? '' : mode === 'cm' ? signed(b - a) : signed(((b - a) / a) * 100) + '%');
  const first = (k: typeof KEYS[number]) => vs.find((v) => v[k] != null)?.[k] ?? null;
  const last = (k: typeof KEYS[number]) => [...vs].reverse().find((v) => v[k] != null)?.[k] ?? null;
  return (
    <div className="card overflow-hidden">
      <div className="px-[22px] pt-[18px] pb-3 flex justify-between items-center">
        <div className="font-semibold text-base">Misure corporee <span className="font-normal text-label text-[13px]">(cm)</span></div>
        <Segmented small options={[{ v: 'cm', l: 'Δ cm' }, { v: 'pct', l: 'Δ %' }]} value={mode} onChange={setMode} />
      </div>
      <div className="grid grid-cols-[1.3fr_repeat(5,1fr)] px-[22px] py-2 bg-surface2 border-y border-line2 th"><span>Data</span>{KEYS.map((k) => <span key={k} className="text-right">{LBL[k]}</span>)}</div>
      {[...vs].reverse().map((v) => {
        const i = vs.indexOf(v), pv = vs[i - 1];
        return (
          <div key={v.id} className="grid grid-cols-[1.3fr_repeat(5,1fr)] px-[22px] py-2.5 border-b border-line2 tabular-nums text-[13.5px] row-hover">
            <span>{fmtDate(v.date)}</span>
            {KEYS.map((k) => (
              <span key={k} className="text-right">{v[k] != null ? n1(v[k]!) : '—'}
                <span className="block font-mono text-[11px] text-ok">{pv ? delta(pv[k], v[k]) : v[k] != null ? 'base' : ''}</span></span>
            ))}
          </div>
        );
      })}
      {vs.length > 1 && (
        <div className="grid grid-cols-[1.3fr_repeat(5,1fr)] px-[22px] py-3 bg-tint font-semibold text-[13.5px] text-ok"><span>Totale percorso</span>
          {KEYS.map((k) => <span key={k} className="text-right">{delta(first(k), last(k))}{mode === 'cm' && first(k) != null ? ' cm' : ''}</span>)}</div>
      )}
      {!vs.length && <div className="px-[22px] py-6 text-[13px] text-label">Nessuna misura registrata.</div>}
    </div>
  );
}

function NoteCliniche({ p, onEdit }: { p: Patient; onEdit: () => void }) {
  const items = [...(p.notes ?? '').split('\n').map((s) => s.trim()).filter(Boolean)];
  if (p.drugs && !items.some((i) => i.toLowerCase().includes(p.drugs!.toLowerCase().split(' ')[0]))) items.push('Farmaci/integratori: ' + p.drugs);
  if (p.activity && p.activity !== 'Sedentaria' && !items.some((i) => /allen|attivit|sport/i.test(i))) items.push('Attività fisica: ' + p.activity.toLowerCase());
  return (
    <div className="rounded-card px-5 py-[18px] flex flex-col gap-2.5 border note-card">
      <div className="flex justify-between items-center"><div className="font-semibold text-[15px]">Note cliniche</div><button className="link-btn" onClick={onEdit}>Modifica</button></div>
      {items.length ? (
        <ul className="m-0 pl-[18px] list-disc flex flex-col gap-1.5 text-[13px] text-ink2 selectable">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
      ) : <div className="text-[13px] text-label">Nessuna nota.</div>}
    </div>
  );
}

function PayTab({ pays, next, onRegister }: { pays: Payment[]; next?: string; onRegister: () => void }) {
  const { settings, toast, bump } = useApp();
  const year = today().slice(0, 4);
  const inYear = pays.filter((x) => x.paid && x.date.startsWith(year)).reduce((a, x) => a + x.amount, 0);
  const due = pays.filter((x) => !x.paid).reduce((a, x) => a + x.amount, 0);
  const G = 'grid grid-cols-[1fr_2fr_1fr_1fr_1fr_120px] px-[22px]';
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-3 items-stretch">
        <div className="card rounded-[14px] px-4 py-3.5"><div className="label">Incassato {year}</div><div className="text-2xl font-semibold mt-1.5">€ {eur(inYear)}</div></div>
        <div className="rounded-[14px] px-4 py-3.5 border warn-card"><div className="label !text-warn">In sospeso</div><div className="text-2xl font-semibold mt-1.5 text-warn">€ {eur(due)}</div></div>
        <div className="card rounded-[14px] px-4 py-3.5"><div className="label">Prossima visita</div><div className="text-2xl font-semibold mt-1.5">{next ? fmtSmart(next) : '—'}</div></div>
        <button className="btn-primary rounded-[14px] px-[18px]" onClick={onRegister}>+ Registra pagamento</button>
      </div>
      <div className="card overflow-hidden">
        <div className={cx(G, 'py-2.5 bg-surface2 border-b border-line2 th')}><span>Data</span><span>Descrizione</span><span>Metodo</span><span className="text-right">Importo</span><span className="pl-6">Stato</span><span className="text-right">Documento</span></div>
        {pays.map((x) => (
          <div key={x.id} className={cx(G, 'py-[13px] border-b border-line2 items-center text-[13.5px] row-hover')}>
            <span>{fmtDate(x.date)}</span><span>{x.description}</span><span className="text-muted">{x.method}</span>
            <span className="text-right font-semibold tabular-nums">€ {eur(x.amount)}</span>
            <span className="pl-6">{x.paid ? <span className="pill-ok">Saldato</span>
              : <button title="Segna come saldato" className="pill-warn border-0 hover:brightness-95" onClick={async () => { const inv = await repo.markPaid(x.id); bump(); toast(`Saldato · fattura ${inv} emessa`); }}>In sospeso</button>}</span>
            <span className="text-right">{x.paid
              ? <a className="text-[13px] font-medium" onClick={async () => { if (await downloadInvoice(x, settings!)) toast('Fattura salvata'); }}>Fattura ↓</a>
              : <a className="text-[13px] font-medium !text-warn" onClick={() => remindPayment(x, settings!)}>Sollecita</a>}</span>
          </div>
        ))}
        {!pays.length && <Empty title="Nessun pagamento" sub="Registra il primo pagamento del paziente." />}
      </div>
    </div>
  );
}
