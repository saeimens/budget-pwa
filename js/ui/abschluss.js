// Budget-App – Checkliste «Monatsabschluss» für den Vormonat (oben in der Budget-Ansicht).
// Erkennt jeden Schritt selbst aus den Daten: Importe, offene Buchungen, Kontostände. Nichts muss abgehakt werden.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Monatsabschluss ---------- */
const isoPlus = (iso, tage) => { const [y, m, d] = iso.split('-').map(Number); return isoLocal(new Date(y, m - 1, d + tage)); };

/** Zustand des Abschlusses für den Monat vor «heute» */
function abschlussStand() {
  const y = CUR_M === 1 ? CUR_Y - 1 : CUR_Y, m = CUR_M === 1 ? 12 : CUR_M - 1;
  const mm = String(m).padStart(2, '0');
  const start = `${y}-${mm}-01`, ende = `${y}-${mm}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const alle = D.alle || D.buchungen, vm = D.vermoegen || [];
  const bis = konto => alle.filter(b => b.konto === konto && b.datum <= isoPlus(ende, 40)).reduce((x, b) => b.datum > x ? b.datum : x, '');
  const schritte = [];

  // 1. Lohnkonto bis Monatsende (Schlusssaldo aus der CSV landet im Vermögen)
  const lohnSaldo = vm.some(v => /^Lohnkonto/.test(v.konto) && v.datum >= ende);
  const lohnBis = bis('Lohnkonto');
  schritte.push({ id: 'lohn', titel: 'Lohnkonto importiert', ok: lohnSaldo || lohnBis >= isoPlus(ende, -3),
    info: lohnBis ? `Buchungen bis ${fmtDate(lohnBis)}` : 'Noch keine Buchungen', aktion: 'import' });

  // 2. Kreditkarte: einzelne Käufe (die Sammelbelastung im Lohnkonto wird ignoriert)
  const kkBis = bis('Kreditkarte');
  schritte.push({ id: 'kk', titel: 'Kreditkarte importiert', ok: kkBis >= isoPlus(ende, -7),
    info: kkBis ? `Käufe bis ${fmtDate(kkBis)}` : 'Noch keine Käufe', aktion: 'import' });

  // 3. Wise nur bei Nutzung – kann die App nicht wissen, darum ohne Haken
  const wiseBis = bis('Wise');
  schritte.push({ id: 'wise', titel: 'Wise, falls benutzt', optional: true,
    info: wiseBis ? `zuletzt bis ${fmtDate(wiseBis)}` : 'bisher nie importiert', aktion: 'import' });

  // 4. Alles geprüft (bis Monatsende)
  const offen = (D.offen || []).filter(b => b.datum <= ende).length;
  schritte.push({ id: 'pruefen', titel: 'Alles zugeordnet', ok: offen === 0,
    info: offen ? `${offen} Buchung${offen === 1 ? '' : 'en'} zu prüfen` : 'nichts offen', aktion: offen ? 'pruefen' : null });

  // 5. Kontostände: jedes Konto, das in den letzten Monaten geführt wurde, braucht einen Stand per Monatsende
  if (D.hatVermoegen) {
    const letzter = {};
    vm.filter(v => !/^Lohnkonto/.test(v.konto))   // kommt mit dem Import (Schritt 1)
      .forEach(v => { if (!letzter[v.konto] || v.datum > letzter[v.konto]) letzter[v.konto] = v.datum; });
    const aktiv = Object.keys(letzter).filter(k => letzter[k] >= isoPlus(start, -92));
    const fehlt = aktiv.filter(k => letzter[k] < isoPlus(ende, -5));
    schritte.push({ id: 'konten', titel: 'Kontostände erfasst', ok: aktiv.length > 0 && !fehlt.length,
      info: !aktiv.length ? 'noch keine Konten' : fehlt.length ? `fehlt: ${fehlt.join(', ')}` : `${aktiv.length} Konten per ${fmtDate(ende)}`,
      aktion: fehlt.length || !aktiv.length ? 'konten' : null });
  }
  const pflicht = schritte.filter(s => !s.optional);
  return { y, m, ende, schritte, erledigt: pflicht.filter(s => s.ok).length, total: pflicht.length };
}

function abschlussKarte() {
  if (!D || ansicht !== 'budget') return '';
  const a = abschlussStand();
  if (D.jahr !== a.y && D.jahr !== CUR_Y) return '';
  const name = MONATE_LANG[a.m - 1];
  if (a.erledigt === a.total) {   // fertig: nur kurz bestätigen, solange der Monat gewählt ist
    return monat === a.m && D.jahr === a.y ? `<div class="card abschluss fertig row"><span class="ab-ico ok">${ico('check', '', 18)}</span>
      <span class="grow"><b>Monatsabschluss ${name} erledigt</b></span></div>` : '';
  }
  const knopf = { import: 'Importieren', pruefen: 'Prüfen', konten: 'Erfassen' };
  return `<section class="card abschluss" aria-labelledby="abTitel">
    <div class="row"><h2 id="abTitel" class="grow">Monatsabschluss ${name}</h2>
      <span class="small muted num">${a.erledigt} von ${a.total} erledigt</span></div>
    <ol class="ab-liste">${a.schritte.map(s => `<li class="row ${s.ok ? 'ok' : ''}">
      <span class="ab-ico ${s.ok ? 'ok' : s.optional ? 'opt' : ''}">${s.ok ? ico('check', '', 16) : ''}</span>
      <span class="grow"><span class="ab-t">${esc(s.titel)}</span>
        <span class="sr">${s.ok ? ', erledigt' : s.optional ? ', freiwillig' : ', offen'}</span>
        <span class="small muted" style="display:block">${esc(s.info)}</span></span>
      ${!s.ok && s.aktion && !(s.optional && s.aktion === 'import') ? `<button type="button" class="ghost klein" data-ab="${s.aktion}">${knopf[s.aktion]}</button>` : ''}
    </li>`).join('')}</ol>
  </section>`;
}

function bindAbschluss(root) {
  $$('[data-ab]', root).forEach(b => b.onclick = () => {
    if (b.dataset.ab === 'import') setView('import');
    else if (b.dataset.ab === 'pruefen') setView('pruefen');
    else oeffneKontostaende(vermoegensReihe());
  });
}
