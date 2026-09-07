import { describe, expect, it } from 'vitest';
import { progressLabel } from './progressLabel';

describe('progressLabel', () => {
  it('shows minutes for a book nobody has opened', () => {
    expect(progressLabel({ minutes: 42, progress: 0 })).toEqual({ kind: 'minutes', minutes: 42 });
  });

  it('shows minutes again once the book is finished', () => {
    expect(progressLabel({ minutes: 7, progress: 1 })).toEqual({ kind: 'minutes', minutes: 7 });
  });

  it('reads one page per minute of reading, mid-book', () => {
    // The card's worked example: the Chevre at 30% of a 7 minute read.
    expect(progressLabel({ minutes: 7, progress: 0.3 })).toEqual({
      kind: 'page',
      page: 3,
      pages: 7,
    });
  });

  it('never shows page 0 at the very start of a book', () => {
    expect(progressLabel({ minutes: 40, progress: 0.001 })).toEqual({
      kind: 'page',
      page: 1,
      pages: 40,
    });
  });

  it('never shows a page past the last one', () => {
    expect(progressLabel({ minutes: 40, progress: 0.999 })).toEqual({
      kind: 'page',
      page: 40,
      pages: 40,
    });
  });

  it('rounds minutes to whole pages', () => {
    expect(progressLabel({ minutes: 6.4, progress: 0.5 })).toEqual({
      kind: 'page',
      page: 4,
      pages: 6,
    });
    expect(progressLabel({ minutes: 6.6, progress: 0.5 })).toEqual({
      kind: 'page',
      page: 4,
      pages: 7,
    });
  });

  it('keeps at least one page for a book under half a minute', () => {
    expect(progressLabel({ minutes: 0.2, progress: 0.5 })).toEqual({
      kind: 'page',
      page: 1,
      pages: 1,
    });
  });

  it('rounds the minutes label too', () => {
    expect(progressLabel({ minutes: 12.6, progress: 0 })).toEqual({
      kind: 'minutes',
      minutes: 13,
    });
  });
});
