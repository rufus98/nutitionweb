// Web app paziente: caricamento dei dati, copia offline, link disattivati, e resa dell'app con i dati demo.
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PatientApp } from '@app/patientApp/PatientApp';
import { ApiError, loadView, sendConsent, validToken } from '../api';
import { demoView } from '../demo';
import { tokenStore } from '../device';

const memory = (): Storage => {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const now = () => new Date('2026-10-26T10:00:00');
const view = demoView(now());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const TOKEN = 'gF7k2q9XaB';

describe('caricamento del piano', () => {
  it('scarica i dati e ne tiene una copia per l’uso offline', async () => {
    const storage = memory();
    const fetch = vi.fn(async () => json(view));
    const first = await loadView(TOKEN, { fetch, storage, now });
    expect(fetch).toHaveBeenCalledWith(`/api/p/${TOKEN}`, expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
    expect(first).toEqual({ view, offlineSince: null });

    const offline = await loadView(TOKEN, { fetch: async () => { throw new TypeError('Failed to fetch'); }, storage, now });
    expect(offline.view.patient.first).toBe('Giulia');
    expect(offline.offlineSince).toMatch(/26 ott/);
    // Anche un errore del server mostra la copia salvata invece di una pagina vuota.
    expect((await loadView(TOKEN, { fetch: async () => json({}, 503), storage, now })).offlineSince).not.toBeNull();
  });

  it('link disattivato: cancella la copia salvata', async () => {
    const storage = memory();
    await loadView(TOKEN, { fetch: async () => json(view), storage, now });
    await expect(loadView(TOKEN, { fetch: async () => json({}, 410), storage, now })).rejects.toMatchObject({ kind: 'revoked' });
    await expect(loadView(TOKEN, { fetch: async () => { throw new TypeError('offline'); }, storage, now })).rejects.toMatchObject({ kind: 'offline' });
  });

  it('link non valido, prima apertura offline, versione dei dati non supportata', async () => {
    const storage = memory();
    await expect(loadView('../etc', { fetch: vi.fn(), storage, now })).rejects.toMatchObject({ kind: 'not-found' });
    await expect(loadView(TOKEN, { fetch: async () => json({}, 404), storage, now })).rejects.toMatchObject({ kind: 'not-found' });
    await expect(loadView(TOKEN, { fetch: async () => { throw new TypeError('offline'); }, storage, now })).rejects.toBeInstanceOf(ApiError);
    await expect(loadView(TOKEN, { fetch: async () => json({ ...view, v: 2 }), storage, now })).rejects.toMatchObject({ kind: 'outdated' });
    expect(validToken('gF7k2q9X')).toBe(true);
    expect(validToken('a b')).toBe(false);
  });

  it('demo senza server e consenso inviato al server', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    expect((await loadView('demo', { fetch, storage: memory(), now })).view.patient.first).toBe('Giulia');
    expect(fetch).not.toHaveBeenCalled(); // il demo non chiama il server
    // Consenso: inviato al server e annotato nella copia offline, così senza rete non viene richiesto di nuovo.
    const storage = memory();
    await loadView(TOKEN, { fetch: async () => json({ ...view, consent: { required: true, studio: 'Studio' } }), storage, now });
    await sendConsent(TOKEN, { fetch, storage });
    expect(fetch).toHaveBeenCalledWith(`/api/p/${TOKEN}/consent`, expect.objectContaining({ method: 'POST' }));
    const offline = await loadView(TOKEN, { fetch: async () => { throw new TypeError('offline'); }, storage, now });
    expect(offline.view.consent.required).toBe(false);
  });

  it('memoria locale separata per ogni link', () => {
    const storage = memory();
    tokenStore('aaaaaa', storage).set('checks', '1');
    expect(tokenStore('bbbbbb', storage).get('checks')).toBeNull();
    expect(tokenStore('aaaaaa', storage).get('checks')).toBe('1');
  });
});

describe('app paziente', () => {
  const env = { today: '2026-10-26', store: tokenStore('demo', memory()) };
  // renderToString separa i testi adiacenti con <!-- -->
  const render = (el: React.ReactElement) => renderToString(el).replace(/<!-- -->/g, '');
  it('mostra oggi, i pasti e la navigazione', () => {
    const html = render(<PatientApp view={view} env={env} />);
    for (const t of ['Ciao Giulia', 'Lunedì 26 ottobre', 'Colazione', 'Yogurt greco delattosato', 'Levotiroxina', 'La mia dieta', 'Progressi', 'Studio']) expect(html).toContain(t);
  });
  it('chiede il consenso quando lo studio lo richiede', () => {
    const html = render(<PatientApp view={{ ...view, consent: { required: true, studio: 'Dott.ssa Elena Marchi' } }} env={env} />);
    expect(html).toContain('Accetto e continuo');
    expect(html).not.toContain('Colazione');
  });
  it('senza piano condiviso spiega che è in preparazione', () => {
    expect(render(<PatientApp view={{ ...view, plan: null }} env={env} />)).toContain('Il tuo piano è in preparazione');
  });
});
