# PandaMol

**Weniger zeichnen. Mehr lernen.** PandaMol hilft dabei, chemische Strukturen
für Lernkarten anzusehen, zu vergleichen und zu exportieren – ohne dass ein
schiefes Sauerstoffatom gleich die ganze Karte ruiniert.

## Die Idee dahinter

Bei vielen Molekülen ist nicht nur wichtig, *welche* Atome vorkommen, sondern
auch, wie sie räumlich angeordnet sind. Glucose kann zum Beispiel als offene
Kette oder als Ring betrachtet werden; bei Aminosäuren spielen unter anderem
L-/D-Form und Stereochemie eine Rolle. Solche Darstellungen von Hand zu zeichnen
ist lehrreich, aber beim wiederholten Erstellen von Lernmaterial auch mühsam.

PandaMol soll deshalb ein Lern- und Anschauungswerkzeug sein: Namen und
Spezifikationen eingeben, passende Projektionen prüfen und die Ergebnisse als
Lernkarten weiterverwenden. Die App versucht dabei lieber „Das kann ich nicht
sicher bestätigen“ zu sagen, als eine hübsche, aber womöglich falsche Struktur
zu erfinden.

## Was PandaMol kann

- Chemische Namen und zusätzliche Angaben wie **α/β**, **D-/L-Form**,
  **offenkettig/zyklisch**, **(R)/(S)** oder **Zwitterion bei pH 7** verarbeiten.
- Strukturen über PubChem auflösen und die Ergebnisse lokal mit OpenChemLib
  validieren; je nach Projektion werden auch stereochemische Informationen
  geprüft. Der NCI/CADD Resolver kann zusätzlich zur Gegenprüfung herangezogen
  werden.
- **Skelettformeln**, **Fischer-**, **Haworth-Projektionen** und – bei passenden
  Sechsringen – **Sesselkonformationen** anzeigen.
- Lernfreundliche Optionen wie CIP-Kennzeichnung (R/S), C-Nummerierung,
  farbige Heteroatome und einheitliche Ausrichtung anbieten.
- Ergebnisse bestätigen, verwerfen, im Verlauf wieder öffnen und als **SVG,
  PNG oder JPEG** exportieren.
- Mit Schnellbeispielen wie Glucose, L-Alanin, Aspirin und Coffein den ersten
  Versuch deutlich beschleunigen. Chemie darf schließlich auch Abkürzungen
  nehmen.

## Was PandaMol nicht ist

PandaMol ist ein **Lernwerkzeug**, kein Ersatz für Lehrbücher, Fachliteratur,
Lehrende oder eine unabhängige fachliche Prüfung. Es ist kein
Molekülsimulator und berechnet weder Reaktionen noch Synthesewege,
Wirkstoffwirkung oder Toxizität. Die App verspricht auch nicht, jeden Namen,
jede Spezifikation oder jede Projektion darstellen zu können.

Strukturangaben werden nicht frei von einer KI gezeichnet: Die App löst Namen
über Datenquellen auf und verwirft Ergebnisse, die ihre Prüfungen nicht
bestehen. Für eine zusätzliche Namensauflösung kann der Web-/Serverbetrieb
optional Gemini verwenden, wenn `GEMINI_API_KEY` konfiguriert ist. Auch dann
stammt die dargestellte Struktur aus einer Datenbank und wird lokal geprüft.

## So verwendest du die App

1. Öffne den **Struktur-Generator** und gib einen Stoffnamen ein, zum Beispiel
   `Glucose`, `L-Alanin` oder `Aspirin`.
2. Ergänze bei Bedarf Details, etwa `beta-D-Pyranose`,
   `offenkettig, D-Form`, `(S)-Enantiomer` oder `Zwitterion bei pH 7`.
3. Wähle eine oder mehrere Darstellungsformen und optional die Anzeigeoptionen.
4. Wähle **„Strukturen prüfen & generieren“**. Nicht passende oder nicht sicher
   validierbare Darstellungen werden mit einem Hinweis erklärt.
5. Prüfe das Ergebnis. Bestätigte Strukturen lassen sich exportieren; frühere
   Ergebnisse findest du im **Verlauf**. Der Verlauf wird lokal im Browser bzw.
   App-Profil gespeichert und nicht zwischen Geräten synchronisiert.

Unter **„Validierungsprinzip“** erklärt PandaMol, wie die Strukturprüfung
funktioniert. Das Design kann außerdem zwischen Hell- und Dunkelmodus wechseln.

## Installation: Meldung „Datei beschädigt“?

