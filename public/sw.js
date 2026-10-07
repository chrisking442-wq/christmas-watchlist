const CACHE_NAME = "check-it-twice-v1";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/check-it-twice-logo-final.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache Supabase, TMDB or any other third-party/API traffic.
  if (url.origin !== self.location.origin) return;

  // During Vite local development, always use the live network files so
  // the service worker cannot make hot-reload changes look stale.
  const isLocalDev =
    self.location.hostname === "localhost" ||
    self.location.hostname === "127.0.0.1";

  if (isLocalDev) {
    event.respondWith(fetch(request));
    return;
  }

  // Pages/navigation: network first, then cached app shell if offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Same-origin static assets: cached first, then refresh from network.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
