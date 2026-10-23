// Elementi comuni ai due modelli di PDF del piano.
import type { PlanData, PlanItem } from '../../db/types';
import { hex } from './canvas';

export interface PlanPdfInput {
  plan: PlanData;
  patient: { first: string; last: string; sex?: 'F' | 'M'; dob?: string | null; height?: number | null };
  /** Ultima visita: data e peso, per l'intestazione del piano settimanale. */
  visit?: { date: string; kg: number | null } | null;
  studio: { name: string; title?: string };
  version?: number;
}

export const BLACK = hex('#000000');
export const GREY = hex('#595959');
export const LIGHT_GREY = hex('#d9d9d9');

const WEEKDAYS: Record<string, string> = { lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì', ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica' };
/** "Lun" → "Lunedì"; altre etichette restano come sono. */
export const dayName = (label: string) => WEEKDAYS[label.trim().slice(0, 3).toLowerCase()] ?? label;

/** Quantità divisa in numero e unità quando è una grammatura ("150 g" → 150, g); altrimenti null. */
export function splitQty(g: string): { num: string; unit: string } | null {
  const m = /^\s*([\d.,/+\s]+?)\s*(g|gr|ml|kg|l)\.?\s*$/i.exec(g);
  return m ? { num: m[1].replace(/\s+/g, ''), unit: m[2].toLowerCase() === 'gr' ? 'g' : m[2].toLowerCase() } : null;
}

/** Quantità compatta come nei piani ON/OFF/RESET: "150 g" → "150g". */
export const compactQty = (g: string) => g.trim().replace(/(\d)\s+(g|ml|kg)\b/gi, '$1$2');

/** Righe dell'alimento: il principale e le alternative con la loro quantità. */
export const itemLines = (it: PlanItem) => [{ f: it.f, g: it.g }, ...(it.alts ?? [])];

export const fullName = (p: PlanPdfInput['patient']) => `${p.first} ${p.last}`.trim();
