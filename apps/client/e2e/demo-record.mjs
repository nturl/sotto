#!/usr/bin/env node
/**
 * Records a short demo of the live app (sotto-steel.vercel.app) walking the
 * cold-visit journey: fast-path screen -> "Start reading in French" -> reader
 * -> play narration (speech fill visible) -> tap a word -> translation panel
 * -> Save -> marker stroke. Uses Playwright's built-in `recordVideo` context
 * option (no shot-scraper) against a fresh browser context (no storage), so
 * every run reproduces the true cold-visit fast-path screen instead of
 * whatever profile happens to be seeded locally.
 *
 * Usage:
 *   node apps/client/e2e/demo-record.mjs [--desktop]
 *
 * Writes a .webm to docs/media/ (demo.webm or demo-desktop.webm); converting
 * to gif/mp4 is a separate ffmpeg step (see docs/media/README or the task
 * that generated this script).
 */
import { mkdirSync, renameSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../docs/media');
const LIVE_URL = 'https://sotto-steel.vercel.app/';

const desktop = process.argv.includes('--desktop');
const viewport = desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const deviceScaleFactor = desktop ? 1 : 2;
const outName = desktop ? 'demo-desktop' : 'demo';

mkdirSync(OUT_DIR, { recursive: true });

const t0 = Date.now();
function log(...args) {
  console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);
}

async function main() {
  const browser = await chromium.launch();
  // Fresh context, no storage: reproduces a true cold visit (no onboarding
  // profile seeded), which is what puts a first-time visitor on the
  // fast-path screen rather than the "For you" home screen a returning
  // profile sees.
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    recordVideo: { dir: OUT_DIR, size: viewport },
  });
  const page = await context.newPage();
  const issues = [];
  page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`console.error: ${msg.text()}`);
  });

  // ---- 1. Land on the fast-path screen, hold 2s ----
  await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByText('Start reading in French', { exact: true }).waitFor({ timeout: 15000 });
  log('fast-path screen visible');
  await page.waitForTimeout(2000);

  // ---- 2. Click "Start reading in French", wait for the reader ----
  await page.getByText('Start reading in French', { exact: true }).click();
  await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 15000 });
  log('reader loaded');
  await page.waitForTimeout(500);

  // ---- 3. Click the play ring, let narration run ~6s (speech fill) ----
  await page.getByRole('button', { name: 'Play' }).click();
  log('narration started');
  await page.waitForTimeout(6000);

  // ---- 4. Click a word in the first sentence ----
  // "jeune" (first word of "Une jeune fille habite...", Cendrillon ch.1) —
  // exact:true so this doesn't also match a longer token containing it.
  const word = page.getByText('jeune', { exact: true }).first();
  await word.click();
  const saveButton = page.getByText('Save', { exact: true }).first();
  await saveButton.waitFor({ timeout: 5000 });
  log('translation panel open');

  // ---- 5. Hold 2s on the translation panel ----
  await page.waitForTimeout(2000);

  // ---- 6. Click Save, hold 2s to show the marker stroke ----
  await saveButton.click();
  await page.getByText('Saved', { exact: true }).first().waitFor({ timeout: 5000 });
  log('saved');
  await page.waitForTimeout(2000);

  await context.close();
  await browser.close();

  // Playwright names the video with an internal hash; rename to a stable
  // path under docs/media/.
  const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm') && !f.startsWith('demo'));
  if (files.length !== 1) {
    throw new Error(`expected exactly one fresh .webm in ${OUT_DIR}, found: ${files.join(', ')}`);
  }
  const finalPath = path.join(OUT_DIR, `${outName}.webm`);
  renameSync(path.join(OUT_DIR, files[0]), finalPath);
  log(`saved ${finalPath}`);

  if (issues.length) {
    console.log('\n[demo-record] issues observed during the run:');
    for (const issue of issues) console.log('  -', issue);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
