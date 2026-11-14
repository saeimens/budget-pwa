// Budget-App – wiederkehrende Zahlungen: «Demnächst fällig» im Budget, Übersicht mit Fixkosten in der Auswertung.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Wiederkehrende Zahlungen ---------- */
let offenWk = null;   // aufgeklappte Zeile in der Auswertung
const WK_REIHE = ['monatlich', 'vierteljährlich', 'halbjährlich', 'jährlich'];
/* Ausgeblendete («nicht wiederkehrend / gekündigt») stehen im Blatt «Einstellungen» → «Nicht wiederkehrend», getrennt mit « ;; » */
const WK_AUS = 'Nicht wiederkehrend', WK_TRENN = ' ;; ';
const wkAusgeblendet = () => new Set(String(((D && D.einst) || {})[WK_AUS] || '').split(WK_TRENN).map(s => s.trim()).filter(Boolean));
const wkOpts = () => {
  const gruppe = {}; ((D && D.kategorien) || []).forEach(k => gruppe[k.name] = k.gruppe);
  return { abo: k => gruppe[k] === 'Abos', aus: wkAusgeblendet() };
};
const wkListe = () => (D ? Logik.wiederkehrend(D.alle || D.buchungen, isoLocal(HEUTE), undefined, wkOpts()) : []);
async function wkAusblendenSpeichern(set, meldung, rueckgaengig) {
  const row = (D.einstRow || {})[WK_AUS], wert = [...set].join(WK_TRENN);
  try {
    await call('blattAendern', 'Einstellungen', row ? 'setzen' : 'neu', row || Math.max(1, ...Object.values(D.einstRow || {})), [WK_AUS, wert], row ? WK_AUS : '');
    anzeigen(Daten.getDataSync(D.jahr));
    if (meldung) toast(meldung, rueckgaengig ? { action: 'Rückgängig', onAction: rueckgaengig } : {});
  } catch (e) { fehler('Speichern', e); }
}
const wkBetrag = w => `${w.variabel ? '≈ ' : ''}${chf0(w.betrag)}`;
const wkName = w => esc(String(w.name).replace(/\s*\((\d{1,2}\/\d{4}|Rechnung)\)\s*$/, ''));

/** Karte «Demnächst fällig» (laufender Monat bzw. laufendes Jahr): Termine der nächsten 30 Tage, bis 7 Tage überfällig */
function demnaechstHtml() {
  if (!D || D.jahr !== CUR_Y || (monat !== 0 && monat !== CUR_M)) return '';
  const heute = isoLocal(HEUTE), bis = isoLocal(new Date(CUR_Y, CUR_M - 1, HEUTE.getDate() + 30));
  const l = wkListe().filter(w => w.naechste <= bis);
  if (!l.length) return '';
  const summe = l.reduce((a, w) => a + w.betrag, 0);
  return `<h2 class="section">Demnächst fällig · 30 Tage</h2><div class="card" style="padding-block:var(--s1)">
    ${l.slice(0, 6).map(w => {
      const ueber = w.naechste < heute;
      return `<div class="rrow row"><span class="wkdat ${ueber ? 'warn' : ''}">${ueber ? 'fällig seit ' : ''}${fmtDate(w.naechste)}</span>
        <span class="grow"><span class="name" style="display:block">${wkName(w)}</span><span class="small muted">${esc(w.rhythmus)} · ${esc(w.kategorie || w.typ)}</span></span>
        <span class="num">${wkBetrag(w)}</span></div>`;
    }).join('')}
    <div class="row small muted" style="padding:var(--s2) 0"><span class="grow">${l.length > 6 ? `und ${l.length - 6} weitere · ` : ''}zusammen ≈ <b class="num">${chf0(summe)}</b></span>
      <button type="button" class="ghost klein" id="zuWk">Alle wiederkehrenden</button></div></div>`;
}
function bindDemnaechst(root) {
  const b = $('#zuWk', root);
  if (b) b.onclick = () => { setAnsicht('auswertung'); const s = $('#wk'); if (s) s.scrollIntoView({ block: 'start' }); };
}

