import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:8090';
const out = process.env.UX_OUTPUT ?? '/tmp/sotto-ux-evidence';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
  permissions: ['microphone'],
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
async function seed(target, preferences = {}) {
  await target.goto(`${base}/settings`);
  await target.evaluate(async (patch) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keyval');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('keyval', 'readwrite');
    tx.objectStore('keyval').put(
      JSON.stringify({
        interfaceLocale: 'en',
        explanationLocale: 'fr',
        learningLocale: 'en-US',
        level: 'A0',
        immersionMode: false,
        defaultTutorMode: 'discuss',
        captionsEnabled: true,
        turnDetection: 'push',
        correctionFrequency: 'normal',
        speakingPace: 'normal',
        narrationSpeed: 1,
        onboarded: true,
        ...patch,
      }),
      'sotto.preferences',
    );
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    db.close();
  }, preferences);
}
async function visible(target, text) {
  await target.getByText(text, { exact: true }).first().waitFor();
}
try {
  await seed(page);
  await page.goto(`${base}/reader/en-aesop-fables`);
  const word = page.getByRole('button', { name: 'Look up tortoise', exact: true }).first();
  await word.waitFor();
  await page.screenshot({ path: `${out}/reader-wide.png` });
  await word.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Save', exact: true }).waitFor();
  const second = await ctx.newPage();
  await second.goto(`${base}/vocabulary`);
  await second.waitForTimeout(500);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await visible(second, 'tortoise');
  console.log('PASS keyboard word lookup and saved word appears in already-open second tab');
  await page.getByRole('button', { name: 'Next chapter', exact: true }).click();
  await page.getByRole('button', { name: 'Look up lion', exact: true }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0);
  console.log('PASS chapter change clears old lookup');
  await page.goto(`${base}/review?bookId=en-aesop-fables`);
  const reveal = page.getByRole('button', { name: 'Show translation' });
  await reveal.focus();
  await page.keyboard.press('Enter');
  const easy = page.getByRole('button', { name: 'Easy', exact: true });
  await easy.focus();
  await page.keyboard.press('Enter');
  await visible(page, 'Review complete');
  console.log('PASS keyboard reveal, grade, completion');
  await page.goto(`${base}/settings`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(`${out}/reading-export.json`);
  const exported = JSON.parse(readFileSync(`${out}/reading-export.json`, 'utf8'));
  assert.ok(JSON.stringify(exported).includes('tortoise'));
  const fresh = await browser.newContext({ serviceWorkers: 'block' });
  const imported = await fresh.newPage();
  await seed(imported);
  await imported.goto(`${base}/settings`);
  const choose = imported.waitForEvent('filechooser');
  await imported.getByRole('button', { name: 'Import', exact: true }).click();
  await (await choose).setFiles(`${out}/reading-export.json`);
  await visible(imported, 'Import complete.');
  await imported.goto(`${base}/vocabulary`);
  await visible(imported, 'tortoise');
  console.log('PASS downloaded JSON export and import round trip into isolated profile');
  await page.goto(`${base}/reader/en-aesop-fables`);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Look up lion', exact: true }).first().click();
  await page.screenshot({ path: `${out}/reader-phone.png` });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  console.log('PASS phone lookup without horizontal overflow');
  await fresh.close();
} finally {
  await browser.close();
}
