/**
 * Geheimnis teilen nach Shamir über dem Körper GF(256).
 *
 * Ein Geheimnis (hier: ein Schlüssel aus 32 Bytes) wird in n Teile zerlegt.
 * Beliebige k davon ergeben das Geheimnis wieder, weniger als k verraten
 * nichts darüber. Jedes Byte wird einzeln geteilt: Es ist der Wert eines
 * zufälligen Polynoms vom Grad k-1 an der Stelle 0, die Teile sind die Werte
 * an den Stellen 1 bis n.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

// Potenz- und Logarithmentafel zum Erzeuger 3 (Polynom x^8 + x^4 + x^3 + x + 1)
(() => {
  let value = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = value;
    LOG[value] = i;
    // mal 3 = mal 2 plus sich selbst
    let doubled = value << 1;
    if (doubled & 0x100) doubled ^= 0x11b;
    value = doubled ^ value;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function div(a: number, b: number): number {
  if (b === 0) throw new Error('Division durch null');
  if (a === 0) return 0;
  return EXP[LOG[a] + 255 - LOG[b]];
}

export interface Share {
  /** Stelle des Teils, 1 bis 255 */
  x: number;
  y: Uint8Array;
}

export const MAX_SHARES = 255;

/**
 * Zerlegt ein Geheimnis in `count` Teile, von denen `threshold` genügen.
 * `random` liefert Zufallsbytes (Standard: der sichere Zufall des Browsers).
 */
export function splitSecret(
  secret: Uint8Array,
  count: number,
  threshold: number,
  random: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length))
): Share[] {
  if (!Number.isInteger(count) || !Number.isInteger(threshold)) throw new Error('Ungültige Anzahl');
  if (threshold < 2 || count < threshold || count > MAX_SHARES) throw new Error('Ungültige Anzahl');
  if (secret.length === 0) throw new Error('Leeres Geheimnis');

  const shares: Share[] = [];
  for (let x = 1; x <= count; x++) shares.push({ x, y: new Uint8Array(secret.length) });

  for (let position = 0; position < secret.length; position++) {
    // Koeffizienten: das Geheimnisbyte, dann threshold-1 zufällige Bytes
    const coefficients = new Uint8Array(threshold);
    coefficients[0] = secret[position];
    coefficients.set(random(threshold - 1), 1);

    for (const share of shares) {
      // Horner-Schema von der höchsten Potenz abwärts
      let value = 0;
      for (let i = threshold - 1; i >= 0; i--) value = mul(value, share.x) ^ coefficients[i];
      share.y[position] = value;
    }
  }
  return shares;
}

/**
 * Setzt das Geheimnis aus Teilen zusammen (Interpolation an der Stelle 0).
 * Mit zu wenigen oder falschen Teilen entsteht ein anderer, wertloser Wert.
 * Ob er stimmt, zeigt erst das Entschlüsseln.
 */
export function combineShares(shares: Share[]): Uint8Array {
  if (shares.length < 2) throw new Error('Zu wenige Teile');
  const length = shares[0].y.length;
  const seen = new Set<number>();
  for (const share of shares) {
    if (share.x < 1 || share.x > MAX_SHARES || seen.has(share.x)) throw new Error('Teile passen nicht zusammen');
    if (share.y.length !== length) throw new Error('Teile passen nicht zusammen');
    seen.add(share.x);
  }

  const secret = new Uint8Array(length);
  for (let i = 0; i < shares.length; i++) {
    // Lagrange-Faktor für die Stelle 0: Produkt über x_j / (x_j + x_i)
    let factor = 1;
    for (let j = 0; j < shares.length; j++) {
      if (i === j) continue;
      factor = mul(factor, div(shares[j].x, shares[j].x ^ shares[i].x));
    }
    for (let position = 0; position < length; position++) {
      secret[position] ^= mul(shares[i].y[position], factor);
    }
  }
  return secret;
}

/** Ein Teil als Text (base64 aus Stelle und Wert) */
export function encodeShare(share: Share): string {
  const bytes = new Uint8Array(share.y.length + 1);
  bytes[0] = share.x;
  bytes.set(share.y, 1);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeShare(text: string): Share {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    throw new Error('Teil ist nicht lesbar');
  }
  if (binary.length < 2 || binary.length > 200) throw new Error('Teil ist nicht lesbar');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes[0] < 1) throw new Error('Teil ist nicht lesbar');
  return { x: bytes[0], y: bytes.slice(1) };
}
