import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

export const Label = ({ children, className = '' }: { children: ReactNode; className?: string }) => <span className={cx('label', className)}>{children}</span>;

export function Card({ children, className = '', style, pad = 'px-[22px] py-5' }: { children: ReactNode; className?: string; style?: CSSProperties; pad?: string }) {
  return <div className={cx('card flex flex-col', pad, className)} style={style}>{children}</div>;
}

/** Campo con etichetta mono maiuscola sopra (stile del design). */
export function Field({ label, children, className = '', gap = 'gap-1.5' }: { label: ReactNode; children: ReactNode; className?: string; gap?: string }) {
  return <label className={cx('flex flex-col', gap, className)}><span className="label">{label}</span>{children}</label>;
}

/** Input numerico con unità a destra (kg, cm, %). */
export function UnitInput({ value, onChange, unit, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; unit: string; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="unit-field">
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))} placeholder={placeholder} autoFocus={autoFocus} />
      <span className="font-mono text-xs text-subtle">{unit}</span>
    </div>
  );
}

/** Controllo segmentato (es. F/M, Δ cm / Δ %). */
export function Segmented<T extends string>({ options, value, onChange, small }: { options: { v: T; l: ReactNode }[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className={cx('flex bg-sunken p-[3px]', small ? 'rounded-lg' : 'rounded-ctl')} role="radiogroup">
      {options.map((o) => o.v === value ? (
        <span key={o.v} role="radio" aria-checked className={cx('flex-1 text-center whitespace-nowrap bg-surface font-semibold shadow-[0_1px_2px_rgba(0,0,0,.08)]', small ? 'px-2.5 py-1 rounded-md text-xs' : 'p-[7px] rounded-lg text-[13px]')}>{o.l}</span>
      ) : (
        <button key={o.v} type="button" role="radio" aria-checked={false} onClick={() => onChange(o.v)} className={cx('flex-1 whitespace-nowrap border-0 bg-transparent text-muted hover:text-ink', small ? 'px-2.5 py-1 text-xs' : 'p-[7px] text-[13px]')}>{o.l}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={cx('relative w-9 h-5 rounded-full border-0 flex-none transition-colors', on ? 'bg-primary' : 'bg-ctl')}>
      <span className={cx('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

export function Checkbox({ on }: { on: boolean }) {
  return on
    ? <span className="w-5 h-5 rounded-md bg-primary text-white grid place-items-center text-xs font-bold flex-none mt-px">✓</span>
    : <span className="w-5 h-5 rounded-md border-[1.5px] border-ctl flex-none mt-px" />;
}

/** Overlay modale centrato; Esc o clic fuori per chiudere. */
export function Modal({ onClose, children, width = 520, labelledBy }: { onClose: () => void; children: ReactNode; width?: number; labelledBy?: string }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-30 grid place-items-center animate-[fadeIn_.12s_ease]" style={{ background: 'rgb(var(--overlay) / var(--overlay-a))' }} onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-labelledby={labelledBy} onMouseDown={(e) => e.stopPropagation()} style={{ width }}
        className="bg-surface rounded-[18px] shadow-[0_24px_60px_rgba(15,30,32,.25)] p-6 flex flex-col gap-[18px] max-h-[calc(100vh-48px)] overflow-auto animate-[popIn_.16s_ease]">
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, sub, onClose, id }: { title: ReactNode; sub?: ReactNode; onClose: () => void; id?: string }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <div><div id={id} className="text-[19px] font-semibold">{title}</div>{sub && <div className="text-[13px] text-muted mt-0.5">{sub}</div>}</div>
      <button className="btn-x" onClick={onClose} aria-label="Chiudi" title="Chiudi (Esc)">×</button>
    </div>
  );
}

/** Pannello laterale destro (es. "Nuova visita"). */
export function Drawer({ onClose, title, sub, children, footer }: { onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer: ReactNode }) {
  useEscape(onClose);
  return (
    <>
      <div className="fixed inset-0 z-20 animate-[fadeIn_.12s_ease]" style={{ background: 'rgb(var(--overlay) / var(--overlay-a))' }} onMouseDown={onClose} />
      <div role="dialog" aria-modal className="fixed top-0 right-0 bottom-0 w-[460px] bg-surface z-[21] shadow-[-12px_0_40px_rgba(15,30,32,.18)] flex flex-col animate-[slideIn_.18s_ease]">
        <div className="px-6 py-5 border-b border-line2 flex justify-between items-center">
          <div><div className="text-lg font-semibold">{title}</div>{sub && <div className="text-xs text-label">{sub}</div>}</div>
          <button className="btn-x" onClick={onClose} aria-label="Chiudi" title="Chiudi (Esc)">×</button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-[18px]">{children}</div>
        <div className="px-6 py-4 border-t border-line2 flex gap-2.5 justify-end">{footer}</div>
      </div>
    </>
  );
}

const escStack: (() => void)[] = [];
/** Esc chiude solo il livello più in alto (modale sopra drawer, ecc.). */
export function useEscape(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = () => ref.current();
    escStack.push(h);
    return () => { escStack.splice(escStack.indexOf(h), 1); };
  }, []);
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && escStack.length) { e.preventDefault(); e.stopImmediatePropagation(); escStack[escStack.length - 1](); }
  }, true);
}

export function Avatar({ text, size = 36, className = '' }: { text: string; size?: number; className?: string }) {
  return (
    <div className={cx('rounded-full bg-avatar text-accent grid place-items-center font-semibold flex-none', className)}
      style={{ width: size, height: size, fontSize: size >= 60 ? 22 : size >= 48 ? 17 : 13 }}>{text}</div>
  );
}

export function WaDot() {
  return <span className="w-2 h-2 rounded-full bg-[#3C9A5F] flex-none" />;
}

export function Empty({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="py-12 px-5 text-center text-muted flex flex-col items-center gap-1">
      <div className="font-semibold text-ink text-[15px]">{title}</div>
      {sub && <div className="text-[13px]">{sub}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <span className="rounded-full border-2 border-line border-t-primary animate-[spin_.8s_linear_infinite] inline-block" style={{ width: size, height: size }} />;
}

/** Contenitore della pagina: scorre solo l'area contenuti, non tutta la finestra. */
export function Page({ children, gap = 'gap-5', pt = 'pt-6' }: { children: ReactNode; gap?: string; pt?: string }) {
  return (
    <main className="h-full overflow-auto min-w-0" data-scroll>
      <div className={cx('px-8 pb-12 flex flex-col min-w-0', pt, gap)}>{children}</div>
    </main>
  );
}

export function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <div className="text-[13px] text-[rgb(var(--muted))] flex gap-2">
      {items.map((it, i) => (
        <span key={i} className="flex gap-2">
          {i > 0 && <span>/</span>}
          {it.onClick ? <a onClick={it.onClick} className="text-muted">{it.label}</a> : <span className="text-ink font-medium">{it.label}</span>}
        </span>
      ))}
    </div>
  );
}

/** Campo orario sempre a 24 ore (gli input nativi seguono la lingua di Windows e possono mostrare AM/PM).
 *  Accetta "930", "9.30", "09:30"; frecce ↑/↓ = ±15 minuti. */
export function TimeInput({ value, onChange, className = '', ariaLabel }: { value: string; onChange: (v: string) => void; className?: string; ariaLabel?: string }) {
  const norm = (s: string) => {
    const d = s.replace(/\D/g, '');
    if (!d) return '';
    const [h, m] = d.length <= 2 ? [+d, 0] : [+d.slice(0, d.length - 2), +d.slice(-2)];
    return String(Math.min(23, h)).padStart(2, '0') + ':' + String(Math.min(59, m)).padStart(2, '0');
  };
  const step = (k: number) => {
    const [h, m] = (norm(value) || '09:00').split(':').map(Number);
    const t = (h * 60 + m + k + 1440) % 1440;
    onChange(String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
  };
  return (
    <input value={value} inputMode="numeric" maxLength={5} placeholder="--:--" aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value.replace(/[^\d:.]/g, ''))}
      onBlur={() => { const n = norm(value); if (n !== value) onChange(n); }}
      onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); step(15); } if (e.key === 'ArrowDown') { e.preventDefault(); step(-15); } }}
      className={cx('font-mono tabular-nums', className)} />
  );
}
