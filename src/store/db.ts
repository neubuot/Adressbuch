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

/** Aufbewahrtes für die Wiederherstellung über Vertraute (siehe trust/custody.ts) */
export interface StoredVaultPiece {
  id: string;
  setId: string;
  threshold: number;
  share: string;
  version: string;
  vault: string;
  receivedAt: string;
  helperName?: string;
}

export class AddressBookDB extends Dexie {
  documents!: Table<StoredDocument, string>;
  connections!: Table<StoredConnection, string>;
  custody!: Table<StoredVaultPiece, string>;
  recovery!: Table<StoredVaultPiece & { helperName: string }, string>;

  constructor() {
    super('P2PAddressBook');

    this.version(1).stores({
      documents: 'id, updatedAt',
      connections: 'id, status, lastSyncAt',
    });

    // Version 2: Ablage für die Wiederherstellung über Vertraute
    this.version(2).stores({
      documents: 'id, updatedAt',
      connections: 'id, status, lastSyncAt',
      custody: 'id',
      recovery: 'id',
    });
  }
}

export const db = new AddressBookDB();
