import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import * as repo from '../db/repo';
import { ACTIVITIES, CHIP_GROUPS, GOALS, SOURCES } from '../db/defaults';
import type { Patient } from '../db/types';
import { Breadcrumb, Checkbox, cx, Field, Page, Segmented, UnitInput } from '../components/ui';
import { ageFrom, bmiCategory, bmiOf, initials, num, numOrNull, today, waLink } from '../lib/format';
import { consentPdf } from '../lib/documents';
import { saveFile, openExternal } from '../lib/platform';

const STEPS = ['Anagrafica', 'Anamnesi', 'Misure iniziali', 'Obiettivi & consenso'];
type K1 = 'first' | 'last' | 'phone' | 'email' | 'dob' | 'birthplace' | 'cf' | 'job';
const F1: [K1, string, string, string, boolean?][] = [
  ['first', 'Nome *', 'text', 'Mario', true], ['last', 'Cognome *', 'text', 'Rossi', true], ['phone', 'Telefono *', 'tel', '+39 3__ ___ ____', true],
  ['email', 'Email', 'email', 'nome@mail.it'], ['dob', 'Data di nascita', 'date', ''], ['birthplace', 'Luogo di nascita', 'text', 'Bologna'],
  ['cf', 'Codice fiscale', 'text', 'RSSMRA…'], ['job', 'Professione', 'text', 'Impiegato · sedentario'],
];
type K3 = 'height' | 'kg' | 'fat' | 'vita' | 'fianchi' | 'torace' | 'braccio' | 'coscia' | 'polso';
const F3: [K3, string, string, string][] = [
  ['height', 'Altezza', 'cm', '170'], ['kg', 'Peso', 'kg', '72,0'], ['fat', 'Massa grassa', '%', '25'], ['vita', 'Vita', 'cm', '—'], ['fianchi', 'Fianchi', 'cm', '—'],
  ['torace', 'Torace', 'cm', '—'], ['braccio', 'Braccio', 'cm', '—'], ['coscia', 'Coscia', 'cm', '—'], ['polso', 'Polso', 'cm', '—'],
];
const CONS: ['privacy' | 'app' | 'marketing', string, string][] = [
  ['privacy', 'Informativa privacy e trattamento dati sanitari *', 'GDPR art. 9 · da firmare dal paziente (modulo PDF stampabile)'],
  ['app', "Accesso all'app paziente", 'Abilita il link personale con piano e progressi'],
  ['marketing', 'Comunicazioni dello studio', 'Newsletter e promemoria non clinici'],
];

interface Form {
  [k: string]: any;
  sex: 'F' | 'M'; contact: string; chips: Record<string, boolean>; activity: string; source: string; goal: number;
  cons: Record<string, boolean>; drugs: string; notes: string; target: string;
}
const EMPTY = (): Form => ({ sex: 'F', contact: 'WhatsApp', chips: {}, activity: 'Sedentaria', source: 'Passaparola', goal: 0, cons: { app: true }, drugs: '', notes: '', target: '' });

