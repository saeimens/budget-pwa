// Budget-App – Einrichtung, Google-Login, Statusanzeige.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Einrichtung, Anmeldung, Status ---------- */
VIEW_TITEL.setup = 'Budget'; VIEW_TITEL.login = 'Budget';

async function login() {
  try { await Daten.anmelden(true); }
  catch (e) { return toast(e.message, { error:true }); }
  if (view === 'login' || view === 'setup') setView('uebersicht');
  load(D ? D.jahr : null, { init:!D });
}
$('#btnLogin').onclick = login;
$('#btnSetupAendern').onclick = () => {
  const c = Daten.config(); $('#sSheet').value = c.sheetId || ''; $('#sClient').value = c.clientId || '';
  setView('setup');
};
$('#fSetup').onsubmit = e => {
  e.preventDefault();
  const sheet = $('#sSheet').value.trim();
  const client = $('#sClient').value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  $('#sClient').value = client;
  if (!sheet) return markInvalid($('#sSheet'));
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(client)) { markInvalid($('#sClient')); return toast('Die Client-ID endet auf .apps.googleusercontent.com'); }
  Daten.konfigurieren(client, sheet);
  login();
};

function renderStatus(s = Daten.status()) {
  const chip = $('#statusChip');
  const n = s.warteschlange;
  if (!s.online) { chip.className = 'chip warn'; chip.textContent = n ? `Offline · ${n} Änderung${n === 1 ? '' : 'en'} warten` : 'Offline'; }
  else if (n) { chip.className = 'chip'; chip.textContent = `${n} Änderung${n === 1 ? '' : 'en'} werden übertragen …`; }
  else if (Daten.konfiguriert() && !s.angemeldet && view !== 'login' && view !== 'setup') { chip.className = 'chip ok'; chip.textContent = 'Anmelden'; }
  else { chip.hidden = true; return; }
  chip.hidden = false;
}
$('#statusChip').onclick = () => { if (!Daten.status().angemeldet && navigator.onLine) login(); };
Daten.onStatus(s => renderStatus(s));
setInterval(() => renderStatus(), 30000);   // Anmeldung läuft nach einer Stunde ab

// Der erste Tipp oder Tastendruck nach Ablauf (oder kurz davor) erneuert die Anmeldung von selbst –
// kein gezieltes «Anmelden» mehr nötig. War sie schon abgelaufen, werden die Daten danach frisch geladen.
async function beiNutzeraktion(e) {
  if (document.body.classList.contains('gesperrt') || view === 'setup' || view === 'login') return;
  if (e.target && e.target.closest && e.target.closest('#statusChip')) return;   // der Knopf meldet selbst an
  const warAbgelaufen = !Daten.status().angemeldet;
  if (await Daten.auffrischen()) { renderStatus(); if (warAbgelaufen) load(D ? D.jahr : null); }
}
document.addEventListener('pointerdown', beiNutzeraktion, true);
document.addEventListener('keydown', beiNutzeraktion, true);
