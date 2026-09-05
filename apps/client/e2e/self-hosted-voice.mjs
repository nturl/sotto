#!/usr/bin/env node
/**
 * Self-hosting proof (planning/STRATEGY.md CONFIRM 5, Lane R3-H): drives the
 * real web app served from apps/server's own SOTTO_STATIC_DIR (one origin,
 * no accounts) at BASE_URL, through onboarding -> book -> reader (narration
 * playing) -> /voice/<bookId>, feeds a fake-mic learner utterance, and
 * asserts a tutor caption + audio_end come back from the REAL cascade
 * configured on the server (this run: OpenAI Tier 2, see docs/openai.md).
 * One turn only — real OpenAI usage costs money.
 *
 * Assumes the server is already running with SOTTO_STATIC_DIR set to
 * apps/client/dist (pnpm web:export) and, for the fake-mic wav, a reachable
 * TTS endpoint to synthesize the learner's line (local Kokoro by default,
 * SOTTO_TTS_URL to override — independent of which cascade the server
 * itself is configured to use for the tutor's turn).
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:8792 \
 *   SOTTO_BASIC_AUTH_USER=sotto SOTTO_BASIC_AUTH_PASS=demo-only \
 *   node apps/client/e2e/self-hosted-voice.mjs
 */
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '.cache');
const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/web');
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8792';
const TTS_URL = process.env.SOTTO_TTS_URL ?? 'http://127.0.0.1:8880/v1';
const AUTH_USER = process.env.SOTTO_BASIC_AUTH_USER ?? 'sotto';
const AUTH_PASS = process.env.SOTTO_BASIC_AUTH_PASS ?? 'demo-only';
const BOOK_ID = 'es-fabulas-samaniego';
const TARGET_WORD = 'cigarra';
const TURN_TIMEOUT_MS = 75_000;
const TRAILING_SILENCE_MS = 1500;

mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const t0 = Date.now();
function log(...args) {
  console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);
}

async function synthesizeToFile(text, outFile) {
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
  if (!res.ok) throw new Error(`fake-mic TTS synth failed (${res.status}): ${await res.text()}`);
  writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
}

async function toFakeMicFormat(inFile, outFile) {
  await run('ffmpeg', [
    '-y',
    '-i',
    inFile,
    '-ar',
    '48000',
    '-ac',
    '1',
    '-sample_fmt',
    's16',
    outFile,
  ]);
}

async function buildSilenceWav(ms, outFile) {
  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=mono',
    '-t',
    String(ms / 1000),
    '-sample_fmt',
    's16',
    outFile,
  ]);
}

