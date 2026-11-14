/**
 * Budget-App – Datenschicht.
 * Liest und schreibt das Google Sheet direkt über die Sheets-API (Login mit Google).
 * Offline: letzte Daten aus dem Gerätespeicher, Änderungen kommen in eine Warteschlange.
 * Gleiche Funktionen wie früher Code.gs: getData, search, addBuchung, updateBuchung, deleteBuchung, importCsv.
 */
const Daten = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const K = { cfg: 'budget.cfg', cache: 'budget.cache', queue: 'budget.queue', token: 'budget.token' };
  const NCOLS = 13;

  const speicher = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  let cfg = speicher.get(K.cfg) || {};          // { clientId, sheetId }
  let D = speicher.get(K.cache);                // { buchungen, kategorien, regelnRows, einst, stand }
  let queue = speicher.get(K.queue) || [];
  let sheetIds = null;                          // Blattname → sheetId
  let tokenClient = null, tokenWaiters = [];
  let tok = speicher.get(K.token);              // { access, exp }
  const listeners = new Set();
  const melde = () => listeners.forEach(f => { try { f(status()); } catch (e) {} });

  /* ---------------- Konfiguration & Status ---------------- */
  const konfiguriert = () => !!(cfg.clientId && cfg.sheetId);
  function konfigurieren(clientId, sheetId) {
    // beim Kopieren wird oft «https://» oder ein «/» am Ende mitgenommen
    cfg = { clientId: clientId.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''), sheetId: extrahiereId(sheetId) };
    speicher.set(K.cfg, cfg); sheetIds = null; tokenClient = null;
  }
  function extrahiereId(s) { const m = String(s).match(/\/d\/([a-zA-Z0-9_-]{20,})/); return (m ? m[1] : String(s)).trim(); }
  const angemeldet = () => !!(tok && tok.exp > Date.now() + 60000);
  const status = () => ({ online: navigator.onLine, angemeldet: angemeldet(), warteschlange: queue.length, stand: D && D.stand });
  function abmelden() {
    if (tok && window.google && google.accounts) try { google.accounts.oauth2.revoke(tok.access, () => {}); } catch (e) {}
    tok = null; speicher.del(K.token); melde();
  }

  /* ---------------- Login (Google Identity Services) ---------------- */
  function gisBereit() {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      (function warte() {
        if (window.google && google.accounts && google.accounts.oauth2) return res();
        if (Date.now() - t0 > 10000) return rej(new Error('Google-Anmeldung konnte nicht geladen werden (offline?)'));
        setTimeout(warte, 100);
      })();
    });
  }
  async function anmelden(interaktiv, erzwingen) {
    if (angemeldet() && !erzwingen) return tok.access;
    if (!navigator.onLine) throw new Error('Offline – Anmeldung nicht möglich');
    await gisBereit();
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId, scope: SCOPE,
        callback: r => {
          const w = tokenWaiters; tokenWaiters = [];
          if (r.error) return w.forEach(x => x.rej(new Error('Anmeldung: ' + r.error)));
          tok = { access: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
          speicher.set(K.token, tok); melde();
          w.forEach(x => x.res(tok.access));
        },
        error_callback: e => { const w = tokenWaiters; tokenWaiters = []; w.forEach(x => x.rej(new Error(e.type === 'popup_closed' ? 'Anmeldung abgebrochen' : 'Anmeldung fehlgeschlagen (' + e.type + ')'))); }
      });
    }
    return new Promise((res, rej) => {
      tokenWaiters.push({ res, rej });
      if (tokenWaiters.length === 1) tokenClient.requestAccessToken({ prompt: interaktiv ? '' : 'none' });
    });
  }

  /**
   * Bei einer Nutzeraktion (Tipp, Taste) aufrufen: erneuert die Google-Anmeldung, wenn sie abgelaufen ist
   * oder in weniger als 5 Minuten abläuft. Browser zeigen das Google-Fenster nur während einer Nutzeraktion,
   * darum geht das nicht im Hintergrund. Höchstens ein Versuch pro Minute.
   * @returns Promise<boolean> true = neu angemeldet
   */
  let letzterVersuch = 0;
  function auffrischen() {
    if (!konfiguriert() || !navigator.onLine || !(window.google && google.accounts)) return Promise.resolve(false);
    if (tok && tok.exp > Date.now() + 5 * 60000) return Promise.resolve(false);
    if (Date.now() - letzterVersuch < 60000) return Promise.resolve(false);
    letzterVersuch = Date.now();
    return anmelden(true, true).then(() => true, () => false);
  }

  async function api(pfad, opt = {}, nochmal = true) {
    const access = await anmelden(false).catch(e => { const f = new Error('Bitte neu anmelden'); f.login = true; f.grund = e; throw f; });
    const r = await fetch(API + cfg.sheetId + pfad, {
      method: opt.method || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + access }, opt.body ? { 'Content-Type': 'application/json' } : {}),
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    if (r.status === 401 && nochmal) { tok = null; speicher.del(K.token); return api(pfad, opt, false); }
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
      if (r.status === 404) msg = 'Sheet nicht gefunden – stimmt die Sheet-ID?';
      if (r.status === 403) msg = 'Kein Zugriff aufs Sheet (' + msg + ')';
      throw new Error(msg);
    }
    return r.json();
  }
  const batch = requests => api(':batchUpdate', { method: 'POST', body: { requests } });

  async function blattIds() {
    if (sheetIds) return sheetIds;
    const j = await api('?fields=sheets.properties(sheetId,title)');
    sheetIds = {}; j.sheets.forEach(s => sheetIds[s.properties.title] = s.properties.sheetId);
    ['Buchungen', 'Kategorien', 'Regeln', 'Einstellungen'].forEach(n => { if (sheetIds[n] === undefined) throw new Error('Blatt «' + n + '» fehlt im Sheet'); });
    return sheetIds;
  }

  /* ---------------- Umrechnungen ---------------- */
  const iso = d => d.toISOString().slice(0, 10);
  function datumAus(v) {
    if (typeof v === 'number') return iso(new Date(Math.round((v - 25569) * 864e5)));
    const s = String(v || '').trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s.slice(0, 10);
  }
  const serial = isoStr => { const [y, m, d] = isoStr.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5 + 25569; };
  const num = v => typeof v === 'number' ? v : (Number(String(v || '').replace(/['\s]/g, '')) || 0);
  const str = v => v === undefined || v === null ? '' : String(v);

  function buchungAusZeile(r, i) {
    return { row: i + 2, datum: datumAus(r[0]), jahr: num(r[1]), monat: num(r[2]), typ: str(r[3]), betrag: num(r[4]),
      kategorie: str(r[5]), notiz: str(r[6]), konto: str(r[7]), banktext: str(r[8]), quelle: str(r[9]),
      status: str(r[10]), tags: str(r[11]), key: str(r[12]) };
  }

  /* ---------------- Laden ---------------- */
  async function laden() {
    const ids = await blattIds();
    const bereiche = ['Buchungen!A2:M', 'Kategorien!A2:D', 'Regeln!A2:G', 'Einstellungen!A2:B'];
    // optionale Blätter
    const hatR = ids['Rückstellungen'] !== undefined, hatV = ids['Vermögen'] !== undefined;
    if (hatR) bereiche.push('Rückstellungen!A2:E');
    if (hatV) bereiche.push('Vermögen!A2:E');
    const ranges = bereiche.map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const j = await api('/values:batchGet?' + ranges + '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
    const werte = j.valueRanges.map(v => v.values || []);
    const [b, k, r, e] = werte, rs = hatR ? werte[4] : [], vm = hatV ? werte[hatR ? 5 : 4] : [];
    const einst = {}, einstRow = {}; e.forEach((x, i) => { if (x[0]) { einst[String(x[0])] = x[1]; einstRow[String(x[0])] = i + 2; } });
    D = {
      vermoegen: vm.filter(x => x[0] && x[1] && x[3] !== '' && x[3] !== undefined)
        .map(x => ({ datum: datumAus(x[0]), konto: str(x[1]), gruppe: str(x[2]) || 'Flüssig', saldo: num(x[3]), bemerkung: str(x[4]) })),
      hatVermoegen: hatV,
      rueckstellungen: rs.map((x, i) => [x, i + 2]).filter(([x]) => x[0] && typeof x[2] === 'number')
        .map(([x, row]) => ({ row, posten: str(x[0]), kategorie: str(x[1]), rate: num(x[2]), aktiv: str(x[3]).trim().toLowerCase() !== 'nein', bemerkung: str(x[4]) })),
      buchungen: b.map(buchungAusZeile).filter(x => x.datum),
      kategorien: k.map((x, i) => [x, i + 2]).filter(([x]) => x[0] && !String(x[0]).startsWith('Typen'))
        .map(([x, row]) => ({ row, name: str(x[0]), gruppe: str(x[1]), budget: num(x[2]), bemerkung: str(x[3]) })),
      regelnRows: r, einst, einstRow, stand: Date.now()
    };
    speicher.set(K.cache, D); melde();
    return D;
  }
  const cache = () => D;

  /* ---------------- Lesen (wie Code.gs) ---------------- */
  function getDataSync(jahr) {
    const alle = D ? D.buchungen : [];
    const jahre = [...new Set(alle.map(b => b.jahr))].filter(Boolean).sort();
    const j = Number(jahr) || jahre[jahre.length - 1] || new Date().getFullYear();
    return { jahr: j, jahre, alle, buchungen: alle.filter(b => b.jahr === j), offen: alle.filter(b => b.status === 'prüfen'),
      kategorien: D ? D.kategorien : [], rueckstellungen: (D && D.rueckstellungen) || [], regelnRows: (D && D.regelnRows) || [],
      einst: (D && D.einst) || {}, einstRow: (D && D.einstRow) || {},
      vermoegen: (D && D.vermoegen) || [], hatVermoegen: !!(D && D.hatVermoegen),
      offline: !navigator.onLine, warteschlange: queue.length };
  }
  async function getData(jahr) {
    if (navigator.onLine) {
      try { await sync(); await laden(); }
      catch (e) { if (!D || e.login) throw e; }   // mit Cache weiterarbeiten
    }
    if (!D) throw new Error('Noch keine Daten auf diesem Gerät – bitte online öffnen');
    return getDataSync(jahr);
  }
  async function search(q, jahr, kategorie) {
    const needle = String(q || '').toLowerCase().trim();
    return (D ? D.buchungen : []).filter(b =>
      (!jahr || b.jahr === Number(jahr)) &&
      (!kategorie || (kategorie === '__reisen__' ? /^Reise\s/.test(b.kategorie || '') : b.kategorie === kategorie)) &&
      (!needle || [b.notiz, b.kategorie, b.banktext, b.konto].join(' ').toLowerCase().includes(needle))
    ).slice(-500).reverse();
  }

  /* ---------------- Schreiben ---------------- */
  const FMT_DATUM = { numberFormat: { type: 'DATE', pattern: 'dd.mm.yyyy' } };
  const FMT_BETRAG = { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } };
  function zellen(b) {
    const [y, m] = b.datum.split('-').map(Number);
    const v = [
      { userEnteredValue: { numberValue: serial(b.datum) }, userEnteredFormat: FMT_DATUM },
      { userEnteredValue: { numberValue: y } }, { userEnteredValue: { numberValue: m } },
      { userEnteredValue: { stringValue: b.typ || 'Ausgabe' } },
      { userEnteredValue: { numberValue: Math.round(Number(b.betrag) * 100) / 100 }, userEnteredFormat: FMT_BETRAG }
    ];
    ['kategorie', 'notiz', 'konto', 'banktext', 'quelle', 'status', 'tags', 'key'].forEach((f, i) => {
      const def = { quelle: 'App', status: 'ok' }[f] || '';
      v.push({ userEnteredValue: { stringValue: str(b[f]) || def } });
    });
    return { values: v };
  }
  async function anhaengen(liste) {
    if (!liste.length) return;
    const ids = await blattIds();
    for (let i = 0; i < liste.length; i += 500) {     // in Paketen, damit die Anfragen klein bleiben
      await batch([{ appendCells: { sheetId: ids.Buchungen, rows: liste.slice(i, i + 500).map(zellen), fields: 'userEnteredValue,userEnteredFormat.numberFormat' } }]);
    }
    await batch([{ sortRange: { range: { sheetId: ids.Buchungen, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: NCOLS }, sortSpecs: [{ dimensionIndex: 0, sortOrder: 'ASCENDING' }] } }]);
  }

  /** Steht in Zeile `row` noch die erwartete Buchung? Sonst suchen (Zeilen verschieben sich). */
  async function zeileFinden(row, expect) {
    row = Number(row);
    const passt = b => expect.key ? b.key === String(expect.key)
      : b.datum === String(expect.datum) && Math.abs(b.betrag - Number(expect.betrag)) < 0.005 && b.banktext === String(expect.banktext || '');
    if (row >= 2) {
      const j = await api('/values/' + encodeURIComponent('Buchungen!A' + row + ':M' + row) + '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
      if (j.values && j.values[0] && passt(buchungAusZeile(j.values[0], row - 2))) return row;
    }
    await laden();
    const treffer = D.buchungen.filter(passt).sort((a, b) => Math.abs(a.row - row) - Math.abs(b.row - row));
    if (!treffer.length) throw new Error('Diese Buchung wurde inzwischen geändert oder gelöscht. Bitte neu laden.');
    return treffer[0].row;
  }

  async function onlineAdd(b) {
    if (!b || !b.datum || !b.betrag) throw new Error('Datum und Betrag sind nötig.');
    await anhaengen([Object.assign({ quelle: 'Manuell', status: 'ok' }, b)]);
  }
  async function onlineUpdate(row, changes, regel, expect) {
    const r = expect ? await zeileFinden(row, expect) : Number(row);
    const spalten = { typ: 'D', betrag: 'E', kategorie: 'F', notiz: 'G', tags: 'L' };
    const data = Object.entries(spalten).filter(([f]) => changes[f] !== undefined)
      .map(([f, c]) => ({ range: 'Buchungen!' + c + r, values: [[f === 'betrag' ? Number(changes[f]) : changes[f]]] }));
    data.push({ range: 'Buchungen!K' + r, values: [[changes.status || 'ok']] });
    await api('/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'RAW', data } });
    if (regel && regel.suchbegriff) {   // neue Regel zuoberst, damit sie vor allgemeinen Regeln greift
      const ids = await blattIds();
      const werte = [regel.suchbegriff, regel.richtung || 'beide', regel.typ || changes.typ || 'Ausgabe', regel.kategorie || changes.kategorie || '', '', '', changes.notiz || ''];
      await batch([
        { insertDimension: { range: { sheetId: ids.Regeln, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, inheritFromBefore: false } },
        { updateCells: { start: { sheetId: ids.Regeln, rowIndex: 1, columnIndex: 0 }, rows: [{ values: werte.map(w => ({ userEnteredValue: { stringValue: w } })) }], fields: 'userEnteredValue' } }
      ]);
    }
  }
  async function onlineDelete(row, expect) {
    const r = expect ? await zeileFinden(row, expect) : Number(row);
    const ids = await blattIds();
    await batch([{ deleteDimension: { range: { sheetId: ids.Buchungen, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } }]);
  }

  /** Kontostände eines Stichtags ins Blatt «Vermögen» (wird bei Bedarf angelegt) */
  async function onlineKontostaende(datum, liste) {
    let ids = await blattIds();
    if (ids['Vermögen'] === undefined) {
      await batch([{ addSheet: { properties: { title: 'Vermögen', gridProperties: { rowCount: 1000, columnCount: 5, frozenRowCount: 1 } } } }]);
      sheetIds = null; ids = await blattIds();
      await api('/values/' + encodeURIComponent('Vermögen!A1:E1') + '?valueInputOption=RAW', { method: 'PUT', body: { values: [['Datum', 'Konto', 'Gruppe', 'Saldo', 'Bemerkung']] } });
    }
    const zelle = v => typeof v === 'number' ? { userEnteredValue: { numberValue: v } } : { userEnteredValue: { stringValue: str(v) } };
    await batch([{ appendCells: { sheetId: ids['Vermögen'], fields: 'userEnteredValue',
      rows: liste.map(x => ({ values: [datum, x.konto, x.gruppe, Math.round(Number(x.saldo) * 100) / 100, x.bemerkung || ''].map(zelle) })) } }]);
  }

  /** Tags mehrerer Buchungen in einem Schritt setzen: [{ row, expect, tags }] */
  async function onlineTags(liste) {
    const data = [];
    for (const x of liste) data.push({ range: 'Buchungen!L' + await zeileFinden(x.row, x.expect), values: [[x.tags]] });
    if (data.length) await api('/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'RAW', data } });
  }

  /* ---------------- Stammdaten: Kategorien, Rückstellungen, Regeln ---------------- */
  const BLATT_SPALTEN = { Kategorien: 'D', 'Rückstellungen': 'E', Regeln: 'G', Einstellungen: 'B' };
  const zelleWert = v => typeof v === 'number' ? { userEnteredValue: { numberValue: v } } : { userEnteredValue: { stringValue: str(v) } };
  /**
   * Eine Zeile in Kategorien / Rückstellungen / Regeln ändern, anlegen oder löschen. Nur online.
   * aktion: 'setzen' (row, werte, erwartet = bisheriger Inhalt Spalte A), 'neu' (werte, eingefügt nach Zeile row; row 0 = zuoberst),
   * 'loeschen' (row, erwartet). Vor dem Schreiben wird geprüft, ob die Zeile noch dieselbe ist.
   */
  async function blattAendern(blatt, aktion, row, werte, erwartet) {
    if (!BLATT_SPALTEN[blatt]) throw new Error('Unbekanntes Blatt: ' + blatt);
    if (!navigator.onLine) throw new Error('Bearbeiten geht nur online');
    await sync();
    const ids = await blattIds();
    if (ids[blatt] === undefined) throw new Error(`Im Sheet fehlt das Blatt «${blatt}»`);
    if (aktion !== 'neu') {
      const j = await api('/values/' + encodeURIComponent(`${blatt}!A${row}`) + '?valueRenderOption=UNFORMATTED_VALUE');
      const ist = j.values && j.values[0] ? str(j.values[0][0]) : '';
      if (ist !== str(erwartet)) { await laden(); throw new Error('Das Blatt wurde inzwischen geändert. Bitte nochmals versuchen.'); }
    }
    const zeile = [{ values: werte.map(zelleWert) }];
    if (aktion === 'setzen') {
      await batch([{ updateCells: { start: { sheetId: ids[blatt], rowIndex: row - 1, columnIndex: 0 }, rows: zeile, fields: 'userEnteredValue' } }]);
    } else if (aktion === 'neu') {
      const index = Math.max(1, Number(row) || 0);   // 0-basiert: direkt nach Zeile «row»; ohne row zuoberst (neue Regeln)
      await batch([
        { insertDimension: { range: { sheetId: ids[blatt], dimension: 'ROWS', startIndex: index, endIndex: index + 1 }, inheritFromBefore: index > 1 } },
        { updateCells: { start: { sheetId: ids[blatt], rowIndex: index, columnIndex: 0 }, rows: zeile, fields: 'userEnteredValue' } }
      ]);
    } else if (aktion === 'loeschen') {
      await batch([{ deleteDimension: { range: { sheetId: ids[blatt], dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }]);
    } else throw new Error('Unbekannte Aktion: ' + aktion);
    await laden();
    return true;
  }

  /* ---------------- Offline-Warteschlange ---------------- */
  const OPS = { add: onlineAdd, update: onlineUpdate, delete: onlineDelete, vermoegen: onlineKontostaende, tags: onlineTags };
  let syncLaeuft = null;
  function sync() {
    if (syncLaeuft) return syncLaeuft;
    syncLaeuft = (async () => {
      while (queue.length && navigator.onLine) {
        const op = queue[0];
        try { await OPS[op.op](...op.args); }
        catch (e) {
          if (e.login || !navigator.onLine || /Failed to fetch|NetworkError/i.test(e.message)) throw e;   // später nochmal
          op.fehler = e.message;   // inhaltlicher Fehler: nicht endlos wiederholen
          speicher.set(K.queue + '.fehler', (speicher.get(K.queue + '.fehler') || []).concat(op));
        }
        queue.shift(); speicher.set(K.queue, queue); melde();
      }
    })().finally(() => { syncLaeuft = null; });
    return syncLaeuft;
  }
  const istNetzfehler = e => !navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(e.message);

  /** Online direkt schreiben, offline (oder bei Netzfehler) in die Warteschlange und lokal vormerken */
  async function schreiben(op, args, lokal) {
    if (navigator.onLine) {
      try { await sync(); await OPS[op](...args); return true; }
      catch (e) { if (!istNetzfehler(e)) throw e; }
    }
    queue.push({ op, args, zeit: Date.now() }); speicher.set(K.queue, queue);
    if (D) { lokal(D); speicher.set(K.cache, D); }
    melde();
    return true;
  }

  function addBuchung(b) {
    if (!b || !b.datum || !b.betrag) return Promise.reject(new Error('Datum und Betrag sind nötig.'));
    return schreiben('add', [b], d => {
      const [y, m] = b.datum.split('-').map(Number);
      d.buchungen.push(Object.assign({ row: 0, jahr: y, monat: m, quelle: 'Manuell', status: 'ok', tags: '', key: '', banktext: '' }, b));
    });
  }
  function updateBuchung(row, changes, regel, expect) {
    return schreiben('update', [row, changes, regel, expect], d => {
      const b = d.buchungen.find(x => expect && (expect.key ? x.key === expect.key : x.datum === expect.datum && x.betrag === expect.betrag && x.banktext === expect.banktext));
      if (b) Object.assign(b, changes, { status: changes.status || 'ok' });
    });
  }
  function deleteBuchung(row, expect) {
    return schreiben('delete', [row, expect], d => {
      const i = d.buchungen.findIndex(x => expect && (expect.key ? x.key === expect.key : x.datum === expect.datum && x.betrag === expect.betrag && x.banktext === expect.banktext));
      if (i >= 0) d.buchungen.splice(i, 1);
    });
  }

  function tagsSetzen(liste) {
    if (!liste.length) return Promise.resolve(true);
    return schreiben('tags', [liste], d => {
      liste.forEach(x => {
        const b = d.buchungen.find(y => x.expect.key ? y.key === x.expect.key : y.datum === x.expect.datum && y.betrag === x.expect.betrag && y.banktext === x.expect.banktext);
        if (b) b.tags = x.tags;
      });
    });
  }

  function kontostaendeErfassen(datum, liste) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !liste.length) return Promise.reject(new Error('Stichtag und mindestens ein Konto nötig.'));
    return schreiben('vermoegen', [datum, liste], d => {
      d.vermoegen = (d.vermoegen || []).concat(liste.map(x => ({ datum, konto: x.konto, gruppe: x.gruppe, saldo: Number(x.saldo), bemerkung: x.bemerkung || '' })));
      d.hatVermoegen = true;
    });
  }

  /* ---------------- Import ---------------- */
  async function importCsv(text, datei, dryRun) {
    if (!navigator.onLine) throw new Error('Import geht nur online');
    await sync(); await laden();
    const res = Logik.auswerten(text, datei, { regeln: Logik.regelnAusZeilen(D.regelnRows), vorhanden: D.buchungen, einst: D.einst });
    const saldo = saldoPruefen(res.saldo);
    if (!dryRun) {
      await anhaengen(res.neu);
      if (saldo && saldo.uebernehmen) await onlineKontostaende(saldo.datum, [{ konto: saldo.konto, gruppe: saldo.gruppe, saldo: saldo.betrag, bemerkung: 'aus CSV-Import' }]);
      await laden();
    }
    return { format: res.format, datei, total: res.total, neu: res.neu.length, offen: res.offen, doppelt: res.doppelt,
      ignoriert: res.ignoriert, hinweise: res.hinweise, vorschau: res.neu.slice(0, 200), saldo };
  }

  /** Kontostand aus dem Auszug fürs Blatt «Vermögen» vorbereiten (nur per Monatsende, keine Doppel) */
  function saldoPruefen(s) {
    if (!s) return null;
    const [y, m, d] = s.datum.split('-').map(Number);
    const vm = D.vermoegen || [];
    // Kontoname wie im Blatt «Vermögen» (z. B. «Lohnkonto (UBS)»), sonst neu mit «(UBS)»
    const name = [...new Set(vm.map(v => v.konto))].find(k => k === s.konto || k.startsWith(s.konto + ' ')) || s.konto + ' (UBS)';
    const vorhanden = vm.filter(v => v.konto === name && v.datum === s.datum).pop();   // zuletzt erfasster Stand gilt
    const o = { konto: name, gruppe: 'Flüssig', datum: s.datum, betrag: s.betrag, uebernehmen: false, grund: '' };
    if (new Date(y, m, 0).getDate() !== d) o.grund = 'Auszug endet nicht am Monatsende';
    else if (vorhanden && Math.abs(vorhanden.saldo - s.betrag) < 0.005) o.grund = 'schon erfasst';
    else o.uebernehmen = true;
    return o;
  }

  window.addEventListener('online', () => { sync().then(() => queue.length || laden()).catch(() => {}).finally(melde); });
  window.addEventListener('offline', melde);

  return { konfiguriert, konfigurieren, config: () => Object.assign({}, cfg), anmelden, auffrischen, abmelden, angemeldet, status,
    onStatus: f => { listeners.add(f); return () => listeners.delete(f); },
    cache, getDataSync, getData, search, addBuchung, updateBuchung, deleteBuchung, importCsv, kontostaendeErfassen, tagsSetzen, blattAendern, sync };
})();
if (typeof module !== 'undefined') module.exports = Daten;
