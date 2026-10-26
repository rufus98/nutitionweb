// Password e codici, come in server/src/crypto.ts: le password solo come hash scrypt (con sale casuale), i codici casuali
// (sessioni, attivazione) solo come SHA-256. Nel database non c'è niente di reversibile.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// Parametri scrypt (OWASP: N=2^17, r=8, p=1). Sono scritti nell'hash, così si possono alzare in futuro.
const N = 2 ** 17, R = 8, P = 1, KEYLEN = 32;
const maxmem = (n: number, r: number) => 128 * n * r * 2;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !key) return false;
  const expected = Buffer.from(key, 'base64url');
  const got = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, { N: +n, r: +r, p: +p, maxmem: maxmem(+n, +r) });
  return timingSafeEqual(got, expected);
}

/** Codice casuale per URL (base64url). 32 byte = 256 bit. */
export const randomCode = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Confronto a tempo costante di due SHA-256 esadecimali. */
export const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Regole della password scelta dal paziente. Restituisce il motivo del rifiuto, o null se va bene. */
export function passwordProblem(password: unknown, email?: string): string | null {
  if (typeof password !== 'string') return 'Password mancante';
  if ([...password].length < 10) return 'La password deve avere almeno 10 caratteri';
  if (password.length > 200) return 'La password è troppo lunga';
  if (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) return 'La password non deve contenere la tua email';
  if (/^(.)\1+$/.test(password) || /^(0123456789|1234567890|password|qwertyuiop)/i.test(password)) return 'Scegli una password meno prevedibile';
  return null;
}
