import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import * as repo from '../../db/repo';
import type { Patient, Plan, PlanData } from '../../db/types';
import { cx, Field, Modal, ModalHeader } from '../../components/ui';
import { DayMacros, DayTabs, MealsGrid } from './PlanGrid';
import { extractText, parsePlanText } from '../../lib/pdfImport';
import { ShareModal } from './ShareModal';
import { PhonePreview } from './PhonePreview';
import { fmtDate, fmtShort, parseIso } from '../../lib/format';
import { b64ToBytes, bytesToB64 } from '../../lib/pdf';
import { openPdf, readFileAsBytes } from '../../lib/platform';

const MAX_MB = 20;

export function DietTab({ patient, plans }: { patient: Patient; plans: Plan[] }) {
  const { bump, toast, confirm } = useApp();
  const draft = plans.find((p) => p.status === 'draft');
  const active = plans.find((p) => p.status === 'published');
  const [viewing, setViewing] = useState<Plan | null>(null);
  const [share, setShare] = useState(false);
  const [preview, setPreview] = useState(false);
  const [importing, setImporting] = useState<{ name: string; step: number } | null>(null);

  const [chooser, setChooser] = useState(false);
  const startDraft = async (file: File | null, from?: Plan, kind?: repo.PlanKind) => {
    let pdf: repo.PlanPdf = null;
    let data: PlanData | null = null;
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toast('Il file deve essere un PDF'); return; }
      if (file.size > MAX_MB * 1024 * 1024) { toast(`Il PDF supera i ${MAX_MB} MB`); return; }
      const bytes = await readFileAsBytes(file);
      pdf = { file: { name: file.name, b64: bytesToB64(bytes) } };
      data = await digitize(bytes, file.name);
    } else if (from?.has_pdf) {
      // Stesso PDF della versione di partenza: il documento è condiviso, non duplicato.
      pdf = { fromPlanId: from.id };
    }
    const base = from ?? active;
    if (!data) data = kind ? repo.emptyPlanData(kind) : base ? structuredClone(base.data) : repo.emptyPlanData();
    if (from || !file) delete data.import;
    await repo.createPlan(patient.id, data, pdf);
    setViewing(null);
    bump();
  };

  /** Lettura del PDF: testo → giorni e pasti → alimenti e grammature. Restituisce null se non riconosciuto. */
  const digitize = async (bytes: Uint8Array, name: string): Promise<PlanData | null> => {
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setImporting({ name, step: 0 });
    try {
      await pause(250);
      setImporting({ name, step: 1 });
      const items = await extractText(bytes);
      if (!items.length) { toast('Il PDF non contiene testo leggibile (forse è una scansione): trascrivi il piano a mano'); return null; }
      setImporting({ name, step: 2 });
      await pause(300);
      const r = parsePlanText(items, name);
      setImporting({ name, step: 3 });
      await pause(350);
      if (!r.plan.days.length) { toast(r.warnings[0] ?? 'Formato del piano non riconosciuto: trascrivilo a mano'); return null; }
      return { ...r.plan, import: { file: name, format: r.format, patientName: r.patientName, visit: r.visit, stats: r.stats, warnings: r.warnings } };
    } catch (e) {
      console.error(e);
      toast('Non sono riuscito a leggere il PDF: trascrivi il piano a mano');
      return null;
    } finally {
      setImporting(null);
    }
  };

  if (importing) return <Digitizing name={importing.name} step={importing.step} />;

  if (draft && !viewing) return <>
    <DraftEditor key={draft.id} patient={patient} draft={draft} active={active} onPublished={() => setShare(true)} onPreview={() => setPreview(true)} onReplacePdf={startDraft} />
    {share && <ShareModal patient={patient} onClose={() => setShare(false)} />}
    {preview && <PhonePreview patient={patient} plan={draft} onClose={() => setPreview(false)} />}
  </>;

  if (viewing) return <>
    <PlanViewer plan={viewing} isActive={viewing.id === active?.id} onBack={() => setViewing(null)} onPreview={() => setPreview(true)} onShare={() => setShare(true)}
      onEdit={async () => {
        if (draft && !(await confirm({ title: 'Sostituire la bozza esistente?', body: 'Esiste già una bozza non pubblicata: verrà sostituita da una copia di questa versione.', ok: 'Sostituisci' }))) return;
        await startDraft(null, viewing);
      }} />
    {share && <ShareModal patient={patient} onClose={() => setShare(false)} />}
    {preview && <PhonePreview patient={patient} plan={viewing} onClose={() => setPreview(false)} />}
  </>;

  return <>
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] gap-5 items-start">
      <DropZone onFile={(f) => startDraft(f)} onEmpty={() => setChooser(true)} hasActive={!!active} />
      <div className="flex flex-col gap-5">
        {active && (
          <div className="card px-5 py-[18px] flex flex-col gap-3">
            <div className="flex justify-between items-center"><div className="font-semibold text-[15px]">Piano attivo</div>{patient.link_on ? <span className="pill-ok py-0.5 px-2">Link attivo</span> : <span className="pill-neutral py-0.5 px-2">Link revocato</span>}</div>
            <div className="text-[13px] text-ink2">{[`v${active.version}`, active.data.title, active.data.kcal && active.data.kcal.toLocaleString('it-IT') + ' kcal'].filter(Boolean).join(' · ')} · dal {fmtDate(active.published_at ?? active.created_at)}</div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary py-[9px]" onClick={() => setViewing(active)}>Visualizza</button>
              <button className="btn-secondary py-[9px]" onClick={() => setPreview(true)}>Anteprima app</button>
              <button className="btn-secondary py-[9px]" onClick={() => setShare(true)}>Condividi</button>
              <button className="btn-secondary py-[9px]" onClick={() => startDraft(null, active)}>Modifica</button>
            </div>
          </div>
        )}
        <div className="card px-5 py-[18px] flex flex-col gap-3">
          <div className="font-semibold text-[15px]">Come funziona</div>
          {['Carica il PDF che già usi in studio', 'Verifica il piano strutturato (campi incerti evidenziati)', 'Genera il link personale e invialo su WhatsApp o email'].map((t, i) => (
            <div key={i} className="flex gap-2.5"><span className="font-mono text-xs font-semibold text-accent">0{i + 1}</span><span className="text-[13px]">{t}</span></div>
          ))}
        </div>
        <div className="card px-5 py-[18px] flex flex-col gap-2">
          <div className="font-semibold text-[15px]">Versioni precedenti</div>
          {plans.filter((p) => p.status !== 'draft').map((p) => (
            <button key={p.id} onClick={() => setViewing(p)} className={cx('flex justify-between text-[13px] py-1.5 border-0 border-t border-line2 bg-transparent text-left hover:text-accent', p.status !== 'published' && 'text-label')}>
              <span>v{p.version} · {[p.data.title, p.data.kcal && p.data.kcal.toLocaleString('it-IT') + ' kcal'].filter(Boolean).join(' ')}</span>
              {p.status === 'published' ? <span className="text-ok font-semibold text-xs">Attivo</span> : <span className="text-xs">{fmtShort(p.published_at ?? p.created_at)}</span>}
            </button>
          ))}
          {!plans.some((p) => p.status !== 'draft') && <div className="text-[13px] text-label">Nessuna versione pubblicata.</div>}
        </div>
      </div>
    </div>
    {chooser && <PlanKindModal active={active} onClose={() => setChooser(false)} onPick={(k) => { setChooser(false); k === 'copy' ? startDraft(null, active) : startDraft(null, undefined, k); }} />}
    {share && <ShareModal patient={patient} onClose={() => setShare(false)} />}
    {preview && active && <PhonePreview patient={patient} plan={active} onClose={() => setPreview(false)} />}
  </>;
}

