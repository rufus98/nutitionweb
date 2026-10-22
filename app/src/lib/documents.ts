// Documenti PDF generati dall'app: fattura/ricevuta e modulo di consenso privacy.
import type { Patient, Payment, PlanData, Settings } from '../db/types';
import { fmtDate, today } from './format';
import { makePdf, type PdfLine } from './pdf';

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

export function planPdf(name: string, plan: PlanData, studio: string): Uint8Array {
  const pages = plan.days.map((d, i) => {
    const lines: PdfLine[] = [];
    if (i === 0) {
      lines.push({ text: studio, size: 9, color: MUTED, gap: 0 });
      lines.push({ text: `Piano nutrizionale — ${name}`, size: 18, bold: true, gap: 26 });
      lines.push({ text: `${plan.title}${plan.kcal ? ' · ' + plan.kcal.toLocaleString('it-IT') + ' kcal' : ''}`, size: 11, gap: 18 });
      lines.push({ text: plan.general, size: 9.5, color: MUTED, gap: 16 });
    }
    lines.push({ text: ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'][i], size: 14, bold: true, gap: i === 0 ? 30 : 0 });
    for (const m of d.meals) {
      lines.push({ text: `${m.name}  (${m.time})`, size: 11, bold: true, gap: 22 });
      for (const it of m.items) lines.push({ text: `•  ${it.f} — ${it.g}`, size: 10.5, x: 12, gap: 15 });
      if (m.note) lines.push({ text: m.note, size: 9.5, x: 12, gap: 14, color: MUTED });
    }
    return lines;
  });
  return makePdf(pages);
}

