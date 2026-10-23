import { useApp, useLoad } from '../app/store';
import * as repo from '../db/repo';
import { Avatar, cx, Page, WaDot } from '../components/ui';
import { remindPayment } from '../components/payments';
import { reminderText } from './Agenda';
import { addDays, ago, daysBetween, eur, fmtShort, initialsOf, MONTHS, parseIso, today, toHHMM, toMin, waLink, WEEKDAYS } from '../lib/format';
import { openExternal } from '../lib/platform';

async function load() {
  const t = today();
  const [appts, tomorrow, patients, pays, plans] = await Promise.all([
    repo.listAppointments(t, t), repo.listAppointments(addDays(t, 1), addDays(t, 1)), repo.listPatients(), repo.listPayments(), repo.listAllPlans(),
  ]);
  const sent = new Set(tomorrow.filter((a) => a.reminder_sent_at).map((a) => a.id));
  return { appts, tomorrow, patients, pays, plans, sent };
}

/** "Oggi": colpo d'occhio sulla giornata (non presente nel design originale, costruita con lo stesso linguaggio visivo). */
export function Today() {
  const { go, settings, bump } = useApp();
  const [data] = useLoad(load, []);
  const now = new Date(), t = today(), nowM = now.getHours() * 60 + now.getMinutes();
  const first = (settings?.prof.name || '').replace(/^(Dott\.ssa|Dott\.|Dr\.?|Dottoressa|Dottore)\s+/i, '').split(' ')[0];
  const hello = now.getHours() < 13 ? 'Buongiorno' : now.getHours() < 18 ? 'Buon pomeriggio' : 'Buonasera';
  if (!data) return <Page><div /></Page>;
  const { appts, tomorrow, patients, pays, plans, sent } = data;
  const due = pays.filter((p) => !p.paid);
  const drafts = plans.filter((p) => p.status === 'draft');
  const recall = patients.filter((p) => p.active && !p.next_visit && p.last_visit && daysBetween(p.last_visit, t) > 30).sort((a, b) => (a.last_visit! < b.last_visit! ? -1 : 1));
  const consents = patients.filter((p) => !p.consent_privacy);
  const nextIdx = appts.findIndex((a) => toMin(a.time) + a.duration > nowM);
  const studio = settings?.prof.name || 'lo studio';
  const d = parseIso(t);

  const kpis = [
    { label: 'Appuntamenti oggi', value: String(appts.length), sub: appts.length ? (nextIdx >= 0 ? `prossimo alle ${appts[nextIdx].time}` : 'giornata conclusa') : 'agenda libera', onClick: () => go({ name: 'agenda' }) },
    { label: 'Da incassare', value: '€ ' + eur(due.reduce((a, p) => a + p.amount, 0)), sub: `${due.length} in sospeso`, onClick: () => go({ name: 'payments' }), warn: due.length > 0 },
    { label: 'Piani da inviare', value: String(drafts.length), sub: drafts.length ? `${drafts.filter((p) => p.saved_at).length} salvati · ${drafts.filter((p) => !p.saved_at).length} in preparazione` : 'tutto condiviso', onClick: () => go({ name: 'plans' }) },
    { label: 'Da ricontattare', value: String(recall.length), sub: 'senza visita da oltre 30 gg', onClick: () => go({ name: 'patients' }) },
  ];

  return (
    <Page>
      <div className="flex items-end justify-between gap-4">
        <div><h1 className="m-0 text-[28px] font-semibold tracking-[-.02em]">{hello}{first ? `, ${first}` : ''}</h1><div className="text-muted text-[13px] mt-0.5">{WEEKDAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()}</div></div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => go({ name: 'agenda', book: true })}>+ Appuntamento</button>
          <button className="btn-primary" onClick={() => go({ name: 'new' })}>+ Nuovo paziente</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {kpis.map((k) => (
          <button key={k.label} onClick={k.onClick} className={cx('rounded-[14px] px-4 py-3.5 flex flex-col gap-1.5 text-left border hover:shadow-[0_2px_10px_rgba(15,30,32,.06)]', k.warn ? 'warn-card' : 'bg-surface border-line')}>
            <div className={cx('label', k.warn && '!text-warn')}>{k.label}</div>
            <div className={cx('text-2xl font-semibold tracking-[-.02em] tabular-nums', k.warn && 'text-warn')}>{k.value}</div>
            <div className={cx('text-xs font-medium', k.warn ? 'text-warn' : 'text-label')}>{k.sub}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <div className="card px-[22px] py-5 flex flex-col gap-1">
            <div className="flex justify-between items-baseline mb-2"><div className="font-semibold text-base">Agenda di oggi</div><button className="link-btn" onClick={() => go({ name: 'agenda' })}>Apri agenda →</button></div>
            {appts.map((a, i) => {
              const past = toMin(a.time) + a.duration <= nowM, isNext = i === nextIdx;
              return (
                <div key={a.id} className={cx('grid grid-cols-[64px_14px_1fr_auto] gap-3 items-center py-2.5 border-t border-line2', past && 'opacity-55')}>
                  <div><div className={cx('font-mono text-[13px] font-medium', isNext ? 'text-accent' : 'text-ink2')}>{a.time}</div><div className="font-mono text-[11px] text-subtle">{toHHMM(toMin(a.time) + a.duration)}</div></div>
                  <span className={cx('w-2.5 h-2.5 rounded-full', a.type === 'prima' ? 'bg-primary' : a.type === 'online' ? 'bg-warn-line' : 'bg-sage-500', isNext && 'ring-4 ring-tint2')} />
                  <button onClick={() => go({ name: 'patient', id: a.patient_id })} className="flex gap-3 items-center min-w-0 border-0 bg-transparent p-0 text-left">
                    <Avatar text={initialsOf(a.name ?? '')} size={34} />
                    <span className="min-w-0"><span className="block font-semibold truncate hover:text-accent">{a.name}</span><span className="block text-xs text-label truncate">{repo.APPT_TYPES[a.type][0]} · {a.duration} min{a.goal ? ' · ' + a.goal : ''}</span></span>
                  </button>
                  <div className="flex gap-1.5">
                    {isNext && <span className="pill-ok self-center">Prossimo</span>}
                    {!past && <button className="btn-secondary py-1.5 text-[12.5px]" onClick={() => go({ name: 'patient', id: a.patient_id, tab: 'visits', action: 'visit' })}>+ Visita</button>}
                  </div>
                </div>
              );
            })}
            {!appts.length && <div className="text-[13px] text-label py-6 text-center border-t border-line2">Nessun appuntamento oggi.</div>}
          </div>

          <div className="card px-[22px] py-5 flex flex-col gap-1">
            <div className="flex justify-between items-baseline mb-2"><div><div className="font-semibold text-base">Promemoria per domani</div><div className="text-xs text-label">{WEEKDAYS[parseIso(addDays(t, 1)).getDay()]} {fmtShort(addDays(t, 1))} · messaggio "Promemoria appuntamento"</div></div>
              <span className="text-xs text-label">{tomorrow.filter((a) => a.remind && sent.has(a.id)).length}/{tomorrow.filter((a) => a.remind).length} inviati</span></div>
            {tomorrow.filter((a) => a.remind).map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2.5 border-t border-line2">
                <span className="font-mono text-[13px] font-medium text-ink2 w-12">{a.time}</span>
                <span className="flex-1 min-w-0 truncate"><span className="font-medium">{a.name}</span> <span className="text-xs text-label">· {repo.APPT_TYPES[a.type][0]}</span></span>
                {sent.has(a.id) ? <span className="text-xs font-semibold text-ok">Inviato ✓</span> : null}
                <button className="btn-wa py-1.5 text-[12.5px]" onClick={async () => {
                  await openExternal(waLink(a.phone ?? '', reminderText(a, settings?.tpl[0] ?? '', studio)));
                  await repo.markReminderSent(a.id);
                  bump();
                }}><WaDot />{sent.has(a.id) ? 'Reinvia' : 'Invia'}</button>
              </div>
            ))}
            {!tomorrow.some((a) => a.remind) && <div className="text-[13px] text-label py-4 border-t border-line2">Nessun promemoria da inviare.</div>}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <TodoCard title="Pagamenti in sospeso" more={due.length > 4 ? () => go({ name: 'payments' }) : undefined} empty="Nessun pagamento in sospeso.">
            {due.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-t border-line2 text-[13px]">
                <button className="min-w-0 border-0 bg-transparent p-0 text-left" onClick={() => p.patient_id && go({ name: 'patient', id: p.patient_id, tab: 'pay' })}><div className="font-medium truncate hover:text-accent">{p.name}</div><div className="text-xs text-label">{p.description} · {daysBetween(p.date, t)} gg</div></button>
                <div className="flex items-center gap-2.5 flex-none"><span className="font-semibold">€ {eur(p.amount)}</span><a className="text-[12.5px] font-medium !text-warn" onClick={() => remindPayment(p, settings!)}>Sollecita</a></div>
              </div>
            ))}
          </TodoCard>
          <TodoCard title="Piani da inviare" empty="Nessun piano in attesa.">
            {drafts.slice(0, 4).map((p) => (
              <button key={p.id} onClick={() => go({ name: 'patient', id: p.patient_id, tab: 'diet' })} className="flex items-center justify-between gap-3 py-2 border-0 border-t border-line2 bg-transparent text-left text-[13px] hover:text-accent">
                <span className="font-medium truncate">{p.name}</span><span className="text-xs text-label flex-none">{p.saved_at ? `salvato v${p.version} · ${fmtShort(p.saved_at)}` : `in preparazione v${p.version}`}</span>
              </button>
            ))}
          </TodoCard>
          <TodoCard title="Da ricontattare" more={recall.length > 4 ? () => go({ name: 'patients' }) : undefined} empty="Tutti i pazienti attivi hanno una visita in programma.">
            {recall.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-t border-line2 text-[13px]">
                <button className="min-w-0 border-0 bg-transparent p-0 text-left" onClick={() => go({ name: 'patient', id: p.id })}><div className="font-medium truncate hover:text-accent">{p.first} {p.last}</div><div className="text-xs text-label">ultima visita {ago(daysBetween(p.last_visit!, t))}</div></button>
                <div className="flex gap-1.5 flex-none">
                  <button className="w-[26px] h-[26px] rounded-[7px] bg-ok-bg grid place-items-center border-0" title="WhatsApp" onClick={() => openExternal(waLink(p.phone))}><WaDot /></button>
                  <button className="btn-secondary py-1 px-2.5 text-[12px]" onClick={() => go({ name: 'agenda', book: true, patientId: p.id })}>Prenota</button>
                </div>
              </div>
            ))}
          </TodoCard>
          {consents.length > 0 && (
            <TodoCard title="Consensi privacy da firmare" empty="">
              {consents.slice(0, 4).map((p) => (
                <button key={p.id} onClick={() => go({ name: 'patient', id: p.id })} className="flex items-center justify-between py-2 border-0 border-t border-line2 bg-transparent text-left text-[13px] hover:text-accent">
                  <span className="font-medium">{p.first} {p.last}</span><span className="pill-warn">da firmare</span>
                </button>
              ))}
            </TodoCard>
          )}
        </div>
      </div>
    </Page>
  );
}

function TodoCard({ title, children, empty, more }: { title: string; children: React.ReactNode; empty: string; more?: () => void }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="card px-5 py-[18px] flex flex-col">
      <div className="flex justify-between items-center mb-2"><div className="font-semibold text-[15px]">{title}</div>{more && <button className="link-btn" onClick={more}>Tutti →</button>}</div>
      {has ? children : <div className="text-[13px] text-label py-1">{empty}</div>}
    </div>
  );
}
