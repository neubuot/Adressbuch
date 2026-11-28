import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../store/db', () => ({
  db: { documents: { get: async () => undefined, put: async () => undefined } },
}));

import { AutomergeStore } from '../store/automerge-store';
import {
  activeLimit,
  effectiveFields,
  keepFields,
  projectFields,
  sanitizeLimit,
  shareState,
} from '../utils/policy';
import { stableHash } from '../utils/hash';
import { endOfDayIso } from './contact';

const NOW = Date.parse('2026-12-01T12:00:00.000Z');
const LATER = '2026-12-15T22:59:59.000Z';
const EARLIER = '2026-11-20T22:59:59.000Z';

describe('Befristete Freigabe: Regeln', () => {
  it('gibt vor Ablauf alles Freigegebene, danach nur die Felder für danach', () => {
    const connection = { allowedFields: ['firstName', 'phoneMobile'], shareUntil: LATER, fieldsAfter: ['firstName'] };
    expect(effectiveFields(connection, NOW)).toEqual(['firstName', 'phoneMobile']);
    expect(effectiveFields({ ...connection, shareUntil: EARLIER }, NOW)).toEqual(['firstName']);
    expect(effectiveFields({ allowedFields: ['city'], shareUntil: EARLIER }, NOW)).toEqual([]);
    expect(effectiveFields({ allowedFields: ['city'] }, NOW)).toEqual(['city']);
  });

  it('kennt eine Befristung nur, solange sie läuft', () => {
    expect(activeLimit({ shareUntil: LATER, fieldsAfter: ['lastName', 'firstName'] }, NOW)).toEqual({
      until: LATER,
      keep: ['firstName', 'lastName'],
    });
    expect(activeLimit({ shareUntil: EARLIER, fieldsAfter: [] }, NOW)).toBeNull();
    expect(activeLimit({ shareUntil: 'kein Datum' }, NOW)).toBeNull();
    expect(activeLimit({}, NOW)).toBeNull();
  });

  it('nimmt von der Gegenseite nur brauchbare Befristungen an', () => {
    expect(sanitizeLimit(LATER, ['firstName', 'unbekannt', 7, 'firstName'])).toEqual({ until: LATER, keep: ['firstName'] });
    expect(sanitizeLimit(LATER, undefined)).toEqual({ until: LATER, keep: [] });
    expect(sanitizeLimit('irgendwann', [])).toBeNull();
    expect(sanitizeLimit(undefined, ['firstName'])).toBeNull();
    expect(sanitizeLimit('x'.repeat(50), [])).toBeNull();
  });

  it('vergleicht ohne Befristung wie bisher und erkennt eine geänderte Frist', () => {
    const fields = { firstName: 'Anna', phoneMobile: '0151' };
    expect(stableHash(shareState(fields, null))).toBe(stableHash(fields));
    const a = stableHash(shareState(fields, { until: LATER, keep: ['firstName'] }));
    const b = stableHash(shareState(fields, { until: LATER, keep: [] }));
    expect(a).not.toBe(stableHash(fields));
    expect(a).not.toBe(b);
  });

  it('behält von einer Karte nur die genannten Felder', () => {
    expect(keepFields({ firstName: 'Anna', lastName: 'Muster', city: 'Berlin' }, ['firstName', 'lastName'])).toEqual({
      firstName: 'Anna',
      lastName: 'Muster',
    });
    expect(keepFields({ firstName: 'Anna' }, [])).toEqual({});
  });

  it('rechnet ein Datum zum Ende dieses Tages um', () => {
    const iso = endOfDayIso('2026-12-24');
    const date = new Date(iso);
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 11, 24, 23, 59]);
    expect(endOfDayIso('24.12.2026')).toBe('');
    expect(endOfDayIso('')).toBe('');
  });
});

