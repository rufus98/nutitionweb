// In sviluppo (npm run dev / preview) Vite risponde a /api/p con la stessa funzione, sul database di DATABASE_URL (.env.local).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle } from './patient.js';
import { dbFromEnv } from './mysql.js';

export function devApi(env: NodeJS.ProcessEnv) {
  return async (req: IncomingMessage & { originalUrl?: string }, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const r = await handle(
      new Request(new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost'), { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks) }),
      { db: dbFromEnv(env), ip: req.socket.remoteAddress ?? '' },
    );
    res.statusCode = r.status;
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await r.arrayBuffer()));
  };
}
