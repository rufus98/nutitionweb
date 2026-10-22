// Documenti PDF generati dall'app: fattura/ricevuta e modulo di consenso privacy.
import type { Patient, Payment, PlanData, Settings } from '../db/types';
import { fmtDate, today } from './format';
import { makePdf, type PdfLine } from './pdf';
import { LETTERS, sections } from './planGroups';

const MUTED: [number, number, number] = [0.37, 0.41, 0.4];
const eur2 = (n: number) => '€ ' + n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function header(s: Settings): PdfLine[] {
  const p = s.prof;
  return [
    { text: p.name || 'Studio di nutrizione', size: 15, bold: true, gap: 0 },
    { text: p.title, size: 10, color: MUTED, gap: 15 },
    { text: [p.addr, p.phone].filter(Boolean).join(' · '), size: 9, color: MUTED, gap: 13 },
    { text: [p.piva && 'P.IVA ' + p.piva, p.albo, p.pec && 'PEC ' + p.pec].filter(Boolean).join(' · '), size: 9, color: MUTED, gap: 12 },
  ];
}

export function invoicePdf(pay: Payment, patient: Patient | null, s: Settings): Uint8Array {
  const cassaPct = /(\d+(?:[.,]\d+)?)\s*%/.exec(s.bill.cassa)?.[1];
  const cassa = cassaPct ? Math.round(pay.amount * parseFloat(cassaPct.replace(',', '.'))) / 100 : 0;
  const sub = pay.amount + cassa;
  const bollo = s.bill.bollo && sub > 77.47 ? 2 : 0;
  const forf = /forfett/i.test(s.bill.regime);
  const lines: PdfLine[] = [
    ...header(s),
    { text: `Fattura ${pay.invoice ?? ''}`, size: 20, bold: true, gap: 46 },
    { text: `Data: ${fmtDate(pay.date)}`, size: 10.5, gap: 20 },
    { text: 'Intestata a', size: 9, color: MUTED, gap: 26 },
    { text: patient ? `${patient.first} ${patient.last}` : pay.name ?? '', size: 11.5, bold: true, gap: 15 },
    { text: patient?.cf ? 'C.F. ' + patient.cf : '', size: 10, gap: 14 },
    { text: 'Descrizione', size: 9, color: MUTED, gap: 34 },
    { text: 'Importo', size: 9, color: MUTED, gap: 0, right: true },
    { text: pay.description, size: 11, gap: 18 },
    { text: eur2(pay.amount), size: 11, gap: 0, right: true },
    ...(cassa ? [{ text: `Contributo integrativo ${s.bill.cassa}`, size: 11, gap: 18 }, { text: eur2(cassa), size: 11, gap: 0, right: true }] : []),
    ...(bollo ? [{ text: 'Imposta di bollo', size: 11, gap: 18 }, { text: eur2(bollo), size: 11, gap: 0, right: true }] : []),
    { text: 'Totale', size: 12, bold: true, gap: 30 },
    { text: eur2(sub + bollo), size: 12, bold: true, gap: 0, right: true },
    { text: `Pagamento: ${pay.method} · ${pay.paid ? 'saldato' : 'in sospeso'}`, size: 10, color: MUTED, gap: 30 },
    { text: forf ? 'Operazione senza applicazione dell’IVA ai sensi dell’art. 1, cc. 54–89, L. 190/2014 (regime forfettario).' : `Prestazione sanitaria esente IVA ai sensi dell’${s.bill.iva.replace(/^Art\./, 'art.')}.`, size: 9, color: MUTED, gap: 26 },
    { text: s.bill.ts ? 'Spesa sanitaria trasmessa al Sistema Tessera Sanitaria salvo opposizione del paziente.' : '', size: 9, color: MUTED, gap: 13 },
  ];
  return makePdf([lines]);
}

