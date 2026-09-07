/**
 * Pure decision behind Home's section order (run 8 PLAN decision 10):
 * Continue reading -> Today's story -> Recommended for {level} -> Your books.
 * "New releases" left Home in run 8 and has no kind here.
 *
 * Split out of `home.tsx` because that module imports `react-native`, which
 * this repo's plain `vitest run` cannot parse (no RN transform configured —
 * see `railView.ts` and `navRows.ts` for the same split).
 */
export type HomeSectionKind = 'continue' | 'today' | 'recommended' | 'yourBooks';

export type HomeSectionCounts = {
  continueReading: number;
  /** The library seam always returns a `daily` book; it is a placeholder with
   * an empty title when the pack has none, so Home asks by title, not by
   * presence. */
  hasDaily: boolean;
  recommended: number;
  /** Imported (private) books. Only rendered when the learner has some. */
  yourBooks: number;
};

/** Every section hides itself when it has nothing to show; the order never
 * changes. */
export function resolveHomeSections(counts: HomeSectionCounts): HomeSectionKind[] {
  const sections: HomeSectionKind[] = [];
  if (counts.continueReading > 0) sections.push('continue');
  if (counts.hasDaily) sections.push('today');
  if (counts.recommended > 0) sections.push('recommended');
  if (counts.yourBooks > 0) sections.push('yourBooks');
  return sections;
}
