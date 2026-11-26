/**
 * Abgleich beim Import: Welche eingelesenen Kontakte gibt es schon?
 *
 * Stufen:
 *   update  dieselbe Quelle kennt den Kontakt bereits (gleiche Kennung)
 *   merge   sicherer Treffer: gleiche E-Mail, Telefonnummer, Profiladresse
 *           oder vollständig gleiche Angaben
 *   maybe   unsicherer Treffer: gleicher Name plus gleiche Organisation oder
 *           gleicher Ort, oder ein sicherer Schlüssel, den sich mehr als zwei
 *           Kontakte teilen (Zentrale, Sammeladresse)
 *   new     kein Treffer
 */

import {
  ADDRESS_CARD_FIELDS,
  pairKey,
  recordKey,
  type Connection,
  type ContactExtra,
  type RemoteCard,
} from '../types';

export interface IncomingContact {
  card: RemoteCard;
  notes?: string;
  extra?: ContactExtra;
  externalId?: string;
}

export type ImportAction = 'new' | 'update' | 'merge' | 'maybe';

export type MatchReason = 'email' | 'phone' | 'profile' | 'same' | 'name' | 'shared';

export interface PlanItem {
  index: number;
  contact: IncomingContact;
  externalId: string;
  action: ImportAction;
  /** Vorhandener Kontakt oder `new:<index>` für einen Eintrag desselben Imports */
  targetId?: string;
  reason?: MatchReason;
}

export const MATCH_REASON_TEXT: Record<MatchReason, string> = {
  email: 'gleiche E-Mail-Adresse',
  phone: 'gleiche Telefonnummer',
  profile: 'gleiche Profiladresse',
  same: 'gleiche Angaben',
  name: 'gleicher Name',
  shared: 'Angabe, die mehrere Kontakte teilen',
};

/** Ab so vielen Kontakten gilt ein Schlüssel als geteilt (Zentrale, Sammeladresse) */
const SHARED_KEY_LIMIT = 2;

export function normalizeEmail(value: string | undefined): string {
  const email = (value ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '';
}

/**
 * Bringt eine Telefonnummer in internationale Schreibweise. Nummern mit
 * führender 0 gelten als deutsche Nummern. Zu kurze Angaben ergeben ''.
 */
export function normalizePhone(value: string | undefined, defaultPrefix = '+49'): string {
  let raw = (value ?? '').trim().replace(/\(0\)/g, '');
  const plus = raw.startsWith('+');
  raw = raw.replace(/\D/g, '');
  if (raw.length < 6) return '';
  if (plus) return `+${raw}`;
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('0')) return `${defaultPrefix}${raw.slice(1)}`;
  return raw;
}

/** Profiladresse ohne Protokoll, www, Parameter und Schrägstrich am Ende */
export function normalizeProfile(value: string | undefined): string {
  const profile = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  return profile.includes('/') ? profile : '';
}

