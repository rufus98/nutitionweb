// @vitest-environment node
// Certificato CA incollato nelle variabili d'ambiente: con gli a capo, su una riga, con "\n" scritti come testo.
import { X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { describe, expect, it } from 'vitest';
import { normalizePem } from './mysql.js';

// Due certificati veri (le CA incluse in Node), come una CA di Aiven.
const [PEM, PEM2] = rootCertificates;
const fingerprint = (pem: string) => new X509Certificate(pem).fingerprint256;

describe('normalizePem', () => {
  it('ricostruisce un certificato valido da una riga, da spazi e da "\\n" testuali', () => {
    for (const pasted of [PEM, PEM.replace(/\n/g, ' '), PEM.replace(/\n/g, '\\n'), PEM.replace(/\n/g, ''), `"${PEM}"`.slice(1, -1)]) {
      expect(fingerprint(normalizePem(pasted))).toBe(fingerprint(PEM));
    }
  });

  it('mantiene tutti i certificati di una catena e scarta il testo che non lo è', () => {
    expect(normalizePem(`${PEM}\n${PEM2}`.replace(/\n/g, ' ')).match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
    expect(normalizePem('non è un certificato')).toBe('');
  });
});
