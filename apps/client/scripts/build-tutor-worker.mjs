/**
 * Bundles the in-browser tutor worker (planning/BROWSER-TUTOR.md).
 *
 * Why a separate bundler at all: Metro bundles apps/client, and anything
 * reachable from the app's module graph ends up in the app bundle. The tutor
 * worker imports @huggingface/transformers (and later @mlc-ai/web-llm and
 * kokoro-js) — tens of megabytes of ESM that Metro should never see, and
 * that would otherwise be parsed on every page load whether or not the
 * learner ever opts into the tutor. So the worker source lives in
 * packages/voice/src/browser-cascade/worker.ts, NOTHING imports it, and
 * esbuild compiles it here into a standalone ES-module worker that the
 * provider spawns by URL (`new Worker('/tutor/tutor-worker.js', { type:
 * 'module' })`).
 *
 * Also copied: onnxruntime-web's wasm runtime, into public/tutor/ort/. The
 * default transformers.js behaviour is to pull those from a CDN at runtime;
 * serving them from our own origin means the only third-party host the app
 * ever reaches is the Hugging Face hub, and only while a download the user
 * explicitly asked for is in flight.
 *
 * Model WEIGHTS are not vendored — they are hundreds of megabytes, they are
 * fetched on opt-in from the libraries' own hubs, and the libraries' own
 * caches keep them.
 */
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(clientDir, '../..');
const entry = path.join(repoRoot, 'packages/voice/src/browser-cascade/worker.ts');
const outDir = path.join(clientDir, 'public/tutor');
const outFile = path.join(outDir, 'tutor-worker.js');

mkdirSync(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
  // transformers.js branches on these at load time; pinning them lets
  // esbuild drop the Node-only halves (fs, sharp, onnxruntime-node).
  define: { 'process.env.NODE_ENV': '"production"' },
  external: ['node:*', 'fs', 'path', 'fs/promises', 'sharp', 'onnxruntime-node'],
  logOverride: { 'ignored-bare-import': 'silent' },
});

// onnxruntime-web's wasm runtime, resolved through the same package the
// worker actually bundles so the versions can never drift.
// onnxruntime-web is a transitive dependency of @huggingface/transformers,
// so under pnpm's strict layout it is only resolvable from inside that
// package — not from packages/voice.
// Both packages publish an `exports` map without "./package.json", so
// resolve a real entry point and walk up from the file it lands on.
const fromVoice = createRequire(path.join(repoRoot, 'packages/voice/noop.js'));
const fromTransformers = createRequire(
  path.join(path.dirname(fromVoice.resolve('@huggingface/transformers')), 'noop.js'),
);
const ortDist = path.dirname(fromTransformers.resolve('onnxruntime-web'));
const ortOut = path.join(outDir, 'ort');
mkdirSync(ortOut, { recursive: true });
// All `ort-wasm-*` runtime variants (~77 MB). Trimming this to the two
// obvious ones (jsep for WebGPU, plain for the wasm fallback) was tried and
// failed: onnxruntime-web 1.26 asks for `ort-wasm-simd-threaded.asyncify.mjs`
// while probing backends, and a 404 there takes down the whole load with
// "no available backend found" — verified in the slice-1 e2e. If the deploy
// size ever becomes a problem, the alternative is one line in worker.ts:
// point `env.backends.onnx.wasm.wasmPaths` at onnxruntime's CDN instead of
// serving the runtime ourselves.
let ortCopied = 0;
for (const file of readdirSync(ortDist)) {
  if (!file.startsWith('ort-wasm-')) continue;
  if (!file.endsWith('.wasm') && !file.endsWith('.mjs')) continue;
  cpSync(path.join(ortDist, file), path.join(ortOut, file));
  ortCopied += 1;
}

const bytes = statSync(outFile).size;
console.log(
  `tutor worker: ${(bytes / 1024 / 1024).toFixed(2)} MB -> ${path.relative(repoRoot, outFile)}` +
    ` (+${ortCopied} onnxruntime files)`,
);
if (result.warnings.length > 0) {
  for (const w of result.warnings) console.warn(`  warning: ${w.text}`);
}
