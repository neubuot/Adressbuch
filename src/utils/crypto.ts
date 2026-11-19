/**
 * Kryptografie-Utilities für Peer-Authentifizierung
 * Ed25519-Keypair-Generierung und Fingerprint-Erstellung
 */

export interface KeyPair {
  publicKey: string; // base64
  privateKey: string; // base64
}

/**
 * Generiert ein Ed25519-Keypair für das lokale Gerät
 * In Phase 1 nutzen wir SubtleCrypto für ECDSA (P-256)
 * da Ed25519 nicht überall verfügbar ist
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

/**
 * Erstellt einen Fingerprint (Hash) des Public Keys für Anzeige
 */
export async function createFingerprint(publicKeyBase64: string): Promise<string> {
  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // Format: XXXX-XXXX-XXXX-XXXX (erste 16 Zeichen)
  return hashHex
    .substring(0, 16)
    .toUpperCase()
    .match(/.{1,4}/g)!
    .join('-');
}

/**
 * Lädt oder generiert ein Keypair aus LocalStorage
 */
export async function getOrCreateKeyPair(): Promise<KeyPair> {
  const stored = localStorage.getItem('p2p-keypair');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.warn('Gespeichertes Keypair konnte nicht geladen werden, generiere neues', e);
    }
  }

  const newKeyPair = await generateKeyPair();
  localStorage.setItem('p2p-keypair', JSON.stringify(newKeyPair));
  return newKeyPair;
}

/**
 * Generiert eine persistente Peer-ID aus dem Public Key
 * Die ID ist deterministisch - gleicher Key = gleiche ID
 */
export async function createPeerIdFromPublicKey(publicKeyBase64: string): Promise<string> {
  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Verwende den vollen Hash (32 bytes = 64 hex chars)
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generiert eine zufällige Peer-ID
 * @deprecated Verwende createPeerIdFromPublicKey() für persistente IDs
 */
export function generatePeerId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generiert einen deterministischen Room-Code aus zwei Fingerprints
 * Dieser Code ist immer gleich, unabhängig von der Reihenfolge
 */
export async function generatePersistentRoomCode(
  fingerprint1: string,
  fingerprint2: string
): Promise<string> {
  // Sortiere Fingerprints für Reihenfolge-Unabhängigkeit
  const sorted = [fingerprint1, fingerprint2].sort();
  const combined = sorted.join('-');

  // Hash kombinierte Fingerprints
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Konvertiere zu 8-stelligem Code (wie normale Codes)
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 8).toUpperCase();
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Erzeugt einen 8-stelligen Einladungscode ohne verwechselbare Zeichen
 * (kein 0/O, kein 1/I).
 */
export function generateConnectionCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

/** Bringt einen eingetippten oder eingescannten Code in die einheitliche Form */
export function normalizeConnectionCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** Anzeigeform eines Codes: ABCD-EFGH */
export function formatConnectionCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Zufälliger Einmalwert für die Identitätsprüfung */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return arrayBufferToBase64(bytes.buffer);
}

const SIGN_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' } as const;
const KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;

/**
 * Signiert einen Text mit dem eigenen privaten Schlüssel
 */
export async function signText(privateKeyBase64: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKeyBase64),
    KEY_ALGORITHM,
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(SIGN_ALGORITHM, key, new TextEncoder().encode(text));
  return arrayBufferToBase64(signature);
}

/**
 * Prüft, ob eine Signatur zum angegebenen öffentlichen Schlüssel passt
 */
export async function verifyText(
  publicKeyBase64: string,
  text: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      base64ToArrayBuffer(publicKeyBase64),
      KEY_ALGORITHM,
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      SIGN_ALGORITHM,
      key,
      base64ToArrayBuffer(signatureBase64),
      new TextEncoder().encode(text)
    );
  } catch {
    return false;
  }
}

// Hilfsfunktionen
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
