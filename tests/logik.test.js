// Unit-Tests der Import-Logik mit erfundenen Auszügen (keine echten Kontodaten im Repo). Aufruf: npm test
const assert = require('assert');
const L = require('../js/logik.js');

let n = 0;
const test = (name, f) => { f(); n++; console.log('ok  ', name); };
const regeln = L.regelnAusZeilen([
  ['Lohn AG + Salaer', 'Gutschrift', 'Einnahme', 'Lohn', '', '', 'Lohn'],
  ['Massagepraxis', 'Belastung', 'Ausgabe', 'Massagen', 0.2, '', 'Massage ({betrag})'],
  ['Laden', 'Belastung', 'Ausgabe', 'Lebensmittel', '', 6, 'Snack'],
  ['Laden', 'Belastung', 'Ausgabe', 'Auswärts essen', '', '', 'Mittagessen'],
  ['Übertrag', 'beide', 'Ignorieren', '', '', '', 'Übertrag'],
  ['', 'beide', 'Ausgabe', 'leer', '', '', '']          // leerer Suchbegriff wird übersprungen
]);
const leer = { regeln: [], vorhanden: [], einst: {} };

const ubsKonto = (iban, zeilen, bis = '2026-10-31') => `﻿Kontonummer:;0000;\nIBAN:;${iban};\nVon:;2026-10-01;\nBis:;${bis};\nAnfangssaldo:;100;\nSchlusssaldo:;1'234.50;\n\n` +
  'Abschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;Beschreibung3;Fussnoten;\n' +
  zeilen.map(z => `${z[0]};;${z[6] === 'vorgemerkt' ? '' : z[0]};;CHF;${z[1]};${z[2]};;;${z[3]};${z[4]};${z[5] || ''};;;`).join('\n') + '\n';

test('UBS-Konto: Lohnkonto, Regeln, Faktor, Betragsgrenze, Ignorieren, unbekannt', () => {
  const t = ubsKonto('CH00 0000 0000', [
    ['2026-10-25', '', '5000.00', 'T1', 'Lohn AG', 'Salaer 10/2026'],
    ['2026-10-20', '-100.00', '', 'T2', 'Massagepraxis Muster'],
    ['2026-10-18', '-5.50', '', 'T3', 'Laden Bahnhof'],
    ['2026-10-18', '-12.00', '', 'T4', 'Laden Bahnhof'],
    ['2026-10-17', '-500.00', '', 'T5', 'Übertrag Sparkonto'],
    ['2026-10-16', '-42.00', '', 'T6', 'Unbekannte GmbH']]);
  const r = L.auswerten(t, 'k.csv', { ...leer, regeln });
  assert.strictEqual(r.format, 'UBS Lohnkonto');
  assert.strictEqual(r.total, 6); assert.strictEqual(r.ignoriert, 1); assert.strictEqual(r.neu.length, 5); assert.strictEqual(r.offen, 1);
  const by = k => r.neu.find(b => b.key.startsWith('UBS|' + k + '|'));
  assert.deepStrictEqual([by('T1').typ, by('T1').betrag, by('T1').kategorie], ['Einnahme', 5000, 'Lohn']);
  assert.deepStrictEqual([by('T2').betrag, by('T2').notiz], [20, 'Massage (100.00)']);
  assert.strictEqual(by('T3').kategorie, 'Lebensmittel');       // bis 6 CHF
  assert.strictEqual(by('T4').kategorie, 'Auswärts essen');     // darüber nächste Regel
  assert.deepStrictEqual([by('T6').status, by('T6').betrag], ['prüfen', 42]);
  assert.deepStrictEqual(r.saldo, { konto: 'Lohnkonto', datum: '2026-10-31', betrag: 1234.5 });
});

test('UBS-Konto: Rückstellungskonto über IBAN-Teil aus den Einstellungen', () => {
  const r = L.auswerten(ubsKonto('CH00 1111 XX99 Q', [['2026-10-01', '-1.00', '', 'T9', 'x']]), 'r.csv', { ...leer, einst: { 'IBAN-Teil Rückstellungskonto': 'XX 99' } });
  assert.strictEqual(r.format, 'UBS Rückstellungskonto');
});

test('Doppel: gleicher Schlüssel und alte Buchungen ohne Schlüssel (Datum + Betrag)', () => {
  const t = ubsKonto('CH00', [['2026-10-05', '-10.00', '', 'A1', 'x'], ['2026-10-06', '-20.00', '', 'A2', 'y'], ['2026-10-07', '-30.00', '', 'A3', 'z']]);
  const vorhanden = [{ key: 'UBS|A1|-10.00', datum: '2026-10-05', betrag: 10 }, { key: '', datum: '2026-10-06', betrag: 20 }];
  const r = L.auswerten(t, 'k.csv', { ...leer, vorhanden });
  assert.strictEqual(r.doppelt, 2); assert.strictEqual(r.neu.length, 1); assert.strictEqual(r.neu[0].key, 'UBS|A3|-30.00');
});

test('UBS-Konto: vorgemerkte Zahlung (ohne Buchungsdatum) wird weggelassen und gemeldet', () => {
  const t = ubsKonto('CH00', [['2026-11-09', '-19.50', '', '9999X', 'Restaurant AG', '', 'vorgemerkt'], ['2026-11-09', '-5.00', '', 'B1', 'Kiosk']]);
  const r = L.auswerten(t, 'v.csv', leer);
  assert.strictEqual(r.total, 1); assert.strictEqual(r.neu[0].key, 'UBS|B1|-5.00');
  assert.ok(/Noch nicht verbucht.*Restaurant AG.*19\.50/.test(r.hinweise[0]));
});

