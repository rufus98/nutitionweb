import { Fragment } from 'react';
import type { PlanData, PlanItem, PlanMeal } from '../../db/types';
import { headKind, LETTERS, sections, type Section } from '../../lib/planGroups';
import { cx, TimeInput } from '../../components/ui';

/** Griglia giorno → pasti del piano (dal design "Anteprima piano digitalizzato"). In modalità modifica i campi sono editabili. */
export function DayTabs({ plan, day, setDay }: { plan: PlanData; day: number; setDay: (d: number) => void }) {
  return (
    <div className="flex gap-1.5 px-[22px] py-3.5 border-b border-line2" role="tablist">
      {plan.days.map((d, i) => {
        const flag = d.meals.some((m) => m.items.some((it) => it.flag));
        return i === day ? (
          <button key={i} role="tab" aria-selected className="flex-1 py-2 rounded-[9px] border-0 bg-strong text-surface font-semibold text-[13px]">{d.label}</button>
        ) : (
          <button key={i} role="tab" aria-selected={false} onClick={() => setDay(i)} className="flex-1 py-2 rounded-[9px] border border-line bg-surface text-ink2 font-medium text-[13px] relative hover:bg-canvas">
            {d.label}{flag && <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-[#D08A3A]" />}
          </button>
        );
      })}
    </div>
  );
}

export function DayMacros({ plan, day }: { plan: PlanData; day: number }) {
  const d = plan.days[day];
  if (!d?.kcal) return null;
  return (
    <div className="px-[22px] pt-3 flex gap-4 text-xs text-label">
      <span><b className="text-ink font-semibold">{d.kcal.toLocaleString('it-IT')}</b> kcal</span>
      {d.protein != null && <span>Proteine <b className="text-ink font-semibold">{d.protein} g</b></span>}
      {d.carbs != null && <span>Carboidrati <b className="text-ink font-semibold">{d.carbs} g</b></span>}
      {d.fat != null && <span>Grassi <b className="text-ink font-semibold">{d.fat} g</b></span>}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { variant: 'Variante', choice: 'Scegli 1 tra', fixed: 'In aggiunta', dish: 'Piatto' };

export function MealsGrid({ plan, day, onChange }: { plan: PlanData; day: number; onChange?: (p: PlanData) => void }) {
  const d = plan.days[day];
  if (!d) return null;
  const edit = !!onChange;
  const upMeal = (mi: number, fn: (m: PlanMeal) => PlanMeal) => {
    const days = plan.days.map((x, i) => (i !== day ? x : { ...x, meals: x.meals.map((m, j) => (j === mi ? fn(m) : m)) }));
    onChange!({ ...plan, days });
  };
  const inp = 'bg-transparent border border-transparent rounded-[5px] outline-none hover:border-line focus:border-primary focus:bg-surface';
  const wide = d.meals.some((m) => m.items.some((i) => i.head && headKind(i) !== 'dish'));

  return (
    <div className={cx('grid gap-3 px-[22px] pt-[18px] pb-[22px]', wide ? 'grid-cols-[repeat(auto-fill,minmax(300px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(250px,1fr))]')}>
      {d.meals.map((m, mi) => {
        const setItem = (ii: number, patch: Partial<PlanItem>) => upMeal(mi, (x) => ({ ...x, items: x.items.map((y, j) => (j === ii ? { ...y, ...patch } : y)) }));
        const insertAt = (ii: number, it: PlanItem) => upMeal(mi, (x) => ({ ...x, items: [...x.items.slice(0, ii), it, ...x.items.slice(ii)] }));
        const remove = (ii: number) => upMeal(mi, (x) => ({ ...x, items: x.items.filter((_, j) => j !== ii) }));
        const secs = sections(m.items);
        const variants = secs.filter((sc) => sc.kind === 'variant');
        let vIdx = -1;

        const row = (it: PlanItem, ii: number, bullet?: boolean) => {
          const alts = it.alts?.length ? (
            <details className="text-[11.5px] text-label -mt-1 pl-1">
              <summary className="cursor-pointer select-none list-none hover:text-accent">⇄ {it.alts.length} alternative</summary>
              <div className="flex flex-col gap-0.5 pt-1 pb-0.5">{it.alts.map((a, k) => <div key={k} className="flex justify-between gap-2"><span>{a.f}</span><span className="font-mono">{a.g}</span></div>)}</div>
            </details>
          ) : null;
          const dot = bullet ? <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-sage-500 flex-none mt-[5px]" aria-hidden /> : null;
          if (!edit) return (
            <div key={ii} className="flex flex-col gap-1">
              <div className={cx('flex justify-between gap-2 text-[13px]', it.flag && 'bg-warn-bg -mx-1.5 px-1.5 py-[3px] rounded-md', it.sub && 'pl-3 text-ink2')}>
                <span className="flex gap-2">{dot}<span>{it.sub && <span className="text-subtle mr-1">–</span>}{it.f}</span></span>
                <span className="font-mono text-xs font-medium text-accent whitespace-nowrap">{it.g}</span>
              </div>
              {alts}
            </div>
          );
          return (
            <div key={ii} className="flex flex-col gap-1">
              <div className={cx('group flex justify-between items-start gap-1 text-[13px] -mx-1.5 px-1.5 rounded-md', it.flag && 'bg-warn-bg py-[3px]', it.sub && 'pl-4')} title={it.flag ? 'Da verificare: controlla con il PDF' : undefined}>
                {dot}
                <textarea rows={1} className={cx(inp, 'flex-1 min-w-0 px-1 py-px resize-none [field-sizing:content] leading-snug', it.sub && 'text-ink2')} value={it.f} onChange={(e) => setItem(ii, { f: e.target.value.replace(/\n/g, ' '), flag: undefined })} placeholder="Alimento" autoFocus={!it.f && !it.g} aria-label="Alimento" />
                <input className={cx(inp, 'text-right font-mono text-xs font-medium px-1 py-px flex-none self-start', it.flag ? 'border-warn-line bg-surface text-warn' : 'text-accent')} style={{ width: `${Math.max(5, it.g.length + 1.5)}ch` }} value={it.g}
                  onChange={(e) => setItem(ii, { g: e.target.value, flag: undefined })} placeholder="g" aria-label="Quantità"
                  onKeyDown={(e) => { if (e.key === 'Enter') insertAt(ii + 1, { f: '', g: '', ...(it.sub ? { sub: true } : {}) }); }} />
                <button className="w-5 h-5 border-0 bg-transparent text-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-err flex-none" title="Rimuovi" aria-label="Rimuovi" onClick={() => remove(ii)}>×</button>
              </div>
              {alts}
            </div>
          );
        };

        // Intestazione modificabile di una sezione (titolo + tipo).
        const headEdit = (sc: Section, cls: string) => (
          <div className="group flex items-start gap-1">
            <textarea rows={1} className={cx(inp, 'flex-1 min-w-0 px-1 py-px resize-none [field-sizing:content] leading-snug', cls)} value={sc.head!.f} onChange={(e) => setItem(sc.headIdx, { f: e.target.value.replace(/\n/g, ' ') })} aria-label="Titolo sezione" />
            <select className="text-[11px] text-label bg-transparent border border-transparent hover:border-line rounded px-0.5 py-px outline-none flex-none" value={headKind(sc.head!)} title="Tipo di sezione"
              onChange={(e) => setItem(sc.headIdx, { kind: e.target.value as PlanItem['kind'] })}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="w-5 h-5 border-0 bg-transparent text-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-err flex-none" title="Rimuovi intestazione (le voci restano)" onClick={() => remove(sc.headIdx)}>×</button>
          </div>
        );
        const addIn = (sc: Section) => edit && (
          <button className="self-start border-0 bg-transparent text-accent text-[12px] font-medium p-0 hover:underline"
            onClick={() => insertAt((sc.items.length ? sc.items[sc.items.length - 1].idx : sc.headIdx) + 1, { f: '', g: '', ...(sc.kind === 'dish' ? { sub: true } : {}) })}>+ alimento</button>
        );

        return (
          <div key={m.key + mi} className="border border-line2 rounded-xl p-3.5 flex flex-col gap-2 bg-surface2">
            <div className="flex justify-between items-baseline gap-2">
              {edit ? <input className={cx(inp, 'font-semibold min-w-0 flex-1 -ml-1 px-1')} value={m.name} onChange={(e) => upMeal(mi, (x) => ({ ...x, name: e.target.value }))} aria-label="Nome pasto" />
                : <span className="font-semibold">{m.name}</span>}
              {edit ? <TimeInput className={cx(inp, 'text-[11px] text-subtle w-[46px] px-1 text-right')} value={m.time} onChange={(v) => upMeal(mi, (x) => ({ ...x, time: v }))} ariaLabel="Orario" />
                : m.time && <span className="font-mono text-[11px] text-subtle">{m.time}</span>}
            </div>
            {variants.length > 1 && <div className="text-xs text-label -mt-1">Scegli una tra {variants.length} opzioni</div>}

            {secs.map((sc, si) => {
              if (sc.kind === 'variant') {
                vIdx++;
                const letter = LETTERS[vIdx] ?? '•';
                return (
                  <Fragment key={si}>
                    {vIdx > 0 && <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[.06em] text-subtle"><span className="flex-1 border-t border-dashed border-line" />oppure<span className="flex-1 border-t border-dashed border-line" /></div>}
                    <div className="rounded-lg border border-line bg-surface p-2.5 flex flex-col gap-1.5">
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-strong text-surface grid place-items-center text-[11px] font-semibold flex-none mt-px">{letter}</span>
                        <div className="flex-1 min-w-0">{edit ? headEdit(sc, 'font-mono text-[11px] font-medium uppercase tracking-[.05em] text-accent') : <div className="font-mono text-[11px] font-medium uppercase tracking-[.05em] text-accent leading-snug pt-[3px]">{sc.head!.f}</div>}</div>
                      </div>
                      {sc.items.map(({ it, idx }) => row(it, idx))}
                      {addIn(sc)}
                    </div>
                  </Fragment>
                );
              }
              if (sc.kind === 'choice') return (
                <div key={si} className="rounded-lg border border-dashed border-sage-500/70 bg-tint px-2.5 py-2 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">{edit ? headEdit(sc, 'text-[12px] font-semibold text-ok') : <div className="text-[12px] font-semibold text-ok leading-snug">{sc.head!.f}</div>}</div>
                    <span className="pill-ok !py-px !px-2 !text-[11px] bg-surface flex-none">scegli 1</span>
                  </div>
                  {sc.items.map(({ it, idx }) => row(it, idx, true))}
                  {addIn(sc)}
                </div>
              );
              if (sc.kind === 'fixed') return (
                <div key={si} className="flex flex-col gap-1.5 pt-0.5">
                  {edit ? headEdit(sc, 'font-mono text-[10.5px] font-medium uppercase tracking-[.05em] text-label') : <div className="font-mono text-[10.5px] font-medium uppercase tracking-[.05em] text-label">+ {sc.head!.f}</div>}
                  {sc.items.map(({ it, idx }) => row(it, idx))}
                </div>
              );
              if (sc.kind === 'dish') return (
                <div key={si} className="flex flex-col gap-1.5">
                  {edit ? headEdit(sc, 'font-mono text-[10.5px] font-medium uppercase tracking-[.05em] text-accent') : <div className="font-mono text-[10.5px] font-medium uppercase tracking-[.05em] text-accent pt-1 leading-snug">{sc.head!.f}</div>}
                  {sc.items.map(({ it, idx }) => row(it, idx))}
                </div>
              );
              return <Fragment key={si}>{sc.items.map(({ it, idx }) => row(it, idx))}</Fragment>;
            })}

            {edit && (
              <div className="flex gap-3 flex-wrap">
                <button className="border-0 bg-transparent text-accent text-[12.5px] font-medium p-0 hover:underline" onClick={() => upMeal(mi, (x) => ({ ...x, items: [...x.items, { f: '', g: '' }] }))}>+ alimento</button>
                <button className="border-0 bg-transparent text-accent text-[12.5px] font-medium p-0 hover:underline" onClick={() => upMeal(mi, (x) => ({ ...x, items: [...x.items, { f: `Opzione ${LETTERS[x.items.filter((i) => i.head && headKind(i) === 'variant').length] ?? ''}`.trim(), g: '', head: true, kind: 'variant' }, { f: '', g: '' }] }))}>+ opzione</button>
                <button className="border-0 bg-transparent text-accent text-[12.5px] font-medium p-0 hover:underline" onClick={() => upMeal(mi, (x) => ({ ...x, items: [...x.items, { f: 'Scegli una fonte tra', g: '', head: true, kind: 'choice' }, { f: '', g: '' }] }))}>+ gruppo "scegli 1"</button>
              </div>
            )}
            {edit ? (
              <textarea rows={m.note.length > 60 ? 3 : 1} className={cx(inp, 'text-xs text-muted italic border-t border-dashed !border-t-line pt-[7px] px-1 rounded-none resize-y')} value={m.note} placeholder="Nota (facoltativa)" onChange={(e) => upMeal(mi, (x) => ({ ...x, note: e.target.value }))} />
            ) : m.note ? <div className="text-xs text-muted border-t border-dashed border-line pt-[7px] italic">{m.note}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
