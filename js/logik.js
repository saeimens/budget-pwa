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
    const teil = String(einst['IBAN-Teil Rückstellungskonto'] || '').replace(/\s/g, '');
    const kontoName = teil && kontoLine.includes(teil) ? 'Rückstellungskonto' : 'Lohnkonto';
    const start = lines.findIndex(l => l.startsWith('Abschlussdatum;'));
    const data = parseCsv(lines.slice(start).join('\n'), ';');
    const h = data[0], ix = n => h.indexOf(n);
    const rows = [];
    data.slice(1).forEach(r => {
      if (r.length < 10 || !r[ix('Abschlussdatum')]) return;
      const bel = parseNum(r[ix('Belastung')]), gut = parseNum(r[ix('Gutschrift')]);
      const betrag = gut ? gut : bel;   // Belastung ist negativ
      if (!betrag) return;
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
    return { format: 'UBS ' + kontoName, rows, saldo };
  }

  function parseUbsKarte(text) {
    const lines = text.split(/\r?\n/).filter(l => !l.startsWith('sep='));
    const data = parseCsv(lines.join('\n'), ';');
    const h = data[0], ix = n => h.indexOf(n);
    const rows = [], hinweise = [];
    data.slice(1).forEach(r => {
      if (r.length < 10 || !r[ix('Einkaufsdatum')]) return;
      const bel = parseNum(r[ix('Belastung')]), gut = parseNum(r[ix('Gutschrift')]);
      const txt = r[ix('Buchungstext')] || '';
      if (/LSV-ZAHLUNG|IHRE ZAHLUNG/i.test(txt)) return;          // Bezahlung der Karte vom Konto
      if (!bel && !gut) { hinweise.push('Noch nicht verbucht: ' + txt + ' (' + r[ix('Betrag')] + ' ' + r[ix('Originalwährung')] + ')'); return; }
      const betrag = gut ? gut : -bel;
      const d = r[ix('Einkaufsdatum')].split('.');
      const datum = d[2] + '-' + d[1] + '-' + d[0];
      // 1.75 %-Auslandszuschlag steht als eigene Zeile direkt nach dem Einkauf → zum Einkauf addieren
      if (/ZUSCHLAG/i.test(txt)) {
        const prev = rows[rows.length - 1];
        if (prev && prev.datum === datum) { prev.betrag = r2(prev.betrag + betrag); prev.name += ' (inkl. 1.75 % Zuschlag)'; return; }
      }
      const orig = r[ix('Originalwährung')] && r[ix('Originalwährung')] !== 'CHF' ? ' (' + r[ix('Betrag')] + ' ' + r[ix('Originalwährung')] + ')' : '';
      rows.push({ datum, betrag, name: cleanName(txt) + orig, text: txt + orig, konto: 'Kreditkarte',
        key: 'KK|' + datum + '|' + betrag.toFixed(2) + '|' + txt.slice(0, 40) });
    });
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

  return { parseCsv, parseNum, classify, regelnAusZeilen, auswerten };
})();
if (typeof module !== 'undefined') module.exports = Logik;
