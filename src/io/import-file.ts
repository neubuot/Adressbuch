/**
 * Eine Datei mit Kontakten lesen, gleich woher sie kommt: gewählt, auf die
 * Seite gezogen oder aus einer anderen App geteilt.
 *
 * Erkannt werden Kontaktdateien (.vcf), Tabellen (.csv), die Kontakttabelle
 * aus dem LinkedIn-Export und das ZIP-Archiv dieses Exports.
 */

import { parseContactsCsv } from './csv';
import { isLinkedInConnections, parseLinkedInConnections, readLinkedInArchive } from './linkedin';
import { parseVCards, type ImportedContact } from './vcard';
import { ZipError, looksLikeZip } from './zip';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type FileOrigin = 'file' | 'linkedin';

export interface FileContacts {
  contacts: ImportedContact[];
  origin: FileOrigin;
  /** Spalten einer Tabelle, die keinem Feld zugeordnet werden konnten */
  unknownHeaders: string[];
}

/** Fehler mit einem Text, der dem Nutzer so gezeigt werden kann */
export class ImportFileError extends Error {}

export async function readContactsFile(file: Blob): Promise<FileContacts> {
  if (await looksLikeZip(file)) {
    let contacts: ImportedContact[] | null;
    try {
      contacts = await readLinkedInArchive(file);
    } catch (problem) {
      throw new ImportFileError(
        problem instanceof ZipError && problem.kind !== 'not-zip'
          ? `${problem.message} Entpacke das Archiv und nimm die Datei „Connections.csv“.`
          : 'Das Archiv konnte nicht gelesen werden. Entpacke es und nimm die Datei „Connections.csv“.'
      );
    }
    if (contacts === null) {
      throw new ImportFileError(
        'In diesem Archiv steckt keine Kontakttabelle von LinkedIn (Connections.csv). Wähle beim Anfordern der Daten bei LinkedIn „Kontakte“ aus.'
      );
    }
    if (contacts.length === 0) throw new ImportFileError('Die Kontakttabelle von LinkedIn in diesem Archiv ist leer.');
    return { contacts, origin: 'linkedin', unknownHeaders: [] };
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new ImportFileError('Die Datei ist zu groß (über 10 MB). Teile sie in kleinere Dateien auf.');
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new ImportFileError('Die Datei konnte nicht gelesen werden. Ist es eine .vcf- oder .csv-Datei?');
  }

  let result: FileContacts;
  if (/BEGIN:VCARD/i.test(text)) {
    result = { contacts: parseVCards(text), origin: 'file', unknownHeaders: [] };
  } else if (isLinkedInConnections(text)) {
    result = { contacts: parseLinkedInConnections(text), origin: 'linkedin', unknownHeaders: [] };
  } else {
    const parsed = parseContactsCsv(text);
    result = { contacts: parsed.contacts, origin: 'file', unknownHeaders: parsed.unknownHeaders };
  }
  if (result.contacts.length === 0) {
    throw new ImportFileError(
      'In dieser Datei wurden keine Kontakte gefunden. Unterstützt werden Kontaktdateien (.vcf), Tabellen (.csv) mit einer Überschriftenzeile wie „Vorname; Nachname; E-Mail“ und der Datenexport von LinkedIn.'
    );
  }
  return result;
}

/**
 * Liest mehrere Dateien und fasst ihre Kontakte zusammen (z. B. wenn eine
 * andere App jeden Kontakt als eigene Datei teilt).
 */
export async function readContactsFiles(files: Blob[]): Promise<FileContacts> {
  if (files.length === 1) return readContactsFile(files[0]);

  const results: FileContacts[] = [];
  let firstError: unknown = null;
  for (const file of files) {
    try {
      results.push(await readContactsFile(file));
    } catch (problem) {
      firstError = firstError ?? problem;
    }
  }
  if (results.length === 0) throw firstError ?? new ImportFileError('Es wurde keine Datei übergeben.');
  return {
    contacts: results.flatMap((result) => result.contacts),
    origin: results.every((result) => result.origin === 'linkedin') ? 'linkedin' : 'file',
    unknownHeaders: [...new Set(results.flatMap((result) => result.unknownHeaders))],
  };
}
