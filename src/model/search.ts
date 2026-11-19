/**
 * Suche über alle Kontakte und alle Felder
 */

import type { Connection, Tag } from '../types';
import { ADDRESS_CARD_FIELDS, CONTACT_PRIVATE_FIELDS } from '../types';
import { getFieldLabel } from './fields';
import { contactName, contactSortKey } from './contact';

export function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('de')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export interface SearchHit {
  connection: Connection;
  /** Feld, in dem der Treffer liegt, falls er nicht schon im Namen steht */
  matchLabel?: string;
  matchValue?: string;
}

interface Entry {
  label?: string;
  value: string;
  normalized: string;
  digits: string;
}

function entriesOf(connection: Connection, tags: Record<string, Tag>): Entry[] {
  const entries: Entry[] = [];
  const add = (value: string | undefined, label?: string) => {
    if (!value) return;
    entries.push({ label, value, normalized: normalizeText(value), digits: digitsOnly(value) });
  };

  add(contactName(connection));
  add(connection.knownName);
  for (const field of ADDRESS_CARD_FIELDS) {
    const isName = field === 'firstName' || field === 'lastName';
    add(connection.remoteCard?.[field], isName ? undefined : getFieldLabel(field));
  }
  for (const field of CONTACT_PRIVATE_FIELDS) {
    add(connection.private?.[field], getFieldLabel(field));
  }
  for (const tagId of connection.tagIds ?? []) {
    add(tags[tagId]?.name, 'Tag');
  }
  return entries;
}

/**
 * Findet Kontakte. Jedes Suchwort muss in irgendeinem Feld vorkommen;
 * Telefonnummern werden unabhängig von Leerzeichen und Trennzeichen gefunden.
 * Mit `tagIds` bleiben nur Kontakte, die alle gewählten Tags tragen.
 */
export function searchContacts(
  connections: Connection[],
  tags: Record<string, Tag>,
  query: string,
  tagIds: string[] = []
): SearchHit[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];

  for (const connection of connections) {
    if (tagIds.length > 0 && !tagIds.every((tagId) => connection.tagIds?.includes(tagId))) {
      continue;
    }
    if (words.length === 0) {
      hits.push({ connection });
      continue;
    }

    const entries = entriesOf(connection, tags);
    let detail: Entry | undefined;
    const allMatch = words.every((word) => {
      const wordDigits = digitsOnly(word);
      const numeric = wordDigits.length >= 3 && wordDigits.length >= word.length - 2;
      const match = entries.find(
        (entry) => entry.normalized.includes(word) || (numeric && entry.digits.includes(wordDigits))
      );
      if (match?.label && !detail) detail = match;
      return !!match;
    });

    if (allMatch) {
      hits.push(
        detail
          ? { connection, matchLabel: detail.label, matchValue: detail.value }
          : { connection }
      );
    }
  }

  return hits.sort((a, b) =>
    contactSortKey(a.connection).localeCompare(contactSortKey(b.connection), 'de')
  );
}
