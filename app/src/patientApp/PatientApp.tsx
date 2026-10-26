// App paziente (design "App Paziente"): Oggi · La mia dieta · Progressi · Studio.
// Lo stesso componente è la web app dei pazienti (web/) e l'anteprima nell'app desktop: riceve i dati già pronti
// (PatientView) e un ambiente (data di oggi, memoria locale, installazione), senza accedere al database.
// Sempre in tema chiaro, con i colori del design, come sul telefono del paziente.
import { useMemo, useState, type ReactNode } from 'react';
import type { PlanItem } from '../db/types';
import { LETTERS, sections } from '../lib/planGroups';
import { choiceFoods, shoppingList } from '../lib/shopping';
import { addDays, fmtDate, mondayOf, MONTHS, n1, parseIso, WEEKDAYS } from '../lib/format';
import { NoteText } from './NoteText';
import { CIRCS, type PatientView } from './view';

const C = { ink: '#18211F', ink2: '#2C3533', muted: '#6B7472', subtle: '#8A928F', petrol: '#1E5A5F', card: '#E8E6E0' };
const WEEK = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
type Tab = 'oggi' | 'dieta' | 'prog' | 'studio';

/** Memoria locale del telefono: spunte dei pasti, lista della spesa, preferenze. */
export interface PatientStore { get(key: string): string | null; set(key: string, value: string): void }

export interface PatientEnv {
  /** Data di oggi, AAAA-MM-GG. */
  today: string;
  store: PatientStore;
  /** Anteprima nell'app dello studio: i collegamenti non si aprono. */
  preview?: boolean;
  /** Invito ad aggiungere l'app alla schermata Home. `prompt` c'è su Android/Chrome; su iOS si mostrano le istruzioni. */
  install?: { show: boolean; prompt: (() => void) | null; dismiss: () => void };
  /** Registra il consenso informato (al server). */
  onConsent?: () => Promise<void>;
  /** Dati mostrati dalla copia salvata perché il telefono è offline (data e ora del salvataggio). */
  offlineSince?: string | null;
}

const json = <T,>(s: string | null, d: T): T => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/** Collegamento esterno; nell'anteprima è solo un'etichetta. */
function Ext({ href, preview, className, children }: { href: string; preview?: boolean; className: string; children: ReactNode }) {
  return preview || !href
    ? <span className={className}>{children}</span>
    : <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={className}>{children}</a>;
}

export function PatientApp({ view, env }: { view: PatientView; env: PatientEnv }) {
  const { plan, features: f } = view;
  const [consented, setConsented] = useState(!view.consent.required);
  const [tab, setTab] = useState<Tab>('oggi');
  const [shop, setShop] = useState(false);
  const showProg = (f.weight || f.meas) && view.visits.length > 0;

  if (!consented) return <Consent view={view} onAccept={async () => { await env.onConsent?.(); setConsented(true); }} />;

  const nav: [Tab, string, string][] = [['oggi', 'Oggi', '50%'], ['dieta', 'La mia dieta', '3px'], ...(showProg ? [['prog', 'Progressi', '50% 50% 3px 3px'] as [Tab, string, string]] : []), ['studio', 'Studio', '3px 50% 50% 50%']];
  return (
    <div className="relative h-full flex flex-col bg-[#F6F5F1] text-[#18211F] [color-scheme:light]" style={{ fontFamily: 'Figtree, system-ui, sans-serif' }}>
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-[18px] pt-1.5 pb-6 grid auto-rows-max content-start gap-3.5">
        {env.offlineSince && (
          <div className="justify-self-center text-[12px] font-medium text-[#7A5426] bg-[#F7F0E4] rounded-full px-3 py-1">Offline · dati del {env.offlineSince}</div>
        )}
        {tab === 'oggi' && <Today view={view} env={env} />}
        {tab === 'dieta' && <Diet view={view} env={env} onShop={() => setShop(true)} />}
        {tab === 'prog' && <Progress view={view} />}
        {tab === 'studio' && <Studio view={view} env={env} />}
      </main>
      <nav className="flex-none bg-white/[.96] border-t border-[#E6E4DE] pt-2 px-2.5 pb-[max(8px,env(safe-area-inset-bottom))] grid" style={{ gridTemplateColumns: `repeat(${nav.length},1fr)` }}>
        {nav.map(([id, label, r]) => (
          <button key={id} onClick={() => setTab(id)} aria-current={id === tab ? 'page' : undefined}
            className={'border-0 bg-transparent h-[52px] flex flex-col items-center justify-center gap-[5px] text-[11.5px] ' + (id === tab ? 'text-[#0F3B40] font-semibold' : 'text-[#6B7472] font-medium')}>
            <span className={'w-10 h-[26px] rounded-[13px] grid place-items-center ' + (id === tab ? 'bg-[#DCE8DF]' : '')}>
              <span className={'w-3 h-3 ' + (id === tab ? 'bg-[#1E5A5F]' : 'border-[1.8px] border-[#8A928F]')} style={{ borderRadius: r }} />
            </span>
            {label}
          </button>
        ))}
      </nav>
      {shop && plan && <Shopping view={view} env={env} onClose={() => setShop(false)} />}
    </div>
  );
}

