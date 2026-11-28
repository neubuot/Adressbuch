/**
 * Automerge-Store mit Dexie-Persistenz
 */

import * as Automerge from '@automerge/automerge';
import { db, type StoredDocument } from './db';
import {
  ADDRESS_CARD_FIELDS,
  CONTACT_PRIVATE_FIELDS,
  LEGACY_SOURCE_ID,
  MANUAL_SOURCE_ID,
  SCHEMA_VERSION,
  INTRO_MAX_AGE_DAYS,
  createEmptyCard,
  pairKey,
  recordKey,
  type ActivityEntry,
  type AddressCard,
  type AppState,
  type Connection,
  type ContactPrivate,
  type ImportSource,
  type MergedContact,
  type RemoteCard,
  type SourceRecord,
} from '../types';
import { manualOverrides, mergeRecords } from '../model/merge';
import type { IncomingContact } from '../model/dedupe';
import { createUuid, isFromNewerApp, migrateState, needsMigration } from './migrate';
import { isExpired, keepFields, sanitizeRemoteCard, type ShareLimit } from '../utils/policy';
import { isCardField } from '../model/fields';
import { displayNameOfCard } from '../model/contact';

/** Wie viele Einträge die Änderungsübersicht höchstens behält */
const MAX_ACTIVITY_ENTRIES = 300;

/**
 * Warum der Store nicht beschreibbar ist:
 * - `newer`: Die Daten stammen von einer neueren App-Version.
 * - `unreadable`: Die gespeicherten Daten konnten nicht gelesen werden.
 * In beiden Fällen wird nichts überschrieben.
 */
export type StoreBlock = 'newer' | 'unreadable' | null;

/* eslint-disable @typescript-eslint/no-explicit-any */

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Ein Eintrag eines Imports, wie ihn die Vorschau freigegeben hat */
export interface ImportItem {
  /** Position im Import; andere Einträge verweisen mit new:<index> darauf */
  index: number;
  contact: IncomingContact;
  externalId: string;
  /** Vorhandener Kontakt oder new:<index>; ohne Angabe entsteht ein neuer Eintrag */
  targetId?: string;
}

export interface ImportOptions {
  /** true: Bei abweichenden Angaben gilt diese Quelle vor den anderen Importquellen */
  leading?: boolean;
  tagIds?: string[];
  dataOrigin?: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  merged: number;
  ids: string[];
}

function ensureLegacySource(doc: AppState): void {
  if (!doc.sources) doc.sources = {};
  if (!doc.sources[LEGACY_SOURCE_ID]) {
    doc.sources[LEGACY_SOURCE_ID] = { id: LEGACY_SOURCE_ID, kind: 'legacy', name: 'Frühere Importe', rank: 1000 };
  }
}

/**
 * Berechnet die angezeigte Karte eines nicht verbundenen Kontakts neu.
 * Bei verbundenen Kontakten stammt die Karte von der anderen Person und
 * bleibt unberührt.
 */
function recomputeCard(doc: AppState, connection: Connection): void {
  if (connection.kind !== 'local' || !connection.records) return;
  const card = mergeRecords(plain(connection.records), doc.sources ? plain(doc.sources) : undefined);
  connection.remoteCard = card;
  const name = displayNameOfCard(card);
  if (name && connection.knownName !== name) connection.knownName = name;
}

function cleanExtra(extra: IncomingContact['extra']): SourceRecord['extra'] | undefined {
  if (!extra) return undefined;
  const clean = (list: string[] | undefined) =>
    (list ?? [])
      .filter((value) => typeof value === 'string' && value.trim() !== '')
      .map((value) => value.trim().slice(0, 500))
      .slice(0, 20);
  const emails = clean(extra.emails);
  const phones = clean(extra.phones);
  if (emails.length === 0 && phones.length === 0) return undefined;
  return { ...(emails.length > 0 ? { emails } : {}), ...(phones.length > 0 ? { phones } : {}) };
}

export class AutomergeStore {
  private doc: Automerge.Doc<AppState>;
  private docId = 'myCard';
  private changeListeners: Array<(doc: Automerge.Doc<AppState>) => void> = [];
  private blocked: StoreBlock = null;
  private isNew = true;

  constructor() {
    this.doc = this.createInitialDoc();
  }

  private createInitialDoc(): Automerge.Doc<AppState> {
    const initialState: AppState = {
      schemaVersion: SCHEMA_VERSION,
      myCard: createEmptyCard(createUuid()),
      connections: {},
      tags: {},
      sources: {},
      activity: [],
      knownPeers: [],
    };
    return Automerge.from(initialState as unknown as Record<string, unknown>) as Automerge.Doc<AppState>;
  }

  /**
   * Lädt den gespeicherten Stand aus IndexedDB und migriert ihn bei Bedarf.
   */
  async load(): Promise<void> {
    let stored: StoredDocument | undefined;
    try {
      stored = await db.documents.get(this.docId);
    } catch (error) {
      console.error('Gespeicherte Daten nicht lesbar', error);
      this.blocked = 'unreadable';
      return;
    }

    if (!stored) {
      this.isNew = true;
      await this.save();
      return;
    }

    try {
      let doc = Automerge.load<AppState>(stored.snapshot);
      if (stored.changes && stored.changes.length > 0) {
        for (const change of stored.changes) {
          doc = Automerge.loadIncremental(doc, change);
        }
      }
      this.adopt(doc);
    } catch (error) {
      // Wichtig: Hier wird NICHT gespeichert, damit ein beschädigter oder
      // unbekannter Stand nicht durch ein leeres Adressbuch ersetzt wird.
      console.error('Gespeicherte Daten nicht lesbar', error);
      this.blocked = 'unreadable';
      return;
    }

    if (!this.blocked) {
      await this.save();
    }
    this.notifyListeners();
  }

