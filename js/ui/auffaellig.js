// Budget-App – Auffälligkeiten der letzten 30 Tage in der Übersicht (grosse Ausgabe, Kategorie über Schnitt,
// Abo teurer oder neu, mögliche Doppelzahlung). «Passt so» blendet einen Hinweis auf diesem Gerät aus.
// Klassisches Skript: teilt den globalen Gültigkeitsbereich mit den anderen Dateien; Ladereihenfolge siehe index.html.

/* ---------- Auffälligkeiten ---------- */
const AF_KEY = 'budget.auffaellig.ok';
const afErledigt = () => { try { return new Set(JSON.parse(store.get(AF_KEY) || '[]')); } catch (e) { return new Set(); } };
const AF_TEXT = {
  doppelt: a => ({ titel: `Möglicherweise doppelt: ${a.buchung.notiz || a.buchung.kategorie}`,
    text: `${a.anzahl} × ${chf(a.betrag)} am ${fmtDate(a.buchung.datum)}. Zweimal bezahlt oder zwei Käufe?` }),
  gross: a => ({ titel: `Grosse Ausgabe: ${a.buchung.notiz || a.kategorie}`,
    text: `${chf0(a.betrag)} bei «${a.kategorie}» am ${fmtDate(a.buchung.datum)}. Sonst meist um ${chf0(a.ueblich)}, im letzten Jahr höchstens ${chf0(a.bisher)}.` }),
  teurer: a => ({ titel: `Teurer geworden: ${wkName(a.abo)}`,
    text: `Jetzt ${chf(a.jetzt)} statt ${chf(a.vorher)} (+${chf(a.jetzt - a.vorher)}, ${a.abo.rhythmus}).` }),
  kategorie: a => ({ titel: `${a.kategorie} über dem Üblichen`,
    text: `Diesen Monat bisher ${chf0(a.betrag)}, sonst im Schnitt ${chf0(a.schnitt)} pro Monat.` }),
  neu: a => ({ titel: `Neu regelmässig: ${wkName(a.abo)}`,
    text: `${wkBetrag(a.abo)} ${a.abo.rhythmus}, seit ${fmtDate(a.abo.erste)}. Gewollt?` })
};
let afAlle = false;

function auffaelligHtml() {
  if (!D || D.jahr !== CUR_Y || (monat !== 0 && monat !== CUR_M)) return '';
  const ok = afErledigt();
  const l = Logik.auffaelligkeiten(D.alle || D.buchungen, isoLocal(HEUTE), wkListe()).filter(a => !ok.has(a.id));
  if (!l.length) return '';
  const zeigen = afAlle ? l : l.slice(0, 3);
  AF_LISTE = l;
  return `<h2 class="section">Auffälligkeiten · letzte 30 Tage</h2><div class="card" style="padding-block:var(--s1)">
    ${zeigen.map((a, i) => { const t = AF_TEXT[a.art](a); return `<div class="rrow afrow">
      <div class="row" style="align-items:flex-start"><span class="afico" aria-hidden="true">!</span>
        <span class="grow"><b class="name" style="display:block">${esc(t.titel)}</b><span class="small muted">${esc(t.text)}</span></span></div>
      <div class="row afknoepfe">${a.buchung || a.kategorie || a.abo ? `<button type="button" class="ghost klein" data-af="${i}" data-act="ansehen">Ansehen</button>` : ''}
        <button type="button" class="ghost klein" data-af="${i}" data-act="ok">Passt so</button></div></div>`; }).join('')}
    ${l.length > 3 ? `<button type="button" class="ghost klein" id="afMehr" style="width:100%;margin:var(--s2) 0" aria-expanded="${afAlle}">${afAlle ? 'Weniger anzeigen' : `Alle ${l.length} anzeigen`}</button>` : ''}</div>`;
}
let AF_LISTE = [];
function bindAuffaellig(root) {
  $$('[data-af]', root).forEach(b => b.onclick = () => {
    const a = AF_LISTE[+b.dataset.af]; if (!a) return;
    if (b.dataset.act === 'ok') {
      const ok = afErledigt(); ok.add(a.id); store.set(AF_KEY, JSON.stringify([...ok].slice(-300)));
      renderUebersicht();
      toast('Hinweis ausgeblendet', { action: 'Rückgängig', onAction: () => { const o = afErledigt(); o.delete(a.id); store.set(AF_KEY, JSON.stringify([...o])); renderUebersicht(); } });
      return;
    }
    if (a.buchung) return openEdit(a.buchung);
    if (a.abo) { setAnsicht('auswertung'); offenWk = a.abo.typ + '|' + a.abo.kategorie + '|' + a.abo.name; renderAuswertung(); const s = $('#wk'); if (s) s.scrollIntoView({ block: 'start' }); return; }
    if (a.kategorie) { offeneKat = a.kategorie; renderKats(); const k = $$('#kats [data-k]').find(x => x.dataset.k === a.kategorie); if (k) k.scrollIntoView({ block: 'center' }); }
  });
  const m = $('#afMehr', root); if (m) m.onclick = () => { afAlle = !afAlle; renderUebersicht(); };
}
