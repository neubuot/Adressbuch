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
import { activeLimit, effectiveFields, projectFields, sanitizeLimit, shareState } from '../utils/policy';
import { stableHash } from '../utils/hash';
import { createFingerprint, createNonce, signText, verifyText } from '../utils/crypto';
import { APP_VERSION, SCHEMA_VERSION, isSchemaCompatible, type P2PMessage } from '../types';
import { contactName } from '../model/contact';
import type { VaultPutMessage } from '../types';
import { deleteCustody, getCustody, putCustody, type VaultPiece } from '../trust/custody';
import { MAX_VAULT_CHARS, sealVault } from '../trust/vault';
import { splitText, TextAssembler } from '../trust/chunks';

export type ContactDecision = 'known' | 'new' | 'reject' | 'recovery';

export interface SyncHost {
  localPubKey: string;
  localPrivateKey: string;
  /** Kennung dieses Geräts (Fingerabdruck des eigenen Schlüssels) */
  localFingerprint: string;
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
  /** Die Verbindung dient einer Wiederherstellung über Vertraute und steht */
  onRecoveryLinked(sessionId: string): Promise<void>;
  /** Ein Vertrauter hat seinen Teil übergeben; true, wenn er angenommen wurde */
  onRecoveryPiece(sessionId: string, piece: VaultPiece, from: string): Promise<boolean>;
  /** Die Gegenseite hat den übergebenen Teil bestätigt */
  onRecoveryDelivered(sessionId: string): void;
}

