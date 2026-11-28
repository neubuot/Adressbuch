import { describe, it, expect } from 'vitest';
import { parseVCards, toVCard } from './vcard';
import { parseCsv, parseContactsCsv, toCsv } from './csv';
import { createBackup, readBackup, isBackupFile, BackupError } from './backup';
import { exportCsv, exportJson, exportVCards, selectForExport } from './export';
import type { Connection, RemoteCard, Tag } from '../types';

const anna: RemoteCard = {
  titlePrefix: 'Dr.',
  firstName: 'Anna',
  lastName: 'Müller; Schmidt',
  organization: 'Muster GmbH',
  department: 'Einkauf',
  position: 'Leitung',
  phoneMobile: '+49 151 1234567',
  phoneWork: '030 123456',
  emailPrivate: 'anna@example.org',
  emailWork: 'a.mueller@example.com',
  street: 'Hauptstraße',
  houseNumber: '12a',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
  website: 'https://example.org',
  linkedin: 'https://www.linkedin.com/in/anna',
  birthday: '1985-03-09',
};

describe('vCard', () => {
  it('übersteht Schreiben und Lesen ohne Verlust', () => {
    const [parsed] = parseVCards(toVCard(anna, 'Zeile 1\nZeile 2, mit Komma'));
    expect(parsed.card).toEqual(anna);
    expect(parsed.notes).toBe('Zeile 1\nZeile 2, mit Komma');
  });

  it('liest mehrere Karten, gefaltete Zeilen und vCard 2.1', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=B6rg',
      'TEL;CELL:0170 111',
      'TEL;WORK;FAX:030 222',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:Erika Beispiel',
      'EMAIL;TYPE=work:erika@example.com',
      'ADR;TYPE=home:;;Lange Zeile die umbrochen',
      '  wird 7;Köln;NRW;50667;Deutschland',
      'BDAY:19900412',
      'END:VCARD',
    ].join('\r\n');
    const result = parseVCards(text);
    expect(result).toHaveLength(2);
    expect(result[0].card).toEqual({ lastName: 'Müller', firstName: 'Jörg', phoneMobile: '0170 111', fax: '030 222' });
    expect(result[1].card.firstName).toBe('Erika');
    expect(result[1].card.lastName).toBe('Beispiel');
    expect(result[1].card.emailWork).toBe('erika@example.com');
    expect(result[1].card.street).toBe('Lange Zeile die umbrochen wird');
    expect(result[1].card.houseNumber).toBe('7');
    expect(result[1].card.city).toBe('Köln');
    expect(result[1].card.birthday).toBe('1990-04-12');
  });

  it('liefert bei unbrauchbarem Text nichts', () => {
    expect(parseVCards('kein vcard')).toEqual([]);
  });
});

describe('CSV', () => {
  it('erkennt Trennzeichen und Anführungszeichen', () => {
    expect(parseCsv('a;b\n"x;1";"sagt ""hallo"""\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'sagt "hallo"'],
    ]);
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('ordnet deutsche und englische Überschriften zu', () => {
    const { contacts, unknownHeaders } = parseContactsCsv(
      'Vorname;Nachname;E-Mail;Mobil;Straße;PLZ;Ort;Geburtstag;Schuhgröße;Notizen\n' +
        'Max;Mustermann;max@example.org;0170 1;Musterweg 5;80331;München;02.01.1990;44;Kollege\n'
    );
    expect(unknownHeaders).toEqual(['Schuhgröße']);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].notes).toBe('Kollege');
    expect(contacts[0].card).toEqual({
      firstName: 'Max',
      lastName: 'Mustermann',
      emailPrivate: 'max@example.org',
      phoneMobile: '0170 1',
      street: 'Musterweg',
      houseNumber: '5',
      postalCode: '80331',
      city: 'München',
      birthday: '1990-01-02',
    });

    const english = parseContactsCsv('First Name,Last Name,E-mail Address,Mobile Phone\nJo,Doe,jo@example.com,123\n');
    expect(english.contacts[0].card).toEqual({
      firstName: 'Jo',
      lastName: 'Doe',
      emailPrivate: 'jo@example.com',
      phoneMobile: '123',
    });
  });

  it('entschärft Formeln beim Schreiben', () => {
    const csv = toCsv([['=SUMME(A1)', 'normal', '+49 170 123-45', '+1+cmd', '-2']]);
    expect(csv).toContain(`"'=SUMME(A1)";"normal";"+49 170 123-45";"'+1+cmd";"-2"`);
  });
});

