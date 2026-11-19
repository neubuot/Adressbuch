import { describe, it, expect } from 'vitest';
import { searchContacts } from './search';
import {
  contactName,
  contactState,
  daysUntilBirthday,
  longNoContact,
  upcomingBirthdays,
} from './contact';
import { describeChange, countUnseen } from './activity';
import { mapHref, mailHref, phoneHref } from './actions';
import type { Connection, Tag } from '../types';

const tags: Record<string, Tag> = {
  fam: { id: 'fam', name: 'Familie', color: '#000', createdAt: '' },
  job: { id: 'job', name: 'Arbeit', color: '#000', createdAt: '' },
};

function contact(id: string, extra: Partial<Connection>): Connection {
  return { id, kind: 'linked', peerPubKey: 'k', allowedFields: [], storeRemoteCard: true, status: 'offline', ...extra };
}

const connections: Connection[] = [
  contact('1', {
    remoteCard: { firstName: 'Jörg', lastName: 'Müller', city: 'Köln', phoneMobile: '+49 170 123 45 67' },
    tagIds: ['fam'],
    private: { notes: 'Segeln am Bodensee' },
  }),
  contact('2', {
    remoteCard: { firstName: 'Anna', lastName: 'Beispiel', organization: 'Muster GmbH', emailWork: 'anna@muster.example' },
    tagIds: ['job', 'fam'],
  }),
  contact('3', { kind: 'local', label: 'Hausarzt', remoteCard: { lastName: 'Dr. Weiß', phoneWork: '030/99 88 77' } }),
];

describe('Suche', () => {
  const ids = (query: string, tagIds: string[] = []) =>
    searchContacts(connections, tags, query, tagIds).map((hit) => hit.connection.id);

  it('findet über Namen, Umlaute und mehrere Wörter', () => {
    expect(ids('muller')).toEqual(['1']);
    expect(ids('jörg köln')).toEqual(['1']);
    expect(ids('jörg berlin')).toEqual([]);
  });

  it('findet in allen Feldern, Notizen, Bezeichnungen und Tags', () => {
    expect(ids('bodensee')).toEqual(['1']);
    expect(ids('muster.example')).toEqual(['2']);
    expect(ids('hausarzt')).toEqual(['3']);
    expect(ids('arbeit')).toEqual(['2']);
  });

  it('findet Telefonnummern unabhängig von der Schreibweise', () => {
    expect(ids('1701234567')).toEqual(['1']);
    expect(ids('0170 123')).toEqual([]);
    expect(ids('998877')).toEqual(['3']);
  });

  it('filtert nach Tags und nennt das Trefferfeld', () => {
    expect(ids('', ['fam'])).toEqual(['2', '1']);
    expect(ids('', ['fam', 'job'])).toEqual(['2']);
    const [hit] = searchContacts(connections, tags, 'köln');
    expect(hit.matchLabel).toBe('Ort');
    expect(hit.matchValue).toBe('Köln');
  });
});

describe('Kontakt', () => {
  it('zeigt Bezeichnung, Namen oder zuletzt bekannten Namen', () => {
    expect(contactName(connections[2])).toBe('Hausarzt');
    expect(contactName(connections[0])).toBe('Jörg Müller');
    expect(contactName(contact('x', { knownName: 'Früher Bekannt', remoteCard: {} }))).toBe('Früher Bekannt');
    expect(contactName(contact('y', {}))).toBe('Neuer Kontakt');
  });

  it('beschreibt den Zustand in Alltagssprache', () => {
    expect(contactState(contact('a', { status: 'online' })).label).toBe('Aktuell');
    expect(contactState(contact('a', { status: 'offline' })).label).toBe('Wartet auf Verbindung');
    expect(contactState(contact('a', { kind: 'local' })).label).toBe('Nicht verbunden');
    expect(contactState(contact('a', { incompatible: true, status: 'online' })).kind).toBe('incompatible');
  });

  it('berechnet Geburtstage', () => {
    const now = new Date(2026, 10, 19);
    expect(daysUntilBirthday('1985-11-19', now)).toMatchObject({ inDays: 0, turns: 41 });
    expect(daysUntilBirthday('1985-11-24', now)).toMatchObject({ inDays: 5, turns: 41 });
    expect(daysUntilBirthday('1990-01-01', now)).toMatchObject({ inDays: 43, turns: 37 });
    expect(daysUntilBirthday('--11-20', now)).toMatchObject({ inDays: 1, turns: undefined });
    expect(daysUntilBirthday('unsinn', now)).toBeNull();

    const list = upcomingBirthdays(
      [
        contact('a', { remoteCard: { birthday: '1990-12-01' } }),
        contact('b', { remoteCard: { birthday: '1980-11-21' } }),
        contact('c', { remoteCard: { birthday: '1980-06-01' } }),
      ],
      30,
      now
    );
    expect(list.map((entry) => entry.connection.id)).toEqual(['b', 'a']);
  });

  it('erkennt lange nicht gesprochene Kontakte', () => {
    const now = new Date(2026, 10, 19);
    const list = longNoContact(
      [
        contact('a', { private: { lastContactAt: '2026-10-01' } }),
        contact('b', { private: { lastContactAt: '2025-01-15' } }),
        contact('c', {}),
      ],
      6,
      now
    );
    expect(list.map((entry) => entry.connection.id)).toEqual(['b']);
    expect(list[0].months).toBeGreaterThanOrEqual(21);
  });
});

describe('Änderungsübersicht', () => {
  const entry = { id: 'e', connectionId: '1', at: '2026-01-02T00:00:00.000Z', field: 'phoneMobile' };

  it('formuliert Änderungen verständlich', () => {
    expect(describeChange({ ...entry, oldValue: '1', newValue: '2' }, 'Anna').sentence).toBe(
      'Anna hat die Mobilnummer geändert'
    );
    expect(describeChange({ ...entry, oldValue: '', newValue: '2' }, 'Anna').kind).toBe('added');
    expect(describeChange({ ...entry, oldValue: '1', newValue: '' }, 'Anna').sentence).toBe(
      'Anna teilt die Mobilnummer nicht mehr mit dir'
    );
  });

  it('zählt ungesehene Einträge', () => {
    const list = [{ ...entry, oldValue: '', newValue: '' }];
    expect(countUnseen(list, '2026-01-01T00:00:00.000Z')).toBe(1);
    expect(countUnseen(list, '2026-01-03T00:00:00.000Z')).toBe(0);
    expect(countUnseen(undefined, '')).toBe(0);
  });
});

describe('Aktionen', () => {
  const card = { phoneMobile: '+49 (170) 12-34', emailWork: 'a+b@example.org', street: 'Hauptstr.', houseNumber: '1', city: 'Berlin' };

  it('baut Links zum Anrufen und Mailen', () => {
    expect(phoneHref(card)).toBe('tel:+491701234');
    expect(mailHref(card)).toBe('mailto:a%2Bb@example.org');
    expect(phoneHref({})).toBeNull();
  });

  it('öffnet die Adresse in der Karten-App des Geräts', () => {
    expect(mapHref(card, 'Mozilla/5.0 (iPhone)')).toMatch(/^https:\/\/maps\.apple\.com\/\?q=Hauptstr/);
    expect(mapHref(card, 'Mozilla/5.0 (Linux; Android 14)')).toMatch(/^geo:0,0\?q=/);
    expect(mapHref(card, 'Mozilla/5.0 (Windows NT 10.0)')).toMatch(/^https:\/\/www\.openstreetmap\.org\/search/);
    expect(mapHref({ country: 'DE' }, 'x')).toBeNull();
  });
});
