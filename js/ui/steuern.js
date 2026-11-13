// Budget-App – Steuer-Tags, Vorschläge, Export.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Steuern ---------- */
// Markierung in der Spalte «Tags» der Buchung: «Steuer:Weiterbildung», mehrere mit Komma; «Steuer:keine» = Vorschlag verworfen
const STEUER = [
  { t: 'Berufskosten', h: 'Arbeitsmaterial, Fachliteratur, Berufsverbände' },
  { t: 'Weiterbildung', h: 'Berufsorientierte Kurse und Ausbildungen' },
  { t: 'Krankheitskosten', h: 'Arzt, Therapie, Brille, Selbstbehalt – nicht von der Krankenkasse bezahlt' },
  { t: 'Behinderungsbedingt', h: 'Kosten, die wegen einer Behinderung anfallen' },
  { t: 'Spende', h: 'An gemeinnützige Organisationen' },
  { t: 'Fahrkosten', h: 'Arbeitsweg' },
  { t: 'Nebenerwerb', h: 'Kosten für Nebenerwerb' }
];
const tagListe = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const steuerVon = b => tagListe(b.tags).filter(t => t.startsWith('Steuer:')).map(t => t.slice(7));
const mitSteuer = (alt, neu) => tagListe(alt).filter(t => !t.startsWith('Steuer:')).concat(neu.map(t => 'Steuer:' + t)).join(', ');

function renderTagChips(el, aktiv) {
  el.innerHTML = STEUER.map(x => `<button type="button" data-t="${x.t}" aria-pressed="${aktiv.includes(x.t)}" title="${esc(x.h)}">${x.t}</button>`).join('');
  $$('button', el).forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
}

/**
 * Vorschlag für unmarkierte Buchungen (nur Hinweis – entscheidet die Person).
 * Im Code stehen nur allgemeine Begriffe. Persönliche Stichwörter (Ärztinnen, Schulen, Vereine …) gehören ins Sheet:
 * Blatt «Einstellungen», Zeilen «Steuer-Stichwörter <Abzugsart>», Wert = Stichwörter mit Komma getrennt.
 */
