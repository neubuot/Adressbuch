/**
 * Migration älterer Datenstände auf das aktuelle Schema.
 *
 * Die Funktionen arbeiten direkt auf dem veränderbaren Dokument (Automerge-
 * Entwurf oder einfaches Objekt) und sind beliebig oft ausführbar.
 */

import { ADDRESS_CARD_FIELDS, LEGACY_SOURCE_ID, SCHEMA_VERSION, recordKey, schemaMajor } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Umbenennungen von Schema 1 nach Schema 2 */
export const V1_FIELD_RENAMES: Record<string, string> = {
  email: 'emailPrivate',
  phone: 'phoneMobile',
};

const COUNTRY_NAMES: Record<string, string> = {
  deutschland: 'DE',
  germany: 'DE',
  österreich: 'AT',
  oesterreich: 'AT',
  austria: 'AT',
  schweiz: 'CH',
  switzerland: 'CH',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Trennt "Musterstraße 12a" in Straße und Hausnummer.
 * Gibt null zurück, wenn sich die Angabe nicht eindeutig trennen lässt.
 */
export function splitStreet(value: string): { street: string; houseNumber: string } | null {
  const match = value.trim().match(/^(.*\D)\s+(\d+\s?[a-zA-Z]?(?:\s?[-/]\s?\d+\s?[a-zA-Z]?)?)$/);
  if (!match) return null;
  return { street: match[1].trim(), houseNumber: match[2].trim() };
}

export function normalizeCountry(value: string): string {
  const trimmed = value.trim();
  return COUNTRY_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Benennt Felder einer Karte aus Schema 1 um (z. B. empfangene Karten).
 * Ein bereits vorhandener neuer Wert wird nicht überschrieben.
 */
function renameCardFields(card: any): void {
  for (const [oldKey, newKey] of Object.entries(V1_FIELD_RENAMES)) {
    if (oldKey in card) {
      const oldValue = card[oldKey];
      if (typeof oldValue === 'string' && oldValue !== '' && !card[newKey]) {
        card[newKey] = String(oldValue);
      }
      delete card[oldKey];
    }
  }
}

function renameFieldList(fields: unknown): string[] {
  const result: string[] = [];
  if (!Array.isArray(fields)) return result;
  for (const field of fields) {
    const renamed = V1_FIELD_RENAMES[String(field)] ?? String(field);
    if (!result.includes(renamed)) result.push(renamed);
  }
  return result;
}

/**
 * true, wenn der gespeicherte Stand von einer neueren App-Version stammt,
 * die diese Version nicht versteht. Dann darf nichts verändert werden.
 */
export function isFromNewerApp(doc: any): boolean {
  return schemaMajor(doc?.schemaVersion) > schemaMajor(SCHEMA_VERSION);
}

export function needsMigration(doc: any): boolean {
  if (isFromNewerApp(doc)) return false;
  if (doc.schemaVersion !== SCHEMA_VERSION) return true;
  if (!doc.tags || !doc.activity || !doc.connections || !doc.sources) return true;
  return ADDRESS_CARD_FIELDS.some((field) => typeof doc.myCard?.[field] !== 'string');
}

/**
 * Bringt ein Dokument auf das aktuelle Schema. Vorhandene Angaben bleiben
 * erhalten; es werden nur Felder ergänzt oder umbenannt.
 */
export function migrateState(doc: any): void {
  const fromMajor = schemaMajor(doc.schemaVersion);

  if (!doc.myCard) doc.myCard = { id: createUuid(), updatedAt: new Date().toISOString() };
  if (!doc.connections) doc.connections = {};
  if (!doc.tags) doc.tags = {};
  if (!doc.activity) doc.activity = [];
  if (!doc.knownPeers) doc.knownPeers = [];

  const card = doc.myCard;

  if (fromMajor < 2) {
    renameCardFields(card);

    if (typeof card.street === 'string' && card.street && !card.houseNumber) {
      const parts = splitStreet(String(card.street));
      if (parts) {
        card.street = parts.street;
        card.houseNumber = parts.houseNumber;
      }
    }
    if (typeof card.country === 'string' && card.country) {
      const normalized = normalizeCountry(String(card.country));
      if (normalized !== String(card.country)) card.country = normalized;
    }
    if (!UUID_PATTERN.test(String(card.id || ''))) {
      card.id = createUuid();
    }

    for (const id of Object.keys(doc.connections)) {
      const connection = doc.connections[id];
      const renamed = renameFieldList(connection.allowedFields);
      const current = Array.isArray(connection.allowedFields)
        ? connection.allowedFields.map(String)
        : [];
      if (renamed.join('|') !== current.join('|')) {
        connection.allowedFields = renamed;
      }
      if (connection.remoteCard) {
        renameCardFields(connection.remoteCard);
        delete connection.remoteCard.id;
        delete connection.remoteCard.updatedAt;
      }
      if (!connection.kind) connection.kind = 'linked';
    }
  }

  for (const field of ADDRESS_CARD_FIELDS) {
    if (typeof card[field] !== 'string') card[field] = '';
  }
  if (!card.custom) card.custom = {};

  migrateRecords(doc);

  doc.schemaVersion = SCHEMA_VERSION;
}

/**
 * Schema 2.1: Nicht verbundene Einträge aus früheren Importen bekommen
 * einen Datensatz der Quelle "Frühere Importe". Die angezeigte Karte bleibt
 * dabei unverändert.
 */
function migrateRecords(doc: any): void {
  if (!doc.sources) doc.sources = {};

  for (const id of Object.keys(doc.connections)) {
    const connection = doc.connections[id];
    if (connection.kind !== 'local' || connection.records) continue;
    const card = connection.remoteCard ? JSON.parse(JSON.stringify(connection.remoteCard)) : {};
    if (Object.keys(card).length === 0) continue;

    if (!doc.sources[LEGACY_SOURCE_ID]) {
      doc.sources[LEGACY_SOURCE_ID] = {
        id: LEGACY_SOURCE_ID,
        kind: 'legacy',
        name: 'Frühere Importe',
        rank: 1000,
      };
    }
    connection.records = {
      [recordKey(LEGACY_SOURCE_ID, id)]: {
        sourceId: LEGACY_SOURCE_ID,
        externalId: id,
        importedAt: String(connection.createdAt || new Date().toISOString()),
        card,
      },
    };
  }
}
