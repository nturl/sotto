import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { Config } from './config.js';

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    SOTTO_STT_URL: 'http://127.0.0.1:9001/v1',
    SOTTO_STT_MODEL: 'Systran/faster-whisper-base',
    SOTTO_LLM_URL: 'http://127.0.0.1:8080/v1',
    SOTTO_LLM_MODEL: 'qwen3.6-35b-a3b',
    SOTTO_TTS_URL: 'http://127.0.0.1:8880/v1',
    SOTTO_TTS_MODEL: 'kokoro',
    SOTTO_API_KEY: undefined,
    SOTTO_PORT: 8790,
    SOTTO_HOST: '127.0.0.1',
    SOTTO_CORS_ORIGINS: undefined,
    SOTTO_MAX_SESSIONS: 4,
    IMPORT_JOB_MAX_MS: 45 * 60_000,
    SOTTO_STATIC_DIR: undefined,
    SOTTO_BASIC_AUTH: undefined,
    ...overrides,
  };
}

const sessionBody = {
  bookId: 'book-1',
  chapterId: 'ch-1',
  mode: 'discuss',
  learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en-US' },
  passage: { chapterTitle: 't', sentences: [] },
};

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('CORS origin allowlist', () => {
  it('reflects an allowed origin (default allowlist) on a simple request', async () => {
    app = await buildApp(testConfig());
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:8081' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  it('reflects any localhost/127.0.0.1 origin regardless of port', async () => {
    app = await buildApp(testConfig());
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:19006' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:19006');
  });

  it('does not reflect a disallowed browser origin', async () => {
    app = await buildApp(testConfig());
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('honors a custom SOTTO_CORS_ORIGINS allowlist', async () => {
    app = await buildApp(testConfig({ SOTTO_CORS_ORIGINS: 'https://sotto.app' }));
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://sotto.app' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://sotto.app');
  });
});

describe('POST /voice/session concurrent-session cap', () => {
  it('returns 429 too_many_sessions once SOTTO_MAX_SESSIONS pending sessions exist', async () => {
    app = await buildApp(testConfig({ SOTTO_MAX_SESSIONS: 2 }));

    const first = await app.inject({ method: 'POST', url: '/voice/session', payload: sessionBody });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/voice/session',
      payload: sessionBody,
    });
    expect(second.statusCode).toBe(200);

    const third = await app.inject({ method: 'POST', url: '/voice/session', payload: sessionBody });
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({ error: 'too_many_sessions' });
  });
});

describe('POST /voice/session per-IP rate limit', () => {
  it('returns 429 rate_limited past 10 calls/minute from the same IP', async () => {
    app = await buildApp(testConfig({ SOTTO_MAX_SESSIONS: 1000 }));

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/voice/session',
        payload: sessionBody,
        remoteAddress: '9.9.9.9',
      });
      expect(res.statusCode).toBe(200);
    }

    const eleventh = await app.inject({
      method: 'POST',
      url: '/voice/session',
      payload: sessionBody,
      remoteAddress: '9.9.9.9',
    });
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json()).toEqual({ error: 'rate_limited' });
  });

  it('tracks the rate limit independently per IP', async () => {
    app = await buildApp(testConfig({ SOTTO_MAX_SESSIONS: 1000 }));

    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: 'POST',
        url: '/voice/session',
        payload: sessionBody,
        remoteAddress: '1.1.1.1',
      });
    }
    const otherIp = await app.inject({
      method: 'POST',
      url: '/voice/session',
      payload: sessionBody,
      remoteAddress: '2.2.2.2',
    });
    expect(otherIp.statusCode).toBe(200);
  });
});

describe('SOTTO_STATIC_DIR', () => {
  let staticDir: string | undefined;

  afterEach(() => {
    if (staticDir) rmSync(staticDir, { recursive: true, force: true });
    staticDir = undefined;
  });

  function makeStaticDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'sotto-static-'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>sotto</title>');
    writeFileSync(path.join(dir, 'app.css'), 'body { color: red; }');
    return dir;
  }

  it('serves index.html at /', async () => {
    staticDir = makeStaticDir();
    app = await buildApp(testConfig({ SOTTO_STATIC_DIR: staticDir }));

    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>sotto</title>');
  });

  it('serves a real static file by path', async () => {
    staticDir = makeStaticDir();
    app = await buildApp(testConfig({ SOTTO_STATIC_DIR: staticDir }));

    const res = await app.inject({ method: 'GET', url: '/app.css' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('color: red');
  });

  it('falls back to index.html for an unknown extension-less path (SPA routing)', async () => {
    staticDir = makeStaticDir();
    app = await buildApp(testConfig({ SOTTO_STATIC_DIR: staticDir }));

    const res = await app.inject({ method: 'GET', url: '/reader/some-book' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>sotto</title>');
  });

  it('404s a missing path that looks like a file, instead of falling back to the shell', async () => {
    staticDir = makeStaticDir();
    app = await buildApp(testConfig({ SOTTO_STATIC_DIR: staticDir }));

    const res = await app.inject({ method: 'GET', url: '/missing-asset.js' });
    expect(res.statusCode).toBe(404);
  });

  it('still serves /content/packs and /health ahead of the static catch-all', async () => {
    staticDir = makeStaticDir();
    app = await buildApp(testConfig({ SOTTO_STATIC_DIR: staticDir }));

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ ok: true });

    const packs = await app.inject({ method: 'GET', url: '/content/packs' });
    expect(packs.statusCode).toBe(200);
  });

  it('does nothing (no catch-all, existing 404 behavior) when unset', async () => {
    app = await buildApp(testConfig());
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
  });
});

describe('SOTTO_BASIC_AUTH', () => {
  it('allows every route with no credential configured (default, matches no-accounts design)', async () => {
    app = await buildApp(testConfig());
    const res = await app.inject({ method: 'GET', url: '/content/packs' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a protected route with no Authorization header once configured', async () => {
    app = await buildApp(testConfig({ SOTTO_BASIC_AUTH: 'sotto:demo-only' }));
    const res = await app.inject({ method: 'GET', url: '/content/packs' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Basic');
  });

  it('rejects wrong credentials', async () => {
    app = await buildApp(testConfig({ SOTTO_BASIC_AUTH: 'sotto:demo-only' }));
    const wrong = Buffer.from('sotto:wrong-password').toString('base64');
    const res = await app.inject({
      method: 'GET',
      url: '/content/packs',
      headers: { authorization: `Basic ${wrong}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts the correct credential', async () => {
    app = await buildApp(testConfig({ SOTTO_BASIC_AUTH: 'sotto:demo-only' }));
    const good = Buffer.from('sotto:demo-only').toString('base64');
    const res = await app.inject({
      method: 'GET',
      url: '/content/packs',
      headers: { authorization: `Basic ${good}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('leaves /health open even with a credential configured', async () => {
    app = await buildApp(testConfig({ SOTTO_BASIC_AUTH: 'sotto:demo-only' }));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});
