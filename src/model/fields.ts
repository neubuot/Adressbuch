/**
 * Beschreibung aller Felder: Beschriftung, Gruppe, Eingabetyp und der
 * Spaltenname für Exporte (entspricht dem fachlichen Feldschema).
 */

import type { AddressCardField, ContactPrivateField } from '../types';

export type FieldGroupId = 'identity' | 'organization' | 'communication' | 'address' | 'other';

export interface FieldDef<K extends string = string> {
  key: K;
  label: string;
  /** Spaltenname im Export */
  exportName: string;
  group: FieldGroupId;
  input: 'text' | 'email' | 'tel' | 'url' | 'date' | 'textarea';
  /** Wird im Formular sofort gezeigt (nicht erst nach dem Aufklappen) */
  essential?: boolean;
  autoComplete?: string;
  hint?: string;
}

export const FIELD_GROUPS: Array<{ id: FieldGroupId; label: string }> = [
  { id: 'identity', label: 'Name und Anrede' },
  { id: 'communication', label: 'Telefon, E-Mail und Internet' },
  { id: 'address', label: 'Adresse' },
  { id: 'organization', label: 'Beruf und Organisation' },
  { id: 'other', label: 'Weitere Angaben' },
];

export const CARD_FIELDS: Array<FieldDef<AddressCardField>> = [
  { key: 'salutation', label: 'Anrede', exportName: 'anrede', group: 'identity', input: 'text', autoComplete: 'honorific-prefix', hint: 'z. B. Frau, Herr' },
  { key: 'titlePrefix', label: 'Titel (vor dem Namen)', exportName: 'titel_vorne', group: 'identity', input: 'text', hint: 'z. B. Dr., Prof.' },
  { key: 'firstName', label: 'Vorname', exportName: 'vorname', group: 'identity', input: 'text', essential: true, autoComplete: 'given-name' },
  { key: 'lastName', label: 'Nachname', exportName: 'nachname', group: 'identity', input: 'text', essential: true, autoComplete: 'family-name' },
  { key: 'titleSuffix', label: 'Titel (nach dem Namen)', exportName: 'titel_hinten', group: 'identity', input: 'text', autoComplete: 'honorific-suffix', hint: 'z. B. M.A., MBA' },
  { key: 'nickname', label: 'Spitzname', exportName: 'spitzname', group: 'identity', input: 'text', autoComplete: 'nickname' },

  { key: 'phoneMobile', label: 'Mobil', exportName: 'telefon_mobil', group: 'communication', input: 'tel', essential: true, autoComplete: 'tel' },
  { key: 'emailPrivate', label: 'E-Mail privat', exportName: 'email_priv', group: 'communication', input: 'email', essential: true, autoComplete: 'email' },
  { key: 'emailWork', label: 'E-Mail geschäftlich', exportName: 'email_geschäftlich', group: 'communication', input: 'email' },
  { key: 'phoneWork', label: 'Telefon geschäftlich', exportName: 'telefon_geschäftlich', group: 'communication', input: 'tel' },
  { key: 'fax', label: 'Fax', exportName: 'fax', group: 'communication', input: 'tel' },
  { key: 'website', label: 'Webseite', exportName: 'webseite', group: 'communication', input: 'url', autoComplete: 'url' },
  { key: 'linkedin', label: 'LinkedIn', exportName: 'linkedin', group: 'communication', input: 'text' },
  { key: 'xing', label: 'Xing', exportName: 'xing', group: 'communication', input: 'text' },
  { key: 'github', label: 'GitHub', exportName: 'github', group: 'communication', input: 'text' },

  { key: 'street', label: 'Straße', exportName: 'strasse', group: 'address', input: 'text', essential: true, autoComplete: 'address-line1' },
  { key: 'houseNumber', label: 'Hausnummer', exportName: 'hausnummer', group: 'address', input: 'text', essential: true },
  { key: 'postalCode', label: 'PLZ', exportName: 'plz', group: 'address', input: 'text', essential: true, autoComplete: 'postal-code' },
  { key: 'city', label: 'Ort', exportName: 'ort', group: 'address', input: 'text', essential: true, autoComplete: 'address-level2' },
  { key: 'state', label: 'Bundesland', exportName: 'bundesland', group: 'address', input: 'text', autoComplete: 'address-level1' },
  { key: 'country', label: 'Land', exportName: 'land', group: 'address', input: 'text', autoComplete: 'country', hint: 'Zwei Buchstaben, z. B. DE, AT, CH' },

  { key: 'organization', label: 'Organisation', exportName: 'organisation', group: 'organization', input: 'text', autoComplete: 'organization' },
  { key: 'position', label: 'Position', exportName: 'position', group: 'organization', input: 'text', autoComplete: 'organization-title' },
  { key: 'department', label: 'Abteilung', exportName: 'abteilung', group: 'organization', input: 'text' },
  { key: 'organizationId', label: 'Organisations-Nr.', exportName: 'organisation_id', group: 'organization', input: 'text', hint: 'Interne Kennung, falls vorhanden' },

  { key: 'birthday', label: 'Geburtsdatum', exportName: 'geburtsdatum', group: 'other', input: 'date', autoComplete: 'bday' },
  { key: 'birthplace', label: 'Geburtsort', exportName: 'geburtsort', group: 'other', input: 'text' },
  { key: 'language', label: 'Sprache', exportName: 'sprache', group: 'other', input: 'text', hint: 'z. B. Deutsch' },
  { key: 'timezone', label: 'Zeitzone', exportName: 'zeitzone', group: 'other', input: 'text', hint: 'z. B. Europe/Berlin' },
];

