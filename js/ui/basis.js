// Budget-App – Konstanten, Zustand, Hilfsfunktionen, Meldungen, Navigation, Laden.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Konstanten & Zustand ---------- */
const MONATE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const MONATE_LANG = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const TYPEN = [['Ausgabe','Ausgabe'], ['Einnahme','Einnahme'], ['Rückstellung','Jahresrechnung (Rückstellung)'], ['Sparen','Sparen']];
const KONTEN = ['Bar','Twint','Karte','Kreditkarte','Wise'];
const VIEW_TITEL = { pruefen:'Zu prüfen', import:'Import', suche:'Suche', erfassen:'Erfassen' };
const HEUTE = new Date(), CUR_Y = HEUTE.getFullYear(), CUR_M = HEUTE.getMonth() + 1;

let D = null;                 // Daten vom Server
let monat = CUR_M;            // 0 = ganzes Jahr
let offeneKat = null;         // aufgeklappte Kategorie
let view = 'uebersicht';
let pruefenStale = false;     // Prüfen-Liste beim nächsten Öffnen neu zeichnen
let AUS = [], KATS = [];      // Ausgaben/Kategorien des gewählten Zeitraums
const TX = new Map(); let txSeq = 0;   // angezeigte Buchungen (für Bearbeiten)

/* ---------- Hilfsfunktionen ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const chf = n => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('de-CH', { minimumFractionDigits:2, maximumFractionDigits:2 });
const chf0 = n => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('de-CH');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const fmtDate = s => { const [y, m, d] = String(s).split('-'); return d ? `${+d}.${+m}.${y.slice(2)}` : s; };
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sum = arr => arr.reduce((a, b) => a + b.betrag, 0);
function parseBetrag(s) {
  const n = Number(String(s).replace(/[\s'’]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
const expect = b => ({ key: b.key, datum: b.datum, betrag: b.betrag, banktext: b.banktext });

const ICONS = {
  home:   '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.4A9 9 0 0 1 20.6 9H15z"/>',
  check:  '<path d="M20 6 9 17l-5-5"/>',
  upload: '<path d="M12 15V4m-4 4 4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus:   '<path d="M12 5v14M5 12h14"/>',
  chev:   '<path d="m9 6 6 6-6 6"/>',
  x:      '<path d="M6 6l12 12M18 6 6 18"/>',
  lock:   '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  gear:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};
const ico = (n, cls = '', size = 22) => `<svg class="ico ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
$$('[data-ico]').forEach(el => el.innerHTML = ico(el.dataset.ico, '', el.closest('.drop, .sperre-ico') ? 32 : 22));

const typOpts = sel => TYPEN.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
function katOpts(sel, leer = 'Kategorie wählen …') {
  const namen = D ? D.kategorien.map(k => k.name) : [];
  if (sel && !namen.includes(sel)) namen.push(sel);
  return `<option value="">${esc(leer)}</option>` +
    namen.map(n => `<option value="${esc(n)}" ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
}
function markInvalid(el) {
  el.classList.add('invalid'); el.focus();
  const weg = () => el.classList.remove('invalid');
  el.addEventListener('input', weg, { once:true }); el.addEventListener('change', weg, { once:true });
}

/* ---------- Status: Ladebalken & Meldungen ---------- */
let pending = 0;
function call(fn, ...args) {
  pending++; document.body.classList.add('busy');
  return Promise.resolve().then(() => Daten[fn](...args))
    .finally(() => { if (--pending === 0) document.body.classList.remove('busy'); });
}

let toastTimer;
function toast(msg, opt = {}) {
  const t = $('#toast');
  t.className = 'toast on' + (opt.error ? ' err' : '');
  t.innerHTML = `<span>${esc(msg)}</span>` + (opt.action ? `<button type="button">${esc(opt.action)}</button>` : '');
  if (opt.action) t.querySelector('button').onclick = () => { t.classList.remove('on'); clearTimeout(toastTimer); opt.onAction(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), opt.error || opt.action ? 7000 : 2600);
}
const fehler = (was, e) => toast(`${was} fehlgeschlagen: ${e.message}`, { error:true });

