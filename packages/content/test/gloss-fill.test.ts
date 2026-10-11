import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chunk,
  fillGlossesBatch,
  fillGrammarBatch,
  GLOSS_FILL_BATCH_SIZE,
  GLOSS_LOCALES,
  isLlmReachable,
  parseFillEntry,
} from '../src/gloss-fill.ts';
import { fillMissingGrammar, tokenGrammarFields, wordsMissingGrammar } from '../src/build.ts';
import { SourceBundleSchema, type SourceBundle } from '../src/types.ts';

describe('chunk', () => {
  it('splits an array into chunks of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when the array is smaller than the chunk size', () => {
    expect(chunk([1, 2], 40)).toEqual([[1, 2]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('respects the documented gloss-fill batch size', () => {
    const words = Array.from({ length: 95 }, (_, i) => i);
    const chunks = chunk(words, GLOSS_FILL_BATCH_SIZE);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(GLOSS_FILL_BATCH_SIZE);
    expect(chunks.at(-1)).toHaveLength(95 - 2 * GLOSS_FILL_BATCH_SIZE);
  });
});

describe('isLlmReachable', () => {
  it('returns false quickly for a URL nothing is listening on', async () => {
    const reachable = await isLlmReachable('http://127.0.0.1:1', 300);
    expect(reachable).toBe(false);
  });
});

/** A fake /chat/completions endpoint that replies with `reply` as the message content. */
function fakeFetch(reply: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

const llmOpts = { baseUrl: 'http://llm.test/v1', model: 'test-model' };

function glossesFor(word: string): Record<string, string> {
  return Object.fromEntries(GLOSS_LOCALES.map((l) => [l, `${word}-${l}`]));
}

describe('parseFillEntry', () => {
  it('splits glosses from lemma and grammar', () => {
    const parsed = parseFillEntry({
      ...glossesFor('levait'),
      lemma: ' se lever ',
      grammar: { en: 'verb · imparfait · 3rd sing.', fr: 'verbe · imparfait · 3e sing.' },
    });
    expect(parsed.glosses).toEqual(glossesFor('levait'));
    expect(parsed.lemma).toBe('se lever');
    expect(parsed.grammar).toEqual({
      en: 'verb · imparfait · 3rd sing.',
      fr: 'verbe · imparfait · 3e sing.',
    });
  });

  it('drops a malformed lemma or grammar instead of failing', () => {
    const parsed = parseFillEntry({
      ...glossesFor('chat'),
      lemma: 42,
      grammar: 'noun',
    });
    expect(parsed.glosses).toEqual(glossesFor('chat'));
    expect(parsed).not.toHaveProperty('lemma');
    expect(parsed).not.toHaveProperty('grammar');
  });

  it('keeps only non-empty string tags for known locales', () => {
    const parsed = parseFillEntry({ lemma: '', grammar: { en: 'noun', xx: 'bad', fr: 3 } });
    expect(parsed).not.toHaveProperty('lemma');
    expect(parsed.grammar).toEqual({ en: 'noun' });
  });
});

describe('fillGlossesBatch with grammar (mocked backend)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns glosses, lemma and grammar from one call, keeping words in context', async () => {
    global.fetch = fakeFetch({
      est: { ...glossesFor('est'), lemma: 'être', grammar: { en: 'verb · present · 3rd sing.' } },
      chat: { ...glossesFor('chat'), lemma: 'chat', grammar: { en: 'noun · masc. sing.' } },
      la: { ...glossesFor('la') },
    });
    const out = await fillGlossesBatch(
      [
        { word: 'est', contextSentence: 'Le chat est gris.' },
        { word: 'chat', contextSentence: 'Le chat est gris.' },
        { word: 'la', contextSentence: 'Elle voit la souris.' },
      ],
      { ...llmOpts, needsPinyin: false, contentLanguageName: 'French', withGrammar: true },
    );
    expect(out.est).toEqual({
      glosses: glossesFor('est'),
      lemma: 'être',
      grammar: { en: 'verb · present · 3rd sing.' },
    });
    expect(out.la).toEqual({ glosses: glossesFor('la') });
    const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body)) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages[0]?.content).toContain('lemma');
    expect(body.messages[1]?.content).toContain('(in context: "Le chat est gris.")');
  });

  it('leaves lemma/grammar out of the result when withGrammar is off', async () => {
    global.fetch = fakeFetch({ chat: { ...glossesFor('chat'), lemma: 'chat' } });
    const out = await fillGlossesBatch([{ word: 'chat', contextSentence: 'Le chat.' }], {
      ...llmOpts,
      needsPinyin: false,
      contentLanguageName: 'French',
    });
    expect(out.chat).toEqual({ glosses: glossesFor('chat') });
  });

  it('fillGrammarBatch parses lemma and grammar only', async () => {
    global.fetch = fakeFetch({
      mangé: { lemma: 'manger', grammar: { en: 'verb · past participle' }, en: 'eaten' },
      bizarre: { lemma: null },
    });
    const out = await fillGrammarBatch(
      [
        { word: 'mangé', contextSentence: 'Il a mangé.' },
        { word: 'bizarre', contextSentence: 'Un chat bizarre.' },
      ],
      { ...llmOpts, contentLanguageName: 'French' },
    );
    expect(out).toEqual({
      mangé: { lemma: 'manger', grammar: { en: 'verb · past participle' } },
      bizarre: {},
    });
  });
});

