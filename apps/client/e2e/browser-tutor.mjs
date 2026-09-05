#!/usr/bin/env node
/**
 * In-browser tutor e2e (O2-B, slices 1-3). Proves the thing the whole lane
 * is for: on the STATIC export — no apps/server, no local models, nothing
 * listening on :8790 — a browser can opt into downloading the tutor models
 * and then have a full four-mode tutor turn, tool calls included, entirely
 * client-side.
 *
 * Modelled on voice-live.mjs, with three differences:
 *  - it serves `apps/client/dist` (the static export) instead of the dev
 *    server, so `/health` genuinely 404s and the capability gate has to
 *    choose the browser path on its own;
 *  - Chromium is launched with `--enable-unsafe-webgpu --use-angle=metal`
 *    alongside the fake-mic flags. If WebGPU does not come up, the worker
 *    falls back to wasm by itself (STT only — WebLLM has no wasm path) and
 *    this script says so in the log header rather than pretending;
 *  - it drives the download panel (a real tap on "Download tutor models")
 *    before opening the session, because models are NEVER fetched
 *    automatically.
 *
 * One deliberate piece of stagecraft. `contentApi.serverUrl()` treats any
 * localhost origin as "dev" and points BOTH content and /health at
 * http://localhost:8790 — and this machine really is running apps/server
 * there (the overnight stack), so a plain localhost run would quietly
 * re-test the LocalCascadeProvider path this lane exists to make
 * unnecessary. The obvious fix, reaching the static host under a non-
 * localhost name, costs the secure context that WebGPU and the Cache API
 * both require (`--unsafely-treat-insecure-origin-as-secure` was tried and
 * did not restore it: isSecureContext stayed false, navigator.gpu vanished).
 *
 * So the run stays on localhost and blocks exactly one route at the browser
 * level: `:8790/health`. That is the only signal the capability gate reads
 * from the server, and blocking it reproduces the deployed host precisely —
 * the probe fails, the gate falls through to the browser path. Content packs
 * still come over :8790, where on Vercel they come from the page's own
 * origin; same files either way, and no part of the tutor touches them.
 *
 * Slice 1 asserted a learner caption only. Slices 2-3 add: a tutor caption
 * (the LLM turn, sentence-chunked and posted back), and a tool round trip —
 * the fake mic says a SECOND utterance asking the tutor to save "cigarra",
 * and the test reads the app's own IndexedDB vocabulary store afterwards to
 * confirm the tool actually ran (not just that a caption mentioned it).
 *
 * TTS is asserted honestly, not optimistically: es-419 (this fixture's
 * learning locale) has no synthesized voice in this build — see the "HONEST
 * LABEL" note above `loadTts` in packages/voice/src/browser-cascade/
 * worker.ts and planning/BROWSER-TUTOR.md's Slice 2+3 status note — so this
 * script expects `state: speaking` to NEVER fire and fails loudly if it
 * does (that would mean the worker silently started claiming audio it
 * cannot produce for this locale, which is worse than not producing audio).
 *
 * Usage: node apps/client/e2e/browser-tutor.mjs
 *   PORT=8091          port for `npx serve dist -s`
 *   KEEP_PROFILE=1     reuse the cached models from a previous run
 *
 * Diagnostic-only flags added for the STT/LLM-contention regression
 * (docs/evidence/browser-tutor-stt-regression-2026-09-05.log). None of
 * these are set on a real session — they inject
 * `window.__SOTTO_TUTOR_DEBUG__` before the app loads, which
 * sessionManager.ts's `pickProvider` forwards into the worker's init
 * payload (protocol.ts's `WorkerInitPayload.debug`) only when present:
 *   DEBUG_SKIP_LLM=1        never load the WebLLM engine (isolate STT timing)
 *   DEBUG_STT_DEVICE=wasm   force whisper onto wasm instead of webgpu
 *   STT_ONLY=1              stop the run right after the first `stt_ms`
 *                           metric instead of waiting for the full two-turn
 *                           tool round trip — the point of these runs is
 *                           STT latency/correctness, not the whole pipeline
 */
