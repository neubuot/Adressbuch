/**
 * Abgleich mit genau einem verbundenen Gerät.
 *
 * Ablauf:
 *   1. HELLO  – beide Seiten nennen Schlüssel, Schemaversion und einen Einmalwert
 *   2. AUTH   – beide Seiten signieren den Einmalwert der Gegenseite und weisen
 *               damit nach, dass ihnen der genannte Schlüssel gehört
 *   3. STATE_HASH – "diesen Stand habe ich von dir"
 *   4. PATCH  – nur wenn der Stand abweicht: die freigegebenen Felder
 *   5. ACK    – Bestätigung
 *
 * Bei unterschiedlicher Schema-Hauptversion endet der Ablauf nach Schritt 1:
 * Es werden keine Kartendaten gesendet und keine angenommen.
 */

import type { PeerConnection } from './peer-connection';
import { store } from '../store/automerge-store';
import { projectFields } from '../utils/policy';
import { stableHash } from '../utils/hash';
import { createFingerprint, createNonce, signText, verifyText } from '../utils/crypto';
import { APP_VERSION, SCHEMA_VERSION, isSchemaCompatible, type P2PMessage } from '../types';

export type ContactDecision = 'known' | 'new' | 'reject';

export interface SyncHost {
  localPubKey: string;
  localPrivateKey: string;
  /**
   * Entscheidet, ob das Gerät mit dieser Kennung ein bekannter Kontakt ist,
   * als neuer Kontakt angelegt wird oder abgewiesen wird.
   */
  resolveContact(sessionId: string, connectionId: string, pubKey: string): Promise<ContactDecision>;
  /** Wird aufgerufen, sobald der Abgleich mit dem Kontakt läuft */
  onLinked(sessionId: string, connectionId: string, isNew: boolean): void;
  /** Wird aufgerufen, wenn die Versionen nicht zusammenpassen */
  onIncompatible(sessionId: string, connectionId: string): void;
  /** Wird aufgerufen, wenn die Verbindung abgewiesen wurde */
  onRejected(sessionId: string): void;
}

const NO_CARD_YET = 'none';

function authText(nonce: string, pubKey: string): string {
  return `p2p-adressbuch-auth|${nonce}|${pubKey}`;
}

