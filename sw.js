/* Cardstack service worker — precache the app shell so barcodes work offline. */
const CACHE = 'cardstack-v2';
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
  // Never cache Google auth/API or cross-origin font calls — always go to network.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('google.com') || url.hostname.endsWith('gstatic.com')) {
    return; // default network handling
  }
  if (e.request.method !== 'GET') return;
  // Cache-first for same-origin app shell; fall back to network, then cache runtime.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res && res.status === 200 && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
