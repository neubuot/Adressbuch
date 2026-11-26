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
  createEmptyCard,
  recordKey,
  type ActivityEntry,
  type AddressCard,
  type AppState,
  type Connection,
  type ContactPrivate,
  type ImportSource,
  type RemoteCard,
  type SourceRecord,
} from '../types';
import { manualOverrides, mergeRecords } from '../model/merge';
import type { IncomingContact } from '../model/dedupe';
import { createUuid, isFromNewerApp, migrateState, needsMigration } from './migrate';
import { sanitizeRemoteCard } from '../utils/policy';
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
  async applyRemoteCard(id: string, received: unknown): Promise<number> {
    const existing = this.doc.connections[id];
    if (!existing) return 0;

    const card = sanitizeRemoteCard(received);
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
      if (doc.activity) {
        for (let i = doc.activity.length - 1; i >= 0; i--) {
          if (doc.activity[i].connectionId === id) doc.activity.splice(i, 1);
        }
      }
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
