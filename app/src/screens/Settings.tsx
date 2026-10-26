import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/store';
import * as repo from '../db/repo';
import type { Plan, Patient, Settings } from '../db/types';
import { cx, Field, Page, TimeInput, Toggle } from '../components/ui';
import { PhonePreview } from './patient/PhonePreview';
import { DatabaseCard } from './DatabaseCard';
import { claimServer, ping, remoteConfig } from '../lib/remote';
import { isAdmin } from '../lib/platform';
import { AdminDatabaseCard } from './AdminDatabase';
import { DirectDatabaseCard } from './DirectDatabase';
import { b64ToBytes } from '../lib/pdf';
import { makeZip } from '../lib/zip';
import { saveFile } from '../lib/platform';
import { today } from '../lib/format';

type Sec = 'profilo' | 'orari' | 'tariffe' | 'fatt' | 'app' | 'msg' | 'privacy' | 'admin';
const SECT: [Sec, string][] = [['profilo', 'Profilo studio'], ['orari', 'Orari & agenda'], ['tariffe', 'Tariffe'], ['fatt', 'Fatturazione'], ['app', 'App paziente & link'], ['msg', 'Messaggi WhatsApp'], ['privacy', 'Privacy & sicurezza']];
const PROF: [keyof Settings['prof'], string][] = [['name', 'Nome e titolo'], ['title', 'Qualifica'], ['albo', 'Iscrizione albo'], ['piva', 'Partita IVA'], ['addr', 'Indirizzo studio'], ['phone', 'Telefono studio'], ['email', 'Email'], ['pec', 'PEC']];
const VARS = ['{nome}', '{data}', '{ora}', '{link}', '{importo}', '{studio}'];
const TPL_META: [string, string][] = [['Promemoria appuntamento', '24 h prima della visita · da "Oggi"'], ['Invio piano nutrizionale', 'Alla condivisione del link'], ['Sollecito pagamento', 'Manuale, da Pagamenti']];

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <div className={cx('card px-6 py-[22px] flex flex-col', className)}>{children}</div>;
const Head = ({ title, sub }: { title: string; sub?: string }) => <div><div className="font-semibold text-[17px]">{title}</div>{sub && <div className="text-[13px] text-label">{sub}</div>}</div>;
const Row = ({ label, hint, on, onClick }: { label: string; hint: string; on: boolean; onClick: () => void }) => (
  <div className="flex justify-between items-center gap-4 py-2.5 border-t border-line2"><div><div className="font-medium">{label}</div><div className="text-[12.5px] text-label">{hint}</div></div><Toggle on={on} onClick={onClick} label={label} /></div>
);

