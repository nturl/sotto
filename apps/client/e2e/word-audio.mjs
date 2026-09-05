#!/usr/bin/env node
/**
 * R3-W proof: opens an FR reader, taps a word, taps the translation
 * panel's speaker button, and asserts the request for the book's
 * word-audio sprite (`audio/words.mp3`) actually went out and nothing
 * errored — i.e. the reader really is preferring the clean, standalone
 * word-audio sprite over the old narration-slice fallback for a book that
 * has one.
 *
 * Same pattern as apps/client/e2e/rows.mjs (seed via idb-keyval, drive
 * the real web app with Playwright/Chromium).
 *
 * Usage: BASE_URL=http://localhost:8081 node apps/client/e2e/word-audio.mjs
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/web');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8081';

const BOOK_ID = 'fr-petit-chaperon-rouge'; // fr-FR, has word-audio (shortest FR book)
const WORD = 'village'; // a real word token in chapter 1, not part of the title

mkdirSync(OUT_DIR, { recursive: true });

function log(...args) {
  console.log('[word-audio e2e]', ...args);
}

async function seed(page, { preferences }) {
  await page.evaluate(
    async ({ preferences }) => {
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
      if (preferences) store.put(JSON.stringify(preferences), 'sotto.preferences');
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { preferences },
  );
}

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

async function main() {
  const browser = await chromium.launch();
  let overallOk = true;

  for (const width of [375, 1440]) {
    const height = width === 375 ? 852 : 900;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();

    // The muted-preroll-then-pause() trick (shared with the pre-existing
    // playAudioSlice, copied deliberately — see audio.ts's playSlice
    // comment) is how both word-audio paths unlock autoplay on iOS Safari
    // inside the tap gesture; Chrome's own HTMLMediaElement surfaces that
    // interruption as an unhandled "play() request was interrupted by a
    // call to pause()" rejection (https://goo.gl/LdLk22) — benign and
    // expected from this pattern, not a functional error, so it's the one
    // message this check doesn't fail on.
    const BENIGN_ERROR = /play\(\) request was interrupted by a call to pause\(\)/;
    const consoleErrors = [];
    page.on('pageerror', (err) => {
      if (!BENIGN_ERROR.test(err.message)) consoleErrors.push(`pageerror: ${err.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !BENIGN_ERROR.test(msg.text()))
        consoleErrors.push(`console.error: ${msg.text()}`);
    });

    const requests = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await seed(page, { preferences: PREFERENCES });
    await page.goto(`${BASE_URL}/reader/${BOOK_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const word = page.getByText(WORD, { exact: true }).first();
    let wordVisible = await word.isVisible().catch(() => false);
    if (!wordVisible) {
      // Cold-start hydration can be slower than the first-load case other
      // e2e scripts hit — give it one more beat before giving up.
      await page.waitForTimeout(2000);
      wordVisible = await word.isVisible().catch(() => false);
    }
    if (!wordVisible) {
      log(`FAIL (${width}px): word "${WORD}" not found in the reader`);
      overallOk = false;
      await page.screenshot({ path: path.join(OUT_DIR, `${width}-reader-word-audio.png`) });
      await context.close();
      continue;
    }
    await word.click();
    await page.waitForTimeout(300);

    const speaker = page.getByLabel('Play narration').first();
    const speakerVisible = await speaker.isVisible().catch(() => false);
    if (!speakerVisible) {
      log(`FAIL (${width}px): speaker button not found after tapping "${WORD}"`);
      overallOk = false;
      await page.screenshot({ path: path.join(OUT_DIR, `${width}-reader-word-audio.png`) });
      await context.close();
      continue;
    }

    const requestCountBefore = requests.length;
    await speaker.click();
    await page.waitForTimeout(800);

    const spriteRequested = requests
      .slice(requestCountBefore)
      .some((url) => url.includes(`/content/packs/fr-FR/books/${BOOK_ID}/audio/words.mp3`));
    const ok = spriteRequested && consoleErrors.length === 0;
    overallOk = overallOk && ok;
    log(
      `${ok ? 'PASS' : 'FAIL'} (${width}px): sprite request ${spriteRequested ? 'seen' : 'NOT seen'}, ${consoleErrors.length} console error(s)`,
    );
    consoleErrors.forEach((e) => log(`  ${e}`));

    await page.screenshot({ path: path.join(OUT_DIR, `${width}-reader-word-audio.png`) });
    log(`wrote ${width}-reader-word-audio.png`);

    await context.close();
  }

  await browser.close();
  console.log(`\n${overallOk ? 'PASS' : 'FAIL'} — word-audio e2e`);
  if (!overallOk) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
