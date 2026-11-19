/**
 * P2P-Manager: verwaltet die direkten Verbindungen zu allen Kontakten.
 *
 * Die Oberfläche muss sich um nichts kümmern: Der Manager verbindet sich beim
 * Start mit allen bekannten Kontakten, baut abgebrochene Verbindungen wieder
 * auf und überträgt Änderungen an Karte oder Freigabe von selbst.
 */

import { SignalingClient, type SignalingStatus } from './signaling';
import { PeerConnection } from './peer-connection';
import { SyncController, type ContactDecision, type SyncHost } from './sync-controller';
import {
  getOrCreateKeyPair,
  generatePeerId,
  createFingerprint,
  generatePersistentRoomCode,
  generateConnectionCode,
  normalizeConnectionCode,
} from '../utils/crypto';
import { store } from '../store/automerge-store';
import type { SignalData } from 'simple-peer';

export interface P2PManagerConfig {
  signalingUrl: string;
}

/** Ereignisse für die Oberfläche */
export type LinkEvent =
  | { type: 'linked'; connectionId: string; isNew: boolean; viaInvite: boolean }
  | { type: 'incompatible'; connectionId: string }
  | { type: 'failed'; duringInvite: boolean };

interface Link {
  sessionId: string;
  peer: PeerConnection;
  controller: SyncController;
  roomCode?: string;
  connectionId?: string;
  connectTimer: number | null;
}

interface InviteContext {
  roomCode: string;
  fields: string[];
  /** Importierter Eintrag, der in diese Verbindung übergehen soll */
  mergeLocalId?: string;
}

const CONNECT_TIMEOUT_MS = 15000;
const MAX_REJOIN_DELAY_MS = 60000;

export class P2PManager implements SyncHost {
  private signalingClient: SignalingClient | null = null;
  private localSessionId: string;
  localPubKey = '';
  localPrivateKey = '';
  private localFingerprint = '';
  private links: Map<string, Link> = new Map(); // Sitzungs-ID → Verbindung
  private sessionRooms: Map<string, string> = new Map(); // Sitzungs-ID → Raum
  private persistentRooms: Map<string, string> = new Map(); // Kontakt-ID → Raum
  private rejoinAttempts: Map<string, number> = new Map();
  private rejoinTimers: Map<string, number> = new Map();
  private invite: InviteContext | null = null;
  private linkListeners: Array<(event: LinkEvent) => void> = [];
  private statusListeners: Array<(status: SignalingStatus) => void> = [];
  private unsubscribeStore: (() => void) | null = null;
  private syncTimer: number | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private destroyed = false;

  constructor(private config: P2PManagerConfig) {
    // Die Sitzungs-ID gilt nur für diesen Start der App
    this.localSessionId = generatePeerId();
  }

