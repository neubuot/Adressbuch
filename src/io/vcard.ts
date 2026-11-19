/**
 * vCard lesen und schreiben (Format der Telefonbücher von Handy und Computer)
 */

import type { RemoteCard } from '../types';
import { splitStreet } from '../store/migrate';

export interface ImportedContact {
  card: RemoteCard;
  notes?: string;
}

function escapeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function unescapeValue(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;:\\])/g, '$1');
}

/** Teilt an nicht maskierten Semikolons */
function splitParts(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\' && i + 1 < value.length) {
      current += char + value[i + 1];
      i++;
    } else if (char === ';') {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map(unescapeValue).map((part) => part.trim());
}

function fold(line: string): string {
  // Zeilen sind laut Standard höchstens 75 Zeichen lang
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) {
    chunks.push(' ' + line.slice(i, i + 74));
  }
  return chunks.join('\r\n');
}

/**
 * Erzeugt eine vCard (Version 3.0) aus einer Karte
 */
export function toVCard(card: RemoteCard, notes?: string): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
  const e = (value: string | undefined) => escapeValue((value || '').trim());

  const formatted =
    [card.titlePrefix, card.firstName, card.lastName].filter(Boolean).join(' ') +
    (card.titleSuffix ? `, ${card.titleSuffix}` : '');
  const displayName = formatted || card.nickname || card.organization || 'Kontakt';

  lines.push(`N:${e(card.lastName)};${e(card.firstName)};;${e(card.titlePrefix)};${e(card.titleSuffix)}`);
  lines.push(`FN:${escapeValue(displayName)}`);
  if (card.nickname) lines.push(`NICKNAME:${e(card.nickname)}`);
  if (card.organization || card.department) {
    lines.push(`ORG:${e(card.organization)}${card.department ? ';' + e(card.department) : ''}`);
  }
  if (card.position) lines.push(`TITLE:${e(card.position)}`);
  if (card.phoneMobile) lines.push(`TEL;TYPE=CELL:${e(card.phoneMobile)}`);
  if (card.phoneWork) lines.push(`TEL;TYPE=WORK,VOICE:${e(card.phoneWork)}`);
  if (card.fax) lines.push(`TEL;TYPE=WORK,FAX:${e(card.fax)}`);
  if (card.emailPrivate) lines.push(`EMAIL;TYPE=INTERNET,HOME:${e(card.emailPrivate)}`);
  if (card.emailWork) lines.push(`EMAIL;TYPE=INTERNET,WORK:${e(card.emailWork)}`);

  const streetLine = [card.street, card.houseNumber].filter(Boolean).join(' ');
  if (streetLine || card.city || card.postalCode || card.state || card.country) {
    lines.push(
      `ADR;TYPE=HOME:;;${escapeValue(streetLine)};${e(card.city)};${e(card.state)};${e(card.postalCode)};${e(card.country)}`
    );
  }
  if (card.website) lines.push(`URL:${e(card.website)}`);
  if (card.linkedin) lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${e(card.linkedin)}`);
  if (card.xing) lines.push(`X-SOCIALPROFILE;TYPE=xing:${e(card.xing)}`);
  if (card.github) lines.push(`X-SOCIALPROFILE;TYPE=github:${e(card.github)}`);
  if (card.birthday && /^\d{4}-\d{2}-\d{2}$/.test(card.birthday)) lines.push(`BDAY:${card.birthday}`);
  if (card.language) lines.push(`LANG:${e(card.language)}`);
  if (card.timezone) lines.push(`TZ:${e(card.timezone)}`);
  if (notes) lines.push(`NOTE:${escapeValue(notes)}`);

  lines.push('END:VCARD');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(value[i]));
    }
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function normalizeBirthday(value: string): string {
  const full = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (full) return `${full[1]}-${full[2]}-${full[3]}`;
  const noYear = value.match(/^--(\d{2})-?(\d{2})/);
  if (noYear) return `--${noYear[1]}-${noYear[2]}`;
  return '';
}

/**
 * Liest eine oder mehrere vCards (Versionen 2.1, 3.0 und 4.0)
 */
export function parseVCards(text: string): ImportedContact[] {
  // Fortsetzungszeilen zusammenführen
  const unfolded = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/=\n(?=[^\n])/g, '=\u0000')
    .replace(/\n[ \t]/g, '');

  const contacts: ImportedContact[] = [];
  let current: ImportedContact | null = null;
  let formattedName = '';

  for (const rawLine of unfolded.split('\n')) {
    const line = rawLine.replace(/=\u0000/g, '');
    const colon = line.indexOf(':');
    if (colon === -1) continue;

    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [rawName, ...params] = head.split(';');
    const name = rawName.replace(/^[^.]*\./, '').toUpperCase();
    const paramText = params.join(';').toUpperCase();

    if (name === 'BEGIN' && value.trim().toUpperCase() === 'VCARD') {
      current = { card: {} };
      formattedName = '';
      continue;
    }
    if (!current) continue;

    if (name === 'END' && value.trim().toUpperCase() === 'VCARD') {
      const card = current.card;
      if (!card.firstName && !card.lastName && formattedName) {
        const parts = formattedName.trim().split(/\s+/);
        if (parts.length > 1) {
          card.lastName = parts.pop()!;
          card.firstName = parts.join(' ');
        } else if (!card.organization) {
          card.lastName = formattedName.trim();
        }
      }
      if (Object.keys(card).length > 0) contacts.push(current);
      current = null;
      continue;
    }

    if (paramText.includes('QUOTED-PRINTABLE')) value = decodeQuotedPrintable(value);
    const card = current.card;
    const single = unescapeValue(value).trim();
    if (!single) continue;

    switch (name) {
      case 'N': {
        const [last, first, , prefix, suffix] = splitParts(value);
        if (last) card.lastName = last;
        if (first) card.firstName = first;
        if (prefix) card.titlePrefix = prefix;
        if (suffix) card.titleSuffix = suffix;
        break;
      }
      case 'FN':
        formattedName = single;
        break;
      case 'NICKNAME':
        card.nickname = single;
        break;
      case 'ORG': {
        const [organization, department] = splitParts(value);
        if (organization) card.organization = organization;
        if (department) card.department = department;
        break;
      }
      case 'TITLE':
        card.position = single;
        break;
      case 'EMAIL':
        if (paramText.includes('WORK') && !card.emailWork) card.emailWork = single;
        else if (!card.emailPrivate) card.emailPrivate = single;
        else if (!card.emailWork) card.emailWork = single;
        break;
      case 'TEL': {
        const number = single.replace(/^tel:/i, '');
        if (paramText.includes('FAX')) {
          if (!card.fax) card.fax = number;
        } else if (paramText.includes('WORK') && !card.phoneWork) {
          card.phoneWork = number;
        } else if (!card.phoneMobile) {
          card.phoneMobile = number;
        } else if (!card.phoneWork) {
          card.phoneWork = number;
        }
        break;
      }
      case 'ADR': {
        if (card.street || card.city) break; // nur die erste Adresse
        const [, , street, city, state, postalCode, country] = splitParts(value);
        if (street) {
          const parts = splitStreet(street);
          card.street = parts ? parts.street : street;
          if (parts) card.houseNumber = parts.houseNumber;
        }
        if (city) card.city = city;
        if (state) card.state = state;
        if (postalCode) card.postalCode = postalCode;
        if (country) card.country = country;
        break;
      }
      case 'URL':
      case 'X-SOCIALPROFILE': {
        const lower = single.toLowerCase();
        if (lower.includes('linkedin.') || paramText.includes('LINKEDIN')) card.linkedin = card.linkedin || single;
        else if (lower.includes('xing.') || paramText.includes('XING')) card.xing = card.xing || single;
        else if (lower.includes('github.') || paramText.includes('GITHUB')) card.github = card.github || single;
        else if (name === 'URL') card.website = card.website || single;
        break;
      }
      case 'BDAY': {
        const birthday = normalizeBirthday(single);
        if (birthday) card.birthday = birthday;
        break;
      }
      case 'NOTE':
        current.notes = single;
        break;
      default:
        break;
    }
  }

  return contacts;
}
