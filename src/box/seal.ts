/**
 * Verschlüsselung für das Postfach.
 *
 * Zwei verbundene Geräte kennen den öffentlichen Schlüssel des jeweils
 * anderen. Daraus und aus dem eigenen privaten Schlüssel berechnen beide
 * dasselbe Geheimnis (ECDH über P-256), ohne dass es je übertragen wird.
 * Aus dem Geheimnis entstehen je Richtung
 *   - die Kennung des Fachs (zufällig aussehend, 32 Hex-Zeichen) und
 *   - ein Schlüssel für AES-256-GCM.
 * Der Dienst, der die Fächer aufbewahrt, kennt weder das Geheimnis noch die
 * Schlüssel und kann den Inhalt nicht lesen.
 *
 * Hinweis: Der Geräteschlüssel dient damit sowohl dem Signieren (ECDSA) als
 * auch der Schlüsselvereinbarung (ECDH). Das ist für P-256 üblich, aber
 * keine getrennte Schlüsselführung, und es gibt keine Folgenlosigkeit: Wer
 * später einen privaten Geräteschlüssel erbeutet, kann aufgezeichnete Fächer
 * dieses Geräts nachträglich lesen.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/crypto';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const PAD_BLOCK = 512;

/** Ein Fach in einer Richtung: Kennung beim Dienst und Schlüssel für den Inhalt */
export interface BoxChannel {
  slot: string;
  key: CryptoKey;
}

export interface BoxChannels {
  /** Von mir an den Kontakt */
  outbound: BoxChannel;
  /** Vom Kontakt an mich */
  inbound: BoxChannel;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Liest den eigenen privaten Geräteschlüssel für die Schlüsselvereinbarung ein */
export function importBoxPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', base64ToArrayBuffer(privateKeyBase64), ECDH, false, ['deriveBits']);
}

async function deriveChannel(secret: CryptoKey, fromPubKey: string, toPubKey: string): Promise<BoxChannel> {
  const encoder = new TextEncoder();
  const label = `p2p-adressbuch|postfach|v1|${fromPubKey}>${toPubKey}`;
  const salt = new Uint8Array(32);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(`${label}|schluessel`) },
    secret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  const slotBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(`${label}|fach`) },
    secret,
    128
  );
  return { slot: toHex(slotBits), key };
}

/**
 * Berechnet die beiden Fächer (hin und zurück) für einen Kontakt.
 */
export async function deriveChannels(
  privateKey: CryptoKey,
  localPubKey: string,
  peerPubKey: string
): Promise<BoxChannels> {
  const peerKey = await crypto.subtle.importKey('spki', base64ToArrayBuffer(peerPubKey), ECDH, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerKey }, privateKey, 256);
  const secret = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits', 'deriveKey']);
  return {
    outbound: await deriveChannel(secret, localPubKey, peerPubKey),
    inbound: await deriveChannel(secret, peerPubKey, localPubKey),
  };
}

/**
 * Verschlüsselt einen Inhalt für ein Fach. Der Klartext wird auf volle
 * Blöcke aufgefüllt, damit die Größe wenig über den Inhalt verrät.
 */
export async function sealBox(key: CryptoKey, content: unknown): Promise<string> {
  const json = JSON.stringify(content);
  const bytes = new TextEncoder().encode(json);
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / PAD_BLOCK) * PAD_BLOCK).fill(0x20);
  padded.set(bytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, padded);
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), iv.length);
  return arrayBufferToBase64(out.buffer);
}

/** Entschlüsselt den Inhalt eines Fachs. Gibt null zurück, wenn er nicht passt. */
export async function openBox(key: CryptoKey, data: string): Promise<unknown> {
  try {
    const bytes = new Uint8Array(base64ToArrayBuffer(data));
    if (bytes.length < 12 + 16) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}
