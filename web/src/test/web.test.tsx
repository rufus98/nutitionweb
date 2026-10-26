// Web app paziente: accesso con link e password, caricamento dei dati, copia offline, link disattivati, resa dell'app.
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PatientApp } from '@app/patientApp/PatientApp';
import { activate, ApiError, AuthError, FormError, loadView, login, logout, sendConsent, validToken } from '../api';
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
/** Telefono con la sessione già aperta (dopo il login). */
const loggedIn = () => { const s = memory(); s.setItem(`nutrea:${TOKEN}:session`, 'sessione-1'); return s; };

describe('accesso con link e password', () => {
  it('senza sessione il server chiede di attivare o accedere, con nome e contatti dello studio', async () => {
    const r = loadView(TOKEN, { fetch: async () => json({ error: 'Accesso richiesto', state: 'activate', firstName: 'Giulia', studio: { name: 'Dott.ssa Elena Marchi', whatsapp: '39051' } }, 401), storage: memory(), now });
    await expect(r).rejects.toBeInstanceOf(AuthError);
    await expect(r).rejects.toMatchObject({ info: { state: 'activate', firstName: 'Giulia', studio: { name: 'Dott.ssa Elena Marchi' } } });
  });

  it('attivazione: invia codice e password, salva la sessione e la usa per i dati', async () => {
    const storage = memory();
    const fetch = vi.fn(async (url: string) => (String(url).endsWith('/activate') ? json({ session: 'sess-abc', expiresAt: '2026-11-25' }) : json(view)));
    await activate(TOKEN, 'codice', 'Mele e pere 2026', { fetch: fetch as any, storage });
    expect(fetch).toHaveBeenCalledWith(`/api/p/${TOKEN}/activate`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: 'codice', password: 'Mele e pere 2026' }) }));
    await loadView(TOKEN, { fetch: fetch as any, storage, now });
    expect(fetch).toHaveBeenLastCalledWith(`/api/p/${TOKEN}`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sess-abc' }) }));
  });

  it('login: password sbagliata, troppi tentativi, link scaduto', async () => {
    const storage = memory();
    await expect(login(TOKEN, 'x', { fetch: async () => json({ error: 'Password non corretta', state: 'login', attemptsLeft: 4 }, 401), storage })).rejects.toThrow('Password non corretta');
    await expect(login(TOKEN, 'x', { fetch: async () => json({ error: 'Troppi tentativi' }, 429), storage })).rejects.toMatchObject({ code: 'locked' });
    await expect(activate(TOKEN, 'c', 'una password lunga', { fetch: async () => json({ error: 'Link scaduto', code: 'activation' }, 400), storage })).rejects.toMatchObject({ code: 'activation' });
    await expect(login(TOKEN, 'x', { fetch: async () => { throw new TypeError('offline'); }, storage })).rejects.toBeInstanceOf(FormError);
    expect(storage.getItem(`nutrea:${TOKEN}:session`)).toBeNull();
    await login(TOKEN, 'giusta', { fetch: async () => json({ session: 'sess-2' }), storage });
    expect(storage.getItem(`nutrea:${TOKEN}:session`)).toBe('sess-2');
  });

  it('uscita e sessione scaduta cancellano i dati salvati sul telefono', async () => {
    const storage = loggedIn();
    await loadView(TOKEN, { fetch: async () => json(view), storage, now });
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await logout(TOKEN, { fetch, storage });
    expect(fetch).toHaveBeenCalledWith(`/api/p/${TOKEN}/logout`, expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer sessione-1' } }));
    expect(storage.length).toBe(0);
    const s2 = loggedIn();
    await loadView(TOKEN, { fetch: async () => json(view), storage: s2, now });
    await expect(loadView(TOKEN, { fetch: async () => json({ state: 'login' }, 401), storage: s2, now })).rejects.toBeInstanceOf(AuthError);
    await expect(loadView(TOKEN, { fetch: async () => { throw new TypeError('offline'); }, storage: s2, now })).rejects.toMatchObject({ kind: 'offline' });
  });
});

describe('caricamento del piano', () => {
  it('scarica i dati e ne tiene una copia per l’uso offline', async () => {
    const storage = loggedIn();
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

  it('link disattivato: cancella la copia salvata e la sessione', async () => {
    const storage = loggedIn();
    await loadView(TOKEN, { fetch: async () => json(view), storage, now });
    await expect(loadView(TOKEN, { fetch: async () => json({}, 410), storage, now })).rejects.toMatchObject({ kind: 'revoked' });
    await expect(loadView(TOKEN, { fetch: async () => { throw new TypeError('offline'); }, storage, now })).rejects.toMatchObject({ kind: 'offline' });
    expect(storage.getItem(`nutrea:${TOKEN}:session`)).toBeNull();
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
    const storage = loggedIn();
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
