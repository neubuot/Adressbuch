/**
 * Sync-Controller für Peer-Synchronisation
 * Implementiert das P2P-Protokoll: HELLO, POLICY, STATE_HASH, PATCH, ACK
 */

import { PeerConnection } from './peer-connection';
import { store } from '../store/automerge-store';
import { projectFields } from '../utils/policy';
import { stableHash } from '../utils/hash';
import type {
  P2PMessage,
  HelloMessage,
  PolicyMessage,
  StateHashMessage,
  PatchMessage,
  AckMessage,
} from '../types';

export type SyncStatus = 'idle' | 'connecting' | 'handshake' | 'syncing' | 'synced' | 'error';

export class SyncController {
  private status: SyncStatus = 'idle';
  private _remotePubKey: string | null = null;
  private remoteAllowedFields: string[] = [];
  private _lastRemoteHash: string | null = null;
  private handshakeCompleted = false;

  constructor(
    private peerId: string,
    private peerConnection: PeerConnection,
    private localPubKey: string,
    alreadyConnected = false
  ) {
    this.setupListeners();

    // Falls bereits verbunden, starte Handshake sofort
    if (alreadyConnected) {
      this.status = 'handshake';
      this.startHandshake();
    }
  }

  /**
   * Initialisiert Event-Listener
   */
  private setupListeners(): void {
    this.peerConnection.on('connect', () => {
      this.status = 'handshake';
      this.startHandshake();
    });

    this.peerConnection.on('data', (event) => {
      if (event.data) {
        this.handleMessage(event.data as P2PMessage);
      }
    });

    this.peerConnection.on('close', () => {
      this.status = 'idle';
      this.updateConnectionStatus('offline');
    });

    this.peerConnection.on('error', () => {
      this.status = 'error';
      this.updateConnectionStatus('offline');
    });
  }

  /**
   * Startet den Handshake-Prozess
   */
  private startHandshake(): void {
    const hello: HelloMessage = {
      type: 'HELLO',
      peerId: this.peerId,
      pubKey: this.localPubKey,
      appVersion: '0.1.0',
      schemaVersion: '1.0.0',
    };

    this.peerConnection.send(hello);
    console.log(`🤝 HELLO gesendet an ${this.peerId}`);
  }

  /**
   * Verarbeitet eingehende Nachrichten
   */
  private handleMessage(message: P2PMessage): void {
    switch (message.type) {
      case 'HELLO':
        this.handleHello(message as HelloMessage);
        break;
      case 'POLICY':
        this.handlePolicy(message as PolicyMessage);
        break;
      case 'STATE_HASH':
        this.handleStateHash(message as StateHashMessage);
        break;
      case 'PATCH':
        this.handlePatch(message as PatchMessage);
        break;
      case 'ACK':
        this.handleAck(message as AckMessage);
        break;
      default:
        console.warn(`Unbekannter Nachrichtentyp: ${(message as P2PMessage).type}`);
    }
  }

  /**
   * Verarbeitet HELLO-Nachricht
   */
  private async handleHello(message: HelloMessage): Promise<void> {
    console.log(`🤝 HELLO empfangen von ${message.peerId}`);

    this._remotePubKey = message.pubKey;

    // Schema-Kompatibilität prüfen
    if (message.schemaVersion !== '1.0.0') {
      console.warn(`⚠️  Schema-Version nicht kompatibel: ${message.schemaVersion}`);
    }

    // Sende eigene HELLO, falls noch nicht geschehen
    if (!this.handshakeCompleted) {
      this.startHandshake();
    }

    // Sende Policy
    await this.sendPolicy();

    this.updateConnectionStatus('online');
  }

  /**
   * Sendet die Policy (erlaubte Felder)
   */
  private async sendPolicy(): Promise<void> {
    const doc = store.getDoc();
    let connection = doc.connections[this.peerId];

    // Falls Connection noch nicht existiert (eingehende Verbindung), erstelle eine
    if (!connection) {
      console.log(`⚠️  Connection für ${this.peerId} nicht gefunden, erstelle neue mit leerer Policy`);

      // Erstelle Connection mit leerer Policy (privacy by default)
      await store.addConnection(this.peerId, this._remotePubKey || '', []);

      // Lade neu
      const updatedDoc = store.getDoc();
      connection = updatedDoc.connections[this.peerId];

      if (!connection) {
        console.error(`❌ Konnte Connection für ${this.peerId} nicht erstellen`);
        return;
      }
    }

    const policy: PolicyMessage = {
      type: 'POLICY',
      allowedFields: connection.allowedFields,
    };

    this.peerConnection.send(policy);
    console.log(`📋 POLICY gesendet an ${this.peerId}:`, connection.allowedFields);

    // Nach Policy-Austausch: State-Hash senden
    setTimeout(() => this.sendStateHash(), 100);
  }

  /**
   * Verarbeitet POLICY-Nachricht
   */
  private handlePolicy(message: PolicyMessage): void {
    console.log(`📋 POLICY empfangen von ${this.peerId}:`, message.allowedFields);

    this.remoteAllowedFields = message.allowedFields;

    // Nach Policy-Empfang: State-Hash senden (falls noch nicht geschehen)
    if (this.handshakeCompleted) {
      this.sendStateHash();
    } else {
      this.handshakeCompleted = true;
    }
  }

