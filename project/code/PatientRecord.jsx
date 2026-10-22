// Scheda Paziente (desktop) — React + Tailwind + Recharts
import { useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Area } from 'recharts';

const fmt = (n) => n.toFixed(1).replace('.', ',');
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));

/* ---------- Primitives ---------- */
export const Card = ({ className = '', children }) => (
  <div className={`bg-white border border-line rounded-card ${className}`}>{children}</div>
);
export const Label = ({ children }) => (
  <div className="font-mono text-label uppercase text-ink-muted">{children}</div>
);
export const Pill = ({ tone = 'success', children }) => {
  const tones = { success: 'bg-sage-100 text-success-700', pending: 'bg-amber-100 text-amber-700' };
  return <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${tones[tone]}`}>{children}</span>;
};

/* ---------- Header ---------- */
function PatientHeader({ patient, onNewVisit }) {
  const tel = patient.phone.replace(/\s/g, '');
  return (
    <Card className="p-6 flex flex-wrap items-center gap-5">
      <div className="w-16 h-16 rounded-full bg-sage-100 text-petrol-700 grid place-items-center text-xl font-semibold">
        {patient.firstName[0]}{patient.lastName[0]}
      </div>
      <div className="flex-1 min-w-[260px] space-y-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">{patient.firstName} {patient.lastName}</h1>
          <Pill>In percorso</Pill>
        </div>
        <p className="text-sm text-ink-muted">{patient.age} anni · {patient.height} cm · Paziente dal {patient.since}</p>
        <div className="flex flex-wrap gap-1.5">
          {patient.tags.map((t) => <span key={t} className="text-xs px-2.5 py-0.5 rounded-tag bg-[#F3EEE4] text-[#7A5426]">{t}</span>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-ink-muted pr-1">{patient.phone}</span>
        <a href={`https://wa.me/${tel.replace('+', '')}`} target="_blank" rel="noreferrer"
           className="px-3.5 py-2 rounded-ctl bg-sage-100 text-success-700 text-sm font-semibold">WhatsApp</a>
        <a href={`tel:${tel}`} className="px-3.5 py-2 rounded-ctl border border-line text-sm font-medium">Chiama</a>
        <a href={`mailto:${patient.email}`} className="px-3.5 py-2 rounded-ctl border border-line text-sm font-medium">Email</a>
        <button onClick={onNewVisit} className="px-4 py-2.5 rounded-ctl bg-petrol-700 hover:bg-petrol-900 text-white text-sm font-semibold">
          + Nuova visita
        </button>
      </div>
    </Card>
  );
}

/* ---------- Weight chart ---------- */
function WeightTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-petrol-900 text-white rounded-ctl px-3 py-2 shadow-lg">
      <div className="font-mono text-[11px] text-sage-400">{p.label}</div>
      <div className="font-semibold">{fmt(p.kg)} kg</div>
    </div>
  );
}

