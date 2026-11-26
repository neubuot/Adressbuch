# P2P Adressbuch

[![Doichain Seal](https://doi-api.sendlabs.de/seal/github/neubuot/Adressbuch/seal.svg)](https://doi-api.sendlabs.de/seal/github/neubuot/Adressbuch)

Ein Adressbuch, das sich selbst aktuell hält – ohne Konto und ohne zentralen Speicher.

Jeder pflegt nur seine **eigene Karte** und legt für jeden Kontakt einzeln fest, was dieser
davon sehen darf. Ändert jemand seine Nummer oder Adresse, steht sie bei allen verbundenen
Kontakten automatisch richtig. Die Daten gehen direkt von Gerät zu Gerät.

- [Anleitung für Nutzer](#anleitung-für-nutzer)
- [Was die App kann](#was-die-app-kann)
- [Betrieb: was man braucht, um die App bereitzustellen](#betrieb)
- [Entwicklung](#entwicklung)
- [Datenmodell](#datenmodell)
- [Sicherheit und Grenzen](#sicherheit-und-grenzen)

---

## Anleitung für Nutzer

Diese Anleitung setzt voraus, dass jemand die App für dich bereitgestellt hat und du die
Adresse kennst (z. B. `https://adressbuch.example.org`). Du brauchst nur einen aktuellen
Browser auf Handy, Tablet oder Computer.

### 1. Öffnen

1. Öffne die Adresse im Browser.
2. Trag deinen Vor- und Nachnamen ein und tippe auf **Fertig**.

Mehr ist nicht nötig. Es gibt kein Konto und kein Passwort. Alles Weitere (Telefon, Adresse,
Geburtstag …) kannst du später unter **Meine Karte** ergänzen.

### 2. Als App installieren (empfohlen)

Installiert liegt das Adressbuch wie jede andere App auf dem Startbildschirm und funktioniert
auch ohne Internet.

- **Android (Chrome):** Unter **Mehr** auf **Installieren** tippen. Alternativ im Browsermenü
  (⋮) „App installieren" wählen.
- **iPhone / iPad (Safari):** Unten auf **Teilen** tippen (Quadrat mit Pfeil nach oben), dann
  **Zum Home-Bildschirm** und **Hinzufügen**.
- **Computer (Chrome, Edge):** Unter **Mehr** auf **Installieren** klicken oder das
  Installations-Symbol rechts in der Adresszeile verwenden.

### 3. Den ersten Kontakt verbinden

Ihr braucht beide die App und Internet. Am einfachsten sitzt ihr nebeneinander.

**Du lädst ein:**

1. **Kontakte → Kontakt verbinden.**
2. Wähle, was die andere Person von dir sehen darf – z. B. **Nur Name und Telefon**,
   **Privat** oder **Beruflich** – und tippe auf **Weiter: Code zeigen**.
3. Die andere Person scannt den angezeigten Code mit ihrer Handykamera. Ist sie nicht in
   der Nähe, tippe auf **Link teilen** und schick ihr den Link.

**Du wurdest eingeladen:** Scanne den Code mit der Handykamera oder öffne den Link. Wähle,
was die andere Person von dir sehen darf, und tippe auf **Verbinden**. (Wer keinen Link hat:
**Kontakt verbinden → Ich habe einen Code** und den achtstelligen Code eintippen.)

Lasst beide die Seite geöffnet, bis **Verbunden** erscheint. Das dauert meist nur einen
Augenblick.

> **Gut zu wissen:** Änderungen kommen an, wenn ihr beide die App gleichzeitig geöffnet habt.
> Ist die andere Person gerade nicht da, steht beim Kontakt „Wartet auf Verbindung" – die
> Änderung wird beim nächsten Mal von selbst nachgeholt.

### 4. Freigabe ändern oder widerrufen

Öffne den Kontakt. Unter **Was … von mir sieht** steht genau, was diese Person von dir sieht.
Mit **Freigabe ändern** passt du das an, mit **Freigabe widerrufen** nimmst du alles zurück.

Ehrlich gesagt: Was jemand bereits gesehen, abgeschrieben oder ins eigene Telefonbuch
übernommen hat, lässt sich nicht zurückholen. Ein Widerruf wirkt für die Zukunft.

### 5. Daten sichern

**Dein Adressbuch liegt nur auf deinem Gerät.** Geht das Gerät verloren oder löschst du die
Browserdaten, ist es weg. Deshalb:

1. **Mehr → Daten sichern und wiederherstellen.**
2. Ein Passwort wählen (mindestens 8 Zeichen), wiederholen, **Sicherung speichern**.
3. Die Datei an einem sicheren Ort aufbewahren (z. B. USB-Stick oder eigener Cloud-Speicher).

Die Datei ist mit deinem Passwort verschlüsselt. **Ohne das Passwort lässt sie sich nicht
öffnen, und niemand kann es zurücksetzen.**

**Wiederherstellen** (z. B. auf einem neuen Gerät): App öffnen, beim Einstieg auf „Ich habe
schon ein Adressbuch …" tippen, Datei auswählen, Passwort eingeben. Deine Kontakte verbinden
sich danach von selbst wieder. Nutze eine Sicherung immer nur auf einem Gerät zur selben Zeit.

### Vorhandene Kontakte übernehmen

Unter **Mehr → Vorhandene Kontakte übernehmen** kannst du Kontakte aus dem Telefonbuch
(vCard-Datei, `.vcf`) oder einer Tabelle (`.csv`) einlesen. Sie erscheinen als „Nicht
verbunden". Wenn du jemanden davon später einlädst, wird aus dem Eintrag eine echte
Verbindung; deine Notizen und Tags bleiben erhalten.

Auf Android-Handys mit Chrome geht es auch ohne Datei: **Aus dem Telefonbuch wählen**
öffnet die Kontakte des Geräts, übernommen wird nur, was du dort ankreuzt. Firma und
Geburtstag liefert das Telefonbuch auf diesem Weg nicht. Auf dem iPhone und am Computer
bietet der Browser diese Auswahl nicht an; dort bleibt die Datei.

Vor dem Übernehmen zeigt die App, was schon vorhanden ist. Liest du dieselbe Datei noch
einmal ein, werden die Einträge aktualisiert und nicht verdoppelt. Gehört ein Eintrag sicher
zu einem vorhandenen Kontakt (gleiche E-Mail-Adresse oder Telefonnummer), werden die Angaben
dort ergänzt. Unsichere Treffer (gleicher Name und Ort) führst du nur mit einem Haken
zusammen. Weichen Angaben voneinander ab, legst du fest, ob die Datei oder der bisherige
Stand gilt. Was du selbst von Hand geändert hast, bleibt in jedem Fall.

---

## Was die App kann

| Funktion | Beschreibung |
| --- | --- |
| **Was sieht dieser Kontakt von mir?** | Bei jedem Kontakt eine Vorschau der eigenen Karte aus dessen Sicht |
| **Änderungsübersicht** | „Anna hat die Mobilnummer geändert" – mit altem und neuem Wert, unter **Aktuelles** |
| **Suche** | Über alle Kontakte und alle Felder (auch Notizen und Telefonnummern in jeder Schreibweise), mit Filter nach Tags |
| **Direkte Aktionen** | Anrufen, mailen, Adresse in der Karten-App öffnen, ins Telefonbuch übernehmen (vCard) |
| **Import** | vCard und CSV als nicht verbundene Einträge, später per Einladung umwandelbar |
| **Geburtstage, lange nicht gesprochen** | Dezente Übersicht unter **Aktuelles** |
| **Widerruf** | Freigabe jederzeit zurücknehmen, mit klarer Aussage, was das bewirkt |
| **Vorlagen für die Freigabe** | „Nur Name und Telefon", „Privat", „Beruflich", „Alles" oder eigene Auswahl |
| **Private Notizen** | Notizen, „zuletzt gesprochen", Herkunft der Daten, Einwilligung – bleiben auf dem Gerät |
| **Tags** | Kontakte ordnen und filtern |
| **Export** | CSV, vCard oder JSON; Reihenfolge wählbar, Auswahl nach Tags |
| **Sicherung** | Verschlüsselt, mit Wiederherstellung auf einem anderen Gerät |
| **App** | Installierbar, offline nutzbar, helles und dunkles Farbschema |

---

## Betrieb

Nutzer müssen nichts einrichten. Wer die App **bereitstellt**, braucht Folgendes.

### Was nötig ist

1. **Eine Adresse mit HTTPS.** Ohne HTTPS funktionieren Installation, Kamera und
   Verschlüsselung im Browser nicht (Ausnahme: `localhost` zum Ausprobieren).
2. **Der Vermittlungsdienst** aus dem Ordner `signaling-server` (Node.js ≥ 18). Er bringt
   zwei Geräte zusammen, damit sie eine direkte Verbindung aufbauen können. Derselbe Dienst
   liefert auch die fertige App aus – **ein einziger Dienst genügt.**
3. **Empfohlen: ein TURN-Server** (z. B. [coturn](https://github.com/coturn/coturn)). Aus
   manchen Netzen (Mobilfunk, Firmen- und Gäste-WLAN) kommt ohne ihn keine direkte Verbindung
   zustande. Ohne eigene Angabe werden nur öffentliche STUN-Server verwendet.

### Bereitstellen

```bash
npm install
(cd signaling-server && npm install)

npm run build          # baut die App nach dist/
PORT=8080 npm start    # liefert dist/ aus und vermittelt unter /signal
```

Davor gehört ein Reverse-Proxy mit HTTPS (Caddy, nginx, Traefik …), der alle Anfragen
einschließlich WebSocket an diesen Port weiterleitet. Beispiel für Caddy:

```
adressbuch.example.org {
    reverse_proxy localhost:8080
}
```

Die App erwartet den Vermittlungsdienst unter derselben Adresse wie sich selbst (Pfad
`/signal`). Es ist also nichts weiter einzustellen.

### Einstellungen (alle freiwillig)

Werden beim Bauen fest in die App übernommen. Vorlage: [.env.example](.env.example).

| Variable | Bedeutung |
| --- | --- |
| `VITE_SIGNALING_URL` | Adresse des Vermittlungsdienstes, falls er getrennt von der App läuft, z. B. `wss://signal.example.org/signal` |
| `VITE_ICE_SERVERS` | STUN/TURN-Server als JSON-Liste, z. B. mit eigenem TURN-Server |
| `PORT` (Dienst) | Port des Vermittlungsdienstes, Standard `8080` |
| `STATIC_DIR` (Dienst) | Ordner der gebauten App, Standard `../dist`; `off` schaltet die Auslieferung ab |

`GET /healthz` antwortet mit `ok` und eignet sich für die Überwachung.

### Was der Vermittlungsdienst sieht – und was nicht

- **Sieht:** zufällige Sitzungskennungen, Raumcodes, technische Verbindungsdaten (darunter
  IP-Adressen) für den Aufbau der direkten Verbindung.
- **Sieht nicht:** Namen, Karten, Freigaben, Notizen. Kontaktdaten laufen ausschließlich über
  die direkte, verschlüsselte Verbindung zwischen den Geräten.
- **Speichert:** nichts.

Hinweis: Mit den voreingestellten öffentlichen STUN-Servern (Google, Mozilla) erfahren deren
Betreiber die IP-Adresse der Geräte. Wer das vermeiden will, trägt eigene Server ein.

---

## Entwicklung

```bash
npm install
(cd signaling-server && npm install)

npm run signal   # Vermittlungsdienst auf Port 8080 (ohne Auslieferung der App)
npm run dev      # App auf http://localhost:5173 (leitet /signal an Port 8080 weiter)
```

Zum Ausprobieren mit zwei „Personen" zwei verschiedene Browserprofile oder ein normales und
ein privates Fenster verwenden; jedes hat sein eigenes Adressbuch.

### Prüfen

```bash
npx tsc --noEmit     # Typprüfung
npm test             # Unit-Tests (Vitest)
npm run build        # Produktions-Build
npm run test:e2e     # End-to-End-Tests mit zwei Browser-Instanzen (Playwright)
```

Die End-to-End-Tests bauen die App und starten den Vermittlungsdienst selbst. Einmalig ist
`npx playwright install chromium` nötig.

### Aufbau

```
src/
  styles/tokens.css     Design-Tokens: Farben, Schrift, Abstände (einzige Quelle)
  styles/app.css        Gestaltung aller Ansichten
  views/                Ansichten (Kontakte, Kontakt, Freigabe, Verbinden, …)
  ui/                   Wiederverwendbare Bausteine (Formular, Freigabe-Auswahl, Dialog …)
  model/                Felder, Kontakt-Logik, Suche, Änderungstexte, Aktionen
  io/                   vCard, CSV, Export, verschlüsselte Sicherung
  store/                Automerge-Speicher, Migration, IndexedDB
  p2p/                  Vermittlung, direkte Verbindung, Abgleich
  router.ts             Navigation über die Adresse (#/…)
  pwa.ts                Installation und Offline-Betrieb
public/                 Manifest, Icons, Service Worker
signaling-server/       Vermittlungsdienst (liefert auch die App aus)
tests/e2e/              End-to-End-Tests
```

### Gestaltung

Leitlinie: so wenig Gestaltung wie möglich. Ruhige helle Flächen, schwarzer Text, genau eine
Akzentfarbe (Orange) für die wichtigste Aktion einer Ansicht; keine Verläufe, Schatten oder
Dekoration. Alle Werte stehen in `src/styles/tokens.css`. Komponenten verwenden Klassen aus
`app.css` statt eigener Stilangaben.

In der Oberfläche kommen keine Fachbegriffe vor (kein „Peer", „Sync", „Policy" …). Ein Test
prüft das.

---

## Datenmodell

Schemaversion **2.1.0** (`src/types/index.ts`). Felder und ihre Beschriftungen stehen in
`src/model/fields.ts`; die Spalte „Export" ist der Name in CSV- und JSON-Exporten.

### Eigene Karte (pro Kontakt freigebbar)

| Gruppe | Feld (intern) | Export |
| --- | --- | --- |
| Identifikation | `id` (UUID) | `person_id` (wird nicht übertragen) |
| | `salutation`, `titlePrefix`, `titleSuffix` | `anrede`, `titel_vorne`, `titel_hinten` |
| | `firstName`, `lastName` (immer getrennt) | `vorname`, `nachname` |
| | `nickname` | `spitzname` |
| Organisation | `organization`, `position`, `department`, `organizationId` | `organisation`, `position`, `abteilung`, `organisation_id` |
| Kommunikation | `emailWork`, `emailPrivate` | `email_geschäftlich`, `email_priv` |
| | `phoneWork`, `phoneMobile`, `fax` | `telefon_geschäftlich`, `telefon_mobil`, `fax` |
| | `website`, `linkedin`, `xing`, `github` | `webseite`, `linkedin`, `xing`, `github` |
| Adresse | `street`, `houseNumber`, `postalCode`, `city`, `state`, `country` (ISO 3166, z. B. `DE`) | `strasse`, `hausnummer`, `plz`, `ort`, `bundesland`, `land` |
| Sonstiges | `birthday`, `birthplace`, `language`, `timezone` | `geburtsdatum`, `geburtsort`, `sprache`, `zeitzone` |

### Private Angaben zu einem Kontakt (werden nie übertragen)

| Feld (intern) | Export |
| --- | --- |
| `notes` | `notizen` |
| `firstContactAt`, `lastContactAt` | `erstkontakt_am`, `letzter_kontakt_am` |
| `source`, `dataOrigin` | `quelle`, `datenherkunft` |
| `gdprConsentAt` | `einwilligung_dsgvo_am` |

### Importquellen und Datensätze (bleiben auf dem Gerät)

Jede Importquelle (`AppState.sources`) legt ihren Stand unverändert als Datensatz am Kontakt
ab (`Connection.records`, Schlüssel `Quelle::Kennung`). Die angezeigte Karte eines nicht
verbundenen Kontakts wird daraus berechnet (`src/model/merge.ts`):

1. eigene Eingabe von Hand (Quelle `manual`, enthält nur die abweichenden Felder)
2. Importquellen nach `rank`, kleiner gewinnt; ein leerer Wert überschreibt nichts

Bei verbundenen Kontakten gilt immer die Karte der Person selbst. Importierte Datensätze
bleiben beim Verbinden erhalten. Der Abgleich beim Import steht in `src/model/dedupe.ts`.
Weitere E-Mail-Adressen und Telefonnummern einer Quelle, die nicht in die Karte passen,
liegen in `extra` und zählen beim Abgleich mit.

### Migration und unterschiedliche Versionen

- Beim Start wird ein älterer Stand automatisch umgestellt (`src/store/migrate.ts`):
  `email` → `emailPrivate`, `phone` → `phoneMobile`, die Hausnummer wird von der Straße
  getrennt, Freigaben und empfangene Karten werden entsprechend umbenannt. Nichts wird gelöscht.
- Von 2.0 auf 2.1 bekommen früher importierte Einträge einen Datensatz der Quelle „Frühere
  Importe". Die angezeigten Karten ändern sich dabei nicht. Der Austausch zwischen Geräten
  ist nicht betroffen, 2.0 und 2.1 vertragen sich.
- Stammt der gespeicherte Stand von einer **neueren** App-Version oder ist er nicht lesbar,
  verändert die App nichts und zeigt einen Hinweis.
- Zwei Geräte mit unterschiedlicher Schema-Hauptversion tauschen **keine Kartendaten** aus.
  Der Kontakt zeigt „App-Version passt nicht", bis beide aktualisiert sind.

### Abgleich zwischen zwei Geräten

1. `HELLO` – Schlüssel, Schemaversion, Einmalwert
2. `AUTH` – Signatur über den Einmalwert der Gegenseite (Identitätsnachweis)
3. `STATE_HASH` – „diesen Stand habe ich von dir"
4. `PATCH` – nur bei Abweichung: die freigegebenen Felder
5. `ACK` – Bestätigung

Übertragen werden ausschließlich die für diesen Kontakt freigegebenen, ausgefüllten Felder.

---

## Sicherheit und Grenzen

- Die direkte Verbindung zwischen zwei Geräten ist verschlüsselt (WebRTC/DTLS).
- Jedes Gerät hat ein Schlüsselpaar; beim Verbinden weist jede Seite per Signatur nach, dass
  ihr der genannte Schlüssel gehört. Neue Kontakte entstehen nur über eine offene Einladung.
- Empfangene Daten werden auf bekannte Textfelder begrenzt.
- **Beide müssen gleichzeitig online sein.** Es gibt keinen Zwischenspeicher; Änderungen
  werden beim nächsten gemeinsamen Online-Sein nachgeholt.
- **Ein Gerät pro Adressbuch.** Dasselbe Adressbuch auf mehreren eigenen Geräten zu führen,
  wird (noch) nicht unterstützt.
- Die Daten liegen unverschlüsselt in der Datenbank des Browsers. Wer Zugriff auf das
  entsperrte Gerät hat, kann sie lesen. Die Sicherungsdatei ist verschlüsselt.
- Wer einen Einladungscode abfängt, solange die Einladung offen ist, könnte sich an Stelle
  der eingeladenen Person verbinden. Deshalb nach dem Verbinden prüfen, ob der richtige Name
  erscheint, und den Code nur an die gemeinte Person geben.

## Lizenz

Siehe [LICENSE](LICENSE).
