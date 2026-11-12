# Budget (PWA)

Persönliche Budget-App als installierbare Web-App (Mac, Android). Alle Daten liegen im **eigenen Google Sheet**
der Person, die die App benutzt. Dieses Repository enthält nur die Oberfläche, keine Daten.

## Funktionsweise
- Login mit Google (Google Identity Services), Zugriff aufs Sheet über die Google Sheets API.
- Blätter im Sheet: `Buchungen`, `Kategorien`, `Regeln`, `Einstellungen`.
- Import von CSV-Auszügen (UBS-Konto, UBS-Kreditkarte, Wise) mit Regeln aus dem Blatt `Regeln`.
- Offline: letzte Daten bleiben auf dem Gerät, Änderungen werden später übertragen.
- Sheet-ID und OAuth-Client-ID werden beim ersten Start eingegeben und nur im Browser gespeichert.

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche |
| `daten.js` | Login, Sheets-API, Offline-Warteschlange |
| `logik.js` | CSV-Erkennung, Regeln, Doppel-Erkennung |
| `sw.js` | Service Worker (App offline starten) |

## Lokal testen
```
python3 -m http.server 8080
```
und `http://localhost:8080` öffnen (diese Adresse muss in der OAuth-Client-ID als JavaScript-Quelle eingetragen sein).

Nach Änderungen an Dateien `VERSION` in `sw.js` erhöhen, damit installierte Apps die neue Version laden.
