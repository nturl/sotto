#!/usr/bin/env node
/**
 * R3-E boundary check: a real static export, built with NO cloud env at
 * all, served same-origin on a non-loopback hostname (sotto.localhost —
 * apps/client/src/state/contentApi.ts's dev carve-out only fires on the
 * literal "localhost"/"127.0.0.1"/"[::1]", so this hostname exercises the
 * real hosted-site code path per planning/LEDGER.md's Gate 1 note), driven
 * through onboarding -> home -> book -> reader -> vocabulary. Asserts:
 *   1. No account/paywall/usage UI anywhere in that journey.
 *   2. Every network request the whole run made was same-origin.
 *   3. `dist/` contains no live Stripe/Apple-authentication/expo-iap code
 *      reachable outside an inert (never-imported-without-a-CloudAdapter)
 *      module — grep, not a runtime check.
 *   4. apps/server has no auth/payment/analytics import — repo grep.
 *
 * Usage:
 *   node apps/client/scripts/build-web.mjs   (with EXPO_PUBLIC_CLOUD_URL,
 *     EXPO_PUBLIC_CLOUD and EXPO_PUBLIC_CLOUD_STAGING all unset)
 *   node apps/client/scripts/serve-static.mjs <port> dist
 *   BASE_URL=http://sotto.localhost:<port> node apps/client/e2e/boundary.mjs
 *
 * sotto.localhost resolves to 127.0.0.1 with no /etc/hosts entry needed on
 * macOS/most resolvers (any *.localhost name does, per RFC 6761).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const BASE_URL = (process.env.BASE_URL ?? 'http://sotto.localhost:8099').replace(/\/$/, '');
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/screenshots/web');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const t0 = Date.now();
function log(...args) {
  console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);
}
const issues = [];
function record(name, ok, detail) {
  const tag = ok ? 'PASS' : 'FAIL';
  log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) issues.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

// Text that should never appear anywhere in this journey when no
// CloudAdapter is configured (CONTRACTS §0 / PAYWALL.md §4/§6).
const CLOUD_MARKERS = [
  'Compte',
  'Account',
  'Se connecter',
  'Sign in with Apple',
  "S'abonner",
  'Subscribe',
  'Minutes de tuteur',
  'Tutor minutes',
  'Usage',
  'Utilisation',
];

function assertNoCloudUI(bodyText, screenName) {
  const found = CLOUD_MARKERS.filter((m) => bodyText.includes(m));
  record(`${screenName}: no cloud UI text present`, found.length === 0, found.join(', '));
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 852 } });
  const page = await context.newPage();

  const allRequests = [];
  page.on('request', (req) => allRequests.push(req.url()));
  page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`));

  // ---- Onboarding (fresh, unseeded) ----
  log(`opening ${BASE_URL}/`);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  let body = (await page.textContent('body')) ?? '';
  assertNoCloudUI(body, 'onboarding');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '375-boundary-onboarding.png') });

  // ---- Seed onboarded + a book locale, go to home ----
  const PREFERENCES = {
    interfaceLocale: 'en',
    explanationLocale: 'en',
    learningLocale: 'fr-FR',
    level: 'A1',
    immersionMode: false,
    defaultTutorMode: 'read_to_me',
    captionsEnabled: true,
    turnDetection: 'auto',
    correctionFrequency: 'normal',
    speakingPace: 'normal',
    narrationSpeed: 1,
    onboarded: true,
  };
  await page.evaluate(async (preferences) => {
    const req = indexedDB.open('keyval-store', 1);
    await new Promise((resolve, reject) => {
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('keyval')) req.result.createObjectStore('keyval');
      };
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    const db = req.result;
    const tx = db.transaction('keyval', 'readwrite');
    tx.objectStore('keyval').put(JSON.stringify(preferences), 'sotto.preferences');
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, PREFERENCES);

  log(`opening ${BASE_URL}/(tabs)/home`);
  await page.goto(`${BASE_URL}/(tabs)/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  body = (await page.textContent('body')) ?? '';
  assertNoCloudUI(body, 'home');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '375-boundary-home.png') });

  // ---- Book detail ----
  const BOOK_ID = 'fr-petit-chaperon-rouge';
  log(`opening ${BASE_URL}/book/${BOOK_ID}`);
  await page.goto(`${BASE_URL}/book/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  body = (await page.textContent('body')) ?? '';
  assertNoCloudUI(body, 'book');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '375-boundary-book.png') });

  // ---- Reader ----
  log(`opening ${BASE_URL}/reader/${BOOK_ID}`);
  await page.goto(`${BASE_URL}/reader/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  body = (await page.textContent('body')) ?? '';
  assertNoCloudUI(body, 'reader');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '375-boundary-reader.png') });

  // ---- Vocabulary tab ----
  log(`opening ${BASE_URL}/(tabs)/vocabulary`);
  await page.goto(`${BASE_URL}/(tabs)/vocabulary`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  body = (await page.textContent('body')) ?? '';
  assertNoCloudUI(body, 'vocabulary');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '375-boundary-vocabulary.png') });

  // ---- Every request this whole run made must be same-origin ----
  const baseOrigin = new URL(BASE_URL).origin;
  const offOrigin = allRequests.filter((url) => {
    try {
      return new URL(url).origin !== baseOrigin;
    } catch {
      return false;
    }
  });
  record(
    'Every network request across the whole journey was same-origin',
    offOrigin.length === 0,
    offOrigin.slice(0, 10).join(', '),
  );

  await browser.close();

  // ---- Static dist: no live Stripe/Apple-auth/expo-iap reachable, and no
  //      account/paywall/usage route chunk present with real content -----
  // These strings are EXPECTED to appear: expo-iap/expo-apple-authentication
  // are static OSS-repo dependencies (LEDGER.md R3-S: "all inert without an
  // adapter"), bundled into every build regardless of EXPO_PUBLIC_CLOUD_URL.
  // The boundary property is that they're never CALLED with no CloudAdapter
  // — proven above by the same-origin network check across the whole
  // journey (a real Stripe/Apple network call would show up there) — so
  // this is a report of what module code is present, not a zero-match gate.
  // A literal "stripe.com"/"StripeProvider" hit WOULD be suspicious (the
  // client never embeds a Stripe URL — checkout() gets it from the server).
  const distDir = path.join(REPO_ROOT, 'apps/client/dist');
  let grepOut = '';
  try {
    grepOut = execFileSync(
      'grep',
      ['-rloE', 'stripe\\.com|StripeProvider|AppleAuthentication\\.signInAsync|expo-iap', distDir],
      { encoding: 'utf8' },
    );
  } catch (err) {
    if (err.status !== 1) throw err;
    grepOut = '';
  }
  const hits = grepOut.trim().split('\n').filter(Boolean);
  const suspiciousHits = hits.filter((f) => {
    try {
      const text = execFileSync('grep', ['-oE', 'stripe\\.com|StripeProvider', f], {
        encoding: 'utf8',
      }).trim();
      return text.length > 0;
    } catch (err) {
      if (err.status !== 1) throw err;
      return false;
    }
  });
  log(`dist/ module-code grep: ${hits.join(', ') || '(no matches)'}`);
  record(
    'dist/ has no literal Stripe URL/provider call site (expo-iap module code, present but inert, is expected)',
    suspiciousHits.length === 0,
    suspiciousHits.join(', '),
  );

  // ---- apps/server: no auth/payment/analytics import ----
  let serverGrep = '';
  try {
    serverGrep = execFileSync(
      'grep',
      [
        '-rniE',
        'from [\'"](stripe|@sentry|analytics|posthog|mixpanel|amplitude)',
        path.join(REPO_ROOT, 'apps/server/src'),
      ],
      { encoding: 'utf8' },
    );
  } catch (err) {
    if (err.status !== 1) throw err;
    serverGrep = '';
  }
  record(
    'apps/server has no auth/payment/analytics import',
    serverGrep.trim().length === 0,
    serverGrep.trim().slice(0, 300),
  );

  log(issues.length === 0 ? 'ALL PASS' : `${issues.length} ISSUE(S)`);
  for (const i of issues) log('ISSUE:', i);
  if (issues.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
