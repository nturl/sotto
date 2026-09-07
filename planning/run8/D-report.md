# Lane D — Reader (run 8)

Card: `planning/run8/cards/D.md`. Mockup: `planning/design/app-mockup-v2.html` frame 3 (desktop) and phone 3.
Every claim below is **VERIFIED** (I ran it / read it) unless marked INFERRED.

## Commits (all pushed)

| SHA | Title | Paths |
| --- | --- | --- |
| `03e51cb` | run8(D): plain reader tokens — peach 55% selection, no dotted underline | `src/ui/tokens.ts`, `src/ui/reader/SelectableSpeechText.tsx`, `e2e/hosted.mjs` |
| `e0abd0e` | run8(D): reader panel view model (order, passage split, saved-word line) | `src/ui/reader/readerPanel.ts`, `readerPanel.test.ts` |
| `11cf1c5` | run8(D): reader measure 640, transport under the passage, panel order | `app/reader/[bookId].tsx`, all nine `src/i18n/*.json` |
| `daccdb4` | run8(D): pin the desktop panel to 360, id the speaker row, transport on canvas | `app/reader/[bookId].tsx` |

## Panel order **as rendered in the DOM**

Read back from the live Metro page (`~/Claude/sotto-run8/D/probe-panel.mjs`, 1440x900,
`fr-chevre-de-m-seguin`, word "chèvre" tapped and saved) by enumerating `[data-testid]`
nodes in document order — not from intent:

```
reader-panel-word         :: chèvre
reader-panel-gloss        :: goat
reader-panel-speaker      :: (ring icon button)
reader-panel-save         :: Saved
reader-panel-details      :: Details
reader-panel-report       :: Report
reader-panel-passage      :: In this passage / Un jour, il a acheté une sept…
reader-panel-your-words   :: Your words in this book / chèvre
reader-panel-talk         :: Talk about this passage
```

That is PLAN.md decision 11 exactly, minus `reader-panel-form` — see "Form line" below.
The same node order renders in the phone sheet (one `translationPanel` node, used by both).

`panelRowOrder()` in `src/ui/reader/readerPanel.ts` is the single source of that order and is
**load-bearing**, not decorative: the screen gates each row on `shows('reader-panel-…')`, so a
change to the tested order changes the DOM.

## What changed

**Desktop layout.** `isDesktop` now reads `DESKTOP_BREAKPOINT` from `Shell.tsx` (the 900 literal at
`reader:281` is gone). Passage column caps at **640, centered** (`maxWidth 640 / width 100% /
alignSelf center`), measured live at x=240 w=600 inside a 20px gutter — i.e. the 640 column sits at
x=220 in the 1080px area left of the panel. Header row = chapter mono label left, Settings + Close
right. The header mic button is gone; its action is the panel's last row.

**Chapter label.** New key `reader.chapterLabel` = `"{title} · Chapter {n} of {m}"` (mockup frame 3's
`.chap`), rendered from the localized book title + chapter index. The old label rendered the
chapter's own content-locale title, which the mockup does not show.

**Transport.** One hairline-topped bar inside the 640 measure:
`[elapsed mono] [prev · -10 · play ring 44 accent · +10 · next] [remaining · speed]`, with the
segmented row (3px, `surface2` track, `ink` fill) under it. Play ring dropped 56 → 44. On desktop the
bar's background is `canvas` (mockup frame 3 has it as a rule on the paper); on phone it keeps
`surface` because it docks directly under the sheet.

**Tokens.** No underline at any time (`underline` prop deleted from `SelectableSpeechText`). Selected
fill is peach at 55% — verified in the browser as `rgba(242, 200, 180, 0.55)`, the mockup's `.w.sel`
value exactly. Radius stays `radius.sm` (2). Saved marker unchanged (`colors.mark` + skew). Speech
fill unchanged.

**Panel.** The four mutually-exclusive shapes (no selection / whole-sentence span / span / single
word) collapse into one render. Word Fraunces 28 (`role="heading" size={28}`; a whole-sentence span
keeps `role="reading"` — 28px Fraunces on a full sentence is unreadable), gloss ui 16 ink2, speaker
ring 44 accent outline at the block's top-right, Save = surface2 / radius 10 / 500 14 / bookmark
glyph with the saved state = `mark` fill + 1.5 `ink` border + 4px ink cutout (drawn as an offset View
behind the face, the technique `Button.tsx` uses), Details / Report captions with a 40px hit height
(decision 14), "In this passage" and "Your words in this book" as eyebrow + body blocks separated by
hairlines, "Talk about this passage" pinned to the panel bottom via `marginTop: auto`.

