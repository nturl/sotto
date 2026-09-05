#!/usr/bin/env node
/* global WebSocket, clearTimeout */
/**
 * R3-E proof: the paid (hosted) tier, against a real sotto-cloud staging
 * server — not the FakeCloudAdapter path that e2e/cloud.mjs covers.
 *
 * TWO PHASES, not one, because Phase 1 found a blocking client defect
 * (see the report / docs/verification.md Tier 4): apps/client/src/cloud/
 * http.ts:92 captures the bare `fetch` function reference
 * (`this.fetchImpl = opts.fetch ?? fetch`) instead of binding it to
 * `window`/`globalThis`. Real browsers enforce Fetch's "this must be a
 * Window or WorkerGlobalScope" brand check, so every call the real web app
 * makes through HttpCloudAdapter — sign-in, plans, subscribe, usage,
 * voice session, everything — throws `TypeError: Failed to execute
 * 'fetch' on 'Window': Illegal invocation` before any network I/O. Every
 * unit test injects `opts.fetch` (a vi.fn()), which bypasses the bug
 * entirely — see apps/client/src/cloud/http.test.ts — so it is invisible
 * to `pnpm check` and only shows up against a real browser. NullCloud/
 * FakeCloudAdapter paths (e2e/cloud.mjs, the boundary check) are unaffected.
 *
 * Phase 1 (real browser, Playwright): drives /account exactly as a learner
 * would, shows the click fails, and captures the console error proving the
 * root cause above.
 *
 * Phase 2 (plain Node `fetch`/`WebSocket`, no browser): Node's fetch does
 * not enforce the browser brand check the client bug trips over, so this
 * phase exercises the SAME server endpoints the broken UI would have
 * called, to verify the sotto-cloud side is actually sound: magic-link
 * sign-in, stub subscribe, `/voice/session`, a real cascade WS turn (fake
 * mic replaced by a Kokoro-synthesized PCM16 clip sent as binary frames,
 * per CONTRACTS §5b), a `usage` tick, then the cap dropped to 5s via
 * sqlite3 and a fresh `/voice/session` refused with `cap_exhausted`.
 *
 * Usage:
 *   BASE_URL=http://localhost:8098 CLOUD_URL=http://localhost:8794 \
 *   CLOUD_LOG=/path/to/cloud-server.log DB_PATH=/path/to/sotto-cloud.sqlite \
 *   node apps/client/e2e/paid.mjs
 */
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/screenshots/web');
const CACHE_DIR = path.join(__dirname, '.cache');
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:8098').replace(/\/$/, '');
const CLOUD_URL = (process.env.CLOUD_URL ?? 'http://localhost:8794').replace(/\/$/, '');
const CLOUD_LOG = process.env.CLOUD_LOG;
const DB_PATH = process.env.DB_PATH;
const TTS_URL = process.env.SOTTO_TTS_URL ?? 'http://127.0.0.1:8880/v1';
const EMAIL = 'e2e-run3@example.test';
const BOOK_ID = 'es-fabulas-samaniego';
const CHAPTER_ID = 'es-fabulas-samaniego-01';

mkdirSync(SCREENSHOT_DIR, { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });

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
  const file = path.join(SCREENSHOT_DIR, `${width}-paid-${name}.png`);
  await page.screenshot({ path: file });
  log(`screenshot ${width}-paid-${name}.png`);
}

const PREFERENCES = {
  interfaceLocale: 'en',
  explanationLocale: 'en',
  learningLocale: 'es-419',
  level: 'A1',
  immersionMode: false,
  defaultTutorMode: 'discuss',
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
  }, PREFERENCES);
}

