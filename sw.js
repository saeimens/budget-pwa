// Service Worker: hält die App-Dateien auf dem Gerät, damit sie auch offline startet.
// Daten (Google Sheets API) werden NICHT hier gespeichert, sondern von daten.js.
const VERSION = 'budget-v3';
const DATEIEN = ['./', 'index.html', 'logik.js', 'daten.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // Google-Anfragen nie abfangen
  // Netz zuerst (damit Updates sofort ankommen), offline aus dem Speicher
  e.respondWith(
    fetch(e.request).then(r => { const kopie = r.clone(); caches.open(VERSION).then(c => c.put(e.request, kopie)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
