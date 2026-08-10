# Adressbuch PWA - Projektdokumentation

## 📋 Projektübersicht

**Projekt:** Dezentrales Adressbuch PWA  
**Repository:** https://github.com/neubuot/Adressbuch  
**Typ:** Progressive Web App (PWA)  
**Status:** ✅ In Entwicklung - Moderne Projektstruktur implementiert  
**Erstellt:** 2026-08-10  
**Entwickler:** Ottmar Neuburger (ottmar.neuburger@webanizer.de)

## 🎯 Projektziel

Eine moderne, dezentrale Adressbuch-Anwendung als Progressive Web App mit integriertem P2P-Messaging-System. Die App ermöglicht vollständige Offline-Funktionalität und speichert alle Daten lokal im Browser.

## ✨ Kernfunktionen

### Kontaktverwaltung
- ✅ Kontakte hinzufügen, bearbeiten und löschen
- ✅ Speicherung von Name, E-Mail, Telefon und Adresse
- ✅ Übersichtliche Darstellung aller Kontakte
- ✅ Lokale Datenspeicherung (LocalStorage)

### P2P Messaging
- ✅ Direktnachrichten zwischen Kontakten
- ✅ Maximale Nachrichtenlänge: 210 Zeichen
- ✅ Zeichenzähler mit visueller Warnung
- ✅ Nachrichtenfilter (Alle / Gesendet / Empfangen)
- ✅ Zeitstempel für jede Nachricht
- ⏳ WebRTC-Integration (geplant für echtes P2P)

### Progressive Web App Features
- ✅ Offline-Funktionalität durch Service Worker
- ✅ Installierbar auf allen Geräten (Desktop & Mobile)
- ✅ Responsive Design für alle Bildschirmgrößen
- ✅ Online/Offline-Statusanzeige
- ✅ Caching für schnelle Performance

## 🏗️ Technologie-Stack

### Frontend
- **TypeScript** - Typsicherer Code
- **HTML5** - Moderne Struktur
- **CSS3** - Styling mit CSS Custom Properties
- **Vanilla TypeScript** - Keine großen Frameworks

### Build & Development
- **Vite 5.x** - Schneller Build-Tool und Dev-Server mit HMR
- **vite-plugin-pwa** - Automatisierte PWA-Konfiguration
- **TypeScript 5.3** - Strict Mode aktiviert

### Testing
- **Vitest** - Unit Testing Framework
- **happy-dom** - DOM-Testing-Umgebung
- **Coverage Reports** - v8 Provider

### Code Quality
- **ESLint** - Linting mit TypeScript-Support
- **Strict TypeScript** - Maximale Typsicherheit

### APIs & Storage
- **LocalStorage API** - Client-seitige Datenspeicherung
- **Service Worker API** - Offline-Funktionalität
- **Web App Manifest** - PWA-Installation

## 📁 Projektstruktur

```
Adressbuch/
├── src/
│   ├── components/          # UI-Komponenten
│   │   ├── ContactsUI.ts   # Kontakt-Verwaltung UI
│   │   └── MessagesUI.ts   # Nachrichten-Verwaltung UI
│   ├── services/            # Business Logic Services
│   │   ├── contacts.ts     # Kontakt-Service
│   │   ├── messages.ts     # Nachrichten-Service
│   │   ├── storage.ts      # LocalStorage-Abstraktion
│   │   ├── pwa.ts          # PWA-Setup (Service Worker, Install)
│   │   └── dataSync.ts     # Import/Export-Funktionalität
│   ├── types/               # TypeScript Definitionen
│   │   └── index.ts        # Interface: Contact, Message, etc.
│   ├── utils/               # Hilfsfunktionen
│   │   └── dom.ts          # DOM-Utilities (escapeHtml, showStatus)
│   ├── main.ts              # App-Einstiegspunkt
│   └── styles.css           # Globale Styles
├── public/                  # Statische Assets
│   ├── manifest.json       # PWA-Manifest
│   ├── sw.js               # Service Worker
│   ├── icon-192.png        # App-Icon (192x192)
│   └── icon-512.png        # App-Icon (512x512)
├── tests/                   # Unit Tests
│   ├── setup.ts            # Test-Setup (localStorage-Mock)
│   ├── services/
│   │   └── storage.test.ts
│   └── utils/
│       └── dom.test.ts
├── index.html              # HTML-Einstiegspunkt
├── vite.config.ts          # Vite-Konfiguration
├── vitest.config.ts        # Vitest-Konfiguration
├── tsconfig.json           # TypeScript-Konfiguration
└── package.json            # NPM-Dependencies
```

## 🔄 Architektur-Entscheidungen

### Service-basierte Architektur
- Trennung von UI (Components) und Business Logic (Services)
- Single Responsibility Principle
- Einfaches Testing durch Isolation

### TypeScript Strict Mode
- Maximale Typsicherheit
- Frühe Fehlererkennung
- Bessere IDE-Unterstützung

### Modulare Komponenten
- ContactsUI: Verantwortlich für Kontakt-Darstellung und -Interaktion
- MessagesUI: Nachrichten-Interface mit Filterung
- Services: Wiederverwendbare Business Logic

### LocalStorage als Datenschicht
- Keine Server-Abhängigkeit
- Vollständige Offline-Funktionalität
- Datenschutz durch lokale Speicherung
- Einfacher Export/Import für P2P-Sync (Zukunft)

## 🚀 Development Workflow

