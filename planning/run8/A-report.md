# Lane A report — books: cover system, tile, shelf, ribbon, page label

Worker: Opus. Date: 2026-09-06. Card: `planning/run8/cards/A.md`.

## Commits

| Intended commit | Where it actually landed | Note |
| --- | --- | --- |
| 1 — Cover + palette + tokens | **`b952095`** (`run8(E): lane E report`) | **Swept.** See "Escalation 1". My staged commit-1 tree was picked up and committed by lane E before I could run `git commit`. The content is intact and pushed; only the commit message and prefix are wrong. |
| 2 — tile + rail + data seam | **`418100d`** `run8(A): the shelf, the tile, the ribbon, the current-book seam` | Mine, path-staged, pushed to `origin/main`. |
| report | this file | |

Everything is on `origin/main`. Lanes B and C can start.

## The contract other lanes consume

```ts
// src/ui/coverPaper.ts (RN-free)
type CoverSource = {
  id: string;
  title: string;
  author: string;
  level: BookLevel;
  categories: BookCategory[];   // @sotto/core's seven, not the old three
  svgUrl?: string;
};

// src/ui/Cover.tsx
<Cover book={CoverSource} width={n} height={n} cutout? cutoutSize? accessibilityLabel? />
// `art` is gone. `svgUrl` is read off the book and used ONLY when title is empty.

// src/ui/BookTile.tsx
<BookTile book={LibraryBook} onPress={fn} ribbon?={boolean} caption?={string|null} />
// coverWidth / coverHeight are gone: 120x180 desktop, 104x156 phone, decided
// internally from useLayoutMetrics(). TILE_SIZES is exported.

// src/ui/Rail.tsx
<Rail title books onPressBook onSeeAll? ribbonBookId?={string|null} emptyLabel? />
// useBookGridTier / BookGridTier are deleted.

// src/ui/data.ts
Library.currentBookId: string | null;         // new
Library.byCategory(category: BookCategory)    // core category, not 'voyage'/'contes'
LibraryBook.categories: BookCategory[]        // core seven
LibraryBook.cover                             // deleted (hashCover deleted with it)
```

Pure helpers: `coverPaper(book)`, `paperInk(paper)`, `coverMark(book)`, `coverInitial(title)`,
`hashCoverSeed(s)`, `PAPER_BY_CATEGORY`, `COVER_GLYPHS` (`src/ui/coverPaper.ts`);
`progressLabel({minutes, progress})` (`src/ui/progressLabel.ts`);
`pickRibbon(books, ribbonBookId)` (`src/ui/railView.ts`).

Tokens: `paper.{sand,teal,sage,brick,peach,slate}` exported from `@sotto/core/theme`
beside `colors` (see "Decision recorded" below), and `colors.hairline2` /
`darkColors.hairline2` — light `rgba(34,30,27,0.2)`, dark `rgba(241,234,224,0.2)`.

## Files changed

`packages/core/src/theme.ts`, `theme.test.ts`; `apps/client/src/ui/` `Cover.tsx`,
`coverPaper.ts` (new), `coverPaper.test.ts` (new), `progressLabel.ts` (new),
`progressLabel.test.ts` (new), `BookTile.tsx`, `Rail.tsx`, `railView.ts`,
`Rail.test.ts`, `data.ts`, `dev/fixtures.ts`, `SessionBar.tsx`, `DailyStoryCard.tsx`;
`apps/client/app/` `(tabs)/home.tsx`, `(tabs)/library.tsx`, `(tabs)/vocabulary.tsx`,
`book/[bookId].tsx`, `library/search.tsx`, `reader/[bookId].tsx`;
`apps/client/src/i18n/*.json` (one key).

## Tests

