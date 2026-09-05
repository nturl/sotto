#!/usr/bin/env node
/**
 * Live-voice e2e (WS-6 task 4; BRIEF criteria 5/8/9/30 evidence): drives the
 * real web app against the real local stack (whisper.cpp :9001, Qwen3.6
 * :8080, Kokoro :8880 through apps/server on :8790 — CONTRACTS §5) with a
 * Chromium fake microphone fed a Kokoro-synthesized learner utterance,
 * asserting the tutor actually hears it, explains a word, and saves it.
 *
 * Two phases, not one continuous recording. The brief's original spec was a
 * single wav — utterance 1, 3s of silence, utterance 2 — played into one
 * session. On this machine that measured a genuine ~27-30s per turn
 * (`thinking` alone ran ~15-17s: llama-server prompt eval, not the model
 * "thinking" — see the cache_prompt fix in apps/server/src/voice/llm.ts),
 * so a 3s gap landed utterance 2 mid-`thinking`, where it's dropped (not
 * queued for a next turn) — confirmed by two runs against the real stack.
 * Chromium's `--use-file-for-fake-audio-capture` is a browser-launch flag,
 * fixed for the process's lifetime and looping once the file ends, so
 * there's no way to hand it a second file mid-session either. Two
 * sequential phases sidesteps both problems: each is its own Chromium
 * launch with its own single-utterance (+ short trailing silence, for VAD
 * end-of-speech) wav, connecting a fresh voice session to the same book.
 * They share one `--user-data-dir` (a Playwright persistent context) so the
 * IndexedDB profile — onboarding, and phase A's outcome — carries into
 * phase B, and phase B's save is checked in the same persisted store.
 *
 * Learner audio: Kokoro TTS (voice ef_dora, lang_code e), Spanish:
 * phase A "¿Qué significa la palabra cigarra?", phase B "Guarda la palabra
 * cigarra.", each rendered as its own 16-bit/48kHz mono wav via ffmpeg
 * (Chromium's --use-file-for-fake-audio-capture wants exactly that format).
 *
 * Usage: BASE_URL=http://localhost:8081 node apps/client/e2e/voice-live.mjs
 * (BASE_URL must be a dev server with EXPO_PUBLIC_VOICE unset/"local" — the
 * default — so the voice screen uses LocalCascadeProvider, not the fake
 * transport; `pnpm e2e:voice` wires that up.)
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
const PROFILE_DIR = path.join(CACHE_DIR, 'voice-live-profile');
const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/web');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8081';
const TTS_URL = process.env.SOTTO_TTS_URL ?? 'http://127.0.0.1:8880/v1';
const BOOK_ID = 'es-fabulas-samaniego';
const PHASE_TIMEOUT_MS = 75_000;
const TRAILING_SILENCE_MS = 1500;
const TARGET_WORD = 'cigarra';

mkdirSync(CACHE_DIR, { recursive: true });

const t0 = Date.now();
function log(...args) {
  console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);
}

// ---- Kokoro TTS -> ffmpeg: one fake-mic wav per phase (utterance + a short
//      trailing silence so energy VAD reliably closes the turn) ----

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

// ---- Preferences seed (learning es-419, explaining en) ----

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

async function readVocabulary(page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('keyval-store', 1);
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!db.objectStoreNames.contains('keyval')) return [];
    const tx = db.transaction('keyval', 'readonly');
    const raw = await new Promise((resolve, reject) => {
      const getReq = tx.objectStore('keyval').get('sotto.vocabulary');
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    });
    db.close();
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
}

// ---- One phase: launch Chromium with a given fake-mic wav, open the voice
//      screen, poll captions/state until the timeout or a stop condition ----

async function runPhase({ name, wavPath, seed, stopWhen, timeoutMs }) {
  log(`--- Phase ${name}: launching Chromium (fake mic = ${path.basename(wavPath)}) ---`);
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    viewport: { width: 430, height: 852 },
    permissions: ['microphone'],
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${wavPath}`,
    ],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  if (seed) await seedProfile(page);

  log(`Phase ${name}: navigating to /voice/${BOOK_ID}`);
  await page.goto(`${BASE_URL}/voice/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });

  const timeline = [];
  const statesSeen = [];
  let lastCaptionsKey = '';
  let lastState = '';

  const deadline = Date.now() + timeoutMs;
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
      log(`[${name}] state -> ${lastState}`);
    }

    const captionsKey = snapshot.captionLines.join('|');
    if (captionsKey && captionsKey !== lastCaptionsKey) {
      lastCaptionsKey = captionsKey;
      for (const line of snapshot.captionLines) {
        const already = timeline.some((e) => e.kind === 'caption' && e.value === line);
        if (!already) {
          timeline.push({ t: (Date.now() - t0) / 1000, kind: 'caption', value: line });
          log(`[${name}] caption: ${line}`);
        }
      }
    }

    if (await stopWhen({ page, timeline, statesSeen })) {
      log(`Phase ${name}: stop condition met.`);
      break;
    }

    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: path.join(OUT_DIR, `voice-live-${name}-final.png`) });
  const vocabAfter = await readVocabulary(page);

  await context.close();

  return { timeline, statesSeen, pageErrors, vocabAfter };
}

async function main() {
  log('Synthesizing phase A wav (explain): "¿Qué significa la palabra cigarra?"');
  const wavA = await buildUtteranceWav('¿Qué significa la palabra cigarra?', 'phase-a');
  log('Synthesizing phase B wav (save): "Guarda la palabra cigarra."');
  const wavB = await buildUtteranceWav('Guarda la palabra cigarra.', 'phase-b');

  const phaseA = await runPhase({
    name: 'A-explain',
    wavPath: wavA,
    seed: true,
    timeoutMs: PHASE_TIMEOUT_MS,
    stopWhen: async ({ timeline }) =>
      timeline.some((e) => e.kind === 'caption' && /^Tutor:/.test(e.value)) &&
      timeline.some((e) => e.kind === 'state' && e.value === 'listening' && e.t > timeline[0].t),
  });

  const phaseB = await runPhase({
    name: 'B-save',
    wavPath: wavB,
    seed: false,
    timeoutMs: PHASE_TIMEOUT_MS,
    stopWhen: async ({ page, timeline }) => {
      const hasTutorReply = timeline.some((e) => e.kind === 'caption' && /^Tutor:/.test(e.value));
      if (!hasTutorReply) return false;
      const vocab = await readVocabulary(page);
      return vocab.some((w) =>
        (w.normalizedWord ?? w.sourceWord ?? '').toLowerCase().includes(TARGET_WORD),
      );
    },
  });

  const fullTimeline = [...phaseA.timeline, ...phaseB.timeline].sort((a, b) => a.t - b.t);
  const pageErrors = [...phaseA.pageErrors, ...phaseB.pageErrors];

  const sawLearnerCigarraA = phaseA.timeline.some(
    (e) =>
      e.kind === 'caption' && /^You:/.test(e.value) && e.value.toLowerCase().includes(TARGET_WORD),
  );
  const sawTutorCaptionA = phaseA.timeline.some(
    (e) => e.kind === 'caption' && /^Tutor:/.test(e.value),
  );
  const cycleSeenA = ['listening', 'thinking', 'speaking'].every((s) =>
    phaseA.statesSeen.includes(s),
  );

  const sawLearnerSaveB = phaseB.timeline.some(
    (e) =>
      e.kind === 'caption' && /^You:/.test(e.value) && e.value.toLowerCase().includes(TARGET_WORD),
  );
  const sawSavedWord = phaseB.vocabAfter.some((w) =>
    (w.normalizedWord ?? w.sourceWord ?? '').toLowerCase().includes(TARGET_WORD),
  );

  console.log('\n===== Full timeline (both phases) =====');
  for (const e of fullTimeline) console.log(`  [t+${e.t.toFixed(1)}s] ${e.kind}: ${e.value}`);
  console.log('\n===== States observed =====');
  console.log(`  Phase A: ${phaseA.statesSeen.join(' -> ')}`);
  console.log(`  Phase B: ${phaseB.statesSeen.join(' -> ')}`);
  console.log('\n===== Vocabulary store after phase B =====');
  console.log(
    '  ' + JSON.stringify(phaseB.vocabAfter.map((w) => w.sourceWord ?? w.normalizedWord)),
  );

  console.log('\n===== Assertions =====');
  const results = {
    'phase A: learner caption contains "cigarra"': sawLearnerCigarraA,
    'phase A: tutor caption present (word explained)': sawTutorCaptionA,
    'phase A: state cycled listening -> thinking -> speaking': cycleSeenA,
    'phase B: learner caption contains "cigarra" (save request heard)': sawLearnerSaveB,
    'phase B: saved word "cigarra" in vocabulary store': sawSavedWord,
    'no page/console errors in either phase': pageErrors.length === 0,
  };
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
    `\nFinal screenshots: ${path.join(OUT_DIR, 'voice-live-A-explain-final.png')}, ${path.join(OUT_DIR, 'voice-live-B-save-final.png')}`,
  );

  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[voice-live] FAILED:', err);
  process.exit(1);
});
