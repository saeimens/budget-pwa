// Budget-App – CSV-Import mit Vorschau.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Import ---------- */
let fileTexts = [];
async function handleFiles(list) {
  fileTexts = [];
  for (const f of list) fileTexts.push({ name:f.name, text:await readFile(f) });
  $('#btnVorschau').disabled = $('#btnImport').disabled = !fileTexts.length;
  $('#dropTitel').textContent = fileTexts.length
    ? `${fileTexts.length} Datei${fileTexts.length === 1 ? '' : 'en'} gewählt – andere wählen`
    : 'CSV-Dateien wählen oder hierher ziehen';
  $('#importResult').innerHTML = fileTexts.map(f => `<span class="pill">${esc(f.name)}</span>`).join(' ');
}
$('#files').onchange = e => handleFiles(e.target.files);
const drop = $('#drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', e => { e.preventDefault(); handleFiles(e.dataTransfer.files); });

function readFile(f) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      if (String(r.result).includes('�')) {   // kein UTF-8 → Latin-1 (UBS-Kreditkarte)
        const r2 = new FileReader(); r2.onload = () => res(r2.result); r2.readAsText(f, 'ISO-8859-1');
      } else res(r.result);
    };
    r.readAsText(f, 'UTF-8');
  });
}

async function runImport(dry) {
  $('#btnVorschau').disabled = $('#btnImport').disabled = true;
  $('#importResult').innerHTML = `<div class="loading">${dry ? 'Erstelle Vorschau' : 'Importiere'} …</div>`;
  const out = [];
  for (const f of fileTexts) {
    try { out.push(await call('importCsv', f.text, f.name, dry)); }
    catch (e) { out.push({ datei:f.name, fehler:e.message }); }
  }
  const offenTotal = out.reduce((a, r) => a + (r.offen || 0), 0);
  $('#importResult').innerHTML = out.map(r => r.fehler
    ? `<div class="card" style="border-color:var(--bad);margin-top:var(--s2)"><b>${esc(r.datei)}</b><div class="neg small">${esc(r.fehler)}</div></div>`
    : `<div class="card" style="margin-top:var(--s2)">
        <b>${esc(r.format)}</b> <span class="small muted">${esc(r.datei)}</span>
        <div class="small" style="margin-top:6px"><b>${r.neu} neu</b>${dry ? ' (Vorschau, noch nichts gespeichert)' : ''}
          · <span class="${r.offen ? '' : 'muted'}">${r.offen} zu prüfen</span>
          · <span class="muted">${r.doppelt} schon vorhanden · ${r.ignoriert} ignoriert</span></div>
        ${r.saldo ? `<div class="small" style="margin-top:6px">${r.saldo.uebernehmen
          ? `✓ Kontostand ${esc(r.saldo.konto)} per ${datumKurz(r.saldo.datum)}: <b class="num">${chf(r.saldo.betrag)}</b> ${dry ? 'wird ins Vermögen übernommen' : 'ins Vermögen übernommen'}`
          : `<span class="muted">Kontostand ${esc(r.saldo.konto)} per ${datumKurz(r.saldo.datum)} nicht übernommen: ${esc(r.saldo.grund)}</span>`}</div>` : ''}
        ${r.hinweise.length ? `<div class="small" style="color:var(--warn);margin-top:6px">${r.hinweise.map(esc).join('<br>')}</div>` : ''}
        ${dry && r.vorschau.length ? `<details><summary>Buchungen anzeigen</summary>${r.vorschau.map(b => `
          <div class="tx small" style="cursor:default"><span class="grow"><span class="t">${esc(b.notiz)}</span>
            <span class="muted meta">${fmtDate(b.datum)} · ${esc(b.typ)} · ${esc(b.kategorie || '—')}
            ${b.status === 'prüfen' ? '<span class="pill warn">prüfen</span>' : ''}</span></span>
            <span class="num">${chf(b.betrag)}</span></div>`).join('')}</details>` : ''}
      </div>`).join('')
    + (!dry && offenTotal ? `<button type="button" id="zuPruefen" style="width:100%;margin-top:var(--s3)">${offenTotal} Buchung${offenTotal === 1 ? '' : 'en'} jetzt prüfen</button>` : '');
  if (dry) {
    $('#btnVorschau').disabled = $('#btnImport').disabled = false;
  } else {
    fileTexts = []; $('#files').value = '';
    $('#dropTitel').textContent = 'CSV-Dateien wählen oder hierher ziehen';
    toast('Import abgeschlossen');
    if ($('#zuPruefen')) $('#zuPruefen').onclick = () => setView('pruefen');
    await load(D.jahr, { pruefen:true });
  }
}
$('#btnVorschau').onclick = () => runImport(true);
$('#btnImport').onclick = () => runImport(false);

/** Per Android-«Teilen» empfangene Dateien (vom Service Worker zwischengespeichert) in den Import übernehmen */
async function geteilteDateien() {
  history.replaceState(null, '', location.pathname);   // ?geteilt aus der Adresse entfernen
  if (!('caches' in window)) return;
  const c = await caches.open('budget-geteilt'), dateien = [];
  for (const k of await c.keys()) {
    const r = await c.match(k);
    if (r) dateien.push(new File([await r.blob()], decodeURIComponent(r.headers.get('X-Name') || 'geteilt.csv')));
    await c.delete(k);
  }
  if (!dateien.length) return toast('Keine Datei empfangen', { error:true });
  setView('import');
  await handleFiles(dateien);
  toast(`${dateien.length} Datei${dateien.length === 1 ? '' : 'en'} empfangen – zuerst Vorschau oder gleich importieren`);
}