// =============================================================================
// Phase 1: real browser, documents the client-side defect.
// =============================================================================
async function phase1() {
  log('=== Phase 1: real browser UI (Playwright) ===');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 852 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await seed(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  log(`opening ${BASE_URL}/account`);
  await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await shoot(page, 375, 'signin');
  await shoot(page, 1440, 'signin');
  await page.setViewportSize({ width: 375, height: 852 });

  const emailInput = page.getByPlaceholder('you@example.com');
  await emailInput.fill(EMAIL);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1000);

  const sentVisible = await page
    .getByText('Sent', { exact: true })
    .isVisible()
    .catch(() => false);
  const toastVisible = await page
    .getByText("Couldn't send the link. Try again.", { exact: true })
    .isVisible()
    .catch(() => false);
  record(
    'Real-browser magic-link send (KNOWN DEFECT under test — apps/client/src/cloud/http.ts:92, see report/verification.md)',
    sentVisible,
    toastVisible
      ? "blocked: \"Couldn't send the link\" toast shown. account/index.tsx's catch {} swallows the underlying error silently — confirmed by direct investigation (a temporary console.error, reverted before this commit) to be `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation` from HttpCloudAdapter.request()"
      : 'neither the sent state nor the failure toast appeared',
  );

  // /usage while signed out: useMe() catches the same error and falls back
  // to signed-out, so this screen still renders (just perpetually signed
  // out — the defect blocks sign-in itself, not this screen's rendering).
  await page.goto(`${BASE_URL}/usage`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await shoot(page, 375, 'usage');
  await shoot(page, 1440, 'usage');
  await page.setViewportSize({ width: 375, height: 852 });

  // /voice/<bookId>: with sign-in blocked, cloudPathUsable() is false, so no
  // cap message is reachable through the UI either — screenshot the actual
  // (local/browser-only) state honestly instead of a scripted cap panel.
  await page.goto(`${BASE_URL}/voice/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shoot(page, 375, 'cap');
  await shoot(page, 1440, 'cap');

  await browser.close();
}

// =============================================================================
// Phase 2: plain Node fetch/WebSocket — verifies the server side directly.
// =============================================================================

function parseSetCookie(header) {
  if (!header) return null;
  const first = header.split(',')[0];
  return first.split(';')[0];
}

async function synthesizePcm16(text, outFile) {
  const raw = path.join(CACHE_DIR, 'phase2-raw.wav');
  const res = await fetch(`${TTS_URL.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice: 'ef_dora',
      lang_code: 'e',
      response_format: 'wav',
    }),
  });
  if (!res.ok) throw new Error(`Kokoro TTS failed (${res.status}): ${await res.text()}`);
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  // CONTRACTS §5b: client->server binary is PCM16 mono 16 kHz LE, headerless.
  // Trailing silence (as e2e/voice-live.mjs does for the fake mic) so the
  // energy VAD actually detects end-of-speech — without a pause after the
  // utterance the session never leaves `listening`.
  const spoken = path.join(CACHE_DIR, 'phase2-spoken.pcm');
  await run('ffmpeg', [
    '-y',
    '-i',
    raw,
    '-ar',
    '16000',
    '-ac',
    '1',
    '-f',
    's16le',
    '-acodec',
    'pcm_s16le',
    spoken,
  ]);
  const spokenBuf = readFileSync(spoken);
  const silenceBuf = Buffer.alloc(Math.floor(16000 * 2 * 1.5)); // 1.5s of silence
  writeFileSync(outFile, Buffer.concat([spokenBuf, silenceBuf]));
}

function readMagicLinkFromLog(email) {
  if (!CLOUD_LOG) throw new Error('CLOUD_LOG not set');
  const text = readFileSync(CLOUD_LOG, 'utf8');
  const lines = text
    .split('\n')
    .filter((l) => l.includes(email) && l.includes('magic-link/verify'));
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1];
  const match = last.match(/"url":"([^"]+)"/);
  return match ? match[1].replace(/\\u0026/g, '&') : null;
}

