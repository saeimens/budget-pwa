// Barrierefreiheit: prüft jede Ansicht mit axe-core (WCAG 2.1 A/AA). Farbkontraste kann jsdom nicht berechnen –
// die Farben sind separat geprüft (siehe css/app.css). Nur erfundene Daten. Aufruf: npm test
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const DIR = path.join(__dirname, '..');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const JETZT = new Date(2026, 10, 12, 12).getTime();
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8')
  .replace(/<script src="https:\/\/[^"]*"[^>]*><\/script>/g, '')
  .replace(/<script src="([^"]+)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(path.join(DIR, f), 'utf8') + '</script>');

const b = (row, datum, typ, betrag, kategorie, notiz, extra = {}) => ({ row, datum, jahr: +datum.slice(0, 4), monat: +datum.slice(5, 7), typ, betrag,
  kategorie, notiz, konto: 'Karte', banktext: notiz.toUpperCase(), quelle: 'Import', status: 'ok', tags: '', key: 'k' + row, ...extra });
const cache = {
  buchungen: [b(2, '2025-11-03', 'Ausgabe', 40, 'Lebensmittel', 'Laden'), b(3, '2026-11-03', 'Ausgabe', 50, 'Lebensmittel', 'Laden'),
    b(4, '2026-11-04', 'Ausgabe', 12, '', 'Kiosk', { status: 'prüfen' }), b(5, '2026-11-05', 'Einnahme', 5000, 'Lohn', 'Lohn'),
    b(6, '2026-03-01', 'Rückstellung', 700, 'Steuern', 'Steuern'), b(7, '2026-04-01', 'Ausgabe', 300, 'Weiterbildung & Kurse', 'Kurs')],
  kategorien: [{ name: 'Lebensmittel', gruppe: 'Alltag', budget: 150 }, { name: 'Weiterbildung & Kurse', gruppe: 'Bildung', budget: 0 }],
  regelnRows: [], einst: {}, rueckstellungen: [{ posten: 'Steuern', kategorie: 'Steuern', rate: 100, aktiv: true, bemerkung: '' }],
  vermoegen: [{ datum: '2026-09-30', konto: 'Konto A', gruppe: 'Flüssig', saldo: 1000, bemerkung: '' }, { datum: '2026-10-31', konto: 'Konto A', gruppe: 'Flüssig', saldo: 1200, bemerkung: '' }],
  hatVermoegen: true, stand: JETZT
};

const dom = new JSDOM(html, { url: 'http://localhost:8080/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    const E = w.Date; w.Date = class extends E { constructor(...a) { a.length ? super(...a) : super(JETZT); } static now() { return JETZT; } };
    w.localStorage.setItem('budget.cfg', JSON.stringify({ clientId: 'x.apps.googleusercontent.com', sheetId: 'X' }));
    w.localStorage.setItem('budget.token', JSON.stringify({ access: 'tok', exp: JETZT + 3e6 }));
    w.localStorage.setItem('budget.cache', JSON.stringify(cache));
    w.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    Object.defineProperty(w.navigator, 'onLine', { get: () => true });
    w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.TextEncoder = TextEncoder;
  } });
const w = dom.window, doc = w.document;
const tick = (n = 4) => new Promise(r => setTimeout(r, 20 * n));
w.eval(AXE);

async function pruefe(name, kontext) {
  const r = await w.axe.run(kontext || doc, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false } } });
  return r.violations.map(v => `${name}: [${v.impact}] ${v.id} – ${v.help} (${v.nodes.length}×: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')})`);
}

(async () => {
  await tick(8);
  const fehler = [];
  for (const a of ['budget', 'vergleich', 'auswertung', 'rechnungen', 'vermoegen', 'steuern']) { w.eval(`setAnsicht('${a}')`); await tick(); fehler.push(...await pruefe('Übersicht/' + a)); }
  for (const v of ['pruefen', 'import', 'suche', 'erfassen']) { w.eval(`setView('${v}')`); await tick(); fehler.push(...await pruefe(v)); }
  for (const b of ['budgets', 'rechnungen', 'ziele', 'regeln']) { w.eval(`oeffneVerwalten('${b}')`); await tick(); fehler.push(...await pruefe('Bearbeiten/' + b)); }
  doc.querySelector('[data-neu="regel"]').click(); await tick();
  fehler.push(...await pruefe('Dialog Regel', '#vwdlg')); w.eval("document.querySelector('#vwdlg').close()");
  w.eval("setView('uebersicht'); setAnsicht('budget')"); await tick();
  doc.querySelector('#kats .cat').click(); await tick(); doc.querySelector('.cat-detail .tx').click(); await tick();
  fehler.push(...await pruefe('Dialog Bearbeiten', '#edit'));
  const ek = doc.querySelector('#edKat'); ek.value = '__neue_reise__'; ek.dispatchEvent(new w.Event('change', { bubbles: true })); await tick();
  fehler.push(...await pruefe('Dialog Neue Reise', '#reisedlg')); w.eval("document.querySelector('#reisedlg').close(); document.querySelector('#edit').close()");
  doc.querySelector('#btnEinst').click(); await tick(8); fehler.push(...await pruefe('Dialog Einstellungen', '#edlg'));
  const ok = !fehler.length;
  console.log(ok ? 'ALLES OK (Barrierefreiheit: 18 Ansichten ohne Verstösse)' : fehler.join('\n'));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('ABBRUCH', e); process.exit(1); });
