/**
 * Vermittlungsdienst für das P2P-Adressbuch.
 *
 * Aufgaben:
 *   1. Vermittelt den Verbindungsaufbau zwischen zwei Geräten (WebSocket,
 *      Pfad /signal). Kontaktdaten laufen nie über diesen Dienst; er sieht
 *      nur zufällige Sitzungs-IDs, Raumcodes und technische Verbindungsdaten.
 *   2. Liefert auf Wunsch die gebaute App aus (Ordner ../dist), damit für
 *      den Betrieb ein einziger Dienst genügt.
 *
 * Es wird nichts gespeichert.
 *
 * Umgebungsvariablen:
 *   PORT        Port (Standard 8080)
 *   HOST        Adresse, auf der der Dienst lauscht (Standard: alle; hinter einem Reverse-Proxy 127.0.0.1)
 *   STATIC_DIR  Ordner mit der gebauten App (Standard ../dist; "off" schaltet die Auslieferung ab)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || undefined;
const here = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR =
  process.env.STATIC_DIR === 'off'
    ? null
    : path.resolve(process.env.STATIC_DIR || path.join(here, '..', 'dist'));

const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_ROOMS_PER_PEER = 2000;
const MAX_PEERS_PER_ROOM = 8;
const HEARTBEAT_MS = 30000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// --- Auslieferung der App ---

function serveStatic(req, res) {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (!STATIC_DIR || !fs.existsSync(STATIC_DIR)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Vermittlungsdienst für das P2P-Adressbuch läuft.');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  let filePath = path.normalize(path.join(STATIC_DIR, pathname));
  if (filePath !== STATIC_DIR && !filePath.startsWith(STATIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    if (path.extname(pathname)) {
      res.writeHead(404);
      res.end();
      return;
    }
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const isHashed = filePath.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // Dateien mit Prüfsumme im Namen ändern sich nie; alles andere stets neu prüfen
    'Cache-Control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(serveStatic);

// --- Vermittlung ---

/** Sitzungs-ID → WebSocket */
const peers = new Map();
/** Raumcode → Set<Sitzungs-ID> */
const rooms = new Map();

const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES });

function send(ws, message) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function leaveRoom(peerId, roomCode, joinedRooms) {
  const room = rooms.get(roomCode);
  joinedRooms.delete(roomCode);
  if (!room || !room.delete(peerId)) return;

  for (const otherPeerId of room) {
    send(peers.get(otherPeerId), { type: 'peer-left', peerId, roomCode });
  }
  if (room.size === 0) rooms.delete(roomCode);
}

wss.on('connection', (ws) => {
  let peerId = null;
  const joinedRooms = new Set();
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      send(ws, { type: 'error', error: 'Ungültige Nachricht' });
      return;
    }
    if (!message || typeof message !== 'object') return;

    switch (message.type) {
      case 'register': {
        if (peerId) return;
        const id = String(message.peerId || '');
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
          send(ws, { type: 'error', error: 'Ungültige Kennung' });
          return;
        }
        // Eine frühere Verbindung mit derselben Kennung wird ersetzt
        const previous = peers.get(id);
        if (previous && previous !== ws) previous.close();
        peerId = id;
        peers.set(peerId, ws);
        send(ws, { type: 'registered', peerId });
        break;
      }

      case 'join-room': {
        if (!peerId) return;
        const roomCode = String(message.roomCode || '');
        if (!/^[A-Za-z0-9_-]{4,64}$/.test(roomCode)) return;
        if (joinedRooms.has(roomCode)) return;
        if (joinedRooms.size >= MAX_ROOMS_PER_PEER) {
          send(ws, { type: 'error', error: 'Zu viele Räume' });
          return;
        }

        let room = rooms.get(roomCode);
        if (!room) {
          room = new Set();
          rooms.set(roomCode, room);
        }
        if (room.size >= MAX_PEERS_PER_ROOM) {
          send(ws, { type: 'error', error: 'Raum ist voll', roomCode });
          return;
        }

        const others = Array.from(room);
        room.add(peerId);
        joinedRooms.add(roomCode);

        send(ws, { type: 'room-joined', roomCode, peers: others });
        for (const otherPeerId of others) {
          send(peers.get(otherPeerId), { type: 'peer-joined', peerId, roomCode });
        }
        break;
      }

      case 'leave-room': {
        if (!peerId) return;
        if (message.roomCode) {
          leaveRoom(peerId, String(message.roomCode), joinedRooms);
        } else {
          for (const roomCode of Array.from(joinedRooms)) leaveRoom(peerId, roomCode, joinedRooms);
        }
        break;
      }

      case 'signal': {
        if (!peerId) return;
        const targetPeerId = String(message.targetPeerId || '');
        const target = peers.get(targetPeerId);
        // Nur an Geräte weiterleiten, mit denen ein gemeinsamer Raum besteht
        const shareRoom = Array.from(joinedRooms).some((roomCode) =>
          rooms.get(roomCode)?.has(targetPeerId)
        );
        if (target && shareRoom) {
          send(target, { type: 'signal', fromPeerId: peerId, signal: message.signal });
        } else {
          send(ws, { type: 'error', error: 'Gegenstelle nicht erreichbar', targetPeerId });
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (!peerId) return;
    for (const roomCode of Array.from(joinedRooms)) leaveRoom(peerId, roomCode, joinedRooms);
    if (peers.get(peerId) === ws) peers.delete(peerId);
  });

  ws.on('error', () => {
    // close folgt und räumt auf
  });
});

// Verbindungen ohne Lebenszeichen beenden
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, HOST, () => {
  const serving = STATIC_DIR && fs.existsSync(STATIC_DIR) ? `, App aus ${STATIC_DIR}` : '';
  console.log(`Vermittlungsdienst läuft auf ${HOST || 'allen Adressen'}, Port ${PORT}${serving}`);
});
