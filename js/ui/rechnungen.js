// Budget-App – Jahresrechnungen: Plan vs. bezahlt mit Ampel.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Jahresrechnungen: Plan vs. bezahlt ---------- */
const STATUS = {
  rot:      { t:'Über Plan', i:'✕', rang:0 },
  gelb:     { t:'Vorbezogen', i:'!', rang:1 },
  gruen:    { t:'Im Plan', i:'✓', rang:2 },
  erledigt: { t:'Bezahlt', i:'✓', rang:3 }
};
function renderRueck() {
  const plan = D.rueckstellungen || [];
  if (!plan.length) {
    $('#uebersicht').innerHTML = `<div class="card empty" style="margin-top:var(--s3)"><b>Noch kein Plan für Jahresrechnungen</b>
      <span class="small muted">Lege im Google Sheet ein Blatt «Rückstellungen» an: Posten, Kategorie (wie in den Buchungen), Rate pro Monat, Aktiv (ja/nein).</span></div>`;
    return;
  }
  const jahr = D.jahr, laufend = jahr === CUR_Y;
  const mon = jahr < CUR_Y ? 12 : laufend ? CUR_M : 0;
  const rueck = D.buchungen.filter(b => b.typ === 'Rückstellung');
  const bez = {}; rueck.forEach(b => bez[b.kategorie] = (bez[b.kategorie] || 0) + b.betrag);

  const posten = plan.filter(p => p.aktiv && p.kategorie && p.rate > 0).map(p => {
    const jahrPlan = p.rate * 12, soll = p.rate * mon, ist = bez[p.kategorie] || 0;
    let st = 'gruen';
    if (ist > jahrPlan * 1.05) st = 'rot';
    else if (ist >= jahrPlan * 0.95) st = 'erledigt';
    else if (ist > soll * 1.1 && ist > 0) st = 'gelb';
    return Object.assign({}, p, { jahrPlan, soll, ist, st, offen: Math.max(0, jahrPlan - ist) });
  }).sort((a, b) => STATUS[a.st].rang - STATUS[b.st].rang || b.offen - a.offen);

  const geplant = new Set(posten.map(p => p.kategorie));
  const ohnePlan = Object.keys(bez).filter(k => !geplant.has(k) && Math.round(bez[k])).map(k => ({ kategorie: k, ist: bez[k] }));

  const sum = (l, f) => l.reduce((x, p) => x + p[f], 0);
  const sPlan = sum(posten, 'jahrPlan'), sIst = sum(posten, 'ist'), sOffen = sum(posten, 'offen'), sRate = sum(posten, 'rate');
  const ueber = posten.filter(p => p.st === 'rot').reduce((x, p) => x + p.ist - p.jahrPlan, 0);
  const gesamt = ueber > sPlan * 0.1 ? 'rot' : ueber > 0 ? 'gelb' : 'gruen';
  const gesamtText = { gruen:'Alle Posten im Plan', gelb:'Einzelne Posten über Plan', rot:'Deutlich über Plan' }[gesamt];

  const hero = laufend
    ? `<div class="card hero"><div class="label">Noch erwartet bis Ende ${jahr}</div>
        <div class="value num">${chf0(sOffen)} <span class="cur">CHF</span></div>
        <div class="status ${gesamt}"><span aria-hidden="true">${STATUS[gesamt === 'gelb' ? 'gelb' : gesamt].i}</span>${gesamtText}</div>
        <div class="small muted" style="margin-top:var(--s1)">Bezahlt ${chf0(sIst)} von geplant ${chf0(sPlan)} · Plan: ${chf0(sRate)} pro Monat zurücklegen</div></div>`
    : `<div class="card hero"><div class="label">Jahresrechnungen ${jahr}</div>
        <div class="value num">${chf0(sIst + sum(ohnePlan, 'ist'))} <span class="cur">CHF</span></div>
        <div class="small muted">Geplant waren ${chf0(sPlan)} (heutige Raten × 12)${ohnePlan.length ? ` · davon ${chf0(sum(ohnePlan, 'ist'))} ohne Plan` : ''}</div></div>`;

  const zeile = p => {
    const s = STATUS[p.st], max = Math.max(p.jahrPlan, p.ist, 1);
    const offen = offenR === p.kategorie;
    const liste = offen ? rueck.filter(b => b.kategorie === p.kategorie).sort((a, b) => b.datum.localeCompare(a.datum)) : [];
    return `<div class="rrow-wrap"><button type="button" class="plain cat rrow" data-r="${esc(p.kategorie)}" aria-expanded="${offen}">
        <span class="row"><span class="grow name">${esc(p.posten)}</span>
          <span class="pill ${{ rot:'bad', gelb:'warn', gruen:'ok', erledigt:'neutral' }[p.st]}"><span aria-hidden="true">${s.i}</span> ${s.t}</span>${ico('chev', 'chev', 18)}</span>
        <span class="meter ${p.st}" style="display:block" role="img" aria-label="Bezahlt ${chf0(p.ist)} von ${chf0(p.jahrPlan)} CHF${laufend ? `, Plan bis heute ${chf0(p.soll)}` : ''}">
          <span class="fill" style="width:${Math.min(100, p.ist / max * 100)}%"></span>
          ${laufend ? `<span class="soll" style="left:${p.soll / max * 100}%"></span>` : ''}</span>
        <span class="row small"><span class="grow muted">Bezahlt <b class="num" style="color:var(--ink)">${chf0(p.ist)}</b> von ${chf0(p.jahrPlan)}</span>
          <span class="muted num">${p.st === 'rot' ? `${chf0(p.ist - p.jahrPlan)} über Plan` : p.offen ? `noch ${chf0(p.offen)}` : 'erledigt'}</span></span>
      </button>${offen ? `<div class="cat-detail">${txList(liste)}${p.bemerkung ? `<div class="small muted" style="padding-bottom:var(--s2)">${esc(p.bemerkung)}</div>` : ''}</div>` : ''}</div>`;
  };

  $('#uebersicht').innerHTML = `<div style="margin-top:var(--s3)">${hero}</div>
    <h2 class="section">Posten · antippen für Zahlungen</h2>
    ${laufend ? `<div class="small muted" style="margin:-4px 0 var(--s2)">Der senkrechte Strich zeigt, wie viel bis heute (${MONATE_LANG[CUR_M - 1]}) geplant war.</div>` : ''}
    <div class="card" style="padding-block:var(--s1)">${posten.map(zeile).join('')}</div>
    ${ohnePlan.length ? `<h2 class="section">Ohne Plan bezahlt</h2><div class="card" style="padding-block:var(--s1)">${ohnePlan.map(o => `
      <div class="rrow row"><span class="grow">${esc(o.kategorie)}</span><span class="num">${chf0(o.ist)}</span></div>`).join('')}</div>
      <div class="small muted" style="margin-top:var(--s2)">Für diese Kategorien gibt es im Blatt «Rückstellungen» keinen aktiven Posten.</div>` : ''}
    <button type="button" class="ghost klein" id="zuPlan" style="margin-top:var(--s3)">Plan bearbeiten</button>`;

  $('#zuPlan').onclick = () => oeffneVerwalten('rechnungen');
  $$('#uebersicht [data-r]').forEach(b => b.onclick = () => { offenR = offenR === b.dataset.r ? null : b.dataset.r; renderRueck(); });
  bindTx($('#uebersicht'));
}