describe('Export', () => {
  const tags: Record<string, Tag> = {
    t1: { id: 't1', name: 'Familie', color: '#000', createdAt: '' },
  };
  const connections: Connection[] = [
    {
      id: 'B', kind: 'linked', peerPubKey: 'k', allowedFields: ['firstName', 'lastName', 'phoneMobile'],
      storeRemoteCard: true, status: 'offline', createdAt: '2024-01-02T00:00:00.000Z',
      remoteCard: { firstName: 'Berta', lastName: 'Zeh', phoneMobile: '0151' }, tagIds: ['t1'],
      private: { notes: 'geheim' },
    },
    {
      id: 'A', kind: 'local', peerPubKey: '', allowedFields: [], storeRemoteCard: true, status: 'offline',
      createdAt: '2024-03-01T00:00:00.000Z', remoteCard: { firstName: 'Anton', lastName: 'Ah' },
    },
  ];

  it('wählt nach Tags aus und sortiert', () => {
    const base = { tagIds: [], sortBy: 'name' as const, descending: false, includePrivate: false };
    expect(selectForExport(connections, base).map((c) => c.id)).toEqual(['A', 'B']);
    expect(selectForExport(connections, { ...base, descending: true }).map((c) => c.id)).toEqual(['B', 'A']);
    expect(selectForExport(connections, { ...base, sortBy: 'createdAt' }).map((c) => c.id)).toEqual(['B', 'A']);
    expect(selectForExport(connections, { ...base, tagIds: ['t1'] }).map((c) => c.id)).toEqual(['B']);
  });

  it('CSV enthält Kontaktdaten; Notizen nur auf Wunsch', () => {
    const csv = exportCsv(connections, tags, false);
    const rows = parseCsv(csv);
    expect(rows[0]).toContain('telefon_mobil');
    expect(rows[0]).toContain('vorname');
    expect(rows[0]).not.toContain('notizen');
    expect(rows[1][rows[0].indexOf('telefon_mobil')]).toBe('0151');
    expect(rows[1][rows[0].indexOf('tags')]).toBe('Familie');
    expect(csv).not.toContain('geheim');

    const withNotes = parseCsv(exportCsv(connections, tags, true));
    expect(withNotes[1][withNotes[0].indexOf('notizen')]).toBe('geheim');
  });

  it('JSON und vCard sind lesbar', () => {
    const json = JSON.parse(exportJson(connections, tags, false));
    expect(json.kontakte[0].karte.vorname).toBe('Berta');
    expect(json.kontakte[0].eigene_angaben).toBeUndefined();
    expect(parseVCards(exportVCards(connections, false))).toHaveLength(2);
  });
});

describe('Sicherung', () => {
  const content = {
    snapshot: new Uint8Array([1, 2, 3, 250, 251, 252]),
    keyPair: { publicKey: 'pub', privateKey: 'priv' },
  };

  it('lässt sich mit dem richtigen Passwort öffnen', async () => {
    const file = await createBackup(content, 'richtiges passwort');
    expect(isBackupFile(file)).toBe(true);
    expect(file).not.toContain('priv');
    const restored = await readBackup(file, 'richtiges passwort');
    expect(Array.from(restored.snapshot)).toEqual([1, 2, 3, 250, 251, 252]);
    expect(restored.keyPair).toEqual(content.keyPair);
  }, 20000);

  it('weist ein falsches Passwort und fremde Dateien ab', async () => {
    const file = await createBackup(content, 'richtiges passwort');
    await expect(readBackup(file, 'falsch')).rejects.toMatchObject({ reason: 'password' });
    await expect(readBackup('{"x":1}', 'egal')).rejects.toBeInstanceOf(BackupError);
    expect(isBackupFile('kein json')).toBe(false);
  }, 20000);
});

describe('vCard ohne Namen', () => {
  it('übernimmt Einträge, die nur aus Nummer oder E-Mail bestehen, und lässt ganz leere weg', () => {
    const text = [
      'BEGIN:VCARD', 'VERSION:2.1', 'TEL;CELL:+49 171 5550100', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'EMAIL;TYPE=INTERNET:jemand@example.org', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'N:;;;;', 'FN:', 'END:VCARD',
      '',
    ].join('\r\n');
    const contacts = parseVCards(text);
    expect(contacts).toHaveLength(2);
    expect(contacts[0].card.firstName).toBeUndefined();
    expect(contacts[0].card.lastName).toBeUndefined();
    expect(Object.values(contacts[0].card).join(' ')).toContain('5550100');
    expect(Object.values(contacts[1].card).join(' ')).toContain('jemand@example.org');
  });
});
