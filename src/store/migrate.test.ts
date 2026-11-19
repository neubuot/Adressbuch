import { describe, it, expect } from 'vitest';
import * as Automerge from '@automerge/automerge';
import { migrateState, needsMigration, isFromNewerApp, splitStreet, normalizeCountry } from './migrate';
import { ADDRESS_CARD_FIELDS, SCHEMA_VERSION } from '../types';

function v1State() {
  return {
    myCard: {
      id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      firstName: 'Max',
      lastName: 'Mustermann',
      street: 'Musterstraße 12a',
      postalCode: '12345',
      city: 'Berlin',
      country: 'Deutschland',
      email: 'max@example.org',
      phone: '+49 170 1234567',
      birthday: '1990-01-02',
      organization: 'Musterfirma',
      custom: {},
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    connections: {
      'AAAA-BBBB-CCCC-DDDD': {
        id: 'AAAA-BBBB-CCCC-DDDD',
        label: 'Anna',
        peerPubKey: 'key',
        allowedFields: ['firstName', 'lastName', 'email', 'phone'],
        storeRemoteCard: true,
        status: 'online',
        createdAt: '2024-02-02T00:00:00.000Z',
        lastSyncAt: '2024-03-03T00:00:00.000Z',
        remoteCard: { firstName: 'Anna', email: 'anna@example.org', phone: '0151' },
        tagIds: ['t1'],
      },
    },
    tags: { t1: { id: 't1', name: 'Familie', color: '#f00', createdAt: '2024-01-01T00:00:00.000Z' } },
    knownPeers: [],
  };
}

describe('Migration Schema 1 -> 2', () => {
  it('erhält alle vorhandenen Angaben der eigenen Karte', () => {
    const doc: any = v1State();
    expect(needsMigration(doc)).toBe(true);
    migrateState(doc);

    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.myCard.firstName).toBe('Max');
    expect(doc.myCard.lastName).toBe('Mustermann');
    expect(doc.myCard.emailPrivate).toBe('max@example.org');
    expect(doc.myCard.phoneMobile).toBe('+49 170 1234567');
    expect(doc.myCard.street).toBe('Musterstraße');
    expect(doc.myCard.houseNumber).toBe('12a');
    expect(doc.myCard.country).toBe('DE');
    expect(doc.myCard.birthday).toBe('1990-01-02');
    expect(doc.myCard.organization).toBe('Musterfirma');
    expect('email' in doc.myCard).toBe(false);
    expect('phone' in doc.myCard).toBe(false);
    expect(doc.myCard.id).toMatch(/^[0-9a-f-]{36}$/);
    for (const field of ADDRESS_CARD_FIELDS) {
      expect(typeof doc.myCard[field]).toBe('string');
    }
  });

  it('übernimmt Freigaben, empfangene Karten, Tags und Zeitstempel', () => {
    const doc: any = v1State();
    migrateState(doc);
    const connection = doc.connections['AAAA-BBBB-CCCC-DDDD'];

    expect(connection.allowedFields).toEqual(['firstName', 'lastName', 'emailPrivate', 'phoneMobile']);
    expect(connection.remoteCard).toEqual({ firstName: 'Anna', emailPrivate: 'anna@example.org', phoneMobile: '0151' });
    expect(connection.label).toBe('Anna');
    expect(connection.tagIds).toEqual(['t1']);
    expect(connection.createdAt).toBe('2024-02-02T00:00:00.000Z');
    expect(connection.lastSyncAt).toBe('2024-03-03T00:00:00.000Z');
    expect(connection.kind).toBe('linked');
    expect(doc.tags.t1.name).toBe('Familie');
    expect(doc.activity).toEqual([]);
  });

  it('ist wiederholbar und danach nicht mehr nötig', () => {
    const doc: any = v1State();
    migrateState(doc);
    const first = JSON.stringify(doc);
    expect(needsMigration(doc)).toBe(false);
    migrateState(doc);
    expect(JSON.stringify(doc)).toBe(first);
  });

  it('funktioniert auf einem Automerge-Dokument', () => {
    let doc = Automerge.from<any>(v1State());
    doc = Automerge.change(doc, (draft) => migrateState(draft));
    const reloaded = Automerge.load<any>(Automerge.save(doc));
    expect(reloaded.myCard.emailPrivate).toBe('max@example.org');
    expect(reloaded.myCard.houseNumber).toBe('12a');
    expect(reloaded.connections['AAAA-BBBB-CCCC-DDDD'].allowedFields).toContain('phoneMobile');
    expect(needsMigration(reloaded)).toBe(false);
  });

  it('fasst Daten einer neueren App-Version nicht an', () => {
    const doc: any = { ...v1State(), schemaVersion: '3.0.0' };
    expect(isFromNewerApp(doc)).toBe(true);
    expect(needsMigration(doc)).toBe(false);
  });
});

describe('Hilfsfunktionen', () => {
  it('trennt Straße und Hausnummer nur bei eindeutiger Angabe', () => {
    expect(splitStreet('Hauptstr. 5')).toEqual({ street: 'Hauptstr.', houseNumber: '5' });
    expect(splitStreet('Am Markt 12-14')).toEqual({ street: 'Am Markt', houseNumber: '12-14' });
    expect(splitStreet('Postfach')).toBeNull();
    expect(splitStreet('Straße des 17. Juni')).toBeNull();
  });

  it('wandelt bekannte Ländernamen in ISO-Kürzel', () => {
    expect(normalizeCountry('Österreich')).toBe('AT');
    expect(normalizeCountry('Frankreich')).toBe('Frankreich');
    expect(normalizeCountry('CH')).toBe('CH');
  });
});
