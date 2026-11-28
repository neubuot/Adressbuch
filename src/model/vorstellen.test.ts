import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../store/db', () => ({
  db: { documents: { get: async () => undefined, put: async () => undefined } },
}));

import { AutomergeStore } from '../store/automerge-store';

const DAY = 24 * 60 * 60 * 1000;

describe('Vorstellen: wer vorstellt', () => {
  let store: AutomergeStore;

  beforeEach(async () => {
    store = new AutomergeStore();
    await store.addConnection('ANNA', 'key-anna', ['firstName']);
    await store.addConnection('BERT', 'key-bert', ['firstName']);
  });

  it('legt eine Vorstellung an und erledigt sie, wenn beide sie erhalten haben', async () => {
    const id = await store.addIntro('ANNA', 'BERT');
    expect(id).toBeTruthy();
    expect(Object.keys(store.getDoc().introsOut ?? {})).toHaveLength(1);

    await store.markIntroDelivered(id!, 'ANNA');
    expect(store.getDoc().introsOut?.[id!].deliveredA).toBe(true);
    // Eine fremde Kennung ändert nichts
    await store.markIntroDelivered(id!, 'CARL');
    expect(store.getDoc().introsOut?.[id!]).toBeDefined();

    await store.markIntroDelivered(id!, 'BERT');
    expect(store.getDoc().introsOut?.[id!]).toBeUndefined();
  });

  it('lehnt doppelte, unmögliche und Vorstellungen mit nicht verbundenen Einträgen ab', async () => {
    expect(await store.addIntro('ANNA', 'ANNA')).toBeNull();
    expect(await store.addIntro('ANNA', 'NIEMAND')).toBeNull();
    expect(await store.addIntro('ANNA', 'BERT')).toBeTruthy();
    expect(await store.addIntro('BERT', 'ANNA')).toBeNull();

    await store.change('lokaler Eintrag', (doc) => {
      doc.connections.LOKAL = { id: 'LOKAL', kind: 'local', peerPubKey: '', allowedFields: [], storeRemoteCard: true, status: 'offline' };
    });
    expect(await store.addIntro('ANNA', 'LOKAL')).toBeNull();
  });

  it('nimmt eine Vorstellung zurück und räumt beim Entfernen eines Kontakts auf', async () => {
    const id = await store.addIntro('ANNA', 'BERT');
    await store.cancelIntroOut(id!);
    expect(Object.keys(store.getDoc().introsOut ?? {})).toHaveLength(0);

    await store.addIntro('ANNA', 'BERT');
    await store.removeConnection('BERT');
    expect(Object.keys(store.getDoc().introsOut ?? {})).toHaveLength(0);
  });
});

describe('Vorstellen: wer vorgestellt wird', () => {
  let store: AutomergeStore;
  const intro = { id: 'intro-0001', pubKey: 'key-bert', name: 'Bert Beispiel' };

  beforeEach(async () => {
    store = new AutomergeStore();
    await store.addConnection('OTTO', 'key-otto', ['firstName']);
    await store.applyRemoteCard('OTTO', { firstName: 'Otto', lastName: 'Vermittler' });
  });

  it('merkt sich die Vorstellung als offen und verbindet erst nach dem Annehmen', async () => {
    expect(await store.receiveIntro('OTTO', intro, 'BERT', 'ICH')).toBe(true);
    const entry = store.getDoc().introsIn?.BERT;
    expect(entry?.status).toBe('pending');
    expect(entry?.name).toBe('Bert Beispiel');

    // Ohne Zustimmung entsteht kein Kontakt
    expect(await store.completeIntro('BERT', 'key-bert')).toBe(false);
    expect(store.getDoc().connections.BERT).toBeUndefined();

    await store.acceptIntro('BERT', ['firstName', 'phoneMobile', 'unbekannt']);
    expect([...(store.getDoc().introsIn?.BERT.fields ?? [])]).toEqual(['firstName', 'phoneMobile']);

    // Ein anderer Schlüssel als der vorgestellte wird nicht angenommen
    expect(await store.completeIntro('BERT', 'key-fremd')).toBe(false);

    expect(await store.completeIntro('BERT', 'key-bert')).toBe(true);
    const bert = store.getDoc().connections.BERT;
    expect(bert.kind).toBe('linked');
    expect([...bert.allowedFields]).toEqual(['firstName', 'phoneMobile']);
    expect(bert.knownName).toBe('Bert Beispiel');
    expect(bert.private?.source).toBe('Vorgestellt von Otto Vermittler');
    expect(store.getDoc().introsIn?.BERT).toBeUndefined();
  });

  it('übergeht Vorstellungen mit sich selbst, mit bekannten Kontakten und Wiederholungen', async () => {
    expect(await store.receiveIntro('OTTO', intro, 'ICH', 'ICH')).toBe(true);
    expect(await store.receiveIntro('OTTO', { ...intro, pubKey: 'key-otto' }, 'OTTO', 'ICH')).toBe(true);
    expect(Object.keys(store.getDoc().introsIn ?? {})).toHaveLength(0);

    await store.receiveIntro('OTTO', intro, 'BERT', 'ICH');
    await store.acceptIntro('BERT', ['firstName']);
    // Dieselbe Person noch einmal vorgestellt: Die Zusage bleibt bestehen
    expect(await store.receiveIntro('OTTO', { ...intro, id: 'intro-0002' }, 'BERT', 'ICH')).toBe(true);
    expect(store.getDoc().introsIn?.BERT.status).toBe('accepted');
    expect(store.getDoc().introsIn?.BERT.id).toBe('intro-0001');
  });

  it('nimmt nichts von Unbekannten an, begrenzt die Anzahl und säubert den Namen', async () => {
    expect(await store.receiveIntro('FREMD', intro, 'BERT', 'ICH')).toBe(false);

    for (let i = 0; i < 30; i++) {
      expect(await store.receiveIntro('OTTO', { id: `intro-${i}`, pubKey: `key-${i}`, name: `Person ${i}` }, `FP${i}`, 'ICH')).toBe(true);
    }
    expect(await store.receiveIntro('OTTO', intro, 'BERT', 'ICH')).toBe(false);

    await store.dropIntro('FP0');
    expect(await store.receiveIntro('OTTO', { ...intro, name: `  Bert\n\tBeispiel ${'x'.repeat(300)}` }, 'BERT', 'ICH')).toBe(true);
    const name = store.getDoc().introsIn?.BERT.name ?? '';
    expect(name.startsWith('Bert  Beispiel')).toBe(true);
    expect(name.length).toBe(120);
  });

  it('lässt sich ablehnen und verfällt nach 30 Tagen', async () => {
    await store.receiveIntro('OTTO', intro, 'BERT', 'ICH');
    await store.dropIntro('BERT');
    expect(store.getDoc().introsIn?.BERT).toBeUndefined();

    await store.receiveIntro('OTTO', intro, 'BERT', 'ICH');
    await store.addConnection('ANNA', 'key-anna', []);
    await store.addIntro('OTTO', 'ANNA');
    await store.pruneIntros(Date.now() + 29 * DAY);
    expect(store.getDoc().introsIn?.BERT).toBeDefined();
    await store.pruneIntros(Date.now() + 31 * DAY);
    expect(store.getDoc().introsIn?.BERT).toBeUndefined();
    expect(Object.keys(store.getDoc().introsOut ?? {})).toHaveLength(0);
  });
});
