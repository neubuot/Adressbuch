/**
 * WebRTC Peer-Verbindung mit simple-peer
 */

import SimplePeer from 'simple-peer';
import type { Instance, SignalData } from 'simple-peer';
import type { P2PMessage } from '../types';

export type PeerConnectionEventType =
  | 'signal'
  | 'connect'
  | 'data'
  | 'close'
  | 'error'
  | 'stream';

export interface PeerConnectionEvent {
  type: PeerConnectionEventType;
  data?: unknown;
  error?: Error;
}

export class PeerConnection {
  private peer: Instance | null = null;
  private listeners: Map<PeerConnectionEventType, Array<(event: PeerConnectionEvent) => void>> =
    new Map();
  private connected = false;

  constructor(
    private peerId: string,
    private initiator: boolean
  ) {}

  /**
   * Initialisiert die Peer-Verbindung
   */
  init(): void {
    this.peer = new SimplePeer({
      initiator: this.initiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    this.peer.on('signal', (signal: SignalData) => {
      this.emit('signal', { type: 'signal', data: signal });
    });

    this.peer.on('connect', () => {
      console.log(`✅ WebRTC-Verbindung zu ${this.peerId} hergestellt`);
      this.connected = true;
      this.emit('connect', { type: 'connect' });
    });

    this.peer.on('data', (data: Uint8Array) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(data)) as P2PMessage;
        this.emit('data', { type: 'data', data: message });
      } catch (error) {
        console.error('Fehler beim Parsen der P2P-Nachricht', error);
      }
    });

    this.peer.on('close', () => {
      console.log(`❌ WebRTC-Verbindung zu ${this.peerId} geschlossen`);
      this.connected = false;
      this.emit('close', { type: 'close' });
    });

    this.peer.on('error', (error: Error) => {
      console.error(`WebRTC-Fehler mit ${this.peerId}:`, error);
      this.emit('error', { type: 'error', error });
    });
  }

  /**
   * Verarbeitet ein eingehendes Signal
   */
  signal(signalData: SignalData): void {
    if (this.peer) {
      this.peer.signal(signalData);
    }
  }

  /**
   * Sendet eine Nachricht an den Peer
   */
  send(message: P2PMessage): void {
    if (this.peer && this.connected) {
      const data = new TextEncoder().encode(JSON.stringify(message));
      this.peer.send(data);
    } else {
      console.warn(`Peer ${this.peerId} nicht verbunden, kann Nachricht nicht senden`);
    }
  }

  /**
   * Schließt die Verbindung
   */
  destroy(): void {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connected = false;
  }

  /**
   * Gibt an, ob die Verbindung aktiv ist
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Registriert einen Event-Listener
   */
  on(
    type: PeerConnectionEventType,
    listener: (event: PeerConnectionEvent) => void
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }

    this.listeners.get(type)!.push(listener);

    return () => {
      const listeners = this.listeners.get(type);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Emittiert ein Event
   */
  private emit(type: PeerConnectionEventType, event: PeerConnectionEvent): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
  }

  /**
   * Gibt die Peer-ID zurück
   */
  getPeerId(): string {
    return this.peerId;
  }
}
