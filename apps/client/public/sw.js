/* global self, caches, fetch, URL, Response, Headers, console */
/**
 * Hand-rolled service worker (A3, OVERNIGHT-2.md Lane A). No workbox, no
 * bundler — plain JS so it can sit in public/ untouched by the Expo web
 * export and be registered as-is from app/_layout.tsx.
 *
 * - Precaches the app shell (app.html, index.html + the hashed /_expo/static JS/CSS
 *   files) using the file list build-web.mjs writes to /sw-manifest.json
 *   after each export. The manifest's `version` names the shell cache, so
 *   a new deploy gets a fresh cache and the old one is dropped on activate.
 *   The offline navigate fallback below serves /app.html (the app shell;
 *   / is the static landing page, which the SW's shell cache also has).
 * - Runtime-caches same-origin /content/packs/** the first time a file is
 *   requested (cache-first), so a book already opened once keeps working
 *   offline — including its audio.
 * - /content/packs/index.json is network-first (new books shouldn't need a
 *   fresh deploy to show up), falling back to the cache when offline.
 * - Every cross-origin request (Lane B's model downloads included) is left
 *   completely alone — this worker never calls respondWith for them.
 *
 * F2.1: the manifest is fetched from the network only in install/activate
 * and kept in memory for the rest of the worker's life; every other lookup
 * (including the fetch handlers, which run offline) reads memory first,
 * then a copy of sw-manifest.json this worker cached into the versioned
 * shell cache at install time, and only hits the network as a last resort.
 * If no manifest can be found at all (e.g. a resurrected worker whose
 * memory was dropped and whose cached copy somehow vanished) the cache
 * name falls back to the newest `sotto-shell-*`/`sotto-content-*` key
 * already in Cache Storage, never to the literal 'dev' cache while a real
 * versioned cache exists.
 */
const MANIFEST_URL = '/sw-manifest.json';
const SHELL_CACHE_PREFIX = 'sotto-shell-';
const CONTENT_CACHE_PREFIX = 'sotto-content-';

// In-memory for the life of this worker instance — avoids a network (or
// even a Cache Storage) round trip on every single fetch.
let memoryManifest = null;

async function fetchManifestFromNetwork() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Reads the manifest copy this worker put into the versioned shell cache
// at install time (see the install handler below). Falls back across
// multiple shell caches, newest version first, in case the current one's
// copy is somehow missing.
async function readManifestFromCache() {
  const names = await caches.keys();
  const shellNames = names
    .filter((name) => name.startsWith(SHELL_CACHE_PREFIX))
    .sort(
      (a, b) =>
        Number(b.slice(SHELL_CACHE_PREFIX.length)) - Number(a.slice(SHELL_CACHE_PREFIX.length)),
    );
  for (const name of shellNames) {
    const cache = await caches.open(name);
    const cached = await cache.match(MANIFEST_URL);
    if (!cached) continue;
    try {
      return await cached.json();
    } catch {
      // corrupt entry — try the next cache
    }
  }
  return null;
}

// Memory, then the cached copy, then the network — never the network on
// every request.
async function getManifest() {
  if (memoryManifest) return memoryManifest;
  const fromCache = await readManifestFromCache();
  if (fromCache) {
    memoryManifest = fromCache;
    return fromCache;
  }
  const fromNetwork = await fetchManifestFromNetwork();
  if (fromNetwork) {
    memoryManifest = fromNetwork;
    return fromNetwork;
  }
  return null;
}

async function newestCacheName(prefix) {
  const names = await caches.keys();
  const matching = names
    .filter((name) => name.startsWith(prefix))
    .sort((a, b) => Number(b.slice(prefix.length)) - Number(a.slice(prefix.length)));
  return matching[0] ?? null;
}