function fold(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Vor- und Nachname ohne Titel, Akzente und Groß- und Kleinschreibung */
export function nameKey(card: RemoteCard): string {
  const first = fold(card.firstName);
  const last = fold(card.lastName);
  return first && last ? `${first}|${last}` : '';
}

function hash(text: string): string {
  // FNV-1a, 32 Bit: reicht als Kennung innerhalb einer Quelle
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function fullKey(card: RemoteCard): string {
  const parts: string[] = [];
  for (const field of ADDRESS_CARD_FIELDS) {
    const value = (card[field] ?? '').trim();
    if (value) parts.push(`${field}=${value}`);
  }
  return parts.length > 0 ? `same:${hash(parts.join('\n'))}:${parts.length}` : '';
}

interface Keys {
  strong: Array<{ key: string; reason: MatchReason }>;
  weak: string[];
}

function keysOf(card: RemoteCard, extra?: ContactExtra): Keys {
  const strong: Keys['strong'] = [];
  const add = (key: string, reason: MatchReason) => {
    if (key && !strong.some((entry) => entry.key === key)) strong.push({ key, reason });
  };

  for (const email of [card.emailPrivate, card.emailWork, ...(extra?.emails ?? [])]) {
    const normalized = normalizeEmail(email);
    if (normalized) add(`email:${normalized}`, 'email');
  }
  for (const phone of [card.phoneMobile, card.phoneWork, ...(extra?.phones ?? [])]) {
    const normalized = normalizePhone(phone);
    if (normalized) add(`phone:${normalized}`, 'phone');
  }
  for (const profile of [card.linkedin, card.xing, card.github]) {
    const normalized = normalizeProfile(profile);
    if (normalized) add(`profile:${normalized}`, 'profile');
  }

  const weak: string[] = [];
  const name = nameKey(card);
  if (name) {
    const organization = fold(card.organization);
    const city = fold(card.city);
    if (organization) weak.push(`name:${name}|org:${organization}`);
    if (city) weak.push(`name:${name}|city:${city}`);
  }
  return { strong, weak };
}

/**
 * Kennung eines Kontakts innerhalb seiner Quelle, wenn die Quelle keine
 * eigene liefert: Name plus erste E-Mail oder Telefonnummer.
 */
export function fallbackExternalId(contact: IncomingContact): string {
  const card = contact.card;
  const anchor =
    normalizeEmail(card.emailPrivate) ||
    normalizeEmail(card.emailWork) ||
    normalizePhone(card.phoneMobile) ||
    normalizePhone(card.phoneWork) ||
    fold(card.organization) ||
    fold(card.city);
  const name = nameKey(card) || fold(card.lastName) || fold(card.firstName) || fold(card.nickname);
  return `h-${hash(`${name}\n${anchor}`)}`;
}

class Index {
  private byRecord = new Map<string, string>();
  private strong = new Map<string, Set<string>>();
  private weak = new Map<string, Set<string>>();
  private same = new Map<string, string>();

  private put(map: Map<string, Set<string>>, key: string, id: string): void {
    const set = map.get(key);
    if (set) set.add(id);
    else map.set(key, new Set([id]));
  }

  add(id: string, card: RemoteCard, extra?: ContactExtra, recordKeyValue?: string, exact = true): void {
    if (recordKeyValue) this.byRecord.set(recordKeyValue, id);
    const keys = keysOf(card, extra);
    for (const { key } of keys.strong) this.put(this.strong, key, id);
    for (const key of keys.weak) this.put(this.weak, key, id);
    if (exact) {
      const full = fullKey(card);
      if (full && !this.same.has(full)) this.same.set(full, id);
    }
  }

  find(sourceId: string, externalId: string, contact: IncomingContact): Pick<PlanItem, 'action' | 'targetId' | 'reason'> {
    const known = this.byRecord.get(recordKey(sourceId, externalId));
    if (known) return { action: 'update', targetId: known };

    const keys = keysOf(contact.card, contact.extra);
    let shared: string | undefined;
    for (const { key, reason } of keys.strong) {
      const ids = this.strong.get(key);
      if (!ids || ids.size === 0) continue;
      const first = ids.values().next().value as string;
      if (ids.size > SHARED_KEY_LIMIT) {
        shared = shared ?? first;
        continue;
      }
      if (ids.size === 1) return { action: 'merge', targetId: first, reason };
      // Zwei Kontakte teilen den Schlüssel: nicht entscheidbar, also nachfragen
      return { action: 'maybe', targetId: first, reason };
    }

    const full = fullKey(contact.card);
    const identical = full ? this.same.get(full) : undefined;
    if (identical) return { action: 'merge', targetId: identical, reason: 'same' };

    for (const key of keys.weak) {
      const ids = this.weak.get(key);
      if (ids && ids.size > 0) {
        return { action: 'maybe', targetId: ids.values().next().value as string, reason: 'name' };
      }
    }
    if (shared) return { action: 'maybe', targetId: shared, reason: 'shared' };
    return { action: 'new' };
  }
}

/**
 * Gleicht eingelesene Kontakte mit dem Bestand und untereinander ab.
 * Verändert nichts; das Ergebnis ist die Vorlage für die Vorschau.
 */
export function planImport(
  connections: Record<string, Connection>,
  sourceId: string,
  incoming: IncomingContact[]
): PlanItem[] {
  const index = new Index();

  for (const connection of Object.values(connections)) {
    const records = Object.values(connection.records ?? {});
    // Die angezeigte Karte zählt für E-Mail, Telefon und Name, aber nicht als
    // "vollständig gleich": Das gilt nur für den Stand einer Quelle.
    if (connection.remoteCard) index.add(connection.id, connection.remoteCard, undefined, undefined, records.length === 0);
    for (const record of records) {
      index.add(connection.id, record.card ?? {}, record.extra, recordKey(record.sourceId, record.externalId));
    }
  }

  const plan: PlanItem[] = [];
  const usedIds = new Set<string>();

  incoming.forEach((contact, position) => {
    let externalId = (contact.externalId || fallbackExternalId(contact)).slice(0, 200);
    // Dieselbe Kennung zweimal im selben Import: eindeutig machen
    for (let n = 2; usedIds.has(externalId); n++) {
      externalId = `${(contact.externalId || fallbackExternalId(contact)).slice(0, 190)}-${n}`;
    }
    usedIds.add(externalId);

    const match = index.find(sourceId, externalId, contact);
    const item: PlanItem = { index: position, contact, externalId, ...match };
    plan.push(item);

    // Damit spätere Einträge desselben Imports diesen finden
    const ownId = item.action === 'new' || item.action === 'maybe' ? `new:${position}` : item.targetId!;
    index.add(ownId, contact.card, contact.extra, recordKey(sourceId, externalId));
  });

  return plan;
}

export interface PlanSummary {
  fresh: number;
  updates: number;
  merges: number;
  maybes: number;
}

export function summarizePlan(plan: PlanItem[]): PlanSummary {
  const summary: PlanSummary = { fresh: 0, updates: 0, merges: 0, maybes: 0 };
  for (const item of plan) {
    if (item.action === 'new') summary.fresh++;
    else if (item.action === 'update') summary.updates++;
    else if (item.action === 'merge') summary.merges++;
    else summary.maybes++;
  }
  return summary;
}

// --- Doppelte Einträge im Bestand ---

export interface DuplicatePair {
  aId: string;
  bId: string;
  /** sure: gleiche E-Mail, Telefonnummer oder Profiladresse; maybe: bitte prüfen */
  level: 'sure' | 'maybe';
  reason: MatchReason;
}

/** Größere Gruppen (z. B. alle Kollegen mit derselben Zentrale) werden nicht gemeldet */
const MAX_GROUP = 6;

/**
 * Sucht im Bestand nach Kontakten, die vermutlich dieselbe Person sind.
 * Zwei verbundene Kontakte werden nie gemeldet: Das sind zwei Geräte und
 * damit zwei Personen. Bereits als verschieden bestätigte Paare entfallen.
 */
export function findDuplicates(
  connections: Record<string, Connection>,
  notDuplicates: Record<string, boolean> | undefined
): DuplicatePair[] {
  const strong = new Map<string, { ids: Set<string>; reason: MatchReason }>();
  const weak = new Map<string, Set<string>>();

  for (const connection of Object.values(connections)) {
    const sets: Keys[] = [];
    if (connection.remoteCard) sets.push(keysOf(connection.remoteCard));
    for (const record of Object.values(connection.records ?? {})) sets.push(keysOf(record.card ?? {}, record.extra));
    for (const keys of sets) {
      for (const { key, reason } of keys.strong) {
        const entry = strong.get(key);
        if (entry) entry.ids.add(connection.id);
        else strong.set(key, { ids: new Set([connection.id]), reason });
      }
      for (const key of keys.weak) {
        const ids = weak.get(key);
        if (ids) ids.add(connection.id);
        else weak.set(key, new Set([connection.id]));
      }
    }
  }

  const pairs = new Map<string, DuplicatePair>();
  const consider = (ids: Set<string>, level: DuplicatePair['level'], reason: MatchReason) => {
    if (ids.size < 2 || ids.size > MAX_GROUP) return;
    const list = [...ids].sort();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = connections[list[i]];
        const b = connections[list[j]];
        if (!a || !b) continue;
        if (a.kind !== 'local' && b.kind !== 'local') continue;
        const key = pairKey(a.id, b.id);
        if (notDuplicates?.[key]) continue;
        const known = pairs.get(key);
        if (!known || (known.level === 'maybe' && level === 'sure')) {
          pairs.set(key, { aId: a.id, bId: b.id, level, reason });
        }
      }
    }
  };

  for (const { ids, reason } of strong.values()) {
    if (ids.size === 2) consider(ids, 'sure', reason);
    else consider(ids, 'maybe', 'shared');
  }
  for (const ids of weak.values()) consider(ids, 'maybe', 'name');

  return [...pairs.values()].sort((x, y) => (x.level === y.level ? 0 : x.level === 'sure' ? -1 : 1));
}
