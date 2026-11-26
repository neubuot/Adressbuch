import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../store/db', () => ({
  db: { documents: { get: async () => undefined, put: async () => undefined } },
}));

import { AutomergeStore } from '../store/automerge-store';
import { migrateState, needsMigration } from '../store/migrate';
import { parseVCards } from '../io/vcard';
import { fromPickedContacts } from '../io/phonebook';
import { LEGACY_SOURCE_ID, MANUAL_SOURCE_ID, SCHEMA_VERSION, type Connection, type ImportSource, type SourceRecord } from '../types';
import { manualOverrides, mergeRecords, mergeRecordsDetailed } from './merge';
import {
  fallbackExternalId,
  nameKey,
  normalizeEmail,
  normalizePhone,
  normalizeProfile,
  planImport,
  summarizePlan,
  type IncomingContact,
} from './dedupe';

function record(sourceId: string, card: SourceRecord['card'], importedAt = '2026-01-01T00:00:00.000Z'): SourceRecord {
  return { sourceId, externalId: 'x', importedAt, card };
}

const sources: Record<string, ImportSource> = {
  google: { id: 'google', kind: 'google', name: 'Google', rank: 1 },
  file: { id: 'file', kind: 'file', name: 'datei.vcf', rank: 2 },
};

describe('Karte aus Datensätzen berechnen', () => {
  it('nimmt je Feld den Wert der führenden Quelle und füllt Lücken aus den anderen', () => {
    const { card, origins } = mergeRecordsDetailed(
      {
        a: record('file', { firstName: 'Clara', phoneMobile: '0160 alt', city: 'Konstanz' }),
        b: record('google', { firstName: 'Clara', phoneMobile: '+49 160 neu' }),
      },
      sources
    );
    expect(card).toEqual({ firstName: 'Clara', phoneMobile: '+49 160 neu', city: 'Konstanz' });
    expect(origins.phoneMobile).toBe('google');
    expect(origins.city).toBe('file');
  });

  it('ein leerer Wert der führenden Quelle überschreibt nichts', () => {
    const card = mergeRecords(
      { a: record('google', { firstName: 'Clara', city: '' }), b: record('file', { city: 'Konstanz' }) },
      sources
    );
    expect(card.city).toBe('Konstanz');
  });

  it('eigene Eingabe geht vor und kann ein Feld bewusst leeren', () => {
    const card = mergeRecords(
      {
        a: record('google', { firstName: 'Clara', fax: '0123', city: 'Konstanz' }),
        m: record(MANUAL_SOURCE_ID, { city: 'Lindau', fax: '' }),
      },
      sources
    );
    expect(card).toEqual({ firstName: 'Clara', city: 'Lindau' });
  });

  it('bei gleichem Rang gilt der jüngere Datensatz', () => {
    const same = { a: { ...sources.google, id: 'a' }, b: { ...sources.google, id: 'b' } };
    const card = mergeRecords(
      { a: record('a', { city: 'Alt' }, '2025-01-01T00:00:00.000Z'), b: record('b', { city: 'Neu' }, '2026-01-01T00:00:00.000Z') },
      same
    );
    expect(card.city).toBe('Neu');
  });

  it('hält von einer Bearbeitung nur fest, was von den Importen abweicht', () => {
    const records = { a: record('google', { firstName: 'Clara', city: 'Konstanz', fax: '0123' }) };
    expect(manualOverrides({ firstName: 'Clara', city: 'Konstanz', fax: '0123' }, records, sources)).toBeNull();
    expect(manualOverrides({ firstName: 'Clara', city: 'Lindau' }, records, sources)).toEqual({ city: 'Lindau', fax: '' });
  });
});

describe('Schlüssel für den Abgleich', () => {
  it('bringt Telefonnummern in eine Schreibweise', () => {
    expect(normalizePhone('0160 123 45 67')).toBe('+491601234567');
    expect(normalizePhone('+49 (0) 160 / 1234567')).toBe('+491601234567');
    expect(normalizePhone('0049 160 1234567')).toBe('+491601234567');
    expect(normalizePhone('0041 44 123 45 67')).toBe('+41441234567');
    expect(normalizePhone('110')).toBe('');
  });

  it('vergleicht E-Mail und Profiladressen ohne Groß- und Kleinschreibung', () => {
    expect(normalizeEmail(' Clara@Example.ORG ')).toBe('clara@example.org');
    expect(normalizeEmail('kein-at')).toBe('');
    expect(normalizeProfile('https://www.linkedin.com/in/Clara-Sommer/?utm=1')).toBe('linkedin.com/in/clara-sommer');
    expect(normalizeProfile('linkedin')).toBe('');
  });

  it('ignoriert Titel und Akzente im Namen', () => {
    expect(nameKey({ titlePrefix: 'Dr.', firstName: 'René', lastName: 'Müller' })).toBe(nameKey({ firstName: 'rene', lastName: 'MULLER' }));
    expect(nameKey({ firstName: 'Clara' })).toBe('');
  });
});

