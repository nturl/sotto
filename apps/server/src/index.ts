import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig, loadDotEnv } from './config.js';
import { createVad } from './voice/vad.js';

// Load apps/server/.env before reading config, if present. Resolved relative
// to this module so it works whether started via `pnpm dev` from the repo
// root or from apps/server directly.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.resolve(__dirname, '../.env'));

const config = loadConfig();
const app = await buildApp(config);

async function start(): Promise<void> {
  try {
    // Warm up the VAD backend (Silero model load, if available) before
    // listening, so /health reports the real backend from the first request
    // instead of the fallback default.
    await createVad(app.log);
    await app.listen({ port: config.SOTTO_PORT, host: config.SOTTO_HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
