/**
 * Budget-App – Import-Logik (läuft im Browser, ohne Server).
 * Erkennt UBS-Konto, UBS-Kreditkarte, Wise und das Format «Budget-App Import».
 * Persönliche Angaben (Regeln, Kurse, IBAN-Teil) kommen aus dem Google Sheet, nicht aus dem Code.
 */
const Logik = (() => {

  /** CSV-Parser mit Anführungszeichen (Ersatz für Utilities.parseCsv) */
  function parseCsv(text, d) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  function parseNum(s) {
    if (s === undefined || s === null || s === '') return 0;
    const n = Number(String(s).replace(/'/g, '').replace(/\s/g, ''));
    return isNaN(n) ? 0 : n;
  }
  const cleanName = s => String(s || '').split(';')[0].replace(/\s+/g, ' ').trim();
  const r2 = n => Math.round(n * 100) / 100;

  function parseUbsKonto(text, einst) {
    const lines = text.split(/\r?\n/);
    const kontoLine = (lines.find(l => l.startsWith('IBAN:')) || '').replace(/\s/g, '');
    // Kontoname aus den Einstellungen «IBAN-Teil <Name>» (z. B. Rückstellungskonto, Assistenzkonto); sonst Lohnkonto
    const treffer = Object.keys(einst || {}).map(k => k.match(/^IBAN-Teil\s+(.+)$/)).filter(Boolean)
      .find(m => { const teil = String(einst[m[0]] || '').replace(/\s/g, ''); return teil && kontoLine.replace(/\s/g, '').includes(teil); });
    const kontoName = treffer ? treffer[1].trim() : 'Lohnkonto';
    const start = lines.findIndex(l => l.startsWith('Abschlussdatum;'));
    const data = parseCsv(lines.slice(start).join('\n'), ';');
    const h = data[0], ix = n => h.indexOf(n);
    const rows = [], hinweise = [];
    data.slice(1).forEach(r => {
      if (r.length < 10 || !r[ix('Abschlussdatum')]) return;
      const bel = parseNum(r[ix('Belastung')]), gut = parseNum(r[ix('Gutschrift')]);
      const betrag = gut ? gut : bel;   // Belastung ist negativ
      if (!betrag) return;
      // vorgemerkt (noch ohne Buchungsdatum): UBS vergibt beim Verbuchen eine neue Transaktions-Nr. →
      // jetzt weglassen, sonst entsteht beim nächsten Import ein Doppel. Kommt verbucht mit dem nächsten Auszug.
      if (ix('Buchungsdatum') >= 0 && !r[ix('Buchungsdatum')]) {
        hinweise.push('Noch nicht verbucht, kommt mit dem nächsten Import: ' + cleanName(r[ix('Beschreibung1')]) + ' (' + r[ix('Abschlussdatum')] + ', ' + betrag.toFixed(2) + ')');
        return;
      }
      const b1 = r[ix('Beschreibung1')] || '', b2 = r[ix('Beschreibung2')] || '', b3 = r[ix('Beschreibung3')] || '';
      rows.push({
        datum: r[ix('Abschlussdatum')], betrag, name: cleanName(b1), text: [b1, b2, b3].join(' | '),
        konto: kontoName, key: 'UBS|' + (r[ix('Transaktions-Nr.')] || '') + '|' + betrag.toFixed(2)
      });
    });
    // Kopfzeilen «Bis:» und «Schlusssaldo:» → Kontostand am Ende des Auszugs
    const kopf = n => { const l = lines.find(x => x.startsWith(n + ':')); return l ? l.split(';')[1] : ''; };
    const bis = String(kopf('Bis') || '').trim(), schluss = kopf('Schlusssaldo');
    const saldo = /^\d{4}-\d{2}-\d{2}$/.test(bis) && schluss !== '' ? { konto: kontoName, datum: bis, betrag: parseNum(schluss) } : null;
    return { format: 'UBS ' + kontoName, rows, saldo, hinweise };
  }

  function parseUbsKarte(text) {
    const lines = text.split(/\r?\n/).filter(l => !l.startsWith('sep='));
    const data = parseCsv(lines.join('\n'), ';');
    const h = data[0], ix = n => h.indexOf(n);
    const hinweise = [], alle = [];
    data.slice(1).forEach(r => {
      if (r.length < 10 || !r[ix('Einkaufsdatum')]) return;
      const bel = parseNum(r[ix('Belastung')]), gut = parseNum(r[ix('Gutschrift')]);
      const txt = r[ix('Buchungstext')] || '';
      if (/LSV-ZAHLUNG|IHRE ZAHLUNG/i.test(txt)) return;          // Bezahlung der Karte vom Konto
      if (!bel && !gut) { hinweise.push('Noch nicht verbucht: ' + txt + ' (' + r[ix('Betrag')] + ' ' + r[ix('Originalwährung')] + ')'); return; }
      const betrag = gut ? gut : -bel;
      const d = r[ix('Einkaufsdatum')].split('.');
      const datum = d[2] + '-' + d[1] + '-' + d[0];
      const orig = r[ix('Originalwährung')] && r[ix('Originalwährung')] !== 'CHF' ? ' (' + r[ix('Betrag')] + ' ' + r[ix('Originalwährung')] + ')' : '';
      alle.push({ i: alle.length, datum, betrag, betrag0: betrag, txt, orig, zuschlag: /ZUSCHLAG/i.test(txt) });
    });
    // 1.75 %-Auslandszuschlag steht als eigene Zeile beim Einkauf, mal darüber, mal darunter → zum Einkauf vom selben Tag
    // addieren, zu dem die 1.75 % rechnerisch passen; sonst zur Nachbarzeile vom selben Tag; sonst bleibt er eine eigene Buchung.
    const kaeufe = alle.filter(x => !x.zuschlag);
    alle.filter(x => x.zuschlag).forEach(z => {
      const frei = kaeufe.filter(k => k.datum === z.datum && !k.mitZuschlag);
      const abw = k => Math.abs(Math.round(Math.abs(k.betrag) * 1.75) / 100 - Math.abs(z.betrag));
      let ziel = frei.filter(k => abw(k) <= 0.011).sort((a, b) => abw(a) - abw(b) || Math.abs(a.i - z.i) - Math.abs(b.i - z.i))[0];
      if (!ziel) ziel = frei.find(k => k.i === z.i - 1) || frei.find(k => k.i === z.i + 1);
      if (ziel) { ziel.betrag = r2(ziel.betrag + z.betrag); ziel.mitZuschlag = true; z.verrechnet = true; }
    });
    const rows = alle.filter(x => !x.verrechnet).map(x => ({ datum: x.datum, betrag: x.betrag,
      name: cleanName(x.txt) + x.orig + (x.mitZuschlag ? ' (inkl. 1.75 % Zuschlag)' : ''), text: x.txt + x.orig, konto: 'Kreditkarte',
      // Schlüssel mit dem Betrag ohne Zuschlag (wie seit jeher), damit bereits importierte Buchungen erkannt werden
      key: 'KK|' + x.datum + '|' + x.betrag0.toFixed(2) + '|' + x.txt.slice(0, 40) }));
    // identische Käufe am selben Tag eindeutig machen
    const gesehen = {};
    rows.forEach(r => { gesehen[r.key] = (gesehen[r.key] || 0) + 1; if (gesehen[r.key] > 1) r.key += '#' + gesehen[r.key]; });
    return { format: 'UBS Kreditkarte', rows, hinweise };
  }

  function parseWise(text, einst) {
    const data = parseCsv(text, ',');
    const h = data[0], ix = n => h.indexOf(n);
    const rows = [], hinweise = [];
    data.slice(1).forEach(r => {
      const id = r[ix('ID')] || '';
      if (!id.startsWith('CARD_TRANSACTION') || r[ix('Status')] !== 'COMPLETED') return;   // nur Kartenzahlungen
      const cur = r[ix('Ausgangswährung')], amt = parseNum(r[ix('Ausgangsbetrag (nach Gebühren)')]);
      const name = r[ix('Name des Empfängers')] || '';
      let chf = amt;
      if (cur !== 'CHF') {
        const k = Number(einst['Wise-Kurs ' + cur]);
        if (!k) { hinweise.push('Kein Kurs für ' + cur + ' (Einstellungen): ' + name); return; }
        chf = r2(amt * k);
      }
      rows.push({ datum: String(r[ix('Erstellt am')]).slice(0, 10), betrag: r[ix('Richtung')] === 'OUT' ? -chf : chf,
        name: name + ' (' + cur + ' ' + amt.toFixed(2) + ')', text: name + ' | ' + (r[ix('Kategorie')] || '') + ' | ' + cur + ' ' + amt.toFixed(2),
        konto: 'Wise', key: 'WISE|' + id });
    });
    return { format: 'Wise', rows, hinweise };
  }

  /** Bereits zugeordnete Buchungen (Nachimport). Erste Zeile «Budget-App Import». */
  function parseFertig(text) {
    const data = parseCsv(text.split(/\r?\n/).slice(1).join('\n'), ';');
    const h = data[0], ix = n => h.indexOf(n);
    const typen = ['Ausgabe', 'Einnahme', 'Rückstellung', 'Sparen'];
    const rows = [];
    data.slice(1).forEach((r, i) => {
      if (!r[ix('Datum')]) return;
      const datum = r[ix('Datum')], typ = r[ix('Typ')], betrag = parseNum(r[ix('Betrag')]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error('Zeile ' + (i + 2) + ': Datum ungültig: ' + datum);
      if (!typen.includes(typ)) throw new Error('Zeile ' + (i + 2) + ': Typ ungültig: ' + typ);
      if (!betrag) throw new Error('Zeile ' + (i + 2) + ': Betrag fehlt');
      rows.push({ datum, typ, betrag, kategorie: r[ix('Kategorie')] || '', notiz: r[ix('Notiz')] || '', konto: r[ix('Konto')] || '',
        banktext: r[ix('Banktext')] || '', quelle: r[ix('Quelle')] || 'Import', status: r[ix('Status')] === 'prüfen' ? 'prüfen' : 'ok',
        key: r[ix('Import-Schlüssel')] || '' });
    });
    return { format: 'Budget-App (bereits zugeordnet)', rows, fertig: true };
  }

  /** Zeilen aus dem Blatt «Regeln» (ab Zeile 2) → Regelobjekte */
  function regelnAusZeilen(rows) {
    return rows.filter(r => r[0]).map(r => ({
      terms: String(r[0]).split(' + ').map(t => t.trim().toLowerCase()).filter(Boolean),
      richtung: String(r[1] || 'beide').toLowerCase(),
      typ: String(r[2] || 'Ausgabe'),
      kategorie: String(r[3] || ''),
      faktor: r[4] === '' || r[4] === undefined || r[4] === null ? 1 : Number(r[4]),
      bis: r[5] === '' || r[5] === undefined || r[5] === null ? null : Number(r[5]),
      notiz: String(r[6] || '')
    }));
  }

  function classify(t, regeln) {
    const hay = (t.text || '').toLowerCase();
    const richtung = t.betrag < 0 ? 'belastung' : 'gutschrift';
    const abs = Math.abs(t.betrag);
    for (const r of regeln) {
      if (r.richtung !== 'beide' && r.richtung !== richtung) continue;
      if (r.bis !== null && abs > r.bis) continue;
      if (!r.terms.every(term => hay.includes(term))) continue;
      if (r.typ === 'Ignorieren') return { typ: 'Ignorieren', notiz: r.notiz };
      const betrag = r2((r.typ === 'Einnahme' ? t.betrag : -t.betrag) * r.faktor);
      return { datum: t.datum, typ: r.typ, betrag, kategorie: r.kategorie,
        notiz: (r.notiz || t.name).replace('{betrag}', abs.toFixed(2)),
        konto: t.konto, banktext: t.text.slice(0, 200), quelle: 'Import ' + t.konto, status: 'ok', key: t.key };
    }
    return { datum: t.datum, typ: 'Ausgabe', betrag: r2(-t.betrag), kategorie: '',
      notiz: t.name + (t.betrag > 0 ? ' (Gutschrift)' : ''),
      konto: t.konto, banktext: t.text.slice(0, 200), quelle: 'Import ' + t.konto, status: 'prüfen', key: t.key };
  }

  /**
   * Wertet eine CSV-Datei aus (schreibt nichts).
   * @param vorhanden bestehende Buchungen (für Doppel-Erkennung)
   * @returns { format, datei, total, neu:[Buchungen], offen, doppelt, ignoriert, hinweise }
   */
  function auswerten(text, datei, { regeln, vorhanden, einst }) {
    text = String(text || '').replace(/^﻿/, '');
    let parsed;
    if (/^sep=;/m.test(text) && /Kartennummer/.test(text)) parsed = parseUbsKarte(text);
    else if (/Abschlussdatum;/.test(text)) parsed = parseUbsKonto(text, einst);
    else if (/^ID,Status,Richtung/m.test(text) || /CARD_TRANSACTION/.test(text)) parsed = parseWise(text, einst);
    else if (/^Budget-App Import/.test(text)) parsed = parseFertig(text);
    // UBS-Auszug, den eine Tabellen-App (z. B. Google Sheets) neu gespeichert hat: Komma statt Semikolon,
    // Umlaute und Zahlen oft verändert → Regeln und Schlüssel wären unzuverlässig, darum ablehnen und erklären
    else if (/(Kontonummer:|Abschlussdatum|Kartennummer|Einkaufsdatum),/.test(text)) throw new Error(datei + ': Diese Datei wurde von einer ' +
      'Tabellen-App (z. B. Google Sheets) neu gespeichert und ist dabei verändert worden. Bitte die Original-Datei aus «Downloads» ' +
      'nehmen: hier auf «CSV-Dateien wählen» tippen, oder in «Dateien» lange drücken → Teilen → Budget.');
    else throw new Error('Unbekanntes Format: ' + datei + (text.trim()
      ? ' – beginnt mit «' + text.trim().split(/\r?\n/)[0].slice(0, 30) + '…»'
      : ' – die Datei ist leer'));

    const keys = new Set(vorhanden.map(b => b.key).filter(Boolean));
    const legacy = {};   // Buchungen ohne Schlüssel: Abgleich über Datum + Betrag (Mehrfachmenge)
    vorhanden.filter(b => !b.key).forEach(b => { const k = b.datum + '|' + b.betrag.toFixed(2); legacy[k] = (legacy[k] || 0) + 1; });

    const neu = []; let ignoriert = 0, doppelt = 0, offen = 0;
    parsed.rows.forEach(t => {
      if (t.key && keys.has(t.key)) { doppelt++; return; }
      const b = parsed.fertig ? t : classify(t, regeln);
      if (b.typ === 'Ignorieren') { ignoriert++; return; }
      const lk = b.datum + '|' + Number(b.betrag).toFixed(2);
      if (legacy[lk] > 0) { legacy[lk]--; doppelt++; return; }
      if (b.status === 'prüfen') offen++;
      neu.push(b);
      if (t.key) keys.add(t.key);
    });
    return { format: parsed.format, datei, total: parsed.rows.length, neu, offen, doppelt, ignoriert, hinweise: parsed.hinweise || [], saldo: parsed.saldo || null };
  }

  /**
   * Wiederkehrende Zahlungen erkennen (Abos, Miete, Daueraufträge, Jahresrechnungen).
   * Gruppiert Ausgaben, Jahresrechnungen und Sparen nach Typ + Kategorie + Notiz (ohne Zahlen/Klammern),
   * fasst Zahlungen am selben Tag zusammen und sucht einen regelmässigen Abstand.
   * @param buchungen  [{ datum:'YYYY-MM-DD', typ, betrag, kategorie, notiz, banktext }]
   * @param heute      'YYYY-MM-DD'
   * @returns [{ name, kategorie, typ, rhythmus, monate, betrag, variabel, letzte, naechste, anzahl, proMonat, buchungen }]
   */
  const RHYTHMEN = [
    { name: 'monatlich', monate: 1, min: 24, max: 38, mindest: 3 },
    { name: 'vierteljährlich', monate: 3, min: 80, max: 100, mindest: 3 },
    { name: 'halbjährlich', monate: 6, min: 165, max: 200, mindest: 2 },
    { name: 'jährlich', monate: 12, min: 335, max: 395, mindest: 2 }
  ];
  const tageZwischen = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);
  function plusMonate(iso, n) {
    const [y, m, d] = iso.split('-').map(Number), z = new Date(Date.UTC(y, m - 1 + n, 1));
    const letzter = new Date(Date.UTC(z.getUTCFullYear(), z.getUTCMonth() + 1, 0)).getUTCDate();
    return `${z.getUTCFullYear()}-${String(z.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, letzter)).padStart(2, '0')}`;
  }
  const notizKern = b => String(b.notiz || b.banktext || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[0-9.,:/'’-]+/g, ' ')
    .replace(/[^a-zäöüéèàç& ]+/g, ' ').split(/\s+/).filter(w => w.length > 1).slice(0, 2).join(' ');
  // opts.abo(kategorie): Abo-Kategorie (darf schon nach 2 Zahlungen jährlich sein); opts.aus: Set ausgeblendeter Schlüssel
  const wkSchluessel = w => w.typ + '|' + w.kategorie + '|' + w.name;
  function wiederkehrend(buchungen, heute, typen = ['Ausgabe', 'Rückstellung', 'Sparen'], opts = {}) {
    const gruppen = new Map();
    buchungen.filter(b => typen.includes(b.typ) && b.betrag > 0 && b.datum && b.datum <= heute)
      .forEach(b => {
        const key = b.typ + '|' + (b.kategorie || '') + '|' + notizKern(b);
        if (!gruppen.has(key)) gruppen.set(key, []);
        gruppen.get(key).push(b);
      });
    const out = [];
    gruppen.forEach(liste => {
      const proTag = new Map();   // mehrere Zahlungen am selben Tag (z. B. 4 × 400 Reka) = ein Termin
      liste.forEach(b => proTag.set(b.datum, (proTag.get(b.datum) || 0) + b.betrag));
      const termine = [...proTag.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
      if (termine.length < 2) return;
      const abst = termine.slice(1).map((t, i) => tageZwischen(termine[i][0], t[0]));
      const median = [...abst].sort((a, b) => a - b)[Math.floor(abst.length / 2)];
      const r = RHYTHMEN.find(x => median >= x.min && median <= x.max);
      if (!r || termine.length < r.mindest) return;
      // nur zwei Zahlungen im Halbjahres-/Jahresabstand: bei Ausgaben nur in Abo-Kategorien oder mit «Abo» in der Notiz (sonst Zufall)
      if (termine.length < 3 && liste[0].typ === 'Ausgabe' && !(opts.abo && opts.abo(liste[0].kategorie)) && !liste.some(b => /\babo\b/i.test(b.notiz || ''))) return;
      const passend = abst.filter(a => a >= r.min && a <= r.max).length;
      if (passend / abst.length < 0.75) return;
      let letzte = termine[termine.length - 1][0];
      // Zahlung mit anderer Notiz, aber gleicher Kategorie und ähnlichem Betrag nach dem letzten Termin zählt als bezahlt
      const zuletzt = termine[termine.length - 1][1];
      const nachzuegler = buchungen.filter(b => b.typ === liste[0].typ && b.kategorie === liste[0].kategorie && b.datum > letzte && b.datum <= heute
        && !liste.includes(b) && Math.abs(b.betrag - zuletzt) <= Math.max(1, zuletzt * 0.1));
      if (nachzuegler.length) { liste = liste.concat(nachzuegler); letzte = nachzuegler.map(b => b.datum).sort().pop(); }
      if (tageZwischen(letzte, heute) > r.max * 1.5 + 5) return;   // läuft nicht mehr
      // laufende Ausgaben mit stark schwankendem Betrag (Kleider, Konzerte …) sind keine Abos
      const werte = termine.map(t => t[1]), mittel = werte.reduce((a, v) => a + v, 0) / werte.length;
      const streuung = Math.sqrt(werte.reduce((a, v) => a + (v - mittel) ** 2, 0) / werte.length) / mittel;
      if (liste[0].typ === 'Ausgabe' && streuung > 0.35) return;
      // schwankend = die Zahlungen vor der letzten weichen mehr als 10 % voneinander ab (eine Preiserhöhung zählt nicht dazu)
      const frueher = termine.slice(-4, -1).map(t => t[1]).sort((a, b) => a - b);
      const variabel = frueher.length > 1 && (frueher[frueher.length - 1] - frueher[0]) > frueher[Math.floor(frueher.length / 2)] * 0.1;
      const juengste = termine.slice(-3).map(t => t[1]).sort((a, b) => a - b);
      const betrag = variabel ? juengste[Math.floor(juengste.length / 2)] : termine[termine.length - 1][1];
      const neueste = liste.filter(b => !nachzuegler.includes(b)).sort((a, b) => b.datum.localeCompare(a.datum))[0];   // Name aus der Gruppe
      let naechste = plusMonate(letzte, r.monate);
      while (tageZwischen(naechste, heute) > 7) naechste = plusMonate(naechste, r.monate);   // mehr als eine Woche überfällig: nächster Termin
      out.push({ name: neueste.notiz || neueste.kategorie || neueste.banktext, kategorie: neueste.kategorie, typ: neueste.typ,
        rhythmus: r.name, monate: r.monate, betrag: Math.round(betrag * 100) / 100,
        variabel, letzte, naechste, anzahl: termine.length,
        proMonat: Math.round(betrag / r.monate * 100) / 100, buchungen: liste,
        erste: termine[0][0], jetzt: termine[termine.length - 1][1], vorher: termine[termine.length - 2][1] });
    });
    // dieselbe Zahlung nicht doppelt aufführen (z. B. Notiz gewechselt): bei gemeinsamen Buchungen die längere Reihe behalten
    const behalten = [];
    out.filter(w => !(opts.aus && opts.aus.has(wkSchluessel(w)))).sort((a, b) => b.anzahl - a.anzahl).forEach(w => { if (!behalten.some(x => x.buchungen.some(b => w.buchungen.includes(b)))) behalten.push(w); });
    return behalten.sort((a, b) => a.naechste.localeCompare(b.naechste));
  }

  /**
   * Auffälligkeiten der letzten 30 Tage: grosse Einzelausgabe, Kategorie über dem Üblichen,
   * teurer gewordenes oder neues Abo, mögliche Doppelzahlung. Reisen («Reise …») sind ausgenommen.
   * @returns [{ id, art, … }]  art: 'gross' | 'kategorie' | 'teurer' | 'neu' | 'doppelt'
   */
  function auffaelligkeiten(buchungen, heute, wk) {
    wk = wk || wiederkehrend(buchungen, heute);
    const istReise = k => /^Reise\s/.test(k || '');
    const alter = b => tageZwischen(b.datum, heute);
    const aus = buchungen.filter(b => b.typ === 'Ausgabe' && b.betrag > 0 && b.datum && b.datum <= heute && !istReise(b.kategorie));
    const neu = aus.filter(b => alter(b) <= 30);
    const median = l => { const s = [...l].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const r2 = n => Math.round(n * 100) / 100;
    const out = [];
    // grosse Einzelausgabe: über 150, mehr als das Dreifache des Üblichen und höher als alles im Vorjahr der Kategorie
    const hist = {};
    aus.filter(b => alter(b) > 30 && alter(b) <= 395).forEach(b => (hist[b.kategorie] = hist[b.kategorie] || []).push(b.betrag));
    neu.filter(b => b.betrag >= 150).forEach(b => {
      const h = hist[b.kategorie] || [];
      if (h.length < 5) return;
      const med = median(h), max = Math.max(...h);
      if (b.betrag > 3 * med && b.betrag > max) out.push({ id: 'gross|' + (b.key || b.datum + '|' + b.betrag), art: 'gross', buchung: b, kategorie: b.kategorie, betrag: b.betrag, ueblich: r2(med), bisher: r2(max) });
    });
    // Kategorie im laufenden Monat deutlich über dem Monatsschnitt der letzten 12 Monate
    const monat = heute.slice(0, 7), vorMonate = Array.from({ length: 12 }, (_, i) => plusMonate(monat + '-01', -(i + 1)).slice(0, 7));
    const katSum = (k, m) => aus.filter(b => b.kategorie === k && b.datum.slice(0, 7) === m).reduce((a, b) => a + b.betrag, 0);
    [...new Set(aus.filter(b => b.datum.slice(0, 7) === monat).map(b => b.kategorie))].filter(Boolean).forEach(k => {
      const verlauf = vorMonate.map(m => katSum(k, m));
      if (verlauf.filter(v => v > 0).length < 6) return;
      const schnitt = verlauf.reduce((a, v) => a + v, 0) / 12, jetzt = katSum(k, monat);
      if (jetzt > schnitt * 1.5 && jetzt - schnitt >= 100) out.push({ id: 'kategorie|' + k + '|' + monat, art: 'kategorie', kategorie: k, betrag: r2(jetzt), schnitt: r2(schnitt) });
    });
    // Abos: teurer geworden (letzte Zahlung in den letzten 45 Tagen) oder neu (erste Zahlung vor höchstens 100 Tagen)
    wk.forEach(w => {
      const k = w.typ + '|' + w.kategorie + '|' + w.name;
      if (!w.variabel && w.jetzt > w.vorher * 1.05 && w.jetzt <= w.vorher * 1.5 && w.jetzt - w.vorher >= 1 && tageZwischen(w.letzte, heute) <= 45)
        out.push({ id: 'teurer|' + k + '|' + w.letzte, art: 'teurer', abo: w, vorher: r2(w.vorher), jetzt: r2(w.jetzt) });
      if (tageZwischen(w.erste, heute) <= 100) out.push({ id: 'neu|' + k, art: 'neu', abo: w });
    });
    // mögliche Doppelzahlung: gleicher Tag, Betrag und Händler
    const gleich = new Map();
    neu.forEach(b => { const k = b.datum + '|' + b.betrag + '|' + String(b.banktext || b.notiz || '').toLowerCase().slice(0, 30); gleich.set(k, (gleich.get(k) || []).concat(b)); });
    gleich.forEach((l, k) => { if (l.length > 1) out.push({ id: 'doppelt|' + k, art: 'doppelt', buchungen: l, buchung: l[0], betrag: l[0].betrag, anzahl: l.length }); });
    const rang = { doppelt: 0, gross: 1, teurer: 2, kategorie: 3, neu: 4 };
    return out.sort((a, b) => rang[a.art] - rang[b.art]);
  }

  /**
   * Kontostand-Prognose (Lohnkonto) für die nächsten Monate.
   * Start = letzter bekannter Saldo; bis heute zählen die tatsächlichen Buchungen. Danach pro Monat:
   * + wiederkehrende Einnahmen, − wiederkehrende Zahlungen (Abos, Miete, Jahresrechnungen, Sparen),
   * − übrige laufende Ausgaben im Schnitt der letzten 12 Monate (ohne Reisen; im laufenden Monat nur der Rest).
   * @returns { heute:{saldo}, schnittVariabel, monate:[{ monat, ein, fix, variabel, ende, posten:[{datum,name,betrag,ein}] }] }
   */
  function prognose(buchungen, start, heute, anzahl = 6, opts = {}) {
    const istReise = k => /^Reise\s/.test(k || '');
    const vz = b => b.typ === 'Einnahme' ? b.betrag : -b.betrag;
    let saldo = start.saldo + buchungen.filter(b => b.datum > start.datum && b.datum <= heute).reduce((a, b) => a + vz(b), 0);
    const saldoHeute = saldo;
    const aus = wiederkehrend(buchungen, heute, undefined, opts), ein = wiederkehrend(buchungen, heute, ['Einnahme'], opts);
    const abo = new Set(); aus.forEach(w => w.buchungen.forEach(b => abo.add(b)));
    const monat = heute.slice(0, 7);
    const vorher = Array.from({ length: 12 }, (_, i) => plusMonate(monat + '-01', -(i + 1)).slice(0, 7));
    const variabel = buchungen.filter(b => b.typ === 'Ausgabe' && !abo.has(b) && !istReise(b.kategorie));
    const schnitt = variabel.filter(b => vorher.includes(b.datum.slice(0, 7))).reduce((a, b) => a + b.betrag, 0) / 12;
    const schonDiesenMonat = variabel.filter(b => b.datum.slice(0, 7) === monat && b.datum <= heute).reduce((a, b) => a + b.betrag, 0);
    // Termine eines Monats; im laufenden Monat auch noch nicht verbuchte, überfällige Termine
    const termine = (w, m) => { const out = []; let d = w.naechste; while (d.slice(0, 7) <= m) { if (d.slice(0, 7) === m || (m === monat && d < m)) out.push(d); d = plusMonate(d, w.monate); } return out; };
    const monate = [];
    for (let i = 0; i < anzahl; i++) {
      const m = plusMonate(monat + '-01', i).slice(0, 7), posten = [];
      ein.forEach(w => termine(w, m).forEach(d => posten.push({ datum: d, name: w.name, betrag: w.betrag, ein: true })));
      aus.forEach(w => termine(w, m).forEach(d => posten.push({ datum: d, name: w.name, betrag: w.betrag, ein: false })));
      const e = posten.filter(p => p.ein).reduce((a, p) => a + p.betrag, 0), f = posten.filter(p => !p.ein).reduce((a, p) => a + p.betrag, 0);
      const v = i === 0 ? Math.max(0, schnitt - schonDiesenMonat) : schnitt;
      saldo += e - f - v;
      monate.push({ monat: m, ein: Math.round(e * 100) / 100, fix: Math.round(f * 100) / 100, variabel: Math.round(v * 100) / 100,
        ende: Math.round(saldo * 100) / 100, posten: posten.sort((a, b) => a.datum.localeCompare(b.datum)) });
    }
    return { heute: { saldo: Math.round(saldoHeute * 100) / 100 }, schnittVariabel: Math.round(schnitt * 100) / 100, monate };
  }

  return { parseCsv, parseNum, classify, regelnAusZeilen, auswerten, wiederkehrend, wkSchluessel, auffaelligkeiten, prognose, plusMonate };
})();
if (typeof module !== 'undefined') module.exports = Logik;