export function NewPatient() {
  const { go, bump, toast, settings, setGuard } = useApp();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  const dirty = !done && Object.keys(f).some((k) => F1.some(([x]) => x === k) && f[k]);
  useEffect(() => { setGuard(dirty ? 'Hai iniziato a compilare la scheda di un nuovo paziente: i dati inseriti andranno persi.' : null); }, [dirty, setGuard]);

  const valid1 = () => !!(f.first?.trim() && f.last?.trim() && f.phone?.trim());
  const goTo = (i: number) => { if (i > 0 && !valid1()) { setTried(true); setStep(0); return; } setStep(i); };

  const tags = Object.keys(f.chips).filter((k) => f.chips[k]);
  const h = num(f.height), kg = num(f.kg), bmiV = bmiOf(kg, h);
  const whr = num(f.vita) && num(f.fianchi) ? (num(f.vita) / num(f.fianchi)).toFixed(2).replace('.', ',') : '—';
  const name = [f.first, f.last].filter(Boolean).join(' ');
  const age = ageFrom(f.dob);
  const meta = [age != null ? age + ' anni' : null, f.sex, h ? h + ' cm' : null].filter(Boolean).join(' · ') || 'Compila i dati anagrafici';

  const create = async () => {
    if (!valid1()) { setTried(true); setStep(0); return; }
    if (saving) return;
    setSaving(true);
    try {
      const p = await repo.createPatient({
        first: f.first.trim(), last: f.last.trim(), phone: f.phone.trim(), email: f.email || null, dob: f.dob || null, birthplace: f.birthplace || null,
        cf: f.cf ? String(f.cf).toUpperCase() : null, job: f.job || null, sex: f.sex, contact: f.contact, tags,
        drugs: f.drugs || null, activity: f.activity, notes: f.notes || null, height: numOrNull(f.height),
        goal: GOALS[f.goal], target_kg: numOrNull(f.target), source: f.source,
        consent_privacy: !!f.cons.privacy, consent_app: !!f.cons.app, consent_marketing: !!f.cons.marketing,
      });
      // Le misure iniziali diventano la prima rilevazione (baseline di grafici e variazioni).
      const m = Object.fromEntries(F3.filter(([k]) => k !== 'height').map(([k]) => [k, numOrNull(f[k])]));
      if (Object.values(m).some((v) => v != null)) {
        await repo.addVisit({ patient_id: p.id, date: today(), type: 'Misure iniziali', note: 'Misure rilevate alla creazione della scheda.', goal: GOALS[f.goal], ...(m as any) });
      }
      setGuard(null);
      bump();
      setDone(p);
    } catch (e: any) {
      toast('Errore nel salvataggio: ' + (e?.message ?? e));
    } finally { setSaving(false); }
  };

  // Ctrl+Invio: avanti / crea
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !done) { e.preventDefault(); step < 3 ? goTo(step + 1) : create(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const reset = () => { setStep(0); setF(EMPTY()); setTried(false); setDone(null); };
  const studio = settings?.prof.name || 'lo studio';

  return (
    <Page>
      <div className="flex flex-col gap-1">
        <Breadcrumb items={[{ label: 'Pazienti', onClick: () => go({ name: 'patients' }) }, { label: 'Nuovo paziente' }]} />
        <h1 className="m-0 text-[28px] font-semibold tracking-[-.02em]">Nuovo paziente</h1>
      </div>

      {!done ? (
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            <div className="grid grid-cols-4 gap-2">
              {STEPS.map((label, i) => (
                <button key={label} onClick={() => goTo(i)} className="border-0 bg-transparent p-0 text-left flex flex-col gap-2">
                  <span className={cx('block h-1 rounded-sm', i === step ? 'bg-primary' : i < step ? 'bg-sage-500' : 'bg-line')} />
                  <span className={cx('text-[13px]', i === step ? 'font-semibold text-strong' : i < step ? 'font-medium text-ok' : 'font-medium text-subtle')}>
                    <span className="font-mono mr-1.5">{i < step ? '✓' : '0' + (i + 1)}</span>{label}
                  </span>
                </button>
              ))}
            </div>

            <div className="card p-6 flex flex-col gap-5">
              {step === 0 && <>
                <div><div className="font-semibold text-[17px]">Dati anagrafici</div><div className="text-[13px] text-label">I campi con * sono obbligatori per creare la scheda.</div></div>
                <div className="grid grid-cols-2 gap-3.5">
                  {F1.map(([k, label, type, ph, req]) => {
                    const err = !!(req && tried && !f[k]?.trim());
                    return (
                      <Field key={k} label={label}>
                        <input type={type} value={f[k] || ''} onChange={(e) => set(k, e.target.value)} placeholder={ph} autoFocus={k === 'first'}
                          className={err ? 'field-err' : 'field'} max={type === 'date' ? today() : undefined} aria-invalid={err} />
                        {err && <span className="text-xs text-err">Campo obbligatorio</span>}
                      </Field>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5"><span className="label">Sesso biologico</span>
                    <Segmented options={[{ v: 'F', l: 'F' }, { v: 'M', l: 'M' }]} value={f.sex} onChange={(v) => set('sex', v)} /></div>
                  <div className="flex flex-col gap-1.5"><span className="label">Contatto preferito</span>
                    <Segmented options={['WhatsApp', 'Telefono', 'Email'].map((v) => ({ v, l: v }))} value={f.contact} onChange={(v) => set('contact', v)} /></div>
                </div>
              </>}

              {step === 1 && <>
                <div><div className="font-semibold text-[17px]">Anamnesi clinica</div><div className="text-[13px] text-label">Le selezioni diventano tag visibili nella scheda paziente.</div></div>
                {CHIP_GROUPS.map(([g, label, list]) => (
                  <div key={g} className="flex flex-col gap-2"><span className="label">{label}</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {list.map((l) => f.chips[l] ? (
                        <button key={l} onClick={() => set('chips', { ...f.chips, [l]: false })} className="px-3 py-[7px] rounded-full border border-warn-line bg-tag-bg text-tag-ink text-[13px] font-semibold whitespace-nowrap">✓ {l}</button>
                      ) : (
                        <button key={l} onClick={() => set('chips', { ...f.chips, [l]: true })} className="px-3 py-[7px] rounded-full border border-ctl bg-surface text-ink2 text-[13px] font-medium whitespace-nowrap hover:border-sage-500">{l}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3.5">
                  <Field label="Farmaci / integratori"><input className="field" value={f.drugs} onChange={(e) => set('drugs', e.target.value)} placeholder="Es. levotiroxina 50 µg" /></Field>
                  <Field label="Attività fisica"><select className="field" value={f.activity} onChange={(e) => set('activity', e.target.value)}>{ACTIVITIES.map((a) => <option key={a}>{a}</option>)}</select></Field>
                </div>
                <Field label="Note anamnestiche"><textarea rows={4} className="field resize-y" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Abitudini alimentari, sonno, storia del peso, esami recenti…" /></Field>
              </>}

              {step === 2 && <>
                <div className="flex justify-between items-end gap-4">
                  <div><div className="font-semibold text-[17px]">Misure iniziali</div><div className="text-[13px] text-label">Diventano la baseline di grafici e variazioni. Puoi anche inserirle alla prima visita.</div></div>
                  <button onClick={() => setStep(3)} className="link-btn whitespace-nowrap">Inserisci dopo →</button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {F3.map(([k, label, unit, ph]) => (
                    <label key={k} className="flex flex-col gap-1.5"><span className="text-[12.5px] text-ink2">{label}</span>
                      <UnitInput value={f[k] || ''} onChange={(v) => set(k, v)} unit={unit} placeholder={ph} autoFocus={k === 'height'} /></label>
                  ))}
                </div>
                {bmiV && (
                  <div className="flex gap-6 bg-tint rounded-xl px-4 py-3.5">
                    <div><div className="label">BMI</div><div className="text-[22px] font-semibold">{bmiV.toFixed(1).replace('.', ',')}</div><div className="text-xs text-muted">{bmiCategory(bmiV)}</div></div>
                    <div><div className="label">Rapporto vita/fianchi</div><div className="text-[22px] font-semibold">{whr}</div></div>
                  </div>
                )}
              </>}

              {step === 3 && <>
                <div className="font-semibold text-[17px]">Obiettivi e consenso</div>
                <div className="flex flex-col gap-2"><span className="label">Obiettivo principale</span>
                  <div className="grid grid-cols-3 gap-2">
                    {GOALS.map((l, i) => i === f.goal ? (
                      <button key={l} className="p-3 rounded-xl border-[1.5px] border-primary bg-tint2 text-left font-semibold text-[13.5px] text-strong">{l}</button>
                    ) : (
                      <button key={l} onClick={() => set('goal', i)} className="p-3 rounded-xl border border-ctl bg-surface text-left font-medium text-[13.5px] hover:border-sage-500">{l}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <Field label="Peso obiettivo"><UnitInput value={f.target} onChange={(v) => set('target', v)} unit="kg" placeholder="Es. 68" /></Field>
                  <Field label="Come ci ha conosciuto"><select className="field" value={f.source} onChange={(e) => set('source', e.target.value)}>{SOURCES.map((a) => <option key={a}>{a}</option>)}</select></Field>
                </div>
                <div className="flex flex-col gap-2.5 border-t border-line2 pt-4">
                  {CONS.map(([k, label, hint]) => (
                    <button key={k} role="checkbox" aria-checked={!!f.cons[k]} onClick={() => set('cons', { ...f.cons, [k]: !f.cons[k] })} className="flex gap-3 items-start border-0 bg-transparent p-0 text-left text-[13.5px]">
                      <Checkbox on={!!f.cons[k]} />
                      <span><span className="font-medium">{label}</span><span className="block text-[12.5px] text-label">{hint}</span></span>
                    </button>
                  ))}
                  {!f.cons.privacy && <div className="text-[12.5px] text-warn bg-warn-bg rounded-lg px-3 py-2">Puoi creare la scheda anche senza consenso: resterà segnata come "consenso da firmare" finché non lo registri.</div>}
                </div>
              </>}

              <div className="flex justify-between items-center border-t border-line2 pt-[18px]">
                {step > 0
                  ? <button onClick={() => setStep(step - 1)} className="btn-secondary px-4">← Indietro</button>
                  : <button onClick={() => go({ name: 'patients' })} className="btn-secondary px-4">Annulla</button>}
                <div className="flex gap-2.5 items-center">
                  <span className="font-mono text-xs text-subtle">{step + 1} di 4</span>
                  {step < 3
                    ? <button onClick={() => goTo(step + 1)} className="btn-primary px-[18px]" title="Ctrl+Invio">Continua →</button>
                    : <button onClick={create} disabled={saving} className="btn-primary px-[18px]" title="Ctrl+Invio">Crea scheda paziente</button>}
                </div>
              </div>
            </div>
          </div>

          <div className="sticky top-5 flex flex-col gap-3.5">
            <div className="card px-5 py-[18px] flex flex-col gap-3.5">
              <span className="label">Anteprima scheda</span>
              <div className="flex gap-3 items-center">
                <div className="w-12 h-12 rounded-full bg-avatar text-accent grid place-items-center font-semibold text-[17px] flex-none">{initials(f.first, f.last)}</div>
                <div className="min-w-0"><div className="font-semibold text-base truncate">{name || 'Nuovo paziente'}</div><div className="text-[12.5px] text-label">{meta}</div></div>
              </div>
              {tags.length > 0 && <div className="flex gap-[5px] flex-wrap">{tags.map((t) => <span key={t} className="text-xs px-2 py-[3px] rounded-tag bg-tag-bg text-tag-ink">{t}</span>)}</div>}
              <div className="grid grid-cols-[80px_1fr] gap-y-[7px] text-[13px] border-t border-line2 pt-3">
                <span className="text-label">Telefono</span><span className="font-mono text-[12.5px]">{f.phone || '—'}</span>
                <span className="text-label">Peso</span><span>{kg ? f.kg + ' kg' : '—'}</span>
                <span className="text-label">Obiettivo</span><span>{GOALS[f.goal] + (num(f.target) ? ' · ' + f.target + ' kg' : '')}</span>
              </div>
            </div>
            <div className="bg-tint rounded-[14px] px-4 py-3.5 text-[13px] text-[rgb(var(--ok))] leading-normal">Alla creazione: scheda pronta, prima visita prenotabile e messaggio di benvenuto inviabile su WhatsApp.</div>
          </div>
        </div>
      ) : (
        <div className="card rounded-[18px] p-10 max-w-[680px] flex flex-col gap-5 items-start">
          <div className="w-[52px] h-[52px] rounded-full bg-ok-bg text-ok grid place-items-center text-2xl font-bold">✓</div>
          <div><div className="text-2xl font-semibold tracking-[-.02em]">Scheda di {done.first} {done.last} creata</div><div className="text-muted mt-1">ID <span className="font-mono">{done.code}</span> · aggiunta all'elenco pazienti</div></div>
          <div className="grid grid-cols-2 gap-2.5 w-full">
            <button onClick={() => go({ name: 'agenda', patientId: done.id, book: true })} className="px-4 py-3.5 rounded-xl bg-primary text-on-primary font-semibold text-left border-0 hover:bg-primary-hover">Prenota prima visita →</button>
            <button onClick={() => openExternal(waLink(done.phone, `Ciao ${done.first}, benvenut${done.sex === 'M' ? 'o' : 'a'} nello studio ${studio}! ${done.consent_privacy ? 'A presto per la prima visita.' : "Alla prima visita ti chiederò di firmare l'informativa privacy."}`))}
              className="px-4 py-3.5 rounded-xl bg-ok-bg text-ok font-semibold text-left border-0 hover:brightness-[.97]">Invia benvenuto su WhatsApp</button>
            <button onClick={() => go({ name: 'patient', id: done.id })} className="px-4 py-3.5 rounded-xl border border-ctl bg-surface text-ink font-medium text-left hover:bg-surface2">Apri scheda paziente</button>
            <button onClick={reset} className="px-4 py-3.5 rounded-xl border border-ctl bg-surface text-ink font-medium text-left text-sm hover:bg-surface2">+ Aggiungi un altro paziente</button>
          </div>
          {!done.consent_privacy && (
            <div className="w-full flex items-center justify-between gap-3 bg-warn-bg rounded-xl px-4 py-3">
              <div className="text-[13px] text-warn"><span className="font-semibold">Consenso privacy da firmare.</span> Stampa il modulo e registralo nella scheda quando è firmato.</div>
              <button className="btn-secondary py-2" onClick={async () => { const p = await saveFile(`Consenso_${done.last}_${done.first}.pdf`, consentPdf(done, settings!), [{ name: 'PDF', extensions: ['pdf'] }]); if (p) toast('Modulo salvato'); }}>Scarica modulo PDF</button>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
