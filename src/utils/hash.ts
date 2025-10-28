/**
 * Hash-Utilities für State-Vergleich
 */

/**
 * Erstellt einen deterministischen Hash eines Objekts
 * Sortiert Keys alphabetisch für Stabilität
 */
export function stableHash(obj: unknown): string {
  const json = stableStringify(obj);
  return simpleHash(json);
}

/**
 * Erstellt einen JSON-String mit sortierten Keys
 */
export function stableStringify(obj: unknown): string {
  if (obj === null) {
    return 'null';
  }

  if (obj === undefined) {
    return 'undefined';
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }

  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return JSON.stringify(key) + ':' + stableStringify(value);
    });

  return '{' + sorted.join(',') + '}';
}

/**
 * Einfache Hash-Funktion (32-bit)
 * In Produktion besser SHA-256 nutzen
 */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Erstellt einen SHA-256 Hash (async, für kritische Daten)
 */
export async function sha256Hash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
