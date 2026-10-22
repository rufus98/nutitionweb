import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import * as repo from '../../db/repo';
import type { Patient, Plan, PlanData } from '../../db/types';
import { cx, Field } from '../../components/ui';
import { DayTabs, MealsGrid } from './PlanGrid';
import { ShareModal } from './ShareModal';
import { PhonePreview } from './PhonePreview';
import { fmtDate, fmtShort } from '../../lib/format';
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

  const startDraft = async (file: File | null, from?: Plan) => {
    let pdfName: string | null = null, pdfB64: string | null = null;
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toast('Il file deve essere un PDF'); return; }
      if (file.size > MAX_MB * 1024 * 1024) { toast(`Il PDF supera i ${MAX_MB} MB`); return; }
      pdfName = file.name;
      pdfB64 = bytesToB64(await readFileAsBytes(file));
    } else if (from?.has_pdf) {
      pdfName = from.pdf_name;
      pdfB64 = await repo.getPlanPdf(from.id);
    }
    const base = from ?? active;
    await repo.createPlan(patient.id, base ? structuredClone(base.data) : repo.emptyPlanData(), pdfName, pdfB64);
    setViewing(null);
    bump();
  };

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
      <DropZone onFile={(f) => startDraft(f)} onEmpty={() => startDraft(null)} hasActive={!!active} />
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
          {['Carica il PDF che già usi in studio', 'Trascrivi giorni, pasti e grammature con il PDF affiancato', 'Genera il link personale e invialo su WhatsApp o email'].map((t, i) => (
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
    {share && <ShareModal patient={patient} onClose={() => setShare(false)} />}
    {preview && active && <PhonePreview patient={patient} plan={active} onClose={() => setPreview(false)} />}
  </>;
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
          <div className="text-muted max-w-[380px] [text-wrap:pretty]">Lo trovi affiancato all'editor mentre trascrivi giorni, pasti, alimenti e grammature. Potrai verificare tutto prima di inviarlo.</div>
          <div className="flex gap-2 mt-1.5">
            <span className="btn-primary px-3.5 py-[9px]">Scegli file</span>
            <button onClick={(e) => { e.stopPropagation(); onEmpty(); }} className="btn-secondary py-[9px]">{hasActive ? 'Modifica senza PDF' : 'Inizia senza PDF'}</button>
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
  const items = plan.days.reduce((a, d) => a + d.meals.reduce((b, m) => b + m.items.filter((i) => i.f.trim()).length, 0), 0);
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
              <div className="text-xs text-label">{[draft.pdf_name, '7 giorni', meals + ' pasti/giorno'].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-label">{saved ? 'Salvato' : 'Salvataggio…'}</span>
              <span className="pill-ok">{items} alimenti</span>
              {flagged > 0 && <span className="pill-warn">{flagged} da verificare</span>}
            </div>
          </div>
          <DayTabs plan={plan} day={day} setDay={setDay} />
          <div className="flex gap-2 items-center px-[22px] pt-3.5 text-[13px] flex-wrap">
            {draft.has_pdf && <button className="btn-secondary py-1.5 text-[12.5px]" onClick={() => setShowPdf(!showPdf)}>{showPdf ? 'Nascondi PDF' : 'Mostra PDF'}</button>}
            <select className="field py-1.5 text-[12.5px]" value="" onChange={(e) => { const v = e.target.value; if (v) copyDay(v === 'all' ? 'all' : +v); }} aria-label="Copia giorno">
              <option value="">Copia {plan.days[day].label} su…</option>
              {plan.days.map((d, i) => i !== day && <option key={i} value={i}>{d.label}</option>)}
              <option value="all">Tutti gli altri giorni</option>
            </select>
            {active && <span className="text-xs text-label ml-auto">Partito dalla v{active.version}: modifica solo ciò che cambia</span>}
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
          <Field label="Indicazioni generali"><textarea rows={3} className="field py-2 resize-y text-[13px]" value={plan.general} onChange={(e) => change({ ...plan, general: e.target.value })} placeholder="Acqua, cotture, pasti liberi…" /></Field>
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

