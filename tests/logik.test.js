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

test('UBS-Konto: weitere Konten über «IBAN-Teil <Name>», ohne Treffer Lohnkonto', () => {
  const einst = { 'IBAN-Teil Rückstellungskonto': 'XX99', 'IBAN-Teil Assistenzkonto': 'AB 12' };
  const a = L.auswerten(ubsKonto('CH00 2222 AB12 Q', [['2026-10-01', '-80.00', '', 'T7', 'Schwimmlektion']]), 'a.csv', { ...leer, einst });
  assert.strictEqual(a.format, 'UBS Assistenzkonto'); assert.strictEqual(a.neu[0].konto, 'Assistenzkonto');
  const l = L.auswerten(ubsKonto('CH00 3333 ZZ00 Q', [['2026-10-01', '-5.00', '', 'T8', 'x']]), 'l.csv', { ...leer, einst });
  assert.strictEqual(l.format, 'UBS Lohnkonto');
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

test('Kreditkarte: Zuschlag über dem Einkauf oder zwischen zwei Einkäufen geht an den rechnerisch passenden', () => {
  const r = L.auswerten(karte([
    ['19.04.2026', 'VISA FEE BUCURESTI ROU', '148', 'CHF', '148.00'],
    ['19.04.2026', 'HOTEL LONDON GBR', '714.15', 'GBP', '786.60'],
    ['19.04.2026', '1.75% ZUSCHLAG CHF IM AUSLAND', '2.59', 'CHF', '2.59'],
    ['03.02.2026', '1.75% ZUSCHLAG CHF IM AUSLAND', '2.89', 'CHF', '2.89'],
    ['03.02.2026', 'BOOKING HOTEL NLD', '164.94', 'CHF', '164.94'],
    ['03.02.2026', 'FLUG CHE', '268.25', 'CHF', '268.25']]), 'kk.csv', leer);
  const betrag = t => r.neu.find(b => b.banktext.includes(t)).betrag;
  assert.strictEqual(r.neu.length, 4);
  assert.strictEqual(betrag('VISA FEE'), 150.59); assert.strictEqual(betrag('HOTEL LONDON'), 786.6);
  assert.strictEqual(betrag('BOOKING'), 167.83); assert.strictEqual(betrag('FLUG'), 268.25);
});

test('Kreditkarte: Zuschlag ohne Einkauf am selben Tag bleibt eigene Buchung', () => {
  const r = L.auswerten(karte([['25.01.2026', '1.75% ZUSCHLAG CHF IM AUSLAND', '3.42', 'CHF', '3.42'], ['24.01.2026', 'SHOP', '10', 'CHF', '10.00']]), 'kk.csv', leer);
  assert.strictEqual(r.neu.length, 2);
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

test('Wiederkehrend: monatlich, vierteljährlich, jährlich, Mehrfachzahlung am selben Tag; Unregelmässiges und Beendetes nicht', () => {
  const b = (datum, betrag, kategorie, notiz, typ = 'Ausgabe') => ({ datum, betrag, kategorie, notiz, typ });
  const l = [];
  ['2026-06-15', '2026-07-15', '2026-08-14', '2026-09-15', '2026-10-15'].forEach(d => l.push(b(d, 39.95, 'TV, Internet', 'Salt')));
  ['2026-01-02', '2026-04-01', '2026-07-01', '2026-10-01'].forEach(d => l.push(b(d, 593.5, 'Krankenkasse', 'Sanitas (Rechnung)', 'Rückstellung')));
  [['2024-12-10', 400], ['2024-12-10', 400], ['2025-12-04', 400], ['2025-12-04', 400]].forEach(([d, v]) => l.push(b(d, v, 'Reka Aufladung', 'Reka', 'Rückstellung')));
  ['2026-09-02', '2026-09-09', '2026-09-30', '2026-10-03'].forEach(d => l.push(b(d, 80, 'Schwimm-Lektionen', 'Lektion mit Sascha')));
  ['2025-01-05', '2025-02-05', '2025-03-05', '2025-04-05'].forEach(d => l.push(b(d, 20, 'Software & KI-Abos', 'Altes Abo')));
  ['2026-08-01', '2026-09-01', '2026-10-01'].forEach((d, i) => l.push(b(d, [60, 75, 90][i], 'Strom', 'EWB')));
  ['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10'].forEach((d, i) => l.push(b(d, [40, 420, 95, 260][i], 'Kleidung & Schuhe', 'Kleider')));
  const r = L.wiederkehrend(l, '2026-11-12'), f = n => r.find(x => x.name.startsWith(n));
  assert.strictEqual(f('Salt').rhythmus, 'monatlich'); assert.strictEqual(f('Salt').naechste, '2026-11-15'); assert.strictEqual(f('Salt').betrag, 39.95);
  assert.strictEqual(f('Sanitas').rhythmus, 'vierteljährlich'); assert.strictEqual(f('Sanitas').naechste, '2027-01-01');
  assert.strictEqual(f('Reka').rhythmus, 'jährlich'); assert.strictEqual(f('Reka').betrag, 800); assert.strictEqual(f('Reka').naechste, '2026-12-04');
  assert.ok(!f('Lektion'), 'unregelmässige Lektionen sind kein Abo');
  assert.ok(!f('Altes Abo'), 'seit Monaten beendet');
  assert.ok(!f('Kleider'), 'stark schwankende Einkäufe sind kein Abo');
  assert.strictEqual(f('EWB').variabel, true);
  assert.deepStrictEqual(r.map(x => x.naechste), [...r.map(x => x.naechste)].sort());
});

test('Auffälligkeiten: grosse Ausgabe, Kategorie über Schnitt, Abo teurer und neu, doppelt; Reisen und Normales nicht', () => {
  const b = (datum, betrag, kategorie, notiz, extra = {}) => Object.assign({ datum, betrag, kategorie, notiz, typ: 'Ausgabe', banktext: notiz.toUpperCase() }, extra);
  const l = [];
  for (let m = 1; m <= 10; m++) {
    const mm = String(m).padStart(2, '0');
    l.push(b(`2026-${mm}-05`, 60 + m, 'Möbel & Geräte', 'Kleinkram'));
    l.push(b(`2026-${mm}-08`, 100, 'Lebensmittel', 'Einkauf'), b(`2026-${mm}-20`, 100, 'Lebensmittel', 'Einkauf'));
    l.push(b(`2026-${mm}-15`, m < 10 ? 39.95 : 44.95, 'TV, Internet', 'Salt'));
  }
  l.push(b('2026-11-03', 900, 'Möbel & Geräte', 'Sofa'));                      // gross
  l.push(b('2026-11-02', 300, 'Lebensmittel', 'Einkauf'), b('2026-11-09', 150, 'Lebensmittel', 'Einkauf'));   // Monat 450 vs. Schnitt 200
  ['2026-08-11', '2026-09-11', '2026-10-11'].forEach(d => l.push(b(d, 17, 'Google One (Gemini)', 'Gemini')));   // neues Abo
  l.push(b('2026-11-06', 33.4, 'Ausgehen & Soziales', 'Ticketmaster'), b('2026-11-06', 33.4, 'Ausgehen & Soziales', 'Ticketmaster'));
  l.push(b('2026-11-04', 2500, 'Reise Rom Nov 2026', 'Hotel Rom'));             // Reise: nie auffällig
  const r = L.auffaelligkeiten(l, '2026-11-12'), arten = a => r.filter(x => x.art === a);
  assert.strictEqual(arten('gross').length, 1); assert.strictEqual(arten('gross')[0].betrag, 900);
  assert.ok(arten('kategorie').some(x => x.kategorie === 'Lebensmittel'));
  assert.strictEqual(arten('teurer').length, 1); assert.strictEqual(arten('teurer')[0].jetzt, 44.95);
  assert.ok(arten('neu').some(x => x.abo.name === 'Gemini'));
  assert.ok(!arten('neu').some(x => x.abo.name === 'Salt'));
  assert.strictEqual(arten('doppelt').length, 1);
  assert.ok(!r.some(x => x.buchung && /Reise/.test(x.buchung.kategorie)));
  assert.strictEqual(r[0].art, 'doppelt');
  assert.strictEqual(new Set(r.map(x => x.id)).size, r.length);
});

test('Prognose Kontostand: Start + Buchungen seither, dann Lohn, Fixkosten, Jahresrechnung und Schnitt der übrigen Ausgaben', () => {
  const b = (datum, typ, betrag, kategorie, notiz) => ({ datum, typ, betrag, kategorie, notiz });
  const l = [];
  for (let m = 1; m <= 11; m++) {
    const mm = String(m).padStart(2, '0');
    if (m <= 10) l.push(b(`2026-${mm}-25`, 'Einnahme', 5000, 'Lohn', 'Lohn'));
    l.push(b(`2026-${mm}-01`, 'Ausgabe', 1500, 'Miete', 'Miete'));
    if (m <= 10) l.push(b(`2026-${mm}-12`, 'Ausgabe', 600, 'Lebensmittel', 'Einkauf'), b(`2026-${mm}-27`, 'Ausgabe', 600, 'Lebensmittel', 'Einkauf'));
  }
  ['2025-02-15', '2026-02-15'].forEach(d => l.push(b(d, 'Rückstellung', 7000, 'Steuern', 'Steuern')));
  l.push(b('2026-11-03', 'Ausgabe', 200, 'Lebensmittel', 'Einkauf'), b('2026-11-04', 'Ausgabe', 3000, 'Reise Rom Nov 2026', 'Hotel'));
  const p = L.prognose(l, { datum: '2026-10-31', saldo: 10000 }, '2026-11-12', 4);
  assert.strictEqual(p.heute.saldo, 10000 - 1500 - 200 - 3000);
  assert.strictEqual(p.schnittVariabel, 1000);   // 10 Monate × 1'200 / 12, Reise nicht dabei
  assert.deepStrictEqual(p.monate.map(m => m.monat), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.strictEqual(p.monate[0].ein, 5000); assert.strictEqual(p.monate[0].fix, 0); assert.strictEqual(p.monate[0].variabel, 800);
  assert.strictEqual(p.monate[1].fix, 1500); assert.strictEqual(p.monate[3].fix, 1500 + 7000);
  assert.strictEqual(p.monate[3].ende, 5300 + 5000 - 800 + 3 * (5000 - 1500 - 1000) - 7000);
});

test('Monate addieren: Monatsende', () => {
  assert.strictEqual(L.plusMonate('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(L.plusMonate('2026-11-15', 2), '2027-01-15');
});

console.log(`\nALLES OK (${n} Tests)`);
