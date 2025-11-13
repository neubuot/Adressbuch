# Bedienungsanleitung - P2P Adressbuch

## Inhaltsverzeichnis

1. [Einführung](#einführung)
2. [Erste Schritte](#erste-schritte)
3. [Meine Adresse verwalten](#meine-adresse-verwalten)
4. [Verbindungen erstellen und verwalten](#verbindungen-erstellen-und-verwalten)
5. [Feldfreigabe bearbeiten](#feldfreigabe-bearbeiten)
6. [Tags verwenden](#tags-verwenden)
7. [Verbindungen exportieren](#verbindungen-exportieren)
8. [Tipps und Best Practices](#tipps-und-best-practices)
9. [Häufig gestellte Fragen](#häufig-gestellte-fragen)

---

## Einführung

Das **P2P Adressbuch** ist eine dezentrale, lokal-first Adressbuch-Anwendung, die es dir ermöglicht, deine Kontaktdaten sicher und privat mit anderen Personen zu teilen.

### Kernfunktionen

✅ **Privacy by Default** - Keine Felder werden standardmäßig geteilt
✅ **Feldgenaue Freigabe** - Du bestimmst pro Verbindung, welche Felder sichtbar sind
✅ **Offline-fähig** - Alle Daten werden lokal im Browser gespeichert
✅ **Peer-to-Peer** - Direkte Verbindung ohne Cloud-Speicherung
✅ **QR-Code-Verbindung** - Einfache Verbindung über QR-Code oder 8-stelligen Code
✅ **Tag-Verwaltung** - Organisiere deine Verbindungen mit Tags
✅ **Export-Funktion** - Exportiere Verbindungen als CSV oder JSON

### Wichtige Sicherheitshinweise

- **Alle Daten bleiben lokal** in deinem Browser (IndexedDB)
- Der Signaling-Server kennt **keine persönlichen Daten**
- Die Verbindung zwischen Peers ist **verschlüsselt** (WebRTC DTLS)
- **Du entscheidest**, welche Felder du teilst

---

## Erste Schritte

### Installation und Start

1. **Signaling-Server starten**
   ```bash
   cd signaling-server
   npm install
   npm start
   ```
   Der Server läuft auf `ws://localhost:8080`

2. **Frontend-Entwicklungsserver starten**
   ```bash
   npm install
   npm run dev
   ```
   Die App ist verfügbar unter `http://localhost:5173`

3. **Browser öffnen**
   - Öffne `http://localhost:5173` in deinem Browser
   - Für Tests mit zwei Nutzern: Öffne die URL in zwei separaten Browserfenstern

### Navigation

Die App hat drei Hauptbereiche, die über die Navigation oben erreichbar sind:

- **Dashboard** - Übersicht über deine Aktivitäten
- **Meine Adresse** - Bearbeite deine persönlichen Daten
- **Verbindungen** - Verwalte deine Peer-Verbindungen

---

## Meine Adresse verwalten

### Profil ausfüllen

1. Klicke in der Navigation auf **"Meine Adresse"**
2. Fülle die gewünschten Felder aus:
   - **Vorname**
   - **Nachname**
   - **E-Mail**
   - **Telefon**
   - **Straße**
   - **PLZ**
   - **Stadt**
   - **Land**
   - **Organisation**
   - **Geburtstag** (Datum auswählen)

3. Klicke auf **"Speichern"**

### Wichtig zu wissen

- Du musst **nicht alle Felder** ausfüllen
- **Privacy by Default**: Standardmäßig werden KEINE Felder geteilt
- Du bestimmst später pro Verbindung, welche Felder sichtbar sein sollen
- Änderungen werden automatisch mit allen verbundenen Peers synchronisiert

### Änderungen synchronisieren

Wenn du deine Daten änderst:
1. Klicke auf **"Speichern"**
2. Die App synchronisiert automatisch mit allen **online** Verbindungen
3. Es werden nur die **freigegebenen Felder** übertragen

---

## Verbindungen erstellen und verwalten

### Neue Verbindung erstellen

Es gibt zwei Wege, eine Verbindung herzustellen:

#### Option 1: Einladung erstellen (Empfohlen)

1. Gehe zu **"Verbindungen"**
2. Klicke auf **"📤 Einladung erstellen"**
3. **Wähle die Felder aus**, die du teilen möchtest:
   - Setze Häkchen bei den gewünschten Feldern
   - Standardmäßig sind Vorname, Nachname und E-Mail ausgewählt
   - Du kannst die Auswahl jederzeit ändern

4. **Teile den Verbindungscode**:
   - Ein **8-stelliger Code** wird angezeigt (z.B. `ABC123XY`)
   - Ein **QR-Code** wird generiert
   - Teile den Code oder zeige den QR-Code der anderen Person

5. Die andere Person kann sich nun mit diesem Code verbinden

#### Option 2: Mit Code verbinden

1. Gehe zu **"Verbindungen"**
2. Klicke auf **"📥 Mit Code verbinden"**
3. Gib den **8-stelligen Code** ein, den du erhalten hast
4. Klicke auf **"Verbinden"**
5. Die Verbindung wird hergestellt

### Verbindungsstatus

Jede Verbindung hat einen Status:

- **🟢 Online** - Peer ist verbunden und Daten werden synchronisiert
- **🟡 Synchronisiert** - Daten werden gerade übertragen
- **🔴 Offline** - Peer ist nicht erreichbar

### Verbindungen ansehen

#### Karten-Ansicht (Standard)

- Zeigt ausführliche Informationen zu jeder Verbindung
- Empfangene Daten werden in einem separaten Bereich angezeigt
- Aktionen (Freigabe bearbeiten, Resync, Entfernen) direkt sichtbar

#### Listen-Ansicht

- Kompakte Tabellenansicht
- Schneller Überblick über viele Verbindungen
- Sortierbar nach verschiedenen Kriterien

**Ansicht wechseln:**
- Klicke auf **"📋 Karten"** für die Karten-Ansicht
- Klicke auf **"📊 Liste"** für die Listen-Ansicht

### Verbindungen filtern

#### Nach Status filtern

- **Alle** - Zeigt alle Verbindungen
- **🟢 Online** - Nur online Verbindungen
- **🔴 Offline** - Nur offline Verbindungen

#### Nach Tags filtern

- Wenn du Tags erstellt hast, kannst du nach diesen filtern
- Klicke auf einen Tag-Button, um nur Verbindungen mit diesem Tag anzuzeigen
- Klicke auf **"Alle"**, um den Filter zu entfernen

### Verbindungen sortieren

Sortiere nach:
- **Name** - Alphabetisch nach Label oder ID
- **Status** - Online zuerst, dann syncing, dann offline
- **Letzte Sync** - Neueste Synchronisation zuerst

### Verbindungen durchsuchen

1. Gib im Suchfeld einen Suchbegriff ein
2. Die App durchsucht:
   - Label/Name
   - Verbindungs-ID
   - E-Mail-Adresse
   - Vor- und Nachname der empfangenen Daten

3. Die Anzahl der gefundenen Verbindungen wird angezeigt

### Verbindung benennen

Jede Verbindung kann einen **Label** (Namen) erhalten:

1. Klicke auf das **✏️ Stift-Symbol** neben dem Namen
2. Gib einen Namen ein (z.B. "Max Mustermann", "Arbeitskollege")
3. Klicke auf **✓** zum Speichern oder **✕** zum Abbrechen
4. **Tastaturkürzel:**
   - `Enter` - Speichern
   - `Escape` - Abbrechen

### Verbindung resynchronisieren

Wenn Daten nicht aktuell sind:
1. Klicke auf **"🔄 Resync"**
2. Die Daten werden neu synchronisiert
3. Funktioniert nur bei **online** Verbindungen

### Verbindung entfernen

1. Klicke auf **"❌ Entfernen"**
2. Bestätige die Sicherheitsabfrage
3. Die Verbindung wird **dauerhaft gelöscht**
4. Die empfangenen Daten der anderen Person werden ebenfalls gelöscht

---

## Feldfreigabe bearbeiten

Du kannst für jede Verbindung individuell festlegen, welche Felder geteilt werden.

### Freigabe ändern

1. Gehe zu **"Verbindungen"**
2. Klicke bei einer Verbindung auf **"🔒 Freigabe bearbeiten"**
3. Du siehst nun zwei Bereiche:

#### Meine freigegebenen Felder
- **Aktuell freigegebene Felder** werden angezeigt
- Klicke auf ein Feld, um es zu **entfernen**
- Entfernte Felder werden beim Peer sofort **unsichtbar**

#### Weitere Felder hinzufügen
- Zeigt alle **nicht freigegebenen** Felder
- Klicke auf **"+ Hinzufügen"**, um ein Feld freizugeben
- Das Feld wird beim Peer **sofort sichtbar**

### Remote-Speicherung

Du kannst einstellen, ob empfangene Daten lokal gespeichert werden:

- **✅ Empfangene Daten lokal speichern**
  - Daten bleiben auch wenn der Peer offline ist
  - Du kannst die Daten jederzeit einsehen

- **❌ Nicht speichern**
  - Daten werden nur angezeigt, wenn der Peer online ist
  - Mehr Privatsphäre für den Peer

### Synchronisation

- Änderungen werden **sofort** übertragen
- Bei **online** Verbindungen siehst du Updates in Echtzeit
- Bei **offline** Verbindungen erfolgt die Synchronisation beim nächsten Verbindungsaufbau

---

## Tags verwenden

Tags helfen dir, deine Verbindungen zu organisieren und zu kategorisieren.

### Tags verwalten

1. Gehe zu **"Verbindungen"**
2. Klicke auf **"🏷️ Tags verwalten"**
3. Ein Dialog öffnet sich

### Neuen Tag erstellen

1. Gib einen **Namen** ein (z.B. "Arbeit", "Familie", "Freunde")
2. Wähle eine **Farbe** aus den vordefinierten Optionen:
   - Blau, Grün, Amber, Rot, Lila, Pink, Cyan, Lime, Orange, Indigo
3. Klicke auf **"+ Erstellen"**
4. **Tastaturkürzel:** Drücke `Enter` zum Erstellen

### Tag bearbeiten

1. Klicke bei einem Tag auf **"✏️ Bearbeiten"**
2. Ändere **Name** oder **Farbe**
3. Klicke auf **✓** zum Speichern oder **✕** zum Abbrechen
4. **Tastaturkürzel:**
   - `Enter` - Speichern
   - `Escape` - Abbrechen

### Tag löschen

1. Klicke bei einem Tag auf **"🗑️ Löschen"**
2. Bestätige die Sicherheitsabfrage
3. Der Tag wird von **allen Verbindungen** entfernt

### Tags zu Verbindungen hinzufügen

#### In der Karten-Ansicht:

1. Klicke bei einer Verbindung auf **"+ Tag hinzufügen"**
2. Wähle einen oder mehrere Tags aus
3. Klicke auf **"✓ Fertig"**

#### In der Listen-Ansicht:

1. Klicke auf das **🏷️ Tag-Symbol** in der Aktionen-Spalte
2. Wähle Tags aus dem Dialog
3. Klicke auf **"✓ Fertig"**

### Tags entfernen

- Klicke auf ein **Tag** bei einer Verbindung
- Der Tag wird sofort entfernt

### Nach Tags filtern

1. Im Verbindungen-Bereich findest du die Tag-Filter
2. Klicke auf einen **Tag-Button**
3. Nur Verbindungen mit diesem Tag werden angezeigt
4. Die Anzahl wird in Klammern angezeigt
5. Klicke auf **"Alle"**, um den Filter zu entfernen

---

## Verbindungen exportieren

Du kannst deine Verbindungen als CSV oder JSON exportieren.

### Export starten

1. Gehe zu **"Verbindungen"**
2. Klicke auf **"💾 Verbindungen exportieren"**
3. Die Export-Ansicht öffnet sich

### Filter und Sortierung

Die Ansicht ist in zwei Spalten unterteilt:

#### Linke Spalte: Einstellungen

**Tag-Filter:**
- Wähle einen oder mehrere Tags aus
- Nur Verbindungen mit diesen Tags werden exportiert
- Klicke auf **"Alle auswählen"** / **"Alle abwählen"**

**Sortierung:**
- **Nach Name/Label** - Alphabetisch
- **Nach Erstellungsdatum** - Wann wurde die Verbindung erstellt
- **Nach letzter Synchronisation** - Wann war die letzte Sync

**Sortierreihenfolge:**
- **Aufsteigend** - A-Z, alt zu neu
- **Absteigend** - Z-A, neu zu alt

**Export-Format:**
- **CSV** - Für Excel, Google Sheets, etc.
- **JSON** - Für Entwickler und Weiterverarbeitung

#### Rechte Spalte: Vorschau

- Zeigt die **Anzahl** der zu exportierenden Verbindungen
- Listet alle Verbindungen mit Status und Tag-Informationen auf
- Live-Aktualisierung bei Filteränderungen

### Export durchführen

1. Konfiguriere Filter und Sortierung nach deinen Wünschen
2. Klicke auf **"Exportieren (CSV)"** oder **"Exportieren (JSON)"**
3. Die Datei wird automatisch heruntergeladen

### CSV-Export Inhalt

Die CSV-Datei enthält folgende Spalten:
- **ID** - Eindeutige Verbindungs-ID
- **Label** - Anzeigename
- **Status** - online/offline/syncing
- **Erstellt am** - Erstellungsdatum
- **Letzte Synchronisation** - Letztes Sync-Datum
- **Freigegebene Felder** - Liste der geteilten Felder
- **Tags** - Liste der zugewiesenen Tags

### JSON-Export Inhalt

Die JSON-Datei enthält zusätzlich:
- **RemoteCard** - Vollständige empfangene Kontaktdaten
- **Tag-Details** - ID, Name und Farbe der Tags
- Vollständige Metadaten

### Tipps für den Export

- **Backup erstellen**: Exportiere regelmäßig alle Verbindungen (ohne Filter)
- **Tag-basierte Reports**: Exportiere z.B. nur "Arbeit"-Kontakte für berufliche Zwecke
- **Sortierung**: Nutze "Letzte Synchronisation" um aktive Kontakte zu identifizieren

---

## Tipps und Best Practices

### Sicherheit und Privatsphäre

1. **Minimale Freigabe**
   - Teile nur die Felder, die wirklich nötig sind
   - Überprüfe regelmäßig deine Freigaben

2. **Labels verwenden**
   - Benenne Verbindungen aussagekräftig
   - Nutze z.B. "Max (Arbeit)" statt nur "Max"

3. **Tags für Organisation**
   - Erstelle Tags wie "Arbeit", "Privat", "Familie"
   - So behältst du den Überblick

4. **Regelmäßige Backups**
   - Exportiere deine Verbindungen regelmäßig
   - Speichere die Export-Dateien sicher

### Verbindungsqualität

1. **Stabile Internetverbindung**
   - WebRTC funktioniert am besten mit stabiler Verbindung
   - Bei Problemen: Resync durchführen

2. **Firewall-Einstellungen**
   - WebRTC benötigt offene Ports
   - Bei Firewalls kann ein TURN-Server nötig sein

3. **Browser-Kompatibilität**
   - Nutze moderne Browser (Chrome, Firefox, Edge)
   - Safari hat teilweise WebRTC-Einschränkungen

### Workflow-Optimierung

1. **Ansichten nutzen**
   - Karten-Ansicht für Details
   - Listen-Ansicht für schnellen Überblick

2. **Suchfunktion**
   - Nutze die Suche bei vielen Verbindungen
   - Sucht in Namen, Labels, E-Mails und IDs

3. **Filter kombinieren**
   - Kombiniere Status-Filter mit Tag-Filtern
   - Sortiere nach Relevanz

---

## Häufig gestellte Fragen

### Allgemein

**Q: Wo werden meine Daten gespeichert?**
A: Alle Daten werden lokal in deinem Browser (IndexedDB) gespeichert. Es gibt keine Cloud-Speicherung.

**Q: Kann die andere Person meine Daten sehen, die ich nicht freigegeben habe?**
A: Nein. Es werden nur die explizit freigegebenen Felder übertragen.

**Q: Was sieht der Signaling-Server?**
A: Der Server sieht nur technische Metadaten (Peer-IDs, Raum-Codes, WebRTC-Signaling). Er kennt keine persönlichen Daten.

**Q: Sind die Verbindungen verschlüsselt?**
A: Ja, WebRTC nutzt DTLS (Datagram Transport Layer Security) für die Transportverschlüsselung.

### Verbindungen

**Q: Wie viele Verbindungen kann ich haben?**
A: Technisch unbegrenzt, aber die Performance kann bei sehr vielen gleichzeitigen Verbindungen leiden. Für normale Nutzung (< 50 Verbindungen) gibt es keine Probleme.

**Q: Warum ist eine Verbindung offline?**
A: Mögliche Gründe:
- Der andere Peer hat die App geschlossen
- Netzwerkprobleme
- Der andere Peer hat deine Verbindung entfernt

**Q: Kann ich eine gelöschte Verbindung wiederherstellen?**
A: Nein, gelöschte Verbindungen sind permanent entfernt. Du musst eine neue Verbindung erstellen.

**Q: Was passiert, wenn ich ein Feld aus der Freigabe entferne?**
A: Das Feld wird beim anderen Peer sofort unsichtbar. Wenn "Daten lokal speichern" aktiviert ist, kann der Peer die alten Werte noch sehen, bis die nächste Synchronisation erfolgt.

### Synchronisation

**Q: Wann werden Änderungen synchronisiert?**
A: Änderungen werden sofort synchronisiert, wenn beide Peers online sind. Bei offline Peers erfolgt die Sync beim nächsten Verbindungsaufbau.

**Q: Was macht die Resync-Funktion?**
A: Resync erzwingt eine komplette Neuübertragung aller freigegebenen Felder. Nützlich, wenn Daten nicht aktuell sind.

**Q: Wie erkenne ich, ob Daten synchronisiert wurden?**
A: Der Status zeigt "🟡 Synchronisiert" während der Übertragung. Das Feld "Letzte Synchronisation" zeigt das Datum der letzten erfolgreichen Sync.

### Export

**Q: Kann ich exportierte Daten wieder importieren?**
A: In der aktuellen Version (Phase 1) gibt es keine Import-Funktion. Export dient primär dem Backup und der Weiterverarbeitung.

**Q: Werden beim Export auch die empfangenen Daten exportiert?**
A: Bei JSON-Export: Ja, wenn "Daten lokal speichern" aktiviert war. Bei CSV-Export: Nein, nur Metadaten.

### Technisch

**Q: Funktioniert die App offline?**
A: Du kannst deine eigenen Daten offline bearbeiten. Synchronisation benötigt eine Internetverbindung.

**Q: Welche Browser werden unterstützt?**
A: Chrome, Firefox, Edge, Safari (eingeschränkt). Benötigt WebRTC- und IndexedDB-Support.

**Q: Was ist Automerge CRDT?**
A: Eine Technologie für konfliktfreie Datensynchronisation. Bedeutet: Änderungen von mehreren Peers können gleichzeitig erfolgen ohne Konflikte.

**Q: Wie groß ist der Speicherverbrauch?**
A: Minimal. Hauptsächlich deine eigenen Daten und empfangene Kontakte. IndexedDB hat normalerweise mindestens 50MB Speicher verfügbar.

---

## Weitere Hilfe

Bei Problemen oder Fragen:

1. **GitHub Issues**: [https://github.com/yourusername/p2p-addressbook/issues](https://github.com/yourusername/p2p-addressbook/issues)
2. **README.md**: Technische Dokumentation im Projekt-Root
3. **CONTRIBUTING.md**: Informationen für Entwickler

---

**Version**: 1.0 (Phase 1)
**Letzte Aktualisierung**: 2025-11-13
