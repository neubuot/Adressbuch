/**
 * P2P-Manager: Verwaltet alle Peer-Verbindungen
 */

import { SignalingClient } from './signaling';
import { PeerConnection } from './peer-connection';
import { SyncController } from './sync-controller';
import { getOrCreateKeyPair, generatePeerId, createFingerprint } from '../utils/crypto';
import { store } from '../store/automerge-store';
import type { SignalData } from 'simple-peer';

export interface P2PManagerConfig {
  signalingUrl: string;
}

export class P2PManager {
  private signalingClient: SignalingClient | null = null;
  private localPeerId: string;
  private localPubKey: string = '';
  private syncControllers: Map<string, SyncController> = new Map();
  private pendingConnections: Map<string, PeerConnection> = new Map();

  constructor(private config: P2PManagerConfig) {
    this.localPeerId = generatePeerId();
  }

  /**
   * Initialisiert den P2P-Manager
   */
  async init(): Promise<void> {
    // Keypair laden/erstellen
    const keyPair = await getOrCreateKeyPair();
    this.localPubKey = keyPair.publicKey;

    console.log(`🔑 Lokale Peer-ID: ${this.localPeerId}`);
    console.log(`🔑 Fingerprint: ${await createFingerprint(this.localPubKey)}`);

    // Signaling-Client verbinden
    this.signalingClient = new SignalingClient(this.config.signalingUrl, this.localPeerId);

    this.signalingClient.on('peer-joined', (event) => {
      const remotePeerId = event.peerId as string;
      console.log(`👤 Peer beigetreten: ${remotePeerId}`);
      this.initiateConnection(remotePeerId);
    });

    this.signalingClient.on('signal', (event) => {
      const signal = event.signal as SignalData;
      const fromPeerId = event.fromPeerId as string;
      this.handleSignal(fromPeerId, signal);
    });

    this.signalingClient.on('peer-left', (event) => {
      const peerId = event.peerId as string;
      console.log(`👋 Peer verlassen: ${peerId}`);
      this.removeConnection(peerId);
    });

    await this.signalingClient.connect();
  }

  /**
   * Tritt einem Raum bei (via Verbindungscode)
   */
  joinRoom(roomCode: string): void {
    if (this.signalingClient) {
      this.signalingClient.joinRoom(roomCode);
    }
  }

  /**
   * Erstellt eine ausgehende Verbindung zu einem Peer
   */
  private initiateConnection(remotePeerId: string): void {
    console.log(`🔗 Initiiere Verbindung zu ${remotePeerId}`);

    const peerConnection = new PeerConnection(remotePeerId, true);

    peerConnection.on('signal', (event) => {
      if (this.signalingClient) {
        this.signalingClient.sendSignal(remotePeerId, event.data);
      }
    });

    peerConnection.on('connect', () => {
      this.setupSyncController(remotePeerId, peerConnection);
    });

    this.pendingConnections.set(remotePeerId, peerConnection);
    peerConnection.init();
  }

  /**
   * Verarbeitet eingehendes Signal
   */
  private handleSignal(fromPeerId: string, signal: SignalData): void {
    let peerConnection = this.pendingConnections.get(fromPeerId);

    if (!peerConnection) {
      // Eingehende Verbindung: erstelle neue Peer-Verbindung
      console.log(`📞 Eingehende Verbindung von ${fromPeerId}`);

      peerConnection = new PeerConnection(fromPeerId, false);

      peerConnection.on('signal', (event) => {
        if (this.signalingClient) {
          this.signalingClient.sendSignal(fromPeerId, event.data);
        }
      });

      peerConnection.on('connect', () => {
        this.setupSyncController(fromPeerId, peerConnection!);
      });

      this.pendingConnections.set(fromPeerId, peerConnection);
      peerConnection.init();
    }

    // Signal weiterleiten
    peerConnection.signal(signal);
  }

  /**
   * Richtet den Sync-Controller für eine Verbindung ein
   */
  private setupSyncController(peerId: string, peerConnection: PeerConnection): void {
    console.log(`✅ Verbindung zu ${peerId} hergestellt, richte Sync ein`);

    // Verbindung ist bereits hergestellt, daher alreadyConnected = true
    const syncController = new SyncController(peerId, peerConnection, this.localPubKey, true);

    this.syncControllers.set(peerId, syncController);
    this.pendingConnections.delete(peerId);

    // Update Store
    store.updateConnection(peerId, {
      status: 'syncing',
    });
  }

  /**
   * Entfernt eine Verbindung
   */
  private removeConnection(peerId: string): void {
    const syncController = this.syncControllers.get(peerId);
    if (syncController) {
      syncController.destroy();
      this.syncControllers.delete(peerId);
    }

    const pendingConnection = this.pendingConnections.get(peerId);
    if (pendingConnection) {
      pendingConnection.destroy();
      this.pendingConnections.delete(peerId);
    }

    store.updateConnection(peerId, {
      status: 'offline',
    });
  }

  /**
   * Fügt eine neue Verbindung hinzu
   */
  async addConnection(
    peerId: string,
    peerPubKey: string,
    allowedFields: string[]
  ): Promise<void> {
    await store.addConnection(peerId, peerPubKey, allowedFields);
  }

  /**
   * Triggert Resync für eine Verbindung
   */
  async resyncConnection(peerId: string): Promise<void> {
    const syncController = this.syncControllers.get(peerId);
    if (syncController) {
      await syncController.resync();
    }
  }

  /**
   * Triggert Resync für alle Verbindungen
   */
  async resyncAll(): Promise<void> {
    for (const syncController of this.syncControllers.values()) {
      await syncController.resync();
    }
  }

  /**
   * Gibt die lokale Peer-ID zurück
   */
  getLocalPeerId(): string {
    return this.localPeerId;
  }

  /**
   * Gibt den lokalen Public Key zurück
   */
  getLocalPubKey(): string {
    return this.localPubKey;
  }

  /**
   * Gibt den Fingerprint zurück
   */
  async getFingerprint(): Promise<string> {
    return createFingerprint(this.localPubKey);
  }

  /**
   * Beendet den P2P-Manager
   */
  destroy(): void {
    // Alle Verbindungen schließen
    for (const syncController of this.syncControllers.values()) {
      syncController.destroy();
    }
    this.syncControllers.clear();

    for (const peerConnection of this.pendingConnections.values()) {
      peerConnection.destroy();
    }
    this.pendingConnections.clear();

    // Signaling-Client trennen
    if (this.signalingClient) {
      this.signalingClient.disconnect();
      this.signalingClient = null;
    }
  }
}

// Globale Manager-Instanz
let globalManager: P2PManager | null = null;

export function initP2PManager(config: P2PManagerConfig): P2PManager {
  if (globalManager) {
    globalManager.destroy();
  }

  globalManager = new P2PManager(config);
  return globalManager;
}

export function getP2PManager(): P2PManager | null {
  return globalManager;
}
