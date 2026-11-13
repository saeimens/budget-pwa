// Budget-App – Liste «Zu prüfen», Regeln merken.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Prüfen ---------- */
function renderBadge() {
  const n = D.offen.length;
  $('#badge').hidden = !n; $('#badge').textContent = n;
  $('nav [data-v=pruefen]').setAttribute('aria-label', n ? `Prüfen, ${n} offen` : 'Prüfen');
  $('#pruefenInfo').textContent = n
    ? `${n} Buchung${n === 1 ? '' : 'en'} ohne passende Regel. Kategorie wählen und speichern – optional als Regel für künftige Importe.`
    : '';
}

function renderPruefen() {
  pruefenStale = false;
  const el = $('#pruefen');
  if (!D.offen.length) {
    el.innerHTML = `<div class="card empty"><b>Alles zugeordnet 🎉</b>
      <span class="small muted">Neue Buchungen ohne passende Regel erscheinen nach dem Import hier.</span></div>`;
    return;
  }
  el.innerHTML = D.offen.map(b => `
    <article class="card stack pcard" data-row="${b.row}">
      <div class="row" style="align-items:flex-start">
        <div class="grow"><b>${esc(b.notiz || 'Ohne Bezeichnung')}</b><div class="small muted">${fmtDate(b.datum)} · ${esc(b.konto)}</div></div>
        <div class="num amt">${chf(b.betrag)}</div></div>
      ${b.banktext ? `<div class="bank">${esc(b.banktext)}</div>` : ''}
      <div class="grid2">
        <label class="field"><span>Typ</span><select class="pTyp">${typOpts(b.typ)}</select></label>
        <label class="field"><span class="pKatLabel">Kategorie</span><select class="pKat">${katOpts(b.kategorie)}</select></label>
      </div>
      <label class="field"><span>Notiz</span><input type="text" class="pNotiz" value="${esc(b.notiz)}"></label>
      <label class="check"><input type="checkbox" class="pRegel"> Als Regel für künftige Importe merken</label>
      <label class="field pRegelFeld" hidden><span>Suchbegriff (muss im Banktext vorkommen)</span>
        <input type="text" class="pBegriff" value="${esc(suggestTerm(b))}"></label>
      <div class="row"><button type="button" class="ghost danger pDel">Löschen</button>
        <button type="button" class="grow pOk">Speichern</button></div>
    </article>`).join('');
  $$('.pcard', el).forEach((card, i) => bindPcard(card, D.offen[i]));
}

function bindPcard(card, b) {
  const typ = $('.pTyp', card), kat = $('.pKat', card), chk = $('.pRegel', card);
  typ.onchange = () => katLabel(typ.value, $('.pKatLabel', card));
  katLabel(typ.value, $('.pKatLabel', card));
  chk.onchange = () => { $('.pRegelFeld', card).hidden = !chk.checked; if (chk.checked) $('.pBegriff', card).focus(); };
  const busy = on => { card.classList.toggle('saving', on); $$('button', card).forEach(x => x.disabled = on); };

  $('.pOk', card).onclick = async () => {
    if (!kat.value && typ.value === 'Ausgabe') { markInvalid(kat); return toast('Bitte eine Kategorie wählen'); }
    const begriff = $('.pBegriff', card).value.trim();
    if (chk.checked && !begriff) { markInvalid($('.pBegriff', card)); return toast('Bitte einen Suchbegriff für die Regel eingeben'); }
    const regel = chk.checked ? { suchbegriff:begriff, kategorie:kat.value, typ:typ.value } : null;
    busy(true);
    try { await call('updateBuchung', b.row, { kategorie:kat.value, typ:typ.value, notiz:$('.pNotiz', card).value.trim(), status:'ok' }, regel, expect(b)); }
    catch (e) { busy(false); return fehler('Speichern', e); }
    entferneOffen(card, b);
    toast(regel ? 'Gespeichert und Regel angelegt' : 'Gespeichert');
    load(D.jahr);
  };
  $('.pDel', card).onclick = async () => {
    busy(true);
    try { await call('deleteBuchung', b.row, expect(b)); }
    catch (e) { busy(false); return fehler('Löschen', e); }
    entferneOffen(card, b);
    toast('Buchung gelöscht', { action:'Rückgängig', onAction:() => undoDelete(b) });
    load(D.jahr);
  };
}
// gleiche Buchung? (Zeilennummern können sich nach dem Neuladen verschoben haben)
const gleich = (x, b) => x.key ? x.key === b.key
  : x.datum === b.datum && x.betrag === b.betrag && x.banktext === b.banktext;
function entferneOffen(card, b) {
  const i = D.offen.findIndex(x => gleich(x, b));
  if (i >= 0) D.offen.splice(i, 1);
  card.remove(); renderBadge();
  if (!D.offen.length) renderPruefen();
}
function suggestTerm(b) { return String(b.banktext || b.notiz).split(/[|;]/)[0].replace(/\s+/g, ' ').trim().slice(0, 40); }
