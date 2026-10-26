// Primo collegamento dello studio: il server non ha ancora una chiave dello studio e la crea quando l'app desktop lo chiede
// (POST /api/setup/claim). La chiave in chiaro si restituisce una volta sola; sul server resta solo il suo SHA-256
// in DATA_DIR/studio.json. Dopo il primo collegamento l'operazione è chiusa (409).
// Chi preferisce non lasciare il server "libero" nemmeno per qualche minuto imposta STUDIO_KEY_SHA256 (npm run studio-key).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { randomCode, sha256 } from './crypto.js';
import { RateLimiter } from './rateLimit.js';

const FILE = 'studio.json';

export function loadClaimedKey(dataDir: string): string | null {
  const path = join(dataDir, FILE);
  if (!existsSync(path)) return null;
  const h = String(JSON.parse(readFileSync(path, 'utf8')).keyHash ?? '');
  return /^[0-9a-f]{64}$/.test(h) ? h : null;
}

export function registerSetup(app: FastifyInstance, config: Config) {
  const limiter = new RateLimiter(10, 60_000);
  app.get('/api/setup', async () => ({ claimed: !!config.studioKeyHash }));
  app.post('/api/setup/claim', async (req, reply) => {
    if (!limiter.hit(req.ip)) return reply.code(429).send({ error: 'Troppi tentativi: riprova tra un minuto' });
    if (config.studioKeyHash) return reply.code(409).send({ error: 'Il server è già collegato a uno studio: inserisci la sua chiave dello studio' });
    const key = 'nutrea_' + randomCode(32);
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(config.dataDir, FILE), JSON.stringify({ keyHash: sha256(key), at: new Date().toISOString() }), { mode: 0o600 });
    config.studioKeyHash = sha256(key);
    return { key };
  });
}
