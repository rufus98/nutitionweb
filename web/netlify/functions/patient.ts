// Funzione Netlify delle API dei pazienti: stessa logica della funzione Vercel (api/patient.ts), query dirette sul database MySQL.
import { handle } from '../../api/_lib/patient.js';
import { clientIp, dbFromEnv } from '../../api/_lib/mysql.js';

export default (req: Request, context?: { ip?: string }) => handle(req, { db: dbFromEnv(), ip: context?.ip ?? clientIp(req) });

export const config = { path: ['/api/p/:token', '/api/p/:token/:action'] };
