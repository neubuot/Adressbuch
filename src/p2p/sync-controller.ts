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
  ChatMessage,
  ChatDeliveryMessage,
  ChatReadMessage,
  Message,
} from '../types';

export type SyncStatus = 'idle' | 'connecting' | 'handshake' | 'syncing' | 'synced' | 'error';

export class SyncController {
  private status: SyncStatus = 'idle';
  private _remotePubKey: string | null = null;
  private _connectionId: string | null = null; // Fingerprint (persistent)
  private handshakeCompleted = false;

  constructor(
    private sessionId: string, // Session-ID (temporär, für WebRTC)
    private peerConnection: PeerConnection,
    private localPubKey: string,
    private getDefaultFields: () => string[], // Callback für Standard-Freigabe
    private onConnectionIdKnown: (connectionId: string) => void, // Callback wenn Fingerprint bekannt
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
      case 'CHAT':
        this.handleChat(message as ChatMessage);
        break;
      case 'CHAT_DELIVERY':
        this.handleChatDelivery(message as ChatDeliveryMessage);
        break;
      case 'CHAT_READ':
        this.handleChatRead(message as ChatReadMessage);
        break;
      default:
        console.warn(`Unbekannter Nachrichtentyp: ${(message as P2PMessage).type}`);
    }
  }

  /**
   * Verarbeitet eingehende Chat-Nachricht
   */
  private handleChat(message: ChatMessage): void {
    const connectionId = this.getConnectionId();
    const now = new Date().toISOString();

    // Erstelle Message für lokalen Store
    const localMessage: Message = {
      id: message.id,
      connectionId,
      text: message.text,
      type: 'received',
      timestamp: message.timestamp,
      sentAt: message.sentAt,
      deliveredAt: now,
      deliveryStatus: 'delivered',
      read: false
    };

    // Füge zur Messages-Liste hinzu
    store.updateDoc('Received chat message', (doc) => {
      if (!doc.messages) {
        doc.messages = [];
      }
      doc.messages.push(localMessage);

      // Update unread count for connection
      if (doc.connections[connectionId]) {
        doc.connections[connectionId].unreadMessages =
          (doc.connections[connectionId].unreadMessages || 0) + 1;
      }
    });

    // Sende Delivery-Receipt zurück
    const deliveryReceipt: ChatDeliveryMessage = {
      type: 'CHAT_DELIVERY',
      messageId: message.id,
      deliveredAt: now
    };
    this.peerConnection.send(deliveryReceipt);

    console.log(`💬 Chat-Nachricht empfangen von ${connectionId.substring(0, 8)}`);
  }

  /**
   * Verarbeitet Delivery-Receipt
   */
  private handleChatDelivery(message: ChatDeliveryMessage): void {
    store.updateDoc('Update message delivery status', (doc) => {
      const msg = doc.messages?.find(m => m.id === message.messageId);
      if (msg && msg.type === 'sent') {
        msg.deliveredAt = message.deliveredAt;
        msg.deliveryStatus = 'delivered';
      }
    });
    console.log(`✓ Zustellbestätigung für Nachricht ${message.messageId.substring(0, 8)}`);
  }

  /**
   * Verarbeitet Read-Receipt
   */
  private handleChatRead(message: ChatReadMessage): void {
    store.updateDoc('Update message read status', (doc) => {
      const msg = doc.messages?.find(m => m.id === message.messageId);
      if (msg && msg.type === 'sent') {
        msg.readAt = message.readAt;
        msg.deliveryStatus = 'read';
      }
    });
    console.log(`✓✓ Lesebestätigung für Nachricht ${message.messageId.substring(0, 8)}`);
  }

  /**
   * Verarbeitet HELLO-Nachricht
   */
  private async handleHello(message: HelloMessage): Promise<void> {
    this._remotePubKey = message.pubKey;

    // Berechne persistente Connection-ID (Fingerprint) vom Remote Public Key
    this._connectionId = await createFingerprint(message.pubKey);

    // Benachrichtige P2PManager über die Connection-ID
    this.onConnectionIdKnown(this._connectionId);

    // Schema-Kompatibilität prüfen
    if (message.schemaVersion !== '1.0.0') {
      console.warn(`⚠️ Schema-Version nicht kompatibel: ${message.schemaVersion}`);
    }

    // Prüfe ob Connection mit diesem Fingerprint bereits existiert
    const doc = store.getDoc();
    const existingConnection = doc.connections[this._connectionId];

    if (existingConnection) {
      console.log(`✅ Peer ${this._connectionId} verbunden (bekannt)`);
    } else {
      console.log(`✅ Peer ${this._connectionId} verbunden (neu)`);
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

    // Nach Policy-Austausch: State-Hash senden (außer wenn skipStateHash = true)
    if (!skipStateHash) {
      setTimeout(() => this.sendStateHash(), 100);
    }
  }

  /**
   * Verarbeitet POLICY-Nachricht
   */
  private handlePolicy(_message: PolicyMessage): void {
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
      return;
    }

    // Hash von dem, was ich VON Remote habe (remoteCard)
    const hash = connection.remoteCard ? stableHash(connection.remoteCard) : stableHash({});

    const stateHash: StateHashMessage = {
      type: 'STATE_HASH',
      hash,
    };

    this.peerConnection.send(stateHash);
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
      return;
    }

    // Hash von dem, was ICH sende (meine allowedFields)
    const sharedFields = projectFields(doc.myCard, connection.allowedFields);
    const localHash = stableHash(sharedFields);

    // Vergleiche Hashes
    if (localHash !== message.hash) {
      this.status = 'syncing';
      this.sendPatch();
    } else {
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
      return;
    }

    const sharedFields = projectFields(doc.myCard, connection.allowedFields);

    const patch: PatchMessage = {
      type: 'PATCH',
      fields: sharedFields,
    };

    this.peerConnection.send(patch);
  }

  /**
   * Verarbeitet PATCH-Nachricht
   */
  private async handlePatch(message: PatchMessage): Promise<void> {
    const doc = store.getDoc();
    const connection = doc.connections[this.getConnectionId()];

    if (!connection || !connection.storeRemoteCard) {
      // ACK senden, auch wenn nicht gespeichert
      const hash = stableHash(message.fields);
      const ack: AckMessage = {
        type: 'ACK',
        hash,
      };
      this.peerConnection.send(ack);
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

      this.status = 'synced';
      this.updateConnectionStatus('online');
    } catch (error) {
      console.error(`❌ Fehler beim Verarbeiten von PATCH:`, error);
      // Sende trotzdem ACK, um Endlosschleife zu vermeiden
      const hash = stableHash(message.fields);
      const ack: AckMessage = {
        type: 'ACK',
        hash,
      };
      this.peerConnection.send(ack);
    }
  }

  /**
   * Verarbeitet ACK-Nachricht
   */
  private handleAck(_message: AckMessage): void {
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