/** Wie alt ein hinterlegter Tresor höchstens sein darf, bevor er erneuert wird */
const VAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
  /** Vorstellungen, die in dieser Verbindung schon gesendet wurden */
  private sentIntros = new Set<string>();
  /** true: Diese Verbindung dient nur einer Wiederherstellung über Vertraute */
  private recoveryMode = false;
  private vaultAsked: string | null = null;
  private vaultDropSent = false;
  private depositing = false;
  private vaultIn = new TextAssembler(MAX_VAULT_CHARS);
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
        await this.handlePatch(message.schemaVersion, message.fields, message.until, message.keep);
        break;
      case 'ACK':
        await this.handleAck();
        break;
      case 'INTRO':
        await this.handleIntro(message.id, message.pubKey, message.name);
        break;
      case 'VAULT_CHECK':
        await this.handleVaultCheck();
        break;
      case 'VAULT_STATE':
        await this.handleVaultState(message.setId, message.version);
        break;
      case 'VAULT_PUT':
      case 'RECOVER_PUT':
        await this.handleVaultPut(message);
        break;
      case 'VAULT_ACK':
        if (this.ready && this.connectionId && typeof message.setId === 'string' && typeof message.version === 'string') {
          await store.markDeposited(this.connectionId, message.setId, message.version);
        }
        break;
      case 'RECOVER_ACK':
        if (this.recoveryMode) this.host.onRecoveryDelivered(this.sessionId);
        break;
      case 'VAULT_DROP':
        if (this.ready && this.connectionId) {
          await deleteCustody(this.connectionId);
          await store.setCustodyMarker(this.connectionId, null);
          this.peerConnection.send({ type: 'VAULT_DROPPED' });
        }
        break;
      case 'VAULT_DROPPED':
        if (this.ready && this.connectionId) await store.markDropDelivered(this.connectionId);
        break;
      case 'INTRO_ACK':
        if (this.ready && this.connectionId && typeof message.id === 'string') {
          await store.markIntroDelivered(message.id, this.connectionId);
        }
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
    if (decision === 'recovery') {
      // Kein Kontakt, kein Abgleich: nur die Übergabe für die Wiederherstellung
      this.recoveryMode = true;
      await this.host.onRecoveryLinked(this.sessionId);
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
    this.sendIntros();
    this.sendVaultCheck();
  }

  // --- Wiederherstellung über Vertraute ---

  /**
   * Ist dieser Kontakt ein Vertrauter, wird gefragt, welchen Stand des
   * Tresors er aufbewahrt. Frühere Vertraute werden gebeten zu löschen.
   */
  private sendVaultCheck(): void {
    if (!this.ready || !this.connectionId) return;
    const doc = store.getDoc();
    if (!this.vaultDropSent && doc.trustDropped?.includes(this.connectionId) && !doc.trust?.members[this.connectionId]) {
      this.vaultDropSent = true;
      this.peerConnection.send({ type: 'VAULT_DROP' });
    }
    const trust = doc.trust;
    const member = trust?.members[this.connectionId];
    if (!trust || !member) return;
    const stamp = `${trust.setId}|${member.depositedAt ?? ''}`;
    if (this.vaultAsked === stamp) return;
    this.vaultAsked = stamp;
    this.peerConnection.send({ type: 'VAULT_CHECK', setId: trust.setId });
  }

  /** Antwortet, was dieses Gerät für den Kontakt aufbewahrt */
  private async handleVaultCheck(): Promise<void> {
    if (!this.ready || !this.connectionId) return;
    const custody = await getCustody(this.connectionId);
    await store.setCustodyMarker(this.connectionId, custody ? { setId: custody.setId, version: custody.version } : null);
    this.peerConnection.send({
      type: 'VAULT_STATE',
      setId: custody ? custody.setId : null,
      version: custody ? custody.version : null,
    });
  }

  /** Hinterlegt den Tresor neu, wenn der Kontakt keinen oder einen alten Stand hat */
  private async handleVaultState(setId: unknown, version: unknown): Promise<void> {
    if (!this.ready || !this.connectionId || this.depositing) return;
    const trust = store.getDoc().trust;
    const member = trust?.members[this.connectionId];
    if (!trust || !member) return;

    const age = typeof version === 'string' ? Date.now() - Date.parse(version) : NaN;
    const current = setId === trust.setId && Number.isFinite(age) && age < VAULT_MAX_AGE_MS && !!member.depositedAt;
    if (current) return;

    this.depositing = true;
    try {
      const vault = await sealVault(
        { snapshot: store.export(), keyPair: { publicKey: this.host.localPubKey, privateKey: this.host.localPrivateKey } },
        trust.key
      );
      if (vault.length > MAX_VAULT_CHARS) {
        console.warn('Das Adressbuch ist zu groß, um es bei Vertrauten zu hinterlegen');
        return;
      }
      this.sendPiece('VAULT_PUT', {
        setId: trust.setId,
        threshold: trust.threshold,
        share: member.share,
        version: new Date().toISOString(),
        vault,
      });
    } finally {
      this.depositing = false;
    }
  }

  private sendPiece(type: 'VAULT_PUT' | 'RECOVER_PUT', piece: VaultPiece, from?: string): void {
    const parts = splitText(piece.vault);
    parts.forEach((data, seq) => {
      this.peerConnection.send({
        type,
        setId: piece.setId,
        threshold: piece.threshold,
        share: piece.share,
        version: piece.version,
        seq,
        total: parts.length,
        data,
        ...(from ? { from } : {}),
      });
    });
  }

  /** Übergibt bei einer Wiederherstellung den aufbewahrten Teil samt Tresor */
  sendRecoveryPiece(piece: VaultPiece, from: string): void {
    if (!this.recoveryMode || this.destroyed) return;
    this.sendPiece('RECOVER_PUT', piece, from);
  }

  private async handleVaultPut(message: VaultPutMessage): Promise<void> {
    const forCustody = message.type === 'VAULT_PUT';
    if (forCustody ? !this.ready || !this.connectionId : !this.recoveryMode) return;

    const { setId, threshold, share, version } = message;
    if (typeof setId !== 'string' || setId.length < 8 || setId.length > 80) return;
    if (typeof share !== 'string' || share.length < 4 || share.length > 300) return;
    if (typeof version !== 'string' || version.length > 40 || !Number.isFinite(Date.parse(version))) return;
    if (typeof threshold !== 'number' || !Number.isInteger(threshold) || threshold < 2 || threshold > 255) return;

    const vault = this.vaultIn.add(`${message.type}|${setId}|${version}|${share}`, message.seq, message.total, message.data);
    if (vault === null) return;
    const piece: VaultPiece = { setId, threshold, share, version, vault };

    if (forCustody && this.connectionId) {
      await putCustody(this.connectionId, piece);
      await store.setCustodyMarker(this.connectionId, { setId, version });
      this.peerConnection.send({ type: 'VAULT_ACK', setId, version });
      return;
    }
    const from = typeof message.from === 'string' ? message.from.slice(0, 120) : '';
    if (await this.host.onRecoveryPiece(this.sessionId, piece, from)) {
      this.peerConnection.send({ type: 'RECOVER_ACK', setId, version });
    }
  }

  /**
   * Sendet Vorstellungen, die dieser Kontakt noch nicht erhalten hat:
   * den Namen und den Schlüssel der jeweils anderen Person.
   */
  private sendIntros(): void {
    if (!this.ready || !this.connectionId) return;
    const doc = store.getDoc();
    for (const intro of Object.values(doc.introsOut ?? {})) {
      const isA = intro.aId === this.connectionId;
      const isB = intro.bId === this.connectionId;
      if (!isA && !isB) continue;
      if ((isA && intro.deliveredA) || (isB && intro.deliveredB)) continue;
      if (this.sentIntros.has(intro.id)) continue;
      const other = doc.connections[isA ? intro.bId : intro.aId];
      if (!other || other.kind === 'local' || !other.peerPubKey) continue;
      this.sentIntros.add(intro.id);
      this.peerConnection.send({ type: 'INTRO', id: intro.id, pubKey: other.peerPubKey, name: contactName(other) });
    }
  }

  private async handleIntro(id: unknown, pubKey: unknown, name: unknown): Promise<void> {
    if (!this.ready || !this.connectionId) return;
    if (typeof id !== 'string' || id.length < 8 || id.length > 80) return;
    if (typeof pubKey !== 'string' || pubKey.length < 16 || pubKey.length > 1000) return;
    if (typeof name !== 'string') return;
    let fingerprint: string;
    try {
      fingerprint = await createFingerprint(pubKey);
    } catch {
      return;
    }
    const accepted = await store.receiveIntro(this.connectionId, { id, pubKey, name }, fingerprint, this.host.localFingerprint);
    if (accepted) this.peerConnection.send({ type: 'INTRO_ACK', id });
  }

  /** Teilt der Gegenseite mit, welchen Stand ihrer Karte ich habe */
  private sendStateHash(): void {
    const connection = this.getConnection();
    if (!connection) return;
    const limit = sanitizeLimit(connection.remoteUntil, connection.remoteKeep);
    const hash = connection.remoteCard ? stableHash(shareState(connection.remoteCard, limit)) : NO_CARD_YET;
    this.peerConnection.send({ type: 'STATE_HASH', hash });
  }

  private async handleStateHash(remoteHash: unknown): Promise<void> {
    if (!this.ready) return;
    const connection = this.getConnection();
    if (!connection) return;

    const localHash = this.localHash(connection);
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

    const fields = projectFields(store.getDoc().myCard, effectiveFields(connection));
    const limit = activeLimit(connection);
    this.lastSentHash = stableHash(shareState(fields, limit));
    this.peerConnection.send({
      type: 'PATCH',
      schemaVersion: SCHEMA_VERSION,
      fields,
      ...(limit ? { until: limit.until, keep: limit.keep } : {}),
    });
  }

  /** Vergleichswert für das, was dieser Kontakt gerade von mir sehen darf */
  private localHash(connection: NonNullable<ReturnType<SyncController['getConnection']>>): string {
    const fields = projectFields(store.getDoc().myCard, effectiveFields(connection));
    return stableHash(shareState(fields, activeLimit(connection)));
  }

  private async handlePatch(schemaVersion: unknown, fields: unknown, until?: unknown, keep?: unknown): Promise<void> {
    if (!this.ready || !this.connectionId) return;
    if (!isSchemaCompatible(typeof schemaVersion === 'string' ? schemaVersion : undefined)) return;
    const connection = this.getConnection();
    if (!connection) return;

    if (connection.storeRemoteCard) {
      await store.applyRemoteCard(this.connectionId, fields, sanitizeLimit(until, keep));
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
    const hash = this.localHash(connection);
    if (hash !== this.lastSentHash) {
      this.sendPatch();
    }
    this.sendIntros();
    this.sendVaultCheck();
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
