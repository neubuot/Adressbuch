import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../store/db', () => ({
  db: { documents: { get: async () => undefined, put: async () => undefined } },
}));

import { AutomergeStore } from '../store/automerge-store';
import { openVault, sealVault } from '../trust/vault';
import { newestVault, recoveryProgress, type RecoveryRecord } from '../trust/custody';

describe('Vertraute festlegen', () => {
  let store: AutomergeStore;

  beforeEach(async () => {
    store = new AutomergeStore();
    await store.updateMyCard({ firstName: 'Otto', lastName: 'Vermittler' });
    for (const id of ['ANNA', 'BERT', 'CARL']) await store.addConnection(id, `key-${id}`, ['firstName']);
    await store.change('lokaler Eintrag', (doc) => {
      doc.connections.LOKAL = { id: 'LOKAL', kind: 'local', peerPubKey: '', allowedFields: [], storeRemoteCard: true, status: 'offline' };
    });
  });

  it('verteilt je einen Teil; genug Teile öffnen den Tresor, einer allein nicht', async () => {
    expect(await store.setTrust(['ANNA', 'BERT', 'CARL'], 2)).toBe(true);
    const trust = store.getDoc().trust!;
    expect(trust.threshold).toBe(2);
    expect(Object.keys(trust.members).sort()).toEqual(['ANNA', 'BERT', 'CARL']);
    const shares = Object.values(trust.members).map((member) => member.share);
    expect(new Set(shares).size).toBe(3);

    const vault = await sealVault({ snapshot: store.export(), keyPair: { publicKey: 'p', privateKey: 'q' } }, trust.key);
    const opened = await openVault(vault, [trust.members.CARL.share, trust.members.ANNA.share]);
    expect(opened.keyPair).toEqual({ publicKey: 'p', privateKey: 'q' });

    // Der wiederhergestellte Stand ist ein vollständiges Adressbuch
    const restored = new AutomergeStore();
    await restored.replaceWith(opened.snapshot);
    expect(restored.getDoc().myCard.firstName).toBe('Otto');
    expect(Object.keys(restored.getDoc().connections)).toHaveLength(4);

    await expect(openVault(vault, [trust.members.ANNA.share])).rejects.toThrow();
  });

  it('lehnt zu wenige, nicht verbundene und unpassende Angaben ab', async () => {
    expect(await store.setTrust(['ANNA'], 2)).toBe(false);
    expect(await store.setTrust(['ANNA', 'LOKAL'], 2)).toBe(false);
    expect(await store.setTrust(['ANNA', 'NIEMAND'], 2)).toBe(false);
    expect(await store.setTrust(['ANNA', 'BERT'], 3)).toBe(false);
    expect(await store.setTrust(['ANNA', 'BERT'], 1)).toBe(false);
    expect(await store.setTrust(['ANNA', 'ANNA', 'BERT'], 2)).toBe(true);
    expect(Object.keys(store.getDoc().trust!.members)).toHaveLength(2);
  });

  it('erzeugt bei jeder Änderung einen neuen Schlüssel und bittet Ausgeschiedene zu löschen', async () => {
    await store.setTrust(['ANNA', 'BERT', 'CARL'], 2);
    const first = store.getDoc().trust!;
    const oldShares = [first.members.ANNA.share, first.members.BERT.share];
    await store.markDeposited('ANNA', first.setId, '2026-12-01T10:00:00.000Z');
    expect(store.getDoc().trust!.members.ANNA.depositedAt).toBe('2026-12-01T10:00:00.000Z');

    await store.setTrust(['ANNA', 'BERT'], 2);
    const second = store.getDoc().trust!;
    expect(second.setId).not.toBe(first.setId);
    expect(second.key).not.toBe(first.key);
    expect(second.members.ANNA.depositedAt).toBeUndefined();
    expect([...(store.getDoc().trustDropped ?? [])]).toEqual(['CARL']);

    // Die alten Teile öffnen den neuen Tresor nicht
    const vault = await sealVault({ snapshot: store.export(), keyPair: null }, second.key);
    await expect(openVault(vault, oldShares)).rejects.toThrow();

    // Eine Bestätigung für die alte Einrichtung zählt nicht mehr
    await store.markDeposited('ANNA', first.setId, '2026-12-02T10:00:00.000Z');
    expect(store.getDoc().trust!.members.ANNA.depositedAt).toBeUndefined();

    await store.markDropDelivered('CARL');
    expect([...(store.getDoc().trustDropped ?? [])]).toEqual([]);

    // Wer wieder dazukommt, muss nichts mehr löschen
    await store.setTrust(['ANNA', 'BERT'], 2);
    await store.setTrust(['ANNA', 'CARL'], 2);
    expect([...(store.getDoc().trustDropped ?? [])]).toEqual(['BERT']);
    await store.setTrust(['ANNA', 'BERT'], 2);
    expect([...(store.getDoc().trustDropped ?? [])]).toEqual(['CARL']);
  });

  it('hebt die Einrichtung auf, hinterlegt auf Wunsch neu und räumt mit entfernten Kontakten auf', async () => {
    await store.setTrust(['ANNA', 'BERT', 'CARL'], 2);
    const setId = store.getDoc().trust!.setId;
    await store.markDeposited('ANNA', setId, '2026-12-01T10:00:00.000Z');
    await store.requestRedeposit();
    expect(store.getDoc().trust!.members.ANNA.depositedAt).toBeUndefined();

    await store.removeConnection('CARL');
    expect(Object.keys(store.getDoc().trust!.members).sort()).toEqual(['ANNA', 'BERT']);

    await store.clearTrust();
    expect(store.getDoc().trust).toBeUndefined();
    expect([...(store.getDoc().trustDropped ?? [])].sort()).toEqual(['ANNA', 'BERT']);
  });

  it('vermerkt am Kontakt, dass dieses Gerät etwas für ihn aufbewahrt', async () => {
    await store.setCustodyMarker('ANNA', { setId: 'satz-0001', version: '2026-12-01T10:00:00.000Z' });
    expect({ ...store.getDoc().connections.ANNA.custody }).toEqual({ setId: 'satz-0001', version: '2026-12-01T10:00:00.000Z' });
    await store.setCustodyMarker('ANNA', null);
    expect(store.getDoc().connections.ANNA.custody).toBeUndefined();
    await store.setCustodyMarker('NIEMAND', { setId: 'x', version: 'y' });
  });
});

