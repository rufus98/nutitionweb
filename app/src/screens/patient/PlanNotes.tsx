// Indicazioni generali del piano, divise in sezioni (come la pagina "Norme generali" dei PDF dello studio).
import { useLayoutEffect, useRef, useState } from 'react';
import type { PlanNote } from '../../db/types';
import { NOTE_TEMPLATES, noteFromTemplate } from '../../db/noteTemplates';
import { cx } from '../../components/ui';

/** Paragrafi ed elenchi puntati (righe che iniziano con "- " o "•"). */
export function NoteText({ text, className = '' }: { text: string; className?: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-•–]\s+/.test(line) || /^\d+[).]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    if (last && last.list === bullet && bullet) last.lines.push(line.replace(/^([-•–]|\d+[).])\s+/, ''));
    else blocks.push({ list: bullet, lines: [bullet ? line.replace(/^([-•–]|\d+[).])\s+/, '') : line] });
  }
  return (
    <div className={cx('flex flex-col gap-1.5 [text-wrap:pretty]', className)}>
      {blocks.map((b, i) => b.list
        ? <ul key={i} className="m-0 pl-5 flex flex-col gap-0.5 list-disc marker:text-subtle">{b.lines.map((l, k) => <li key={k}>{l}</li>)}</ul>
        : <p key={i} className="m-0">{b.lines[0]}</p>)}
    </div>
  );
}

/** Lettura: titoli in evidenza e testo a larghezza comoda, su due colonne quando lo spazio lo consente. */
export function NotesView({ notes }: { notes: PlanNote[] }) {
  if (!notes.length) return null;
  return (
    <div className="card px-[22px] py-5 flex flex-col gap-4">
      <div className="font-semibold text-base">Indicazioni generali</div>
      <div className="columns-1 xl:columns-2 gap-8">
        {notes.map((n, i) => (
          <section key={i} className="break-inside-avoid mb-5 text-[13.5px] leading-[1.55] text-ink2">
            {n.title && <h3 className="m-0 mb-1 text-[11.5px] font-semibold tracking-[.06em] uppercase text-accent">{n.title}</h3>}
            <NoteText text={n.text} />
          </section>
        ))}
      </div>
    </div>
  );
}

function AutoTextarea({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [value]);
  return <textarea ref={ref} rows={2} aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    className="w-full resize-none overflow-hidden bg-transparent border border-transparent hover:border-line focus:border-primary focus:bg-surface rounded-ctl outline-none px-2.5 py-2 text-[13.5px] leading-[1.55] text-ink" />;
}

/** Modifica: una scheda per sezione, riordinabile, con i modelli pronti da aggiungere. */
export function NotesEditor({ notes, kind, onChange }: { notes: PlanNote[]; kind: 'weekly' | 'onoff'; onChange: (n: PlanNote[]) => void }) {
  const [showAll, setShowAll] = useState(false);
  const set = (i: number, patch: Partial<PlanNote>) => onChange(notes.map((n, k) => (k === i ? { ...n, ...patch } : n)));
  const move = (i: number, d: number) => { const a = [...notes]; [a[i], a[i + d]] = [a[i + d], a[i]]; onChange(a); };
  const has = (title: string) => notes.some((n) => n.title.trim().toLowerCase() === title.toLowerCase() && title);
  const templates = NOTE_TEMPLATES.filter((t) => (showAll || t.kinds.includes(kind)) && t.title && !has(t.title));

  return (
    <div className="card px-[22px] py-5 flex flex-col gap-3.5" id="indicazioni-generali">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-base">Indicazioni generali</div>
          <div className="text-xs text-label">Compaiono nel PDF del piano (pagina "Norme generali") e nell'app paziente. Righe con "- " diventano elenchi puntati.</div>
        </div>
        <span className="text-xs text-label">{notes.length} {notes.length === 1 ? 'sezione' : 'sezioni'}</span>
      </div>

      {notes.map((n, i) => (
        <div key={i} className="group border border-line2 rounded-[12px] bg-surface2/40 hover:border-line px-2 py-1.5 flex gap-2">
          <span className="font-mono text-[11px] text-subtle pt-[11px] w-5 text-right flex-none">{String(i + 1).padStart(2, '0')}</span>
          <div className="flex-1 min-w-0">
            <input value={n.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Titolo (facoltativo: senza titolo è un'introduzione)" aria-label={`Titolo sezione ${i + 1}`}
              className="w-full bg-transparent border border-transparent hover:border-line focus:border-primary focus:bg-surface rounded-ctl outline-none px-2.5 py-1.5 text-[12.5px] font-semibold tracking-[.05em] uppercase text-accent placeholder:normal-case placeholder:tracking-normal placeholder:font-normal" />
            <AutoTextarea value={n.text} onChange={(text) => set(i, { text })} placeholder="Testo dell'indicazione…" label={`Testo sezione ${i + 1}`} />
          </div>
          <div className="flex flex-col gap-0.5 pt-1 opacity-40 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            <button className="btn-x !w-7 !h-7" title="Sposta su" aria-label="Sposta su" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="btn-x !w-7 !h-7" title="Sposta giù" aria-label="Sposta giù" disabled={i === notes.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="btn-x !w-7 !h-7 hover:!text-err" title="Elimina sezione" aria-label="Elimina sezione" onClick={() => onChange(notes.filter((_, k) => k !== i))}>×</button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5 items-center pt-1">
        <button className="btn-secondary py-1.5 text-[12.5px]" onClick={() => onChange([...notes, { title: '', text: '' }])}>+ Sezione vuota</button>
        {templates.length > 0 && <span className="text-xs text-label ml-1.5 mr-0.5">Modelli:</span>}
        {templates.map((t) => (
          <button key={t.id} onClick={() => onChange([...notes, noteFromTemplate(t.id)])} title={t.text}
            className="px-2.5 py-1 rounded-full border border-line bg-surface text-[12.5px] text-ink2 hover:border-primary hover:text-accent">+ {t.title}</button>
        ))}
        {!showAll && NOTE_TEMPLATES.some((t) => !t.kinds.includes(kind) && t.title && !has(t.title)) && <button className="link-btn text-[12.5px]" onClick={() => setShowAll(true)}>altri modelli</button>}
      </div>
    </div>
  );
}
