// Deep Cut service worker v2 — real PWA speed.
// - Navigations: network-first (never a stale build), offline fallback page.
// - /_next/static/*: cache-first — content-hashed and immutable, so repeat
//   launches load the app's JS/CSS/fonts straight from disk.
// - TMDB posters: cache-first with a size cap — seen posters render instantly.
const SHELL = "deepcut-shell-v2";
const STATIC = "deepcut-static-v2";
const POSTERS = "deepcut-posters-v2";
const OFFLINE_URL = "/offline.html";
const POSTER_LIMIT = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL, STATIC, POSTERS]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(cacheName, request, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") {
    cache.put(request, res.clone());
    if (limit) {
      const keys = await cache.keys();
      if (keys.length > limit) await cache.delete(keys[0]); // simple FIFO trim
    }
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App navigations: always fresh, themed fallback when offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Immutable build assets (hashed filenames): serve from disk after first load.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(STATIC, req));
    return;
  }

  // Poster art: instant on repeat views, capped so it never bloats the phone.
  if (url.hostname === "image.tmdb.org") {
    event.respondWith(cacheFirst(POSTERS, req, POSTER_LIMIT));
    return;
  }
});
