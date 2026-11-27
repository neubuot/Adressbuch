// @vitest-environment node
/**
 * Stufe E: Datenexport von LinkedIn (Tabelle und ZIP-Archiv), Kontakte aus
 * Microsoft Graph
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { ZipError, listZip, looksLikeZip, readZipEntry } from './zip';
import {
  findConnectionsEntry,
  isLinkedInConnections,
  linkedInProfileId,
  parseLinkedInConnections,
  readLinkedInArchive,
} from './linkedin';
import { ImportFileError, readContactsFile, readContactsFiles } from './import-file';
import { fromGraphContacts, pkceChallenge } from './microsoft';

interface ZipFile {
  name: string;
  data: Uint8Array;
  stored?: boolean;
  encrypted?: boolean;
}

/** Baut ein ZIP-Archiv, wie es gängige Programme schreiben */
function buildZip(files: ZipFile[], comment = ''): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const body = file.stored ? file.data : new Uint8Array(deflateRawSync(file.data));
    const flags = 0x0800 | (file.encrypted ? 1 : 0);
    const method = file.stored ? 0 : 8;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);

    parts.push(local, body);
    central.push(entry);
    offset += local.length + body.length;
  }

  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
  const commentBytes = encoder.encode(comment);
  const end = new Uint8Array(22 + commentBytes.length);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, commentBytes.length, true);
  end.set(commentBytes, 22);

  return new Blob([...parts, ...central, end] as BlobPart[]);
}

const bytes = (text: string) => new TextEncoder().encode(text);

const CONNECTIONS = [
  'Notes:',
  '"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address."',
  '',
  'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
  'Clara,Sommer,https://www.linkedin.com/in/clara-sommer-123,clara@example.org,"Eis, Sorbet & Co. AG",Geschäftsführerin,12 Mar 2024',
  'Emil,Herbst,https://www.linkedin.com/in/emil-herbst,,Laub GmbH,Gärtner,03 Jan 2023',
  ',,,,,,',
].join('\n');

describe('ZIP-Archiv lesen', () => {
  it('findet Dateien und entpackt sie', async () => {
    const zip = buildZip([
      { name: 'Profile.csv', data: bytes('a,b\n1,2\n') },
      { name: 'Connections.csv', data: bytes(CONNECTIONS) },
      { name: 'Bild.png', data: new Uint8Array([1, 2, 3, 4]), stored: true },
    ]);
    expect(await looksLikeZip(zip)).toBe(true);
    const entries = await listZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual(['Profile.csv', 'Connections.csv', 'Bild.png']);

    const text = new TextDecoder().decode(await readZipEntry(zip, entries[1], 1024 * 1024));
    expect(text).toBe(CONNECTIONS);
    expect(Array.from(await readZipEntry(zip, entries[2], 1024))).toEqual([1, 2, 3, 4]);
  });

  it('kommt mit einem Kommentar am Ende zurecht', async () => {
    const zip = buildZip([{ name: 'a.txt', data: bytes('hallo') }], 'x'.repeat(500));
    const [entry] = await listZip(zip);
    expect(new TextDecoder().decode(await readZipEntry(zip, entry, 100))).toBe('hallo');
  });

  it('weist anderes als ein Archiv ab', async () => {
    const other = new Blob([bytes('First Name,Last Name\nClara,Sommer\n'.repeat(3))]);
    expect(await looksLikeZip(other)).toBe(false);
    await expect(listZip(other)).rejects.toMatchObject({ kind: 'not-zip' });
  });

  it('entpackt nicht mehr als erlaubt', async () => {
    const zip = buildZip([{ name: 'gross.csv', data: new Uint8Array(200000) }]);
    const [entry] = await listZip(zip);
    await expect(readZipEntry(zip, entry, 1000)).rejects.toMatchObject({ kind: 'too-large' });

    // Auch wenn das Inhaltsverzeichnis eine kleinere Größe behauptet
    await expect(readZipEntry(zip, { ...entry, size: 10 }, 1000)).rejects.toBeInstanceOf(ZipError);
  });

  it('weist geschützte Archive ab', async () => {
    const zip = buildZip([{ name: 'a.csv', data: bytes('x'), encrypted: true }]);
    const [entry] = await listZip(zip);
    await expect(readZipEntry(zip, entry, 1000)).rejects.toMatchObject({ kind: 'unsupported' });
  });
});

