/* Cardstack service worker — precache the app shell so barcodes work offline. */
const CACHE = 'cardstack-v23';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/barcode.js',
  './js/scanner.js',
  './js/drive.js',
  './lib/JsBarcode.all.min.js',
  './lib/qrcode-generator.js',
  './lib/html5-qrcode.min.js',
  './lib/Sortable.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never touch Google auth/API or cross-origin (fonts) — let them go to network.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('google.com') || url.hostname.endsWith('gstatic.com')) return;
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  // Stale-while-revalidate: serve the locally cached version INSTANTLY (so the
  // app opens with no internet at all), and refresh the cache from the network
  // in the background when a connection is available — for the next launch.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fromNet = fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => null);
      return cached || fromNet.then((r) => r || caches.match('./index.html'));
    })
  );
});
