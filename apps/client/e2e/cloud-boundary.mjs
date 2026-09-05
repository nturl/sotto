#!/usr/bin/env node
/**
 * R3-S proof (task step 7, boundary check): a build with NO cloud env
 * (neither EXPO_PUBLIC_CLOUD=fake nor EXPO_PUBLIC_CLOUD_URL set, so
 * `provider.tsx` picks `NullCloud`) must show zero trace of the account/
 * paywall/usage screens — CONTRACTS §0 ("never add auth/payments/analytics
 * as a default") and PAYWALL.md §4/§6. Asserts:
 *   1. Profile has no "Compte" group.
 *   2. /paywall shows only the "not available" line (no plan cards, no CTA).
 *   3. No network request went to any cloud host during the whole run.
 *
 * Usage: BASE_URL=http://localhost:8096 node apps/client/e2e/cloud-boundary.mjs
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8096';

mkdirSync(path.resolve(__dirname, '../../../docs/evidence'), { recursive: true });

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

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 852 } });
  const page = await context.newPage();

  const requests = [];
  page.on('request', (req) => requests.push(req.url()));

  log(`opening ${BASE_URL}/profile`);
  await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  const compteHeading = page.getByText('Compte', { exact: true });
  record('Profile has no "Compte" group heading', (await compteHeading.count()) === 0);
  record(
    'Profile has no "Se connecter" row',
    (await page.getByText('Se connecter', { exact: true }).count()) === 0,
  );

  log(`opening ${BASE_URL}/paywall`);
  await page.goto(`${BASE_URL}/paywall`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  const bodyText = (await page.textContent('body')) ?? '';
  record(
    'Paywall shows no plan cards ("STANDARD"/"PLUS" absent)',
    !bodyText.includes('STANDARD') && !bodyText.includes('PLUS'),
  );
  record('Paywall shows no "S\'abonner" CTA', !bodyText.includes("S'abonner"));
  record(
    'Paywall shows the "not available" line',
    bodyText.includes("n'est pas disponible dans cette version"),
    bodyText.slice(0, 300),
  );

  log(`opening ${BASE_URL}/usage`);
  await page.goto(`${BASE_URL}/usage`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const usageText = (await page.textContent('body')) ?? '';
  record(
    'Usage screen renders no stats (no "Minutes de tuteur" block)',
    !usageText.includes('Minutes de tuteur'),
  );

  // Every request this whole run made — none should target a cloud host.
  // With NullCloud, no CloudAdapter method ever calls fetch, so this is
  // really asserting "nothing outside Metro's own dev-server/HMR traffic
  // and same-origin app requests happened" — no api.*, no *.sotto.dev
  // billing/auth/voice endpoint, no arbitrary external host.
  const suspicious = requests.filter((url) => {
    try {
      const u = new URL(url);
      if (u.origin === BASE_URL) return false; // the app's own dev server
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return false;
      return true;
    } catch {
      return false;
    }
  });
  record(
    'No request went to any external/cloud host',
    suspicious.length === 0,
    suspicious.slice(0, 10).join(', '),
  );

  await browser.close();

  log(issues.length === 0 ? 'ALL PASS' : `${issues.length} ISSUE(S)`);
  if (issues.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
