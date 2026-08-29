// Menagerie's service worker: the app's own files, and nothing else.
//
// WHAT THIS CACHE HOLDS, because in an app whose premise is "the server
// stores only ciphertext it can't read" the answer has to be deliberate:
// only same-origin static assets — the HTML shell, the JS and CSS chunks,
// the fonts, the sprites. Profile data lives on the profile server, which is
// a DIFFERENT ORIGIN, and every cross-origin request falls through to the
// network untouched. No ciphertext, no locator, no phrase, and nothing about
// anyone is ever written here. That is why logging out has nothing to clear.
//
// It follows that this worker makes the app installable and survivable
// offline, but it does NOT make the survey fillable offline: answers live in
// memory by design (see DraftStore), and changing that means writing
// plaintext answers to disk, which is a product decision and not a caching
// one.

const VERSION = 'moxy-shell-v1';

self.addEventListener('install', () => {
  // Nothing to precache: asset filenames are content-hashed by the build, so
  // there is no manifest to keep in step, and the first visit fills the cache
  // with exactly what this build actually used.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== VERSION) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Cache-first, for files whose name changes when their content does. */
async function fromCacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) (await caches.open(VERSION)).put(request, response.clone());
  return response;
}

/**
 * Network-first, falling back to the cache only when the network is gone.
 * The live copy always wins where there is one — which is what lets an app
 * update move the profile server's address without being overruled by a
 * stale cached config.
 */
async function fromNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(VERSION)).put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // The profile server is another origin, and stays entirely out of this.
  if (url.origin !== self.location.origin) return;

  // A navigation is always the shell: hash routing means every route is the
  // same document, so one cached index.html serves the whole app offline.
  if (request.mode === 'navigate') {
    event.respondWith(fromNetworkFirst(new Request('index.html')));
    return;
  }

  // Config and locale catalogues must never be served stale while a network
  // exists: neither filename carries a content hash, so a cached copy would
  // outlive the deploy that replaced it.
  if (url.pathname.endsWith('moxy.config.json') || url.pathname.includes('/i18n/')) {
    event.respondWith(fromNetworkFirst(request));
    return;
  }

  event.respondWith(fromCacheFirst(request));
});
