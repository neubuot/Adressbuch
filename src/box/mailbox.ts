/**
 * Postfach: Karten kommen auch an, wenn nicht beide Geräte gleichzeitig
 * online sind.
 *
 * Für jeden verbundenen Kontakt gibt es zwei Fächer beim Dienst, eines je
 * Richtung. In meinem Fach für einen Kontakt liegt immer der letzte Stand
 * dessen, was dieser Kontakt von mir sehen darf, verschlüsselt mit einem
 * Schlüssel, den nur wir beide berechnen können. Der Kontakt holt den Stand
 * ab, wenn er die App öffnet.
 *
 * Das Postfach ergänzt die direkte Verbindung, es ersetzt sie nicht:
 * Verbinden, Vorstellen und das Hinterlegen bei Vertrauten brauchen weiter
 * beide Geräte gleichzeitig.
 */

import { store } from '../store/automerge-store';
import { activeLimit, effectiveFields, projectFields, sanitizeLimit, shareState } from '../utils/policy';
import { stableHash } from '../utils/hash';
import { SCHEMA_VERSION, isSchemaCompatible, type Connection } from '../types';
import { deriveChannels, importBoxPrivateKey, openBox, sealBox, type BoxChannels } from './seal';

const STATE_KEY = 'adressbuch.postfach';
const OFF_KEY = 'adressbuch.postfach.aus';
const PUSH_DELAY_MS = 1500;
const PULL_INTERVAL_MS = 5 * 60 * 1000;
const CHUNK = 100;

/** Was dieses Gerät je Kontakt über die beiden Fächer weiß */
interface SlotState {
  /** Vergleichswert des zuletzt abgelegten Stands */
  out?: string;
  /** Laufende Nummer des zuletzt abgelegten Stands */
  n?: number;
  /** Stand des Fachs der Gegenseite, den ich schon abgeholt habe */
  inV?: string;
  /** Laufende Nummer des zuletzt übernommenen Stands */
  inN?: number;
}

export type MailboxStatus = 'idle' | 'ok' | 'unavailable' | 'off';

interface BoxResponse {
  put?: Record<string, string>;
  got?: Record<string, { v: string; data: string }>;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Ohne Speicher arbeitet das Postfach nur für diese Sitzung
  }
}

export function isMailboxEnabled(): boolean {
  return safeGet(OFF_KEY) !== '1';
}

export function setMailboxEnabled(enabled: boolean): void {
  safeSet(OFF_KEY, enabled ? null : '1');
}

export interface MailboxKeys {
  publicKey: string;
  privateKey: string;
}

