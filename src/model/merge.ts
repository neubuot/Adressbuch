/**
 * Berechnet die angezeigte Karte eines nicht verbundenen Kontakts aus den
 * Datensätzen seiner Quellen.
 *
 * Rangfolge je Feld: eigene Eingabe von Hand, danach die Importquellen nach
 * `rank` (kleiner gewinnt), bei gleichem Rang der jüngere Datensatz. Ein
 * leerer Wert einer Importquelle überschreibt nie einen vorhandenen Wert.
 * Nur die eigene Eingabe kann ein Feld bewusst leeren.
 */

import {
  ADDRESS_CARD_FIELDS,
  MANUAL_SOURCE_ID,
  type AddressCardField,
  type ImportSource,
  type RemoteCard,
  type SourceRecord,
} from '../types';

type Records = Record<string, SourceRecord> | undefined;
type Sources = Record<string, ImportSource> | undefined;

/** Rang für Datensätze, deren Quelle nicht (mehr) bekannt ist */
const UNKNOWN_RANK = 100000;

function rankOf(record: SourceRecord, sources: Sources): number {
  if (record.sourceId === MANUAL_SOURCE_ID) return -Infinity;
  const rank = sources?.[record.sourceId]?.rank;
  return typeof rank === 'number' ? rank : UNKNOWN_RANK;
}

/** Datensätze in der Reihenfolge, in der sie gelten */
export function orderedRecords(records: Records, sources: Sources): SourceRecord[] {
  return Object.values(records ?? {}).sort((a, b) => {
    const byRank = rankOf(a, sources) - rankOf(b, sources);
    if (byRank !== 0 && !Number.isNaN(byRank)) return byRank;
    return String(b.importedAt).localeCompare(String(a.importedAt));
  });
}

export interface MergedCard {
  card: RemoteCard;
  /** Je Feld die Quelle, aus der der angezeigte Wert stammt */
  origins: Partial<Record<AddressCardField, string>>;
}

export function mergeRecordsDetailed(records: Records, sources: Sources): MergedCard {
  const ordered = orderedRecords(records, sources);
  const card: RemoteCard = {};
  const origins: Partial<Record<AddressCardField, string>> = {};

  for (const field of ADDRESS_CARD_FIELDS) {
    for (const record of ordered) {
      const value = record.card?.[field];
      if (record.sourceId === MANUAL_SOURCE_ID) {
        // Von Hand gesetzt: gilt immer, auch als bewusst geleertes Feld
        if (typeof value === 'string') {
          if (value !== '') {
            card[field] = value;
            origins[field] = record.sourceId;
          }
          break;
        }
      } else if (typeof value === 'string' && value !== '') {
        card[field] = value;
        origins[field] = record.sourceId;
        break;
      }
    }
  }
  return { card, origins };
}

export function mergeRecords(records: Records, sources: Sources): RemoteCard {
  return mergeRecordsDetailed(records, sources).card;
}

/**
 * Leitet aus einer von Hand bearbeiteten Karte den Datensatz "eigene Eingabe"
 * ab: Er enthält nur die Felder, die von dem abweichen, was die Importquellen
 * liefern. So bleiben alle anderen Felder bei späteren Importen aktuell.
 * Gibt null zurück, wenn nichts abweicht.
 */
export function manualOverrides(
  edited: RemoteCard,
  records: Records,
  sources: Sources
): RemoteCard | null {
  const imported: Record<string, SourceRecord> = {};
  for (const [key, record] of Object.entries(records ?? {})) {
    if (record.sourceId !== MANUAL_SOURCE_ID) imported[key] = record;
  }
  const base = mergeRecords(imported, sources);

  const overrides: RemoteCard = {};
  for (const field of ADDRESS_CARD_FIELDS) {
    const value = (edited[field] ?? '').trim().slice(0, 500);
    if (value !== (base[field] ?? '')) overrides[field] = value;
  }
  return Object.keys(overrides).length > 0 ? overrides : null;
}
