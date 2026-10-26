// Piano settimanale nello stile dei piani "Piano alimentare personalizzato" in uso nello studio:
// riepilogo con apporti energetici, norme generali, una pagina per giorno, tabelle delle alternative, lista della spesa.
import type { PlanNote, PlanItem } from '../../db/types';
import { sections } from '../planGroups';
import { ageFrom, bmiOf, fmtDate, n1 } from '../format';
import { Canvas, hex, type RGB } from './canvas';
import { BLACK, dayName, fullName, GREY, LIGHT_GREY, splitQty, type PlanPdfInput } from './common';
import { shoppingList } from '../shopping';

const BLUE = hex('#6495ed');
const GREEN = hex('#008000');
const WHITE: RGB = [1, 1, 1];
const MACRO = { protein: hex('#1f6fd1'), carbs: hex('#a8428e'), fat: hex('#c9ad6c') };

/** Barra azzurra con titolo bianco centrato. */
function bar(c: Canvas, text: string, x = c.left, w = c.width, size = 16) {
  const h = size + 10;
  c.rect(x, c.y, w, h, { fill: BLUE });
  c.text(text, x + w / 2, c.y + 5, { size, color: WHITE, align: 'center' });
  c.y += h;
}

// ——— Riepilogo ———

function summary(c: Canvas, inp: PlanPdfInput) {
  const { plan, patient, visit, studio } = inp;
  bar(c, 'PIANO ALIMENTARE PERSONALIZZATO');
  c.y += 16;
  c.text('Elaborato da:', c.W / 2, c.y, { size: 12, align: 'center' });
  c.y += 17;
  c.text(studio.name, c.W / 2, c.y, { size: 12, font: 'bold', align: 'center' });
  if (studio.title) { c.y += 15; c.text(studio.title, c.W / 2, c.y, { size: 10, color: GREY, align: 'center' }); }
  c.y += 30;

  // Riquadro del paziente
  const kg = visit?.kg ?? null, height = patient.height ?? null;
  const bmi = bmiOf(kg, height);
  const left: [string, string][] = ([
    ['Visita del:', visit?.date ? fmtDate(visit.date) : ''],
    ['Sesso:', patient.sex === 'M' ? 'Maschio' : patient.sex === 'F' ? 'Femmina' : ''],
    ['Età:', patient.dob ? String(ageFrom(patient.dob)) : ''],
    ['Altezza:', height ? `cm ${height}` : ''],
    ['Peso:', kg ? `kg ${n1(kg).replace(',0', '')}` : ''],
  ] as [string, string][]).filter(([, v]) => v);
  const right: [string, string][] = ([
    ['BMI (Body Mass Index):', bmi ? n1(bmi) : ''],
    ['Piano:', plan.title],
    ['Energia media:', plan.kcal ? `kcal ${plan.kcal.toLocaleString('it-IT')}` : ''],
    ['Versione:', inp.version ? `v${inp.version}` : ''],
  ] as [string, string][]).filter(([, v]) => v);
  const rows = Math.max(left.length, right.length);
  const boxH = 52 + rows * 17 + 18;
  const top = c.y;
  c.rect(c.left, top, c.width, boxH, { stroke: BLUE, lineWidth: 0.8, radius: 4 });
  c.text(fullName(patient), c.W / 2, top + 13, { size: 22, color: GREEN, align: 'center' });
  c.line(c.left, top + 46, c.right, top + 46, BLUE, 0.8);
  left.forEach(([l, v], i) => { c.text(l, c.left + 18, top + 62 + i * 17, { size: 11 }); c.text(v, c.left + 150, top + 62 + i * 17, { size: 11 }); });
  right.forEach(([l, v], i) => { c.text(l, c.left + 262, top + 62 + i * 17, { size: 11 }); c.text(v, c.left + 400, top + 62 + i * 17, { size: 11 }); });
  c.y = top + boxH + 26;

  // Apporti energetici: per giorno se disponibili, altrimenti quelli medi del piano.
  const days = plan.days.map((d) => ({
    label: dayName(d.label),
    protein: d.protein ?? plan.protein, carbs: d.carbs ?? plan.carbs, fat: d.fat ?? plan.fat,
    kcal: d.kcal ?? plan.kcal ?? null,
  }));
  if (!days.length || !days.some((d) => d.protein || d.carbs || d.fat || d.kcal)) return;
  chart(c, days);
  energyTable(c, days);
}

type DayMacro = { label: string; protein: number | null; carbs: number | null; fat: number | null; kcal: number | null };