// ——— Consenso ———

function Consent({ view, onAccept }: { view: PatientView; onAccept: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="h-full overflow-y-auto bg-[#F6F5F1] text-[#18211F] px-6 py-8 flex flex-col gap-5" style={{ fontFamily: 'Figtree, system-ui, sans-serif' }}>
      <div className="w-12 h-12 rounded-[13px] bg-[#0F3B40] text-[#A9C6B1] grid place-items-center font-bold text-xl">n</div>
      <div><div className="text-[13px]" style={{ color: C.muted }}>Ciao {view.patient.first}</div><h1 className="m-0 text-[26px] font-semibold tracking-[-.02em] leading-tight">Prima di iniziare</h1></div>
      <div className="bg-white border rounded-[18px] p-4 text-[14.5px] leading-[1.55] flex flex-col gap-3" style={{ borderColor: C.card, color: C.ink2 }}>
        <p className="m-0">Qui trovi il piano nutrizionale e i progressi che <b>{view.consent.studio}</b> condivide con te.</p>
        <p className="m-0">I dati sono trattati solo per seguire il tuo percorso nutrizionale (GDPR, art. 9) e restano visibili solo a chi ha questo link. Puoi chiedere allo studio di disattivarlo in qualsiasi momento.</p>
        <p className="m-0">Le spunte dei pasti e la lista della spesa restano solo su questo telefono.</p>
      </div>
      {err && <div className="text-[13px] text-[#9B2C1F] bg-[#FBEDEA] rounded-[10px] px-3 py-2">{err}</div>}
      <button disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await onAccept(); } catch { setErr('Non è stato possibile registrare il consenso: controlla la connessione e riprova.'); setBusy(false); } }}
        className="h-[54px] rounded-[15px] border-0 bg-[#1E5A5F] text-white font-semibold text-base disabled:opacity-60">{busy ? 'Un momento…' : 'Accetto e continuo'}</button>
    </div>
  );
}

// ——— Oggi ———

function weeklyPlan(view: PatientView) {
  const days = view.plan?.data.days ?? [];
  return days.length === 7 && days.every((d, i) => d.label === WEEK[i]);
}

/** Piano da mostrare: null se non condiviso o ancora senza giorni. */
const shownPlan = (view: PatientView) => (view.plan && view.plan.data.days.length ? view.plan : null);

