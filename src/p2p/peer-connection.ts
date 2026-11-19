/**
 * WebRTC Peer-Verbindung mit simple-peer
 */

import SimplePeer from 'simple-peer';
import type { Instance, SignalData } from 'simple-peer';
import type { P2PMessage } from '../types';
import { getIceServers } from '../config';

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
  private outbox: P2PMessage[] = [];

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
        iceServers: getIceServers(),
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 10,
      },
      // Erhöhe Timeouts für bessere Verbindungsherstellung
      offerOptions: {
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      },
    });

    this.peer.on('signal', (signal: SignalData) => {
      this.emit('signal', { type: 'signal', data: signal });
    });

    this.peer.on('connect', () => {
      this.connected = true;
      // Zuerst die eigene Begrüßung (über das connect-Ereignis), dann Wartendes
      this.emit('connect', { type: 'connect' });
      const waiting = this.outbox;
      this.outbox = [];
      waiting.forEach((message) => this.sendNow(message));
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
      this.connected = false;
      this.emit('close', { type: 'close' });
    });

    this.peer.on('error', (error: Error) => {
      console.warn('Direkte Verbindung fehlgeschlagen:', error.message);
      this.emit('error', { type: 'error', error });
    });
  }

  /**
   * Verarbeitet ein eingehendes Signal
   */
  signal(signalData: SignalData): void {
    if (this.peer && !(this.peer as unknown as { destroyed?: boolean }).destroyed) {
      try {
        this.peer.signal(signalData);
      } catch (error) {
        console.warn('Signal konnte nicht verarbeitet werden', error);
      }
    }
  }

  /**
   * Sendet eine Nachricht an den Peer
   */
  send(message: P2PMessage): void {
    if (!this.peer) return;
    if (!this.connected) {
      // Die Gegenseite kann schon senden, bevor die Verbindung hier als
      // aufgebaut gemeldet ist. Antworten warten so lange, statt verloren zu gehen.
      if (this.outbox.length < 50) this.outbox.push(message);
      return;
    }
    this.sendNow(message);
  }

  private sendNow(message: P2PMessage): void {
    try {
      this.peer?.send(new TextEncoder().encode(JSON.stringify(message)));
    } catch (error) {
      console.warn('Nachricht konnte nicht gesendet werden', error);
    }
  }

  /**
   * Schließt die Verbindung
   */
  destroy(): void {
    this.listeners.clear();
    this.outbox = [];
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

  isInitiator(): boolean {
    return this.initiator;
  }
}