const DEBUG_SKIP_LLM = process.env.DEBUG_SKIP_LLM === '1';
const DEBUG_STT_DEVICE = process.env.DEBUG_STT_DEVICE; // 'webgpu' | 'wasm' | undefined
const STT_ONLY = process.env.STT_ONLY === '1';
// Slice 1's original fixture (docs/evidence/browser-tutor-slice1-2026-09-05.log)
// played back a SINGLE utterance; the fake-mic wav has carried two
// utterances back-to-back (with a 2.5s silence gap) since slice 2 added the
// tool-round-trip phase. SINGLE_UTTERANCE=1 restores the slice-1 shape, to
// test whether the second utterance's presence in the file changes VAD
// segmentation of the first one.
const SINGLE_UTTERANCE = process.env.SINGLE_UTTERANCE === '1';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const PROFILE_DIR = path.join(CACHE_DIR, process.env.PROFILE_NAME ?? 'browser-tutor-profile');
const DIST = path.join(clientDir, 'dist');
const PORT = Number(process.env.PORT ?? 8091);
const BASE_URL = `http://localhost:${PORT}`;
const TTS_URL = process.env.SOTTO_TTS_URL ?? 'http://127.0.0.1:8880/v1';
const BOOK_ID = 'es-fabulas-samaniego';
/**
 * Levenshtein edit distance, for fuzzy-matching whisper-base's transcript
 * against the target words rather than requiring an exact substring. Added
 * while diagnosing slice 5 (docs/evidence/browser-tutor-slice5-2026-09-05.log):
 * whisper-base's own known imprecision on this fixture already mishears
 * "cigarra" as "cigarrara"/"cigarrera"/"cigarras" (see planning/
 * BROWSER-TUTOR.md and the slice-1/slice-4 logs) and, once the VAD fix let a
 * second utterance actually reach STT, it likewise misheard "Guarda" (save)
 * as "Cuarda" — a single-character confusion, not a different word. Per the
 * task brief: accept a fuzzy match on the target word rather than weakening
 * the assertion to "any caption", and do not touch the STT model itself.
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** True if some word-like token in `text` is within `maxDist` edits of
 * `target` (case-insensitive, accents stripped so "cigarra"/"cigarrera"/
 * "cigarras" and "guarda"/"cuarda" all compare on the same footing). */
function fuzzyIncludesWord(text, target, maxDist = 2) {
  const fold = (s) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const targetFolded = fold(target);
  const tokens = fold(text).match(/[a-z]+/g) ?? [];
  return tokens.some((tok) => levenshtein(tok, targetFolded) <= maxDist);
}

const TARGET_WORD = 'cigarra';
const UTTERANCE = '¿Qué significa la palabra cigarra?';
const TOOL_UTTERANCE = 'Por favor, guarda la palabra cigarra.';
const DOWNLOAD_TIMEOUT_MS = 300_000;
// Two learner turns, each waiting on a full LLM (and, for English, TTS)
// round trip on Qwen3 1.7B — generous budgets rather than tight ones, since
// the point of this script is to prove the pipeline works, not to be a
// latency benchmark (the `metric` lines in the log carry the real numbers).
const TUTOR_REPLY_TIMEOUT_MS = 60_000;
const TOOL_ROUND_TRIP_TIMEOUT_MS = 60_000;
const SESSION_TIMEOUT_MS = TUTOR_REPLY_TIMEOUT_MS + TOOL_ROUND_TRIP_TIMEOUT_MS + 30_000;
// Long enough that the fake-mic wav's own loop point never falls inside a
// real turn's processing window for the length of this test's session.
// Found live (docs/evidence/browser-tutor-slice5-2026-09-05.log): with a
// short trailing silence, the wav (~8-9s total) loops back to utterance 1
// while turn 2's tool-calling reply is still streaming, and the newly-added
// speech_start barge-in (mirroring the server's onSpeechStart -> bargeIn())
// correctly, but unhelpfully for this fixture, interrupts the in-flight
// turn to (re-)process the looped-back audio — truncating the very reply
// this test is waiting on. A real learner never repeats their question
// every 8 seconds, so the fix stays; the fixture's silence just needs to
// outlast SESSION_TIMEOUT_MS so the loop point is never reached again.
const TRAILING_SILENCE_MS = 180_000;
// Wide enough that turn 1 has finished replying before utterance 2 plays,
// even on the slow path this task's own fixes made correct rather than
// fast: waiting out a still-loading LLM (`llmLoadPromise` in worker.ts,
// observed taking up to ~4s on a warm-but-reused profile) plus the reply
// itself. A short gap here doesn't test "the learner interrupts mid-reply"
// (a real, separate scenario) — it just makes THIS fixture's fixed-schedule
// second utterance race worker.ts's now-correct barge-in handling, which
// hung the session waiting on a WebLLM engine call queued immediately
// behind an interrupted one (docs/evidence/
// browser-tutor-slice5-2026-09-05.log). 2.5s was fine before the LLM-load
// race was fixed (turn 1 used to fail fast instead of waiting); now that it
// waits properly, it needs more room to finish first.
const INTER_UTTERANCE_SILENCE_MS = 15_000;

