/**
 * WebSocket-Client für den Vermittlungsdienst (Signaling).
 *
 * Der Dienst vermittelt nur den Verbindungsaufbau zwischen zwei Geräten;
 * Kontaktdaten laufen nie darüber. Der Client hält die Verbindung selbst
 * aufrecht: Er verbindet sich nach Abbrüchen erneut und tritt allen Räumen
 * wieder bei, damit die Oberfläche sich darum nicht kümmern muss.
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

export type SignalingStatus = 'connecting' | 'online' | 'offline';

const MAX_RECONNECT_DELAY_MS = 30000;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private peerId: string;
  private listeners: Map<SignalingEventType, Array<(event: SignalingEvent) => void>> = new Map();
  private statusListeners: Array<(status: SignalingStatus) => void> = [];
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private rooms = new Set<string>();
  private stopped = false;
  private status: SignalingStatus = 'connecting';

  constructor(
    private url: string,
    peerId: string
  ) {
    this.peerId = peerId;
  }

  /**
   * Startet die Verbindung. Schlägt der erste Versuch fehl, wird im
   * Hintergrund weiter versucht; die App bleibt ohne Dienst benutzbar.
   */
  start(): void {
    this.stopped = false;
    window.addEventListener('online', this.handleBrowserOnline);
    this.open();
  }

  private handleBrowserOnline = (): void => {
    if (this.stopped || this.isConnected()) return;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.open();
  };

  private open(): void {
    if (this.stopped) return;
    this.setStatus(this.status === 'online' ? 'online' : 'connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch (error) {
      console.warn('Vermittlungsdienst nicht erreichbar', error);
      this.setStatus('offline');
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.reconnectAttempts = 0;
      this.sendRaw({ type: 'register', peerId: this.peerId });
      // Nach jedem (Wieder-)Verbinden allen Räumen erneut beitreten
      for (const roomCode of this.rooms) {
        this.sendRaw({ type: 'join-room', roomCode });
      }
      this.setStatus('online');
    };

    socket.onmessage = (event) => {
      try {
        this.handleMessage(JSON.parse(event.data));
      } catch (error) {
        console.error('Nachricht des Vermittlungsdienstes nicht lesbar', error);
      }
    };

    socket.onerror = () => {
      // onclose folgt immer und übernimmt das erneute Verbinden
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      if (this.stopped) return;
      this.setStatus('offline');
      this.scheduleReconnect();
    };
  }

  /**
   * Trennt die Verbindung dauerhaft (kein erneutes Verbinden).
   */
  disconnect(): void {
    this.stopped = true;
    window.removeEventListener('online', this.handleBrowserOnline);
    this.clearReconnectTimer();
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    this.setStatus('offline');
  }

  /**
   * Tritt einem Raum bei. Ist der Dienst gerade nicht erreichbar, wird der
   * Beitritt nachgeholt, sobald die Verbindung steht.
   */
  joinRoom(roomCode: string): void {
    if (this.rooms.has(roomCode)) return;
    this.rooms.add(roomCode);
    if (this.isConnected()) {
      this.sendRaw({ type: 'join-room', roomCode });
    }
  }

  /**
   * Verlässt einen Raum.
   */
  leaveRoom(roomCode: string): void {
    if (!this.rooms.delete(roomCode)) return;
    if (this.isConnected()) {
      this.sendRaw({ type: 'leave-room', roomCode });
    }
  }

  /**
   * Sendet ein WebRTC-Signal an ein anderes Gerät
   */
  sendSignal(targetPeerId: string, signal: unknown): void {
    this.sendRaw({ type: 'signal', targetPeerId, signal });
  }

  private sendRaw(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: SignalingEvent): void {
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach((listener) => listener(message));
    }
  }

  on(type: SignalingEventType, listener: (event: SignalingEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);

    return () => {
      const listeners = this.listeners.get(type);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      }
    };
  }

  onStatus(listener: (status: SignalingStatus) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      const index = this.statusListeners.indexOf(listener);
      if (index !== -1) this.statusListeners.splice(index, 1);
    };
  }

  getStatus(): SignalingStatus {
    return this.status;
  }

  private setStatus(status: SignalingStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
