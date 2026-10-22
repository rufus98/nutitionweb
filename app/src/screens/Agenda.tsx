import { useEffect, useMemo, useState } from 'react';
import { useApp, useLoad, type Route } from '../app/store';
import * as repo from '../db/repo';
import type { Appointment, ApptType, Hours } from '../db/types';
import { Avatar, Checkbox, cx, Field, Modal, ModalHeader, Page, TimeInput } from '../components/ui';
import { addDays, fillTemplate, fmtShort, initialsOf, mondayOf, MONTHS, parseIso, telLink, today, toHHMM, toMin, waLink, WEEKDAYS } from '../lib/format';
import { openExternal } from '../lib/platform';
import { goalLabel } from './PatientList';

const PH = 56;
const DL = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/** Fasce non prenotabili ricavate dagli orari di ricevimento (Impostazioni → Orari). */
function blocksFor(h: Hours | undefined, H0: number, H1: number) {
  const end = H1 * 60;
  if (!h || !h.on) return [{ start: H0 * 60, dur: end - H0 * 60, label: 'Chiuso' }];
  const out: { start: number; dur: number; label: string }[] = [];
  if (h.b && h.c && toMin(h.c) > toMin(h.b)) out.push({ start: toMin(h.b), dur: toMin(h.c) - toMin(h.b), label: 'Pausa' });
  const close = h.d ? toMin(h.d) : h.b ? toMin(h.b) : end;
  if (close < end) out.push({ start: close, dur: end - close, label: 'Chiuso' });
  return out;
}

/** Appuntamenti sovrapposti affiancati in colonne. */
function lanes(list: Appointment[]) {
  const sorted = [...list].sort((x, y) => toMin(x.time) - toMin(y.time));
  const out: { a: Appointment; lane: number; of: number }[] = [];
  let group: typeof out = [], end = -1;
  const flush = () => { const n = Math.max(...group.map((g) => g.lane)) + 1; group.forEach((g) => (g.of = n)); out.push(...group); group = []; };
  for (const a of sorted) {
    const st = toMin(a.time);
    if (group.length && st >= end) { flush(); end = -1; }
    const used = new Set(group.filter((g) => toMin(g.a.time) + g.a.duration > st).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ a, lane, of: 1 });
    end = Math.max(end, st + a.duration);
  }
  if (group.length) flush();
  return out;
}

export const reminderText = (a: Appointment, tpl: string, studio: string) =>
  fillTemplate(tpl, { nome: (a.name ?? '').split(' ')[0], data: `${WEEKDAYS[parseIso(a.date).getDay()].toLowerCase()} ${parseIso(a.date).getDate()} ${MONTHS[parseIso(a.date).getMonth()]}`, ora: a.time, studio });

