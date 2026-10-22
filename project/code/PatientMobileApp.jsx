// App Paziente (PWA mobile) — React + Tailwind
// Route: /p/:token  ·  manifest.json con start_url "/p/{token}" e display "standalone"
import { useEffect, useState } from 'react';

const TABS = [
  { id: 'oggi', label: 'Oggi' },
  { id: 'dieta', label: 'La mia dieta' },
  { id: 'progressi', label: 'Progressi' },
  { id: 'studio', label: 'Studio' },
];

/* ---------- Install prompt (Android: beforeinstallprompt · iOS: istruzioni) ---------- */
function useInstallPrompt() {
  const [evt, setEvt] = useState(null);
  const [hidden, setHidden] = useState(() => Number(localStorage.getItem('a2hs-dismissed') || 0) > Date.now());
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone);
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const dismiss = () => { localStorage.setItem('a2hs-dismissed', Date.now() + 30 * 864e5); setHidden(true); };
  return { show: !standalone && !hidden, install: evt ? () => evt.prompt() : null, dismiss };
}

function InstallBanner() {
  const { show, install, dismiss } = useInstallPrompt();
  if (!show) return null;
  return (
    <div className="bg-petrol-900 text-white rounded-[18px] p-3.5 flex items-center gap-3">
      <div className="w-10 h-10 rounded-[11px] bg-sage-400 text-petrol-900 grid place-items-center font-bold text-lg">n</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Aggiungi alla Home</p>
        <p className="text-xs text-[#B7CCC5]">
          {install ? 'Apri il piano come un\'app, anche offline.' : <>Tocca <b className="text-white">Condividi</b> → <b className="text-white">Aggiungi a Home</b>.</>}
        </p>
      </div>
      {install && <button onClick={install} className="px-3 h-9 rounded-[9px] bg-sage-400 text-petrol-900 text-sm font-semibold">Installa</button>}
      <button onClick={dismiss} aria-label="Chiudi" className="w-9 h-9 rounded-[9px] bg-white/10">×</button>
    </div>
  );
}

/* ---------- Oggi ---------- */
function TodayView({ plan, todayIndex, checks, toggle }) {
  const [day, setDay] = useState(todayIndex);
  const meals = plan.days[day].meals;
  const done = meals.filter((_, i) => checks[`${day}-${i}`]).length;
  return (
    <div className="space-y-3.5">
      <InstallBanner />
      <header className="flex justify-between items-end pt-1">
        <div>
          <p className="text-[13px] text-ink-muted">{plan.todayLabel}</p>
          <h1 className="text-[28px] font-semibold tracking-tight leading-tight">Ciao {plan.firstName}</h1>
        </div>
        <p className="text-right"><span className="text-xl font-semibold text-petrol-700">{done}/{meals.length}</span><br /><span className="text-xs text-ink-muted">pasti</span></p>
      </header>
      <div className="flex gap-1.5">
        {plan.days.map((d, i) => (
          <button key={d.label} onClick={() => setDay(i)}
            className={`flex-1 h-[58px] rounded-[14px] flex flex-col items-center justify-center ${i === day ? 'bg-petrol-700 text-white' : 'bg-white border border-line'}`}>
            <span className={`text-[11px] ${i === day ? 'text-[#BFD6CE]' : 'text-ink-subtle'}`}>{d.label}</span>
            <span className="font-semibold">{d.date}</span>
          </button>
        ))}
      </div>
      <div className="h-1.5 rounded bg-[#E6E4DE]"><div className="h-full rounded bg-sage-500 transition-all" style={{ width: `${(done / meals.length) * 100}%` }} /></div>
      {meals.map((m, i) => {
        const key = `${day}-${i}`, checked = !!checks[key];
        return (
          <article key={m.name} className="bg-white border border-[#E8E6E0] rounded-[18px] p-4 space-y-2">
            <div className="flex items-center">
              <h2 className="flex-1 font-semibold">{m.name} <span className="font-mono text-xs text-ink-subtle ml-1">{m.time}</span></h2>
              <button onClick={() => toggle(key)} aria-pressed={checked} aria-label={`Segna ${m.name} come fatto`}
                className={`w-11 h-11 rounded-full ${checked ? 'bg-petrol-700 text-white font-bold' : 'border-[1.5px] border-[#CFD8D4]'}`}>
                {checked && '✓'}
              </button>
            </div>
            {m.items.map((it) => (
              <div key={it.food} className="flex justify-between text-sm"><span>{it.food}</span><span className="font-mono text-[12.5px] text-petrol-700">{it.qty}</span></div>
            ))}
            {m.note && <p className="text-[12.5px] text-[#7A5426] bg-[#F7F0E4] rounded-[9px] px-2.5 py-1.5">{m.note}</p>}
          </article>
        );
      })}
    </div>
  );
}

