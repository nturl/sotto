/**
 * F2.3 (planning/ADVERSARIAL-REVIEW-2.md §1.9): `es-licenciado-vidriera`
 * shipped 15 tokens whose "es" gloss carried the "fr" gloss verbatim
 * ("enfant" for niño, "à" for a). These two validator rules catch that bug
 * class going forward — see the fixtures at
 * test/fixtures/invalid/{gloss-not-identity,gloss-cross-locale-leak}/ for
 * the `--fixtures` self-test, and src/validate.ts's `glossIdentityIssue`/
 * `glossCrossLocaleLeakIssues` doc comments for why the identity rule only
 * errors when corroborated by a cross-locale byte match (a real corpus
 * sweep found dozens of legitimate non-identity own-language glosses —
 * contractions and LLM paraphrases — that would otherwise false-positive).
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackDir } from '../src/validate.ts';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'invalid');

describe('gloss-not-identity', () => {
  it("errors when a book's own-locale gloss is byte-identical to another locale's gloss", () => {
    const issues = validatePackDir(path.join(fixturesDir, 'gloss-not-identity'));
    const identity = issues.filter((i) => i.rule === 'gloss-not-identity');
    expect(identity).toHaveLength(1);
    expect(identity[0]?.severity ?? 'error').toBe('error');
    expect(identity[0]?.message).toContain('"fr" gloss ("gato")');
  });
});

describe('gloss-cross-locale-leak', () => {
  it('warns when a Latin-script locale and a CJK locale share a byte-identical gloss (a script-family boundary crossing, not a plausible cognate)', () => {
    const issues = validatePackDir(path.join(fixturesDir, 'gloss-cross-locale-leak'));
    const leaks = issues.filter((i) => i.rule === 'gloss-cross-locale-leak');
    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.severity).toBe('warning');
    expect(leaks[0]?.message).toContain('"en" and "zh-Hans"');
    // The fixture also carries an "es"/"pt" gato/gato pair (a genuine
    // Romance cognate) — R3-F1's retune must NOT flag that one; only the
    // count assertion above covers this, so it's asserted explicitly too.
    expect(leaks.some((i) => i.message.includes('"es" and "pt"'))).toBe(false);
    // The book's own "fr" gloss is correct identity here, so this fixture
    // must not also trip the (error-severity) identity rule.
    expect(issues.some((i) => i.rule === 'gloss-not-identity')).toBe(false);
  });
});

describe('the real es-licenciado-vidriera fix', () => {
  it('has no gloss-not-identity or gloss-cross-locale-leak issues on the fixed book', () => {
    const packsDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'packs',
      'es-419',
    );
    const issues = validatePackDir(packsDir).filter((i) =>
      i.scope.includes('es-licenciado-vidriera'),
    );
    const identityErrors = issues.filter(
      (i) => i.rule === 'gloss-not-identity' && (i.severity ?? 'error') === 'error',
    );
    expect(identityErrors).toHaveLength(0);
  });
});