export function Agenda({ route }: { route: Extract<Route, { name: 'agenda' }> }) {
  const { go, toast, bump, settings, confirm } = useApp();
  const [mon, setMon] = useState(mondayOf(route.date ?? today()));
  const [sel, setSel] = useState<number | null>(route.select ?? null);
  const [form, setForm] = useState<null | { id?: number; pid: number; date: string; time: string; type: ApptType; remind: boolean }>(
    route.book ? { pid: route.patientId ?? 0, date: today(), time: '09:00', type: route.patientId ? 'prima' : 'controllo', remind: true } : null);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  const hours = settings?.hours ?? [];
  const days = hours[6]?.on ? 7 : 6;
  const H0 = Math.min(8, ...hours.filter((h) => h.on && h.a).map((h) => Math.floor(toMin(h.a) / 60)));
  const H1 = Math.max(19, ...hours.filter((h) => h.on && (h.d || h.b)).map((h) => Math.ceil(toMin(h.d || h.b) / 60)));
  const [list] = useLoad(() => repo.listAppointments(mon, addDays(mon, 6)), [mon]);
  const [todayList] = useLoad(() => repo.listAppointments(today(), today()), []);
  const appts = list ?? [];
  const selA = appts.find((a) => a.id === sel) ?? todayList?.find((a) => a.id === sel);
  const yOf = (m: number) => ((m - H0 * 60) / 60) * PH;

  // Frecce ←/→ per cambiare settimana (quando non si sta scrivendo in un campo).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || form) return;
      if (e.key === 'ArrowLeft' && !e.altKey) setMon((m) => addDays(m, -7));
      if (e.key === 'ArrowRight' && !e.altKey) setMon((m) => addDays(m, 7));
      if (e.key === 'Home') setMon(mondayOf(today()));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [form]);

  const sat = addDays(mon, days - 1), m0 = parseIso(mon), s0 = parseIso(sat);
  const weekLabel = `${m0.getDate()}${m0.getMonth() !== s0.getMonth() ? ' ' + MONTHS[m0.getMonth()] : ''} – ${s0.getDate()} ${MONTHS[s0.getMonth()]} ${s0.getFullYear()}`;
  const studio = settings?.prof.name || 'lo studio';
  const where = (a: Appointment) => a.type === 'online' ? 'Videochiamata' : settings?.prof.addr ? 'Studio · ' + settings.prof.addr.split(',')[0] : 'Studio';

  const onSlot = (date: string, d: number, e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = H0 * 60 + Math.floor((((e.clientY - r.top) / PH) * 60) / 15) * 15;
    if (blocksFor(hours[d], H0, H1).some((b) => m >= b.start && m < b.start + b.dur)) return;
    setForm({ pid: 0, date, time: toHHMM(m), type: 'controllo', remind: true });
  };
  const cancel = async (a: Appointment) => {
    if (!(await confirm({ title: "Annullare l'appuntamento?", body: `${a.name} · ${fmtShort(a.date)} alle ${a.time}. Potrai avvisare il paziente su WhatsApp.`, ok: 'Annulla appuntamento', cancel: 'Indietro', danger: true }))) return;
    await repo.deleteAppointment(a.id);
    setSel(null);
    bump();
    toast('Appuntamento annullato');
  };

  return (
    <Page gap="gap-[18px]" pt="pt-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div><h1 className="m-0 text-[28px] font-semibold tracking-[-.02em]">Agenda</h1><div className="text-muted text-[13px] mt-0.5">{weekLabel} · {appts.length} appuntamenti</div></div>
        <div className="flex gap-2 items-center">
          <div className="flex border border-ctl rounded-ctl bg-surface overflow-hidden">
            <button onClick={() => setMon(addDays(mon, -7))} className="border-0 bg-transparent px-[13px] py-[9px] text-sm hover:bg-canvas" title="Settimana precedente (←)">‹</button>
            <button onClick={() => setMon(mondayOf(today()))} className="border-0 border-x border-line2 bg-transparent px-3.5 py-[9px] font-medium text-[13px] hover:bg-canvas" title="Oggi (Home)">Oggi</button>
            <button onClick={() => setMon(addDays(mon, 7))} className="border-0 bg-transparent px-[13px] py-[9px] text-sm hover:bg-canvas" title="Settimana successiva (→)">›</button>
          </div>
          <button className="btn-primary" onClick={() => setForm({ pid: 0, date: mon <= today() && today() <= sat ? today() : mon, time: '09:00', type: 'controllo', remind: true })}>+ Nuovo appuntamento</button>
        </div>
      </div>

      <div className="flex gap-4 text-[12.5px] text-muted">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-primary" />Prima visita</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-avatar border border-sage-500" />Controllo</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-warn-bg border border-warn-line" />Online</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] hatch-sm" />Non disponibile</span>
        <span className="ml-auto">Clicca su uno slot libero per prenotare</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <div className="card overflow-hidden min-w-0">
          <div className="grid border-b border-line2" style={{ gridTemplateColumns: `56px repeat(${days},minmax(0,1fr))` }}>
            <div />
            {Array.from({ length: days }, (_, d) => {
              const date = addDays(mon, d), isToday = date === today(), n = appts.filter((a) => a.date === date).length;
              return (
                <div key={d} className={cx('px-3 py-2.5 border-l border-line2', isToday && 'bg-tint')}>
                  <div className={cx('label', isToday && '!text-accent')}>{DL[d]}</div>
                  <div className="flex items-center gap-2">
                    <span className={cx('text-xl font-semibold', isToday && 'text-white bg-primary rounded-lg px-[7px]')}>{parseIso(date).getDate()}</span>
                    <span className={cx('text-xs', isToday ? 'text-muted' : 'text-subtle')}>{n ? n + ' app.' : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid relative" style={{ gridTemplateColumns: `56px repeat(${days},minmax(0,1fr))` }}>
            <div className="relative" style={{ height: (H1 - H0) * PH }}>
              {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-subtle" style={{ top: i * PH }}>{String(H0 + i).padStart(2, '0')}:00</div>)}
            </div>
            {Array.from({ length: days }, (_, d) => {
              const date = addDays(mon, d), isToday = date === today();
              const nowM = now.getHours() * 60 + now.getMinutes();
              return (
                <div key={d} onClick={(e) => onSlot(date, d, e)} className="relative border-l border-line2 cursor-copy agenda-col" style={{ height: (H1 - H0) * PH }}>
                  {isToday && <div className="absolute inset-0 bg-[rgba(127,160,138,.06)] pointer-events-none" />}
                  {blocksFor(hours[d], H0, H1).map((b, i) => (
                    <div key={i} onClick={(e) => e.stopPropagation()} className="absolute left-0 right-0 hatch flex items-center justify-center font-mono text-[10.5px] font-medium text-subtle cursor-not-allowed" style={{ top: yOf(b.start), height: (b.dur / 60) * PH }}>{b.label}</div>
                  ))}
                  {lanes(appts.filter((a) => a.date === date)).map(({ a, lane, of }) => {
                    const ring = sel === a.id ? '0 0 0 2px rgb(var(--surface)),0 0 0 4px rgb(var(--orange))' : 'none';
                    const cls = a.type === 'prima' ? 'bg-primary text-white' : a.type === 'online' ? 'bg-warn-bg border border-warn-line' : 'bg-avatar border border-sage-400';
                    const sub = a.type === 'prima' ? 'text-[#BFD6CE]' : a.type === 'online' ? 'text-warn' : 'text-[rgb(var(--ok))]';
                    return (
                      <div key={a.id} onClick={(e) => { e.stopPropagation(); setSel(a.id); }} onDoubleClick={(e) => { e.stopPropagation(); go({ name: 'patient', id: a.patient_id }); }}
                        className="absolute cursor-pointer" style={{ top: yOf(toMin(a.time)) + 1, height: (a.duration / 60) * PH - 3, left: `calc(${(lane / of) * 100}% + 4px)`, width: `calc(${100 / of}% - 8px)` }} title={`${a.name} · ${a.time}`}>
                        <div className={cx('h-full rounded-lg px-2 py-[5px] overflow-hidden', cls)} style={{ boxShadow: ring }}>
                          <div className="font-semibold text-[12.5px] truncate">{a.name}</div>
                          <div className={cx('font-mono text-[10.5px] truncate', sub)}>{a.time} · {repo.APPT_TYPES[a.type][0]}</div>
                        </div>
                      </div>
                    );
                  })}
                  {isToday && nowM >= H0 * 60 && nowM <= H1 * 60 && (
                    <div className="absolute -left-px right-0 h-0.5 bg-orange pointer-events-none" style={{ top: yOf(nowM) }}><span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-orange" /></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4 sticky top-5">
          {selA && (
            <div className="card p-[18px] flex flex-col gap-3">
              <div className="flex justify-between items-start"><div className="label">{repo.APPT_TYPES[selA.type][0]}</div><button onClick={() => setSel(null)} className="btn-x !w-[26px] !h-[26px] !rounded-[7px]">×</button></div>
              <div className="flex gap-[11px] items-center"><Avatar text={initialsOf(selA.name ?? '')} size={40} /><div><div className="font-semibold text-base">{selA.name}</div><div className="text-[12.5px] text-label">{goalLabel({ goal: selA.goal ?? null, target_kg: null })}</div></div></div>
              <div className="grid grid-cols-[70px_1fr] gap-y-1.5 text-[13px]">
                <span className="text-label">Quando</span><span>{WEEKDAYS[parseIso(selA.date).getDay()]} {parseIso(selA.date).getDate()} {MONTHS[parseIso(selA.date).getMonth()]} · {selA.time}–{toHHMM(toMin(selA.time) + selA.duration)}</span>
                <span className="text-label">Durata</span><span>{selA.duration} min</span>
                <span className="text-label">Dove</span><span>{where(selA)}</span>
              </div>
              {selA.remind && selA.date >= today() && (
                <button onClick={() => openExternal(waLink(selA.phone ?? '', reminderText(selA, settings?.tpl[0] ?? '', studio)))} className="text-left text-[12.5px] text-ok bg-tint rounded-[9px] px-2.5 py-[7px] border-0 hover:brightness-[.97]">
                  Promemoria WhatsApp · lo trovi in "Oggi" il giorno prima, oppure <u>invialo ora</u>
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-wa justify-center" onClick={() => openExternal(waLink(selA.phone ?? ''))}>WhatsApp</button>
                <button className="btn-secondary py-[9px]" onClick={() => openExternal(telLink(selA.phone ?? ''))}>Chiama</button>
              </div>
              <button className="btn-primary" onClick={() => go({ name: 'patient', id: selA.patient_id })}>Apri scheda paziente →</button>
              <div className="flex justify-between">
                <button className="link-btn" onClick={() => setForm({ id: selA.id, pid: selA.patient_id, date: selA.date, time: selA.time, type: selA.type, remind: selA.remind })}>Sposta / modifica</button>
                <button className="border-0 bg-transparent text-err text-[13px] font-medium p-0.5 hover:underline" onClick={() => cancel(selA)}>Annulla appuntamento</button>
              </div>
            </div>
          )}
          <div className="card p-[18px] flex flex-col gap-1">
            <div className="flex justify-between items-baseline mb-1.5"><span className="font-semibold text-[15px]">Oggi · {WEEKDAYS[new Date().getDay()].slice(0, 3).toLowerCase()} {fmtShort(today())}</span><span className="text-xs text-label">{todayList?.length ?? 0} appuntamenti</span></div>
            {todayList?.map((t) => (
              <button key={t.id} onClick={() => { setMon(mondayOf(today())); setSel(t.id); }} className="grid grid-cols-[48px_1fr] gap-2.5 items-center py-2 border-0 border-t border-line2 bg-transparent text-left text-[13px] hover:bg-surface2">
                <span className="font-mono text-xs font-medium text-accent">{t.time}</span>
                <span><span className="block font-medium text-ink">{t.name}</span><span className="text-xs text-label">{repo.APPT_TYPES[t.type][0]} · {t.duration} min</span></span>
              </button>
            ))}
            {!todayList?.length && <div className="text-[13px] text-label py-2">Nessun appuntamento.</div>}
          </div>
        </div>
      </div>

      {form && <BookModal init={form} hours={hours} onClose={() => setForm(null)} onSaved={(id, date) => { setForm(null); setMon(mondayOf(date)); setSel(id); }} />}
    </Page>
  );
}

function BookModal({ init, hours, onClose, onSaved }: { init: { id?: number; pid: number; date: string; time: string; type: ApptType; remind: boolean }; hours: Hours[]; onClose: () => void; onSaved: (id: number, date: string) => void }) {
  const { bump, toast, settings } = useApp();
  const [f, setF] = useState(init);
  const [patients, setPatients] = useState<{ id: number; name: string }[]>([]);
  const [same, setSame] = useState<Appointment[]>([]);
  useEffect(() => {
    repo.listPatients().then((l) => {
      const ps = l.filter((p) => p.active || p.id === init.pid).map((p) => ({ id: p.id, name: `${p.first} ${p.last}` })).sort((a, b) => a.name.localeCompare(b.name));
      setPatients(ps);
      setF((x) => (x.pid ? x : { ...x, pid: ps[0]?.id ?? 0 }));
    });
  }, []);
  useEffect(() => { repo.listAppointments(f.date, f.date).then(setSame); }, [f.date]);
  const durOf = (t: ApptType) => settings?.dur[t] ?? repo.APPT_TYPES[t][1];
  const dur = durOf(f.type), buf = settings?.dur.buffer ?? 0;
  const st = toMin(f.time || '09:00'), en = st + dur;
  // Sovrapposizione considerando anche il buffer tra visite impostato.
  const conflict = same.some((a) => a.id !== f.id && toMin(a.time) < en + buf && toMin(a.time) + a.duration + buf > st);
  const h = hours[(parseIso(f.date).getDay() + 6) % 7];
  const outside = useMemo(() => {
    if (!h || !h.on) return 'Lo studio risulta chiuso in questo giorno.';
    const inRange = (a: string, b: string) => a && b && st >= toMin(a) && en <= toMin(b);
    return inRange(h.a, h.b) || inRange(h.c, h.d) ? '' : 'Fuori dagli orari di ricevimento.';
  }, [h, st, en]);

  const save = async () => {
    if (!f.pid || !f.date || !/^\d{2}:\d{2}$/.test(f.time)) return;
    const a = { patient_id: f.pid, date: f.date, time: f.time, type: f.type, duration: dur, remind: f.remind, note: null };
    let id = f.id;
    if (id) await repo.updateAppointment(id, a);
    else id = await repo.addAppointment(a);
    bump();
    toast(f.id ? 'Appuntamento aggiornato' : f.remind ? 'Appuntamento confermato · promemoria in "Oggi" il giorno prima' : 'Appuntamento confermato');
    onSaved(id, f.date);
  };

  return (
    <Modal onClose={onClose} width={460}>
      <div className="-mt-1 flex flex-col gap-3.5" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save(); }}>
        <ModalHeader title={f.id ? 'Modifica appuntamento' : 'Nuovo appuntamento'} onClose={onClose} />
        <Field label="Paziente"><select className="field" value={f.pid} onChange={(e) => setF({ ...f, pid: +e.target.value })}>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Giorno"><input type="date" className="field py-[9px]" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Ora"><TimeInput className="field py-[9px]" value={f.time} onChange={(v) => setF({ ...f, time: v })} /></Field>
        </div>
        <div className="flex flex-col gap-1.5"><span className="label">Tipo</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.entries(repo.APPT_TYPES) as [ApptType, [string, number]][]).map(([k, [l]]) => [k, l, durOf(k)] as const).map(([k, l, d]) => (
              <button key={k} onClick={() => setF({ ...f, type: k })} className={cx('px-1.5 py-[9px] rounded-ctl text-[13px]', k === f.type ? 'border-[1.5px] border-primary bg-tint2 font-semibold text-strong' : 'border border-ctl bg-surface font-medium hover:border-sage-500')}>
                {l}<span className={cx('block font-mono text-[11px] font-normal', k === f.type ? 'text-muted' : 'text-subtle')}>{d} min</span>
              </button>
            ))}
          </div>
        </div>
        <button role="checkbox" aria-checked={f.remind} onClick={() => setF({ ...f, remind: !f.remind })} className="flex items-center gap-2.5 text-[13.5px] border-0 bg-transparent p-0 text-left"><Checkbox on={f.remind} />Promemoria WhatsApp 24 h prima</button>
        {conflict && <div className="text-[12.5px] text-warn bg-warn-bg rounded-[9px] px-2.5 py-[7px]">Si sovrappone a un altro appuntamento.</div>}
        {!conflict && outside && <div className="text-[12.5px] text-warn bg-warn-bg rounded-[9px] px-2.5 py-[7px]">{outside}</div>}
        <div className="flex gap-2.5 justify-end pt-1">
          <button className="btn-secondary px-4" onClick={onClose}>Annulla</button>
          <button className="btn-primary px-[18px]" onClick={save} disabled={!f.pid} title="Ctrl+Invio">Conferma</button>
        </div>
      </div>
    </Modal>
  );
}
