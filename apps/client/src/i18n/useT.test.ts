/**
 * The message formatter — interpolation, ICU plurals and the `<html lang>`
 * write. Nothing covered `formatMessage` before 2026-09-21, which is how
 * ro/zh-Hans/zh-Hant shipped `vocabulary.wordCount` rendering raw ICU source.
 *
 * The catalogs are imported directly rather than driven through `useT()`:
 * outside Metro, `require.context` is unavailable and only `en` is loaded
 * (see loadCatalogs), so a catalog code has to be passed in explicitly.
 */
import { describe, expect, it } from 'vitest';
import { formatMessage, setUiCatalog } from './useT';
import ca from './ca.json';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import itIt from './it.json';
import pt from './pt.json';
import ro from './ro.json';
import zhHans from './zh-Hans.json';
import zhHant from './zh-Hant.json';

const CATALOGS: [string, Record<string, string>][] = [
  ['ca', ca],
  ['en', en],
  ['es', es],
  ['fr', fr],
  ['it', itIt],
  ['pt', pt],
  ['ro', ro],
  ['zh-Hans', zhHans],
  ['zh-Hant', zhHant],
];

describe('formatMessage plurals', () => {
  it('leaves no ICU source on screen in any catalog', () => {
    for (const [name, catalog] of CATALOGS) {
      for (const count of [0, 1, 2, 3, 20, 25]) {
        const rendered = formatMessage(catalog['vocabulary.wordCount'], { count }, name);
        expect(`${name}@${count}: ${rendered}`).not.toContain('plural,');
        expect(rendered).toContain(String(count));
      }
    }
  });

  it("picks Romanian's three arms by CLDR category, not by === 1", () => {
    const message = ro['vocabulary.wordCount'];
    expect(formatMessage(message, { count: 1 }, 'ro')).toBe('1 cuvânt');
    expect(formatMessage(message, { count: 3 }, 'ro')).toBe('3 cuvinte');
    expect(formatMessage(message, { count: 25 }, 'ro')).toBe('25 de cuvinte');
  });

  it('renders a catalog that only writes an `other` arm', () => {
    const message = zhHans['vocabulary.wordCount'];
    expect(formatMessage(message, { count: 1 }, 'zh-Hans')).toBe('1 个单词');
    expect(formatMessage(message, { count: 3 }, 'zh-Hans')).toBe('3 个单词');
    expect(formatMessage(message, { count: 25 }, 'zh-Hans')).toBe('25 个单词');
  });

  it('leaves the one/other catalogs reading as they do today', () => {
    expect(formatMessage(en['vocabulary.wordCount'], { count: 1 }, 'en')).toBe('1 word');
    expect(formatMessage(en['vocabulary.wordCount'], { count: 3 }, 'en')).toBe('3 words');
    expect(formatMessage(fr['vocabulary.wordCount'], { count: 1 }, 'fr')).toBe('1 mot');
    expect(formatMessage(fr['vocabulary.wordCount'], { count: 3 }, 'fr')).toBe('3 mots');
  });

  it('prefers an =N exact match over the category arm', () => {
    const message = '{count, plural, =0 {No words yet} one {# word} other {# words}}';
    expect(formatMessage(message, { count: 0 }, 'en')).toBe('No words yet');
    expect(formatMessage(message, { count: 1 }, 'en')).toBe('1 word');
  });

  it('falls back to `other` when the selected category has no arm', () => {
    // A key missing from ro pairs an English message with Romanian rules
    // (useT's `catalog[key] ?? en[key]`); `few` has no arm in en.
    expect(formatMessage(en['vocabulary.wordCount'], { count: 3 }, 'ro')).toBe('3 words');
  });

  it('still interpolates plain {var} messages', () => {
    expect(formatMessage(en['paywall.plan.minutes'], { count: 120 }, 'en')).toBe(
      '120 tutor minutes / month',
    );
  });
});

describe('setUiCatalog', () => {
  it('writes <html lang> even when the resolved catalog is unchanged', () => {
    const documentStub = { documentElement: { lang: 'en' } };
    const globals = globalThis as { document?: unknown };
    const had = 'document' in globals;
    const previous = globals.document;
    globals.document = documentStub;
    try {
      documentStub.documentElement.lang = 'xx';
      setUiCatalog('en');
      expect(documentStub.documentElement.lang).toBe('en');
    } finally {
      if (had) globals.document = previous;
      else delete globals.document;
    }
  });
});
