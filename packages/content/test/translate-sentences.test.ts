import { afterEach, describe, expect, it, vi } from 'vitest';
import { chunk } from '../src/gloss-fill.ts';
import {
  collectMissingSentenceTranslations,
  extractJsonObject,
  translateSentencesBatch,
  TRANSLATE_BATCH_SIZE,
  type SentenceToTranslate,
} from '../src/translate-sentences.ts';
import type { SourceBundle } from '../src/types.ts';

function bundleWith(
  sentences: { text: string; translation: Record<string, string> }[],
): SourceBundle {
  return {
    schemaVersion: 1,
    bookId: 'fx-book',
    contentLocale: 'fr-FR',
    title: 'Fixture',
    author: 'Anon',
    sourceEdition: 'public domain',
    sourceUrl: 'https://example.test',
    sourceJurisdiction: 'US',
    adaptationEditor: 'test',
    reviewStatus: 'draft',
    level: 'A1',
    categories: ['fable'],
    estimatedMinutes: 1,
    localizedTitles: { en: 'Fixture' },
    premise: { en: 'A fixture.' },
    summary: { en: 'A fixture book.' },
    contentWarning: null,
    tutorNotes: { pronunciation: '', grammar: '', culture: '', commonErrors: '' },
    vocabulary: [],
    comprehension: [],
    license: { spdx: 'CC0-1.0', attribution: 'none' },
    glossary: {},
    chapters: [
      {
        title: 'Ch1',
        paragraphs: [{ sentences }],
      },
    ],
  } as any as SourceBundle;
}

describe('extractJsonObject', () => {
  it('extracts a JSON object embedded with surrounding prose', () => {
    const text = 'Sure, here it is:\n{"0.0.0": "Bonjour"}\nHope that helps!';
    expect(JSON.parse(extractJsonObject(text))).toEqual({ '0.0.0': 'Bonjour' });
  });

  it('extracts a bare JSON object', () => {
    expect(JSON.parse(extractJsonObject('{"a": "b"}'))).toEqual({ a: 'b' });
  });

  it('throws when there is no JSON object in the text', () => {
    expect(() => extractJsonObject('no json here')).toThrow();
  });
});

describe('collectMissingSentenceTranslations', () => {
  it('finds sentences missing a translation for the requested locale', () => {
    const bundle = bundleWith([
      { text: 'Bonjour.', translation: { en: 'Hello.', es: 'Hola.' } },
      { text: 'Au revoir.', translation: { en: 'Goodbye.' } },
    ]);
    const missing = collectMissingSentenceTranslations(bundle, 'es');
    expect(missing).toEqual([{ key: '0.0.1', text: 'Au revoir.' }]);
  });

  it('returns an empty array when every sentence already has the locale', () => {
    const bundle = bundleWith([{ text: 'Bonjour.', translation: { en: 'Hello.' } }]);
    expect(collectMissingSentenceTranslations(bundle, 'en')).toEqual([]);
  });

  it('addresses sentences by chapter.paragraph.sentence index', () => {
    const bundle = bundleWith([
      { text: 'One.', translation: {} },
      { text: 'Two.', translation: {} },
    ]);
    const missing = collectMissingSentenceTranslations(bundle, 'en');
    expect(missing.map((m) => m.key)).toEqual(['0.0.0', '0.0.1']);
  });
});

describe('batching (shared chunk helper, TRANSLATE_BATCH_SIZE)', () => {
  it('splits a large sentence list into batches no larger than TRANSLATE_BATCH_SIZE', () => {
    const sentences: SentenceToTranslate[] = Array.from({ length: 45 }, (_, i) => ({
      key: `0.0.${i}`,
      text: `Sentence ${i}`,
    }));
    const batches = chunk(sentences, TRANSLATE_BATCH_SIZE);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(TRANSLATE_BATCH_SIZE);
    expect(batches.at(-1)).toHaveLength(45 - 2 * TRANSLATE_BATCH_SIZE);
  });
});

describe('translateSentencesBatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a well-formed JSON response into a key -> translation map', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"0.0.0": "Hello there."}' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateSentencesBatch([{ key: '0.0.0', text: 'Bonjour.' }], {
      baseUrl: 'http://127.0.0.1:8080/v1',
      model: 'qwen3.6-35b-a3b',
      targetLocaleName: 'English',
      contentLanguageName: 'French',
    });

    expect(result).toEqual({ '0.0.0': 'Hello there.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8080/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.cache_prompt).toBe(true);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.messages[0].role).toBe('system');
  });

  it('returns an empty object without calling fetch when there is nothing to translate', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await translateSentencesBatch([], {
      baseUrl: 'http://127.0.0.1:8080/v1',
      model: 'qwen3.6-35b-a3b',
      targetLocaleName: 'English',
      contentLanguageName: 'French',
    });
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when given more sentences than the batch size', async () => {
    const tooMany: SentenceToTranslate[] = Array.from(
      { length: TRANSLATE_BATCH_SIZE + 1 },
      (_, i) => ({
        key: `0.0.${i}`,
        text: `s${i}`,
      }),
    );
    await expect(
      translateSentencesBatch(tooMany, {
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'qwen3.6-35b-a3b',
        targetLocaleName: 'English',
        contentLanguageName: 'French',
      }),
    ).rejects.toThrow(/max is/);
  });

  it('throws when the LLM response is not valid JSON shaped as string -> string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"0.0.0": {"nested": true}}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      translateSentencesBatch([{ key: '0.0.0', text: 'Bonjour.' }], {
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'qwen3.6-35b-a3b',
        targetLocaleName: 'English',
        contentLanguageName: 'French',
      }),
    ).rejects.toThrow(/not the expected shape/);
  });

  it('throws when the HTTP request itself fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'err' });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      translateSentencesBatch([{ key: '0.0.0', text: 'Bonjour.' }], {
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'qwen3.6-35b-a3b',
        targetLocaleName: 'English',
        contentLanguageName: 'French',
      }),
    ).rejects.toThrow(/request failed/);
  });
});
