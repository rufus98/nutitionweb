// Lista della spesa di un piano: usata dal PDF settimanale e dall'app paziente.
import type { PlanData } from '../db/types';
import { sections } from './planGroups';

/** Quantità divisa in numero e unità quando è una grammatura ("150 g" → 150, g); altrimenti null. */
export function splitQty(g: string): { num: string; unit: string } | null {
  const m = /^\s*([\d.,/+\s]+?)\s*(g|gr|ml|kg|l)\.?\s*$/i.exec(g);
  return m ? { num: m[1].replace(/\s+/g, ''), unit: m[2].toLowerCase() === 'gr' ? 'g' : m[2].toLowerCase() } : null;
}

export interface ShoppingItem { f: string; unit: string; n: number }

/** Somma delle grammature del piano per alimento (solo le voci fisse, non quelle "a scelta" o delle varianti). */
export function shoppingList(plan: PlanData): ShoppingItem[] {
  const tot = new Map<string, ShoppingItem>();
  for (const d of plan.days) for (const m of d.meals) for (const s of sections(m.items)) {
    if (s.kind === 'choice' || s.kind === 'variant') continue;
    for (const { it } of s.items) {
      const q = splitQty(it.g);
      const n = q && /^\d+([.,]\d+)?$/.test(q.num) ? parseFloat(q.num.replace(',', '.')) : NaN;
      if (!it.f.trim() || isNaN(n)) continue;
      const key = it.f.trim().toLowerCase() + '|' + q!.unit;
      const cur = tot.get(key) ?? { f: it.f.trim(), unit: q!.unit, n: 0 };
      cur.n += n;
      tot.set(key, cur);
    }
  }
  return [...tot.values()].sort((a, b) => a.f.localeCompare(b.f, 'it'));
}

/** Alimenti tra cui scegliere (gruppi "scegli 1" e varianti), senza quantità: da avere in dispensa. */
export function choiceFoods(plan: PlanData): string[] {
  const fixed = new Set(shoppingList(plan).map((x) => x.f.toLowerCase()));
  const out = new Map<string, string>();
  for (const d of plan.days) for (const m of d.meals) for (const s of sections(m.items)) {
    if (s.kind !== 'choice' && s.kind !== 'variant') continue;
    for (const { it } of s.items) {
      const f = it.f.trim();
      if (f && !fixed.has(f.toLowerCase()) && !out.has(f.toLowerCase())) out.set(f.toLowerCase(), f);
    }
  }
  return [...out.values()].sort((a, b) => a.localeCompare(b, 'it'));
}
