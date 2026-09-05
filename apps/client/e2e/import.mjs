#!/usr/bin/env node
/**
 * Importer e2e (planning/LEDGER.md "R3-I Importer" proof): uploads a small
 * plain-text file through the real UI against the local stack (apps/server
 * on :8790, whisper/llama/Kokoro already running), waits for the import to
 * finish, opens the reader, and checks a token has glosses and the chapter
 * has audio. Modeled on apps/client/e2e/hosted.mjs.
 *
 * Usage: node apps/client/e2e/import.mjs [path-to-file]
 * Requires `pnpm dev:web` (port 8081) already running with the file's
 * import flow reachable, and apps/server answering /health on :8790.
 *
 * NOTE: this Mac's local LLM (qwen3.6-35b-a3b via llama.cpp, CPU-hosted)
 * is slow for the gloss-fill/sentence-translation JSON completions the
 * pipeline needs — a single 40-word gloss batch measured ~234s, so this
 * script budgets up to 15 minutes for a short (~40-word) file. See
 * docs/importing-books.md for the full measured numbers.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8081';
const FILE_PATH =
  process.argv[2] ??
  '/private/tmp/claude-502/-Users-noelturlington-Claude/0d7d9e7e-61af-4c14-b366-9a4a37dbe35c/scratchpad/petit.txt';
const TOTAL_TIMEOUT_MS = 15 * 60_000;

let failed = false;
function log(...args) {
  console.log(`[import-e2e ${new Date().toISOString()}]`, ...args);
}
function fail(message) {
  failed = true;
  console.error(`[import-e2e] FAIL: ${message}`);
}

async function screenshot(page, width, name) {
  const dir = `docs/screenshots/web/${width}-import-${name}.png`;
  await page.screenshot({ path: dir });
  log(`screenshot saved: ${dir}`);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') log(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => log(`page error: ${err.message}`));

  log(`opening ${BASE_URL}/import`);
  await page.goto(`${BASE_URL}/import`, { waitUntil: 'load' });

  // Pick-a-file screen: four format cards. Click the TXT row and supply
  // the file via Playwright's filechooser interception (pickFile.web.ts
  // opens a real <input type=file> click()).
  const txtRow = page.getByText('TXT', { exact: true });
  await txtRow.waitFor({ state: 'visible', timeout: 15000 });
  log('pick-a-file screen rendered');
  await screenshot(page, 375, 'preview');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), txtRow.click()]);
  await chooser.setFiles(FILE_PATH);
  log(`file selected: ${FILE_PATH}`);

  // Preview screen.
  await page.getByText('Aperçu').or(page.getByText('Preview')).waitFor({ timeout: 15000 });
  log('preview screen rendered');
  await screenshot(page, 375, 'preview');

  await page.setViewportSize({ width: 1440, height: 900 });
  await screenshot(page, 1440, 'preview');
  await page.setViewportSize({ width: 375, height: 812 });

  const importCta = page.getByRole('button', { name: /Importer|Import/ }).first();
  await importCta.waitFor({ state: 'visible', timeout: 15000 });
  await importCta.click();
  log('tapped the Importer CTA');

  // Progress screen — wait for the URL to move to /import/<jobId>.
  await page.waitForURL(/\/import\/[a-z0-9-]+/i, { timeout: 30000 });
  log(`progress screen: ${page.url()}`);
  await screenshot(page, 375, 'progress');
  await page.setViewportSize({ width: 1440, height: 900 });
  await screenshot(page, 1440, 'progress');
  await page.setViewportSize({ width: 375, height: 812 });

  // Wait for the finished state ("Livre importé" / "Book imported").
  const doneHeading = page.getByText('Livre importé').or(page.getByText('Book imported'));
  try {
    await doneHeading.waitFor({ timeout: TOTAL_TIMEOUT_MS });
    log('import finished');
  } catch {
    fail(
      'import did not finish within the timeout — see docs/importing-books.md for measured local-model latency',
    );
    await screenshot(page, 375, 'progress-timeout');
    await browser.close();
    process.exitCode = failed ? 1 : 0;
    return;
  }
  await screenshot(page, 375, 'progress');

  const openButton = page.getByRole('button', { name: /Ouvrir le livre|Open the book/ });
  await openButton.click();
  await page.waitForURL(/\/book\//, { timeout: 15000 });
  log(`book detail: ${page.url()}`);

  // Follow through into the reader.
  const readButton = page.getByRole('button', { name: /Lire|Read/ }).first();
  if (await readButton.count()) {
    await readButton.click();
    await page.waitForURL(/\/reader\//, { timeout: 15000 });
  } else {
    // Book detail may itself already be the reader entry on some layouts —
    // navigate to /reader/<bookId> directly from the URL if needed.
    const bookId = page.url().split('/book/')[1];
    if (bookId) await page.goto(`${BASE_URL}/reader/${bookId}`, { waitUntil: 'load' });
  }
  log(`reader: ${page.url()}`);
  await page.waitForTimeout(2000);
  await screenshot(page, 375, 'reader');
  await page.setViewportSize({ width: 1440, height: 900 });
  await screenshot(page, 1440, 'reader');
  await page.setViewportSize({ width: 375, height: 812 });

  // Tap a word token (petit.txt's first sentence is "Le petit chat noir
  // dormait...") and check its English gloss ("cat") shows up somewhere on
  // screen — proof a word token actually has glosses attached.
  const bodyTextBeforeTap = await page.evaluate(() => document.body.innerText);
  log(`reader body text length before tap: ${bodyTextBeforeTap.length}`);
  const wordToken = page.getByText('chat', { exact: true }).first();
  let glossFound = false;
  try {
    await wordToken.waitFor({ state: 'visible', timeout: 10000 });
    await wordToken.click();
    await page.waitForTimeout(500);
    const bodyTextAfterTap = await page.evaluate(() => document.body.innerText);
    glossFound = /\bcat\b/i.test(bodyTextAfterTap);
    log(`tapped "chat" — gloss "cat" visible afterward: ${glossFound}`);
    await screenshot(page, 375, 'reader');
  } catch (err) {
    fail(`could not tap a word token in the reader: ${err.message}`);
  }
  if (!glossFound) fail('no gloss text found after tapping a word token');

  const hasAudio = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('audio')).length > 0 ||
      !!document.querySelector('[data-audio], [aria-label*="lecture" i], [aria-label*="play" i]'),
  );
  log(`audio element/control present in the reader: ${hasAudio}`);
  if (!hasAudio) fail('no audio element/control found in the reader for chapter 1');

  await browser.close();
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  // A thrown error here means `browser.close()` in main() never ran — force
  // exit rather than leaving a headless chromium (and this process) alive
  // forever waiting on an open CDP connection.
  process.exit(1);
});
