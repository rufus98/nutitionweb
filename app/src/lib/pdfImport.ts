// Lettura dei PDF delle diete: estrazione del testo con le posizioni (pdf.js) e ricostruzione del piano.
// Due parser:
//  - Progeo Medical: pagine "Piano alimentare - <giorno>", tabelle "Alternative alimentari", apporti per giorno;
//  - generico per layout: pasti ("PASTO 1: COLAZIONE", "Pranzo"…), colonne per tipo di giorno (ON/OFF/RESET,
//    Lunedì…), quantità allineate a destra, varianti e gruppi "a scelta".
// Le parti incerte vengono segnate "da verificare" (flag) per il controllo nell'editor.
import type { PlanData, PlanDay, PlanItem, PlanMeal } from '../db/types';
import { notesFromText } from '../db/planData';

export interface TextItem { page: number; x: number; y: number; w: number; h: number; s: string }
export interface ImportResult {
  plan: PlanData;
  format: 'progeo' | 'layout';
  patientName: string | null;
  /** Dati antropometrici trovati nel PDF (Progeo), utilizzabili come visita. */
  visit: { date: string | null; kg: number | null; height: number | null } | null;
  stats: { days: number; meals: number; items: number; flagged: number };
  warnings: string[];
}

// ---------------------------------------------------------------- estrazione

/** Estrae i frammenti di testo con coordinate (y dall'alto). Funziona nel browser/WebView. */
export async function extractText(bytes: Uint8Array): Promise<TextItem[]> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  }
  return extractWith(pdfjs, bytes);
}

/** Variante con un modulo pdf.js passato dall'esterno (usata nei test con la build "legacy" per Node). */
export async function extractWith(pdfjs: any, bytes: Uint8Array): Promise<TextItem[]> {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
  const out: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const H = page.getViewport({ scale: 1 }).height;
    const tc = await page.getTextContent();
    for (const it of tc.items as any[]) {
      if (!it.str || !it.str.trim()) continue;
      out.push({ page: p, x: it.transform[4], y: H - it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height, s: it.str });
    }
  }
  await doc.destroy();
  return out;
}

export function parsePlanText(items: TextItem[], fileName = ''): ImportResult {
  const all = items.map((i) => i.s).join(' ');
  // Stesso impianto anche nei PDF esportati da Nutrea Studio con il modello settimanale.
  if (/Progeo Medical|PIANO ALIMENTARE PERSONALIZZATO/i.test(all) && /Piano alimentare\s*-\s*\w+/i.test(all)) return parseProgeo(items, fileName);
  return parseLayout(items, fileName);
}

// ---------------------------------------------------------------- utilità comuni

const MEAL_TIMES: Record<string, string> = { colazione: '07:30', spuntino: '10:30', pranzo: '13:00', merenda: '16:30', cena: '20:00' };
const MEAL_RE = /^(?:pasto\s*\d+\s*[:.-]?\s*)?(colazione|spuntino(?:\s+\w+)?|pranzo|merenda|cena|dopocena|pre[- ]?nanna|arco della giornata|spuntino mattina|spuntino pomeriggio)$/i;
const WEEKDAY = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const WD_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const deaccent = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').trim();
const mealKey = (name: string) => deaccent(name).replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
const timeFor = (name: string) => MEAL_TIMES[deaccent(name).split(' ')[0]] ?? '';

