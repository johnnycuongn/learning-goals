/*
 * A deliberately small service worker.
 *
 *  - Navigations (HTML): network-first, then the cached shell, then the
 *    offline page. Never cache-first, or a deploy would not reach anyone.
 *  - Hashed build assets: cache-first, because their URL changes when they do.
 *  - Everything else, including every Supabase call: straight to the network.
 *
 * It never caches API responses, anything authenticated, or a non-GET request.
 */
const VERSION = 'v2';
const SHELL = `myroadmaps-shell-${VERSION}`;
const ASSETS = `myroadmaps-assets-${VERSION}`;
const OFFLINE = '/offline.html';

const PRECACHE = [
  OFFLINE,
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever touch same-origin GETs. Supabase, fonts and everything else pass through.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() =>
          caches
            .match('/', { ignoreSearch: true })
            .then((cached) => cached || caches.match(OFFLINE)),
        ),
    );
    return;
  }

  // Hashed build output: safe to serve from cache, because the name changes.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Precached icons and the manifest: cache-first, refreshed in the background.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});

// Signing out clears anything this worker is holding for the previous viewer.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-caches') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});
