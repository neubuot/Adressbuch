// Service Worker für Progressive Web App
const CACHE_NAME = 'adressbuch-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install Event - Cache erstellen
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installation');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Dateien werden gecacht');
                return cache.addAll(urlsToCache.map(url => {
                    return new Request(url, { cache: 'no-cache' });
                })).catch(err => {
                    console.warn('Einige Dateien konnten nicht gecacht werden:', err);
                    // Cache zumindest die essentiellen Dateien
                    return cache.addAll([
                        '/index.html',
                        '/styles.css',
                        '/app.js'
                    ].map(url => new Request(url, { cache: 'no-cache' })));
                });
            })
    );
    self.skipWaiting();
});

// Activate Event - Alte Caches löschen
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Aktivierung');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Alter Cache wird gelöscht:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Fetch Event - Cache-First-Strategie
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - gebe gecachte Antwort zurück
                if (response) {
                    return response;
                }

                // Keine Cache-Treffer - hole von Netzwerk
                return fetch(event.request).then(
                    (response) => {
                        // Prüfe ob gültige Antwort
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone der Antwort erstellen
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    }
                ).catch(() => {
                    // Offline und nicht im Cache - zeige Offline-Seite
                    return caches.match('/index.html');
                });
            })
    );
});

// Background Sync für Nachrichten (falls unterstützt)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-messages') {
        event.waitUntil(syncMessages());
    }
});

async function syncMessages() {
    console.log('Service Worker: Synchronisiere Nachrichten');
    // Hier könnte P2P-Synchronisation implementiert werden
    // Zum Beispiel mit WebRTC oder einer anderen P2P-Technologie
}

// Push Notifications (für zukünftige Erweiterung)
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'Neue Nachricht',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification('Adressbuch', options)
    );
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