mkdirSync(CACHE_DIR, { recursive: true });

const t0 = Date.now();
const lines = [];
function log(...args) {
  const line = `[t+${((Date.now() - t0) / 1000).toFixed(1)}s] ${args.join(' ')}`;
  lines.push(line);
  console.log(line);
}

// ---- Fake-mic wav (same Kokoro + ffmpeg recipe as voice-live.mjs) ----

/**
 * Chromium's fake audio device takes exactly one file at launch and loops
 * it, so both learner turns (the question, then the save-vocabulary
 * command) have to live in a single wav: synthesize each with Kokoro,
 * reformat to the fake device's expected PCM, and concatenate with silence
 * gaps long enough for the energy VAD's speech_end to fire between them.
 */
async function buildFakeMicWav(utterances, name) {
  const parts = [];
  for (const [i, text] of utterances.entries()) {
    const raw = path.join(CACHE_DIR, `${name}-${i}-raw.wav`);
    const fmt = path.join(CACHE_DIR, `${name}-${i}-fmt.wav`);
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
    await run('ffmpeg', ['-y', '-i', raw, '-ar', '48000', '-ac', '1', '-sample_fmt', 's16', fmt]);
    parts.push(fmt);

    const gapMs = i === utterances.length - 1 ? TRAILING_SILENCE_MS : INTER_UTTERANCE_SILENCE_MS;
    const silence = path.join(CACHE_DIR, `${name}-${i}-silence.wav`);
    await run('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=48000:cl=mono',
      '-t',
      String(gapMs / 1000),
      '-sample_fmt',
      's16',
      silence,
    ]);
    parts.push(silence);
  }

  const listFile = path.join(CACHE_DIR, `${name}-concat.txt`);
  const combined = path.join(CACHE_DIR, `${name}.wav`);
  writeFileSync(listFile, parts.map((f) => `file '${f}'`).join('\n'));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', combined]);
  return combined;
}

/** Reads the app's own persisted vocabulary (apps/client/src/state/
 * createStore.ts, KEYS.vocabulary = 'sotto.vocabulary') straight out of
 * IndexedDB — the only way to prove the save_vocabulary tool actually ran,
 * as opposed to the tutor merely saying it would. */
async function readVocabulary(page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('keyval-store', 1);
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
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

// ---- Static host ----

function serveDist() {
  const child = spawn('npx', ['serve', DIST, '-l', String(PORT), '-s'], {
    cwd: clientDir,
    stdio: 'ignore',
  });
  return child;
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
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
    // KEEP_PROFILE=1 reuses the profile so the model downloads don't have to
    // repeat, but it also keeps whatever the LAST run's session saved to
    // IndexedDB (apps/client/src/state/createStore.ts, KEYS.vocabulary).
    // Found live (docs/evidence/browser-tutor-slice5-2026-09-05.log): the
    // "tool round trip: cigarra saved" assertion kept passing on runs where
    // the actual save had failed, because it was reading a PREVIOUS run's
    // leftover "cigarra" entry, not proof this run's tool call worked.
    // Clearing it here keeps KEEP_PROFILE's whole point (warm model
    // caches, which live under different IndexedDB/Cache Storage entries)
    // while giving every run's own vocabulary check an honest, empty start.
    tx.objectStore('keyval').delete('sotto.vocabulary');
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, PREFERENCES);
}

