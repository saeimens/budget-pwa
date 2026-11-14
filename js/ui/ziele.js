// Budget-App – Sparziele (Blatt «Ziele») und Prognose des Lohnkontos, beides im Reiter «Vermögen».
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Sparziele ---------- */
const ZIEL_QUELLE = /^(Konto|Gruppe|Kategorie):\s*(.+)$/;
const monateZwischen = (a, b) => (new Date(b) - new Date(a)) / (864e5 * 30.44);
const monatJahr = iso => `${MONATE_LANG[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

/** Stand und bisheriges Tempo (pro Monat, letzte ~6 Monate) eines Ziels */
function zielStand(z, reihe) {
  const [, art, was] = (z.quelle.match(ZIEL_QUELLE) || [, '', '']);
  const heute = isoLocal(HEUTE);
  if (art === 'Konto' || art === 'Gruppe') {
    const wert = r => r ? r.konten.filter(k => art === 'Konto' ? k.konto === was : k.gruppe === was)
      .reduce((s, k) => s + (k.gruppe === 'Schulden' ? -Math.abs(k.saldo) : k.saldo), 0) : 0;
    const akt = reihe[reihe.length - 1];
    const grenze = akt ? isoLocal(new Date(new Date(akt.datum).getTime() - 182 * 864e5)) : '';
    const alt = reihe.filter(r => r.datum <= grenze).pop() || reihe[0];
    const m = akt && alt && akt !== alt ? monateZwischen(alt.datum, akt.datum) : 0;
    return { art, was, stand: wert(akt), tempo: m >= 1 ? (wert(akt) - wert(alt)) / m : null, stichtag: akt && akt.datum };
  }
  if (art === 'Kategorie') {
    const seit = z.seit || `${CUR_Y}-01-01`, alle = D.alle || D.buchungen;
    const stand = alle.filter(b => b.kategorie === was && b.datum >= seit && b.datum <= heute).reduce((s, b) => s + b.betrag, 0);
    const von = isoLocal(new Date(CUR_Y, CUR_M - 7, 1)), bis = isoLocal(new Date(CUR_Y, CUR_M - 1, 0));
    const tempo = alle.filter(b => b.kategorie === was && b.datum >= von && b.datum <= bis).reduce((s, b) => s + b.betrag, 0) / 6;
    return { art, was, stand, tempo, seit };
  }
  return { art: '', was: '', stand: 0, tempo: null };
}

function zieleHtml(reihe) {
  const ziele = D.ziele || [];
  const knopf = `<button type="button" class="ghost klein" id="zuZiele" style="margin-top:var(--s2)">${ziele.length ? 'Ziele bearbeiten' : 'Sparziel anlegen'}</button>`;
  if (!ziele.length) return `<h2 class="section">Sparziele</h2><div class="card empty"><span class="small muted">Lege ein Ziel fest, zum Beispiel eine Reserve auf einem Konto
    oder eine Summe für die 3. Säule. Die App zeigt, wie weit du bist und ob das Tempo reicht.</span>${knopf}</div>`;
  const heute = isoLocal(HEUTE);
  return `<h2 class="section">Sparziele</h2><div class="card" style="padding-block:var(--s1)">${ziele.map(z => {
    const s = zielStand(z, reihe), rest = z.betrag - s.stand, pct = z.betrag > 0 ? Math.max(0, Math.min(100, s.stand / z.betrag * 100)) : 0;
    let st, text;
    if (rest <= 0) { st = 'gruen'; text = '<span aria-hidden="true">✓</span>Erreicht'; }
    else if (z.bis) {
      const ende = z.bis.length === 7 ? isoLocal(new Date(+z.bis.slice(0, 4), +z.bis.slice(5, 7), 0)) : z.bis;
      const m = Math.max(0.5, monateZwischen(heute, ende)), noetig = rest / m;
      st = s.tempo === null ? '' : s.tempo >= noetig ? 'gruen' : s.tempo >= noetig * 0.7 ? 'gelb' : 'rot';
      text = `${st ? `<span aria-hidden="true">${st === 'gruen' ? '✓' : st === 'gelb' ? '!' : '✕'}</span>${{ gruen: 'Auf Kurs', gelb: 'Knapp', rot: 'Nicht auf Kurs' }[st]} · ` : ''}noch ${chf0(rest)} bis ${monatJahr(ende)}:
        ${chf0(noetig)} pro Monat nötig${s.tempo !== null ? `, bisher ≈ ${chf0(s.tempo)}` : ''}`;
    } else {
      st = '';
      text = s.tempo > 0 ? `noch ${chf0(rest)} · beim bisherigen Tempo (≈ ${chf0(s.tempo)} pro Monat) etwa ${monatJahr(isoLocal(new Date(HEUTE.getTime() + rest / s.tempo * 30.44 * 864e5)))}`
        : `noch ${chf0(rest)}`;
    }
    const quelle = s.art === 'Kategorie' ? `${s.was} seit ${fmtDate(s.seit)}` : s.art ? `${s.was}${s.stichtag ? ` · Stand ${fmtDate(s.stichtag)}` : ''}` : 'Quelle fehlt';
    return `<div class="rrow">
      <div class="row"><span class="grow name">${esc(z.name)}</span><span class="num"><b>${chf0(s.stand)}</b> <span class="muted">von ${chf0(z.betrag)}</span></span></div>
      <div class="bar ${rest <= 0 ? '' : st === 'rot' ? 'over' : st === 'gelb' ? 'warn' : ''}" style="margin:var(--s2) 0" role="img"
        aria-label="${esc(z.name)}: ${chf0(s.stand)} von ${chf0(z.betrag)} Franken, ${Math.round(pct)} Prozent"><div style="width:${pct}%"></div></div>
      <div class="small ${st ? 'status ' + st : 'muted'}" style="font-size:13px;font-weight:${st ? 600 : 400}">${text}</div>
      <div class="small muted">${esc(quelle)}${z.bemerkung ? ' · ' + esc(z.bemerkung) : ''}</div></div>`;
  }).join('')}</div>${knopf}`;
}

/* ---------- Prognose Lohnkonto ---------- */
function prognoseHtml(reihe) {
  const akt = reihe[reihe.length - 1];
  const konto = akt && akt.konten.find(k => /lohnkonto/i.test(k.konto));
  if (!konto) return '';
  const start = (D.vermoegen || []).filter(v => v.konto === konto.konto).sort((a, b) => a.datum.localeCompare(b.datum)).pop();
  const p = Logik.prognose(D.alle || D.buchungen, { datum: start.datum, saldo: start.saldo }, isoLocal(HEUTE), 6);
  const tief = p.monate.reduce((m, x) => x.ende < m.ende ? x : m, p.monate[0]);
  const st = tief.ende < 1000 ? 'rot' : tief.ende < 3000 ? 'gelb' : 'gruen';
  const groesster = tief.posten.filter(x => !x.ein).sort((a, b) => b.betrag - a.betrag)[0];
  const max = Math.max(1, ...p.monate.map(m => Math.abs(m.ende))), H = 100;
  const kurz = v => (v < 0 ? '−' : '') + (Math.abs(v) >= 10000 ? (Math.abs(v) / 1000).toLocaleString('de-CH', { maximumFractionDigits: 1 }) + 'K' : chf0(Math.abs(v)));
  return `<h2 class="section">${esc(konto.konto)} · Prognose</h2><div class="card">
    <div class="row"><span class="grow label">Heute geschätzt</span><b class="num">${chf0(p.heute.saldo)}</b></div>
    <div class="status ${st}" style="margin:var(--s1) 0 var(--s2)"><span aria-hidden="true">${st === 'gruen' ? '✓' : st === 'gelb' ? '!' : '✕'}</span>
      ${st === 'gruen' ? 'Genügend Reserve' : st === 'gelb' ? 'Wird knapp' : 'Achtung'}: tiefster Stand Ende ${MONATE_LANG[+tief.monat.slice(5) - 1]} ≈ ${chf0(tief.ende)}${groesster && groesster.betrag > 1000 ? ` (u. a. ${esc(groesster.name)} ${chf0(groesster.betrag)})` : ''}</div>
    <div class="jbars" style="height:${H + 48}px" role="img" aria-label="Prognose Monatsende: ${p.monate.map(m => `${MONATE_LANG[+m.monat.slice(5) - 1]} ${chf0(m.ende)} Franken`).join(', ')}">
      ${p.monate.map(m => `<div class="jb ${m === tief ? 'on' : ''}" title="Ende ${MONATE_LANG[+m.monat.slice(5) - 1]}: ${chf0(m.ende)} CHF">
        <span class="jbar ${m.ende < 0 ? 'neg' : ''}" style="height:${Math.max(2, Math.abs(m.ende) / max * H)}px"></span>
        <span class="jx">${MONATE[+m.monat.slice(5) - 1]}</span><span class="jv">${kurz(m.ende)}</span></div>`).join('')}
    </div>
    <details style="margin-top:var(--s3)"><summary>Als Tabelle anzeigen</summary>
      <table class="tab"><thead><tr><th>Monat</th><th>Ein</th><th>Fix</th><th>Übrige</th><th>Ende</th></tr></thead><tbody>
      ${p.monate.map(m => `<tr><td>${MONATE[+m.monat.slice(5) - 1]} ${m.monat.slice(2, 4)}</td><td>${chf0(m.ein)}</td><td>${chf0(m.fix)}</td><td>${chf0(m.variabel)}</td><td>${chf0(m.ende)}</td></tr>`).join('')}
      </tbody></table></details>
    <div class="small muted" style="margin-top:var(--s2)">Ausgangspunkt: Stand ${fmtDate(start.datum)} (${chf0(start.saldo)}) plus Buchungen seither. Danach wiederkehrende Ein- und Ausgänge
      und übrige Ausgaben im Schnitt (≈ ${chf0(p.schnittVariabel)} pro Monat). Reisen und Einmaliges sind nicht eingerechnet.</div></div>`;
}
