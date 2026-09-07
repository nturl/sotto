#!/usr/bin/env node
/**
 * Lane C's objective ear (planning/run9/cards/C-tts-integrity.md, output 1).
 *
 * Nothing in this repo has ever checked that the audio the browser cascade
 * SPEAKS is intelligible — `audible-probe.mjs` only asserts `samples > 0`,
 * and `browser-tutor.mjs` deliberately asserts speaking never fires for its
 * es-419 fixture. So a Kokoro build that emits noise passes every test we
 * have. This script closes that hole the only way that survives a code
 * review: synthesize with Kokoro, transcribe the result with Whisper base,
 * and score word error rate against the sentence we asked for. Noise
 * transcribes to nothing (WER 1.0); speech transcribes to roughly the
 * sentence (WER < 0.2).
 *
 * Node-only, on cpu/wasm, so it needs no GPU and no browser: it isolates
 * "does Kokoro produce speech at this dtype" from "does WebGPU produce
 * speech at this dtype". The browser half of the matrix lives in
 * `apps/client/e2e/tts-browser-matrix.mjs`.
 *
 * Usage:
 *   node packages/voice/scripts/tts-roundtrip.mjs
 *     OUT_DIR=~/Claude/sotto-run9/C   where the WAVs go (default: cwd/tts-out)
 *     DTYPES=q8,fp32                  which Kokoro dtypes to try
 *     ONLY=husky                      run one sentence id only
 *     PREPARED=1                      pipe each sentence through
 *                                     `prepareForSpeech` first (the fix),
 *                                     instead of handing Kokoro the raw text
 *
 * NOTE for the orchestrator: `wer()` below is a private copy. Lane E's
 * `apps/client/e2e/lib/*` had not landed on `run9/E` when this was written
 * (`git ls-tree run9/E` showed no e2e/lib), so there was nothing to import.
 * If E's version lands, one of the two should go.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const OUT_DIR = resolve(
  (process.env.OUT_DIR ?? 'tts-out').replace(/^~(?=$|\/)/, homedir()),
);
const DTYPES = (process.env.DTYPES ?? 'q8,fp32,fp16').split(',').filter(Boolean);
const ONLY = process.env.ONLY;
const PREPARED = process.env.PREPARED === '1';

/** The sentences the card asks for: the reference husky line, numbers, quotes,
 * an em dash, a trailing question, a 60-word run-on, and a line that still
 * carries the markdown a 2B model emits. `expect` is what a human would say
 * the audio should read as — it is what WER scores against, so the markdown
 * case is scored against its PROSE, not against its asterisks. */
const SENTENCES = [
  {
    id: 'husky',
    text: 'The dog was a big native husky, the proper wolf-dog, gray-coated and without any visible or temperamental difference from its brother, the wild wolf.',
  },
  {
    id: 'numbers',
    text: 'It was fifty degrees below zero and the trail had not been travelled for 3 days.',
  },
  {
    id: 'quotes',
    text: 'The man said, “We must keep moving,” and the dog followed him without a sound.',
    expect: 'The man said, "We must keep moving," and the dog followed him without a sound.',
  },
  {
    id: 'emdash',
    text: 'The husky was loyal — unhappy, but loyal — and it watched the man closely.',
    expect: 'The husky was loyal unhappy, but loyal and it watched the man closely.',
  },
  {
    id: 'question',
    text: 'What do you think the dog was feeling out there on the frozen trail?',
  },
  {
    id: 'long60',
    text: 'The dog was unhappy because the cold was far beyond the cold of its ancestors and it knew that it was not a good time for travelling, yet the man kept walking north along the frozen river with his pack and his matches and his frozen biscuits, and the husky followed him step for step without once complaining aloud about any of it.',
  },
  {
    id: 'markdown',
    text: '- **The dog** is unhappy but *loyal*. 🐺',
    expect: 'The dog is unhappy but loyal.',
  },
  {
    id: 'symbols',
    text: 'The temperature fell to 50° and 90% of the men & dogs were exhausted.',
    expect:
      'The temperature fell to 50 degrees and 90 percent of the men and dogs were exhausted.',
  },
];

// ---- WER ----

