// Budget-App – Nettovermögen, Verlauf, Kontostände erfassen.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Vermögen ---------- */
const GRUPPEN = ['Flüssig', 'Vorsorge', 'Sachwerte', 'Schulden'];
const datumKurz = iso => { const [y, m, d] = iso.split('-'); return `${+d}.${+m}.${y}`; };
const monatKurz = iso => MONATE[+iso.slice(5, 7) - 1] + ' ' + iso.slice(2, 4);

/** Pro Stichtag den Stand jedes Kontos (letzter bekannter Wert wird fortgeschrieben) */
function vermoegensReihe() {
  const zeilen = (D.vermoegen || []).slice().sort((a, b) => a.datum.localeCompare(b.datum));
  const tage = [...new Set(zeilen.map(z => z.datum))];
  const stand = {}, reihe = [];
  tage.forEach(t => {
    zeilen.filter(z => z.datum === t).forEach(z => stand[z.konto] = z);
    const konten = Object.values(stand).map(z => ({ ...z }));
    const netto = konten.reduce((s, z) => s + (z.gruppe === 'Schulden' ? -Math.abs(z.saldo) : z.saldo), 0);
    reihe.push({ datum: t, konten, netto });
  });
  return reihe;
}

function renderVermoegen() {
  const reihe = vermoegensReihe();
  const knopf = `<button type="button" id="vErfassen" style="width:100%;margin-top:var(--s3)">Kontostände erfassen</button>`;
  if (!reihe.length) {
    $('#uebersicht').innerHTML = `<div class="card empty"><b>Noch keine Kontostände</b>
      <span class="small muted">Erfasse einmal im Monat die Stände deiner Konten. Daraus entsteht der Verlauf deines Nettovermögens.</span>${knopf}</div>`;
    $('#vErfassen').onclick = () => oeffneKontostaende(reihe);
    return;
  }
  const akt = reihe[reihe.length - 1], vor = reihe[reihe.length - 2];
  const jahrStart = reihe.filter(r => r.datum < akt.datum.slice(0, 4) + '-01-01').pop();
  const delta = (alt, neu, wann) => {
    if (alt === undefined || alt === null) return '';
    const d = neu - alt, p = alt ? d / Math.abs(alt) * 100 : 0, hoch = d >= 0;
    return `<span class="delta ${Math.abs(p) < 0.5 ? 'neutral' : hoch ? 'gut' : 'schlecht'}">${hoch ? '▲' : '▼'} ${chf0(Math.abs(d))} (${Math.abs(p).toLocaleString('de-CH', { maximumFractionDigits:1 })} %)</span>
      <span>${wann}</span>`;
  };
  const hero = `<div class="card hero"><div class="label">Nettovermögen · Stand ${datumKurz(akt.datum)}</div>
      <div class="value num">${chf0(akt.netto)} <span class="cur">CHF</span></div>
      <div class="vorjahr">${delta(vor && vor.netto, akt.netto, 'seit Vormonat')}</div>
      ${jahrStart ? `<div class="vorjahr" style="margin-top:2px">${delta(jahrStart.netto, akt.netto, 'seit Jahresbeginn')}</div>` : ''}
      ${knopf}</div>`;

  // Verlauf: eine Serie, darum keine Legende; eine Linie darf über 0 beginnen
  let chart = '';
  if (reihe.length >= 2) {
    const werte = reihe.map(r => r.netto);
    const lo = Math.min(...werte), hi = Math.max(...werte), spanne = Math.max(hi - lo, 1);
    const roh = spanne / 3, p10 = 10 ** Math.floor(Math.log10(roh));
    const step = [1, 2, 2.5, 5, 10].map(f => f * p10).find(s => s >= roh);
    const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
    const ticks = []; for (let v = min; v <= max + step / 2; v += step) ticks.push(v);
    const fmt = max >= 10000 ? v => (v / 1000).toLocaleString('de-CH') + 'K' : chf0;
    const x = i => i / (reihe.length - 1) * 100, y = v => 100 - (v - min) / (max - min || 1) * 100;
    const pfad = werte.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
    const jedes = Math.ceil(reihe.length / 6);
    chart = `<h2 class="section">Verlauf</h2><div class="card">
      <div class="lchart"><div class="plot">
        ${ticks.map(t => `<div class="gl" style="bottom:${100 - y(t)}%"></div><div class="tick" style="bottom:${100 - y(t)}%">${fmt(t)}</div>`).join('')}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="flaeche" d="${pfad} L100,100 L0,100 Z"></path><path class="linie" d="${pfad}"></path></svg>
        <span class="punkt" style="left:${x(werte.length - 1)}%;top:${y(werte[werte.length - 1])}%"></span>
        ${reihe.map((r, i) => ((i % jedes === 0 && reihe.length - 1 - i >= jedes) || i === reihe.length - 1) ? `<span class="xl" style="left:${x(i)}%">${monatKurz(r.datum)}</span>` : '').join('')}
        <div class="fadenkreuz" id="vKreuz" hidden></div>
        <div class="hit" id="vHit" role="img" aria-label="Verlauf Nettovermögen von ${chf0(werte[0])} auf ${chf0(werte[werte.length - 1])} CHF"></div>
      </div><div class="ttip" id="vTip" hidden></div></div>
      <details style="margin-top:var(--s5)"><summary>Als Tabelle anzeigen</summary>
        <table class="tab"><thead><tr><th>Stichtag</th><th>Nettovermögen</th><th>Veränderung</th></tr></thead><tbody>
        ${reihe.slice().reverse().map((r, i, a) => `<tr><td>${datumKurz(r.datum)}</td><td>${chf0(r.netto)}</td>
          <td>${a[i + 1] ? (r.netto - a[i + 1].netto >= 0 ? '+' : '−') + chf0(Math.abs(r.netto - a[i + 1].netto)) : '–'}</td></tr>`).join('')}
        </tbody></table></details></div>`;
  }

  // Zusammensetzung nach Gruppe
  const vorStand = {}; if (vor) vor.konten.forEach(k => vorStand[k.konto] = k.saldo);
  const gruppen = GRUPPEN.concat([...new Set(akt.konten.map(k => k.gruppe))].filter(g => !GRUPPEN.includes(g)))
    .map(g => ({ g, konten: akt.konten.filter(k => k.gruppe === g && Math.round(k.saldo * 100)).sort((a, b) => b.saldo - a.saldo) }))
    .filter(x => x.konten.length);
  const liste = `<h2 class="section">Zusammensetzung</h2><div class="card" style="padding-block:var(--s1)">
    ${gruppen.map(({ g, konten }) => `<div class="vgruppe"><span>${esc(g)}</span>
        <span class="num">${g === 'Schulden' ? '−' : ''}${chf0(konten.reduce((s, k) => s + Math.abs(k.saldo), 0))}</span></div>
      ${konten.map(k => { const d = vorStand[k.konto] !== undefined ? k.saldo - vorStand[k.konto] : null;
        return `<div class="vkonto"><span class="grow">${esc(k.konto)}${k.bemerkung ? `<span class="small muted" style="display:block">${esc(k.bemerkung)}</span>` : ''}</span>
          <span class="small muted num">${d === null || Math.abs(d) < 0.5 ? '' : (d > 0 ? '+' : '−') + chf0(Math.abs(d))}</span>
          <span class="num">${chf0(k.saldo)}</span></div>`; }).join('')}`).join('')}
    </div><div class="small muted" style="margin-top:var(--s2)">Kleine Zahl: Veränderung seit ${vor ? datumKurz(vor.datum) : 'dem letzten Stand'}.</div>`;

  $('#uebersicht').innerHTML = hero + prognoseHtml(reihe) + zieleHtml(reihe) + chart + liste;
  $('#vErfassen').onclick = () => oeffneKontostaende(reihe);
  $('#zuZiele').onclick = () => oeffneVerwalten('ziele');

  // Fadenkreuz-Tooltip: rastet auf den nächsten Stichtag ein
  const hit = $('#vHit');
  if (hit) {
    const tip = $('#vTip'), kreuz = $('#vKreuz'), box = $('.lchart');
    const zeige = e => {
      const r = hit.getBoundingClientRect();
      const i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))) * (reihe.length - 1));
      const px = i / (reihe.length - 1) * r.width;
      kreuz.style.left = px + 'px'; kreuz.hidden = false;
      tip.innerHTML = `<b>${chf0(reihe[i].netto)} CHF</b><div style="opacity:.8">${datumKurz(reihe[i].datum)}</div>`;
      tip.hidden = false;
      const w = tip.offsetWidth, mitte = px + 52;
      tip.style.left = Math.max(0, Math.min(box.clientWidth - w, mitte - w / 2)) + 'px'; tip.style.top = '-12px';
    };
    hit.addEventListener('pointermove', zeige); hit.addEventListener('pointerdown', zeige);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; kreuz.hidden = true; });
  }
}

