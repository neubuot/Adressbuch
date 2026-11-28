/**
 * Tresor für die Wiederherstellung über Vertraute.
 *
 * Der Tresor enthält dasselbe wie eine Sicherungsdatei (Adressbuch und
 * Schlüssel dieses Geräts), ist aber nicht mit einem Passwort verschlüsselt,
 * sondern mit einem zufälligen Schlüssel. Dieser Schlüssel wird geteilt
 * (siehe shamir.ts) und auf die Vertrauten verteilt. Jede und jeder
 * Vertraute bewahrt einen Teil und eine Kopie des Tresors auf. Ein Teil
 * allein öffnet den Tresor nicht.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/crypto';
import type { BackupContent } from '../io/backup';
import { combineShares, decodeShare, encodeShare, splitSecret } from './shamir';

const FORMAT = 'p2p-adressbuch-tresor';
export const VAULT_KEY_BYTES = 32;
/** Obergrenze für einen Tresor, den ein Gerät für jemanden aufbewahrt (Zeichen) */
export const MAX_VAULT_CHARS = 8_000_000;
export const MIN_TRUSTED = 2;
export const MAX_TRUSTED = 7;

interface VaultFile {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  iv: string;
  data: string;
}

function toBase64(bytes: Uint8Array): string {
  return arrayBufferToBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

function fromBase64(text: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(text));
}

async function importKey(key: Uint8Array): Promise<CryptoKey> {
  if (key.length !== VAULT_KEY_BYTES) throw new Error('Schlüssel hat die falsche Länge');
  return crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Erzeugt einen neuen Tresorschlüssel und zerlegt ihn in Teile (als Text) */
export function createVaultKey(count: number, threshold: number): { key: string; shares: string[] } {
  const key = crypto.getRandomValues(new Uint8Array(VAULT_KEY_BYTES));
  const shares = splitSecret(key, count, threshold).map(encodeShare);
  return { key: toBase64(key), shares };
}

/** Verschlüsselt Adressbuch und Geräteschlüssel mit dem Tresorschlüssel */
export async function sealVault(content: BackupContent, keyBase64: string): Promise<string> {
  const key = await importKey(fromBase64(keyBase64));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = JSON.stringify({ snapshot: toBase64(content.snapshot), keyPair: content.keyPair });
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(payload)
  );
  const file: VaultFile = {
    format: FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    iv: toBase64(iv),
    data: arrayBufferToBase64(encrypted),
  };
  return JSON.stringify(file);
}

export class VaultError extends Error {}

/**
 * Öffnet einen Tresor mit den übergebenen Teilen. Wirft einen VaultError,
 * wenn die Teile nicht genügen, nicht zusammenpassen oder der Tresor
 * beschädigt ist.
 */
export async function openVault(text: string, shares: string[]): Promise<BackupContent> {
  let file: VaultFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new VaultError('Der hinterlegte Tresor ist nicht lesbar.');
  }
  if (!file || file.format !== FORMAT || file.version !== 1) {
    throw new VaultError('Der hinterlegte Tresor ist nicht lesbar.');
  }

  let decrypted: ArrayBuffer;
  try {
    const secret = combineShares(shares.map(decodeShare));
    const key = await importKey(secret);
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.iv) as BufferSource },
      key,
      base64ToArrayBuffer(file.data)
    );
  } catch {
    throw new VaultError('Die Teile passen nicht zu diesem Tresor oder es sind zu wenige.');
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    const keyPair =
      payload.keyPair && typeof payload.keyPair.publicKey === 'string' && typeof payload.keyPair.privateKey === 'string'
        ? { publicKey: payload.keyPair.publicKey, privateKey: payload.keyPair.privateKey }
        : null;
    return { snapshot: fromBase64(payload.snapshot), keyPair };
  } catch {
    throw new VaultError('Der hinterlegte Tresor ist beschädigt.');
  }
}
