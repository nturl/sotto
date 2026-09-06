#!/usr/bin/env node
/**
 * R4-F2 proof: public/sw.js's fetch handler must never cache-first a
 * same-origin API GET. On the paid origin (app.readsotto.app) the static
 * export and the sotto-cloud API share one origin, so before this fix the
 * app-shell handler's cache-first treatment of every same-origin GET that
 * wasn't /content/packs/** froze /me, /billing/plans and /usage at their
 * first response (docs/evidence/paid-web-2026-09-05.log's [375] usage
 * FAILs) — still "free" right after a real subscribe.
 *
 * Drives the static export directly (serve-static.mjs, mirroring
 * vercel.json) rather than the dev server, since the service worker only
 * registers in a production build (app/_layout.tsx). Asserts on Cache
 * Storage contents rather than on offline navigation: Playwright's
 * `context.setOffline(true)` blocks the request at the network-emulation
 * layer before the page's own service worker fetch handler ever runs (the
 * same known CDP limitation e2e/hosted.mjs documents for its offline-reload
 * check), so it cannot tell "served from cache" apart from "no network".
 * A plain online fetch plus a read of `caches.keys()`/`cache.match()`
 * proves the same thing without that trap.
 *
 * For each of API_PATH_PREFIXES (sw.js's own list — every prefix here is
 * matched, not exhaustively, since they all go through one `.some()`
 * check) fetches one representative path once, then checks every open
 * cache for an entry keyed to that exact URL. A control path outside the
 * list (an ordinary SPA route) is expected to land in the shell cache,
 * proving cache-first is still active in general and the exemption is
 * prefix-specific, not a global cache disablement.
 *
 * Usage:
 *   pnpm --filter @sotto/client web:export   # build dist/ first
 *   node apps/client/e2e/sw-api-passthrough.mjs
 *   PORT=8095 node apps/client/e2e/sw-api-passthrough.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, '..');
const DIST = path.join(clientDir, 'dist');
const PORT = Number(process.env.PORT ?? 8095);
const BASE_URL = `http://localhost:${PORT}`;

const EXEMPT_PATHS = [
  '/account',
  '/admin',
  '/auth',
  '/billing/plans',
  '/health',
  '/import',
  '/imports',
  '/me',
  '/voice',
  '/webhooks',
  '/terms',
  '/privacy',
];
const CONTROL_PATH = '/sw-passthrough-control-check';

let failed = false;
function log(...args) {
  console.log(`[sw-api-passthrough]`, ...args);
}
function fail(message) {
  failed = true;
  console.error(`[sw-api-passthrough] FAIL: ${message}`);
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

(async () => {
  if (!existsSync(DIST)) {
    fail(`no static export at ${DIST} — run \`pnpm web:export\` first`);
    process.exit(1);
  }

  log(`serving ${DIST} on ${BASE_URL}`);
  const server = spawn('node', ['scripts/serve-static.mjs', String(PORT)], {
    cwd: clientDir,
    stdio: 'inherit',
  });

  try {
    if (!(await waitForServer(BASE_URL))) {
      fail('static server never came up');
      process.exit(1);
    }

    const browser = await chromium.launch();
    const page = await browser.newPage();
    // The bare origin serves the static landing page (web/landing/index.html
    // per build-web.mjs), which has no Expo runtime and never registers the
    // service worker. Navigating to the literal file `/app.html` doesn't
    // work either — expo-router reads `location.pathname` to match a
    // route, "/app.html" matches none of them, and the resulting
    // +not-found screen never runs the root layout's registration effect
    // (confirmed by instrumenting `navigator.serviceWorker.register`
    // directly: zero calls on /app.html, one call on a real route). A
    // real matched route path, served by serve-static.mjs's SPA fallback
    // exactly as vercel.json's rewrite does in production, is what
    // actually exercises app/_layout.tsx's registration effect.
    await page.goto(`${BASE_URL}/library`, { waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    // `ready` resolves once there's an active worker for the scope, but
    // this first-ever load's `.controller` only flips non-null once the
    // activate handler's `clients.claim()` has actually taken effect for
    // this page — a small, variable delay after `ready`. Poll briefly
    // instead of checking once.
    let controlling = false;
    for (let i = 0; i < 20 && !controlling; i++) {
      controlling = await page.evaluate(() => !!navigator.serviceWorker.controller);
      if (!controlling) await new Promise((r) => setTimeout(r, 250));
    }
    if (controlling) log('service worker is controlling the page');
    else fail('service worker never took control of the page');

    // Fetch each exempt path once (plain GETs, no cache-buster — that's
    // the point) and check every Cache Storage entry afterwards.
    const results = await page.evaluate(
      async ({ exemptPaths, controlPath }) => {
        const out = {};
        for (const p of [...exemptPaths, controlPath]) {
          try {
            await fetch(p, { cache: 'no-store' });
          } catch (err) {
            out[p] = { fetchError: String(err) };
            continue;
          }
          const cacheNames = await caches.keys();
          let cachedIn = null;
          for (const name of cacheNames) {
            const cache = await caches.open(name);
            const match = await cache.match(p, { ignoreSearch: false });
            if (match) {
              cachedIn = name;
              break;
            }
          }
          out[p] = { cachedIn };
        }
        return out;
      },
      { exemptPaths: EXEMPT_PATHS, controlPath: CONTROL_PATH },
    );

    for (const p of EXEMPT_PATHS) {
      const r = results[p];
      if (r.fetchError) {
        fail(`${p}: fetch threw ${r.fetchError}`);
      } else if (r.cachedIn) {
        fail(`${p}: served from the SW cache (found in "${r.cachedIn}") — exemption not working`);
      } else {
        log(`${p}: not cached (network answered untouched) — PASS`);
      }
    }

    const control = results[CONTROL_PATH];
    if (control.fetchError) {
      fail(`control path ${CONTROL_PATH}: fetch threw ${control.fetchError}`);
    } else if (control.cachedIn) {
      log(
        `${CONTROL_PATH}: cached in "${control.cachedIn}" — PASS (cache-first is still active for ordinary routes)`,
      );
    } else {
      fail(`control path ${CONTROL_PATH}: was NOT cached — cache-first may be broken generally`);
    }

    // The bypass above must NOT swallow navigations. /account, /account/magic,
    // /voice/<bookId>, /import and /import/<jobId> are client routes as well as
    // API prefixes, and this worker also ships to the free origin, where no API
    // exists and /voice/<bookId> is the reading screen. If the bypass caught
    // navigations too, those routes would lose their offline shell fallback.
    // A navigation goes through the app-shell branch, which cache-firsts and so
    // puts the document in the shell cache — the same signal the control check
    // uses. Asserting on that keeps us clear of the setOffline trap above.
    const NAV_PATH = '/account';
    await page.goto(`${BASE_URL}${NAV_PATH}`, { waitUntil: 'load' });
    const navCachedIn = await page.evaluate(async (navPath) => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        if (await cache.match(navPath, { ignoreSearch: false })) return name;
      }
      return null;
    }, NAV_PATH);
    if (navCachedIn) {
      log(
        `navigation to ${NAV_PATH}: cached in "${navCachedIn}" — PASS (client routes that share an API prefix keep their offline shell fallback)`,
      );
    } else {
      fail(
        `navigation to ${NAV_PATH}: NOT cached — the API bypass is swallowing navigations, so this client route has lost its offline fallback`,
      );
    }

    await browser.close();
  } finally {
    server.kill();
  }

  if (failed) {
    log('RESULT: FAIL');
    process.exit(1);
  }
  log('RESULT: PASS');
})();
