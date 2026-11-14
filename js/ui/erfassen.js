// Budget-App – Buchung von Hand erfassen.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Erfassen ---------- */
$('#eDatum').value = isoLocal(HEUTE);
$('#eTyp').innerHTML = typOpts('Ausgabe');
$('#eKat').innerHTML = katOpts('', undefined, { neueReise: true });
$('#eKonto').innerHTML = KONTEN.map(k => `<option>${k}</option>`).join('');
if (KONTEN.includes(store.get('konto'))) $('#eKonto').value = store.get('konto');
$('#eTyp').onchange = () => katLabel($('#eTyp').value, $('#eKatLabel'));

$('#fErfassen').onsubmit = async e => {
  e.preventDefault();
  const b = { datum:$('#eDatum').value, betrag:parseBetrag($('#eBetrag').value), typ:$('#eTyp').value,
              kategorie:$('#eKat').value, notiz:$('#eNotiz').value.trim(), konto:$('#eKonto').value };
  if (!b.betrag) { markInvalid($('#eBetrag')); return toast('Bitte einen Betrag eingeben'); }
  if (!b.datum) { markInvalid($('#eDatum')); return toast('Bitte ein Datum wählen'); }
  if (b.typ === 'Ausgabe' && !b.kategorie) { markInvalid($('#eKat')); return toast('Bitte eine Kategorie wählen'); }
  const btn = $('#btnErfassen');
  btn.disabled = true; btn.textContent = 'Speichert …';
  try { await call('addBuchung', b); }
  catch (err) { return fehler('Speichern', err); }
  finally { btn.disabled = false; btn.textContent = 'Speichern'; }
  store.set('konto', b.konto);
  $('#eBetrag').value = ''; $('#eNotiz').value = ''; $('#eKat').value = '';
  toast(`Gespeichert: ${chf(b.betrag)} · ${b.kategorie || b.typ}`);
  $('#eBetrag').focus();
  if (D) load(D.jahr);
};
