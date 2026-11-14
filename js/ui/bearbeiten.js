// Budget-App – Bearbeiten-Dialog, Löschen mit Rückgängig.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Buchung bearbeiten ---------- */
let editB = null;
const katLabel = (typ, el) => el.textContent = typ === 'Ausgabe' ? 'Kategorie' : 'Kategorie (optional)';
function openEdit(b) {
  if (!b) return;
  editB = b;
  $('#edTitel').textContent = b.notiz || b.kategorie || 'Buchung';
  $('#edMeta').textContent = [fmtDate(b.datum), b.konto, b.quelle].filter(Boolean).join(' · ');
  $('#edBank').textContent = b.banktext; $('#edBank').hidden = !b.banktext;
  $('#edTyp').innerHTML = typOpts(b.typ);
  $('#edKat').innerHTML = katOpts(b.kategorie, undefined, { neueReise: true });
  $('#edBetrag').value = b.betrag.toFixed(2);
  $('#edNotiz').value = b.notiz;
  renderTagChips($('#edTags'), steuerVon(b));
  katLabel(b.typ, $('#edKatLabel'));
  $$('#editForm button').forEach(x => x.disabled = false);
  $('#edit').showModal();
}
$('#edTyp').onchange = () => katLabel($('#edTyp').value, $('#edKatLabel'));
$('#edClose').onclick = () => $('#edit').close();
$('#edit').addEventListener('click', e => { if (e.target === $('#edit')) $('#edit').close(); });

$('#editForm').onsubmit = async e => {
  e.preventDefault();
  const b = editB, typ = $('#edTyp').value, kategorie = $('#edKat').value;
  const betrag = parseBetrag($('#edBetrag').value);
  if (!betrag) { markInvalid($('#edBetrag')); return toast('Bitte einen gültigen Betrag eingeben'); }
  if (typ === 'Ausgabe' && !kategorie) { markInvalid($('#edKat')); return toast('Bitte eine Kategorie wählen'); }
  const changes = { typ, kategorie, notiz: $('#edNotiz').value.trim(), status:'ok',
    tags: mitSteuer(b.tags, $$('#edTags [aria-pressed="true"]').map(x => x.dataset.t)) };
  if (Math.abs(betrag - b.betrag) >= 0.005) changes.betrag = betrag;
  $$('#editForm button').forEach(x => x.disabled = true);
  try { await call('updateBuchung', b.row, changes, null, expect(b)); }
  catch (err) { $$('#editForm button').forEach(x => x.disabled = false); return fehler('Speichern', err); }
  $('#edit').close(); toast('Gespeichert'); refreshAll();
};
$('#edDel').onclick = async () => {
  const b = editB;
  $$('#editForm button').forEach(x => x.disabled = true);
  try { await call('deleteBuchung', b.row, expect(b)); }
  catch (err) { $$('#editForm button').forEach(x => x.disabled = false); return fehler('Löschen', err); }
  $('#edit').close();
  toast('Buchung gelöscht', { action:'Rückgängig', onAction:() => undoDelete(b) });
  refreshAll();
};

async function undoDelete(b) {
  const { datum, betrag, typ, kategorie, notiz, konto, banktext, quelle, status, tags, key } = b;
  try { await call('addBuchung', { datum, betrag, typ, kategorie, notiz, konto, banktext, quelle, status, tags, key }); }
  catch (e) { return fehler('Wiederherstellen', e); }
  toast('Wiederhergestellt'); refreshAll({ pruefen:true });
}
async function refreshAll(opts = {}) {
  await load(D.jahr, opts);
  if (view === 'suche' && sucheAktiv) suche();
}
