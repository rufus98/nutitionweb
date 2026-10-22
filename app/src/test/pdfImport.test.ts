import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { extractWith, isQty, normQty, parsePlanText } from '../lib/pdfImport';

// I PDF reali dei pazienti non sono nel repository: i test che li usano girano solo se
// la cartella indicata da NUTREA_PDF_DIR esiste (es. NUTREA_PDF_DIR=/percorso npm test).
const DIR = process.env.NUTREA_PDF_DIR ?? '';
const pdfs = DIR && existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.pdf')) : [];

async function load(name: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const items = await extractWith(pdfjs, new Uint8Array(readFileSync(`${DIR}/${name}`)));
  return parsePlanText(items, name);
}

describe('quantità', () => {
  it('riconosce i formati usati nei piani', () => {
    for (const q of ['150g', '150 g', '1+200ml', 'n.4', 'N.5', '150/100g', '10/30/60g', 'g 80', '5 cucchiaini', '1 vasetto', '3+30g', 'n.6+30g', '330/300/']) expect(isQty(q), q).toBe(true);
    for (const q of ['Pane bianco', 'Max 1', 'volta sett.', '(PREALLENAMENTO)']) expect(isQty(q), q).toBe(false);
    expect(normQty('g 80')).toBe('80 g');
    expect(normQty('150g')).toBe('150 g');
    expect(normQty('n. 4')).toBe('n.4');
  });
});

describe.skipIf(!pdfs.length)('PDF reali', () => {
  it('Progeo Medical: 7 giorni, pasti, alternative e macro', async () => {
    const f = pdfs.find((x) => /ipocalor/i.test(x));
    if (!f) return;
    const r = await load(f);
    expect(r.format).toBe('progeo');
    expect(r.plan.days.map((d) => d.label)).toEqual(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
    const lun = r.plan.days[0];
    expect(lun.meals.map((m) => m.name)).toEqual(['Pranzo', 'Merenda', 'Cena', 'Arco della giornata']);
    expect(lun.meals[0].items[0]).toMatchObject({ f: 'Couscous con feta e verdure', head: true });
    expect(lun.meals[0].items[1]).toMatchObject({ f: 'Couscous', g: '80 g', sub: true });
    const pollo = lun.meals[0].items.find((i) => i.f === 'Petto di pollo')!;
    expect(pollo.g).toBe('150 g');
    expect(pollo.alts?.find((a) => a.f === 'Hamburger di pollo')?.g).toBe('120 g');
    expect(lun.meals[3].items.find((i) => /Olio/.test(i.f))?.g).toBe('5 cucchiaini');
    expect(lun.kcal).toBe(1926);
    expect(r.plan.kcal).toBeGreaterThan(1800);
    expect(r.patientName).toBe('Andrea Damiani');
    expect(r.visit).toMatchObject({ date: '2026-02-06', kg: 78, height: 175 });
    expect(r.stats.flagged).toBe(0);
    console.log(JSON.stringify(r.stats), r.plan.title, r.warnings);
  });

  it('piano flessibile: giorni ON/OFF/RESET con varianti e gruppi', async () => {
    const f = pdfs.find((x) => /flessibile/i.test(x));
    if (!f) return;
    const r = await load(f);
    expect(r.format).toBe('layout');
    expect(r.plan.days.map((d) => d.label)).toEqual(['ON', 'OFF', 'RESET']);
    const on = r.plan.days[0];
    expect(on.meals.map((m) => m.name)).toEqual(['Colazione', 'Spuntino', 'Pranzo', 'Spuntino', 'Cena']);
    const pranzoOff = r.plan.days[1].meals.find((m) => m.name === 'Pranzo')!;
    expect(pranzoOff.items.find((i) => /Riso basmati/.test(i.f))?.g).toBe('100 g');
    expect(pranzoOff.items.some((i) => i.head && /carboidrati/i.test(i.f))).toBe(true);
    const cenaOn = on.meals.find((m) => m.name === 'Cena')!;
    expect(cenaOn.items.find((i) => /Gnocchi/.test(i.f))?.g).toBe('300 g');
    const cenaOff = r.plan.days[1].meals.find((m) => m.name === 'Cena')!;
    expect(cenaOff.items.find((i) => /Gnocchi/.test(i.f))?.g).toBe('260 g');
    expect(r.patientName).toBe('Andrea Damiani');
    console.log(JSON.stringify(r.stats), r.warnings);
    console.log(JSON.stringify(r.plan.days.map((d) => ({ d: d.label, m: d.meals.map((m) => ({ n: m.name, i: m.items.map((i) => (i.head ? '## ' : '') + i.f + (i.g ? ' = ' + i.g : '') + (i.flag ? ' [?]' : '')) })) })), null, 1));
  });
});
