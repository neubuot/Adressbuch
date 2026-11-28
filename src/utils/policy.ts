/**
 * Freigabe-Regeln: Welche Felder der eigenen Karte sieht ein Kontakt?
 */

import type { AddressCard, Connection, RemoteCard } from '../types';
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

/** Eine befristete Freigabe: bis `until` alles Freigegebene, danach nur `keep` */
export interface ShareLimit {
  until: string;
  keep: string[];
}

function isPast(iso: string | undefined, now: number): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && time <= now;
}

/** true, wenn der Zeitpunkt gültig ist und erreicht wurde */
export function isExpired(iso: string | undefined, now: number = Date.now()): boolean {
  return isPast(iso, now);
}

/**
 * Die Felder, die ein Kontakt in diesem Moment sehen darf. Ist eine
 * Befristung abgelaufen, gilt bereits die Freigabe für danach, auch wenn
 * der gespeicherte Stand noch nicht umgestellt ist.
 */
export function effectiveFields(
  connection: Pick<Connection, 'allowedFields' | 'shareUntil' | 'fieldsAfter'>,
  now: number = Date.now()
): string[] {
  if (isPast(connection.shareUntil, now)) return [...(connection.fieldsAfter ?? [])];
  return connection.allowedFields;
}

/** Die noch laufende Befristung einer Freigabe, sonst null */
export function activeLimit(
  connection: Pick<Connection, 'shareUntil' | 'fieldsAfter'>,
  now: number = Date.now()
): ShareLimit | null {
  if (!connection.shareUntil || isPast(connection.shareUntil, now)) return null;
  if (!Number.isFinite(Date.parse(connection.shareUntil))) return null;
  return { until: connection.shareUntil, keep: [...(connection.fieldsAfter ?? [])].sort() };
}

/**
 * Prüft eine empfangene Befristung. Gibt null zurück, wenn keine oder eine
 * unbrauchbare Angabe vorliegt.
 */
export function sanitizeLimit(until: unknown, keep: unknown): ShareLimit | null {
  if (typeof until !== 'string' || until.length > 40 || !Number.isFinite(Date.parse(until))) return null;
  const fields = Array.isArray(keep)
    ? keep.filter((field): field is string => typeof field === 'string' && isCardField(field))
    : [];
  return { until, keep: [...new Set(fields)].sort() };
}

/**
 * Was beide Seiten vergleichen, um zu erkennen, ob der Stand übereinstimmt.
 * Ohne Befristung sind das allein die Felder (wie in früheren Versionen).
 */
export function shareState(fields: RemoteCard, limit: ShareLimit | null): unknown {
  if (!limit) return fields;
  return { ...fields, '~until': limit.until, '~keep': limit.keep.join(',') };
}

/** Behält von einer Karte nur die genannten Felder */
export function keepFields(card: RemoteCard, keep: string[]): RemoteCard {
  const result: RemoteCard = {};
  const allowed = new Set(keep);
  for (const field of ADDRESS_CARD_FIELDS) {
    if (allowed.has(field) && card[field]) result[field] = card[field];
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