/** Abschnitt in der Auswertung: alle erkannten wiederkehrenden Zahlungen nach Rhythmus, mit Fixkosten pro Monat */
function wiederkehrendHtml() {
  const l = wkListe(), aus = wkAusgeblendet();
  if (!l.length && !aus.size) return '';
  const fix = l.filter(w => w.typ !== 'Sparen').reduce((a, w) => a + w.proMonat, 0);
  const spar = l.filter(w => w.typ === 'Sparen').reduce((a, w) => a + w.proMonat, 0);
  return `<h2 class="section" id="wk">Wiederkehrende Zahlungen · antippen für Buchungen</h2>
    <div class="card" style="padding-block:var(--s2)">
      <div class="row" style="padding:var(--s2) 0"><span class="grow label">Fixkosten pro Monat</span><b class="num">≈ ${chf0(fix)}</b></div>
      ${spar ? `<div class="row small muted" style="padding-bottom:var(--s2)"><span class="grow">dazu regelmässig gespart</span><span class="num">≈ ${chf0(spar)}</span></div>` : ''}
      ${WK_REIHE.filter(r => l.some(w => w.rhythmus === r)).map(r => `<div class="section" style="margin:var(--s3) 0 0">${r[0].toUpperCase() + r.slice(1)}</div>
        ${l.filter(w => w.rhythmus === r).sort((a, b) => b.betrag - a.betrag).map(w => {
          const key = w.typ + '|' + w.kategorie + '|' + w.name, offen = offenWk === key;
          return `<div class="rrow-wrap"><button type="button" class="plain cat rrow" data-wk="${esc(key)}" aria-expanded="${offen}">
              <span class="row"><span class="grow name">${wkName(w)}</span><span class="num">${wkBetrag(w)}</span>${ico('chev', 'chev', 18)}</span>
              <span class="small muted" style="display:block">${esc(w.kategorie || w.typ)}${w.typ === 'Sparen' ? ' · Sparen' : ''} · nächste ${fmtDate(w.naechste)}${r !== 'monatlich' ? ` · ≈ ${chf0(w.proMonat)} pro Monat` : ''}</span>
            </button>${offen ? `<div class="cat-detail">${txList(w.buchungen.slice().sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 12))}
              <div class="row" style="justify-content:flex-end;padding:var(--s2) 0"><button type="button" class="ghost klein" data-wkaus="${esc(key)}">Nicht wiederkehrend / gekündigt</button></div></div>` : ''}</div>`;
        }).join('')}`).join('')}
      <div class="small muted" style="margin:var(--s2) 0">Erkannt aus deinen Buchungen: gleiche Kategorie und Notiz in regelmässigem Abstand. «≈» heisst, der Betrag schwankt.
        Lektionen und andere unregelmässige Zahlungen sind nicht dabei. Falsch erkannt oder gekündigt? Antippen und ausblenden.</div>
      ${aus.size ? `<details style="margin-bottom:var(--s2)"><summary>${aus.size} ausgeblendet</summary>${[...aus].map(k => `<div class="row small" style="padding:var(--s1) 0">
        <span class="grow">${esc(k.split('|').slice(2).join('|'))} <span class="muted">· ${esc(k.split('|')[1])}</span></span>
        <button type="button" class="ghost klein" data-wkein="${esc(k)}">Wieder einblenden</button></div>`).join('')}</details>` : ''}
    </div>`;
}
function bindWiederkehrend(root, neuZeichnen) {
  $$('[data-wk]', root).forEach(b => b.onclick = () => { offenWk = offenWk === b.dataset.wk ? null : b.dataset.wk; neuZeichnen(); });
  $$('[data-wkaus]', root).forEach(b => b.onclick = async () => {
    const k = b.dataset.wkaus, s = wkAusgeblendet(); s.add(k); offenWk = null;
    await wkAusblendenSpeichern(s, 'Ausgeblendet', async () => { const t = wkAusgeblendet(); t.delete(k); await wkAusblendenSpeichern(t, 'Wieder eingeblendet'); neuZeichnen(); });
    neuZeichnen();
  });
  $$('[data-wkein]', root).forEach(b => b.onclick = async () => { const s = wkAusgeblendet(); s.delete(b.dataset.wkein); await wkAusblendenSpeichern(s, 'Wieder eingeblendet'); neuZeichnen(); });
}
