# 📒 Dezentrales Adressbuch - Progressive Web App

Eine moderne, dezentrale Adressbuch-Anwendung als Progressive Web App (PWA) mit integriertem P2P-Messaging-System.

## ✨ Features

### 📇 Kontaktverwaltung
- Kontakte hinzufügen, bearbeiten und löschen
- Speicherung von Name, E-Mail, Telefon und Adresse
- Übersichtliche Darstellung aller Kontakte
- Lokale Datenspeicherung (LocalStorage)

### 💬 P2P Messaging
- Direktnachrichten zwischen Kontakten
- **Maximale Nachrichtenlänge: 210 Zeichen**
- Zeichenzähler mit visueller Warnung
- Nachrichtenfilter (Alle / Gesendet / Empfangen)
- Zeitstempel für jede Nachricht
- Dezentraler Ansatz (erweiterbar mit WebRTC)

### 📱 Progressive Web App
- **Offline-Funktionalität** durch Service Worker
- **Installierbar** auf allen Geräten (Desktop & Mobile)
- Responsive Design für alle Bildschirmgrößen
- Online/Offline-Statusanzeige
- Caching für schnelle Performance

## 🚀 Installation & Nutzung

### Lokale Entwicklung

1. **Repository klonen:**
   ```bash
   git clone https://github.com/neubuot/Adressbuch.git
   cd Adressbuch
   ```

2. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

3. **Entwicklungsserver starten:**
   ```bash
   npm run dev
   ```

4. **App öffnen:**
   ```
   http://localhost:3000
   ```

### Weitere Befehle

```bash
# Produktions-Build erstellen
npm run build

# Build testen
npm run preview

# Tests ausführen
npm test

# Tests mit UI ausführen
npm run test:ui

# Test-Coverage generieren
npm run test:coverage

# TypeScript Typ-Prüfung
npm run type-check
```

### Als PWA installieren

1. App im Browser öffnen (Chrome, Edge, Safari, Firefox)
2. Auf den **"App installieren"**-Button klicken
3. Oder über Browser-Menü: "App installieren" / "Zum Startbildschirm"
4. App wie eine native Anwendung nutzen

## 📖 Verwendung

### Kontakte verwalten

1. **Kontakt hinzufügen:**
   - Name und E-Mail eingeben (Pflichtfelder)
   - Optional: Telefon und Adresse
   - "Kontakt hinzufügen" klicken

2. **Kontakt löschen:**
   - "🗑️ Löschen" bei gewünschtem Kontakt klicken
   - Bestätigung mit "OK"

### Nachrichten senden

1. **Zum Messages-Tab wechseln**
2. **Empfänger auswählen** aus Dropdown
3. **Nachricht eingeben** (max. 210 Zeichen)
   - Zeichenzähler zeigt verbleibende Zeichen
   - Wird rot bei >200 Zeichen
4. **"Senden" klicken**

### Nachrichten filtern

- **Alle:** Zeigt alle Nachrichten
- **Gesendet:** Nur versendete Nachrichten
- **Empfangen:** Nur empfangene Nachrichten

## 🔧 Technische Details

### Technologie-Stack
- **TypeScript** - Typsicherer Code
- **Vite** - Schneller Build-Tool und Dev-Server
- **Vitest** - Unit Testing Framework
- **HTML5** - Struktur
- **CSS3** - Styling mit CSS Custom Properties
- **Service Worker API** - Offline-Funktionalität (via vite-plugin-pwa)
- **LocalStorage API** - Datenspeicherung
- **Web App Manifest** - PWA-Installation

### Datenspeicherung
- Alle Daten werden lokal im Browser gespeichert (LocalStorage)
- Keine Server-Kommunikation erforderlich
- Daten bleiben im Browser des Nutzers

