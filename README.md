# P2P Adressbuch - Dezentrale Kontaktverwaltung

Eine **lokal-first**, **peer-to-peer fähige** Adressbuch-Web-App, mit der zwei oder mehr Nutzer ihre eigenen Adresskarten gezielt miteinander teilen können. Die App verwendet WebRTC für direkte Peer-to-Peer-Verbindungen, Automerge für konfliktfreie Datensynchronisation und speichert alle Daten lokal im Browser (IndexedDB).

## Features (Phase 1)

✅ **Privacy by Default**: Keine Felder werden standardmäßig geteilt
✅ **Feldgenaue Freigabe**: Wähle pro Verbindung aus, welche Felder sichtbar sind
✅ **Offline-fähig**: Lokale Speicherung mit IndexedDB
✅ **Konfliktfreie Synchronisation**: Automerge CRDT für robuste Datensynchronisation
✅ **Peer-to-Peer**: Direkte Verbindung über WebRTC, keine Cloud-Datenhaltung
✅ **QR-Code-Verbindung**: Einfache Verbindung über QR-Code oder 8-stelligen Code

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser A                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   React UI   │───▶│  Automerge   │───▶│   IndexedDB  │  │
│  └──────────────┘    │    Store     │    │   (Dexie)    │  │
│         │             └──────────────┘    └──────────────┘  │
│         │                     │                              │
│         │             ┌───────▼──────┐                       │
│         └────────────▶│  P2P Manager │                       │
│                       └───────┬──────┘                       │
│                               │                              │
│                       ┌───────▼──────────┐                   │
│                       │  WebRTC (DTLS)   │                   │
│                       └───────┬──────────┘                   │
└───────────────────────────────┼───────────────────────────────┘
                                │
                   ┌────────────▼────────────┐
                   │  Signaling-Server (WS)  │
                   │   (keine Persistenz)    │
                   └────────────┬────────────┘
                                │
┌───────────────────────────────┼───────────────────────────────┐
│                       ┌───────▼──────────┐                    │
│                       │  WebRTC (DTLS)   │                    │
│                       └───────┬──────────┘                    │
│                               │                               │
│                       ┌───────▼──────┐                        │
│         ┌────────────▶│  P2P Manager │                        │
│         │             └──────────────┘                        │
│         │                     │                               │
│  ┌──────┴───────┐    ┌───────▼──────┐    ┌──────────────┐   │
│  │   React UI   │───▶│  Automerge   │───▶│   IndexedDB  │   │
│  └──────────────┘    │    Store     │    │   (Dexie)    │   │
│                      └──────────────┘    └──────────────┘   │
│                        Browser B                             │
└─────────────────────────────────────────────────────────────┘
```

## Tech-Stack

- **Frontend**: TypeScript, React, Vite
- **State & Replikation**: Automerge (CRDT)
- **Lokale Persistenz**: IndexedDB via Dexie
- **P2P-Transport**: WebRTC mit simple-peer
- **Signalisierung**: WebSocket-Server (Node.js, ws)
- **Kryptografie**: Web Crypto API (ECDSA P-256)

## Installation & Setup

### Voraussetzungen

- Node.js >= 18
- npm >= 9

### 1. Repository klonen

```bash
git clone https://github.com/yourusername/p2p-addressbook.git
cd p2p-addressbook
```

### 2. Dependencies installieren

```bash
# Haupt-Projekt
npm install

# Signaling-Server
cd signaling-server
npm install
cd ..
```

### 3. Signaling-Server starten

In einem separaten Terminal:

```bash
cd signaling-server
npm start
```

Der Server läuft auf `ws://localhost:8080`.

### 4. Frontend-Dev-Server starten

```bash
npm run dev
```

Die App ist jetzt verfügbar unter `http://localhost:5173`.

## Lokale Tests mit zwei Browsern

### Variante 1: Zwei Browser-Fenster auf einem Gerät

