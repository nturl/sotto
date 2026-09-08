#!/usr/bin/env node
/**
 * discuss-quality.mjs — run 9's acceptance probe (planning/run9/cards/
 * E-acceptance-probe.md).
 *
 * Every existing browser probe in this repo checks that the tutor pipeline
 * MOVES: browser-tutor.mjs asserts captions appear and states cycle,
 * audible-probe.mjs asserts a non-zero number of samples reached Web Audio.
 * None of them can see the failure Noel actually reported — a one-word
 * hallucinated learner caption, a five-line markdown-ish reply, and spoken
 * audio that was gibberish. This script asserts QUALITY instead of motion:
 *
 *   1. the learner caption really contains what was spoken;
 *   2. the tutor's reply obeys the contract prompt.ts asks for (prose, at
 *      most three sentences, ending in a question);
 *   3. the audio the app SCHEDULED FOR PLAYBACK, re-transcribed by Whisper
 *      in Node, matches the caption the screen showed (word error rate
 *      <= 0.35). That is the only assertion in the repo that can tell
 *      "spoke the words" from "made a noise".
 *
 * Two scenarios, both on the static export with no server anywhere, so the
 * capability gate has to pick the browser cascade:
 *   (a) mic  — a `say`-synthesized WAV of "Tell me more about the gray husky
 *              dog." on Chromium's fake capture device, driven through
 *              push-to-talk;
 *   (b) text — the same sentence through `TextFallback`, which calls the
 *              same `sessionManager.sendText()` a transcribed utterance
 *              would. This one isolates LLM + TTS from STT, so it still
 *              produces evidence when the fake mic delivers nothing (which
 *              audible-probe.mjs saw happen once in this environment).
 *
 * Both scenarios run in ONE browser session, in order, so the ~1.2 GB of
 * weights load once. Scenario (a) leaves the worker in push-to-talk mode
 * (worker.ts's `case 'ptt'` sets `turnMode = 'push'`, which makes
 * `handleFrame` buffer instead of running the VAD), so the looping fake-mic
 * file cannot barge in on scenario (b).
 *
 * WHY PUSH-TO-TALK, AND WHY THE HOLD IS LONG. Chromium's
 * `--use-file-for-fake-audio-capture` starts playing at browser launch and
 * LOOPS forever; nothing tells the test where in the file the device
 * currently is. A short, well-aimed press would be a coin flip. Holding for
 * longer than one full loop of the fixture guarantees at least one complete
 * utterance is inside the buffered segment. The cost is that this run does
 * NOT exercise the "press, then speak" pre-roll path (PLAN.md diagnosis 1's
 * "`ptt active` clears the pre-roll so the first syllables are lost") — see
 * the report.
 *
 * Usage:
 *   node apps/client/e2e/discuss-quality.mjs
 * Env:
 *   PORT=8095            port for the static host it starts itself
 *   PROFILE_NAME=...      Chromium profile under e2e/.cache (weights cache)
 *   FRESH_PROFILE=1       delete the profile first (forces a full download)
 *   OUT_DIR=...           where the WAVs and the log go
 *   SKIP_SELFTEST=1       skip the known-good-WAV check of the WER scorer
 *   SCENARIOS=a,b         which scenarios to run (default both)
 */
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { readWavAsFloat32, resample, signalStats, writeWavInt16 } from './lib/wav.mjs';
import { wordErrorRate } from './lib/wer.mjs';

const run = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const PROFILE_DIR = path.join(CACHE_DIR, process.env.PROFILE_NAME ?? 'discuss-quality-profile');
// Whisper-in-Node's own weights, kept out of the repo and out of the
// browser profile (different runtime, different files).
const HF_CACHE = path.join(CACHE_DIR, 'hf-node');
const DIST = path.join(clientDir, 'dist');
const PORT = Number(process.env.PORT ?? 8095);
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = process.env.OUT_DIR ?? path.join(os.homedir(), 'Claude/sotto-run9/E');
const BOOK_ID = 'en-london-build-a-fire';
const UTTERANCE = 'Tell me more about the gray husky dog.';
const SCENARIOS = (process.env.SCENARIOS ?? 'a,b').split(',').map((s) => s.trim());

