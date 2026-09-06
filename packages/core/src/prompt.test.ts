import { describe, expect, it } from 'vitest';
import {
  buildModeChangeInstruction,
  buildSystemInstruction,
  sttLanguageHint,
  type PromptContext,
  type TutorPassageSentence,
} from './prompt.ts';

// The sentence from the live-voice e2e that mis-saved "verano" for
// "cigarra": 11 tokens (two punctuation), 9 words.
const SAMANIEGO_S1: TutorPassageSentence = {
  id: 'b1.s1',
  text: 'Durante el verano, una cigarra canta bajo el sol.',
  tokenIds: Array.from({ length: 11 }, (_, i) => `b1.s1.t${i + 1}`),
  words: [
    { id: 'b1.s1.t1', text: 'Durante' },
    { id: 'b1.s1.t2', text: 'el' },
    { id: 'b1.s1.t3', text: 'verano' },
    { id: 'b1.s1.t5', text: 'una' },
    { id: 'b1.s1.t6', text: 'cigarra' },
    { id: 'b1.s1.t7', text: 'canta' },
    { id: 'b1.s1.t8', text: 'bajo' },
    { id: 'b1.s1.t9', text: 'el' },
    { id: 'b1.s1.t10', text: 'sol' },
  ],
};

function ctx(sentences: TutorPassageSentence[]): PromptContext {
  return {
    mode: 'discuss',
    learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en' },
    bookTitle: 'es-fabulas-samaniego',
    passage: { chapterTitle: 'La cigarra y la hormiga', sentences, positionTokenId: 'b1.s1.t1' },
    savedWords: [],
  };
}

describe('buildSystemInstruction passage rendering', () => {
  it('renders each sentence as clean text plus a word=tokenId-suffix map (punctuation omitted)', () => {
    const out = buildSystemInstruction(ctx([SAMANIEGO_S1]));
    expect(out).toContain('  - b1.s1: Durante el verano, una cigarra canta bajo el sol.\n');
    expect(out).toContain(
      '    Durante=t1 el=t2 verano=t3 una=t5 cigarra=t6 canta=t7 bajo=t8 el=t9 sol=t10',
    );
    // The old bare id list is gone: the model no longer has to align ids to words by counting.
    expect(out).not.toContain('[b1.s1.t1,');
  });

  it('tells the model how to assemble a full tokenId and never to count words', () => {
    const out = buildSystemInstruction(ctx([SAMANIEGO_S1]));
    expect(out).toContain('sentence id + "." + suffix');
    expect(out).toContain('Never derive a tokenId by counting words');
  });

  it('falls back to the bare tokenId list for a sentence with no word map (older callers)', () => {
    const legacy = { id: 'b1.s2', text: 'Hola.', tokenIds: ['b1.s2.t1', 'b1.s2.t2'], words: [] };
    const out = buildSystemInstruction(ctx([legacy]));
    expect(out).toContain('  - b1.s2 [b1.s2.t1,b1.s2.t2]: Hola.');
  });

  it('keeps a word id that does not share the sentence-id prefix intact', () => {
    const odd = { ...SAMANIEGO_S1, words: [{ id: 'x9.y9.t1', text: 'Durante' }] };
    const out = buildSystemInstruction(ctx([odd]));
    expect(out).toContain('    Durante=x9.y9.t1');
  });

  it('is cheaper than the old bare id list for a full 12-sentence window', () => {
    const sentences = Array.from({ length: 12 }, (_, i) => ({
      ...SAMANIEGO_S1,
      id: `b1.s${i + 1}`,
      tokenIds: SAMANIEGO_S1.tokenIds.map((id) => id.replace('b1.s1', `b1.s${i + 1}`)),
      words: SAMANIEGO_S1.words.map((w) => ({ ...w, id: w.id.replace('b1.s1', `b1.s${i + 1}`) })),
    }));
    const out = buildSystemInstruction(ctx(sentences));
    const oldStyle = sentences
      .map((s) => `  - ${s.id} [${s.tokenIds.join(',')}]: ${s.text}`)
      .join('\n');
    const newStyle = sentences
      .map(
        (s) =>
          `  - ${s.id}: ${s.text}\n    ${s.words.map((w) => `${w.text}=${w.id.slice(s.id.length + 1)}`).join(' ')}`,
      )
      .join('\n');
    expect(out).toContain(newStyle);
    expect(newStyle.length).toBeLessThan(oldStyle.length);
    // Whole instruction stays well inside the ~950-token budget (~4 chars/token).
    // Budget raised from 3600 to fit the reply-in-kind rule added for
    // BUGS-TUTOR-RUN5.md #2 (there were only 4 spare characters left at
    // 3600; that rule needed ~111 to state clearly).
    expect(out.length).toBeLessThan(3800);
  });
});

describe('buildSystemInstruction shared by both providers', () => {
  it('accepts a null positionTokenId (the @sotto/core PassageContextResult shape)', () => {
    const out = buildSystemInstruction({
      ...ctx([SAMANIEGO_S1]),
      passage: { chapterTitle: 'c', sentences: [SAMANIEGO_S1], positionTokenId: null },
    });
    expect(out).toContain('Current reading position (token id): start of chapter');
  });

  it('varies the per-mode guidance block', () => {
    const discuss = buildSystemInstruction(ctx([SAMANIEGO_S1]));
    const readToMe = buildSystemInstruction({ ...ctx([SAMANIEGO_S1]), mode: 'read_to_me' });
    expect(discuss).toContain('Mode: discuss.');
    expect(readToMe).toContain('[[reading: id1 id2]]');
    expect(discuss).not.toBe(readToMe);
  });

  it('builds a short mode-change acknowledgement instruction', () => {
    expect(buildModeChangeInstruction('pronunciation', 'en')).toContain('"pronunciation"');
  });

  // Reply-language rule (BUGS-TUTOR-RUN5.md #2): nothing previously told the
  // tutor to answer in whatever language the learner just used for that
  // turn, so a learner speaking their explanation language got an
  // explanation-locale-only or learning-locale-only reply, never a reply in
  // kind. This is a rule about matching the turn's language, distinct from
  // the existing "use explanationLocale briefly" guidance.
  it('tells the tutor to reply in the language the learner just used, then offer to return', () => {
    const out = buildSystemInstruction(ctx([SAMANIEGO_S1]));
    expect(out).toMatch(/reply in the language\s+the learner (just )?used/i);
    expect(out).toMatch(/offer to (return|switch back) to/i);
  });
});

// STT decoding bias (BUGS-TUTOR-RUN5.md #1): forcing Whisper's `language` to
// the learning locale garbles any speech in the explanation locale into a
// paraphrase in the wrong language. The fix is to stop forcing a language
// and instead bias decoding with a soft prompt naming both locales in play.
describe('sttLanguageHint', () => {
  it('names both the learning and explanation locale', () => {
    const hint = sttLanguageHint({ learningLocale: 'es-419', explanationLocale: 'en' });
    expect(hint).toContain('es-419');
    expect(hint).toContain('en');
  });

  it('is stable for the same input (callers may reuse it as a decoding bias, not a random prompt)', () => {
    const a = sttLanguageHint({ learningLocale: 'fr-FR', explanationLocale: 'en' });
    const b = sttLanguageHint({ learningLocale: 'fr-FR', explanationLocale: 'en' });
    expect(a).toBe(b);
  });
});
