// Funzioni del telefono: memoria locale per paziente, invito all'installazione, manifest della PWA.
import { useEffect, useState } from 'react';
import type { PatientStore } from '@app/patientApp/PatientApp';

/** Memoria locale separata per ogni link (più pazienti possono usare lo stesso telefono). */
export function tokenStore(token: string, storage: Storage = localStorage): PatientStore {
  return {
    get: (k) => { try { return storage.getItem(`nutrea:${token}:${k}`); } catch { return null; } },
    set: (k, v) => { try { storage.setItem(`nutrea:${token}:${k}`, v); } catch { /* memoria piena o disattivata */ } },
  };
}

const LAST = 'nutrea:last';
/** Ultimo link aperto: la pagina iniziale "/" lo riapre (es. dall'icona sulla Home). */
export const lastToken = () => { try { return localStorage.getItem(LAST); } catch { return null; } };
export const rememberToken = (t: string) => { try { localStorage.setItem(LAST, t); } catch { /* ignorato */ } };

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void> }

/**
 * Invito "Aggiungi alla Home" come da design: dalla seconda apertura, mai se l'app è già installata,
 * nascosto per 30 giorni quando lo si chiude. Su Android/Chrome usa il prompt di sistema, su iOS mostra le istruzioni.
 */
export function useInstall(token: string, enabled: boolean) {
  const store = tokenStore(token);
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hiddenUntil, setHiddenUntil] = useState(() => Number(store.get('a2hs-hidden') ?? 0));
  const [visits] = useState(() => { const n = Number(store.get('visits') ?? 0) + 1; store.set('visits', String(n)); return n; });
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const dismiss = () => { const until = Date.now() + 30 * 864e5; store.set('a2hs-hidden', String(until)); setHiddenUntil(until); };
  const show = enabled && visits >= 2 && !isStandalone() && hiddenUntil < Date.now() && (!!evt || isIos());
  return { show, prompt: evt ? () => { evt.prompt(); setEvt(null); } : null, dismiss };
}

/**
 * Manifest della PWA per questo link: l'icona sulla Home deve riaprire /p/{token}, non la pagina iniziale.
 * Si genera al volo (il token non può stare in un file statico).
 */
export function useTokenManifest(token: string, name: string) {
  useEffect(() => {
    const origin = location.origin;
    const manifest = {
      name: `Il mio piano · ${name}`, short_name: 'Il mio piano', lang: 'it',
      start_url: `${origin}/p/${token}`, scope: `${origin}/p/${token}`, id: `/p/${token}`,
      display: 'standalone', background_color: '#F6F5F1', theme_color: '#F6F5F1',
      icons: [192, 512].map((s) => ({ src: `${origin}/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any maskable' })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
    const before = link.href;
    link.href = url;
    return () => { link!.href = before; URL.revokeObjectURL(url); };
  }, [token, name]);
}