export function WeightChart({ visits, target }) {
  const data = visits.map((v) => ({ ...v, label: v.dateLabel }));
  return (
    <Card className="p-5 space-y-3">
      <div className="flex justify-between items-baseline">
        <div>
          <h2 className="font-semibold">Andamento peso</h2>
          <p className="text-xs text-ink-muted">{visits.length} rilevazioni</p>
        </div>
        <span className="text-xs text-ink-muted">Obiettivo {target} kg</span>
      </div>
      <div className="h-60">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 16, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#EEECE6" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono', fill: '#8A928F' }} />
            <YAxis domain={[target - 1, 'dataMax + 1']} tickLine={false} axisLine={false} tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono', fill: '#8A928F' }} />
            <ReferenceLine y={target} stroke="#C9833A" strokeDasharray="5 5" />
            <Tooltip content={<WeightTooltip />} cursor={{ stroke: '#C9D6D2' }} />
            <Line type="monotone" dataKey="kg" stroke="#1E5A5F" strokeWidth={2.5}
                  dot={{ r: 4, fill: '#fff', stroke: '#1E5A5F', strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/* ---------- Circonferenze ---------- */
const KEYS = { vita: 'Vita', fianchi: 'Fianchi', torace: 'Torace', braccio: 'Braccio', coscia: 'Coscia' };
export function MeasurementsCard({ first, last }) {
  const max = Math.max(...Object.keys(KEYS).map((k) => first[k] - last[k]));
  return (
    <Card className="p-5">
      <h2 className="font-semibold mb-2">Circonferenze</h2>
      {Object.entries(KEYS).map(([k, label]) => {
        const d = last[k] - first[k];
        return (
          <div key={k} className="grid grid-cols-[110px_1fr_90px_70px_60px] items-center gap-3.5 py-2.5 border-t border-[#F0EEE9]">
            <span className="font-medium">{label}</span>
            <div className="h-1.5 bg-[#F0EEE9] rounded"><div className="h-full bg-sage-500 rounded" style={{ width: `${(-d / max) * 100}%` }} /></div>
            <span className="font-mono text-xs text-ink-muted text-right">{fmt(first[k])} → {fmt(last[k])}</span>
            <span className="font-semibold text-success-700 text-right tabular-nums">{signed(d)} cm</span>
            <span className="font-mono text-xs text-success-700 text-right">{signed((d / first[k]) * 100)}%</span>
          </div>
        );
      })}
    </Card>
  );
}

/* ---------- Upload & digitalizzazione dieta ---------- */
const STEPS = ['Caricamento PDF', 'Riconoscimento testo (OCR)', 'Struttura giorni e pasti', 'Estrazione alimenti e grammature'];

export function DietUpload({ digitize, onShare }) {
  // digitize(file) => Promise<{ days: [{ label, meals: [{ name, time, items: [{ food, qty, confidence }] }] }] }>
  const [state, setState] = useState('idle'); // idle | processing | review
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState(null);
  const [day, setDay] = useState(0);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  async function start(file) {
    if (!file || file.type !== 'application/pdf') return;
    setState('processing'); setStep(0);
    const tick = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);
    try { setPlan(await digitize(file)); setState('review'); }
    finally { clearInterval(tick); }
  }

  if (state === 'idle') return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); start(e.dataTransfer.files[0]); }}
      onClick={() => input.current.click()}
      className={`min-h-[340px] rounded-[18px] border-2 border-dashed grid place-items-center text-center p-8 cursor-pointer transition
        ${drag ? 'border-petrol-700 bg-petrol-100' : 'border-[#C9D3CF] bg-white hover:border-sage-500'}`}>
      <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => start(e.target.files[0])} />
      <div className="space-y-3">
        <p className="text-lg font-semibold">Trascina qui il PDF della dieta</p>
        <p className="text-ink-muted max-w-sm">Riconosciamo giorni, pasti, alimenti e grammature. Potrai verificare tutto prima di inviarlo.</p>
        <span className="inline-block px-4 py-2 rounded-ctl bg-petrol-700 text-white text-sm font-semibold">Scegli file</span>
      </div>
    </div>
  );

  if (state === 'processing') return (
    <Card className="p-8 max-w-2xl space-y-4">
      <h3 className="text-xl font-semibold">Digitalizzazione in corso…</h3>
      <div className="h-1.5 bg-[#EEECE6] rounded overflow-hidden">
        <div className="h-full bg-petrol-700 transition-all duration-700" style={{ width: `${(step + 1) * 25}%` }} />
      </div>
      <ul className="space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2.5 text-sm ${i < step ? 'text-ink-muted' : i === step ? 'font-semibold' : 'text-ink-subtle'}`}>
            <span className={`w-5 h-5 rounded-full grid place-items-center text-xs
              ${i < step ? 'bg-sage-100 text-success-700' : i === step ? 'border-2 border-petrol-100 border-t-petrol-700 animate-spin' : 'border-2 border-line'}`}>
              {i < step ? '✓' : ''}
            </span>{s}
          </li>
        ))}
      </ul>
    </Card>
  );

  const toVerify = plan.days.flatMap((d) => d.meals.flatMap((m) => m.items)).filter((i) => i.confidence < 0.8).length;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
      <Card className="overflow-hidden">
        <div className="px-5 py-4 flex justify-between items-center border-b border-[#EEECE6]">
          <h3 className="font-semibold">Anteprima piano digitalizzato</h3>
          {toVerify > 0 && <Pill tone="pending">{toVerify} da verificare</Pill>}
        </div>
        <div className="flex gap-1.5 px-5 py-3.5 border-b border-[#EEECE6]">
          {plan.days.map((d, i) => (
            <button key={d.label} onClick={() => setDay(i)}
              className={`flex-1 py-2 rounded-[9px] text-sm ${i === day ? 'bg-petrol-900 text-white font-semibold' : 'border border-line hover:bg-canvas'}`}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3 p-5">
          {plan.days[day].meals.map((m) => (
            <div key={m.name} className="border border-[#EEECE6] rounded-xl p-3.5 space-y-2 bg-[#FCFCFA]">
              <div className="flex justify-between"><span className="font-semibold">{m.name}</span><span className="font-mono text-[11px] text-ink-subtle">{m.time}</span></div>
              {m.items.map((it) => (
                <div key={it.food} className={`flex justify-between text-sm ${it.confidence < 0.8 ? 'bg-amber-100 -mx-1.5 px-1.5 rounded-md' : ''}`}>
                  <span>{it.food}</span>
                  {it.confidence < 0.8
                    ? <input defaultValue={it.qty} className="w-16 text-right font-mono text-xs text-amber-700 border border-[#E3C79C] rounded px-1" />
                    : <span className="font-mono text-xs text-petrol-700">{it.qty}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
      <div className="sticky top-5 bg-petrol-900 text-white rounded-card p-5 space-y-3">
        <Label><span className="text-sage-400">Pronto per il paziente</span></Label>
        <p className="font-semibold leading-snug">Il piano sarà visibile nell'app paziente, insieme al PDF originale.</p>
        <button onClick={() => onShare(plan)} className="w-full py-3 rounded-[11px] bg-sage-400 hover:bg-[#BFD6C5] text-petrol-900 font-bold">
          Genera e Condividi Link Paziente
        </button>
      </div>
    </div>
  );
}

/* ---------- Share modal ---------- */
export function ShareLinkModal({ url, patient, onClose }) {
  const [copied, setCopied] = useState(false);
  const msg = encodeURIComponent(`Ciao ${patient.firstName}, ecco il tuo nuovo piano nutrizionale. Aprilo e aggiungilo alla Home: ${url}`);
  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,30,32,.32)] grid place-items-center z-30">
      <div onClick={(e) => e.stopPropagation()} className="w-[520px] bg-white rounded-[18px] p-6 space-y-4 shadow-2xl">
        <h3 className="text-lg font-semibold">Link paziente pronto</h3>
        <div className="flex items-center gap-2 border border-line rounded-xl pl-3.5 p-1.5">
          <span className="flex-1 font-mono text-sm text-petrol-900 truncate">{url}</span>
          <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); }}
            className={`px-3.5 py-2 rounded-[9px] text-sm font-semibold ${copied ? 'bg-sage-100 text-success-700' : 'bg-petrol-900 text-white'}`}>
            {copied ? 'Copiato ✓' : 'Copia link'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <a href={`https://wa.me/${patient.phone.replace(/\D/g, '')}?text=${msg}`} target="_blank" rel="noreferrer"
             className="py-3 rounded-xl bg-sage-100 text-success-700 font-semibold text-center">Invia su WhatsApp</a>
          <a href={`mailto:${patient.email}?subject=Il%20tuo%20piano&body=${msg}`}
             className="py-3 rounded-xl border border-line font-semibold text-center">Invia per email</a>
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
const TABS = ['Overview', 'Visite & Misure', 'Piano nutrizionale', 'Pagamenti'];

export default function PatientRecord({ patient, visits, payments, digitize, publishPlan }) {
  const [tab, setTab] = useState(0);
  const [shareUrl, setShareUrl] = useState(null);
  const first = visits[0], last = visits[visits.length - 1];

  return (
    <main className="min-h-screen bg-canvas font-sans text-ink text-sm px-8 py-5 space-y-5">
      <PatientHeader patient={patient} onNewVisit={() => {/* open drawer */}} />
      <nav className="flex gap-1 border-b border-line">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`-mb-px px-3.5 py-2.5 border-b-2 text-sm ${i === tab ? 'border-petrol-700 text-petrol-900 font-semibold' : 'border-transparent text-ink-muted hover:text-ink'}`}>
            {t}
          </button>
        ))}
      </nav>

      {tab === 0 && (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] gap-5 items-start">
          <div className="space-y-5 min-w-0">
            <div className="grid grid-cols-4 gap-3">
              {[['Peso attuale', fmt(last.kg), 'kg'], ["Dall'inizio", signed(last.kg - first.kg), 'kg'],
                ['BMI', fmt(last.kg / (patient.height / 100) ** 2), ''], ['Mancano', fmt(Math.max(0, last.kg - patient.targetKg)), 'kg']]
                .map(([l, v, u]) => (
                  <Card key={l} className="px-4 py-3.5 space-y-1.5"><Label>{l}</Label>
                    <div className="text-2xl font-semibold tabular-nums">{v}<span className="text-sm text-ink-muted ml-1">{u}</span></div>
                  </Card>
                ))}
            </div>
            <WeightChart visits={visits} target={patient.targetKg} />
            <MeasurementsCard first={first} last={last} />
          </div>
          <aside className="space-y-5">{/* Anagrafica · Note cliniche · Piano attivo · Pagamenti recenti */}</aside>
        </div>
      )}

      {tab === 2 && (
        <DietUpload digitize={digitize} onShare={async (plan) => setShareUrl(await publishPlan(plan))} />
      )}

      {tab === 3 && (
        <Card className="overflow-hidden">
          {payments.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_120px] items-center px-5 py-3 border-b border-[#F3F1EC]">
              <span>{p.date}</span><span>{p.description}</span><span className="text-ink-muted">{p.method}</span>
              <span className="text-right font-semibold tabular-nums">€ {p.amount}</span>
              <span className="pl-6"><Pill tone={p.paid ? 'success' : 'pending'}>{p.paid ? 'Saldato' : 'In sospeso'}</Pill></span>
              <span className="text-right">{p.paid && <a href={p.invoiceUrl} className="text-petrol-700 font-medium">Fattura ↓</a>}</span>
            </div>
          ))}
        </Card>
      )}

      {shareUrl && <ShareLinkModal url={shareUrl} patient={patient} onClose={() => setShareUrl(null)} />}
    </main>
  );
}