  /**
   * Sendet den Hash des aktuellen freigegebenen States
   * STATE_HASH = "Das ist der Hash von dem, was ich VON DIR habe"
   */
  private sendStateHash(): void {
    const doc = store.getDoc();
    const connection = doc.connections[this.peerId];

    if (!connection) {
      console.warn(`⚠️  Connection ${this.peerId} nicht gefunden für STATE_HASH`);
      return;
    }

    // Hash von dem, was ich VON Remote habe (remoteCard)
    const hash = connection.remoteCard ? stableHash(connection.remoteCard) : stableHash({});

    const stateHash: StateHashMessage = {
      type: 'STATE_HASH',
      hash,
    };

    this.peerConnection.send(stateHash);
    console.log(`#️⃣ STATE_HASH gesendet an ${this.peerId}: ${hash} (von remoteCard)`);
  }

  /**
   * Verarbeitet STATE_HASH-Nachricht
   * Remote sagt: "Das ist der Hash von dem, was ich VON DIR habe"
   * Ich vergleiche: "Ist das der gleiche Hash wie das, was ICH sende?"
   */
  private handleStateHash(message: StateHashMessage): void {
    const doc = store.getDoc();
    const connection = doc.connections[this.peerId];

    if (!connection) {
      console.warn(`⚠️  Connection ${this.peerId} nicht gefunden für STATE_HASH`);
      return;
    }

    // Hash von dem, was ICH sende (meine allowedFields)
    const sharedFields = projectFields(doc.myCard, connection.allowedFields);
    const localHash = stableHash(sharedFields);

    console.log(`#️⃣ STATE_HASH empfangen von ${this.peerId}: remote=${message.hash}, lokal=${localHash}`);

    this._lastRemoteHash = message.hash;

    // Vergleiche Hashes
    if (localHash !== message.hash) {
      console.log(`⚠️  Hash-Diskrepanz → sende meine aktuellen Daten (PATCH)`);
      this.status = 'syncing';
      this.sendPatch();
    } else {
      console.log(`✅ Synchron mit ${this.peerId}`);
      this.status = 'synced';
      this.updateConnectionStatus('online');
    }
  }

  /**
   * Sendet ein PATCH mit den freigegebenen Feldern
   */
  private sendPatch(): void {
    const doc = store.getDoc();
    const connection = doc.connections[this.peerId];

    if (!connection) {
      console.warn(`⚠️  Connection ${this.peerId} nicht gefunden für PATCH`);
      return;
    }

    const sharedFields = projectFields(doc.myCard, connection.allowedFields);

    const patch: PatchMessage = {
      type: 'PATCH',
      fields: sharedFields,
    };

    this.peerConnection.send(patch);
    console.log(`🔄 PATCH gesendet an ${this.peerId}`, sharedFields);
  }

  /**
   * Verarbeitet PATCH-Nachricht
   */
  private async handlePatch(message: PatchMessage): Promise<void> {
    console.log(`🔄 PATCH empfangen von ${this.peerId}`, message.fields);

    const doc = store.getDoc();
    const connection = doc.connections[this.peerId];

    if (!connection || !connection.storeRemoteCard) {
      console.log(`Speicherung für ${this.peerId} deaktiviert`);
      return;
    }

    // Speichere fremde Karte
    await store.updateConnection(this.peerId, {
      remoteCard: message.fields,
      lastSyncAt: new Date().toISOString(),
    });

    // Berechne neuen Hash und sende ACK
    const hash = stableHash(message.fields);

    const ack: AckMessage = {
      type: 'ACK',
      hash,
    };

    this.peerConnection.send(ack);
    console.log(`✅ ACK gesendet an ${this.peerId}: ${hash}`);

    this.status = 'synced';
    this.updateConnectionStatus('online');
  }

  /**
   * Verarbeitet ACK-Nachricht
   */
  private handleAck(message: AckMessage): void {
    console.log(`✅ ACK empfangen von ${this.peerId}: ${message.hash}`);

    this._lastRemoteHash = message.hash;
    this.status = 'synced';

    store.updateConnection(this.peerId, {
      lastSyncAt: new Date().toISOString(),
    });

    this.updateConnectionStatus('online');
  }

  /**
   * Triggert eine erneute Synchronisation
   */
  async resync(): Promise<void> {
    if (this.peerConnection.isConnected() && this.handshakeCompleted) {
      this.status = 'syncing';
      this.sendStateHash();
    }
  }

  /**
   * Aktualisiert den Connection-Status im Store
   */
  private updateConnectionStatus(status: 'online' | 'offline' | 'syncing'): void {
    store.updateConnection(this.peerId, { status });
  }

  /**
   * Gibt den aktuellen Sync-Status zurück
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Schließt die Verbindung
   */
  destroy(): void {
    this.peerConnection.destroy();
    this.status = 'idle';
    this.updateConnectionStatus('offline');
  }
}
