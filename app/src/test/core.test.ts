import { describe, expect, it } from 'vitest';
import * as repo from '../db/repo';
import { addDays, ageFrom, bmiOf, fillTemplate, mondayOf, n1, phoneDigits, signed } from '../lib/format';
import { makePdf } from '../lib/pdf';
import { makeZip } from '../lib/zip';

describe('formattazione', () => {
  it('numeri e segni all\'italiana', () => {
    expect(n1(76.84)).toBe('76,8');
    expect(signed(-7.8)).toBe('−7,8');
    expect(signed(0)).toBe('±0,0');
  });
  it('date', () => {
    expect(mondayOf('2026-10-22')).toBe('2026-10-19');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(ageFrom('1988-02-12', '2026-10-21')).toBe(38);
  });
  it('BMI, telefono, modelli', () => {
    expect(bmiOf(76.8, 166)!.toFixed(1)).toBe('27.9');
    expect(phoneDigits('+39 347 218 5590')).toBe('393472185590');
    expect(phoneDigits('347 218 5590')).toBe('393472185590');
    expect(fillTemplate('Ciao {nome}, {x}', { nome: 'Giulia' })).toBe('Ciao Giulia, {x}');
  });
});

describe('piani vuoti', () => {
  it('settimanale e ON/OFF/RESET', async () => {
    const { sections } = await import('../lib/planGroups');
    expect(repo.emptyPlanData().days.map((d) => d.label)).toEqual(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
    const f = repo.emptyPlanData('onoff');
    expect(f.days.map((d) => d.label)).toEqual(['ON', 'OFF', 'RESET']);
    const pranzo = f.days[0].meals.find((m) => m.name === 'Pranzo')!;
    expect(sections(pranzo.items).map((x) => x.kind)).toEqual(['choice', 'choice', 'fixed']);
    expect(sections(f.days[0].meals[0].items).map((x) => x.kind)).toEqual(['variant']);
  });
});

describe('documenti', () => {
  it('PDF valido', () => {
    const pdf = new TextDecoder('latin1').decode(makePdf([[{ text: 'Totale € 70 — già' }]]));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Count 1');
  });
  it('ZIP con firma e directory centrale', () => {
    const z = makeZip([{ name: 'a.txt', data: 'ciao' }]);
    expect([...z.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(z)).toContain('a.txt');
  });
});
