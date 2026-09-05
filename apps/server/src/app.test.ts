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
