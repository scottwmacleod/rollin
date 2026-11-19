// rollin offline worker. `scripts/pwa.ts` fills in the version and file list
// at build time. Everything the app needs is cached on install, pages are
// served from that cache, and a new worker waits until the player chooses to
// reload (the page sends SKIP_WAITING) rather than swapping mid-session.
const VERSION = "__VERSION__";
const CACHE = `rollin-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("rollin-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // PostHog's proxy (/_sm/) always goes to the network, never to the cache.
  if (url.pathname.startsWith("/_sm/")) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Module scripts are fetched with CORS, so ignore Vary: Origin on the stored copies.
      const cached = await cache.match(request.mode === "navigate" ? "/" : request, {
        ignoreSearch: request.mode === "navigate",
        ignoreVary: true,
      });
      return cached ?? fetch(request);
    })(),
  );
});
