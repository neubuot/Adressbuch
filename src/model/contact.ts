/**
 * Hilfsfunktionen rund um Kontakte: Namen, Zustand in Alltagssprache,
 * Adressen, Geburtstage.
 */

import type { Connection, RemoteCard } from '../types';

export function displayNameOfCard(card: RemoteCard | undefined | null): string {
  if (!card) return '';
  const name = [card.titlePrefix, card.firstName, card.lastName]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ');
  const full = card.titleSuffix && name ? `${name}, ${card.titleSuffix.trim()}` : name;
  return full || (card.nickname || '').trim() || (card.organization || '').trim();
}

/**
 * Woran man einen Eintrag ohne Namen erkennt: E-Mail-Adresse oder Nummer.
 * Telefonbücher enthalten oft Einträge, die nur daraus bestehen.
 */
export function contactHint(card: RemoteCard | undefined | null): string {
  if (!card) return '';
  for (const field of ['emailPrivate', 'emailWork', 'phoneMobile', 'phoneWork', 'website'] as const) {
    const value = (card[field] || '').trim();
    if (value) return value;
  }
  return '';
}

/**
 * Der Name, unter dem ein Kontakt angezeigt wird: eigene Bezeichnung,
 * sonst der Name von der Karte, sonst der zuletzt bekannte Name, sonst
 * E-Mail-Adresse oder Nummer.
 */
export function contactName(connection: Connection): string {
  return (
    (connection.label || '').trim() ||
    displayNameOfCard(connection.remoteCard) ||
    (connection.knownName || '').trim() ||
    contactHint(connection.remoteCard) ||
    'Neuer Kontakt'
  );
}

/** Sortierschlüssel: Nachname zuerst */
export function contactSortKey(connection: Connection): string {
  const card = connection.remoteCard;
  const byCard = [card?.lastName, card?.firstName].filter(Boolean).join(' ');
  return (byCard || contactName(connection)).toLocaleLowerCase('de');
}

export function contactSubtitle(connection: Connection): string {
  const card = connection.remoteCard;
  if (!card) return '';
  return [card.organization, card.city].map((part) => (part || '').trim()).filter(Boolean).join(' · ');
}

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter((part) => /^\p{L}/u.test(part));
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toLocaleUpperCase('de');
}

export type ContactStateKind = 'current' | 'waiting' | 'local' | 'incompatible' | 'updating';

export interface ContactState {
  kind: ContactStateKind;
  label: string;
  detail: string;
}

/**
 * Zustand eines Kontakts in Alltagssprache
 */
export function contactState(connection: Connection): ContactState {
  if (connection.kind === 'local') {
    return {
      kind: 'local',
      label: 'Nicht verbunden',
      detail: 'Diesen Eintrag hast du selbst angelegt. Er wird nicht automatisch aktualisiert.',
    };
  }
  if (connection.incompatible) {
    return {
      kind: 'incompatible',
      label: 'App-Version passt nicht',
      detail:
        'Eines eurer Geräte nutzt eine ältere Version dieser App. Bitte öffnet beide die App neu, damit sie sich aktualisiert. Bis dahin wird nichts übertragen.',
    };
  }
  if (connection.status === 'syncing') {
    return { kind: 'updating', label: 'Wird aktualisiert', detail: 'Die Angaben werden gerade abgeglichen.' };
  }
  if (connection.status === 'online') {
    return { kind: 'current', label: 'Aktuell', detail: 'Ihr seid gerade verbunden. Änderungen kommen sofort an.' };
  }
  return {
    kind: 'waiting',
    label: 'Wartet auf Verbindung',
    detail:
      'Ihr seid gerade nicht direkt verbunden. Änderungen warten im Postfach oder kommen an, sobald ihr beide die App geöffnet habt.',
  };
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Adresse in Zeilen, wie man sie auf einen Brief schreibt */
export function addressLines(card: RemoteCard | undefined): string[] {
  if (!card) return [];
  const line1 = [card.street, card.houseNumber].filter(Boolean).join(' ');
  const line2 = [card.postalCode, card.city].filter(Boolean).join(' ');
  const line3 = [card.state, card.country].filter(Boolean).join(', ');
  return [line1, line2, line3].filter(Boolean);
}

export interface UpcomingBirthday {
  connection: Connection;
  /** Tage bis zum Geburtstag (0 = heute) */
  inDays: number;
  /** Alter, das an diesem Tag erreicht wird; undefined ohne Geburtsjahr */
  turns?: number;
  date: Date;
}

/**
 * Tage bis zum nächsten Geburtstag. Der 29. Februar wird in Nicht-Schaltjahren
 * am 1. März gezählt.
 */
export function daysUntilBirthday(birthday: string, now: Date = new Date()): { inDays: number; date: Date; turns?: number } | null {
  // Mit Jahr: 1985-11-24, ohne Jahr: --11-24
  const match = birthday.match(/^(?:(\d{4})-|--)(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const year = match[1] ? parseInt(match[1], 10) : undefined;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month, day);
  const inDays = Math.round((next.getTime() - today.getTime()) / 86400000);
  const turns = year && year > 1900 ? next.getFullYear() - year : undefined;
  return { inDays, date: next, turns };
}

export function upcomingBirthdays(
  connections: Connection[],
  withinDays = 30,
  now: Date = new Date()
): UpcomingBirthday[] {
  const result: UpcomingBirthday[] = [];
  for (const connection of connections) {
    const birthday = connection.remoteCard?.birthday;
    if (!birthday) continue;
    const info = daysUntilBirthday(birthday, now);
    if (info && info.inDays <= withinDays) {
      result.push({ connection, ...info });
    }
  }
  return result.sort((a, b) => a.inDays - b.inDays);
}

export interface LongNoContact {
  connection: Connection;
  /** Monate seit dem letzten Gespräch */
  months: number;
}

/**
 * Kontakte, mit denen laut eigener Angabe lange nicht gesprochen wurde.
 * Berücksichtigt nur Kontakte, bei denen "Zuletzt gesprochen am" gepflegt ist.
 */
export function longNoContact(
  connections: Connection[],
  minMonths = 6,
  now: Date = new Date()
): LongNoContact[] {
  const result: LongNoContact[] = [];
  for (const connection of connections) {
    const last = connection.private?.lastContactAt;
    if (!last) continue;
    const date = new Date(last);
    if (Number.isNaN(date.getTime())) continue;
    const months = Math.floor((now.getTime() - date.getTime()) / (86400000 * 30.44));
    if (months >= minMonths) result.push({ connection, months });
  }
  return result.sort((a, b) => b.months - a.months);
}

/** Ende des genannten Tages (Ortszeit) als ISO-Zeitpunkt; '' bei ungültigem Datum */
export function endOfDayIso(day: string): string {
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
