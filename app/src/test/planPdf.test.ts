// PDF dei piani: entrambi i modelli si generano con i caratteri Carlito, e un piano settimanale esportato
// si rilegge con l'importazione dei PDF ottenendo gli stessi giorni, pasti e alimenti.
// Con NUTREA_PDF_OUT=/cartella i PDF generati vengono salvati per controllarli a vista.
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { planPdf, setFontSource, type PlanPdfInput } from '../lib/planPdf';
import { extractText, parsePlanText } from '../lib/pdfImport';
import { emptyPlanData } from '../db/planData';
import { samplePlan } from '../db/seed';
import type { PlanData } from '../db/types';

const FONT_DIR = resolve(__dirname, '../assets/fonts/carlito');
const FILES = { regular: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf', italic: 'Carlito-Italic.ttf', boldItalic: 'Carlito-BoldItalic.ttf' };
const OUT = process.env.NUTREA_PDF_OUT;

beforeAll(() => setFontSource(async (name) => new Uint8Array(readFileSync(resolve(FONT_DIR, FILES[name])))));

const input = (plan: PlanData): PlanPdfInput => ({
  plan,
  patient: { first: 'Andrea', last: 'Damiani', sex: 'M', dob: '1998-05-04', height: 175 },
  visit: { date: '2026-02-06', kg: 78 },
  studio: { name: 'Dott.ssa Elena Marchi', title: 'Biologa nutrizionista' },
  version: 2,
});

function flexiblePlan(): PlanData {
  const p = emptyPlanData('onoff');
  for (const d of p.days) {
    const [col, , pranzo, , cena] = d.meals;
    col.items = [
      { f: 'Yogurt e cereali', g: '', head: true, kind: 'variant' },
      { f: 'Yogurt greco 0%', g: d.label === 'ON' ? '170 g' : '150 g' },
      { f: 'Cornflakes integrali', g: '35 g', alts: [{ f: 'Fiocchi d’avena', g: '30 g' }] },
      { f: 'Frutta a scelta', g: '100 g' },
      { f: 'Toast e affettato', g: '', head: true, kind: 'variant' },
      { f: 'Pane integrale', g: '60 g' },
      { f: 'Bresaola / fesa di tacchino', g: '50 g' },
    ];
    for (const m of [pranzo, cena]) {
      m.items[1] = { f: 'Riso basmati / venere / farro', g: d.label === 'RESET' ? '60 g' : '80 g' };
      m.items.splice(2, 0, { f: 'Pasta di semola', g: '80 g' }, { f: 'Patate', g: '320 g' });
      m.items[m.items.findIndex((i) => i.head && i.kind === 'choice' && /proteica/.test(i.f)) + 1] = { f: 'Petto di pollo / tacchino', g: '150 g' };
    }
  }
  return p;
}

describe('PDF del piano', () => {
  it('settimanale: si genera con Carlito e si rilegge con gli stessi giorni e alimenti', async () => {
    const plan = samplePlan('Ricomposizione', 1650, false, true);
    plan.days[0].meals[2].items[0].alts = [{ f: 'Farro', g: '80 g' }, { f: 'Quinoa', g: '75 g' }];
    const bytes = await planPdf(input(plan));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(new TextDecoder('latin1').decode(bytes)).toMatch(/Carlito/);
    if (OUT) writeFileSync(resolve(OUT, 'settimanale.pdf'), bytes);

    const back = parsePlanText(await extractText(bytes), 'Piano_Damiani.pdf');
    expect(back.plan.days.map((d) => d.label)).toEqual(plan.days.map((d) => d.label));
    const foods = (p: PlanData) => p.days.flatMap((d) => d.meals.flatMap((m) => m.items.filter((i) => i.f && !i.head).map((i) => i.f)));
    expect(foods(back.plan)).toEqual(foods(plan));
    expect(back.plan.days[0].meals[2].items[0].alts?.map((x) => [x.f, x.g])).toEqual([['Farro', '80 g'], ['Quinoa', '75 g']]);
    expect(back.plan.notes.map((n) => n.title)).toEqual(plan.notes.map((n) => n.title));
  }, 60000);

  it('ON/OFF/RESET: si genera nello stile del piano flessibile', async () => {
    const bytes = await planPdf(input(flexiblePlan()));
    if (OUT) writeFileSync(resolve(OUT, 'flessibile.pdf'), bytes);
    const text = (await extractText(bytes)).map((i) => i.s).join(' ');
    for (const t of ['PIANO NUTRIZIONALE FLESSIBILE', 'ANDREA DAMIANI', 'PASTO 1: COLAZIONE', 'YOGURT E CEREALI', 'GIORNI DI RESET', 'Fiocchi d’avena', '170g'])
      expect(text).toContain(t);
  }, 60000);

  it('senza i file dei caratteri ripiega su Helvetica', async () => {
    setFontSource(async () => { throw new Error('assente'); });
    const bytes = await planPdf(input(emptyPlanData('weekly')));
    expect(new TextDecoder('latin1').decode(bytes)).toMatch(/Helvetica/);
    setFontSource(async (name) => new Uint8Array(readFileSync(resolve(FONT_DIR, FILES[name]))));
  });
});
