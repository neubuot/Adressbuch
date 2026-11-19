/**
 * CSV lesen und schreiben
 */

import type { RemoteCard, AddressCardField } from '../types';
import { CARD_FIELDS } from '../model/fields';
import { splitStreet } from '../store/migrate';
import type { ImportedContact } from './vcard';

/**
 * Zerlegt CSV-Text in Zeilen und Zellen. Erkennt Komma, Semikolon oder
 * Tabulator als Trennzeichen und beachtet Anführungszeichen.
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', '\t', ','].reduce(
    (best, candidate) =>
      firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
    ','
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);

  return rows;
}

/**
 * Baut CSV-Text. Semikolon als Trennzeichen und BOM, damit Excel die
 * Datei mit Umlauten richtig öffnet.
 */
export function toCsv(rows: string[][]): string {
  const escapeCell = (cell: string) => {
    // Schutz vor Formeln, die Tabellenprogramme sonst ausführen würden
    const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + rows.map((row) => row.map(escapeCell).join(';')).join('\r\n') + '\r\n';
}

function normalizeHeader(header: string): string {
  return header
    .toLocaleLowerCase('de')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/** Spaltenüberschriften gängiger Programme → Kartenfeld */
const HEADER_ALIASES: Record<AddressCardField, string[]> = {
  salutation: ['anrede', 'salutation'],
  titlePrefix: ['titel', 'title', 'nameprefix', 'titelvorne', 'prefix'],
  firstName: ['vorname', 'firstname', 'givenname', 'first'],
  lastName: ['nachname', 'lastname', 'familyname', 'surname', 'name', 'last'],
  titleSuffix: ['namesuffix', 'suffix', 'titelhinten'],
  nickname: ['spitzname', 'nickname', 'alias'],
  organization: ['organisation', 'organization', 'firma', 'company', 'organization1name', 'organizationname'],
  position: ['position', 'jobtitle', 'organization1title', 'organizationtitle', 'funktion'],
  department: ['abteilung', 'department', 'organization1department', 'organizationdepartment'],
  organizationId: ['organisationid', 'organizationid'],
  emailPrivate: ['email', 'emailaddress', 'emailadresse', 'emailpriv', 'emailprivat', 'email1value', 'privateemail', 'mail'],
  emailWork: ['emailgeschaeftlich', 'emailwork', 'email2address', 'email2value', 'businessemail'],
  phoneMobile: ['mobil', 'mobile', 'mobilephone', 'mobiltelefon', 'handy', 'telefonmobil', 'phone1value', 'telefon', 'phone', 'primaryphone'],
  phoneWork: ['telefongeschaeftlich', 'businessphone', 'telefongeschaeft', 'phone2value', 'workphone'],
  fax: ['fax', 'businessfax', 'faxgeschaeftlich'],
  website: ['webseite', 'website', 'webpage', 'url', 'homepage', 'website1value'],
  linkedin: ['linkedin'],
  xing: ['xing'],
  github: ['github'],
  street: ['strasse', 'street', 'homestreet', 'address1street', 'businessstreet', 'strasseprivat', 'adresse'],
  houseNumber: ['hausnummer', 'housenumber', 'hausnr'],
  postalCode: ['plz', 'postleitzahl', 'postalcode', 'zip', 'homepostalcode', 'address1postalcode', 'businesspostalcode'],
  city: ['ort', 'stadt', 'city', 'homecity', 'address1city', 'businesscity'],
  state: ['bundesland', 'state', 'region', 'homestate', 'address1region'],
  country: ['land', 'country', 'homecountry', 'address1country', 'homecountryregion', 'landregion'],
  birthday: ['geburtsdatum', 'geburtstag', 'birthday', 'bday'],
  birthplace: ['geburtsort', 'birthplace'],
  language: ['sprache', 'language'],
  timezone: ['zeitzone', 'timezone'],
};

const NOTE_HEADERS = ['notizen', 'notiz', 'notes', 'note'];

function buildHeaderMap(): Map<string, AddressCardField> {
  const map = new Map<string, AddressCardField>();
  for (const field of CARD_FIELDS) {
    map.set(normalizeHeader(field.exportName), field.key);
    map.set(normalizeHeader(field.label), field.key);
    map.set(normalizeHeader(field.key), field.key);
  }
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (!map.has(alias)) map.set(alias, field as AddressCardField);
    }
  }
  return map;
}

function normalizeDate(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const german = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) return `${german[3]}-${german[2].padStart(2, '0')}-${german[1].padStart(2, '0')}`;
  return value;
}

/**
 * Liest Kontakte aus einer CSV-Datei mit Überschriftenzeile.
 * `unknownHeaders` nennt Spalten, die nicht zugeordnet werden konnten.
 */
export function parseContactsCsv(text: string): { contacts: ImportedContact[]; unknownHeaders: string[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { contacts: [], unknownHeaders: [] };

  const headerMap = buildHeaderMap();
  const headers = rows[0].map((header) => header.trim());
  const columns = headers.map((header) => {
    const normalized = normalizeHeader(header);
    if (NOTE_HEADERS.includes(normalized)) return 'notes' as const;
    return headerMap.get(normalized) ?? null;
  });
  const unknownHeaders = headers.filter((header, index) => header && columns[index] === null);

  const contacts: ImportedContact[] = [];
  for (const row of rows.slice(1)) {
    const card: RemoteCard = {};
    let notes = '';
    row.forEach((rawValue, index) => {
      const column = columns[index];
      const value = rawValue.trim();
      if (!column || !value) return;
      if (column === 'notes') {
        notes = value;
      } else if (!card[column]) {
        card[column] = column === 'birthday' ? normalizeDate(value) : value;
      }
    });

    if (card.street && !card.houseNumber) {
      const parts = splitStreet(card.street);
      if (parts) {
        card.street = parts.street;
        card.houseNumber = parts.houseNumber;
      }
    }
    if (Object.keys(card).length > 0) {
      contacts.push(notes ? { card, notes } : { card });
    }
  }

  return { contacts, unknownHeaders };
}