  /**
   * Startet den Manager. Schlägt nicht fehl, wenn der Vermittlungsdienst
   * gerade nicht erreichbar ist; die Verbindung wird im Hintergrund aufgebaut.
   */
  async init(): Promise<void> {
    if (this.isInitialized || this.isInitializing) return;
    this.isInitializing = true;

    try {
      const keyPair = await getOrCreateKeyPair();
      this.localPubKey = keyPair.publicKey;
      this.localPrivateKey = keyPair.privateKey;
      this.localFingerprint = await createFingerprint(this.localPubKey);
      if (this.destroyed) return;

      const signaling = new SignalingClient(this.config.signalingUrl, this.localSessionId);
      this.signalingClient = signaling;

      signaling.on('room-joined', (event) => {
        const roomCode = String(event.roomCode ?? '');
        const peers = Array.isArray(event.peers) ? (event.peers as unknown[]) : [];
        for (const peerId of peers) {
          this.handlePeerInRoom(String(peerId), roomCode);
        }
      });

      signaling.on('peer-joined', (event) => {
        this.handlePeerInRoom(String(event.peerId ?? ''), String(event.roomCode ?? ''));
      });

      signaling.on('signal', (event) => {
        this.handleSignal(String(event.fromPeerId ?? ''), event.signal as SignalData);
      });

      signaling.on('peer-left', (event) => {
        // Nur Verbindungsversuche abbrechen, die noch nicht stehen. Eine
        // bestehende direkte Verbindung braucht den Vermittlungsdienst nicht.
        const link = this.links.get(String(event.peerId ?? ''));
        if (link && !link.peer.isConnected()) {
          this.teardown(link.sessionId, false);
        }
      });

      signaling.onStatus((status) => {
        this.statusListeners.forEach((listener) => listener(status));
      });

      signaling.start();

      // Karte oder Freigabe geändert? Dann von selbst übertragen.
      this.unsubscribeStore = store.onChange(() => this.scheduleSync());

      await this.joinKnownContacts();
      this.isInitialized = true;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Betritt für jeden verbundenen Kontakt den gemeinsamen, dauerhaften Raum
   */
  private async joinKnownContacts(): Promise<void> {
    const connections = Object.values(store.getDoc().connections);
    for (const connection of connections) {
      if (connection.kind === 'local') continue;
      await this.joinPersistentRoom(connection.id);
    }
  }

  private async joinPersistentRoom(connectionId: string): Promise<string> {
    let roomCode = this.persistentRooms.get(connectionId);
    if (!roomCode) {
      roomCode = await generatePersistentRoomCode(this.localFingerprint, connectionId);
      this.persistentRooms.set(connectionId, roomCode);
    }
    this.signalingClient?.joinRoom(roomCode);
    return roomCode;
  }

  // --- Einladungen ---

  /**
   * Öffnet eine Einladung und gibt den Code zurück, den die andere Person
   * braucht. Solange die Einladung offen ist, kann sich genau über diesen
   * Code ein neuer Kontakt verbinden.
   */
  startInvite(fields: string[], mergeLocalId?: string): string {
    this.endInvite();
    const roomCode = generateConnectionCode();
    this.invite = { roomCode, fields: [...fields], mergeLocalId };
    this.signalingClient?.joinRoom(roomCode);
    return roomCode;
  }

  /**
   * Nimmt eine Einladung an (Code der anderen Person)
   */
  acceptInvite(code: string, fields: string[], mergeLocalId?: string): string {
    this.endInvite();
    const roomCode = normalizeConnectionCode(code);
    this.invite = { roomCode, fields: [...fields], mergeLocalId };
    this.signalingClient?.joinRoom(roomCode);
    return roomCode;
  }

  /** Ändert die Freigabe für den Kontakt, der über die offene Einladung entsteht */
  setInviteFields(fields: string[]): void {
    if (this.invite) this.invite.fields = [...fields];
  }

  /** Schließt die offene Einladung */
  endInvite(): void {
    if (!this.invite) return;
    this.signalingClient?.leaveRoom(this.invite.roomCode);
    this.invite = null;
  }

  // --- Verbindungsaufbau ---

  private handlePeerInRoom(remoteSessionId: string, roomCode: string): void {
    if (!remoteSessionId || remoteSessionId === this.localSessionId) return;
    if (roomCode) this.sessionRooms.set(remoteSessionId, roomCode);
    const existing = this.links.get(remoteSessionId);
    if (existing) {
      // Ein bereits verbundener Kontakt öffnet die Einladung: gleich melden
      if (existing.connectionId && this.invite && roomCode === this.invite.roomCode) {
        this.emit({ type: 'linked', connectionId: existing.connectionId, isNew: false, viaInvite: true });
      }
      return;
    }

    // Genau eine Seite beginnt: die mit der kleineren Sitzungs-ID.
    // So bauen nie beide gleichzeitig eine Verbindung zueinander auf.
    if (this.localSessionId < remoteSessionId) {
      this.createLink(remoteSessionId, true);
    }
  }

  private handleSignal(fromSessionId: string, signal: SignalData): void {
    if (!fromSessionId || !signal) return;
    let link = this.links.get(fromSessionId);

    const isOffer = (signal as { type?: string }).type === 'offer';
    if (link && isOffer && link.peer.isConnected()) {
      // Die Gegenseite beginnt neu: alte, auf ihrer Seite bereits beendete
      // Verbindung verwerfen.
      this.teardown(fromSessionId, false);
      link = undefined;
    }

    if (!link) {
      if (!isOffer) return;
      link = this.createLink(fromSessionId, false);
    }
    link.peer.signal(signal);
  }

  private createLink(remoteSessionId: string, initiator: boolean): Link {
    const peer = new PeerConnection(remoteSessionId, initiator);
    // Der Abgleich lauscht von Anfang an, damit keine Nachricht verloren geht
    const controller = new SyncController(remoteSessionId, peer, this);
    const link: Link = {
      sessionId: remoteSessionId,
      peer,
      controller,
      roomCode: this.sessionRooms.get(remoteSessionId),
      connectTimer: null,
    };

    peer.on('signal', (event) => {
      this.signalingClient?.sendSignal(remoteSessionId, event.data);
    });
    peer.on('connect', () => {
      if (link.connectTimer !== null) {
        clearTimeout(link.connectTimer);
        link.connectTimer = null;
      }
      controller.start();
    });
    peer.on('close', () => this.teardown(remoteSessionId, true));
    peer.on('error', () => this.teardown(remoteSessionId, true));

    link.connectTimer = window.setTimeout(() => {
      link.connectTimer = null;
      if (!peer.isConnected()) this.teardown(remoteSessionId, true);
    }, CONNECT_TIMEOUT_MS);

    this.links.set(remoteSessionId, link);
    peer.init();
    return link;
  }

  /**
   * Beendet eine Verbindung und sorgt bei Bedarf für einen neuen Versuch
   */
  private teardown(sessionId: string, retry: boolean): void {
    const link = this.links.get(sessionId);
    if (!link) return;
    this.links.delete(sessionId);

    if (link.connectTimer !== null) clearTimeout(link.connectTimer);
    const wasLinked = !!link.connectionId;
    link.controller.destroy();

    if (link.connectionId) {
      // Hat derselbe Kontakt noch eine zweite Verbindung (z. B. zweites Fenster)?
      const other = this.findLink(link.connectionId);
      if (other) void store.setConnectionStatus(link.connectionId, 'online');
    }

    if (this.destroyed || !retry) return;

    if (wasLinked && link.connectionId) {
      this.scheduleRejoin(link.connectionId);
    } else {
      const duringInvite = !!this.invite && link.roomCode === this.invite.roomCode;
      this.emit({ type: 'failed', duringInvite });
      if (link.roomCode) this.scheduleRoomRejoin(link.roomCode);
    }
  }

  private findLink(connectionId: string): Link | undefined {
    for (const link of this.links.values()) {
      if (link.connectionId === connectionId && link.controller.isReady()) return link;
    }
    return undefined;
  }

  /**
   * Nach einem Abbruch: den gemeinsamen Raum verlassen und neu betreten.
   * Das stößt auf beiden Seiten einen neuen Verbindungsaufbau an.
   */
  private scheduleRejoin(connectionId: string): void {
    const connection = store.getDoc().connections[connectionId];
    if (!connection || connection.kind === 'local') return;
    const roomCode = this.persistentRooms.get(connectionId);
    if (roomCode) this.scheduleRoomRejoin(roomCode);
  }

  private scheduleRoomRejoin(roomCode: string): void {
    if (this.rejoinTimers.has(roomCode)) return;
    const attempt = (this.rejoinAttempts.get(roomCode) ?? 0) + 1;
    this.rejoinAttempts.set(roomCode, attempt);
    const delay = Math.min(2000 * Math.pow(2, attempt - 1), MAX_REJOIN_DELAY_MS) + Math.random() * 500;

    const timer = window.setTimeout(() => {
      this.rejoinTimers.delete(roomCode);
      if (this.destroyed || !this.signalingClient) return;
      const stillWanted =
        this.invite?.roomCode === roomCode ||
        Array.from(this.persistentRooms.entries()).some(
          ([connectionId, code]) => code === roomCode && !!store.getDoc().connections[connectionId]
        );
      if (!stillWanted) return;
      this.signalingClient.leaveRoom(roomCode);
      this.signalingClient.joinRoom(roomCode);
    }, delay);
    this.rejoinTimers.set(roomCode, timer);
  }

  // --- Rückfragen des Abgleichs (SyncHost) ---

  async resolveContact(sessionId: string, connectionId: string, pubKey: string): Promise<ContactDecision> {
    if (connectionId === this.localFingerprint) return 'reject'; // eigenes zweites Fenster

    const existing = store.getDoc().connections[connectionId];
    if (existing && existing.kind !== 'local') return 'known';

    // Neue Kontakte entstehen nur über eine gerade offene Einladung
    const link = this.links.get(sessionId);
    const invite = this.invite;
    if (!link || !invite || link.roomCode !== invite.roomCode) return 'reject';

    await store.addConnection(connectionId, pubKey, invite.fields);
    if (invite.mergeLocalId) {
      await store.mergeLocalIntoLinked(invite.mergeLocalId, connectionId);
      invite.mergeLocalId = undefined;
    }
    return 'new';
  }

  onLinked(sessionId: string, connectionId: string, isNew: boolean): void {
    const link = this.links.get(sessionId);
    if (!link) return;
    link.connectionId = connectionId;

    void this.joinPersistentRoom(connectionId).then((roomCode) => {
      this.rejoinAttempts.delete(roomCode);
    });
    if (link.roomCode) this.rejoinAttempts.delete(link.roomCode);
    const viaInvite = isNew || (!!this.invite && link.roomCode === this.invite.roomCode);
    this.emit({ type: 'linked', connectionId, isNew, viaInvite });
  }

  onIncompatible(_sessionId: string, connectionId: string): void {
    this.emit({ type: 'incompatible', connectionId });
  }

  onRejected(sessionId: string): void {
    this.teardown(sessionId, false);
  }

  // --- Automatisches Übertragen ---

  private scheduleSync(): void {
    if (this.syncTimer !== null) return;
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      this.syncAll();
    }, 100);
  }