async function buildUtteranceWav(text, name) {
  const raw = path.join(CACHE_DIR, `${name}-raw.wav`);
  const formatted = path.join(CACHE_DIR, `${name}-fmt.wav`);
  const silence = path.join(CACHE_DIR, `${name}-silence.wav`);
  const combined = path.join(CACHE_DIR, `${name}.wav`);
  const listFile = path.join(CACHE_DIR, `${name}-concat.txt`);
  await synthesizeToFile(text, raw);
  await toFakeMicFormat(raw, formatted);
  await buildSilenceWav(TRAILING_SILENCE_MS, silence);
  writeFileSync(listFile, [formatted, silence].map((f) => `file '${f}'`).join('\n'));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', combined]);
  return combined;
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

async function seedProfile(page) {
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

async function main() {
  const issues = [];
  const wsUrls = [];

  log(
    `Synthesizing fake-mic wav (local TTS, independent of server cascade): "¿Qué significa la palabra ${TARGET_WORD}?"`,
  );
  const wavPath = await buildUtteranceWav(
    `¿Qué significa la palabra ${TARGET_WORD}?`,
    'selfhost-turn',
  );

  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${wavPath}`,
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    permissions: ['microphone'],
    httpCredentials: { username: AUTH_USER, password: AUTH_PASS },
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`console.error: ${msg.text()}`);
  });
  page.on('websocket', (ws) => {
    wsUrls.push(ws.url());
    log(`WebSocket opened: ${ws.url()}`);
  });

  // ---- 1. Onboarding: fresh, unseeded profile against the self-hosted origin ----
  log(`Loading ${BASE_URL} (unseeded — expect onboarding)`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const onboardingUrl = page.url();
  const sawOnboarding = /onboarding/.test(onboardingUrl);
  log(`Landed on: ${onboardingUrl} (onboarding=${sawOnboarding})`);

  // ---- 2. Seed an onboarded profile, then reload to route past onboarding ----
  await seedProfile(page);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  log(`Home reached at: ${page.url()}`);

  // ---- 3. Book detail ----
  await page.goto(`${BASE_URL}/book/${BOOK_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  log(`Book detail reached at: ${page.url()}`);

  // ---- 4. Reader: narration auto-starts (mode === 'narration'); confirm the
  //         narration audio asset was actually fetched from this origin. ----
  let narrationAssetFetched = false;
  page.on('response', (res) => {
    if (/\/content\/packs\/.*\/audio\/.*\.mp3/.test(res.url()) && res.ok()) {
      narrationAssetFetched = true;
    }
  });
  await page.goto(`${BASE_URL}/reader/${BOOK_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (!narrationAssetFetched) issues.push('reader: no narration audio asset fetch observed');
  log(`Reader reached; narration asset fetched=${narrationAssetFetched}`);
  await page.screenshot({ path: path.join(OUT_DIR, '375-selfhost-reader.png') });

  // ---- 5. Voice: real turn against the server's configured cascade ----
  log(`Navigating to /voice/${BOOK_ID}`);
  await page.goto(`${BASE_URL}/voice/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });

  const timeline = [];
  const statesSeen = [];
  let lastCaptionsKey = '';
  let lastState = '';
  const turnStart = Date.now();
  let firstTutorCaptionAt = null;

  const deadline = Date.now() + TURN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(() => {
      const body = document.body.innerText;
      const stateMatch =
        /^(idle|connecting|listening|thinking|speaking|paused|muted|reconnecting|ended|error)$/im;
      const lines = body
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const stateLine = lines.find((l) => stateMatch.test(l));
      const captionLines = lines.filter((l) => /^(You|Tutor):/.test(l));
      return { stateLine: stateLine ?? '', captionLines };
    });

    if (snapshot.stateLine && snapshot.stateLine !== lastState) {
      lastState = snapshot.stateLine;
      statesSeen.push(lastState);
      timeline.push({ t: (Date.now() - t0) / 1000, kind: 'state', value: lastState });
      log(`state -> ${lastState}`);
    }

    const captionsKey = snapshot.captionLines.join('|');
    if (captionsKey && captionsKey !== lastCaptionsKey) {
      lastCaptionsKey = captionsKey;
      for (const line of snapshot.captionLines) {
        const already = timeline.some((e) => e.kind === 'caption' && e.value === line);
        if (!already) {
          timeline.push({ t: (Date.now() - t0) / 1000, kind: 'caption', value: line });
          log(`caption: ${line}`);
          if (/^Tutor:/.test(line) && firstTutorCaptionAt === null) {
            firstTutorCaptionAt = Date.now();
          }
        }
      }
    }

    const hasTutorReply = timeline.some((e) => e.kind === 'caption' && /^Tutor:/.test(e.value));
    const backToListening =
      hasTutorReply &&
      timeline.some((e) => e.kind === 'state' && e.value === 'listening' && e.t > timeline[0].t);
    if (hasTutorReply && backToListening) {
      log('Stop condition met (tutor replied, session back to listening = audio_end).');
      break;
    }

    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: path.join(OUT_DIR, '375-selfhost-voice.png') });
  await browser.close();

  const sawLearnerCaption = timeline.some(
    (e) =>
      e.kind === 'caption' && /^You:/.test(e.value) && e.value.toLowerCase().includes(TARGET_WORD),
  );
  const sawTutorCaption = timeline.some((e) => e.kind === 'caption' && /^Tutor:/.test(e.value));
  const cycleSeen = ['listening', 'thinking', 'speaking'].every((s) => statesSeen.includes(s));
  const wsOnServerOrigin = wsUrls.some((u) => u.includes(':8792'));
  const turnLatencyMs = firstTutorCaptionAt ? firstTutorCaptionAt - turnStart : null;

  console.log('\n===== Timeline =====');
  for (const e of timeline) console.log(`  [t+${e.t.toFixed(1)}s] ${e.kind}: ${e.value}`);
  console.log(`\n===== WebSocket URLs opened =====\n  ${wsUrls.join('\n  ')}`);

  console.log('\n===== Assertions =====');
  const results = {
    'onboarding rendered on first unseeded load': sawOnboarding,
    'narration audio asset fetched in reader': narrationAssetFetched,
    'voice/ws opened on the self-hosted origin (:8792)': wsOnServerOrigin,
    'learner caption heard (fake mic, contains target word)': sawLearnerCaption,
    'tutor caption received (real OpenAI cascade)': sawTutorCaption,
    'state cycled listening -> thinking -> speaking': cycleSeen,
    'no page/console errors': issues.length === 0,
  };
  let allPass = true;
  for (const [name, ok] of Object.entries(results)) {
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`);
    if (!ok) allPass = false;
  }
  if (issues.length) {
    console.log('\n  Issues:');
    for (const i of issues) console.log('    -', i);
  }
  console.log(
    `\nTurn latency (voice screen load -> first tutor caption): ${turnLatencyMs !== null ? `${(turnLatencyMs / 1000).toFixed(1)}s` : 'n/a (no tutor caption seen)'}`,
  );
  console.log(
    `Screenshots: ${path.join(OUT_DIR, '375-selfhost-reader.png')}, ${path.join(OUT_DIR, '375-selfhost-voice.png')}`,
  );

  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[self-hosted-voice] FAILED:', err);
  process.exit(1);
});
