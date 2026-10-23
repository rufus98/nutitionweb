//! Accesso a SQLite per il frontend.
//!
//! Una sola connessione (protetta da Mutex) per tutta l'app: così `PRAGMA foreign_keys`, le transazioni e
//! l'ordine delle scritture sono garantiti. Il frontend invia SQL con parametri posizionali (`?`):
//! - `db_query`       → righe come oggetti JSON
//! - `db_execute`     → righe modificate + ultimo id inserito
//! - `db_transaction` → più istruzioni in modo atomico (tutte o nessuna)
//! Inoltre gestisce backup (VACUUM INTO), ripristino e backup giornalieri automatici.

use rusqlite::{params_from_iter, types::Value as SqlValue, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const DB_FILE: &str = "nutrea.db";

pub struct Db {
    conn: Mutex<Option<Connection>>,
    pub path: PathBuf,
    pub backups: PathBuf,
}

#[derive(Debug, Deserialize)]
pub struct Stmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
    /// Script con più istruzioni separate da `;` (es. una migrazione), senza parametri.
    #[serde(default)]
    pub script: bool,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub rows_affected: usize,
    pub last_insert_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbInfo {
    pub path: String,
    pub backups_dir: String,
    pub size: u64,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Apre il file e imposta i PRAGMA usati da tutta l'app.
pub fn open(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(err)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(err)?;
    Ok(conn)
}

/// JSON → valore SQLite. I booleani diventano 1/0, oggetti e array testo JSON.
fn to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().unwrap_or(0.0)),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

/// Valore SQLite → JSON. I BLOB (non usati dall'app) diventano array di byte.
fn to_json(v: SqlValue) -> Value {
    match v {
        SqlValue::Null => Value::Null,
        SqlValue::Integer(i) => Value::from(i),
        SqlValue::Real(f) => serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        SqlValue::Text(s) => Value::String(s),
        SqlValue::Blob(b) => Value::from(b),
    }
}

pub fn query(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
    let mut st = conn.prepare(sql).map_err(err)?;
    let names: Vec<String> = st.column_names().into_iter().map(String::from).collect();
    let mut rows = st.query(params_from_iter(params.iter().map(to_sql))).map_err(err)?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(err)? {
        let mut obj = Map::with_capacity(names.len());
        for (i, name) in names.iter().enumerate() {
            obj.insert(name.clone(), to_json(row.get::<_, SqlValue>(i).map_err(err)?));
        }
        out.push(obj);
    }
    Ok(out)
}

pub fn execute(conn: &Connection, sql: &str, params: &[Value]) -> Result<ExecResult, String> {
    let rows_affected = conn.execute(sql, params_from_iter(params.iter().map(to_sql))).map_err(err)?;
    Ok(ExecResult { rows_affected, last_insert_id: conn.last_insert_rowid() })
}

/// Esegue tutte le istruzioni in un'unica transazione: se una fallisce, nessuna modifica resta salvata.
pub fn transaction(conn: &mut Connection, stmts: &[Stmt]) -> Result<Vec<ExecResult>, String> {
    let tx = conn.transaction().map_err(err)?;
    let mut out = Vec::with_capacity(stmts.len());
    for s in stmts {
        if s.script {
            tx.execute_batch(&s.sql).map_err(|e| format!("{e} — nello script"))?;
            out.push(ExecResult { rows_affected: 0, last_insert_id: tx.last_insert_rowid() });
        } else {
            out.push(execute(&tx, &s.sql, &s.params).map_err(|e| format!("{e} — in: {}", s.sql.trim()))?);
        }
    }
    tx.commit().map_err(err)?;
    Ok(out)
}

/// Copia coerente del database (anche con WAL attivo) in un nuovo file.
pub fn backup_to(conn: &Connection, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        fs::remove_file(dest).map_err(err)?;
    }
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    conn.execute("VACUUM INTO ?1", [dest.to_string_lossy().to_string()]).map_err(err)?;
    Ok(())
}