describe('Erhaltene Teile auswerten', () => {
  const piece = (setId: string, share: string, version: string, threshold = 2): RecoveryRecord => ({
    id: `${setId}|${share}`,
    setId,
    threshold,
    share,
    version,
    vault: `tresor-${setId}-${version}`,
    helperName: share,
    receivedAt: version,
  });

  it('meldet den Fortschritt und wählt den neuesten Tresor', () => {
    expect(recoveryProgress([])).toBeNull();

    const one = recoveryProgress([piece('a', 's1', '2026-12-01')]);
    expect(one).toMatchObject({ setId: 'a', threshold: 2, complete: false });

    const two = recoveryProgress([piece('a', 's1', '2026-12-01'), piece('a', 's2', '2026-12-03')])!;
    expect(two.complete).toBe(true);
    expect(newestVault(two.pieces)).toBe('tresor-a-2026-12-03');
  });

  it('mischt keine Teile verschiedener Einrichtungen', () => {
    // Ein Teil der alten und einer der neuen Einrichtung genügen zusammen nicht
    const mixed = recoveryProgress([piece('alt', 's1', '2026-11-01'), piece('neu', 's2', '2026-12-01')])!;
    expect(mixed.complete).toBe(false);
    expect(mixed.pieces).toHaveLength(1);

    // Ist eine Einrichtung vollständig, zählt sie, auch wenn eine andere neuer ist
    const done = recoveryProgress([
      piece('alt', 's1', '2026-11-01'),
      piece('alt', 's2', '2026-11-02'),
      piece('neu', 's3', '2026-12-01'),
    ])!;
    expect(done.setId).toBe('alt');
    expect(done.complete).toBe(true);

    const three = recoveryProgress([piece('a', 's1', '2026-12-01', 3), piece('a', 's2', '2026-12-01', 3)])!;
    expect(three.complete).toBe(false);
    expect(three.threshold).toBe(3);
  });
});