  /**
   * Übernimmt ein geladenes Dokument: prüft die Version, migriert und setzt
   * den Verbindungszustand zurück (nach dem Start ist niemand verbunden).
   */
  private adopt(doc: Automerge.Doc<AppState>): void {
    this.isNew = false;

    if (isFromNewerApp(doc)) {
      this.doc = doc;
      this.blocked = 'newer';
      return;
    }
    this.blocked = null;

    if (needsMigration(doc)) {
      doc = Automerge.change(doc, 'Migration auf Schema ' + SCHEMA_VERSION, (draft) => {
        migrateState(draft);
      });
    }

    const stale = Object.values(doc.connections).filter((c) => c.status !== 'offline');
    if (stale.length > 0) {
      doc = Automerge.change(doc, 'Verbindungszustand zurücksetzen', (draft) => {
        for (const connection of Object.values(draft.connections)) {
          if (connection.status !== 'offline') connection.status = 'offline';
        }
      });
    }

    this.doc = doc;
  }

  getBlock(): StoreBlock {
    return this.blocked;
  }

  /** true, solange auf diesem Gerät noch nie etwas gespeichert war */
  isFirstStart(): boolean {
    return this.isNew;
  }

  /**
   * Speichert den aktuellen Stand in IndexedDB
   */
  async save(): Promise<void> {
    if (this.blocked) return;
    try {
      const stored: StoredDocument = {
        id: this.docId,
        snapshot: Automerge.save(this.doc),
        changes: [],
        updatedAt: new Date().toISOString(),
      };
      await db.documents.put(stored);
    } catch (error) {
      console.error('Fehler beim Speichern', error);
    }
  }

  getDoc(): AppState {
    return this.doc;
  }

  /**
   * Ändert das Dokument und speichert es
   */
  async change(message: string, callback: (doc: AppState) => void): Promise<void> {
    if (this.blocked) return;
    this.doc = Automerge.change(this.doc, message, callback);
    await this.save();
    this.notifyListeners();
  }

  /**
   * Aktualisiert die eigene Karte
   */
  async updateMyCard(updates: Partial<AddressCard>): Promise<void> {
    await this.change('Eigene Karte geändert', (doc) => {
      let changed = false;
      for (const field of ADDRESS_CARD_FIELDS) {
        const value = updates[field];
        if (typeof value === 'string' && value.trim() !== doc.myCard[field]) {
          doc.myCard[field] = value.trim();
          changed = true;
        }
      }
      if (changed) doc.myCard.updatedAt = new Date().toISOString();
    });
  }