  private syncAll(): void {
    const connections = store.getDoc().connections;
    for (const link of Array.from(this.links.values())) {
      if (!link.connectionId) continue;
      if (!connections[link.connectionId]) {
        // Kontakt wurde entfernt: Verbindung beenden und Raum verlassen
        this.forgetContact(link.connectionId);
        continue;
      }
      link.controller.syncIfChanged();
    }
    // Entfernte Kontakte ohne aktive Verbindung ebenfalls vergessen
    for (const connectionId of Array.from(this.persistentRooms.keys())) {
      if (!connections[connectionId]) this.forgetContact(connectionId);
    }
  }

  private forgetContact(connectionId: string): void {
    for (const link of Array.from(this.links.values())) {
      if (link.connectionId === connectionId) this.teardown(link.sessionId, false);
    }
    const roomCode = this.persistentRooms.get(connectionId);
    if (roomCode) {
      this.signalingClient?.leaveRoom(roomCode);
      this.persistentRooms.delete(connectionId);
    }
  }

  /**
   * Überträgt die freigegebenen Felder erneut an einen Kontakt.
   * Wird nach Änderungen an Karte oder Freigabe automatisch erledigt; die
   * Methode gibt es für eine ausdrückliche Wiederholung.
   */
  async resyncConnection(connectionId: string): Promise<boolean> {
    const link = this.findLink(connectionId);
    if (!link) return false;
    await link.controller.resync();
    return true;
  }

