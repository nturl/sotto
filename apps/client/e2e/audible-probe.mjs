#!/usr/bin/env node
/**
 * The spoken-exchange proof run7/G's card asks for (planning/run7/cards/
 * G-voice-integration.md directive 4, finishing F1's directive 7): a
 * learner turn goes in, the tutor's reply renders in the transcript AND is
 * audible (Web Audio samples > 0), on the local path with this Mac's local
 * models.
 *
 * F1's original version of this script drove the turn through a
 * synthesized fake-mic WAV and never got past `listening`: a diagnostic
 * pass (F1-report.md "Audible probe") found the capture pipeline sends
 * zero binary frames over the WebSocket against Chromium's
 * `--use-file-for-fake-audio-capture` device in this environment — a
 * pre-existing capture/fake-device interaction, not a defect in any of
 * this run's fixes. The card's directive 4 routes around it explicitly:
 * "drive a turn through the text fallback (no microphone capture
 * needed)". This version does that — `TextFallback` (F2's component) calls
 * the same `sessionManager.sendText()` a transcribed learner utterance
 * would, so it exercises the identical LLM -> TTS -> `AudioAdapter.playPcm`
 * path, just without depending on the fake-audio device delivering frames
 * at all. `getUserMedia` still runs (`LocalCascadeProvider.connect` always
 * starts capture — see `local-cascade.ts`), so a fake media device is
 * still required for the session to reach `listening` rather than erroring
 * out on a real denial, but nothing here depends on that device actually
 * producing audio.
 *
 * Book: `fr-chevre-de-m-seguin` (La Chèvre de M. Seguin) — its very first
 * passage sentence names Provence literally ("M. Seguin habitait dans une
 * petite maison blanche, au bord d'un charmant village de Provence.",
 * `packages/content/packs/fr-FR/books/fr-chevre-de-m-seguin/chapters/
 * 01.json`), so the card's exact learner text applies unmodified — grepped
 * every pack for "Provence" first: `fr-daudet-les-etoiles` only mentions it
 * in `book.json`'s `tutorNotes.culture`, which the prompt
 * (`packages/core/src/prompt.ts`) never reads; only this book's actual
 * chapter passage has it.
 *
 * Usage: BASE_URL=http://localhost:8081 node apps/client/e2e/audible-probe.mjs
 * (apps/server must be running and healthy on :8790 — this script checks
 * /health itself and fails fast with a clear message if it isn't, rather
 * than hanging in `connecting` for the full timeout.)
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { readVoiceSnapshot, tapStart } from './voice-start.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Card's own instruction: "screenshots in ~/Claude/sotto-run7-recon/G/".
const OUT_DIR = path.resolve(__dirname, '../../../../sotto-run7-recon/G/screens');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8081';
const SERVER_URL = process.env.SOTTO_SERVER_URL ?? 'http://localhost:8790';
const BOOK_ID = 'fr-chevre-de-m-seguin';
const LEARNER_TEXT = "Qu'est-ce que c'est, la Provence ? Est-ce en France ?";
const TIMEOUT_MS = 90_000;

mkdirSync(OUT_DIR, { recursive: true });

const t0 = Date.now();
function log(...args) {
  console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);
}

// The probe from scout-T-tutor.md's "What a spoken-exchange proof would
// need" section, injected before any app code runs. Wraps every
// AudioContext this page ever constructs and counts every
// `AudioBufferSourceNode.start()` call plus every sample scheduled — a
// pass here is a measurement of sound actually being scheduled, not an
// inference from a caption or a state transition (scout-T-tutor.md §2A/§6:
// every prior e2e script only scraped caption text off the DOM, which
// stays green even when TTS silently fails).
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
    return { healthy, detail: JSON.stringify(health), health };
  } catch (err) {
    return { healthy: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

const PREFERENCES = {
  interfaceLocale: 'en',
  explanationLocale: 'en',
  learningLocale: 'fr-FR',
  level: 'A2',
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

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

async function main() {
  const health = await checkLocalServerHealthy();
  if (!health.healthy) {
    console.error(
      `[audible-probe] apps/server on ${SERVER_URL} is not healthy (${health.detail}). ` +
        'This probe needs the local stt/llm/tts stack up — see docs/local-models.md.',
    );
    process.exit(1);
  }
  log(`Local server healthy: ${health.detail}`);

  const cacheDir = path.join(__dirname, '.cache', 'audible-probe-profile');
  const context = await chromium.launchPersistentContext(cacheDir, {
    viewport: { width: 430, height: 852 },
    permissions: ['microphone'],
    // No `--use-file-for-fake-audio-capture`: this probe drives the turn
    // through the text fallback, so the fake device only has to make
    // `getUserMedia` resolve instead of erroring the session out
    // (`LocalCascadeProvider.connect` always starts capture regardless of
    // input mode). Nothing here depends on that device delivering frames.
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
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
  await shot(page, 'state-00-pre-start');

  // R6-B3 (voiceStartGate.ts): the session no longer auto-starts on mount —
  // a real tap is required so a permission sheet is never raised without a
  // user gesture on record. `voice.start` (en.json) renders as "Start".
  log('Tapping Start');
  await tapStart(page);
  await shot(page, 'state-01-post-start');

  const timeline = [];
  let lastCaptionsKey = '';
  let lastState = '';
  let shotCount = 2;
  let sentTurn = false;
  let sawTutorReply = false;
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const snapshot = await readVoiceSnapshot(page);

    if (snapshot.stateLine && snapshot.stateLine !== lastState) {
      lastState = snapshot.stateLine;
      timeline.push({ t: (Date.now() - t0) / 1000, kind: 'state', value: lastState });
      log(`state -> ${lastState}`);
      await shot(page, `state-${String(shotCount++).padStart(2, '0')}-${lastState}`);
    }
    const captionsKey = snapshot.captionLines.join('|');
    if (captionsKey && captionsKey !== lastCaptionsKey) {
      lastCaptionsKey = captionsKey;
      for (const line of snapshot.captionLines) {
        if (!timeline.some((e) => e.kind === 'caption' && e.value === line)) {
          timeline.push({ t: (Date.now() - t0) / 1000, kind: 'caption', value: line });
          log(`caption: ${line}`);
          if (sentTurn && /^Tutor:/.test(line)) sawTutorReply = true;
        }
      }
    }

    // The text fallback (F2's `TextFallback`) only renders once the
    // control cluster does — i.e. `startControl === 'active'` — so send
    // the turn the first time its input box is on the page, rather than
    // waiting on `listening` specifically (a local-server session can
    // briefly show `connecting` first).
    if (!sentTurn) {
      const input = page.getByRole('textbox');
      if ((await input.count()) > 0) {
        log(`Sending learner turn via text fallback: "${LEARNER_TEXT}"`);
        await input.first().fill(LEARNER_TEXT);
        await input.first().press('Enter');
        sentTurn = true;
        await shot(page, `state-${String(shotCount++).padStart(2, '0')}-sent-turn`);
      }
    }

    if (process.env.AUDIBLE_PROBE_VERBOSE) {
      const probeNow = await page.evaluate(() => window.__sottoAudioProbe);
      log(`probe: ${JSON.stringify(probeNow)}`);
    }

    // Stop once the tutor has replied to our turn and settled back to a
    // non-thinking/speaking state — gives playback time to actually be
    // scheduled before reading the probe.
    if (sawTutorReply && (lastState === 'listening' || lastState === 'muted')) break;

    await page.waitForTimeout(500);
  }

  const probe = await page.evaluate(() => window.__sottoAudioProbe);
  await shot(page, 'state-99-final');
  await context.close();

  console.log('\n===== Timeline =====');
  for (const e of timeline) console.log(`  [t+${e.t.toFixed(1)}s] ${e.kind}: ${e.value}`);
  console.log('\n===== Audio probe =====');
  console.log(`  ${JSON.stringify(probe)}`);

  const learnerLine = timeline.find(
    (e) => e.kind === 'caption' && e.value.startsWith('You:') && e.value.includes('Provence'),
  );
  const tutorLines = timeline.filter((e) => e.kind === 'caption' && e.value.startsWith('Tutor:'));
  const lastTutorReply = tutorLines.at(-1)?.value.replace(/^Tutor:\s*/, '') ?? '';
  // Grounding/language/question-shape are judged by reading the text (the
  // card's own instruction — "judge grounding by reading it"); this is
  // just a mechanical substring/shape check to report alongside it.
  const mentionsPlace = /provence/i.test(lastTutorReply);
  const endsWithQuestion = /\?\s*$/.test(lastTutorReply.trim());

  const results = {
    'learner turn ("...Provence...") rendered in the transcript': !!learnerLine,
    'a tutor reply rendered in the transcript': tutorLines.length > 0,
    'AudioBufferSourceNode.start() was called at least once': probe.started > 0,
    'at least one sample was actually scheduled': probe.totalSamples > 0,
    'reply mentions Provence (mechanical substring check)': mentionsPlace,
    'reply ends with a question (discuss-mode follow-up)': endsWithQuestion,
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
  console.log(
    `\nLast tutor reply (read this to judge grounding/language yourself): "${lastTutorReply}"`,
  );
  console.log(`Mode: local cascade (apps/server on ${SERVER_URL}), driven via text fallback`);
  console.log(`Screenshots: ${OUT_DIR}`);

  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[audible-probe] FAILED:', err);
  process.exit(1);
});
