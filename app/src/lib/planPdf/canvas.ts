// Impaginazione dei PDF dei piani su pdf-lib: coordinate dall'alto della pagina (come nei documenti),
// testo con stili misti, a capo automatico, giustificato, riquadri e salto pagina.
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { printable, type FontName, type FontSet } from './fonts';

export type RGB = [number, number, number];
export const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const col = (c: RGB) => rgb(c[0], c[1], c[2]);

export interface Style { font?: FontName; size?: number; color?: RGB; underline?: boolean }
export interface Run { text: string; style?: Style }
export type Align = 'left' | 'center' | 'right' | 'justify';

type FullStyle = Required<Omit<Style, 'underline'>> & { underline: boolean };
/** Parte di parola con un suo stile (es. "“" normale + "ON" colorato + "”" normale = una sola parola). */
interface Seg { text: string; style: FullStyle; w: number }
interface Word { segs: Seg[]; w: number; space: number }
interface Line { words: Word[]; w: number; last: boolean }

export const A4 = { W: 595.28, H: 841.89 };

export class Canvas {
  readonly W = A4.W;
  readonly H = A4.H;
  pages: PDFPage[] = [];
  page!: PDFPage;
  /** Cursore verticale (distanza dal bordo superiore). */
  y = 0;
  margin = { top: 48, bottom: 72, left: 48, right: 48 };
  base: Required<Omit<Style, 'underline'>> = { font: 'regular', size: 10.5, color: [0, 0, 0] };
  /** Disegnato in cima a ogni pagina nuova (es. nome del paziente). */
  onNewPage?: (c: Canvas) => void;

  constructor(readonly pdf: PDFDocument, readonly fonts: FontSet) {}

  get left() { return this.margin.left; }
  get right() { return this.W - this.margin.right; }
  get width() { return this.right - this.left; }
  get bottom() { return this.H - this.margin.bottom; }
  get room() { return this.bottom - this.y; }

  addPage() {
    this.page = this.pdf.addPage([this.W, this.H]);
    this.pages.push(this.page);
    this.y = this.margin.top;
    this.onNewPage?.(this);
  }

  /** Se mancano `h` punti nella pagina, passa alla successiva. Restituisce true se ha cambiato pagina. */
  ensure(h: number): boolean {
    if (this.y + h <= this.bottom) return false;
    this.addPage();
    return true;
  }

  /** Stile completo: i valori non indicati (o undefined) prendono quelli di base. */
  private full(s?: Style) {
    const out = { ...this.base, underline: false } as FullStyle;
    for (const [k, v] of Object.entries(s ?? {})) if (v !== undefined) (out as any)[k] = v;
    return out;
  }

  textWidth(text: string, style?: Style) {
    const s = this.full(style);
    const f = this.fonts[s.font];
    return f.widthOfTextAtSize(printable(f, text), s.size);
  }

  /** Testo su una riga; `top` è il bordo superiore della riga. */
  text(text: string, x: number, top: number, style?: Style & { align?: 'left' | 'center' | 'right' }) {
    const s = this.full(style);
    const f = this.fonts[s.font];
    const t = printable(f, text);
    const w = f.widthOfTextAtSize(t, s.size);
    const left = style?.align === 'center' ? x - w / 2 : style?.align === 'right' ? x - w : x;
    const baseline = this.H - (top + s.size * 0.82);
    this.page.drawText(t, { x: left, y: baseline, size: s.size, font: f, color: col(s.color) });
    if (s.underline) this.page.drawLine({ start: { x: left, y: baseline - 1.4 }, end: { x: left + w, y: baseline - 1.4 }, thickness: 0.6, color: col(s.color) });
    return w;
  }

