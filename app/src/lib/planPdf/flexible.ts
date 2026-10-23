// Piano flessibile a giorni tipo ON/OFF/RESET nello stile del "Piano nutrizionale flessibile" in uso nello studio:
// introduzione e legenda, poi pasto per pasto le tabelle ON e OFF affiancate, infine i giorni RESET.
import type { PlanMeal, PlanNote } from '../../db/types';
import { sections, type Section } from '../planGroups';
import { Canvas, hex, type RGB, type Run, type Style } from './canvas';
import { BLACK, compactQty, fullName, GREY, itemLines, type PlanPdfInput } from './common';

const DAY_COLOR: Record<string, RGB> = { ON: hex('#00b0f0'), OFF: hex('#ee0000'), RESET: hex('#00b050') };
const KEYWORD: Record<string, RGB> = { ON: hex('#0070c0'), OFF: hex('#ee0000'), RESET: hex('#00b050') };
const BOX_FILL = hex('#a6caec');
const BOX_LINE = hex('#2f6eb5');
const BAR_LINE = hex('#14213d');
const TABLE_LINE = hex('#bfbfbf');
const SHADE = hex('#f2f2f2');
const WHITE: RGB = [1, 1, 1];
const SIZE = 8.5, LEAD = 11;

/** Evidenzia ON, OFF e RESET con i colori della legenda. */
function keywords(text: string, style: Style = {}): Run[] {
  return text.split(/\b(ON|OFF|RESET)\b/).filter(Boolean).map((t) =>
    KEYWORD[t] ? { text: t, style: { ...style, font: style.font?.startsWith('bold') ? style.font : 'bold', color: KEYWORD[t] } } : { text: t, style });
}

function roundedBanner(c: Canvas, lines: { text: string; color?: RGB }[], w: number, size = 12.5) {
  const h = lines.length * size * 1.3 + 16;
  c.ensure(h + 10);
  const x = (c.W - w) / 2;
  c.rect(x, c.y, w, h, { fill: BOX_FILL, stroke: BOX_LINE, lineWidth: 1.2, radius: 10 });
  lines.forEach((l, i) => c.text(l.text, c.W / 2, c.y + 8 + i * size * 1.3, { size, color: l.color ?? BLACK, align: 'center' }));
  c.y += h;
}

// ——— Introduzione ———

function intro(c: Canvas, notes: PlanNote[]) {
  for (const n of notes) {
    const lines = n.text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (/^legenda/i.test(n.title)) {
      c.ensure(40);
      c.paragraph(keywords(n.title.replace(/:?$/, ':'), { font: 'bold' }), { style: { size: 10 }, after: 8 });
      // Ogni riga: la parte prima dei ":" in grassetto, la spiegazione in corsivo, dentro un riquadro arrotondato.
      const runs = lines.map((l) => {
        const i = l.indexOf(':');
        return i > 0 ? [...keywords(l.slice(0, i + 1), { font: 'bold' }), ...keywords(l.slice(i + 1), { font: 'italic' })] : keywords(l, { font: 'bold' });
      });
      const innerW = c.width - 28;
      const h = runs.reduce((a, r) => a + c.measure(r, innerW, { size: 10 }, 1.3) + 9, 0) + 12;
      c.ensure(h + 10);
      c.rect(c.left - 6, c.y, c.width + 12, h, { stroke: BLACK, lineWidth: 1.3, radius: 16 });
      let y = c.y + 12;
      for (const r of runs) y += c.drawLines(c.layout(r, innerW, { size: 10 }), c.left + 8, y, innerW, 'left', 10, 1.3) + 9;
      c.y += h + 16;
    } else if (n.title) {
      c.paragraph([{ text: n.title.replace(/:$/, '') + ': ', style: { font: 'bold' } }, ...keywords(lines.join('\n'))], { style: { size: 10 }, leading: 1.3, after: 12 });
    } else {
      for (const l of lines) c.paragraph(keywords(l), { style: { size: 10 }, leading: 1.3, after: 10 });
    }
  }
}

// ——— Tabelle dei pasti ———

type Row =
  | { kind: 'title'; text: string }
  | { kind: 'header'; text: string }
  | { kind: 'item'; lines: { f: string; g: string }[]; shade: boolean; border: boolean }
  | { kind: 'fixed'; lines: { f: string; g: string }[] };

const QTY_W = 46;