export class Mailbox {
  private state: Record<string, SlotState> = {};
  private channels = new Map<string, { pubKey: string; channels: BoxChannels }>();
  private privateKey: Promise<CryptoKey> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private stopped = true;
  private status: MailboxStatus = 'idle';
  private readonly onWake = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') this.sync();
  };

  constructor(
    private url: string,
    private keys: MailboxKeys,
    private request: typeof fetch = (...args) => fetch(...args)
  ) {
    try {
      const parsed = JSON.parse(safeGet(STATE_KEY) || '{}');
      if (parsed && typeof parsed === 'object') this.state = parsed as Record<string, SlotState>;
    } catch {
      this.state = {};
    }
  }

  /** Beginnt, Änderungen abzulegen und regelmäßig abzuholen */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.unsubscribe = store.onChange(() => this.schedulePush());
    this.pullTimer = setInterval(() => this.sync(), PULL_INTERVAL_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onWake);
      document.addEventListener('visibilitychange', this.onWake);
    }
    this.sync();
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.pushTimer !== null) clearTimeout(this.pushTimer);
    if (this.pullTimer !== null) clearInterval(this.pullTimer);
    this.pushTimer = null;
    this.pullTimer = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onWake);
      document.removeEventListener('visibilitychange', this.onWake);
    }
  }

  getStatus(): MailboxStatus {
    return isMailboxEnabled() ? this.status : 'off';
  }

  /** Legt ab, was sich geändert hat, und holt ab, was wartet */
  sync(): Promise<void> {
    return this.enqueue(async () => {
      await this.push();
      await this.pull();
    });
  }

  private schedulePush(): void {
    if (this.stopped || this.pushTimer !== null) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.enqueue(() => this.push());
    }, PUSH_DELAY_MS);
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(async () => {
      if (!isMailboxEnabled()) return;
      try {
        await task();
      } catch (error) {
        this.status = 'unavailable';
        console.warn('Postfach gerade nicht erreichbar', error);
      }
    });
    return this.queue;
  }

  private linked(): Connection[] {
    return Object.values(store.getDoc().connections).filter(
      (connection) => connection.kind !== 'local' && !!connection.peerPubKey && !connection.incompatible
    );
  }

  private async channelsFor(connection: Connection): Promise<BoxChannels | null> {
    const cached = this.channels.get(connection.id);
    if (cached && cached.pubKey === connection.peerPubKey) return cached.channels;
    try {
      if (!this.privateKey) this.privateKey = importBoxPrivateKey(this.keys.privateKey);
      const channels = await deriveChannels(await this.privateKey, this.keys.publicKey, connection.peerPubKey);
      this.channels.set(connection.id, { pubKey: connection.peerPubKey, channels });
      return channels;
    } catch (error) {
      console.warn('Postfach: Schlüssel für einen Kontakt ließ sich nicht berechnen', error);
      return null;
    }
  }

  private saveState(): void {
    safeSet(STATE_KEY, JSON.stringify(this.state));
  }

  private async post(body: { put?: Record<string, string>; get?: Record<string, string> }): Promise<BoxResponse> {
    const response = await this.request(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Postfach antwortet mit ${response.status}`);
    this.status = 'ok';
    return (await response.json()) as BoxResponse;
  }

  /** Legt für jeden Kontakt den aktuellen Stand ab, wenn er sich geändert hat */
  async push(): Promise<void> {
    const doc = store.getDoc();
    const connections = this.linked();

    // Entfernte Kontakte vergessen
    const known = new Set(connections.map((connection) => connection.id));
    let pruned = false;
    for (const id of Object.keys(this.state)) {
      if (!known.has(id)) {
        delete this.state[id];
        this.channels.delete(id);
        pruned = true;
      }
    }
    if (pruned) this.saveState();

    const pending: Array<{ id: string; slot: string; data: string; hash: string; n: number }> = [];
    for (const connection of connections) {
      const fields = projectFields(doc.myCard, effectiveFields(connection));
      const limit = activeLimit(connection);
      const hash = stableHash(shareState(fields, limit));
      const entry = this.state[connection.id] ?? {};
      if (entry.out === hash) continue;
      const channels = await this.channelsFor(connection);
      if (!channels) continue;
      const n = Math.max(Date.now(), (entry.n ?? 0) + 1);
      const data = await sealBox(channels.outbound.key, {
        t: 'karte',
        n,
        schemaVersion: SCHEMA_VERSION,
        fields,
        ...(limit ? { until: limit.until, keep: limit.keep } : {}),
      });
      pending.push({ id: connection.id, slot: channels.outbound.slot, data, hash, n });
    }

    for (let i = 0; i < pending.length; i += CHUNK) {
      const chunk = pending.slice(i, i + CHUNK);
      const result = await this.post({ put: Object.fromEntries(chunk.map((item) => [item.slot, item.data])) });
      for (const item of chunk) {
        if (!result.put?.[item.slot]) continue;
        this.state[item.id] = { ...(this.state[item.id] ?? {}), out: item.hash, n: item.n };
      }
      this.saveState();
    }
  }

  /** Holt ab, was Kontakte abgelegt haben, und übernimmt neuere Stände */
  async pull(): Promise<void> {
    const connections = this.linked();
    const wanted: Array<{ connection: Connection; channels: BoxChannels }> = [];
    for (const connection of connections) {
      const channels = await this.channelsFor(connection);
      if (channels) wanted.push({ connection, channels });
    }

    for (let i = 0; i < wanted.length; i += CHUNK) {
      const chunk = wanted.slice(i, i + CHUNK);
      const result = await this.post({
        get: Object.fromEntries(chunk.map(({ connection, channels }) => [channels.inbound.slot, this.state[connection.id]?.inV ?? ''])),
      });
      for (const { connection, channels } of chunk) {
        const found = result.got?.[channels.inbound.slot];
        if (!found || typeof found.data !== 'string' || typeof found.v !== 'string') continue;
        await this.accept(connection.id, channels, found.v, found.data);
      }
      this.saveState();
    }
  }

  private async accept(connectionId: string, channels: BoxChannels, v: string, data: string): Promise<void> {
    const entry = this.state[connectionId] ?? {};
    const content = (await openBox(channels.inbound.key, data)) as Record<string, unknown> | null;
    // Was sich nicht öffnen lässt, wird nicht noch einmal abgeholt
    this.state[connectionId] = { ...entry, inV: v };
    if (!content || typeof content !== 'object' || content.t !== 'karte') return;
    const n = content.n;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= (entry.inN ?? 0)) return;
    if (!isSchemaCompatible(typeof content.schemaVersion === 'string' ? content.schemaVersion : undefined)) return;

    const connection = store.getDoc().connections[connectionId];
    if (!connection) return;
    if (connection.storeRemoteCard) {
      await store.applyRemoteCard(connectionId, content.fields, sanitizeLimit(content.until, content.keep));
    }
    this.state[connectionId] = { ...entry, inV: v, inN: n };
  }
}

let current: Mailbox | null = null;

export function setMailbox(mailbox: Mailbox | null): void {
  current?.stop();
  current = mailbox;
}

export function getMailbox(): Mailbox | null {
  return current;
}
