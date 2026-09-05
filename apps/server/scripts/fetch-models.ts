#!/usr/bin/env tsx
/**
 * Downloads the Silero VAD v5 ONNX model used by src/voice/vad.ts. Run with
 * `pnpm --filter @sotto/server models:fetch`. The model file itself is
 * gitignored (see models/README.md for attribution + MIT license); the
 * server falls back to an energy VAD automatically if this hasn't been run.
 */
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const MODEL_URL =
  'https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, '../models');
const DEST_PATH = path.join(MODELS_DIR, 'silero_vad.onnx');

async function main(): Promise<void> {
  if (existsSync(DEST_PATH)) {
    console.log(`Already present: ${DEST_PATH}`);
    return;
  }
  mkdirSync(MODELS_DIR, { recursive: true });

  console.log(`Fetching ${MODEL_URL} ...`);
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download Silero VAD model: ${res.status} ${res.statusText}`);
  }

  const tmpPath = `${DEST_PATH}.download`;
  const nodeStream = (await import('node:stream')).Readable.fromWeb(res.body as never);
  await pipeline(nodeStream, createWriteStream(tmpPath));
  const { renameSync } = await import('node:fs');
  renameSync(tmpPath, DEST_PATH);

  console.log(`Saved ${DEST_PATH}`);
}

main().catch((err) => {
  console.error('models:fetch failed:', err);
  console.error('The server will fall back to the energy VAD automatically — this is not fatal.');
  process.exit(1);
});
