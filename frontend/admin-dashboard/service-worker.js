const CACHE_NAME = 'axkan-admin-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './styles.css',
  './mobile.css',
  './mobile.js',
  './dashboard.js',
  './inventory.js',
  './prices.js',
  './shipping.js',
  './guias.js',
  './analytics.js',
  './calendar.js',
  './discounts.js',
  './ai-assistant.js',
  './marketplace.js',
  './leads.js',
  './employees.js',
  './tasks.js',
  './command-palette.js',
  './manifest.json',
  '../assets/images/LOGO-01.png'
];

const CDN_ASSETS = [
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache local assets (these should always succeed)
      const localCaching = cache.addAll(STATIC_ASSETS);
      // Cache CDN assets individually (don't fail install if one CDN is down)
      const cdnCaching = Promise.allSettled(
        CDN_ASSETS.map((url) => cache.add(url).catch(() => console.warn(`Failed to cache: ${url}`)))
      );
      return Promise.all([localCaching, cdnCaching]);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Fetch - network-first for API calls, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls: network-first (always try fresh data)
  if (url.pathname.includes('/api/') || url.hostname.includes('render.com')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses for offline fallback
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => {
          // Offline: serve cached API response if available
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(JSON.stringify({ error: 'Sin conexión', offline: true }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Static assets: cache-first, then network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return cached, but update in background
        fetch(request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
          }
        }).catch(() => {});
        return cached;
      }
      // Not cached: fetch from network
      return fetch(request).then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      });
    })
  );
});