### P2P-Erweiterung
Die aktuelle Version nutzt LocalStorage. Für echtes P2P können folgende Technologien integriert werden:
- **WebRTC** für direkte Browser-zu-Browser-Kommunikation
- **IPFS** für dezentrale Datenspeicherung
- **WebSockets** für Echtzeit-Synchronisation

### Export/Import (für fortgeschrittene Nutzer)

Daten können in der Browser-Konsole exportiert/importiert werden:

```javascript
// Daten exportieren
const data = exportAddressBookData();
console.log(JSON.stringify(data));

// Daten importieren
importAddressBookData(data);
```

## 📁 Projektstruktur

```
Adressbuch/
├── src/
│   ├── components/          # UI-Komponenten
│   │   ├── ContactsUI.ts   # Kontakt-UI
│   │   └── MessagesUI.ts   # Nachrichten-UI
│   ├── services/            # Business Logic Services
│   │   ├── contacts.ts     # Kontaktverwaltung
│   │   ├── messages.ts     # Nachrichtenverwaltung
│   │   ├── storage.ts      # LocalStorage Service
│   │   ├── pwa.ts          # PWA Setup
│   │   └── dataSync.ts     # Import/Export
│   ├── types/               # TypeScript Typdefinitionen
│   │   └── index.ts
│   ├── utils/               # Hilfsfunktionen
│   │   └── dom.ts
│   ├── main.ts              # App-Einstiegspunkt
│   └── styles.css           # Styling
├── public/                  # Statische Assets
│   ├── manifest.json       # PWA-Manifest
│   ├── sw.js               # Service Worker
│   ├── icon-192.png        # App-Icon (192x192)
│   └── icon-512.png        # App-Icon (512x512)
├── tests/                   # Unit Tests
│   ├── setup.ts
│   ├── services/
│   │   └── storage.test.ts
│   └── utils/
│       └── dom.test.ts
├── index.html              # HTML-Einstiegspunkt
├── vite.config.ts          # Vite-Konfiguration
├── vitest.config.ts        # Test-Konfiguration
├── tsconfig.json           # TypeScript-Konfiguration
├── package.json            # NPM-Dependencies
├── LICENSE                 # Lizenz
└── README.md               # Diese Datei
```

## 🎨 Anpassungen

### Theme-Farben ändern
In `src/styles.css` die CSS-Variablen anpassen:

```css
:root {
    --primary-color: #2196F3;    /* Hauptfarbe */
    --primary-dark: #1976D2;     /* Dunkle Variante */
    --secondary-color: #4CAF50;  /* Sekundärfarbe */
    /* ... */
}
```

### Icons ersetzen
Die Dateien `icon-192.png` und `icon-512.png` durch eigene PNG-Dateien ersetzen.

## 🔒 Datenschutz & Sicherheit

- ✅ Alle Daten bleiben lokal im Browser
- ✅ Keine Server-Kommunikation
- ✅ Keine Tracker oder Analytics
- ✅ Keine Cookies
- ✅ Open Source

## 🛣️ Roadmap

- [ ] WebRTC-Integration für echtes P2P
- [ ] Ende-zu-Ende-Verschlüsselung
- [ ] Gruppenchats
- [ ] Datei-Anhänge (Bilder, PDFs)
- [ ] Push-Benachrichtigungen
- [ ] Import/Export als vCard
- [ ] Synchronisation zwischen Geräten
- [ ] Dark Mode

## 🤝 Mitwirken

Contributions sind willkommen! Bitte:
1. Fork das Repository
2. Erstelle einen Feature-Branch
3. Commit deine Änderungen
4. Push zum Branch
5. Öffne einen Pull Request

## 📄 Lizenz

Siehe [LICENSE](LICENSE) Datei für Details.

## 💡 Inspiration

Entwickelt als dezentrale Alternative zu zentralisierten Kontaktverwaltungssystemen mit dem Fokus auf Datenschutz und Nutzer-Kontrolle.

---

**Viel Spaß mit deinem dezentralen Adressbuch! 📒✨**
