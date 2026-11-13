// Budget-App – Jahresvergleich zweier Jahre.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Jahresvergleich ---------- */
const vgl = { a: null, b: null, bis: true, nach: 'gruppe' };
function deltaHtml(a, b, hoeherIstGut) {
  if (!a) return b ? '<span class="delta neutral">neu</span>' : '';
  const p = (b - a) / Math.abs(a) * 100;
  if (Math.abs(p) < 2) return '<span class="delta neutral">≈ gleich</span>';
  const hoch = p > 0, gut = hoch === hoeherIstGut, w = Math.round(Math.abs(p));
  return `<span class="delta ${gut ? 'gut' : 'schlecht'}" aria-label="${w} Prozent ${hoch ? 'mehr' : 'weniger'} als ${vgl.a}">${hoch ? '▲' : '▼'} ${w} %</span>`;
}
function niceTicks(max) {
  const roh = Math.max(max, 1) / 3, p = 10 ** Math.floor(Math.log10(roh));
  const step = [1, 2, 2.5, 5, 10].map(f => f * p).find(s => s >= roh);
  const t = [0]; while (t[t.length - 1] < max) t.push(t[t.length - 1] + step);
  return t.length > 1 ? t : [0, step];
}

function renderVergleich() {
  const alle = D.alle || D.buchungen;
  const jahre = [...new Set(alle.map(b => b.jahr))].filter(Boolean).sort();
  if (jahre.length < 2) {
    $('#uebersicht').innerHTML = `<div class="card empty" style="margin-top:var(--s3)"><b>Noch kein Vergleich möglich</b>
      <span class="small muted">Dafür braucht es Buchungen aus mindestens zwei Jahren.</span></div>`;
    return;
  }
  if (!jahre.includes(vgl.b)) vgl.b = jahre.includes(CUR_Y) ? CUR_Y : jahre[jahre.length - 1];
  if (!jahre.includes(vgl.a) || vgl.a === vgl.b) vgl.a = jahre.filter(j => j < vgl.b).pop() ?? jahre.find(j => j !== vgl.b);
  const laufend = vgl.b === CUR_Y || vgl.a === CUR_Y;
  const bis = laufend && vgl.bis;
  const mmdd = `-${String(CUR_M).padStart(2, '0')}-${String(HEUTE.getDate()).padStart(2, '0')}`;
  const auswahl = j => alle.filter(b => b.jahr === j && (!bis || b.datum.slice(4) <= mmdd));
  const A = auswahl(vgl.a), B = auswahl(vgl.b);
  const summe = (l, t) => l.filter(b => b.typ === t).reduce((x, b) => x + b.betrag, 0);
  const kz = l => { const o = { aus: summe(l, 'Ausgabe'), ein: summe(l, 'Einnahme'), rue: summe(l, 'Rückstellung'), spa: summe(l, 'Sparen') };
    o.saldo = o.ein - o.aus - o.rue - o.spa; return o; };
  const ka = kz(A), kb = kz(B);
  const zeitraum = bis ? ` · 1.1. bis ${HEUTE.getDate()}.${CUR_M}.` : '';
  const opts = sel => jahre.map(j => `<option ${j === sel ? 'selected' : ''}>${j}</option>`).join('');

  // Filter: eine Zeile oberhalb von allem, was sie betreffen
  const ctrl = `<div class="cmp-ctrl">
      <label class="sr" for="vB">Jahr</label><select id="vB">${opts(vgl.b)}</select>
      <span class="vs">verglichen mit</span>
      <label class="sr" for="vA">Vergleichsjahr</label><select id="vA">${opts(vgl.a)}</select>
      ${laufend ? `<div class="seg2" role="group" aria-label="Zeitraum">
        <button type="button" data-bis="1" class="${bis ? 'on' : ''}" aria-pressed="${bis}">Bis heute</button>
        <button type="button" data-bis="0" class="${bis ? '' : 'on'}" aria-pressed="${!bis}">Ganze Jahre</button></div>` : ''}
    </div>`;

  const hero = `<div class="card hero"><div class="label">Laufende Ausgaben ${vgl.b}${zeitraum}</div>
      <div class="value num">${chf0(kb.aus)} <span class="cur">CHF</span></div>
      <div class="vorjahr"><span>${vgl.a}: ${chf0(ka.aus)} CHF</span>${deltaHtml(ka.aus, kb.aus, false)}</div></div>`;
  const stat = (label, a, b, hochGut) => `<div class="card stat"><div class="label">${label}</div>
      <div class="value num">${chf0(b)}</div><div class="vorjahr"><span>${vgl.a}: ${chf0(a)}</span>${deltaHtml(a, b, hochGut)}</div></div>`;
  const stats = `<div class="stats">${stat('Einnahmen', ka.ein, kb.ein, true)}${stat('Jahresrechnungen', ka.rue, kb.rue, false)}
      ${stat('Gespart', ka.spa, kb.spa, true)}${stat('Saldo', ka.saldo, kb.saldo, true)}</div>`;

  // Monatsvergleich (gruppierte Säulen, eine Achse)
  const nM = bis ? CUR_M : 12;
  const proMonat = l => Array.from({ length: nM }, (_, i) => l.filter(b => b.typ === 'Ausgabe' && b.monat === i + 1).reduce((x, b) => x + b.betrag, 0));
  const ma = proMonat(A), mb = proMonat(B);
  const ticks = niceTicks(Math.max(...ma, ...mb)), top = ticks[ticks.length - 1];
  const fmtT = top >= 10000 ? v => v ? (v / 1000).toLocaleString('de-CH') + 'K' : '0' : v => chf0(v);
  const hoehe = v => v > 0 ? Math.max(1.5, v / top * 100) : 0;
  const chart = `<h2 class="section">Laufende Ausgaben pro Monat${zeitraum}</h2><div class="card">
      <div class="legend"><span><i style="background:var(--vj)"></i>${vgl.a}</span><span><i style="background:var(--j)"></i>${vgl.b}</span></div>
      <div class="gchart"><div class="plot">
        ${ticks.map(t => `<div class="gl" style="bottom:${t / top * 100}%"></div><div class="tick" style="bottom:${t / top * 100}%;transform:translateY(50%)">${fmtT(t)}</div>`).join('')}
        <div class="grps">${ma.map((_, i) => `<button type="button" class="plain grp" data-i="${i}"
            aria-label="${MONATE_LANG[i]}: ${vgl.b} ${chf0(mb[i])} CHF, ${vgl.a} ${chf0(ma[i])} CHF">
            <span class="bar vj" style="height:${hoehe(ma[i])}%"></span><span class="bar j" style="height:${hoehe(mb[i])}%"></span>
            <span class="xl" aria-hidden="true"><span class="lang">${MONATE[i]}</span><span class="kurz">${nM > 6 ? MONATE[i][0] : MONATE[i]}</span></span></button>`).join('')}</div>
      </div><div class="ttip" id="ttip" hidden></div></div>
      <details style="margin-top:var(--s5)"><summary>Als Tabelle anzeigen</summary>
        <table class="tab"><thead><tr><th>Monat</th><th>${vgl.a}</th><th>${vgl.b}</th><th>Veränderung</th></tr></thead>
        <tbody>${ma.map((_, i) => `<tr><td>${MONATE_LANG[i]}</td><td>${chf0(ma[i])}</td><td>${chf0(mb[i])}</td><td>${deltaHtml(ma[i], mb[i], false)}</td></tr>`).join('')}
          <tr><td><b>Total</b></td><td><b>${chf0(ka.aus)}</b></td><td><b>${chf0(kb.aus)}</b></td><td>${deltaHtml(ka.aus, kb.aus, false)}</td></tr></tbody></table>
      </details></div>`;

  // Ausgaben nach Gruppe oder Kategorie
  const gruppeVon = {}; D.kategorien.forEach(k => gruppeVon[k.name] = k.gruppe || 'Übrige');
  const schluessel = b => vgl.nach === 'gruppe' ? (gruppeVon[b.kategorie] || 'Übrige') : (b.kategorie || '(ohne Kategorie)');
  const agg = l => { const o = {}; l.filter(b => b.typ === 'Ausgabe').forEach(b => { const k = schluessel(b); o[k] = (o[k] || 0) + b.betrag; }); return o; };
  const ga = agg(A), gb = agg(B);
  const namen = [...new Set(Object.keys(ga).concat(Object.keys(gb)))]
    .filter(n => Math.round(ga[n] || 0) || Math.round(gb[n] || 0))
    .sort((x, y) => (gb[y] || 0) - (gb[x] || 0) || (ga[y] || 0) - (ga[x] || 0));
  const maxV = Math.max(1, ...namen.map(n => Math.max(ga[n] || 0, gb[n] || 0)));
  const breite = v => v > 0 ? `width:${v / maxV * 100}%` : 'width:0;min-width:0';
  const liste = `<h2 class="section row" style="align-items:center"><span class="grow">Ausgaben nach ${vgl.nach === 'gruppe' ? 'Gruppe' : 'Kategorie'}</span>
      <span class="seg2" role="group" aria-label="Gliederung">
        <button type="button" data-nach="gruppe" class="${vgl.nach === 'gruppe' ? 'on' : ''}" aria-pressed="${vgl.nach === 'gruppe'}">Gruppen</button>
        <button type="button" data-nach="kategorie" class="${vgl.nach === 'kategorie' ? 'on' : ''}" aria-pressed="${vgl.nach === 'kategorie'}">Kategorien</button></span></h2>
    <div class="card vliste ${vgl.alle ? 'alle' : ''}" style="padding-block:var(--s1)">${namen.map((n, i) => `<div class="vrow ${i >= 8 ? 'extra' : ''}">
        <div class="row"><span class="grow" style="font-weight:500">${esc(n)}</span><span class="num">${chf0(gb[n] || 0)}</span></div>
        <div class="pair" aria-hidden="true"><span class="vj" style="${breite(ga[n] || 0)}"></span><span class="j" style="${breite(gb[n] || 0)}"></span></div>
        <div class="vorjahr"><span>${vgl.a}: ${ga[n] ? chf0(ga[n]) : '–'}</span>${deltaHtml(ga[n] || 0, gb[n] || 0, false)}</div></div>`).join('')
      || '<div class="empty muted">Keine Ausgaben im gewählten Zeitraum.</div>'}
      ${namen.length > 8 ? `<button type="button" class="ghost" id="vAlle" style="width:100%;margin:var(--s2) 0 var(--s3)" aria-expanded="${!!vgl.alle}">
        ${vgl.alle ? 'Weniger anzeigen' : `Alle ${namen.length} anzeigen`}</button>` : ''}</div>`;

  const pauschal = [vgl.a, vgl.b].filter(j => alle.some(b => b.jahr === j && b.kategorie === 'Kreditkarte (ohne Details)'));
  const hinweis = pauschal.length ? `<div class="hinweis">${pauschal.join(' und ')}: Ein Teil der Kreditkartenausgaben ist nur als Monatstotal
      vorhanden («Kreditkarte (ohne Details)»). Der Vergleich nach Gruppen ist dort nur grob.</div>` : '';

  $('#uebersicht').innerHTML = ctrl + `<div style="margin-top:var(--s3)">${hero}</div>` + stats + chart + liste + hinweis;

  $('#vB').onchange = e => { vgl.b = +e.target.value; if (vgl.a === vgl.b) vgl.a = null; renderVergleich(); };
  $('#vA').onchange = e => { vgl.a = +e.target.value; renderVergleich(); };
  $$('[data-bis]').forEach(b => b.onclick = () => { vgl.bis = b.dataset.bis === '1'; renderVergleich(); });
  $$('[data-nach]').forEach(b => b.onclick = () => { vgl.nach = b.dataset.nach; vgl.alle = false; renderVergleich(); });
  if ($('#vAlle')) $('#vAlle').onclick = () => { vgl.alle = !vgl.alle; renderVergleich(); };

  // Tooltip: zeigt beide Jahre des Monats (Hover und Tastatur), Werte zuerst
  const tip = $('#ttip'), box = $('.gchart');
  const zeige = el => {
    const i = +el.dataset.i;
    tip.innerHTML = `<div style="font-weight:600;margin-bottom:2px">${MONATE_LANG[i]}</div>
      <div><span class="k j"></span><b>${chf0(mb[i])}</b> · ${vgl.b}</div><div><span class="k vj"></span><b>${chf0(ma[i])}</b> · ${vgl.a}</div>`;
    tip.hidden = false;
    const mitte = el.offsetLeft + 44 + el.offsetWidth / 2, w = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(box.clientWidth - w, mitte - w / 2)) + 'px';
    tip.style.top = '-8px';
  };
  $$('.gchart .grp').forEach(el => {
    el.addEventListener('pointerenter', () => zeige(el));
    el.addEventListener('focus', () => zeige(el));
    el.addEventListener('pointerleave', () => tip.hidden = true);
    el.addEventListener('blur', () => tip.hidden = true);
  });
}
