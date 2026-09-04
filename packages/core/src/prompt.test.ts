import { describe, expect, it } from 'vitest';
import { buildTutorInstruction, type TutorPromptContext } from './prompt.ts';

function makePassage(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `b1.s${i + 1}`,
    text: `Sentence number ${i + 1}.`,
  }));
}

function baseCtx(overrides: Partial<TutorPromptContext> = {}): TutorPromptContext {
  return {
    mode: 'read_to_me',
    level: 'A1',
    interfaceLocale: 'en',
    explanationLocale: 'en',
    learningLocale: 'fr-FR',
    bookTitle: 'Le Petit Chaperon rouge',
    chapterTitle: 'Chapitre 1',
    passage: makePassage(12),
    savedWords: [],
    ...overrides,
  };
}

describe('buildTutorInstruction', () => {
  it('includes the mode and every passage sentence id', () => {
    const ctx = baseCtx();
    const instruction = buildTutorInstruction(ctx);
    expect(instruction).toContain('Mode: read_to_me');
    for (const sentence of ctx.passage) {
      expect(instruction).toContain(sentence.id);
    }
  });

  it('includes per-mode guidance text that differs by mode', () => {
    const readToMe = buildTutorInstruction(baseCtx({ mode: 'read_to_me' }));
    const discuss = buildTutorInstruction(baseCtx({ mode: 'discuss' }));
    expect(readToMe).not.toBe(discuss);
    expect(discuss).toContain('conversation');
  });

  it('includes saved words when present, and a placeholder when empty', () => {
    const empty = buildTutorInstruction(baseCtx());
    expect(empty).toContain('Saved words: none yet');

    const withSaved = buildTutorInstruction(
      baseCtx({ savedWords: [{ word: 'renard', translation: 'fox' }] }),
    );
    expect(withSaved).toContain('renard = fox');
  });

  it('stays compact for a 12-sentence passage (rough token budget check)', () => {
    const instruction = buildTutorInstruction(baseCtx());
    // Rough heuristic: ~4 chars/token: 900 tokens ~= 3600 chars.
    expect(instruction.length).toBeLessThan(3600);
  });
});
