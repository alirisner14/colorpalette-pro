// Offline support: network-first so updates always land, cache as the offline fallback.
const VERSION = 'cpp-v2.0.0';
const SHELL = [
  './',
  './index.html',
  './legal.html',
  './manifest.webmanifest',
  './src/css/styles.css',
  './src/js/app.js',
  './src/js/color.js',
  './src/js/harmonies.js',
  './src/js/names.js',
  './src/js/shapes.js',
  './src/js/export.js',
  './src/js/zip.js',
  './src/js/picker.js',
  './src/js/storage.js',
  './src/js/formats.js',
  './src/js/photo.js',
  './src/js/themes.js',
  './src/js/book.js',
  './src/js/store.js',
  './src/js/ui.js',
  './src/js/render.js',
  './src/js/exportsheet.js',
  './src/js/bookview.js',
  './src/js/viewer.js',
  './src/js/legal.js',
  './assets/logo.png',
  './assets/favicon.ico',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
