/*
 * Service Worker: macht das Adressbuch offline nutzbar.
 *
 * Beim Bauen ersetzt vite.config.ts die Platzhalter durch die Liste aller
 * Dateien der App und eine Versionskennung. Kontaktdaten liegen nicht in
 * diesem Zwischenspeicher, sondern in der Datenbank des Browsers.
 */

const VERSION = '__SW_VERSION__';
const CACHE = `adressbuch-${VERSION}`;
const PRECACHE = self.__PRECACHE__ || [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('adressbuch-') && key !== CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Seitenaufruf: aktuelle Fassung aus dem Netz, ohne Netz die gespeicherte
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('./', copy));
          }
          return response;
        })
        .catch(() => caches.match('./', { cacheName: CACHE }).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Alles andere: zuerst aus dem Zwischenspeicher
  event.respondWith(
    caches.match(request, { cacheName: CACHE }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
