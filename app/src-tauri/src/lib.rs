mod db;

use tauri::Manager;

/// Backup automatici giornalieri conservati.
const AUTO_BACKUPS: usize = 14;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Una sola istanza: un secondo avvio riporta in primo piano la finestra esistente.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Stessa cartella usata dalle versioni precedenti (tauri-plugin-sql): i dati esistenti restano dove sono.
            let dir = app.path().app_config_dir()?;
            let database = db::Db::new(&dir).map_err(|e| format!("Impossibile aprire il database: {e}"))?;
            if let Err(e) = database.auto_backup(AUTO_BACKUPS) {
                eprintln!("backup automatico non riuscito: {e}");
            }
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_query,
            db::db_execute,
            db::db_transaction,
            db::db_backup,
            db::db_list_backups,
            db::db_restore,
            db::db_info,
        ])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio di Nutrea Studio");
}