const STEUER_ALLGEMEIN = {
  Weiterbildung: /weiterbildung|studiengeb/,
  Berufskosten: /berufsverband|fachliteratur/,
  Spende: /spende/,
  Krankheitskosten: /arzt|apotheke|\bbrille|physiotherap|zahnarzt/
};
function steuerStichwoerter() {
  const e = (Daten.cache() || {}).einst || {}, o = {};
  STEUER.forEach(x => o[x.t] = String(e['Steuer-Stichwörter ' + x.t] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  return o;
}
function steuerVorschlag(b, eigene = steuerStichwoerter()) {
  if (b.typ === 'Einnahme' || b.typ === 'Sparen' || b.betrag <= 0) return null;
  const txt = (b.notiz + ' ' + b.banktext + ' ' + b.kategorie).toLowerCase();
  for (const x of STEUER) if ((eigene[x.t] || []).some(w => txt.includes(w))) return x.t;   // eigene zuerst
  if (b.kategorie === 'Selbstbehalt') return 'Krankheitskosten';
  for (const [t, re] of Object.entries(STEUER_ALLGEMEIN)) if (re.test(txt)) return t;
  return null;
}

async function steuerSetzen(liste, meldung) {
  // sofort anzeigen, dann ins Sheet schreiben
  liste.forEach(x => x.b.tags = x.tags);
  renderSteuern();
  try { await call('tagsSetzen', liste.map(x => ({ row: x.b.row, expect: expect(x.b), tags: x.tags }))); toast(meldung); }
  catch (e) { fehler('Speichern', e); }
  load(D.jahr);
}

function renderSteuern() {
  const jahr = D.jahr, liste = D.buchungen;
  const markiert = liste.filter(b => steuerVon(b).some(t => t !== 'keine'));
  const proTag = STEUER.map(x => ({ ...x, b: markiert.filter(b => steuerVon(b).includes(x.t)) }))
    .map(x => ({ ...x, summe: x.b.reduce((s, b) => s + b.betrag, 0) })).filter(x => x.b.length);
  const total = markiert.reduce((s, b) => s + b.betrag, 0);
  const s3a = liste.filter(b => b.typ === 'Sparen' && /3\. säule|3a/i.test(b.kategorie)).reduce((s, b) => s + b.betrag, 0);
  const eigene = steuerStichwoerter();
  const vorschlaege = liste.filter(b => !steuerVon(b).length).map(b => ({ b, t: steuerVorschlag(b, eigene) })).filter(x => x.t)
    .sort((a, b) => a.t.localeCompare(b.t) || b.b.datum.localeCompare(a.b.datum));

  const hero = `<div class="card hero"><div class="label">Markiert für die Steuererklärung ${jahr}</div>
      <div class="value num">${chf0(total)} <span class="cur">CHF</span></div>
      <div class="small muted">${markiert.length} Buchung${markiert.length === 1 ? '' : 'en'}${s3a ? ` · dazu 3a-Einzahlungen ${chf0(s3a)} CHF (automatisch erkannt)` : ''}</div>
      ${markiert.length ? `<button type="button" class="ghost" id="stExport" style="width:100%;margin-top:var(--s3)">Als CSV exportieren</button>` : ''}</div>`;

  const gruppen = proTag.length ? `<h2 class="section">Nach Abzugsart · antippen für Buchungen</h2>
    <div class="card" style="padding-block:var(--s1)">${proTag.map(x => {
      const offen = offenSt === x.t;
      return `<div class="cat-wrap"><button type="button" class="plain cat" data-st="${x.t}" aria-expanded="${offen}">
          <span class="row"><span class="grow name">${x.t}</span><span class="num">${chf(x.summe)}</span>${ico('chev', 'chev', 18)}</span>
          <span class="small muted" style="display:block;margin-top:2px">${x.b.length} Buchung${x.b.length === 1 ? '' : 'en'} · ${esc(x.h)}</span></button>
        ${offen ? `<div class="cat-detail">${txList(x.b.slice().sort((a, b) => b.datum.localeCompare(a.datum)))}</div>` : ''}</div>`; }).join('')}</div>`
    : vorschlaege.length ? '' : `<div class="card empty" style="margin-top:var(--s3)"><b>Noch nichts markiert</b>
        <span class="small muted">Markiere eine Buchung im Bearbeiten-Fenster unter «Steuern».</span></div>`;

  const vor = vorschlaege.length ? `<h2 class="section row" style="align-items:center"><span class="grow">Vorschläge (${vorschlaege.length})</span>
      <button type="button" class="ghost" id="stAlle" style="min-height:36px;padding:4px 12px;font-size:14px">Alle übernehmen</button></h2>
    <div class="card" style="padding-block:var(--s1)">${vorschlaege.map((x, i) => `<div class="vschlag">
        <button type="button" class="plain row" style="display:flex;cursor:pointer" data-vi="${i}" data-act="anders" aria-label="${esc(x.b.notiz || x.b.kategorie)} öffnen, andere Art wählen">
          <span class="grow"><span style="font-weight:500;display:block">${esc(x.b.notiz || x.b.kategorie)}</span>
          <span class="small muted">${fmtDate(x.b.datum)} · ${esc(x.b.kategorie)}</span></span><span class="num">${chf(x.b.betrag)}</span></button>
        <div class="knoepfe"><button type="button" data-vi="${i}" data-act="ja">✓ ${x.t}</button>
          <button type="button" class="ghost" data-vi="${i}" data-act="nein">Nicht relevant</button></div></div>`).join('')}</div>
    <div class="small muted" style="margin-top:var(--s2)">Buchung antippen, um eine andere Abzugsart zu wählen.</div>` : '';

  const hinweis = `<div class="hinweis">Die App sammelt nur – was abziehbar ist, regelt die Wegleitung zur Steuererklärung.
    Krankheitskosten sind meist nur abziehbar, soweit sie 5 % des Nettoeinkommens übersteigen; behinderungsbedingte Kosten in der Regel ohne diesen Selbstbehalt.</div>`;

  $('#uebersicht').innerHTML = `<div style="margin-top:var(--s1)">${hero}</div>` + gruppen + vor + hinweis;

  $$('#uebersicht [data-st]').forEach(b => b.onclick = () => { offenSt = offenSt === b.dataset.st ? null : b.dataset.st; renderSteuern(); });
  bindTx($('#uebersicht'));
  $$('#uebersicht [data-vi]').forEach(btn => btn.onclick = () => {
    const x = vorschlaege[+btn.dataset.vi];
    if (btn.dataset.act === 'anders') return openEdit(x.b);
    const neu = btn.dataset.act === 'ja' ? [x.t] : ['keine'];
    steuerSetzen([{ b: x.b, tags: mitSteuer(x.b.tags, neu) }], btn.dataset.act === 'ja' ? `Als ${x.t} markiert` : 'Vorschlag ausgeblendet');
  });
  if ($('#stAlle')) $('#stAlle').onclick = () =>
    steuerSetzen(vorschlaege.map(x => ({ b: x.b, tags: mitSteuer(x.b.tags, [x.t]) })), `${vorschlaege.length} Buchungen markiert`);
  if ($('#stExport')) $('#stExport').onclick = () => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const zeilen = [['Datum', 'Abzugsart', 'Betrag CHF', 'Beschreibung', 'Kategorie', 'Konto']].concat(
      markiert.slice().sort((a, b) => a.datum.localeCompare(b.datum)).flatMap(b => steuerVon(b).filter(t => t !== 'keine')
        .map(t => [fmtDate(b.datum), t, b.betrag.toFixed(2), b.notiz, b.kategorie, b.konto])));
    if (s3a) zeilen.push(['', '3a-Einzahlungen (Total)', s3a.toFixed(2), 'automatisch erkannt', '', '']);
    const blob = new Blob(['﻿' + zeilen.map(r => r.map(q).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Steuern ${jahr}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Steuern ${jahr}.csv gespeichert`);
  };
}
