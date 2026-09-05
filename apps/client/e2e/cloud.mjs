#!/usr/bin/env node
/**
 * R3-S proof (task step 7): drives the real web app (Metro dev server,
 * EXPO_PUBLIC_CLOUD=fake + EXPO_PUBLIC_VOICE=fake) with Playwright/Chromium
 * through Home -> Profile -> Account (signed out) -> back to Home -> the
 * quiet nag row -> Paywall -> "Subscribe (test)" -> back to Profile ->
 * Account (signed in) -> Usage, screenshotting at 375 and 1440 along the
 * way. Same IndexedDB seeding pattern as e2e/screenshots.mjs.
 *
 * Every hop after the first page load is a real in-app click (not
 * `page.goto()`), because `FakeCloudAdapter`'s session lives only in that
 * page's JS heap — a browser navigation reloads the page and drops it,
 * same as a real HttpCloudAdapter's in-memory state would be dropped.
 *
 * Usage: BASE_URL=http://localhost:8095 node apps/client/e2e/cloud.mjs
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/screenshots/web');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8095';

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

const DEFAULT_PREFERENCES = {
  interfaceLocale: 'fr',
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

async function seed(page) {
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
  }, DEFAULT_PREFERENCES);
}

async function shoot(page, width, name) {
  await page.setViewportSize({ width, height: width >= 1440 ? 900 : 852 });
  await page.waitForTimeout(150);
  const file = path.join(SCREENSHOT_DIR, `${width}-${name}.png`);
  await page.screenshot({ path: file });
  log(`screenshot ${width}-${name}.png`);
}

// A dev-only warning Expo Router itself emits when router.back() has
// nowhere to go in a shallow test-session history — not an app bug.
const BENIGN = [/GO_BACK.*was not handled by any navigator/i];
function isBenign(text) {
  return BENIGN.some((re) => re.test(text));
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 852 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isBenign(msg.text()))
      issues.push(`console.error: ${msg.text()}`);
  });

  log(`opening ${BASE_URL}/(tabs)/home`);
  await page.goto(`${BASE_URL}/(tabs)/home`, { waitUntil: 'domcontentloaded' });
  await seed(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // ---- Home -> Profile (gear icon) ----
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.waitForURL(/\/profile/);
  await page.waitForTimeout(300);

  // ---- Profile: "Compte" group present, signed-out row ----
  const compteRow = page.getByText('Se connecter', { exact: true });
  record('Profile shows the Compte group (fake cloud enabled)', await compteRow.isVisible());

  await compteRow.click();
  await page.waitForURL(/\/account/);
  await page.waitForTimeout(300);
  record('Navigated to /account (signed out)', page.url().includes('/account'));
  await shoot(page, 375, 'account');
  await shoot(page, 1440, 'account');
  await page.setViewportSize({ width: 375, height: 852 });

  // ---- Usage, reached directly while signed out (coordinator fix
  //      request 2026-09-05): a fresh tab so this doesn't disturb the main
  //      flow's click-based back-navigation, which relies on real browser
  //      history from this point on. Must show a dedicated signed-out
  //      state (title + caption + "Se connecter" CTA), not a blank canvas. ----
  const signedOutUsagePage = await context.newPage();
  await signedOutUsagePage.goto(`${BASE_URL}/usage`, { waitUntil: 'domcontentloaded' });
  await signedOutUsagePage.waitForTimeout(500);
  const usageSignedOutBody = (await signedOutUsagePage.textContent('body')) ?? '';
  record(
    'Usage (signed out) shows the title, the signed-out caption, and no stats',
    usageSignedOutBody.includes('Utilisation') &&
      usageSignedOutBody.includes('Connectez-vous pour voir votre utilisation.') &&
      !usageSignedOutBody.includes('Minutes de tuteur'),
    usageSignedOutBody.slice(0, 300),
  );
  const signInCta = signedOutUsagePage.getByRole('button', { name: 'Se connecter', exact: true });
  record('Usage (signed out) shows the "Se connecter" CTA', await signInCta.isVisible());
  await signedOutUsagePage.setViewportSize({ width: 375, height: 852 });
  await signedOutUsagePage.waitForTimeout(150);
  await signedOutUsagePage.screenshot({ path: path.join(SCREENSHOT_DIR, '375-usage-signed-out.png') });
  log('screenshot 375-usage-signed-out.png');
  await signedOutUsagePage.setViewportSize({ width: 1440, height: 900 });
  await signedOutUsagePage.waitForTimeout(150);
  await signedOutUsagePage.screenshot({ path: path.join(SCREENSHOT_DIR, '1440-usage-signed-out.png') });
  log('screenshot 1440-usage-signed-out.png');
  await signedOutUsagePage.close();

  // ---- Back to Profile, back to Home ----
  await page.getByRole('button', { name: 'Retour', exact: true }).click();
  await page.waitForURL(/\/profile/);
  await page.getByRole('button', { name: 'Retour', exact: true }).click();
  await page.waitForURL(/\(tabs\)\/home|\/home$/);
  await page.waitForTimeout(300);

  // ---- Home's quiet nag row -> Paywall (PAYWALL.md §1a's own entry point) ----
  const nagCta = page.getByRole('button', { name: 'Voir' });
  record('Home shows the quiet nag row ("Voir")', await nagCta.isVisible());
  await nagCta.click();
  await page.waitForURL(/\/paywall/);
  await page.waitForTimeout(500);
  record('Paywall title renders', await page.getByText('Sotto avec voix').isVisible());
  await shoot(page, 375, 'paywall');
  await shoot(page, 1440, 'paywall');
  await page.setViewportSize({ width: 375, height: 852 });

  // ---- Subscribe (test) — staging/fake-only stub path ----
  const testAction = page.getByText("S'abonner (test)", { exact: true });
  record('"Subscribe (test)" action is visible in fake mode', await testAction.isVisible());
  await testAction.click();
  await page.waitForTimeout(600);

  // ---- Back to Home, into Profile again (now signed in) -> Account -> Usage ----
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.waitForURL(/\/profile/);
  await page.waitForTimeout(300);
  const signedInRow = page.getByText('learner@example.com', { exact: true });
  record("Profile's Compte row now shows the signed-in email", await signedInRow.isVisible());
  await page.getByText('Utilisation', { exact: true }).first().click();
  await page.waitForURL(/\/usage/);
  await page.waitForTimeout(500);

  const usageBody = await page.textContent('body');
  record(
    'Usage shows "0 / 200" tutor minutes after stubSubscribe(standard)',
    !!usageBody && usageBody.includes('0 / 200'),
    usageBody?.slice(0, 300),
  );
  record(
    'Usage shows the Standard plan\'s "0 / 5" imports',
    !!usageBody && usageBody.includes('0 / 5'),
  );
  await shoot(page, 375, 'usage');
  await shoot(page, 1440, 'usage');

  record(
    'No uncaught page errors / console errors during the run',
    issues.length === 0,
    issues.join(' | '),
  );

  await browser.close();

  log(issues.length === 0 ? 'ALL PASS' : `${issues.length} ISSUE(S)`);
  if (issues.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
