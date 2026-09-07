#!/usr/bin/env node
// Run 8 screenshot helper. Usage:
//   node ~/Claude/sotto-run8/shots.mjs <outDir> [baseUrl]
// Seeds an onboarded en→fr-FR A2 profile with one in-progress book, then
// shoots Home, Library and Reader (word tapped) at 375x852 and 1440x900.
// Run from apps/client so `playwright` resolves.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/Users/noelturlington/Claude/sotto/apps/client/package.json');
const { chromium } = require('playwright');

const OUT = path.resolve(process.argv[2] ?? '.');
const BASE_URL = process.argv[3] ?? process.env.BASE_URL ?? 'http://localhost:8081';
const BOOK_ID = 'fr-chevre-de-m-seguin';
const WORD = 'chèvre';
mkdirSync(OUT, { recursive: true });

const SIZES = [ [375, 852] ]; const _unused = [
  [375, 852],
  [1440, 900],
];
const PREFS = {
  interfaceLocale: 'en', explanationLocale: 'en', learningLocale: 'fr-FR', level: 'A2',
  immersionMode: false, defaultTutorMode: 'read_to_me', captionsEnabled: true,
  turnDetection: 'auto', correctionFrequency: 'normal', speakingPace: 'normal',
  narrationSpeed: 1, onboarded: true,
};
const PROGRESS = {
  progress: [
    { bookId: BOOK_ID, chapterId: BOOK_ID + '-01', audioPositionMs: 0, percentComplete: 0.3, updatedAt: new Date().toISOString() },
    { bookId: 'fr-fables-la-fontaine', chapterId: 'fr-fables-la-fontaine-01', audioPositionMs: 0, percentComplete: 0.1, updatedAt: new Date(Date.now() - 86400000).toISOString() },
  ],
  completedBooks: [],
};

async function seed(page) {
  await page.evaluate(async ({ prefs, progress }) => {
    const req = indexedDB.open('keyval-store', 1);
    await new Promise((res, rej) => {
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('keyval')) req.result.createObjectStore('keyval'); };
      req.onsuccess = () => res(); req.onerror = () => rej(req.error);
    });
    const db = req.result; const tx = db.transaction('keyval', 'readwrite'); const st = tx.objectStore('keyval');
    st.put(JSON.stringify(prefs), 'sotto.preferences'); st.put(JSON.stringify(progress), 'sotto.progress');
    await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  }, { prefs: PREFS, progress: PROGRESS });
}

async function shoot(page, name) {
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const file = path.join(OUT, `${w}-${name}.png`);
    await page.screenshot({ path: file, fullPage: w >= 1000 });
    console.log('[shots]', path.basename(file));
  }
}

const issues = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 852 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => issues.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') issues.push('console.error: ' + m.text()); });
await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 120000 });
await seed(page);
await page.goto(BASE_URL + '/home', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(800);
await shoot(page, 'home');
await page.goto(BASE_URL + '/library', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await shoot(page, 'library');
await page.goto(BASE_URL + '/reader/' + BOOK_ID, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const word = page.getByText(WORD, { exact: true }).first();
if (await word.count()) { await word.click(); await page.waitForTimeout(400); } else issues.push('reader: word not found: ' + WORD);
await shoot(page, 'reader');
await browser.close();
console.log(issues.length ? 'ISSUES:\n' + issues.join('\n') : 'no page/console errors');