// Resolves the shell/content cache name to use for a request. Prefers the
// manifest's version; when no manifest is available at all, falls back to
// the newest already-existing versioned cache rather than a 'dev' cache
// that (once any real deploy has ever precached) will not exist.
async function resolveCacheName(prefix) {
  const manifest = await getManifest();
  if (manifest) return prefix + manifest.version;
  const newest = await newestCacheName(prefix);
  return newest ?? prefix + 'dev';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Always take over on the very next activate, even with no manifest
      // to precache — a stranger's first visit must not need a *second*
      // load before this worker starts controlling the page (see the
      // `clients.claim()` below and the `cache-book` message handler).
      self.skipWaiting();
      const manifest = await fetchManifestFromNetwork();
      if (!manifest) {
        // No manifest (e.g. dev server, or a build that skipped
        // build-web.mjs) — nothing safe to precache, but the SW still
        // installs so runtime content-caching below still works.
        return;
      }
      memoryManifest = manifest;
      const cache = await caches.open(SHELL_CACHE_PREFIX + manifest.version);
      // Store the manifest itself so offline instances of this worker (or
      // a later worker whose memory started empty) can resolve cache
      // names without a network round trip.
      await cache.put(
        MANIFEST_URL,
        new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }),
      );
      // One file at a time: a single 404 among the shell files must not
      // abort the whole precache the way cache.addAll's all-or-nothing
      // behavior would.
      const results = await Promise.allSettled(manifest.files.map((file) => cache.add(file)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        console.warn(
          `sw install: ${failed}/${manifest.files.length} shell files failed to precache`,
        );
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Refresh the in-memory manifest for this worker's lifetime instead
      // of hitting the network on every fetch.
      const manifest = await fetchManifestFromNetwork();
      if (manifest) memoryManifest = manifest;
      const currentShell = manifest ? SHELL_CACHE_PREFIX + manifest.version : null;
      const currentContent = manifest ? CONTENT_CACHE_PREFIX + manifest.version : null;
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => {
            if (name.startsWith(SHELL_CACHE_PREFIX))
              return currentShell ? name !== currentShell : false;
            if (name.startsWith(CONTENT_CACHE_PREFIX))
              return currentContent ? name !== currentContent : false;
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
      const cacheName = await resolveCacheName(CONTENT_CACHE_PREFIX);
      const cache = await caches.open(cacheName);
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

// Answer a Range request from a cached full response (206 with
// Content-Range), or fall through to the network when the file is not cached.
async function rangeFromCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request.url, { ignoreSearch: false });
  if (!cached || cached.status !== 200) return fetch(request);
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (!match) return fetch(request);
  const buffer = await cached.arrayBuffer();
  const total = buffer.byteLength;
  let start = match[1] === '' ? 0 : Number(match[1]);
  let end = match[2] === '' ? total - 1 : Number(match[2]);
  if (match[1] === '' && match[2] !== '') {
    start = Math.max(0, total - Number(match[2]));
    end = total - 1;
  }
  if (start >= total || end < start) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }
  end = Math.min(end, total - 1);
  const headers = new Headers(cached.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers,
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // pass through, untouched
  if (event.request.method !== 'GET') return;

  if (url.pathname === '/content/packs' || url.pathname === '/content/packs/index.json') {
    event.respondWith(
      resolveCacheName(CONTENT_CACHE_PREFIX).then((cacheName) =>
        networkFirst(event.request, cacheName),
      ),
    );
    return;
  }

  if (url.pathname.startsWith('/content/packs/')) {
    // Media elements fetch audio with a Range header and reject a full 200
    // body in reply (net::ERR_FAILED). Serve ranges from the cached full
    // file as a 206 when we have it; otherwise let the network answer.
    if (event.request.headers.has('range')) {
      event.respondWith(
        resolveCacheName(CONTENT_CACHE_PREFIX).then((cacheName) =>
          rangeFromCache(event.request, cacheName),
        ),
      );
      return;
    }
    event.respondWith(
      resolveCacheName(CONTENT_CACHE_PREFIX).then((cacheName) =>
        cacheFirst(event.request, cacheName),
      ),
    );
    return;
  }

  // App shell: cache-first, network fallback. Navigation requests
  // (`mode: 'navigate'`, e.g. a hard reload on /reader/<id>) fall back to
  // the cached app.html when offline, since this is a client-routed SPA.
  event.respondWith(
    (async () => {
      const shellCache = await resolveCacheName(SHELL_CACHE_PREFIX);
      try {
        return await cacheFirst(event.request, shellCache);
      } catch (err) {
        if (event.request.mode === 'navigate') {
          const cache = await caches.open(shellCache);
          const index = await cache.match('/app.html');
          if (index) return index;
        }
        throw err;
      }
    })(),
  );
});
