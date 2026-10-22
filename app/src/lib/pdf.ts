// Generatore PDF minimale (A4, font standard Helvetica, codifica WinAnsi):
// basta per fatture/ricevute e per il PDF di esempio del piano, senza dipendenze.

export interface PdfLine { text: string; size?: number; bold?: boolean; x?: number; gap?: number; color?: [number, number, number]; right?: boolean }

const WIN: Record<string, number> = { '€': 0x80, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '•': 0x95, '…': 0x85, '−': 0x2d, '×': 0xd7, 'µ': 0xb5 };
function enc(s: string) {
  let out = '';
  for (const ch of s) {
    let c = WIN[ch] ?? ch.charCodeAt(0);
    if (c > 255) c = 0x3f; // '?'
    if (c === 0x28 || c === 0x29 || c === 0x5c) out += '\\' + String.fromCharCode(c);
    else if (c < 32 || c > 126) out += '\\' + c.toString(8).padStart(3, '0');
    else out += String.fromCharCode(c);
  }
  return out;
}
// Larghezze approssimative per allineare a destra (media Helvetica ≈ 0,5 em).
const approxWidth = (s: string, size: number, bold?: boolean) => s.length * size * (bold ? 0.56 : 0.52);

export function makePdf(pages: PdfLine[][]): Uint8Array {
  const W = 595, H = 842, M = 56;
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) && objs.length;
  const catalog = add('');
  const pagesObj = add('');
  const fReg = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const lines of pages) {
    let y = H - M;
    let body = '';
    for (const l of lines) {
      const size = l.size ?? 10.5;
      y -= l.gap ?? size * 1.5;
      if (!l.text) continue;
      const [r, g, b] = l.color ?? [0.094, 0.129, 0.122];
      const x = l.right ? W - M - approxWidth(l.text, size, l.bold) : M + (l.x ?? 0);
      body += `BT /${l.bold ? 'F2' : 'F1'} ${size} Tf ${r} ${g} ${b} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${enc(l.text)}) Tj ET\n`;
    }
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}endstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fReg} 0 R /F2 ${fBold} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

export const bytesToB64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
export const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
