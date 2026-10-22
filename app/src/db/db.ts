// Accesso a SQLite con due backend:
//  - dentro Tauri: tauri-plugin-sql (file nutrea.db nella cartella dati dell'app);
//  - nel browser (sviluppo/test UI): sql.js in memoria, salvato in IndexedDB.
// Le query sono le stesse per entrambi i backend (parametri posizionali `?`).

export type Row = Record<string, any>;
export interface Db {
  select<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }>;
}

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// I booleani diventano 1/0 in entrambi i backend: tauri-plugin-sql altrimenti li salverebbe come testo 'true'/'false'.
const norm = (params: unknown[]) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p)) as any[];

async function tauriDb(): Promise<Db> {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  const db = await Database.load('sqlite:nutrea.db');
  await db.execute('PRAGMA foreign_keys = ON');
  return {
    select: (sql, params = []) => db.select(sql, norm(params)),
    execute: async (sql, params = []) => {
      const r = await db.execute(sql, norm(params));
      return { lastInsertId: Number(r.lastInsertId ?? 0), rowsAffected: r.rowsAffected };
    },
  };
}

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

export async function sqlJsDb(persist = true): Promise<Db> {
  const { default: initSqlJs } = await import('sql.js');
  const wasmUrl = persist ? (await import('sql.js/dist/sql-wasm.wasm?url')).default : undefined;
  const SQL = await initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  let saved: Uint8Array | undefined;
  if (persist) {
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
  return {
    async select(sql, params = []) {
      const st = db.prepare(sql);
      st.bind(norm(params));
      const out: any[] = [];
      while (st.step()) out.push(st.getAsObject());
      st.free();
      return out;
    },
    async execute(sql, params = []) {
      db.run(sql, norm(params));
      const rowsAffected = db.getRowsModified();
      const id = db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0];
      save();
      return { lastInsertId: Number(id ?? 0), rowsAffected };
    },
  };
}

let current: Promise<Db> | null = null;
export function getDb(): Promise<Db> {
  if (!current) current = isTauri() ? tauriDb() : sqlJsDb();
  return current;
}
/** Solo per i test: sostituisce il database. */
export function setDb(db: Db) { current = Promise.resolve(db); }