**e2e selector.** `hosted.mjs` `firstWordCenter()` no longer scans for `borderBottomStyle: dotted`
(which I deleted); it selects `span[data-token-id]`.

## Proof

**Tests.** Failing tests first: `readerPanel.test.ts` was written and run red
(`Failed to load url ./readerPanel.ts`) before `readerPanel.ts` existed. 15 new tests covering
`panelRowOrder` (6), `sentenceHighlight` (6), `savedWordsLine` (3).

```
pnpm --filter @sotto/client test
 Test Files  37 passed (37)
      Tests  330 passed (330)
```

`pnpm lint` → `✖ 23 problems (0 errors, 23 warnings)` — all 23 warnings pre-existing, none in a lane-D
file. `pnpm exec prettier --check` on every touched file → "All matched files use Prettier code
style!". `pnpm -r typecheck` → **no error in any lane-D file**; the errors present in the shared tree
belong to other lanes in flight (`src/ui/Rail.test.ts` "contes" is not a `BookCategory` at the time of
my first commits; `src/ui/libraryFilters.test.ts` importing a module lane C has not written yet).

**Screenshots** (`node ~/Claude/sotto-run8/shots.mjs ~/Claude/sotto-run8/D/`, no page/console errors):

| File | Answers |
| --- | --- |
| `~/Claude/sotto-run8/D/1440-reader.png` | mockup frame 3 (Desktop · Reader) |
| `~/Claude/sotto-run8/D/375-reader.png` | mockup phone 3 (Phone · Reader) |
| `~/Claude/sotto-run8/D/1440-reader-saved.png` | saved Save state + "Your words in this book" |
| `~/Claude/sotto-run8/D/1440-reader-empty.png`, `375-reader-empty.png` | empty state + Talk row |
| `~/Claude/sotto-run8/D/1440-home.png` … | incidental (shots.mjs shoots all three screens) |

Against frame 3: measure, centering, chapter label, icon pair, plain tokens, peach selection,
transport shape, segmented row, panel width, word/gloss, speaker ring, Save/Details/Report, "In this
passage" with the marker on the word, and the pinned Talk button all match. Against phone 3: sheet
with handle, same row order, Talk row last inside the sheet, transport under it.

**`hosted.mjs` selector, proven live** (`~/Claude/sotto-run8/D/probe-firstword.mjs` — the rewritten
`firstWordCenter()` body verbatim, then hosted.mjs's own click → Save → vocabulary assertions; the
full hosted.mjs cannot run against Metro because its landing-page and service-worker assertions only
hold on the deployed origin):

```
[PASS] 375: firstWordCenter -> "M", Save button visible: true
[PASS] 375: "M" in vocabulary store -> ["M"]
[PASS] 1440: firstWordCenter -> "M", Save button visible: true
[PASS] 1440: "M" in vocabulary store -> ["M"]
```

RECON.md §8 says to select `span[data-tokenid]`. **That is wrong** — RN Web hyphenates `dataSet`
keys. Probed live: `data-tokenid` → 0 nodes, `data-token-id` → 240 nodes, `borderBottomStyle: dotted`
→ 0 nodes. The script uses `data-token-id`.

**`voice-live.mjs`** — `SOTTO_SCREENSHOT_DIR=~/Claude/sotto-run8/D node apps/client/e2e/voice-live.mjs`, tail:

```
===== Vocabulary store after phase B =====
  ["cigarra"]

===== Assertions =====
  [PASS] phase A: learner caption contains "cigarra"
  [PASS] phase A: tutor caption present (word explained)
  [PASS] phase A: state cycled listening -> thinking -> speaking
  [PASS] phase B: learner caption contains "cigarra" (save request heard)
  [PASS] phase B: saved word "cigarra" in vocabulary store
  [PASS] no page/console errors in either phase

Final screenshots: ~/Claude/sotto-run8/D/voice-live-A-explain-final.png, voice-live-B-save-final.png
```

6/6.

**`audible-probe.mjs`** — run twice.

Run 1, 9/10; the miss:

```
  [PASS] reply mentions Provence (mechanical substring check)
  [FAIL] reply ends with a question (discuss-mode follow-up)
  [PASS] no page/console errors
Last tutor reply: "La Provence est une région du sud de la France. C'est un endroit connu pour son
beau climat et ses villages charmants."
```

Run 2, 10/10:

