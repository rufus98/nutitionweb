// API del server dell'app paziente.
//
// Studio (app desktop, "Authorization: Bearer <chiave dello studio>"):
//   GET    /api/studio/ping                      verifica configurazione e chiave
//   PUT    /api/studio/access/:token             crea/aggiorna l'accesso: email, nome e oggetto con tutti i dati della dieta
//   POST   /api/studio/access/:token/activation  nuovo link di attivazione (prima volta o password dimenticata)
//   PUT    /api/studio/access/:token/pdf         PDF originale del piano (o null per toglierlo)
//   GET    /api/studio/access/:token             stato dell'accesso e registro
//   DELETE /api/studio/access/:token             elimina tutto (paziente cancellato nello studio)
// Paziente (web app, link /p/:token + password):
//   POST   /api/p/:token/activate   { code, password } → imposta la password, apre la sessione
//   POST   /api/p/:token/login      { password }       → apre la sessione
//   GET    /api/p/:token                                → dati (sessione), 401 { state: 'activate' | 'login' }
//   GET    /api/p/:token/pdf · POST /api/p/:token/consent · POST /api/p/:token/logout
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import type { Knex } from 'knex';
import type { Config } from './config.js';
import { DatabaseManager, DbUnavailable, isConnectionError, toDate } from './db.js';
import { registerAdmin } from './admin.js';
import { hashPassword, passwordProblem, randomCode, sameHash, sha256, verifyPassword } from './crypto.js';
import { RateLimiter } from './rateLimit.js';

export const VIEW_VERSION = 1;
const TOKEN = /^[A-Za-z0-9_-]{6,64}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FAILED = 5, LOCK_MINUTES = 15;

interface AccessRow {
  id: number; token: string; email: string; first_name: string; status: 'pending' | 'active' | 'disabled';
  password_hash: string | null; activation_hash: string | null; activation_expires_at: unknown;
  view_json: string; pdf_name: string | null; pdf_b64: string | null; log_access: unknown; consent_at: unknown;
  failed_logins: number; locked_until: unknown; last_login_at: unknown; password_set_at: unknown; updated_at: unknown;
}

export interface AppDeps {
  /** Database fisso (test); in alternativa `database`, sostituibile dall'amministratore. */
  db?: Knex;
  database?: DatabaseManager;
  config: Config;
  now?: () => Date;
}

