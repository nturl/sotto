/**
 * R3-F1 (planning/LEDGER.md "R3-F"): fixture-free unit coverage for the
 * cheap plausibility test `isImplausibleGlossPair` in src/validate.ts uses
 * to decide whether an identical gloss shared by two GLOSS_LOCALES is a
 * probable copy/paste leak or a genuine cross-language cognate. No pack
 * fixture involved — these call the exported helper directly with made-up
 * locale/gloss pairs.
 *
 * 4 true leaks (should be flagged) + 4 cognates that must pass (should
 * NOT be flagged), covering the family-boundary signals named in the
 * R3-F1 task: CJK vs non-CJK script, `en` sharing an accented Romance
 * string, and a Romanian-only/Catalan-only character leaking into a gloss
 * shared with a locale that isn't ro/ca.
 */
import { describe, expect, it } from 'vitest';
import { isImplausibleGlossPair } from '../src/validate.ts';

describe('isImplausibleGlossPair', () => {
  it('flags a CJK locale sharing a Latin-script gloss with a non-CJK locale (script boundary)', () => {
    expect(isImplausibleGlossPair('en', 'zh-Hans', 'that')).toBe(true);
  });

  it('flags a non-CJK locale sharing a CJK-script gloss with zh-Hant (script boundary, reversed order)', () => {
    expect(isImplausibleGlossPair('fr', 'zh-Hant', '那个')).toBe(true);
  });

  it('flags "en" sharing an accented French string with "fr" (real English words are ASCII)', () => {
    expect(isImplausibleGlossPair('en', 'fr', 'être')).toBe(true);
  });

  it('flags a Romanian-only-diacritic gloss shared between "fr" and "ca" (neither is "ro")', () => {
    expect(isImplausibleGlossPair('fr', 'ca', 'română')).toBe(true);
  });

  it('does not flag two Romance locales sharing a plain-ASCII cognate ("es"/"pt" "tigre")', () => {
    expect(isImplausibleGlossPair('es', 'pt', 'tigre')).toBe(false);
  });

  it('does not flag "zh-Hans" and "zh-Hant" sharing an identical character (Simplified/Traditional overlap)', () => {
    expect(isImplausibleGlossPair('zh-Hans', 'zh-Hant', '动物')).toBe(false);
  });

  it('does not flag "en" sharing a plain-ASCII cognate with a Romance locale ("en"/"ca" "animal")', () => {
    expect(isImplausibleGlossPair('en', 'ca', 'animal')).toBe(false);
  });

  it('does not flag a Romanian-diacritic gloss when "ro" is one of the two locales', () => {
    expect(isImplausibleGlossPair('ro', 'ca', 'română')).toBe(false);
  });
});