/** Lowercase, drop everything that is not a letter/digit/space, collapse runs.
 * Numerals are left alone deliberately: Whisper writes "3" where Kokoro was
 * given "3", so normalizing them away would hide a real failure. */
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(s) {
  const n = normalize(s);
  return n.length === 0 ? [] : n.split(' ');
}

/** Word error rate: Levenshtein distance over words / reference length. */
export function wer(reference, hypothesis) {
  const r = words(reference);
  const h = words(hypothesis);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const row = [i];
    for (let j = 1; j <= h.length; j++) {
      row[j] =
        r[i - 1] === h[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], row[j - 1]);
    }
    prev = row;
  }
  return prev[h.length] / r.length;
}

// ---- WAV ----

function wavFromFloat32(float32, sampleRate) {
  const n = float32.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buf;
}

/** Root-mean-square of the waveform — a silent/near-silent clip is a
 * different failure from a loud noisy one, and WER alone cannot tell them
 * apart. */
function rms(float32) {
  let sum = 0;
  for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
  return Math.sqrt(sum / Math.max(1, float32.length));
}

// ---- main ----

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { KokoroTTS } = await import('kokoro-js');
  const { pipeline } = await import('@huggingface/transformers');

  let prepareForSpeech = null;
  if (PREPARED) {
    // The fix under test. Loaded lazily and by transpiled source so this
    // script keeps running on a checkout where tts-text.ts does not exist.
    const mod = await import('./load-tts-text.mjs');
    prepareForSpeech = mod.prepareForSpeech;
  }

  process.stderr.write('loading whisper-base (cpu)…\n');
  const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
    device: 'cpu',
  });

  const rows = [];
  for (const dtype of DTYPES) {
    process.stderr.write(`loading kokoro dtype=${dtype} (cpu)…\n`);
    let tts;
    try {
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype,
        device: 'cpu',
      });
    } catch (err) {
      process.stderr.write(`  dtype=${dtype} unavailable: ${err?.message ?? err}\n`);
      for (const s of SENTENCES) rows.push({ id: s.id, dtype, wer: null, note: 'load failed' });
      continue;
    }
    for (const s of SENTENCES) {
      if (ONLY && s.id !== ONLY) continue;
      const expect = s.expect ?? s.text;
      const pieces = prepareForSpeech ? prepareForSpeech(s.text) : [s.text];
      const chunks = [];
      const started = Date.now();
      for (const piece of pieces) {
        const audio = await tts.generate(piece, { voice: 'af_heart', speed: 1.0 });
        chunks.push(audio.audio);
      }
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const pcm = new Float32Array(total);
      let off = 0;
      for (const c of chunks) {
        pcm.set(c, off);
        off += c.length;
      }
      const ms = Date.now() - started;
      const name = `${s.id}.${dtype}${PREPARED ? '.prepared' : ''}.wav`;
      writeFileSync(resolve(OUT_DIR, name), wavFromFloat32(pcm, 24000));
      // `chunk_length_s` matters: the 60-word fixture runs past whisper's
      // 30 s window, and without chunking the tail is simply not transcribed
      // (which would read as a huge WER for a perfectly good clip).
      const out = await asr(pcm.length ? Float32Array.from(pcm) : new Float32Array(1600), {
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const heard = (out?.text ?? '').trim();
      rows.push({
        id: s.id,
        dtype,
        pieces: pieces.length,
        secs: +(pcm.length / 24000).toFixed(2),
        rms: +rms(pcm).toFixed(4),
        wer: +wer(expect, heard).toFixed(3),
        ms,
        heard,
        file: name,
      });
      process.stderr.write(
        `  ${s.id}/${dtype}: WER ${rows.at(-1).wer}  "${heard.slice(0, 70)}"\n`,
      );
    }
  }

  console.log('\n| sentence | dtype | pieces | secs | rms | WER | heard |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.id} | ${r.dtype} | ${r.pieces ?? '-'} | ${r.secs ?? '-'} | ${r.rms ?? '-'} | ${r.wer ?? 'n/a'} | ${(r.heard ?? r.note ?? '').replace(/\|/g, '/').slice(0, 90)} |`,
    );
  }
  writeFileSync(resolve(OUT_DIR, `roundtrip${PREPARED ? '-prepared' : ''}.json`), JSON.stringify(rows, null, 2));
  console.log(`\nWAVs + JSON in ${OUT_DIR}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
