/**
 * Zentrale Typen für das P2P-Adressbuch
 */

/**
 * Version des Datenschemas. Die erste Stelle (Hauptversion) entscheidet, ob
 * zwei Geräte Daten austauschen dürfen: Bei unterschiedlicher Hauptversion
 * wird nichts übertragen, damit kein Gerät Daten des anderen beschädigt.
 */
export const SCHEMA_VERSION = '2.2.0';
export const APP_VERSION = '0.5.2';

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
export type ImportSourceKind = 'manual' | 'legacy' | 'file' | 'phone' | 'google' | 'linkedin' | 'microsoft';

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

/**
 * Merkt sich einen Eintrag, der mit diesem Kontakt zusammengeführt wurde,
 * damit sich das wieder trennen lässt.
 */
export interface MergedContact {
  /** Kennung des früheren Eintrags */
  id: string;
  at: string;
  /** Schlüssel der Datensätze, die von dort stammen */
  recordKeys: string[];
  label?: string;
  knownName?: string;
  createdAt?: string;
  private?: Partial<ContactPrivate>;
  tagIds?: string[];
}

/** Schlüssel für ein Paar von Kontakten, unabhängig von der Reihenfolge */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
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
  /**
   * Ende einer befristeten Freigabe (ISO-Zeitpunkt). Danach gilt `fieldsAfter`
   * statt `allowedFields` (ab Schema 2.2).
   */
  shareUntil?: string;
  fieldsAfter?: string[];
  /** Befristung der empfangenen Karte, wie sie die Gegenseite mitgeteilt hat */
  remoteUntil?: string;
  remoteKeep?: string[];
  storeRemoteCard: boolean;
  createdAt?: string;
  lastSyncAt?: string;
  status: 'online' | 'offline' | 'syncing';
  /** true, wenn das Gerät des Kontakts eine nicht passende App-Version nutzt */
  incompatible?: boolean;
  remoteCard?: RemoteCard;
  /** Datensätze je Quelle (Schlüssel: recordKey); bleiben auf diesem Gerät */
  records?: Record<string, SourceRecord>;
  /** Einträge, die mit diesem Kontakt zusammengeführt wurden */
  merged?: MergedContact[];
  /**
   * Dieses Gerät bewahrt für den Kontakt einen Teil seines Tresorschlüssels
   * auf (Wiederherstellung über Vertraute). Hier steht nur der Vermerk.
   */
  custody?: { setId: string; version: string };
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

/**
 * Vorstellung, die ich ausgesprochen habe: Zwei meiner Kontakte sollen sich
 * kennenlernen. Bleibt gespeichert, bis beide sie erhalten haben.
 */
export interface IntroOut {
  id: string;
  aId: string;
  bId: string;
  createdAt: string;
  deliveredA?: boolean;
  deliveredB?: boolean;
}

/**
 * Vorstellung, die ich erhalten habe. Der Schlüssel in `introsIn` ist die
 * Kennung (Fingerabdruck) der vorgestellten Person.
 */
export interface IntroIn {
  id: string;
  /** Kontakt, der die Vorstellung ausgesprochen hat */
  fromId: string;
  pubKey: string;
  /** Name der vorgestellten Person, so wie ihn der Vorstellende kennt */
  name: string;
  receivedAt: string;
  status: 'pending' | 'accepted';
  /** Was die vorgestellte Person von mir sehen darf (nach dem Annehmen) */
  fields?: string[];
}

/** Ein Vertrauter in meiner Einrichtung zur Wiederherstellung */
export interface TrustMember {
  /** Der Teil des Tresorschlüssels für diesen Kontakt */
  share: string;
  /** Stand des Tresors, den der Kontakt zuletzt bestätigt hat */
  depositedAt?: string;
}

/**
 * Wiederherstellung über Vertraute: Der Tresorschlüssel ist in Teile zerlegt,
 * `threshold` Vertraute zusammen können das Adressbuch zurückgeben.
 */
export interface TrustSetup {
  /** Wechselt bei jeder Änderung an Schlüssel oder Vertrauten */
  setId: string;
  threshold: number;
  /** Tresorschlüssel (base64), nötig, um den Tresor aktuell zu halten */
  key: string;
  createdAt: string;
  members: Record<string, TrustMember>;
}

/** Wie lange eine unbeantwortete oder nicht zustande gekommene Vorstellung bestehen bleibt */
export const INTRO_MAX_AGE_DAYS = 30;

export interface AppState {
  schemaVersion: string;
  myCard: AddressCard;
  connections: Record<string, Connection>;
  tags: Record<string, Tag>;
  /** Importquellen (ab Schema 2.1) */
  sources?: Record<string, ImportSource>;
  /** Paare (pairKey), die der Nutzer als verschiedene Personen bestätigt hat */
  notDuplicates?: Record<string, boolean>;
  activity: ActivityEntry[];
  knownPeers: string[];
  /** Vorstellungen, die ich ausgesprochen habe (ab Schema 2.2) */
  introsOut?: Record<string, IntroOut>;
  /** Vorstellungen, die ich erhalten habe (Schlüssel: Kennung der Person) */
  introsIn?: Record<string, IntroIn>;
  /** Wiederherstellung über Vertraute (ab Schema 2.2) */
  trust?: TrustSetup;
  /** Frühere Vertraute, die ihren Teil noch löschen sollen */
  trustDropped?: string[];
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
  /** Befristete Freigabe: Ab diesem Zeitpunkt gelten nur noch die Felder in `keep` */
  until?: string;
  keep?: string[];
}

export interface AckMessage {
  type: 'ACK';
  hash?: string;
}

/** "Ich möchte dich mit dieser Person bekannt machen" */
export interface IntroMessage {
  type: 'INTRO';
  id: string;
  pubKey: string;
  name: string;
}

export interface IntroAckMessage {
  type: 'INTRO_ACK';
  id: string;
}

/** "Welchen Stand meines Tresors bewahrst du auf?" */
export interface VaultCheckMessage {
  type: 'VAULT_CHECK';
  setId: string;
}

export interface VaultStateMessage {
  type: 'VAULT_STATE';
  setId: string | null;
  version: string | null;
}

/** Ein Stück des Tresors samt Teil des Schlüssels (zum Aufbewahren oder bei der Wiederherstellung) */
export interface VaultPutMessage {
  type: 'VAULT_PUT' | 'RECOVER_PUT';
  setId: string;
  threshold: number;
  share: string;
  version: string;
  seq: number;
  total: number;
  data: string;
  /** Bei der Wiederherstellung: Name der helfenden Person */
  from?: string;
}

export interface VaultAckMessage {
  type: 'VAULT_ACK' | 'RECOVER_ACK';
  setId: string;
  version: string;
}

/** "Lösche, was du für mich aufbewahrst" und die Bestätigung dazu */
export interface VaultDropMessage {
  type: 'VAULT_DROP' | 'VAULT_DROPPED';
}

export type P2PMessage =
  | VaultCheckMessage
  | VaultStateMessage
  | VaultPutMessage
  | VaultAckMessage
  | VaultDropMessage
  | IntroMessage
  | IntroAckMessage
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
