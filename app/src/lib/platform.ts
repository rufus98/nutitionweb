// Funzioni di sistema: aprire link/app esterne, salvare file, aprire PDF.
// In Tauri usano i plugin nativi; nel browser (sviluppo) ripiegano sulle API web.
import { isTauri } from '../db/driver';

export async function openExternal(url: string) {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Chiede dove salvare e scrive il file. Restituisce il percorso (o il nome nel browser), null se annullato. */
export async function saveFile(name: string, data: Uint8Array | string, filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const { downloadDir, join } = await import('@tauri-apps/api/path');
    const path = await save({ defaultPath: await join(await downloadDir(), name), filters });
    if (!path) return null;
    await writeFile(path, bytes);
    return path;
  }
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

/** Apre un PDF con il visualizzatore di sistema (in Tauri) o in una nuova scheda (browser). */
export async function openPdf(name: string, bytes: Uint8Array) {
  if (isTauri()) {
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const { tempDir, join } = await import('@tauri-apps/api/path');
    const { openPath } = await import('@tauri-apps/plugin-opener');
    const path = await join(await tempDir(), name.replace(/[^\w.\- ]/g, '_'));
    await writeFile(path, bytes);
    await openPath(path);
  } else {
    window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
  }
}

/** Apre una cartella in Esplora file (solo Tauri). */
export async function openFolder(path: string) {
  if (!isTauri()) return;
  const { openPath } = await import('@tauri-apps/plugin-opener');
  await openPath(path);
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const readFileAsBytes = (f: File) => f.arrayBuffer().then((b) => new Uint8Array(b));