async function main() {
  if (!existsSync(DIST)) {
    throw new Error(`No static export at ${DIST}. Run: pnpm --filter @sotto/client web:export`);
  }
  if (!process.env.KEEP_PROFILE) rmSync(PROFILE_DIR, { recursive: true, force: true });

  log(`Synthesizing fake-mic wav: "${UTTERANCE}" then "${TOOL_UTTERANCE}"`);
  const wav = await buildFakeMicWav(
    SINGLE_UTTERANCE ? [UTTERANCE] : [UTTERANCE, TOOL_UTTERANCE],
    'browser-tutor',
  );

  log(`Serving ${path.relative(clientDir, DIST)} on ${BASE_URL}`);
  const server = serveDist();
  try {
    if (!(await waitForServer(`http://localhost:${PORT}`)))
      throw new Error('static host never came up');

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      viewport: { width: 430, height: 852 },
      permissions: ['microphone'],
      args: [
        '--enable-unsafe-webgpu',
        '--use-angle=metal',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${wav}`,
      ],
    });
    // "There is no server": the one probe the capability gate makes.
    await context.route('**/health', (route) =>
      route.request().url().includes(':8790') ? route.abort() : route.continue(),
    );

    const page = context.pages()[0] ?? (await context.newPage());
    if (DEBUG_SKIP_LLM || DEBUG_STT_DEVICE) {
      const debug = {
        ...(DEBUG_SKIP_LLM ? { skipLlm: true } : {}),
        ...(DEBUG_STT_DEVICE ? { forceSttDevice: DEBUG_STT_DEVICE } : {}),
      };
      log(`Injecting window.__SOTTO_TUTOR_DEBUG__ = ${JSON.stringify(debug)}`);
      await context.addInitScript((d) => {
        globalThis.__SOTTO_TUTOR_DEBUG__ = d;
      }, debug);
    }
    const pageErrors = [];
    const workerLog = [];
    let sawSttMetric = false;
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('requestfailed', (req) => {
      const url = req.url();
      if (url.includes(':8790')) return; // no local server in this scenario
      pageErrors.push(`requestfailed: ${url} (${req.failure()?.errorText})`);
    });
    // Worker console/errors do not bubble to the page in Chromium.
    page.on('worker', (w) => {
      workerLog.push(`worker spawned: ${w.url()}`);
      w.on('close', () => workerLog.push(`worker closed: ${w.url()}`));
    });
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') pageErrors.push(`console.error: ${text}`);
      if (/\[sotto-tutor\]/.test(text)) {
        workerLog.push(text);
        log(text);
        if (/stt_ms=/.test(text)) sawSttMetric = true;
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // A reused profile (KEEP_PROFILE=1) keeps its service worker and shell
    // cache from whatever build last ran against it. The SW's fetch handler
    // (dist/sw.js) is cache-first for every same-origin GET that isn't
    // /content/packs/**, and /tutor/tutor-worker.js falls into that
    // catch-all — so once cached, edits to worker.ts never reach a warm
    // profile's session, silently making a real fix look like a no-op.
    // Found live while diagnosing slice 5 (docs/evidence/
    // browser-tutor-slice5-2026-09-05.log): a rebuilt worker with new debug
    // output kept producing the previous build's output on a warm profile.
    // Unregistering the worker and dropping only the shell cache (not the
    // model/content caches, which is the entire point of KEEP_PROFILE)
    // forces a fresh fetch of the app shell and the tutor worker on the
    // next navigation while leaving the expensive downloads alone.
    await page.evaluate(async () => {
      try {
        const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
        for (const r of regs) await r.unregister();
        const names = await caches.keys();
        for (const n of names) if (n.startsWith('sotto-shell-')) await caches.delete(n);
      } catch {
        // best-effort: a private window or blocked site data has neither
      }
    });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await seedProfile(page);

    const gpu = await page.evaluate(async () => {
      if (!('gpu' in navigator)) return { present: false, adapter: false };
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { present: true, adapter: false };
        const limits = {};
        for (const key in adapter.limits) limits[key] = adapter.limits[key];
        return { present: true, adapter: true, limits };
      } catch (err) {
        return { present: true, adapter: false, error: String(err) };
      }
    });
    log(`WebGPU: navigator.gpu=${gpu.present} adapter=${gpu.adapter}`);
    if (gpu.limits) log(`adapter.limits = ${JSON.stringify(gpu.limits)}`);

    // The exact probe the capability gate makes (contentApi.fetchHealth).
    const healthStatus = await page.evaluate(async () => {
      try {
        const res = await fetch('http://localhost:8790/health');
        return res.status;
      } catch {
        return 0;
      }
    });
    log(`app's /health probe -> ${healthStatus} (0 = unreachable, as on the static host)`);

    log(`Opening /voice/${BOOK_ID}`);
    await page.goto(`${BASE_URL}/voice/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });

    // ---- The opt-in. Nothing downloads until this tap. ----
    const cta = page.getByText('Download tutor models', { exact: false }).first();
    let alreadyInstalled = false;
    try {
      await cta.waitFor({ timeout: 45_000 });
    } catch (err) {
      if (process.env.KEEP_PROFILE) {
        // Re-run against a warm profile: the models are already cached, so
        // the gate goes straight to `ready` and there is no panel to tap.
        alreadyInstalled = true;
        log('Models already installed from a previous run (KEEP_PROFILE=1)');
      } else {
        const diag = await page.evaluate(async () => ({
          gpu: 'gpu' in navigator,
          cachesType: typeof caches,
          cacheNames: typeof caches === 'undefined' ? null : await caches.keys(),
          health: await fetch('http://localhost:8790/health')
            .then((r) => r.status)
            .catch(() => 0),
          secure: globalThis.isSecureContext,
        }));
        log('diag: ' + JSON.stringify(diag));
        log('Download CTA never appeared. Screen text was:');
        log((await page.evaluate(() => document.body.innerText)).replace(/\n/g, ' | '));
        throw err;
      }
    }
    if (!alreadyInstalled) log('Download panel is showing; tapping "Download tutor models"');
    const bodyBefore = await page.evaluate(() => document.body.innerText);
    const sizeMatch = alreadyInstalled ? ['', 'cached'] : /about (\d+) MB/.exec(bodyBefore);
    if (!alreadyInstalled) {
      log(`Panel states the download size: ${sizeMatch ? `${sizeMatch[1]} MB` : 'NOT SHOWN'}`);
      await cta.click();
    }

    const downloadStart = Date.now();
    let downloaded = alreadyInstalled;
    let lastReport = 0;
    while (!downloaded && Date.now() - downloadStart < DOWNLOAD_TIMEOUT_MS) {
      const body = await page.evaluate(() => document.body.innerText);
      if (!/Download tutor models|Downloading/.test(body)) {
        downloaded = true;
        break;
      }
      if (Date.now() - lastReport > 15_000) {
        lastReport = Date.now();
        const cacheState = await page.evaluate(async () => {
          const names = await caches.keys();
          const out = {};
          for (const n of names) out[n] = (await (await caches.open(n)).keys()).length;
          return out;
        });
        log(`  …downloading; caches=${JSON.stringify(cacheState)}`);
        if (/did not finish/i.test(body)) {
          log('  panel reported a failure:');
          log('  ' + body.split('\n').slice(-4).join(' | '));
          break;
        }
      }
      await page.waitForTimeout(1000);
    }
    log(
      `Model download ${downloaded ? 'finished' : 'DID NOT FINISH'} after ` +
        `${((Date.now() - downloadStart) / 1000).toFixed(1)}s`,
    );

    // ---- The session. Reload so the gate re-runs cleanly from cache. ----
    await page.goto(`${BASE_URL}/voice/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });

    const timeline = [];
    const statesSeen = [];
    let lastState = '';
    let lastCaptions = '';
    const deadline = Date.now() + SESSION_TIMEOUT_MS;
    let sawLearnerCaption = false; // phase A: "¿Qué significa la palabra cigarra?"
    let sawToolLearnerCaption = false; // phase C: "Guarda la palabra cigarra."
    // A "turn" completes when the worker returns to `listening` after having
    // been `thinking` — the same signal `TutorTurnRunner.run()` ends on
    // (llm-turn.ts). Turn 1 = the question answered; turn 2 = the save
    // command relayed through the tool round trip and acknowledged.
    let turnsCompleted = 0;
    let sawThinkingThisTurn = false;

    while (Date.now() < deadline) {
      const snapshot = await page.evaluate(() => {
        const body = document.body.innerText;
        const stateRe =
          /^(idle|connecting|listening|thinking|speaking|paused|muted|reconnecting|ended|error)$/im;
        const rows = body
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        return {
          stateLine: rows.find((l) => stateRe.test(l)) ?? '',
          captionLines: rows.filter((l) => /^(You|Tutor):/.test(l)),
        };
      });

      if (snapshot.stateLine && snapshot.stateLine !== lastState) {
        lastState = snapshot.stateLine;
        statesSeen.push(lastState);
        log(`state -> ${lastState}`);
        if (lastState === 'thinking') sawThinkingThisTurn = true;
        if (lastState === 'listening' && sawThinkingThisTurn) {
          sawThinkingThisTurn = false;
          turnsCompleted += 1;
          log(`turn ${turnsCompleted} complete (state returned to listening)`);
        }
      }
      const key = snapshot.captionLines.join('|');
      if (key && key !== lastCaptions) {
        lastCaptions = key;
        for (const line of snapshot.captionLines) {
          if (!timeline.includes(line)) {
            timeline.push(line);
            log(`caption: ${line}`);
          }
        }
      }
      sawLearnerCaption ||= timeline.some(
        (l) => /^You:/.test(l) && fuzzyIncludesWord(l, TARGET_WORD),
      );
      sawToolLearnerCaption ||= timeline.some(
        (l) =>
          /^You:/.test(l) && fuzzyIncludesWord(l, 'guarda') && fuzzyIncludesWord(l, TARGET_WORD),
      );
      // Phase A done, tutor answered (turn 1), the save command was heard,
      // and the tool round trip's turn (2) has also completed.
      if (sawLearnerCaption && sawToolLearnerCaption && turnsCompleted >= 2) break;
      if (STT_ONLY && sawSttMetric) {
        // Give the caption — and, if a wasm fallback reload triggers, its
        // retry — a moment to land before we snapshot and exit. Extendable
        // for diagnostics that need to observe the reactive fallback path.
        await page.waitForTimeout(Number(process.env.STT_ONLY_WAIT_MS ?? 1000));
        const finalSnapshot = await page.evaluate(() =>
          document.body.innerText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => /^(You|Tutor):/.test(l)),
        );
        for (const line of finalSnapshot) {
          if (!timeline.includes(line)) {
            timeline.push(line);
            log(`caption: ${line}`);
          }
        }
        log('STT_ONLY=1: stopping right after the first stt_ms metric');
        break;
      }
      await page.waitForTimeout(400);
    }

    const sawTutorCaption = timeline.some((l) => /^Tutor:/.test(l));
    const sawSpeakingState = statesSeen.includes('speaking');
    const vocabulary = await readVocabulary(page).catch((err) => {
      log(`readVocabulary failed: ${err.message}`);
      return [];
    });
    // SavedWord shape: packages/core/src/models.ts — `sourceWord`/
    // `normalizedWord`, not `word`.
    const savedCigarra = Array.isArray(vocabulary)
      ? vocabulary.some(
          (w) =>
            typeof w === 'object' &&
            w &&
            (String(w.sourceWord ?? '')
              .toLowerCase()
              .includes(TARGET_WORD) ||
              String(w.normalizedWord ?? '')
                .toLowerCase()
                .includes(TARGET_WORD)),
        )
      : false;
    log(`vocabulary store: ${JSON.stringify(vocabulary)}`);

    mkdirSync(path.resolve(clientDir, '../../docs/screenshots/web'), { recursive: true });
    await page.screenshot({
      path: path.resolve(clientDir, '../../docs/screenshots/web/browser-tutor-final.png'),
    });

    await context.close();

    console.log('\n===== Worker/console lines of interest =====');
    for (const l of workerLog.slice(0, 80)) console.log('  ' + l);

    console.log('\n===== States observed =====');
    console.log('  ' + statesSeen.join(' -> '));

    console.log('\n===== Assertions =====');
    const results = {
      'static host: /health unreachable (no server anywhere)': healthStatus !== 200,
      'download panel offered the models with a size, never automatically': !!sizeMatch,
      'models downloaded on the explicit tap': downloaded,
      [`learner caption contains "${TARGET_WORD}"`]: sawLearnerCaption,
      'state cycled listening -> thinking': ['listening', 'thinking'].every((s) =>
        statesSeen.includes(s),
      ),
      'tutor caption (final) within the reply budget': sawTutorCaption && turnsCompleted >= 1,
      // Honest, not optimistic: es-419 has no synthesized voice in this
      // build (verified — see planning/BROWSER-TUTOR.md's Slice 2+3 status
      // note and worker.ts's HONEST LABEL comment above `loadTts`), so
      // `speaking` must NEVER fire for this fixture. If it does, the worker
      // is claiming audio it cannot produce for es-419, which is worse than
      // the current text-only fallback.
      'no false "speaking" state for es-419 (TTS is English-only; verified, not unattempted)':
        !sawSpeakingState,
      '"Guarda la palabra cigarra" heard as a learner caption': sawToolLearnerCaption,
      'tool round trip: cigarra actually saved to the vocabulary store': savedCigarra,
    };
    let allPass = true;
    for (const [name, ok] of Object.entries(results)) {
      console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`);
      if (!ok) allPass = false;
    }
    if (pageErrors.length) {
      console.log('\n  Page/console errors:');
      console.log(
        '  (the "Failed to load resource: net::ERR_FAILED" lines are the' +
          ' deliberately blocked :8790/health probes — see the header)',
      );
      for (const e of pageErrors.slice(0, 20)) console.log('    -', e);
    }
    if (!allPass) process.exitCode = 1;
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('[browser-tutor] FAILED:', err);
  process.exit(1);
});
