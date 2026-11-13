// Budget-App – Einstellungen (Zahnrad) und Start der App.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Einstellungen ---------- */
const pinFeld = (id, label, auto) => `<label class="field"><span>${label}</span>
  <input type="password" id="${id}" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="${auto}"></label>`;
async function renderEinst() {
  const el = $('#eSperre');
  const bio = await Sperre.biometrieMoeglich();
  const c = Daten.config(), s = Daten.status();
  $('#eKontoInfo').textContent = `Google-Sheet …${(c.sheetId || '').slice(-6)} · ${s.angemeldet ? 'angemeldet' : 'nicht angemeldet'}`;
  if (!Sperre.aktiv()) {
    el.innerHTML = `<p class="small muted" style="margin:0">Schützt die Anzeige mit einer PIN${bio ? ' und Fingerabdruck / Touch ID' : ''}.
        Gilt nur auf diesem Gerät. Deine Daten im Google Sheet sind zusätzlich durch dein Google-Konto geschützt.</p>
      <form id="fPinNeu" class="stack" novalidate><div class="grid2">${pinFeld('pin1', 'Neue PIN (4–8 Ziffern)', 'new-password')}${pinFeld('pin2', 'PIN wiederholen', 'new-password')}</div>
        <button type="submit" style="width:100%">App-Sperre einschalten</button></form>`;
    $('#fPinNeu').onsubmit = async e => {
      e.preventDefault();
      const a = $('#pin1').value.trim(), b = $('#pin2').value.trim();
      if (!/^\d{4,8}$/.test(a)) { markInvalid($('#pin1')); return toast('Die PIN braucht 4 bis 8 Ziffern'); }
      if (a !== b) { markInvalid($('#pin2')); return toast('Die beiden PINs stimmen nicht überein'); }
      await Sperre.pinSetzen(a);
      toast('App-Sperre eingeschaltet'); renderEinst();
    };
    return;
  }
  el.innerHTML = `<div class="status gruen"><span aria-hidden="true">✓</span>App-Sperre ist eingeschaltet</div>
    ${bio ? (Sperre.hatBiometrie()
        ? `<div class="row"><span class="grow small">Fingerabdruck / Touch ID ist eingerichtet</span><button type="button" class="ghost" id="eBioAus">Entfernen</button></div>`
        : `<button type="button" id="eBioAn" style="width:100%">Fingerabdruck / Touch ID einrichten</button>`)
      : '<div class="small muted">Fingerabdruck / Touch ID ist auf diesem Gerät nicht verfügbar – die PIN funktioniert.</div>'}
    <label class="field"><span>Sperren nach</span><select id="eMin">${[[0, 'sofort beim Verlassen'], [1, '1 Minute'], [5, '5 Minuten'], [15, '15 Minuten']]
      .map(([v, l]) => `<option value="${v}" ${v === Sperre.minuten() ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <button type="button" class="ghost" id="eJetzt" style="width:100%">Jetzt sperren</button>
    <details><summary>PIN ändern</summary><form id="fPinAendern" class="stack" novalidate style="margin-top:var(--s2)">
      ${pinFeld('pinA', 'Aktuelle PIN', 'current-password')}<div class="grid2">${pinFeld('pinN1', 'Neue PIN', 'new-password')}${pinFeld('pinN2', 'Wiederholen', 'new-password')}</div>
      <button type="submit" style="width:100%">PIN speichern</button></form></details>
    <details><summary>App-Sperre ausschalten</summary><form id="fAus" class="stack" novalidate style="margin-top:var(--s2)">
      ${pinFeld('pinAus', 'Aktuelle PIN', 'current-password')}<button type="submit" class="ghost danger" style="width:100%">Ausschalten</button></form></details>`;
  if ($('#eBioAn')) $('#eBioAn').onclick = async () => {
    try { await Sperre.biometrieEinrichten(); toast('Fingerabdruck / Touch ID eingerichtet'); }
    catch (e) { toast(e.name === 'NotAllowedError' ? 'Einrichtung abgebrochen' : 'Einrichtung fehlgeschlagen: ' + e.message, { error: e.name !== 'NotAllowedError' }); }
    renderEinst();
  };
  if ($('#eBioAus')) $('#eBioAus').onclick = () => { Sperre.biometrieEntfernen(); toast('Biometrie entfernt – den Passkey kannst du im Passwort-Manager löschen'); renderEinst(); };
  $('#eMin').onchange = e => { Sperre.setzeMinuten(+e.target.value); toast('Gespeichert'); };
  $('#eJetzt').onclick = () => { $('#edlg').close(); sperren(); };
  const pruefe = async (id) => {
    try { if (await Sperre.pinPruefen($('#' + id).value.trim())) return true; markInvalid($('#' + id)); toast('Falsche PIN', { error:true }); }
    catch (e) { toast(e.message, { error:true }); }
    return false;
  };
  $('#fPinAendern').onsubmit = async e => {
    e.preventDefault();
    const a = $('#pinN1').value.trim(), b = $('#pinN2').value.trim();
    if (!/^\d{4,8}$/.test(a)) { markInvalid($('#pinN1')); return toast('Die PIN braucht 4 bis 8 Ziffern'); }
    if (a !== b) { markInvalid($('#pinN2')); return toast('Die beiden PINs stimmen nicht überein'); }
    if (!await pruefe('pinA')) return;
    await Sperre.pinSetzen(a); toast('PIN geändert'); renderEinst();
  };
  $('#fAus').onsubmit = async e => {
    e.preventDefault();
    if (!await pruefe('pinAus')) return;
    Sperre.ausschalten(); toast('App-Sperre ausgeschaltet'); renderEinst();
  };
}
$('#btnEinst').onclick = async () => { await renderEinst(); $('#edlg').showModal(); };
$('#eClose').onclick = () => $('#edlg').close();
$('#edlg').addEventListener('click', e => { if (e.target === $('#edlg')) $('#edlg').close(); });
$('#eSetup').onclick = () => { $('#edlg').close(); $('#btnSetupAendern').click(); };
$('#eAbmelden').onclick = () => { Daten.abmelden(); $('#edlg').close(); setView('login'); toast('Abgemeldet'); };

function start() {
  if (Sperre.aktiv()) sperren();
  if (!Daten.konfiguriert()) { setView('setup'); renderStatus(); return; }
  renderTabs();
  setView('uebersicht');
  renderStatus();
  load(null, { init:true });
}
start();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