/** Righe di una sezione del pasto: intestazione della tabella o frase "Seleziona … tra:", poi gli alimenti. */
function sectionRows(s: Section): Row[] {
  const rows: Row[] = [];
  const bordered = s.kind !== 'choice' && s.kind !== 'fixed';
  if (s.kind === 'variant' || s.kind === 'dish') rows.push({ kind: 'header', text: s.head!.f.toUpperCase() });
  else if (s.kind === 'choice') rows.push({ kind: 'title', text: s.head!.f.replace(/:?$/, ':') });
  let k = 0;
  for (const { it } of s.items) {
    if (!it.f.trim() && !it.g.trim()) continue;
    const lines = itemLines(it).map((l) => ({ f: l.f, g: compactQty(l.g) }));
    rows.push(s.kind === 'fixed' ? { kind: 'fixed', lines } : { kind: 'item', lines, shade: k++ % 2 === 0, border: bordered });
  }
  // Sezione ancora vuota (es. "Opzione A" del modello non compilata): non si stampa.
  return rows.some((r) => r.kind === 'item' || r.kind === 'fixed') ? rows : [];
}

function nameLines(c: Canvas, r: Row, w: number) {
  const nameW = w - QTY_W - 8;
  if (r.kind === 'title') return [c.layout(r.text, w - 4, { size: SIZE, font: 'boldItalic' })];
  if (r.kind === 'header') return [c.layout(r.text, nameW, { size: SIZE, font: 'boldItalic' })];
  const font = r.kind === 'fixed' ? 'boldItalic' : 'italic';
  return r.lines.map((l) => c.layout(l.f || ' ', nameW, { size: SIZE, font }));
}

function rowHeight(c: Canvas, r: Row, w: number) {
  const n = nameLines(c, r, w).reduce((a, l) => a + l.length, 0);
  return n * LEAD + (r.kind === 'title' ? 10 : 9);
}

function drawRow(c: Canvas, r: Row, x: number, top: number, w: number, h: number) {
  const nameW = w - QTY_W - 8;
  const blocks = nameLines(c, r, w);
  if (r.kind === 'title') { c.drawLines(blocks[0], x + 2, top + 3, w - 4, 'left', SIZE, LEAD / SIZE); return; }
  if (r.kind === 'header') {
    c.rect(x, top, w, h, { stroke: TABLE_LINE, lineWidth: 0.6 });
    c.line(x + w - QTY_W, top, x + w - QTY_W, top + h, TABLE_LINE, 0.6);
    c.drawLines(blocks[0], x + 4, top + 4.5, nameW, 'center', SIZE, LEAD / SIZE);
    return;
  }
  if (r.kind === 'item') {
    if (r.shade) c.rect(x, top, w, h, { fill: SHADE });
    if (r.border) {
      c.rect(x, top, w, h, { stroke: TABLE_LINE, lineWidth: 0.6 });
      c.line(x + w - QTY_W, top, x + w - QTY_W, top + h, TABLE_LINE, 0.6);
    }
  }
  const font = r.kind === 'fixed' ? 'boldItalic' : 'italic';
  let y = top + 4.5;
  r.lines.forEach((l, i) => {
    c.drawLines(blocks[i], x + 4, y, nameW, 'left', SIZE, LEAD / SIZE);
    if (l.g) c.text(l.g, x + w - 4, y, { size: SIZE, font, align: 'right' });
    y += blocks[i].length * LEAD;
  });
}

/**
 * Colonne affiancate (ON | OFF) o una colonna sola (RESET): le sezioni corrispondenti partono alla stessa altezza
 * e le righe sono allineate a fasce, come nelle tabelle del piano di riferimento.
 */
function mealColumns(c: Canvas, meals: (PlanMeal | undefined)[], xs: number[], w: number) {
  const groups = meals.map((m) => (m ? sections(m.items).map(sectionRows).filter((rows) => rows.length) : []));
  const n = Math.max(...groups.map((g) => g.length));
  for (let k = 0; k < n; k++) {
    const rows = groups.map((g) => g[k] ?? []);
    const bands = Math.max(...rows.map((r) => r.length));
    const bandHeight = (b: number) => Math.max(0, ...rows.map((r) => (r[b] ? rowHeight(c, r[b], w) : 0)));
    for (let b = 0; b < bands; b++) {
      const h = bandHeight(b);
      // Un'intestazione di tabella (o "Seleziona … tra:") non resta da sola in fondo alla pagina.
      const opens = rows.some((r) => r[b] && (r[b].kind === 'header' || r[b].kind === 'title'));
      c.ensure(opens ? h + bandHeight(b + 1) : h);
      rows.forEach((r, col) => { if (r[b]) drawRow(c, r[b], xs[col], c.y, w, h); });
      c.y += h;
    }
    c.y += 14;
  }
  const notes = meals.map((m) => m?.note?.trim() ?? '');
  if (notes.some(Boolean)) {
    const h = Math.max(...notes.map((t) => (t ? c.measure(t, w, { size: SIZE, font: 'italic' }) : 0)));
    c.ensure(h);
    notes.forEach((t, col) => t && c.drawLines(c.layout(t, w, { size: SIZE, font: 'italic', color: GREY }), xs[col], c.y, w, 'left', SIZE));
    c.y += h + 10;
  }
}