1. Öffne zwei Browser-Fenster/Tabs: `http://localhost:5173`
2. In Fenster A:
   - Gehe zu "Meine Adresse" und fülle dein Profil aus
   - Gehe zu "Verbindungen" → "Einladung erstellen"
   - Wähle die Felder aus, die du teilen möchtest
   - Kopiere den Verbindungscode (z.B. `ABC123XY`)
3. In Fenster B:
   - Fülle ebenfalls dein Profil aus
   - Gehe zu "Verbindungen" → "Mit Code verbinden"
   - Gib den Code aus Fenster A ein
4. Nach wenigen Sekunden sollten beide Peers verbunden sein
5. Ändere ein Feld in Fenster A → Fenster B sieht das Update (falls Feld freigegeben)

### Variante 2: Zwei Geräte im gleichen Netzwerk

1. Finde die IP-Adresse deines Entwicklungsrechners:
   ```bash
   # Windows
   ipconfig

   # macOS/Linux
   ifconfig
   ```

2. Signaling-Server-URL anpassen (falls nötig):
   - Erstelle `.env`-Datei im Hauptverzeichnis:
   ```
   VITE_SIGNALING_URL=ws://<DEINE-IP>:8080
   ```

3. Auf Gerät 1: `http://<DEINE-IP>:5173`
4. Auf Gerät 2: `http://<DEINE-IP>:5173`
5. Verbinde wie in Variante 1 beschrieben

## Datenmodell

### AddressCard

```typescript
interface AddressCard {
  id: string;
  firstName: string;
  lastName: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  birthday: string; // ISO date
  organization: string;
  custom?: Record<string, string>;
  updatedAt: string; // ISO timestamp
}
```

### Connection (Peer-Verbindung)

```typescript
interface Connection {
  id: string; // peerId
  label?: string;
  peerPubKey: string;
  allowedFields: string[]; // Whitelist
  storeRemoteCard: boolean;
  lastSyncAt?: string;
  status: 'online' | 'offline' | 'syncing';
  remoteCard?: Partial<AddressCard>;
}
```

## P2P-Protokoll

Die App verwendet folgendes Nachrichtenprotokoll für die Peer-Synchronisation:

1. **HELLO**: Peer-Identifikation und App-Version
2. **POLICY**: Übermittlung der erlaubten Felder
3. **STATE_HASH**: Hash des aktuellen freigegebenen States
4. **PATCH**: Differenzielle Aktualisierung bei Abweichung
5. **ACK**: Bestätigung mit neuem Hash

### Ablauf bei Verbindungsaufbau

```
Peer A                              Peer B
  │                                    │
  ├─────── HELLO ─────────────────────▶│
  │◀────── HELLO ───────────────────────┤
  │                                    │
  ├─────── POLICY ────────────────────▶│
  │◀────── POLICY ──────────────────────┤
  │                                    │
  ├─────── STATE_HASH ────────────────▶│
  │◀────── STATE_HASH ──────────────────┤
  │                                    │
  │ (Hash-Vergleich)                    │ (Hash-Vergleich)
  │                                    │
  ├─────── PATCH ─────────────────────▶│ (bei Abweichung)
  │◀────── ACK ──────────────────────────┤
  │                                    │
  │ ✅ Synchron                         │ ✅ Synchron
```

## Scripts

```bash
# Frontend-Entwicklung
npm run dev           # Vite Dev-Server
npm run build         # Production-Build
npm run preview       # Preview des Builds

# Tests
npm test              # Unit-Tests (Vitest)
npm run test:e2e      # E2E-Tests (Playwright)

# Signaling-Server
cd signaling-server
npm start             # Server starten
npm run dev           # Server mit Auto-Reload
```

## Projektstruktur

