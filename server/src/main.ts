// Avvio del server: legge la configurazione, si collega al database e resta in ascolto.
// Il database viene, in ordine: dalla configurazione salvata dall'amministratore (DATA_DIR/database.json.enc),
// oppure da DATABASE_URL. Se manca o non è raggiungibile, il server parte lo stesso in "modalità configurazione":
// risponde 503 a studio e pazienti finché non lo configuri il database dall'app desktop.
import { loadConfig, loadDotEnv } from './config.js';
import { DatabaseManager } from './db.js';
import { loadSettings, resolveConfigKey, toConnection } from './dbSettings.js';
import { connectionError } from './admin.js';
import { buildApp } from './app.js';
import { loadClaimedKey } from './setup.js';

loadDotEnv();
const config = loadConfig();
if (!config.studioKeyHash) {
  config.studioKeyHash = loadClaimedKey(config.dataDir);
  if (!config.studioKeyHash) console.log("Server libero: il primo studio che lo collega da Nutrea Studio ne diventa il proprietario (o imposta STUDIO_KEY_SHA256).");
}
const manager = new DatabaseManager();
const saved = loadSettings(config.dataDir, resolveConfigKey(config.dataDir, config.configKey, false));
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
  console.log("Nessun database configurato: modalità configurazione (lo imposti da Nutrea Studio avviato come amministratore).");
}

const app = await buildApp({ database: manager, config });
await app.listen({ port: config.port, host: config.host });
console.log(`Nutrea server su http://${config.host}:${config.port} · web app ${config.webOrigin}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, async () => { await app.close(); await manager.close(); process.exit(0); });