export const PRIVATE_FIELDS: Array<FieldDef<ContactPrivateField>> = [
  { key: 'notes', label: 'Notizen', exportName: 'notizen', group: 'other', input: 'textarea' },
  { key: 'firstContactAt', label: 'Erster Kontakt am', exportName: 'erstkontakt_am', group: 'other', input: 'date' },
  { key: 'lastContactAt', label: 'Zuletzt gesprochen am', exportName: 'letzter_kontakt_am', group: 'other', input: 'date' },
  { key: 'source', label: 'Kennengelernt über', exportName: 'quelle', group: 'other', input: 'text' },
  { key: 'dataOrigin', label: 'Herkunft der Daten', exportName: 'datenherkunft', group: 'other', input: 'text' },
  { key: 'gdprConsentAt', label: 'Einwilligung (DSGVO) am', exportName: 'einwilligung_dsgvo_am', group: 'other', input: 'date' },
];

const CARD_FIELD_MAP = new Map<string, FieldDef<AddressCardField>>(
  CARD_FIELDS.map((field) => [field.key, field])
);
const PRIVATE_FIELD_MAP = new Map<string, FieldDef<ContactPrivateField>>(
  PRIVATE_FIELDS.map((field) => [field.key, field])
);

export function getCardField(key: string): FieldDef<AddressCardField> | undefined {
  return CARD_FIELD_MAP.get(key);
}

export function isCardField(key: string): key is AddressCardField {
  return CARD_FIELD_MAP.has(key);
}

export function getFieldLabel(key: string): string {
  if (key.startsWith('custom.')) return key.substring(7);
  return CARD_FIELD_MAP.get(key)?.label ?? PRIVATE_FIELD_MAP.get(key)?.label ?? key;
}

export function fieldsOfGroup(group: FieldGroupId): Array<FieldDef<AddressCardField>> {
  return CARD_FIELDS.filter((field) => field.group === group);
}

/**
 * Vorlagen für die Freigabe
 */
export interface SharePreset {
  id: string;
  label: string;
  description: string;
  fields: AddressCardField[];
}

export const SHARE_PRESETS: SharePreset[] = [
  {
    id: 'namePhone',
    label: 'Nur Name und Telefon',
    description: 'Vorname, Nachname und Mobilnummer',
    fields: ['firstName', 'lastName', 'phoneMobile'],
  },
  {
    id: 'private',
    label: 'Privat',
    description: 'Name, Mobil, private E-Mail, Adresse und Geburtstag',
    fields: [
      'firstName', 'lastName', 'nickname', 'phoneMobile', 'emailPrivate',
      'street', 'houseNumber', 'postalCode', 'city', 'state', 'country', 'birthday',
    ],
  },
  {
    id: 'business',
    label: 'Beruflich',
    description: 'Name mit Titel, Organisation, geschäftliche E-Mail und Telefon',
    fields: [
      'salutation', 'titlePrefix', 'firstName', 'lastName', 'titleSuffix',
      'organization', 'position', 'department', 'emailWork', 'phoneWork',
      'website', 'linkedin', 'xing',
    ],
  },
];

export const DEFAULT_PRESET_ID = 'namePhone';

/**
 * Findet die Vorlage, die genau dieser Feldauswahl entspricht.
 */
export function matchPreset(fields: string[]): SharePreset | undefined {
  const set = new Set(fields);
  return SHARE_PRESETS.find(
    (preset) => preset.fields.length === set.size && preset.fields.every((field) => set.has(field))
  );
}

/**
 * Beschreibt eine Freigabe in einem kurzen Satz.
 */
export function describeShare(fields: string[]): string {
  const valid = fields.filter(isCardField);
  if (valid.length === 0) return 'Nichts freigegeben';
  const preset = matchPreset(valid);
  if (preset) return preset.label;
  if (valid.length === CARD_FIELDS.length) return 'Alles';
  return valid.length === 1 ? '1 Angabe' : `${valid.length} Angaben`;
}
