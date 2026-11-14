// Budget-App – Reiter, Monate, Budget-Übersicht, Kategorien, Buchungslisten.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Übersicht ---------- */
function renderMonate() {
  $('#monate').hidden = ansicht !== 'budget';
  if (ansicht !== 'budget') return;
  const btns = [    `<button type="button" data-m="0" class="${monat === 0 ? 'on' : ''}" aria-pressed="${monat === 0}">Ganzes Jahr</button>`]
    .concat(MONATE.map((m, i) => `<button type="button" data-m="${i + 1}" class="${monat === i + 1 ? 'on' : ''}" aria-pressed="${monat === i + 1}" aria-label="${MONATE_LANG[i]}">${m}</button>`));
  $('#monate').innerHTML = btns.join('');
  $$('#monate button').forEach(b => b.onclick = () => waehleMonat(+b.dataset.m));
  const on = $('#monate .on'); if (on) on.scrollIntoView({ inline:'center', block:'nearest' });
}
function waehleMonat(m) { monat = m; offeneKat = null; alleNeuesten = false; renderTitle(); renderMonate(); renderUebersicht(); }
let alleNeuesten = false;   // «Neueste Buchungen» aufgeklappt

/* Ansicht (Reiter): Budget · Vergleich · Auswertung · Rechnungen · Vermögen · Steuern */
let ansicht = 'budget';
function setAnsicht(a) {
  ansicht = a; offeneKat = null; offenR = null; offenAw = null;
  renderTabs(); jahrSichtbar(); renderTitle(); renderMonate(); renderUebersicht();
  window.scrollTo(0, 0);
}
function renderTabs() {
  // nur der aktive Reiter ist per Tab erreichbar, die anderen mit den Pfeiltasten (ARIA-Muster «Tabs»)
  $$('#tabs [data-a]').forEach(b => { const on = b.dataset.a === ansicht; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  const on = $('#tabs .on'); if (on) on.scrollIntoView({ inline:'nearest', block:'nearest' });
  const t = $('#tabs'); t.classList.toggle('mehr', t.scrollWidth > t.clientWidth + 2 && t.scrollLeft + t.clientWidth < t.scrollWidth - 2);
}
$('#tabs').addEventListener('scroll', () => { const t = $('#tabs'); t.classList.toggle('mehr', t.scrollLeft + t.clientWidth < t.scrollWidth - 2); });
function jahrSichtbar() { $('#jahr').hidden = view !== 'uebersicht' || ansicht === 'vergleich' || ansicht === 'vermoegen'; }
let offenSt = null;   // aufgeklappte Steuer-Kategorie
$$('#tabs [data-a]').forEach(b => b.onclick = () => setAnsicht(b.dataset.a));
$('#tabs').addEventListener('keydown', e => {
  const tabs = $$('#tabs [data-a]'), i = tabs.findIndex(b => b.dataset.a === ansicht);
  const ziel = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (ziel === undefined) return;
  e.preventDefault();
  const t = tabs[(ziel + tabs.length) % tabs.length];
  setAnsicht(t.dataset.a); t.focus();
});
let offenR = null;   // aufgeklappter Posten bei den Jahresrechnungen

function renderUebersicht() {
  if (ansicht === 'vergleich') return renderVergleich();
  if (ansicht === 'rechnungen') return renderRueck();
  if (ansicht === 'vermoegen') return renderVermoegen();
  if (ansicht === 'steuern') return renderSteuern();
  if (ansicht === 'auswertung') return renderAuswertung();
  const imZ = D.buchungen.filter(b => monat === 0 || b.monat === monat);
  const nachTyp = t => imZ.filter(b => b.typ === t);
  AUS = nachTyp('Ausgabe');
  const ein = nachTyp('Einnahme'), rue = nachTyp('Rückstellung'), spa = nachTyp('Sparen');
  const sAus = sum(AUS), sEin = sum(ein), sRue = sum(rue), sSpa = sum(spa);
  const saldo = sEin - sAus - sRue;   // Sparen ist Vermögen, kein Verbrauch – steht separat
  const anzMonate = monat === 0 ? Math.max(1, ...D.buchungen.map(b => b.monat)) : 1;
  const budget = D.kategorien.reduce((a, k) => a + k.budget, 0) * anzMonate;
  const rest = budget - sAus;

  // Hauptzahl: Was bleibt vom Budget?
  let hero;
  if (budget > 0) {
    const pct = Math.max(0, Math.min(100, sAus / budget * 100));
    const zustand = sAus > budget ? 'over' : sAus >= budget * .85 ? 'warn' : '';
    let proTag = '';
    if (D.jahr === CUR_Y && monat === CUR_M && rest > 0) {
      const tage = new Date(CUR_Y, CUR_M, 0).getDate() - HEUTE.getDate() + 1;
      proTag = ` · <b>${chf0(rest / tage)}</b> pro Tag für die restlichen ${tage} Tage`;
    }
    hero = `<div class="card hero">
      <div class="label">${rest >= 0 ? 'Noch verfügbar' : 'Über Budget'}${monat === 0 ? ` (Budget bis ${MONATE_LANG[anzMonate - 1]})` : ''}</div>
      <div class="value num ${rest < 0 ? 'neg' : ''}">${chf0(Math.abs(rest))} <span class="cur">CHF</span></div>
      <div class="bar big ${zustand}"><div style="width:${pct}%"></div></div>
      <div class="small muted">${chf0(sAus)} von ${chf0(budget)} ausgegeben${proTag}</div></div>`;
  } else {
    hero = `<div class="card hero"><div class="label">Laufende Ausgaben</div>
      <div class="value num">${chf0(sAus)} <span class="cur">CHF</span></div>
      <div class="small muted">Im Blatt «Kategorien» ist noch kein Monatsbudget hinterlegt.</div></div>`;
  }

  const stat = (label, wert, cls = '') => `<div class="card stat"><div class="label">${label}</div><div class="value num ${cls}">${wert}</div></div>`;
  const stats = `<div class="stats">
    ${stat('Einnahmen', chf0(sEin))}
    <button type="button" class="plain card stat" id="zuRueck" aria-label="Jahresrechnungen ${chf0(sRue)} CHF – Plan anzeigen">
      <span class="label" style="display:flex;justify-content:space-between">Jahresrechnungen ${ico('chev', 'chev', 16)}</span>
      <span class="value num" style="display:block">${chf0(sRue)}</span></button>
    ${stat('Gespart', chf0(sSpa))}
    ${stat('Saldo <span class="small">(ohne Sparen)</span>', chf0(saldo), saldo < 0 ? 'neg' : 'pos')}</div>`;

  // Monatsverlauf (nur Jahresansicht)
  let chart = '';
  if (monat === 0) {
    const proMonat = MONATE.map((_, i) => sum(D.buchungen.filter(b => b.typ === 'Ausgabe' && b.monat === i + 1)));
    const max = Math.max(...proMonat, 1);
    chart = `<h2 class="section">Laufende Ausgaben pro Monat</h2><div class="card"><div class="chart">${proMonat.map((v, i) =>
      `<button type="button" class="plain c ${D.jahr === CUR_Y && i + 1 === CUR_M ? 'on' : ''}" data-m="${i + 1}"
         title="${MONATE_LANG[i]}: ${chf0(v)} CHF" aria-label="${MONATE_LANG[i]}: ${chf0(v)} CHF">
         <span class="b" style="height:${Math.max(2, v / max * 85)}px"></span><span>${MONATE[i]}</span></button>`).join('')}</div></div>`;
  }

  // Kategorien: Ist vs. Budget
  const perKat = {};
  AUS.forEach(b => { const k = b.kategorie || '(ohne)'; perKat[k] = (perKat[k] || 0) + b.betrag; });
  const fluss = geldflussHtml(AUS, rue, spa, monat === 0 ? `im Jahr ${D.jahr}` : `im ${MONATE_LANG[monat - 1]}`);

  // alle Reisen («Reise …») als eine Zeile, aufklappbar
  const reiseKats = Object.keys(perKat).filter(IST_REISE);
  KATS = D.kategorien.filter(k => !IST_REISE(k.name)).map(k => ({ name:k.name, ist:perKat[k.name] || 0, budget:k.budget * anzMonate }))
    .concat(Object.keys(perKat).filter(n => !IST_REISE(n) && !D.kategorien.some(k => k.name === n)).map(n => ({ name:n, ist:perKat[n], budget:0 })))
    .concat(reiseKats.length ? [{ name:ALLE_REISEN, label:'Grosse Reisen', reisen:reiseKats.map(n => ({ n, s:perKat[n] })).sort((a, b) => b.s - a.s),
      ist:reiseKats.reduce((a, n) => a + perKat[n], 0), budget:0 }] : [])
    .filter(k => k.ist !== 0 || k.budget > 0)
    .sort((a, b) => b.ist - a.ist);

  // Neueste Buchungen des Zeitraums (alle Typen): was zuletzt passiert ist, ohne Umweg über die Suche
  const neueste = imZ.slice().sort((a, b) => b.datum.localeCompare(a.datum) || b.row - a.row);
  const zeitraum = monat === 0 ? `im Jahr ${D.jahr}` : `im ${MONATE_LANG[monat - 1]}`;
  const neu = neueste.length ? `<h2 class="section">Neueste Buchungen</h2>
    <div class="card" style="padding-block:var(--s1)">${txList(alleNeuesten ? neueste : neueste.slice(0, 5))}
      ${neueste.length > 5 ? `<button type="button" class="ghost klein" id="neuMehr" style="width:100%;margin:var(--s2) 0" aria-expanded="${alleNeuesten}">
        ${alleNeuesten ? 'Weniger anzeigen' : `Alle ${neueste.length} Buchungen ${zeitraum} anzeigen`}</button>` : ''}</div>` : '';

  $('#uebersicht').innerHTML = `${abschlussKarte()}${hero}${stats}${demnaechstHtml()}${fluss}${neu}${chart}
    <h2 class="section">Kategorien <span style="font-weight:400">· antippen für Details</span></h2>
    <div class="card" style="padding-block:var(--s1)" id="kats"></div>
    <button type="button" class="ghost klein" id="zuBudgets" style="margin-top:var(--s2)">Budgets bearbeiten</button>
    ${rue.length ? `<h2 class="section">Jahresrechnungen</h2><div class="card" style="padding-block:var(--s1)">${txList(rue)}</div>` : ''}
    ${ein.length ? `<details style="margin-top:var(--s3)"><summary>Einnahmen anzeigen (${ein.length})</summary>
       <div class="card" style="padding-block:var(--s1)">${txList(ein)}</div></details>` : ''}`;
  renderKats();
  bindTx($('#uebersicht'));
  bindAbschluss($('#uebersicht'));
  bindDemnaechst($('#uebersicht'));
  $('#zuRueck').onclick = () => setAnsicht('rechnungen');
  $('#zuBudgets').onclick = () => oeffneVerwalten('budgets');
  if ($('#neuMehr')) $('#neuMehr').onclick = () => { alleNeuesten = !alleNeuesten; renderUebersicht(); if (!alleNeuesten) $('#neuMehr').scrollIntoView({ block:'nearest' }); };
  $$('.chart .c').forEach(el => el.onclick = () => waehleMonat(+el.dataset.m));
  $$('#uebersicht [data-gf]').forEach(b => b.onclick = () => { offeneGruppe = offeneGruppe === b.dataset.gf ? null : b.dataset.gf; renderUebersicht(); });
}

/* «Wohin das Geld geht»: dünner segmentierter Balken (Teile in fester Farbreihenfolge) + Liste mit Beträgen.
   Farbe folgt der Gruppe, nie dem Rang; kleine Gruppen landen unter «Übrige». */
const SERIE = { Wohnen:1, Alltag:2, Freizeit:3, Reisen:4, Jahresrechnungen:5, Sparen:6, Abos:7, Gesundheit:8 };
let offeneGruppe = null;
function geldflussHtml(aus, rue, spa, zeitraum) {
  const gruppeVon = {}; D.kategorien.forEach(k => gruppeVon[k.name] = k.gruppe);
  const g = {};
  const dazu = (gruppe, b) => {
    const n = SERIE[gruppe] ? gruppe : 'Übrige', k = b.kategorie || '(ohne Kategorie)';
    const e = g[n] = g[n] || { s: 0, k: {} }; e.s += b.betrag; e.k[k] = (e.k[k] || 0) + b.betrag;
  };
  aus.forEach(b => dazu(IST_REISE(b.kategorie) ? 'Reisen' : gruppeVon[b.kategorie] || 'Übrige', b));
  rue.forEach(b => dazu('Jahresrechnungen', b));
  spa.forEach(b => dazu('Sparen', b));
  const teile = Object.entries(g).filter(([, e]) => e.s >= 0.5).map(([n, e]) => ({ n, s: e.s, k: e.k, slot: SERIE[n] || 0 }));
  const total = teile.reduce((a, t) => a + t.s, 0);
  if (!teile.length || total <= 0) return '';
  const pct = s => { const p = s / total * 100; return p > 0 && p < 1 ? '<1' : String(Math.round(p)); };
  const farbe = t => `var(--serie-${t.slot})`;
  const balken = teile.slice().sort((a, b) => (a.slot || 99) - (b.slot || 99));
  const liste = teile.slice().sort((a, b) => b.s - a.s);
  return `<h2 class="section">Wohin das Geld geht · ${esc(zeitraum)}</h2><div class="card">
    <div class="segbar" role="img" aria-label="Aufteilung ${esc(zeitraum)}: ${balken.map(t => `${t.n} ${chf0(t.s)} Franken, ${pct(t.s).replace('<', 'unter ')} Prozent`).join('; ')}">
      ${balken.map(t => `<span style="flex:${t.s.toFixed(2)} 1 0;background:${farbe(t)}" title="${esc(t.n)}: ${chf0(t.s)} CHF · ${pct(t.s)} %"></span>`).join('')}</div>
    ${liste.map(t => {
      const offen = offeneGruppe === t.n;
      const kats = Object.entries(t.k).filter(([, v]) => Math.abs(v) >= 0.5).sort((a, b) => b[1] - a[1]);
      return `<div class="rrow-wrap"><button type="button" class="plain cat rrow gfrow" data-gf="${esc(t.n)}" aria-expanded="${offen}">
          <span class="row"><i class="sw" style="background:${farbe(t)}" aria-hidden="true"></i><span class="grow name">${esc(t.n)}</span>
            <span class="muted num small gfpct">${esc(pct(t.s))} %</span><span class="num gfbetrag">${chf0(t.s)}</span>${ico('chev', 'chev', 18)}</span></button>
        ${offen ? `<div class="cat-detail small">${kats.map(([k, v]) => `<div class="row" style="padding:2px 0"><span class="grow">${esc(IST_REISE(k) ? k.replace(/^Reise\s+/, 'Reise: ') : k)}</span><span class="num">${chf(v)}</span></div>`).join('')}</div>` : ''}</div>`;
    }).join('')}
    <div class="small muted" style="margin-top:var(--s2)">Ausgaben, Jahresrechnungen und Sparen zusammen: <b class="num">${chf0(total)}</b>. Antippen zeigt die Kategorien.</div></div>`;
}

function renderKats() {
  const el = $('#kats'); if (!el) return;
  el.innerHTML = KATS.map(k => {
    const offen = offeneKat === k.name;
    const pct = k.budget ? Math.max(0, Math.min(100, k.ist / k.budget * 100)) : (k.ist > 0 ? 100 : 0);
    const zustand = !k.budget ? '' : k.ist > k.budget ? 'over' : k.ist >= k.budget * .85 ? 'warn' : '';
    const sub = k.reisen ? `${k.reisen.length} Reise${k.reisen.length === 1 ? '' : 'n'} · Jahresrahmen in der Auswertung`
      : !k.budget ? 'ohne Budget'
      : k.ist > k.budget ? `${chf0(k.ist - k.budget)} über Budget` : `noch ${chf0(k.budget - k.ist)}`;
    const liste = !offen ? [] : AUS.filter(b => k.reisen ? IST_REISE(b.kategorie) : (b.kategorie || '(ohne)') === k.name).sort((a, b) => b.datum.localeCompare(a.datum));
    const teile = offen && k.reisen ? `<div class="small" style="padding:var(--s2) 0">${k.reisen.map(r =>
      `<div class="row"><span class="grow">${esc(r.n.replace(/^Reise\s+/, ''))}</span><span class="num">${chf(r.s)}</span></div>`).join('')}</div>` : '';
    return `<div class="cat-wrap">
      <button type="button" class="plain cat" data-k="${esc(k.name)}" aria-expanded="${offen}">
        <span class="row"><span class="grow name">${esc(k.label || k.name)}</span><span class="num">${chf(k.ist)}</span>${ico('chev', 'chev', 18)}</span>
        <span class="bar ${zustand}" style="display:block"><span style="display:block;width:${pct}%"></span></span>
        <span class="row small"><span class="grow ${zustand === 'over' ? 'neg' : 'muted'}">${sub}</span>
          ${k.budget ? `<span class="muted num">Budget ${chf0(k.budget)}</span>` : ''}</span>
      </button>
      ${offen ? `<div class="cat-detail">${teile}${txList(liste)}</div>` : ''}</div>`;
  }).join('') || '<div class="empty muted">Keine Ausgaben in diesem Zeitraum.</div>';
  $$('.cat', el).forEach(b => b.onclick = () => { offeneKat = offeneKat === b.dataset.k ? null : b.dataset.k; renderKats(); });
  bindTx(el);
}

function txList(list) {
  if (!list.length) return '<div class="small muted" style="padding:var(--s3) 0">Keine Buchungen.</div>';
  return list.map(b => {
    const id = 't' + (++txSeq); TX.set(id, b);
    return `<button type="button" class="plain tx" data-tx="${id}" aria-label="${esc(b.notiz || b.kategorie)}, ${chf(b.betrag)} CHF, bearbeiten">
      <span class="grow"><span class="t">${esc(b.notiz || b.kategorie || b.banktext || '—')}</span>
        <span class="small muted meta">${fmtDate(b.datum)} · ${esc(b.kategorie || 'ohne Kategorie')}${b.konto ? ' · ' + esc(b.konto) : ''}
        ${b.status === 'prüfen' ? '<span class="pill warn">prüfen</span>' : ''}</span></span>
      <span class="num">${chf(b.betrag)}</span></button>`;
  }).join('');
}
function bindTx(root) { $$('.tx', root).forEach(el => el.onclick = () => openEdit(TX.get(el.dataset.tx))); }
