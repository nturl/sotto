#!/usr/bin/env node
/* global Worker, Response */
/**
 * The bundled tutor worker speaks with Paradee in a real browser, with no
 * WebGPU: build the worker, serve apps/client/public, open headless
 * Chromium (no --enable-unsafe-webgpu, so `navigator.gpu` gives no adapter),
 * and send the worker the same `sample` message the reader's speaker button
 * sends. Checks, in order:
 *
 *   1. cold: Paradee downloads once from the pinned URL and speaks
 *   2. warm: a fresh worker in the same profile speaks with NO request to
 *      huggingface.co (the weights came from the `sotto-paradee` cache)
 *   3. an upgrading learner's Kokoro files (seeded before the cold pass) are
 *      deleted once Paradee loads, while their whisper files stay
 *   4. the audio is speech: the WAVs are written for
 *      `tts-roundtrip.mjs SCORE_MANIFEST=` to score with whisper
 *
 * Usage: node apps/client/scripts/build-tutor-worker.mjs &&
 *        OUT_DIR=/tmp/paradee node apps/client/e2e/paradee-sample.mjs
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '../public');
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? 'paradee-out');
const SENTENCES = [
  { id: 'reader', text: 'The word "cendre" means ash, and it gives Cinderella her name.' },
  { id: 'question', text: 'What do you think the goat wants when she looks at the mountain?' },
];

const TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.html': 'text/html',
};

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = path.join(PUBLIC, url.pathname);
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><title>paradee</title>');
    }
    if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function wav(float32, sampleRate) {
  const n = float32.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
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

/** Runs in the page: one fresh worker, every sentence, timings. */
async function speakAll(sentences) {
  const worker = new Worker('/tutor/tutor-worker.js', { type: 'module' });
  const out = [];
  for (const s of sentences) {
    const started = performance.now();
    const result = await new Promise((resolve) => {
      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.t === 'sample_result')
          resolve({ pcm: Array.from(new Float32Array(m.pcm)), sampleRate: m.sampleRate });
        else if (m.t === 'error') resolve({ error: `${m.code}: ${m.message}` });
      };
      worker.postMessage({ t: 'sample', text: s.text, locale: 'en-US' });
    });
    out.push({ ...s, ...result, ms: Math.round(performance.now() - started) });
  }
  worker.terminate();
  return {
    out,
    gpu: !!(navigator.gpu && (await navigator.gpu.requestAdapter().catch(() => null))),
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const hfRequests = [];
  context.on('request', (r) => {
    if (r.url().includes('huggingface.co')) hfRequests.push(r.url());
  });
  await page.goto(base);
  await page.evaluate(async () => {
    const tf = await caches.open('transformers-cache');
    await tf.put(
      'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx',
      new Response('k'),
    );
    await tf.put(
      'https://huggingface.co/onnx-community/whisper-base/resolve/main/config.json',
      new Response('w'),
    );
    const markers = await caches.open('sotto-tutor-models');
    await markers.put(
      'https://sotto.local/tutor-model/onnx-community%2FKokoro-82M-v1.0-ONNX',
      new Response('1'),
    );
  });

  let failed = false;
  const manifest = [];
  for (const pass of ['cold', 'warm']) {
    const before = hfRequests.length;
    const { out, gpu } = await page.evaluate(speakAll, SENTENCES);
    console.log(
      `${pass}: webgpu adapter=${gpu}, huggingface requests=${hfRequests.length - before}`,
    );
    for (const r of out) {
      if (r.error) {
        console.log(`  ${r.id}: FAIL ${r.error}`);
        failed = true;
        continue;
      }
      const secs = r.pcm.length / r.sampleRate;
      const file = `${r.id}.${pass}.wav`;
      writeFileSync(path.join(OUT_DIR, file), wav(r.pcm, r.sampleRate));
      manifest.push({
        id: r.id,
        dtype: `paradee-browser-${pass}`,
        file,
        expect: r.text,
        secs: +secs.toFixed(2),
      });
      console.log(`  ${r.id}: ${r.ms} ms -> ${secs.toFixed(2)} s of audio @ ${r.sampleRate} Hz`);
      if (secs < 1) failed = true;
    }
    if (pass === 'warm' && hfRequests.length !== before) {
      console.log('  FAIL: warm pass re-downloaded from huggingface.co');
      failed = true;
    }
  }
  const left = await page.evaluate(async () => {
    const urls = [];
    for (const name of ['transformers-cache', 'sotto-tutor-models']) {
      for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    }
    return urls;
  });
  const kokoroLeft = left.filter((u) => u.includes('Kokoro'));
  const whisperKept = left.some((u) => u.includes('whisper-base'));
  console.log(
    `upgrade cleanup: kokoro entries left=${kokoroLeft.length}, whisper kept=${whisperKept}`,
  );
  if (kokoroLeft.length > 0 || !whisperKept) failed = true;
  writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nWAVs + manifest.json in ${OUT_DIR}\nRESULT: ${failed ? 'FAIL' : 'PASS'}`);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
