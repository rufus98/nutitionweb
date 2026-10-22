import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import * as repo from '../../db/repo';
import type { Appointment, Patient, Plan, Visit } from '../../db/types';
import { useEscape } from '../../components/ui';
import { LETTERS, sections } from '../../lib/planGroups';
import type { PlanItem } from '../../db/types';
import { fmtDate, MONTHS, n1, parseIso, today, WEEKDAYS, addDays, mondayOf } from '../../lib/format';

// Anteprima fedele della PWA paziente (design "App Paziente"): sempre in tema chiaro, come sul telefono del paziente.
const C = { ink: '#18211F', ink2: '#2C3533', muted: '#6B7472', subtle: '#8A928F', petrol: '#1E5A5F', petrol9: '#0F3B40', sage: '#7FA08A', sage4: '#A9C6B1', line: '#E4E2DC', card: '#E8E6E0' };
type T = 'oggi' | 'dieta' | 'prog' | 'studio';

export function PhonePreview({ patient, plan, onClose }: { patient: Patient; plan: Plan; onClose: () => void }) {
  const { settings } = useApp();
  useEscape(onClose);
  const s = settings!;
  const showProg = s.app.weight || s.app.meas;
  const [tab, setTab] = useState<T>('oggi');
  const [banner, setBanner] = useState(s.app.install);
  // Piano settimanale (Lun…Dom) oppure a "giorni tipo" (es. ON / OFF / RESET).
  const weekly = plan.data.days.length === 7 && plan.data.days.every((d, i) => d.label === ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'][i]);
  const todayIdx = weekly ? (parseIso(today()).getDay() + 6) % 7 : 0;
  const dayName = (i: number) => (weekly ? WEEKDAYS[(i + 1) % 7] : `Giorno ${plan.data.days[i]?.label ?? ''}`);
  const [day, setDay] = useState(todayIdx);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<number>(todayIdx);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [next, setNext] = useState<Appointment | undefined>();
  const [scale, setScale] = useState(1);
  const [moreGen, setMoreGen] = useState(false);
  const [pick, setPick] = useState<Record<string, number>>({});
  useEffect(() => {
    repo.listVisits(patient.id).then(setVisits);
    repo.patientAppointments(patient.id).then((a) => setNext(a.find((x) => x.date >= today())));
    const fit = () => setScale(Math.min(1, (window.innerHeight - 48) / 844));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [patient.id]);

  const mon = mondayOf(today());
  const d = plan.data.days[day];
  const doneCount = d.meals.filter((_, i) => done[day + ':' + i]).length;
  const kgV = visits.filter((v) => v.kg != null);
  const first = kgV[0], last = kgV[kgV.length - 1];
  const lost = first && last ? first.kg! - last.kg! : 0;
  const target = patient.target_kg;
  const pct = first && last && target && first.kg! !== target ? Math.max(0, Math.min(100, Math.round(((first.kg! - last.kg!) / (first.kg! - target)) * 100))) : null;
  const KEYS = ['vita', 'fianchi', 'torace', 'braccio', 'coscia'] as const;
  const meas = KEYS.map((k) => { const vs = visits.filter((v) => v[k] != null); return vs.length > 1 ? { l: k[0].toUpperCase() + k.slice(1), d: vs[vs.length - 1][k]! - vs[0][k]! } : null; }).filter(Boolean) as { l: string; d: number }[];
  const cmTot = meas.reduce((a, m) => a + m.d, 0);
  const hours = s.hours.filter((h) => h.on);
  const nav: [T, string, string][] = [['oggi', 'Oggi', '50%'], ['dieta', 'Dieta', '3px'], ...(showProg ? [['prog', 'Progressi', '2px'] as [T, string, string]] : []), ['studio', 'Studio', '50% 50% 3px 3px']];

  // Mini-grafico 300×150
  const G = (() => {
    if (kgV.length < 2) return null;
    const vals = kgV.map((v) => v.kg!).concat(target ? [target] : []);
    const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1, W = 300, H = 150;
    const X = (i: number) => 6 + (i * (W - 12)) / (kgV.length - 1), Y = (v: number) => 10 + ((hi - v) / (hi - lo)) * (H - 20);
    const line = kgV.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v.kg!).toFixed(1)).join(' ');
    return { line, area: line + ` L${X(kgV.length - 1)} ${H} L${X(0)} ${H} Z`, target: target ? `M0 ${Y(target)} H${W}` : '', ty: target ? Y(target) : 0, lx: X(kgV.length - 1), ly: Y(last.kg!) };
  })();

  return (
    <div className="fixed inset-0 z-30 grid place-items-center animate-[fadeIn_.12s_ease]" style={{ background: 'rgb(var(--overlay) / var(--overlay-a))' }} onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="relative" style={{ width: 390 * scale, height: 844 * scale }}>
        <button onClick={onClose} className="absolute -right-12 top-0 w-9 h-9 rounded-full border-0 bg-white/90 text-[#18211F] text-lg" aria-label="Chiudi anteprima">×</button>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 390, height: 844, fontFamily: 'Figtree, sans-serif', color: C.ink, colorScheme: 'light' }}
          className="rounded-[54px] bg-[#0E1716] p-2.5 shadow-[0_30px_70px_rgba(15,30,32,.28)]">
          <div className="relative w-[370px] h-[824px] rounded-[44px] overflow-hidden bg-[#F6F5F1] flex flex-col">
            <div className="h-[50px] flex-none flex justify-between items-center px-[30px] text-[15px] font-semibold relative z-[2]">
              <span>9:41</span><span className="absolute left-1/2 top-[11px] -translate-x-1/2 w-[120px] h-8 rounded-[20px] bg-[#0E1716]" />
              <span className="flex gap-[5px] items-center"><span className="w-[17px] h-2.5 rounded-sm bg-[#18211F]" /><span className="w-6 h-[11px] rounded-[3px] border-[1.5px] border-[#18211F] p-px"><span className="block w-[70%] h-full bg-[#18211F] rounded-[1px]" /></span></span>
            </div>
            <div className="flex-none text-center font-mono text-[10.5px] pb-1" style={{ color: C.subtle }}>{s.appDomain}/p/{patient.token}</div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-[18px] pt-1.5 pb-6 grid auto-rows-max content-start gap-3.5">
              {banner && tab === 'oggi' && (
                <div className="bg-[#0F3B40] text-white rounded-[18px] p-3.5 flex gap-3 items-center">
                  <div className="w-[42px] h-[42px] rounded-[11px] bg-[#A9C6B1] text-[#0F3B40] grid place-items-center font-bold text-lg flex-none">n</div>
                  <div className="flex-1 min-w-0"><div className="font-semibold text-sm">Aggiungi alla Home</div><div className="text-xs text-[#B7CCC5] leading-[1.35]">Tocca <b className="text-white">Condividi</b> → <b className="text-white">Aggiungi a Home</b>. Si apre come un'app.</div></div>
                  <button onClick={() => setBanner(false)} className="border-0 bg-white/[.12] text-white w-8 h-8 rounded-[9px] text-[15px] flex-none">×</button>
                </div>
              )}

              {tab === 'oggi' && <>
                <div className="flex justify-between items-end pt-1">
                  <div><div className="text-[13px]" style={{ color: C.muted }}>{WEEKDAYS[parseIso(today()).getDay()]} {parseIso(today()).getDate()} {MONTHS[parseIso(today()).getMonth()]}</div><div className="text-[28px] font-semibold tracking-[-.02em] leading-[1.15]">Ciao {patient.first}</div></div>
                  {s.app.checks && <div className="text-right"><div className="font-semibold text-xl" style={{ color: C.petrol }}>{doneCount}/{d.meals.length}</div><div className="text-[11.5px]" style={{ color: C.muted }}>pasti {weekly ? 'di ' + dayName(day).toLowerCase() : 'giorno ' + plan.data.days[day].label}</div></div>}
                </div>
                <div className="flex gap-[5px]">
                  {plan.data.days.map((x, i) => {
                    const n = weekly ? parseIso(addDays(mon, i)).getDate() : '';
                    return i === day
                      ? <button key={i} className="flex-1 h-[58px] border-0 rounded-[14px] bg-[#1E5A5F] text-white flex flex-col items-center justify-center gap-0.5"><span className="text-[11px] text-[#BFD6CE]">{x.label}</span><span className="font-semibold text-base">{n}</span></button>
                      : <button key={i} onClick={() => setDay(i)} className="flex-1 h-[58px] border border-[#E4E2DC] rounded-[14px] bg-white text-[#18211F] flex flex-col items-center justify-center gap-0.5 relative"><span className="text-[11px] text-[#8A928F]">{x.label}</span><span className="font-semibold text-base">{n}</span>{weekly && i === todayIdx && <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#1E5A5F]" />}</button>;
                  })}
                </div>
                {s.app.checks && <div className="h-1.5 rounded-[3px] bg-[#E6E4DE] overflow-hidden"><div className="h-full bg-[#7FA08A] rounded-[3px] transition-[width] duration-300" style={{ width: (doneCount / Math.max(1, d.meals.length)) * 100 + '%' }} /></div>}
                {d.meals.map((m, i) => {
                  const ok = done[day + ':' + i];
                  return (
                    <div key={i} className="bg-white border rounded-[18px] py-3.5 pr-3.5 pl-4 flex flex-col gap-2" style={{ borderColor: C.card }}>
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 flex gap-2 items-baseline"><span className="font-semibold text-base">{m.name}</span><span className="font-mono text-[11.5px]" style={{ color: C.subtle }}>{m.time}</span></div>
                        {s.app.checks && (ok ? <button onClick={() => setDone({ ...done, [day + ':' + i]: false })} className="w-11 h-11 rounded-full border-0 bg-[#1E5A5F] text-white text-[17px] font-bold">✓</button>
                          : <button onClick={() => setDone({ ...done, [day + ':' + i]: true })} className="w-11 h-11 rounded-full border-[1.5px] border-[#CFD8D4] bg-white" />)}
                      </div>
                      <MealBody items={m.items} pick={pick[day + ':' + i] ?? 0} setPick={(v) => setPick({ ...pick, [day + ':' + i]: v })} />
                      {m.note && <div className="text-[12.5px] text-[#7A5426] bg-[#F7F0E4] rounded-[9px] px-[9px] py-1.5">{m.note}</div>}
                    </div>
                  );
                })}
              </>}

              {tab === 'dieta' && <>
                <div className="pt-1"><div className="text-[13px]" style={{ color: C.muted }}>Piano v{plan.version} · dal {fmtDate(plan.published_at ?? plan.created_at)}</div><div className="text-[28px] font-semibold tracking-[-.02em] leading-[1.15]">La mia dieta</div></div>
                <div className="grid grid-cols-2 gap-2">
                  {s.app.pdf && plan.has_pdf && <span className="flex items-center justify-center gap-2 h-12 rounded-[14px] bg-white border border-[#E4E2DC] font-semibold text-sm"><span className="font-mono text-[9px] font-semibold text-[#1E5A5F] border-[1.5px] border-[#1E5A5F] rounded-[3px] px-[3px] py-0.5">PDF</span>Originale</span>}
                  <span className="flex items-center justify-center h-12 rounded-[14px] bg-white border border-[#E4E2DC] font-semibold text-sm">Lista spesa</span>
                </div>
                {plan.data.general && (
                  <div className="bg-[#EEF3EE] rounded-2xl px-4 py-3.5 text-[13.5px] text-[#2C4A3A] leading-normal">
                    <b>Indicazioni generali</b>
                    <div className={'whitespace-pre-line' + (moreGen ? '' : ' line-clamp-4')}>{plan.data.general}</div>
                    {plan.data.general.length > 180 && <button onClick={() => setMoreGen(!moreGen)} className="border-0 bg-transparent p-0 mt-1 font-semibold text-[#1E5A5F] text-[13px]">{moreGen ? 'Mostra meno' : 'Leggi tutto'}</button>}
                  </div>
                )}
                {plan.data.days.map((x, i) => (
                  <div key={i} className="bg-white border rounded-[18px] overflow-hidden" style={{ borderColor: C.card }}>
                    <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full border-0 bg-transparent px-4 h-14 flex items-center justify-between text-base font-semibold text-[#18211F]">
                      <span>{dayName(i)}{weekly && i === todayIdx && <span className="ml-2 text-[11px] font-semibold text-[#1E5A5F] bg-[#E6EFEC] px-[7px] py-0.5 rounded-full">Oggi</span>}</span>
                      <span className="text-[13px] text-[#8A928F] font-medium">{open === i ? '−' : '+'}</span>
                    </button>
                    {open === i && <div className="px-4 pb-3.5 flex flex-col gap-3">
                      {x.meals.map((m, j) => <div key={j} className="flex flex-col gap-[3px] border-t border-[#F0EEE9] pt-2.5"><div className="font-mono text-[11px] font-medium tracking-[.06em] uppercase" style={{ color: C.muted }}>{m.name}</div>{m.items.length ? <div className="flex flex-col gap-2 pt-1"><MealBody items={m.items} pick={0} setPick={() => {}} all /></div> : <div className="text-sm" style={{ color: C.ink2 }}>—</div>}</div>)}
                    </div>}
                  </div>
                ))}
              </>}

              {tab === 'prog' && <>
                <div className="pt-1"><div className="text-[13px]" style={{ color: C.muted }}>{first ? `Dal ${parseIso(first.date).getDate()} ${MONTHS[parseIso(first.date).getMonth()]} · ${visits.length} visite` : 'Nessuna visita'}</div><div className="text-[28px] font-semibold tracking-[-.02em] leading-[1.15]">I miei progressi</div></div>
                {s.app.weight && last && <>
                  <div className="bg-[#1E5A5F] text-white rounded-[22px] p-[18px] flex flex-col gap-3.5">
                    <div className="flex justify-between items-end"><div><div className="text-[13px] text-[#BFD6CE]">{lost >= 0 ? 'Hai perso' : 'Variazione'}</div><div className="text-[44px] font-semibold tracking-[-.03em] leading-none">{n1(Math.abs(lost))} <span className="text-xl">kg</span></div></div>
                      <div className="text-right text-[13px] text-[#BFD6CE]">Ora <b className="text-white">{n1(last.kg!)} kg</b>{target ? <><br />Obiettivo {n1(target).replace(',0', '')} kg</> : null}</div></div>
                    {pct != null && <div><div className="h-2 rounded bg-white/[.18] overflow-hidden"><div className="h-full bg-[#A9C6B1] rounded" style={{ width: pct + '%' }} /></div><div className="text-[12.5px] text-[#D7E5DF] mt-[7px]">Sei al {pct}% del percorso{target && last.kg! > target ? ` — mancano ${n1(last.kg! - target)} kg.` : '.'}</div></div>}
                  </div>
                  {G && <div className="bg-white border rounded-[18px] p-4 flex flex-col gap-2.5" style={{ borderColor: C.card }}>
                    <div className="flex justify-between items-baseline"><span className="font-semibold text-base">Peso</span><span className="font-mono text-[11.5px]" style={{ color: C.subtle }}>{fmtDate(first.date).split(' ')[1]} → {fmtDate(last.date).split(' ')[1]}</span></div>
                    <div className="relative h-[150px]">
                      <svg width={300} height={150} className="absolute left-0 top-0 overflow-visible"><path d={G.area} style={{ fill: '#7FA08A', fillOpacity: 0.16 }} />{G.target && <path d={G.target} style={{ stroke: '#C9833A', strokeWidth: 1.5, strokeDasharray: '4 4', fill: 'none' }} />}<path d={G.line} style={{ stroke: '#1E5A5F', strokeWidth: 3, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }} /></svg>
                      <div className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-[#1E5A5F] border-[3px] border-white shadow-[0_0_0_1px_#1E5A5F]" style={{ left: G.lx, top: G.ly }} />
                      {target && <div className="absolute right-0 -translate-y-[120%] font-mono text-[10.5px] font-medium text-[#A5621F]" style={{ top: G.ty }}>obiettivo {n1(target).replace(',0', '')}</div>}
                    </div>
                  </div>}
                </>}
                {s.app.meas && meas.length > 0 && <div className="bg-white border rounded-[18px] p-4 flex flex-col gap-1" style={{ borderColor: C.card }}>
                  <div className="font-semibold text-base mb-1.5">Centimetri persi</div>
                  <div className="grid grid-cols-3 gap-2">{meas.map((m) => <div key={m.l} className="bg-[#F3F6F3] rounded-[14px] px-3 py-2.5"><div className="text-xs text-[#5E6866]">{m.l}</div><div className="text-xl font-semibold text-[#245C3B]">{(m.d > 0 ? '+' : m.d < 0 ? '−' : '') + n1(Math.abs(m.d))}</div></div>)}</div>
                </div>}
                <div className="text-[13.5px] text-[#5E6866] text-center px-3 py-0.5">{s.app.meas && meas.length ? `${cmTot <= 0 ? '−' : '+'}${n1(Math.abs(cmTot))} cm in totale. ` : ''}{next ? `Prossimo controllo: ${parseIso(next.date).getDate()} ${MONTHS[parseIso(next.date).getMonth()]}.` : ''}</div>
              </>}

              {tab === 'studio' && <>
                <div className="pt-1"><div className="text-[28px] font-semibold tracking-[-.02em] leading-[1.15]">Il tuo studio</div></div>
                <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-4 items-center text-center" style={{ borderColor: C.card }}>
                  {s.photo || s.logo ? <img src={s.photo || s.logo!} className="w-[76px] h-[76px] rounded-full object-cover" alt="" /> : <div className="w-[76px] h-[76px] rounded-full grid place-items-center font-mono text-[9.5px] text-[#6B7472]" style={{ background: 'repeating-linear-gradient(45deg,#E6ECE8 0 6px,#F1F4F1 6px 12px)' }}>foto</div>}
                  <div><div className="text-[19px] font-semibold">{s.prof.name || 'Il tuo studio'}</div><div className="text-[13px]" style={{ color: C.muted }}>{[s.prof.title, s.prof.addr.split(',').pop()?.trim()].filter(Boolean).join(' · ')}</div></div>
                  <div className="flex flex-col gap-2 w-full">
                    <span className="h-[54px] rounded-[15px] bg-[#1E5A5F] text-white font-semibold text-base flex items-center justify-center gap-[9px]"><span className="w-[9px] h-[9px] rounded-full bg-[#A9C6B1]" />Scrivi su WhatsApp</span>
                    <div className="grid grid-cols-2 gap-2"><span className="h-[50px] rounded-[15px] border border-[#DAD8D1] font-semibold flex items-center justify-center">Chiama</span><span className="h-[50px] rounded-[15px] border border-[#DAD8D1] font-semibold flex items-center justify-center">Email</span></div>
                  </div>
                </div>
                {next && <div className="bg-[#EEF3EE] rounded-[18px] p-4"><div className="font-mono text-[11px] font-medium tracking-[.06em] uppercase text-[#4E6E5B]">Prossimo appuntamento</div><div className="text-[17px] font-semibold mt-[3px]">{WEEKDAYS[parseIso(next.date).getDay()].slice(0, 3)} {parseIso(next.date).getDate()} {MONTHS[parseIso(next.date).getMonth()]} · {next.time}</div></div>}
                <div className="bg-white border rounded-[18px] p-4 text-sm leading-normal" style={{ borderColor: C.card, color: C.ink2 }}><div className="font-semibold mb-0.5">Studio</div>{s.prof.addr || '—'}<br /><span style={{ color: C.muted }}>{hours.length ? `${hours[0].day.slice(0, 3)}–${hours[hours.length - 1].day.slice(0, 3)} ${hours[0].a}–${hours[0].d || hours[0].b}` : ''}</span></div>
              </>}
            </div>

            <div className="flex-none bg-white/[.94] border-t border-[#E6E4DE] pt-2 px-2.5 pb-[26px] grid" style={{ gridTemplateColumns: `repeat(${nav.length},1fr)` }}>
              {nav.map(([id, label, r]) => id === tab ? (
                <button key={id} className="border-0 bg-transparent h-[52px] flex flex-col items-center justify-center gap-[5px] text-[#0F3B40] font-semibold text-[11.5px]"><span className="w-10 h-[26px] rounded-[13px] bg-[#DCE8DF] grid place-items-center"><span className="w-3 h-3 bg-[#1E5A5F]" style={{ borderRadius: r }} /></span>{label}</button>
              ) : (
                <button key={id} onClick={() => setTab(id)} className="border-0 bg-transparent h-[52px] flex flex-col items-center justify-center gap-[5px] text-[#6B7472] font-medium text-[11.5px]"><span className="w-10 h-[26px] grid place-items-center"><span className="w-3 h-3 border-[1.8px] border-[#8A928F]" style={{ borderRadius: r }} /></span>{label}</button>
              ))}
            </div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[130px] h-[5px] rounded-[3px] bg-[#18211F]" />
          </div>
        </div>
      </div>
    </div>
  );
}

const itemRow = (it: PlanItem, j: number, dot?: boolean) => (
  <div key={j} className={'flex justify-between gap-2.5 text-sm leading-[1.3]' + (it.sub ? ' pl-3' : '')}>
    <span className="flex gap-2" style={{ color: C.ink2 }}>{dot && <span className="w-2 h-2 rounded-full border-[1.5px] border-[#7FA08A] flex-none mt-[5px]" />}<span>{it.sub ? '– ' : ''}{it.f}</span></span>
    <span className="font-mono text-[12.5px] font-medium whitespace-nowrap" style={{ color: C.petrol }}>{it.g}</span>
  </div>
);

/** Corpo del pasto nell'app paziente: le varianti si scelgono con i chip A/B/C, i gruppi "scegli 1" sono elenchi di alternative. */
function MealBody({ items, pick, setPick, all }: { items: PlanItem[]; pick: number; setPick: (v: number) => void; all?: boolean }) {
  const secs = sections(items);
  const variants = secs.filter((s) => s.kind === 'variant');
  return (
    <>
      {variants.length > 1 && !all && (
        <div className="flex gap-1.5 flex-wrap">
          {variants.map((_, k) => (
            <button key={k} onClick={() => setPick(k)} className={'h-8 px-3 rounded-full text-[12.5px] font-semibold border ' + (k === pick ? 'bg-[#1E5A5F] text-white border-[#1E5A5F]' : 'bg-white text-[#2C3533] border-[#E4E2DC]')}>Opzione {LETTERS[k]}</button>
          ))}
        </div>
      )}
      {secs.map((sc, si) => {
        if (sc.kind === 'variant') {
          const k = variants.indexOf(sc);
          if (variants.length > 1 && k !== pick && !all) return null;
          return (
            <div key={si} className="flex flex-col gap-2">
              {all && k > 0 && <div className="text-center font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: C.subtle }}>— oppure —</div>}
              <div className="font-mono text-[10.5px] font-medium tracking-[.06em] uppercase" style={{ color: C.petrol }}>{all && variants.length > 1 ? `Opzione ${LETTERS[k]} · ` : ''}{sc.head!.f}</div>
              {sc.items.map(({ it, idx }) => itemRow(it, idx))}
            </div>
          );
        }
        if (sc.kind === 'choice') return (
          <div key={si} className="rounded-[12px] bg-[#F3F6F3] px-3 py-2.5 flex flex-col gap-1.5">
            <div className="flex justify-between items-center gap-2"><span className="text-[12.5px] font-semibold text-[#245C3B]">{sc.head!.f}</span><span className="text-[11px] font-semibold text-[#245C3B] bg-white rounded-full px-2 py-0.5">scegli 1</span></div>
            {sc.items.map(({ it, idx }) => itemRow(it, idx, true))}
          </div>
        );
        return (
          <div key={si} className="flex flex-col gap-2">
            {sc.head && <div className="font-mono text-[10.5px] font-medium tracking-[.06em] uppercase pt-1" style={{ color: sc.kind === 'fixed' ? C.muted : C.petrol }}>{sc.kind === 'fixed' ? '+ ' : ''}{sc.head.f}</div>}
            {sc.items.map(({ it, idx }) => itemRow(it, idx))}
          </div>
        );
      })}
    </>
  );
}
