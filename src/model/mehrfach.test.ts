import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../store/db', () => ({
  db: { documents: { get: async () => undefined, put: async () => undefined } },
}));

import { AutomergeStore } from '../store/automerge-store';

describe('Mehrfachauswahl: mehrere Kontakte auf einmal', () => {
  let store: AutomergeStore;

  beforeEach(async () => {
    store = new AutomergeStore();
    await store.addConnection('ANNA', 'key-anna', ['firstName']);
    await store.addConnection('BERT', 'key-bert', ['firstName']);
    await store.addConnection('CARL', 'key-carl', ['firstName']);
    await store.change('lokale Einträge', (doc) => {
      for (const id of ['L1', 'L2', 'L3']) {
        doc.connections[id] = { id, kind: 'local', peerPubKey: '', allowedFields: [], storeRemoteCard: true, status: 'offline' };
      }
    });
    await store.addTag('tag-a', 'Verein', '#336699');
  });

  it('löscht mehrere Kontakte in einem Schritt und zählt nur vorhandene', async () => {
    const removed = await store.removeConnections(['L1', 'L2', 'L2', 'GIBTSNICHT']);
    expect(removed).toBe(2);
    expect(Object.keys(store.getDoc().connections).sort()).toEqual(['ANNA', 'BERT', 'CARL', 'L3']);
    expect(await store.removeConnections([])).toBe(0);
    expect(await store.removeConnections(['GIBTSNICHT'])).toBe(0);
  });

  it('räumt Vorstellungen und Vertraute der gelöschten Kontakte auf', async () => {
    expect(await store.addIntro('ANNA', 'BERT')).toBeTruthy();
    expect(await store.addIntro('BERT', 'CARL')).toBeTruthy();
    await store.setTrust(['ANNA', 'BERT', 'CARL'], 2);
    expect(Object.keys(store.getDoc().trust?.members ?? {})).toHaveLength(3);

    await store.removeConnections(['ANNA', 'L1']);
    const doc = store.getDoc();
    const intros = Object.values(doc.introsOut ?? {});
    expect(intros).toHaveLength(1);
    expect([intros[0].aId, intros[0].bId].sort()).toEqual(['BERT', 'CARL']);
    expect(Object.keys(doc.trust?.members ?? {}).sort()).toEqual(['BERT', 'CARL']);
  });

  it('das Entfernen eines einzelnen Kontakts arbeitet wie bisher', async () => {
    await store.removeConnection('BERT');
    expect(store.getDoc().connections.BERT).toBeUndefined();
    expect(Object.keys(store.getDoc().connections)).toHaveLength(5);
  });

  it('vergibt und entfernt einen Tag bei mehreren Kontakten', async () => {
    await store.addTagsToConnection('L1', ['tag-a']);
    expect(await store.addTagToConnections(['L1', 'L2', 'ANNA', 'GIBTSNICHT'], 'tag-a')).toBe(2);
    expect(store.getDoc().connections.L1.tagIds).toEqual(['tag-a']);
    expect(store.getDoc().connections.L2.tagIds).toEqual(['tag-a']);
    expect(store.getDoc().connections.ANNA.tagIds).toEqual(['tag-a']);
    expect(store.getDoc().connections.L3.tagIds ?? []).toEqual([]);
    // Nochmal vergeben ändert nichts
    expect(await store.addTagToConnections(['L1', 'L2'], 'tag-a')).toBe(0);
    // Einen Tag, den es nicht gibt, vergibt niemand
    expect(await store.addTagToConnections(['L3'], 'tag-fehlt')).toBe(0);

    expect(await store.removeTagFromConnections(['L1', 'L3', 'ANNA'], 'tag-a')).toBe(2);
    expect(store.getDoc().connections.L1.tagIds).toEqual([]);
    expect(store.getDoc().connections.L2.tagIds).toEqual(['tag-a']);
  });
});
