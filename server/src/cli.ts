// Comandi di servizio:
//   npm run migrate      crea/aggiorna le tabelle nel database configurato
//   npm run studio-key   genera la chiave dello studio (da incollare nell'app desktop) e il suo SHA-256 (per .env)
//   npm run schema-sql   scrive in sql/ lo schema per ogni database, per chi preferisce creare le tabelle a mano
import { randomCode, sha256 } from './crypto.js';

const cmd = process.argv[2];
if (cmd === 'studio-key') {
  const key = 'nutrea_' + randomCode(32);
  console.log(`Chiave dello studio (incollala in Nutrea Studio → Impostazioni → App paziente & link):\n\n  ${key}\n`);
  console.log(`Riga per il file .env del server (la chiave in chiaro NON va sul server):\n\n  STUDIO_KEY_SHA256=${sha256(key)}\n`);
} else if (cmd === 'migrate') {
  const { loadConfig, loadDotEnv } = await import('./config.js');
  const { connect, migrate } = await import('./db.js');
  loadDotEnv();
  const { loadSettings, resolveConfigKey, toConnection } = await import('./dbSettings.js');
  const config = loadConfig();
  const saved = loadSettings(config.dataDir, resolveConfigKey(config.dataDir, config.configKey, false));
  const conn = saved ? toConnection(saved, config.dataDir) : config.db;
  if (!conn) { console.log("Nessun database configurato (DATABASE_URL o configurazione dell'amministratore)"); process.exit(1); }
  const db = connect(conn);
  const applied = await migrate(db);
  console.log(applied.length ? `Migrazioni applicate: ${applied.join(', ')}` : 'Database già aggiornato');
  await db.destroy();
} else if (cmd === 'schema-sql') {
  const { default: knexFactory } = await import('knex');
  const { builders } = await import('./migrations/001_accessi_pazienti.js');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('sql', { recursive: true });
  for (const [client, file] of [['pg', 'postgresql'], ['mysql2', 'mysql'], ['mssql', 'sqlserver'], ['better-sqlite3', 'sqlite']] as const) {
    const k = knexFactory({ client, useNullAsDefault: true });
    const sql = builders(k).map((b) => b.toString().replace(/;?$/, ';')).join('\n\n');
    writeFileSync(`sql/schema.${file}.sql`, `-- Schema del server Nutrea per ${file} (generato da npm run schema-sql: non modificare a mano).\n-- Normalmente non serve: il server crea le tabelle da solo all'avvio (MIGRATE_ON_START).\n\n${sql}\n`);
    await k.destroy();
  }
  console.log('Scritti sql/schema.{postgresql,mysql,sqlserver,sqlite}.sql');
} else {
  console.log('Uso: npm run migrate | npm run studio-key | npm run schema-sql');
  process.exit(1);
}