describe('tokenGrammarFields', () => {
  it('omits the lemma when it equals the word, case-insensitively', () => {
    expect(tokenGrammarFields({ lemma: 'Chat', grammar: { en: 'noun' } }, 'chat')).toEqual({
      grammar: { en: 'noun' },
    });
  });

  it('keeps a lemma that differs from the word', () => {
    expect(tokenGrammarFields({ lemma: 'être' }, 'est')).toEqual({ lemma: 'être' });
  });

  it('returns nothing for an entry without the fields', () => {
    expect(tokenGrammarFields({}, 'chat')).toEqual({});
  });
});

describe('grammar backfill', () => {
  function makeBundle(): SourceBundle {
    return {
      contentLocale: 'fr-FR',
      chapters: [
        {
          title: 'Un',
          paragraphs: [{ sentences: [{ text: 'Le chat est gris.', translation: {} }] }],
        },
      ],
      glossary: {
        le: { ...glossesFor('le'), lemma: 'le', grammar: { en: 'article · masc. sing.' } },
        chat: glossesFor('chat'),
        est: glossesFor('est'),
        gris: glossesFor('gris'),
      },
    } as unknown as SourceBundle;
  }

  it('the source schema accepts lemma and grammar on glossary entries', () => {
    const entry = SourceBundleSchema.shape.glossary.safeParse({
      est: { en: 'is', lemma: 'être', grammar: { en: 'verb' } },
    });
    expect(entry.success).toBe(true);
    const bad = SourceBundleSchema.shape.glossary.safeParse({ est: { lemma: 3 } });
    expect(bad.success).toBe(false);
  });

  it('fills only entries without grammar, keeps glosses, and is idempotent', async () => {
    const bundle = makeBundle();
    expect(wordsMissingGrammar(bundle, 'latin').sort()).toEqual(['chat', 'est', 'gris']);

    const batchFn = vi.fn(async (words: { word: string }[]) => {
      const out: Record<string, { lemma?: string; grammar?: Record<string, string> }> = {};
      for (const { word } of words) {
        // "gris" comes back malformed: it must stay without grammar.
        if (word === 'gris') out[word] = {};
        else out[word] = { lemma: word === 'est' ? 'être' : word, grammar: { en: `tag-${word}` } };
      }
      return out;
    });
    const save = vi.fn();
    const llm = { llmUrl: 'http://llm.test/v1', llmModel: 'm', backend: 'local' as const };

    const first = await fillMissingGrammar(bundle, llm, save, batchFn);
    expect(first).toEqual({ filled: 2, attempted: 3 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(bundle.glossary.est).toEqual({
      ...glossesFor('est'),
      lemma: 'être',
      grammar: { en: 'tag-est' },
    });
    expect(bundle.glossary.gris).toEqual(glossesFor('gris'));
    expect(batchFn.mock.calls[0]?.[0]).toContainEqual({
      word: 'est',
      contextSentence: 'Le chat est gris.',
    });

    // Second run only retries the word that failed; filled entries are untouched.
    const snapshot = JSON.stringify(bundle.glossary.est);
    const second = await fillMissingGrammar(bundle, llm, save, batchFn);
    expect(second).toEqual({ filled: 0, attempted: 1 });
    expect(batchFn.mock.calls[1]?.[0].map((w) => w.word)).toEqual(['gris']);
    expect(JSON.stringify(bundle.glossary.est)).toBe(snapshot);
  });

  it('makes no call when nothing is missing', async () => {
    const bundle = makeBundle();
    for (const word of Object.keys(bundle.glossary)) {
      bundle.glossary[word] = { ...bundle.glossary[word], grammar: { en: 'x' } } as never;
    }
    const batchFn = vi.fn();
    const result = await fillMissingGrammar(
      bundle,
      { llmUrl: 'u', llmModel: 'm', backend: 'local' },
      vi.fn(),
      batchFn,
    );
    expect(result).toEqual({ filled: 0, attempted: 0 });
    expect(batchFn).not.toHaveBeenCalled();
  });
});