// Fixture geometry. The fake device loops [utterance + tail]; the hold has
// to outlast one whole loop for the buffered segment to be sure to contain
// a complete utterance.
const FIXTURE_TAIL_MS = 2500;
const PTT_HOLD_MS = Number(process.env.PTT_HOLD_MS ?? 11_000);

const DOWNLOAD_TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS ?? 900_000);
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 180_000);
// How long after the last audio chunk we call the utterance finished.
const AUDIO_SETTLE_MS = 6_000;

const WER_GATE = 0.35;
const SELFTEST_WER_GATE = 0.2;
const MIN_AUDIO_SECONDS = 1;
const MIN_RMS = 0.005;
const MAX_SENTENCES = 3;

mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const t0 = Date.now();
const logLines = [];
function log(...args) {
  const line = `[t+${((Date.now() - t0) / 1000).toFixed(1)}s] ${args.join(' ')}`;
  logLines.push(line);
  console.log(line);
}

// ---------------------------------------------------------------- helpers

/** Sentence count, counting a trailing fragment with no terminator too. */
function countSentences(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return 0;
  const parts = trimmed
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length;
}

/**
 * Markdown/emoji markup the tutor must never emit, because every line of it
 * is read aloud verbatim by `speakSentence`. Bullets and headers are only
 * flagged at the start of a line (a hyphen inside "twenty-five" is prose);
 * `*`, `_` pairs and `#` are flagged anywhere.
 */
function markupFindings(text) {
  const found = [];
  const s = String(text ?? '');
  if (/(^|\n)\s*[-*+•]\s+/.test(s)) found.push('list bullet at line start');
  if (/(^|\n)\s*#{1,6}\s+/.test(s)) found.push('markdown header');
  if (/(^|\n)\s*\d+[.)]\s+/.test(s)) found.push('numbered list');
  if (/\*/.test(s)) found.push('asterisk');
  if (/(^|\s)_[^_]+_(\s|$)/.test(s)) found.push('underscore emphasis');
  if (/#/.test(s)) found.push('hash');
  if (/`/.test(s)) found.push('backtick');
  if (/\p{Extended_Pictographic}/u.test(s)) found.push('emoji');
  return found;
}

function mentionsDog(text) {
  return /\b(dog|husky|animal|wolf)\b/i.test(String(text ?? ''));
}

// ------------------------------------------------- fake-mic wav via `say`

/**
 * Card's recipe: `say` for the fixture (not the Kokoro server browser-tutor.mjs
 * uses — this probe must run with nothing but the repo and a Mac). AIFF out
 * of `say`, `afconvert` to the fake device's expected 48 kHz mono s16, then
 * ffmpeg to append the silent tail that gives the VAD/buffer a loop gap.
 */
async function sayToWav(text, outWav, sampleRate, voice = 'Samantha') {
  const aiff = `${outWav}.aiff`;
  await run('say', ['-v', voice, '-o', aiff, text]);
  await run('afconvert', ['-f', 'WAVE', '-d', `LEI16@${sampleRate}`, '-c', '1', aiff, outWav]);
  return outWav;
}

async function buildFakeMicWav() {
  const speech = path.join(CACHE_DIR, 'discuss-quality-speech-48k.wav');
  await sayToWav(UTTERANCE, speech, 48000);
  const silence = path.join(CACHE_DIR, 'discuss-quality-silence.wav');
  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=mono',
    '-t',
    String(FIXTURE_TAIL_MS / 1000),
    '-sample_fmt',
    's16',
    silence,
  ]);
  const listFile = path.join(CACHE_DIR, 'discuss-quality-concat.txt');
  const combined = path.join(CACHE_DIR, 'discuss-quality-mic.wav');
  writeFileSync(listFile, [speech, silence].map((f) => `file '${f}'`).join('\n'));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', combined]);
  const { samples, sampleRate } = readWavAsFloat32(combined);
  const loopMs = (samples.length / sampleRate) * 1000;
  log(`fake-mic fixture: ${combined} (${loopMs.toFixed(0)} ms loop, hold is ${PTT_HOLD_MS} ms)`);
  return { wav: combined, loopMs };
}

// ------------------------------------------------------ whisper in Node

let asrPromise = null;
/**
 * The round-trip scorer's ear. @huggingface/transformers lives in
 * packages/voice's node_modules (it is that package's dependency, not
 * apps/client's), so it is resolved from there explicitly rather than by
 * bare specifier, which Node would look for under apps/client.
 */
async function getAsr() {
  if (asrPromise) return asrPromise;
  asrPromise = (async () => {
    const voicePkg = path.resolve(clientDir, '../../packages/voice/package.json');
    const requireFromVoice = createRequire(voicePkg);
    const entry = requireFromVoice.resolve('@huggingface/transformers');
    const tf = requireFromVoice(entry);
    mkdirSync(HF_CACHE, { recursive: true });
    tf.env.cacheDir = HF_CACHE;
    tf.env.allowLocalModels = false;
    const started = Date.now();
    const pipe = await tf.pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
      dtype: 'fp32',
      device: 'cpu',
    });
    log(`whisper-base (node, cpu) loaded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return pipe;
  })();
  return asrPromise;
}

