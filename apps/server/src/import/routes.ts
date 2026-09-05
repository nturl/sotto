/**
 * `/import` routes (planning/LEDGER.md "R3-I Importer"). This server has
 * no auth (see security.ts) — it is localhost-only by default
 * (config.SOTTO_HOST defaults to 127.0.0.1) and CORS-gated to localhost
 * origins the same way every other route here is, so a POST /import is no
 * more exposed than the existing /voice/session path.
 */
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import { isOriginAllowed, parseAllowedOrigins } from '../security.js';
import { ImportError, narrateChapter, type NarrationMode } from '@sotto/content/import';
import { ImportJobRegistry } from './jobs.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// Finding 9 (adversarial review 3): an unbounded number of SSE clients per
// job, with no max stream duration, is an easy resource leak against an
// unauthenticated route. Bound both.
const MAX_SSE_CLIENTS_PER_JOB = 4;
const MAX_SSE_STREAM_MS = 60 * 60_000;

// Mirrors app.ts's DEFAULT_CORS_ORIGINS (not exported from there) — this
// route writes straight to the raw response for its SSE stream, which
// skips @fastify/cors's normal onSend-hook header injection, so it needs
// its own Access-Control-Allow-Origin check.
const DEFAULT_CORS_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081,http://localhost:8082';

const importFieldsSchema = z.object({
  locale: z.string().min(2),
  narrate: z.enum(['none', 'first', 'all']).default('first'),
  level: z.enum(['A0', 'A1', 'A2']).optional(),
});

function audioContentType(file: string): string {
  return file.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
}

export async function importRoutes(app: FastifyInstance, config: Config): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });

  const registry = new ImportJobRegistry();
  const llm = {
    baseUrl: config.SOTTO_LLM_URL,
    model: config.SOTTO_LLM_MODEL,
    apiKey: config.SOTTO_API_KEY,
  };
  const tts = { baseUrl: config.SOTTO_TTS_URL, apiKey: config.SOTTO_API_KEY };
  const stt = { baseUrl: config.SOTTO_STT_URL, apiKey: config.SOTTO_API_KEY };
  const allowedOrigins = parseAllowedOrigins(config.SOTTO_CORS_ORIGINS, DEFAULT_CORS_ORIGINS);

  app.post('/import', async (request, reply) => {
    if (registry.isBusy()) {
      reply.code(429);
      return { error: 'import_in_progress' };
    }

    let fileBytes: Uint8Array | undefined;
    let filename = 'upload';
    const fields: Record<string, string> = {};

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        filename = part.filename;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        fileBytes = new Uint8Array(Buffer.concat(chunks));
        if (part.file.truncated) {
          reply.code(413);
          return { error: 'file_too_large', maxBytes: MAX_UPLOAD_BYTES };
        }
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (!fileBytes) {
      reply.code(400);
      return { error: 'missing_file' };
    }
    const parsedFields = importFieldsSchema.safeParse(fields);
    if (!parsedFields.success) {
      reply.code(400);
      return { error: 'invalid_fields', issues: parsedFields.error.flatten() };
    }

    try {
      const job = registry.start(
        { bytes: fileBytes, filename },
        {
          contentLocale: parsedFields.data.locale,
          level: parsedFields.data.level,
          llm,
          tts: parsedFields.data.narrate === 'none' ? undefined : tts,
          stt: parsedFields.data.narrate === 'none' ? undefined : stt,
          narrate: parsedFields.data.narrate as NarrationMode,
        },
      );
      reply.code(202);
      return { jobId: job.id };
    } catch (err) {
      if (err instanceof ImportError) {
        reply.code(422);
        return { error: err.code, message: err.message };
      }
      reply.code(429);
      return { error: 'import_in_progress' };
    }
  });

  app.get('/import/:jobId/events', (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = registry.get(jobId);
    if (!job) {
      reply.code(404);
      void reply.send({ error: 'not_found' });
      return;
    }
    if (job.listeners.size >= MAX_SSE_CLIENTS_PER_JOB) {
      reply.code(429);
      void reply.send({ error: 'too_many_streams' });
      return;
    }

    const origin = request.headers.origin;
    const headers: Record<string, string> = {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    };
    // EventSource issues a plain cross-origin GET (no preflight) — the
    // browser still requires Access-Control-Allow-Origin on the response,
    // which @fastify/cors' onSend hook never runs for a raw-written
    // response like this SSE stream, so it's set by hand here.
    if (isOriginAllowed(origin, allowedOrigins) && origin) {
      headers['access-control-allow-origin'] = origin;
    }
    reply.raw.writeHead(200, headers);

    const send = (payload: unknown): void => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    for (const event of job.events) send(event);
    if (job.status !== 'running') {
      send({ stage: 'done', status: job.status, error: job.error });
      reply.raw.end();
      return;
    }

    const listener = (event: unknown): void => send(event);
    job.listeners.add(listener);

    const cleanup = (): void => {
      clearInterval(finishCheck);
      clearTimeout(maxDuration);
      job.listeners.delete(listener);
    };

    const finishCheck = setInterval(() => {
      if (job.status !== 'running') {
        send({ stage: 'done', status: job.status, error: job.error });
        cleanup();
        reply.raw.end();
      }
    }, 500);

    // A stream that outlives MAX_SSE_STREAM_MS is closed regardless of job
    // status — a client that never disconnects otherwise holds this
    // listener (and the interval) open indefinitely.
    const maxDuration = setTimeout(() => {
      cleanup();
      reply.raw.end();
    }, MAX_SSE_STREAM_MS);

    request.raw.on('close', cleanup);
  });

  app.get('/import/:jobId/result', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = registry.get(jobId);
    if (!job) {
      reply.code(404);
      return { error: 'not_found' };
    }
    if (job.status === 'running') {
      reply.code(202);
      return { status: 'running' };
    }
    if (job.status === 'error') {
      reply.code(422);
      return { error: 'import_failed', message: job.error };
    }
    return { book: job.result?.book, chapters: job.result?.chapters };
  });

  app.get('/import/:jobId/audio/:file', async (request, reply) => {
    const { jobId, file } = request.params as { jobId: string; file: string };
    const job = registry.get(jobId);
    if (!job || job.status !== 'done' || !job.result) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const bytes = job.result.audio.get(file);
    if (!bytes) {
      reply.code(404);
      return { error: 'not_found' };
    }
    reply.header('content-type', audioContentType(file));
    return reply.send(Buffer.from(bytes));
  });

  app.post('/import/:jobId/narrate/:chapterIndex', async (request, reply) => {
    const { jobId, chapterIndex } = request.params as { jobId: string; chapterIndex: string };
    const job = registry.get(jobId);
    if (!job || job.status !== 'done' || !job.result) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const index = Number(chapterIndex);
    if (!Number.isInteger(index) || index < 0 || index >= job.result.chapters.length) {
      reply.code(400);
      return { error: 'invalid_chapter_index' };
    }
    try {
      const narrated = await narrateChapter(job.result, index, { tts, stt });
      return {
        narrated,
        chapter: job.result.book.chapters[index],
      };
    } catch (err) {
      reply.code(500);
      return { error: 'narrate_failed', message: err instanceof Error ? err.message : String(err) };
    }
  });
}
