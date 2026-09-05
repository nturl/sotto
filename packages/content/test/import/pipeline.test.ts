import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLanguage } from '@sotto/core';
import { GLOSS_LOCALES } from '../../src/gloss-fill.ts';
import { generateCoverSvg } from '../../src/covers.ts';
import { chapterFileName } from '../../src/paths.ts';
import { importBook } from '../../src/import/pipeline.ts';
import { validatePackDir } from '../../src/validate.ts';
import type { ImportProgress } from '../../src/import/types.ts';

/** A fake OpenAI-compatible /chat/completions endpoint good enough for
 * both gloss-fill.ts's fillGlossesBatch and translate-sentences.ts's
 * translateSentencesBatch — it inspects the user message to tell the two
 * call shapes apart and fabricates a plausible JSON reply for whichever
 * one it sees. */
function fakeLlmFetch(): typeof fetch {
  return vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    if (!url.endsWith('/chat/completions')) {
      throw new Error(`unexpected fetch in test: ${url}`);
    }
    const body = JSON.parse(String(init?.body)) as {
      messages: { role: string; content: string }[];
    };
    const userMessage = body.messages.find((m) => m.role === 'user')?.content ?? '';

    if (userMessage.startsWith('Words:')) {
      const words = [...userMessage.matchAll(/- "([^"]+)"/g)].map((m) => m[1] as string);
      const reply: Record<string, Record<string, string>> = {};
      for (const word of words) {
        const entry: Record<string, string> = {};
        for (const locale of GLOSS_LOCALES) entry[locale] = `${word}-${locale}`;
        reply[word] = entry;
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (userMessage.startsWith('Sentences:')) {
      const keys = [...userMessage.matchAll(/- "([^"]+)":/g)].map((m) => m[1] as string);
      const reply: Record<string, string> = {};
      for (const key of keys) reply[key] = `translated-${key}`;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    throw new Error(`unrecognized LLM request in test: ${userMessage.slice(0, 80)}`);
  }) as unknown as typeof fetch;
}

describe('importBook', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses, glosses, and translates a plain-text book with narrate: "none"', async () => {
    global.fetch = fakeLlmFetch();
    const events: ImportProgress[] = [];
    const source = {
      bytes: new TextEncoder().encode(
        'Le petit chat dort. Il rêve de poissons.\n\nLe lendemain, il joue dans le jardin.',
      ),
      filename: 'histoire.txt',
    };

    const result = await importBook(source, {
      contentLocale: 'fr-FR',
      llm: { baseUrl: 'http://llm.test/v1', model: 'test-model' },
      narrate: 'none',
      onProgress: (e) => events.push(e),
    });

    expect(result.book.bookId).toMatch(/^private-[0-9a-f]{8}$/);
    expect(result.book.contentLocale).toBe('fr-FR');
    expect(result.book.private).toBe(true);
    expect(result.book.license.spdx).toBe('private');
    expect(result.chapters.length).toBeGreaterThan(0);
    expect(result.audio.size).toBe(0);

    // Every word token got a gloss for every GLOSS_LOCALES entry.
    const firstSentence = result.chapters[0]?.blocks[0]?.sentences[0];
    expect(firstSentence).toBeDefined();
    const wordToken = firstSentence?.tokens.find((t) => t.isWord);
    expect(wordToken?.glosses).toBeDefined();
    for (const locale of GLOSS_LOCALES) {
      expect(wordToken?.glosses?.[locale]).toBeTruthy();
    }

    // Every sentence has a translation for every GLOSS_LOCALES entry
    // (the own-language one via the identity shortcut, the rest via the
    // fake LLM).
    for (const locale of GLOSS_LOCALES) {
      expect(firstSentence?.translations[locale]).toBeTruthy();
    }
    expect(firstSentence?.translations.fr).toBe(firstSentence?.text);

    expect(events.some((e) => e.stage === 'parsing')).toBe(true);
    expect(events.some((e) => e.stage === 'detecting')).toBe(true);
    expect(events.some((e) => e.stage === 'glossing')).toBe(true);
    expect(events.some((e) => e.stage === 'translating')).toBe(true);
  });

  it('produces a pack the existing validator accepts with no errors', async () => {
    global.fetch = fakeLlmFetch();
    const source = {
      bytes: new TextEncoder().encode('Le petit chat dort. Il rêve de poissons.'),
      filename: 'petit.txt',
    };
    const result = await importBook(source, {
      contentLocale: 'fr-FR',
      llm: { baseUrl: 'http://llm.test/v1', model: 'test-model' },
      narrate: 'none',
    });

    const dir = mkdtempSync(path.join(tmpdir(), 'sotto-import-validate-'));
    try {
      const localeDir = path.join(dir, 'fr-FR');
      const bookDir = path.join(localeDir, 'books', result.book.bookId);
      mkdirSync(path.join(bookDir, 'chapters'), { recursive: true });
      writeFileSync(
        path.join(localeDir, 'pack.json'),
        JSON.stringify(
          {
            schemaVersion: 1,
            locale: 'fr-FR',
            language: getLanguage('fr-FR'),
            books: [],
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf8',
      );
      writeFileSync(path.join(bookDir, 'book.json'), JSON.stringify(result.book, null, 2), 'utf8');
      for (const chapter of result.chapters) {
        writeFileSync(
          path.join(bookDir, 'chapters', chapterFileName(chapter.order)),
          JSON.stringify(chapter, null, 2),
          'utf8',
        );
      }
      writeFileSync(
        path.join(bookDir, 'attribution.json'),
        JSON.stringify(result.attribution, null, 2),
        'utf8',
      );
      writeFileSync(
        path.join(bookDir, 'cover.svg'),
        generateCoverSvg({
          bookId: result.book.bookId,
          title: result.book.title,
          author: result.book.author,
          category: 'daily',
        }),
        'utf8',
      );
      expect(existsSync(path.join(bookDir, 'book.json'))).toBe(true);

      const issues = validatePackDir(localeDir);
      const errors = issues.filter((i) => (i.severity ?? 'error') === 'error');
      expect(errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
