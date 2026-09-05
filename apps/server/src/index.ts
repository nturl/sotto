import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createVad } from './voice/vad.js';

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
