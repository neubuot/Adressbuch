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
 * Generiert eine zufällige Peer-ID
 */
export function generatePeerId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generiert einen 8-stelligen Verbindungscode
 */
export function generateConnectionCode(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < array.length; i++) {
    code += array[i].toString(36).toUpperCase().padStart(2, '0');
  }
  return code.substring(0, 8);
}

// Hilfsfunktionen
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
