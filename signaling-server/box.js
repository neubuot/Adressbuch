/**
 * Postfach: Zwischenlager für verschlüsselte Karten.
 *
 * Ein Fach hat eine zufällig aussehende Kennung (32 Hex-Zeichen), die nur die
 * beiden beteiligten Geräte berechnen können. Wer die Kennung kennt, darf das
 * Fach lesen und überschreiben. Der Dienst sieht nur die Kennung, die Größe,
 * den Zeitpunkt und die Netzadresse des Zugriffs, nie den Inhalt: Der ist auf
 * den Geräten verschlüsselt worden.
 *
 * Je Fach liegt genau ein Stand (der letzte). Fächer verfallen, wenn sie
 * lange nicht überschrieben wurden.
 *
 * Schnittstelle: POST /box mit JSON
 *   { "put": { "<fach>": "<daten>" }, "get": { "<fach>": "<bekannter stand oder leer>" } }
 * Antwort
 *   { "put": { "<fach>": "<stand>" }, "got": { "<fach>": { "v": "<stand>", "data": "<daten>" } } }
 * In "got" stehen nur Fächer, deren Stand vom bekannten abweicht.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const SLOT_PATTERN = /^[0-9a-f]{32}$/;
const DATA_PATTERN = /^[A-Za-z0-9+/=]+$/;

export const BOX_DEFAULTS = {
  /** Größe eines Fachs in Zeichen (Base64) */
  maxDataChars: 32 * 1024,
  /** Fächer je Anfrage */
  maxEntries: 200,
  /** Größe einer Anfrage in Bytes */
  maxBodyBytes: 2 * 1024 * 1024,
  /** Fächer insgesamt */
  maxSlots: 50000,
  /** Verfall nach so vielen Tagen ohne Überschreiben */
  ttlDays: 180,
  /** Anfragen je Netzadresse und Minute */
  ratePerMinute: 120,
};

function versionOf(data) {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/** Ablage im Arbeitsspeicher (geht beim Neustart verloren) */
class MemoryStore {
  constructor() {
    this.slots = new Map();
  }
  count() {
    return this.slots.size;
  }
  has(slot) {
    return this.slots.has(slot);
  }
  read(slot) {
    return this.slots.get(slot)?.data ?? null;
  }
  write(slot, data) {
    this.slots.set(slot, { data, at: Date.now() });
  }
  sweep(olderThan) {
    for (const [slot, entry] of this.slots) {
      if (entry.at < olderThan) this.slots.delete(slot);
    }
  }
}

/** Ablage als Dateien, eine je Fach */
class FileStore {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.known = new Set(fs.readdirSync(dir).filter((name) => SLOT_PATTERN.test(name)));
  }
  count() {
    return this.known.size;
  }
  has(slot) {
    return this.known.has(slot);
  }
  read(slot) {
    if (!this.known.has(slot)) return null;
    try {
      return fs.readFileSync(path.join(this.dir, slot), 'utf8');
    } catch {
      this.known.delete(slot);
      return null;
    }
  }
  write(slot, data) {
    const target = path.join(this.dir, slot);
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, data, { mode: 0o600 });
    fs.renameSync(temp, target);
    this.known.add(slot);
  }
  sweep(olderThan) {
    for (const slot of Array.from(this.known)) {
      try {
        const file = path.join(this.dir, slot);
        if (fs.statSync(file).mtimeMs < olderThan) {
          fs.unlinkSync(file);
          this.known.delete(slot);
        }
      } catch {
        this.known.delete(slot);
      }
    }
  }
}

function clientAddress(req) {
  const socketAddress = req.socket.remoteAddress || '';
  const local = socketAddress === '127.0.0.1' || socketAddress === '::1' || socketAddress === '::ffff:127.0.0.1';
  // Nur einem Reverse-Proxy auf demselben Rechner wird die weitergereichte Adresse geglaubt
  if (local) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
    if (forwarded) return forwarded;
  }
  return socketAddress;
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('zu groß'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Erzeugt das Postfach. `dir` leer: Ablage nur im Arbeitsspeicher.
 * Gibt `handle(req, res)` zurück (true, wenn die Anfrage zum Postfach gehörte).
 */
export function createBox({ dir = '', limits = {} } = {}) {
  const config = { ...BOX_DEFAULTS, ...limits };
  const storage = dir ? new FileStore(dir) : new MemoryStore();
  const buckets = new Map();

  const ttlMs = config.ttlDays * 24 * 60 * 60 * 1000;
  const sweepTimer = setInterval(() => {
    storage.sweep(Date.now() - ttlMs);
    const cutoff = Date.now() - 2 * 60 * 1000;
    for (const [address, bucket] of buckets) {
      if (bucket.start < cutoff) buckets.delete(address);
    }
  }, 60 * 60 * 1000);
  sweepTimer.unref?.();
  storage.sweep(Date.now() - ttlMs);

  function allowed(address) {
    const now = Date.now();
    let bucket = buckets.get(address);
    if (!bucket || now - bucket.start >= 60000) {
      bucket = { start: now, count: 0 };
      buckets.set(address, bucket);
    }
    bucket.count++;
    return bucket.count <= config.ratePerMinute;
  }

  function reply(res, status, body) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body === undefined ? '' : JSON.stringify(body));
  }

  async function handle(req, res) {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return false;
    }
    if (pathname !== '/box') return false;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return true;
    }
    if (req.method !== 'POST') {
      reply(res, 405, { error: 'Nur POST' });
      return true;
    }
    if (!allowed(clientAddress(req))) {
      reply(res, 429, { error: 'Zu viele Anfragen' });
      return true;
    }

    let request;
    try {
      request = JSON.parse(await readBody(req, config.maxBodyBytes));
    } catch {
      reply(res, 400, { error: 'Ungültige Anfrage' });
      return true;
    }
    const put = request && typeof request.put === 'object' && request.put ? Object.entries(request.put) : [];
    const get = request && typeof request.get === 'object' && request.get ? Object.entries(request.get) : [];
    if (put.length + get.length > config.maxEntries) {
      reply(res, 400, { error: 'Zu viele Fächer in einer Anfrage' });
      return true;
    }

    const result = { put: {}, got: {} };
    try {
      for (const [slot, data] of put) {
        if (!SLOT_PATTERN.test(slot)) continue;
        if (typeof data !== 'string' || data.length === 0 || data.length > config.maxDataChars) continue;
        if (!DATA_PATTERN.test(data)) continue;
        if (!storage.has(slot) && storage.count() >= config.maxSlots) continue;
        storage.write(slot, data);
        result.put[slot] = versionOf(data);
      }
      for (const [slot, known] of get) {
        if (!SLOT_PATTERN.test(slot)) continue;
        const data = storage.read(slot);
        if (data === null) continue;
        const v = versionOf(data);
        if (v !== known) result.got[slot] = { v, data };
      }
    } catch (error) {
      console.error('Postfach: Ablage fehlgeschlagen', error);
      reply(res, 500, { error: 'Ablage fehlgeschlagen' });
      return true;
    }
    reply(res, 200, result);
    return true;
  }

  return { handle, count: () => storage.count(), persistent: !!dir };
}
