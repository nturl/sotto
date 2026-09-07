import { describe, expect, it } from 'vitest';
import { pickRibbon, resolveRailView } from './railView';
import type { LibraryBook } from './data';

function book(id: string): LibraryBook {
  return {
    id,
    contentLocale: 'en-US',
    reviewStatus: 'draft',
    title: id,
    author: 'Author',
    shortAuthor: 'Author',
    level: 'A1',
    minutes: 5,
    categories: ['tales'],
    svgUrl: '',
    progress: 0,
    isNew: true,
    synopsis: '',
  };
}

describe('resolveRailView', () => {
  it('shows content when there are books', () => {
    const view = resolveRailView([book('a')], 'No books');
    expect(view).toEqual({ kind: 'content', books: [book('a')] });
  });

  it('renders a titled empty line when the parent supplies emptyLabel', () => {
    const view = resolveRailView([], 'No fables yet');
    expect(view).toEqual({ kind: 'empty', label: 'No fables yet' });
  });

  it('stays hidden (null) when no emptyLabel is given, preserving old behaviour', () => {
    const view = resolveRailView([], undefined);
    expect(view).toEqual({ kind: 'hidden' });
  });
});

describe('pickRibbon', () => {
  it('marks the current book when this rail is holding it', () => {
    expect(pickRibbon([book('a'), book('b')], 'b')).toBe('b');
  });

  it('marks nothing when the current book is on some other shelf', () => {
    expect(pickRibbon([book('a')], 'b')).toBe(null);
  });

  it('marks nothing when no book is in progress', () => {
    expect(pickRibbon([book('a')], undefined)).toBe(null);
    expect(pickRibbon([book('a')], null)).toBe(null);
  });

  it('marks nothing on an empty shelf', () => {
    expect(pickRibbon([], 'a')).toBe(null);
  });
});
