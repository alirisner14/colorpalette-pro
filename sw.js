// Color Palette PRO service worker: makes the app work fully offline.
//
// - On install it stores every file the app needs (the list below is generated
//   by `npm run shell`; a test fails if it is out of date).
// - While online it fetches fresh files (so updates arrive immediately); with a
//   slow or missing connection it answers from the stored copy.
// - It only ever stores files from that list, so nothing else piles up.
// - On activation it deletes every older version of its cache.
const VERSION = 'cpp-v1.0.2';
const PREFIX = 'cpp-';
const SHELL = /*SHELL:START*/[
  './',
  './index.html',
  './legal.html',
  './manifest.webmanifest',
  './Legal/direct/INSTALL.md',
  './Legal/direct/REFUND-POLICY.md',
  './Legal/direct/SUPPORT-POLICY.md',
  './Legal/direct/TERMS-OF-SALE.md',
  './Legal/licences/OFL-grandstander.txt',
  './Legal/licences/OFL-nunito.txt',
  './Legal/shared/EULA.md',
  './Legal/shared/PRIVACY-POLICY.md',
  './Legal/shared/TERMS-OF-USE.md',
  './Legal/shared/THIRD-PARTY-LICENCES.md',
  './assets/favicon.ico',
  './assets/fonts/grandstander-latin-ext-wght-normal.woff2',
  './assets/fonts/grandstander-latin-wght-normal.woff2',
  './assets/fonts/nunito-latin-ext-wght-normal.woff2',
  './assets/fonts/nunito-latin-wght-normal.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png',
  './assets/logo.png',
  './src/css/book.css',
  './src/css/dialogs.css',
  './src/css/fonts.css',
  './src/css/styles.css',
  './src/js/app.js',
  './src/js/artwork.js',
  './src/js/backupcore.js',
  './src/js/backuphtml.js',
  './src/js/backupui.js',
  './src/js/book.js',
  './src/js/bookopts.js',
  './src/js/bookpages.js',
  './src/js/bookview.js',
  './src/js/color.js',
  './src/js/contextui.js',
  './src/js/contrast.js',
  './src/js/contrastui.js',
  './src/js/cover.js',
  './src/js/customizeui.js',
  './src/js/deckview.js',
  './src/js/export.js',
  './src/js/exportsheet.js',
  './src/js/formats.js',
  './src/js/harmonies.js',
  './src/js/idb.js',
  './src/js/imageutil.js',
  './src/js/importers.js',
  './src/js/importui.js',
  './src/js/legal.js',
  './src/js/lifecycle.js',
  './src/js/lock.js',
  './src/js/meta.js',
  './src/js/mood.js',
  './src/js/names.js',
  './src/js/palettemenu.js',
  './src/js/pdf.js',
  './src/js/photo.js',
  './src/js/picker.js',
  './src/js/printable.js',
  './src/js/printui.js',
  './src/js/pwa.js',
  './src/js/qr.js',
  './src/js/render.js',
  './src/js/scene.js',
  './src/js/settingsui.js',
  './src/js/shapedata.js',
  './src/js/shapes.js',
  './src/js/sharecode.js',
  './src/js/shareui.js',
  './src/js/sheet.js',
  './src/js/storage.js',
  './src/js/store.js',
  './src/js/textmetrics.js',
  './src/js/themes.js',
  './src/js/ui.js',
  './src/js/uikit.js',
  './src/js/viewer.js',
  './src/js/zip.js',
]/*SHELL:END*/;

const SCOPE = self.registration.scope;
const keyFor = new Map(SHELL.map((p) => { const u = new URL(p, SCOPE); return [u.pathname, u.href]; }));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // `reload` skips the HTTP cache so a new version never stores stale files.
    await Promise.all(SHELL.map((p) => cache.add(new Request(new URL(p, SCOPE).href, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (type === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX)).map((n) => caches.delete(n)));
      event.ports[0]?.postMessage({ ok: true });
    })());
  } else if (type === 'VERSION') {
    event.ports[0]?.postMessage({ version: VERSION, files: SHELL.length });
  }
});

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function networkFirst(request, key) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetchWithTimeout(request, 3500);
    if (response.ok && response.type === 'basic') cache.put(key, response.clone());
    return response;
  } catch {
    const stored = await cache.match(key);
    return stored || new Response('You are offline and this file was not stored.', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = keyFor.get(url.pathname);
  if (!key) return; // not one of ours: leave it to the browser
  event.respondWith(networkFirst(request, key));
});
