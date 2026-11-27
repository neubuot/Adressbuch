/**
 * Dateien, die eine andere App über "Teilen" an das Adressbuch gegeben hat.
 *
 * Das geht nur, wenn das Adressbuch als App installiert ist (Android). Der
 * Service Worker (public/sw.js) nimmt die Dateien entgegen, legt sie kurz im
 * Zwischenspeicher des Browsers ab und öffnet die Ansicht zum Übernehmen.
 * Hier werden sie abgeholt und sofort wieder aus dem Zwischenspeicher
 * entfernt. Sie verlassen das Gerät dabei nicht.
 */

/** Muss zu SHARE_CACHE in public/sw.js passen */
export const SHARE_CACHE = 'geteilte-dateien';
/** Muss zu SHARE_NAME_HEADER in public/sw.js passen */
const NAME_HEADER = 'X-Dateiname';

function decodeName(value: string | null, fallback: string): string {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value).slice(0, 200) || fallback;
  } catch {
    return fallback;
  }
}

/** Holt die geteilten Dateien ab; danach sind sie aus dem Zwischenspeicher entfernt */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === 'undefined') return [];
  try {
    if (!(await caches.has(SHARE_CACHE))) return [];
    const cache = await caches.open(SHARE_CACHE);
    const files: File[] = [];
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response) continue;
      const blob = await response.blob();
      const name = decodeName(response.headers.get(NAME_HEADER), `geteilt-${files.length + 1}`);
      files.push(new File([blob], name, { type: blob.type }));
    }
    await caches.delete(SHARE_CACHE);
    return files;
  } catch {
    return [];
  }
}
