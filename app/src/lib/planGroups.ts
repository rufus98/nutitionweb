// Struttura di un pasto come nel PDF: varianti alternative, gruppi "scegli 1 tra", parte fissa, piatti composti.
import type { PlanItem } from '../db/types';

export type SectionKind = 'variant' | 'choice' | 'fixed' | 'dish' | 'plain';
export interface Section { kind: SectionKind; head: PlanItem | null; headIdx: number; items: { it: PlanItem; idx: number }[] }

/** Tipo dell'intestazione; per i piani salvati prima che esistesse il campo lo deduce dal testo. */
export function headKind(it: PlanItem): Exclude<SectionKind, 'plain'> {
  if (it.kind) return it.kind;
  if (/^(seleziona|aggiungi|scegli|a scelta)/i.test(it.f)) return 'choice';
  if (/^in aggiunta$/i.test(it.f)) return 'fixed';
  const letters = it.f.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return /^opzione\b/i.test(it.f) || (letters.length >= 4 && letters === letters.toUpperCase()) ? 'variant' : 'dish';
}

export function sections(items: PlanItem[]): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  items.forEach((it, idx) => {
    if (it.head) {
      cur = { kind: headKind(it), head: it, headIdx: idx, items: [] };
      out.push(cur);
      return;
    }
    // Un piatto composto contiene solo i suoi ingredienti: la voce successiva torna "semplice".
    if (!cur || (cur.kind === 'dish' && !it.sub)) {
      cur = { kind: 'plain', head: null, headIdx: -1, items: [] };
      out.push(cur);
    }
    cur.items.push({ it, idx });
  });
  return out;
}

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
