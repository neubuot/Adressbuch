/**
 * Welche Fassung der App gerade läuft. Stand und Datum trägt der Build ein
 * (vite.config.ts); im Entwicklungsbetrieb und in Tests fehlen sie.
 */

import { APP_VERSION, SCHEMA_VERSION } from './types';

declare const __BUILD_COMMIT__: string | undefined;
declare const __BUILD_DATE__: string | undefined;

export interface VersionInfo {
  version: string;
  /** Kurzkennung des Quelltext-Stands, '' wenn unbekannt */
  commit: string;
  /** Tag des Builds als JJJJ-MM-TT, '' wenn unbekannt */
  builtAt: string;
  schema: string;
}

export function getVersionInfo(): VersionInfo {
  return {
    version: APP_VERSION,
    commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '',
    builtAt: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '',
    schema: SCHEMA_VERSION,
  };
}

/** Eine Zeile zum Vorlesen oder Abschreiben, z. B. "0.3.0 (4e89f7c, 26.11.2026)" */
export function versionLine(info: VersionInfo = getVersionInfo()): string {
  const date = info.builtAt ? info.builtAt.split('-').reverse().join('.') : '';
  const detail = [info.commit, date].filter(Boolean).join(', ');
  return detail ? `${info.version} (${detail})` : info.version;
}