/* ---------- Navigation ---------- */
function setView(v) {
  view = v;
  $$('nav button').forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('on', on);
    on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  });
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  jahrSichtbar();
  document.body.classList.toggle('ohne-nav', v === 'setup' || v === 'login');
  $('#btnEinst').hidden = v === 'setup' || v === 'login';
  renderTitle();
  if (v === 'pruefen' && pruefenStale && D) renderPruefen();
  if (v === 'suche' && !sucheAktiv && D) suche();   // ohne Suchbegriff: neueste Buchungen frisch zeigen
  if (v === 'erfassen') setTimeout(() => $('#eBetrag').focus(), 50);
  window.scrollTo(0, 0);
}
$$('nav button').forEach(b => b.onclick = () => setView(b.dataset.v));

function renderTitle() {
  let t = VIEW_TITEL[view];
  if (!t) t = !D ? 'Budget' : ansicht === 'vergleich' ? 'Jahresvergleich' : ansicht === 'rechnungen' ? `Jahresrechnungen ${D.jahr}` : ansicht === 'vermoegen' ? 'Vermögen' : ansicht === 'steuern' ? `Steuern ${D.jahr}` : ansicht === 'auswertung' ? `Auswertung ${D.jahr}` : monat === 0 ? `Jahr ${D.jahr}` : `${MONATE_LANG[monat - 1]} ${D.jahr}`;
  $('#title').textContent = t;
  document.title = t === 'Budget' ? 'Budget' : `${t} · Budget`;
}

/* ---------- Laden ---------- */
async function load(jahr, opts = {}) {
  // sofort mit den Daten auf dem Gerät anzeigen, dann im Hintergrund aktualisieren
  if (opts.init && Daten.cache()) anzeigen(Daten.getDataSync(jahr), opts);
  let data;
  try { data = await call('getData', jahr || null); }
  catch (e) {
    if (e.login) {
      if (!D) return setView('login');
      return toast('Anmeldung abgelaufen – Daten vom Gerät', { action:'Anmelden', onAction: login });
    }
    if (!D) renderLoadError(e, jahr); else fehler('Aktualisieren', e);
    return;
  }
  anzeigen(data, opts);
}
function anzeigen(data, opts = {}) {
  D = data;
  if (opts.init && D.jahr !== CUR_Y) monat = 0;
  const jahre = D.jahre.includes(D.jahr) ? D.jahre : D.jahre.concat(D.jahr);
  $('#jahr').innerHTML = jahre.map(j => `<option ${j === D.jahr ? 'selected' : ''}>${j}</option>`).join('');
  const qJ = $('#qJahr').value, qK = $('#qKat').value, eK = $('#eKat').value;
  $('#qJahr').innerHTML = '<option value="">Alle Jahre</option>' + jahre.map(j => `<option ${String(j) === qJ ? 'selected' : ''}>${j}</option>`).join('');
  $('#qKat').innerHTML = katOpts(qK, 'Alle Kategorien');
  $('#eKat').innerHTML = katOpts(eK);
  renderTitle(); renderMonate(); renderUebersicht(); renderBadge();
  if (view === 'pruefen' && !opts.pruefen) pruefenStale = true; else renderPruefen();
}
function renderLoadError(e, jahr) {
  $('#uebersicht').innerHTML = `<div class="card empty"><b>Daten konnten nicht geladen werden</b>
    <p class="small muted">${esc(e.message)}</p><button type="button" id="retry">Erneut versuchen</button></div>`;
  $('#retry').onclick = () => { $('#uebersicht').innerHTML = '<div class="loading">Lade Daten …</div>'; load(jahr, { init:true }); };
}
$('#jahr').onchange = e => {
  const j = Number(e.target.value);
  monat = j === CUR_Y ? CUR_M : 0; offeneKat = null;
  load(j);
};
