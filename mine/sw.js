/* ════════════════════════════════════════════════════════════════════
 * The Mine — Service Worker (PWA)
 * Strategy:
 *   - Same-origin GET (the app shell): cache-first, refreshed in background.
 *   - Cross-origin (Railway API, CDNs): always bypass → straight to network.
 * Bump CACHE_VERSION whenever shell files change to force an update.
 * ════════════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'mine-shell-v2';
const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './app.js',
  './mint_expansion.js',
  './icons/v2_guide.png',
  './icons/v2_charts.png',
  './icons/v2_museum.png',
  './icons/v2_news.png',
  './icons/v2_personal.png',
  './icons/v2_homework.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
