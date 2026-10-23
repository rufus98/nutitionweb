// Impostazioni dello studio (un documento JSON nella chiave 'main') e piccoli indicatori di stato dell'app.
import { db } from '../connection';
import { parseJson } from '../sql';
import { DEFAULT_SETTINGS } from '../defaults';
import type { Settings } from '../types';

/** Chiavi di stato dell'app salvate nella tabella settings. */
export type Flag = 'onboarded' | 'demo';

export async function getSettings(): Promise<Settings> {
  const [r] = await (await db()).query<{ value: string }>("SELECT value FROM settings WHERE key = 'main'");
  // Le impostazioni salvate si sovrappongono ai valori predefiniti: le nuove opzioni aggiunte all'app hanno sempre un valore.
  return deepMerge(structuredClone(DEFAULT_SETTINGS), parseJson<Partial<Settings>>(r?.value, {}));
}
export async function saveSettings(s: Settings) {
  await setValue('main', JSON.stringify(s));
}
export async function getFlag(key: Flag): Promise<string | null> {
  const [r] = await (await db()).query<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return r?.value ?? null;
}
export async function setFlag(key: Flag, value: string) {
  await setValue(key, value);
}
async function setValue(key: string, value: string) {
  await (await db()).execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);
}

function deepMerge<T>(base: T, over: any): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return (over ?? base) as T;
  for (const k of Object.keys(over)) {
    const bv = (base as any)[k];
    (base as any)[k] = bv && typeof bv === 'object' && !Array.isArray(bv) ? deepMerge(bv, over[k]) : over[k];
  }
  return base;
}
