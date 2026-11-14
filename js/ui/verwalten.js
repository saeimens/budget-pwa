// Budget-App – Budgets, Jahresrechnungen-Plan und Import-Regeln in der App bearbeiten (Blätter Kategorien, Rückstellungen, Regeln).
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Bearbeiten: Budgets · Jahresrechnungen · Regeln ---------- */
const vw = { bereich: 'budgets', suche: '', mehr: false, ziel: null };
const REGEL_TYPEN = ['Ausgabe', 'Einnahme', 'Rückstellung', 'Sparen', 'Ignorieren'];
const RICHTUNGEN = [['beide', 'Beide'], ['Belastung', 'Nur Belastung'], ['Gutschrift', 'Nur Gutschrift']];

function oeffneVerwalten(bereich) { vw.bereich = bereich || vw.bereich; vw.mehr = false; setView('verwalten'); }

// Regeln aus den Rohzeilen, mit Zeilennummer im Blatt
const regelListe = () => (D.regelnRows || []).map((r, i) => ({ row: i + 2, r })).filter(x => x.r[0])
  .map(({ row, r }, pos) => ({ row, pos: pos + 1, suchbegriff: String(r[0]), richtung: String(r[1] || 'beide'), typ: String(r[2] || 'Ausgabe'),
    kategorie: String(r[3] || ''), faktor: r[4] === undefined ? '' : r[4], bis: r[5] === undefined ? '' : r[5], notiz: String(r[6] || '') }));
// in wie vielen bisherigen Bank-Texten kommt der Suchbegriff vor (alle Teile mit « + »)
function regelTreffer(suchbegriff) {
  const terms = String(suchbegriff).split(' + ').map(t => t.trim().toLowerCase()).filter(Boolean);
  if (!terms.length || !D) return 0;
  return (D.alle || D.buchungen).filter(b => { const t = String(b.banktext || '').toLowerCase(); return t && terms.every(x => t.includes(x)); }).length;
}