/* ---------- Progressi ---------- */
function ProgressView({ weights, target, measures }) {
  const first = weights[0], last = weights[weights.length - 1];
  const lost = first - last, pct = Math.round((lost / (first - target)) * 100);
  const W = 300, H = 150, lo = target - 1, hi = Math.max(...weights) + 1;
  const pts = weights.map((v, i) => [8 + (i * (W - 16)) / (weights.length - 1), 10 + ((hi - v) / (hi - lo)) * (H - 20)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
  return (
    <div className="space-y-3.5">
      <h1 className="text-[28px] font-semibold tracking-tight pt-1">I miei progressi</h1>
      <section className="bg-petrol-700 text-white rounded-[22px] p-4.5 space-y-3.5">
        <p className="text-[13px] text-[#BFD6CE]">Hai perso</p>
        <p className="text-[44px] font-semibold leading-none tracking-tight">{lost.toFixed(1).replace('.', ',')} <span className="text-xl">kg</span></p>
        <div className="h-2 rounded bg-white/20"><div className="h-full rounded bg-sage-400" style={{ width: `${pct}%` }} /></div>
        <p className="text-[12.5px] text-[#D7E5DF]">Sei al {pct}% del percorso.</p>
      </section>
      <section className="bg-white border border-[#E8E6E0] rounded-[18px] p-4">
        <h2 className="font-semibold mb-2">Peso</h2>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
          <path d={`${d} L${pts.at(-1)[0]} ${H} L${pts[0][0]} ${H} Z`} fill="#7FA08A" fillOpacity=".16" />
          <path d={d} fill="none" stroke="#1E5A5F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </section>
      <section className="bg-white border border-[#E8E6E0] rounded-[18px] p-4 grid grid-cols-3 gap-2">
        {measures.map((m) => (
          <div key={m.label} className="bg-[#F3F6F3] rounded-[14px] px-3 py-2.5">
            <p className="text-xs text-ink-muted">{m.label}</p><p className="text-xl font-semibold text-success-700">−{m.delta} cm</p>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ---------- Studio ---------- */
function StudioView({ studio }) {
  return (
    <div className="space-y-3.5">
      <h1 className="text-[28px] font-semibold tracking-tight pt-1">Il tuo studio</h1>
      <section className="bg-white border border-[#E8E6E0] rounded-[20px] p-4.5 text-center space-y-4">
        <div><p className="text-lg font-semibold">{studio.name}</p><p className="text-[13px] text-ink-muted">{studio.role}</p></div>
        <a href={`https://wa.me/${studio.whatsapp}`} className="flex h-[54px] items-center justify-center rounded-[15px] bg-petrol-700 text-white font-semibold">Scrivi su WhatsApp</a>
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:${studio.phone}`} className="flex h-[50px] items-center justify-center rounded-[15px] border border-line font-semibold">Chiama</a>
          <a href={`mailto:${studio.email}`} className="flex h-[50px] items-center justify-center rounded-[15px] border border-line font-semibold">Email</a>
        </div>
      </section>
    </div>
  );
}

/* ---------- Shell ---------- */
export default function PatientMobileApp({ data }) {
  // data = GET /api/p/:token → { plan, weights, target, measures, studio, pdfUrl }
  const [tab, setTab] = useState('oggi');
  const [checks, setChecks] = useState(() => JSON.parse(localStorage.getItem('checks') || '{}'));
  const toggle = (k) => setChecks((c) => { const n = { ...c, [k]: !c[k] }; localStorage.setItem('checks', JSON.stringify(n)); return n; });

  return (
    <div className="min-h-[100dvh] bg-canvas font-sans text-ink flex flex-col">
      <main className="flex-1 overflow-y-auto px-[18px] pt-[max(12px,env(safe-area-inset-top))] pb-6">
        {tab === 'oggi' && <TodayView plan={data.plan} todayIndex={data.plan.todayIndex} checks={checks} toggle={toggle} />}
        {tab === 'dieta' && (/* accordion 7 giorni + link a data.pdfUrl */ null)}
        {tab === 'progressi' && <ProgressView weights={data.weights} target={data.target} measures={data.measures} />}
        {tab === 'studio' && <StudioView studio={data.studio} />}
      </main>
      <nav className="sticky bottom-0 grid grid-cols-4 bg-white/95 backdrop-blur border-t border-line px-2.5 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
            className={`h-[52px] flex flex-col items-center justify-center gap-1 text-[11.5px] ${tab === t.id ? 'text-petrol-900 font-semibold' : 'text-ink-muted'}`}>
            <span className={`w-10 h-[26px] rounded-full grid place-items-center ${tab === t.id ? 'bg-sage-100' : ''}`}>
              <span className={`w-3 h-3 rounded-full ${tab === t.id ? 'bg-petrol-700' : 'border-[1.8px] border-ink-subtle'}`} />
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
