/**
 * Sync-Controller für Peer-Synchronisation
 * Implementiert das P2P-Protokoll: HELLO, POLICY, STATE_HASH, PATCH, ACK
 */

import { PeerConnection } from './peer-connection';
import { store } from '../store/automerge-store';
import { projectFields } from '../utils/policy';
import { stableHash } from '../utils/hash';
import { createFingerprint } from '../utils/crypto';
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
  private _connectionId: string | null = null; // Fingerprint (persistent)
  private remoteAllowedFields: string[] = [];
  private _lastRemoteHash: string | null = null;
  private handshakeCompleted = false;

  constructor(
    private sessionId: string, // Session-ID (temporär, für WebRTC)
    private peerConnection: PeerConnection,
    private localPubKey: string,
    private getDefaultFields: () => string[], // Callback für Standard-Freigabe
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
   * Gibt die Connection-ID (Fingerprint) zurück, oder Session-ID als Fallback
   */
  private getConnectionId(): string {
    return this._connectionId || this.sessionId;
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
      peerId: this.sessionId,
      pubKey: this.localPubKey,
      appVersion: '0.1.0',
      schemaVersion: '1.0.0',
    };

    this.peerConnection.send(hello);
    console.log(`🤝 HELLO gesendet an Session ${this.sessionId.substring(0, 8)}...`);
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
    console.log(`🤝 HELLO empfangen von Session ${message.peerId.substring(0, 8)}...`);

    this._remotePubKey = message.pubKey;

    // Berechne persistente Connection-ID (Fingerprint) vom Remote Public Key
    this._connectionId = await createFingerprint(message.pubKey);
    console.log(`🔗 Connection-ID (Fingerprint): ${this._connectionId}`);

    // Schema-Kompatibilität prüfen
    if (message.schemaVersion !== '1.0.0') {
      console.warn(`⚠️  Schema-Version nicht kompatibel: ${message.schemaVersion}`);
    }

    // Prüfe ob Connection mit diesem Fingerprint bereits existiert
    const doc = store.getDoc();
    const existingConnection = doc.connections[this._connectionId];

    if (existingConnection) {
      console.log(`✨ Bekannter Peer wiedererkannt! RemoteCard bleibt erhalten.`);
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
  private async sendPolicy(skipStateHash = false): Promise<void> {
    const doc = store.getDoc();
    const connectionId = this.getConnectionId();
    let connection = doc.connections[connectionId];

    // Falls Connection noch nicht existiert (eingehende Verbindung), erstelle eine
    if (!connection) {
      const defaultFields = this.getDefaultFields();
      console.log(`⚠️  Connection ${connectionId} nicht gefunden, erstelle neue mit Freigabe:`, defaultFields);

      // Erstelle Connection mit Fingerprint als ID
      await store.addConnection(connectionId, this._remotePubKey || '', defaultFields);

      // Lade neu
      const updatedDoc = store.getDoc();
      connection = updatedDoc.connections[connectionId];

      if (!connection) {
        console.error(`❌ Konnte Connection ${connectionId} nicht erstellen`);
        return;
      }
    }

    const policy: PolicyMessage = {
      type: 'POLICY',
      allowedFields: connection.allowedFields,
    };

    this.peerConnection.send(policy);
    console.log(`📋 POLICY gesendet an ${connectionId}:`, connection.allowedFields);

    // Nach Policy-Austausch: State-Hash senden (außer wenn skipStateHash = true)
    if (!skipStateHash) {
      setTimeout(() => this.sendStateHash(), 100);
    }
  }

  /**
   * Verarbeitet POLICY-Nachricht
   */
  private handlePolicy(message: PolicyMessage): void {
    const oldFields = this.remoteAllowedFields;
    this.remoteAllowedFields = message.allowedFields;

    // Prüfe, ob sich die Policy geändert hat
    const policyChanged = JSON.stringify(oldFields.sort()) !== JSON.stringify(message.allowedFields.sort());

    console.log(`📋 POLICY empfangen von ${this.peerId}:`, message.allowedFields, policyChanged ? '(geändert)' : '(unverändert)');

    // Nach Policy-Empfang: State-Hash senden
    if (this.handshakeCompleted) {
      // Policy hat sich geändert → sende STATE_HASH, um Update zu triggern
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
    const connection = doc.connections[this.getConnectionId()];

    if (!connection) {
      console.warn(`⚠️  Connection ${this.sessionId.substring(0,8)} nicht gefunden für STATE_HASH`);
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
    const connection = doc.connections[this.getConnectionId()];

    if (!connection) {
      console.warn(`⚠️  Connection ${this.sessionId.substring(0,8)} nicht gefunden für STATE_HASH`);
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
    const connection = doc.connections[this.getConnectionId()];

    if (!connection) {
      console.warn(`⚠️  Connection ${this.sessionId.substring(0,8)} nicht gefunden für PATCH`);
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
    console.log(`🔄 PATCH empfangen von Session ${this.sessionId.substring(0,8)}`, message.fields);

    const doc = store.getDoc();
    const connection = doc.connections[this.getConnectionId()];

    if (!connection || !connection.storeRemoteCard) {
      console.log(`⚠️  Speicherung für ${this.sessionId.substring(0,8)} deaktiviert`);
      // ACK senden, auch wenn nicht gespeichert
      const hash = stableHash(message.fields);
      const ack: AckMessage = {
        type: 'ACK',
        hash,
      };
      this.peerConnection.send(ack);
      console.log(`✅ ACK gesendet an ${this.peerId}: ${hash} (nicht gespeichert)`);
      return;
    }

    try {
      // Serialisiere message.fields zu plain object (kein Automerge-Proxy)
      const remoteCardData = JSON.parse(JSON.stringify(message.fields));

      // Speichere fremde Karte
      await store.updateConnection(this.getConnectionId(), {
        remoteCard: remoteCardData,
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
    } catch (error) {
      console.error(`❌ Fehler beim Verarbeiten von PATCH von ${this.peerId}:`, error);
      // Sende trotzdem ACK, um Endlosschleife zu vermeiden
      const hash = stableHash(message.fields);
      const ack: AckMessage = {
        type: 'ACK',
        hash,
      };
      this.peerConnection.send(ack);
      console.log(`✅ ACK gesendet an ${this.peerId}: ${hash} (mit Fehler)`);
    }
  }

  /**
   * Verarbeitet ACK-Nachricht
   */
  private handleAck(message: AckMessage): void {
    console.log(`✅ ACK empfangen von Session ${this.sessionId.substring(0,8)}: ${message.hash}`);

    this._lastRemoteHash = message.hash;
    this.status = 'synced';

    store.updateConnection(this.getConnectionId(), {
      lastSyncAt: new Date().toISOString(),
    });

    this.updateConnectionStatus('online');
  }

  /**
   * Triggert eine erneute Synchronisation
   * Wird aufgerufen bei MyCard-Updates oder Policy-Updates
   */
  async resync(): Promise<void> {
    if (this.peerConnection.isConnected() && this.handshakeCompleted) {
      console.log(`🔄 Resync für ${this.peerId}, sende POLICY + PATCH`);
      this.status = 'syncing';
      // Sende neue Policy (falls sie sich geändert hat)
      await this.sendPolicy(true); // skipStateHash = true
      // Dann sende PATCH mit den aktuellen Daten
      setTimeout(() => {
        this.sendPatch();
      }, 50);
    }
  }

  /**
   * Aktualisiert die Policy und synchronisiert
   */
  async updatePolicy(): Promise<void> {
    if (this.peerConnection.isConnected() && this.handshakeCompleted) {
      console.log(`🔄 Policy-Update für ${this.peerId}, sende neue POLICY und PATCH`);
      this.status = 'syncing';
      // Sende neue Policy (skipStateHash = true)
      await this.sendPolicy(true);
      // Dann sende PATCH mit den jetzt freigegebenen Daten
      setTimeout(() => {
        this.sendPatch();
      }, 50);
    }
  }

  /**
   * Aktualisiert den Connection-Status im Store
   */
  private updateConnectionStatus(status: 'online' | 'offline' | 'syncing'): void {
    store.updateConnection(this.getConnectionId(), { status });
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
