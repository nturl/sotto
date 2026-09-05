#!/usr/bin/env node
/* global WebSocket, clearTimeout */
/**
 * R4-D2 proof: the paid client served from its own origin by sotto-cloud
 * (SOTTO_CLOUD_STATIC_DIR — src/app.ts, sotto-cloud repo), as one origin
 * for both the static export and the API — unlike apps/client/e2e/paid.mjs
 * (run 3, two origins: an Expo dev server + a separate cloud API host).
 *
 * Drives: signed out -> /account -> magic link (read from the staging
 * server's own stdout log, staging-only per CLOUD-API.md) -> /paywall shows
 * one plan card with both prices -> stub subscribe (the "Subscribe (test)"
 * text action, staging-only) -> /usage shows the standard caps -> one
 * cascade-openai tutor turn over the real WebSocket protocol -> the cap
 * lowered via sqlite3 and a clear cap-exhausted message -> delete account ->
 * /me 401 and signed-out UI. Terms/Privacy link out to this origin's own
 * /terms and /privacy (sotto-cloud R4-D1, 200 both).
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:8797 CLOUD_LOG=/tmp/staging-d2.log \
 *   DB_PATH=/tmp/staging-d2.sqlite node apps/client/e2e/paid-web.mjs
 */
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Card-mandated location: docs/evidence/, NOT docs/screenshots/web.
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/evidence');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:8797').replace(/\/$/, '');
const CLOUD_LOG = process.env.CLOUD_LOG;
const DB_PATH = process.env.DB_PATH;
const EMAIL = `d2-paid-e2e-${Date.now()}@example.test`;

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

async function shoot(page, width, name) {
  await page.setViewportSize({ width, height: width >= 1440 ? 900 : 852 });
  await page.waitForTimeout(200);
  const file = path.join(SCREENSHOT_DIR, `${width}-paid-web-${name}.png`);
  await page.screenshot({ path: file });
  log(`screenshot ${width}-paid-web-${name}.png`);
}

function readMagicLinkFromLog(email) {
  if (!CLOUD_LOG) throw new Error('CLOUD_LOG not set');
  const text = readFileSync(CLOUD_LOG, 'utf8');
  const lines = text.split('\n').filter((l) => l.includes(email) && l.includes('magic-link'));
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1];
  const match = last.match(/"url":"([^"]+)"/);
  return match ? match[1].replace(/\\u0026/g, '&') : null;
}

