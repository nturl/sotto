#!/usr/bin/env node
/**
 * The audible-output proof this lane's card asks for (run7/F1 directive 7;
 * recon at ~/Claude/sotto-run7-recon/scout-T-tutor.md, "What a
 * spoken-exchange proof would need"): every existing e2e script
 * (`voice-live.mjs`, `self-hosted-voice.mjs`, `browser-tutor.mjs`) only
 * scrapes caption text off the DOM, which is exactly the signal that stays
 * green even when TTS silently fails (scout-T-tutor.md §2A/§6) — a caption
 * says the tutor "spoke", but nothing ever checked that a single audio
 * sample reached the speakers.
 *
 * This script instruments the real Web Audio API (via `page.addInitScript`,
 * so it's wired before the app's own code ever constructs an
 * `AudioContext`) to count every `AudioBufferSourceNode.start()` call and
 * every sample scheduled, then drives one real tutor turn and asserts
 * `started > 0 && totalSamples > 0` — the thing scraping `Tutor:` caption
 * lines can never prove.
 *
 * Mode: this Mac had `apps/server`'s local stack up and healthy (stt/llm/tts
 * all true on :8790/health) when this script was written, so it drives the
 * real `local` cascade path — same `WebAudioAdapter.playPcm` code every
 * other path (browser/byok) shares (packages/voice/src/transports/
 * web-audio.ts), so a pass here exercises the exact playback code this
 * lane's fix (`speakSentence` in openai-direct/provider.ts) touches,
 * without needing a stored own-provider key. The card's fallback —an
 * env-gated `EXPO_PUBLIC_VOICE_FAKE=1` canned-PCM provider for a machine
 * with no local models — was not built in this pass; see F1-report.md
 * "Known gaps".
 *
 * Usage: BASE_URL=http://localhost:8081 node apps/client/e2e/audible-probe.mjs
 * (apps/server must be running and healthy on :8790 — this script checks
 * /health itself and fails fast with a clear message if it isn't, rather
 * than hanging in `connecting` for the full timeout.)
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
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8081';
const SERVER_URL = process.env.SOTTO_SERVER_URL ?? 'http://localhost:8790';
const TTS_URL = process.env.SOTTO_TTS_URL ?? 'http://127.0.0.1:8880/v1';
const BOOK_ID = 'es-fabulas-samaniego';
const TIMEOUT_MS = 75_000;
const TRAILING_SILENCE_MS = 1500;

mkdirSync(CACHE_DIR, { recursive: true });

const t0 = Date.now();
function log(...args) {
  console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);
}

// The probe from the recon's "What a spoken-exchange proof would need"
// section, injected before any app code runs. Wraps every AudioContext
// this page ever constructs (there are two independent ones in this app —
// capture and playback, packages/voice/src/transports/web-audio.ts — the
// probe only fires on the playback one, since that's the only one that
// ever calls createBufferSource().start()).
const AUDIO_PROBE_SCRIPT = `
window.__sottoAudioProbe = { started: 0, totalSamples: 0 };
const OrigCtx = window.AudioContext;
window.AudioContext = class extends OrigCtx {
  createBufferSource() {
    const src = super.createBufferSource();
    const origStart = src.start.bind(src);
    src.start = (...args) => {
      window.__sottoAudioProbe.started++;
      window.__sottoAudioProbe.totalSamples += src.buffer?.length ?? 0;
      return origStart(...args);
    };
    return src;
  }
};
`;

async function checkLocalServerHealthy() {
  try {
    const res = await fetch(`${SERVER_URL.replace(/\/$/, '')}/health`);
    if (!res.ok) return { healthy: false, detail: `HTTP ${res.status}` };
    const health = await res.json();
    const healthy = !!(health.stt && health.llm && health.tts);
    return { healthy, detail: JSON.stringify(health) };
  } catch (err) {
    return { healthy: false, detail: err instanceof Error ? err.message : String(err) };
  }
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
  if (!res.ok) throw new Error(`Kokoro TTS failed (${res.status}): ${await res.text()}`);
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
  const health = await checkLocalServerHealthy();
  if (!health.healthy) {
    console.error(
      `[audible-probe] apps/server on ${SERVER_URL} is not healthy (${health.detail}). ` +
        'This probe needs the local stt/llm/tts stack up (docs/local-models.md); it does not fall ' +
        'back to a fake provider in this build (see F1-report.md "Known gaps").',
    );
    process.exit(1);
  }
  log(`Local server healthy: ${health.detail}`);

  log('Synthesizing fake-mic wav: "¿Qué significa la palabra cigarra?"');
  const wav = await buildUtteranceWav('¿Qué significa la palabra cigarra?', 'audible-probe');

  const context = await chromium.launchPersistentContext(
    path.join(CACHE_DIR, 'audible-probe-profile'),
    {
      viewport: { width: 430, height: 852 },
      permissions: ['microphone'],
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${wav}`,
        // Autoplay policy edge case this lane's directive 2 is about: a
        // real Chrome profile with no prior interaction can start the
        // playback AudioContext suspended. Deliberately NOT passing
        // --autoplay-policy=no-user-gesture-required, so a genuine tap (the
        // page navigation + seeded "onboarded" state acts as the gesture
        // record here, same as voice-live.mjs) is what unblocks it — this
        // probe is meant to catch a real block, not paper over one.
      ],
    },
  );
  const page = context.pages()[0] ?? (await context.newPage());
  // Must be registered before ANY navigation loads the app's bundle, so the
  // wrapped AudioContext is the one `web-audio.ts` actually constructs.
  await page.addInitScript(AUDIO_PROBE_SCRIPT);

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
    if (process.env.AUDIBLE_PROBE_VERBOSE) log(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) log(`navigated -> ${frame.url()}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await seedProfile(page);

  log(`Navigating to /voice/${BOOK_ID}`);
  await page.goto(`${BASE_URL}/voice/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });

  // R6-B3 (voiceStartGate.ts): the session no longer auto-starts on mount —
  // a real tap is required so a permission sheet is never raised without a
  // user gesture on record. `voice.start` (en.json) renders as "Start".
  log('Tapping Start');
  await page.getByText('Start', { exact: true }).click();

  const timeline = [];
  let lastCaptionsKey = '';
  let lastState = '';
  const deadline = Date.now() + TIMEOUT_MS;
  let sawTutorCaption = false;

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
      timeline.push({ t: (Date.now() - t0) / 1000, kind: 'state', value: lastState });
      log(`state -> ${lastState}`);
    }
    const captionsKey = snapshot.captionLines.join('|');
    if (captionsKey && captionsKey !== lastCaptionsKey) {
      lastCaptionsKey = captionsKey;
      for (const line of snapshot.captionLines) {
        if (!timeline.some((e) => e.kind === 'caption' && e.value === line)) {
          timeline.push({ t: (Date.now() - t0) / 1000, kind: 'caption', value: line });
          log(`caption: ${line}`);
          if (/^Tutor:/.test(line)) sawTutorCaption = true;
        }
      }
    }

    if (process.env.AUDIBLE_PROBE_VERBOSE) {
      const probeNow = await page.evaluate(() => window.__sottoAudioProbe);
      log(`probe: ${JSON.stringify(probeNow)}`);
    }

    // Stop once the tutor has replied AND the session settled back to
    // listening — same as voice-live.mjs's stop condition, giving playback
    // time to actually be scheduled before we read the probe.
    if (sawTutorCaption && lastState === 'listening' && timeline[0] && lastState) break;

    await page.waitForTimeout(1000);
  }

  const probe = await page.evaluate(() => window.__sottoAudioProbe);
  await page.screenshot({ path: path.join(OUT_DIR, 'audible-probe-final.png') });
  await context.close();

  console.log('\n===== Timeline =====');
  for (const e of timeline) console.log(`  [t+${e.t.toFixed(1)}s] ${e.kind}: ${e.value}`);
  console.log('\n===== Audio probe =====');
  console.log(`  ${JSON.stringify(probe)}`);

  const results = {
    'tutor caption appeared (text reply happened)': sawTutorCaption,
    'AudioBufferSourceNode.start() was called at least once': probe.started > 0,
    'at least one sample was actually scheduled': probe.totalSamples > 0,
    'no page/console errors': pageErrors.length === 0,
  };
  console.log('\n===== Assertions =====');
  let allPass = true;
  for (const [name, ok] of Object.entries(results)) {
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`);
    if (!ok) allPass = false;
  }
  if (pageErrors.length) {
    console.log('\n  Page/console errors:');
    for (const e of pageErrors) console.log('    -', e);
  }
  console.log(`\nMode: local cascade (apps/server on ${SERVER_URL})`);
  console.log(`Final screenshot: ${path.join(OUT_DIR, 'audible-probe-final.png')}`);

  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[audible-probe] FAILED:', err);
  process.exit(1);
});