Bei heruntergeladenen Apps kann eine Sicherheitsprüfung eine Datei als
„beschädigt“ oder „nicht installierbar“ bezeichnen, obwohl eigentlich ein
Sicherheitsmerkmal oder ein Konflikt mit einer älteren Installation gemeint
ist. Das ist nicht automatisch ein Beweis, dass die Datei in Ordnung ist:
Installiere PandaMol nur aus der offiziellen
[GitHub-Release-Seite](https://github.com/panda-test-lab/PandaMol/releases).
Wenn die Datei tatsächlich unvollständig oder verändert ist, hilft nur ein
erneuter Download des passenden Pakets.

### Android

Verwende das **Android-APK** aus dem offiziellen Release – nicht einen
Desktop-Installer. Android kann eine Installation unter anderem blockieren,
wenn Installationen aus der verwendeten Quelle nicht erlaubt sind oder wenn
eine bereits installierte PandaMol-Version mit einer anderen Signatur
aktualisiert werden soll.

1. Lade das APK erneut vollständig aus dem offiziellen Release herunter.
2. Erlaube bei Bedarf für die verwendete Browser- oder Dateien-App die
   Installation unbekannter Apps. Je nach Android-Version heißt der Weg etwa
   **Einstellungen → Apps → Spezieller App-Zugriff → Unbekannte Apps
   installieren**.
3. Wenn bereits eine nicht kompatible PandaMol-Version installiert ist, kann
   deren Deinstallation nötig sein, bevor das neue APK installiert wird.
   **Achtung:** Beim Deinstallieren können lokal gespeicherte App-Daten und der
   Verlauf verloren gehen.

Wenn Android weiterhin meldet, das Paket sei beschädigt, kontrolliere, dass
du wirklich ein APK für Android verwendest, und lade es erneut herunter.
Deaktiviere Schutzfunktionen nicht pauschal, um eine fehlerhafte oder
unbekannte Datei zu installieren.

### macOS (Apple-Computer)

Die folgenden Schritte gelten für die PandaMol-Desktop-App auf einem Mac.
Ein iOS-Simulator-Build ist kein regulär installierbares Paket für iPhone oder
iPad.

macOS kann bei einem aus dem Internet geladenen App-Bundle die Meldung
**„PandaMol ist beschädigt und kann nicht geöffnet werden“** anzeigen. Bei
einem vertrauenswürdigen offiziellen Download kann das an der macOS-Quarantäne
liegen. Die App muss dafür zunächst entpackt und zum Beispiel nach
`/Applications` verschoben werden.

Öffne **Terminal** und entferne das Quarantäne-Attribut für die App:

```sh
xattr -dr com.apple.quarantine "/Applications/PandaMol.app"
```

Liegt PandaMol an einem anderen Ort, ersetze den Pfad durch den tatsächlichen
App-Pfad, zum Beispiel:

```sh
xattr -dr com.apple.quarantine "$HOME/Downloads/PandaMol.app"
```

Versuche anschließend, PandaMol erneut zu öffnen. Alternativ kann macOS bei
manchen Sicherheitsmeldungen unter **Systemeinstellungen → Datenschutz &
Sicherheit** die Option **„Dennoch öffnen“** anbieten. Das Entfernen der
Quarantäne schwächt eine Schutzprüfung für genau diese App: Verwende den
Befehl daher nur für einen Download aus der offiziellen Release-Quelle.
Bei einem unvollständigen oder tatsächlich beschädigten Download bitte die
Datei löschen und neu herunterladen.

## Desktop-Updates und Fehlerprotokoll

Desktop-Builds suchen beim Start automatisch nach Updates. Wenn ein Update
verfügbar ist, kannst du es in der App installieren; danach startet PandaMol
neu. Fehlerdetails werden in der App im **Fehlerprotokoll** angezeigt und bei
Desktop-Builds zusätzlich im Tauri-App-Logverzeichnis gespeichert.

## Für Entwicklung und lokales Ausführen

Voraussetzungen: Node.js und npm.

```sh
npm install
npm run dev
```

Das startet die Web-App samt lokalem Express-Server unter
`http://localhost:3000`. Für zusätzliche Gemini-gestützte Namensauflösung kann
`GEMINI_API_KEY` in einer `.env`-Datei gesetzt werden; die grundlegende
deterministische Auflösung und Validierung benötigt diesen Schlüssel nicht.

Für die Desktop-App brauchst du zusätzlich die für Tauri und dein
Betriebssystem nötigen Build-Werkzeuge:

```sh
npm run tauri:dev
npm run tauri:build
```

## Netzwerk und Protokolle

Für die chemische Auflösung fragt PandaMol PubChem PUG REST und bei Bedarf den
NCI/CADD Resolver über HTTPS ab. Der lokale Express-Server bindet
standardmäßig nur an `127.0.0.1`. Serverereignisse werden ohne eingegebene
Suchbegriffe nach `logs/pandamol.log` geschrieben. Mit `PANDAMOL_LOG_DIR` kann
ein anderes Logverzeichnis festgelegt werden. Öffentliche Bereitstellungen
sollten TLS über einen Reverse Proxy terminieren.
