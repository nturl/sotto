/**
 * Reply-shape guards for the browser cascade's 2B model (run 9, lane B).
 * Noel's live transcript (planning/run9/PLAN.md) had the tutor answer a
 * Discuss question with a filler line ("Okay, let's see.") followed by a
 * five-line list, every line of which was spoken. Nothing in the pipeline
 * checked the contract the prompt asks for, so these are the checks.
 */
import { describe, expect, it } from 'vitest';
import {
  ReplyBudget,
  ReplyNormalizer,
  maxTokensForMode,
  normalizeReplyText,
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
    expect(maxTokensForMode('discuss')).toBe(160);
    expect(maxTokensForMode('read_with_me')).toBe(160);
    expect(maxTokensForMode('pronunciation')).toBe(160);
    expect(maxTokensForMode('read_to_me')).toBe(400);
  });
});
