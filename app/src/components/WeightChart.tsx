import { useEffect, useRef, useState } from 'react';
import { fmtDate, fmtShort, n1, signed } from '../lib/format';

/** Grafico del peso con area, linea obiettivo tratteggiata e tooltip al passaggio del mouse (dal design). */
export function WeightChart({ points, target, height = 240 }: { points: { date: string; kg: number }[]; target: number | null; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(760);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth) || 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!points.length) return <div className="h-[120px] grid place-items-center text-[13px] text-label">Nessuna rilevazione del peso: registra una visita per vedere l'andamento.</div>;

  const H = height, pl = 34, pr = 18, pt = 24, pb = 26;
  const vals = points.map((p) => p.kg).concat(target ? [target] : []);
  const span = Math.max(4, Math.ceil(Math.max(...vals)) - Math.floor(Math.min(...vals)));
  const step = Math.max(1, Math.ceil(span / 3));
  const lo = Math.floor(Math.min(...vals)) - 1, hi = lo + step * 3 + 1;
  const ticks = [0, 1, 2, 3].map((i) => lo + 1 + i * step);
  const n = points.length;
  const X = (i: number) => pl + (n === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (n - 1));
  const Y = (v: number) => pt + ((hi - v) / (hi - lo)) * (H - pt - pb);
  const pts = points.map((p, i) => [X(i), Y(p.kg)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const base = H - pb;
  const area = line + ` L${pts[n - 1][0]} ${base} L${pts[0][0]} ${base} Z`;
  const grid = ticks.map((v) => `M${pl} ${Y(v)} H${W - pr}`).join(' ');
  const colW = n === 1 ? W - pl - pr : (W - pl - pr) / (n - 1);
  // Con molte rilevazioni mostra solo alcune etichette sull'asse x.
  const every = Math.ceil(n / Math.max(2, Math.floor((W - pl - pr) / 64)));
  const tip = hover != null && points[hover] ? { ...points[hover], x: pts[hover][0], y: pts[hover][1], delta: hover > 0 ? signed(points[hover].kg - points[hover - 1].kg) + ' kg' : 'baseline' } : null;

  return (
    <div ref={ref} onMouseLeave={() => setHover(null)} className="relative w-full" style={{ height: H }}>
      <svg width={W} height={H} className="absolute left-0 top-0 overflow-visible">
        <path d={grid} style={{ stroke: 'rgb(var(--line2))', strokeWidth: 1, fill: 'none' }} />
        {n > 1 && <path d={area} style={{ fill: '#2F7A7D', fillOpacity: 0.07, stroke: 'none' }} />}
        {target && <path d={`M${pl} ${Y(target)} H${W - pr}`} style={{ stroke: 'rgb(var(--orange))', strokeWidth: 1.5, strokeDasharray: '5 5', fill: 'none' }} />}
        <path d={line} style={{ stroke: 'rgb(var(--accent))', strokeWidth: 2.5, fill: 'none', strokeLinejoin: 'round', strokeLinecap: 'round' }} />
      </svg>
      {ticks.map((v) => <div key={v} className="absolute left-0 -translate-y-1/2 font-mono text-[11px] text-subtle" style={{ top: Y(v) }}>{v}</div>)}
      {points.map((p, i) => (
        <div key={i}>
          <div onMouseEnter={() => setHover(i)} className="absolute top-0 bottom-0 cursor-crosshair" style={{ left: pts[i][0] - colW / 2, width: colW }} />
          <div className="absolute w-[9px] h-[9px] -ml-[4.5px] -mt-[4.5px] rounded-full bg-surface border-2 border-accent pointer-events-none" style={{ left: pts[i][0], top: pts[i][1] }} />
          {(i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every) && (
            <div className="absolute bottom-0 -translate-x-1/2 font-mono text-[11px] text-subtle pointer-events-none whitespace-nowrap" style={{ left: pts[i][0] }}>{fmtShort(p.date)}</div>
          )}
        </div>
      ))}
      {tip && <>
        <div className="absolute top-0 bottom-6 border-l border-[#C9D6D2] pointer-events-none" style={{ left: tip.x }} />
        <div className="absolute w-[13px] h-[13px] -ml-[6.5px] -mt-[6.5px] rounded-full bg-accent border-[3px] border-surface pointer-events-none" style={{ left: tip.x, top: tip.y, boxShadow: '0 0 0 1px rgb(var(--accent))' }} />
        <div className="absolute bg-[#0F3B40] text-white rounded-[10px] px-[11px] py-2 whitespace-nowrap pointer-events-none shadow-[0_6px_18px_rgba(15,59,64,.25)]"
          style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 14px))' }}>
          <div className="font-mono text-[11px] text-sage-400">{fmtDate(tip.date)}</div>
          <div className="font-semibold text-[15px]">{n1(tip.kg)} kg <span className="font-medium text-xs text-sage-400">{tip.delta}</span></div>
        </div>
      </>}
    </div>
  );
}