/** Scelta della tipologia quando si crea un piano senza PDF. */
function PlanKindModal({ active, onClose, onPick }: { active?: Plan; onClose: () => void; onPick: (k: repo.PlanKind | 'copy') => void }) {
  const [k, setK] = useState<repo.PlanKind | 'copy'>('weekly');
  const opts: { id: repo.PlanKind | 'copy'; title: string; body: string; tags: string[] }[] = [
    { id: 'weekly', title: 'Classico settimanale', body: 'Un menu per ogni giorno, da lunedì a domenica, con colazione, spuntino, pranzo, merenda e cena.', tags: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] },
    { id: 'onoff', title: 'Flessibile ON / OFF / RESET', body: 'Giorni tipo: allenamento (ON), riposo (OFF) e recupero dopo un pasto libero (RESET). Pasti a opzioni e gruppi "scegli 1 tra".', tags: ['ON', 'OFF', 'RESET'] },
    ...(active ? [{ id: 'copy' as const, title: `Parti dal piano attivo (v${active.version})`, body: 'Copia struttura e alimenti della versione attiva e modifica solo ciò che cambia.', tags: active.data.days.map((d) => d.label) }] : []),
  ];
  return (
    <Modal onClose={onClose} width={560}>
      <ModalHeader title="Nuovo piano nutrizionale" sub="Scegli la tipologia di dieta: potrai comunque modificare giorni e pasti." onClose={onClose} />
      <div className="flex flex-col gap-2.5" role="radiogroup">
        {opts.map((o) => (
          <button key={o.id} role="radio" aria-checked={k === o.id} onClick={() => setK(o.id)} onDoubleClick={() => onPick(o.id)}
            className={cx('text-left rounded-xl p-4 flex gap-3 items-start', k === o.id ? 'border-[1.5px] border-primary bg-tint2' : 'border border-ctl bg-surface hover:border-sage-500')}>
            <span className={cx('w-[18px] h-[18px] rounded-full flex-none mt-0.5 grid place-items-center', k === o.id ? 'border-[5px] border-primary bg-surface' : 'border-[1.5px] border-ctl')} />
            <span className="flex-1 min-w-0 flex flex-col gap-1.5">
              <span className={cx('font-semibold text-[14.5px]', k === o.id && 'text-strong')}>{o.title}</span>
              <span className="text-[13px] text-muted leading-snug">{o.body}</span>
              <span className="flex gap-1 flex-wrap">{o.tags.map((t) => <span key={t} className="font-mono text-[11px] font-medium px-1.5 py-px rounded-[5px] bg-sunken text-label">{t}</span>)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2.5">
        <button className="btn-secondary px-4" onClick={onClose}>Annulla</button>
        <button className="btn-primary px-[18px]" onClick={() => onPick(k)} autoFocus>Crea bozza</button>
      </div>
    </Modal>
  );
}

function DropZone({ onFile, onEmpty, hasActive }: { onFile: (f: File) => void; onEmpty: () => void; hasActive: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      onClick={() => input.current?.click()} className="cursor-pointer">
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {over ? (
        <div className="border-2 border-dashed border-primary bg-tint2 rounded-[18px] min-h-[340px] flex flex-col items-center justify-center gap-2.5 text-center">
          <div className="text-lg font-semibold text-strong">Rilascia per caricare il PDF</div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-ctl bg-surface rounded-[18px] min-h-[340px] flex flex-col items-center justify-center gap-3 text-center p-8 hover:border-sage-500 hover:bg-surface2">
          <div className="w-14 h-[68px] rounded-lg border-[1.5px] border-ctl bg-tint grid place-items-end justify-center pb-2 font-mono text-[11px] font-semibold text-accent">PDF</div>
          <div className="text-lg font-semibold">Trascina qui il PDF della dieta</div>
          <div className="text-muted max-w-[380px] [text-wrap:pretty]">Riconosciamo giorni, pasti, alimenti e grammature. Potrai verificare tutto prima di inviarlo.</div>
          <div className="flex gap-2 mt-1.5">
            <span className="btn-primary px-3.5 py-[9px]">Scegli file</span>
            <button onClick={(e) => { e.stopPropagation(); onEmpty(); }} className="btn-secondary py-[9px]">{hasActive ? 'Nuovo piano senza PDF' : 'Inizia senza PDF'}</button>
          </div>
          <div className="font-mono text-[11px] text-subtle">PDF · max {MAX_MB} MB · anche scansioni</div>
        </div>
      )}
    </div>
  );
}

function usePdfUrl(planId: number, has: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!has) { setUrl(null); return; }
    let u: string | null = null;
    repo.getPlanPdf(planId).then((b) => { if (b) { u = URL.createObjectURL(new Blob([b64ToBytes(b)], { type: 'application/pdf' })); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [planId, has]);
  return url;
}

async function openOriginal(plan: Plan) {
  const b = await repo.getPlanPdf(plan.id);
  if (b) await openPdf(plan.pdf_name || 'piano.pdf', b64ToBytes(b));
}

function DraftEditor({ patient, draft, active, onPublished, onPreview, onReplacePdf }: { patient: Patient; draft: Plan; active?: Plan; onPublished: () => void; onPreview: () => void; onReplacePdf: (f: File) => void }) {
  const { bump, toast, confirm, setGuard } = useApp();
  const [plan, setPlan] = useState<PlanData>(draft.data);
  const [day, setDay] = useState(0);
  const [saved, setSaved] = useState(true);
  // Il PDF affiancato parte aperto solo se la finestra è abbastanza larga.
  const [showPdf, setShowPdf] = useState(draft.has_pdf && window.innerWidth >= 1600);
  const pdfUrl = usePdfUrl(draft.id, draft.has_pdf);
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef(plan);
  latest.current = plan;

  const flush = async () => { clearTimeout(timer.current); await repo.savePlanData(draft.id, latest.current); setSaved(true); setGuard(null); };
  const change = (p: PlanData) => {
    setPlan(p); setSaved(false);
    setGuard('Alcune modifiche al piano non sono ancora state salvate.');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  useEffect(() => () => { clearTimeout(timer.current); repo.savePlanData(draft.id, latest.current); setGuard(null); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush().then(() => toast('Bozza salvata')); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const meals = plan.days[0]?.meals.length ?? 0;
  const flagged = plan.days.reduce((a, d) => a + d.meals.reduce((b, m) => b + m.items.filter((i) => i.flag).length, 0), 0);
  const items = plan.days.reduce((a, d) => a + d.meals.reduce((b, m) => b + m.items.filter((i) => i.f.trim() && !i.head).length, 0), 0);
  const emptyDays = plan.days.filter((d) => !d.meals.some((m) => m.items.some((i) => i.f.trim()))).map((d) => d.label);
  const macro = (g: number | null, k: number) => (g && plan.kcal ? ` · ${Math.round((g * k * 100) / plan.kcal)}%` : '');
  const setNum = (k: 'kcal' | 'protein' | 'carbs' | 'fat', v: string) => change({ ...plan, [k]: v ? parseInt(v.replace(/\D/g, '')) || null : null });

  const publish = async () => {
    if (!items) { toast('Il piano è vuoto: aggiungi almeno un alimento'); return; }
    if (flagged && !(await confirm({ title: `${flagged} ${flagged === 1 ? 'campo' : 'campi'} da verificare`, body: 'Alcune grammature sono segnate come da verificare. Vuoi pubblicare comunque?', ok: 'Pubblica comunque' }))) return;
    if (emptyDays.length && !(await confirm({ title: 'Giorni senza alimenti', body: `${emptyDays.join(', ')}: nessun alimento inserito. Pubblicare comunque?`, ok: 'Pubblica comunque' }))) return;
    await flush();
    await repo.publishPlan(draft.id);
    bump();
    toast(`Piano v${draft.version} pubblicato`);
    onPublished();
  };
  const copyDay = (to: number | 'all') => {
    const src = plan.days[day];
    change({ ...plan, days: plan.days.map((d, i) => (i === day || (to !== 'all' && i !== to) ? d : { ...d, meals: structuredClone(src.meals) })) });
    toast(to === 'all' ? `${src.label} copiato su tutti i giorni` : `${src.label} copiato su ${plan.days[to].label}`);
  };
  const discard = async () => {
    if (await confirm({ title: 'Eliminare la bozza?', body: 'Le modifiche non pubblicate andranno perse. La versione attiva resta invariata.', ok: 'Elimina bozza', danger: true })) {
      clearTimeout(timer.current); setGuard(null);
      await repo.deletePlan(draft.id);
      bump();
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
      {plan.import && <ImportBanner patient={patient} plan={plan} onClose={() => { const { import: _, ...rest } = plan; change(rest as PlanData); }} />}
      <div className={cx('grid gap-4 min-w-0', showPdf && pdfUrl ? 'grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]' : 'grid-cols-1')}>
        {showPdf && pdfUrl && (
          <div className="card overflow-hidden sticky top-5 h-[calc(100vh-120px)] min-h-[480px] flex flex-col">
            <div className="px-4 py-2.5 border-b border-line2 flex justify-between items-center text-[13px]"><span className="font-mono text-xs text-label truncate">{draft.pdf_name}</span><button className="link-btn" onClick={() => openOriginal(draft)}>Apri ↗</button></div>
            <iframe title="PDF originale" src={pdfUrl + '#toolbar=0&view=FitH'} className="flex-1 w-full border-0 bg-sunken" />
          </div>
        )}
        <div className="card overflow-hidden min-w-0">
          <div className="px-[22px] py-[18px] flex justify-between items-center gap-3 flex-wrap border-b border-line2">
            <div>
              <div className="font-semibold text-base">Piano in preparazione · bozza v{draft.version}</div>
              <div className="text-xs text-label">{[draft.pdf_name, plan.days.length + (plan.days.length === 1 ? ' giorno' : ' giorni'), meals + ' pasti/giorno'].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-label">{saved ? 'Salvato' : 'Salvataggio…'}</span>
              <span className="pill-ok">{items} alimenti</span>
              {flagged > 0 && <span className="pill-warn">{flagged} da verificare</span>}
            </div>
          </div>
          <DayTabs plan={plan} day={day} setDay={setDay} />
          <DayMacros plan={plan} day={day} />
          <div className="flex gap-2 items-center px-[22px] pt-3.5 text-[13px] flex-wrap">
            {draft.has_pdf && <button className="btn-secondary py-1.5 text-[12.5px]" onClick={() => setShowPdf(!showPdf)}>{showPdf ? 'Nascondi PDF' : 'Mostra PDF'}</button>}
            <select className="field py-1.5 text-[12.5px]" value="" onChange={(e) => { const v = e.target.value; if (v) copyDay(v === 'all' ? 'all' : +v); }} aria-label="Copia giorno">
              <option value="">Copia {plan.days[day].label} su…</option>
              {plan.days.map((d, i) => i !== day && <option key={i} value={i}>{d.label}</option>)}
              <option value="all">Tutti gli altri giorni</option>
            </select>
            {active && !plan.import && <span className="text-xs text-label ml-auto">Partito dalla v{active.version}: modifica solo ciò che cambia</span>}
          </div>
          <MealsGrid plan={plan} day={day} onChange={change} />
        </div>
      </div>

      <div className="sticky top-5 flex flex-col gap-3.5">
        <div className="bg-[#0F3B40] text-white rounded-card p-5 flex flex-col gap-3">
          <div className="font-mono text-[11px] font-medium tracking-[.06em] uppercase text-sage-400">Pronto per {patient.first}</div>
          <div className="text-[17px] font-semibold leading-[1.3] [text-wrap:pretty]">Il piano sarà visibile nell'app paziente, insieme al PDF originale.</div>
          <button onClick={publish} className="py-3 px-3.5 rounded-[11px] border-0 bg-sage-400 text-[#0F3B40] font-bold text-sm hover:bg-[#BFD6C5]">Genera e Condividi Link Paziente</button>
          <div className="text-xs text-sage-400">{active ? `Sostituisce la v${active.version} · il link resta lo stesso` : 'Prima versione · crea il link personale'}</div>
        </div>
        <div className="card px-[18px] py-4 flex flex-col gap-2.5 text-[13px]">
          <Field label="Titolo"><input className="field py-2" value={plan.title} placeholder="Es. Ricomposizione" onChange={(e) => change({ ...plan, title: e.target.value })} /></Field>
          {([['kcal', 'Energia media', 'kcal', 0], ['protein', 'Proteine', 'g', 4], ['carbs', 'Carboidrati', 'g', 4], ['fat', 'Grassi', 'g', 9]] as const).map(([k, l, u, f]) => (
            <div key={k} className="flex justify-between items-center gap-2">
              <span className="text-label">{l}</span>
              <span className="flex items-center gap-1.5 font-semibold">
                <input inputMode="numeric" value={plan[k] ?? ''} onChange={(e) => setNum(k, e.target.value)} className="w-16 text-right bg-transparent border border-transparent hover:border-line focus:border-primary rounded-[5px] outline-none px-1" placeholder="—" aria-label={l} />
                <span className="font-normal text-label w-[70px]">{u}{f ? macro(plan[k], f) : ''}</span>
              </span>
            </div>
          ))}
          <Field label="Indicazioni generali"><textarea rows={plan.general.length > 200 ? 8 : 3} className="field py-2 resize-y text-[13px]" value={plan.general} onChange={(e) => change({ ...plan, general: e.target.value })} placeholder="Acqua, cotture, pasti liberi…" /></Field>
        </div>
        <button className="btn-secondary" onClick={async () => { await flush(); onPreview(); }}>Anteprima app paziente</button>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplacePdf(f); e.target.value = ''; }} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={() => fileInput.current?.click()}>Carica un altro PDF</button>
          <button className="btn-secondary !text-err" onClick={discard}>Elimina bozza</button>
        </div>
      </div>
    </div>
  );
}

/** Schermata "Digitalizzazione in corso…" (dal design), con i passi reali della lettura. */
function Digitizing({ name, step }: { name: string; step: number }) {
  const STEPS = ['Caricamento PDF', 'Riconoscimento testo', 'Struttura giorni e pasti', 'Estrazione alimenti e grammature'];
  return (
    <div className="card rounded-[18px] p-8 grid grid-cols-[200px_1fr] gap-8 items-center max-w-[860px]">
      <div className="w-[200px] h-[250px] rounded-[10px] border border-line relative overflow-hidden grid place-items-center" style={{ background: 'repeating-linear-gradient(0deg, rgb(var(--canvas)) 0 10px, rgb(var(--surface)) 10px 20px)' }}>
        <span className="font-mono text-[11px] font-medium text-subtle bg-surface px-1.5 py-[3px] rounded">anteprima pagina 1</span>
        <div className="absolute left-0 right-0 h-0.5 bg-[#2F7A7D] shadow-[0_0_12px_4px_rgba(47,122,125,.35)] animate-[scan_1.6s_ease-in-out_infinite_alternate]" />
      </div>
      <div className="flex flex-col gap-4">
        <div><div className="font-mono text-xs text-label truncate">{name}</div><div className="text-xl font-semibold mt-0.5">Digitalizzazione in corso…</div></div>
        <div className="h-1.5 rounded-[3px] bg-line2 overflow-hidden"><div className="h-full bg-primary rounded-[3px] transition-[width] duration-700 ease-out" style={{ width: Math.min(100, step * 25 + 8) + '%' }} /></div>
        <div className="flex flex-col gap-2.5">
          {STEPS.map((l, i) => (
            <div key={l} className="flex items-center gap-2.5 text-sm">
              {i < step ? <><span className="w-5 h-5 rounded-full bg-ok-bg text-ok grid place-items-center text-xs font-bold">✓</span><span className="text-ink2">{l}</span></>
                : i === step ? <><span className="w-5 h-5 rounded-full border-2 border-line border-t-primary animate-[spin_.8s_linear_infinite]" /><span className="font-semibold">{l}</span></>
                  : <><span className="w-5 h-5 rounded-full border-2 border-line" /><span className="text-subtle">{l}</span></>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Riepilogo della lettura del PDF nell'editor: cosa è stato letto, avvisi, visita da registrare. */
function ImportBanner({ patient, plan, onClose }: { patient: Patient; plan: PlanData; onClose: () => void }) {
  const { bump, toast } = useApp();
  const imp = plan.import!;
  const [added, setAdded] = useState(false);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const other = imp.patientName && !norm(imp.patientName).includes(norm(patient.last).slice(0, 5)) ? imp.patientName : null;
  const v = imp.visit;
  const addVisit = async () => {
    if (!v?.date) return;
    const existing = await repo.listVisits(patient.id);
    if (existing.some((x) => x.date === v.date)) { toast('Esiste già una visita in quella data'); setAdded(true); return; }
    await repo.addVisit({ patient_id: patient.id, date: v.date, type: 'Visita', kg: v.kg, fat: null, vita: null, fianchi: null, torace: null, braccio: null, coscia: null, polso: null, note: `Dati letti dal piano "${imp.file}".`, goal: plan.title || null });
    if (v.height && !patient.height) await repo.updatePatient(patient.id, { height: v.height });
    setAdded(true);
    bump();
    toast('Visita aggiunta alla cartella');
  };
  return (
    <div className="col-span-2 rounded-card border border-sage-400 bg-tint px-5 py-3.5 flex items-start gap-4">
      <span className="w-8 h-8 rounded-full bg-ok-bg text-ok grid place-items-center font-bold flex-none mt-0.5">✓</span>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 text-[13px]">
        <div className="text-[14.5px] font-semibold">Piano letto dal PDF{imp.format === 'progeo' ? ' (Progeo Medical)' : ''}</div>
        <div className="text-ink2">
          {imp.stats.days} {imp.stats.days === 1 ? 'giorno' : 'giorni'} · {imp.stats.meals} pasti · {imp.stats.items} alimenti
          {imp.stats.flagged ? <> · <span className="text-warn font-semibold">{imp.stats.flagged} da verificare</span> (evidenziati in ambra)</> : ' · nessun campo incerto'}
          {plan.days.some((d) => d.meals.some((m) => m.items.some((i) => i.alts?.length))) && ' · alternative incluse'}
        </div>
        {other && <div className="text-warn">Attenzione: il PDF è intestato a <b>{other}</b>, non a {patient.first} {patient.last}.</div>}
        {imp.warnings.map((w, i) => <div key={i} className="text-warn">{w}</div>)}
        {v?.date && (
          <div className="flex items-center gap-3 pt-0.5">
            <span className="text-ink2">Nel PDF c'è anche la visita del {parseIso(v.date).toLocaleDateString('it-IT')}{v.kg ? ` · ${String(v.kg).replace('.', ',')} kg` : ''}{v.height ? ` · ${v.height} cm` : ''}.</span>
            {added ? <span className="text-ok font-semibold">Aggiunta ✓</span> : <button className="link-btn" onClick={addVisit}>Aggiungi alla cartella</button>}
          </div>
        )}
      </div>
      <button className="btn-x !w-7 !h-7 flex-none" onClick={onClose} title="Chiudi riepilogo" aria-label="Chiudi riepilogo">×</button>
    </div>
  );
}

function PlanViewer({ plan, isActive, onBack, onEdit, onPreview, onShare }: { plan: Plan; isActive: boolean; onBack: () => void; onEdit: () => void; onPreview: () => void; onShare: () => void }) {
  const [day, setDay] = useState(0);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
      <div className="card overflow-hidden min-w-0">
        <div className="px-[22px] py-[18px] flex justify-between items-center gap-3 border-b border-line2">
          <div>
            <div className="font-semibold text-base">v{plan.version}{plan.data.title ? ' · ' + plan.data.title : ''}</div>
            <div className="text-xs text-label">{plan.status === 'published' ? 'Attivo dal ' : 'Pubblicato il '}{fmtDate(plan.published_at ?? plan.created_at)}{plan.pdf_name ? ' · ' + plan.pdf_name : ''}</div>
          </div>
          {isActive ? <span className="pill-ok">Attivo</span> : <span className="pill-neutral">Archiviato</span>}
        </div>
        <DayTabs plan={plan.data} day={day} setDay={setDay} />
        <DayMacros plan={plan.data} day={day} />
        <MealsGrid plan={plan.data} day={day} />
      </div>
      <div className="sticky top-5 flex flex-col gap-2.5">
        <button className="btn-secondary" onClick={onBack}>← Torna al piano</button>
        <button className="btn-primary" onClick={onEdit}>{isActive ? 'Modifica come nuova versione' : 'Ripristina come nuova versione'}</button>
        {plan.has_pdf && <button className="btn-secondary" onClick={() => openOriginal(plan)}>Apri PDF originale</button>}
        {isActive && <><button className="btn-secondary" onClick={onPreview}>Anteprima app paziente</button><button className="btn-secondary" onClick={onShare}>Condividi</button></>}
        {plan.data.general && <div className="card px-4 py-3 text-[13px] text-ink2"><div className="label mb-1">Indicazioni generali</div>{plan.data.general}</div>}
      </div>
    </div>
  );
}