function local(id: string, card: Connection['remoteCard'], records?: Connection['records']): Connection {
  return { id, kind: 'local', peerPubKey: '', allowedFields: [], storeRemoteCard: true, status: 'offline', remoteCard: card, records };
}

describe('Import planen', () => {
  const clara: IncomingContact = { card: { firstName: 'Clara', lastName: 'Sommer', emailPrivate: 'clara@example.org', city: 'Konstanz' } };

  it('legt Unbekannte neu an', () => {
    const plan = planImport({}, 'file:a', [clara]);
    expect(plan[0].action).toBe('new');
    expect(plan[0].externalId).toBe(fallbackExternalId(clara));
  });

  it('erkennt denselben Kontakt derselben Quelle wieder', () => {
    const externalId = fallbackExternalId(clara);
    const existing = local('c1', clara.card, {
      [`file:a::${externalId}`]: { sourceId: 'file:a', externalId, importedAt: 'x', card: clara.card },
    });
    const plan = planImport({ c1: existing }, 'file:a', [{ card: { ...clara.card, city: 'Lindau' } }]);
    expect(plan[0]).toMatchObject({ action: 'update', targetId: 'c1' });
  });

  it('führt bei gleicher E-Mail oder Telefonnummer sicher zusammen', () => {
    const connections = { c1: local('c1', { firstName: 'C.', lastName: 'Sommer', emailWork: 'CLARA@example.org', phoneMobile: '0160 1234567' }) };
    expect(planImport(connections, 'g', [clara])[0]).toMatchObject({ action: 'merge', targetId: 'c1', reason: 'email' });
    const byPhone = planImport(connections, 'g', [{ card: { firstName: 'Clara', phoneWork: '+49 160 1234567' } }]);
    expect(byPhone[0]).toMatchObject({ action: 'merge', targetId: 'c1', reason: 'phone' });
  });

  it('findet Treffer auch über weitere Angaben einer Quelle', () => {
    const connections = {
      c1: local('c1', { firstName: 'Clara' }, {
        k: { sourceId: 'g', externalId: '1', importedAt: 'x', card: { firstName: 'Clara' }, extra: { emails: ['dritte@example.org'] } },
      }),
    };
    const plan = planImport(connections, 'file:b', [{ card: { firstName: 'Clara S.', emailPrivate: 'dritte@example.org' } }]);
    expect(plan[0]).toMatchObject({ action: 'merge', targetId: 'c1' });
  });

  it('gleicher Name plus Ort ist nur ein unsicherer Treffer, gleicher Name allein keiner', () => {
    const connections = { c1: local('c1', { firstName: 'Clara', lastName: 'Sommer', city: 'Konstanz' }) };
    const maybe = planImport(connections, 'g', [{ card: { firstName: 'Clara', lastName: 'Sommer', city: 'konstanz', phoneMobile: '0170 5555555' } }]);
    expect(maybe[0]).toMatchObject({ action: 'maybe', targetId: 'c1', reason: 'name' });
    const none = planImport(connections, 'g', [{ card: { firstName: 'Clara', lastName: 'Sommer', city: 'Hamburg' } }]);
    expect(none[0].action).toBe('new');
  });

  it('eine Nummer, die sich viele teilen, führt niemanden automatisch zusammen', () => {
    const central = '089 1234560';
    const connections = {
      a: local('a', { firstName: 'Anna', lastName: 'Eins', phoneWork: central }),
      b: local('b', { firstName: 'Bernd', lastName: 'Zwei', phoneWork: central }),
      c: local('c', { firstName: 'Carl', lastName: 'Drei', phoneWork: central }),
    };
    const plan = planImport(connections, 'g', [{ card: { firstName: 'Dora', lastName: 'Vier', phoneWork: central } }]);
    expect(plan[0]).toMatchObject({ action: 'maybe', reason: 'shared' });
  });

  it('erkennt doppelte Einträge innerhalb desselben Imports', () => {
    const plan = planImport({}, 'file:a', [clara, { card: { firstName: 'Clara', emailWork: 'clara@example.org' } }]);
    expect(plan[0].action).toBe('new');
    expect(plan[1]).toMatchObject({ action: 'merge', targetId: 'new:0' });
    expect(summarizePlan(plan)).toEqual({ fresh: 1, updates: 0, merges: 1, maybes: 0 });
  });

  it('vollständig gleiche Angaben gelten als derselbe Kontakt, auch ohne E-Mail und Telefon', () => {
    const card = { firstName: 'Emil', lastName: 'Herbst' };
    const connections = { c1: local('c1', card, { k: { sourceId: 'legacy', externalId: 'c1', importedAt: 'x', card } }) };
    expect(planImport(connections, 'file:neu', [{ card }])[0]).toMatchObject({ action: 'merge', targetId: 'c1', reason: 'same' });
  });
});

