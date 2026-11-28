// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../store/db', () => ({
  db: { documents: { get: async () => undefined, put: async () => undefined } },
}));

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
});

import { AutomergeStore, store } from '../store/automerge-store';
import { generateKeyPair, createFingerprint, type KeyPair } from '../utils/crypto';
import { deriveChannels, importBoxPrivateKey, openBox, sealBox } from './seal';
import { Mailbox, setMailboxEnabled } from './mailbox';

describe('Postfach: Schlüssel und Verschlüsselung', () => {
  it('beide Seiten berechnen dieselben Fächer, je Richtung ein anderes', async () => {
    const anna = await generateKeyPair();
    const bert = await generateKeyPair();
    const a = await deriveChannels(await importBoxPrivateKey(anna.privateKey), anna.publicKey, bert.publicKey);
    const b = await deriveChannels(await importBoxPrivateKey(bert.privateKey), bert.publicKey, anna.publicKey);

    expect(a.outbound.slot).toMatch(/^[0-9a-f]{32}$/);
    expect(a.outbound.slot).toBe(b.inbound.slot);
    expect(a.inbound.slot).toBe(b.outbound.slot);
    expect(a.outbound.slot).not.toBe(a.inbound.slot);

    const sealed = await sealBox(a.outbound.key, { t: 'karte', fields: { firstName: 'Anna' } });
    expect(await openBox(b.inbound.key, sealed)).toEqual({ t: 'karte', fields: { firstName: 'Anna' } });
    // Der Schlüssel der Gegenrichtung öffnet es nicht
    expect(await openBox(b.outbound.key, sealed)).toBeNull();
  });

  it('ein Dritter kommt weder an das Fach noch an den Inhalt', async () => {
    const anna = await generateKeyPair();
    const bert = await generateKeyPair();
    const carl = await generateKeyPair();
    const a = await deriveChannels(await importBoxPrivateKey(anna.privateKey), anna.publicKey, bert.publicKey);
    const c = await deriveChannels(await importBoxPrivateKey(carl.privateKey), carl.publicKey, bert.publicKey);
    const c2 = await deriveChannels(await importBoxPrivateKey(carl.privateKey), anna.publicKey, bert.publicKey);

    const sealed = await sealBox(a.outbound.key, { geheim: true });
    for (const other of [c, c2]) {
      expect(other.outbound.slot).not.toBe(a.outbound.slot);
      expect(other.inbound.slot).not.toBe(a.outbound.slot);
      expect(await openBox(other.outbound.key, sealed)).toBeNull();
      expect(await openBox(other.inbound.key, sealed)).toBeNull();
    }
  });

  it('füllt auf volle Blöcke auf, verschlüsselt jedes Mal anders und erkennt Veränderungen', async () => {
    const anna = await generateKeyPair();
    const bert = await generateKeyPair();
    const a = await deriveChannels(await importBoxPrivateKey(anna.privateKey), anna.publicKey, bert.publicKey);

    const kurz = await sealBox(a.outbound.key, { a: 1 });
    const laenger = await sealBox(a.outbound.key, { a: 'x'.repeat(300) });
    expect(kurz.length).toBe(laenger.length);
    expect(await sealBox(a.outbound.key, { a: 1 })).not.toBe(kurz);

    const bytes = Uint8Array.from(atob(kurz), (char) => char.charCodeAt(0));
    bytes[20] ^= 1;
    const tampered = btoa(String.fromCharCode(...bytes));
    expect(await openBox(a.outbound.key, tampered)).toBeNull();
    expect(await openBox(a.outbound.key, 'kein base64 !!')).toBeNull();
  });
});

