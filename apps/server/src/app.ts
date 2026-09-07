import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { Config } from './config.js';
import { RateLimiter, isBasicAuthValid, isOriginAllowed, parseAllowedOrigins } from './security.js';
import { activeVadBackend, createVad } from './voice/vad.js';
import { clientMessageSchema, sessionOptionsSchema, type ServerMessage } from './voice/types.js';
import { SessionRegistry } from './voice/registry.js';
import { VoiceSession } from './voice/session.js';
import { importRoutes } from './import/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_PACKS_DIR = path.resolve(__dirname, '../../../packages/content/packs');

const DEFAULT_CORS_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081,http://localhost:8082';

const LIMITS = { maxMs: 1_200_000, idleMs: 90_000 };

/**
 * Builds and registers the Fastify app (CORS, static content, /health,
 * /content/packs, /voice/session, /voice/ws) without calling `listen()` —
 * kept separate so tests can exercise it via `app.inject()`. `index.ts` is
 * the thin entrypoint that calls this and then listens.
 */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Voice sessions juggle several concurrent in-flight fetches (STT/LLM/TTS)
  // that get aborted on barge-in; Node's undici fetch can surface an abort as
  // an unhandled rejection from internal stream plumbing even when every
  // awaited call site here has its own try/catch (verified 2026-09-04 — see
  // docs/voice-pipeline.md "Known issues"). Node's default is to crash the
  // process on any unhandled rejection, which would take down every session,
  // not just the one that hit the race — log and keep serving instead.
  process.on('unhandledRejection', (reason) => {
    app.log.error(
      { err: reason instanceof Error ? reason.message : String(reason) },
      'unhandled rejection (ignored, server continues)',
    );
  });

  const sessionRegistry = new SessionRegistry();
  const activeSessions = new Map<string, VoiceSession>();
  const allowedOrigins = parseAllowedOrigins(config.SOTTO_CORS_ORIGINS, DEFAULT_CORS_ORIGINS);
  const sessionCreateLimiter = new RateLimiter(10, 60_000);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (isOriginAllowed(origin, allowedOrigins)) {
        cb(null, true);
        return;
      }
      cb(new Error('origin not allowed'), false);
    },
  });
  await app.register(fastifyWebsocket);

  // Optional privacy fence for a self-hosted instance (docs/self-hosting.md):
  // a single shared `user:pass` credential over HTTP Basic, required on
  // every route except /health (so health checks/monitoring don't need the
  // credential). Off by default, matching the rest of this server's
  // no-accounts design (docs/voice-pipeline.md "Security").
  if (config.SOTTO_BASIC_AUTH) {
    const credentials = config.SOTTO_BASIC_AUTH;
    app.addHook('onRequest', async (request, reply) => {
      if (request.url === '/health' || request.url.startsWith('/health?')) return;
      if (!isBasicAuthValid(request.headers.authorization, credentials)) {
        reply.header('WWW-Authenticate', 'Basic realm="sotto"');
        reply.code(401).send({ error: 'unauthorized' });
      }
    });
  }

  await app.register(importRoutes, config);

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

  /** whisper.cpp's whisper-server has no /v1/models; it serves an HTML form at
   * its root, so probe that instead when the STT URL looks like whisper.cpp
   * (i.e. the /models probe fails but the bare host responds). */
  async function probeStt(baseUrl: string): Promise<boolean> {
    if (await probeModelsEndpoint(baseUrl)) return true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const root = baseUrl.replace(/\/v1\/?$/, '/');
      const res = await fetch(root, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  app.get('/health', async () => {
    const [stt, llm, tts] = await Promise.all([
      probeStt(config.SOTTO_STT_URL),
      probeModelsEndpoint(config.SOTTO_LLM_URL),
      probeModelsEndpoint(config.SOTTO_TTS_URL),
    ]);
    return { ok: true, stt, llm, tts, vad: activeVadBackend() };
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

  app.post('/voice/session', async (request, reply) => {
    if (!sessionCreateLimiter.allow(request.ip)) {
      reply.code(429);
      return { error: 'rate_limited' };
    }

    const concurrent = sessionRegistry.size() + activeSessions.size;
    if (concurrent >= config.SOTTO_MAX_SESSIONS) {
      reply.code(429);
      return { error: 'too_many_sessions' };
    }

    const parsed = sessionOptionsSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid session options', issues: parsed.error.flatten() };
    }

    const sessionId = randomUUID();
    sessionRegistry.create(sessionId, parsed.data);

    const host =
      request.headers.host ??
      `${config.SOTTO_HOST === '0.0.0.0' ? 'localhost' : config.SOTTO_HOST}:${config.SOTTO_PORT}`;
    const proto = request.protocol === 'https' ? 'wss' : 'ws';

    return {
      sessionId,
      wsUrl: `${proto}://${host}/voice/ws?session=${sessionId}`,
      sampleRate: 16000,
      limits: LIMITS,
    };
  });

  await app.register(async (instance) => {
    instance.get('/voice/ws', { websocket: true }, (socket, request) => {
      // Native clients (Expo Go, iOS/Android builds) never send an Origin
      // header — only browsers do. Reject a browser whose origin isn't
      // allowed; an absent origin passes through to the native-client path.
      const origin = request.headers.origin;
      if (origin && !isOriginAllowed(origin, allowedOrigins)) {
        socket.close();
        return;
      }

      const url = new URL(request.url, 'http://localhost');
      const sessionId = url.searchParams.get('session');
      const options = sessionId ? sessionRegistry.take(sessionId) : null;

      if (!sessionId || !options) {
        socket.send(
          JSON.stringify({
            t: 'error',
            code: 'invalid_session',
            message: 'unknown or expired session id',
            recoverable: false,
          } satisfies ServerMessage),
        );
        socket.close();
        return;
      }

      void (async () => {
        const vad = await createVad(app.log);

        const send = (msg: ServerMessage) => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
        };
        const sendAudio = (chunk: Uint8Array) => {
          if (socket.readyState === socket.OPEN) socket.send(chunk);
        };

        const session = new VoiceSession(
          sessionId,
          options,
          {
            stt: {
              url: config.SOTTO_STT_URL,
              model: config.SOTTO_STT_MODEL,
              apiKey: config.SOTTO_API_KEY,
            },
            llm: {
              url: config.SOTTO_LLM_URL,
              model: config.SOTTO_LLM_MODEL,
              apiKey: config.SOTTO_API_KEY,
            },
            tts: {
              url: config.SOTTO_TTS_URL,
              model: config.SOTTO_TTS_MODEL,
              apiKey: config.SOTTO_API_KEY,
            },
            limits: LIMITS,
          },
          vad,
          send,
          sendAudio,
          app.log,
          (reason) => {
            app.log.info({ sessionId, reason }, 'voice session ended');
            activeSessions.delete(sessionId);
            if (socket.readyState === socket.OPEN) socket.close();
          },
        );
        activeSessions.set(sessionId, session);
        session.beginOpeningTurn();

        const onSessionError = (err: unknown, context: string) => {
          app.log.error(
            { sessionId, context, err: err instanceof Error ? err.message : String(err) },
            'unhandled voice session error',
          );
        };

        socket.on('message', (data: Buffer, isBinary: boolean) => {
          if (isBinary) {
            session
              .receiveAudioFrame(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
              .catch((err) => onSessionError(err, 'receiveAudioFrame'));
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(data.toString('utf-8'));
          } catch {
            return;
          }
          const result = clientMessageSchema.safeParse(parsed);
          if (!result.success) {
            send({
              t: 'error',
              code: 'invalid_message',
              message: 'malformed client message',
              recoverable: true,
            });
            return;
          }
          session.receiveMessage(result.data).catch((err) => onSessionError(err, 'receiveMessage'));
        });

        socket.on('close', () => {
          session.endSession('socket_closed');
          activeSessions.delete(sessionId);
        });
      })();
    });
  });

  // Serves a static web build (apps/client's `dist/`, from `pnpm web:export`)
  // at `/`, so the phone PWA can talk to this server as a single origin with
  // no accounts (docs/self-hosting.md). Registered last so it never shadows
  // the routes above: Fastify's router matches by path specificity, not
  // registration order, but a missing file here falls through to the
  // SPA-fallback 404 handler below, which must not swallow a genuinely
  // missing /content/packs/... asset or a mistyped /voice//import path —
  // it only serves index.html for extension-less paths, mirroring
  // apps/client/scripts/serve-static.mjs's same rule.
  if (config.SOTTO_STATIC_DIR) {
    const staticDir = config.SOTTO_STATIC_DIR;
    // Newer exports (apps/client/scripts/build-web.mjs, since run 5) split the
    // static landing page (index.html, owns "/") from the Expo app shell
    // (app.html, everything else) — mirrors serve-static.mjs's same rule.
    // Older exports only have index.html; fall back to it everywhere.
    const hasAppShell = existsSync(path.join(staticDir, 'app.html'));
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      wildcard: true,
      decorateReply: false,
    });

    app.setNotFoundHandler((request, reply) => {
      const pathname = request.url.split('?')[0] ?? request.url;
      if (request.method === 'GET' && !path.extname(pathname)) {
        const shellFile = hasAppShell && pathname !== '/' ? 'app.html' : 'index.html';
        return reply.sendFile(shellFile, staticDir);
      }
      reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}
