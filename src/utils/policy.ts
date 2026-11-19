/**
 * Freigabe-Regeln: Welche Felder der eigenen Karte sieht ein Kontakt?
 */

import type { AddressCard, RemoteCard } from '../types';
import { ADDRESS_CARD_FIELDS } from '../types';
import { isCardField, SHARE_PRESETS } from '../model/fields';

export { getFieldLabel } from '../model/fields';

/**
 * Reduziert die eigene Karte auf die freigegebenen Felder.
 * Unbekannte Feldnamen und leere Werte werden nicht übertragen.
 */
export function projectFields(card: AddressCard, allowedFields: string[]): RemoteCard {
  const result: RemoteCard = {};
  const allowed = new Set(allowedFields);

  for (const field of ADDRESS_CARD_FIELDS) {
    if (!allowed.has(field)) continue;
    const value = card[field];
    if (typeof value === 'string' && value !== '') {
      result[field] = value;
    }
  }

  return result;
}

/**
 * Prüft, ob eine Freigabe nur bekannte Felder enthält
 */
export function validatePolicy(allowedFields: string[]): boolean {
  return allowedFields.every((field) => isCardField(field));
}

/**
 * Bereinigt eine empfangene Karte: nur bekannte Felder, nur Text, begrenzte Länge.
 */
export function sanitizeRemoteCard(fields: unknown): RemoteCard {
  const result: RemoteCard = {};
  if (!fields || typeof fields !== 'object') return result;

  for (const field of ADDRESS_CARD_FIELDS) {
    const value = (fields as Record<string, unknown>)[field];
    if (typeof value === 'string' && value !== '') {
      result[field] = value.slice(0, 500);
    }
  }
  return result;
}

export const POLICY_PRESETS: Record<string, readonly string[]> = {
  none: [],
  ...Object.fromEntries(SHARE_PRESETS.map((preset) => [preset.id, preset.fields])),
  full: ADDRESS_CARD_FIELDS,
};
