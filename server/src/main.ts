// Avvio del server: legge la configurazione, si collega al database e resta in ascolto.
// Il database viene, in ordine: dalla configurazione salvata dall'amministratore (DATA_DIR/database.json.enc),
// oppure da DATABASE_URL. Se manca o non è raggiungibile, il server parte lo stesso in "modalità configurazione":
// risponde 503 a studio e pazienti finché l'amministratore non configura il database dall'app desktop.
import { loadConfig, loadDotEnv } from './config.js';
import { DatabaseManager } from './db.js';
import { loadSettings, toConnection } from './dbSettings.js';
import { connectionError } from './admin.js';
import { buildApp } from './app.js';

loadDotEnv();
const config = loadConfig();
const manager = new DatabaseManager();
const saved = loadSettings(config.dataDir, config.configKey);
const source = saved ? 'admin' as const : config.db ? 'env' as const : null;
const conn = saved ? toConnection(saved, config.dataDir) : config.db;
if (conn) {
  try {
    await manager.use(conn, source!, { migrate: config.migrateOnStart });
    console.log(`Database ${conn.client} collegato (${source === 'admin' ? "configurato dall'amministratore" : 'DATABASE_URL'}) · ${manager.status.version}`);
  } catch (e) {
    manager.fail(connectionError(e), source, conn.client);
    console.error(`Database non raggiungibile: ${manager.status.error}. Il server resta in modalità configurazione.`);
  }
} else {
  console.log("Nessun database configurato: modalità configurazione (l'amministratore lo imposta dall'app desktop).");
}
if (!config.adminKeyHash) console.log('Amministrazione disattivata: imposta ADMIN_KEY_SHA256 per configurare il database dall\'app desktop.');

const app = await buildApp({ database: manager, config });
await app.listen({ port: config.port, host: config.host });
console.log(`Nutrea server su http://${config.host}:${config.port} · web app ${config.webOrigin}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, async () => { await app.close(); await manager.close(); process.exit(0); });
