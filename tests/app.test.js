// Ende-zu-Ende-Test der App in jsdom: nachgebautes Google Sheet (Sheets-API im Speicher), Fake-Google-Login, feste Zeit.
// Nur erfundene Daten. Aufruf: npm test
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const DIR = path.join(__dirname, '..');
// alle lokalen Skripte aus index.html direkt einbetten (Google-Login wird simuliert)
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8')
  .replace(/<script src="https:\/\/[^"]*"[^>]*><\/script>/g, '')
  .replace(/<script src="([^"]+)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(path.join(DIR, f), 'utf8') + '</script>');
const JETZT = new Date(2026, 10, 12, 12, 0, 0).getTime();   // 12.11.2026

const errors = []; const check = (n, c) => { if (!c) errors.push('FAIL ' + n); else { globalThis.__ok = (globalThis.__ok || 0) + 1; console.log('ok  ', n); } };
const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message)); vc.on('error', e => errors.push('console.error: ' + e));

/* ---------- Fake-Sheet ---------- */
const ser = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5 + 25569; };
const y = 2026, mo = 11, dd = `${y}-${String(mo).padStart(2, '0')}-05`;
const S = {
  Buchungen: [['Datum', 'Jahr', 'Monat', 'Typ', 'Betrag', 'Kategorie', 'Notiz', 'Konto', 'Banktext', 'Quelle', 'Status', 'Tags', 'Import-Schlüssel'],
    [ser(dd), y, mo, 'Ausgabe', 50, 'Lebensmittel', 'Migros', 'Karte', 'MIGROS BERN', 'Import', 'ok', '', 'k1'],
    [ser(dd), y, mo, 'Ausgabe', 12.5, '', 'Kiosk', 'Karte', 'KIOSK X', 'Import', 'prüfen', '', 'k2'],
    [ser(dd), y, mo, 'Einnahme', 5000, 'Lohn', 'Lohn', 'Lohnkonto', 'LOHN', 'Import', 'ok', '', 'k3']],
  Kategorien: [['Kategorie', 'Gruppe', 'Budget'], ['Lebensmittel', 'Alltag', 150], ['Kleider', 'Alltag', 100], ['Typen in «Buchungen»: …']],
  Regeln: [['Suchbegriff'], ['Migros', 'Belastung', 'Ausgabe', 'Lebensmittel', '', '', 'Migros'], ['Ignoriermich', 'beide', 'Ignorieren', '', '', '', 'Übertrag']],
  Einstellungen: [['Einstellung', 'Wert'], ['IBAN-Teil Rückstellungskonto', 'XX99']],
  'Vermögen': [['Datum'], ['2026-09-30', 'Lohnkonto', 'Flüssig', 1000, ''], ['2026-09-30', 'Vorsorge 3a', 'Vorsorge', 5000, ''],
    ['2026-10-31', 'Lohnkonto', 'Flüssig', 1500, ''], ['2026-10-31', 'Vorsorge 3a', 'Vorsorge', 5200, ''], ['2026-10-31', 'Kredit', 'Schulden', 700, '']],
  Rückstellungen: [['Posten'], ['Steuern', 'Steuern', 100, 'ja', ''], ['Serafe', 'Serafe', 28, 'ja', 'jährlich'], ['Auto', 'Auto', 50, 'nein', ''], ['Hinweis: …']]
};
const IDS = { Buchungen: 1, Kategorien: 2, Regeln: 3, Einstellungen: 4, 'Rückstellungen': 5, 'Vermögen': 6 };
const NAME = Object.fromEntries(Object.entries(IDS).map(([k, v]) => [v, k]));
const col = c => c.charCodeAt(0) - 65;
function bereich(a1) {   // 'Buchungen!A2:M' / 'Buchungen!F5' / 'Buchungen!A5:M5'
  const [blatt, ref] = a1.split('!'); const m = ref.match(/^([A-Z])(\d*)(?::([A-Z])(\d*))?$/);
  return { blatt, c1: col(m[1]), r1: m[2] ? +m[2] - 1 : 0, c2: m[3] ? col(m[3]) : col(m[1]), r2: m[4] ? +m[4] - 1 : (m[3] ? Infinity : +m[2] - 1) };
}
const lesen = a1 => { const b = bereich(a1); return S[b.blatt].slice(b.r1, b.r2 + 1).map(r => r.slice(b.c1, b.c2 + 1)).filter(r => r.some(v => v !== '' && v !== undefined)); };
let calls = [], netz = true;
async function fakeFetch(url, opt = {}) {
  if (!netz) throw new TypeError('Failed to fetch');
  const u = new URL(url); const p = decodeURIComponent(u.pathname.replace(/^\/v4\/spreadsheets\/[^/:]+/, ''));
  const body = opt.body ? JSON.parse(opt.body) : null; calls.push((opt.method || 'GET') + ' ' + p);
  const ok = j => ({ ok: true, status: 200, json: async () => j });
  if (!/Bearer tok/.test(opt.headers.Authorization)) return { ok: false, status: 401, statusText: 'x', json: async () => ({}) };
  if (u.searchParams.get('fields')) return ok({ sheets: Object.entries(IDS).map(([t, i]) => ({ properties: { sheetId: i, title: t } })) });
  if (p === '/values:batchGet') return ok({ valueRanges: u.searchParams.getAll('ranges').map(r => ({ values: lesen(r) })) });
  if (p.startsWith('/values/')) return ok({ values: lesen(p.slice(8)) });
  if (p === '/values:batchUpdate') { body.data.forEach(d => { const b = bereich(d.range); S[b.blatt][b.r1][b.c1] = d.values[0][0]; }); return ok({}); }
  if (p === ':batchUpdate') {
    for (const r of body.requests) {
      if (r.appendCells) { const t = S[NAME[r.appendCells.sheetId]]; r.appendCells.rows.forEach(row => t.push(row.values.map(v => { const x = v.userEnteredValue; return x.numberValue ?? x.stringValue; }))); }
      if (r.sortRange) { const t = S[NAME[r.sortRange.range.sheetId]]; const kopf = t.shift(); t.sort((a, b) => a[0] - b[0]); t.unshift(kopf); }
      if (r.deleteDimension) { const g = r.deleteDimension.range; S[NAME[g.sheetId]].splice(g.startIndex, g.endIndex - g.startIndex); }
      if (r.insertDimension) { const g = r.insertDimension.range; S[NAME[g.sheetId]].splice(g.startIndex, 0, []); }
      if (r.updateCells) { const st = r.updateCells.start; S[NAME[st.sheetId]][st.rowIndex] = r.updateCells.rows[0].values.map(v => v.userEnteredValue.stringValue); }
    }
    return ok({});
  }
  throw new Error('Fake: unbekannt ' + p);
}

