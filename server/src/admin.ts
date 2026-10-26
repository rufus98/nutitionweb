// API dell'amministratore: configurazione del database esterno usato dal server (e quindi da app desktop e web app).
// Protetta da una chiave diversa da quella dello studio ("Authorization: Bearer <chiave admin>"), che l'app desktop
// chiede ogni volta e non salva. Disponibile solo se ADMIN_KEY_SHA256 è impostata.
//   GET  /api/admin/database        stato: configurato, tipo, versione, impostazioni (senza password)
//   POST /api/admin/database/test   prova una configurazione senza usarla
//   PUT  /api/admin/database        si collega, crea le tabelle, passa al nuovo database e salva la configurazione cifrata
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import { sameHash, sha256 } from './crypto.js';
import { DatabaseManager } from './db.js';
import { loadSettings, publicSettings, saveSettings, toConnection, validateSettings, type DbSettings } from './dbSettings.js';
import { RateLimiter } from './rateLimit.js';

/** Messaggio leggibile per gli errori di connessione più comuni (senza dettagli che espongano la configurazione). */
export function connectionError(e: any): string {
  const code = e?.code ?? '';
  const msg = String(e?.message ?? e);
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Indirizzo del database non trovato';
  if (code === 'ECONNREFUSED') return 'Il database non accetta connessioni su quella porta';
  if (code === 'ETIMEDOUT' || /timeout/i.test(msg)) return 'Il database non risponde (tempo scaduto): controlla indirizzo, porta e firewall';
  if (code === '28P01' || code === 'ER_ACCESS_DENIED_ERROR' || code === 'ELOGIN' || /password authentication failed|access denied|login failed/i.test(msg)) return 'Utente o password del database non corretti';
  if (code === '3D000' || code === 'ER_BAD_DB_ERROR' || /does not exist|unknown database/i.test(msg)) return 'Il database indicato non esiste';
  if (/ssl|tls|certificate/i.test(msg)) return `Problema con la connessione cifrata (SSL): ${msg.slice(0, 120)}`;
  if (/Cannot find module|Knex: run/i.test(msg)) return 'Driver del database non installato sul server (per SQL Server: npm install tedious)';
  return `Connessione non riuscita: ${msg.slice(0, 160)}`;
}

export function registerAdmin(app: FastifyInstance, { config, manager }: { config: Config; manager: DatabaseManager }) {
  const failures = new RateLimiter(10, 15 * 60_000); // 10 chiavi sbagliate ogni 15 minuti per IP
  let saved: DbSettings | null = null;
  try { saved = loadSettings(config.dataDir, config.configKey); } catch { /* segnalato all'avvio */ }

  const admin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!config.adminKeyHash) return reply.code(404).send({ error: "Amministrazione non abilitata sul server: imposta ADMIN_KEY_SHA256 (npm run admin-key)" });
    const key = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!key || !sameHash(sha256(key), config.adminKeyHash)) {
      if (!failures.hit(req.ip)) return reply.code(429).send({ error: 'Troppi tentativi con una chiave sbagliata: riprova più tardi' });
      return reply.code(401).send({ error: "Chiave dell'amministratore non valida" });
    }
  };

  const state = () => ({
    ...manager.status,
    settings: manager.status.source === 'admin' && saved ? publicSettings(saved) : null,
    canSave: !!config.configKey,
  });

  /** Impostazioni ricevute: se la password non viene reinviata, si tiene quella salvata (stesso server e utente). */
  const settingsFrom = (body: unknown): DbSettings => {
    const s = validateSettings(body);
    if (s.client !== 'better-sqlite3' && s.password === undefined && saved && saved.client === s.client && saved.host === s.host && saved.user === s.user) s.password = saved.password;
    return s;
  };

  app.get('/api/admin/database', { preHandler: admin }, async () => state());

  app.post('/api/admin/database/test', { preHandler: admin }, async (req, reply) => {
    let s: DbSettings;
    try { s = settingsFrom(req.body); } catch (e: any) { return reply.code(400).send({ error: e.message }); }
    try { return { ok: true, version: await DatabaseManager.test(toConnection(s, config.dataDir)) }; }
    catch (e) { return reply.code(400).send({ error: connectionError(e) }); }
  });

  app.put('/api/admin/database', { preHandler: admin }, async (req, reply) => {
    if (!config.configKey) return reply.code(409).send({ error: 'Il server non può salvare la configurazione: imposta CONFIG_KEY (npm run admin-key)' });
    let s: DbSettings;
    try { s = settingsFrom(req.body); } catch (e: any) { return reply.code(400).send({ error: e.message }); }
    try { await manager.use(toConnection(s, config.dataDir), 'admin'); }
    catch (e) { return reply.code(400).send({ error: connectionError(e) }); }
    saveSettings(config.dataDir, config.configKey, s);
    saved = s;
    return state();
  });
}