export async function buildApp({ db: fixed, database, config, now = () => new Date() }: AppDeps) {
  const manager = database ?? new DatabaseManager(fixed, config.db?.client);
  // Tutte le query passano dal database corrente: se l'amministratore lo cambia, le richieste successive usano il nuovo.
  const db: Knex = manager.proxy();
  const app = Fastify({ logger: false, trustProxy: config.trustProxy, bodyLimit: 2 * 1024 * 1024 });
  // Errori in JSON leggibile; i dettagli tecnici degli errori interni restano nel log del server.
  app.setErrorHandler((err: any, req, reply) => {
    const down = isConnectionError(err);
    const status = err instanceof DbUnavailable || down ? 503 : err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) console.error(err);
    if (down) console.warn(`Database non raggiungibile: ${err.code ?? ''} ${String(err.message).slice(0, 160)}`);
    // Al paziente un messaggio semplice (la web app mostra la copia salvata del piano, se c'è); allo studio il dettaglio.
    const error = status === 500 ? 'Errore interno del server'
      : status === 503 && req.url.startsWith('/api/p/') ? 'Servizio momentaneamente non disponibile: riprova tra qualche minuto'
      : down ? "Database non raggiungibile: potrebbe essere spento o in pausa (per i piani gratuiti, riaccendilo dal pannello del servizio)"
      : err.message;
    reply.code(status).send({ error });
  });
  await app.register(cors, { origin: config.corsOrigins === '*' ? '*' : config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'], maxAge: 600 });
  const limiter = new RateLimiter(20, 60_000); // tentativi di login/attivazione per IP al minuto

  // Nessuna risposta va in cache o nei motori di ricerca: contengono dati sanitari.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Content-Type-Options', 'nosniff');
  });

  const fail = (reply: FastifyReply, code: number, error: string, extra: object = {}) => reply.code(code).send({ error, ...extra });
  const find = (token: string) => db<AccessRow>('patient_access').where({ token }).first();
  const log = async (a: AccessRow, event: string) => { if (a.log_access) await db('patient_access_log').insert({ access_id: a.id, event, at: now() }); };
  const bearer = (req: FastifyRequest) => /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? null;

  // ——— Studio ———

  const studio = async (req: FastifyRequest, reply: FastifyReply) => {
    const key = bearer(req);
    if (!key || !sameHash(sha256(key), config.studioKeyHash)) return fail(reply, 401, 'Chiave dello studio non valida');
  };
  const tokenOf = (req: FastifyRequest, reply: FastifyReply) => {
    const t = (req.params as { token: string }).token;
    if (!TOKEN.test(t)) { fail(reply, 400, 'Token non valido'); return null; }
    return t;
  };
  const summary = (a: AccessRow) => ({
    token: a.token, status: a.status, hasPassword: !!a.password_hash,
    activationPending: !!a.activation_hash && (toDate(a.activation_expires_at)?.getTime() ?? 0) > now().getTime(),
    activationExpiresAt: toDate(a.activation_expires_at)?.toISOString() ?? null,
    lastLoginAt: toDate(a.last_login_at)?.toISOString() ?? null,
    consentAt: toDate(a.consent_at)?.toISOString() ?? null,
    hasPdf: !!a.pdf_b64,
  });

  app.get('/api/studio/ping', { preHandler: studio }, async () => ({ ok: true, server: 'nutrea', viewVersion: VIEW_VERSION, db: manager.status.client, database: manager.status.configured }));

  app.put('/api/studio/access/:token', { preHandler: studio }, async (req, reply) => {
    const token = tokenOf(req, reply); if (!token) return;
    const b = req.body as { email?: string; firstName?: string; view?: { v?: number }; active?: boolean; logAccess?: boolean } | undefined;
    const email = b?.email?.trim().toLowerCase() ?? '';
    if (!EMAIL.test(email)) return fail(reply, 400, 'Email del paziente non valida');
    if (!b?.firstName?.trim()) return fail(reply, 400, 'Nome del paziente mancante');
    if (b.view?.v !== VIEW_VERSION) return fail(reply, 400, `Formato dei dati non supportato (atteso v${VIEW_VERSION})`);
    const active = b.active !== false;
    const t = now();
    const existing = await find(token);
    const fields = { email, first_name: b.firstName.trim().slice(0, 100), view_json: JSON.stringify(b.view), view_version: VIEW_VERSION, log_access: !!b.logAccess, updated_at: t };
    if (!existing) {
      await db('patient_access').insert({ token, ...fields, status: active ? 'pending' : 'disabled', created_at: t });
    } else {
      const status = !active ? 'disabled' : existing.password_hash ? 'active' : 'pending';
      await db.transaction(async (trx) => {
        await trx('patient_access').where({ id: existing.id }).update({ ...fields, status });
        if (!active) await trx('patient_session').where({ access_id: existing.id }).delete(); // disattivato: fuori subito
      });
    }
    return summary((await find(token))!);
  });

  app.post('/api/studio/access/:token/activation', { preHandler: studio }, async (req, reply) => {
    const token = tokenOf(req, reply); if (!token) return;
    const a = await find(token);
    if (!a) return fail(reply, 404, 'Accesso non trovato: invia prima i dati del paziente');
    if (a.status === 'disabled') return fail(reply, 409, 'Accesso disattivato: riattivalo prima di inviare il link');
    const code = randomCode();
    const expiresAt = new Date(now().getTime() + config.activationDays * 864e5);
    await db('patient_access').where({ id: a.id }).update({ activation_hash: sha256(code), activation_expires_at: expiresAt, updated_at: now() });
    return { activationUrl: `${config.webOrigin}/p/${token}?a=${code}`, expiresAt: expiresAt.toISOString() };
  });

  app.put('/api/studio/access/:token/pdf', { preHandler: studio, bodyLimit: 30 * 1024 * 1024 }, async (req, reply) => {
    const token = tokenOf(req, reply); if (!token) return;
    const b = req.body as { name?: string; b64?: string } | null;
    const a = await find(token);
    if (!a) return fail(reply, 404, 'Accesso non trovato');
    if (b && (typeof b.b64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(b.b64) || !Buffer.from(b.b64.slice(0, 8), 'base64').toString('latin1').startsWith('%PDF'))) return fail(reply, 400, 'Il file non è un PDF');
    await db('patient_access').where({ id: a.id }).update({ pdf_name: b ? (b.name || 'piano.pdf').slice(0, 255) : null, pdf_b64: b?.b64 ?? null, updated_at: now() });
    return summary((await find(token))!);
  });

  app.get('/api/studio/access/:token', { preHandler: studio }, async (req, reply) => {
    const token = tokenOf(req, reply); if (!token) return;
    const a = await find(token);
    if (!a) return fail(reply, 404, 'Accesso non trovato');
    const events = await db('patient_access_log').where({ access_id: a.id }).orderBy('at', 'desc').limit(100).select('event', 'at');
    return { ...summary(a), log: events.map((e) => ({ event: e.event, at: toDate(e.at)!.toISOString() })) };
  });

  app.delete('/api/studio/access/:token', { preHandler: studio }, async (req, reply) => {
    const token = tokenOf(req, reply); if (!token) return;
    const a = await find(token);
    if (a) await db.transaction(async (trx) => {
      await trx('patient_access_log').where({ access_id: a.id }).delete();
      await trx('patient_session').where({ access_id: a.id }).delete();
      await trx('patient_access').where({ id: a.id }).delete();
    });
    return reply.code(204).send();
  });

  // ——— Paziente ———

  /** Ciò che si mostra prima del login (a chi ha il link): nome di battesimo e contatti dello studio, per chiedere aiuto. */
  const publicInfo = (a: AccessRow) => {
    let studio = { name: '', whatsapp: '' };
    try { const v = JSON.parse(a.view_json); studio = { name: v.studio?.name ?? '', whatsapp: v.studio?.whatsapp ?? '' }; } catch { /* dati illeggibili */ }
    return { firstName: a.first_name, studio };
  };
  /** Accesso dal link: 404 se non esiste, 410 se disattivato dallo studio. */
  const patientAccess = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = (req.params as { token: string }).token;
    if (!TOKEN.test(token)) { fail(reply, 404, 'Link non valido'); return null; }
    const a = await find(token);
    if (!a) { fail(reply, 404, 'Link non valido'); return null; }
    if (a.status === 'disabled') { fail(reply, 410, 'Link disattivato dallo studio'); return null; }
    return a;
  };
  /** Sessione valida per questo accesso; altrimenti 401 con lo stato (attivare o accedere). */
  const session = async (req: FastifyRequest, reply: FastifyReply) => {
    const a = await patientAccess(req, reply); if (!a) return null;
    const s = bearer(req);
    const row = s ? await db('patient_session').where({ id: sha256(s), access_id: a.id }).first() : null;
    if (!row || toDate(row.expires_at)!.getTime() <= now().getTime()) {
      if (row) await db('patient_session').where({ id: row.id }).delete();
      fail(reply, 401, 'Accesso richiesto', { state: a.password_hash ? 'login' : 'activate', ...publicInfo(a) });
      return null;
    }
    return { a, sessionId: row.id as string };
  };
  const openSession = async (a: AccessRow) => {
    const code = randomCode();
    const expiresAt = new Date(now().getTime() + config.sessionDays * 864e5);
    await db('patient_session').insert({ id: sha256(code), access_id: a.id, created_at: now(), expires_at: expiresAt });
    return { session: code, expiresAt: expiresAt.toISOString() };
  };
  const limited = (req: FastifyRequest, reply: FastifyReply) => {
    if (limiter.hit(req.ip)) return false;
    fail(reply, 429, 'Troppi tentativi: riprova tra qualche minuto');
    return true;
  };

  app.post('/api/p/:token/activate', async (req, reply) => {
    if (limited(req, reply)) return;
    const a = await patientAccess(req, reply); if (!a) return;
    const b = req.body as { code?: string; password?: string } | undefined;
    const valid = typeof b?.code === 'string' && !!a.activation_hash && sameHash(sha256(b.code), a.activation_hash)
      && (toDate(a.activation_expires_at)?.getTime() ?? 0) > now().getTime();
    if (!valid) return fail(reply, 400, 'Link di attivazione scaduto o già usato: chiedi allo studio di inviartene uno nuovo', { code: 'activation' });
    const problem = passwordProblem(b!.password, a.email);
    if (problem) return fail(reply, 400, problem, { code: 'password' });
    const hash = await hashPassword(b!.password!);
    await db.transaction(async (trx) => {
      // Nuova password: le sessioni precedenti (es. su un telefono perso) non valgono più.
      await trx('patient_session').where({ access_id: a.id }).delete();
      await trx('patient_access').where({ id: a.id }).update({ password_hash: hash, password_set_at: now(), status: 'active', activation_hash: null, activation_expires_at: null, failed_logins: 0, locked_until: null, last_login_at: now(), updated_at: now() });
    });
    await log(a, 'activate');
    return openSession(a);
  });

  app.post('/api/p/:token/login', async (req, reply) => {
    if (limited(req, reply)) return;
    const a = await patientAccess(req, reply); if (!a) return;
    if (!a.password_hash) return fail(reply, 401, 'Accesso non ancora attivato: usa il link di attivazione ricevuto dallo studio', { state: 'activate', ...publicInfo(a) });
    const lockedUntil = toDate(a.locked_until);
    if (lockedUntil && lockedUntil.getTime() > now().getTime()) return fail(reply, 429, `Troppi tentativi errati: riprova dopo le ${lockedUntil.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}`);
    const password = (req.body as { password?: unknown } | undefined)?.password;
    if (typeof password !== 'string' || !(await verifyPassword(password, a.password_hash))) {
      const failed = a.failed_logins + 1;
      await db('patient_access').where({ id: a.id }).update({ failed_logins: failed >= MAX_FAILED ? 0 : failed, locked_until: failed >= MAX_FAILED ? new Date(now().getTime() + LOCK_MINUTES * 60_000) : null });
      return fail(reply, 401, failed >= MAX_FAILED ? `Password non corretta. Troppi tentativi: riprova tra ${LOCK_MINUTES} minuti` : 'Password non corretta', { state: 'login', attemptsLeft: Math.max(0, MAX_FAILED - failed) });
    }
    await db('patient_access').where({ id: a.id }).update({ failed_logins: 0, locked_until: null, last_login_at: now() });
    await log(a, 'login');
    return openSession(a);
  });

  app.get('/api/p/:token', async (req, reply) => {
    const s = await session(req, reply); if (!s) return;
    const view = JSON.parse(s.a.view_json);
    view.consent = { ...view.consent, required: !!view.consent?.required && !s.a.consent_at };
    view.links = { ...view.links, pdf: s.a.pdf_b64 && view.features?.pdf ? `/api/p/${s.a.token}/pdf` : null };
    await log(s.a, 'view');
    return view;
  });

  app.get('/api/p/:token/pdf', async (req, reply) => {
    const s = await session(req, reply); if (!s) return;
    if (!s.a.pdf_b64) return fail(reply, 404, 'PDF non disponibile');
    return reply.header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${(s.a.pdf_name ?? 'piano.pdf').replace(/[^\w.\- ]/g, '_')}"`)
      .send(Buffer.from(s.a.pdf_b64, 'base64'));
  });

  app.post('/api/p/:token/consent', async (req, reply) => {
    const s = await session(req, reply); if (!s) return;
    if (!s.a.consent_at) await db('patient_access').where({ id: s.a.id }).update({ consent_at: now() });
    await log(s.a, 'consent');
    return reply.code(204).send();
  });

  app.post('/api/p/:token/logout', async (req, reply) => {
    const s = await session(req, reply); if (!s) return;
    await db('patient_session').where({ id: s.sessionId }).delete();
    await log(s.a, 'logout');
    return reply.code(204).send();
  });

  app.get('/api/health', async () => { await db.raw('select 1'); return { ok: true }; });
  registerAdmin(app, { config, manager });
  return app;
}