/** Stellt den Dienst nach: ein Fach je Kennung, Stand als einfacher Zähler */
function fakeService() {
  const slots = new Map<string, { v: string; data: string }>();
  let counter = 0;
  let requests = 0;
  let down = false;
  const request = (async (_url: unknown, init?: { body?: unknown }) => {
    requests++;
    if (down) return { ok: false, status: 503, json: async () => ({}) };
    const body = JSON.parse(String(init?.body ?? '{}')) as { put?: Record<string, string>; get?: Record<string, string> };
    const put: Record<string, string> = {};
    const got: Record<string, { v: string; data: string }> = {};
    for (const [slot, data] of Object.entries(body.put ?? {})) {
      const v = `v${++counter}`;
      slots.set(slot, { v, data });
      put[slot] = v;
    }
    for (const [slot, known] of Object.entries(body.get ?? {})) {
      const entry = slots.get(slot);
      if (entry && entry.v !== known) got[slot] = entry;
    }
    return { ok: true, status: 200, json: async () => ({ put, got }) };
  }) as unknown as typeof fetch;
  return { slots, request, requests: () => requests, setDown: (value: boolean) => (down = value) };
}

async function resetStore(target: AutomergeStore): Promise<void> {
  await target.change('leeren', (doc) => {
    for (const id of Object.keys(doc.connections)) delete doc.connections[id];
  });
}

