// Service Worker: hält die App-Dateien auf dem Gerät, damit sie auch offline startet.
// Daten (Google Sheets API) werden NICHT hier gespeichert, sondern von daten.js.
const VERSION = 'budget-v21';
const DATEIEN = ['./', 'index.html', 'css/app.css', 'js/logik.js', 'js/daten.js', 'js/sperre.js', 'js/ui/basis.js', 'js/ui/uebersicht.js', 'js/ui/abschluss.js', 'js/ui/bearbeiten.js', 'js/ui/pruefen.js', 'js/ui/import.js', 'js/ui/suche.js', 'js/ui/erfassen.js', 'js/ui/rechnungen.js', 'js/ui/steuern.js', 'js/ui/vermoegen.js', 'js/ui/vergleich.js', 'js/ui/auswertung.js', 'js/ui/verwalten.js','js/ui/einrichtung.js', 'js/ui/sperre-ui.js', 'js/ui/einstellungen.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon-180.png'];

const GETEILT = 'budget-geteilt';   // per «Teilen» empfangene CSV-Dateien, bis die App sie übernimmt

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== GETEILT).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Android «Teilen» → Budget: Dateien zwischenspeichern, dann die App mit ?geteilt öffnen (siehe import.js)
  if (e.request.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/teilen')) {
    e.respondWith((async () => {
      const dateien = (await e.request.formData()).getAll('dateien').filter(f => f && f.name);
      const c = await caches.open(GETEILT);
      for (const k of await c.keys()) await c.delete(k);
      for (let i = 0; i < dateien.length; i++) {
        // Inhalt sofort kopieren: der Verweis auf die geteilte Datei gilt auf Android nur während dieser Anfrage
        await c.put('geteilt/' + i, new Response(await dateien[i].arrayBuffer(), { headers: { 'X-Name': encodeURIComponent(dateien[i].name) } }));
      }
      return Response.redirect('./?geteilt=' + dateien.length, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // Google-Anfragen nie abfangen
  // Netz zuerst (damit Updates sofort ankommen), offline aus dem Speicher
  e.respondWith(
    fetch(e.request).then(r => { const kopie = r.clone(); caches.open(VERSION).then(c => c.put(e.request, kopie)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