  rect(x: number, top: number, w: number, h: number, o: { fill?: RGB; stroke?: RGB; lineWidth?: number; radius?: number } = {}) {
    const r = o.radius ?? 0;
    if (r > 0) {
      const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
      this.page.drawSvgPath(p, { x, y: this.H - top, color: o.fill && col(o.fill), borderColor: o.stroke && col(o.stroke), borderWidth: o.stroke ? o.lineWidth ?? 1 : 0 });
    } else {
      this.page.drawRectangle({ x, y: this.H - top - h, width: w, height: h, color: o.fill && col(o.fill), borderColor: o.stroke && col(o.stroke), borderWidth: o.stroke ? o.lineWidth ?? 1 : 0 });
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, color: RGB, thickness = 0.75) {
    this.page.drawLine({ start: { x: x1, y: this.H - y1 }, end: { x: x2, y: this.H - y2 }, thickness, color: col(color) });
  }

  /** Divide il testo (anche a stili misti) in righe larghe al massimo `width`. Gli "a capo" sono rispettati. */
  layout(runs: Run[] | string, width: number, style?: Style): Line[] {
    const list: Run[] = typeof runs === 'string' ? [{ text: runs }] : runs;
    const paras: Word[][] = [[]];
    let glue = false; // il pezzo successivo continua la parola precedente (nessuno spazio in mezzo)
    for (const r of list) {
      const s = this.full({ ...style, ...r.style });
      const f = this.fonts[s.font];
      const space = f.widthOfTextAtSize(' ', s.size);
      r.text.split('\n').forEach((chunk, i) => {
        if (i > 0) { paras.push([]); glue = false; }
        for (const t of chunk.split(/( +)/)) {
          if (!t) continue;
          if (t.startsWith(' ')) { glue = false; continue; }
          const pt = printable(f, t);
          const seg = { text: pt, style: s, w: f.widthOfTextAtSize(pt, s.size) };
          const words = paras[paras.length - 1];
          const prev = words[words.length - 1];
          if (glue && prev) { prev.segs.push(seg); prev.w += seg.w; prev.space = space; }
          else words.push({ segs: [seg], w: seg.w, space });
          glue = true;
        }
      });
    }
    const lines: Line[] = [];
    for (const words of paras) {
      let cur: Word[] = [], w = 0;
      for (const word of words) {
        const add = (cur.length ? cur[cur.length - 1].space : 0) + word.w;
        if (cur.length && w + add > width) { lines.push({ words: cur, w, last: false }); cur = []; w = 0; }
        w += (cur.length ? cur[cur.length - 1].space : 0) + word.w;
        cur.push(word);
      }
      lines.push({ words: cur, w, last: true });
    }
    return lines;
  }

  /** Altezza di un blocco di testo, senza disegnarlo. */
  measure(runs: Run[] | string, width: number, style?: Style, leading = 1.25) {
    const size = this.full(style).size;
    return this.layout(runs, width, style).length * size * leading;
  }

  /** Disegna righe già calcolate a partire da `top`; restituisce l'altezza usata. */
  drawLines(lines: Line[], x: number, top: number, width: number, align: Align, size: number, leading = 1.25) {
    let y = top;
    for (const l of lines) {
      const gaps = l.words.length - 1;
      const extra = align === 'justify' && !l.last && gaps > 0 ? (width - l.w) / gaps : 0;
      let cx = align === 'center' ? x + (width - l.w) / 2 : align === 'right' ? x + width - l.w : x;
      l.words.forEach((wd, i) => {
        let sx = cx;
        for (const sg of wd.segs) { this.text(sg.text, sx, y + (size - sg.style.size) * 0.8, sg.style); sx += sg.w; }
        cx += wd.w + (i < gaps ? wd.space + extra : 0);
      });
      y += size * leading;
    }
    return y - top;
  }

  /** Paragrafo al cursore, con salto pagina riga per riga. */
  paragraph(runs: Run[] | string, o: { x?: number; width?: number; style?: Style; align?: Align; leading?: number; after?: number } = {}) {
    const x = o.x ?? this.left, width = o.width ?? this.right - x;
    const size = this.full(o.style).size, leading = o.leading ?? 1.25;
    for (const l of this.layout(runs, width, o.style)) {
      this.ensure(size * leading);
      this.y += this.drawLines([l], x, this.y, width, o.align ?? 'left', size, leading);
    }
    this.y += o.after ?? 0;
  }

  /** Numera le pagine e disegna il piè di pagina, a impaginazione finita. */
  finish(footer: (c: Canvas, index: number, total: number) => void) {
    this.pages.forEach((p, i) => { this.page = p; footer(this, i, this.pages.length); });
  }
}