  /**
   * Legt einen verbundenen Kontakt an
   */
  async addConnection(id: string, peerPubKey: string, allowedFields: string[]): Promise<void> {
    await this.change(`Kontakt ${id} hinzugefügt`, (doc) => {
      doc.connections[id] = {
        id,
        kind: 'linked',
        peerPubKey,
        allowedFields: [...allowedFields],
        storeRemoteCard: true,
        status: 'offline',
        createdAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Übernimmt einen Import. Jeder Eintrag wird als Datensatz seiner Quelle
   * abgelegt: an einem vorhandenen Kontakt (targetId) oder an einem neuen
   * nicht verbundenen Eintrag. Ein erneuter Import derselben Quelle ersetzt
   * nur deren Datensatz; nichts wird verdoppelt und nichts gelöscht.
   */
  async applyImport(
    source: Pick<ImportSource, 'id' | 'kind' | 'name'>,
    items: ImportItem[],
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const result: ImportResult = { created: 0, updated: 0, merged: 0, ids: [] };
    if (items.length === 0) return result;

    await this.change(`${items.length} Kontakt(e) aus ${source.name} übernommen`, (doc) => {
      const now = new Date().toISOString();
      if (!doc.sources) doc.sources = {};

      // Rang der Quelle: führend vor allen anderen, sonst hinter den vorhandenen
      const otherRanks = Object.values(doc.sources)
        .filter((entry) => entry.id !== source.id && entry.kind !== 'legacy')
        .map((entry) => entry.rank);
      const existing = doc.sources[source.id];
      if (!existing) {
        const rank = options.leading ? Math.min(0, ...otherRanks) - 1 : Math.max(0, ...otherRanks) + 1;
        doc.sources[source.id] = { id: source.id, kind: source.kind, name: source.name, rank, lastImportAt: now };
      } else {
        if (options.leading === true && otherRanks.some((rank) => rank <= existing.rank)) {
          existing.rank = Math.min(0, ...otherRanks) - 1;
        } else if (options.leading === false && otherRanks.some((rank) => rank >= existing.rank)) {
          existing.rank = Math.max(0, ...otherRanks) + 1;
        }
        existing.lastImportAt = now;
        if (existing.name !== source.name) existing.name = source.name;
      }

      const resolved = new Map<string, string>();
      const touched = new Set<string>();

      for (const item of [...items].sort((a, b) => a.index - b.index)) {
        const card = sanitizeRemoteCard(item.contact.card);
        const record: SourceRecord = {
          sourceId: source.id,
          externalId: item.externalId,
          importedAt: now,
          card,
        };
        const extra = cleanExtra(item.contact.extra);
        if (extra) record.extra = extra;
        const key = recordKey(source.id, item.externalId);

        let targetId = item.targetId;
        if (targetId && targetId.startsWith('new:')) targetId = resolved.get(targetId);
        let connection = targetId ? doc.connections[targetId] : undefined;

        if (connection) {
          const known = !!connection.records?.[key];
          if (!connection.records) {
            // Bestand ohne Datensätze: bisherige Karte als eigener Datensatz sichern
            connection.records = {};
            if (connection.kind === 'local' && connection.remoteCard && Object.keys(connection.remoteCard).length > 0) {
              ensureLegacySource(doc);
              connection.records[recordKey(LEGACY_SOURCE_ID, connection.id)] = {
                sourceId: LEGACY_SOURCE_ID,
                externalId: connection.id,
                importedAt: connection.createdAt || now,
                card: plain(connection.remoteCard),
              };
            }
          }
          connection.records[key] = record;
          if (known) result.updated++;
          else result.merged++;
        } else {
          const id = `local-${createUuid()}`;
          doc.connections[id] = {
            id,
            kind: 'local',
            peerPubKey: '',
            allowedFields: [],
            storeRemoteCard: true,
            status: 'offline',
            createdAt: now,
            remoteCard: { ...card },
            records: { [key]: record },
          };
          connection = doc.connections[id];
          if (options.dataOrigin) connection.private = { dataOrigin: options.dataOrigin };
          result.created++;
        }

        resolved.set(`new:${item.index}`, connection.id);
        touched.add(connection.id);

        if (item.contact.notes) {
          if (!connection.private) connection.private = {};
          if (!connection.private.notes) connection.private.notes = item.contact.notes.slice(0, 5000);
        }
        if (options.tagIds && options.tagIds.length > 0) {
          if (!connection.tagIds) connection.tagIds = [];
          for (const tagId of options.tagIds) {
            if (!connection.tagIds.includes(tagId)) connection.tagIds.push(tagId);
          }
        }
      }

      // Der Rang kann sich geändert haben: alle Kontakte mit Datensätzen dieser Quelle neu berechnen
      for (const connection of Object.values(doc.connections)) {
        if (touched.has(connection.id)) {
          recomputeCard(doc, connection);
        } else if (connection.kind === 'local' && connection.records) {
          if (Object.values(connection.records).some((entry) => entry.sourceId === source.id)) {
            recomputeCard(doc, connection);
          }
        }
      }
      result.ids = [...touched];
    });

    return result;
  }

  /**
   * Speichert eine von Hand bearbeitete Karte eines nicht verbundenen
   * Kontakts. Festgehalten wird nur, was von den Importquellen abweicht;
   * alle anderen Felder bleiben bei späteren Importen aktuell.
   */
  async editLocalCard(id: string, edited: RemoteCard): Promise<void> {
    const existing = this.doc.connections[id];
    if (!existing || existing.kind !== 'local') return;

    await this.change(`Eintrag ${id} bearbeitet`, (doc) => {
      const connection = doc.connections[id];
      if (!connection) return;
      if (!connection.records) connection.records = {};

      const key = recordKey(MANUAL_SOURCE_ID, id);
      const overrides = manualOverrides(
        edited,
        plain(connection.records),
        doc.sources ? plain(doc.sources) : undefined
      );
      if (overrides) {
        connection.records[key] = {
          sourceId: MANUAL_SOURCE_ID,
          externalId: id,
          importedAt: new Date().toISOString(),
          card: overrides,
        };
      } else if (connection.records[key]) {
        delete connection.records[key];
      }
      recomputeCard(doc, connection);
    });
  }

  /**
   * Führt zwei Einträge zu einem zusammen: Die Datensätze, Notizen und Tags
   * von `dropId` gehen auf `keepId` über. `dropId` muss ein nicht verbundener
   * Eintrag sein. Es geht nichts verloren; `splitContact` trennt wieder.
   */
  async mergeContacts(keepId: string, dropId: string): Promise<boolean> {
    const keep = this.doc.connections[keepId];
    const drop = this.doc.connections[dropId];
    if (!keep || !drop || keepId === dropId || drop.kind !== 'local') return false;
    const snapshot = plain(drop);

    await this.change(`Eintrag ${dropId} mit ${keepId} zusammengeführt`, (doc) => {
      const target = doc.connections[keepId];
      if (!target) return;
      const now = new Date().toISOString();

      if (!target.records) {
        target.records = {};
        if (target.kind === 'local' && target.remoteCard && Object.keys(target.remoteCard).length > 0) {
          ensureLegacySource(doc);
          target.records[recordKey(LEGACY_SOURCE_ID, target.id)] = {
            sourceId: LEGACY_SOURCE_ID,
            externalId: target.id,
            importedAt: target.createdAt || now,
            card: plain(target.remoteCard),
          };
        }
      }

      const incoming: Record<string, SourceRecord> = snapshot.records ? { ...snapshot.records } : {};
      if (Object.keys(incoming).length === 0 && snapshot.remoteCard && Object.keys(snapshot.remoteCard).length > 0) {
        ensureLegacySource(doc);
        incoming[recordKey(LEGACY_SOURCE_ID, dropId)] = {
          sourceId: LEGACY_SOURCE_ID,
          externalId: dropId,
          importedAt: snapshot.createdAt || now,
          card: snapshot.remoteCard,
        };
      }

      const recordKeys: string[] = [];
      for (const [key, record] of Object.entries(incoming)) {
        let target_key = key;
        for (let n = 2; target.records[target_key]; n++) target_key = `${key}~${n}`;
        target.records[target_key] = record;
        recordKeys.push(target_key);
      }

      if (snapshot.private) {
        if (!target.private) target.private = {};
        for (const field of CONTACT_PRIVATE_FIELDS) {
          const value = snapshot.private[field];
          if (!value) continue;
          const own = target.private[field];
          if (!own) target.private[field] = value;
          else if (field === 'notes' && own !== value && !own.includes(value)) {
            target.private[field] = `${own}\n\n${value}`.slice(0, 10000);
          }
        }
      }
      if (snapshot.tagIds && snapshot.tagIds.length > 0) {
        if (!target.tagIds) target.tagIds = [];
        for (const tagId of snapshot.tagIds) {
          if (!target.tagIds.includes(tagId)) target.tagIds.push(tagId);
        }
      }
      if (snapshot.label && !target.label) target.label = snapshot.label;

      const memo: MergedContact = { id: dropId, at: now, recordKeys };
      if (snapshot.label) memo.label = snapshot.label;
      if (snapshot.knownName) memo.knownName = snapshot.knownName;
      if (snapshot.createdAt) memo.createdAt = snapshot.createdAt;
      if (snapshot.private) memo.private = snapshot.private;
      if (snapshot.tagIds && snapshot.tagIds.length > 0) memo.tagIds = snapshot.tagIds;
      if (!target.merged) target.merged = [];
      target.merged.push(memo);
      // Frühere Zusammenführungen des aufgelösten Eintrags bleiben trennbar
      for (const earlier of snapshot.merged ?? []) target.merged.push(earlier);

      recomputeCard(doc, target);
      delete doc.connections[dropId];
    });
    return true;
  }

  /**
   * Trennt einen zuvor zusammengeführten Eintrag wieder ab. Er entsteht als
   * eigener, nicht verbundener Eintrag mit seinen Datensätzen, Notizen und
   * Tags neu. Das Paar gilt danach als verschieden und wird nicht erneut
   * als doppelt gemeldet. Gibt die Kennung des neuen Eintrags zurück.
   */
  async splitContact(keepId: string, mergedId: string): Promise<string | null> {
    const keep = this.doc.connections[keepId];
    const memo = keep?.merged?.find((entry) => entry.id === mergedId);
    if (!keep || !memo) return null;
    const snapshot = plain(memo);
    const newId = this.doc.connections[snapshot.id] ? `local-${createUuid()}` : snapshot.id;

    await this.change(`Eintrag ${newId} von ${keepId} getrennt`, (doc) => {
      const source = doc.connections[keepId];
      if (!source) return;

      const records: Record<string, SourceRecord> = {};
      for (const key of snapshot.recordKeys) {
        const record = source.records?.[key];
        if (!record) continue;
        records[recordKey(record.sourceId, record.externalId)] = plain(record);
        delete source.records![key];
      }

      const restored: Connection = {
        id: newId,
        kind: 'local',
        peerPubKey: '',
        allowedFields: [],
        storeRemoteCard: true,
        status: 'offline',
        createdAt: snapshot.createdAt || new Date().toISOString(),
        records,
      };
      if (snapshot.label) restored.label = snapshot.label;
      if (snapshot.knownName) restored.knownName = snapshot.knownName;
      if (snapshot.private) restored.private = snapshot.private;
      if (snapshot.tagIds) restored.tagIds = snapshot.tagIds;
      doc.connections[newId] = restored;
      recomputeCard(doc, doc.connections[newId]);

      const index = source.merged ? source.merged.findIndex((entry) => entry.id === mergedId) : -1;
      if (index !== -1) source.merged!.splice(index, 1);
      recomputeCard(doc, source);

      if (!doc.notDuplicates) doc.notDuplicates = {};
      doc.notDuplicates[pairKey(keepId, newId)] = true;
    });
    return newId;
  }

  /** Merkt sich, dass zwei Einträge verschiedene Personen sind */
  async markDistinct(aId: string, bId: string): Promise<void> {
    await this.change(`Einträge ${aId} und ${bId} sind verschieden`, (doc) => {
      if (!doc.notDuplicates) doc.notDuplicates = {};
      doc.notDuplicates[pairKey(aId, bId)] = true;
    });
  }

  /**
   * Was das Zurücknehmen eines Imports bewirken würde: `removed` Einträge
   * bestehen nur aus dieser Quelle und würden gelöscht, `kept` behalten ihre
   * übrigen Angaben.
   */
  previewUndoImport(sourceId: string): { removed: number; kept: number } {
    let removed = 0;
    let kept = 0;
    for (const connection of Object.values(this.doc.connections)) {
      const records = Object.values(connection.records ?? {});
      if (!records.some((record) => record.sourceId === sourceId)) continue;
      const others = records.filter((record) => record.sourceId !== sourceId && record.sourceId !== MANUAL_SOURCE_ID);
      if (connection.kind === 'local' && others.length === 0) removed++;
      else kept++;
    }
    return { removed, kept };
  }

  /**
   * Nimmt einen Import zurück: Alle Datensätze der Quelle werden entfernt.
   * Nicht verbundene Einträge, die nur aus dieser Quelle bestanden, werden
   * samt Notizen gelöscht; alle anderen behalten ihre übrigen Angaben.
   */
  async undoImport(sourceId: string): Promise<{ removed: number; kept: number }> {
    const result = { removed: 0, kept: 0 };
    if (sourceId === MANUAL_SOURCE_ID) return result;

    await this.change(`Import ${sourceId} zurückgenommen`, (doc) => {
      for (const id of Object.keys(doc.connections)) {
        const connection = doc.connections[id];
        if (!connection.records) continue;
        const gone = Object.keys(connection.records).filter((key) => connection.records![key].sourceId === sourceId);
        if (gone.length === 0) continue;
        for (const key of gone) delete connection.records[key];

        const others = Object.values(connection.records).filter((record) => record.sourceId !== MANUAL_SOURCE_ID);
        if (connection.kind === 'local' && others.length === 0) {
          delete doc.connections[id];
          result.removed++;
          continue;
        }
        if (connection.merged) {
          for (let i = connection.merged.length - 1; i >= 0; i--) {
            const memo = connection.merged[i];
            const left = memo.recordKeys.filter((key) => !gone.includes(key));
            if (left.length === 0) connection.merged.splice(i, 1);
            else if (left.length !== memo.recordKeys.length) memo.recordKeys = left;
          }
        }
        recomputeCard(doc, connection);
        result.kept++;
      }
      if (doc.sources?.[sourceId]) delete doc.sources[sourceId];
    });
    return result;
  }

  /** Macht eine Importquelle zur führenden: Ihre Angaben gelten bei Abweichungen */
  async setLeadingSource(sourceId: string): Promise<void> {
    if (!this.doc.sources?.[sourceId]) return;
    await this.change(`Quelle ${sourceId} ist führend`, (doc) => {
      const source = doc.sources?.[sourceId];
      if (!source) return;
      const others = Object.values(doc.sources!)
        .filter((entry) => entry.id !== sourceId)
        .map((entry) => entry.rank);
      source.rank = Math.min(0, ...others) - 1;
      for (const connection of Object.values(doc.connections)) recomputeCard(doc, connection);
    });
  }

  /**
   * Aktualisiert einen Kontakt
   */
  async updateConnection(id: string, updates: Partial<Connection>): Promise<void> {
    if (!this.doc.connections[id]) return;
    await this.change(`Kontakt ${id} geändert`, (doc) => {
      const connection = doc.connections[id] as any;
      if (!connection) return;
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) {
          delete connection[key];
        } else if (typeof value === 'object' && value !== null) {
          connection[key] = plain(value);
        } else if (connection[key] !== value) {
          connection[key] = value;
        }
      }
    });
  }

  /**
   * Setzt nur den Verbindungszustand, ohne unnötige Änderungen zu erzeugen
   */
  async setConnectionStatus(id: string, status: Connection['status']): Promise<void> {
    const connection = this.doc.connections[id];
    if (!connection || connection.status === status) return;
    await this.updateConnection(id, { status });
  }

  /**
   * Ändert die privaten Angaben zu einem Kontakt (werden nie übertragen)
   */
  async updateContactPrivate(id: string, updates: Partial<ContactPrivate>): Promise<void> {
    if (!this.doc.connections[id]) return;
    await this.change(`Private Angaben zu ${id} geändert`, (doc) => {
      const connection = doc.connections[id];
      if (!connection) return;
      if (!connection.private) connection.private = {};
      for (const field of CONTACT_PRIVATE_FIELDS) {
        const value = updates[field];
        if (typeof value === 'string' && connection.private[field] !== value) {
          connection.private[field] = value;
        }
      }
    });
  }

  /**
   * Übernimmt die vom Kontakt empfangene Karte und hält fest, was sich
   * gegenüber dem bisherigen Stand geändert hat.
   * Gibt die Anzahl der geänderten Felder zurück.
   */
  async applyRemoteCard(id: string, received: unknown, limit: ShareLimit | null = null): Promise<number> {
    const existing = this.doc.connections[id];
    if (!existing) return 0;

    let card = sanitizeRemoteCard(received);
    // Eine Befristung, die schon abgelaufen ist, gilt sofort
    if (limit && isExpired(limit.until)) {
      card = keepFields(card, limit.keep);
      limit = null;
    }
    const previous: RemoteCard = existing.remoteCard ? plain(existing.remoteCard) : {};
    const isFirst = !existing.remoteCard;
    const now = new Date().toISOString();

    const entries: ActivityEntry[] = [];
    if (!isFirst) {
      for (const field of ADDRESS_CARD_FIELDS) {
        const oldValue = previous[field] ?? '';
        const newValue = card[field] ?? '';
        if (oldValue !== newValue) {
          entries.push({ id: createUuid(), connectionId: id, at: now, field, oldValue, newValue });
        }
      }
    }

    await this.change(`Karte von ${id} aktualisiert`, (doc) => {
      const connection = doc.connections[id];
      if (!connection) return;
      if (isFirst || entries.length > 0) {
        connection.remoteCard = card;
      }
      connection.lastSyncAt = now;
      if (limit) {
        if (connection.remoteUntil !== limit.until) connection.remoteUntil = limit.until;
        if ((connection.remoteKeep ?? []).join(',') !== limit.keep.join(',')) connection.remoteKeep = [...limit.keep];
      } else {
        if (connection.remoteUntil !== undefined) delete connection.remoteUntil;
        if (connection.remoteKeep !== undefined) delete connection.remoteKeep;
      }
      const name = displayNameOfCard(card);
      if (name && connection.knownName !== name) connection.knownName = name;

      if (entries.length > 0) {
        if (!doc.activity) doc.activity = [];
        for (const entry of entries) doc.activity.push(entry);
        const overflow = doc.activity.length - MAX_ACTIVITY_ENTRIES;
        if (overflow > 0) doc.activity.splice(0, overflow);
      }
    });

    return entries.length;
  }

  /**
   * Setzt die Freigabe für einen Kontakt. Mit `limit` gilt sie bis zu dem
   * genannten Zeitpunkt; danach sieht der Kontakt nur noch `limit.keep`.
   */
  async setShare(id: string, fields: string[], limit: ShareLimit | null = null): Promise<void> {
    const allowed = fields.filter(isCardField);
    await this.updateConnection(id, {
      allowedFields: allowed,
      shareUntil: limit ? limit.until : undefined,
      fieldsAfter: limit ? limit.keep.filter((field) => (allowed as string[]).includes(field)) : undefined,
    });
  }

  /**
   * Setzt abgelaufene Befristungen um, in beide Richtungen:
   * - eigene Freigaben fallen auf die Freigabe für danach zurück,
   * - empfangene Angaben, deren Frist um ist, werden hier entfernt.
   * Ändert nichts, solange keine Frist abgelaufen ist. Gibt die Anzahl der
   * betroffenen Kontakte zurück.
   */
  async expireShares(now: number = Date.now()): Promise<number> {
    const due = Object.values(this.doc.connections).filter(
      (connection) => isExpired(connection.shareUntil, now) || isExpired(connection.remoteUntil, now)
    );
    if (due.length === 0) return 0;
    const ids = due.map((connection) => connection.id);
    const at = new Date(now).toISOString();

    await this.change('Befristete Freigaben abgelaufen', (doc) => {
      for (const id of ids) {
        const connection = doc.connections[id];
        if (!connection) continue;

        if (isExpired(connection.shareUntil, now)) {
          const after = (connection.fieldsAfter ?? []).filter(isCardField);
          connection.allowedFields = [...after];
          delete connection.shareUntil;
          delete connection.fieldsAfter;
        }

        if (isExpired(connection.remoteUntil, now)) {
          const previous: RemoteCard = connection.remoteCard ? plain(connection.remoteCard) : {};
          const kept = keepFields(previous, [...(connection.remoteKeep ?? [])]);
          for (const field of ADDRESS_CARD_FIELDS) {
            const oldValue = previous[field] ?? '';
            if (oldValue && !kept[field]) {
              if (!doc.activity) doc.activity = [];
              doc.activity.push({ id: createUuid(), connectionId: id, at, field, oldValue, newValue: '' });
            }
          }
          if (connection.remoteCard) connection.remoteCard = kept;
          delete connection.remoteUntil;
          delete connection.remoteKeep;
        }
      }
      if (doc.activity) {
        const overflow = doc.activity.length - MAX_ACTIVITY_ENTRIES;
        if (overflow > 0) doc.activity.splice(0, overflow);
      }
    });
    return ids.length;
  }

  /**
   * Wandelt einen importierten Eintrag in eine echte Verbindung um:
   * Private Angaben, Tags und Bezeichnung gehen auf den verbundenen Kontakt über.
   */
  async mergeLocalIntoLinked(localId: string, linkedId: string): Promise<void> {
    const local = this.doc.connections[localId];
    if (!local || local.kind !== 'local' || !this.doc.connections[linkedId]) return;
    const snapshot = plain(local);

    await this.change(`Eintrag ${localId} mit ${linkedId} verbunden`, (doc) => {
      const linked = doc.connections[linkedId];
      if (!linked) return;

      if (snapshot.label && !linked.label) linked.label = snapshot.label;
      if (snapshot.createdAt && (!linked.createdAt || snapshot.createdAt < linked.createdAt)) {
        linked.createdAt = snapshot.createdAt;
      }
      if (snapshot.private) {
        if (!linked.private) linked.private = {};
        for (const field of CONTACT_PRIVATE_FIELDS) {
          const value = snapshot.private[field];
          if (value && !linked.private[field]) linked.private[field] = value;
        }
      }
      if (snapshot.tagIds && snapshot.tagIds.length > 0) {
        if (!linked.tagIds) linked.tagIds = [];
        for (const tagId of snapshot.tagIds) {
          if (!linked.tagIds.includes(tagId)) linked.tagIds.push(tagId);
        }
      }
      if (snapshot.knownName && !linked.knownName) linked.knownName = snapshot.knownName;

      // Die importierten Angaben bleiben als Datensätze erhalten, damit nichts
      // verloren geht, was die Person selbst (noch) nicht freigegeben hat.
      const records: Record<string, SourceRecord> = snapshot.records ? { ...snapshot.records } : {};
      if (Object.keys(records).length === 0 && snapshot.remoteCard && Object.keys(snapshot.remoteCard).length > 0) {
        ensureLegacySource(doc);
        records[recordKey(LEGACY_SOURCE_ID, localId)] = {
          sourceId: LEGACY_SOURCE_ID,
          externalId: localId,
          importedAt: snapshot.createdAt || new Date().toISOString(),
          card: snapshot.remoteCard,
        };
      }
      if (Object.keys(records).length > 0) {
        if (!linked.records) linked.records = {};
        for (const [key, record] of Object.entries(records)) {
          if (!linked.records[key]) linked.records[key] = record;
        }
      }

      delete doc.connections[localId];
    });
  }

  /**
   * Entfernt einen Kontakt samt zugehöriger Einträge der Änderungsübersicht
   */
  async removeConnection(id: string): Promise<void> {
    await this.change(`Kontakt ${id} entfernt`, (doc) => {
      delete doc.connections[id];
      for (const [introId, intro] of Object.entries(doc.introsOut ?? {})) {
        if (intro.aId === id || intro.bId === id) delete doc.introsOut![introId];
      }
      if (doc.activity) {
        for (let i = doc.activity.length - 1; i >= 0; i--) {
          if (doc.activity[i].connectionId === id) doc.activity.splice(i, 1);
        }
      }
    });
  }

  // --- Vorstellen ---

  /**
   * Stellt zwei verbundene Kontakte einander vor. Gibt die Kennung der
   * Vorstellung zurück oder null, wenn sie nicht möglich ist (kein
   * verbundener Kontakt, dieselbe Person, schon unterwegs).
   */
  async addIntro(aId: string, bId: string): Promise<string | null> {
    const a = this.doc.connections[aId];
    const b = this.doc.connections[bId];
    if (!a || !b || aId === bId || a.kind === 'local' || b.kind === 'local') return null;
    const pair = pairKey(aId, bId);
    const pending = Object.values(this.doc.introsOut ?? {}).some((intro) => pairKey(intro.aId, intro.bId) === pair);
    if (pending) return null;

    const id = createUuid();
    await this.change(`Vorstellung ${aId} und ${bId}`, (doc) => {
      if (!doc.introsOut) doc.introsOut = {};
      doc.introsOut[id] = { id, aId, bId, createdAt: new Date().toISOString() };
    });
    return id;
  }

  /** Nimmt eine noch nicht zugestellte Vorstellung zurück */
  async cancelIntroOut(id: string): Promise<void> {
    if (!this.doc.introsOut?.[id]) return;
    await this.change(`Vorstellung ${id} zurückgenommen`, (doc) => {
      if (doc.introsOut?.[id]) delete doc.introsOut[id];
    });
  }

  /** Die Gegenseite hat die Vorstellung erhalten; sind es beide, ist sie erledigt */
  async markIntroDelivered(id: string, connectionId: string): Promise<void> {
    const intro = this.doc.introsOut?.[id];
    if (!intro || (intro.aId !== connectionId && intro.bId !== connectionId)) return;
    await this.change(`Vorstellung ${id} zugestellt`, (doc) => {
      const entry = doc.introsOut?.[id];
      if (!entry) return;
      if (entry.aId === connectionId) entry.deliveredA = true;
      if (entry.bId === connectionId) entry.deliveredB = true;
      if (entry.deliveredA && entry.deliveredB) delete doc.introsOut![id];
    });
  }

  /**
   * Nimmt eine erhaltene Vorstellung entgegen. `fingerprint` ist die Kennung
   * der vorgestellten Person. Gibt false zurück, wenn sie (noch) nicht
   * angenommen werden kann; dann versucht es die Gegenseite später erneut.
   */
  async receiveIntro(
    fromId: string,
    intro: { id: string; pubKey: string; name: string },
    fingerprint: string,
    ownFingerprint: string
  ): Promise<boolean> {
    if (!this.doc.connections[fromId]) return false;
    // Mich selbst oder jemanden, mit dem ich schon verbunden bin: erledigt, nichts zu tun
    if (fingerprint === ownFingerprint) return true;
    const known = this.doc.connections[fingerprint];
    if (known && known.kind !== 'local') return true;
    if (this.doc.introsIn?.[fingerprint]) return true;
    if (Object.keys(this.doc.introsIn ?? {}).length >= 30) return false;

    const name = intro.name.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
    await this.change(`Vorstellung von ${fromId} erhalten`, (doc) => {
      if (!doc.introsIn) doc.introsIn = {};
      doc.introsIn[fingerprint] = {
        id: intro.id,
        fromId,
        pubKey: intro.pubKey,
        name,
        receivedAt: new Date().toISOString(),
        status: 'pending',
      };
    });
    return true;
  }

  /** Nimmt eine Vorstellung an; `fields` sieht die vorgestellte Person von mir */
  async acceptIntro(fingerprint: string, fields: string[]): Promise<void> {
    if (!this.doc.introsIn?.[fingerprint]) return;
    await this.change(`Vorstellung ${fingerprint} angenommen`, (doc) => {
      const intro = doc.introsIn?.[fingerprint];
      if (!intro) return;
      intro.status = 'accepted';
      intro.fields = fields.filter(isCardField);
    });
  }

  /** Lehnt eine Vorstellung ab oder zieht die eigene Zusage zurück */
  async dropIntro(fingerprint: string): Promise<void> {
    if (!this.doc.introsIn?.[fingerprint]) return;
    await this.change(`Vorstellung ${fingerprint} verworfen`, (doc) => {
      if (doc.introsIn?.[fingerprint]) delete doc.introsIn[fingerprint];
    });
  }

  /**
   * Aus einer angenommenen Vorstellung wird ein verbundener Kontakt.
   * Gibt false zurück, wenn es keine passende, angenommene Vorstellung gibt.
   */
  async completeIntro(fingerprint: string, pubKey: string): Promise<boolean> {
    const intro = this.doc.introsIn?.[fingerprint];
    if (!intro || intro.status !== 'accepted' || intro.pubKey !== pubKey) return false;
    const fields = [...(intro.fields ?? [])];
    const name = intro.name;
    const introducer = this.doc.connections[intro.fromId];
    const introducerName = introducer
      ? (introducer.label || '').trim() || displayNameOfCard(introducer.remoteCard) || (introducer.knownName || '').trim()
      : '';

    await this.change(`Kontakt ${fingerprint} über eine Vorstellung hinzugefügt`, (doc) => {
      const local = doc.connections[fingerprint];
      doc.connections[fingerprint] = {
        id: fingerprint,
        kind: 'linked',
        peerPubKey: pubKey,
        allowedFields: fields,
        storeRemoteCard: true,
        status: 'offline',
        createdAt: local?.createdAt || new Date().toISOString(),
      };
      const connection = doc.connections[fingerprint];
      if (name) connection.knownName = name;
      if (introducerName) connection.private = { source: `Vorgestellt von ${introducerName}` };
      if (doc.introsIn?.[fingerprint]) delete doc.introsIn[fingerprint];
    });
    return true;
  }

  /** Entfernt Vorstellungen, die zu lange unbeantwortet oder unzugestellt sind */
  async pruneIntros(now: number = Date.now()): Promise<void> {
    const limit = now - INTRO_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const tooOld = (iso: string) => {
      const time = Date.parse(iso);
      return !Number.isFinite(time) || time < limit;
    };
    const oldIn = Object.entries(this.doc.introsIn ?? {}).filter(([, intro]) => tooOld(intro.receivedAt)).map(([key]) => key);
    const oldOut = Object.entries(this.doc.introsOut ?? {}).filter(([, intro]) => tooOld(intro.createdAt)).map(([key]) => key);
    if (oldIn.length === 0 && oldOut.length === 0) return;
    await this.change('Alte Vorstellungen entfernt', (doc) => {
      for (const key of oldIn) if (doc.introsIn?.[key]) delete doc.introsIn[key];
      for (const key of oldOut) if (doc.introsOut?.[key]) delete doc.introsOut[key];
    });
  }

  async clearActivity(): Promise<void> {
    await this.change('Änderungsübersicht geleert', (doc) => {
      if (doc.activity) doc.activity.splice(0, doc.activity.length);
    });
  }

  // --- Tags ---

  async addTag(id: string, name: string, color: string): Promise<void> {
    await this.change(`Tag ${name} hinzugefügt`, (doc) => {
      if (!doc.tags) doc.tags = {};
      doc.tags[id] = { id, name, color, createdAt: new Date().toISOString() };
    });
  }

  async updateTag(id: string, updates: { name?: string; color?: string }): Promise<void> {
    await this.change(`Tag ${id} geändert`, (doc) => {
      const tag = doc.tags?.[id];
      if (!tag) return;
      if (updates.name !== undefined) tag.name = updates.name;
      if (updates.color !== undefined) tag.color = updates.color;
    });
  }

  async removeTag(id: string): Promise<void> {
    await this.change(`Tag ${id} entfernt`, (doc) => {
      if (doc.tags?.[id]) delete doc.tags[id];
      for (const connection of Object.values(doc.connections)) {
        if (!connection.tagIds) continue;
        const index = connection.tagIds.indexOf(id);
        if (index !== -1) connection.tagIds.splice(index, 1);
      }
    });
  }

  async addTagsToConnection(connectionId: string, tagIds: string[]): Promise<void> {
    await this.change(`Tags zu ${connectionId} hinzugefügt`, (doc) => {
      const connection = doc.connections[connectionId];
      if (!connection) return;
      if (!connection.tagIds) connection.tagIds = [];
      for (const tagId of tagIds) {
        if (!connection.tagIds.includes(tagId)) connection.tagIds.push(tagId);
      }
    });
  }

  async removeTagsFromConnection(connectionId: string, tagIds: string[]): Promise<void> {
    await this.change(`Tags von ${connectionId} entfernt`, (doc) => {
      const connection = doc.connections[connectionId];
      if (!connection?.tagIds) return;
      for (const tagId of tagIds) {
        const index = connection.tagIds.indexOf(tagId);
        if (index !== -1) connection.tagIds.splice(index, 1);
      }
    });
  }

  async setConnectionTags(connectionId: string, tagIds: string[]): Promise<void> {
    await this.change(`Tags von ${connectionId} gesetzt`, (doc) => {
      const connection = doc.connections[connectionId];
      if (connection) connection.tagIds = [...tagIds];
    });
  }

  // --- Sicherung ---

  /**
   * Exportiert das gesamte Dokument (für die Sicherung)
   */
  export(): Uint8Array {
    return Automerge.save(this.doc);
  }

  /**
   * Ersetzt den gesamten Stand durch eine Sicherung.
   * Wirft einen Fehler, wenn die Sicherung nicht lesbar oder zu neu ist;
   * in diesem Fall bleibt der bisherige Stand unverändert.
   */
  async replaceWith(snapshot: Uint8Array): Promise<void> {
    const doc = Automerge.load<AppState>(snapshot);
    if (!doc || typeof doc !== 'object' || !(doc as any).myCard) {
      throw new Error('Die Sicherung enthält kein Adressbuch.');
    }
    if (isFromNewerApp(doc)) {
      throw new Error('Die Sicherung stammt von einer neueren App-Version.');
    }
    this.adopt(doc);
    await this.save();
    this.notifyListeners();
  }

  onChange(listener: (doc: Automerge.Doc<AppState>) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      const index = this.changeListeners.indexOf(listener);
      if (index !== -1) this.changeListeners.splice(index, 1);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.changeListeners) {
      listener(this.doc);
    }
  }
}

export const store = new AutomergeStore();