/** Ridimensiona un'immagine a max 256 px e la restituisce come data URL. */
async function imageToDataUrl(file: File, size = 256): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, size / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export function SettingsScreen() {
  const { settings, setSettings, toast, setGuard, confirm, bump, go } = useApp();
  const [sec, setSec] = useState<Sec>('profilo');
  // Sezione Amministrazione: solo se l'app è stata avviata come amministratore.
  const [admin, setAdmin] = useState(false);
  useEffect(() => { isAdmin().then(setAdmin); }, []);
  const sections: [Sec, string][] = admin ? [...SECT, ['admin', 'Amministrazione']] : SECT;
  const [d, setD] = useState<Settings | null>(settings && structuredClone(settings));
  const [nextInv, setNextInv] = useState('');
  const [demo, setDemo] = useState(false);
  const [preview, setPreview] = useState<{ p: Patient; plan: Plan } | null>(null);
  const logoIn = useRef<HTMLInputElement>(null), photoIn = useRef<HTMLInputElement>(null);
  useEffect(() => { if (settings && !d) setD(structuredClone(settings)); }, [settings]);
  useEffect(() => { repo.nextInvoice().then(setNextInv); repo.getFlag('demo').then((f) => setDemo(f === '1')); }, [settings]);
  const dirty = !!d && JSON.stringify(d) !== JSON.stringify(settings);
  useEffect(() => { setGuard(dirty ? 'Hai modifiche alle impostazioni non salvate.' : null); }, [dirty]);
  const up = (fn: (x: Settings) => void) => setD((s) => { const x = structuredClone(s!); fn(x); return x; });

  const save = async () => {
    if (!d) return;
    if (d.priv.pin && !/^\d{4,8}$/.test(d.pin)) { setSec('privacy'); toast('Il PIN deve avere da 4 a 8 cifre'); return; }
    await setSettings(d);
    setGuard(null);
    toast('Impostazioni salvate');
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  if (!d) return <Page><div /></Page>;

  const exportAll = async () => {
    const dump = await repo.dumpAll();
    const files: { name: string; data: Uint8Array | string }[] = [];
    // I PDF dei piani vanno nella cartella documenti/ come file, non dentro dati.json.
    const documents = dump.documents.map(({ data_b64, ...rest }) => { files.push({ name: `documenti/${rest.id}_${rest.name}`, data: b64ToBytes(data_b64) }); return rest; });
    const csv = (rows: Record<string, any>[]) => rows.length ? '﻿' + [Object.keys(rows[0]).join(';'), ...rows.map((r) => Object.values(r).map((v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';'))].join('\r\n') : '';
    files.unshift(
      { name: 'dati.json', data: JSON.stringify({ esportato: new Date().toISOString(), app: 'Nutrea Studio', ...dump, documents }, null, 2) },
      { name: 'pazienti.csv', data: csv(dump.patients) }, { name: 'visite.csv', data: csv(dump.visits) },
      { name: 'pagamenti.csv', data: csv(dump.payments) }, { name: 'appuntamenti.csv', data: csv(dump.appointments) },
    );
    const path = await saveFile(`Nutrea_esportazione_${today()}.zip`, makeZip(files), [{ name: 'ZIP', extensions: ['zip'] }]);
    if (path) toast('Esportazione completata');
  };
  const revokeAll = async () => {
    if (!(await confirm({ title: 'Revocare tutti i link paziente?', body: "Nessun paziente potrà più aprire il proprio piano finché non riattivi il link dalla sua scheda.", ok: 'Revoca tutti', danger: true }))) return;
    const n = await repo.revokeAllLinks();
    bump();
    toast(`${n} link revocati`);
  };
  const wipeDemo = async () => {
    if (!(await confirm({ title: 'Eliminare tutti i dati?', body: 'Pazienti, visite, piani, appuntamenti e pagamenti verranno eliminati definitivamente. Le impostazioni restano.', ok: 'Elimina tutto', danger: true }))) return;
    await repo.wipeAll();
    await repo.setFlag('demo', '0');
    bump();
    toast('Archivio svuotato');
    go({ name: 'patients' });
  };
  const openPreview = async () => {
    const pts = await repo.listPatients();
    for (const p of pts.filter((x) => x.plan === 'on')) {
      const plan = (await repo.listPlans(p.id)).find((x) => x.status === 'published');
      if (plan) { setPreview({ p, plan: { ...plan } }); return; }
    }
    toast('Nessun piano pubblicato da mostrare');
  };
  const pickImage = (key: 'logo' | 'photo') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { const url = await imageToDataUrl(f); up((x) => { x[key] = url; }); } catch { toast("Impossibile leggere l'immagine"); }
  };
  const tog = <G extends 'bill' | 'app' | 'priv'>(g: G, k: keyof Settings[G], label: string, hint: string) =>
    <Row key={String(k)} label={label} hint={hint} on={!!d[g][k]} onClick={() => up((x) => { (x[g] as any)[k] = !x[g][k]; })} />;

  return (
    <Page pt="pt-6">
      <div><h1 className="m-0 text-[28px] font-semibold tracking-[-.02em]">Impostazioni</h1><div className="text-muted text-[13px] mt-0.5">Studio, agenda, fatturazione ed esperienza paziente</div></div>
      <div className={cx('grid grid-cols-[220px_minmax(0,1fr)] gap-7 items-start', dirty && 'pb-16')}>
        <nav className="flex flex-col gap-0.5 sticky top-5">
          {sections.map(([id, label]) => id === sec
            ? <button key={id} className="text-left px-3 py-[9px] rounded-[9px] border-0 bg-surface shadow-[0_0_0_1px_rgb(var(--line))] font-semibold text-[13.5px] text-strong">{label}</button>
            : <button key={id} onClick={() => setSec(id)} className="text-left px-3 py-[9px] rounded-[9px] border-0 bg-transparent text-[13.5px] text-muted hover:bg-sunken hover:text-ink">{label}</button>)}
        </nav>

        <div className="flex flex-col gap-5 max-w-[760px]">
          {sec === 'profilo' && (
            <Card className="gap-[18px]">
              <Head title="Profilo studio" sub="Mostrato ai pazienti nell'app e nelle fatture." />
              <div className="flex gap-[18px] items-center">
                {d.logo ? <img src={d.logo} alt="Logo" className="w-[72px] h-[72px] rounded-2xl object-cover flex-none border border-line" />
                  : <div className="w-[72px] h-[72px] rounded-2xl grid place-items-center font-mono text-[10px] font-medium text-label flex-none placeholder-hatch">logo</div>}
                {d.photo && <img src={d.photo} alt="Foto" className="w-[72px] h-[72px] rounded-full object-cover flex-none border border-line" />}
                <div className="flex gap-2 flex-wrap">
                  <input ref={logoIn} type="file" accept="image/*" className="hidden" onChange={pickImage('logo')} />
                  <input ref={photoIn} type="file" accept="image/*" className="hidden" onChange={pickImage('photo')} />
                  <button className="btn-secondary px-3 py-2 rounded-[9px]" onClick={() => logoIn.current?.click()}>Carica logo</button>
                  <button className="btn-secondary px-3 py-2 rounded-[9px]" onClick={() => photoIn.current?.click()}>Foto profilo</button>
                  {(d.logo || d.photo) && <button className="link-btn" onClick={() => up((x) => { x.logo = null; x.photo = null; })}>Rimuovi immagini</button>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {PROF.map(([k, label]) => <Field key={k} label={label}><input className="field" value={d.prof[k]} onChange={(e) => up((x) => { x.prof[k] = e.target.value; })} /></Field>)}
              </div>
            </Card>
          )}

          {sec === 'orari' && <>
            <Card className="gap-3.5">
              <Head title="Orari di ricevimento" sub="Definiscono gli slot prenotabili in Agenda." />
              {d.hours.map((h, i) => {
                const t = (k: 'a' | 'b' | 'c' | 'd') => <TimeInput value={h[k]} onChange={(v) => up((x) => { x.hours[i][k] = v; })} className="w-[64px] px-2.5 py-1.5 border border-ctl rounded-lg text-[13px] bg-surface outline-none focus:border-primary text-center" ariaLabel={`${h.day} ${k}`} />;
                return (
                  <div key={h.day} className="grid grid-cols-[120px_52px_1fr] gap-3.5 items-center py-2 border-t border-line2">
                    <span className="font-medium">{h.day}</span>
                    <Toggle on={h.on} label={h.day} onClick={() => up((x) => { x.hours[i].on = !x.hours[i].on; if (!x.hours[i].a) { x.hours[i].a = '09:00'; x.hours[i].b = '13:00'; } })} />
                    {h.on ? (
                      <div className="flex gap-2 items-center">
                        {t('a')}–{t('b')}
                        {h.c ? <><span className="text-subtle text-xs px-1">pausa</span>{t('c')}–{t('d')}<button className="border-0 bg-transparent text-subtle hover:text-err ml-1" title="Solo mattina" onClick={() => up((x) => { x.hours[i].c = ''; x.hours[i].d = ''; })}>×</button></>
                          : <button className="link-btn ml-2" onClick={() => up((x) => { x.hours[i].c = '14:30'; x.hours[i].d = '19:00'; })}>+ pomeriggio</button>}
                      </div>
                    ) : <span className="text-subtle text-[13px]">Chiuso</span>}
                  </div>
                );
              })}
            </Card>
            <Card className="!grid grid-cols-4 gap-3">
              {([['prima', 'Prima visita', [45, 60, 90]], ['controllo', 'Controllo', [20, 30, 45]], ['online', 'Online', [20, 30, 45]], ['buffer', 'Buffer tra visite', [0, 10, 15]]] as const).map(([k, l, opts]) => (
                <Field key={k} label={l}><select className="field" value={d.dur[k]} onChange={(e) => up((x) => { x.dur[k] = +e.target.value; })}>{opts.map((o) => <option key={o} value={o}>{o} min</option>)}</select></Field>
              ))}
            </Card>
          </>}

          {sec === 'tariffe' && (
            <div className="card overflow-hidden">
              <div className="px-6 pt-[22px] pb-3.5 flex justify-between items-end"><Head title="Tariffe e prestazioni" sub={'Precompilate in "Registra pagamento" e in fattura.'} /><button className="btn-secondary px-3 py-2 rounded-[9px]" onClick={() => up((x) => { x.rates.push({ name: 'Nuova prestazione', price: 0, dur: '30 min' }); })}>+ Aggiungi</button></div>
              {d.rates.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_110px_120px_32px] gap-3 items-center px-6 py-2.5 border-t border-line2">
                  <input value={r.name} onChange={(e) => up((x) => { x.rates[i].name = e.target.value; })} className="px-2.5 py-2 border border-transparent rounded-lg text-sm font-medium bg-transparent hover:border-ctl focus:border-primary outline-none" aria-label="Prestazione" />
                  <div className="flex items-center border border-ctl rounded-lg px-2.5 focus-within:border-primary"><span className="text-subtle">€</span><input inputMode="decimal" value={String(r.price)} onChange={(e) => up((x) => { x.rates[i].price = parseFloat(e.target.value.replace(',', '.')) || 0; })} className="w-full border-0 outline-none px-1.5 py-2 text-sm text-right tabular-nums bg-transparent" aria-label="Prezzo" /></div>
                  <input value={r.dur} onChange={(e) => up((x) => { x.rates[i].dur = e.target.value; })} className="font-mono text-xs text-label bg-transparent border border-transparent rounded-md px-1.5 py-1 hover:border-ctl focus:border-primary outline-none" aria-label="Durata" />
                  <button onClick={() => up((x) => { x.rates.splice(i, 1); })} title="Rimuovi" className="border-0 bg-transparent text-subtle text-base hover:text-err">×</button>
                </div>
              ))}
            </div>
          )}

          {sec === 'fatt' && (
            <Card className="gap-4">
              <Head title="Fatturazione" sub="Dati usati per le fatture PDF e per l'esportazione al commercialista." />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Regime fiscale"><select className="field" value={d.bill.regime} onChange={(e) => up((x) => { x.bill.regime = e.target.value; })}><option>Forfettario (RF19)</option><option>Ordinario (RF01)</option></select></Field>
                <Field label="Prossimo numero"><input className="field font-mono" value={nextInv} inputMode="numeric"
                  onChange={(e) => { const n = parseInt(e.target.value.replace(/^FT\s*/, '')) || 1; setNextInv(`FT ${n}/${today().slice(2, 4)}`); up((x) => { x.bill.invoiceMin = n; }); }} /></Field>
                <Field label="Cassa previdenziale"><select className="field" value={d.bill.cassa} onChange={(e) => up((x) => { x.bill.cassa = e.target.value; })}><option>ENPAB 4%</option><option>ENPAB 2%</option><option>Nessuna</option></select></Field>
                <Field label="Esenzione IVA"><select className="field" value={d.bill.iva} onChange={(e) => up((x) => { x.bill.iva = e.target.value; })}><option>Art. 10 n.18 DPR 633/72</option></select></Field>
              </div>
              <div>
                {tog('bill', 'sdi', 'Fatture da trasmettere a SdI', 'Le fatture saldate vengono segnate da inviare tramite il tuo intermediario')}
                {tog('bill', 'ts', 'Trasmissione Sistema TS', 'Spese sanitarie detraibili per il 730 del paziente (dicitura in fattura)')}
                {tog('bill', 'bollo', 'Marca da bollo automatica', '€ 2 sulle fatture oltre € 77,47')}
              </div>
              <div className="text-[12.5px] text-muted bg-canvas rounded-[10px] px-3.5 py-2.5">L'invio telematico a SdI e Sistema TS richiede un intermediario abilitato: l'app genera le fatture PDF e l'esportazione CSV da consegnare al commercialista.</div>
            </Card>
          )}

          {sec === 'app' && (
            <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-5 items-start">
              <Card className="gap-1.5">
                <div className="mb-2"><Head title="App paziente & link" sub="Cosa vede il paziente aprendo il link personale." /></div>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <Field label="Validità link"><select className="field" value={d.expiry} onChange={(e) => up((x) => { x.expiry = e.target.value; })}>{['Fino a revoca', 'Fine percorso', '90 giorni', '30 giorni'].map((o) => <option key={o}>{o}</option>)}</select></Field>
                  <Field label="Indirizzo app paziente"><input className="field font-mono text-[13px]" value={d.appDomain} onChange={(e) => up((x) => { x.appDomain = e.target.value.replace(/^https?:\/\//, '').replace(/\/$/, ''); })} /></Field>
                </div>
                {tog('app', 'weight', 'Mostra andamento peso', 'Grafico semplificato in "Progressi"')}
                {tog('app', 'meas', 'Mostra centimetri persi', 'Solo variazioni, non valori assoluti')}
                {tog('app', 'pdf', 'Consenti download PDF originale', 'Pulsante in "La mia dieta"')}
                {tog('app', 'checks', 'Checklist pasti', 'Il paziente può spuntare i pasti consumati')}
                {tog('app', 'install', 'Suggerisci "Aggiungi alla Home"', 'Banner discreto dalla seconda apertura')}
              </Card>
              <ServerStatusCard remote={d.remote} admin={admin} onAdmin={() => setSec('admin')} />
              <div className="sticky top-5 flex flex-col gap-2">
                <div className="label">Anteprima tab bar</div>
                <div className="card rounded-[20px] px-2 py-3 flex justify-around">
                  {['Oggi', 'Dieta', ...(d.app.weight || d.app.meas ? ['Progressi'] : []), 'Studio'].map((p) => <div key={p} className="flex flex-col items-center gap-[5px] text-[10.5px] text-muted"><span className="w-2.5 h-2.5 rounded-full border-[1.6px] border-subtle" />{p}</div>)}
                </div>
                <a className="text-[13px]" onClick={async () => { if (dirty) await save(); openPreview(); }}>Apri app paziente →</a>
              </div>
            </div>
          )}

          {sec === 'msg' && d.tpl.map((body, i) => (
            <div key={i} className="card px-6 py-5 flex flex-col gap-2.5">
              <div className="flex justify-between items-center"><div><div className="font-semibold text-[15px]">{TPL_META[i][0]}</div><div className="text-[12.5px] text-label">{TPL_META[i][1]}</div></div><span className="pill-ok">WhatsApp</span></div>
              <textarea id={'tpl' + i} rows={3} className="field leading-normal resize-y" value={body} onChange={(e) => up((x) => { x.tpl[i] = e.target.value; })} />
              <div className="flex gap-1.5 flex-wrap">
                {VARS.map((v) => (
                  <button key={v} className="font-mono text-[11.5px] font-medium text-accent bg-tint2 border-0 rounded-md px-[7px] py-[3px] hover:brightness-95"
                    onClick={() => {
                      // Inserisce la variabile nel punto del cursore (o in fondo).
                      const ta = document.getElementById('tpl' + i) as HTMLTextAreaElement | null;
                      const pos = ta && document.activeElement === ta ? ta.selectionStart : body.length;
                      up((x) => { x.tpl[i] = body.slice(0, pos) + (pos && body[pos - 1] !== ' ' ? ' ' : '') + v + body.slice(pos); });
                    }}>{v}</button>
                ))}
              </div>
            </div>
          ))}

          {sec === 'admin' && admin && <>
            <div className="card px-6 py-[22px] flex flex-col gap-1">
              <div className="font-semibold text-[17px]">Amministrazione</div>
              <div className="text-[13px] text-label">Visibile solo perché Nutrea Studio è stato avviato come amministratore. Qui si collega il database esterno in cui finiscono i dati dei pazienti con il link.</div>
            </div>
            <DirectDatabaseCard value={settings?.remote.db} onSave={async (db) => {
              await setSettings({ ...settings!, remote: { ...settings!.remote, db } });
              up((x) => { x.remote.db = db; });
            }} />
            <details className="card px-6 py-[18px]">
              <summary className="cursor-pointer font-semibold text-[15px]">Avanzate: usa un server dello studio invece del collegamento diretto</summary>
              <div className="flex flex-col gap-5 mt-4">
                <div className="text-[12.5px] text-label">Il collegamento diretto, qui sopra, ha la precedenza. Con un server dello studio (cartella server/) l'app non conosce le credenziali del database.</div>
                <RemoteServerCard value={d.remote} onChange={(remote) => up((x) => { x.remote = { ...remote, db: x.remote.db }; })} webDomain={d.appDomain} />
                <AdminDatabaseCard serverUrl={d.remote.url} studioKey={d.remote.key} />
              </div>
            </details>
          </>}

          {sec === 'privacy' && <>
            <Card className="gap-1.5">
              <div className="mb-2"><Head title="Privacy & sicurezza" sub="Dati sanitari trattati secondo GDPR art. 9 e conservati solo su questo computer." /></div>
              {tog('priv', 'pin', "Blocco con PIN all'avvio", "Chiede un PIN ogni volta che apri Nutrea Studio")}
              {d.priv.pin && (
                <div className="flex items-center gap-3 pb-2.5 -mt-1">
                  <span className="text-[13px] text-label">PIN (4–8 cifre)</span>
                  <input type="password" inputMode="numeric" maxLength={8} value={d.pin} onChange={(e) => up((x) => { x.pin = e.target.value.replace(/\D/g, ''); })} className="field py-1.5 w-32 font-mono tracking-[.3em]" aria-label="PIN" />
                </div>
              )}
              {tog('priv', 'consent', 'Consenso informato digitale', "Richiesto al primo accesso del paziente al link (con l'app paziente online)")}
              {tog('priv', 'log', 'Registro accessi ai link', "Data e ora di ogni apertura dell'app paziente (con l'app paziente online)")}
            </Card>
            <div className="card px-6 py-5 flex flex-col gap-3">
              <div className="font-semibold text-[15px]">Dati e account</div>
              <div className="flex gap-2 flex-wrap">
                <button className="btn-secondary" onClick={exportAll}>Esporta tutti i dati (ZIP)</button>
                <button className="btn-secondary" disabled title="Disponibile con l'app paziente online">Registro accessi</button>
                <button className="btn-secondary !text-err !border-err-line/60" onClick={revokeAll}>Revoca tutti i link paziente</button>
                <button className="btn-secondary !text-err !border-err-line/60" onClick={wipeDemo}>{demo ? 'Elimina dati di esempio' : 'Svuota archivio'}</button>
              </div>
            </div>
            <DatabaseCard />
          </>}
        </div>
      </div>

      {dirty && (
        <div className="fixed left-[232px] right-0 bottom-0 bg-surface border-t border-line px-8 py-3 flex justify-end items-center gap-2.5 z-20 shadow-[0_-6px_20px_rgba(15,30,32,.06)]">
          <span className="mr-auto text-[13px] text-muted">Modifiche non salvate</span>
          <button className="btn-secondary px-3.5 py-[9px]" onClick={() => setD(structuredClone(settings!))}>Annulla</button>
          <button className="btn-primary px-[18px] py-[9px]" onClick={save} title="Ctrl+S">Salva modifiche</button>
        </div>
      )}
      {preview && <PhonePreview patient={preview.p} plan={preview.plan} onClose={() => setPreview(null)} />}
    </Page>
  );
}

/** Server dell'app paziente: indirizzo delle API e chiave dello studio (generata sul server con npm run studio-key). */
function RemoteServerCard({ value, onChange, webDomain }: { value: Settings['remote']; onChange: (v: Settings['remote']) => void; webDomain: string }) {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const test = async () => {
    const cfg = remoteConfig({ remote: { url: value.url, key: value.key } } as Settings);
    if (!cfg) { setState({ ok: false, text: 'Inserisci indirizzo e chiave' }); return; }
    setBusy(true);
    try { const r = await ping(cfg); setState({ ok: true, text: `Collegato · database ${r.db}` }); }
    catch (e: any) { setState({ ok: false, text: e?.message ?? String(e) }); }
    finally { setBusy(false); }
  };
  // Primo collegamento: il server crea la chiave dello studio e l'app la tiene da sola.
  const claim = async () => {
    setBusy(true); setState(null);
    try { const key = await claimServer(value.url); onChange({ ...value, key }); setState({ ok: true, text: 'Server collegato: la chiave dello studio è stata salvata nell\'app' }); }
    catch (e: any) { setState({ ok: false, text: e?.status === 409 ? 'Questo server è già collegato a uno studio: incolla la sua chiave dello studio' : e?.message ?? String(e) }); }
    finally { setBusy(false); }
  };
  const configured = !!(value.url.trim() && value.key.trim());
  return (
    <Card className="gap-3">
      <Head title="Server dell'app paziente" sub="Il server pubblica i piani per i pazienti e conserva email e password (solo come hash). Vedi server/README.md." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Indirizzo del server (API)"><input className="field font-mono text-[13px]" placeholder="https://api.esempio.it" value={value.url} onChange={(e) => { setState(null); onChange({ ...value, url: e.target.value.trim() }); }} /></Field>
        <Field label="Chiave dello studio"><input type="password" autoComplete="off" className="field font-mono text-[13px]" placeholder="nutrea_…" value={value.key} onChange={(e) => { setState(null); onChange({ ...value, key: e.target.value.trim() }); }} /></Field>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {value.url.trim() && !value.key.trim()
          ? <button className="btn-primary" disabled={busy} onClick={claim}>{busy ? 'Collegamento…' : 'Collega questo server'}</button>
          : <button className="btn-secondary" disabled={busy} onClick={test}>{busy ? 'Verifica…' : 'Prova connessione'}</button>}
        {state && <span className={cx('text-[13px] font-medium', state.ok ? 'text-ok' : 'text-err')}>{state.ok ? '● ' : ''}{state.text}</span>}
      </div>
      <div className="text-[12.5px] text-label leading-snug">
        {configured
          ? <>Con il server collegato, dalla scheda del paziente si crea il link di accesso: il paziente sceglie la sua password e apre l'app su <span className="font-mono">{webDomain}</span>. I dati (piano condiviso, visite, appuntamenti) si aggiornano da soli.</>
          : <>Senza server il piano si condivide in PDF. Inserisci l'indirizzo del server e premi "Collega questo server": la chiave la crea il server e l'app la salva da sola. Se il server è già collegato, incolla la sua chiave dello studio.</>}
      </div>
    </Card>
  );
}

/** Per chi non è amministratore: solo lo stato del collegamento, senza poterlo modificare. */
function ServerStatusCard({ remote, admin, onAdmin }: { remote: Settings['remote']; admin: boolean; onAdmin: () => void }) {
  const cfg = remoteConfig({ remote } as Settings);
  return (
    <div className="card px-6 py-[18px] flex justify-between items-center gap-4 col-span-2">
      <div>
        <div className="font-semibold text-[15px]">Server dell'app paziente</div>
        <div className="text-[13px] text-label">{cfg ? <>Collegato a <span className="font-mono">{cfg.db ? `${cfg.db.host} (database)` : new URL(cfg.url).host}</span></> : 'Non configurato: il piano si condivide in PDF.'}</div>
        {!admin && <div className="text-[12.5px] text-label mt-1">La configurazione del server e del database è riservata all'amministratore: avvia Nutrea Studio con "Esegui come amministratore".</div>}
      </div>
      {admin && <button className="btn-secondary flex-none" onClick={onAdmin}>Amministrazione →</button>}
    </div>
  );
}