/** Riconosce una quantità: "150g", "1+200ml", "n.4", "150/100g", "g 80", "5 cucchiaini", "1 vasetto", "10/30/60g"… */
export function isQty(raw: string): boolean {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!/\d/.test(s) || s.length > 22) return false;
  return /^(n\.?\s*)?[\d.,]+(\s*[+/]\s*(n\.?\s*)?[\d.,]*)*\s*(g|gr|ml|kg|l|pz|cl)?(\s*[+/]\s*[\d.,]+\s*(g|gr|ml)?)*\/?$/.test(s)
    || /^(g|gr|ml|kg)\s*[\d.,]+$/.test(s)
    || /^[\d.,/+]+\s*(cucchiain[oi]|vasett[oi]|fett[ae]|pezz[oi]|bicchier[ei]|tazz[ae]|porzion[ei]|unit[àa]|uov[ao]|confezion[ei]|scatolett[ae]|cucchiai[o]?)$/.test(s);
}
/** Normalizza la quantità nella forma del design: "80 g", "1+200 ml", "n.4", "5 cucchiaini". */
export function normQty(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  const m = /^(g|gr|ml|kg)\s*([\d.,]+)$/i.exec(s);
  if (m) return `${m[2]} ${m[1].toLowerCase() === 'gr' ? 'g' : m[1].toLowerCase()}`;
  s = s.replace(/^n\.\s*/i, 'n.').replace(/(\d)\s*(g|gr|ml|kg)$/i, (_, d, u) => `${d} ${u.toLowerCase() === 'gr' ? 'g' : u.toLowerCase()}`);
  return s;
}

/** Raggruppa i frammenti in righe (stessa pagina e y simile), ordinate dall'alto e da sinistra. */
function rows(items: TextItem[], tol = 2.5): TextItem[][] {
  const sorted = [...items].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const out: TextItem[][] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && last[0].page === it.page && Math.abs(last[0].y - it.y) <= tol) last.push(it);
    else out.push([it]);
  }
  return out.map((r) => r.sort((a, b) => a.x - b.x));
}

/** Unisce i frammenti adiacenti di una riga in segmenti separati da spazi ampi. */
function segments(row: TextItem[], gap = 7) {
  const segs: { x: number; end: number; s: string }[] = [];
  for (const it of row) {
    const last = segs[segs.length - 1];
    if (last && it.x - last.end < gap) {
      const join = it.x - last.end > 1.2 && !/[-/(]$/.test(last.s) && !/^[,.)/:]/.test(it.s) ? ' ' : '';
      last.s += join + it.s;
      last.end = Math.max(last.end, it.x + it.w);
    } else segs.push({ x: it.x, end: it.x + it.w, s: it.s });
  }
  return segs.map((g) => ({ ...g, s: g.s.replace(/\s+/g, ' ').trim() }));
}

function countStats(plan: PlanData) {
  let meals = 0, items = 0, flagged = 0;
  for (const d of plan.days) for (const m of d.meals) { meals++; for (const i of m.items) { if (!i.head) items++; if (i.flag) flagged++; } }
  return { days: plan.days.length, meals, items, flagged };
}

