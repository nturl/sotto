import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_PACKS_DIR = path.resolve(__dirname, '../../../packages/content/packs');

const config = loadConfig();

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Serves /content/packs/:locale/* as static files from the matching pack
// directory (e.g. /content/packs/fr-FR/books/x/cover.svg). The exact-path
// GET /content/packs route below (no trailing content) lists pack summaries.
await app.register(fastifyStatic, {
  root: CONTENT_PACKS_DIR,
  prefix: '/content/packs/',
  wildcard: true,
});

async function probeModelsEndpoint(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      signal: controller.signal,
      headers: config.SOTTO_API_KEY ? { Authorization: `Bearer ${config.SOTTO_API_KEY}` } : {},
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/health', async () => {
  const [stt, llm, tts] = await Promise.all([
    probeModelsEndpoint(config.SOTTO_STT_URL),
    probeModelsEndpoint(config.SOTTO_LLM_URL),
    probeModelsEndpoint(config.SOTTO_TTS_URL),
  ]);
  return { ok: true, stt, llm, tts };
});

app.get('/content/packs', async () => {
  if (!existsSync(CONTENT_PACKS_DIR)) return [];
  const locales = readdirSync(CONTENT_PACKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);

  const packs = locales
    .map((locale) => {
      const packJsonPath = path.join(CONTENT_PACKS_DIR, locale, 'pack.json');
      if (!existsSync(packJsonPath)) return null;
      try {
        return JSON.parse(readFileSync(packJsonPath, 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter((p): p is Record<string, unknown> => p !== null);

  return packs;
});

app.post('/voice/session', async () => {
  // Stub: WS-3 fills in the real voice pipeline (planning/CONTRACTS.md §5b).
  return {
    sessionId: randomUUID(),
    wsUrl: `ws://${config.SOTTO_HOST === '0.0.0.0' ? 'localhost' : config.SOTTO_HOST}:${config.SOTTO_PORT}/voice/ws`,
    sampleRate: 16000,
    limits: { maxMs: 1_200_000, idleMs: 90_000 },
  };
});

async function start(): Promise<void> {
  try {
    await app.listen({ port: config.SOTTO_PORT, host: config.SOTTO_HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
