/**
 * Verschlüsselte Sicherung des gesamten Adressbuchs.
 *
 * Die Sicherung enthält das Adressbuch und den Schlüssel dieses Geräts,
 * damit sich Kontakte nach dem Wiederherstellen ohne neue Einladung wieder
 * verbinden. Verschlüsselt wird mit AES-256-GCM; der Schlüssel entsteht per
 * PBKDF2 aus dem gewählten Passwort.
 */

import { arrayBufferToBase64, base64ToArrayBuffer, type KeyPair } from '../utils/crypto';

const FORMAT = 'p2p-adressbuch-sicherung';
const ITERATIONS = 310000;

export interface BackupContent {
  /** Automerge-Dokument */
  snapshot: Uint8Array;
  keyPair: KeyPair | null;
}

interface BackupFile {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

export class BackupError extends Error {
  constructor(
    public reason: 'format' | 'password',
    message: string
  ) {
    super(message);
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(bytes: Uint8Array): string {
  return arrayBufferToBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

export async function createBackup(content: BackupContent, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);

  const payload = JSON.stringify({
    snapshot: toBase64(content.snapshot),
    keyPair: content.keyPair,
  });
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(payload)
  );

  const file: BackupFile = {
    format: FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: arrayBufferToBase64(encrypted),
  };
  return JSON.stringify(file);
}

export function isBackupFile(text: string): boolean {
  try {
    return JSON.parse(text)?.format === FORMAT;
  } catch {
    return false;
  }
}

export async function readBackup(text: string, password: string): Promise<BackupContent> {
  let file: BackupFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new BackupError('format', 'Das ist keine Sicherungsdatei dieser App.');
  }
  if (!file || file.format !== FORMAT || file.version !== 1) {
    throw new BackupError('format', 'Das ist keine Sicherungsdatei dieser App.');
  }

  let decrypted: ArrayBuffer;
  try {
    const key = await deriveKey(
      password,
      new Uint8Array(base64ToArrayBuffer(file.salt)),
      Math.min(Math.max(Number(file.iterations) || ITERATIONS, 1000), 5000000)
    );
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToArrayBuffer(file.iv)) as BufferSource },
      key,
      base64ToArrayBuffer(file.data)
    );
  } catch {
    throw new BackupError('password', 'Das Passwort passt nicht zu dieser Sicherung.');
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    const keyPair =
      payload.keyPair && typeof payload.keyPair.publicKey === 'string' && typeof payload.keyPair.privateKey === 'string'
        ? { publicKey: payload.keyPair.publicKey, privateKey: payload.keyPair.privateKey }
        : null;
    return { snapshot: new Uint8Array(base64ToArrayBuffer(payload.snapshot)), keyPair };
  } catch {
    throw new BackupError('format', 'Die Sicherung ist beschädigt.');
  }
}

const LAST_BACKUP_KEY = 'adressbuch.lastBackupAt';

export function getLastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function markBackupDone(): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    // ohne Speicherzugriff entfällt nur die Erinnerung
  }
}

/** Speichert Text als Datei auf dem Gerät */
export function downloadText(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