/** Transcribes a 16-bit mono WAV of any rate by resampling to whisper's 16 kHz. */
async function transcribeWav(wavPath) {
  const asr = await getAsr();
  const { samples, sampleRate } = readWavAsFloat32(wavPath);
  const audio = resample(samples, sampleRate, 16000);
  const result = await asr(audio, { task: 'transcribe', language: 'en', no_repeat_ngram_size: 3 });
  const text = Array.isArray(result) ? (result[0]?.text ?? '') : (result?.text ?? '');
  return text.trim();
}

// -------------------------------------------------------- the static host

function serveDist() {
  return spawn('node', [path.join(clientDir, 'scripts/serve-static.mjs'), String(PORT)], {
    cwd: clientDir,
    stdio: 'ignore',
  });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ------------------------------------------------- in-page instrumentation

/**
 * Two taps, injected before any app code runs.
 *
 * `Worker` — every worker->main message is recorded with a timestamp, which
 * is where the captions (with their `final` flag), the state transitions and
 * the `metric` lines all live in structured form. Reading them here instead
 * of scraping `document.body.innerText` means a re-styled Transcript cannot
 * silently change what this probe believes the tutor said.
 *
 * `AudioContext.createBufferSource` — the audio evidence is taken at the
 * PLAYBACK boundary (web-audio.ts's `playPcm` builds an AudioBuffer and
 * calls `source.start()`), not at the worker boundary, so what gets written
 * to disk is what the learner's speakers were actually asked to play.
 * audible-probe.mjs wraps the same call to COUNT samples; this keeps them.
 */
const INSTRUMENT = `
window.__sotto = {
  t0: Date.now(),
  messages: [],
  audio: [],
  captureRate: 0,
  micFrames: 0,
  micSamples: 0,
};
window.__sottoMark = (label) => {
  window.__sotto.messages.push({ at: Date.now() - window.__sotto.t0, t: 'MARK', label });
  window.__sotto.audio.length = 0;
};
const OrigWorker = window.Worker;
window.Worker = class extends OrigWorker {
  constructor(url, opts) {
    super(url, opts);
    this.addEventListener('message', (ev) => {
      const d = ev.data;
      if (!d || typeof d !== 'object') return;
      const rec = { at: Date.now() - window.__sotto.t0, t: d.t };
      if (d.t === 'caption') { rec.speaker = d.speaker; rec.text = d.text; rec.final = d.final; }
      else if (d.t === 'state') rec.state = d.state;
      else if (d.t === 'metric') { rec.name = d.name; rec.ms = d.ms; rec.detail = d.detail; }
      else if (d.t === 'error') { rec.code = d.code; rec.message = d.message; }
      else if (d.t === 'audio') { rec.bytes = d.pcm?.byteLength ?? 0; rec.sampleRate = d.sampleRate; }
      else if (d.t === 'audio_start' || d.t === 'audio_end') rec.utteranceId = d.utteranceId;
      else if (d.t === 'ready') rec.stages = d.stages;
      else if (d.t === 'tool_call') rec.name = d.name;
      else if (d.t === 'progress') return; // far too chatty to keep
      window.__sotto.messages.push(rec);
    });
  }
};
const OrigCtx = window.AudioContext;
window.AudioContext = class extends OrigCtx {
  createBufferSource() {
    const src = super.createBufferSource();
    const origStart = src.start.bind(src);
    src.start = (...args) => {
      const buf = src.buffer;
      if (buf) {
        window.__sotto.audio.push({
          at: Date.now() - window.__sotto.t0,
          sampleRate: buf.sampleRate,
          data: Array.from(buf.getChannelData(0)),
        });
      }
      return origStart(...args);
    };
    return src;
  }
};
// Does the fake capture device deliver anything at all? web-audio.ts's
// capture worklet posts every downsampled frame back over its port; counting
// them here answers the question audible-probe.mjs could only guess at.
const OrigNode = window.AudioWorkletNode;
if (OrigNode) {
  window.AudioWorkletNode = class extends OrigNode {
    constructor(ctx, name, opts) {
      super(ctx, name, opts);
      if (name === 'capture-processor') {
        window.__sotto.captureRate = ctx.sampleRate;
        this.port.addEventListener('message', (ev) => {
          window.__sotto.micFrames++;
          window.__sotto.micSamples += (ev.data?.byteLength ?? 0) / 2;
        });
      }
    }
  };
}
`;

const PREFERENCES = {
  interfaceLocale: 'en',
  explanationLocale: 'en',
  learningLocale: 'en-US',
  level: 'B1',
  immersionMode: false,
  defaultTutorMode: 'discuss',
  captionsEnabled: true,
  // Scenario (a) drives the mic through the hold-to-talk ring, which
  // ControlCluster.tsx only renders when this is 'push'.
  turnDetection: 'push',
  correctionFrequency: 'normal',
  speakingPace: 'normal',
  narrationSpeed: 1,
  onboarded: true,
  tutorModelTier: 'standard',
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

async function readMessages(page, since) {
  return page.evaluate((n) => window.__sotto.messages.slice(n), since);
}

/** Pulls the buffered playback audio out of the page as base64 Int16. */
async function drainAudio(page) {
  return page.evaluate(() => {
    const chunks = window.__sotto.audio.splice(0);
    if (chunks.length === 0) return { sampleRate: 0, base64: '', chunks: 0 };
    const sampleRate = chunks[0].sampleRate;
    const total = chunks.reduce((n, c) => n + c.data.length, 0);
    const out = new Int16Array(total);
    let nan = 0;
    let i = 0;
    for (const c of chunks) {
      for (const v of c.data) {
        if (!Number.isFinite(v)) {
          nan++;
          out[i++] = 0;
          continue;
        }
        const clamped = Math.max(-1, Math.min(1, v));
        out[i++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      }
    }
    const bytes = new Uint8Array(out.buffer);
    let binary = '';
    for (let k = 0; k < bytes.length; k += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
    }
    return { sampleRate, base64: window.btoa(binary), chunks: chunks.length, nanInFloat: nan };
  });
}

/**
 * Waits for a tutor turn to finish: a `caption` with speaker 'tutor' and
 * `final: true`, then a quiet period with no new audio chunk. Returns
 * whatever it saw even on timeout — this probe reports, it does not abort.
 */
async function waitForTurn(page, since, label) {
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  let lastAudioAt = 0;
  let sawFinalAt = 0;
  let sawFinal = false;
  let seen = since;
  const collected = [];
  while (Date.now() < deadline) {
    const fresh = await readMessages(page, seen);
    seen += fresh.length;
    for (const m of fresh) {
      collected.push(m);
      if (m.t === 'state') log(`  [${label}] state -> ${m.state} (@${(m.at / 1000).toFixed(1)}s)`);
      else if (m.t === 'caption')
        log(`  [${label}] caption ${m.speaker}${m.final ? ' (final)' : ''}: ${m.text}`);
      else if (m.t === 'metric') log(`  [${label}] metric ${m.name}=${m.ms} ${m.detail ?? ''}`);
      else if (m.t === 'error') log(`  [${label}] worker error ${m.code}: ${m.message}`);
      else if (m.t === 'audio') lastAudioAt = Date.now();
      if (m.t === 'caption' && m.speaker === 'tutor' && m.final && !sawFinal) {
        sawFinal = true;
        sawFinalAt = Date.now();
      }
    }
    // Done once the final caption has landed AND nothing new has been
    // spoken for a settle window — so a caption-only turn (no TTS at all,
    // which is itself a finding) ends after the same grace period instead
    // of burning the whole timeout.
    if (sawFinal && Date.now() - Math.max(lastAudioAt, sawFinalAt) > AUDIO_SETTLE_MS) break;
    await page.waitForTimeout(400);
  }
  return { messages: collected, seen, sawFinal };
}

// -------------------------------------------------------------- scenarios

function summarizeTurn(messages) {
  const learner = messages.filter((m) => m.t === 'caption' && m.speaker === 'learner');
  const tutorFinal = messages.filter((m) => m.t === 'caption' && m.speaker === 'tutor' && m.final);
  const tutorInterim = messages.filter(
    (m) => m.t === 'caption' && m.speaker === 'tutor' && !m.final,
  );
  return {
    learnerText: learner
      .map((m) => m.text)
      .join(' ')
      .trim(),
    tutorText: (tutorFinal.at(-1)?.text ?? tutorInterim.map((m) => m.text).join(' ')).trim(),
    tutorInterimCount: tutorInterim.length,
    states: messages
      .filter((m) => m.t === 'state')
      .map((m) => `${m.state}@${(m.at / 1000).toFixed(1)}s`),
    metrics: messages.filter((m) => m.t === 'metric'),
    errors: messages.filter((m) => m.t === 'error'),
  };
}

async function scoreScenario(name, page, turn) {
  const summary = summarizeTurn(turn.messages);
  const audio = await drainAudio(page);
  const results = [];
  const add = (assertion, ok, detail) => results.push({ scenario: name, assertion, ok, detail });

  log(`[${name}] learner caption: ${JSON.stringify(summary.learnerText)}`);
  log(`[${name}] tutor caption:   ${JSON.stringify(summary.tutorText)}`);

  if (name === 'mic') {
    add(
      'learner caption contains "husky" or "dog"',
      /\b(husky|dog)\b/i.test(summary.learnerText),
      JSON.stringify(summary.learnerText),
    );
  }

  const sentences = countSentences(summary.tutorText);
  add(
    `tutor reply is at most ${MAX_SENTENCES} sentences`,
    sentences > 0 && sentences <= MAX_SENTENCES,
    `${sentences} sentence(s)`,
  );
  const markup = markupFindings(summary.tutorText);
  add('tutor reply has no list/emphasis markup', markup.length === 0, markup.join(', ') || 'clean');
  add('tutor reply ends with "?"', /\?\s*$/.test(summary.tutorText), summary.tutorText.slice(-40));
  add('tutor reply mentions the dog', mentionsDog(summary.tutorText), '');

  let wavPath = null;
  let stats = null;
  let durationSec = 0;
  if (audio.base64) {
    const bytes = Buffer.from(audio.base64, 'base64');
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    wavPath = path.join(OUT_DIR, `${name}.wav`);
    writeWavInt16(wavPath, int16, audio.sampleRate);
    const read = readWavAsFloat32(wavPath);
    stats = signalStats(read.samples);
    durationSec = read.samples.length / read.sampleRate;
    log(
      `[${name}] wrote ${wavPath} — ${durationSec.toFixed(2)}s @ ${read.sampleRate} Hz, ` +
        `rms=${stats.rms.toFixed(4)} peak=${stats.peak.toFixed(3)} nan=${stats.nanCount} ` +
        `(${audio.chunks} scheduled buffers)`,
    );
  } else {
    log(`[${name}] NO audio was scheduled for playback`);
  }

  add(
    `spoken audio is at least ${MIN_AUDIO_SECONDS}s`,
    durationSec >= MIN_AUDIO_SECONDS,
    `${durationSec.toFixed(2)}s`,
  );
  add(
    `spoken audio RMS above ${MIN_RMS} and finite`,
    !!stats && stats.rms > MIN_RMS && stats.nanCount === 0,
    stats ? `rms=${stats.rms.toFixed(4)} nan=${stats.nanCount}` : 'no audio',
  );

  let roundTrip = null;
  if (wavPath && durationSec > 0.2) {
    try {
      const heard = await transcribeWav(wavPath);
      const { wer, distance, refWords } = wordErrorRate(summary.tutorText, heard);
      roundTrip = { heard, wer };
      log(`[${name}] round trip heard: ${JSON.stringify(heard)}`);
      log(`[${name}] WER = ${wer.toFixed(3)} (${distance} errors over ${refWords} caption words)`);
      add(
        `round trip: spoken audio matches the caption (WER <= ${WER_GATE})`,
        wer <= WER_GATE,
        `WER=${wer.toFixed(3)} heard=${JSON.stringify(heard)}`,
      );
    } catch (err) {
      add(
        `round trip: spoken audio matches the caption (WER <= ${WER_GATE})`,
        false,
        `transcription threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    add(
      `round trip: spoken audio matches the caption (WER <= ${WER_GATE})`,
      false,
      'no audio to transcribe',
    );
  }

  return { results, summary, audio: { wavPath, durationSec, stats }, roundTrip };
}

// ------------------------------------------------------------------- main

async function selfTest() {
  const wav = path.join(CACHE_DIR, 'discuss-quality-selftest-24k.wav');
  const reference = 'The dog is unhappy but loyal.';
  await sayToWav(reference, wav, 24000);
  const heard = await transcribeWav(wav);
  const { wer } = wordErrorRate(reference, heard);
  log(`self-test: said ${JSON.stringify(reference)}, heard ${JSON.stringify(heard)}`);
  log(`self-test: WER = ${wer.toFixed(3)} (gate <= ${SELFTEST_WER_GATE})`);
  return {
    scenario: 'scorer',
    assertion: `self-test: known-good 24 kHz WAV round-trips at WER <= ${SELFTEST_WER_GATE}`,
    ok: wer <= SELFTEST_WER_GATE,
    detail: `WER=${wer.toFixed(3)} heard=${JSON.stringify(heard)}`,
  };
}

async function main() {
  if (!existsSync(DIST)) {
    throw new Error(`No static export at ${DIST}. Run: pnpm --filter @sotto/client web:export`);
  }
  if (process.env.FRESH_PROFILE) rmSync(PROFILE_DIR, { recursive: true, force: true });

  const allResults = [];

  if (!process.env.SKIP_SELFTEST) {
    log('--- scorer self-test (Whisper in Node against a known-good `say` WAV) ---');
    allResults.push(await selfTest());
  }

  const { wav: micWav } = await buildFakeMicWav();

  log(`Serving ${path.relative(clientDir, DIST)} on ${BASE_URL}`);
  const server = serveDist();
  let context = null;
  try {
    if (!(await waitForServer(BASE_URL))) throw new Error('static host never came up');

    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      viewport: { width: 430, height: 852 },
      permissions: ['microphone'],
      args: [
        '--enable-unsafe-webgpu',
        '--use-angle=metal',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${micWav}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    // The single probe the capability gate makes: "is there a server?"
    await context.route('**/health', (route) =>
      route.request().url().includes(':8790') ? route.abort() : route.continue(),
    );
    await context.addInitScript(INSTRUMENT);

    const page = context.pages()[0] ?? (await context.newPage());
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      const text = msg.text();
      if (/\[sotto-tutor\]/.test(text)) log(text);
      if (msg.type() === 'error' && !text.includes(':8790')) pageErrors.push(`console: ${text}`);
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    // A warm profile keeps the previous build's service worker and shell
    // cache; /tutor/tutor-worker.js falls into the SW's cache-first
    // catch-all, so without this a rebuilt worker never reaches the run
    // (browser-tutor.mjs found this live). Model/content caches are left
    // alone — they are the whole point of reusing the profile.
    await page.evaluate(async () => {
      try {
        for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? [])
          await r.unregister();
        for (const n of await caches.keys())
          if (n.startsWith('sotto-shell-')) await caches.delete(n);
      } catch {
        // private window / blocked site data: nothing to clear
      }
    });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await seedProfile(page);

    const gpu = await page.evaluate(async () => {
      if (!('gpu' in navigator)) return { present: false, adapter: false };
      try {
        return { present: true, adapter: !!(await navigator.gpu.requestAdapter()) };
      } catch (err) {
        return { present: true, adapter: false, error: String(err) };
      }
    });
    log(`WebGPU: navigator.gpu=${gpu.present} adapter=${gpu.adapter}`);
    const healthStatus = await page.evaluate(() =>
      fetch('http://localhost:8790/health')
        .then((r) => r.status)
        .catch(() => 0),
    );
    log(`app's /health probe -> ${healthStatus} (0 = unreachable, as on the free origin)`);
    allResults.push({
      scenario: 'setup',
      assertion: 'no server anywhere: /health unreachable, so the browser cascade must run',
      ok: healthStatus !== 200,
      detail: `status ${healthStatus}`,
    });

    log(`Opening /voice/${BOOK_ID}`);
    await page.goto(`${BASE_URL}/voice/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });

    // run 10 (B1): on the free build the download panel sits behind the
    // "Run it in this browser" choice on the Discuss gate; open it first so
    // the download CTA below is reachable. A warm profile has no such button.
    const browserChoice = page.getByRole('button', { name: 'Run it in this browser' }).first();
    try {
      await browserChoice.waitFor({ timeout: 15_000 });
      await browserChoice.click();
      log('Opened "Run it in this browser"');
    } catch {
      /* no gate: models already installed, or a build with a server */
    }

    // ---- the opt-in download (a no-op on a warm profile) ----
    const cta = page.getByText('Download tutor models', { exact: false }).first();
    let needsDownload = true;
    try {
      await cta.waitFor({ timeout: 45_000 });
    } catch {
      needsDownload = false;
      log('Models already installed in this profile');
    }
    if (needsDownload) {
      log('Download panel is showing; tapping "Download tutor models"');
      await cta.click();
      const started = Date.now();
      let lastReport = 0;
      while (Date.now() - started < DOWNLOAD_TIMEOUT_MS) {
        const body = await page.evaluate(() => document.body.innerText);
        if (!/Download tutor models|Downloading/.test(body)) break;
        if (Date.now() - lastReport > 20_000) {
          lastReport = Date.now();
          log(`  …downloading (${((Date.now() - started) / 1000).toFixed(0)}s)`);
          if (/did not finish/i.test(body)) {
            log('  panel reported a failure: ' + body.split('\n').slice(-4).join(' | '));
            break;
          }
        }
        await page.waitForTimeout(1000);
      }
      log(`Model download settled after ${((Date.now() - started) / 1000).toFixed(1)}s`);
      await page.goto(`${BASE_URL}/voice/${BOOK_ID}`, { waitUntil: 'domcontentloaded' });
    }

    // ---- start the session ----
    const startButton = page.getByText('Start', { exact: true }).first();
    try {
      await startButton.waitFor({ timeout: 30_000 });
      await startButton.click();
      log('tapped Start');
    } catch {
      log('no Start control appeared; assuming this build auto-starts');
    }

    let seen = 0;

    // ---------------------------------------------------- scenario (a) mic
    if (SCENARIOS.includes('a')) {
      log('--- scenario (a): fake mic, push-to-talk ---');
      const ring = page.getByLabel('Hold to talk').first();
      let held = false;
      try {
        await ring.waitFor({ timeout: 30_000 });
        const box = await ring.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        held = true;
        log(`holding the mic for ${PTT_HOLD_MS} ms (longer than one fixture loop)`);
        await page.waitForTimeout(PTT_HOLD_MS);
        await page.mouse.up();
        log('released the mic');
      } catch (err) {
        log(`push-to-talk ring unavailable: ${err instanceof Error ? err.message : String(err)}`);
        if (held) await page.mouse.up().catch(() => undefined);
      }
      const mic = await page.evaluate(() => ({
        frames: window.__sotto.micFrames,
        samples: window.__sotto.micSamples,
        rate: window.__sotto.captureRate,
      }));
      log(
        `fake capture device delivered ${mic.frames} worklet frames ` +
          `(${(mic.samples / 16000).toFixed(1)}s of 16 kHz PCM; context rate ${mic.rate})`,
      );
      allResults.push({
        scenario: 'mic',
        assertion: 'fake capture device delivered audio frames at all',
        ok: mic.frames > 0,
        detail: `${mic.frames} frames, ${(mic.samples / 16000).toFixed(1)}s`,
      });

      const turn = await waitForTurn(page, seen, 'mic');
      seen = turn.seen;
      const scored = await scoreScenario('mic', page, turn);
      allResults.push(...scored.results);
      writeFileSync(
        path.join(OUT_DIR, 'mic-turn.json'),
        JSON.stringify({ messages: turn.messages, summary: scored.summary }, null, 2),
      );
    }

    // --------------------------------------------------- scenario (b) text
    if (SCENARIOS.includes('b')) {
      log('--- scenario (b): TextFallback (LLM + TTS, no STT) ---');
      await page.evaluate(() => window.__sottoMark('scenario-b'));
      seen = await page.evaluate(() => window.__sotto.messages.length);
      const input = page.getByPlaceholder('Type instead').first();
      try {
        await input.waitFor({ timeout: 30_000 });
        await input.fill(UTTERANCE);
        await page.getByLabel('Send', { exact: true }).first().click();
        log(`sent via TextFallback: ${JSON.stringify(UTTERANCE)}`);
      } catch (err) {
        log(`TextFallback unavailable: ${err instanceof Error ? err.message : String(err)}`);
      }
      const turn = await waitForTurn(page, seen, 'text');
      seen = turn.seen;
      const scored = await scoreScenario('text', page, turn);
      allResults.push(...scored.results);
      writeFileSync(
        path.join(OUT_DIR, 'text-turn.json'),
        JSON.stringify({ messages: turn.messages, summary: scored.summary }, null, 2),
      );
    }

    await page.screenshot({ path: path.join(OUT_DIR, 'final.png') });

    if (pageErrors.length) {
      log('page/console errors:');
      for (const e of pageErrors.slice(0, 20)) log('  - ' + e);
    }
  } finally {
    await context?.close().catch(() => undefined);
    server.kill();
  }

  // ------------------------------------------------------- the PASS table
  const width = Math.max(...allResults.map((r) => r.assertion.length), 20);
  const table = [];
  table.push('');
  table.push('===== discuss-quality: PASS/FAIL =====');
  for (const r of allResults) {
    table.push(
      `  [${r.ok ? 'PASS' : 'FAIL'}] ${r.scenario.padEnd(7)} ${r.assertion.padEnd(width)}` +
        (r.detail ? `  — ${r.detail}` : ''),
    );
  }
  const failed = allResults.filter((r) => !r.ok).length;
  table.push(`  ${allResults.length - failed}/${allResults.length} passed`);
  for (const line of table) {
    console.log(line);
    logLines.push(line);
  }
  writeFileSync(path.join(OUT_DIR, 'discuss-quality.log'), logLines.join('\n') + '\n');
  writeFileSync(
    path.join(OUT_DIR, 'discuss-quality-results.json'),
    JSON.stringify(allResults, null, 2),
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[discuss-quality] FAILED:', err);
  writeFileSync(path.join(OUT_DIR, 'discuss-quality.log'), logLines.join('\n') + '\n');
  process.exit(1);
});
