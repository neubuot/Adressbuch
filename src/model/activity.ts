/**
 * Änderungsübersicht in Alltagssprache
 */

import type { ActivityEntry, AddressCardField } from '../types';
import { getFieldLabel } from './fields';

/** "… hat <die Mobilnummer> geändert" */
const FIELD_PHRASES: Record<AddressCardField, string> = {
  salutation: 'die Anrede',
  titlePrefix: 'den Titel',
  firstName: 'den Vornamen',
  lastName: 'den Nachnamen',
  titleSuffix: 'den Titel',
  nickname: 'den Spitznamen',
  organization: 'die Organisation',
  position: 'die Position',
  department: 'die Abteilung',
  organizationId: 'die Organisations-Nr.',
  emailPrivate: 'die private E-Mail-Adresse',
  emailWork: 'die geschäftliche E-Mail-Adresse',
  phoneMobile: 'die Mobilnummer',
  phoneWork: 'die geschäftliche Telefonnummer',
  fax: 'die Faxnummer',
  website: 'die Webseite',
  linkedin: 'das LinkedIn-Profil',
  xing: 'das Xing-Profil',
  github: 'das GitHub-Profil',
  street: 'die Straße',
  houseNumber: 'die Hausnummer',
  postalCode: 'die Postleitzahl',
  city: 'den Ort',
  state: 'das Bundesland',
  country: 'das Land',
  birthday: 'das Geburtsdatum',
  birthplace: 'den Geburtsort',
  language: 'die Sprache',
  timezone: 'die Zeitzone',
};

export type ChangeKind = 'added' | 'changed' | 'removed';

export interface ChangeText {
  kind: ChangeKind;
  sentence: string;
}

export function describeChange(entry: ActivityEntry, name: string): ChangeText {
  const phrase = FIELD_PHRASES[entry.field as AddressCardField] ?? `„${getFieldLabel(entry.field)}“`;
  if (!entry.oldValue && entry.newValue) {
    return { kind: 'added', sentence: `${name} hat ${phrase} ergänzt` };
  }
  if (entry.oldValue && !entry.newValue) {
    return { kind: 'removed', sentence: `${name} teilt ${phrase} nicht mehr mit dir` };
  }
  return { kind: 'changed', sentence: `${name} hat ${phrase} geändert` };
}

const SEEN_KEY = 'adressbuch.activitySeenAt';

export function getActivitySeenAt(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function markActivitySeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    // ohne Speicherzugriff bleibt nur der Zähler stehen
  }
}

export function countUnseen(activity: ActivityEntry[] | undefined, seenAt: string): number {
  if (!activity) return 0;
  return activity.filter((entry) => entry.at > seenAt).length;
}
