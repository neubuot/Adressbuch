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

// Dateien, die eine andere App über "Teilen" übergibt (siehe src/io/shared.ts)
const SHARE_CACHE = 'geteilte-dateien';
const SHARE_NAME_HEADER = 'X-Dateiname';
const SHARE_FIELD = 'kontakte';
const SHARE_MAX_FILES = 200;
const SHARE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Nimmt geteilte Dateien entgegen, legt sie kurz im Zwischenspeicher ab und
 * öffnet die Ansicht zum Übernehmen. Die Dateien bleiben auf dem Gerät.
 */
async function receiveShare(request) {
  const target = new URL('./#/mehr/import', self.registration.scope).toString();
  try {
    const form = await request.formData();
    const files = form
      .getAll(SHARE_FIELD)
      .filter((entry) => typeof entry !== 'string' && entry.size > 0 && entry.size <= SHARE_MAX_BYTES)
      .slice(0, SHARE_MAX_FILES);

    await caches.delete(SHARE_CACHE);
    if (files.length > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await Promise.all(
        files.map((file, index) =>
          cache.put(
            new URL(`./geteilt/${index}`, self.registration.scope).toString(),
            new Response(file, {
              headers: {
                'Content-Type': file.type || 'application/octet-stream',
                [SHARE_NAME_HEADER]: encodeURIComponent(file.name || ''),
              },
            })
          )
        )
      );
    }
  } catch (error) {
    // Ohne lesbare Dateien öffnet sich die Ansicht leer
  }
  return Response.redirect(target, 303);
}

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
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST' && url.pathname === new URL('./share', self.registration.scope).pathname) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;

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
