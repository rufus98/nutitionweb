//! Database MySQL esterno (es. Aiven) usato direttamente dall'app desktop: i dati dei pazienti con il link finiscono qui
//! e la web app dei pazienti (tramite il suo server) li legge dallo stesso database.
//! Una sola funzione per tutte le query: le istruzioni SQL sono scritte in `src/lib/remoteDb.ts`.
use mysql::prelude::Queryable;
use mysql::{Conn, OptsBuilder, Params, SslOpts, Value};
use serde::Deserialize;
use serde_json::{json, Map, Value as J};
use std::{fs, time::Duration};

#[derive(Deserialize)]
pub struct RemoteConn {
    host: String,
    port: u16,
    database: String,
    user: String,
    password: String,
    /// Connessione cifrata con verifica del certificato.
    ssl: bool,
    /// Certificato della CA del servizio (PEM), per i servizi con CA propria come Aiven.
    ca: Option<String>,
}

fn connect(c: &RemoteConn) -> Result<Conn, String> {
    let mut o = OptsBuilder::new()
        .ip_or_hostname(Some(c.host.clone()))
        .tcp_port(c.port)
        .db_name(Some(c.database.clone()))
        .user(Some(c.user.clone()))
        .pass(Some(c.password.clone()))
        .tcp_connect_timeout(Some(Duration::from_secs(10)))
        .read_timeout(Some(Duration::from_secs(30)))
        .write_timeout(Some(Duration::from_secs(30)))
        // Date sempre in UTC, come fa il server.
        .init(vec!["SET time_zone = '+00:00'", "SET NAMES utf8mb4"]);
    let mut ca_file = None;
    if c.ssl {
        let mut ssl = SslOpts::default();
        if let Some(ca) = c.ca.as_deref().filter(|s| !s.trim().is_empty()) {
            let path = std::env::temp_dir().join(format!("nutrea-ca-{}.pem", std::process::id()));
            fs::write(&path, ca).map_err(|e| format!("Certificato CA non scrivibile: {e}"))?;
            ssl = ssl.with_root_cert_path(Some(path.clone()));
            ca_file = Some(path);
        }
        o = o.ssl_opts(Some(ssl));
    }
    let conn = Conn::new(o).map_err(|e| e.to_string());
    if let Some(p) = ca_file { let _ = fs::remove_file(p); }
    conn
}

fn to_value(v: &J) -> Value {
    match v {
        J::Null => Value::NULL,
        J::Bool(b) => Value::Int(*b as i64),
        J::Number(n) => n.as_i64().map(Value::Int).or_else(|| n.as_f64().map(Value::Double)).unwrap_or(Value::NULL),
        J::String(s) => Value::Bytes(s.clone().into_bytes()),
        other => Value::Bytes(other.to_string().into_bytes()),
    }
}

fn to_json(v: Value) -> J {
    match v {
        Value::NULL => J::Null,
        Value::Bytes(b) => J::String(String::from_utf8_lossy(&b).into_owned()),
        Value::Int(i) => json!(i),
        Value::UInt(u) => json!(u),
        Value::Float(f) => json!(f),
        Value::Double(d) => json!(d),
        Value::Date(y, mo, d, h, mi, s, _) => J::String(format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{s:02}")),
        Value::Time(neg, d, h, mi, s, _) => J::String(format!("{}{:02}:{mi:02}:{s:02}", if neg { "-" } else { "" }, d * 24 + h as u32)),
    }
}

fn query(conn: &RemoteConn, sql: String, params: &[J]) -> Result<J, String> {
    let mut c = connect(conn)?;
    let version = c.server_version();
    let args = Params::Positional(params.iter().map(to_value).collect());
    let mut res = c.exec_iter(sql, args).map_err(|e| e.to_string())?;
    let mut rows = Vec::new();
    if let Some(set) = res.iter() {
        let cols: Vec<String> = set.columns().as_ref().iter().map(|c| c.name_str().into_owned()).collect();
        for row in set {
            let row = row.map_err(|e| e.to_string())?;
            let mut m = Map::new();
            for (name, v) in cols.iter().zip(row.unwrap()) { m.insert(name.clone(), to_json(v)); }
            rows.push(J::Object(m));
        }
    }
    let affected = res.affected_rows();
    drop(res);
    Ok(json!({ "rows": rows, "affected": affected, "version": format!("{}.{}.{}", version.0, version.1, version.2) }))
}

/// Esegue una query e restituisce `{ rows, affected, version }`. Ogni chiamata apre e chiude la sua connessione.
#[tauri::command]
pub async fn remote_sql(conn: RemoteConn, sql: String, params: Vec<J>) -> Result<J, String> {
    tauri::async_runtime::spawn_blocking(move || query(&conn, sql, &params)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Prova contro un MySQL vero (come Aiven: TLS con CA propria):
    /// NUTREA_TEST_MYSQL="host,porta,database,utente,password" e NUTREA_TEST_CA=percorso/ca.pem. Si esegue con `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn mysql_con_tls_e_ca() {
        let v = std::env::var("NUTREA_TEST_MYSQL").expect("NUTREA_TEST_MYSQL");
        let p: Vec<&str> = v.split(',').collect();
        let ca = fs::read_to_string(std::env::var("NUTREA_TEST_CA").expect("NUTREA_TEST_CA")).unwrap();
        let mk = |ssl: bool, ca: Option<String>| RemoteConn { host: p[0].into(), port: p[1].parse().unwrap(), database: p[2].into(), user: p[3].into(), password: p[4].into(), ssl, ca };
        // Senza SSL il server rifiuta; senza la CA il certificato non è verificabile.
        assert!(query(&mk(false, None), "select 1".into(), &[]).is_err());
        assert!(query(&mk(true, None), "select 1".into(), &[]).is_err());
        let r = query(&mk(true, Some(ca)), "select ? as n, ? as s, ? as nul, utc_timestamp() as t".into(), &[json!(42), json!("àè"), J::Null]).unwrap();
        assert_eq!(r["rows"][0]["n"], json!(42));
        assert_eq!(r["rows"][0]["s"], json!("àè"));
        assert_eq!(r["rows"][0]["nul"], J::Null);
        assert!(r["rows"][0]["t"].as_str().unwrap().len() == 19);
        println!("{}", r);
    }
}
