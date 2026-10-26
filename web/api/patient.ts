// Funzione serverless (Vercel) delle API dei pazienti: /api/p/{token}[/azione] arriva qui dal rewrite in vercel.json
// e legge/scrive direttamente il database MySQL. La logica è in _lib/patient.ts.
import { handle } from './_lib/patient.js';
import { clientIp, dbFromEnv } from './_lib/mysql.js';

const serve = (req: Request) => handle(req, { db: dbFromEnv(), ip: clientIp(req) });

export const GET = serve;
export const POST = serve;
