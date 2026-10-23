// PDF del piano nutrizionale, nello stile dei piani in uso nello studio:
// settimanale ("Piano alimentare personalizzato") oppure flessibile a giorni tipo ON/OFF/RESET.
import { PDFDocument } from 'pdf-lib';
import { planKindOf } from '../../db/planData';
import { Canvas } from './canvas';
import { embedFonts } from './fonts';
import { fullName, type PlanPdfInput } from './common';
import { renderWeekly } from './weekly';
import { renderFlexible } from './flexible';

export type { PlanPdfInput } from './common';
export { setFontSource } from './fonts';

export async function planPdf(inp: PlanPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const flexible = planKindOf(inp.plan) === 'onoff';
  pdf.setTitle(`${flexible ? 'Piano nutrizionale flessibile' : 'Piano alimentare personalizzato'} — ${fullName(inp.patient)}`);
  pdf.setAuthor(inp.studio.name);
  pdf.setCreator('Nutrea Studio');
  pdf.setLanguage('it-IT');
  const c = new Canvas(pdf, await embedFonts(pdf));
  if (flexible) renderFlexible(c, inp);
  else renderWeekly(c, inp);
  // Senza object stream: compatibile anche con lettori PDF datati.
  return pdf.save({ useObjectStreams: false });
}