/* ---------- DOM ---------- */
const dom = new JSDOM(html, { url: 'http://localhost:8080/', runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
  beforeParse(w) {
    const EchtDate = w.Date;
    // feste Uhr, mit w.__vor (Millisekunden) vorspulbar
    w.Date = class extends EchtDate { constructor(...a) { a.length ? super(...a) : super(JETZT + (w.__vor || 0)); } static now() { return JETZT + (w.__vor || 0); } };
    w.fetch = fakeFetch; w.TextEncoder = TextEncoder;
    w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; w.HTMLAnchorElement.prototype.click = function () { w.__download = this.download; };
    Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
    Object.defineProperty(w.document, 'hidden', { get: () => w.__versteckt === true, configurable: true });
    w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    Object.defineProperty(w.navigator, 'onLine', { get: () => netz });
    w.__tokAnfragen = 0;
    w.google = { accounts: { oauth2: { initTokenClient: c => ({ requestAccessToken: () => { w.__tokAnfragen++; setTimeout(() => c.callback({ access_token: 'tok123', expires_in: 3600 }), 0); } }), revoke: () => {} } } };
  } });
const w = dom.window, doc = w.document, $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
const tick = (n = 3) => new Promise(r => setTimeout(r, 15 * n));

(async () => {
  await tick();
  check('Erststart zeigt Einrichtung', $('#v-setup').classList.contains('on') && doc.body.classList.contains('ohne-nav'));
  $('#sSheet').value = 'https://docs.google.com/spreadsheets/d/ABCDEFGHIJKLMNOPQRSTUVWXYZ123/edit';
  $('#sClient').value = 'abc.apps.googleusercontent.com';
  $('#fSetup').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(6);
  check('Sheet-ID aus Link extrahiert', w.eval("Daten").config().sheetId === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123');
  check('Nach Login Übersicht', $('#v-uebersicht').classList.contains('on') && !doc.body.classList.contains('ohne-nav'));
  check('Hero & Kategorien', $('.hero .value') && doc.querySelectorAll('.cat').length >= 2);
  check('Badge 1 offen', $('#badge').textContent === '1');

  // Monatsabschluss (heute 12.11. → Oktober): Lohnkonto/Kontostände da, Kreditkarte fehlt, offene Buchung ist vom November
  const ab = $('.abschluss');
  check('Abschluss: Karte für Oktober, 3 von 4', ab && /Monatsabschluss Oktober/.test(ab.textContent) && /3 von 4 erledigt/.test(ab.textContent));
  const abLi = [...ab.querySelectorAll('li')];
  check('Abschluss: Kreditkarte offen mit Knopf, Lohnkonto erledigt', /Kreditkarte/.test(abLi[1].textContent) && !abLi[1].classList.contains('ok')
    && abLi[1].querySelector('[data-ab=import]') && abLi[0].classList.contains('ok') && /erledigt/.test(abLi[0].textContent));
  check('Abschluss: Wise freiwillig ohne Knopf', /freiwillig/.test(abLi[2].textContent) && !abLi[2].querySelector('button'));
  check('Saldo ohne Sparen beschriftet', /ohne Sparen/.test($('#uebersicht .stats').textContent));
  const neuH = [...doc.querySelectorAll('#uebersicht h2.section')].find(h => /Neueste Buchungen/.test(h.textContent));
  check('Übersicht: neueste Buchungen des Monats (3, ohne «Alle»)', neuH && neuH.nextElementSibling.querySelectorAll('.tx').length === 3 && !$('#neuMehr'));
  for (let i = 0; i < 4; i++) w.eval(`D.buchungen.push({ row: ${900 + i}, datum: '2026-11-0${i + 1}', jahr: 2026, monat: 11, typ: 'Ausgabe', betrag: ${i + 1}, kategorie: 'Lebensmittel', notiz: 'Test ${i}', konto: 'Karte', status: 'ok' })`);
  w.eval('renderUebersicht()');
  check('Übersicht: 5 neueste, neueste zuerst, Knopf «Alle 7»', $('#neuMehr') && /Alle 7 Buchungen im November/.test($('#neuMehr').textContent)
    && $('#neuMehr').parentElement.querySelectorAll('.tx').length === 5 && /Migros|Kiosk|Lohn/.test($('#neuMehr').parentElement.querySelector('.tx').textContent));
  $('#neuMehr').click();
  check('Übersicht: «Alle» klappt auf', $('#neuMehr').parentElement.querySelectorAll('.tx').length === 7 && $('#neuMehr').getAttribute('aria-expanded') === 'true');
  w.eval('D.buchungen.splice(-4)'); w.eval('alleNeuesten = false; renderUebersicht()');
  doc.querySelector('nav [data-v=suche]').click(); await tick(3);
  check('Suche ohne Begriff zeigt neueste Buchungen', /Neueste Buchungen/.test($('#sucheResult').textContent) && $('#sucheResult').querySelectorAll('.tx').length >= 3);
  doc.querySelector('nav [data-v=uebersicht]').click(); await tick();
  w.eval("D.alle.push({ datum: '2026-10-29', konto: 'Kreditkarte', betrag: 9, typ: 'Ausgabe', status: 'ok' })");
  check('Abschluss: mit Kreditkarte alles erledigt', w.eval('(a => a.erledigt === a.total)(abschlussStand())'));
  w.eval('D.alle.pop()');
  abLi[1].querySelector('[data-ab=import]').click(); await tick();
  check('Abschluss: Knopf führt zum Import', $('#v-import').classList.contains('on'));

  // Teilen-Ziel: der Service Worker hat eine Datei zwischengespeichert → App übernimmt sie in den Import
  let geteiltWeg = 0;
  w.caches = { open: async () => ({ keys: async () => ['geteilt/0'], delete: async () => { geteiltWeg++; return true; },
    match: async () => ({ headers: { get: () => encodeURIComponent('Lohnkonto Okt.csv') }, blob: async () => new w.Blob(['a;b\n']) }) }) };
  doc.querySelector('nav [data-v=uebersicht]').click(); await tick();
  await w.eval('geteilteDateien()'); await tick();
  check('Teilen: Import offen, Datei übernommen, Knöpfe aktiv', $('#v-import').classList.contains('on') && /1 Datei gewählt/.test($('#dropTitel').textContent)
    && !$('#btnImport').disabled && /Lohnkonto Okt\.csv/.test($('#importResult').textContent));
  check('Teilen: Zwischenspeicher geleert', geteiltWeg === 1);

  // Prüfen mit Regel
  doc.querySelector('nav [data-v=pruefen]').click(); await tick();
  const card = $('.pcard'); card.querySelector('.pKat').value = 'Kleider';
  card.querySelector('.pRegel').checked = true; card.querySelector('.pRegel').dispatchEvent(new w.Event('change'));
  card.querySelector('.pOk').click(); await tick(8);
  check('Update im Sheet', S.Buchungen.find(r => r[12] === 'k2')[5] === 'Kleider' && S.Buchungen.find(r => r[12] === 'k2')[10] === 'ok');
  check('Regel zuoberst eingefügt', S.Regeln[1][0] === 'KIOSK X' && S.Regeln[1][3] === 'Kleider' && S.Regeln[2][0] === 'Migros');

  // Erfassen
  doc.querySelector('nav [data-v=erfassen]').click();
  $('#eBetrag').value = '7,80'; $('#eKat').value = 'Lebensmittel';
  $('#fErfassen').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(8);
  const neu = S.Buchungen.find(r => r[4] === 7.8);
  check('Erfassen schreibt Zeile mit Datum-Seriell', neu && typeof neu[0] === 'number' && neu[5] === 'Lebensmittel' && neu[9] === 'Manuell');

  // Zeile verschiebt sich (anderes Gerät fügt oben ein) → Löschen trifft trotzdem die richtige
  S.Buchungen.splice(1, 0, [ser(`${y}-01-01`), y, 1, 'Ausgabe', 1, 'X', 'Fremd', '', 'FREMD', '', 'ok', '', 'fremd']);
  doc.querySelector('nav [data-v=uebersicht]').click(); await tick();
  const vorher = S.Buchungen.length;
  w.eval("Daten").deleteBuchung(2, { key: 'k1' }); await tick(6);   // Zeile 2 ist jetzt «Fremd», gemeint ist k1
  check('Löschen trifft richtige Buchung trotz Verschiebung', S.Buchungen.length === vorher - 1 && !S.Buchungen.some(r => r[12] === 'k1') && S.Buchungen.some(r => r[12] === 'fremd'));

  // Import UBS-Konto (Vorschau + echt + Doppel)
  const csv = 'IBAN:;CH00 0000 0000 0000 0000 0;\n\nAbschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;Beschreibung3;Fussnoten;\n' +
    `${dd};;${dd};;CHF;-20.00;;;;TX1;Migros Bern;;;;\n${dd};;${dd};;CHF;-99.00;;;;TX2;Ignoriermich;;;;\n${dd};;${dd};;CHF;-33.00;;;;TX3;Unbekannt AG;;;;\n`;
  let r = await w.eval("Daten").importCsv(csv, 'konto.csv', true);
  check('Import-Vorschau: 2 neu, 1 prüfen, 1 ignoriert, Lohnkonto', r.neu === 2 && r.offen === 1 && r.ignoriert === 1 && r.format === 'UBS Lohnkonto');
  const n0 = S.Buchungen.length; await w.eval("Daten").importCsv(csv, 'konto.csv', false);
  check('Import schreibt 2 Zeilen', S.Buchungen.length === n0 + 2);
  r = await w.eval("Daten").importCsv(csv, 'konto.csv', true);
  check('Zweiter Import: alles doppelt', r.neu === 0 && r.doppelt === 2);
  r = await w.eval("Daten").importCsv(csv.replace('CH00 0000', 'CH00 XX99'), 'rs.csv', true);
  check('Rückstellungskonto über Einstellung erkannt', r.format === 'UBS Rückstellungskonto');

  // Offline: Erfassen → Warteschlange → wieder online → übertragen
  netz = false; w.dispatchEvent(new w.Event('offline')); await tick();
  const n1 = S.Buchungen.length;
  doc.querySelector('nav [data-v=erfassen]').click();
  $('#eBetrag').value = '4.20'; $('#eKat').value = 'Lebensmittel';
  $('#fErfassen').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(6);
  check('Offline: nichts im Sheet, 1 in Warteschlange', S.Buchungen.length === n1 && w.eval("Daten").status().warteschlange === 1);
  check('Offline-Chip sichtbar', !$('#statusChip').hidden && /Offline · 1 Änderung warten/.test($('#statusChip').textContent));
  check('Offline: Buchung lokal sichtbar', w.eval("Daten").cache().buchungen.some(b => b.betrag === 4.2));
  netz = true; w.dispatchEvent(new w.Event('online')); await tick(10);
  check('Online: Warteschlange übertragen', S.Buchungen.length === n1 + 1 && w.eval("Daten").status().warteschlange === 0);


  // Jahresvergleich (Vorjahr im Fake-Sheet ergänzen)
  S.Buchungen.push([ser(`${y - 1}-${String(mo).padStart(2, '0')}-03`), y - 1, mo, 'Ausgabe', 40, 'Lebensmittel', 'Alt', 'Karte', 'ALT', 'Import', 'ok', '', 'alt1']);
  S.Buchungen.push([ser(`${y - 1}-12-20`), y - 1, 12, 'Ausgabe', 999, 'Kleider', 'Dez', 'Karte', 'DEZ', 'Import', 'ok', '', 'alt2']);
  await w.eval('load(null)'); await tick(6);
  doc.querySelector('nav [data-v=uebersicht]').click(); await tick();
  doc.querySelector('#tabs [data-a="vergleich"]').click(); await tick();
  check('Vergleich: Titel & Jahr-Auswahl versteckt', $('#title').textContent === 'Jahresvergleich' && $('#jahr').hidden);
  check('Vergleich: Jahre vorbelegt', $('#vB').value === String(y) && $('#vA').value === String(y - 1));
  check('Vergleich: «Bis heute» ohne Dezember-Vorjahr', /^40$/.test($('.hero .vorjahr span').textContent.replace(/\D/g, '').slice(4)) );
  doc.querySelector('[data-bis="0"]').click(); await tick();
  check('Vergleich: «Ganze Jahre» mit Dezember', $('.hero .vorjahr span').textContent.includes("1'039"));
  check('Vergleich: 12 Monate im Diagramm, Tabelle vorhanden', doc.querySelectorAll('.gchart .grp').length === 12 && doc.querySelectorAll('table.tab tbody tr').length === 13);
  const g = doc.querySelector('.gchart .grp[data-i="11"]'); g.dispatchEvent(new w.Event('focus')); await tick(1);
  check('Vergleich: Tooltip zeigt beide Jahre', !$('#ttip').hidden && $('#ttip').textContent.includes("999") && $('#ttip').textContent.includes(String(y - 1)));
  doc.querySelector('[data-nach="kategorie"]').click(); await tick();
  check('Vergleich: nach Kategorie', /Kategorie/.test(doc.querySelector('h2.section.row').textContent) && doc.querySelectorAll('.vrow').length >= 2);


  // Auswertung: Prognose, Einnahmen nach Auftraggeber, Reisen, Sparquote
  S.Buchungen.push([ser(`${y - 1}-06-25`), y - 1, 6, 'Einnahme', 4000, 'Lohn', 'Lohn alt', 'Lohnkonto', 'LOHN', 'Import', 'ok', '', 'aw1']);
  S.Buchungen.push([ser(`${y}-04-20`), y, 4, 'Ausgabe', 800, 'Reise Rom Apr 2026', 'Hotel Rom', 'Karte', 'HOTEL', 'Import', 'ok', '', 'aw2']);
  S.Buchungen.push([ser(`${y}-04-22`), y, 4, 'Ausgabe', 60, 'Reise Rom Apr 2026', 'Essen Rom', 'Karte', 'ESSEN', 'Import', 'ok', '', 'aw3']);
  S.Buchungen.push([ser(`${y}-03-10`), y, 3, 'Sparen', 1000, 'Viac Sparen', 'Viac', 'Lohnkonto', 'VIAC', 'Import', 'ok', '', 'aw4']);
  await w.eval('load(null)'); await tick(6);
  doc.querySelector('#tabs [data-a="auswertung"]').click(); await tick();
  check('Auswertung: Titel & Jahr-Auswahl sichtbar', $('#title').textContent === `Auswertung ${y}` && !$('#jahr').hidden);
  check('Auswertung: Prognose im laufenden Jahr', /Prognose/.test($('.hero .label').textContent) && /Budget 3'000/.test($('.hero').textContent));
  const eRow = doc.querySelector('[data-aw="e:Lohn"]');
  check('Auswertung: Einnahmen mit Vorjahr', !!eRow && eRow.textContent.includes("5'000") && /4'000/.test(eRow.textContent) && /25 %/.test(eRow.textContent));
  const rRow = doc.querySelector('[data-aw="r:Reise Rom Apr 2026"]');
  check('Auswertung: Reise ohne Präfix, Summe & Zeitraum', !!rRow && /^\s*Rom Apr 2026/.test(rRow.querySelector('.name').textContent)
    && rRow.textContent.includes('860') && /2 Buchungen/.test(rRow.textContent));
  rRow.click(); await tick();
  check('Auswertung: Reise aufklappen zeigt Buchungen', doc.querySelectorAll('.cat-detail .tx').length === 2
    && doc.querySelector('[data-aw="r:Reise Rom Apr 2026"]').getAttribute('aria-expanded') === 'true');
  const quoteZeile = [...doc.querySelectorAll('table.tab tbody tr')].find(tr => tr.textContent.startsWith(String(y)));
  check('Auswertung: Sparquote pro Jahr', doc.querySelectorAll('table.tab tbody tr').length === 2 && /20 %/.test(quoteZeile.textContent));
  $('#jahr').value = String(y - 1); $('#jahr').dispatchEvent(new w.Event('change')); await tick(6);
  check('Auswertung Vorjahr: Sparquote als Hauptzahl, keine Reisen', /Sparquote/.test($('.hero .label').textContent) && /Keine Reisen/.test($('#uebersicht').textContent));
  $('#jahr').value = String(y); $('#jahr').dispatchEvent(new w.Event('change')); await tick(6);
  S.Buchungen.splice(S.Buchungen.findIndex(r => r[12] === 'aw1'), 4);
  await w.eval('load(null)'); await tick(6);


  // Jahresrechnungen: Plan vs. bezahlt
  S.Buchungen.push([ser(`${y}-01-15`), y, 1, 'Rückstellung', 2000, 'Steuern', 'Steuern', 'Lohnkonto', 'STEUER', 'Import', 'ok', '', 'r1']);
  S.Buchungen.push([ser(`${y}-02-15`), y, 2, 'Rückstellung', 300, 'Rechtsschutz', 'Versicherung', 'Lohnkonto', 'VERSICHERUNG', 'Import', 'ok', '', 'r2']);
  await w.eval('load(null)'); await tick(6);
  doc.querySelector('#tabs [data-a="rechnungen"]').click(); await tick();
  check('Jahresrechnungen: Titel & Hero', /^Jahresrechnungen \d{4}$/.test($('#title').textContent) && /Noch erwartet/.test($('.hero .label').textContent) && !$('#jahr').hidden);
  const rows = [...doc.querySelectorAll('[data-r]')];
  check('Jahresrechnungen: nur aktive Posten, Steuern zuerst (über Plan)', rows.length === 2 && rows[0].dataset.r === 'Steuern' && /Über Plan/.test(rows[0].textContent));
  check('Jahresrechnungen: offen = Serafe 336', $('.hero .value').textContent.replace(/\D/g, '') === '336');
  check('Jahresrechnungen: Ohne Plan zeigt Rechtsschutz', /Ohne Plan bezahlt/.test($('#uebersicht').textContent) && /Rechtsschutz/.test($('#uebersicht').textContent));
  rows[0].click(); await tick();
  check('Jahresrechnungen: Aufklappen zeigt Zahlung', doc.querySelector('[data-r="Steuern"]').getAttribute('aria-expanded') === 'true' && doc.querySelectorAll('.cat-detail .tx').length === 1);
  check('Gesamtstatus rot/gelb sichtbar', /über Plan/i.test($('.hero .status').textContent));


  // Vermögen
  doc.querySelector('#tabs [data-a="vermoegen"]').click(); await tick();
  check('Vermögen: Titel, Monate & Jahr ausgeblendet', $('#title').textContent === 'Vermögen' && $('#monate').hidden && $('#jahr').hidden);
  check('Vermögen: Netto = 1500 + 5200 − 700', $('.hero .value').textContent.replace(/\D/g, '') === '6000');
  check('Vermögen: Veränderung seit Vormonat', /▼ 0|▲|▼/.test($('.hero .vorjahr').textContent) && /Vormonat/.test($('.hero').textContent));
  check('Vermögen: Verlauf + Tabelle', !!$('.lchart svg .linie') && doc.querySelectorAll('#uebersicht table.tab tbody tr').length === 2);
  check('Vermögen: Gruppen', /Flüssig/.test($('#uebersicht').textContent) && /Schulden/.test($('#uebersicht').textContent));
  $('#vErfassen').click(); await tick();
  check('Vermögen: Dialog vorausgefüllt', $('#vdlg').open && $$('#vFelder input').length === 3 && $$('#vFelder input').some(i => i.value === '1500.00'));
  $$('#vFelder input').find(i => i.value === '1500.00').value = "2'000.50";
  $('#vNeuName').value = 'Reka'; $('#vNeuSaldo').value = '300';
  const nV = S['Vermögen'].length;
  $('#vForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(8);
  check('Vermögen: 4 Zeilen angehängt (3 + neues Konto)', S['Vermögen'].length === nV + 4 && S['Vermögen'].some(r => r[1] === 'Reka' && r[3] === 300) && S['Vermögen'].some(r => r[3] === 2000.5));
  check('Vermögen: neue Hauptzahl 6800.50', $('.hero .value').textContent.replace(/\D/g, '') === '6801' || $('.hero .value').textContent.replace(/\D/g, '') === '6800');
  doc.querySelector('#tabs [data-a="budget"]').click(); await tick();
  check('Reiter Budget: Monate wieder sichtbar', !$('#monate').hidden && !$('#jahr').hidden);


  // Kontostand aus CSV (Monatsende) → Blatt «Vermögen»
  const csvS = 'Kontonummer:;x;\nIBAN:;CH00 0000 0000 0000 0000 0;\nVon:;2026-10-01;\nBis:;2026-10-31;\nAnfangssaldo:;100;\nSchlusssaldo:;1234.56;\n\n' +
    'Abschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;Beschreibung3;Fussnoten;\n' +
    '2026-10-20;;2026-10-20;;CHF;-5.00;;;;TXS1;Migros Bern;;;;\n';
  let rs = await w.eval("Daten").importCsv(csvS, 'okt.csv', true);
  check('Saldo-Vorschau: Lohnkonto per 31.10. erkannt', rs.saldo && rs.saldo.uebernehmen && rs.saldo.konto === 'Lohnkonto' && rs.saldo.betrag === 1234.56);
  const nV2 = S['Vermögen'].length;
  await w.eval("Daten").importCsv(csvS, 'okt.csv', false);
  check('Saldo übernommen ins Vermögen', S['Vermögen'].length === nV2 + 1 && S['Vermögen'].some(r => r[0] === '2026-10-31' && r[1] === 'Lohnkonto' && r[3] === 1234.56));
  rs = await w.eval("Daten").importCsv(csvS, 'okt.csv', true);
  check('Saldo: zweites Mal «schon erfasst»', rs.saldo && !rs.saldo.uebernehmen && rs.saldo.grund === 'schon erfasst');
  rs = await w.eval("Daten").importCsv(csvS.replace('Bis:;2026-10-31', 'Bis:;2026-10-20'), 'teil.csv', true);
  check('Saldo: nicht am Monatsende → nicht übernommen', rs.saldo && !rs.saldo.uebernehmen && /Monatsende/.test(rs.saldo.grund));


  // App-Sperre
  check('Sperre: anfangs aus, Zahnrad sichtbar', !w.eval('Sperre.aktiv()') && !$('#btnEinst').hidden);
  $('#btnEinst').click(); await tick(4);
  check('Einstellungen offen, Biometrie hier nicht verfügbar', $('#edlg').open && !!$('#fPinNeu'));
  $('#pin1').value = '1234'; $('#pin2').value = '1243';
  $('#fPinNeu').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(4);
  check('Sperre: abweichende Wiederholung wird abgelehnt', !w.eval('Sperre.aktiv()') && $('#pin2').classList.contains('invalid'));
  $('#pin2').value = '1234';
  $('#fPinNeu').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(12);
  check('Sperre: eingeschaltet, PIN nur als Hash gespeichert', w.eval('Sperre.aktiv()') && !/1234"/.test(w.localStorage.getItem('budget.sperre')));
  $('#eJetzt').click(); await tick(2);
  check('Sperre: gesperrt, Inhalt verborgen', !$('#sperre').hidden && doc.body.classList.contains('gesperrt') && !$('#edlg').open);
  $('#sPin').value = '0000'; $('#sPinForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(12);
  check('Sperre: falsche PIN bleibt gesperrt', !$('#sperre').hidden && /Falsche PIN/.test($('#sFehler').textContent));
  $('#sPin').value = '1234'; $('#sPinForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(12);
  check('Sperre: richtige PIN entsperrt', $('#sperre').hidden && !doc.body.classList.contains('gesperrt'));
  // App-Wechsel: kurz weg → nur verdecken; mit Sperrzeit 0 → sperren
  w.__versteckt = true; doc.dispatchEvent(new w.Event('visibilitychange'));
  check('Sperre: beim Verlassen sofort verdeckt', doc.body.classList.contains('verdeckt'));
  w.__versteckt = false; doc.dispatchEvent(new w.Event('visibilitychange'));
  check('Sperre: kurz zurück → nicht gesperrt', !doc.body.classList.contains('verdeckt') && $('#sperre').hidden);
  w.eval('Sperre.setzeMinuten(0)');
  w.__versteckt = true; doc.dispatchEvent(new w.Event('visibilitychange')); w.__versteckt = false; doc.dispatchEvent(new w.Event('visibilitychange'));
  check('Sperre: Sperrzeit «sofort» → gesperrt', !$('#sperre').hidden);
  for (let i = 0; i < 5; i++) { $('#sPin').value = '9999'; $('#sPinForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(12); }
  $('#sPin').value = '1234'; $('#sPinForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(12);
  check('Sperre: nach 5 Fehlversuchen Wartezeit (auch richtige PIN gesperrt)', !$('#sperre').hidden && /warten/.test($('#sFehler').textContent));
  w.eval("(()=>{const c=JSON.parse(localStorage.getItem('budget.sperre'));c.sperreBis=0;localStorage.setItem('budget.sperre',JSON.stringify(c));})()");
  // Wartezeit im Test zurücksetzen (Sperre liest cfg im Speicher) → neu laden ist nicht möglich, daher direkt über Konsole entsperren
  w.eval('entsperren()'); w.eval('Sperre.setzeMinuten(5)');
  $('#btnEinst').click(); await tick(4);
  $('#pinAus').value = '1111'; $('#fAus').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(12);
  check('Sperre: Ausschalten mit falscher PIN abgelehnt', w.eval('Sperre.aktiv()'));


  // Steuer-Tags
  S.Buchungen.push([ser(`${y}-03-10`), y, 3, 'Ausgabe', 1060, 'Weiterbildung & Kurse', 'Weiterbildungskurs', 'Lohnkonto', 'KURS AG', 'Import', 'ok', 'reise', 'st1']);
  S.Buchungen.push([ser(`${y}-04-10`), y, 4, 'Ausgabe', 60, 'Geschenke & Einladungen', 'Spende Hilfswerk', 'Lohnkonto', 'HILFSWERK', 'Import', 'ok', '', 'st2']);
  S.Buchungen.push([ser(`${y}-05-05`), y, 5, 'Sparen', 573, '3. Säule (Sparen)', '3. Säule', 'Lohnkonto', 'VORSORGESTIFTUNG', 'Import', 'ok', '', 'st3']);
  await w.eval('load(null)'); await tick(6);
  doc.querySelector('#tabs [data-a="steuern"]').click(); await tick();
  check('Steuern: Titel, Jahr sichtbar, leer + 3a erkannt', /^Steuern \d{4}$/.test($('#title').textContent) && !$('#jahr').hidden && /573/.test($('.hero').textContent));
  const vs = $$('#uebersicht .vschlag');
  check('Steuern: Vorschläge Weiterbildung (Kurs) & Spende', vs.length >= 2 && /✓ Weiterbildung/.test($('#uebersicht').textContent) && /✓ Spende/.test($('#uebersicht').textContent));
  [...doc.querySelectorAll('[data-act="ja"]')].find(b => /Weiterbildung/.test(b.textContent)).click(); await tick(10);
  check('Steuern: Tag ins Sheet, bestehender Tag bleibt', S.Buchungen.find(r => r[12] === 'st1')[11] === 'reise, Steuer:Weiterbildung');
  check('Steuern: Hauptzahl 1060 und Gruppe Weiterbildung', $('.hero .value').textContent.replace(/\D/g, '') === '1060' && !!doc.querySelector('[data-st="Weiterbildung"]'));
  [...doc.querySelectorAll('[data-act="nein"]')].find(b => /Spende|Hilfswerk/.test(b.closest('.vschlag').textContent)).click(); await tick(10);
  check('Steuern: «Nicht relevant» merkt sich das', S.Buchungen.find(r => r[12] === 'st2')[11] === 'Steuer:keine' && !/Hilfswerk/.test(([...doc.querySelectorAll('.vschlag')].map(x => x.textContent).join(''))));
  // im Bearbeiten-Fenster markieren
  doc.querySelector('[data-st="Weiterbildung"]').click(); await tick();
  doc.querySelector('.cat-detail .tx').click(); await tick();
  check('Bearbeiten: Steuer-Knopf Weiterbildung aktiv', $('#edTags [data-t="Weiterbildung"]').getAttribute('aria-pressed') === 'true');
  $('#edTags [data-t="Berufskosten"]').click();
  $('#editForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(10);
  check('Bearbeiten: zweiter Steuer-Tag gespeichert, «reise» erhalten', S.Buchungen.find(r => r[12] === 'st1')[11] === 'reise, Steuer:Berufskosten, Steuer:Weiterbildung');
  $('#stExport').click(); await tick();
  check('Steuern: Export ausgelöst', /Steuern \d{4}\.csv gespeichert/.test($('#toast').textContent));


  // Reiter mit der Tastatur (Pfeiltasten, nur aktiver Reiter im Tab-Fokus)
  doc.querySelector('nav [data-v=uebersicht]').click(); w.eval("setAnsicht('budget')"); await tick();
  $('#tabs [data-a="budget"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await tick();
  check('Reiter: Pfeil rechts → Vergleich, Tab-Reihenfolge angepasst', $('#title').textContent === 'Jahresvergleich'
    && $('#tabs [data-a="vergleich"]').tabIndex === 0 && $('#tabs [data-a="budget"]').tabIndex === -1);
  $('#tabs [data-a="vergleich"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'End', bubbles: true })); await tick();
  check('Reiter: Ende → Steuern', /^Steuern/.test($('#title').textContent));
  w.eval("setAnsicht('budget')"); await tick();

  // Prüfen: Vorschlag aus früheren Buchungen, gleiche Händler als Gruppe
  S.Buchungen.push([ser(`${y}-06-01`), y, 6, 'Ausgabe', 8, 'Lebensmittel', 'Bäckerei', 'Karte', 'Bäckerei Muster;3000 Bern | Zahlung Debitkarte', 'Import', 'ok', '', 'h1']);
  S.Buchungen.push([ser(`${y}-11-02`), y, 11, 'Ausgabe', 6.5, '', 'Bäckerei', 'Karte', 'BÄCKEREI MUSTER;3000 Bern | Zahlung Debitkarte', 'Import', 'prüfen', '', 'p1']);
  S.Buchungen.push([ser(`${y}-11-03`), y, 11, 'Ausgabe', 7.2, '', 'Bäckerei', 'Karte', 'Bäckerei Muster;3000 Bern | Zahlung Debitkarte', 'Import', 'prüfen', '', 'p2']);
  S.Buchungen.push([ser(`${y}-11-04`), y, 11, 'Ausgabe', 20, '', 'Kiosk Y', 'Karte', 'KIOSK YPSILON 12 CHE', 'Import', 'prüfen', '', 'p3']);
  S.Buchungen.push([ser(`${y}-11-05`), y, 11, 'Ausgabe', 21, '', 'Kiosk Y', 'Karte', 'KIOSK YPSILON 13 CHE', 'Import', 'prüfen', '', 'p4']);
  await w.eval('load(null, { pruefen: true })'); await tick(6);
  doc.querySelector('nav [data-v=pruefen]').click(); await tick();
  const gruppen = $$('.pgruppe');
  const baeck = gruppen.find(g => /Bäckerei/.test(g.textContent));
  check('Prüfen: gleiche Händler als Gruppe (2 Gruppen)', gruppen.length === 2 && !!baeck && /Alle 2 speichern/.test(baeck.textContent));
  check('Prüfen: Kategorie aus früherer Buchung vorgeschlagen', $('.pKat', baeck).value === 'Lebensmittel' && /wie 1 frühere Buchung/.test(baeck.textContent));
  $('.pOk', baeck).click(); await tick(12);
  const gesp = ['p1', 'p2'].map(k => S.Buchungen.find(r => r[12] === k));
  check('Prüfen: «Alle speichern» ordnet beide zu', gesp.every(r => r[5] === 'Lebensmittel' && r[10] === 'ok'));
  const kiosk = $$('.pgruppe').find(g => /Kiosk Y/.test(g.textContent));
  check('Prüfen: Gruppe ohne Vorgeschichte hat keinen Vorschlag', !!kiosk && $('.pKat', kiosk).value === '' && !/Vorschlag/.test(kiosk.textContent));
  $('.pEinzeln', kiosk).click(); await tick();
  check('Prüfen: «Einzeln bearbeiten» zeigt zwei Karten', $$('#pruefen .pcard:not(.pgruppe)').filter(c => /Kiosk Y/.test(c.textContent)).length === 2);
  for (const c of $$('#pruefen .pcard:not(.pgruppe)').filter(c => /Kiosk Y/.test(c.textContent))) { $('.pKat', c).value = 'Lebensmittel'; $('.pOk', c).click(); await tick(10); }
  doc.querySelector('nav [data-v=uebersicht]').click(); await tick();

  // Kontrolle: 3× Lebensmittel beim gleichen Händler, 1× Kleider → wird gemeldet
  const coop = (key, kat) => [ser('2026-11-03'), 2026, 11, 'Ausgabe', 20, kat, 'Coop', 'Karte', 'COOP BERN ' + key.slice(-1), 'Import', 'ok', '', key];
  S.Buchungen.push(coop('kc1', 'Lebensmittel'), coop('kc2', 'Lebensmittel'), coop('kc3', 'Lebensmittel'), coop('kc4', 'Kleider'));
  await w.eval('load(D.jahr)'); await tick(4);
  doc.querySelector('nav [data-v=pruefen]').click(); await tick();
  let kc = $$('#pruefen .kcard');
  check('Kontrolle: eine Abweichung gemeldet', kc.length === 1 && /Gebucht als Kleider/.test(kc[0].textContent) && /sonst 3× Lebensmittel/.test(kc[0].textContent));
  $('.kOk', kc[0]).click(); await tick(8);
  check('Kontrolle: «Passt so» setzt Tag, Meldung weg', S.Buchungen.find(r => r[12] === 'kc4')[11] === 'Kontrolle:ok' && !$$('#pruefen .kcard').some(c => !c.hidden));
  S.Buchungen.push(coop('kc5', 'Kleider'));
  await w.eval('load(D.jahr)'); await tick(4); w.eval('renderPruefen()');
  kc = $$('#pruefen .kcard');
  check('Kontrolle: neue Abweichung gemeldet, getaggte nicht', kc.length === 1 && /20\.00/.test(kc[0].textContent));
  $('.kAendern', kc[0]).click(); await tick(8);
  check('Kontrolle: «Ändern» schreibt die übliche Kategorie', S.Buchungen.find(r => r[12] === 'kc5')[5] === 'Lebensmittel');
  doc.querySelector('nav [data-v=uebersicht]').click(); await tick();

  // Anmeldung erneuert sich beim nächsten Tipp (statt «Anmelden» zu suchen)
  const tokVorher = w.__tokAnfragen;
  $('main').dispatchEvent(new w.Event('pointerdown', { bubbles: true })); await tick();
  check('Anmeldung frisch: Tipp löst keine Erneuerung aus', w.__tokAnfragen === tokVorher);
  w.__vor = 58 * 60000;   // 58 Minuten später: läuft in 2 Minuten ab
  $('main').dispatchEvent(new w.Event('pointerdown', { bubbles: true })); await tick();
  check('Kurz vor Ablauf: Tipp erneuert die Anmeldung', w.__tokAnfragen === tokVorher + 1 && w.eval('Daten.status().angemeldet'));
  w.__vor = 125 * 60000;  // abgelaufen
  check('Abgelaufen: Status zeigt nicht angemeldet', !w.eval('Daten.status().angemeldet'));
  const ladenVorher = calls.filter(c => c.includes('batchGet')).length;
  $('main').dispatchEvent(new w.Event('pointerdown', { bubbles: true })); await tick(6);
  check('Abgelaufen: Tipp meldet an und lädt Daten neu', w.__tokAnfragen === tokVorher + 2 && w.eval('Daten.status().angemeldet')
    && calls.filter(c => c.includes('batchGet')).length > ladenVorher);
  w.__vor = 125 * 60000 + 20000;
  const n2 = w.__tokAnfragen;
  w.eval('Daten.abmelden()');
  $('main').dispatchEvent(new w.Event('pointerdown', { bubbles: true })); await tick();
  check('Höchstens ein Versuch pro Minute', w.__tokAnfragen === n2);
  w.__vor = 200 * 60000; $('main').dispatchEvent(new w.Event('pointerdown', { bubbles: true })); await tick(6);

  // Neustart der App: lädt aus Gerätespeicher + Token
  check('Cache & Token gespeichert', !!w.localStorage.getItem('budget.cache') && !!w.localStorage.getItem('budget.token'));

  const anzahl = (globalThis.__ok || 0);
  console.log(errors.length ? '\n' + errors.join('\n') : `\nALLES OK (${anzahl} Prüfungen)`);
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(errors.join("\n")); console.error("ABBRUCH", e); process.exit(1); });
