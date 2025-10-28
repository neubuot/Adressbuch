/**
 * Core Data Model für P2P Adressbuch
 */

// CRDT-Dokument für eine Adresskarte
export interface AddressCard {
  id: string; // stable ID for "MyCard"
  firstName: string;
  lastName: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  birthday: string; // ISO date
  organization: string;
  custom?: Record<string, string>;
  updatedAt: string; // ISO timestamp (UI/Historie)
}

// Verbindung zu einem Peer
export interface Connection {
  id: string; // peerId
  label?: string; // frei wählbarer Anzeigename
  peerPubKey: string; // base64
  allowedFields: string[]; // Whitelist pro Verbindung
  storeRemoteCard: boolean; // ob fremde Karte lokal persistiert wird
  lastSyncAt?: string;
  status: 'online' | 'offline' | 'syncing';
  remoteCard?: Partial<AddressCard>; // gespeicherte fremde Karte
}

// Gesamter App-State
export interface AppState {
  myCard: AddressCard;
  connections: Record<string, Connection>;
  knownPeers: string[]; // optional, für Discovery/History
}

// Nachrichten-Protokoll
export const SCHEMA_VERSION = '1.0.0';

export interface HelloMessage {
  type: 'HELLO';
  peerId: string;
  pubKey: string;
  appVersion: string;
  schemaVersion: string;
}

export interface PolicyMessage {
  type: 'POLICY';
  allowedFields: string[];
}

export interface StateHashMessage {
  type: 'STATE_HASH';
  hash: string;
}

export interface PatchMessage {
  type: 'PATCH';
  fields: Partial<AddressCard>;
}

export interface AckMessage {
  type: 'ACK';
  hash: string;
}

export type P2PMessage =
  | HelloMessage
  | PolicyMessage
  | StateHashMessage
  | PatchMessage
  | AckMessage;

// Standard-Felder der AddressCard (für UI und Validierung)
export const ADDRESS_CARD_FIELDS = [
  'firstName',
  'lastName',
  'street',
  'postalCode',
  'city',
  'country',
  'email',
  'phone',
  'birthday',
  'organization',
] as const;

export type AddressCardField = (typeof ADDRESS_CARD_FIELDS)[number];

// Leere/Default-Werte
export const EMPTY_ADDRESS_CARD: AddressCard = {
  id: '',
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
};