const karte = zeilen => 'sep=;\nKontonummer;Kartennummer;Konto-/Karteninhaber;Einkaufsdatum;Buchungstext;Branche;Betrag;Originalwährung;Kurs;Währung;Belastung;Gutschrift;Buchung\n' +
  zeilen.map(z => `1;2;X;${z[0]};${z[1]};;${z[2]};${z[3]};;CHF;${z[4]};${z[5] || ''};${z[0]}`).join('\n') + '\n';

test('Kreditkarte: Auslandszuschlag zum Einkauf, LSV übersprungen, unverbucht als Hinweis', () => {
  const r = L.auswerten(karte([
    ['10.10.2026', 'SHOP LONDON GBR', '50', 'GBP', '56.00'],
    ['10.10.2026', '1.75% ZUSCHLAG CHF IM AUSLAND', '0.98', 'CHF', '0.98'],
    ['11.10.2026', '2002 LSV-ZAHLUNG', '300', 'CHF', '', '300'],
    ['12.10.2026', 'PENDING SHOP', '9', 'EUR', '']]), 'kk.csv', leer);
  assert.strictEqual(r.format, 'UBS Kreditkarte');
  assert.strictEqual(r.neu.length, 1);
  assert.strictEqual(r.neu[0].betrag, 56.98);
  assert.ok(/inkl\. 1\.75 % Zuschlag/.test(r.neu[0].notiz));
  assert.strictEqual(r.hinweise.length, 1);
});

test('Kreditkarte: zwei identische Käufe am selben Tag bleiben beide (#2)', () => {
  const r = L.auswerten(karte([['05.10.2026', 'TICKET', '21', 'CHF', '21.00'], ['05.10.2026', 'TICKET', '21', 'CHF', '21.00']]), 'kk.csv', leer);
  assert.strictEqual(r.neu.length, 2);
  assert.notStrictEqual(r.neu[0].key, r.neu[1].key); assert.ok(r.neu[1].key.endsWith('#2'));
});

test('Wise: nur abgeschlossene Kartenzahlungen, Kurs aus Einstellungen, fehlender Kurs als Hinweis', () => {
  const t = 'ID,Status,Richtung,Erstellt am,Ausgangsbetrag (nach Gebühren),Ausgangswährung,Name des Empfängers,Kategorie\n' +
    'CARD_TRANSACTION-1,COMPLETED,OUT,2026-10-03 10:00,10.00,EUR,Café,Essen\n' +
    'CARD_TRANSACTION-2,CANCELLED,OUT,2026-10-03 11:00,5.00,EUR,Café,Essen\n' +
    'TRANSFER-3,COMPLETED,OUT,2026-10-03 12:00,100.00,EUR,Konto,\n' +
    'CARD_TRANSACTION-4,COMPLETED,OUT,2026-10-04 10:00,7.00,USD,Kiosk,\n';
  const r = L.auswerten(t, 'w.csv', { ...leer, einst: { 'Wise-Kurs EUR': 0.93 } });
  assert.strictEqual(r.format, 'Wise'); assert.strictEqual(r.neu.length, 1);
  assert.strictEqual(r.neu[0].betrag, 9.3); assert.strictEqual(r.hinweise.length, 1);
});

test('Budget-App-Import: übernimmt Typ/Kategorie, prüft Pflichtfelder', () => {
  const kopf = 'Budget-App Import\nDatum;Typ;Betrag;Kategorie;Notiz;Konto;Banktext;Quelle;Status;Import-Schlüssel\n';
  const r = L.auswerten(kopf + '2025-01-02;Ausgabe;12.50;Lebensmittel;Brot;Karte;;Import;ok;F1\n2025-01-03;Einnahme;100;Lohn;;;;;prüfen;F2\n', 'f.csv', leer);
  assert.strictEqual(r.neu.length, 2); assert.strictEqual(r.offen, 1); assert.strictEqual(r.neu[0].kategorie, 'Lebensmittel');
  assert.throws(() => L.auswerten(kopf + '02.01.2025;Ausgabe;1;x;;;;;ok;F3\n', 'f.csv', leer), /Datum ungültig/);
  assert.throws(() => L.auswerten(kopf + '2025-01-02;Foo;1;x;;;;;ok;F3\n', 'f.csv', leer), /Typ ungültig/);
});

test('Unbekanntes Format wird abgelehnt', () => {
  assert.throws(() => L.auswerten('a,b,c\n1,2,3\n', 'x.csv', leer), /Unbekanntes Format: x\.csv – beginnt mit «a,b,c…»/);
  assert.throws(() => L.auswerten('', 'x.csv', leer), /die Datei ist leer/);
  assert.throws(() => L.auswerten('ï»¿Kontonummer:,0000,\nIBAN:,CH00,\n', 'y.csv', leer), /Google Sheets.*Original-Datei/);
});

test('CSV-Parser: Anführungszeichen, Semikolon im Feld, Zeilenumbruch im Feld', () => {
  assert.deepStrictEqual(L.parseCsv('a;"b;c";"d ""e"""\n"x\ny";z\n', ';'), [['a', 'b;c', 'd "e"'], ['x\ny', 'z']]);
});

console.log(`\nALLES OK (${n} Tests)`);
