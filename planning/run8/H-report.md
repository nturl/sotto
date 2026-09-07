# Lane H — the fix pass over lane R's adversarial review

Lane H (Opus, wave 4). Base: `280b572` (R's review). Card: the fix list in the
dispatch, which renumbers R's findings — the mapping is in the table below.
Evidence lives in `~/Claude/sotto-run8/H/` and is never committed.

Live surfaces used: Metro `http://localhost:8081` (UP), content `http://localhost:8790`.
No new server was started. Nothing under `packages/content/packs/**` was touched or staged.

## 1. Findings, SHAs, proof

| Card | R | SHA | Proof |
|---|---|---|---|
| P0-1 | P0-1 | `1265048` | `H/1440-home.png`, `H/1440-vocabulary.png`, `H/dark-375-home.png` |
| P0-2 | P0-2 | `3b4d5c8` | 5 tests in `data.test.ts`; `H/1440-home.png` |
| P0-3 | P0-3 | `ba0bf36` | 5 tests in `selectors.test.ts`; `H/1440-home.png`, `H/375-home.png` |
| P1-4/5 | P1-1, P1-2 | `7824901`, `a523510` | `H/dark-shots.mjs` computed styles; `H/dark-375-reader.png`, `H/dark-375-home.png` |
| P1-6 | P1-3 | `c0ee8b3` | `planning/design/DESIGN.md` |
| P1-7 | P1-4 | `c0ee8b3` | `planning/design/DESIGN.md`, `BookTile.tsx` |
| P1-8 | P1-5 | `dfb7f96` | `H/375-reader.png`, `H/375-reader-end.png`, `H/end-of-chapter.mjs` |
| P1-9 | P1-6 | `0316d2a` | `H/probe-saved.mjs` computed `backgroundImage`; `H/375-reader-saved.png` |
| P1-10 | P1-7 | `c7a8ecf` | `H/1440-vocabulary.png` |
| P1-11 | P1-8 | `c7a8ecf` | `H/probe-cover.mjs` measurements — **and see §3, the finding is a misdiagnosis** |
| P1-12 | P1-9 | `a70bfbd` | `grep radius.full` → the two rings only |
| P2 | P2-2, P2-7 | `e63c76c` | `TabBar.tsx`, `Sidebar.tsx`, `H/375-home.png` |

### P0-1 — every primary CTA is ink on accent · `1265048`
`Button.tsx:82` is now `disabled ? 'ink3' : 'ink'`. The accent fill and the 4px
cutout carry one colourway in both schemes, so on a primary the label, the
cutout and the book-detail CTA's play glyph are pinned to `lightColors.ink`
rather than the active `colors.ink` (which is cream in dark). Every `Button`
consumer still compiles and renders; `book/[bookId].tsx`'s glyph was the only
call site passing `colors.surface` for an on-accent icon. VERIFIED on screen:
"Start review (2)" (`H/1440-vocabulary.png`) and the spread's "Read" in both
schemes.

### P0-2 — Today's story is never the ribboned book · `3b4d5c8`
New pure `pickDailyBook(books, continueIds, date)` in `data.ts`, exported and
tested (5 cases: empty shelf, day-of-year rotation, excludes the continue set,
excludes every in-progress book while any other exists, falls back to the whole
shelf when all are in progress). VERIFIED: with the run-8 seed Home now shows
La Chèvre + Three Fables on the continue shelf and **Mateo Falcone** as the
spread (`H/1440-home.png`, `H/375-home.png`).

### P0-3 — Recommended widens to adjacent levels · `ba0bf36`
`selectRecommendedBooks` takes the nearest non-empty ring over `BOOK_LEVELS`:
exact level, then ±1, then ±2, always unstarted, never mixing distances
(5 tests). VERIFIED: the fr-FR A2 seed profile now renders all three rails at
both widths; the heading still reads "Recommended for A2" on desktop even
though the books come from A1/B1, which the card accepts.

### P1-4/5 — dark scheme · `7824901`, `a523510`
The peach selection fill and the mark band are artwork, not chrome: `ui/tokens.ts`
already derived `peachSelection` from the light palette, but the reader
re-derived it against the active scheme and left the token text on the active
ink. Both speech-fill components now read fill, mark and text from the light
palette whenever a word is selected or saved; the spread's Read label and its
cutout are pinned the same way.

A second pass was needed: pinning the text fixed the mark (2.95:1 → **12:1**)
but dropped the *selection* to 3.95:1, because `rgba(242,200,180,.55)` over the
dark canvas composites to a muddy grey. On a dark ground the fill is now the
same colour flattened against the light canvas, `rgb(243,216,199)` — ink on it
is 12:1, and the light rendering is byte-identical (still the exact alpha
value PLAN decision 7 fixes and lane D verified). Measured live in dark:

```
savedColor  rgb(34, 30, 27)
savedImage  linear-gradient(rgba(0,0,0,0) 62%, rgb(255,216,168) 62%, rgb(255,216,168) 92%, rgba(0,0,0,0) 92%)
savedTransform  none
selColor    rgb(34, 30, 27)   selBg  rgb(243, 216, 199)
```

### P1-6 / P1-7 — DESIGN.md · `c0ee8b3`
The "Dark mode: not in v1" line is replaced by one sentence pointing at
`darkColors` in `packages/core/src/theme.ts` and naming the three artwork
colourways that stay light in both schemes. The ink-3 token row and the
contrast finding now say **2.61:1 on canvas — decorative only, never body
text at any size**. `BookTile`'s author line and its "Your book" caption are
explicitly ink-2 (the author was already ink-2 by role default; R's line
number pointed at the caption).

### P1-8 — the phone transport moves inside the sheet · `dfb7f96`
`Sheet` gains a `footer` slot rendered after the scrolling body, so the
transport is the sheet's last child (mockup line 397) and Play stays reachable
however far the panel has scrolled. `bottomOffset` is no longer passed;
the passage reserves `sheetHeight` on phone (which now includes the transport)
and `transportHeight` on desktop. VERIFIED at 375 at the end of the chapter
(`H/375-reader-end.png`): scrolled to `scrollTop 719 / scrollHeight 1491`, the
last line "…échappée par la fenêtre." sits fully clear at y=578 above the
sheet, and one Play button resolves with nothing selected.

### P1-9 — the saved word is a marker band · `0316d2a`
The `skewX(-10deg)` is gone (it appears nowhere in the mockup) and the fill is
the mockup's `.w.saved` gradient — mark from 62% to 92% of the line box. RN Web
forwards `backgroundImage` to CSS; native has no gradient in a text background
so it stays a flat mark fill, disclosed in DESIGN.md. VERIFIED live, computed
style above. Note the band only renders when the token is *not* also selected —
that precedence is unchanged from before this run.

### P1-10 / P1-11 — Cover · `c7a8ecf`
Under 72px the cover renders paper + spine + mark only. VERIFIED at the 44×66
vocabulary book row (`H/1440-vocabulary.png`): a clean teal board with a "C",
no smudged type. See §3 for what P1-11 actually turned out to be.

### P1-12 — radius.full · `a70bfbd`
Sheet handle → 2, transport progress segments → 2, `IconButton` base → 10 with
`radius.full` moved onto `variant="ring"`. `grep radius.full apps/client` now
returns `IconButton.tsx` (the ring), `voice/ui/ControlCluster.tsx:205` (the
72px mic/play ring — a ring, kept) and `Chip.tsx` (zero callers, see §4).
`IconButton`'s 44px `minWidth/minHeight` was left alone: R accepted lane E's
call that DESIGN.md's tap-target rule beats the mockup's 40px frame value.

### P2 · `e63c76c`
Tabs emit `aria-selected`, sidebar rows emit `aria-current="page"` (a link
cannot be `aria-selected`), both alongside the existing `accessibilityState`
for native — the same react-native-web 0.21 gap lane C fixed in `LevelScale`.
The phone Home rail head is plain "Recommended"; desktop keeps
"Recommended for {level}". **No plain-"Recommended" key existed**, contrary to
the card, so `home.rail.recommendedPlain` was added through
`scripts/i18n-add.mjs` with real translations in all nine catalogs.

## 2. Checks

```
pnpm --filter @sotto/client test   Test Files 40 passed (40)   Tests 385 passed (385)
```
(357 at R's review + 10 new lane-H tests + 18 landed by the parallel voice session.)

`pnpm -r typecheck` — pass, 5 of 6 workspace projects, all Done, no diagnostics.

`pnpm lint` — 0 errors, 24 warnings. R's baseline was 23, all in
`packages/content/scripts/`. The delta is not lane H: the extra warnings
(`TUTOR_TIERS` unused in `voice/TutorModelsPanel.tsx`, `paywall/index.tsx`
exhaustive-deps, two test files, `languages.ts`) come from the parallel voice
session's working tree. Lane H's own new warning (`colors` left unused in
`book/[bookId].tsx`) was fixed inside `7824901`.

`pnpm exec prettier --check` on all 20 touched files — clean.

`node apps/client/e2e/voice-live.mjs` — **6/6 PASS**, exit 0:
```
[PASS] phase A: learner caption contains "cigarra"
[PASS] phase A: tutor caption present (word explained)
[PASS] phase A: state cycled listening -> thinking -> speaking
[PASS] phase B: learner caption contains "cigarra" (save request heard)
[PASS] phase B: saved word "cigarra" in vocabulary store
[PASS] no page/console errors in either phase
```

Screenshots (all from the live Metro, run-8 seed, no page or console errors on
any run): `H/{375,1440}-{home,library,reader}.png`, `H/375-reader-end.png`,
`H/375-reader-saved.png`, `H/1440-book-detail.png`, `H/1440-vocabulary.png`,
`H/dark-375-home.png`, `H/dark-375-reader.png`.

## 3. P1-11 is a misdiagnosis — recorded, and the code changed anyway

R's P1-8 says the author's `paddingRight: px(30)` "scales with the cover" and
so elides "ALPHONSE DAUDET" on the 280px book-detail cover, and proposes a
constant 30. Measured on the live 280px cover, that is backwards:

```
author box   x 393 → 610, padding-right 70px, content 147px, text needs 291px
level stamp  x 570 → 619, width 49px, own right offset 18.67px
```

Every dimension is exactly `scale = 280/120 = 2.33` times the 120px cover's
(content 63 × 2.33 = 147), so the layout is *identical in proportion* at both
sizes and the author elides at 120 too — the string is simply longer than the
measure. Worse, a **constant** 30 would put the author's content edge at
x 607.6 and run it straight under the stamp, which spans 570→619.

What did change: the clearance is now the stamp's measured width plus its own
right offset and a 2px gap, instead of a scaled guess at it. That reproduces
today's spacing (69.7 against 70 at 280, 31 against 30 at 120) while removing
the coupling R flagged, and it can no longer be wrong for a longer level
string. **The ellipsis itself is not fixable at this measure** without either a
second author line (the mockup says one) or a shorter author string; flagging
for Noel rather than inventing a rule.

## 4. Not fixed, and why

- **`Chip.tsx` stays on disk** (zero callers, R's P2-1). The standing no-delete
  rule holds; **Noel's call.**
- **The ink-3 caption sweep.** DESIGN.md now says ink-3 is 2.61:1 and never
  body text, but ~20 call sites still pass `color="ink3"` for real caption
  text — empty states, disclaimers, `library.tsx:258/331`,
  `vocabulary.tsx:241/262`, `book/[bookId].tsx` ×4, `import/`, `usage/`,
  `account/`, `library/search.tsx`, plus the three voice-UI mono lines R listed
  as P2-11. The card scoped me to the tile, so the rest is recorded in
  DESIGN.md as an open sweep and listed here. It is mechanical (one token
  swap per site) but touches 12 screens and wants its own shot pass.
- **R's other P2s** (`.btn` 47px vs 44, rail gap 48 vs 40, tile title
  letter-spacing, panel Save label ink-2, glyph collisions, `/library/search`
  grid, book-detail accent Back, DESIGN.md's stale Don't line and reader type
  values, the palette thinness of the fr-FR pack) were not on the card and are
  untouched.
- **Native, 130% Dynamic Type, CJK, hosted.mjs, Settings › Account plan row** —
  same gaps R listed in its §4; nothing in this lane's changes narrows them.
  The `Sheet` footer, `backgroundImage` band and `aria-*` attributes are all
  web-verified only; the band's native path is a flat mark fill by design and
  the footer is plain layout, so both should hold, but that is INFERRED.
- **`audible-probe.mjs`** was not re-run: its one FAIL is the local model's
  phrasing, reproduced identically by lanes D and R, and nothing in this lane
  touches narration or talk. `voice-live.mjs` (6/6) covers the regression risk.

## 5. For Noel

1. **P1-11 / the cover author ellipsis** — the finding was wrong about the
   cause; the string is longer than the measure at every cover size. Decide:
   live with the ellipsis, allow the author two lines on covers ≥ 200px, or
   print `shortAuthor` on the cover.
2. **The ink-3 sweep** above — one pass, 12 screens, worth doing before the
   next visual review so DESIGN.md and the app agree.
3. **`Chip.tsx`** — delete or keep.
