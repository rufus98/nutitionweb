// Caratteri dei PDF dei piani: Carlito (metriche identiche a Calibri, il carattere dei PDF di riferimento),
// licenza SIL OFL 1.1 (src/assets/fonts/carlito/OFL.txt). Se i file non sono disponibili si ripiega su Helvetica.
//
// I file sono già ridotti ai caratteri latini (pyftsubset, vedi src/assets/fonts/carlito/README.md) e si incorporano
// interi: il sottoinsieme automatico di pdf-lib perde dei glifi con questo carattere.
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import regularUrl from '../../assets/fonts/carlito/Carlito-Regular.ttf?url';
import boldUrl from '../../assets/fonts/carlito/Carlito-Bold.ttf?url';
import italicUrl from '../../assets/fonts/carlito/Carlito-Italic.ttf?url';
import boldItalicUrl from '../../assets/fonts/carlito/Carlito-BoldItalic.ttf?url';

export type FontName = 'regular' | 'bold' | 'italic' | 'boldItalic';
export type FontSet = Record<FontName, PDFFont> & { embedded: boolean };

const FILES: Record<FontName, string> = { regular: regularUrl, bold: boldUrl, italic: italicUrl, boldItalic: boldItalicUrl };

/** Come leggere i file dei caratteri: nell'app con fetch; nei test si sostituisce con la lettura da disco. */
let source: (name: FontName, url: string) => Promise<Uint8Array> = async (_name, url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Carattere non disponibile: ${url}`);
  return new Uint8Array(await r.arrayBuffer());
};
export function setFontSource(fn: typeof source) { source = fn; cache = null; }

let cache: Promise<Record<FontName, Uint8Array> | null> | null = null;
function loadBytes() {
  cache ??= (async () => {
    try {
      const entries = await Promise.all((Object.keys(FILES) as FontName[]).map(async (k) => [k, await source(k, FILES[k])] as const));
      return Object.fromEntries(entries) as Record<FontName, Uint8Array>;
    } catch (e) {
      console.warn('PDF: uso Helvetica al posto di Carlito', e);
      return null;
    }
  })();
  return cache;
}

export async function embedFonts(pdf: PDFDocument): Promise<FontSet> {
  const bytes = await loadBytes();
  if (bytes) {
    pdf.registerFontkit(fontkit);
    const [regular, bold, italic, boldItalic] = await Promise.all(
      (['regular', 'bold', 'italic', 'boldItalic'] as const).map((k) => pdf.embedFont(bytes[k], { subset: false })));
    return { regular, bold, italic, boldItalic, embedded: true };
  }
  const [regular, bold, italic, boldItalic] = await Promise.all(
    [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique].map((f) => pdf.embedFont(f)));
  return { regular, bold, italic, boldItalic, embedded: false };
}

// Caratteri tipografici che non tutti i caratteri contengono, sostituiti con equivalenti semplici.
const REPLACE: Record<string, string> = { 'ʺ': '"', '″': '"', '′': "'", '−': '-', '‐': '-', '‑': '-', '\u00a0': ' ', '\u202f': ' ', '\t': ' ', '≥': '>=', '≤': '<=', '→': '->', '✓': 'v' };

const charsets = new WeakMap<PDFFont, Set<number>>();
/** Rende il testo stampabile con il carattere scelto (i simboli mancanti diventano "?"). */
export function printable(font: PDFFont, text: string): string {
  let supported = charsets.get(font);
  if (!supported) charsets.set(font, (supported = new Set(font.getCharacterSet())));
  let out = '';
  for (const ch of text) {
    const r = REPLACE[ch] ?? ch;
    for (const c of r) out += supported.has(c.codePointAt(0)!) ? c : '?';
  }
  return out;
}