```
.
├── src/
│   ├── components/          # React-Komponenten
│   │   ├── Dashboard.tsx
│   │   ├── MyCard.tsx
│   │   ├── Connections.tsx
│   │   ├── ConnectionInvite.tsx
│   │   └── PolicyEditor.tsx
│   ├── context/             # React Context
│   │   └── AppContext.tsx
│   ├── p2p/                 # P2P-Logik
│   │   ├── p2p-manager.ts
│   │   ├── signaling.ts
│   │   ├── peer-connection.ts
│   │   └── sync-controller.ts
│   ├── store/               # Automerge + Dexie
│   │   ├── automerge-store.ts
│   │   └── db.ts
│   ├── types/               # TypeScript-Typen
│   │   └── index.ts
│   ├── utils/               # Hilfsfunktionen
│   │   ├── crypto.ts
│   │   ├── hash.ts
│   │   └── policy.ts
│   ├── App.tsx
│   ├── App.css
│   └── main.tsx
├── signaling-server/        # WebSocket-Signaling-Server
│   ├── index.js
│   └── package.json
├── tests/
│   └── e2e/                 # Playwright E2E-Tests
│       └── basic.spec.ts
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## Sicherheit & Privatsphäre

- **Privacy by Default**: Standardmäßig werden keine Felder geteilt
- **Feldgenaue Kontrolle**: Nutzer wählt pro Verbindung aus, welche Felder sichtbar sind
- **Peer-Authentizität**: Fingerprint (Hash des Public Keys) wird angezeigt
- **Transport-Verschlüsselung**: WebRTC nutzt DTLS (Datagram Transport Layer Security)
- **Keine Server-seitige Datenhaltung**: Signaling-Server kennt nur Session-Metadaten
- **Lokale Speicherung**: Alle Daten bleiben im Browser (IndexedDB)

### Was der Signaling-Server sieht

Der Signaling-Server sieht nur:
- Peer-IDs (zufällige UUIDs)
- Raum-Codes (temporär)
- WebRTC-Signaling-Daten (ICE-Kandidaten, SDP-Offers)

Er sieht **nicht**:
- Adressdaten
- Welche Felder geteilt werden
- Den Inhalt der P2P-Nachrichten (diese laufen über den verschlüsselten WebRTC-Kanal)

## Tests

### Unit-Tests ausführen

```bash
npm test
```

Tests für:
- Policy-Engine (Feld-Projektion, Validierung)
- Hash-Utilities (Deterministische Serialisierung)

### E2E-Tests ausführen

```bash
# Installation (einmalig)
npx playwright install

# Tests ausführen
npm run test:e2e
```

## Roadmap (Zukünftige Phasen)

Phase 1 (aktuell):
- ✅ Lokale Speicherung
- ✅ WebRTC P2P-Verbindungen
- ✅ Feldgenaue Freigabe
- ✅ Automerge CRDT

Phase 2 (geplant):
- [ ] PWA (Progressive Web App)
- [ ] Service Worker für Offline-Nutzung
- [ ] Custom-Felder-UI
- [ ] Multi-Peer-Gruppen

Phase 3 (geplant):
- [ ] Ende-zu-Ende-Verschlüsselung der Felder
- [ ] IPFS-Integration für verschlüsselte Backups
- [ ] Doichain-Integration für Identitäts-/Policy-Management
- [ ] Mobile Apps (React Native)

## Bekannte Einschränkungen

- **NAT-Traversal**: WebRTC funktioniert nicht immer hinter strengen Firewalls/NATs. In solchen Fällen wäre ein TURN-Server nötig (nicht in Phase 1).
- **Peer-Discovery**: Aktuell erfolgt Verbindung nur via manuellem Code-Austausch. Automatisches Discovery ist nicht implementiert.
- **Skalierung**: Optimiert für 1:1 oder kleine Gruppen (< 10 Peers). Viele gleichzeitige Verbindungen können Performance beeinträchtigen.
- **Browser-Kompatibilität**: Benötigt modernen Browser mit WebRTC- und IndexedDB-Support.

## Lizenz

MIT License - siehe [LICENSE](LICENSE)

## Mitwirken

Contributions sind willkommen! Bitte erstelle ein Issue oder Pull Request.

## Support

Bei Problemen bitte ein Issue auf GitHub erstellen.

---

**Hinweis**: Dies ist eine Entwicklungsversion (Phase 1). Für Produktivnutzung werden weitere Sicherheits-Features (E2E-Verschlüsselung, TURN-Server) empfohlen