function Today({ view, env }: { view: PatientView; env: PatientEnv }) {
  const plan = shownPlan(view);
  const weekly = weeklyPlan(view);
  const todayIdx = weekly ? (parseIso(env.today).getDay() + 6) % 7 : 0;
  const [day, setDay] = useState(todayIdx);
  // Spunte: per settimana nei piani settimanali, per giorno nei piani a giorni tipo.
  const scope = weekly ? mondayOf(env.today) : env.today;
  const [done, setDone] = useState<Record<string, boolean>>(() => json(env.store.get('checks'), {}));
  const [pick, setPick] = useState<Record<string, number>>(() => json(env.store.get('pick'), {}));
  const toggle = (k: string) => {
    const next = { ...done, [k]: !done[k] };
    // Si tengono solo le spunte delle ultime due settimane.
    for (const key of Object.keys(next)) if (key.slice(0, 10) < addDays(env.today, -14)) delete next[key];
    setDone(next);
    env.store.set('checks', JSON.stringify(next));
  };
  const choose = (k: string, v: number) => { const next = { ...pick, [k]: v }; setPick(next); env.store.set('pick', JSON.stringify(next)); };
  const now = parseIso(env.today);

  return <>
    {env.install?.show && <InstallBanner install={env.install} />}
    <div className="flex justify-between items-end pt-1">
      <div><div className="text-[13px]" style={{ color: C.muted }}>{WEEKDAYS[now.getDay()]} {now.getDate()} {MONTHS[now.getMonth()]}</div><div className="text-[28px] font-semibold tracking-[-.02em] leading-[1.15]">Ciao {view.patient.first}</div></div>
      {plan && view.features.checks && (() => {
        const d = plan.data.days[day];
        const n = d.meals.filter((_, i) => done[`${scope}:${day}:${i}`]).length;
        return <div className="text-right"><div className="font-semibold text-xl" style={{ color: C.petrol }}>{n}/{d.meals.length}</div><div className="text-[11.5px]" style={{ color: C.muted }}>pasti {weekly ? 'di ' + WEEKDAYS[(day + 1) % 7].toLowerCase() : 'giorno ' + d.label}</div></div>;
      })()}
    </div>
    {!plan ? <NoPlan view={view} /> : <>
      <div className="flex gap-[5px]" role="tablist" aria-label="Giorno">
        {plan.data.days.map((x, i) => {
          const n = weekly ? parseIso(addDays(mondayOf(env.today), i)).getDate() : '';
          return (
            <button key={i} role="tab" aria-selected={i === day} onClick={() => setDay(i)}
              className={'flex-1 min-w-0 h-[58px] rounded-[14px] flex flex-col items-center justify-center gap-0.5 relative ' + (i === day ? 'border-0 bg-[#1E5A5F] text-white' : 'border border-[#E4E2DC] bg-white text-[#18211F]')}>
              <span className={'text-[11px] truncate max-w-full px-0.5 ' + (i === day ? 'text-[#BFD6CE]' : 'text-[#8A928F]')}>{x.label}</span>
              {n !== '' && <span className="font-semibold text-base">{n}</span>}
              {weekly && i === todayIdx && i !== day && <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#1E5A5F]" />}
            </button>
          );
        })}
      </div>
      {view.features.checks && (() => {
        const d = plan.data.days[day];
        const n = d.meals.filter((_, i) => done[`${scope}:${day}:${i}`]).length;
        return <div className="h-1.5 rounded-[3px] bg-[#E6E4DE] overflow-hidden"><div className="h-full bg-[#7FA08A] rounded-[3px] transition-[width] duration-300" style={{ width: (n / Math.max(1, d.meals.length)) * 100 + '%' }} /></div>;
      })()}
      {plan.data.days[day].meals.map((m, i) => {
        const k = `${scope}:${day}:${i}`, ok = !!done[k];
        return (
          <article key={i} className="bg-white border rounded-[18px] py-3.5 pr-3.5 pl-4 flex flex-col gap-2" style={{ borderColor: C.card }}>
            <div className="flex items-center gap-2.5">
              <h2 className="m-0 flex-1 flex gap-2 items-baseline text-base font-semibold">{m.name}<span className="font-mono text-[11.5px] font-normal" style={{ color: C.subtle }}>{m.time}</span></h2>
              {view.features.checks && (
                <button onClick={() => toggle(k)} aria-pressed={ok} aria-label={`${m.name}: ${ok ? 'fatto' : 'da fare'}`}
                  className={'w-11 h-11 rounded-full flex-none ' + (ok ? 'border-0 bg-[#1E5A5F] text-white text-[17px] font-bold' : 'border-[1.5px] border-[#CFD8D4] bg-white')}>{ok ? '✓' : ''}</button>
              )}
            </div>
            {m.items.length ? <MealBody items={m.items} pick={pick[`${day}:${i}`] ?? 0} setPick={(v) => choose(`${day}:${i}`, v)} /> : <div className="text-sm" style={{ color: C.muted }}>Nessun alimento indicato.</div>}
            {m.note && <div className="text-[12.5px] text-[#7A5426] bg-[#F7F0E4] rounded-[9px] px-[9px] py-1.5">{m.note}</div>}
          </article>
        );
      })}
    </>}
  </>;
}

function NoPlan({ view }: { view: PatientView }) {
  return (
    <div className="bg-white border rounded-[18px] p-5 text-center flex flex-col gap-1.5" style={{ borderColor: C.card }}>
      <div className="font-semibold text-base">Il tuo piano è in preparazione</div>
      <div className="text-sm" style={{ color: C.muted }}>{view.studio.name} ti avviserà quando sarà pronto: lo troverai qui.</div>
    </div>
  );
}

function InstallBanner({ install }: { install: NonNullable<PatientEnv['install']> }) {
  return (
    <div className="bg-[#0F3B40] text-white rounded-[18px] p-3.5 flex gap-3 items-center">
      <div className="w-[42px] h-[42px] rounded-[11px] bg-[#A9C6B1] text-[#0F3B40] grid place-items-center font-bold text-lg flex-none">n</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">Aggiungi alla Home</div>
        <div className="text-xs text-[#B7CCC5] leading-[1.35]">{install.prompt ? "Apri il piano come un'app, anche senza connessione." : <>Tocca <b className="text-white">Condividi</b> → <b className="text-white">Aggiungi a Home</b>. Si apre come un'app.</>}</div>
      </div>
      {install.prompt && <button onClick={install.prompt} className="border-0 px-3 h-9 rounded-[9px] bg-[#A9C6B1] text-[#0F3B40] text-sm font-semibold flex-none">Installa</button>}
      <button onClick={install.dismiss} aria-label="Chiudi" className="border-0 bg-white/[.12] text-white w-8 h-8 rounded-[9px] text-[15px] flex-none">×</button>
    </div>
  );
}

// ——— La mia dieta ———

function Diet({ view, env, onShop }: { view: PatientView; env: PatientEnv; onShop: () => void }) {
  const plan = shownPlan(view);
  const weekly = weeklyPlan(view);
  const todayIdx = weekly ? (parseIso(env.today).getDay() + 6) % 7 : 0;
  const [open, setOpen] = useState(todayIdx);
  const [openNote, setOpenNote] = useState(-1);
  if (!plan) return <><Title title="La mia dieta" /><NoPlan view={view} /></>;
  const dayName = (i: number) => (weekly ? WEEKDAYS[(i + 1) % 7] : `Giorno ${plan.data.days[i].label}`);
  return <>
    <Title sub={`Piano v${plan.version} · dal ${fmtDate(plan.since)}`} title="La mia dieta" />
    <div className="grid grid-cols-2 gap-2">
      {view.links.pdf && (
        <Ext href={view.links.pdf} preview={env.preview} className="flex items-center justify-center gap-2 h-12 rounded-[14px] bg-white border border-[#E4E2DC] font-semibold text-sm text-[#18211F] no-underline">
          <span className="font-mono text-[9px] font-semibold text-[#1E5A5F] border-[1.5px] border-[#1E5A5F] rounded-[3px] px-[3px] py-0.5">PDF</span>Originale
        </Ext>
      )}
      <button onClick={onShop} className={'flex items-center justify-center h-12 rounded-[14px] bg-white border border-[#E4E2DC] font-semibold text-sm text-[#18211F] ' + (view.links.pdf ? '' : 'col-span-2')}>Lista spesa</button>
    </div>
    {plan.data.notes.length > 0 && (
      <div className="bg-[#EEF3EE] rounded-2xl overflow-hidden text-[#2C4A3A]">
        <div className="px-4 pt-3.5 pb-1.5 text-[15px] font-semibold">Indicazioni generali</div>
        {plan.data.notes.map((n, i) => (
          <div key={i} className="border-t border-[#DCE6DD]">
            <button onClick={() => setOpenNote(openNote === i ? -1 : i)} aria-expanded={openNote === i} className="w-full border-0 bg-transparent px-4 min-h-[46px] py-2 flex items-center justify-between gap-3 text-left text-[14px] font-semibold text-[#2C4A3A]">
              <span>{n.title || 'Introduzione'}</span><span className="text-[13px] text-[#6E8A78] font-medium">{openNote === i ? '−' : '+'}</span>
            </button>
            {openNote === i && <NoteText text={n.text} className="px-4 pb-3.5 text-[13.5px] leading-[1.55]" />}
          </div>
        ))}
      </div>
    )}
    {plan.data.days.map((x, i) => (
      <div key={i} className="bg-white border rounded-[18px] overflow-hidden" style={{ borderColor: C.card }}>
        <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} className="w-full border-0 bg-transparent px-4 h-14 flex items-center justify-between text-base font-semibold text-[#18211F]">
          <span>{dayName(i)}{weekly && i === todayIdx && <span className="ml-2 text-[11px] font-semibold text-[#1E5A5F] bg-[#E6EFEC] px-[7px] py-0.5 rounded-full">Oggi</span>}</span>
          <span className="text-[13px] text-[#8A928F] font-medium">{open === i ? '−' : '+'}</span>
        </button>
        {open === i && (
          <div className="px-4 pb-3.5 flex flex-col gap-3">
            {x.meals.map((m, j) => (
              <div key={j} className="flex flex-col gap-[3px] border-t border-[#F0EEE9] pt-2.5">
                <div className="font-mono text-[11px] font-medium tracking-[.06em] uppercase" style={{ color: C.muted }}>{m.name}{m.time && <span className="normal-case tracking-normal"> · {m.time}</span>}</div>
                {m.items.length ? <div className="flex flex-col gap-2 pt-1"><MealBody items={m.items} pick={0} setPick={() => {}} all /></div> : <div className="text-sm" style={{ color: C.ink2 }}>—</div>}
                {m.note && <div className="text-[12.5px] text-[#7A5426] pt-1">{m.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    ))}
  </>;
}

function Shopping({ view, env, onClose }: { view: PatientView; env: PatientEnv; onClose: () => void }) {
  const plan = view.plan!.data;
  const weekly = weeklyPlan(view);
  // Nei piani a giorni tipo le quantità dipendono da quali giorni si fanno: si elencano solo gli alimenti.
  const qty = useMemo(() => (weekly ? shoppingList(plan) : []), [plan, weekly]);
  const others = useMemo(() => (weekly ? choiceFoods(plan) : [...new Set([...shoppingList(plan).map((x) => x.f), ...choiceFoods(plan)])].sort((a, b) => a.localeCompare(b, 'it'))), [plan, weekly]);
  const [got, setGot] = useState<Record<string, boolean>>(() => json(env.store.get('shopping'), {}));
  const flip = (k: string) => { const next = { ...got, [k]: !got[k] }; setGot(next); env.store.set('shopping', JSON.stringify(next)); };
  const reset = () => { setGot({}); env.store.set('shopping', '{}'); };
  const row = (k: string, label: string, q?: string) => (
    <button key={k} onClick={() => flip(k)} aria-pressed={!!got[k]} className="w-full border-0 border-t border-[#F0EEE9] bg-transparent flex items-center gap-3 py-2.5 text-left">
      <span className={'w-[22px] h-[22px] rounded-[7px] flex-none grid place-items-center text-[13px] font-bold ' + (got[k] ? 'bg-[#1E5A5F] text-white' : 'border-[1.5px] border-[#CFD8D4] bg-white')}>{got[k] ? '✓' : ''}</span>
      <span className={'flex-1 text-[14.5px] ' + (got[k] ? 'line-through text-[#8A928F]' : 'text-[#2C3533]')}>{label}</span>
      {q && <span className="font-mono text-[12.5px] font-medium text-[#1E5A5F] whitespace-nowrap">{q}</span>}
    </button>
  );
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end bg-[rgba(15,30,32,.35)]" onClick={onClose}>
      <div role="dialog" aria-label="Lista della spesa" onClick={(e) => e.stopPropagation()} className="bg-[#F6F5F1] rounded-t-[24px] max-h-[88%] flex flex-col shadow-[0_-10px_30px_rgba(15,30,32,.18)]">
        <div className="px-[18px] pt-4 pb-2 flex items-center justify-between gap-3">
          <div><div className="text-[20px] font-semibold">Lista della spesa</div><div className="text-[12.5px]" style={{ color: C.muted }}>{weekly ? 'Quantità per una settimana di piano' : 'Alimenti del piano'}</div></div>
          <button onClick={onClose} aria-label="Chiudi" className="border-0 bg-[#E9E7E1] w-9 h-9 rounded-full text-lg text-[#18211F]">×</button>
        </div>
        <div className="overflow-y-auto px-[18px] pb-[max(18px,env(safe-area-inset-bottom))] flex flex-col gap-4">
          {qty.length > 0 && <div className="bg-white border rounded-[18px] px-4 pb-1" style={{ borderColor: C.card }}>
            <div className="font-mono text-[11px] font-medium tracking-[.06em] uppercase pt-3 pb-1.5" style={{ color: C.muted }}>Da comprare</div>
            {qty.map((x) => row('q:' + x.f, x.f, `${x.n.toLocaleString('it-IT')} ${x.unit}`))}
          </div>}
          {others.length > 0 && <div className="bg-white border rounded-[18px] px-4 pb-1" style={{ borderColor: C.card }}>
            <div className="font-mono text-[11px] font-medium tracking-[.06em] uppercase pt-3 pb-1.5" style={{ color: C.muted }}>{weekly ? 'A scelta, secondo i tuoi gusti' : 'Da avere in dispensa'}</div>
            {others.map((f) => row('o:' + f, f))}
          </div>}
          {!qty.length && !others.length && <div className="text-sm text-center py-6" style={{ color: C.muted }}>Nessun alimento nel piano.</div>}
          {Object.values(got).some(Boolean) && <button onClick={reset} className="self-center border-0 bg-transparent text-[13.5px] font-semibold text-[#1E5A5F]">Togli tutte le spunte</button>}
        </div>
      </div>
    </div>
  );
}

// ——— Progressi ———

function Progress({ view }: { view: PatientView }) {
  const v = view.visits;
  const kgV = v.filter((x) => x.kg != null);
  const first = kgV[0], last = kgV[kgV.length - 1];
  const target = view.patient.targetKg;
  const lost = first && last ? first.kg! - last.kg! : 0;
  const pct = first && last && target && first.kg! !== target ? Math.max(0, Math.min(100, Math.round(((first.kg! - last.kg!) / (first.kg! - target)) * 100))) : null;
  const meas = CIRCS.map((k) => { const vs = v.filter((x) => x.cm[k] != null); return vs.length > 1 ? { l: k[0].toUpperCase() + k.slice(1), d: vs[vs.length - 1].cm[k]! - vs[0].cm[k]! } : null; }).filter(Boolean) as { l: string; d: number }[];
  const cmTot = meas.reduce((a, m) => a + m.d, 0);
  const next = view.nextAppointment;
  const G = (() => {
    if (kgV.length < 2) return null;
    const vals = kgV.map((x) => x.kg!).concat(target ? [target] : []);
    const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1, W = 300, H = 150;
    const X = (i: number) => 6 + (i * (W - 12)) / (kgV.length - 1), Y = (x: number) => 10 + ((hi - x) / (hi - lo)) * (H - 20);
    const line = kgV.map((x, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x.kg!).toFixed(1)).join(' ');
    return { line, area: line + ` L${X(kgV.length - 1)} ${H} L${X(0)} ${H} Z`, target: target ? `M0 ${Y(target)} H${W}` : '', ty: target ? Y(target) : 0, lx: X(kgV.length - 1), ly: Y(last.kg!) };
  })();
  const firstDate = v[0] ? parseIso(v[0].date) : null;
  return <>
    <Title sub={firstDate ? `Dal ${firstDate.getDate()} ${MONTHS[firstDate.getMonth()]} · ${v.length} ${v.length === 1 ? 'visita' : 'visite'}` : 'Nessuna visita'} title="I miei progressi" />
    {view.features.weight && last && <>
      <div className="bg-[#1E5A5F] text-white rounded-[22px] p-[18px] flex flex-col gap-3.5">
        <div className="flex justify-between items-end gap-3">
          <div><div className="text-[13px] text-[#BFD6CE]">{lost > 0 ? 'Hai perso' : 'Peso attuale'}</div><div className="text-[44px] font-semibold tracking-[-.03em] leading-none">{n1(lost > 0 ? lost : last.kg!)} <span className="text-xl">kg</span></div></div>
          <div className="text-right text-[13px] text-[#BFD6CE]">{lost > 0 && <>Ora <b className="text-white">{n1(last.kg!)} kg</b></>}{target ? <><br />Obiettivo {n1(target).replace(',0', '')} kg</> : null}</div>
        </div>
        {pct != null && <div><div className="h-2 rounded bg-white/[.18] overflow-hidden"><div className="h-full bg-[#A9C6B1] rounded" style={{ width: pct + '%' }} /></div><div className="text-[12.5px] text-[#D7E5DF] mt-[7px]">Sei al {pct}% del percorso{target && last.kg! > target ? ` — mancano ${n1(last.kg! - target)} kg.` : '.'}</div></div>}
      </div>
      {G && (
        <div className="bg-white border rounded-[18px] p-4 flex flex-col gap-2.5" style={{ borderColor: C.card }}>
          <div className="flex justify-between items-baseline"><span className="font-semibold text-base">Peso</span><span className="font-mono text-[11.5px]" style={{ color: C.subtle }}>{fmtDate(first.date).split(' ')[1]} → {fmtDate(last.date).split(' ')[1]}</span></div>
          <svg viewBox="0 0 300 150" className="w-full h-auto overflow-visible" role="img" aria-label={`Peso da ${n1(first.kg!)} a ${n1(last.kg!)} kg`}>
            <path d={G.area} style={{ fill: '#7FA08A', fillOpacity: 0.16 }} />
            {G.target && <path d={G.target} style={{ stroke: '#C9833A', strokeWidth: 1.5, strokeDasharray: '4 4', fill: 'none' }} />}
            <path d={G.line} style={{ stroke: '#1E5A5F', strokeWidth: 3, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }} />
            <circle cx={G.lx} cy={G.ly} r={5} fill="#1E5A5F" stroke="#fff" strokeWidth={3} />
            {target && <text x={300} y={G.ty - 5} textAnchor="end" style={{ font: '500 10.5px "IBM Plex Mono", monospace', fill: '#A5621F' }}>obiettivo {n1(target).replace(',0', '')}</text>}
          </svg>
        </div>
      )}
    </>}
    {view.features.meas && meas.length > 0 && (
      <div className="bg-white border rounded-[18px] p-4 flex flex-col gap-1" style={{ borderColor: C.card }}>
        <div className="font-semibold text-base mb-1.5">{cmTot <= 0 ? 'Centimetri persi' : 'Circonferenze'}</div>
        <div className="grid grid-cols-3 gap-2">{meas.map((m) => <div key={m.l} className="bg-[#F3F6F3] rounded-[14px] px-3 py-2.5"><div className="text-xs text-[#5E6866]">{m.l}</div><div className="text-xl font-semibold text-[#245C3B]">{(m.d > 0 ? '+' : m.d < 0 ? '−' : '') + n1(Math.abs(m.d))}</div></div>)}</div>
      </div>
    )}
    <div className="text-[13.5px] text-[#5E6866] text-center px-3 py-0.5 [text-wrap:pretty]">
      {view.features.meas && meas.length && cmTot < 0 ? `−${n1(Math.abs(cmTot))} cm in totale. ` : ''}{next ? `Prossimo controllo: ${parseIso(next.date).getDate()} ${MONTHS[parseIso(next.date).getMonth()]}.` : ''}
    </div>
  </>;
}

// ——— Studio ———

function Studio({ view, env }: { view: PatientView; env: PatientEnv }) {
  const s = view.studio, next = view.nextAppointment;
  return <>
    <Title title="Il tuo studio" />
    <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-4 items-center text-center" style={{ borderColor: C.card }}>
      {s.photo ? <img src={s.photo} className="w-[76px] h-[76px] rounded-full object-cover" alt="" />
        : <div className="w-[76px] h-[76px] rounded-full grid place-items-center text-[26px] font-semibold text-[#1E5A5F] bg-[#E6EFEC]">{s.name.replace(/^(dott\.?(ssa)?|dr\.?)\s+/i, '')[0] ?? 'n'}</div>}
      <div><div className="text-[19px] font-semibold">{s.name}</div><div className="text-[13px]" style={{ color: C.muted }}>{[s.title, s.city].filter(Boolean).join(' · ')}</div></div>
      <div className="flex flex-col gap-2 w-full">
        {s.whatsapp && <Ext href={`https://wa.me/${s.whatsapp}`} preview={env.preview} className="h-[54px] rounded-[15px] bg-[#1E5A5F] text-white font-semibold text-base flex items-center justify-center gap-[9px] no-underline"><span className="w-[9px] h-[9px] rounded-full bg-[#A9C6B1]" />Scrivi su WhatsApp</Ext>}
        <div className="grid grid-cols-2 gap-2">
          {s.phone && <Ext href={`tel:+${s.whatsapp}`} preview={env.preview} className="h-[50px] rounded-[15px] border border-[#DAD8D1] text-[#18211F] font-semibold flex items-center justify-center no-underline">Chiama</Ext>}
          {s.email && <Ext href={`mailto:${s.email}`} preview={env.preview} className={'h-[50px] rounded-[15px] border border-[#DAD8D1] text-[#18211F] font-semibold flex items-center justify-center no-underline ' + (s.phone ? '' : 'col-span-2')}>Email</Ext>}
        </div>
      </div>
    </div>
    {next && (
      <div className="bg-[#EEF3EE] rounded-[18px] p-4">
        <div className="font-mono text-[11px] font-medium tracking-[.06em] uppercase text-[#4E6E5B]">Prossimo appuntamento</div>
        <div className="text-[17px] font-semibold mt-[3px]">{WEEKDAYS[parseIso(next.date).getDay()].slice(0, 3)} {parseIso(next.date).getDate()} {MONTHS[parseIso(next.date).getMonth()]} · {next.time}</div>
        {next.type === 'online' && <div className="text-[13px] text-[#4E6E5B] mt-0.5">In videochiamata</div>}
      </div>
    )}
    {(s.address || s.hours) && (
      <div className="bg-white border rounded-[18px] p-4 text-sm leading-normal" style={{ borderColor: C.card, color: C.ink2 }}>
        <div className="font-semibold mb-0.5">Studio</div>
        {s.address && <Ext href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`} preview={env.preview} className="text-[#1E5A5F] no-underline">{s.address}</Ext>}
        {s.hours && <div style={{ color: C.muted }}>{s.hours}</div>}
      </div>
    )}
  </>;
}

// ——— Parti comuni ———

function Title({ title, sub }: { title: string; sub?: string }) {
  return <div className="pt-1">{sub && <div className="text-[13px]" style={{ color: C.muted }}>{sub}</div>}<h1 className="m-0 text-[28px] font-semibold tracking-[-.02em] leading-[1.15]">{title}</h1></div>;
}

const itemRow = (it: PlanItem, j: number, dot?: boolean) => (
  <div key={j} className={'flex justify-between gap-2.5 text-sm leading-[1.3]' + (it.sub ? ' pl-3' : '')}>
    <span className="flex gap-2" style={{ color: C.ink2 }}>{dot && <span className="w-2 h-2 rounded-full border-[1.5px] border-[#7FA08A] flex-none mt-[5px]" />}<span>{it.sub ? '– ' : ''}{it.f}{it.alts?.length ? <span style={{ color: C.muted }}> (o {it.alts.map((a) => `${a.f}${a.g ? ' ' + a.g : ''}`).join(', ')})</span> : null}</span></span>
    <span className="font-mono text-[12.5px] font-medium whitespace-nowrap" style={{ color: C.petrol }}>{it.g}</span>
  </div>
);

/** Corpo del pasto: le varianti si scelgono con i chip A/B/C, i gruppi "scegli 1" sono elenchi di alternative. */
function MealBody({ items, pick, setPick, all }: { items: PlanItem[]; pick: number; setPick: (v: number) => void; all?: boolean }) {
  const secs = sections(items).filter((s) => s.items.some(({ it }) => it.f.trim()));
  const variants = secs.filter((s) => s.kind === 'variant');
  const chosen = Math.min(pick, Math.max(0, variants.length - 1));
  return <>
    {variants.length > 1 && !all && (
      <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Opzione del pasto">
        {variants.map((v, k) => (
          <button key={k} role="radio" aria-checked={k === chosen} onClick={() => setPick(k)} title={v.head?.f}
            className={'h-8 px-3 rounded-full text-[12.5px] font-semibold border ' + (k === chosen ? 'bg-[#1E5A5F] text-white border-[#1E5A5F]' : 'bg-white text-[#2C3533] border-[#E4E2DC]')}>Opzione {LETTERS[k]}</button>
        ))}
      </div>
    )}
    {secs.map((sc, si) => {
      if (sc.kind === 'variant') {
        const k = variants.indexOf(sc);
        if (variants.length > 1 && k !== chosen && !all) return null;
        return (
          <div key={si} className="flex flex-col gap-2">
            {all && k > 0 && <div className="text-center font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: C.subtle }}>— oppure —</div>}
            <div className="font-mono text-[10.5px] font-medium tracking-[.06em] uppercase" style={{ color: C.petrol }}>{all && variants.length > 1 ? `Opzione ${LETTERS[k]} · ` : ''}{sc.head!.f}</div>
            {sc.items.filter(({ it }) => it.f.trim()).map(({ it, idx }) => itemRow(it, idx))}
          </div>
        );
      }
      if (sc.kind === 'choice') return (
        <div key={si} className="rounded-[12px] bg-[#F3F6F3] px-3 py-2.5 flex flex-col gap-1.5">
          <div className="flex justify-between items-center gap-2"><span className="text-[12.5px] font-semibold text-[#245C3B]">{sc.head!.f}</span><span className="text-[11px] font-semibold text-[#245C3B] bg-white rounded-full px-2 py-0.5 flex-none">scegli 1</span></div>
          {sc.items.filter(({ it }) => it.f.trim()).map(({ it, idx }) => itemRow(it, idx, true))}
        </div>
      );
      return (
        <div key={si} className="flex flex-col gap-2">
          {sc.head && <div className="font-mono text-[10.5px] font-medium tracking-[.06em] uppercase pt-1" style={{ color: sc.kind === 'fixed' ? C.muted : C.petrol }}>{sc.kind === 'fixed' ? '+ ' : ''}{sc.head.f}</div>}
          {sc.items.filter(({ it }) => it.f.trim()).map(({ it, idx }) => itemRow(it, idx))}
        </div>
      );
    })}
  </>;
}