function chart(c: Canvas, days: DayMacro[]) {
  if (!days.some((d) => d.protein || d.carbs || d.fat)) return;
  c.text('RAPPRESENTAZIONE GRAFICA DEGLI APPORTI ENERGETICI', c.W / 2, c.y, { size: 13, color: BLUE, align: 'center' });
  c.y += 20;
  const top = c.y, h = 200;
  c.rect(c.left, top, c.width, h, { stroke: BLUE, lineWidth: 0.8, radius: 4 });
  const kcalOf = (d: DayMacro) => (d.protein ?? 0) * 4 + (d.carbs ?? 0) * 4 + (d.fat ?? 0) * 9;
  const max = Math.max(500, Math.ceil(Math.max(...days.map(kcalOf)) / 500) * 500);
  const gx = c.left + 46, gw = c.width - 46 - 110, gy = top + 14, gh = h - 44;
  for (let v = 0; v <= max; v += 500) {
    const y = gy + gh - (v / max) * gh;
    c.line(gx, y, gx + gw, y, LIGHT_GREY, 0.5);
    c.text(v.toLocaleString('it-IT').replace('.', ''), gx - 6, y - 4.5, { size: 8.5, align: 'right' });
  }
  c.line(gx, gy, gx, gy + gh, GREY, 0.6);
  c.text('kcal', gx - 6, top + 3, { size: 8, color: GREY, align: 'right' });
  const slot = gw / days.length, bw = Math.min(26, slot * 0.45);
  days.forEach((d, i) => {
    const x = gx + slot * i + (slot - bw) / 2;
    let y = gy + gh;
    for (const [k, v] of [['protein', (d.protein ?? 0) * 4], ['carbs', (d.carbs ?? 0) * 4], ['fat', (d.fat ?? 0) * 9]] as const) {
      const bh = (v / max) * gh;
      if (bh > 0) c.rect(x, y - bh, bw, bh, { fill: MACRO[k] });
      y -= bh;
    }
    c.text(d.label.slice(0, 3), gx + slot * i + slot / 2, gy + gh + 6, { size: 9, align: 'center' });
  });
  // Legenda
  const lx = c.right - 92, ly = top + 16;
  c.rect(lx, ly, 80, 58, { stroke: LIGHT_GREY, lineWidth: 0.6 });
  ([['Protidi', MACRO.protein], ['Glucidi', MACRO.carbs], ['Lipidi', MACRO.fat]] as const).forEach(([l, color], i) => {
    c.rect(lx + 8, ly + 9 + i * 15, 10, 9, { fill: color });
    c.text(l, lx + 24, ly + 8 + i * 15, { size: 9 });
  });
  c.y = top + h + 18;
}

function energyTable(c: Canvas, days: DayMacro[]) {
  const top = c.y, h = 28 + 5 * 15;
  c.rect(c.left, top, c.width, h, { stroke: BLUE, lineWidth: 0.8, radius: 4 });
  c.text('Apporti energetici', c.W / 2, top + 8, { size: 12, color: BLUE, align: 'center' });
  const x0 = c.left + 90, colW = (c.right - 14 - x0) / days.length;
  const val = (v: number | null) => (v == null ? '—' : v.toLocaleString('it-IT'));
  days.forEach((d, i) => c.text(d.label, x0 + colW * (i + 1), top + 30, { size: 9, align: 'right' }));
  ([['Protidi g', 'protein'], ['Glucidi g', 'carbs'], ['Lipidi g', 'fat'], ['Totale kcal', 'kcal']] as const).forEach(([l, k], r) => {
    const y = top + 45 + r * 15;
    c.text(l, c.left + 14, y, { size: 9 });
    days.forEach((d, i) => c.text(val(d[k]), x0 + colW * (i + 1), y, { size: 9, align: 'right' }));
  });
  c.y = top + h + 10;
}

// ——— Norme generali ———

/** Sezioni delle indicazioni generali: titolo maiuscolo centrato e testo giustificato; righe "- " rientrate. */
export function generalNorms(c: Canvas, notes: PlanNote[]) {
  if (!notes.length) return;
  c.addPage();
  bar(c, 'NORME GENERALI');
  c.y += 6;
  for (const n of notes) {
    if (n.title && !/^norme generali$/i.test(n.title.trim())) { // il titolo "Norme generali" è già nella barra
      c.ensure(16 + 40);
      c.y += 6;
      c.text(n.title.toUpperCase(), c.W / 2, c.y, { size: 14, font: 'bold', align: 'center' });
      c.y += 19;
    }
    const lines = n.text.split('\n').map((l) => l.trim()).filter(Boolean);
    const centered = lines.length > 0 && lines.every((l) => /^[A-ZÀ-Ù ]{3,}:/.test(l)); // es. "CARNE E PESCE: …"
    for (const l of lines) {
      const bullet = /^[-•–]\s+/.exec(l) || /^\d+[).]\s+/.exec(l);
      if (bullet) c.paragraph('- ' + l.slice(bullet[0].length), { x: c.left + 36, style: { size: 10.5 }, align: 'left' });
      else c.paragraph(l, { style: { size: 10.5 }, align: centered ? 'center' : 'justify' });
    }
    c.y += 4;
  }
}