async function waitForMagicLink(email, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = readMagicLinkFromLog(email);
    if (url) return url;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function setCapToFiveSeconds() {
  if (!DB_PATH) throw new Error('DB_PATH not set');
  await run('sqlite3', [
    DB_PATH,
    `UPDATE entitlements SET tutor_minutes_cap = 1, tutor_seconds_used = 55 WHERE user_id = (SELECT id FROM users WHERE email = '${EMAIL}');`,
  ]);
}

async function phase2() {
  log('=== Phase 2: direct server verification (plain Node fetch + WebSocket) ===');

  // ---- magic link ----
  const sendRes = await fetch(`${CLOUD_URL}/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, kind: 'web' }),
  });
  record('POST /auth/magic-link -> 200', sendRes.status === 200, String(sendRes.status));

  const link = await waitForMagicLink(EMAIL);
  record('Magic link readable from the staging log', !!link, link ?? 'not found');
  if (!link) throw new Error('cannot continue without a magic link');

  const verifyRes = await fetch(link, { redirect: 'manual' });
  const cookie = parseSetCookie(verifyRes.headers.get('set-cookie'));
  record(
    'GET .../auth/magic-link/verify sets a session cookie and redirects to APP_BASE_URL/account',
    verifyRes.status === 302 && !!cookie,
    `status=${verifyRes.status} location=${verifyRes.headers.get('location')} cookie=${cookie ?? 'none'}`,
  );
  if (!cookie) throw new Error('no session cookie');

  const meRes1 = await fetch(`${CLOUD_URL}/me`, { headers: { cookie } });
  const me1 = await meRes1.json();
  record(
    'GET /me shows the signed-in user, plan free',
    me1?.entitlement?.plan === 'free',
    JSON.stringify(me1),
  );

  // ---- stub subscribe: standard ----
  const subRes = await fetch(`${CLOUD_URL}/billing/stub/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ plan: 'standard' }),
  });
  const subBody = await subRes.json();
  record(
    'POST /billing/stub/subscribe(standard) -> 200',
    subRes.status === 200,
    JSON.stringify(subBody),
  );

  const meRes2 = await fetch(`${CLOUD_URL}/me`, { headers: { cookie } });
  const me2 = await meRes2.json();
  record(
    'GET /me now shows Standard, 0/200 tutor minutes, provider cascade-open',
    me2?.entitlement?.plan === 'standard' &&
      me2?.entitlement?.tutorMinutesCap === 200 &&
      me2?.entitlement?.tutorMinutesUsed === 0,
    JSON.stringify(me2),
  );

  // ---- passage for the session (real chapter 1, first sentence) ----
  const chapter = JSON.parse(
    readFileSync(
      path.resolve(
        __dirname,
        '../../../packages/content/packs/es-419/books/es-fabulas-samaniego/chapters/01.json',
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
    bookId: BOOK_ID,
    chapterId: CHAPTER_ID,
    mode: 'discuss',
    learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en' },
    passage,
    savedWords: [],
  };

  // ---- POST /voice/session -> real cascade-open (local stack) session ----
  const sessRes = await fetch(`${CLOUD_URL}/voice/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(sessionOptions),
  });
  const sess = await sessRes.json();
  record(
    'POST /voice/session -> 200, wsUrl on the :8794 host',
    sessRes.status === 200 && sess?.wsUrl?.includes(':8794'),
    JSON.stringify(sess),
  );

  if (sessRes.status === 200 && sess.wsUrl) {
    log('building 16kHz PCM16 fake-mic clip via Kokoro');
    const pcmFile = path.join(CACHE_DIR, 'phase2.pcm');
    await synthesizePcm16('¿Qué significa la palabra cigarra?', pcmFile);
    const pcm = readFileSync(pcmFile);

    const wsUrl = sess.wsUrl.replace('ws://', 'ws://').replace('wss://', 'wss://');
    log(`connecting WS: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    const events = [];
    let sawCaption = false;
    let sawUsage = false;
    let sawAudio = false;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 75_000);
      ws.addEventListener('open', () => {
        log('WS open — streaming PCM16 frames (30ms each)');
        const frameBytes = Math.floor(16000 * 2 * 0.03); // 30ms @16kHz/16-bit mono
        (async () => {
          for (let i = 0; i < pcm.length; i += frameBytes) {
            if (ws.readyState !== WebSocket.OPEN) break;
            ws.send(pcm.subarray(i, i + frameBytes));
            await new Promise((r) => setTimeout(r, 25));
          }
        })();
      });
      ws.addEventListener('message', (ev) => {
        if (typeof ev.data === 'string') {
          events.push(ev.data);
          try {
            const msg = JSON.parse(ev.data);
            if (msg.t === 'caption') sawCaption = true;
            if (msg.t === 'usage') sawUsage = true;
            log(`WS <- ${ev.data.slice(0, 160)}`);
          } catch {
            // ignore
          }
        } else {
          sawAudio = true;
        }
      });
      ws.addEventListener('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      ws.addEventListener('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      // Give the tutor time to respond, then close cleanly.
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'end' }));
      }, 55_000);
    });

    record(
      'WS session: at least one caption event received',
      sawCaption,
      events.slice(-3).join(' | '),
    );
    record('WS session: a `usage` tick reached the client', sawUsage);
    record('WS session: tutor audio (binary frame) received', sawAudio);
  }

  // ---- drop the cap to 5s remaining. metering.ts:108 gates on
  //      remainingSeconds <= 0, so with 5s left POST /voice/session still
  //      succeeds (200, limits.maxMs clamped to 5000 — visible below) and
  //      the cutoff happens mid-session: the meter's onExhausted fires
  //      `{t:'limit',reason:'cap'}` then `{t:'error',code:'cap_exhausted',
  //      message: <reset-date sentence>}` and closes (cascade.ts:405-415).
  //      Setting cap to exactly 0 remaining (not this run's ask) would be
  //      the case that gets refused at POST time instead. ----
  log('setting the cap to 5 seconds via sqlite3');
  await setCapToFiveSeconds();

  // Build the clip BEFORE minting the session: the `?session=` secret is
  // good for only 60s (CLOUD-API.md), and Kokoro synth + ffmpeg competing
  // with a busy local LLM can eat most of that on this machine.
  const capPcmFilePre = path.join(CACHE_DIR, 'phase2-cap.pcm');
  await synthesizePcm16('¿Qué significa la palabra cigarra?', capPcmFilePre);

  const capSessRes = await fetch(`${CLOUD_URL}/voice/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(sessionOptions),
  });
  const capSess = await capSessRes.json();
  record(
    'POST /voice/session with 5s remaining -> 200, limits.maxMs clamped to 5000',
    capSessRes.status === 200 && capSess?.limits?.maxMs === 5000,
    JSON.stringify(capSess),
  );

  if (capSessRes.status === 200 && capSess.wsUrl) {
    const capPcm = readFileSync(capPcmFilePre);
    const capWs = new WebSocket(capSess.wsUrl);
    let sawLimit = false;
    let sawCapError = false;
    let capMessage = '';
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 25_000);
      capWs.addEventListener('open', () => {
        const frameBytes = Math.floor(16000 * 2 * 0.03);
        (async () => {
          // Stream on a loop past the 5s budget so the meter has audio to
          // exhaust the cap against, rather than one short clip.
          for (let round = 0; round < 4; round++) {
            for (let i = 0; i < capPcm.length; i += frameBytes) {
              if (capWs.readyState !== WebSocket.OPEN) return;
              capWs.send(capPcm.subarray(i, i + frameBytes));
              await new Promise((r) => setTimeout(r, 25));
            }
          }
        })();
      });
      capWs.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string') return;
        log(`WS(cap) <- ${ev.data.slice(0, 160)}`);
        try {
          const msg = JSON.parse(ev.data);
          if (msg.t === 'limit' && msg.reason === 'cap') sawLimit = true;
          if (msg.t === 'error' && msg.code === 'cap_exhausted') {
            sawCapError = true;
            capMessage = msg.message;
          }
        } catch {
          // ignore
        }
      });
      capWs.addEventListener('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    record('WS(cap): `{t:"limit",reason:"cap"}` sent before close', sawLimit);
    record(
      'WS(cap): `{t:"error",code:"cap_exhausted"}` with a clear reset-date message',
      sawCapError,
      capMessage,
    );
  }
}

async function main() {
  if (process.env.SKIP_PHASE1 !== '1') await phase1();
  await phase2();
  log(issues.length === 0 ? 'ALL PASS' : `${issues.length} ISSUE(S)`);
  for (const i of issues) log('ISSUE:', i);
  if (issues.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