/** Pasto con almeno un alimento o una nota (i pasti del modello lasciati vuoti non si stampano). */
const hasContent = (m?: PlanMeal) => !!m && (!!m.note.trim() || sections(m.items).some((s) => sectionRows(s).length > 0));

function dayBar(c: Canvas, label: string, cx: number, w: number) {
  const bw = Math.min(170, w * 0.72);
  c.rect(cx - bw / 2, c.y, bw, 19, { fill: DAY_COLOR[label] ?? GREY, stroke: BAR_LINE, lineWidth: 1.5 });
  c.text(label, cx, c.y + 5, { size: 9.5, font: 'bold', color: WHITE, align: 'center' });
}

function mealHeading(c: Canvas, i: number, name: string) {
  c.ensure(120);
  c.text(`PASTO ${i + 1}: ${name.toUpperCase()}`, c.W / 2, c.y, { size: SIZE, font: 'boldItalic', align: 'center' });
  c.y += 20;
}

export function renderFlexible(c: Canvas, inp: PlanPdfInput) {
  const { plan } = inp;
  c.margin = { top: 52, bottom: 56, left: 72, right: 72 };
  const byLabel = (l: string) => plan.days.find((d) => d.label.trim().toUpperCase() === l);
  const cols = (['ON', 'OFF'] as const).map((l) => ({ label: l, day: byLabel(l) })).filter((x) => x.day);
  const reset = byLabel('RESET');

  c.addPage();
  roundedBanner(c, [{ text: 'PIANO NUTRIZIONALE FLESSIBILE:' }, { text: fullName(inp.patient).toUpperCase(), color: WHITE }], 262);
  c.y += 26;
  intro(c, plan.notes);

  // Giorni ON e OFF, pasto per pasto
  if (cols.length) {
    c.y += 6;
    const labels = [...cols.map((x) => x.label), ...(reset ? ['RESET'] : [])];
    const last = labels[labels.length - 1];
    const days = labels.length > 1 ? `GIORNI ${labels.slice(0, -1).join(', ')} E ${last === 'RESET' ? 'GIORNI DI RESET' : last}` : `GIORNI ${last}`;
    roundedBanner(c, [{ text: 'IL PIANO SEGUENTE È ORGANIZZATO IN' }, { text: days }], 300, 11.5);
    c.y += 22;
    const gap = 22;
    const w = cols.length === 2 ? (c.width - gap) / 2 : Math.min(c.width, 330);
    const xs = cols.length === 2 ? [c.left, c.left + w + gap] : [(c.W - w) / 2];
    const n = Math.max(...cols.map((x) => x.day!.meals.length));
    for (let i = 0; i < n; i++) {
      const meals = cols.map((x) => x.day!.meals[i]);
      if (!meals.some(hasContent)) continue;
      mealHeading(c, i, meals.find(Boolean)!.name);
      cols.forEach((x, k) => dayBar(c, x.label, xs[k] + w / 2, w));
      c.y += 34;
      mealColumns(c, meals, xs, w);
      c.y += 12;
    }
  }

  // Giorni RESET
  if (reset) {
    c.ensure(160);
    c.y += 10;
    const t1 = 'GIORNI DI RESET:', t2 = ' DA SEGUIRE ESCLUSIVAMENTE IL GIORNO SUCCESSIVO AD UN FUORI PASTO';
    const w1 = c.textWidth(t1, { size: SIZE, font: 'bold' }), w2 = c.textWidth(t2, { size: SIZE, font: 'bold' });
    const x0 = (c.W - w1 - w2) / 2;
    c.text(t1, x0, c.y, { size: SIZE, font: 'bold', color: DAY_COLOR.RESET });
    c.text(t2, x0 + w1, c.y, { size: SIZE, font: 'bold', underline: true });
    c.y += 24;
    const w = Math.min(c.width, 330), xs = [(c.W - w) / 2];
    reset.meals.forEach((m, i) => {
      if (!hasContent(m)) return;
      mealHeading(c, i, m.name);
      dayBar(c, 'RESET', c.W / 2, w);
      c.y += 34;
      mealColumns(c, [m], xs, w);
      c.y += 12;
    });
  }

  c.finish((cc, i, total) => {
    cc.text(`${inp.studio.name}${inp.studio.title ? ' · ' + inp.studio.title : ''}`, cc.left, cc.H - 34, { size: 7.5, color: GREY });
    cc.text(`${i + 1} / ${total}`, cc.right, cc.H - 34, { size: 7.5, color: GREY, align: 'right' });
  });
}