describe('Befristete Freigabe: Speicher', () => {
  let store: AutomergeStore;

  beforeEach(async () => {
    store = new AutomergeStore();
    await store.updateMyCard({ firstName: 'Anna', lastName: 'Muster', phoneMobile: '0151 1', street: 'Seeweg' });
    await store.addConnection('BERT', 'schluessel', ['firstName', 'lastName', 'phoneMobile', 'street']);
  });

  it('stellt die eigene Freigabe nach Ablauf auf die Felder für danach um', async () => {
    await store.setShare('BERT', ['firstName', 'lastName', 'phoneMobile', 'street'], {
      until: LATER,
      keep: ['firstName', 'lastName', 'city'],
    });
    let bert = store.getDoc().connections.BERT;
    expect(bert.shareUntil).toBe(LATER);
    // Für danach bleibt nur, was auch vorher freigegeben war
    expect([...(bert.fieldsAfter ?? [])]).toEqual(['firstName', 'lastName']);

    expect(await store.expireShares(NOW)).toBe(0);
    expect(store.getDoc().connections.BERT.allowedFields).toHaveLength(4);

    expect(await store.expireShares(Date.parse(LATER) + 1000)).toBe(1);
    bert = store.getDoc().connections.BERT;
    expect([...bert.allowedFields]).toEqual(['firstName', 'lastName']);
    expect(bert.shareUntil).toBeUndefined();
    expect(bert.fieldsAfter).toBeUndefined();
    expect(projectFields(store.getDoc().myCard, bert.allowedFields)).toEqual({ firstName: 'Anna', lastName: 'Muster' });
  });

  it('hebt eine Befristung auf, wenn die Freigabe dauerhaft gespeichert oder widerrufen wird', async () => {
    await store.setShare('BERT', ['firstName'], { until: LATER, keep: [] });
    await store.setShare('BERT', ['firstName', 'city']);
    expect(store.getDoc().connections.BERT.shareUntil).toBeUndefined();
    await store.setShare('BERT', ['firstName'], { until: LATER, keep: [] });
    await store.setShare('BERT', []);
    expect(store.getDoc().connections.BERT.shareUntil).toBeUndefined();
    expect([...store.getDoc().connections.BERT.allowedFields]).toEqual([]);
  });

  it('merkt sich die Frist einer empfangenen Karte und entfernt die Angaben nach Ablauf selbst', async () => {
    await store.applyRemoteCard(
      'BERT',
      { firstName: 'Bert', lastName: 'Beispiel', phoneMobile: '0170 2', street: 'Hafenstr.' },
      { until: LATER, keep: ['firstName', 'lastName'] }
    );
    let bert = store.getDoc().connections.BERT;
    expect(bert.remoteUntil).toBe(LATER);
    expect(bert.remoteCard?.phoneMobile).toBe('0170 2');

    expect(await store.expireShares(NOW)).toBe(0);
    expect(await store.expireShares(Date.parse(LATER) + 1000)).toBe(1);
    bert = store.getDoc().connections.BERT;
    expect({ ...bert.remoteCard }).toEqual({ firstName: 'Bert', lastName: 'Beispiel' });
    expect(bert.remoteUntil).toBeUndefined();
    expect(bert.remoteKeep).toBeUndefined();

    // Was verschwunden ist, steht in der Änderungsübersicht
    const removed = store.getDoc().activity.filter((entry) => entry.connectionId === 'BERT' && entry.newValue === '');
    expect(removed.map((entry) => entry.field).sort()).toEqual(['phoneMobile', 'street']);
  });

  it('wendet eine schon abgelaufene Frist sofort an und vergisst eine aufgehobene', async () => {
    await store.applyRemoteCard('BERT', { firstName: 'Bert', phoneMobile: '0170 2' }, { until: '2020-01-01T00:00:00.000Z', keep: ['firstName'] });
    expect({ ...store.getDoc().connections.BERT.remoteCard }).toEqual({ firstName: 'Bert' });
    expect(store.getDoc().connections.BERT.remoteUntil).toBeUndefined();

    await store.applyRemoteCard('BERT', { firstName: 'Bert', phoneMobile: '0170 2' }, { until: LATER, keep: [] });
    expect(store.getDoc().connections.BERT.remoteUntil).toBe(LATER);
    await store.applyRemoteCard('BERT', { firstName: 'Bert', phoneMobile: '0170 2' });
    expect(store.getDoc().connections.BERT.remoteUntil).toBeUndefined();
    expect(store.getDoc().connections.BERT.remoteCard?.phoneMobile).toBe('0170 2');
  });
});
