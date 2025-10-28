/**
 * WebSocket-Signaling-Client
 */

export type SignalingEventType =
  | 'registered'
  | 'room-joined'
  | 'peer-joined'
  | 'peer-left'
  | 'signal'
  | 'error';

export interface SignalingEvent {
  type: SignalingEventType;
  [key: string]: unknown;
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private peerId: string;
  private listeners: Map<SignalingEventType, Array<(event: SignalingEvent) => void>> = new Map();
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(
    private url: string,
    peerId: string
  ) {
    this.peerId = peerId;
  }

  /**
   * Verbindet mit dem Signaling-Server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('🔌 Verbunden mit Signaling-Server');
          this.reconnectAttempts = 0;

          // Registriere Peer-ID
          this.send({
            type: 'register',
            peerId: this.peerId,
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Fehler beim Parsen der Signaling-Nachricht', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket-Fehler', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('🔌 Verbindung zum Signaling-Server geschlossen');
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Trennt die Verbindung
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Tritt einem Raum bei
   */
  joinRoom(roomCode: string): void {
    this.send({
      type: 'join-room',
      roomCode,
    });
  }

  /**
   * Verlässt den aktuellen Raum
   */
  leaveRoom(): void {
    this.send({
      type: 'leave-room',
    });
  }

  /**
   * Sendet ein WebRTC-Signal an einen Peer
   */
  sendSignal(targetPeerId: string, signal: unknown): void {
    this.send({
      type: 'signal',
      targetPeerId,
      signal,
    });
  }

  /**
   * Sendet eine Nachricht an den Server
   */
  private send(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket nicht verbunden, kann Nachricht nicht senden');
    }
  }

  /**
   * Verarbeitet eingehende Nachrichten
   */
  private handleMessage(message: SignalingEvent): void {
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach((listener) => listener(message));
    }
  }

  /**
   * Registriert einen Event-Listener
   */
  on(type: SignalingEventType, listener: (event: SignalingEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }

    this.listeners.get(type)!.push(listener);

    // Rückgabe: Cleanup-Funktion
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
   * Versucht, die Verbindung wiederherzustellen
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Maximale Anzahl an Reconnect-Versuchen erreicht');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`Versuche Reconnect in ${delay}ms (Versuch ${this.reconnectAttempts})`);

    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnect fehlgeschlagen', error);
      });
    }, delay);
  }

  /**
   * Gibt an, ob die Verbindung aktiv ist
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
