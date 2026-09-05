#!/usr/bin/env node
/**
 * Multi-locale voice smoke test (evidence run 2026-09-05): one phase per
 * locale (pt-BR, it-IT, zh-CN, zh-TW) against the real local stack
 * (whisper.cpp :9001, llama-server :8080, Kokoro :8880 through apps/server
 * on :8790), following the pattern in voice-live.mjs but parameterized per
 * locale and reduced to a single "explain word" phase (no save phase).
 *
 * For each locale: picks that pack's first (only) book, reads a real
 * content word from chapter 1's first sentence, synthesizes "what does
 * <word> mean" in that locale's own language via Kokoro (voice/lang_code
 * per docs/contracts.md §5d / apps/server/src/voice/tts.ts's VOICE_BY_LANG),
 * feeds it into Chromium as a fake mic, seeds IndexedDB preferences with
 * learningLocale = pack code and defaultTutorMode: 'discuss', and asserts a
 * non-empty tutor caption arrives within a generous timeout.
 *
 * Usage: BASE_URL=http://localhost:8081 node apps/client/e2e/voice-smoke-locales.mjs
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
const TTS_URL = process.env.SOTTO_TTS_URL ?? 'http://127.0.0.1:8880/v1';
const PHASE_TIMEOUT_MS = 60_000;
const TRAILING_SILENCE_MS = 1500;

mkdirSync(CACHE_DIR, { recursive: true });

const t0 = Date.now();
function log(...args) {
  console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);
}

// ---- Per-locale fixtures ----
// bookId/word verified by reading packages/content/packs/<locale>/{pack.json,books/*/book.json,books/*/chapters/01.json}.
// Voice/lang_code per apps/server/src/voice/tts.ts VOICE_BY_LANG (docs/contracts.md §5d).
const LOCALES = [
  {
    code: 'pt-BR',
    bookId: 'pt-jabuti-onca',
    level: 'A0',
    word: 'jabuti',
    phrase: 'o que significa jabuti',
    voice: 'pf_dora',
    langCode: 'p',
  },
  {
    code: 'it-IT',
    bookId: 'it-pinocchio-inizio',
    level: 'A1',
    word: 'falegname',
    phrase: 'cosa significa falegname',
    voice: 'if_sara',
    langCode: 'i',
  },
  {
    code: 'zh-CN',
    bookId: 'zh-chengyu-stories',
    level: 'A0',
    word: '农夫',
    phrase: '农夫是什么意思',
    voice: 'zf_xiaoxiao',
    langCode: 'z',
  },
  {
    code: 'zh-TW',
    // pack.json's canonical bookId ("zh-chengyu-stories-hant"); NOTE: the
    // chapter JSON's own embedded "bookId" field says "zh-chengyu-stories"
    // (same as zh-CN, not itself) -- a content data bug, not our bug. We
    // route by the pack.json bookId, which matches the book's folder name.
    bookId: 'zh-chengyu-stories-hant',
    level: 'A0',
    word: '農夫',
    phrase: '農夫是什麼意思',
    voice: 'zf_xiaoxiao',
    langCode: 'z',
  },
];

// ---- Kokoro TTS -> ffmpeg: one fake-mic wav per locale ----

async function synthesizeToFile(text, voice, langCode, outFile) {
  const res = await fetch(`${TTS_URL.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice,
      lang_code: langCode,
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

async function buildUtteranceWav(text, voice, langCode, name) {
  const raw = path.join(CACHE_DIR, `${name}-raw.wav`);
  const formatted = path.join(CACHE_DIR, `${name}-fmt.wav`);
  const silence = path.join(CACHE_DIR, `${name}-silence.wav`);
  const combined = path.join(CACHE_DIR, `${name}.wav`);
  const listFile = path.join(CACHE_DIR, `${name}-concat.txt`);

  await synthesizeToFile(text, voice, langCode, raw);
  await toFakeMicFormat(raw, formatted);
  await buildSilenceWav(TRAILING_SILENCE_MS, silence);
  writeFileSync(listFile, [formatted, silence].map((f) => `file '${f}'`).join('\n'));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', combined]);
  return combined;
}

// ---- Preferences seed ----

function preferencesFor(locale) {
  return {
    interfaceLocale: 'en',
    explanationLocale: 'en',
    learningLocale: locale.code,
    level: locale.level,
    immersionMode: false,
    defaultTutorMode: 'discuss',
    captionsEnabled: true,
    turnDetection: 'auto',
    correctionFrequency: 'normal',
    speakingPace: 'normal',
    narrationSpeed: 1,
    onboarded: true,
  };
}

async function seedProfile(page, preferences) {
  await page.evaluate(async (prefs) => {
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
    tx.objectStore('keyval').put(JSON.stringify(prefs), 'sotto.preferences');
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, preferences);
}

// ---- One phase per locale: fresh Chromium + fresh profile dir, fake mic,
//      poll captions/state until stop condition or timeout ----

async function runLocale(locale) {
  const name = locale.code;
  log(
    `=== Locale ${name}: book=${locale.bookId} word="${locale.word}" voice=${locale.voice} lang_code=${locale.langCode} ===`,
  );
  log(`Synthesizing utterance: "${locale.phrase}"`);

  let wavPath;
  let synthError = null;
  try {
    wavPath = await buildUtteranceWav(
      locale.phrase,
      locale.voice,
      locale.langCode,
      `locale-${name}`,
    );
  } catch (err) {
    synthError = err.message ?? String(err);
    log(`[${name}] Kokoro synthesis FAILED: ${synthError}`);
    return {
      locale: name,
      voice: locale.voice,
      langCode: locale.langCode,
      transcript: null,
      tutorArrived: false,
      notes: `Kokoro synthesis failed: ${synthError}`,
    };
  }

  const profileDir = path.join(CACHE_DIR, `voice-smoke-profile-${name}`);
  const context = await chromium.launchPersistentContext(profileDir, {
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
  await seedProfile(page, preferencesFor(locale));

  log(`[${name}] navigating to /voice/${locale.bookId}`);
  await page.goto(`${BASE_URL}/voice/${locale.bookId}`, { waitUntil: 'domcontentloaded' });

  const timeline = [];
  const statesSeen = [];
  let lastCaptionsKey = '';
  let lastState = '';

  const deadline = Date.now() + PHASE_TIMEOUT_MS;
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

    const hasTutorReply = timeline.some((e) => e.kind === 'caption' && /^Tutor:/.test(e.value));
    if (hasTutorReply) {
      log(`[${name}] stop condition met (tutor caption arrived).`);
      break;
    }

    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: path.join(OUT_DIR, `voice-smoke-${name}-final.png`) });
  await context.close();

  const sttCaption = timeline.find((e) => e.kind === 'caption' && /^You:/.test(e.value));
  const transcript = sttCaption ? sttCaption.value.replace(/^You:\s*/, '') : null;
  const tutorArrived = timeline.some((e) => e.kind === 'caption' && /^Tutor:/.test(e.value));

  let notes = '';
  if (!transcript) {
    notes = 'No learner (You:) caption ever appeared -- STT/VAD produced no transcript.';
  } else {
    const normalizedTranscript = transcript.toLowerCase();
    const normalizedWord = locale.word.toLowerCase();
    if (!normalizedTranscript.includes(normalizedWord)) {
      notes = `Possible misrecognition: transcript did not contain target word "${locale.word}".`;
    }
  }
  if (!tutorArrived) {
    notes += (notes ? ' ' : '') + `No tutor caption within ${PHASE_TIMEOUT_MS / 1000}s.`;
  }
  if (pageErrors.length) {
    notes += (notes ? ' ' : '') + `Page/console errors: ${pageErrors.join(' | ')}`;
  }
  if (!notes) notes = 'OK';

  return {
    locale: name,
    voice: locale.voice,
    langCode: locale.langCode,
    transcript,
    tutorArrived,
    notes,
    timeline,
    statesSeen,
  };
}

async function main() {
  const only = (process.env.ONLY_LOCALES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const locales = only.length ? LOCALES.filter((l) => only.includes(l.code)) : LOCALES;
  const results = [];
  for (const locale of locales) {
    const result = await runLocale(locale);
    results.push(result);
  }

  console.log('\n===== Per-locale summary =====');
  const header = [
    'locale',
    'voice used',
    'lang_code',
    'STT transcript seen',
    'tutor caption arrived',
    'notes',
  ];
  console.log(header.join(' | '));
  for (const r of results) {
    console.log(
      [
        r.locale,
        r.voice,
        r.langCode,
        r.transcript ?? '(none)',
        r.tutorArrived ? 'Y' : 'N',
        r.notes,
      ].join(' | '),
    );
  }

  const anyMissingTutor = results.some((r) => !r.tutorArrived);
  if (anyMissingTutor) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[voice-smoke-locales] FAILED:', err);
  process.exit(1);
});