describe('Postfach: ablegen und abholen', () => {
  let me: KeyPair;
  let peer: KeyPair;
  let peerId: string;

  beforeEach(async () => {
    memory.clear();
    setMailboxEnabled(true);
    me = await generateKeyPair();
    peer = await generateKeyPair();
    peerId = await createFingerprint(peer.publicKey);
    await resetStore(store);
    await store.updateMyCard({ firstName: 'Otto', lastName: 'Vermittler', phoneMobile: '0171 1' });
    await store.addConnection(peerId, peer.publicKey, ['firstName', 'phoneMobile']);
  });

  it('legt den freigegebenen Stand ab und nur bei Änderungen erneut', async () => {
    const service = fakeService();
    const mailbox = new Mailbox('http://dienst/box', me, service.request);
    await mailbox.push();
    expect(service.slots.size).toBe(1);

    // Die Gegenseite kann lesen, was sie sehen darf, und nicht mehr
    const theirs = await deriveChannels(await importBoxPrivateKey(peer.privateKey), peer.publicKey, me.publicKey);
    const first = service.slots.get(theirs.inbound.slot)!;
    const content = (await openBox(theirs.inbound.key, first.data)) as { t: string; fields: Record<string, string> };
    expect(content.t).toBe('karte');
    expect(content.fields).toEqual({ firstName: 'Otto', phoneMobile: '0171 1' });

    const before = service.requests();
    await mailbox.push();
    expect(service.requests()).toBe(before);

    await store.updateMyCard({ phoneMobile: '0171 2' });
    await mailbox.push();
    const second = service.slots.get(theirs.inbound.slot)!;
    expect(second.v).not.toBe(first.v);
    const updated = (await openBox(theirs.inbound.key, second.data)) as { n: number; fields: Record<string, string> };
    expect(updated.fields.phoneMobile).toBe('0171 2');
    expect(updated.n).toBeGreaterThan((content as unknown as { n: number }).n);

    // Ein Feld, das nicht freigegeben ist, löst nichts aus
    const quiet = service.requests();
    await store.updateMyCard({ city: 'Passau' });
    await mailbox.push();
    expect(service.requests()).toBe(quiet);
  });

  it('übernimmt einen abgelegten Stand, aber keinen älteren und keinen fremden', async () => {
    const service = fakeService();
    const mailbox = new Mailbox('http://dienst/box', me, service.request);
    const theirs = await deriveChannels(await importBoxPrivateKey(peer.privateKey), peer.publicKey, me.publicKey);
    const put = async (content: unknown, key = theirs.outbound.key) => {
      const data = await sealBox(key, content);
      await service.request('x', { method: 'POST', body: JSON.stringify({ put: { [theirs.outbound.slot]: data } }) });
    };

    await put({ t: 'karte', n: 100, schemaVersion: '2.2.0', fields: { firstName: 'Bert', phoneMobile: '0160 1' } });
    await mailbox.pull();
    expect(store.getDoc().connections[peerId].remoteCard).toEqual({ firstName: 'Bert', phoneMobile: '0160 1' });

    // Ein älterer Stand (Wiedereinspielen durch den Dienst) wird nicht übernommen
    await put({ t: 'karte', n: 50, schemaVersion: '2.2.0', fields: { firstName: 'Alt' } });
    await mailbox.pull();
    expect(store.getDoc().connections[peerId].remoteCard?.firstName).toBe('Bert');

    // Mit falschem Schlüssel verschlüsselt: wird verworfen
    await put({ t: 'karte', n: 300, schemaVersion: '2.2.0', fields: { firstName: 'Fremd' } }, theirs.inbound.key);
    await mailbox.pull();
    expect(store.getDoc().connections[peerId].remoteCard?.firstName).toBe('Bert');

    // Andere Hauptversion: wird nicht übernommen
    await put({ t: 'karte', n: 400, schemaVersion: '9.0.0', fields: { firstName: 'Zukunft' } });
    await mailbox.pull();
    expect(store.getDoc().connections[peerId].remoteCard?.firstName).toBe('Bert');

    // Ein neuerer Stand mit Befristung kommt samt Frist an
    const until = new Date(Date.now() + 86400000).toISOString();
    await put({ t: 'karte', n: 500, schemaVersion: '2.2.0', fields: { firstName: 'Bert', city: 'Ulm' }, until, keep: ['firstName'] });
    await mailbox.pull();
    const connection = store.getDoc().connections[peerId];
    expect(connection.remoteCard).toEqual({ firstName: 'Bert', city: 'Ulm' });
    expect(connection.remoteUntil).toBe(until);
    expect(connection.remoteKeep).toEqual(['firstName']);
  });

  it('holt denselben Stand nicht zweimal ab und merkt sich das über einen Neustart', async () => {
    const service = fakeService();
    const theirs = await deriveChannels(await importBoxPrivateKey(peer.privateKey), peer.publicKey, me.publicKey);
    const data = await sealBox(theirs.outbound.key, { t: 'karte', n: 100, schemaVersion: '2.2.0', fields: { firstName: 'Bert' } });
    await service.request('x', { method: 'POST', body: JSON.stringify({ put: { [theirs.outbound.slot]: data } }) });

    await new Mailbox('http://dienst/box', me, service.request).pull();
    expect(store.getDoc().connections[peerId].remoteCard?.firstName).toBe('Bert');

    // Von Hand geändert, dann erneut abgeholt: Der alte Stand überschreibt nichts
    await store.change('test', (doc) => {
      doc.connections[peerId].remoteCard = { firstName: 'Lokal' };
    });
    await new Mailbox('http://dienst/box', me, service.request).pull();
    expect(store.getDoc().connections[peerId].remoteCard?.firstName).toBe('Lokal');
  });

  it('ausgeschaltet oder ohne Dienst passiert nichts, und es geht später weiter', async () => {
    const service = fakeService();
    const mailbox = new Mailbox('http://dienst/box', me, service.request);

    setMailboxEnabled(false);
    await mailbox.sync();
    expect(service.requests()).toBe(0);
    expect(mailbox.getStatus()).toBe('off');

    setMailboxEnabled(true);
    service.setDown(true);
    await mailbox.sync();
    expect(mailbox.getStatus()).toBe('unavailable');
    expect(service.slots.size).toBe(0);

    service.setDown(false);
    await mailbox.sync();
    expect(mailbox.getStatus()).toBe('ok');
    expect(service.slots.size).toBe(1);
  });

  it('lässt nicht verbundene Einträge aus und vergisst entfernte Kontakte', async () => {
    const service = fakeService();
    await store.change('lokal', (doc) => {
      doc.connections.LOKAL = { id: 'LOKAL', kind: 'local', peerPubKey: '', allowedFields: [], storeRemoteCard: true, status: 'offline' };
    });
    const mailbox = new Mailbox('http://dienst/box', me, service.request);
    await mailbox.push();
    expect(service.slots.size).toBe(1);

    await store.removeConnection(peerId);
    await mailbox.push();
    expect(JSON.parse(memory.get('adressbuch.postfach') ?? '{}')).toEqual({});
  });
});
