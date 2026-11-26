/**
 * Zentrale Typen für das P2P-Adressbuch
 */

/**
 * Version des Datenschemas. Die erste Stelle (Hauptversion) entscheidet, ob
 * zwei Geräte Daten austauschen dürfen: Bei unterschiedlicher Hauptversion
 * wird nichts übertragen, damit kein Gerät Daten des anderen beschädigt.
 */
export const SCHEMA_VERSION = '2.1.0';
export const APP_VERSION = '0.2.0';

export function schemaMajor(version: string | undefined): number {
  const major = parseInt((version || '1').split('.')[0], 10);
  return Number.isFinite(major) ? major : 1;
}

export function isSchemaCompatible(remoteVersion: string | undefined): boolean {
  return schemaMajor(remoteVersion) === schemaMajor(SCHEMA_VERSION);
}

/**
 * Die eigene Karte. Jedes dieser Felder kann pro Kontakt freigegeben werden.
 * Vor- und Nachname sind immer getrennt gespeichert.
 */
export interface AddressCard {
  /** person_id (UUID) */
  id: string;
  // Identifikation
  salutation: string;
  titlePrefix: string;
  titleSuffix: string;
  firstName: string;
  lastName: string;
  nickname: string;
  // Organisation
  organization: string;
  position: string;
  department: string;
  organizationId: string;
  // Kommunikation
  emailWork: string;
  emailPrivate: string;
  phoneWork: string;
  phoneMobile: string;
  fax: string;
  website: string;
  linkedin: string;
  xing: string;
  github: string;
  // Adresse
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  state: string;
  /** ISO 3166-1 alpha-2, z. B. DE */
  country: string;
  // Sonstiges
  birthday: string;
  birthplace: string;
  language: string;
  timezone: string;
  custom?: Record<string, string>;
  updatedAt: string;
}

export const ADDRESS_CARD_FIELDS = [
  'salutation',
  'titlePrefix',
  'firstName',
  'lastName',
  'titleSuffix',
  'nickname',
  'organization',
  'position',
  'department',
  'organizationId',
  'emailPrivate',
  'emailWork',
  'phoneMobile',
  'phoneWork',
  'fax',
  'website',
  'linkedin',
  'xing',
  'github',
  'street',
  'houseNumber',
  'postalCode',
  'city',
  'state',
  'country',
  'birthday',
  'birthplace',
  'language',
  'timezone',
] as const;

export type AddressCardField = (typeof ADDRESS_CARD_FIELDS)[number];

export type RemoteCard = Partial<Record<AddressCardField, string>>;

/**
 * Private Angaben, die ich mir zu einem Kontakt mache.
 * Sie bleiben auf diesem Gerät und werden nie übertragen.
 */
export interface ContactPrivate {
  notes: string;
  firstContactAt: string;
  lastContactAt: string;
  source: string;
  dataOrigin: string;
  gdprConsentAt: string;
}

export const CONTACT_PRIVATE_FIELDS = [
  'notes',
  'firstContactAt',
  'lastContactAt',
  'source',
  'dataOrigin',
  'gdprConsentAt',
] as const;

export type ContactPrivateField = (typeof CONTACT_PRIVATE_FIELDS)[number];

/**
 * Woher importierte Angaben stammen. `rank` legt fest, welche Quelle bei
 * abweichenden Angaben gilt (kleiner gewinnt). Eigene Eingaben von Hand
 * gehen immer vor.
 */
export type ImportSourceKind = 'manual' | 'legacy' | 'file' | 'phone' | 'google' | 'linkedin';

export interface ImportSource {
  id: string;
  kind: ImportSourceKind;
  name: string;
  rank: number;
  lastImportAt?: string;
}

export const MANUAL_SOURCE_ID = 'manual';
export const LEGACY_SOURCE_ID = 'legacy';

/** Weitere Angaben einer Quelle, die nicht in die Karte passen */
export interface ContactExtra {
  emails?: string[];
  phones?: string[];
}

/**
 * Der Stand eines Kontakts in einer Quelle, unverändert abgelegt.
 * Die angezeigte Karte eines nicht verbundenen Kontakts wird aus allen
 * Datensätzen berechnet (siehe model/merge.ts).
 */
export interface SourceRecord {
  sourceId: string;
  /** Kennung des Kontakts in der Quelle */
  externalId: string;
  importedAt: string;
  card: RemoteCard;
  extra?: ContactExtra;
}

export function recordKey(sourceId: string, externalId: string): string {
  return `${sourceId}::${externalId}`;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

/**
 * Ein Kontakt. `linked` = echte Verbindung zu einem anderen Gerät,
 * `local` = importierter Eintrag ohne Verbindung.
 */
export interface Connection {
  id: string;
  kind?: 'linked' | 'local';
  label?: string;
  /** Zuletzt bekannter Name, bleibt auch nach einem Widerruf der Gegenseite erhalten */
  knownName?: string;
  peerPubKey: string;
  allowedFields: string[];
  storeRemoteCard: boolean;
  createdAt?: string;
  lastSyncAt?: string;
  status: 'online' | 'offline' | 'syncing';
  /** true, wenn das Gerät des Kontakts eine nicht passende App-Version nutzt */
  incompatible?: boolean;
  remoteCard?: RemoteCard;
  /** Datensätze je Quelle (Schlüssel: recordKey); bleiben auf diesem Gerät */
  records?: Record<string, SourceRecord>;
  private?: Partial<ContactPrivate>;
  tagIds?: string[];
}

/**
 * Eintrag der Änderungsübersicht: Ein Kontakt hat ein Feld geändert.
 */
export interface ActivityEntry {
  id: string;
  connectionId: string;
  at: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface AppState {
  schemaVersion: string;
  myCard: AddressCard;
  connections: Record<string, Connection>;
  tags: Record<string, Tag>;
  /** Importquellen (ab Schema 2.1) */
  sources?: Record<string, ImportSource>;
  activity: ActivityEntry[];
  knownPeers: string[];
}

// --- Nachrichten zwischen zwei Geräten ---

export interface HelloMessage {
  type: 'HELLO';
  pubKey: string;
  appVersion: string;
  schemaVersion: string;
  /** Einmalwert, den die Gegenseite zum Nachweis ihrer Identität signiert */
  nonce?: string;
}

export interface AuthMessage {
  type: 'AUTH';
  signature: string;
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
  schemaVersion?: string;
  fields: Record<string, unknown>;
}

export interface AckMessage {
  type: 'ACK';
  hash?: string;
}

export type P2PMessage =
  | HelloMessage
  | AuthMessage
  | PolicyMessage
  | StateHashMessage
  | PatchMessage
  | AckMessage;

export function createEmptyCard(id: string): AddressCard {
  const card = { id, updatedAt: new Date().toISOString(), custom: {} } as AddressCard;
  for (const field of ADDRESS_CARD_FIELDS) {
    card[field] = '';
  }
  return card;
}

export function isLocalContact(connection: Connection): boolean {
  return connection.kind === 'local';
}
