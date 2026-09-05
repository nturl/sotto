import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/** Hand-rolled multipart/form-data body — avoids adding a dependency just
 * for these tests; the shape @fastify/multipart needs is simple enough to
 * build directly (one file part + plain fields). */
function buildMultipart(
  fields: Record<string, string>,
  file: { fieldname: string; filename: string; contentType: string; content: Buffer },
): { body: Buffer; headers: Record<string, string> } {
  const boundary = `----sotto-test-${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\ncontent-disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\ncontent-disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\ncontent-type: ${file.contentType}\r\n\r\n`,
    ),
  );
  parts.push(file.content);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

vi.mock('@sotto/content/import', async () => {
  const actual =
    await vi.importActual<typeof import('@sotto/content/import')>('@sotto/content/import');
  return {
    ...actual,
    importBook: vi.fn(async (source: { bytes: Uint8Array; filename: string }, opts: any) => {
      // A real import takes real time — give the "second request while one
      // is running" test a window to observe the busy state before this
      // resolves.
      await new Promise((resolve) => setTimeout(resolve, 100));
      opts.onProgress?.({ stage: 'parsing', done: 1, total: 1 });
      opts.onProgress?.({ stage: 'detecting', done: 1, total: 1 });
      opts.onProgress?.({ stage: 'glossing', done: 1, total: 1 });
      opts.onProgress?.({ stage: 'translating', done: 1, total: 1 });
      const book = {
        schemaVersion: 1,
        bookId: 'private-abcdef01',
        contentLocale: opts.contentLocale,
        title: 'Stub Book',
        author: 'Stub Author',
        sourceEdition: `Imported from "${source.filename}"`,
        sourceUrl: '',
        sourceJurisdiction: 'Unknown',
        adaptationEditor: 'Imported by the reader (no editor)',
        reviewStatus: 'draft',
        level: 'A1',
        categories: ['daily'],
        estimatedMinutes: 1,
        localizedTitles: {},
        premise: {},
        summary: {},
        contentWarning: null,
        tutorNotes: { pronunciation: '', grammar: '', culture: '', commonErrors: '' },
        vocabulary: [],
        comprehension: [],
        license: { spdx: 'private', attribution: 'Uploaded by the reader for private use' },
        cover: 'cover.svg',
        chapters: [
          {
            id: 'private-abcdef01-01',
            title: 'Chapter 1',
            order: 1,
            file: 'chapters/01.json',
            wordCount: 2,
          },
        ],
        private: true,
      };
      const chapter = {
        id: 'private-abcdef01-01',
        bookId: 'private-abcdef01',
        title: 'Chapter 1',
        order: 1,
        blocks: [],
      };
      return {
        book,
        chapters: [chapter],
        audio: new Map([['01.mp3', new Uint8Array([1, 2, 3])]]),
        attribution: {
          schemaVersion: 1,
          bookId: 'private-abcdef01',
          text: {
            author: 'Stub Author',
            sourceEdition: '',
            sourceUrl: '',
            sourceJurisdiction: '',
            adaptationEditor: '',
            license: book.license,
          },
        },
        stats: {
          chapters: 1,
          wordCount: 2,
          wordTokenCount: 2,
          missingGlosses: 0,
          detectionConfidence: 1,
          elapsedMs: { parsing: 1, detecting: 1, glossing: 1, translating: 1, narrating: 0 },
        },
      };
    }),
    narrateChapter: vi.fn(async () => false),
  };
});

const { buildApp } = await import('../app.js');
const { loadConfig } = await import('../config.js');

function testConfig() {
  return loadConfig({
    SOTTO_STT_URL: 'http://127.0.0.1:9001/v1',
    SOTTO_LLM_URL: 'http://127.0.0.1:8080/v1',
    SOTTO_TTS_URL: 'http://127.0.0.1:8880/v1',
  } as NodeJS.ProcessEnv);
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('POST /import', () => {
  it('accepts a multipart upload and returns a jobId', async () => {
    app = await buildApp(testConfig());

    const { body: payload, headers } = buildMultipart(
      { locale: 'fr-FR', narrate: 'none' },
      {
        fieldname: 'file',
        filename: 'test.txt',
        contentType: 'text/plain',
        content: Buffer.from('Bonjour le monde.'),
      },
    );

    const res = await app.inject({ method: 'POST', url: '/import', payload, headers });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.jobId).toBeTruthy();
  });

  it('rejects a second concurrent import while one is running', async () => {
    app = await buildApp(testConfig());

    const upload = () => {
      const { body: payload, headers } = buildMultipart(
        { locale: 'fr-FR', narrate: 'none' },
        {
          fieldname: 'file',
          filename: 'a.txt',
          contentType: 'text/plain',
          content: Buffer.from('Bonjour.'),
        },
      );
      return app!.inject({ method: 'POST', url: '/import', payload, headers });
    };

    const first = await upload();
    expect(first.statusCode).toBe(202);
    const second = await upload();
    expect(second.statusCode).toBe(429);
  });
});

describe('GET /import/:jobId/result', () => {
  it('returns 404 for an unknown job', async () => {
    app = await buildApp(testConfig());
    const res = await app.inject({ method: 'GET', url: '/import/does-not-exist/result' });
    expect(res.statusCode).toBe(404);
  });

  it('returns the book+chapters once the job finishes', async () => {
    app = await buildApp(testConfig());
    const { body: payload, headers } = buildMultipart(
      { locale: 'fr-FR', narrate: 'none' },
      {
        fieldname: 'file',
        filename: 'test.txt',
        contentType: 'text/plain',
        content: Buffer.from('Bonjour le monde.'),
      },
    );
    const created = await app.inject({ method: 'POST', url: '/import', payload, headers });
    const { jobId } = created.json();

    // The stubbed importBook resolves on a microtask tick — give it a beat.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const res = await app.inject({ method: 'GET', url: `/import/${jobId}/result` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.book.bookId).toBe('private-abcdef01');
    expect(body.chapters).toHaveLength(1);
  });

  it('streams chapter audio bytes', async () => {
    app = await buildApp(testConfig());
    const { body: payload, headers } = buildMultipart(
      { locale: 'fr-FR', narrate: 'none' },
      {
        fieldname: 'file',
        filename: 'test.txt',
        contentType: 'text/plain',
        content: Buffer.from('Bonjour le monde.'),
      },
    );
    const created = await app.inject({ method: 'POST', url: '/import', payload, headers });
    const { jobId } = created.json();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const res = await app.inject({ method: 'GET', url: `/import/${jobId}/audio/01.mp3` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
  });
});

describe('GET /import/:jobId/events', () => {
  it('echoes an allowed Origin back on the raw SSE response (EventSource needs this — see routes.ts)', async () => {
    app = await buildApp(testConfig());
    const { body: payload, headers } = buildMultipart(
      { locale: 'fr-FR', narrate: 'none' },
      {
        fieldname: 'file',
        filename: 'test.txt',
        contentType: 'text/plain',
        content: Buffer.from('Bonjour le monde.'),
      },
    );
    const created = await app.inject({ method: 'POST', url: '/import', payload, headers });
    const { jobId } = created.json();

    const res = await app.inject({
      method: 'GET',
      url: `/import/${jobId}/events`,
      headers: { origin: 'http://localhost:8081' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(res.headers['content-type']).toBe('text/event-stream');
  });
});
