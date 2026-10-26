// Avvio del server: legge la configurazione, aggiorna lo schema del database e resta in ascolto.
import { loadConfig, loadDotEnv } from './config.js';
import { connect, migrate } from './db.js';
import { buildApp } from './app.js';

loadDotEnv();
const config = loadConfig();
const db = connect(config.db);
if (config.migrateOnStart) {
  const applied = await migrate(db);
  if (applied.length) console.log(`Migrazioni applicate: ${applied.join(', ')}`);
}
const app = await buildApp({ db, config });
await app.listen({ port: config.port, host: config.host });
console.log(`Nutrea server su http://${config.host}:${config.port} · database ${config.db.client} · web app ${config.webOrigin}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, async () => { await app.close(); await db.destroy(); process.exit(0); });
