/* global self, caches, fetch, URL */
/**
 * Hand-rolled service worker (A3, OVERNIGHT-2.md Lane A). No workbox, no
 * bundler — plain JS so it can sit in public/ untouched by the Expo web
 * export and be registered as-is from app/_layout.tsx.
 *
 * - Precaches the app shell (index.html + the hashed /_expo/static JS/CSS
 *   files) using the file list build-web.mjs writes to /sw-manifest.json
 *   after each export. The manifest's `version` names the shell cache, so
 *   a new deploy gets a fresh cache and the old one is dropped on activate.
 * - Runtime-caches same-origin /content/packs/** the first time a file is
 *   requested (cache-first), so a book already opened once keeps working
 *   offline — including its audio.
 * - /content/packs/index.json is network-first (new books shouldn't need a
 *   fresh deploy to show up), falling back to the cache when offline.
 * - Every cross-origin request (Lane B's model downloads included) is left
 *   completely alone — this worker never calls respondWith for them.
 */
const MANIFEST_URL = '/sw-manifest.json';
const SHELL_CACHE_PREFIX = 'sotto-shell-';
const CONTENT_CACHE_PREFIX = 'sotto-content-';

async function getManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Always take over on the very next activate, even with no manifest
      // to precache — a stranger's first visit must not need a *second*
      // load before this worker starts controlling the page (see the
      // `clients.claim()` below and the `cache-book` message handler).
      self.skipWaiting();
      const manifest = await getManifest();
      if (!manifest) {
        // No manifest (e.g. dev server, or a build that skipped
        // build-web.mjs) — nothing safe to precache, but the SW still
        // installs so runtime content-caching below still works.
        return;
      }
      const cache = await caches.open(SHELL_CACHE_PREFIX + manifest.version);
      await cache.addAll(manifest.files);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const manifest = await getManifest();
      const currentShell = manifest ? SHELL_CACHE_PREFIX + manifest.version : null;
      const currentContent = manifest ? CONTENT_CACHE_PREFIX + manifest.version : null;
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => {
            if (name.startsWith(SHELL_CACHE_PREFIX)) return name !== currentShell;
            if (name.startsWith(CONTENT_CACHE_PREFIX)) return name !== currentContent;
            return false;
          })
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// A stranger's first opened book must be offline-ready after that *same*
// load, not only after a second one — the fetch handler below only ever
// sees requests issued once this worker already controls the page. The
// client posts every URL a just-opened book needs (book.json, each
// chapter file, cover.svg, chapter audio) here as soon as it's ready, and
// this fetches+caches each one directly instead of waiting for the page to
// (re)request it.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache-book' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const manifest = await getManifest();
      const cache = await caches.open(CONTENT_CACHE_PREFIX + (manifest?.version ?? 'dev'));
      await Promise.all(
        data.urls.map(async (url) => {
          try {
            const existing = await cache.match(url);
            if (existing) return;
            const response = await fetch(url);
            const contentType = response.headers.get('content-type') || '';
            if (!response.ok || contentType.includes('text/html')) return;
            await cache.put(url, response);
          } catch {
            // Best-effort, per-URL: one failed asset must never abort the
            // rest of the book's caching.
          }
        }),
      );
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // pass through, untouched
  if (event.request.method !== 'GET') return;

  if (url.pathname === '/content/packs' || url.pathname === '/content/packs/index.json') {
    event.respondWith(
      getManifest().then((manifest) =>
        networkFirst(event.request, CONTENT_CACHE_PREFIX + (manifest?.version ?? 'dev')),
      ),
    );
    return;
  }

  if (url.pathname.startsWith('/content/packs/')) {
    event.respondWith(
      getManifest().then((manifest) =>
        cacheFirst(event.request, CONTENT_CACHE_PREFIX + (manifest?.version ?? 'dev')),
      ),
    );
    return;
  }

  // App shell: cache-first, network fallback. Navigation requests
  // (`mode: 'navigate'`, e.g. a hard reload on /reader/<id>) fall back to
  // the cached index.html when offline, since this is a client-routed SPA.
  event.respondWith(
    (async () => {
      const manifest = await getManifest();
      const shellCache = SHELL_CACHE_PREFIX + (manifest?.version ?? 'dev');
      try {
        return await cacheFirst(event.request, shellCache);
      } catch (err) {
        if (event.request.mode === 'navigate') {
          const cache = await caches.open(shellCache);
          const index = await cache.match('/index.html');
          if (index) return index;
        }
        throw err;
      }
    })(),
  );
});
