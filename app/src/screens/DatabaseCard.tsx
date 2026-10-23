// Impostazioni → Privacy & sicurezza: stato dell'archivio, backup e ripristino.
import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import * as repo from '../db/repo';
import { backupDatabase, databaseInfo, isTauri, listBackups, restoreDatabase, type BackupInfo, type DbInfo } from '../db/driver';
import { LATEST_VERSION } from '../db/migrate';
import { today } from '../lib/format';
import { openFolder } from '../lib/platform';

const LABELS: Record<string, string> = { patients: 'Pazienti', visits: 'Visite', plans: 'Piani', documents: 'PDF', appointments: 'Appuntamenti', payments: 'Pagamenti' };

const size = (b: number) => (b < 1024 ** 2 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB`);
/** "nutrea-2026-10-23_075223-prima-della-migrazione-v2-v3.db" → "Prima della migrazione v2 → v3" */
const kind = (file: string) => {
  const m = /^nutrea-[\d-]+_\d+-(.+)\.db$/.exec(file);
  if (!m) return file;
  const mig = /^prima-della-migrazione-v(\d+)-v(\d+)$/.exec(m[1]);
  if (mig) return `Prima dell'aggiornamento v${mig[1]} → v${mig[2]}`;
  const s = m[1].replace(/-/g, ' ');
  return s[0].toUpperCase() + s.slice(1);
};
const when = (secs: number) => new Date(secs * 1000).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function DatabaseCard() {
  const { toast, confirm } = useApp();
  const [stats, setStats] = useState<repo.DbStats | null>(null);
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const native = isTauri();

  const load = async () => {
    setStats(await repo.databaseStats());
    if (native) { setInfo(await databaseInfo()); setBackups(await listBackups()); }
  };
  useEffect(() => { load().catch((e) => toast(String(e?.message ?? e))); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { toast(String(e?.message ?? e)); } finally { setBusy(false); }
  };

  const backupNow = () => run(async () => {
    await backupDatabase('manuale');
    await load();
    toast('Backup creato');
  });
  const backupAs = () => run(async () => {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { documentDir, join } = await import('@tauri-apps/api/path');
    const dest = await save({ defaultPath: await join(await documentDir(), `Nutrea_backup_${today()}.db`), filters: [{ name: 'Database Nutrea', extensions: ['db'] }] });
    if (!dest) return;
    await backupDatabase('manuale', dest);
    toast('Backup salvato');
  });
  const restore = (path?: string) => run(async () => {
    let src = path;
    if (!src) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({ multiple: false, filters: [{ name: 'Database Nutrea', extensions: ['db'] }] });
      if (!picked) return;
      src = picked as string;
    }
    const ok = await confirm({
      title: 'Ripristinare questo backup?',
      body: "L'archivio attuale verrà sostituito. Prima del ripristino ne viene salvata una copia tra i backup, così puoi tornare indietro.",
      ok: 'Ripristina', danger: true,
    });
    if (!ok) return;
    await restoreDatabase(src);
    // Ricarica l'app: all'avvio le migrazioni portano il backup allo schema attuale.
    window.location.reload();
  });

  const healthy = stats?.integrity === 'ok';
  return (
    <div className="card px-6 py-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-semibold text-[15px]">Archivio e backup</div>
        {stats && (
          <span className={healthy ? 'text-[12.5px] text-ok' : 'text-[12.5px] text-err font-medium'}>
            {healthy ? '● Integrità verificata' : `● Problema di integrità: ${stats.integrity}`}
          </span>
        )}
      </div>
      {stats && (
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(LABELS).map(([k, l]) => (
            <div key={k} className="bg-canvas rounded-[10px] px-3 py-2">
              <div className="text-[11.5px] text-label">{l}</div>
              <div className="font-semibold tabular-nums">{stats.counts[k] ?? 0}</div>
            </div>
          ))}
        </div>
      )}
      <div className="text-[12.5px] text-muted">
        Schema v{stats?.schemaVersion ?? '…'}{stats && stats.schemaVersion !== LATEST_VERSION && ` (atteso v${LATEST_VERSION})`}
        {info && <> · {size(info.size)} · <span className="font-mono">{info.path}</span></>}
        {stats && stats.documentsBytes > 0 && <> · PDF {size(stats.documentsBytes)}</>}
      </div>

      {native ? <>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" disabled={busy} onClick={backupNow}>Crea backup ora</button>
          <button className="btn-secondary" disabled={busy} onClick={backupAs}>Salva copia in…</button>
          <button className="btn-secondary" disabled={busy} onClick={() => restore()}>Ripristina da file…</button>
          {info && <button className="btn-secondary" onClick={() => openFolder(info.backupsDir)}>Apri cartella backup</button>}
        </div>
        <div className="text-[12.5px] text-label">Un backup automatico viene creato ogni giorno all'avvio (si conservano gli ultimi 14) e prima di ogni aggiornamento dello schema.</div>
        {backups.length > 0 && (
          <div className="border border-line2 rounded-[10px] max-h-[220px] overflow-auto">
            {backups.map((b) => (
              <div key={b.path} className="flex items-center gap-3 px-3.5 py-2 border-t border-line2 first:border-t-0 text-[13px]">
                <span className="truncate flex-1" title={b.path}>{kind(b.name)}</span>
                <span className="text-label tabular-nums">{when(b.modified)}</span>
                <span className="text-label tabular-nums w-16 text-right">{size(b.size)}</span>
                <button className="btn-secondary px-2.5 py-1 text-[12.5px]" disabled={busy} onClick={() => restore(b.path)}>Ripristina</button>
              </div>
            ))}
          </div>
        )}
      </> : (
        <div className="text-[12.5px] text-label">Nel browser i dati restano nella memoria locale del browser: backup e ripristino sono disponibili nell'app desktop.</div>
      )}
    </div>
  );
}
