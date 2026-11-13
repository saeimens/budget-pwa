// Budget-App – Liste «Zu prüfen»: Vorschläge aus früheren Buchungen, gleiche Händler gruppiert, Regeln merken.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Prüfen ---------- */
function renderBadge() {
  const n = D.offen.length;
  $('#badge').hidden = !n; $('#badge').textContent = n;
  $('nav [data-v=pruefen]').setAttribute('aria-label', n ? `Prüfen, ${n} offen` : 'Prüfen');
  $('#pruefenInfo').textContent = n
    ? `${n} Buchung${n === 1 ? '' : 'en'} ohne passende Regel. Vorschläge stammen aus deinen früheren Zuordnungen beim gleichen Händler.`
    : '';
}

/** Händler aus dem Banktext: ohne Zahlen, Länderkürzel, Fremdwährung, Klammern – die ersten drei Wörter */
function haendler(b) {
  const roh = String(b.banktext || b.notiz || '').split(/[|;]/)[0]
    .replace(/\([^)]*\)/g, ' ').replace(/\*/g, ' ').replace(/[0-9]+/g, ' ')
    .replace(/\b[A-Z]{3}$/i, ' ').replace(/[^\p{L}&.' -]/gu, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  return roh.split(' ').filter(w => w.length > 1 && !w.includes('.')).slice(0, 3).join(' ');   // Domains (help.uber.comGBR) weglassen
}

/** Häufigste frühere Zuordnung pro Händler (nur bestätigte Buchungen) */
function zuordnungsGedaechtnis() {
  const m = new Map();
  (D.alle || D.buchungen).forEach(b => {
    if (b.status === 'prüfen' || (!b.kategorie && b.typ === 'Ausgabe')) return;
    if (/^Reise\s|^Kreditkarte \(ohne Details\)/.test(b.kategorie)) return;   // gelten nur für eine bestimmte Reise / Zeit
    const h = haendler(b); if (!h) return;
    const z = m.get(h) || new Map(), k = b.typ + '|' + b.kategorie;
    z.set(k, (z.get(k) || 0) + 1); m.set(h, z);
  });
  return h => {
    const z = m.get(h); if (!z) return null;
    const [k, n] = [...z.entries()].sort((a, b) => b[1] - a[1])[0];
    const [typ, kategorie] = k.split('|');
    return { typ, kategorie, n };
  };
}

let geteilt = new Set();   // Händler-Gruppen, die einzeln bearbeitet werden
function renderPruefen() {
  pruefenStale = false;
  const el = $('#pruefen');
  if (!D.offen.length) {
    el.innerHTML = `<div class="card empty"><b>Alles zugeordnet 🎉</b>
      <span class="small muted">Neue Buchungen ohne passende Regel erscheinen nach dem Import hier.</span></div>${kontrolleHtml()}`;
    return bindKontrolle(el);
  }
  const vorschlag = zuordnungsGedaechtnis();
  // gleiche Händler zusammenfassen (Reihenfolge: grösste Gruppe zuerst, dann wie bisher)
  const gruppen = new Map();
  D.offen.forEach(b => { const h = haendler(b) || '#' + b.row; if (!gruppen.has(h)) gruppen.set(h, []); gruppen.get(h).push(b); });
  const liste = [...gruppen.entries()].sort((a, b) => b[1].length - a[1].length);

  const hinweis = vs => vs ? `<div class="small" style="color:var(--accent)"><span aria-hidden="true">✓</span>
      Vorschlag: ${esc(vs.kategorie || vs.typ)} – wie ${vs.n} frühere Buchung${vs.n === 1 ? '' : 'en'}</div>` : '';
  const felder = (typ, kat) => `<div class="grid2">
      <label class="field"><span>Typ</span><select class="pTyp">${typOpts(typ)}</select></label>
      <label class="field"><span class="pKatLabel">Kategorie</span><select class="pKat">${katOpts(kat)}</select></label></div>`;
  const regel = begriff => `<label class="check"><input type="checkbox" class="pRegel"> Als Regel für künftige Importe merken</label>
      <label class="field pRegelFeld" hidden><span>Suchbegriff (muss im Banktext vorkommen)</span>
        <input type="text" class="pBegriff" value="${esc(begriff)}"></label>`;

  el.innerHTML = liste.map(([h, bs]) => {
    const vs = vorschlag(h);
    if (bs.length > 1 && !geteilt.has(h)) {
      const total = bs.reduce((s, b) => s + b.betrag, 0);
      return `<article class="card stack pcard pgruppe" data-h="${esc(h)}">
        <div class="row" style="align-items:flex-start">
          <div class="grow"><b>${esc(bs[0].notiz || h)}</b><div class="small muted">${bs.length} Buchungen beim gleichen Händler</div></div>
          <div class="num amt">${chf(total)}</div></div>
        <ul class="small muted" style="margin:0;padding-left:var(--s4)">${bs.map(b => `<li>${fmtDate(b.datum)} · ${esc(b.konto)} · <span class="num">${chf(b.betrag)}</span></li>`).join('')}</ul>
        ${hinweis(vs)}${felder(vs ? vs.typ : bs[0].typ, vs ? vs.kategorie : bs[0].kategorie)}${regel(suggestTerm(bs[0]))}
        <div class="row"><button type="button" class="ghost pEinzeln">Einzeln bearbeiten</button>
          <button type="button" class="grow pOk">Alle ${bs.length} speichern</button></div>
      </article>`;
    }
    return bs.map(b => {
      const v = b.kategorie ? null : vs;
      return `<article class="card stack pcard" data-row="${b.row}">
        <div class="row" style="align-items:flex-start">
          <div class="grow"><b>${esc(b.notiz || 'Ohne Bezeichnung')}</b><div class="small muted">${fmtDate(b.datum)} · ${esc(b.konto)}</div></div>
          <div class="num amt">${chf(b.betrag)}</div></div>
        ${b.banktext ? `<div class="bank">${esc(b.banktext)}</div>` : ''}
        ${hinweis(v)}${felder(v ? v.typ : b.typ, v ? v.kategorie : b.kategorie)}
        <label class="field"><span>Notiz</span><input type="text" class="pNotiz" value="${esc(b.notiz)}"></label>
        ${regel(suggestTerm(b))}
        <div class="row"><button type="button" class="ghost danger pDel">Löschen</button>
          <button type="button" class="grow pOk">Speichern</button></div>
      </article>`;
    }).join('');
  }).join('') + kontrolleHtml();

  $$('.pcard', el).forEach(card => {
    if (card.dataset.h !== undefined) return bindGruppe(card, gruppen.get(card.dataset.h), card.dataset.h);
    bindPcard(card, D.offen.find(b => String(b.row) === card.dataset.row));
  });
  bindKontrolle(el);
}

function bindFelder(card) {
  const typ = $('.pTyp', card), kat = $('.pKat', card), chk = $('.pRegel', card);
  typ.onchange = () => katLabel(typ.value, $('.pKatLabel', card));
  katLabel(typ.value, $('.pKatLabel', card));
  chk.onchange = () => { $('.pRegelFeld', card).hidden = !chk.checked; if (chk.checked) $('.pBegriff', card).focus(); };
  const busy = on => { card.classList.toggle('saving', on); $$('button', card).forEach(x => x.disabled = on); };
  /** Eingaben prüfen; liefert { typ, kategorie, regel } oder null */
  const werte = () => {
    if (!kat.value && typ.value === 'Ausgabe') { markInvalid(kat); toast('Bitte eine Kategorie wählen'); return null; }
    const begriff = $('.pBegriff', card).value.trim();
    if (chk.checked && !begriff) { markInvalid($('.pBegriff', card)); toast('Bitte einen Suchbegriff für die Regel eingeben'); return null; }
    return { typ: typ.value, kategorie: kat.value, regel: chk.checked ? { suchbegriff: begriff, kategorie: kat.value, typ: typ.value } : null };
  };
  return { busy, werte };
}

function bindPcard(card, b) {
  const { busy, werte } = bindFelder(card);
  $('.pOk', card).onclick = async () => {
    const w = werte(); if (!w) return;
    busy(true);
    try { await call('updateBuchung', b.row, { kategorie: w.kategorie, typ: w.typ, notiz: $('.pNotiz', card).value.trim(), status: 'ok' }, w.regel, expect(b)); }
    catch (e) { busy(false); return fehler('Speichern', e); }
    entferneOffen(card, [b]);
    toast(w.regel ? 'Gespeichert und Regel angelegt' : 'Gespeichert');
    load(D.jahr);
  };
  $('.pDel', card).onclick = async () => {
    busy(true);
    try { await call('deleteBuchung', b.row, expect(b)); }
    catch (e) { busy(false); return fehler('Löschen', e); }
    entferneOffen(card, [b]);
    toast('Buchung gelöscht', { action: 'Rückgängig', onAction: () => undoDelete(b) });
    load(D.jahr);
  };
}

function bindGruppe(card, bs, h) {
  const { busy, werte } = bindFelder(card);
  $('.pEinzeln', card).onclick = () => { geteilt.add(h); renderPruefen(); };
  $('.pOk', card).onclick = async () => {
    const w = werte(); if (!w) return;
    busy(true);
    let fertig = 0;
    try {
      for (const b of bs) {   // nacheinander: die Regel nur einmal anlegen
        await call('updateBuchung', b.row, { kategorie: w.kategorie, typ: w.typ, status: 'ok' }, fertig ? null : w.regel, expect(b));
        fertig++;
      }
    } catch (e) {
      busy(false); fehler('Speichern', e);
      if (fertig) { entferneOffen(null, bs.slice(0, fertig)); load(D.jahr, { pruefen: true }); }
      return;
    }
    entferneOffen(card, bs);
    toast(`${bs.length} Buchungen gespeichert${w.regel ? ' und Regel angelegt' : ''}`);
    load(D.jahr);
  };
}

// gleiche Buchung? (Zeilennummern können sich nach dem Neuladen verschoben haben)
const gleich = (x, b) => x.key ? x.key === b.key
  : x.datum === b.datum && x.betrag === b.betrag && x.banktext === b.banktext;
function entferneOffen(card, bs) {
  bs.forEach(b => { const i = D.offen.findIndex(x => gleich(x, b)); if (i >= 0) D.offen.splice(i, 1); });
  if (card) card.remove();
  renderBadge();
  if (!D.offen.length) renderPruefen();
}
function suggestTerm(b) { return String(b.banktext || b.notiz).split(/[|;]/)[0].replace(/\s+/g, ' ').trim().slice(0, 40); }

/* ---------- Kontrolle: Kategorie weicht von der üblichen beim gleichen Händler ab ---------- */
// Ziel: verlässliche Summen pro Kategorie über viele Jahre. Gewollte Ausnahmen bleiben mit «Passt so» (Tag «Kontrolle:ok») ruhig.
const KONTROLLE_OK = 'Kontrolle:ok';
const KONTROLLE_MIN = 3, KONTROLLE_ANTEIL = 0.7;   // Rückblick 2024/25: 6 Meldungen bei 1241 Buchungen
let KONTROLLE = [];
const kTags = b => String(b.tags || '').split(',').map(t => t.trim()).filter(Boolean);

function kontrolleListe() {
  const ausnahme = k => /^Reise\s|^Kreditkarte \(ohne Details\)/.test(k);
  const basis = (D.alle || D.buchungen).filter(b => b.banktext && b.status !== 'prüfen' && !ausnahme(b.kategorie));
  const m = new Map();
  basis.forEach(b => {
    const h = haendler(b); if (!h || kTags(b).includes(KONTROLLE_OK)) return;   // bestätigte Ausnahmen verwässern die Regel nicht
    const z = m.get(h) || new Map(), k = b.typ + '|' + b.kategorie;
    z.set(k, (z.get(k) || 0) + 1); m.set(h, z);
  });
  const c = Daten.cache(), regeln = Logik.regelnAusZeilen((c && c.regelnRows) || []);
  const liste = [];
  basis.forEach(b => {
    if (kTags(b).includes(KONTROLLE_OK)) return;
    const z = m.get(haendler(b)); if (!z) return;
    const total = [...z.values()].reduce((a, n) => a + n, 0);
    const [dk, dn] = [...z.entries()].sort((a, x) => x[1] - a[1])[0];
    const k = b.typ + '|' + b.kategorie;
    if (k === dk || dn < KONTROLLE_MIN || dn / total < KONTROLLE_ANTEIL) return;
    // trifft eine Regel genau diese Zuordnung (Betragsgrenze, Faktor), ist sie gewollt
    const r = Logik.classify({ text: b.banktext, betrag: b.typ === 'Einnahme' ? b.betrag : -b.betrag, name: '', konto: '' }, regeln);
    if (r.typ !== 'Ignorieren' && r.typ + '|' + r.kategorie === k) return;
    const [typ, kategorie] = dk.split('|');
    liste.push({ b, typ, kategorie, n: dn });
  });
  return liste.sort((a, x) => x.b.datum.localeCompare(a.b.datum));
}

function kontrolleHtml() {
  KONTROLLE = kontrolleListe();
  if (!KONTROLLE.length) return '';
  const name = (typ, kat) => kat || typ;
  return `<h2 class="section">Kontrolle · ${KONTROLLE.length} abweichende Kategorie${KONTROLLE.length === 1 ? '' : 'n'}</h2>
    <p class="small muted" style="margin-top:0">Diese Buchungen sind anders zugeordnet als sonst beim gleichen Händler.
      Stimmt es so, tippe «Passt so» – dann erscheint die Buchung hier nicht mehr.</p>
    ${KONTROLLE.map((x, i) => `<article class="card stack kcard" data-i="${i}">
      <div class="row" style="align-items:flex-start">
        <div class="grow"><b>${esc(x.b.notiz || x.b.banktext)}</b><div class="small muted">${fmtDate(x.b.datum)} · ${esc(x.b.konto)}</div></div>
        <div class="num amt">${chf(x.b.betrag)}</div></div>
      <div class="small">Gebucht als <b>${esc(name(x.b.typ, x.b.kategorie))}</b> – sonst ${x.n}× <b>${esc(name(x.typ, x.kategorie))}</b></div>
      <div class="row"><button type="button" class="ghost kOk">Passt so</button>
        <button type="button" class="grow kAendern">Zu «${esc(name(x.typ, x.kategorie))}» ändern</button></div>
    </article>`).join('')}`;
}

function bindKontrolle(el) {
  $$('.kcard', el).forEach(card => {
    const x = KONTROLLE[+card.dataset.i], b = x.b;
    const busy = on => { card.classList.toggle('saving', on); $$('button', card).forEach(k => k.disabled = on); };
    const fertig = meldung => { card.hidden = true; toast(meldung); load(D.jahr, { pruefen: true }); };
    $('.kOk', card).onclick = async () => {
      busy(true);
      try { await call('tagsSetzen', [{ row: b.row, expect: expect(b), tags: kTags(b).concat(KONTROLLE_OK).join(', ') }]); }
      catch (e) { busy(false); return fehler('Speichern', e); }
      fertig('Bleibt so');
    };
    $('.kAendern', card).onclick = async () => {
      busy(true);
      try { await call('updateBuchung', b.row, { typ: x.typ, kategorie: x.kategorie }, null, expect(b)); }
      catch (e) { busy(false); return fehler('Speichern', e); }
      fertig(`Geändert zu «${x.kategorie || x.typ}»`);
    };
  });
}