```
  [PASS] reply ends with a question (discuss-mode follow-up)
Last tutor reply: "Oui, la Provence est bien une région du sud de la France. Savais-tu que M. Seguin
vit dans une petite maison blanche près d'un village charmant ?"
```

The missed assertion is on the local LLM's phrasing, not on anything the reader renders (this script
drives `/voice/<id>` through the text fallback and never enters the reader). Non-deterministic, not a
regression. "Talk about this passage" still opens the tutor — the panel row calls the same
`talkAboutPassage` → `/voice/<bookId>?mode=discuss` the header mic used to.

## Deviations from the card, and why

1. **`peachUnderline` is NOT deleted from `tokens.ts`.** The card says delete it "if nothing else uses
   it". `apps/client/src/ui/SpeechFillText.tsx:23,161` (the voice screen, not a lane-D file) still
   reads it. Left in place with a comment saying to delete it with that call site.
2. **`peachSelection` at 55% also changes the voice screen.** Same token, one consumer outside the
   reader (`SpeechFillText.tsx:101`). That is decision 7's stated intent, but it is a cross-screen
   effect I did not screenshot. NOT VERIFIED on the voice screen.
3. **Form line: no lemma/POS data exists.** `packages/core/src/models.ts` `Token` is
   `{ id, text, normalized, isWord, spaceBefore, glosses?, pinyin?, startMs?, endMs? }` — no `lemma`,
   no part-of-speech, anywhere in `packages/core/src`. Per the card I omit the row rather than
   placeholder it. The mockup's `.ph` slot is not dead, though: CJK `pinyin` (which previously sat
   *above* the gloss) now renders there with the `.ph` styling and the `reader-panel-form` testID, so
   `reader-panel-form` appears for CJK books only. NOT VERIFIED live — no zh book was seeded in the
   shot profile. **Needs Noel / lane R:** confirm pinyin belongs in the form slot, or move it back.
4. **Phone transport stays docked below the sheet, not inside it.** Mockup phone 3 draws it inside the
   sheet. Putting it there would (a) push Play behind the sheet's own internal scroll on a long
   panel and (b) hide narration entirely whenever the sheet is not shown — and it would rewrite run
   7's `bottomOffset` contract in `Sheet.tsx`. Smallest change instead: **the phone sheet is now
   always visible**, so the empty state and the Talk row are reachable with nothing selected. That
   matters because the header mic is gone: without it the tutor would have been unreachable on phone
   until a word was tapped. `Sheet.tsx` is untouched.
5. **Header icon buttons render at 44, not 40.** I pass `size={40}`, but `IconButton`'s base style
   sets `minWidth/minHeight: space.tapTarget` (44) and `IconButton.tsx` is not a lane-D file. The
   glyphs are 18/20 as specified; the hit box stays 44. Lane E's call whether to relax that floor.
6. **Segmented row keeps fractional fill.** Decision 11 / the card say "done = ink"; the existing
   implementation fills each block's segment by its audio-time fraction, which is a superset (a
   finished block is fully ink). Kept.
7. **Span selections keep Report only** (no Save / Details), matching today's behaviour — you cannot
   save a multi-word span as a vocabulary entry. `panelRowOrder` encodes and tests that.
8. **`<Cover book={book} …>` in `CompletionView` (line ~1175).** Lane A migrated that one line to the
   new contract in the shared working tree before my first `[bookId].tsx` commit, so it landed inside
   `11cf1c5` rather than in a lane-A commit. The change is what the card anticipated; flagging the
   attribution only.
9. **`Sheet.tsx` not touched.** No sheet redesign was needed (see 4).

## Not verified

- **Native (iOS/Android).** Everything above is react-native-web on Metro. `position: sticky`,
  `data-token-id`, and drag-select are web-only paths, as before.
- **Dark mode.** `createStyles(colors)` is theme-reactive and every new value is a token
  (`canvas`, `surface2`, `mark`, `ink`, `hairline`, `accent`), so it should follow — INFERRED, not
  screenshotted.
- **CJK reader** (the `reader-panel-form` row, and the CJK 22/1.8 type override with the new measure).
- **The voice screen's selection fill** at 55% (see deviation 2).
- **Full `hosted.mjs`.** Only its reader half is proven, against Metro (see above). The orchestrator's
  hosted run against the deployed free origin is still the real check on `firstWordCenter()`.

## Needs escalation / Noel

- Nothing blocking. Two judgement calls for lane R or Noel: the pinyin-in-the-form-slot decision
  (deviation 3) and the phone transport staying docked below the sheet rather than inside it
  (deviation 4).