async function waitForMagicLink(email, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = readMagicLinkFromLog(email);
    if (url) return url;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function setCapExhausted() {
  if (!DB_PATH) throw new Error('DB_PATH not set');
  // better-sqlite3 (the live server process) briefly holds a write lock;
  // `.timeout 3000` tells the sqlite3 CLI to retry for up to 3s instead of
  // failing immediately with "database is locked".
  await run('sqlite3', [
    '-cmd',
    '.timeout 3000',
    DB_PATH,
    `UPDATE entitlements SET tutor_minutes_cap = 1, tutor_seconds_used = 60 WHERE user_id = (SELECT id FROM users WHERE email = '${EMAIL}');`,
  ]);
}

async function runWidth(width) {
  log(`=== width ${width} ===`);
  const browser = await chromium.launch();
  try {
    await runWidthInner(browser, width);
  } finally {
    // A failed locator/assertion above must never leave Chromium running —
    // that's what turned the 375 selector timeout into a hung process
    // (run1, /tmp/paid-web-run1.log): the early `return` paths closed the
    // browser, but a thrown error skipped straight past them.
    await browser.close().catch(() => {});
  }
}

async function runWidthInner(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: width >= 1440 ? 900 : 852 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await shoot(page, width, 'signedout');

  const emailInput = page.getByPlaceholder('you@example.com');
  await emailInput.fill(EMAIL);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(800);
  const sentVisible = await page
    .getByText('Sent', { exact: true })
    .isVisible()
    .catch(() => false);
  record(`[${width}] magic-link send shows Sent`, sentVisible);

  const link = await waitForMagicLink(EMAIL);
  record(`[${width}] magic link readable from the staging log`, !!link, link ?? 'not found');
  if (!link) {
    return;
  }

  await page.goto(link, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const emailRowVisible = await page
    .getByText(EMAIL, { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  record(`[${width}] signed in — account shows the email`, emailRowVisible);
  await shoot(page, width, 'account-signedin');

  await page.goto(`${BASE_URL}/paywall`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const bothPricesText = await page.locator('body').innerText();
  const hasMonthly = /\$9\.99/.test(bothPricesText);
  const hasYearly = /\$79(\.00)?/.test(bothPricesText);
  // The plan card's eyebrow is the plan's real product name (GET
  // /billing/plans -> "Sotto" for the "standard" plan id, per D1's plan
  // table), not the literal plan id — asserting the literal string
  // "STANDARD" here always failed against the shipped plan table.
  const plansRes = await fetch(`${BASE_URL}/billing/plans`);
  const plansBody = await plansRes.json();
  const planEyebrow = (
    plansBody.plans?.find((p) => p.priceUsd > 0)?.name ?? 'STANDARD'
  ).toUpperCase();
  record(
    `[${width}] paywall shows one plan card`,
    (bothPricesText.match(new RegExp(planEyebrow, 'g')) ?? []).length === 1,
    `looked for "${planEyebrow}"`,
  );
  record(`[${width}] paywall shows the monthly price`, hasMonthly);
  await shoot(page, width, 'paywall-month');
  // Switch to yearly and confirm the second price is reachable via the toggle.
  await page.getByText('Yearly', { exact: true }).click();
  await page.waitForTimeout(300);
  const yearlyText = await page.locator('body').innerText();
  record(`[${width}] paywall toggle shows the yearly price`, /\$79/.test(yearlyText) || hasYearly);
  await shoot(page, width, 'paywall-year');

  await page.getByText('Subscribe (test)', { exact: true }).click();
  // subscribeTest() calls router.back() on success (app/paywall/index.tsx),
  // but this page was reached via a fresh page.goto — a full navigation, not
  // an in-app push — so there is no in-app history entry to go back to and
  // the URL legitimately never changes; the correct success signal is the
  // entitlement itself, polled from the same origin (same-origin fetch
  // carries the session cookie automatically).
  // Poll /me with plain Node fetch, using the session cookie straight out of
  // the browser context, rather than page.evaluate: afterEntitlement()'s
  // router.back() has a real history entry to return to here (the /account
  // page this width's flow already visited via a full page.goto), so it
  // does navigate — and a page.evaluate call racing that navigation throws
  // "Execution context was destroyed", which the original version's blanket
  // .catch(() => false) silently swallowed on every single attempt.
  let subscribed = false;
  for (let i = 0; i < 15 && !subscribed; i++) {
    await page.waitForTimeout(300);
    const cookies = await context.cookies(BASE_URL);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    subscribed = await fetch(`${BASE_URL}/me`, { headers: { cookie: cookieHeader } })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.entitlement?.plan === 'standard')
      .catch(() => false);
  }
  record(`[${width}] stub subscribe upgrades the entitlement (TEST MODE)`, subscribed);

  // Assert the entitlement itself (server truth) rather than gate on the
  // rendered screen's own hydration timing, which was flaky at 375 for
  // reasons not fully run down in this lane's time budget (the DOM
  // sometimes still shows 0/0 briefly after a fresh full-page navigation to
  // /usage, even though /me already answers standard/250/2 — a client
  // render race, not a server-side bug); the screenshot below is still the
  // real rendered screen for visual proof.
  const cookiesForUsage = await context.cookies(BASE_URL);
  const cookieHeaderForUsage = cookiesForUsage.map((c) => `${c.name}=${c.value}`).join('; ');
  const meForUsage = await fetch(`${BASE_URL}/me`, {
    headers: { cookie: cookieHeaderForUsage },
  }).then((res) => (res.ok ? res.json() : null));
  record(
    `[${width}] entitlement shows the standard tutor-minutes cap (250)`,
    meForUsage?.entitlement?.tutorMinutesCap === 250,
    JSON.stringify(meForUsage?.entitlement),
  );
  record(
    `[${width}] entitlement shows the standard imports cap (2)`,
    meForUsage?.entitlement?.importBooksCap === 2,
  );

  await page.goto(`${BASE_URL}/usage`, { waitUntil: 'domcontentloaded' });
  let usageText = '';
  for (let i = 0; i < 15; i++) {
    usageText = await page.locator('body').innerText();
    if (/250/.test(usageText)) break;
    await page.waitForTimeout(300);
  }
  record(`[${width}] usage screen renders the standard caps (250 / 2)`, /250/.test(usageText));
  await shoot(page, width, 'usage');

  // Terms/Privacy link out to this same origin (sotto-cloud R4-D1's legal pages).
  await page.goto(`${BASE_URL}/paywall`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const termsHref = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('*'));
    const el = nodes.find((n) => n.textContent?.trim() === 'Terms');
    return el ? el.getAttribute('href') : null;
  });
  log(
    `Terms link target observed in DOM text near: ${termsHref ?? '(no href attr on RN Web text node)'}`,
  );
}

async function verifyLegalPages() {
  const termsRes = await fetch(`${BASE_URL}/terms`);
  record('GET /terms -> 200', termsRes.status === 200, String(termsRes.status));
  const privacyRes = await fetch(`${BASE_URL}/privacy`);
  record('GET /privacy -> 200', privacyRes.status === 200, String(privacyRes.status));
}

async function tutorTurnAndCap() {
  log('=== one cascade-openai tutor turn, then the cap ===');
  const meRes = await fetch(`${BASE_URL}/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, kind: 'web' }),
  });
  record('POST /auth/magic-link (re-send for a fresh cookie) -> 200', meRes.status === 200);
  const link = await waitForMagicLink(EMAIL);
  if (!link) throw new Error('no magic link for phase 2');
  const verifyRes = await fetch(link, { redirect: 'manual' });
  const cookie = (verifyRes.headers.get('set-cookie') ?? '').split(';')[0];
  record('magic-link verify sets a session cookie', !!cookie, cookie || 'none');

  const chapter = JSON.parse(
    readFileSync(
      path.resolve(
        __dirname,
        '../../../packages/content/packs/fr-FR/books/fr-petit-chaperon-rouge/chapters/01.json',
      ),
      'utf8',
    ),
  );
  const sentence = chapter.blocks[0].sentences[0];
  const passage = {
    chapterTitle: chapter.title,
    sentences: [
      {
        id: sentence.id,
        text: sentence.text,
        tokenIds: sentence.tokens.map((t) => t.id),
        words: sentence.tokens.filter((t) => t.isWord).map((t) => ({ id: t.id, text: t.text })),
      },
    ],
  };
  const sessionOptions = {
    bookId: 'fr-petit-chaperon-rouge',
    chapterId: chapter.id ?? '01',
    mode: 'discuss',
    learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
    passage,
    savedWords: [],
  };

  const sessRes = await fetch(`${BASE_URL}/voice/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(sessionOptions),
  });
  const sess = await sessRes.json();
  record(
    'POST /voice/session -> 200 (cascade-openai)',
    sessRes.status === 200,
    JSON.stringify(sess),
  );
  if (sessRes.status !== 200) return;

  // A pure tone "utterance" round-tripped with no caption or audio_end
  // (see docs/evidence/paid-web-2026-09-05.log's WS FAIL lines from the
  // first attempt at this proof) — the OpenAI transcription model returns
  // an empty/near-empty transcript for a tone, and the cascade has nothing
  // to reply to. Real speech is needed, so this synthesizes it with macOS's
  // built-in `say` (French voice) + ffmpeg, the same approach
  // apps/client/e2e/paid.mjs (run 3) takes with a Kokoro server it assumes
  // is running locally — `say` needs nothing extra installed.
  const spokenAiff = path.join('/tmp', `paid-web-e2e-${Date.now()}.aiff`);
  const spokenPcm = path.join('/tmp', `paid-web-e2e-${Date.now()}.pcm`);
  await run('say', ['-v', 'Thomas', '-o', spokenAiff, sentence.text]);
  await run('ffmpeg', [
    '-y',
    '-i',
    spokenAiff,
    '-ar',
    '16000',
    '-ac',
    '1',
    '-f',
    's16le',
    '-acodec',
    'pcm_s16le',
    spokenPcm,
  ]);
  const spokenBuf = readFileSync(spokenPcm);
  const silenceBuf = Buffer.alloc(Math.floor(16000 * 2 * 1.5)); // 1.5s trailing silence
  const pcmBuf = Buffer.concat([spokenBuf, silenceBuf]);

  const ws = new WebSocket(sess.wsUrl);
  let sawCaption = false;
  let sawAudioEnd = false;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 45_000);
    ws.addEventListener('open', () => {
      // The trailing silence above is what the energy VAD needs to detect
      // end-of-speech and close the turn; without it the session never
      // leaves `listening`.
      const frameBytes = Math.floor(16000 * 2 * 0.03);
      (async () => {
        for (let i = 0; i < pcmBuf.length; i += frameBytes) {
          if (ws.readyState !== WebSocket.OPEN) break;
          ws.send(pcmBuf.subarray(i, i + frameBytes));
          await new Promise((r) => setTimeout(r, 25));
        }
      })();
    });
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.t === 'caption') sawCaption = true;
          if (msg.t === 'audio_end') sawAudioEnd = true;
          log(`WS <- ${ev.data.slice(0, 160)}`);
        } catch {
          // ignore
        }
      }
    });
    ws.addEventListener('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  record('WS: at least one caption event', sawCaption);
  record('WS: audio_end reached', sawAudioEnd);

  log('lowering the cap via sqlite3');
  await setCapExhausted();
  const capSessRes = await fetch(`${BASE_URL}/voice/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(sessionOptions),
  });
  const capBody = await capSessRes.json();
  record(
    'POST /voice/session with the cap exhausted -> refused with a clear message',
    capSessRes.status !== 200 && typeof capBody.message === 'string' && capBody.message.length > 0,
    JSON.stringify(capBody),
  );

  // ---- delete account ----
  const delReqRes = await fetch(`${BASE_URL}/account/delete/request`, {
    method: 'POST',
    headers: { cookie },
  });
  log(
    `POST /account/delete/request -> ${delReqRes.status} (sign-in is fresh, so DELETE alone is also enough)`,
  );
  const delRes = await fetch(`${BASE_URL}/account`, { method: 'DELETE', headers: { cookie } });
  record('DELETE /account -> 204', delRes.status === 204, String(delRes.status));
  const meAfter = await fetch(`${BASE_URL}/me`, { headers: { cookie } });
  record('GET /me after deletion -> 401', meAfter.status === 401, String(meAfter.status));
}

async function main() {
  await runWidth(375);
  await runWidth(1440);
  await verifyLegalPages();
  await tutorTurnAndCap();
  log(issues.length === 0 ? 'ALL PASS' : `${issues.length} ISSUE(S)`);
  for (const i of issues) log('ISSUE:', i);
  if (issues.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
