import { describe, expect, it } from 'vitest';
import { LEARNING_LANGUAGES } from '../ui/languages';
import { LEVELS, levelSamplesFor } from './levelSamples';

/**
 * Run 7 lane C. "Your level" is the one onboarding question a stranger cannot
 * honestly answer from a label — A2 and B1 mean nothing to someone who has
 * never sat a CEFR exam. The "not sure?" helper answers it the only way that
 * works: show sentences in the language they are about to read and let them
 * pick the hardest one they can follow.
 */
describe('levelSamplesFor', () => {
  it('offers three sentences for every level, in the language being learnt', () => {
    const samples = levelSamplesFor('fr-FR');
    expect(samples).not.toBeNull();
    for (const level of LEVELS) {
      expect(samples![level], level).toHaveLength(3);
      for (const sentence of samples![level]) expect(sentence.trim().length).toBeGreaterThan(0);
    }
  });

  it('has samples for every learning language the picker offers', () => {
    for (const option of LEARNING_LANGUAGES) {
      const code = option.code === 'zh' ? 'zh-CN' : option.code;
      expect(levelSamplesFor(code), option.code).not.toBeNull();
    }
    expect(levelSamplesFor('zh-TW')).not.toBeNull();
  });

  it('maps a regional variant onto its language', () => {
    expect(levelSamplesFor('en-GB')).toEqual(levelSamplesFor('en-US'));
    expect(levelSamplesFor('es-ES')).toEqual(levelSamplesFor('es-419'));
    expect(levelSamplesFor('pt-PT')).toEqual(levelSamplesFor('pt-BR'));
  });

  it('keeps the two Chinese scripts apart', () => {
    expect(levelSamplesFor('zh-CN')).not.toEqual(levelSamplesFor('zh-TW'));
  });

  /** No samples is a reason to hide the helper, never to show English ones. */
  it('returns null for a language it has no samples for', () => {
    expect(levelSamplesFor('de-DE')).toBeNull();
    expect(levelSamplesFor('')).toBeNull();
  });

  /** A sample is a taste, not a paragraph: it has to be readable in a row. */
  it('keeps every sample short enough to read at a glance', () => {
    for (const option of [...LEARNING_LANGUAGES.map((o) => o.code), 'zh-TW']) {
      const samples = levelSamplesFor(option === 'zh' ? 'zh-CN' : option);
      for (const level of LEVELS) {
        for (const sentence of samples![level]) {
          expect(sentence.length, `${option} ${level}: ${sentence}`).toBeLessThanOrEqual(120);
        }
      }
    }
  });

  /** The point of the helper is that the levels differ; identical rows would
   * make the choice arbitrary. */
  it('never repeats a sentence across levels within a language', () => {
    for (const code of ['en-US', 'fr-FR', 'es-419', 'it-IT', 'pt-BR', 'ro-RO', 'ca-ES', 'zh-CN']) {
      const samples = levelSamplesFor(code)!;
      const all = LEVELS.flatMap((level) => samples[level]);
      expect(new Set(all).size, code).toBe(all.length);
    }
  });
});