export function consentPdf(p: Patient, s: Settings): Uint8Array {
  const studio = s.prof.name || 'lo studio';
  const body = [
    `Il/la sottoscritto/a ${p.first} ${p.last}${p.dob ? ', nato/a il ' + fmtDate(p.dob) : ''}${p.birthplace ? ' a ' + p.birthplace : ''}${p.cf ? ', C.F. ' + p.cf : ''},`,
    `dichiara di aver ricevuto l’informativa sul trattamento dei dati personali ai sensi degli artt. 13 e 9 del`,
    `Regolamento UE 2016/679 (GDPR) da parte di ${studio}, titolare del trattamento.`,
    '',
    'I dati personali e relativi alla salute (anamnesi, misure antropometriche, piani nutrizionali) sono trattati',
    'esclusivamente per finalità di prevenzione, valutazione e cura nutrizionale, e conservati sul computer',
    'dello studio per il tempo necessario alla prestazione e agli obblighi di legge.',
    '',
    'Il paziente può in qualsiasi momento chiedere accesso, rettifica, cancellazione o portabilità dei dati.',
  ];
  const box = (t: string, on: boolean): PdfLine => ({ text: `[${on ? 'X' : '  '}]  ${t}`, size: 10.5, gap: 20 });
  const lines: PdfLine[] = [
    ...header(s),
    { text: 'Informativa e consenso al trattamento dei dati sanitari', size: 15, bold: true, gap: 46 },
    ...body.map((t, i): PdfLine => ({ text: t, size: 10, gap: i === 0 ? 28 : 14 })),
    { text: 'Consensi', size: 11, bold: true, gap: 32 },
    box('Acconsento al trattamento dei dati relativi alla salute (obbligatorio per la prestazione)', false),
    box('Acconsento all’uso dell’app paziente tramite link personale', p.consent_app),
    box('Acconsento a ricevere comunicazioni dello studio (newsletter, promemoria non clinici)', p.consent_marketing),
    { text: `Data  ${fmtDate(today())}`, size: 10.5, gap: 60 },
    { text: 'Firma del paziente  ______________________________', size: 10.5, gap: 0, right: true },
  ];
  return makePdf([lines]);
}

/** Spezza un testo in righe di larghezza massima approssimata (caratteri). */
function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      if ((line + ' ' + w).trim().length > max) { if (line) out.push(line); line = w; }
      else line = (line + ' ' + w).trim();
    }
    out.push(line);
  }
  return out;
}

/** Impagina le righe su più pagine A4 quando superano l'altezza utile. */
function paginate(blocks: PdfLine[][], height = 720): PdfLine[][] {
  const pages: PdfLine[][] = [];
  for (const block of blocks) {
    let page: PdfLine[] = [], used = 0;
    for (const l of block) {
      const g = l.gap ?? (l.size ?? 10.5) * 1.5;
      if (used + g > height && page.length) { pages.push(page); page = []; used = 0; }
      page.push(page.length ? l : { ...l, gap: 0 });
      used += page.length === 1 ? 0 : g;
    }
    if (page.length) pages.push(page);
  }
  return pages;
}

export function planPdf(name: string, plan: PlanData, studio: string): Uint8Array {
  const blocks = plan.days.map((d, i) => {
    const lines: PdfLine[] = [];
    if (i === 0) {
      lines.push({ text: studio, size: 9, color: MUTED, gap: 0 });
      lines.push({ text: `Piano nutrizionale — ${name}`, size: 18, bold: true, gap: 26 });
      lines.push({ text: `${plan.title}${plan.kcal ? ' · ' + plan.kcal.toLocaleString('it-IT') + ' kcal' : ''}`, size: 11, gap: 18 });
      wrap(plan.general, 105).forEach((t, k) => lines.push({ text: t, size: 9.5, color: MUTED, gap: k ? 12 : 16 }));
    }
    const wk = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].indexOf(d.label);
    lines.push({ text: wk >= 0 ? ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'][wk] : 'Giorno ' + d.label, size: 14, bold: true, gap: i === 0 ? 30 : 0 });
    for (const m of d.meals) {
      lines.push({ text: `${m.name}${m.time ? `  (${m.time})` : ''}`, size: 11, bold: true, gap: 22 });
      const secs = sections(m.items);
      const variants = secs.filter((x) => x.kind === 'variant');
      for (const sc of secs) {
        if (sc.kind === 'variant') {
          const k = variants.indexOf(sc);
          if (k > 0) lines.push({ text: '— oppure —', size: 9, x: 12, gap: 16, color: MUTED });
          lines.push({ text: `${variants.length > 1 ? 'Opzione ' + LETTERS[k] + ': ' : ''}${sc.head!.f}`, size: 9.5, bold: true, x: 12, gap: 16 });
        } else if (sc.head) {
          lines.push({ text: sc.kind === 'choice' ? `${sc.head.f} (scegli 1):` : sc.head.f.toUpperCase(), size: 9, bold: true, x: 12, gap: 16, color: MUTED });
        }
        for (const { it } of sc.items) {
          const bullet = it.sub ? '    –' : sc.kind === 'choice' ? '   o' : '•';
          wrap(`${bullet}  ${it.f}${it.g ? ' — ' + it.g : ''}`, 92).forEach((t, k) => lines.push({ text: (k ? '     ' : '') + t, size: 10.5, x: 12, gap: k ? 13 : 15 }));
        }
      }
      if (m.note) wrap(m.note, 105).forEach((t) => lines.push({ text: t, size: 9.5, x: 12, gap: 13, color: MUTED }));
    }
    return lines;
  });
  return makePdf(paginate(blocks));
}
