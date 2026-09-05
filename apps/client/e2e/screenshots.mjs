#!/usr/bin/env node
/**
 * Disk screenshots for docs/screenshots/web/<width>-<screen>.png (WS-6
 * task 3). Drives the real web app (Metro dev server, EXPO_PUBLIC_VOICE=fake
 * so the voice screen is deterministic) with Playwright/Chromium, seeding a
 * fresh profile by writing straight into the same IndexedDB store
 * `src/platform/persistence.web.ts` reads (idb-keyval's default
 * "keyval-store" / "keyval" — see createStore.ts's KEYS/DEFAULT_PREFERENCES
 * for the exact key names and JSON shape) rather than clicking through
 * onboarding for every run.
 *
 * Usage: BASE_URL=http://localhost:8082 node apps/client/e2e/screenshots.mjs
 * (BASE_URL must point at a dev server started with EXPO_PUBLIC_VOICE=fake;
 * `pnpm e2e:screenshots` wires that up.)
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/web');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8082';
const BOOK_ID = 'es-fabulas-samaniego';

const PHONE_WIDTHS = [375, 393, 430];
const PHONE_HEIGHT = 852;
const DESKTOP_WIDTHS = [768, 1024, 1440];
const DESKTOP_HEIGHT = 900;
const WIDTHS = [...PHONE_WIDTHS, ...DESKTOP_WIDTHS];

mkdirSync(OUT_DIR, { recursive: true });

function heightFor(width) {
  return PHONE_WIDTHS.includes(width) ? PHONE_HEIGHT : DESKTOP_HEIGHT;
}

function log(...args) {
  console.log('[screenshots]', ...args);
}

async function shootAllWidths(page, name) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: heightFor(width) });
    // Let RN Web's responsive layout settle after the resize.
    await page.waitForTimeout(120);
    const file = path.join(OUT_DIR, `${width}-${name}.png`);
    await page.screenshot({ path: file });
    log(`${width}-${name}.png`);
  }
}

/** Writes idb-keyval-shaped rows directly into the "keyval-store"/"keyval"
 * IndexedDB object store persistence.web.ts uses, so a reload boots the app
 * straight past onboarding with real preferences/progress/vocabulary. */