/// Controlla che un file sia un database Nutrea Studio integro prima di ripristinarlo.
pub fn validate(path: &Path) -> Result<(), String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|_| "Il file non è un database leggibile".to_string())?;
    let ok: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|_| "Il file non è un database SQLite".to_string())?;
    if ok != "ok" {
        return Err(format!("Il database è danneggiato: {ok}"));
    }
    let has: i64 = conn
        .query_row("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'patients'", [], |r| r.get(0))
        .map_err(err)?;
    if has == 0 {
        return Err("Il file non contiene dati di Nutrea Studio".into());
    }
    Ok(())
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn sanitize(label: &str) -> String {
    label.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' }).collect()
}

impl Db {
    pub fn new(dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(err)?;
        let path = dir.join(DB_FILE);
        let conn = open(&path)?;
        Ok(Db { conn: Mutex::new(Some(conn)), path, backups: dir.join("backups") })
    }

    fn with<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T, String>) -> Result<T, String> {
        let mut guard = self.conn.lock().map_err(|_| "Database non disponibile".to_string())?;
        let conn = guard.as_mut().ok_or("Database chiuso")?;
        f(conn)
    }

    pub fn backup(&self, label: &str) -> Result<PathBuf, String> {
        let name = format!("nutrea-{}-{}.db", chrono::Local::now().format("%Y-%m-%d_%H%M%S"), sanitize(label));
        let dest = self.backups.join(name);
        self.with(|c| backup_to(c, &dest))?;
        Ok(dest)
    }

    /// Un backup al giorno (al primo avvio della giornata), conservando gli ultimi `keep`.
    pub fn auto_backup(&self, keep: usize) -> Result<Option<PathBuf>, String> {
        let has_data = self.with(|c| {
            let n: i64 = c
                .query_row("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'patients'", [], |r| r.get(0))
                .map_err(err)?;
            Ok(n > 0)
        })?;
        if !has_data {
            return Ok(None);
        }
        let prefix = format!("nutrea-{}_", today());
        let list = self.list_backups()?;
        let made = if list.iter().any(|b| b.name.starts_with(&prefix) && b.name.ends_with("-automatico.db")) {
            None
        } else {
            Some(self.backup("automatico")?)
        };
        // Pulizia: tiene solo gli ultimi `keep` backup automatici (quelli manuali restano).
        let mut autos: Vec<_> = self.list_backups()?.into_iter().filter(|b| b.name.ends_with("-automatico.db")).collect();
        autos.sort_by(|a, b| b.name.cmp(&a.name));
        for old in autos.into_iter().skip(keep) {
            let _ = fs::remove_file(old.path);
        }
        Ok(made)
    }

    pub fn list_backups(&self) -> Result<Vec<BackupInfo>, String> {
        let mut out = Vec::new();
        if let Ok(rd) = fs::read_dir(&self.backups) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) != Some("db") {
                    continue;
                }
                let meta = e.metadata().map_err(err)?;
                let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
                out.push(BackupInfo { path: p.to_string_lossy().into(), name: e.file_name().to_string_lossy().into(), size: meta.len(), modified });
            }
        }
        out.sort_by(|a, b| b.name.cmp(&a.name));
        Ok(out)
    }

    /// Sostituisce il database con un backup: salva prima una copia dello stato attuale.
    pub fn restore(&self, src: &Path) -> Result<PathBuf, String> {
        validate(src)?;
        let safety = self.backup("prima-del-ripristino")?;
        let mut guard = self.conn.lock().map_err(|_| "Database non disponibile".to_string())?;
        if let Some(c) = guard.take() {
            c.close().map_err(|(_, e)| err(e))?;
        }
        for ext in ["-wal", "-shm"] {
            let _ = fs::remove_file(PathBuf::from(format!("{}{ext}", self.path.to_string_lossy())));
        }
        let result = fs::copy(src, &self.path).map_err(err);
        *guard = Some(open(&self.path)?);
        result?;
        Ok(safety)
    }

    pub fn info(&self) -> DbInfo {
        DbInfo {
            path: self.path.to_string_lossy().into(),
            backups_dir: self.backups.to_string_lossy().into(),
            size: fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0),
        }
    }
}

// ----------------------------------------------------------------- comandi Tauri

type State<'a> = tauri::State<'a, Db>;

