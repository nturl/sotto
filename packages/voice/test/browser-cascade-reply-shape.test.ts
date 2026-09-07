/**
 * Reply-shape guards for the browser cascade's 2B model (run 9, lane B).
 * Noel's live transcript (planning/run9/PLAN.md) had the tutor answer a
 * Discuss question with a filler line ("Okay, let's see.") followed by a
 * five-line list, every line of which was spoken. Nothing in the pipeline
 * checked the contract the prompt asks for, so these are the checks.
 */
import { describe, expect, it } from 'vitest';
import {
  QUESTION_NUDGE,
  QUESTION_RETRY_MAX_TOKENS,
  ReplyBudget,
  ReplyNormalizer,
  endsWithQuestion,
  isStopRequest,
  maxTokensForMode,
  normalizeReplyText,
  questionContinuation,
  sentenceCapForMode,
} from '../src/browser-cascade/reply-shape.ts';

describe('normalizeReplyText', () => {
  it('turns a markdown bullet list into plain prose on one line', () => {
    const reply = [
      '- The man walks on a frozen trail.',
      '- The dog follows him.',
      '* It is fifty below.',
    ].join('\n');
    expect(normalizeReplyText(reply)).toBe(
      'The man walks on a frozen trail. The dog follows him. It is fifty below.',
    );
  });

  it('strips numbered list markers, headings and blockquotes at line starts', () => {
    expect(normalizeReplyText('1. First.\n2) Second.\n### A heading\n> Quoted.')).toBe(
      'First. Second. A heading Quoted.',
    );
  });

  it('strips asterisk, underscore and backtick emphasis without eating the words', () => {
    expect(normalizeReplyText('The dog is **loyal** and _tired_ and `cold`.')).toBe(
      'The dog is loyal and tired and cold.',
    );
  });

  it('strips emoji and pictographs', () => {
    expect(normalizeReplyText('The dog is loyal 🐕✨. Ready? 👍🏽')).toBe(
      'The dog is loyal . Ready?',
    );
  });

  it('drops a leading filler sentence from the fixed list', () => {
    expect(normalizeReplyText("Okay, let's see. The passage is about a man.")).toBe(
      'The passage is about a man.',
    );
    expect(normalizeReplyText('Okay. The dog is a husky.')).toBe('The dog is a husky.');
    expect(normalizeReplyText('Sure. Yes.')).toBe('Yes.');
    expect(normalizeReplyText('Great question. The dog is grey.')).toBe('The dog is grey.');
    expect(normalizeReplyText("Let's see. It is cold.")).toBe('It is cold.');
  });

  it('does not drop a sentence that merely starts with a filler word', () => {
    expect(normalizeReplyText('Okay is not a word in the passage.')).toBe(
      'Okay is not a word in the passage.',
    );
  });

  it('leaves clean prose untouched', () => {
    const clean = 'The dog is a big grey husky. Why does he follow the man?';
    expect(normalizeReplyText(clean)).toBe(clean);
  });

  it('keeps the reading and pace markers intact (markers.ts strips those, not this)', () => {
    expect(normalizeReplyText('[[reading: b1.s1 b1.s2]] Durante el verano.')).toBe(
      '[[reading: b1.s1 b1.s2]] Durante el verano.',
    );
  });
});

describe('ReplyNormalizer (streaming)', () => {
  /** Feeds `deltas` one at a time; returns everything released, in order. */
  function stream(deltas: string[]): string {
    const n = new ReplyNormalizer();
    let out = '';
    for (const d of deltas) out += n.push(d);
    out += n.flush();
    return out;
  }

  it('holds back a partial line start so a bullet never leaks into a chunk', () => {
    const n = new ReplyNormalizer();
    // "The dog follows.\n- He is tired." arriving as the model really streams it.
    let out = n.push('The dog follows.\n');
    expect(out).toBe('The dog follows.');
    out += n.push('-');
    expect(out).toBe('The dog follows.');
    out += n.push(' He is tired.');
    out += n.flush();
    expect(out).toBe('The dog follows. He is tired.');
  });

  it('produces the same text as the whole-string function for any delta split', () => {
    const reply = "Okay, let's see.\n- The man walks. 🐕\n- The dog **follows**.\n1. Cold.";
    const expected = normalizeReplyText(reply);
    for (const size of [1, 2, 3, 5, 8, 13]) {
      const deltas: string[] = [];
      for (let i = 0; i < reply.length; i += size) deltas.push(reply.slice(i, i + size));
      expect(stream(deltas).replace(/\s+/g, ' ').trim()).toBe(expected);
    }
  });

  it('keeps the trailing space a sentence chunker needs to see a boundary', () => {
    const n = new ReplyNormalizer();
    const out = n.push('The dog is loyal. ') + n.push('He follows.');
    expect(out.startsWith('The dog is loyal. ')).toBe(true);
  });
});

