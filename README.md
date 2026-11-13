# Budget (PWA)

Persönliche Budget-App als installierbare Web-App (Mac, Android). Alle Daten liegen im **eigenen Google Sheet**
der Person, die die App benutzt. Dieses Repository enthält nur die Oberfläche, keine Daten.

## Funktionsweise
- Login mit Google (Google Identity Services), Zugriff aufs Sheet über die Google Sheets API.
- Blätter im Sheet: `Buchungen`, `Kategorien`, `Regeln`, `Einstellungen`, optional `Rückstellungen` und `Vermögen`.
- Import von CSV-Auszügen (UBS-Konto, UBS-Kreditkarte, Wise) mit Regeln aus dem Blatt `Regeln`.
- Offline: letzte Daten bleiben auf dem Gerät, Änderungen werden später übertragen.
- Sheet-ID und OAuth-Client-ID werden beim ersten Start eingegeben und nur im Browser gespeichert.
- Persönliches (Regeln, Stichwörter, Kontoangaben) steht nur im Sheet, nie im Code.

## Aufbau
| Pfad | Inhalt |
|---|---|
| `index.html` | Grundgerüst: Ansichten, Dialoge, Ladereihenfolge der Skripte |
| `css/app.css` | Stile: Design-Tokens (hell/dunkel), Komponenten, Ansichten |
| `js/logik.js` | CSV-Erkennung, Regeln, Doppel-Erkennung (auch in Node nutzbar) |
| `js/daten.js` | Login, Sheets-API, Prüfung der Zeile vor dem Schreiben, Offline-Warteschlange |
| `js/sperre.js` | App-Sperre: PIN (PBKDF2-Hash) und Biometrie (Passkey) |
| `js/ui/*.js` | Oberfläche, eine Datei pro Bereich (siehe unten) |
| `sw.js` | Service Worker (App offline starten) |
| `tests/` | Tests mit erfundenen Daten |

Die Dateien in `js/ui/` sind klassische Skripte, die sich den globalen Gültigkeitsbereich teilen. Die Reihenfolge in
`index.html` ist wichtig: `basis` (Hilfsfunktionen, Navigation, Laden) zuerst, `einstellungen` (enthält `start()`) zuletzt.

| `js/ui/` | Bereich |
|---|---|
| `basis.js` | Konstanten, Hilfsfunktionen, Meldungen, Navigation, Laden |
| `uebersicht.js` | Reiter, Monate, Budget, Kategorien, Buchungslisten |
| `bearbeiten.js` | Bearbeiten-Dialog, Löschen mit Rückgängig |
| `pruefen.js`, `import.js`, `suche.js`, `erfassen.js` | die gleichnamigen Ansichten |
| `rechnungen.js` | Jahresrechnungen: Plan vs. bezahlt |
| `steuern.js` | Steuer-Tags, Vorschläge, Export |
| `vermoegen.js` | Nettovermögen, Verlauf, Kontostände |
| `vergleich.js` | Jahresvergleich |
| `einrichtung.js` | Einrichtung, Google-Login, Statusanzeige |
| `sperre-ui.js` | Sperrbildschirm |
| `einstellungen.js` | Einstellungen und Start der App |

## Tests
```
npm install
npm test
```
- `tests/logik.test.js` – Import-Logik mit erfundenen Auszügen
- `tests/app.test.js` – ganze App in jsdom gegen ein nachgebautes Google Sheet (feste Zeit 12.11.2026)
- `tests/a11y.test.js` – Barrierefreiheit aller Ansichten mit axe-core (WCAG 2.1 A/AA, ohne Kontrast)

Die Tests laufen bei jedem Push automatisch (GitHub Actions).

## Lokal ausprobieren
```
python3 -m http.server 8080
```
und `http://localhost:8080` öffnen (diese Adresse muss in der OAuth-Client-ID als JavaScript-Quelle eingetragen sein).

Nach Änderungen `VERSION` in `sw.js` erhöhen, damit installierte Apps die neue Version laden. Neue Dateien auch in
`DATEIEN` in `sw.js` eintragen.