- `pnpm --filter @sotto/client test` — **37 files, 330 tests, all pass** (was 326;
  +18 `coverPaper.test.ts`, +8 `progressLabel.test.ts`, +4 `pickRibbon` in `Rail.test.ts`,
  and lane D's own additions landed in the same tree).
- `pnpm --filter @sotto/core test` — 6 files, 54 tests, all pass (+2 new theme tests:
  the paper key set and the 4.5:1 check for ink-on-sand/sage/peach and
  canvas-on-teal/brick/slate).
- `pnpm -r typecheck` — clean across every package.
- `pnpm lint` — 0 errors, 23 warnings, all pre-existing and in files I did not touch.
- `pnpm exec prettier --check` on every touched file — clean.

Failing-test-first: VERIFIED for `coverPaper.test.ts` and `progressLabel.test.ts`
(both written and run red — "Failed to load url ./progressLabel" / "./coverPaper" —
before either module existed). NOT done for `pickRibbon`: I wrote the helper and its
four tests in the same pass. Recording it rather than claiming otherwise.

## Screenshots

All in `~/Claude/sotto-run8/A/`. Baseline for comparison: `~/Claude/sotto-run8/before/`.

| Shot | Mockup frame it answers to | Reading |
| --- | --- | --- |
| `1440-home.png` | frame 1, "Continue reading" shelf | VERIFIED: spine, mark, stamp, shelf hairline, one coral ribbon on the Chèvre, `P. 3 OF 7` under it, `P. 2 OF 10` under La Fontaine. |
| `375-home.png` | phone 1 | VERIFIED: 104x156 tiles, gap 18, same shelf, same single ribbon. |
| `1440-library.png` / `375-library.png` | frame 2 (rails only; chips are lane C) | VERIFIED: shelves and the mono line on every rail; no second ribbon. |
| `375-book.png` | book detail | VERIFIED: the 180x270 cover renders typographically at scale 1.5. |
| `1440-search.png` | — | VERIFIED: search results wrap at the tile's own width, no grid tiers. |
| `1440-es-search.png` | — | Evidence for the palette: five of the six papers (sand, teal, slate, brick, peach) and three of the four glyph marks in one frame. |
| `1440-reader.png` / `375-reader.png` | frame 3 | Lane D's screen; shot only to prove I broke nothing. |

No page errors and no console errors in any run.

## Decisions recorded

1. **`LibraryBook.progress` is 0..1. VERIFIED, no escalation.** RECON §1's note
   ("the store's unit may be 0..100") is wrong. `app/reader/[bookId].tsx:355` writes
   `Math.min(1, chapterIndex * perChapter + fraction * perChapter)`;
   `src/voice/toolContext.ts:153` writes `1` for a finished book; `shots.mjs` seeds
   `0.3`, not `30`. `progressLabel` takes the 0..1 fraction.
2. **`paper` lives beside `colors`, not inside it.** `theme.test.ts` asserts
   `Object.keys(darkColors) === Object.keys(colors)` and `darkColors` carries
   `satisfies Record<keyof typeof colors, string>`, so a nested `colors.paper` object
   would not type. The six papers are also artwork, not chrome — like the cover
   illustrations they replaced and like `dailyTeal`/`dailySage`, they carry one
   colourway in both schemes. So: `export const paper` + `PaperName`, and only
   `hairline2` is duplicated per scheme. PLAN decision 3's intent is met; its literal
   `paper.*`-in-both-schemes wording is not.
3. **Cover face text uses the light `ink`/`canvas` values deliberately.** The paper
   ground does not change with the scheme, so the text on it must not either. The
   peach cutout *is* chrome and now reads `useTheme()` — RECON risk 2 (Cover imported
   the static light `colors` and never darkened) is fixed.
4. **One page ≈ one minute of reading is still a CONFIRM for Noel.** There is no page
   model anywhere in the pipeline. `pages = max(1, round(minutes))`,
   `page = clamp(1 + floor(progress * pages), 1, pages)`. Recorded in
   `progressLabel.ts`'s own comment for FINAL.md.

## Escalations

1. **Lane E committed my staged work, and lane D's in-flight reader file, under its
   own message (`b952095 run8(E): lane E report`).** I had commit 1 fully staged by
   explicit path; between my `git add` and my `git commit`, lane E ran a
   commit that swept the whole index — 17 files that were not lane E's, including
   639 lines of a half-written `app/reader/[bookId].tsx`. Nothing is lost and nothing
   is broken, but the run 8 history now attributes lane A's cover system and part of
   lane D's reader to lane E. **The orchestrator should decide whether to note this in
   FINAL.md or leave the history as-is; I did not attempt any history rewrite.**
   COMMON.md's "never `git add -A`" rule needs to be enforced, not just stated.
2. **Files I touched that my card assigns to other lanes.** I made the smallest
   possible edit in each, because leaving them would have left `pnpm -r typecheck` red
   for every downstream lane:
   - `src/ui/DailyStoryCard.tsx` (lane B) — one line, `art={book.cover}` → `book={book}`.
   - `app/reader/[bookId].tsx` (lane D) — same one line. Already superseded by lane D's
     own commits.
   - `app/(tabs)/library.tsx` (lane C) — four lines: `'voyage'` → `'adventure'` in
     `VALID_FILTERS`, the rail branch, `byCategory`, and the chip value, because
     `byCategory` now takes a core category. The i18n key stays `library.filter.voyage`
     / `library.rail.voyage`; **lane C owns whether the legacy `?filter=voyage` and
     `?filter=contes` values are still read** (PLAN decision 9 says they must be — I did
     not implement that read).
   - `app/(tabs)/home.tsx` (lane B) — one line, `ribbonBookId={library.currentBookId}`
     on the Resume rail, so the ribbon was actually verifiable in a screenshot.
   - `app/(tabs)/vocabulary.tsx` — `useBookGridTier` had a non-book user here (the saved
     word grid). I moved a three-line `useWordGridTier` into that file rather than keep
     the retired hook alive.

## Not verified

- **All six papers on one screen: NOT possible from the fr-FR pack.** Across the whole
  shipped catalog the six are used {sand 16, slate 9, brick 7, teal 4, peach 2, sage 2},
  but fr-FR (the profile `shots.mjs` seeds) contains only sand, peach, teal, slate: 8 of
  its 13 books are `classics` and none of the eight hashes to brick. **sage appears on
  exactly two books in the entire catalog, both zh.** The palette code is correct (the
  test proves each triple is fully reachable across 200 ids) but the *lived* variety is
  thin and sand is over-weighted, because `classics` and `tales` both contain sand and
  most books are `classics`. This is a content-taxonomy finding, not a code one —
  worth Noel's eye, and not something I changed, since PLAN decision 3 is fixed.
- Dark scheme: NOT screenshotted. The contrast is unit-tested and the cutout now
  follows the scheme, but no dark render was captured.
- Native (iOS/Android): NOT verified. Web only. The ribbon's chevron notch uses the
  RN border-triangle trick and the level stamp uses `borderWidth` on a `Text`; both are
  standard RN but were only seen on react-native-web.
- The cover author line ellipsizes at 120px and at 180px ("ALPHONSE …"). The mockup's
  `.a` would clip too (8px tracked at 0.14em in a ~63px box); I kept `numberOfLines={1}`
  rather than let it overrun the level stamp. Flagging it for lane R's eye.
- e2e: `hosted.mjs` / `voice-live.mjs` / `audible-probe.mjs` were NOT run (they need the
  hosted origins / a mic profile). No selector in RECON §8 touches a tile, a rail, or a
  cover: `getByTestId` is onboarding-only, and the book-facing selectors are route
  pushes and `role=button` names I did not change. INFERRED, not verified.