function renderVerwalten() {
  const el = $('#verwalten');
  if (!D) { el.innerHTML = '<div class="loading">Lade Daten …</div>'; return; }
  const knopf = (b, t) => `<button type="button" data-vw="${b}" class="${vw.bereich === b ? 'on' : ''}" aria-pressed="${vw.bereich === b}">${t}</button>`;
  let html = `<div class="seg2 tabs" role="group" aria-label="Bereich">${knopf('budgets', 'Budgets')}${knopf('rechnungen', 'Jahresrechnungen')}${knopf('regeln', 'Regeln')}${knopf('ziele', 'Ziele')}</div>
    ${navigator.onLine ? '' : '<div class="hinweis" style="margin:0 0 var(--s3)">Offline: Ansehen geht, Ändern erst wieder mit Internet.</div>'}`;

  if (vw.bereich === 'budgets') {
    const k = D.kategorien, gruppen = [...new Set(k.map(x => x.gruppe || 'Ohne Gruppe'))];
    const total = k.reduce((a, x) => a + x.budget, 0);
    html += `<p class="lead" style="margin-top:0">Monatsbudget pro Kategorie. Total <b class="num">${chf0(total)}</b> pro Monat, <b class="num">${chf0(total * 12)}</b> pro Jahr.</p>
      <button type="button" class="ghost" data-neu="kategorie" style="width:100%;margin-bottom:var(--s3)">${ico('plus', '', 18)} Neue Kategorie</button>
      <div class="card" style="padding-block:var(--s1)"><button type="button" class="plain cat rrow" id="vwReise" aria-label="Reisebudget pro Jahr ${RB_WERT() ? chf0(RB_WERT()) + ' Franken' : 'nicht festgelegt'}, bearbeiten">
        <span class="row"><span class="grow name">Reisebudget pro Jahr</span><span class="num ${RB_WERT() ? '' : 'muted'}">${RB_WERT() ? chf0(RB_WERT()) : '–'}</span>${ico('chev', 'chev', 18)}</span>
        <span class="small muted" style="display:block">Für grosse Reisen («Reise …»), zusätzlich zu «Reisen &amp; Ausflüge». Stand siehe Auswertung.</span></button></div>
      ${gruppen.map(g => `<h2 class="section">${esc(g)}</h2><div class="card" style="padding-block:var(--s1)">${k.filter(x => (x.gruppe || 'Ohne Gruppe') === g).map(x => `
        <button type="button" class="plain cat rrow" data-k="${esc(x.name)}" aria-label="${esc(x.name)}, Budget ${chf0(x.budget)} pro Monat, bearbeiten">
          <span class="row"><span class="grow name">${esc(x.name)}</span><span class="num ${x.budget ? '' : 'muted'}">${x.budget ? chf0(x.budget) : '–'}</span>${ico('chev', 'chev', 18)}</span>
          ${x.bemerkung ? `<span class="small muted" style="display:block">${esc(x.bemerkung)}</span>` : ''}</button>`).join('')}</div>`).join('')}`;
  } else if (vw.bereich === 'rechnungen') {
    const p = D.rueckstellungen || [], aktiv = p.filter(x => x.aktiv);
    html += `<p class="lead" style="margin-top:0">Plan für die Jahresrechnungen (Blatt «Rückstellungen»). Aktive Raten zusammen <b class="num">${chf0(aktiv.reduce((a, x) => a + x.rate, 0))}</b> pro Monat.</p>
      <button type="button" class="ghost" data-neu="posten" style="width:100%;margin-bottom:var(--s3)">${ico('plus', '', 18)} Neuer Posten</button>
      <div class="card" style="padding-block:var(--s1)">${p.map(x => `
        <button type="button" class="plain cat rrow" data-p="${x.row}" aria-label="${esc(x.posten)}, ${chf(x.rate)} pro Monat, ${x.aktiv ? 'aktiv' : 'inaktiv'}, bearbeiten">
          <span class="row"><span class="grow name ${x.aktiv ? '' : 'muted'}">${esc(x.posten)}</span><span class="num ${x.aktiv ? '' : 'muted'}">${chf(x.rate)}</span>${ico('chev', 'chev', 18)}</span>
          <span class="small muted" style="display:block">${esc(x.kategorie || 'ohne Kategorie')}${x.aktiv ? '' : ' · <span class="pill neutral">inaktiv</span>'}${x.bemerkung ? ' · ' + esc(x.bemerkung) : ''}</span></button>`).join('')
        || '<div class="empty muted">Noch keine Posten.</div>'}</div>`;
  } else if (vw.bereich === 'ziele') {
    const z = D.ziele || [];
    html += `<p class="lead" style="margin-top:0">Sparziele (Blatt «Ziele»). Der Fortschritt kommt aus einem Konto, einer Vermögensgruppe oder einer Kategorie. Anzeige im Reiter «Vermögen».</p>
      <button type="button" class="ghost" data-neu="ziel" style="width:100%;margin-bottom:var(--s3)">${ico('plus', '', 18)} Neues Ziel</button>
      <div class="card" style="padding-block:var(--s1)">${z.map(x => `
        <button type="button" class="plain cat rrow" data-z="${x.row}" aria-label="${esc(x.name)}, ${chf0(x.betrag)} Franken, bearbeiten">
          <span class="row"><span class="grow name">${esc(x.name)}</span><span class="num">${chf0(x.betrag)}</span>${ico('chev', 'chev', 18)}</span>
          <span class="small muted" style="display:block">${esc(x.quelle || 'Quelle fehlt')}${x.bis ? ' · bis ' + esc(x.bis) : ''}</span></button>`).join('')
        || '<div class="empty muted">Noch keine Ziele.</div>'}</div>`;
  } else {
    const alle = regelListe(), q = vw.suche.trim().toLowerCase();
    const treffer = q ? alle.filter(x => [x.suchbegriff, x.kategorie, x.notiz, x.typ].join(' ').toLowerCase().includes(q)) : alle;
    const zeigen = vw.mehr ? treffer : treffer.slice(0, 40);
    html += `<p class="lead" style="margin-top:0">Beim Import gilt die erste passende Regel von oben. Neue Regeln kommen zuoberst.</p>
      <button type="button" class="ghost" data-neu="regel" style="width:100%;margin-bottom:var(--s3)">${ico('plus', '', 18)} Neue Regel</button>
      <label class="field"><span>Regeln durchsuchen</span><input type="search" id="vwSuche" value="${esc(vw.suche)}" placeholder="z. B. Migros, Reise, Ignorieren …" autocomplete="off"></label>
      <div class="small muted" style="margin:var(--s2) var(--s1)" aria-live="polite">${treffer.length} von ${alle.length} Regeln</div>
      <div class="card" style="padding-block:var(--s1)">${zeigen.map(x => `
        <button type="button" class="plain cat rrow" data-rg="${x.row}" aria-label="Regel ${x.pos}: ${esc(x.suchbegriff)}, ${esc(x.typ)} ${esc(x.kategorie)}, bearbeiten">
          <span class="row"><span class="grow name">${esc(x.suchbegriff)}</span><span class="small muted num">#${x.pos}</span>${ico('chev', 'chev', 18)}</span>
          <span class="small muted" style="display:block">${x.richtung.toLowerCase() === 'beide' ? '' : esc(x.richtung) + ' · '}${x.typ === 'Ignorieren' ? '<span class="pill neutral">ignorieren</span>' : esc(x.typ) + (x.kategorie ? ' → ' + esc(x.kategorie) : '')}${x.faktor !== '' && x.faktor !== 1 ? ` · Faktor ${esc(x.faktor)}` : ''}${x.bis !== '' ? ` · bis ${esc(x.bis)}` : ''}${x.notiz ? ' · «' + esc(x.notiz) + '»' : ''}</span></button>`).join('')
        || '<div class="empty muted">Keine Regel gefunden.</div>'}
        ${treffer.length > zeigen.length ? `<button type="button" class="ghost klein" id="vwMehr" style="width:100%;margin:var(--s2) 0">Alle ${treffer.length} anzeigen</button>` : ''}</div>`;
  }
  el.innerHTML = html;

  $$('[data-vw]', el).forEach(b => b.onclick = () => { vw.bereich = b.dataset.vw; vw.mehr = false; renderVerwalten(); });
  $$('[data-neu]', el).forEach(b => b.onclick = () => oeffneVw(b.dataset.neu, null));
  $$('[data-k]', el).forEach(b => b.onclick = () => oeffneVw('kategorie', D.kategorien.find(x => x.name === b.dataset.k)));
  $$('[data-p]', el).forEach(b => b.onclick = () => oeffneVw('posten', D.rueckstellungen.find(x => x.row === +b.dataset.p)));
  $$('[data-rg]', el).forEach(b => b.onclick = () => oeffneVw('regel', regelListe().find(x => x.row === +b.dataset.rg)));
  $$('[data-z]', el).forEach(b => b.onclick = () => oeffneVw('ziel', (D.ziele || []).find(x => x.row === +b.dataset.z)));
  if ($('#vwSuche')) $('#vwSuche').oninput = e => {
    vw.suche = e.target.value; vw.mehr = false;
    const pos = e.target.selectionStart; renderVerwalten();
    const f = $('#vwSuche'); f.focus(); f.setSelectionRange(pos, pos);
  };
  if ($('#vwMehr')) $('#vwMehr').onclick = () => { vw.mehr = true; renderVerwalten(); };
  if ($('#vwReise')) $('#vwReise').onclick = () => { const row = (D.einstRow || {})[RB_NAME]; oeffneVw('reisebudget', row ? { row, wert: RB_WERT() } : null); };
}
const RB_NAME = 'Reisebudget pro Jahr';
const RB_WERT = () => Number((D.einst || {})[RB_NAME]) || 0;

