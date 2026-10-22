import type { PlanData, PlanMeal } from '../../db/types';
import { cx } from '../../components/ui';

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

export function MealsGrid({ plan, day, onChange }: { plan: PlanData; day: number; onChange?: (p: PlanData) => void }) {
  const d = plan.days[day];
  const edit = !!onChange;
  const upMeal = (mi: number, fn: (m: PlanMeal) => PlanMeal) => {
    const days = plan.days.map((x, i) => (i !== day ? x : { ...x, meals: x.meals.map((m, j) => (j === mi ? fn(m) : m)) }));
    onChange!({ ...plan, days });
  };
  const inp = 'bg-transparent border border-transparent rounded-[5px] outline-none hover:border-line focus:border-primary focus:bg-surface';
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3 px-[22px] pt-[18px] pb-[22px]">
      {d.meals.map((m, mi) => (
        <div key={m.key + mi} className="border border-line2 rounded-xl p-3.5 flex flex-col gap-2 bg-surface2">
          <div className="flex justify-between items-baseline gap-2">
            {edit ? <input className={cx(inp, 'font-semibold min-w-0 flex-1 -ml-1 px-1')} value={m.name} onChange={(e) => upMeal(mi, (x) => ({ ...x, name: e.target.value }))} aria-label="Nome pasto" />
              : <span className="font-semibold">{m.name}</span>}
            {edit ? <input type="time" className={cx(inp, 'font-mono text-[11px] text-subtle w-[74px] px-1')} value={m.time} onChange={(e) => upMeal(mi, (x) => ({ ...x, time: e.target.value }))} aria-label="Orario" />
              : <span className="font-mono text-[11px] text-subtle">{m.time}</span>}
          </div>
          {m.items.map((it, ii) => {
            const set = (k: 'f' | 'g', v: string) => upMeal(mi, (x) => ({ ...x, items: x.items.map((y, j) => (j === ii ? { f: y.f, g: y.g, [k]: v } : y)) }));
            if (!edit) return (
              <div key={ii} className={cx('flex justify-between gap-2 text-[13px]', it.flag && 'bg-warn-bg -mx-1.5 px-1.5 py-[3px] rounded-md')}>
                <span>{it.f}</span><span className="font-mono text-xs font-medium text-accent whitespace-nowrap">{it.g}</span>
              </div>
            );
            return (
              <div key={ii} className={cx('group flex justify-between items-center gap-1 text-[13px] -mx-1.5 px-1.5 rounded-md', it.flag && 'bg-warn-bg py-[3px]')} title={it.flag ? 'Da verificare' : undefined}>
                <input className={cx(inp, 'flex-1 min-w-0 px-1 py-px')} value={it.f} onChange={(e) => set('f', e.target.value)} placeholder="Alimento" autoFocus={!it.f && !it.g} aria-label="Alimento" />
                <input className={cx(inp, 'w-[68px] text-right font-mono text-xs font-medium px-1 py-px', it.flag ? 'border-warn-line bg-surface text-warn' : 'text-accent')} value={it.g} onChange={(e) => set('g', e.target.value)} placeholder="g" aria-label="Quantità"
                  onKeyDown={(e) => { if (e.key === 'Enter') upMeal(mi, (x) => ({ ...x, items: [...x.items, { f: '', g: '' }] })); }} />
                <button className="w-5 h-5 border-0 bg-transparent text-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-err" title="Rimuovi" aria-label="Rimuovi alimento"
                  onClick={() => upMeal(mi, (x) => ({ ...x, items: x.items.filter((_, j) => j !== ii) }))}>×</button>
              </div>
            );
          })}
          {edit && <button className="self-start border-0 bg-transparent text-accent text-[12.5px] font-medium p-0 hover:underline" onClick={() => upMeal(mi, (x) => ({ ...x, items: [...x.items, { f: '', g: '' }] }))}>+ alimento</button>}
          {edit ? (
            <input className={cx(inp, 'text-xs text-muted italic border-t border-dashed !border-t-line pt-[7px] px-1 rounded-none')} value={m.note} placeholder="Nota (facoltativa)" onChange={(e) => upMeal(mi, (x) => ({ ...x, note: e.target.value }))} />
          ) : m.note ? <div className="text-xs text-muted border-t border-dashed border-line pt-[7px] italic">{m.note}</div> : null}
        </div>
      ))}
    </div>
  );
}
