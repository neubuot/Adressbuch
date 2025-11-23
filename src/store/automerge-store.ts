/**
 * Automerge-Store mit Dexie-Persistenz
 */

import * as Automerge from '@automerge/automerge';
import { db, type StoredDocument } from './db';
import type { AppState, AddressCard } from '../types';
import { generatePeerId } from '../utils/crypto';

export class AutomergeStore {
  private doc: Automerge.Doc<AppState>;
  private docId = 'myCard';
  private changeListeners: Array<(doc: Automerge.Doc<AppState>) => void> = [];

  constructor() {
    // Initialisiere leeres Dokument
    const initialState = {
      myCard: {
        id: generatePeerId(),
        firstName: '',
        lastName: '',
        street: '',
        postalCode: '',
        city: '',
        country: '',
        email: '',
        phone: '',
        birthday: '',
        organization: '',
        custom: {},
        updatedAt: new Date().toISOString(),
      },
      connections: {},
      tags: {},
      knownPeers: [],
      messages: [],
      pendingMessages: [],
    };
    this.doc = Automerge.from(initialState as Record<string, unknown>) as Automerge.Doc<AppState>;
  }

  /**
   * Lädt den gespeicherten State aus IndexedDB
   */
  async load(): Promise<void> {
    try {
      const stored = await db.documents.get(this.docId);

      if (stored) {
        // Lade Snapshot
        this.doc = Automerge.load<AppState>(stored.snapshot);

        // Wende gespeicherte Changes an
        if (stored.changes && stored.changes.length > 0) {
          for (const change of stored.changes) {
            this.doc = Automerge.loadIncremental(this.doc, change);
          }
        }

        // Migration: Füge tags-Feld hinzu falls es nicht existiert
        if (!this.doc.tags) {
          this.doc = Automerge.change(this.doc, 'Add tags field', (doc) => {
            doc.tags = {};
          });
          await this.save();
        }

        // Migration: Füge messages-Feld hinzu falls es nicht existiert
        if (!this.doc.messages) {
          this.doc = Automerge.change(this.doc, 'Add messages field', (doc) => {
            doc.messages = [];
          });
          await this.save();
        }

        // Migration: Füge pendingMessages-Feld hinzu falls es nicht existiert
        if (!this.doc.pendingMessages) {
          this.doc = Automerge.change(this.doc, 'Add pendingMessages field', (doc) => {
            doc.pendingMessages = [];
          });
          await this.save();
        }

        const connectionCount = Object.keys(this.doc.connections).length;
        if (connectionCount > 0) {
          console.log(`📚 ${connectionCount} gespeicherte Connection(s) geladen`);
        }
      } else {
        // Erstes Mal: Speichere initiales Dokument
        await this.save();
      }
    } catch (error) {
      console.error('❌ Fehler beim Laden des Automerge-Dokuments', error);
      // Bei Fehler: nutze leeres Dokument
      await this.save();
    }
  }

  /**
   * Speichert den aktuellen State in IndexedDB
   */
  async save(): Promise<void> {
    try {
      const snapshot = Automerge.save(this.doc);

      const stored: StoredDocument = {
        id: this.docId,
        snapshot,
        changes: [], // Changes werden nach jedem Save zurückgesetzt
        updatedAt: new Date().toISOString(),
      };

      await db.documents.put(stored);
    } catch (error) {
      console.error('❌ Fehler beim Speichern des Automerge-Dokuments', error);
    }
  }

  /**
   * Gibt das aktuelle Dokument zurück
   */
  getDoc(): AppState {
    return this.doc;
  }

  /**
   * Ändert das Dokument und speichert es
   */
  async change(
    message: string,
    callback: (doc: AppState) => void
  ): Promise<Automerge.Doc<AppState>> {
    this.doc = Automerge.change(this.doc, message, callback);
    await this.save();
    this.notifyListeners();
    return this.doc;
  }

  /**
   * Alias für change() - für Kompatibilität
   */
  async updateDoc(
    message: string,
    callback: (doc: AppState) => void
  ): Promise<Automerge.Doc<AppState>> {
    return this.change(message, callback);
  }