describe('Datenexport von LinkedIn', () => {
  it('erkennt die Kontakttabelle trotz Hinweistext davor', () => {
    expect(isLinkedInConnections(CONNECTIONS)).toBe(true);
    expect(isLinkedInConnections('Vorname;Nachname;E-Mail\nClara;Sommer;clara@example.org\n')).toBe(false);
  });

  it('liest Namen, Profil, E-Mail, Firma und Position', () => {
    const contacts = parseLinkedInConnections(CONNECTIONS);
    expect(contacts).toHaveLength(2);
    expect(contacts[0].card).toEqual({
      firstName: 'Clara',
      lastName: 'Sommer',
      linkedin: 'https://www.linkedin.com/in/clara-sommer-123',
      emailPrivate: 'clara@example.org',
      organization: 'Eis, Sorbet & Co. AG',
      position: 'Geschäftsführerin',
    });
    expect(contacts[0].externalId).toBe('linkedin.com/in/clara-sommer-123');
    expect(contacts[1].card.emailPrivate).toBeUndefined();
  });

  it('liest die Tabelle auch ohne Hinweistext und mit BOM', () => {
    const plain = '﻿' + CONNECTIONS.split('\n').slice(3).join('\r\n');
    expect(parseLinkedInConnections(plain)).toHaveLength(2);
  });

  it('schreibt Profiladressen einheitlich', () => {
    expect(linkedInProfileId('https://de.linkedin.com/in/Clara-Sommer/?trk=x')).toBe('linkedin.com/in/clara-sommer');
    expect(linkedInProfileId('http://www.linkedin.com/in/clara-sommer#abc')).toBe('linkedin.com/in/clara-sommer');
  });

  it('findet die Kontakttabelle im Archiv, auch in einem Unterordner', async () => {
    const zip = buildZip([
      { name: 'Export/Alt/Connections.csv', data: bytes('First Name,Last Name,URL\nAlt,Alt,https://www.linkedin.com/in/alt\n') },
      { name: 'Export/connections.csv', data: bytes(CONNECTIONS) },
      { name: 'Export/Messages.csv', data: bytes('x') },
    ]);
    expect(findConnectionsEntry(await listZip(zip))?.name).toBe('Export/connections.csv');
    expect((await readLinkedInArchive(zip))?.map((contact) => contact.card.firstName)).toEqual(['Clara', 'Emil']);
  });

  it('meldet ein Archiv ohne Kontakttabelle', async () => {
    const zip = buildZip([{ name: 'Profile.csv', data: bytes('x') }]);
    expect(await readLinkedInArchive(zip)).toBeNull();
    await expect(readContactsFile(zip)).rejects.toBeInstanceOf(ImportFileError);
  });
});