### Setup
```bash
git clone https://github.com/neubuot/Adressbuch.git
cd Adressbuch
npm install
```

### Entwicklung
```bash
npm run dev          # Dev-Server auf http://localhost:3000
npm run build        # Production-Build
npm run preview      # Build testen
npm test             # Tests ausführen
npm run test:ui      # Tests mit UI
npm run test:coverage # Coverage-Report
npm run type-check   # TypeScript-Validierung
npm run lint         # Code-Linting
```

### Git-Workflow
- **Main Branch:** `main` (Produktionscode)
- **Feature Branches:** `claude/feature-name`
- **Pull Requests:** Über GitHub mit Review

## 📊 Aktuelle Metriken

### Code-Statistiken
- **Zeilen Code:** ~1.250 (ohne node_modules)
- **TypeScript-Dateien:** 11
- **Test-Dateien:** 2
- **Dependencies:** 6 (runtime)
- **Dev Dependencies:** 12

### Bundle-Größe (geschätzt)
- **Uncompressed:** ~50 KB
- **Gzipped:** ~15 KB
- **PWA-Assets:** ~2 KB (Icons)

## 🔐 Datenschutz & Sicherheit

- ✅ Alle Daten bleiben lokal im Browser
- ✅ Keine Server-Kommunikation
- ✅ Keine Tracker oder Analytics
- ✅ Keine Cookies
- ✅ Open Source
- ✅ XSS-Schutz durch `escapeHtml()`
- ✅ Input-Validierung auf Client-Seite

## 🛣️ Roadmap

### Phase 1: Grundfunktionen ✅
- [x] Kontaktverwaltung
- [x] LocalStorage-Integration
- [x] Basis-Messaging (lokal)
- [x] PWA-Grundlagen
- [x] Responsive Design

### Phase 2: Moderne Architektur ✅ (Aktuell)
- [x] TypeScript-Migration
- [x] Vite-Integration
- [x] Testing-Setup
- [x] Modulare Struktur
- [x] Build-Optimierung

### Phase 3: P2P-Integration (Geplant)
- [ ] WebRTC-Integration für echtes P2P
- [ ] Ende-zu-Ende-Verschlüsselung
- [ ] Peer-Discovery
- [ ] Signaling-Server
- [ ] NAT-Traversal

### Phase 4: Erweiterte Features (Zukunft)
- [ ] Gruppenchats
- [ ] Datei-Anhänge (Bilder, PDFs)
- [ ] Push-Benachrichtigungen
- [ ] Import/Export als vCard
- [ ] Geräte-Synchronisation
- [ ] Dark Mode
- [ ] Mehrsprachigkeit

## 📝 Wichtige Pull Requests

### PR #3: Setup modern project structure ✅
**Branch:** `claude/setup-project-structure-01Twsx2budDNXj2SERgRciT2`  
**Status:** Open  
**Link:** https://github.com/neubuot/Adressbuch/pull/3  
**StackBlitz:** https://stackblitz.com/~/github.com/neubuot/Adressbuch/pull/3

**Änderungen:**
- Migration von Vanilla JS zu TypeScript
- Vite als Build-Tool integriert
- Modulare Architektur implementiert
- Testing-Infrastructure aufgesetzt
- 28 Dateien geändert (+1.251, -406)

**Auswirkungen:**
- Bessere Wartbarkeit
- Typsicherheit
- Moderne Development-Experience
- Schnellere Build-Zeiten
- Testbare Code-Basis

## 🔗 Wichtige Links

- **GitHub Repo:** https://github.com/neubuot/Adressbuch
- **PR #3:** https://github.com/neubuot/Adressbuch/pull/3
- **StackBlitz Preview:** https://stackblitz.com/~/github.com/neubuot/Adressbuch/pull/3
- **Vite Docs:** https://vitejs.dev/
- **Vitest Docs:** https://vitest.dev/
- **PWA Guide:** https://web.dev/progressive-web-apps/

## 💡 Lessons Learned

### Was gut funktioniert
- Vite ist extrem schnell im Vergleich zu Webpack
- TypeScript Strict Mode findet viele Fehler früh
- Service-Architektur macht Tests einfacher
- LocalStorage ist ausreichend für MVP

### Herausforderungen
- PWA-Service-Worker-Caching kann tricky sein
- TypeScript-Migration erfordert vollständige Typdefinitionen
- P2P-Messaging benötigt komplexere Infrastruktur
- Browser-Kompatibilität für PWA-Features

### Nächste Schritte
1. CI/CD-Pipeline aufsetzen (GitHub Actions)
2. E2E-Tests mit Playwright hinzufügen
3. WebRTC-Proof-of-Concept implementieren
4. Performance-Optimierung (Code-Splitting)

## 📚 Ressourcen & Referenzen

### Technische Dokumentation
- TypeScript Handbook: https://www.typescriptlang.org/docs/
- Vite Plugin API: https://vitejs.dev/guide/api-plugin.html
- Service Worker API: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

### Inspiration
- Entwickelt als dezentrale Alternative zu zentralisierten Kontaktverwaltungssystemen
- Fokus auf Datenschutz und Nutzer-Kontrolle
- Inspiration von P2P-Projekten wie Matrix, IPFS

## 🏷️ Tags

#projekt #pwa #typescript #vite #p2p #adressbuch #offline-first #datenschutz #open-source #webdev

---

**Letzte Aktualisierung:** 2026-08-10  
**Version:** 1.0.0 (Nach Strukturrefactoring)