#[tauri::command]
pub fn db_query(db: State, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    db.with(|c| query(c, &sql, &params))
}

#[tauri::command]
pub fn db_execute(db: State, sql: String, params: Vec<Value>) -> Result<ExecResult, String> {
    db.with(|c| execute(c, &sql, &params))
}

#[tauri::command]
pub fn db_transaction(db: State, stmts: Vec<Stmt>) -> Result<Vec<ExecResult>, String> {
    db.with(|c| transaction(c, &stmts))
}

#[tauri::command]
pub fn db_backup(db: State, label: String, dest: Option<String>) -> Result<String, String> {
    match dest {
        Some(d) => {
            let p = PathBuf::from(d);
            db.with(|c| backup_to(c, &p))?;
            Ok(p.to_string_lossy().into())
        }
        None => db.backup(&label).map(|p| p.to_string_lossy().into()),
    }
}

#[tauri::command]
pub fn db_list_backups(db: State) -> Result<Vec<BackupInfo>, String> {
    db.list_backups()
}

#[tauri::command]
pub fn db_restore(db: State, src: String) -> Result<String, String> {
    db.restore(Path::new(&src)).map(|p| p.to_string_lossy().into())
}

#[tauri::command]
pub fn db_info(db: State) -> DbInfo {
    db.info()
}

// ----------------------------------------------------------------- test

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys = ON; CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT NOT NULL, b REAL, c INTEGER CHECK (c IN (0,1)));").unwrap();
        c
    }

    #[test]
    fn conversione_valori() {
        let c = mem();
        let r = execute(&c, "INSERT INTO t (a, b, c) VALUES (?, ?, ?)", &[json!("ciao"), json!(72.5), json!(true)]).unwrap();
        assert_eq!(r, ExecResult { rows_affected: 1, last_insert_id: 1 });
        let rows = query(&c, "SELECT * FROM t", &[]).unwrap();
        assert_eq!(Value::Object(rows[0].clone()), json!({ "id": 1, "a": "ciao", "b": 72.5, "c": 1 }));
    }

    #[test]
    fn transazione_atomica() {
        let mut c = mem();
        let ok = transaction(&mut c, &[Stmt { sql: "INSERT INTO t (a) VALUES (?)".into(), params: vec![json!("x")], script: false }]);
        assert!(ok.is_ok());
        // La seconda istruzione viola NOT NULL: anche la prima deve essere annullata.
        let ko = transaction(&mut c, &[
            Stmt { sql: "INSERT INTO t (a) VALUES (?)".into(), params: vec![json!("y")], script: false },
            Stmt { sql: "INSERT INTO t (a) VALUES ('z'); INSERT INTO t (a) VALUES (NULL);".into(), params: vec![], script: true },
        ]);
        assert!(ko.is_err());
        let n = query(&c, "SELECT count(*) AS n FROM t", &[]).unwrap();
        assert_eq!(n[0]["n"], json!(1));
    }

    #[test]
    fn backup_ripristino() {
        let dir = std::env::temp_dir().join(format!("nutrea-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = Db::new(&dir).unwrap();
        db.with(|c| { c.execute_batch("CREATE TABLE patients (id INTEGER PRIMARY KEY, n TEXT); INSERT INTO patients (n) VALUES ('a');").map_err(err) }).unwrap();
        let b = db.backup("test").unwrap();
        assert!(validate(&b).is_ok());
        db.with(|c| c.execute_batch("DELETE FROM patients;").map_err(err)).unwrap();
        db.restore(&b).unwrap();
        let n = db.with(|c| query(c, "SELECT count(*) AS n FROM patients", &[])).unwrap();
        assert_eq!(n[0]["n"], json!(1));
        // un file qualunque non deve essere accettato
        let junk = dir.join("junk.db");
        fs::write(&junk, b"non un database").unwrap();
        assert!(db.restore(&junk).is_err());
        assert_eq!(db.auto_backup(3).unwrap().is_some(), true);
        assert_eq!(db.auto_backup(3).unwrap().is_some(), false); // uno solo al giorno
        let _ = fs::remove_dir_all(&dir);
    }
}
