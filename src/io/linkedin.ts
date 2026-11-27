/**
 * Kontakte aus dem Datenexport von LinkedIn übernehmen.
 *
 * LinkedIn bietet keinen direkten Zugriff auf die eigenen Kontakte, liefert
 * sie aber auf Anforderung als Datei: entweder als ZIP-Archiv oder als
 * einzelne Tabelle "Connections.csv". Beides lässt sich hier ablegen.
 *
 * Die Tabelle beginnt mit einem Hinweistext, erst danach folgt die
 * Überschriftenzeile. E-Mail-Adressen stehen nur bei den Kontakten drin, die
 * das bei LinkedIn erlaubt haben; Telefonnummern fehlen ganz.
 */

import type { RemoteCard } from '../types';
import { parseCsv } from './csv';
import type { ImportedContact } from './vcard';
import { listZip, readZipEntry, type ZipEntry } from './zip';

export const LINKEDIN_SOURCE_ID = 'linkedin';
export const LINKEDIN_SOURCE_NAME = 'LinkedIn';

const MAX_CSV_BYTES = 20 * 1024 * 1024;

type Column = 'firstName' | 'lastName' | 'linkedin' | 'emailPrivate' | 'organization' | 'position';

const HEADERS: Record<string, Column> = {
  firstname: 'firstName',
  vorname: 'firstName',
  lastname: 'lastName',
  nachname: 'lastName',
  url: 'linkedin',
  profileurl: 'linkedin',
  emailaddress: 'emailPrivate',
  emailadresse: 'emailPrivate',
  company: 'organization',
  unternehmen: 'organization',
  position: 'position',
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/** Position der Überschriftenzeile oder -1 */
function headerRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const columns = new Set(rows[i].map((cell) => HEADERS[normalizeHeader(cell)]));
    if (columns.has('firstName') && columns.has('lastName') && columns.has('linkedin')) return i;
  }
  return -1;
}

/**
 * Schneidet den Hinweistext vor der Überschriftenzeile ab. Nötig, weil das
 * Trennzeichen sonst am Hinweistext statt an der Tabelle erkannt würde.
 */
function tableOf(text: string): string {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const start = lines.findIndex((line) => /^"?(first name|vorname)"?\s*[,;\t]/i.test(line.trim()));
  return start > 0 ? lines.slice(start).join('\n') : lines.join('\n');
}

/** Ist das die Kontakttabelle aus dem LinkedIn-Export? */
export function isLinkedInConnections(text: string): boolean {
  return headerRow(parseCsv(tableOf(text.slice(0, 20000)))) >= 0;
}

/** Einheitliche Schreibweise der Profiladresse, dient auch als Kennung */
export function linkedInProfileId(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^[a-z]{2,3}\.linkedin\.com/, 'linkedin.com')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

export function parseLinkedInConnections(text: string): ImportedContact[] {
  const rows = parseCsv(tableOf(text));
  const start = headerRow(rows);
  if (start < 0) return [];

  const columns = rows[start].map((cell) => HEADERS[normalizeHeader(cell)] ?? null);
  const contacts: ImportedContact[] = [];
  for (const row of rows.slice(start + 1)) {
    const card: RemoteCard = {};
    row.forEach((raw, index) => {
      const column = columns[index];
      const value = raw.trim().slice(0, 500);
      if (column && value && !card[column]) card[column] = value;
    });
    if (!card.firstName && !card.lastName) continue;

    const contact: ImportedContact = { card };
    if (card.linkedin) contact.externalId = linkedInProfileId(card.linkedin).slice(0, 200);
    contacts.push(contact);
  }
  return contacts;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

/** Sucht die Kontakttabelle im Archiv; bevorzugt die im obersten Ordner */
export function findConnectionsEntry(entries: ZipEntry[]): ZipEntry | null {
  const matches = entries
    .filter((entry) => /(^|\/)connections\.csv$/i.test(entry.name))
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  return matches[0] ?? null;
}

/**
 * Liest die Kontakte aus dem ZIP-Archiv des LinkedIn-Exports.
 * Liefert null, wenn das Archiv keine Kontakttabelle enthält.
 */
export async function readLinkedInArchive(file: Blob): Promise<ImportedContact[] | null> {
  const entry = findConnectionsEntry(await listZip(file));
  if (!entry) return null;
  return parseLinkedInConnections(decode(await readZipEntry(file, entry, MAX_CSV_BYTES)));
}