function letzterTagVormonat() { return isoLocal(new Date(CUR_Y, CUR_M - 1, 0)); }
function oeffneKontostaende(reihe) {
  const akt = reihe.length ? reihe[reihe.length - 1] : null;
  const vorschlag = letzterTagVormonat();
  $('#vDatum').value = akt && akt.datum >= vorschlag ? isoLocal(HEUTE) : vorschlag;
  const konten = akt ? akt.konten.slice().sort((a, b) => GRUPPEN.indexOf(a.gruppe) - GRUPPEN.indexOf(b.gruppe)) : [];
  $('#vFelder').innerHTML = konten.map((k, i) => `<label class="field"><span><span>${esc(k.konto)}</span><span class="muted" style="font-weight:400">${esc(k.gruppe)}</span></span>
      <input type="text" inputmode="decimal" autocomplete="off" data-i="${i}" value="${k.saldo.toFixed(2)}"></label>`).join('')
    || '<div class="small muted">Noch keine Konten. Füge unten das erste hinzu.</div>';
  $('#vNeu').open = !konten.length;
  $('#vNeuName').value = ''; $('#vNeuSaldo').value = '';
  $('#vForm').onsubmit = async e => {
    e.preventDefault();
    const datum = $('#vDatum').value;
    if (!datum) { markInvalid($('#vDatum')); return toast('Bitte einen Stichtag wählen'); }
    const liste = [];
    for (const inp of $$('#vFelder input')) {
      const v = parseBetrag(inp.value);
      if (inp.value.trim() === '' || Number.isNaN(v)) { markInvalid(inp); return toast('Bitte überall einen Betrag eingeben (0 für leere Konten)'); }
      const k = konten[+inp.dataset.i]; liste.push({ konto: k.konto, gruppe: k.gruppe, saldo: v });
    }
    const neuName = $('#vNeuName').value.trim();
    if (neuName) {
      const v = parseBetrag($('#vNeuSaldo').value);
      if (Number.isNaN(v) || $('#vNeuSaldo').value.trim() === '') { markInvalid($('#vNeuSaldo')); return toast('Bitte den Saldo des neuen Kontos eingeben'); }
      if (konten.some(k => k.konto === neuName)) { markInvalid($('#vNeuName')); return toast('Dieses Konto gibt es schon'); }
      liste.push({ konto: neuName, gruppe: $('#vNeuGruppe').value, saldo: v });
    }
    if (!liste.length) return toast('Mindestens ein Konto erfassen');
    $('#vSave').disabled = true;
    try { await call('kontostaendeErfassen', datum, liste); }
    catch (err) { return fehler('Speichern', err); }
    finally { $('#vSave').disabled = false; }
    $('#vdlg').close();
    const neu = liste.reduce((s, k) => s + (k.gruppe === 'Schulden' ? -Math.abs(k.saldo) : k.saldo), 0);
    toast(`Gespeichert: Nettovermögen ${chf0(neu)} CHF per ${datumKurz(datum)}`);
    D = Daten.getDataSync(D.jahr); renderVermoegen(); load(D.jahr);
  };
  $('#vdlg').showModal();
}
$('#vClose').onclick = () => $('#vdlg').close();
$('#vdlg').addEventListener('click', e => { if (e.target === $('#vdlg')) $('#vdlg').close(); });
