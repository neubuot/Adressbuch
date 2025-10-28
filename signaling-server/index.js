/**
 * WebSocket-Signaling-Server für WebRTC-Verbindungen
 * Minimale Implementierung ohne Persistenz
 */

import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;

// Aktive Verbindungen: Map<peerId, WebSocket>
const peers = new Map();

// Räume für Verbindungscodes: Map<roomCode, Set<peerId>>
const rooms = new Map();

const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 Signaling-Server läuft auf ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  let peerId = null;
  let currentRoom = null;

  console.log('✅ Neue Verbindung');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, message);
    } catch (error) {
      console.error('❌ Fehler beim Parsen der Nachricht:', error);
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    console.log(`👋 Verbindung geschlossen: ${peerId}`);

    if (peerId) {
      peers.delete(peerId);

      // Entferne aus Raum
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom);
        room.delete(peerId);

        // Benachrichtige andere im Raum
        room.forEach((otherPeerId) => {
          const otherWs = peers.get(otherPeerId);
          if (otherWs && otherWs.readyState === ws.OPEN) {
            otherWs.send(
              JSON.stringify({
                type: 'peer-left',
                peerId: peerId,
              })
            );
          }
        });

        // Lösche leere Räume
        if (room.size === 0) {
          rooms.delete(currentRoom);
          console.log(`🗑️  Raum gelöscht: ${currentRoom}`);
        }
      }
    }
  });

  function handleMessage(ws, message) {
    switch (message.type) {
      case 'register':
        // Peer registriert sich mit seiner ID
        peerId = message.peerId;
        peers.set(peerId, ws);
        console.log(`📝 Peer registriert: ${peerId}`);

        ws.send(
          JSON.stringify({
            type: 'registered',
            peerId: peerId,
          })
        );
        break;

      case 'join-room':
        // Peer tritt einem Raum bei (z.B. via Verbindungscode)
        const roomCode = message.roomCode;
        currentRoom = roomCode;

        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, new Set());
        }

        const room = rooms.get(roomCode);
        room.add(peerId);

        console.log(`🚪 Peer ${peerId} tritt Raum ${roomCode} bei (${room.size} Peers)`);

        // Sende Liste der anderen Peers im Raum
        const otherPeers = Array.from(room).filter((id) => id !== peerId);

        ws.send(
          JSON.stringify({
            type: 'room-joined',
            roomCode: roomCode,
            peers: otherPeers,
          })
        );

        // Benachrichtige andere Peers im Raum
        otherPeers.forEach((otherPeerId) => {
          const otherWs = peers.get(otherPeerId);
          if (otherWs && otherWs.readyState === ws.OPEN) {
            otherWs.send(
              JSON.stringify({
                type: 'peer-joined',
                peerId: peerId,
              })
            );
          }
        });
        break;

      case 'signal':
        // WebRTC-Signal an einen bestimmten Peer weiterleiten
        const targetPeerId = message.targetPeerId;
        const targetWs = peers.get(targetPeerId);

        if (targetWs && targetWs.readyState === ws.OPEN) {
          targetWs.send(
            JSON.stringify({
              type: 'signal',
              fromPeerId: peerId,
              signal: message.signal,
            })
          );
          console.log(`📡 Signal von ${peerId} an ${targetPeerId}`);
        } else {
          ws.send(
            JSON.stringify({
              type: 'error',
              error: `Peer ${targetPeerId} nicht verbunden`,
            })
          );
        }
        break;

      case 'leave-room':
        // Peer verlässt den Raum
        if (currentRoom && rooms.has(currentRoom)) {
          const room = rooms.get(currentRoom);
          room.delete(peerId);

          console.log(`🚪 Peer ${peerId} verlässt Raum ${currentRoom}`);

          // Benachrichtige andere
          room.forEach((otherPeerId) => {
            const otherWs = peers.get(otherPeerId);
            if (otherWs && otherWs.readyState === ws.OPEN) {
              otherWs.send(
                JSON.stringify({
                  type: 'peer-left',
                  peerId: peerId,
                })
              );
            }
          });

          currentRoom = null;
        }
        break;

      default:
        console.warn(`⚠️  Unbekannter Nachrichtentyp: ${message.type}`);
    }
  }
});

// Cleanup-Interval für abgelaufene Räume
setInterval(() => {
  const emptyRooms = [];
  for (const [roomCode, room] of rooms.entries()) {
    if (room.size === 0) {
      emptyRooms.push(roomCode);
    }
  }
  emptyRooms.forEach((roomCode) => rooms.delete(roomCode));
}, 60000); // Alle 60 Sekunden