export class SyncController {
  private readonly localNonce = createNonce();
  private remotePubKey: string | null = null;
  private remoteNonce: string | null = null;
  private connectionId: string | null = null;
  private ready = false;
  private incompatible = false;
  private destroyed = false;
  private lastSentHash: string | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private sessionId: string,
    private peerConnection: PeerConnection,
    private host: SyncHost
  ) {
    this.peerConnection.on('data', (event) => {
      const message = event.data as P2PMessage;
      // Nachrichten streng nacheinander verarbeiten
      this.queue = this.queue
        .then(() => this.handleMessage(message))
        .catch((error) => console.error('Fehler beim Abgleich', error));
    });
  }

  /** Startet den Ablauf, sobald die direkte Verbindung steht */
  start(): void {
    this.peerConnection.send({
      type: 'HELLO',
      pubKey: this.host.localPubKey,
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      nonce: this.localNonce,
    });
  }

  private async handleMessage(message: P2PMessage): Promise<void> {
    if (this.destroyed || !message || typeof message !== 'object') return;

    switch (message.type) {
      case 'HELLO':
        await this.handleHello(message.pubKey, message.schemaVersion, message.nonce);
        break;
      case 'AUTH':
        await this.handleAuth(message.signature);
        break;
      case 'STATE_HASH':
        await this.handleStateHash(message.hash);
        break;
      case 'PATCH':
        await this.handlePatch(message.schemaVersion, message.fields);
        break;
      case 'ACK':
        await this.handleAck();
        break;
      default:
        // Unbekannte Nachrichten (z. B. von anderen Versionen) werden ignoriert
        break;
    }
  }

  private async handleHello(pubKey: unknown, schemaVersion: unknown, nonce: unknown): Promise<void> {
    if (this.remotePubKey) return;
    if (typeof pubKey !== 'string' || pubKey.length < 16 || pubKey.length > 1000) return;

    this.remotePubKey = pubKey;
    const connectionId = await createFingerprint(pubKey);

    if (!isSchemaCompatible(typeof schemaVersion === 'string' ? schemaVersion : undefined)) {
      // Andere Hauptversion: nichts senden, nichts annehmen
      this.incompatible = true;
      this.connectionId = connectionId;
      if (store.getDoc().connections[connectionId]) {
        await store.updateConnection(connectionId, { incompatible: true, status: 'offline' });
      }
      this.host.onIncompatible(this.sessionId, connectionId);
      return;
    }

    if (typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 200) {
      this.host.onRejected(this.sessionId);
      return;
    }
    this.remoteNonce = nonce;

    const signature = await signText(
      this.host.localPrivateKey,
      authText(nonce, this.host.localPubKey)
    );
    this.peerConnection.send({ type: 'AUTH', signature });
  }

  private async handleAuth(signature: unknown): Promise<void> {
    if (this.ready || this.incompatible || !this.remotePubKey || !this.remoteNonce) return;
    if (typeof signature !== 'string') return;

    const valid = await verifyText(
      this.remotePubKey,
      authText(this.localNonce, this.remotePubKey),
      signature
    );
    if (!valid) {
      console.warn('Identität der Gegenseite konnte nicht bestätigt werden');
      this.host.onRejected(this.sessionId);
      return;
    }

    const connectionId = await createFingerprint(this.remotePubKey);
    const decision = await this.host.resolveContact(this.sessionId, connectionId, this.remotePubKey);
    if (this.destroyed) return;
    if (decision === 'reject') {
      this.host.onRejected(this.sessionId);
      return;
    }

    this.connectionId = connectionId;
    const connection = store.getDoc().connections[connectionId];
    if (connection?.incompatible) {
      await store.updateConnection(connectionId, { incompatible: undefined });
    }
    await store.setConnectionStatus(connectionId, 'online');

    this.ready = true;
    this.host.onLinked(this.sessionId, connectionId, decision === 'new');
    this.sendStateHash();
  }

  /** Teilt der Gegenseite mit, welchen Stand ihrer Karte ich habe */
  private sendStateHash(): void {
    const connection = this.getConnection();
    if (!connection) return;
    const hash = connection.remoteCard ? stableHash(connection.remoteCard) : NO_CARD_YET;
    this.peerConnection.send({ type: 'STATE_HASH', hash });
  }

  private async handleStateHash(remoteHash: unknown): Promise<void> {
    if (!this.ready) return;
    const connection = this.getConnection();
    if (!connection) return;

    const projection = projectFields(store.getDoc().myCard, connection.allowedFields);
    const localHash = stableHash(projection);
    if (remoteHash !== localHash) {
      this.sendPatch();
    } else {
      this.lastSentHash = localHash;
      this.peerConnection.send({ type: 'ACK', hash: localHash });
    }
  }

  /** Sendet die für diesen Kontakt freigegebenen Felder */
  private sendPatch(): void {
    const connection = this.getConnection();
    if (!this.ready || !connection) return;

    const fields = projectFields(store.getDoc().myCard, connection.allowedFields);
    this.lastSentHash = stableHash(fields);
    this.peerConnection.send({ type: 'PATCH', schemaVersion: SCHEMA_VERSION, fields });
  }

  private async handlePatch(schemaVersion: unknown, fields: unknown): Promise<void> {
    if (!this.ready || !this.connectionId) return;
    if (!isSchemaCompatible(typeof schemaVersion === 'string' ? schemaVersion : undefined)) return;
    const connection = this.getConnection();
    if (!connection) return;

    if (connection.storeRemoteCard) {
      await store.applyRemoteCard(this.connectionId, fields);
    }
    this.peerConnection.send({ type: 'ACK' });
  }

  private async handleAck(): Promise<void> {
    if (!this.ready || !this.connectionId) return;
    await store.updateConnection(this.connectionId, { lastSyncAt: new Date().toISOString() });
  }

  /**
   * Sendet die Karte erneut, wenn sich das, was dieser Kontakt sehen darf,
   * seit dem letzten Senden geändert hat (Karte oder Freigabe).
   */
  syncIfChanged(): void {
    const connection = this.getConnection();
    if (!this.ready || !connection) return;
    const hash = stableHash(projectFields(store.getDoc().myCard, connection.allowedFields));
    if (hash !== this.lastSentHash) {
      this.sendPatch();
    }
  }

  /** Sendet die freigegebenen Felder in jedem Fall erneut */
  async resync(): Promise<void> {
    this.sendPatch();
  }

  private getConnection() {
    return this.connectionId ? store.getDoc().connections[this.connectionId] : undefined;
  }

  getConnectionId(): string | null {
    return this.ready ? this.connectionId : null;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Beendet den Abgleich und markiert den Kontakt als nicht verbunden
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const wasReady = this.ready;
    this.ready = false;
    if (wasReady && this.connectionId) {
      void store.setConnectionStatus(this.connectionId, 'offline');
    }
    this.peerConnection.destroy();
  }
}
