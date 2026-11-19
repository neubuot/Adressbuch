/**
 * Export der Kontakte als CSV, JSON oder vCard
 */

import type { Connection, Tag } from '../types';
import { CARD_FIELDS, PRIVATE_FIELDS, describeShare } from '../model/fields';
import { contactName, contactSortKey } from '../model/contact';
import { toCsv } from './csv';
import { toVCard } from './vcard';

export type ExportSort = 'name' | 'createdAt' | 'lastSyncAt';
export type ExportFormat = 'csv' | 'json' | 'vcard';

export interface ExportOptions {
  /** Leer = alle Kontakte; sonst Kontakte mit mindestens einem dieser Tags */
  tagIds: string[];
  sortBy: ExportSort;
  descending: boolean;
  /** Eigene Notizen und weitere private Angaben mit ausgeben */
  includePrivate: boolean;
}

/**
 * Wählt Kontakte nach Tags aus und bringt sie in die gewünschte Reihenfolge
 */
export function selectForExport(connections: Connection[], options: ExportOptions): Connection[] {
  const selected = connections.filter(
    (connection) =>
      options.tagIds.length === 0 || options.tagIds.some((tagId) => connection.tagIds?.includes(tagId))
  );

  const time = (value: string | undefined) => (value ? new Date(value).getTime() || 0 : 0);
  selected.sort((a, b) => {
    let result: number;
    switch (options.sortBy) {
      case 'createdAt':
        result = time(a.createdAt) - time(b.createdAt);
        break;
      case 'lastSyncAt':
        result = time(a.lastSyncAt) - time(b.lastSyncAt);
        break;
      default:
        result = contactSortKey(a).localeCompare(contactSortKey(b), 'de');
    }
    if (result === 0) result = contactSortKey(a).localeCompare(contactSortKey(b), 'de');
    return options.descending ? -result : result;
  });

  return selected;
}

function tagNames(connection: Connection, tags: Record<string, Tag>): string[] {
  return (connection.tagIds ?? []).map((tagId) => tags[tagId]?.name).filter((name): name is string => !!name);
}

export function exportCsv(connections: Connection[], tags: Record<string, Tag>, includePrivate: boolean): string {
  const header = [
    'name',
    'zustand',
    'angelegt_am',
    'zuletzt_abgeglichen',
    'freigabe',
    'tags',
    ...CARD_FIELDS.map((field) => field.exportName),
    ...(includePrivate ? PRIVATE_FIELDS.map((field) => field.exportName) : []),
  ];

  const rows = connections.map((connection) => [
    contactName(connection),
    connection.kind === 'local' ? 'nicht verbunden' : 'verbunden',
    connection.createdAt ?? '',
    connection.lastSyncAt ?? '',
    connection.kind === 'local' ? '' : describeShare(connection.allowedFields),
    tagNames(connection, tags).join(', '),
    ...CARD_FIELDS.map((field) => connection.remoteCard?.[field.key] ?? ''),
    ...(includePrivate ? PRIVATE_FIELDS.map((field) => connection.private?.[field.key] ?? '') : []),
  ]);

  return toCsv([header, ...rows]);
}

export function exportJson(connections: Connection[], tags: Record<string, Tag>, includePrivate: boolean): string {
  const data = connections.map((connection) => {
    const card: Record<string, string> = {};
    for (const field of CARD_FIELDS) {
      const value = connection.remoteCard?.[field.key];
      if (value) card[field.exportName] = value;
    }
    const entry: Record<string, unknown> = {
      name: contactName(connection),
      verbunden: connection.kind !== 'local',
      angelegt_am: connection.createdAt ?? null,
      zuletzt_abgeglichen: connection.lastSyncAt ?? null,
      freigegebene_felder:
        connection.kind === 'local'
          ? []
          : connection.allowedFields.map(
              (key) => CARD_FIELDS.find((field) => field.key === key)?.exportName ?? key
            ),
      tags: tagNames(connection, tags),
      karte: card,
    };
    if (includePrivate) {
      const own: Record<string, string> = {};
      for (const field of PRIVATE_FIELDS) {
        const value = connection.private?.[field.key];
        if (value) own[field.exportName] = value;
      }
      entry.eigene_angaben = own;
    }
    return entry;
  });

  return JSON.stringify({ exportiert_am: new Date().toISOString(), kontakte: data }, null, 2);
}

export function exportVCards(connections: Connection[], includePrivate: boolean): string {
  return connections
    .map((connection) => {
      const card = { ...(connection.remoteCard ?? {}) };
      if (!card.firstName && !card.lastName && !card.organization) {
        card.lastName = contactName(connection);
      }
      return toVCard(card, includePrivate ? connection.private?.notes : undefined);
    })
    .join('');
}
