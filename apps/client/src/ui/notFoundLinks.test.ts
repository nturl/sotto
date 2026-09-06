import { describe, expect, it } from 'vitest';
import { NOT_FOUND_LINKS } from './notFoundLinks';

describe('not-found screen links', () => {
  it('offers a way back to both Home and Library', () => {
    expect(NOT_FOUND_LINKS.map((l) => l.href)).toEqual(['/(tabs)/home', '/(tabs)/library']);
  });

  it('uses the notFound i18n keys, not ad-hoc strings', () => {
    expect(NOT_FOUND_LINKS.map((l) => l.labelKey)).toEqual([
      'notFound.toHome',
      'notFound.toLibrary',
    ]);
  });
});
