// Budget-App – Sperrbildschirm, Verdecken beim App-Wechsel.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- App-Sperre ---------- */
let verstecktSeit = 0, bioLaeuft = false;
function sperren() {
  if (!Sperre.aktiv()) return;
  $$('dialog[open]').forEach(d => d.close());
  document.body.classList.add('gesperrt'); document.body.classList.remove('verdeckt');
  $('#sperre').hidden = false; $('#sPin').value = ''; $('#sFehler').textContent = '';
  $('#sBio').hidden = !Sperre.hatBiometrie();
  if (Sperre.hatBiometrie()) setTimeout(bioEntsperren, 300); else setTimeout(() => $('#sPin').focus(), 50);
}
function entsperren() {
  $('#sperre').hidden = true;
  document.body.classList.remove('gesperrt', 'verdeckt');
}
async function bioEntsperren() {
  if (bioLaeuft || $('#sperre').hidden) return;
  bioLaeuft = true;
  try {
    if (await Sperre.biometriePruefen()) entsperren();
    else $('#sFehler').textContent = 'Nicht bestätigt – bitte PIN eingeben.';
  } catch (e) {
    // abgebrochen oder ohne Tippen nicht erlaubt: still auf PIN/Knopf ausweichen
    if (!['NotAllowedError', 'AbortError'].includes(e.name)) $('#sFehler').textContent = 'Biometrie nicht verfügbar – bitte PIN eingeben.';
  } finally { bioLaeuft = false; }
}
$('#sBio').onclick = bioEntsperren;
$('#sPinForm').onsubmit = async e => {
  e.preventDefault();
  const pin = $('#sPin').value.trim();
  if (!pin) return $('#sPin').focus();
  try { if (await Sperre.pinPruefen(pin)) return entsperren(); $('#sFehler').textContent = 'Falsche PIN.'; }
  catch (err) { $('#sFehler').textContent = err.message; }
  $('#sPin').value = ''; $('#sPin').focus();
};
// Beim Wechsel in eine andere App sofort verdecken (Vorschau im App-Umschalter), nach der Sperrzeit sperren
document.addEventListener('visibilitychange', () => {
  if (!Sperre.aktiv() || document.body.classList.contains('gesperrt')) return;
  if (document.hidden) { verstecktSeit = Date.now(); document.body.classList.add('verdeckt'); }
  else if (Date.now() - verstecktSeit >= Sperre.minuten() * 60000) sperren();
  else document.body.classList.remove('verdeckt');
});