// ——— Pagine dei giorni ———

const COL = { x: 82, w: 431 };
const qtyRight = COL.x + COL.w - 46, unitX = COL.x + COL.w - 92, altRight = COL.x + COL.w;

function dayHeader(c: Canvas, name: string, title: string) {
  c.text(name, c.W / 2, c.y, { size: 20, color: GREEN, align: 'center' });
  c.y += 30;
  bar(c, title, COL.x, COL.w, 14);
  c.y += 12;
  c.text('Alimento', COL.x, c.y, { size: 10.5, color: GREEN });
  c.text('Quantità', qtyRight, c.y, { size: 10.5, color: GREEN, align: 'right' });
  c.text('Alt.', altRight, c.y, { size: 10.5, color: GREEN, align: 'right' });
  c.y += 18;
}

/** Riga di un alimento: nome (a capo se lungo), quantità "g  150" allineata, codice della tabella delle alternative. */
function foodRow(c: Canvas, text: string, g: string, alt: number | null, o: { indent?: number; font?: 'regular' | 'bold' | 'italic' } = {}) {
  const x = COL.x + (o.indent ?? 0);
  const lines = c.layout(text, unitX - 12 - x, { size: 11, font: o.font });
  const h = lines.length * 14.5 + 1.5;
  c.ensure(h);
  c.drawLines(lines, x, c.y, unitX - 12 - x, 'left', 11, 14.5 / 11);
  const q = splitQty(g);
  if (q) { c.text(q.unit, unitX, c.y, { size: 11 }); c.text(q.num, qtyRight, c.y, { size: 11, align: 'right' }); }
  else if (g) c.text(g, qtyRight, c.y, { size: 11, align: 'right' });
  if (alt) c.text(String(alt), altRight, c.y, { size: 11, align: 'right' });
  c.y += h;
}

function dayPages(c: Canvas, inp: PlanPdfInput, altCode: (it: PlanItem) => number | null) {
  const name = fullName(inp.patient);
  for (const d of inp.plan.days) {
    const title = `Piano alimentare - ${dayName(d.label)}`;
    // L'intestazione è disegnata da onNewPage: sulle pagine successive dello stesso giorno con "(segue)".
    c.onNewPage = (cc) => dayHeader(cc, name, title);
    c.addPage();
    c.onNewPage = (cc) => dayHeader(cc, name, title + ' (segue)');
    for (const m of d.meals) {
      if (!m.items.some((i) => i.f.trim()) && !m.note) continue;
      c.ensure(16 + 30);
      c.y += 4;
      c.text(m.name, c.W / 2, c.y, { size: 13, color: BLUE, align: 'center' });
      c.y += 20;
      // Le sezioni senza alimenti compilati (es. "Opzione A" vuota del modello) non si stampano.
      const secs = sections(m.items).filter((s) => s.items.some(({ it }) => it.f.trim()) || (s.kind !== 'variant' && s.kind !== 'choice' && s.head?.f.trim()));
      const variants = secs.filter((s) => s.kind === 'variant');
      for (const s of secs) {
        if (s.kind === 'variant') {
          const k = variants.indexOf(s);
          if (k > 0) { c.ensure(14); c.text('oppure', c.W / 2, c.y, { size: 9.5, font: 'italic', color: GREY, align: 'center' }); c.y += 14; }
          foodRow(c, s.head!.f, '', null, { font: 'bold' });
        } else if (s.kind === 'choice') {
          foodRow(c, `${s.head!.f.replace(/:$/, '')}:`, '', null, { font: 'italic' });
        } else if (s.head) {
          foodRow(c, s.head.f, s.head.g, altCode(s.head));
        }
        for (const { it } of s.items) {
          if (!it.f.trim()) continue;
          const sub = it.sub || s.kind === 'dish';
          foodRow(c, (sub ? '- ' : s.kind === 'choice' ? '• ' : '') + it.f, it.g, altCode(it), { indent: sub || s.kind === 'choice' ? 4 : 0 });
        }
      }
      if (m.note) c.paragraph(m.note, { x: COL.x, width: COL.w, style: { size: 9.5, font: 'italic', color: GREY } });
      c.y += 8;
    }
  }
  c.onNewPage = undefined;
}

