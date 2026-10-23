// Driver SQLite con la stessa interfaccia per i due ambienti:
//  - app desktop (Tauri): comandi Rust in src-tauri/src/db.rs, una sola connessione, transazioni vere;
//  - browser (sviluppo dell'interfaccia e test): sql.js in memoria, salvato in IndexedDB.
// Il resto del codice usa solo `Driver`: query con parametri posizionali `?`.

export type Row = Record<string, any>;
export interface ExecResult { rowsAffected: number; lastInsertId: number }
/** Istruzione di una transazione. `script: true` = più istruzioni separate da `;`, senza parametri. */
export interface Stmt { sql: string; params?: unknown[]; script?: boolean }

export interface Driver {
  readonly kind: 'tauri' | 'sqljs';
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<ExecResult>;
  /** Esegue tutte le istruzioni in modo atomico: o tutte o nessuna. */
  transaction(stmts: Stmt[]): Promise<ExecResult[]>;
}

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Normalizza i parametri: undefined → NULL, booleani → 1/0, oggetti → JSON. */
export const normParams = (params: unknown[] = []) =>
  params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p !== null && typeof p === 'object' ? JSON.stringify(p) : p)) as (string | number | null)[];

// ------------------------------------------------------------------ Tauri

async function tauriDriver(): Promise<Driver> {
  const { invoke } = await import('@tauri-apps/api/core');
  return {
    kind: 'tauri',
    query: (sql, params) => invoke('db_query', { sql, params: normParams(params) }),
    execute: (sql, params) => invoke('db_execute', { sql, params: normParams(params) }),
    transaction: (stmts) => invoke('db_transaction', { stmts: stmts.map((s) => ({ sql: s.sql, params: normParams(s.params), script: !!s.script })) }),
  };
}

// ------------------------------------------------------------------ sql.js (browser / test)

const IDB_NAME = 'nutrea-studio';
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('db');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('db', mode);
      const req = fn(tx.objectStore('db'));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    };
  });
}

/** `persist = false`: database solo in memoria (test). `initial`: contenuto iniziale (test di migrazione). */
export async function sqlJsDriver(persist = true, initial?: Uint8Array): Promise<Driver & { export(): Uint8Array }> {
  const { default: initSqlJs } = await import('sql.js');
  const wasmUrl = persist ? (await import('sql.js/dist/sql-wasm.wasm?url')).default : undefined;
  const SQL = await initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  let saved = initial;
  if (persist && !saved) {
    try { saved = await idb<Uint8Array | undefined>('readonly', (s) => s.get('main')); } catch { saved = undefined; }
  }
  const db = new SQL.Database(saved);
  db.run('PRAGMA foreign_keys = ON');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    if (!persist) return;
    clearTimeout(timer);
    timer = setTimeout(() => { idb('readwrite', (s) => s.put(db.export(), 'main')).catch(() => {}); }, 150);
  };
  const run = (sql: string, params?: unknown[]): ExecResult => {
    db.run(sql, normParams(params));
    return { rowsAffected: db.getRowsModified(), lastInsertId: Number(db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0) };
  };
  return {
    kind: 'sqljs',
    async query(sql, params) {
      const st = db.prepare(sql);
      try {
        st.bind(normParams(params));
        const out: any[] = [];
        while (st.step()) out.push(st.getAsObject());
        return out;
      } finally { st.free(); }
    },
    async execute(sql, params) {
      const r = run(sql, params);
      save();
      return r;
    },
    async transaction(stmts) {
      db.run('BEGIN');
      try {
        const out = stmts.map((s) => {
          if (!s.script) return run(s.sql, s.params);
          db.exec(s.sql);
          return { rowsAffected: 0, lastInsertId: 0 };
        });
        db.run('COMMIT');
        save();
        return out;
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
    },
    export: () => db.export(),
  };
}

// ------------------------------------------------------------------ istanza condivisa

let current: Promise<Driver> | null = null;
export function getDriver(): Promise<Driver> {
  if (!current) current = isTauri() ? tauriDriver() : sqlJsDriver();
  return current;
}
/** Solo per i test: sostituisce il driver. */
export function setDriver(d: Driver) { current = Promise.resolve(d); }

// ------------------------------------------------------------------ backup (solo app desktop)

export interface BackupInfo { path: string; name: string; size: number; modified: number }
export interface DbInfo { path: string; backupsDir: string; size: number }

export async function backupDatabase(label: string, dest?: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('db_backup', { label, dest: dest ?? null });
}
export async function listBackups(): Promise<BackupInfo[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('db_list_backups');
}
/** Sostituisce il database con il file indicato (dopo averlo verificato). Restituisce il backup di sicurezza creato prima. */
export async function restoreDatabase(src: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('db_restore', { src });
}
export async function databaseInfo(): Promise<DbInfo> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('db_info');
}
