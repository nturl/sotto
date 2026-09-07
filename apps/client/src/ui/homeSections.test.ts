import { describe, expect, it } from 'vitest';
import { resolveHomeSections, type HomeSectionCounts } from './homeSections';

const empty: HomeSectionCounts = {
  continueReading: 0,
  hasDaily: false,
  recommended: 0,
  yourBooks: 0,
};

describe('resolveHomeSections', () => {
  it('renders nothing when the library is empty', () => {
    expect(resolveHomeSections(empty)).toEqual([]);
  });

  it('puts continue reading first, then today, then recommended, then your books', () => {
    expect(
      resolveHomeSections({
        continueReading: 2,
        hasDaily: true,
        recommended: 5,
        yourBooks: 1,
      }),
    ).toEqual(['continue', 'today', 'recommended', 'yourBooks']);
  });

  it('hides continue reading when nothing is started', () => {
    expect(resolveHomeSections({ ...empty, hasDaily: true, recommended: 3 })).toEqual([
      'today',
      'recommended',
    ]);
  });

  it('hides your books when there are no imports', () => {
    expect(
      resolveHomeSections({ continueReading: 1, hasDaily: true, recommended: 1, yourBooks: 0 }),
    ).toEqual(['continue', 'today', 'recommended']);
  });

  it('hides the spread when there is no daily book', () => {
    expect(resolveHomeSections({ ...empty, continueReading: 1, recommended: 2 })).toEqual([
      'continue',
      'recommended',
    ]);
  });

  it('hides recommended when the level has nothing left to suggest', () => {
    expect(resolveHomeSections({ ...empty, continueReading: 1, hasDaily: true })).toEqual([
      'continue',
      'today',
    ]);
  });

  it('never lists New releases', () => {
    const all = resolveHomeSections({
      continueReading: 9,
      hasDaily: true,
      recommended: 9,
      yourBooks: 9,
    });
    expect(all).not.toContain('new');
  });
});