// ——— Alternative e lista della spesa ———

function tableHeader(c: Canvas, x: number, w: number, cols: [string, number, 'left' | 'right'][]) {
  c.rect(x, c.y, w, 16, { fill: BLUE });
  for (const [t, cx, align] of cols) c.text(t, cx, c.y + 3, { size: 10, font: 'bold', color: WHITE, align });
  c.y += 16;
}

function tableRow(c: Canvas, x: number, w: number, name: string, g: string, bold = false) {
  const q = splitQty(g);
  c.rect(x, c.y, w, 16, { stroke: BLACK, lineWidth: 0.5 });
  c.line(x + w - 120, c.y, x + w - 120, c.y + 16, BLACK, 0.5);
  const st = { size: 10, font: bold ? 'bold' as const : 'regular' as const };
  c.text(name, x + 4, c.y + 3, st);
  if (q) { c.text(q.unit, x + w - 70, c.y + 3, st); c.text(q.num, x + w - 4, c.y + 3, { ...st, align: 'right' }); }
  else c.text(g, x + w - 4, c.y + 3, { ...st, align: 'right' });
  c.y += 16;
}

function alternatives(c: Canvas, list: { code: number; it: PlanItem }[]) {
  if (!list.length) return;
  c.addPage();
  bar(c, 'Alternative alimentari', c.left, c.width, 17);
  c.y += 10;
  const x = c.left + 50, w = c.width - 100;
  for (const { code, it } of list) {
    c.ensure(26 + 16 * (2 + (it.alts?.length ?? 0)));
    c.text(`${code}: ${it.f}`, x, c.y, { size: 14, color: BLUE });
    c.y += 20;
    tableHeader(c, x, w, [['Alimento', x + 4, 'left'], ['Quantità', x + w - 4, 'right']]);
    tableRow(c, x, w, it.f, it.g, true);
    for (const a of it.alts ?? []) tableRow(c, x, w, a.f, a.g);
    c.y += 12;
  }
}

function shopping(c: Canvas, inp: PlanPdfInput) {
  const list = shoppingList(inp.plan);
  if (list.length < 2) return;
  const name = fullName(inp.patient);
  const head = (cc: Canvas) => {
    cc.text(name, cc.W / 2, cc.y, { size: 20, color: GREEN, align: 'center' });
    cc.y += 30;
    cc.text('Alimenti assegnati nella settimana (lista della spesa)', cc.W / 2, cc.y, { size: 14, color: BLUE, align: 'center' });
    cc.y += 24;
    tableHeader(cc, COL.x, COL.w, [['Alimento', COL.x + 4, 'left'], ['Quantità', COL.x + COL.w - 4, 'right']]);
  };
  c.onNewPage = head;
  c.addPage();
  for (const r of list) { c.ensure(16); tableRow(c, COL.x, COL.w, r.f, `${r.n.toLocaleString('it-IT')} ${r.unit}`); }
  c.onNewPage = undefined;
}

export function renderWeekly(c: Canvas, inp: PlanPdfInput) {
  // Codici delle tabelle delle alternative (colonna "Alt."), uno per alimento con alternative.
  // Partono da 101: a tre cifre come nei piani di riferimento, così il PDF si può anche reimportare.
  const alts: { code: number; it: PlanItem }[] = [];
  const codes = new Map<string, number>();
  const altCode = (it: PlanItem) => {
    if (!it.alts?.length) return null;
    const key = JSON.stringify([it.f, it.g, it.alts]);
    if (!codes.has(key)) { codes.set(key, 101 + alts.length); alts.push({ code: 101 + alts.length, it }); }
    return codes.get(key)!;
  };

  c.addPage();
  summary(c, inp);
  generalNorms(c, inp.plan.notes);
  dayPages(c, inp, altCode);
  alternatives(c, alts);
  shopping(c, inp);

  c.finish((cc, i, total) => {
    const y = cc.H - 64;
    cc.text('Elaborato da:', cc.left, y, { size: 12, color: GREEN });
    cc.text(inp.studio.name, cc.left + cc.textWidth('Elaborato da:', { size: 12 }) + 8, y + 1.5, { size: 10.5, color: GREY });
    cc.line(cc.left, y + 18, cc.right, y + 18, LIGHT_GREY, 0.75);
    cc.text(`${i + 1} / ${total}`, cc.W / 2, y + 28, { size: 8, color: GREY, align: 'center' });
  });
}
