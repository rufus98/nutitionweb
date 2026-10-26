import { describe, expect, it } from 'vitest';
import { parseDbUri } from './remote';

describe('parseDbUri', () => {
  it('Service URI completo', () => {
    expect(parseDbUri('mysql://avnadmin:p%40ss@mysql-1a2b-studio.d.aivencloud.com:19116/defaultdb?ssl-mode=REQUIRED'))
      .toEqual({ client: 'mysql2', host: 'mysql-1a2b-studio.d.aivencloud.com', port: 19116, database: 'defaultdb', user: 'avnadmin', password: 'p@ss', ssl: true });
  });
  it('Aiven nasconde utente e password: non diventano dati veri', () => {
    expect(parseDbUri('mysql://CLICK_TO:REVEAL_PASSWORD@mysql-1a2b.d.aivencloud.com:19116/defaultdb?ssl-mode=REQUIRED')).toMatchObject({ user: '', password: '', host: 'mysql-1a2b.d.aivencloud.com', port: 19116, ssl: true });
  });
  it('PostgreSQL, SSL disattivato e indirizzi non validi', () => {
    expect(parseDbUri('postgres://u:p@db.esempio.it/nutrea?sslmode=disable')).toMatchObject({ client: 'pg', port: '', ssl: false });
    expect(() => parseDbUri('non un indirizzo')).toThrow(/Service URI/);
    expect(() => parseDbUri('redis://h:1/0')).toThrow(/non supportato/);
  });
});
