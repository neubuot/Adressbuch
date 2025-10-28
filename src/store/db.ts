/**
 * Dexie-Datenbank für lokale Persistenz
 */

import Dexie, { type Table } from 'dexie';

export interface StoredDocument {
  id: string; // 'myCard' oder peerId
  snapshot: Uint8Array; // Automerge-Snapshot
  changes: Uint8Array[]; // Automerge-Changes
  updatedAt: string;
}

export interface StoredConnection {
  id: string;
  label?: string;
  peerPubKey: string;
  allowedFields: string[];
  storeRemoteCard: boolean;
  lastSyncAt?: string;
  status: 'online' | 'offline' | 'syncing';
  remoteCardSnapshot?: Uint8Array;
}

export class AddressBookDB extends Dexie {
  documents!: Table<StoredDocument, string>;
  connections!: Table<StoredConnection, string>;

  constructor() {
    super('P2PAddressBook');

    this.version(1).stores({
      documents: 'id, updatedAt',
      connections: 'id, status, lastSyncAt',
    });
  }
}

export const db = new AddressBookDB();
