const CACHE_NAME = 'presend-v2';
const STATIC_ASSETS = [
  '/style.min.css',
  '/favicon.ico',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Only handle same-origin requests; let cross-origin requests
  // (analytics, CDNs, etc.) pass through untouched.
  if (new URL(e.request.url).origin !== self.location.origin) {
    return;
  }

  const isNavigation = e.request.mode === 'navigate';
  if (isNavigation) {
    // Network-first for HTML pages, so content updates show immediately.
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for static assets (CSS, icons, manifest).
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
