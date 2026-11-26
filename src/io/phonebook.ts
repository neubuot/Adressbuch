/**
 * Kontakte direkt aus dem Telefonbuch des Geräts wählen.
 *
 * Das geht nur, wo der Browser die Kontaktauswahl anbietet (derzeit Chrome
 * auf Android, nur über HTTPS und nach einem Tipp). Das Gerät zeigt seine
 * eigene Auswahl; die App erhält ausschließlich, was dort angekreuzt wird.
 */

import type { RemoteCard } from '../types';
import { splitStreet } from '../store/migrate';
import type { ImportedContact } from './vcard';

/** Kennung der Quelle "Telefonbuch dieses Geräts" */
export const PHONEBOOK_SOURCE_ID = 'phone';
export const PHONEBOOK_SOURCE_NAME = 'Telefonbuch dieses Geräts';

type PickerProperty = 'name' | 'email' | 'tel' | 'address';

interface PickedAddress {
  addressLine?: string[];
  city?: string;
  postalCode?: string;
  region?: string;
  country?: string;
}

/** Ein Eintrag, wie ihn die Kontaktauswahl des Browsers liefert */
export interface PickedContact {
  name?: string[];
  email?: string[];
  tel?: string[];
  address?: PickedAddress[];
}

interface ContactsManagerLike {
  select(properties: PickerProperty[], options?: { multiple?: boolean }): Promise<PickedContact[]>;
  getProperties?(): Promise<string[]>;
}

function manager(): ContactsManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const contacts = (navigator as unknown as { contacts?: ContactsManagerLike }).contacts;
  return contacts && typeof contacts.select === 'function' ? contacts : null;
}

/** true, wenn dieses Gerät die Auswahl aus dem Telefonbuch anbietet */
export function canPickFromPhonebook(): boolean {
  return manager() !== null;
}

function clean(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim().slice(0, 500) : '';
    if (text && !result.includes(text)) result.push(text);
  }
  return result;
}

/** Zerlegt "Dr. Clara Sommer" bzw. "Sommer, Clara" in Vor- und Nachname */
function splitName(full: string): Pick<RemoteCard, 'firstName' | 'lastName'> {
  const comma = full.match(/^([^,]+),\s*(.+)$/);
  if (comma) return { lastName: comma[1].trim(), firstName: comma[2].trim() };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { lastName: parts[0] };
  const lastName = parts.pop()!;
  return { firstName: parts.join(' '), lastName };
}

/**
 * Übersetzt die Auswahl in Einträge für den Import. Die erste E-Mail-Adresse
 * und die erste Telefonnummer kommen in die Karte, die zweite jeweils in das
 * geschäftliche Feld, alle weiteren in die weiteren Angaben.
 */
export function fromPickedContacts(picked: PickedContact[]): ImportedContact[] {
  const contacts: ImportedContact[] = [];

  for (const entry of Array.isArray(picked) ? picked : []) {
    const card: RemoteCard = {};
    const [name] = clean(entry?.name);
    if (name) Object.assign(card, splitName(name));

    const emails = clean(entry?.email);
    if (emails[0]) card.emailPrivate = emails[0];
    if (emails[1]) card.emailWork = emails[1];

    const phones = clean(entry?.tel);
    if (phones[0]) card.phoneMobile = phones[0];
    if (phones[1]) card.phoneWork = phones[1];

    const address = Array.isArray(entry?.address) ? entry.address[0] : undefined;
    if (address && typeof address === 'object') {
      const [line] = clean(address.addressLine);
      if (line) {
        const parts = splitStreet(line);
        card.street = parts ? parts.street : line;
        if (parts) card.houseNumber = parts.houseNumber;
      }
      const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 500) : '');
      if (text(address.city)) card.city = text(address.city);
      if (text(address.postalCode)) card.postalCode = text(address.postalCode);
      if (text(address.region)) card.state = text(address.region);
      if (text(address.country)) card.country = text(address.country);
    }

    for (const key of Object.keys(card) as Array<keyof RemoteCard>) {
      if (!card[key]) delete card[key];
    }
    if (Object.keys(card).length === 0) continue;

    const contact: ImportedContact = { card };
    const moreEmails = emails.slice(2, 22);
    const morePhones = phones.slice(2, 22);
    if (moreEmails.length > 0 || morePhones.length > 0) {
      contact.extra = {
        ...(moreEmails.length > 0 ? { emails: moreEmails } : {}),
        ...(morePhones.length > 0 ? { phones: morePhones } : {}),
      };
    }
    contacts.push(contact);
  }
  return contacts;
}

/**
 * Öffnet die Kontaktauswahl des Geräts. Gibt eine leere Liste zurück, wenn
 * nichts gewählt oder die Auswahl abgebrochen wurde.
 */
export async function pickFromPhonebook(): Promise<ImportedContact[]> {
  const contacts = manager();
  if (!contacts) return [];

  const wanted: PickerProperty[] = ['name', 'email', 'tel', 'address'];
  let properties = wanted;
  try {
    const supported = contacts.getProperties ? await contacts.getProperties() : wanted;
    properties = wanted.filter((property) => supported.includes(property));
  } catch {
    properties = ['name', 'email', 'tel'];
  }
  if (properties.length === 0) return [];

  const picked = await contacts.select(properties, { multiple: true });
  return fromPickedContacts(picked);
}
