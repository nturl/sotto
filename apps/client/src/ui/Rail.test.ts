import { describe, expect, it } from 'vitest';
import { resolveRailView } from './railView';
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
    categories: ['contes'],
    cover: 'fox',
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