async function seed(page, { preferences, progress, savedWords }) {
  await page.evaluate(
    async ({ preferences, progress, savedWords }) => {
      const req = indexedDB.open('keyval-store', 1);
      await new Promise((resolve, reject) => {
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('keyval'))
            req.result.createObjectStore('keyval');
        };
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      const db = req.result;
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      store.put(JSON.stringify(preferences), 'sotto.preferences');
      if (progress) store.put(JSON.stringify(progress), 'sotto.progress');
      if (savedWords) store.put(JSON.stringify(savedWords), 'sotto.vocabulary');
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { preferences, progress, savedWords },
  );
}

const DEFAULT_PREFERENCES = {
  interfaceLocale: 'fr',
  explanationLocale: 'en',
  learningLocale: 'es-419',
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

const issues = [];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: PHONE_WIDTHS[0], height: PHONE_HEIGHT },
    permissions: [],
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`console.error: ${msg.text()}`);
  });

  // ---- 1. Onboarding (fresh, unseeded profile) ----
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await shootAllWidths(page, 'onboarding-languages');

  // ---- Seed a fully onboarded profile, then navigate to home explicitly.
  //      reload() re-requests the *current* URL — which by this point is
  //      wherever the unauthenticated redirect landed (/onboarding/languages)
  //      — so it re-renders onboarding instead of home. goto(BASE_URL) always
  //      lands wherever an onboarded profile actually routes to. ----
  await seed(page, { preferences: DEFAULT_PREFERENCES });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // ---- 2. Home ----
  await shootAllWidths(page, 'home');

  // ---- 3. Library ----
  await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await shootAllWidths(page, 'library');

  // ---- 4. Library search (with a query) ----
  await page.goto(`${BASE_URL}/library/search`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const searchBox = page.getByPlaceholder(/Rechercher/i).first();
  await searchBox.click();
  await searchBox.fill('fábulas');
  await page.waitForTimeout(300);
  await shootAllWidths(page, 'library-search');

  // ---- 5. Book detail ----
  await page.goto(`${BASE_URL}/book/${BOOK_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await shootAllWidths(page, `book-${BOOK_ID}`);

  // ---- 6. Reader: tap a word (opens translation panel + selects it), then
  //         tap Save (marker stroke) ----
  await page.goto(`${BASE_URL}/reader/${BOOK_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  // exact:true so this only matches an individual word token ("cigarra"),
  // not the chapter title "La cigarra y la hormiga" which also contains it.
  const word = page.getByText('cigarra', { exact: true }).first();
  await word.click();
  await page.waitForTimeout(300);
  const saveButton = page.getByText(/^(Enregistrer|Save|Guardar)$/i).first();
  if (await saveButton.count()) {
    await saveButton.click();
    await page.waitForTimeout(300);
  } else {
    issues.push(
      'reader: save button not found by text — screenshot may be missing the marker stroke',
    );
  }
  await shootAllWidths(page, 'reader');

  // ---- 7. Vocabulary (shows the word just saved) ----
  await page.goto(`${BASE_URL}/vocabulary`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await shootAllWidths(page, 'vocabulary');

  // ---- 8. Review ----
  await page.goto(`${BASE_URL}/review?bookId=${BOOK_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await shootAllWidths(page, 'review');

  // ---- 9. Profile ----
  await page.goto(`${BASE_URL}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await shootAllWidths(page, 'profile');

  // ---- 10. Voice: two states, re-navigated per width so the fake
  //          provider's fixture timeline (connecting@0/listening@150ms/
  //          speaking@300ms, packages/voice/fixtures/read_to_me.json) is
  //          fresh for every screenshot pair. ----
  // read_to_me.json fixture timeline: connecting@0, listening@150ms,
  // speaking@300ms (through reading/caption events) back to listening@1500ms.
  // Real page-load/render overhead makes a fixed wait unreliable (it can
  // land past the state it's meant to catch), so poll the actual state
  // label text (fr.json voice.state.*) instead of guessing a delay.
  async function waitForStateLabel(texts, timeoutMs) {
    const locator = page.getByText(new RegExp(`^(${texts.join('|')})$`)).first();
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  }

  // ADVERSARIAL-REVIEW.md §1.9: the committed `-voice-speaking.png` used to
  // be captured the instant the "parle" state label appeared, which can
  // land before SpeechFillText's quiet->ink animation has actually painted
  // any word — the shot then shows the whole passage still quiet/unreadable.
  // Poll for a real token whose computed colour equals the `ink` token
  // (#221E1B / rgb(34, 30, 27), @sotto/core/theme) before shooting.
  const INK_RGB = 'rgb(34, 30, 27)';
  async function waitForInkToken(timeoutMs) {
    await page.waitForFunction(
      (inkColor) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        for (let node = walker.currentNode; node; node = walker.nextNode()) {
          if (
            node.childElementCount === 0 &&
            node.textContent &&
            node.textContent.trim().length > 0 &&
            getComputedStyle(node).color === inkColor
          ) {
            return true;
          }
        }
        return false;
      },
      INK_RGB,
      { timeout: timeoutMs },
    );
  }

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: heightFor(width) });
    // 'networkidle' (fonts etc.) can take over a second to resolve — long
    // enough that the fake provider's whole ~1.5s fixture timeline finishes
    // before polling even starts. Use 'domcontentloaded' so polling begins
    // as close as possible to when the screen mounts and calls connect().
    await page.goto(`${BASE_URL}/voice/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });
    try {
      await waitForStateLabel(['connexion', 'écoute'], 5000);
    } catch {
      issues.push(`voice(${width}): never saw connecting/listening state label`);
    }
    await page.screenshot({ path: path.join(OUT_DIR, `${width}-voice-connecting-listening.png`) });
    log(`${width}-voice-connecting-listening.png`);
    try {
      await waitForStateLabel(['parle'], 5000);
    } catch {
      issues.push(`voice(${width}): never saw speaking state label`);
    }
    try {
      await waitForInkToken(8000);
    } catch {
      issues.push(`voice(${width}): no token turned ink before capturing voice-speaking`);
    }
    await page.screenshot({ path: path.join(OUT_DIR, `${width}-voice-speaking.png`) });
    log(`${width}-voice-speaking.png`);
  }

  await browser.close();

  if (issues.length) {
    console.log('\n[screenshots] issues observed during the run:');
    for (const issue of issues) console.log('  -', issue);
    process.exitCode = 1;
  } else {
    console.log('\n[screenshots] no console errors / page errors observed.');
  }
}

main().catch((err) => {
  console.error('[screenshots] FAILED:', err);
  process.exit(1);
});
