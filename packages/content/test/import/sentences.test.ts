import { describe, expect, it } from 'vitest';
import { splitSentences } from '../../src/import/sentences.ts';

// Oracle: the original backtracking regex implementation, kept here only
// to assert the new linear scan (packages/content/src/import/sentences.ts)
// produces identical output on a corpus of realistic paragraphs. Never run
// this oracle on the pathological long input in the perf test below — that
// is exactly the input the rewrite exists to stop being quadratic on.
const ORACLE_LATIN_RE = /[^.!?…]+(?:[.!?…]+(?=["'’”)\]]*(?:\s+|$))|$)/gu;
const ORACLE_CJK_RE = /[^。！？…]+(?:[。！？…]+|$)/gu;

function oracleSplit(paragraph: string, typography: 'latin' | 'cjk'): string[] {
  const re = typography === 'cjk' ? ORACLE_CJK_RE : ORACLE_LATIN_RE;
  re.lastIndex = 0;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(paragraph))) {
    const sentence = match[0].trim();
    if (sentence.length > 0) out.push(sentence);
  }
  return out.length > 0 ? out : [paragraph.trim()].filter((s) => s.length > 0);
}

const LATIN_CORPUS = [
  'Le petit chat dort. Il rêve de poissons.',
  'Le lendemain, il joue dans le jardin.',
  'Wait! What is this? A mystery…',
  '"Come here," she said. "It is safe."',
  "She said 'stop!' and ran.",
  'The box (closed) fell. It broke.',
  'Mr. Smith went home',
  'Hello world',
  '   leading and trailing whitespace.   ',
  'One.Two.Three.',
  'A sentence ending in ellipsis…',
  'A quoted ellipsis…" continues.',
  '',
  '.',
  '...',
  'No terminator at all just words',
  'Multiple   spaces   between words. Then more.',
  'Nested "quotes \'inside\' quotes." Done.',
];

const CJK_CORPUS = [
  '你好。今天天气很好！',
  '这是什么？我不知道…',
  '没有终止符的句子',
  '第一句。第二句！第三句？',
];

describe('splitSentences (linear scan) parity with the original regex', () => {
  it('matches the oracle on a corpus of realistic Latin paragraphs', () => {
    for (const paragraph of LATIN_CORPUS) {
      expect(splitSentences(paragraph, 'latin')).toEqual(oracleSplit(paragraph, 'latin'));
    }
  });

  it('matches the oracle on a corpus of CJK paragraphs', () => {
    for (const paragraph of CJK_CORPUS) {
      expect(splitSentences(paragraph, 'cjk')).toEqual(oracleSplit(paragraph, 'cjk'));
    }
  });

  it('drops a terminator with no trailing boundary, same as the original (e.g. "3.14")', () => {
    // Documented behaviour carried forward unchanged: "3." has no
    // whitespace/end boundary after its period, so it is dropped and the
    // next sentence starts fresh.
    expect(splitSentences('3.14 is pi.', 'latin')).toEqual(oracleSplit('3.14 is pi.', 'latin'));
  });

  it('produces normal, sane output for ordinary prose', () => {
    expect(splitSentences('Le petit chat dort. Il rêve de poissons.', 'latin')).toEqual([
      'Le petit chat dort.',
      'Il rêve de poissons.',
    ]);
  });
});

describe('splitSentences performance (finding 6)', () => {
  it('splits a 200,000-character single paragraph in under 200ms', () => {
    // A long run of non-terminator characters with periods that don't sit
    // at a word boundary is exactly the shape that made the old
    // backtracking regex quadratic-or-worse.
    const paragraph = 'word.word '.repeat(20_000); // 200,000 chars
    const start = performance.now();
    const result = splitSentences(paragraph, 'latin');
    const elapsedMs = performance.now() - start;
    expect(result.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(200);
  });

  it('splits a 200,000-character paragraph with no terminators at all in under 200ms', () => {
    const paragraph = 'word '.repeat(40_000); // 200,000 chars, no terminators
    const start = performance.now();
    const result = splitSentences(paragraph, 'latin');
    const elapsedMs = performance.now() - start;
    expect(result.length).toBe(1);
    expect(elapsedMs).toBeLessThan(200);
  });
});
