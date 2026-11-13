// Budget-App – Suche über alle Jahre.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Suche ---------- */
let sucheSeq = 0, sucheTimer = null, sucheAktiv = false;
const SUCHE_HINWEIS = '<div class="card empty"><span class="small muted">Sucht in Notiz, Banktext, Kategorie und Konto – über alle Jahre. Antippen eines Treffers öffnet die Buchung.</span></div>';
async function suche() {
  clearTimeout(sucheTimer);
  const q = $('#q').value.trim(), j = $('#qJahr').value, k = $('#qKat').value;
  if (!q && !j && !k) { sucheAktiv = false; $('#sucheResult').innerHTML = SUCHE_HINWEIS; return; }
  sucheAktiv = true;
  const seq = ++sucheSeq;
  $('#sucheResult').innerHTML = '<div class="loading">Suche …</div>';
  let res;
  try { res = await call('search', q, j, k); }
  catch (e) { if (seq === sucheSeq) $('#sucheResult').innerHTML = `<div class="card neg">Suche fehlgeschlagen: ${esc(e.message)}</div>`; return; }
  if (seq !== sucheSeq) return;   // veraltete Antwort
  const total = res.filter(b => b.typ === 'Ausgabe').reduce((a, b) => a + b.betrag, 0);
  $('#sucheResult').innerHTML = res.length
    ? `<div class="small muted" style="margin:0 var(--s1) var(--s2)">${res.length}${res.length >= 500 ? ' (neueste)' : ''} Treffer · Ausgaben total <b class="num">${chf(total)}</b></div>
       <div class="card" style="padding-block:var(--s1)">${txList(res)}</div>`
    : '<div class="card empty"><b>Keine Treffer</b><span class="small muted">Anderen Begriff versuchen oder Filter lockern.</span></div>';
  bindTx($('#sucheResult'));
}
$('#q').oninput = () => { clearTimeout(sucheTimer); sucheTimer = setTimeout(suche, 400); };
$('#q').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); suche(); } };
$('#qJahr').onchange = $('#qKat').onchange = suche;
$('#sucheResult').innerHTML = SUCHE_HINWEIS;