describe('ReplyBudget', () => {
  it('caps discuss at three spoken sentences', () => {
    const b = ReplyBudget.forMode('discuss');
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.reached).toBe(true);
    expect(b.take()).toBe(false);
  });

  it('caps read_with_me and pronunciation at two', () => {
    for (const mode of ['read_with_me', 'pronunciation'] as const) {
      const b = ReplyBudget.forMode(mode);
      expect(b.take()).toBe(true);
      expect(b.take()).toBe(true);
      expect(b.take()).toBe(false);
    }
  });

  it('never caps read_to_me (the passage may be any length)', () => {
    const b = ReplyBudget.forMode('read_to_me');
    for (let i = 0; i < 50; i++) expect(b.take()).toBe(true);
    expect(b.reached).toBe(false);
  });

  it('is unlimited when no mode is supplied', () => {
    const b = ReplyBudget.forMode(undefined);
    for (let i = 0; i < 10; i++) expect(b.take()).toBe(true);
    expect(b.reached).toBe(false);
  });

  it('exposes the caps and the per-mode token ceiling', () => {
    expect(sentenceCapForMode('discuss')).toBe(3);
    expect(sentenceCapForMode('read_to_me')).toBe(null);
    expect(maxTokensForMode('discuss')).toBe(240);
    expect(maxTokensForMode('read_with_me')).toBe(240);
    expect(maxTokensForMode('pronunciation')).toBe(240);
    expect(maxTokensForMode('read_to_me')).toBe(400);
  });

  it('leaves room for a fenced tool block after a full three-sentence reply', () => {
    // Qwen3.5-2B rejects native tools, so every browser session falls back
    // to emitting a ```tool JSON block inside the SAME budget as its prose
    // — and a block truncated before its closing fence parses as nothing,
    // so save_vocabulary / show_explanation silently do not happen while
    // the prose still promises them (run 9 lane R, P1-6). Three sentences
    // of tutor prose run ~55-70 tokens; the smallest useful tool block is
    // ~40. 160 left no margin for both.
    const THREE_SENTENCES = 70;
    const TOOL_BLOCK = 40;
    for (const mode of ['discuss', 'read_with_me', 'pronunciation'] as const) {
      expect(maxTokensForMode(mode)).toBeGreaterThan(THREE_SENTENCES + TOOL_BLOCK);
    }
  });
});

// ---------------------------------------------------------------------------
// run 9 lane H2 — the question-only continuation (P0-2).
//
// The 2B model ends a Discuss reply with a question about two times in ten
// (lane B: 0/4; lane H: 0/8 counting both scenarios of four probe runs). The
// orchestrator's decision is one extra engine call that asks for nothing but
// the question. These are the pure halves of that decision.
// ---------------------------------------------------------------------------
describe('endsWithQuestion', () => {
  it('sees a question mark through trailing space, quotes and brackets', () => {
    expect(endsWithQuestion('What does that mean?')).toBe(true);
    expect(endsWithQuestion('What does that mean?  ')).toBe(true);
    expect(endsWithQuestion('"What does that mean?"')).toBe(true);
    expect(endsWithQuestion('What does that mean?\u201d')).toBe(true);
    expect(endsWithQuestion('\u4ed6\u4e3a\u4ec0\u4e48\u4e0d\u9ad8\u5174\uff1f')).toBe(true);
  });

  it('is false for a statement, for an empty reply, and for a mid-text question', () => {
    expect(endsWithQuestion('The dog is unhappy but loyal.')).toBe(false);
    expect(endsWithQuestion('')).toBe(false);
    expect(endsWithQuestion('   ')).toBe(false);
    expect(endsWithQuestion('Why? Because it was cold.')).toBe(false);
  });
});

describe('isStopRequest', () => {
  it('catches the ways a learner asks the tutor to stop', () => {
    for (const text of [
      'stop',
      'Stop.',
      'stop please',
      'please stop',
      'Stop asking me questions.',
      "That's enough.",
      'that is enough for today',
      'No more questions, please.',
      'ok stop',
    ]) {
      expect(isStopRequest(text), text).toBe(true);
    }
  });

  it('does not fire on an ordinary passage question that merely contains the words', () => {
    for (const text of [
      'Tell me more about the gray husky dog.',
      'Why did the man stop at the creek?',
      'Did he have enough food for the trail?',
      'What happens next?',
      '',
    ]) {
      expect(isStopRequest(text), text).toBe(false);
    }
  });
});

describe('questionContinuation', () => {
  it('accepts one short question, normalized, with its wrapping stripped', () => {
    expect(questionContinuation('What does that tell you about the dog?')).toBe(
      'What does that tell you about the dog?',
    );
    expect(questionContinuation('  **Why do you think the dog stopped?**  ')).toBe(
      'Why do you think the dog stopped?',
    );
    expect(questionContinuation('"How would you feel on that trail?"')).toBe(
      'How would you feel on that trail?',
    );
  });

  it('rejects anything that is not a single trailing question', () => {
    expect(questionContinuation('')).toBe(null);
    expect(questionContinuation('   ')).toBe(null);
    // Not a question at all.
    expect(questionContinuation('The dog knew the cold better than the man.')).toBe(null);
    // Two sentences: the tutor would speak an unasked-for statement.
    expect(questionContinuation('The dog was afraid. What do you think?')).toBe(null);
    // Truncated by the 32-token ceiling before it could ask anything.
    expect(questionContinuation('Now, thinking about the way the dog behaved when the')).toBe(null);
  });
});

describe('the continuation request itself', () => {
  it('asks for exactly one question and nothing else, in a tiny budget', () => {
    expect(QUESTION_RETRY_MAX_TOKENS).toBe(32);
    expect(QUESTION_NUDGE).toContain('exactly one short follow-up question');
    expect(QUESTION_NUDGE).toContain('only the question');
  });
});