describe('vCard', () => {
  it('liest Kennung und weitere Nummern und Adressen', () => {
    const [contact] = parseVCards(
      [
        'BEGIN:VCARD', 'VERSION:3.0', 'UID:abc-123', 'N:Sommer;Clara;;;',
        'EMAIL:a@example.org', 'EMAIL:b@example.org', 'EMAIL:c@example.org',
        'TEL:0160 1', 'TEL:0160 2', 'TEL:0160 3', 'END:VCARD',
      ].join('\r\n')
    );
    expect(contact.externalId).toBe('abc-123');
    expect(contact.card.emailPrivate).toBe('a@example.org');
    expect(contact.extra).toEqual({ emails: ['c@example.org'], phones: ['0160 3'] });
  });
});

describe('Umstellung auf Schema 2.1', () => {
  it('gibt früheren Importen einen Datensatz und lässt die Karte unverändert', () => {
    const doc: any = {
      schemaVersion: '2.0.0',
      myCard: { id: 'x', updatedAt: 'x' },
      connections: {
        l1: { id: 'l1', kind: 'local', createdAt: '2026-05-01T00:00:00.000Z', remoteCard: { firstName: 'Emil', city: 'Hamburg' } },
        k1: { id: 'k1', kind: 'linked', remoteCard: { firstName: 'Anna' } },
      },
      tags: {},
      activity: [],
      knownPeers: [],
    };
    expect(needsMigration(doc)).toBe(true);
    migrateState(doc);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.connections.l1.remoteCard).toEqual({ firstName: 'Emil', city: 'Hamburg' });
    expect(Object.values(doc.connections.l1.records)).toEqual([
      { sourceId: LEGACY_SOURCE_ID, externalId: 'l1', importedAt: '2026-05-01T00:00:00.000Z', card: { firstName: 'Emil', city: 'Hamburg' } },
    ]);
    expect(doc.connections.k1.records).toBeUndefined();
    expect(doc.sources[LEGACY_SOURCE_ID].kind).toBe('legacy');
    expect(needsMigration(doc)).toBe(false);

    const before = JSON.stringify(doc);
    migrateState(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('Import im Speicher', () => {
  let store: AutomergeStore;
  const file = { id: 'file:kontakte.vcf', kind: 'file' as const, name: 'kontakte.vcf' };
  const contacts: IncomingContact[] = [
    { card: { firstName: 'Clara', lastName: 'Sommer', emailPrivate: 'clara@example.org', city: 'Konstanz' }, notes: 'Segelt gern' },
    { card: { firstName: 'Dirk', lastName: 'Winter', organization: 'Eis AG' } },
  ];

  const run = (source: typeof file | { id: string; kind: 'google'; name: string }, incoming: IncomingContact[], options = {}) => {
    const plan = planImport(store.getDoc().connections, source.id, incoming);
    return store.applyImport(
      source,
      plan.map((item) => ({ index: item.index, contact: item.contact, externalId: item.externalId, targetId: item.action === 'maybe' ? undefined : item.targetId })),
      options
    );
  };
  const all = () => Object.values(store.getDoc().connections);

  beforeEach(() => {
    store = new AutomergeStore();
  });

  it('dieselbe Datei zweimal einlesen verdoppelt nichts', async () => {
    expect(await run(file, contacts)).toMatchObject({ created: 2, updated: 0, merged: 0 });
    expect(await run(file, contacts)).toMatchObject({ created: 0, updated: 2, merged: 0 });
    expect(all()).toHaveLength(2);
    expect(all().find((c) => c.remoteCard?.firstName === 'Clara')?.private?.notes).toBe('Segelt gern');
  });

  it('ein erneuter Import aktualisiert geänderte Angaben derselben Quelle', async () => {
    await run(file, [{ card: { firstName: 'Clara', lastName: 'Sommer', city: 'Konstanz' }, externalId: 'uid-1' }]);
    await run(file, [{ card: { firstName: 'Clara', lastName: 'Sommer', city: 'Lindau' }, externalId: 'uid-1' }]);
    expect(all()).toHaveLength(1);
    expect(all()[0].remoteCard?.city).toBe('Lindau');
  });

  it('zweite Quelle ergänzt denselben Kontakt; die Frage nach der führenden Quelle entscheidet bei Abweichungen', async () => {
    await run(file, contacts);
    const google = { id: 'google:x', kind: 'google' as const, name: 'Google' };
    const fromGoogle: IncomingContact[] = [
      { card: { firstName: 'Clara', lastName: 'Sommer', emailWork: 'clara@example.org', city: 'Lindau', phoneMobile: '0160 1234567' }, externalId: 'people/1' },
    ];

    expect(await run(google, fromGoogle, { leading: false })).toMatchObject({ created: 0, merged: 1 });
    let clara = all().find((c) => c.remoteCard?.firstName === 'Clara')!;
    expect(all()).toHaveLength(2);
    expect(clara.remoteCard?.city).toBe('Konstanz');
    expect(clara.remoteCard?.phoneMobile).toBe('0160 1234567');
    expect(Object.keys(clara.records ?? {})).toHaveLength(2);

    await run(google, fromGoogle, { leading: true });
    clara = all().find((c) => c.remoteCard?.firstName === 'Clara')!;
    expect(clara.remoteCard?.city).toBe('Lindau');
    expect(Object.keys(clara.records ?? {})).toHaveLength(2);
  });

  it('eigene Änderungen überstehen einen erneuten Import, andere Felder bleiben aktuell', async () => {
    await run(file, [{ card: { firstName: 'Clara', lastName: 'Sommer', city: 'Konstanz', fax: '0123' }, externalId: 'uid-1' }]);
    const id = all()[0].id;
    await store.editLocalCard(id, { firstName: 'Clara', lastName: 'Sommer', city: 'Meersburg', fax: '0123' });
    expect(store.getDoc().connections[id].remoteCard?.city).toBe('Meersburg');

    await run(file, [{ card: { firstName: 'Clara', lastName: 'Sommer', city: 'Lindau', fax: '0999' }, externalId: 'uid-1' }]);
    const card = store.getDoc().connections[id].remoteCard;
    expect(card?.city).toBe('Meersburg');
    expect(card?.fax).toBe('0999');
  });

  it('beim Verbinden bleiben die importierten Angaben als Datensätze erhalten', async () => {
    await run(file, contacts);
    const localId = all().find((c) => c.remoteCard?.firstName === 'Clara')!.id;
    await store.addConnection('LINK-1', 'key', ['firstName']);
    await store.mergeLocalIntoLinked(localId, 'LINK-1');

    const linked = store.getDoc().connections['LINK-1'];
    expect(store.getDoc().connections[localId]).toBeUndefined();
    expect(linked.private?.notes).toBe('Segelt gern');
    expect(Object.values(linked.records ?? {})[0].card).toMatchObject({ emailPrivate: 'clara@example.org', city: 'Konstanz' });
    // Die Karte eines verbundenen Kontakts kommt nur von der Person selbst
    expect(linked.remoteCard).toBeUndefined();
  });
});

describe('Auswahl aus dem Telefonbuch', () => {
  it('ordnet Name, Adressen und Nummern zu und behält weitere Angaben', () => {
    const [clara, emil, ...rest] = fromPickedContacts([
      {
        name: ['Dr. Clara Sommer'],
        email: ['clara@example.org', 'c.sommer@firma.example', 'dritte@example.org'],
        tel: ['0160 1', '07531 2', '07531 3'],
        address: [{ addressLine: ['Seeweg 3'], city: 'Konstanz', postalCode: '78462', country: 'DE' }],
      },
      { name: ['Herbst, Emil'], tel: ['0171 999'] },
      { name: [], email: [], tel: [] },
      { name: ['   '] },
    ]);
    expect(clara.card).toEqual({
      firstName: 'Dr. Clara', lastName: 'Sommer',
      emailPrivate: 'clara@example.org', emailWork: 'c.sommer@firma.example',
      phoneMobile: '0160 1', phoneWork: '07531 2',
      street: 'Seeweg', houseNumber: '3', city: 'Konstanz', postalCode: '78462', country: 'DE',
    });
    expect(clara.extra).toEqual({ emails: ['dritte@example.org'], phones: ['07531 3'] });
    expect(emil.card).toEqual({ firstName: 'Emil', lastName: 'Herbst', phoneMobile: '0171 999' });
    expect(rest).toHaveLength(0);
  });

  it('verkraftet unerwartete Werte', () => {
    expect(fromPickedContacts(undefined as never)).toEqual([]);
    expect(fromPickedContacts([{ name: [42 as never], tel: ['0170 1'], address: ['x' as never] }])).toEqual([{ card: { phoneMobile: '0170 1' } }]);
  });
});
