var CACHE_NAME = 'axkan-command-v2';
var SHELL_FILES = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json'
];

self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(SHELL_FILES);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(n) { return n !== CACHE_NAME; })
                     .map(function(n) { return caches.delete(n); })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(e) {
    // Network-first for API calls
    if (e.request.url.indexOf('/api/') >= 0) {
        e.respondWith(
            fetch(e.request).catch(function() {
                return new Response(JSON.stringify({ success: false, message: 'Offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Cache-first for app shell
    e.respondWith(
        caches.match(e.request).then(function(cached) {
            return cached || fetch(e.request);
        })
    );
});

// ── Push Notifications ──

self.addEventListener('push', function(e) {
    var data = {};
    try {
        data = e.data ? e.data.json() : {};
    } catch (err) {
        data = { title: 'AXKAN', body: e.data ? e.data.text() : 'Nueva notificación' };
    }

    var title = data.title || 'AXKAN Command';
    var options = {
        body: data.body || '',
        icon: data.icon || '/jaguar.png',
        badge: data.badge || '/jaguar.png',
        data: data.data || {},
        vibrate: [200, 100, 200],
        tag: data.tag || 'axkan-notification',
        renotify: true
    };

    e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(e) {
    e.notification.close();

    var targetView = (e.notification.data && e.notification.data.view) || 'home';
    var url = '/?view=' + targetView;

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Focus existing window if open
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.indexOf(self.location.origin) >= 0 && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open new window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