  async resyncAll(): Promise<void> {
    for (const link of this.links.values()) {
      if (link.controller.isReady()) await link.controller.resync();
    }
  }

  // --- Zustand und Ereignisse ---

  onLink(listener: (event: LinkEvent) => void): () => void {
    this.linkListeners.push(listener);
    return () => {
      const index = this.linkListeners.indexOf(listener);
      if (index !== -1) this.linkListeners.splice(index, 1);
    };
  }

  private emit(event: LinkEvent): void {
    this.linkListeners.slice().forEach((listener) => listener(event));
  }

  /** Zustand des Vermittlungsdienstes */
  onServiceStatus(listener: (status: SignalingStatus) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      const index = this.statusListeners.indexOf(listener);
      if (index !== -1) this.statusListeners.splice(index, 1);
    };
  }

  getServiceStatus(): SignalingStatus {
    return this.signalingClient?.getStatus() ?? 'connecting';
  }

  getLocalPeerId(): string {
    return this.localSessionId;
  }

  getLocalPubKey(): string {
    return this.localPubKey;
  }

  async getFingerprint(): Promise<string> {
    return createFingerprint(this.localPubKey);
  }

  /**
   * Beendet den Manager
   */
  destroy(): void {
    this.destroyed = true;
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    if (this.syncTimer !== null) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    for (const timer of this.rejoinTimers.values()) clearTimeout(timer);
    this.rejoinTimers.clear();

    for (const sessionId of Array.from(this.links.keys())) {
      this.teardown(sessionId, false);
    }
    this.persistentRooms.clear();
    this.sessionRooms.clear();
    this.invite = null;

    if (this.signalingClient) {
      this.signalingClient.disconnect();
      this.signalingClient = null;
    }
    this.linkListeners = [];
    this.statusListeners = [];
    this.isInitialized = false;
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