function titleFromFile(fileName: string, patient: string | null) {
  let t = fileName.replace(/\.pdf$/i, '').replace(/^[0-9a-f]{6,}-/i, '').replace(/[_]+/g, ' ');
  t = t.replace(/piano\s*(alimentare|nutrizionale)?/i, '').replace(/\d{1,2}[-.]\d{1,2}[-.]\d{2,4}/g, '');
  // Toglie il nome del paziente anche se scritto con un refuso (es. "Damniani").
  if (patient) {
    const names = patient.toLowerCase().split(/\s+/);
    t = t.split(/\s+/).filter((w) => !names.some((n) => lev(w.toLowerCase(), n) <= 2)).join(' ');
  }
  return clean(t).replace(/^[-–·\s]+|[-–·\s]+$/g, '').replace(/\b\w/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------- Progeo Medical

function parseProgeo(items: TextItem[], fileName: string): ImportResult {
  const warnings: string[] = [];
  const R = rows(items);
  const text = (r: TextItem[]) => clean(r.map((i) => i.s).join(' '));
  let patientName: string | null = null;

  // Dati della visita (pagina di riepilogo).
  const find = (re: RegExp) => { for (const r of R) { const m = re.exec(text(r)); if (m) return m; } return null; };
  const dm = find(/Visita del:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const km = find(/Peso:?\s*kg\s*([\d.,]+)/i);
  const hm = find(/Altezza:?\s*cm\s*([\d.,]+)/i);
  const visit = { date: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null, kg: km ? parseFloat(km[1].replace(',', '.')) : null, height: hm ? parseFloat(hm[1].replace(',', '.')) : null };

  // Alternative: "2131: Petto di pollo" seguito da righe alimento + quantità (1 o 2 colonne).
  const alts: Record<string, { f: string; q: string[] }[]> = {};
  let cur: string | null = null;
  for (const r of R) {
    const t = text(r);
    const h = /^(\d{3,5}):\s*(.+)$/.exec(t);
    if (h) { cur = h[1]; alts[cur] = []; continue; }
    if (!cur) continue;
    if (/^Alimento\b/.test(t)) continue;
    if (/Elaborato da|Powered by|Unità di misura|Alimenti assegnati|^\d+( \/ \d+)?$/.test(t)) { if (/Unità di misura|Alimenti assegnati/.test(t)) cur = null; continue; }
    const segs = segments(r, 9).map((x) => x.s);
    // "g" e il numero possono essere frammenti separati: "g   150" → "g 150"
    const parts: string[] = [];
    for (const x of segs.slice(1)) {
      if (parts.length && /^(g|ml|kg)$/i.test(parts[parts.length - 1])) parts[parts.length - 1] += ' ' + x;
      else parts.push(x);
    }
    const food = segs[0];
    const qs = parts.filter(isQty).map(normQty);
    if (food && qs.length) alts[cur].push({ f: food, q: qs });
  }

  // Apporti per giorno: tabella "Apporti energetici" (Protidi/Glucidi/Lipidi/Totale kcal × 7 giorni).
  const macro: Record<string, number[]> = {};
  for (const r of R) {
    const t = text(r);
    const m = /^(Protidi g|Glucidi g|Lipidi g|Totale kcal)\s+(.+)$/.exec(t);
    if (m && !macro[m[1]]) macro[m[1]] = m[2].split(/\s+/).map((v) => parseFloat(v.replace(/\./g, '').replace(',', '.'))).filter((v) => !isNaN(v));
  }

  // Norme generali (testo delle pagine introduttive, senza intestazioni ripetute).
  const general: string[] = [];
  let inNorms = false;
  for (const r of R) {
    const t = text(r);
    if (/^NORME GENERALI$/.test(t)) inNorms = true;
    if (/^PIANO ALIMENTARE\b/.test(t) && inNorms) break;
    if (!inNorms || /Elaborato da|Powered by|^\d+$/.test(t)) continue;
    if (/^[A-ZÀ-Ù' ]{4,}$/.test(t)) general.push('\n' + cap(t) + ':');
    else general.push(t);
  }

  // Pagine giornaliere.
  const days: PlanDay[] = [];
  let day: PlanDay | null = null, meal: PlanMeal | null = null, lastHead: PlanItem | null = null;
  let qtyX = 380, altX = 470;
  for (const r of R) {
    const t = text(r);
    const dmatch = /^Piano alimentare\s*-\s*(\S+)/i.exec(t);
    if (dmatch && /\(segue\)\s*$/i.test(t) && day) continue; // stesso giorno, pagina successiva
    if (dmatch) {
      const wi = WEEKDAY.indexOf(dmatch[1].toLowerCase());
      day = { label: wi >= 0 ? WD_SHORT[wi] : cap(dmatch[1]), meals: [] };
      days.push(day);
      meal = null;
      const prev = R[R.indexOf(r) - 1];
      if (!patientName && prev) patientName = text(prev);
      continue;
    }
    if (!day) continue;
    if (/^(Alternative alimentari|Alimenti assegnati nella settimana)/i.test(t)) { day = null; continue; }
    if (t === patientName || /^\d+ \/ \d+$/.test(t)) continue; // intestazione e numero di pagina
    if (/^Alimento\b/.test(t)) {
      qtyX = (r.find((i) => /Quantit/.test(i.s))?.x ?? 400) - 25;
      altX = (r.find((i) => /^Alt\.?$/.test(i.s))?.x ?? 480) - 10;
      continue;
    }
    if (/Elaborato da|Powered by/.test(t)) continue;
    if (/PROFILO NUTRIZIONALE/.test(t)) {
      {
        const idx = R.indexOf(r);
        const ass = R.slice(idx, idx + 4).map(text).find((x) => /^Apporti assegnati/.test(x));
        const n = ass?.match(/[\d.,]+/g)?.map((v) => parseFloat(v.replace(/\./g, '').replace(',', '.')));
        if (n && n.length >= 4) Object.assign(day, { kcal: n[3], protein: n[0], carbs: n[1], fat: n[2] });
      }
      day = null;
      continue;
    }
    const left = r.filter((i) => i.x < qtyX);
    const qty = r.filter((i) => i.x >= qtyX && i.x < altX);
    const alt = r.filter((i) => i.x >= altX).map((i) => i.s.trim()).join('');
    const ltxt = clean(left.map((i) => i.s).join(' '));
    // Intestazione pasto: riga centrata senza quantità.
    if (!qty.length && left.length && MEAL_RE.test(ltxt) && left[0].x > 150) {
      meal = { key: mealKey(ltxt), name: cap(ltxt), time: timeFor(ltxt), note: '', items: [] };
      day.meals.push(meal);
      lastHead = null;
      continue;
    }
    if (!meal || !ltxt) continue;
    const q = normQty(qty.map((i) => i.s).join(' '));
    const sub = /^\s*-\s+/.test(left[0]?.s ?? '');
    const f = ltxt.replace(/^-\s*/, '');
    if (!q) {
      // Piatto composto (es. "Pasta e ceci") seguito da ingredienti "- …".
      lastHead = { f, g: '', head: true, kind: 'dish' };
      meal.items.push(lastHead);
      continue;
    }
    const item: PlanItem = { f, g: q };
    if (sub && lastHead) item.sub = true;
    if (!sub) lastHead = null;
    if (alt && alts[alt]) {
      const list = alts[alt];
      const col = Math.max(0, list[0]?.q.findIndex((x) => x.replace(/\s/g, '') === q.replace(/\s/g, '')) ?? 0);
      item.alts = list.filter((a) => a.f.toLowerCase() !== f.toLowerCase()).map((a) => ({ f: a.f, g: a.q[col] ?? a.q[0] }));
    } else if (alt) warnings.push(`Alternative ${alt} (${f}) non trovate nel PDF`);
    if (!isQty(qty.map((i) => i.s).join(' '))) item.flag = true;
    meal.items.push(item);
  }

  // Apporti del singolo giorno dalla tabella "Apporti energetici", se mancano quelli assegnati nella pagina del giorno.
  days.forEach((d, i) => {
    const at = (k: string) => (macro[k]?.length === days.length ? macro[k][i] : undefined);
    const v = { kcal: at('Totale kcal'), protein: at('Protidi g'), carbs: at('Glucidi g'), fat: at('Lipidi g') };
    for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) if (v[k] != null && d[k] == null) d[k] = v[k]; // il profilo della pagina del giorno ha la precedenza
  });
  const avg = (k: string) => (macro[k]?.length ? Math.round(macro[k].reduce((a, b) => a + b, 0) / macro[k].length) : null);
  const plan: PlanData = {
    title: titleFromFile(fileName, patientName) || 'Piano alimentare',
    kcal: avg('Totale kcal'), protein: avg('Protidi g'), carbs: avg('Glucidi g'), fat: avg('Lipidi g'),
    notes: notesFromText(reflow(general.join('\n').split('\n'))),
    days,
  };
  if (!days.length) warnings.push('Nessuna pagina giornaliera trovata');
  return { plan, format: 'progeo', patientName, visit: visit.kg || visit.date ? visit : null, stats: countStats(plan), warnings };
}

// ---------------------------------------------------------------- parser generico per layout

const DAYTYPE_RE = /^(ON|OFF|RESET|LUNEDÌ|MARTEDÌ|MERCOLEDÌ|GIOVEDÌ|VENERDÌ|SABATO|DOMENICA|LUNEDI|MARTEDI|MERCOLEDI|GIOVEDI|VENERDI|GIORNO\s+[A-Z0-9]+|GIORNI?\s+ON|GIORNI?\s+OFF)$/i;
const isHeadingCaps = (s: string) => { const l = s.replace(/[^A-Za-zÀ-ÿ]/g, ''); return l.length >= 4 && l === l.toUpperCase(); };
const isGroup = (s: string) => /^(seleziona|aggiungi|scegli|a scelta|alternativ[ae]\s*:?$)/i.test(s);
const isNote = (s: string) => /^(nota|note)\b/i.test(s);

interface Seg { x: number; end: number; s: string; qty: boolean }
interface Line { y: number; page: number; text: string; qty: string; x: number }

function parseLayout(items: TextItem[], fileName: string): ImportResult {
  const warnings: string[] = [];
  const R = rows(items);
  const W = Math.max(...items.map((i) => i.x + i.w), 500);

  // Intestazione del documento: nome paziente dopo i due punti ("PIANO NUTRIZIONALE …: NOME COGNOME").
  let patientName: string | null = null;
  // Il nome può stare sulla stessa riga del titolo o sulla riga successiva.
  const heads = R.slice(0, 4).map((r) => clean(r.map((i) => i.s).join(' ')));
  for (let i = 0; i < heads.length && !patientName; i++) {
    const pm = /PIANO[^:]*:\s*([A-ZÀ-Ù' ]*)$/.exec(heads[i]);
    if (!pm) continue;
    const nm = pm[1].trim() || (/^[A-ZÀ-Ù' ]{3,}$/.test(heads[i + 1] ?? '') ? heads[i + 1] : '');
    if (nm) patientName = nm.split(/\s+/).map(cap).join(' ');
  }

  // Inizio della parte operativa: dopo "IL PIANO SEGUENTE…" (se presente), altrimenti dal primo pasto.
  const startIdx = (() => {
    const i = R.findIndex((r) => /IL PIANO SEGUENTE/i.test(r.map((x) => x.s).join(' ')));
    return i >= 0 ? i : R.findIndex((r) => MEAL_RE.test(clean(r.map((x) => x.s).join(' '))));
  })();
  if (startIdx < 0) {
    return { plan: { title: titleFromFile(fileName, patientName) || 'Piano alimentare', kcal: null, protein: null, carbs: null, fat: null, notes: [], days: [] }, format: 'layout', patientName, visit: null, stats: { days: 0, meals: 0, items: 0, flagged: 0 }, warnings: ['Nel PDF non ho trovato pasti riconoscibili (Colazione, Pranzo, Cena…).'] };
  }

  // Testo introduttivo → indicazioni generali (escluso l'esempio pratico).
  const intro: string[] = [];
  let example = false, keep = false;
  for (const r of R.slice(0, startIdx)) {
    const t = clean(segments(r).map((x) => x.s).join(' '));
    if (/ESEMPIO PRATICO/i.test(t)) example = true;
    // Dopo l'esempio pratico tiene solo la regola sulle grammature speciali e le note.
    if (example) {
      if (/^\*?Grammature speciali|^Note?\s*:/i.test(t)) { intro.push(t); keep = !/\.$/.test(t); continue; }
      if (keep && !isHeadingCaps(t)) { intro.push(t); keep = !/\.$/.test(t); continue; }
      keep = false;
      continue;
    }
    if (t.length < 12 && !/:$/.test(t) || isHeadingCaps(t) && t.length < 60) continue;
    intro.push(t);
  }

  type Col = { types: string[]; split: number[] };
  const dayMap = new Map<string, PlanDay>();
  const order: string[] = [];
  const dayOf = (label: string) => {
    if (!dayMap.has(label)) { dayMap.set(label, { label, meals: [] }); order.push(label); }
    return dayMap.get(label)!;
  };
  const notes: string[] = [];
  let mealName = '';
  let cols: Col = { types: ['Piano'], split: [] };
  // Blocchi raccolti per (tipo giorno) nel pasto corrente.
  let block: Record<string, Line[]> = {};
  // Un pasto può essere spezzato da intestazioni di colonna o note: le parti dello stesso pasto si uniscono.
  let section = 0;
  const sectionMeals = new Map<string, PlanMeal>();

  const flush = () => {
    if (!mealName) { block = {}; return; }
    for (const [key, lines] of Object.entries(block)) {
      if (!lines.length || key.endsWith('#2')) continue;
      const type = key;
      const day = dayOf(type);
      const id = section + '|' + type;
      let meal = sectionMeals.get(id);
      if (!meal) {
        meal = { key: mealKey(mealName), name: cap(mealName), time: timeFor(mealName), note: '', items: [] };
        sectionMeals.set(id, meal);
        day.meals.push(meal);
      }
      const m = meal;
      const addNote = (n: string) => { m.note = m.note ? m.note + ' ' + n : n; };
      const second = block[key + '#2'];
      if (second?.length) {
        // Due varianti affiancate: "Opzione 1" / "Opzione 2"
        const a = buildItems(lines, addNote), b = buildItems(second, addNote);
        m.items.push(...(a[0]?.head ? a : [{ f: 'Opzione 1', g: '', head: true, kind: 'variant' as const }, ...a]), ...(b[0]?.head ? b : [{ f: 'Opzione 2', g: '', head: true, kind: 'variant' as const }, ...b]));
      } else m.items.push(...buildItems(lines, addNote));
    }
    block = {};
  };

  const body = R.slice(startIdx);
  const onlyTypes = (r: TextItem[]) => r.every((i) => DAYTYPE_RE.test(i.s.trim()));
  for (let k = 0; k < body.length - 1; k++) {
    const a = body[k], b = body[k + 1];
    if (onlyTypes(a) && onlyTypes(b) && a[0].page === b[0].page && Math.abs(a[0].y - b[0].y) < 8) {
      body[k] = [...a, ...b].sort((x, y) => x.x - y.x);
      body.splice(k + 1, 1);
    }
  }
  for (const r of body) {
    const segs: Seg[] = segments(r).map((s) => ({ ...s, qty: isQty(s.s) }));
    const t = clean(segs.map((s) => s.s).join(' '));
    if (!t) continue;
    if (/IL PIANO SEGUENTE|GIORNI OFF, ON|^ORGANIZZATO IN/i.test(t)) continue;

    // Nuovo pasto
    const mm = MEAL_RE.exec(t);
    if (mm && segs.length === 1) {
      flush();
      mealName = mm[1];
      section++;
      cols.split = [];
      continue;
    }
    // Intestazione colonne: solo tipi di giorno (ON / OFF / RESET / giorni della settimana)
    if (segs.every((s) => DAYTYPE_RE.test(s.s.trim()))) {
      flush();
      const types = segs.map((s) => s.s.trim().toUpperCase().replace(/^GIORNI?\s+/, ''));
      const lab = types.map((x) => (WEEKDAY.includes(deaccent(x).replace(/i$/, 'ì').toLowerCase()) ? cap(x).slice(0, 3) : x));
      cols = { types: lab, split: [] };
      continue;
    }
    // Riga "GIORNI DI RESET : …" → la sezione successiva è RESET
    const rm = /^GIORNI DI (\w+)/i.exec(t);
    if (rm) { flush(); mealName = ''; cols = { types: [rm[1].toUpperCase()], split: [] }; continue; }
    if (!mealName) {
      // Note prima del primo pasto (anche su più righe)
      if (isNote(t)) notes.push(t.replace(/^(nota|note)\s*:?\s*/i, ''));
      else if (notes.length && !/[.;]$/.test(notes[notes.length - 1])) notes[notes.length - 1] += ' ' + t;
      continue;
    }

    // Assegna i segmenti alle colonne.
    const nCols = cols.types.length;
    const assign: Seg[][] = Array.from({ length: Math.max(2, nCols) }, () => []);
    if (nCols <= 1) {
      // Un solo tipo di giorno ma due colonne affiancate (testo+quantità | testo+quantità) = due varianti del pasto.
      for (let i = 1; i < segs.length; i++) if (segs[i - 1].qty && !segs[i].qty && segs.slice(i + 1).some((x) => x.qty)) cols.split.push(segs[i].x);
      const split = cols.split.length ? median(cols.split) : Infinity;
      segs.forEach((sg) => assign[sg.x >= split - 4 ? 1 : 0].push(sg));
    } else {
      // Il confine della colonna destra è l'inizio del testo che segue una quantità sulla stessa riga.
      for (let i = 1; i < segs.length; i++) if (segs[i - 1].qty && !segs[i].qty) cols.split.push(segs[i].x);
      const split = cols.split.length ? median(cols.split.slice(-12)) : W / 2;
      segs.forEach((s, i) => {
        let c = s.x >= split - 4 ? 1 : 0;
        // Intestazioni ripetute nelle due colonne (es. "Seleziona…" a x diversi).
        if (!s.qty && i > 0 && segs.length >= 2 && s.x > segs[0].x + 150 && !segs[i - 1].qty) c = 1;
        assign[Math.min(c, nCols - 1)].push(s);
      });
    }
    assign.forEach((cs, ci) => {
      if (!cs.length) return;
      const type = nCols <= 1 ? cols.types[0] + (ci ? '#2' : '') : cols.types[ci] ?? cols.types[0];
      const txt = clean(cs.filter((s) => !s.qty).map((s) => s.s).join(' '));
      const q = cs.filter((s) => s.qty).map((s) => s.s).join(' ');
      (block[type] ??= []).push({ y: r[0].y, page: r[0].page, text: txt, qty: q ? normQty(q) : '', x: cs[0].x });
    });
  }
  flush();

  // Colonna destra con quantità ma senza testo (es. "Contorno a scelta … 200g | 200g"): usa il testo della sinistra.
  const days = order.map((k) => dayMap.get(k)!);
  for (const d of days) for (const m of d.meals) for (const it of m.items) if (!it.f && it.g) {
    const twin = days.flatMap((x) => x.meals).filter((x) => x.key === m.key).flatMap((x) => x.items).find((x) => x.f && x !== it && (x as any)._y === (it as any)._y);
    it.f = twin?.f ?? 'Alimento a scelta';
    if (!twin) it.flag = true;
  }
  for (const d of days) for (const m of d.meals) for (const it of m.items) delete (it as any)._y;

  const plan: PlanData = {
    title: titleFromFile(fileName, patientName) || 'Piano alimentare',
    kcal: null, protein: null, carbs: null, fat: null,
    // L'introduzione si divide in sezioni; le note sparse tra i pasti restano sezioni a sé.
    notes: [...notesFromText(reflow(intro)), ...notes.flatMap(notesFromText)],
    days,
  };
  if (!days.length) warnings.push('Nessun pasto riconosciuto: controlla il PDF.');
  return { plan, format: 'layout', patientName, visit: null, stats: countStats(plan), warnings };
}

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Ricompone in paragrafi le righe di testo spezzate dal layout del PDF (le intestazioni "Xxx:" iniziano un paragrafo). */
export function reflow(lines: string[]) {
  const paras: string[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    const head = /^[A-ZÀ-Ù][^.]{1,40}:$/.test(l);
    const prev = paras[paras.length - 1];
    if (!prev || head || /^(\*|legenda\b|(ON|OFF|RESET)\s*\()/i.test(l) || /:$/.test(prev) && /^[A-ZÀ-Ù]/.test(l) && prev.length < 45 || /^[-•\d]+[).]?\s/.test(l)) paras.push(l);
    else paras[paras.length - 1] = /\w-$/.test(prev) ? prev.slice(0, -1) + l : prev + ' ' + l;
  }
  return paras.join('\n');
}

function median(a: number[]) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

/** Da righe (testo + quantità) a voci del pasto: varianti, gruppi "a scelta", righe a capo, note. */
function buildItems(lines: Line[], addNote: (n: string) => void): PlanItem[] {
  const out: (PlanItem & { _y?: number })[] = [];
  let last: (PlanItem & { _y?: number }) | null = null;
  let lastY = -1, inNote = false;
  let group: { gaps: number[]; n: number } | null = null;
  const capsStart = (t: string) => isHeadingCaps(t.split(/\s+/).slice(0, 2).join(' '));
  for (const l of lines) {
    const t = l.text;
    if (isNote(t)) { addNote(t.replace(/^(nota|note)\s*:?\s*/i, '')); last = null; inNote = true; continue; }
    if (inNote && !l.qty && t && !isGroup(t) && !capsStart(t)) { addNote(t); continue; }
    inNote = false;
    if (!l.qty) {
      if (!t) continue;
      if (/^\(/.test(t) && last?.head) { last.f += ' ' + t; continue; }           // "(PREALLENAMENTO)"
      if (last?.head && !isGroup(last.f) && l.y - lastY < 14 && (isHeadingCaps(t) || t.length < 26)) { last.f = clean(last.f + ' ' + t); lastY = l.y; continue; } // titolo su due righe
      if (isHeadingCaps(t) || capsStart(t) || isGroup(t)) {
        last = { f: clean(t.replace(/:$/, '')), g: '', head: true, kind: isGroup(t) ? 'choice' : 'variant' };
        group = last.kind === 'choice' ? { gaps: [], n: 0 } : null;
        out.push(last);
        lastY = l.y;
        continue;
      }
      // Riga a capo del nome precedente (o quantità sulla riga sotto)
      if (last && !last.head && l.y - lastY < 16) {
        // "sca-" + "glie" → "scaglie"; "nocciole-mandorle-" + "arachidi" → trattino mantenuto (elenco di parole)
        const keepDash = /-[^\s-]+-$/.test(last.f);
        last.f = /-$/.test(last.f) || /\/[a-z]{1,2}$/.test(last.f) ? (keepDash ? last.f : last.f.replace(/-$/, '')) + t : last.f + (/^[a-zà-ù(]/.test(t) ? ' ' : ' / ') + t;
        lastY = l.y;
        continue;
      }
      if (t.length > 70) { addNote(t); continue; }
      last = { f: t, g: '', flag: true, _y: Math.round(l.page * 10000 + l.y) };                          // senza quantità: da verificare
      out.push(last);
      lastY = l.y;
      continue;
    }
    // Quantità su una riga a sé che completa la precedente ("330/300/" + "200g")
    if (!t && last && /\/$/.test(last.g)) { last.g += l.qty; lastY = l.y; continue; }
    if (!t && last && !last.g && !last.head) { last.g = l.qty; delete last.flag; lastY = l.y; continue; }
    // Nome iniziato sulla riga sopra (senza quantità) e concluso qui: "Crema … /cocco" + "a scaglie … 10 g"
    if (t && last && !last.head && !last.g && last.flag && /^[a-zà-ù]/.test(t) && l.y - lastY < 16) {
      last.f = clean(last.f + ' ' + t); last.g = l.qty; delete last.flag; lastY = l.y; continue;
    }
    // Voce spezzata con due quantità ("tacchino-" 150 g / "pollo bresaola" 120 g)
    if (t && last && /-$/.test(last.f) && last.g && /^[a-zà-ù]/.test(t) && l.y - lastY < 16) {
      last.f = last.f.slice(0, -1) + '-' + t; last.g = last.g.replace(/\s*(g|ml)$/, '') + '/' + l.qty; lastY = l.y; continue;
    }
    // Fine di un gruppo "scegli tra": spazio verticale più ampio o voci come contorno/condimento → parte fissa del pasto.
    // (una riga con sola quantità dopo il gruppo è la parte fissa: il testo è nella colonna accanto)
    if (group) {
      const gap = l.y - lastY, med = group.gaps.length ? median(group.gaps) : 18;
      if (group.n >= 2 && (!t || gap > Math.max(26, med * 1.6) || /^(contorno|olio|condimento|verdur)/i.test(t))) {
        out.push({ f: 'In aggiunta', g: '', head: true, kind: 'fixed' });
        group = null;
      } else { if (group.n) group.gaps.push(gap); group.n++; }
    }
    last = { f: t, g: l.qty, _y: Math.round(l.page * 10000 + l.y) };
    out.push(last);
    lastY = l.y;
  }
  // Pulizia: gruppi vuoti in coda
  while (out.length && out[out.length - 1].head) out.pop();
  return out;
}
