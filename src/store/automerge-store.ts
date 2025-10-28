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
      knownPeers: [],
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

        console.log('Automerge-Dokument geladen', Automerge.getHeads(this.doc));
      } else {
        // Erstes Mal: Speichere initiales Dokument
        await this.save();
        console.log('Neues Automerge-Dokument initialisiert');
      }
    } catch (error) {
      console.error('Fehler beim Laden des Automerge-Dokuments', error);
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
      console.error('Fehler beim Speichern des Automerge-Dokuments', error);
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
   * Aktualisiert die MyCard
   */
  async updateMyCard(updates: Partial<AddressCard>): Promise<void> {
    await this.change('Update MyCard', (doc) => {
      Object.assign(doc.myCard, updates);
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
        Object.assign(doc.connections[id], updates);
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
