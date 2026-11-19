/**
 * Automerge-Store mit Dexie-Persistenz
 */

import * as Automerge from '@automerge/automerge';
import { db, type StoredDocument } from './db';
import {
  ADDRESS_CARD_FIELDS,
  CONTACT_PRIVATE_FIELDS,
  SCHEMA_VERSION,
  createEmptyCard,
  type ActivityEntry,
  type AddressCard,
  type AppState,
  type Connection,
  type ContactPrivate,
  type RemoteCard,
} from '../types';
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
   * Legt nicht verbundene Einträge an (z. B. aus einem Import).
   * Gibt die neuen IDs zurück.
   */
  async addLocalContacts(
    entries: Array<{ card: RemoteCard; private?: Partial<ContactPrivate>; tagIds?: string[] }>
  ): Promise<string[]> {
    const ids: string[] = [];
    await this.change(`${entries.length} Kontakt(e) importiert`, (doc) => {
      const now = new Date().toISOString();
      for (const entry of entries) {
        const id = `local-${createUuid()}`;
        const card = sanitizeRemoteCard(entry.card);
        const connection: Connection = {
          id,
          kind: 'local',
          peerPubKey: '',
          allowedFields: [],
          storeRemoteCard: true,
          status: 'offline',
          createdAt: now,
          remoteCard: card,
        };
        const name = displayNameOfCard(card);
        if (name) connection.knownName = name;
        if (entry.private) connection.private = plain(entry.private);
        if (entry.tagIds && entry.tagIds.length > 0) connection.tagIds = [...entry.tagIds];
        doc.connections[id] = connection;
        ids.push(id);
      }
    });
    return ids;
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