  /**
   * Aktualisiert die MyCard
   */
  async updateMyCard(updates: Partial<AddressCard>): Promise<void> {
    await this.change('Update MyCard', (doc) => {
      // Automerge benötigt einzelne Zuweisungen mit primitiven Werten
      for (const key in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
          const value = (updates as any)[key];
          // Konvertiere zu primitiven Werten (keine Automerge-Proxies)
          if (typeof value === 'object' && value !== null) {
            (doc.myCard as any)[key] = JSON.parse(JSON.stringify(value));
          } else {
            (doc.myCard as any)[key] = value;
          }
        }
      }
      doc.myCard.updatedAt = new Date().toISOString();
    });
  }

  /**
   * Fügt eine Verbindung hinzu
   */
  async addConnection(
    id: string,
    peerPubKey: string,
    allowedFields: string[]
  ): Promise<void> {
    await this.change('Add Connection', (doc) => {
      doc.connections[id] = {
        id,
        peerPubKey,
        allowedFields,
        storeRemoteCard: true,
        status: 'offline',
        createdAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Aktualisiert eine Verbindung
   */
  async updateConnection(
    id: string,
    updates: Partial<typeof this.doc.connections[string]>
  ): Promise<void> {
    await this.change(`Update Connection ${id}`, (doc) => {
      if (doc.connections[id]) {
        // Automerge benötigt einzelne Zuweisungen statt Object.assign
        for (const key in updates) {
          if (Object.prototype.hasOwnProperty.call(updates, key)) {
            (doc.connections[id] as any)[key] = (updates as any)[key];
          }
        }
      }
    });
  }

  /**
   * Löscht eine Verbindung
   */
  async removeConnection(id: string): Promise<void> {
    await this.change(`Remove Connection ${id}`, (doc) => {
      delete doc.connections[id];
    });
  }

  /**
   * Fügt einen Tag hinzu
   */
  async addTag(id: string, name: string, color: string): Promise<void> {
    await this.change('Add Tag', (doc) => {
      doc.tags[id] = {
        id,
        name,
        color,
        createdAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Aktualisiert einen Tag
   */
  async updateTag(id: string, updates: { name?: string; color?: string }): Promise<void> {
    await this.change(`Update Tag ${id}`, (doc) => {
      if (doc.tags[id]) {
        if (updates.name !== undefined) doc.tags[id].name = updates.name;
        if (updates.color !== undefined) doc.tags[id].color = updates.color;
      }
    });
  }

  /**
   * Löscht einen Tag (und entfernt ihn von allen Connections)
   */
  async removeTag(id: string): Promise<void> {
    await this.change(`Remove Tag ${id}`, (doc) => {
      // Entferne Tag von allen Connections
      for (const connId in doc.connections) {
        const conn = doc.connections[connId];
        if (conn.tagIds && conn.tagIds.includes(id)) {
          conn.tagIds = conn.tagIds.filter((tagId) => tagId !== id);
        }
      }
      // Lösche den Tag
      delete doc.tags[id];
    });
  }

  /**
   * Fügt Tags zu einer Connection hinzu
   */
  async addTagsToConnection(connectionId: string, tagIds: string[]): Promise<void> {
    await this.change(`Add Tags to Connection ${connectionId}`, (doc) => {
      const conn = doc.connections[connectionId];
      if (conn) {
        if (!conn.tagIds) {
          conn.tagIds = [];
        }
        // Füge nur neue Tags hinzu (keine Duplikate)
        for (const tagId of tagIds) {
          if (!conn.tagIds.includes(tagId)) {
            conn.tagIds.push(tagId);
          }
        }
      }
    });
  }

  /**
   * Entfernt Tags von einer Connection
   */
  async removeTagsFromConnection(connectionId: string, tagIds: string[]): Promise<void> {
    await this.change(`Remove Tags from Connection ${connectionId}`, (doc) => {
      const conn = doc.connections[connectionId];
      if (conn && conn.tagIds) {
        conn.tagIds = conn.tagIds.filter((tagId) => !tagIds.includes(tagId));
      }
    });
  }

  /**
   * Setzt die Tags einer Connection (ersetzt alle bestehenden Tags)
   */
  async setConnectionTags(connectionId: string, tagIds: string[]): Promise<void> {
    await this.change(`Set Connection Tags ${connectionId}`, (doc) => {
      const conn = doc.connections[connectionId];
      if (conn) {
        conn.tagIds = tagIds;
      }
    });
  }

  /**
   * Merge mit einem anderen Automerge-Dokument
   */
  async merge(otherDoc: Uint8Array): Promise<void> {
    try {
      const loaded = Automerge.load<AppState>(otherDoc);
      this.doc = Automerge.merge(this.doc, loaded);
      await this.save();
      this.notifyListeners();
    } catch (error) {
      console.error('Fehler beim Mergen des Dokuments', error);
    }
  }

  /**
   * Exportiert das Dokument als Uint8Array
   */
  export(): Uint8Array {
    return Automerge.save(this.doc);
  }

  /**
   * Registriert einen Change-Listener
   */
  onChange(listener: (doc: Automerge.Doc<AppState>) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Benachrichtigt alle Listener über Änderungen
   */
  private notifyListeners(): void {
    for (const listener of this.changeListeners) {
      listener(this.doc);
    }
  }
}

// Globale Store-Instanz
export const store = new AutomergeStore();
