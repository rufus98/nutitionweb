// Impostazioni → Amministrazione (solo con Nutrea Studio avviato come amministratore):
// database esterno usato dal server dell'app paziente, e quindi da app desktop e web app.
import { useState } from 'react';
import { useApp } from '../app/store';
import * as repo from '../db/repo';
import { Field, Toggle, cx } from '../components/ui';
import { adminDbSave, adminDbStatus, adminDbTest, parseDbUri, type DbAdminStatus, type DbClient, type DbSettings } from '../lib/remote';

const CLIENTS: [DbClient, string, number | null][] = [['mysql2', 'MySQL / MariaDB (es. Aiven)', 3306], ['pg', 'PostgreSQL', 5432], ['mssql', 'SQL Server', 1433], ['better-sqlite3', 'SQLite (file sul server)', null]];
const label = (c: DbClient | null) => CLIENTS.find((x) => x[0] === c)?.[1] ?? '—';
const empty: DbSettings = { client: 'mysql2', host: '', port: '', database: 'defaultdb', user: '', password: '', ssl: true, filename: 'nutrea.sqlite' };

export function AdminDatabaseCard({ serverUrl }: { serverUrl: string }) {
  const { toast, confirm, bump } = useApp();
  // La chiave dell'amministratore resta solo in memoria finché la schermata è aperta.
  const [adminKey, setAdminKey] = useState('');
  const [status, setStatus] = useState<DbAdminStatus | null>(null);
  const [f, setF] = useState<DbSettings>(empty);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ca, setCa] = useState('');            // certificato CA incollato o caricato (PEM)
  const [dropCa, setDropCa] = useState(false);  // togliere il certificato già salvato
  const [busy, setBusy] = useState<'' | 'connect' | 'test' | 'save'>('');
  const sqlite = f.client === 'better-sqlite3';
  const port = CLIENTS.find((x) => x[0] === f.client)![2];

  const run = async (what: typeof busy, fn: () => Promise<void>) => {
    setBusy(what); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); } finally { setBusy(''); }
  };
  const connect = () => run('connect', async () => {
    const s = await adminDbStatus(serverUrl, adminKey);
    setStatus(s);
    if (s.settings) setF({ ...empty, ...s.settings, port: s.settings.port ?? '', password: '' });
  });
  const savedCa = status?.settings?.caInfo ?? null;
  const body = (): DbSettings => sqlite ? { client: f.client, filename: f.filename }
    : { client: f.client, host: f.host, port: f.port === '' ? undefined : Number(f.port), database: f.database, user: f.user, ssl: f.ssl, ...(f.password ? { password: f.password } : {}), ...(ca.trim() ? { ca: ca.trim() } : dropCa ? { ca: '' } : {}) };
  // Indirizzo del servizio (Aiven: "Service URI"): compila i campi e non lo conserva.
  const fromUri = (text: string) => {
    if (!text.trim()) return;
    try { const p = parseDbUri(text); setMsg({ ok: true, text: p.user && p.password ? 'Campi compilati dall\'indirizzo.' : 'Campi compilati. Mancano utente e password: il Service URI li nasconde, copiali dal pannello del servizio.' }); setF((x) => ({ ...x, ...p, user: p.user || x.user, password: p.password || x.password })); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  const loadCaFile = async (file?: File) => { if (file) { setCa(await file.text()); setDropCa(false); setMsg(null); } };
  const test = () => run('test', async () => { const r = await adminDbTest(serverUrl, adminKey, body()); setMsg({ ok: true, text: `Connessione riuscita · ${r.version}` }); });
  const save = async () => {
    const ok = await confirm({
      title: 'Usare questo database?',
      body: "Il server si collega subito al nuovo database e crea le tabelle se mancano. I dati dei pazienti con il link vengono inviati di nuovo in automatico; se il database è nuovo, i pazienti dovranno riattivare l'accesso con un nuovo link.",
      ok: 'Usa questo database',
    });
    if (!ok) return;
    await run('save', async () => {
      // Un altro database (non solo un'altra password o un altro certificato): i dati vanno reinviati.
      const a = status?.settings, b = body();
      const changed = !a || a.client !== b.client || a.host !== b.host || a.port !== (b.port ?? a.port) || a.database !== b.database || a.user !== b.user || a.filename !== b.filename;
      const s = await adminDbSave(serverUrl, adminKey, b);
      setStatus(s);
      setF((x) => ({ ...x, password: '' })); setCa(''); setDropCa(false);
      if (changed) { await repo.resetRemoteSync(); bump(); }
      toast(`Database collegato: ${label(s.client)}`);
    });
  };
  const set = (patch: Partial<DbSettings>) => { setMsg(null); setF((x) => ({ ...x, ...patch })); };

  return (
    <div className="card px-6 py-[22px] flex flex-col gap-4">
      <div>
        <div className="font-semibold text-[17px]">Database esterno</div>
        <div className="text-[13px] text-label">Il database in cui il server salva i dati dei pazienti con il link: lo usano sia questa app sia la web app dei pazienti.</div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <Field label="Chiave dell'amministratore (non viene salvata)">
          <input type="password" autoComplete="off" className="field font-mono text-[13px]" placeholder="nutrea_admin_…" value={adminKey} onChange={(e) => { setAdminKey(e.target.value.trim()); setStatus(null); }} onKeyDown={(e) => e.key === 'Enter' && connect()} />
        </Field>
        <button className="btn-secondary" disabled={!!busy || !adminKey || !serverUrl} onClick={connect}>{busy === 'connect' ? 'Collegamento…' : 'Collegati al server'}</button>
      </div>
      {!serverUrl && <div className="text-[12.5px] text-warn">Inserisci prima l'indirizzo del server qui sopra.</div>}

      {status && <>
        <div className={cx('rounded-[12px] px-4 py-3 text-[13px] flex flex-col gap-0.5', status.configured ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn')}>
          <span className="font-semibold">{status.configured ? `● Collegato a ${label(status.client)}` : status.error ? '● Database non raggiungibile' : '● Nessun database configurato'}</span>
          {status.configured && <span className="text-ink2">{status.version}{status.source === 'env' ? ' · impostato nel file .env del server' : ''}</span>}
          {status.error && <span>{status.error}</span>}
          {!status.canSave && <span className="text-warn">Il server non ha CONFIG_KEY: non può salvare una nuova configurazione (vedi server/README.md).</span>}
        </div>

        {!sqlite && (
          <Field label="Incolla il Service URI (facoltativo)">
            <input autoComplete="off" spellCheck={false} className="field font-mono text-[13px]" placeholder="mysql://avnadmin:…@mysql-….aivencloud.com:19116/defaultdb?ssl-mode=REQUIRED"
              value="" onChange={() => {}} onPaste={(e) => { e.preventDefault(); fromUri(e.clipboardData.getData('text')); }} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo di database">
            <select className="field" value={f.client} onChange={(e) => set({ client: e.target.value as DbClient, port: '' })}>
              {CLIENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          {sqlite
            ? <Field label="File sul server"><input className="field font-mono text-[13px]" value={f.filename} onChange={(e) => set({ filename: e.target.value })} /></Field>
            : <Field label="Nome del database"><input className="field font-mono text-[13px]" value={f.database} onChange={(e) => set({ database: e.target.value })} /></Field>}
        </div>
        {!sqlite && <>
          <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3">
            <Field label="Indirizzo (host)"><input className="field font-mono text-[13px]" placeholder="db.esempio.it" value={f.host} onChange={(e) => set({ host: e.target.value.trim() })} /></Field>
            <Field label="Porta"><input inputMode="numeric" className="field font-mono text-[13px]" placeholder={String(port)} value={f.port ?? ''} onChange={(e) => set({ port: e.target.value.replace(/\D/g, '') === '' ? '' : Number(e.target.value.replace(/\D/g, '')) })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Utente"><input autoComplete="off" className="field font-mono text-[13px]" value={f.user} onChange={(e) => set({ user: e.target.value.trim() })} /></Field>
            <Field label="Password"><input type="password" autoComplete="new-password" className="field font-mono text-[13px]" placeholder={status.settings?.hasPassword ? 'invariata' : ''} value={f.password} onChange={(e) => set({ password: e.target.value })} /></Field>
          </div>
          <div className="flex justify-between items-center gap-4 py-1">
            <div><div className="font-medium text-[13.5px]">Connessione cifrata (SSL mode: REQUIRED)</div><div className="text-[12.5px] text-label">Necessaria con Aiven; consigliata quando il database è su Internet</div></div>
            <Toggle on={!!f.ssl} onClick={() => set({ ssl: !f.ssl })} label="SSL" />
          </div>
          {f.ssl && (
            <Field label="Certificato CA (CA certificate)">
              {savedCa && !ca && !dropCa && (
                <div className="flex justify-between items-center gap-3 text-[13px]">
                  <span className="text-ink2">● Salvato: {savedCa.subject} · scade il {new Date(savedCa.validTo).toLocaleDateString('it-IT')}</span>
                  <button className="btn-secondary" onClick={() => setDropCa(true)}>Rimuovi</button>
                </div>
              )}
              {(!savedCa || ca || dropCa) && <>
                <textarea spellCheck={false} rows={4} className="field font-mono text-[12px]" placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'} value={ca} onChange={(e) => { setCa(e.target.value); setDropCa(false); setMsg(null); }} />
                <label className="text-[12.5px] text-label">Oppure carica il file: <input type="file" accept=".pem,.crt,.cer,.txt" onChange={(e) => loadCaFile(e.target.files?.[0])} /></label>
              </>}
              <div className="text-[12px] text-label">In Aiven: pagina del servizio → "CA certificate" → Show o download. Senza, il certificato del database non si può verificare.</div>
            </Field>
          )}
        </>}

        {msg && <div className={cx('text-[13px] font-medium', msg.ok ? 'text-ok' : 'text-err')}>{msg.ok ? '● ' : ''}{msg.text}</div>}
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" disabled={!!busy} onClick={test}>{busy === 'test' ? 'Prova in corso…' : 'Prova connessione'}</button>
          <button className="btn-primary" disabled={!!busy || !status.canSave} onClick={save}>{busy === 'save' ? 'Collegamento…' : 'Salva e usa questo database'}</button>
        </div>
        <div className="text-[12px] text-label leading-snug">I dati di accesso al database vengono inviati al server e salvati lì cifrati (AES-256-GCM): questa app non li conserva. La password non viene mai mostrata.</div>
      </>}
      {!status && msg && <div className="text-[13px] font-medium text-err">{msg.text}</div>}
    </div>
  );
}