describe('Dateien erkennen', () => {
  it('ordnet Archiv, LinkedIn-Tabelle, vCard und Tabelle richtig zu', async () => {
    const zip = buildZip([{ name: 'Connections.csv', data: bytes(CONNECTIONS) }]);
    expect((await readContactsFile(zip)).origin).toBe('linkedin');
    expect((await readContactsFile(new Blob([CONNECTIONS]))).origin).toBe('linkedin');

    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nN:Winter;Ida;;;\nFN:Ida Winter\nEND:VCARD\n';
    const fromVcard = await readContactsFile(new Blob([vcard]));
    expect(fromVcard.origin).toBe('file');
    expect(fromVcard.contacts[0].card.lastName).toBe('Winter');

    const table = await readContactsFile(new Blob(['Vorname;Nachname;Lieblingsfarbe\nOle;Lenz;blau\n']));
    expect(table.origin).toBe('file');
    expect(table.unknownHeaders).toEqual(['Lieblingsfarbe']);
  });

  it('fasst mehrere geteilte Dateien zusammen', async () => {
    const card = (name: string) => new Blob([`BEGIN:VCARD\nVERSION:3.0\nN:${name};;;;\nFN:${name}\nEND:VCARD\n`]);
    const result = await readContactsFiles([card('Eins'), new Blob(['kein Kontakt']), card('Zwei')]);
    expect(result.contacts.map((contact) => contact.card.lastName)).toEqual(['Eins', 'Zwei']);
  });

  it('meldet eine Datei ohne Kontakte', async () => {
    await expect(readContactsFile(new Blob(['nur Text']))).rejects.toBeInstanceOf(ImportFileError);
  });
});

describe('Kontakte aus Microsoft Graph', () => {
  it('ordnet die Felder zu', () => {
    const [contact] = fromGraphContacts([
      {
        id: 'AAMkAGI2',
        givenName: 'Clara',
        surname: 'Sommer',
        title: 'Dr.',
        nickName: 'Clärchen',
        emailAddresses: [
          { address: 'clara@example.org' },
          { address: 'c.sommer@eis.example' },
          { address: 'dritte@example.org' },
          { address: 'clara@example.org' },
        ],
        mobilePhone: '+49 170 111',
        businessPhones: ['+49 30 222', '+49 30 333'],
        homePhones: ['+49 30 444'],
        homeAddress: {},
        businessAddress: { street: 'Eisweg 7b\nHinterhaus', city: 'Konstanz', postalCode: '78462', state: 'BW', countryOrRegion: 'Deutschland' },
        companyName: 'Eis AG',
        jobTitle: 'Leitung',
        department: 'Vertrieb',
        birthday: '1988-04-09T11:59:00Z',
        businessHomePage: 'https://www.linkedin.com/in/clara-sommer',
        personalNotes: 'Mag Zitrone',
      },
    ]);
    expect(contact.externalId).toBe('AAMkAGI2');
    expect(contact.notes).toBe('Mag Zitrone');
    expect(contact.card).toEqual({
      firstName: 'Clara',
      lastName: 'Sommer',
      titlePrefix: 'Dr.',
      nickname: 'Clärchen',
      emailPrivate: 'clara@example.org',
      emailWork: 'c.sommer@eis.example',
      phoneMobile: '+49 170 111',
      phoneWork: '+49 30 222',
      street: 'Eisweg',
      houseNumber: '7b',
      city: 'Konstanz',
      postalCode: '78462',
      state: 'BW',
      country: 'Deutschland',
      organization: 'Eis AG',
      position: 'Leitung',
      department: 'Vertrieb',
      birthday: '1988-04-09',
      linkedin: 'https://www.linkedin.com/in/clara-sommer',
    });
    expect(contact.extra).toEqual({ emails: ['dritte@example.org'], phones: ['+49 30 444', '+49 30 333'] });
  });

  it('nimmt die private Nummer, wenn keine Mobilnummer da ist, und überspringt leere Einträge', () => {
    const contacts = fromGraphContacts([
      { id: '1', surname: 'Herbst', homePhones: ['0751 1'], emailAddresses: null, businessPhones: null },
      { id: '2', givenName: '  ', emailAddresses: [] },
      null as never,
    ]);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].card).toEqual({ lastName: 'Herbst', phoneMobile: '0751 1' });
    expect(contacts[0].extra).toBeUndefined();
  });

  it('berechnet die Prüfsumme für die Anmeldung wie vorgeschrieben', async () => {
    const verifier = 'ein-geheimer-wert-der-nur-im-browser-liegt-0123456789';
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(await pkceChallenge(verifier)).toBe(expected);
  });
});
