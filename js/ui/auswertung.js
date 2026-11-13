// Budget-App – Auswertung: Prognose Jahresende, Sparquote, Einnahmen nach Auftraggeber, Reisen.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Auswertung ---------- */
let offenAw = null;   // aufgeklappte Zeile: 'e:<Kategorie>' oder 'r:<Reise>'
const IST_REISE = k => /^Reise\s/.test(k || '');

function awVeraenderung(a, b) {
  if (!a) return b ? '<span class="delta neutral">neu</span>' : '';
  const p = (b - a) / Math.abs(a) * 100;
  if (Math.abs(p) < 2) return '<span class="delta neutral">≈ gleich</span>';
  const w = Math.round(Math.abs(p));
  return `<span class="delta ${p > 0 ? 'gut' : 'schlecht'}" aria-label="${w} Prozent ${p > 0 ? 'mehr' : 'weniger'} als im Vorjahr">${p > 0 ? '▲' : '▼'} ${w} %</span>`;
}

// Hochrechnung der laufenden Ausgaben bis 31.12.: bisher + Monatsschnitt der letzten 12 abgeschlossenen Monate (ohne Reisen) × Rest
function awPrognose(alle) {
  const aus = D.buchungen.filter(b => b.typ === 'Ausgabe');
  const bisher = sum(aus), reisen = sum(aus.filter(b => IST_REISE(b.kategorie)));
  const ende = `${CUR_Y}-${String(CUR_M).padStart(2, '0')}-01`;
  const s = new Date(CUR_Y, CUR_M - 13, 1);
  const start = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-01`;
  const basis = alle.filter(b => b.typ === 'Ausgabe' && !IST_REISE(b.kategorie) && b.datum >= start && b.datum < ende);
  const ersterTag = alle.reduce((m, b) => b.datum && b.datum < m ? b.datum : m, ende);
  const monateDaten = Math.min(12, Math.max(1, (CUR_Y - +ersterTag.slice(0, 4)) * 12 + CUR_M - +ersterTag.slice(5, 7)));
  const schnitt = sum(basis) / monateDaten;
  const tageImMonat = new Date(CUR_Y, CUR_M, 0).getDate();
  const rest = 12 - CUR_M + (tageImMonat - HEUTE.getDate()) / tageImMonat;
  const prognose = bisher + schnitt * rest;
  return { bisher, reisen, schnitt, rest, prognose, ohneReisen: prognose - reisen, budget: D.kategorien.reduce((a, k) => a + k.budget, 0) * 12 };
}

function renderAuswertung() {
  const alle = D.alle || D.buchungen, jahr = D.jahr, laufend = jahr === CUR_Y;
  const imJahr = D.buchungen;
  const vorjahr = alle.filter(b => b.jahr === jahr - 1);
  const summeTyp = (l, t) => sum(l.filter(b => b.typ === t));

  // Hauptzahl: im laufenden Jahr die Prognose, sonst die Sparquote
  let hero;
  const ein = summeTyp(imJahr, 'Einnahme'), spa = summeTyp(imJahr, 'Sparen');
  const quote = ein > 0 ? spa / ein * 100 : 0;
  if (laufend) {
    // Das Budget kennt keine Reisen: verglichen wird ohne Reisen, die Reisen stehen separat
    const p = awPrognose(alle), diff = p.ohneReisen - p.budget;
    const st = !p.budget ? '' : diff > p.budget * 0.05 ? 'rot' : diff > 0 ? 'gelb' : 'gruen';
    const stText = { rot:'Deutlich über Budget', gelb:'Knapp über Budget', gruen:'Im Budget' }[st];
    hero = `<div class="card hero"><div class="label">Laufende Ausgaben bis Ende ${jahr} (Prognose)</div>
      <div class="value num">≈ ${chf0(p.prognose)} <span class="cur">CHF</span></div>
      ${st ? `<div class="status ${st}"><span aria-hidden="true">${st === 'gruen' ? '✓' : st === 'gelb' ? '!' : '✕'}</span>${stText}${diff > 0 ? ` (${chf0(diff)} darüber)` : ` (${chf0(-diff)} Reserve)`}</div>` : ''}
      <div class="small muted" style="margin-top:var(--s1)">Ohne Reisen ≈ ${chf0(p.ohneReisen)}, Budget ${chf0(p.budget)}${p.reisen ? ` · Reisen bisher ${chf0(p.reisen)}` : ''}.<br>
        Bisher ${chf0(p.bisher)}, dazu ${chf0(p.schnitt)} pro Monat für die restlichen ${p.rest.toLocaleString('de-CH', { maximumFractionDigits:1 })} Monate
        (Schnitt der letzten 12 Monate ohne Reisen). Noch nicht gebuchte Reisen sind nicht eingerechnet.</div></div>`;
  } else {
    hero = `<div class="card hero"><div class="label">Sparquote ${jahr}</div>
      <div class="value num">${Math.round(quote)} <span class="cur">%</span></div>
      <div class="small muted">${chf0(spa)} gespart von ${chf0(ein)} Einnahmen</div></div>`;
  }

  // Sparquote über alle Jahre
  const jahre = [...new Set(alle.map(b => b.jahr))].filter(Boolean).sort();
  const sparTab = `<h2 class="section">Sparquote pro Jahr</h2><div class="card">
    <table class="tab"><thead><tr><th>Jahr</th><th>Einnahmen</th><th>Gespart</th><th>Quote</th></tr></thead><tbody>
    ${jahre.map(j => { const l = alle.filter(b => b.jahr === j), e = summeTyp(l, 'Einnahme'), s = summeTyp(l, 'Sparen');
      return `<tr${j === jahr ? ' style="font-weight:600"' : ''}><td>${j}${j === CUR_Y ? ' <span class="small muted">bis heute</span>' : ''}</td>
        <td>${chf0(e)}</td><td>${chf0(s)}</td><td>${e > 0 ? Math.round(s / e * 100) + ' %' : '–'}</td></tr>`; }).join('')}
    </tbody></table>
    <div class="small muted" style="margin-top:var(--s2)">Gespart = Buchungen vom Typ «Sparen» (Einzahlungen auf Viac). Einnahmen inkl. Spesenrückerstattungen.</div></div>`;

  // Ausklappbare Zeile mit Balken (dieses Jahr und Vorjahr)
  const zeile = (key, name, wert, vj, max, liste, meta) => {
    const offen = offenAw === key;
    const breite = v => v > 0 ? `width:${v / max * 100}%` : 'width:0;min-width:0';
    return `<div class="rrow-wrap"><button type="button" class="plain cat rrow" data-aw="${esc(key)}" aria-expanded="${offen}">
        <span class="row"><span class="grow name">${esc(name)}</span><span class="num">${chf0(wert)}</span>${ico('chev', 'chev', 18)}</span>
        <span class="pair" aria-hidden="true"><span class="vj" style="${breite(vj)}"></span><span class="j" style="${breite(wert)}"></span></span>
        <span class="vorjahr"><span>${meta}</span>${awVeraenderung(vj, wert)}</span>
      </button>${offen ? `<div class="cat-detail">${txList(liste.slice().sort((a, b) => b.datum.localeCompare(a.datum)))}</div>` : ''}</div>`;
  };
  const legende = `<div class="legend" style="margin:0 0 var(--s2)"><span><i style="background:var(--vj)"></i>${jahr - 1}</span><span><i style="background:var(--j)"></i>${jahr}</span></div>`;

  // Einnahmen nach Auftraggeber (= Kategorie der Einnahme)
  const proKat = l => l.filter(b => b.typ === 'Einnahme').reduce((o, b) => { const k = b.kategorie || '(ohne Kategorie)'; (o[k] = o[k] || []).push(b); return o; }, {});
  const eJ = proKat(imJahr), eV = proKat(vorjahr);
  const eNamen = Object.keys(eJ).filter(n => Math.round(sum(eJ[n]))).sort((a, b) => sum(eJ[b]) - sum(eJ[a]));
  const eMax = Math.max(1, ...eNamen.map(n => Math.max(sum(eJ[n]), sum(eV[n] || []))));
  const weg = Object.keys(eV).filter(n => !eJ[n] && Math.round(sum(eV[n])));
  const einnahmen = `<h2 class="section">Einnahmen nach Auftraggeber · antippen für Zahlungen</h2>
    <div class="card" style="padding-block:var(--s2)">${eNamen.length ? legende + eNamen.map(n => zeile('e:' + n, n, sum(eJ[n]), sum(eV[n] || []), eMax, eJ[n],
        `${eJ[n].length} Zahlung${eJ[n].length === 1 ? '' : 'en'} · ${jahr - 1}: ${eV[n] ? chf0(sum(eV[n])) : '–'}`)).join('')
      : `<div class="empty muted">Keine Einnahmen in ${jahr}.</div>`}</div>
    ${weg.length ? `<div class="small muted" style="margin-top:var(--s2)">Nur ${jahr - 1}: ${weg.map(n => `${esc(n)} ${chf0(sum(eV[n]))}`).join(' · ')}</div>` : ''}`;

  // Reisen: Kategorien «Reise …», Ausgaben dieses Jahres
  const rJ = imJahr.filter(b => b.typ === 'Ausgabe' && IST_REISE(b.kategorie))
    .reduce((o, b) => { (o[b.kategorie] = o[b.kategorie] || []).push(b); return o; }, {});
  const rNamen = Object.keys(rJ).sort((a, b) => rJ[b].reduce((m, x) => x.datum > m ? x.datum : m, '').localeCompare(rJ[a].reduce((m, x) => x.datum > m ? x.datum : m, '')));
  const rMax = Math.max(1, ...rNamen.map(n => sum(rJ[n])));
  const reiseJahre = jahre.map(j => ({ j, s: sum(alle.filter(b => b.jahr === j && b.typ === 'Ausgabe' && IST_REISE(b.kategorie))) })).filter(x => Math.round(x.s));
  const zeitraum = l => { const d = l.map(b => b.datum).sort(); return d[0] === d[d.length - 1] ? fmtDate(d[0]) : `${fmtDate(d[0])} – ${fmtDate(d[d.length - 1])}`; };
  const reisen = `<h2 class="section">Reisen ${jahr} · antippen für Buchungen</h2>
    <div class="card" style="padding-block:var(--s2)">${rNamen.length ? rNamen.map(n => {
        const offen = offenAw === 'r:' + n;
        return `<div class="rrow-wrap"><button type="button" class="plain cat rrow" data-aw="${esc('r:' + n)}" aria-expanded="${offen}">
          <span class="row"><span class="grow name">${esc(n.replace(/^Reise\s+/, ''))}</span><span class="num">${chf0(sum(rJ[n]))}</span>${ico('chev', 'chev', 18)}</span>
          <span class="pair" aria-hidden="true"><span class="j" style="width:${Math.max(0, sum(rJ[n])) / rMax * 100}%"></span></span>
          <span class="small muted">${zeitraum(rJ[n])} · ${rJ[n].length} Buchung${rJ[n].length === 1 ? '' : 'en'}</span>
        </button>${offen ? `<div class="cat-detail">${txList(rJ[n].slice().sort((a, b) => b.datum.localeCompare(a.datum)))}</div>` : ''}</div>`; }).join('')
      : `<div class="empty muted">Keine Reisen in ${jahr}.</div>`}</div>
    ${reiseJahre.length ? `<div class="small muted" style="margin-top:var(--s2)">Reisen pro Jahr: ${reiseJahre.map(x => `${x.j} <b class="num">${chf0(x.s)}</b>`).join(' · ')}.
      Gezählt werden Kategorien, die mit «Reise » beginnen, im Jahr der Zahlung.</div>` : ''}`;

  $('#uebersicht').innerHTML = `<div style="margin-top:var(--s3)">${hero}</div>${einnahmen}${reisen}${sparTab}`;
  $$('#uebersicht [data-aw]').forEach(b => b.onclick = () => { offenAw = offenAw === b.dataset.aw ? null : b.dataset.aw; renderAuswertung(); });
  bindTx($('#uebersicht'));
}
