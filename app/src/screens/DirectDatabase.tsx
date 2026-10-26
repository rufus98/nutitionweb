// Impostazioni → Amministrazione (solo con Nutrea Studio avviato come amministratore):
// database MySQL esterno (es. Aiven) in cui l'app salva i dati dei pazienti con il link. Basta inserire i dati del database:
// nessun server dello studio e nessuna chiave da generare. Le credenziali restano in questa app, su questo computer.
import { useState } from 'react';
import { useApp } from '../app/store';
import * as repo from '../db/repo';
import { Field, Toggle, cx } from '../components/ui';
import { parseDbUri } from '../lib/remote';
import { ensureSchema, testConn, dbErrorText, type DbConn } from '../lib/remoteDb';

type Form = { host: string; port: string; database: string; user: string; password: string; ssl: boolean; ca: string };
const toForm = (d?: DbConn): Form => ({ host: d?.host ?? '', port: d ? String(d.port) : '', database: d?.database ?? 'defaultdb', user: d?.user ?? '', password: d?.password ?? '', ssl: d?.ssl ?? true, ca: d?.ca ?? '' });

export function DirectDatabaseCard({ value, onSave }: { value?: DbConn; onSave: (db: DbConn | undefined) => Promise<void> }) {
  const { toast, confirm, bump } = useApp();
  const [f, setF] = useState<Form>(() => toForm(value));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'test' | 'save'>('');
  const set = (patch: Partial<Form>) => { setMsg(null); setF((x) => ({ ...x, ...patch })); };
  const conn = (): DbConn => ({ host: f.host.trim(), port: Number(f.port) || 3306, database: f.database.trim(), user: f.user.trim(), password: f.password, ssl: f.ssl, ca: f.ca.trim() || undefined });
  const missing = !f.host.trim() ? "l'indirizzo (host)" : !f.database.trim() ? 'il nome del database' : !f.user.trim() ? "l'utente" : !f.password ? 'la password' : null;
  const run = async (what: 'test' | 'save', fn: () => Promise<void>) => {
    if (missing) { setMsg({ ok: false, text: `Manca ${missing}` }); return; }
    setBusy(what); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, text: dbErrorText(e).replace(/^Database: /, '') }); } finally { setBusy(''); }
  };
  // Service URI di Aiven: compila i campi. Utente e password sono nascosti nel pannello Aiven (CLICK_TO:REVEAL_PASSWORD): vanno copiati a parte.
  const fromUri = (text: string) => {
    try {
      const p = parseDbUri(text);
      if (p.client !== 'mysql2') throw new Error('Serve un indirizzo MySQL (mysql://…)');
      setF((x) => ({ ...x, host: p.host ?? '', port: String(p.port ?? ''), database: p.database ?? x.database, ssl: p.ssl ?? true, user: p.user || x.user, password: p.password || x.password }));
      setMsg({ ok: true, text: p.user && p.password ? "Campi compilati dall'indirizzo." : 'Campi compilati. Mancano utente e password: il Service URI li nasconde, copiali dal pannello del servizio.' });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  const test = () => run('test', async () => { setMsg({ ok: true, text: `Connessione riuscita · ${await testConn(conn())}` }); });
  const save = async () => {
    if (value && (value.host !== f.host.trim() || value.database !== f.database.trim())) {
      const ok = await confirm({ title: 'Usare un altro database?', body: "I dati dei pazienti con il link vengono inviati di nuovo al nuovo database; i pazienti dovranno riattivare l'accesso con un nuovo link, perché le password stanno nel database.", ok: 'Usa questo database' });
      if (!ok) return;
    }
    await run('save', async () => {
      const c = conn();
      await testConn(c);
      await ensureSchema(c); // crea le tabelle se mancano
      const changed = !value || value.host !== c.host || value.port !== c.port || value.database !== c.database;
      await onSave(c);
      if (changed) { await repo.resetRemoteSync(); bump(); }
      setMsg({ ok: true, text: 'Database collegato: le tabelle sono pronte' });
      toast('Database collegato');
    });
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Scollegare il database?', body: "L'app non invierà più i dati dei pazienti. I dati già nel database restano lì.", ok: 'Scollega' }))) return;
    await onSave(undefined); setF(toForm()); setMsg(null); toast('Database scollegato');
  };

  return (
    <div className="card px-6 py-[22px] flex flex-col gap-4">
      <div>
        <div className="font-semibold text-[17px]">Database esterno (MySQL)</div>
        <div className="text-[13px] text-label">Inserisci i dati del database, per esempio quelli di Aiven. L'app ci salva i dati dei pazienti con il link; la web app dei pazienti li legge dallo stesso database.</div>
      </div>
      <Field label="Incolla il Service URI (facoltativo)">
        <input autoComplete="off" spellCheck={false} className="field font-mono text-[13px]" placeholder="mysql://avnadmin:…@mysql-….aivencloud.com:19116/defaultdb?ssl-mode=REQUIRED"
          value="" onChange={() => {}} onPaste={(e) => { e.preventDefault(); fromUri(e.clipboardData.getData('text')); }} />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3">
        <Field label="Indirizzo (host)"><input className="field font-mono text-[13px]" placeholder="mysql-….aivencloud.com" value={f.host} onChange={(e) => set({ host: e.target.value.trim() })} /></Field>
        <Field label="Porta"><input inputMode="numeric" className="field font-mono text-[13px]" placeholder="3306" value={f.port} onChange={(e) => set({ port: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Nome del database"><input className="field font-mono text-[13px]" value={f.database} onChange={(e) => set({ database: e.target.value })} /></Field>
        <Field label="Utente"><input autoComplete="off" className="field font-mono text-[13px]" placeholder="avnadmin" value={f.user} onChange={(e) => set({ user: e.target.value.trim() })} /></Field>
        <Field label="Password"><input type="password" autoComplete="new-password" className="field font-mono text-[13px]" value={f.password} onChange={(e) => set({ password: e.target.value })} /></Field>
      </div>
      <div className="flex justify-between items-center gap-4 py-1">
        <div><div className="font-medium text-[13.5px]">Connessione cifrata (SSL mode: REQUIRED)</div><div className="text-[12.5px] text-label">Necessaria con Aiven</div></div>
        <Toggle on={f.ssl} onClick={() => set({ ssl: !f.ssl })} label="SSL" />
      </div>
      {f.ssl && (
        <Field label="Certificato CA (CA certificate)">
          <textarea spellCheck={false} rows={4} className="field font-mono text-[12px]" placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'} value={f.ca} onChange={(e) => set({ ca: e.target.value })} />
          <label className="text-[12.5px] text-label">Oppure carica il file: <input type="file" accept=".pem,.crt,.cer,.txt" onChange={async (e) => { const t = await e.target.files?.[0]?.text(); if (t) set({ ca: t }); }} /></label>
          <div className="text-[12px] text-label">In Aiven: pagina del servizio → "CA certificate" → Show o download.</div>
        </Field>
      )}
      {msg && <div className={cx('text-[13px] font-medium', msg.ok ? 'text-ok' : 'text-err')}>{msg.ok ? '● ' : ''}{msg.text}</div>}
      <div className="flex gap-2 justify-end">
        {value && <button className="btn-secondary mr-auto" disabled={!!busy} onClick={remove}>Scollega</button>}
        <button className="btn-secondary" disabled={!!busy} onClick={test}>{busy === 'test' ? 'Prova in corso…' : 'Prova connessione'}</button>
        <button className="btn-primary" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Collegamento…' : 'Salva e usa questo database'}</button>
      </div>
      <div className="text-[12px] text-label leading-snug">Utente e password del database restano in questa app, su questo computer, e non vengono inviati a nessun altro. Il server dei pazienti ha bisogno degli stessi dati nelle sue impostazioni (vedi server/README.md).</div>
    </div>
  );
}