/* Dialog */
const feld = (id, label, wert, extra = '') => `<label class="field"><span>${label}</span><input type="text" id="${id}" value="${esc(wert)}" autocomplete="off" ${extra}></label>`;
const liste = (id, werte) => `<datalist id="${id}">${[...new Set(werte.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
const alleKategorien = () => D.kategorien.map(k => k.name).concat((D.alle || D.buchungen).map(b => b.kategorie), (D.rueckstellungen || []).map(p => p.kategorie));
const zahlOderLeer = s => { const t = String(s).trim(); if (!t) return ''; const n = parseBetrag(t); return Number.isFinite(n) ? n : NaN; };

function oeffneVw(art, x) {
  vw.ziel = { art, x };
  const neu = !x;
  let titel, felder, loeschen = false;
  if (art === 'kategorie') {
    titel = neu ? 'Neue Kategorie' : x.name;
    felder = `${neu ? feld('vwName', 'Name', '') : `<div class="small muted">Umbenennen geht nur im Sheet, weil die Buchungen am Namen hängen.</div>`}
      <div class="grid2">${feld('vwGruppe', 'Gruppe', x ? x.gruppe : '', 'list="vwGruppen"')}${feld('vwBudget', 'Budget pro Monat (CHF)', x ? x.budget : '', 'inputmode="decimal"')}</div>
      ${liste('vwGruppen', D.kategorien.map(k => k.gruppe))}${feld('vwBem', 'Bemerkung (optional)', x ? x.bemerkung : '')}`;
  } else if (art === 'posten') {
    titel = neu ? 'Neuer Posten' : x.posten; loeschen = !neu;
    felder = `${feld('vwName', 'Posten', x ? x.posten : '')}
      ${feld('vwKat', 'Kategorie (wie in den Buchungen)', x ? x.kategorie : '', 'list="vwKats"')}${liste('vwKats', alleKategorien())}
      <div class="grid2">${feld('vwRate', 'Rate pro Monat (CHF)', x ? x.rate : '', 'inputmode="decimal"')}
        <label class="field"><span>Im Plan</span><select id="vwAktiv"><option value="ja" ${!x || x.aktiv ? 'selected' : ''}>aktiv</option><option value="nein" ${x && !x.aktiv ? 'selected' : ''}>inaktiv</option></select></label></div>
      ${feld('vwBem', 'Bemerkung (optional)', x ? x.bemerkung : '')}`;
  } else if (art === 'ziel') {
    titel = neu ? 'Neues Sparziel' : x.name; loeschen = !neu;
    const reihe = typeof vermoegensReihe === 'function' && (D.vermoegen || []).length ? vermoegensReihe() : [];
    const akt = reihe[reihe.length - 1];
    const quellen = [].concat(
      akt ? akt.konten.map(k => 'Konto: ' + k.konto) : [],
      [...new Set(akt ? akt.konten.map(k => k.gruppe) : [])].map(g => 'Gruppe: ' + g),
      [...new Set((D.alle || D.buchungen).filter(b => b.typ === 'Sparen').map(b => b.kategorie))].filter(Boolean).map(k => 'Kategorie: ' + k),
      D.kategorien.map(k => 'Kategorie: ' + k.name));
    const sel = x ? x.quelle : quellen[0];
    if (sel && !quellen.includes(sel)) quellen.unshift(sel);
    felder = `${feld('vwName', 'Ziel', x ? x.name : '', 'placeholder="z. B. Reserve Lohnkonto, 3. Säule 2027"')}
      <div class="grid2">${feld('vwBetrag', 'Betrag (CHF)', x ? x.betrag : '', 'inputmode="decimal"')}
        <label class="field"><span>Bis (optional)</span><input type="month" id="vwZBis" value="${esc(x && x.bis ? x.bis.slice(0, 7) : '')}"></label></div>
      <label class="field"><span>Fortschritt aus</span><select id="vwQuelle">${[...new Set(quellen)].map(q => `<option ${q === sel ? 'selected' : ''}>${esc(q)}</option>`).join('')}</select></label>
      <label class="field" id="vwSeitFeld"><span>Seit (bei Kategorie: ab diesem Datum zählen)</span><input type="date" id="vwSeit" value="${esc(x && x.seit ? x.seit : isoLocal(new Date(CUR_Y, 0, 1)))}"></label>
      ${feld('vwBem', 'Bemerkung (optional)', x ? x.bemerkung : '')}`;
  } else if (art === 'reisebudget') {
    titel = 'Reisebudget pro Jahr';
    felder = `${feld('vwRb', 'Betrag pro Jahr (CHF)', x ? x.wert : '', 'inputmode="decimal" aria-describedby="vwRbHilfe"')}
      <div class="small muted" id="vwRbHilfe">Rahmen für grosse Reisen (Kategorien «Reise …»). 0 oder leer blendet die Anzeige aus.</div>`;
  } else {
    titel = neu ? 'Neue Regel' : `Regel ${x.pos}`; loeschen = !neu;
    const typ = x ? x.typ : 'Ausgabe', ri = x ? x.richtung.toLowerCase() : 'beide';
    felder = `${feld('vwSb', 'Suchbegriff im Bank-Text', x ? x.suchbegriff : '', 'aria-describedby="vwSbHilfe"')}
      <div class="small muted" id="vwSbHilfe">Gross-/Kleinschreibung egal. Mehrere Begriffe mit « + » verbinden, dann müssen alle vorkommen. <span id="vwTreffer"></span></div>
      <div class="grid2"><label class="field"><span>Richtung</span><select id="vwRi">${RICHTUNGEN.map(([v, l]) => `<option value="${v}" ${v.toLowerCase() === ri ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Typ</span><select id="vwTyp">${REGEL_TYPEN.map(t => `<option ${t === typ ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      ${feld('vwKat', 'Kategorie', x ? x.kategorie : '', 'list="vwKats"')}${liste('vwKats', alleKategorien())}
      <div class="grid2">${feld('vwFaktor', 'Faktor (optional)', x && x.faktor !== '' ? x.faktor : '', 'inputmode="decimal" placeholder="1"')}
        ${feld('vwBis', 'Nur bis Betrag (optional)', x ? x.bis : '', 'inputmode="decimal"')}</div>
      ${feld('vwNotiz', 'Notiz für die Buchung', x ? x.notiz : '')}`;
  }
  $('#vwTitel').textContent = titel;
  $('#vwFelder').innerHTML = felder;
  $('#vwDel').hidden = !loeschen;
  $$('#vwForm button').forEach(b => b.disabled = false);
  if ($('#vwSb')) { const zeig = () => { const n = regelTreffer($('#vwSb').value); $('#vwTreffer').textContent = $('#vwSb').value.trim() ? `Kommt in ${n} bisherigen Bank-Texten vor.` : ''; };
    $('#vwSb').oninput = zeig; zeig(); }
  if ($('#vwTyp')) { const k = () => { $('#vwKat').disabled = $('#vwTyp').value === 'Ignorieren'; }; $('#vwTyp').onchange = k; k(); }
  if ($('#vwQuelle')) { const s = () => { $('#vwSeitFeld').hidden = !/^Kategorie:/.test($('#vwQuelle').value); }; $('#vwQuelle').onchange = s; s(); }
  $('#vwdlg').showModal();
  const erst = $('#vwFelder input:not([disabled])'); if (erst && neu) erst.focus();
}

async function vwSpeichern(e) {
  e.preventDefault();
  const { art, x } = vw.ziel, neu = !x;
  const v = id => ($('#' + id) ? $('#' + id).value.trim() : '');
  let blatt, werte, row = x ? x.row : 0, erwartet = '';
  if (art === 'kategorie') {
    const name = neu ? v('vwName') : x.name, budget = zahlOderLeer(v('vwBudget'));
    if (!name) { markInvalid($('#vwName')); return toast('Bitte einen Namen eingeben'); }
    if (neu && D.kategorien.some(k => k.name.toLowerCase() === name.toLowerCase())) { markInvalid($('#vwName')); return toast('Diese Kategorie gibt es schon'); }
    if (Number.isNaN(budget) || budget < 0) { markInvalid($('#vwBudget')); return toast('Bitte ein gültiges Budget eingeben (oder leer lassen)'); }
    blatt = 'Kategorien'; werte = [name, v('vwGruppe'), budget === '' ? 0 : budget, v('vwBem')]; erwartet = neu ? '' : x.name;
    if (neu) { const g = D.kategorien.filter(k => k.gruppe === v('vwGruppe')); row = Math.max(1, ...(g.length ? g : D.kategorien).map(k => k.row)); }
  } else if (art === 'posten') {
    const rate = zahlOderLeer(v('vwRate'));
    if (!v('vwName')) { markInvalid($('#vwName')); return toast('Bitte den Posten benennen'); }
    if (rate === '' || Number.isNaN(rate) || rate < 0) { markInvalid($('#vwRate')); return toast('Bitte eine gültige Rate pro Monat eingeben'); }
    blatt = 'Rückstellungen'; werte = [v('vwName'), v('vwKat'), rate, v('vwAktiv'), v('vwBem')]; erwartet = neu ? '' : x.posten;
    if (neu) row = Math.max(1, ...(D.rueckstellungen || []).map(p => p.row));
  } else if (art === 'ziel') {
    const betrag = zahlOderLeer(v('vwBetrag'));
    if (!v('vwName')) { markInvalid($('#vwName')); return toast('Bitte das Ziel benennen'); }
    if (betrag === '' || Number.isNaN(betrag) || betrag <= 0) { markInvalid($('#vwBetrag')); return toast('Bitte einen Zielbetrag eingeben'); }
    const kat = /^Kategorie:/.test(v('vwQuelle'));
    blatt = 'Ziele'; werte = [v('vwName'), betrag, v('vwZBis'), v('vwQuelle'), kat ? v('vwSeit') : '', v('vwBem')]; erwartet = neu ? '' : x.name;
    if (neu) row = Math.max(1, ...(D.ziele || []).map(z => z.row));
  } else if (art === 'reisebudget') {
    const n = zahlOderLeer(v('vwRb'));
    if (Number.isNaN(n) || n < 0) { markInvalid($('#vwRb')); return toast('Bitte einen gültigen Betrag eingeben'); }
    blatt = 'Einstellungen'; werte = [RB_NAME, n === '' ? 0 : n]; erwartet = neu ? '' : RB_NAME;
    if (neu) row = Math.max(1, ...Object.values(D.einstRow || {}));
  } else {
    const faktor = zahlOderLeer(v('vwFaktor')), bis = zahlOderLeer(v('vwBis')), typ = v('vwTyp');
    if (!v('vwSb')) { markInvalid($('#vwSb')); return toast('Bitte einen Suchbegriff eingeben'); }
    if (typ === 'Ausgabe' && !v('vwKat')) { markInvalid($('#vwKat')); return toast('Für Ausgaben braucht die Regel eine Kategorie'); }
    if (Number.isNaN(faktor)) { markInvalid($('#vwFaktor')); return toast('Faktor ist keine Zahl (z. B. 0.2)'); }
    if (Number.isNaN(bis)) { markInvalid($('#vwBis')); return toast('«Nur bis Betrag» ist keine Zahl'); }
    blatt = 'Regeln'; werte = [v('vwSb'), v('vwRi'), typ, typ === 'Ignorieren' ? '' : v('vwKat'), faktor, bis, v('vwNotiz')]; erwartet = neu ? '' : x.suchbegriff;
  }
  await vwAusfuehren(blatt, neu ? 'neu' : 'setzen', row, werte, erwartet, neu ? 'Angelegt' : 'Gespeichert');
}
async function vwAusfuehren(blatt, aktion, row, werte, erwartet, meldung) {
  $$('#vwForm button').forEach(b => b.disabled = true);
  try {
    await call('blattAendern', blatt, aktion, row, werte, erwartet);
    $('#vwdlg').close();
    anzeigen(Daten.getDataSync(D.jahr));
    renderVerwalten();
    if (meldung) toast(meldung);
    return true;
  } catch (e) {
    fehler('Speichern', e);
    $$('#vwForm button').forEach(b => b.disabled = false);
    if (/geändert/.test(e.message)) { anzeigen(Daten.getDataSync(D.jahr)); renderVerwalten(); }
    return false;
  }
}
$('#vwForm').onsubmit = vwSpeichern;
$('#vwDel').onclick = async () => {
  const { art, x } = vw.ziel; if (!x) return;
  const blatt = { posten: 'Rückstellungen', ziel: 'Ziele' }[art] || 'Regeln';
  const erwartet = art === 'posten' ? x.posten : art === 'ziel' ? x.name : x.suchbegriff;
  const alt = art === 'posten' ? [x.posten, x.kategorie, x.rate, x.aktiv ? 'ja' : 'nein', x.bemerkung]
    : art === 'ziel' ? [x.name, x.betrag, x.bis, x.quelle, x.seit, x.bemerkung]
    : [x.suchbegriff, x.richtung, x.typ, x.kategorie, x.faktor, x.bis, x.notiz];
  if (!await vwAusfuehren(blatt, 'loeschen', x.row, [], erwartet)) return;
  // Rückgängig statt Rückfrage: Zeile an derselben Stelle wieder einfügen
  toast(`«${erwartet}» gelöscht`, { action: 'Rückgängig', onAction: () => vwAusfuehren(blatt, 'neu', x.row - 1, alt, '', 'Wiederhergestellt') });
};
$('#vwClose').onclick = () => $('#vwdlg').close();
$('#vwdlg').addEventListener('click', e => { if (e.target === $('#vwdlg')) $('#vwdlg').close(); });

/* ---------- «+ Neue Reise …» in jeder Kategorien-Auswahl ---------- */
let reiseZiel = null;   // die Auswahl, in der «Neue Reise» gewählt wurde
const reiseName = () => {
  const ort = $('#rOrt').value.trim().replace(/\s+/g, ' '), mon = $('#rMonat').value, jahr = $('#rJahr').value.trim();
  return ort ? `Reise ${ort}${mon ? ' ' + mon : ''}${jahr ? ' ' + jahr : ''}` : '';
};
const reiseVorschau = () => { $('#rVorschau').textContent = reiseName() ? `«${reiseName()}»` : '…'; };
document.addEventListener('focusin', e => { if (e.target.tagName === 'SELECT') e.target.dataset.vorher = e.target.value; });
document.addEventListener('change', e => {
  const s = e.target;
  if (s.tagName !== 'SELECT' || s.value !== NEUE_REISE) return;
  reiseZiel = s; s.value = s.dataset.vorher && s.dataset.vorher !== NEUE_REISE ? s.dataset.vorher : '';
  $('#rOrt').value = ''; $('#rJahr').value = String(CUR_Y);
  $('#rMonat').innerHTML = '<option value="">ohne Monat</option>' + MONATE.map((m, i) => `<option value="${m}" ${i + 1 === CUR_M ? 'selected' : ''}>${MONATE_LANG[i]}</option>`).join('');
  $$('#reiseForm button').forEach(b => b.disabled = false);
  reiseVorschau();
  $('#reisedlg').showModal(); $('#rOrt').focus();
});
['#rOrt', '#rJahr'].forEach(id => $(id).addEventListener('input', reiseVorschau));
$('#rMonat').addEventListener('change', reiseVorschau);
$('#reiseClose').onclick = () => $('#reisedlg').close();
$('#reisedlg').addEventListener('click', e => { if (e.target === $('#reisedlg')) $('#reisedlg').close(); });
$('#reiseForm').onsubmit = async e => {
  e.preventDefault();
  const name = reiseName(), jahr = $('#rJahr').value.trim();
  if (!$('#rOrt').value.trim()) { markInvalid($('#rOrt')); return toast('Bitte den Ort eingeben'); }
  if (jahr && !/^20\d\d$/.test(jahr)) { markInvalid($('#rJahr')); return toast('Bitte ein Jahr wie 2027 eingeben'); }
  if (D.kategorien.some(k => k.name.toLowerCase() === name.toLowerCase())) { markInvalid($('#rOrt')); return toast('Diese Reise gibt es schon'); }
  const reisen = D.kategorien.filter(k => k.gruppe === 'Reisen');
  const row = Math.max(1, ...(reisen.length ? reisen : D.kategorien).map(k => k.row));
  $$('#reiseForm button').forEach(b => b.disabled = true);
  try {
    await call('blattAendern', 'Kategorien', 'neu', row, [name, 'Reisen', 0, ''], '');
    $('#reisedlg').close();
    anzeigen(Daten.getDataSync(D.jahr));
    if (reiseZiel) {
      const leer = reiseZiel.options[0] ? reiseZiel.options[0].text : undefined;
      reiseZiel.innerHTML = katOpts(name, leer, { neueReise: true });
      reiseZiel.value = name; reiseZiel.dispatchEvent(new Event('change', { bubbles: true })); reiseZiel.focus();
    }
    toast(`«${name}» angelegt`);
  } catch (err) { fehler('Anlegen', err); $$('#reiseForm button').forEach(b => b.disabled = false); }
};
