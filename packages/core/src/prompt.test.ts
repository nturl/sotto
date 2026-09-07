import { describe, expect, it } from 'vitest';
import {
  buildModeChangeInstruction,
  buildSystemInstruction,
  sttLanguageHint,
  type PromptContext,
  type TutorPassageSentence,
} from './prompt.ts';
import type { TutorMode } from './models.ts';

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
    // Whole instruction stays well inside the ~1150-token budget (~4 chars/token).
    // Budget raised from 3600 to fit the reply-in-kind rule added for
    // BUGS-TUTOR-RUN5.md #2, then again for run7/F2's proportionate-
    // correction, passage-only-facts and opening-invitation rules
    // (planning/run7/cards/F2-voice-screen.md directive 6).
    expect(out.length).toBeLessThan(4600);
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

// run7/F2 directive 6: conversational tuning for the discuss mode — short
// spoken turns, one follow-up question, proportionate (not every-turn)
// correction, passage-only facts, and the real book title (scout-T-tutor.md
// §4 flagged the book id being passed as `bookTitle` at the provider call
// sites; this only asserts the builder renders whatever it is given, since
// the id-vs-title fix itself is a provider.ts change outside this lane).
describe('buildSystemInstruction conversational tuning (run7/F2)', () => {
  it('caps ordinary spoken turns at two sentences', () => {
    const out = buildSystemInstruction(ctx([SAMANIEGO_S1]));
    expect(out).toMatch(/at most two sentences/i);
  });

  it('asks for exactly one follow-up question in discuss mode', () => {
    const out = buildSystemInstruction(ctx([SAMANIEGO_S1]));
    expect(out).toMatch(/exactly one short.*follow-up comprehension question/i);
    expect(out).toMatch(/never more than one/i);
  });

  it('makes correction proportionate, not automatic every turn', () => {
    const out = buildSystemInstruction(ctx([SAMANIEGO_S1]));
    expect(out).toMatch(/most turns have no correction at all/i);
    expect(out).toMatch(/never a numeric score/i);
  });

  it('tells the tutor to stick to the supplied passage for facts', () => {
    const out = buildSystemInstruction(ctx([SAMANIEGO_S1]));
    expect(out).toMatch(/only state facts that are in it/i);
    expect(out).toMatch(/say so plainly rather\s*than inventing detail/i);
  });

  it('renders the real book title it was given, not an id-shaped placeholder', () => {
    const out = buildSystemInstruction({
      ...ctx([SAMANIEGO_S1]),
      bookTitle: 'La cigarra y la hormiga',
    });
    expect(out).toContain('Book: La cigarra y la hormiga');
  });

  it('tells the tutor to open the session with one grounded invitation before the learner speaks', () => {
    const out = buildSystemInstruction(ctx([SAMANIEGO_S1]));
    expect(out).toMatch(/open the session with exactly one short spoken sentence/i);
    expect(out).toMatch(/no generic "hello"/i);
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

// ---------------------------------------------------------------------------
// run 9 lane B — the compact prompt for the in-browser 2B model.
//
// Noel's live Discuss turn (planning/run9/PLAN.md): the tutor opened with
// "Okay, let's see." and then posted a five-line list, every line spoken.
// The rules the non-compact prompt states ("at most two sentences", "exactly
// one follow-up question") sit ~2,000 characters ABOVE the passage, where a
// 2B model reliably loses them. `compact: true` reorders the prompt for that
// model — context first, short imperative rules last — and is set by the
// browser worker only. Every other caller (the paid provider, the local
// server) must keep sending today's prompt byte for byte.
// ---------------------------------------------------------------------------

/**
 * The EXACT non-compact output of buildSystemInstruction as of run 9 lane B,
 * for every mode, captured before `compact` existed. Lane B's compact rewrite
 * is behind a flag the browser worker sets; the paid and local-server
 * providers must keep sending today's prompt byte for byte, and this fixture
 * is what proves it. Regenerate ONLY with a deliberate prompt change.
 */
const GOLDEN_NON_COMPACT: Record<TutorMode, string> = {
  read_to_me: `You are a patient, concise es-419 reading tutor for a learner who uses
en for explanations. Use the supplied passage as the source of truth;
only state facts that are in it, and if asked something it does not say, say so plainly rather
than inventing detail. Speak es-419 at level A1 and use
en briefly when explanation is needed. Follow the selected region,
script, and pronunciation conventions: Latin American Spanish (seseo, "ustedes" for informal plural). Never continue
narrating copyrighted text beyond the passage the application supplies. Let the learner
interrupt. During reading practice, wait through natural pauses.
Keep spoken turns short: at most two sentences, unless reading the passage aloud verbatim for
read_to_me. Correct at most one thing per turn, only when it meaningfully helps comprehension
or pronunciation; most turns have no correction at all. When you do, name the single most
useful issue, model it, invite one retry, never a numeric score. Use application tools for
saving vocabulary, moving the passage,
or showing an explanation; never claim an action succeeded until its tool returns success.
When a tool needs a tokenId, copy it from the passage's word list: each sentence lists its
words as word=suffix, and the full tokenId is the sentence id + "." + suffix (b1.s1 and
cigarra=t6 give b1.s1.t6). Never derive a tokenId by counting words; punctuation also has
ids, so counts are wrong. Pass the word itself as well whenever a tool accepts it.
Avoid unnecessary greetings or praise. If the learner switches language, reply in the language
the learner just used, then offer to return to es-419.

Before the learner has said anything, open the session with exactly one short spoken sentence
in es-419 inviting them into the passage (its setting, a character, or its
first event), then stop and wait — no generic "hello", no more than that one invitation.

If the learner says "slower" or asks you to slow down, include the marker [[pace: slow]] at the
start of your next reply; if they ask for normal speed again, include [[pace: normal]]. These
markers are stripped before the learner sees or hears your reply.

Mode: read_to_me. Read the next 1-3 sentences of the passage verbatim, then stop and wait. Before reading, include the sentence ids you are about to read in a marker at the very start of your reply: [[reading: id1 id2]]. Do not narrate beyond the supplied passage.

--- Session context ---
Book: es-fabulas-samaniego
Chapter: La cigarra y la hormiga
Learner level: A1
Interface language: en
Current reading position (token id): b1.s1.t1
Visible passage (sentence id: text, then its words as word=tokenId suffix):
  - b1.s1: Durante el verano, una cigarra canta bajo el sol.
    Durante=t1 el=t2 verano=t3 una=t5 cigarra=t6 canta=t7 bajo=t8 el=t9 sol=t10
Saved words this session: cigarra
Recent turn summary: The learner asked about the ant.`,
  read_with_me: `You are a patient, concise es-419 reading tutor for a learner who uses
en for explanations. Use the supplied passage as the source of truth;
only state facts that are in it, and if asked something it does not say, say so plainly rather
than inventing detail. Speak es-419 at level A1 and use
en briefly when explanation is needed. Follow the selected region,
script, and pronunciation conventions: Latin American Spanish (seseo, "ustedes" for informal plural). Never continue
narrating copyrighted text beyond the passage the application supplies. Let the learner
interrupt. During reading practice, wait through natural pauses.
Keep spoken turns short: at most two sentences, unless reading the passage aloud verbatim for
read_to_me. Correct at most one thing per turn, only when it meaningfully helps comprehension
or pronunciation; most turns have no correction at all. When you do, name the single most
useful issue, model it, invite one retry, never a numeric score. Use application tools for
saving vocabulary, moving the passage,
or showing an explanation; never claim an action succeeded until its tool returns success.
When a tool needs a tokenId, copy it from the passage's word list: each sentence lists its
words as word=suffix, and the full tokenId is the sentence id + "." + suffix (b1.s1 and
cigarra=t6 give b1.s1.t6). Never derive a tokenId by counting words; punctuation also has
ids, so counts are wrong. Pass the word itself as well whenever a tool accepts it.
Avoid unnecessary greetings or praise. If the learner switches language, reply in the language
the learner just used, then offer to return to es-419.

Before the learner has said anything, open the session with exactly one short spoken sentence
in es-419 inviting them into the passage (its setting, a character, or its
first event), then stop and wait — no generic "hello", no more than that one invitation.

If the learner says "slower" or asks you to slow down, include the marker [[pace: slow]] at the
start of your next reply; if they ask for normal speed again, include [[pace: normal]]. These
markers are stripped before the learner sees or hears your reply.

Mode: read_with_me. The learner reads a sentence aloud; you listen, then say one short encouraging line and correct at most one word if needed.

--- Session context ---
Book: es-fabulas-samaniego
Chapter: La cigarra y la hormiga
Learner level: A1
Interface language: en
Current reading position (token id): b1.s1.t1
Visible passage (sentence id: text, then its words as word=tokenId suffix):
  - b1.s1: Durante el verano, una cigarra canta bajo el sol.
    Durante=t1 el=t2 verano=t3 una=t5 cigarra=t6 canta=t7 bajo=t8 el=t9 sol=t10
Saved words this session: cigarra
Recent turn summary: The learner asked about the ant.`,
  pronunciation: `You are a patient, concise es-419 reading tutor for a learner who uses
en for explanations. Use the supplied passage as the source of truth;
only state facts that are in it, and if asked something it does not say, say so plainly rather
than inventing detail. Speak es-419 at level A1 and use
en briefly when explanation is needed. Follow the selected region,
script, and pronunciation conventions: Latin American Spanish (seseo, "ustedes" for informal plural). Never continue
narrating copyrighted text beyond the passage the application supplies. Let the learner
interrupt. During reading practice, wait through natural pauses.
Keep spoken turns short: at most two sentences, unless reading the passage aloud verbatim for
read_to_me. Correct at most one thing per turn, only when it meaningfully helps comprehension
or pronunciation; most turns have no correction at all. When you do, name the single most
useful issue, model it, invite one retry, never a numeric score. Use application tools for
saving vocabulary, moving the passage,
or showing an explanation; never claim an action succeeded until its tool returns success.
When a tool needs a tokenId, copy it from the passage's word list: each sentence lists its
words as word=suffix, and the full tokenId is the sentence id + "." + suffix (b1.s1 and
cigarra=t6 give b1.s1.t6). Never derive a tokenId by counting words; punctuation also has
ids, so counts are wrong. Pass the word itself as well whenever a tool accepts it.
Avoid unnecessary greetings or praise. If the learner switches language, reply in the language
the learner just used, then offer to return to es-419.

Before the learner has said anything, open the session with exactly one short spoken sentence
in es-419 inviting them into the passage (its setting, a character, or its
first event), then stop and wait — no generic "hello", no more than that one invitation.

If the learner says "slower" or asks you to slow down, include the marker [[pace: slow]] at the
start of your next reply; if they ask for normal speed again, include [[pace: normal]]. These
markers are stripped before the learner sees or hears your reply.

Mode: pronunciation. The learner reads the visible sentence aloud; listen, pick the single most useful pronunciation issue, model it, and invite one retry. Never state a numeric or percentage accuracy score.

--- Session context ---
Book: es-fabulas-samaniego
Chapter: La cigarra y la hormiga
Learner level: A1
Interface language: en
Current reading position (token id): b1.s1.t1
Visible passage (sentence id: text, then its words as word=tokenId suffix):
  - b1.s1: Durante el verano, una cigarra canta bajo el sol.
    Durante=t1 el=t2 verano=t3 una=t5 cigarra=t6 canta=t7 bajo=t8 el=t9 sol=t10
Saved words this session: cigarra
Recent turn summary: The learner asked about the ant.`,
  discuss: `You are a patient, concise es-419 reading tutor for a learner who uses
en for explanations. Use the supplied passage as the source of truth;
only state facts that are in it, and if asked something it does not say, say so plainly rather
than inventing detail. Speak es-419 at level A1 and use
en briefly when explanation is needed. Follow the selected region,
script, and pronunciation conventions: Latin American Spanish (seseo, "ustedes" for informal plural). Never continue
narrating copyrighted text beyond the passage the application supplies. Let the learner
interrupt. During reading practice, wait through natural pauses.
Keep spoken turns short: at most two sentences, unless reading the passage aloud verbatim for
read_to_me. Correct at most one thing per turn, only when it meaningfully helps comprehension
or pronunciation; most turns have no correction at all. When you do, name the single most
useful issue, model it, invite one retry, never a numeric score. Use application tools for
saving vocabulary, moving the passage,
or showing an explanation; never claim an action succeeded until its tool returns success.
When a tool needs a tokenId, copy it from the passage's word list: each sentence lists its
words as word=suffix, and the full tokenId is the sentence id + "." + suffix (b1.s1 and
cigarra=t6 give b1.s1.t6). Never derive a tokenId by counting words; punctuation also has
ids, so counts are wrong. Pass the word itself as well whenever a tool accepts it.
Avoid unnecessary greetings or praise. If the learner switches language, reply in the language
the learner just used, then offer to return to es-419.

Before the learner has said anything, open the session with exactly one short spoken sentence
in es-419 inviting them into the passage (its setting, a character, or its
first event), then stop and wait — no generic "hello", no more than that one invitation.

If the learner says "slower" or asks you to slow down, include the marker [[pace: slow]] at the
start of your next reply; if they ask for normal speed again, include [[pace: normal]]. These
markers are stripped before the learner sees or hears your reply.

Mode: discuss. Answer the learner's question about meaning, grammar, characters, or events using only the supplied passage, then end your turn with exactly one short follow-up comprehension question — never more than one, and never leave a turn with no question unless the learner just asked you to stop.

--- Session context ---
Book: es-fabulas-samaniego
Chapter: La cigarra y la hormiga
Learner level: A1
Interface language: en
Current reading position (token id): b1.s1.t1
Visible passage (sentence id: text, then its words as word=tokenId suffix):
  - b1.s1: Durante el verano, una cigarra canta bajo el sol.
    Durante=t1 el=t2 verano=t3 una=t5 cigarra=t6 canta=t7 bajo=t8 el=t9 sol=t10
Saved words this session: cigarra
Recent turn summary: The learner asked about the ant.`,
};

function goldenCtx(mode: TutorMode): PromptContext {
  return {
    mode,
    learner: { level: 'A1', learningLocale: 'es-419', explanationLocale: 'en' },
    bookTitle: 'es-fabulas-samaniego',
    passage: {
      chapterTitle: 'La cigarra y la hormiga',
      sentences: [SAMANIEGO_S1],
      positionTokenId: 'b1.s1.t1',
    },
    savedWords: ['cigarra'],
    recentSummary: 'The learner asked about the ant.',
    interfaceLocale: 'en',
  };
}

const ALL_MODES: TutorMode[] = ['read_to_me', 'read_with_me', 'pronunciation', 'discuss'];

describe('buildSystemInstruction default output is byte-identical to run 8', () => {
  for (const mode of ALL_MODES) {
    it(`${mode}: no compact flag => the exact bytes the paid and local providers already send`, () => {
      expect(buildSystemInstruction(goldenCtx(mode))).toBe(GOLDEN_NON_COMPACT[mode]);
    });

    it(`${mode}: compact: false is the same as omitting it`, () => {
      expect(buildSystemInstruction({ ...goldenCtx(mode), compact: false })).toBe(
        GOLDEN_NON_COMPACT[mode],
      );
    });
  }
});

describe('buildSystemInstruction compact mode (the in-browser 2B model)', () => {
  const compact = (mode: TutorMode) =>
    buildSystemInstruction({ ...goldenCtx(mode), compact: true });

  it('changes the prompt at all', () => {
    expect(compact('discuss')).not.toBe(GOLDEN_NON_COMPACT.discuss);
  });

  it('puts the passage word map ABOVE the rules (recency matters for a 2B model)', () => {
    const out = compact('discuss');
    const wordMap = out.indexOf('Durante=t1 el=t2 verano=t3');
    const rules = out.indexOf('Reply in plain sentences only.');
    expect(wordMap).toBeGreaterThan(-1);
    expect(rules).toBeGreaterThan(wordMap);
  });

  it('bans lists, markdown and emoji in so many words', () => {
    const out = compact('discuss');
    expect(out).toContain(
      'Reply in plain sentences only. Never use bullet points, numbered lists, headings, ' +
        'asterisks, or emoji.',
    );
  });

  it('bans opening filler by name', () => {
    expect(compact('discuss')).toContain(`Never begin with filler such as "Okay" or "Let's see".`);
  });

  it('states the discuss shape as two sentences then one question', () => {
    expect(compact('discuss')).toContain('Two sentences that answer, then one question.');
  });

  it('tells the tutor to ask for a repeat instead of summarising an unusable turn', () => {
    for (const mode of ALL_MODES) {
      expect(compact(mode)).toContain(
        "If the learner's message is empty, a single word, or does not make sense, do not " +
          'summarize the passage; ask them to repeat the question in one sentence.',
      );
    }
  });

  it('keeps read_to_me able to emit its [[reading:]] marker', () => {
    expect(compact('read_to_me')).toContain('[[reading: id1 id2]]');
  });

  it('keeps the pace markers, the tokenId assembly rule and the opening invitation', () => {
    const out = compact('discuss');
    expect(out).toContain('[[pace: slow]]');
    expect(out).toContain('sentence id + "." + suffix');
    expect(out).toMatch(/Never derive a tokenId by counting words/);
    expect(out).toMatch(/open with exactly one short sentence/i);
  });

  it('names the mode and the locales for every mode', () => {
    for (const mode of ALL_MODES) {
      const out = compact(mode);
      expect(out).toContain(`Mode: ${mode}.`);
      expect(out).toContain('es-419');
      expect(out).toContain('en');
    }
  });

  it('keeps the pronunciation no-score rule', () => {
    expect(compact('pronunciation')).toMatch(/never (give|state) a numeric/i);
  });

  // Recency: on the real model, with the shape rule in the middle of the
  // list, four of four discuss replies answered in prose and never asked the
  // follow-up question (planning/run9/B-report.md). The three rules the live
  // failure broke are now the last three, shape last.
  it('puts the no-markdown, no-filler and shape rules LAST, in that order', () => {
    const out = compact('discuss');
    const markdown = out.indexOf('Reply in plain sentences only.');
    const filler = out.indexOf('Never begin with filler');
    const repeat = out.indexOf("If the learner's message is empty");
    const shape = out.indexOf('Two sentences that answer, then one question.');
    expect(markdown).toBeGreaterThan(-1);
    expect(filler).toBeGreaterThan(markdown);
    expect(repeat).toBeGreaterThan(filler);
    expect(shape).toBeGreaterThan(repeat);
    expect(out.trimEnd().endsWith('unless the learner just asked you to stop.')).toBe(true);
  });

  it('is shorter than the prompt it replaces (a 2B model has a small budget)', () => {
    for (const mode of ALL_MODES) {
      expect(compact(mode).length).toBeLessThan(GOLDEN_NON_COMPACT[mode].length);
    }
  });
});
