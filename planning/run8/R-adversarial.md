# Lane R — adversarial review of run 8 against `app-mockup-v2.html`

Reviewer: lane R (Opus, wave 3, read-mostly). Date 2026-09-06.
Diff under review: `git diff 27dff1d..HEAD -- apps/client packages/core planning/design/DESIGN.md`
(55 files, +4117/−1574). Reviewed **by diff, not by commit message** — several run-8
changes were swept into commits titled `voice:` / `planning:` by an unrelated parallel
session, as lanes A, B and C each escalated.

Live surfaces: Metro `http://localhost:8081` **UP** (HTTP 200), content server
`http://localhost:8790` reachable (`/` 404s, which is its normal shape — `audible-probe.mjs`
drove a full local cascade turn through it successfully).

Evidence produced by this lane lives in `~/Claude/sotto-run8/R/` and is never committed:
`styles.mjs` / `styles.txt` (computed-style dump), `selectors.mjs`, `shelf.mjs`,
`extras.mjs` / `extras2.mjs`, `probe.mjs`, `checks.txt`, `voice-live.log`,
`audible-probe.log`, and the PNGs cited below.

**The claim "the app UI v2 mockup is shipped" does not hold yet.** Three P0s and nine P1s
below. None of them is a regression of word lookup, save, narration, talk, the library
filter or the hosted journey — all six of those still work (evidence in §3). The failures
are of a different kind: the two contrast rules the spec itself discovered were written
into DESIGN.md but not into the shared `Button`, and Home's own content selection puts the
same book in two places while dropping a third of the mockup's frame.

---

## 1. Findings

Severity per the R card: **P0** = visibly wrong against the mockup, or a regression of word
lookup / save / narration / talk / library filter / hosted journey. **P1** = a mockup value
missed. **P2** = polish.

### P0-1 — every primary CTA outside the Today's story spread still ships cream-on-coral (3.42:1)

- **file:line** `apps/client/src/ui/Button.tsx:78`
  `const labelColor = disabled ? 'ink3' : isPrimary ? 'surface' : 'ink';`
- **mockup** `app-mockup-v2.html:84` `.btn.cta{background:var(--accent);color:#161311;…}`
  and the legend at `:405` — *"Primary CTA (ink label: cream on coral is 3.45:1, ink is
  5:1)"*. PLAN decision 8: *"CTA label is ink … **Every primary button in scope follows
  this**."* Lane E wrote the same rule into `planning/design/DESIGN.md:27`: *"Every primary
  cutout button sets its label in ink."*
- **app** Lane B built the spread's Read button locally and got it right (measured ink
  `rgb(34,30,27)` on accent = 4.49:1, `R/styles.txt` → `HOME 1440 › readLabel`). The shared
  `Button` was never touched by any lane — no card owns it — so every other primary CTA is
  unchanged: onboarding **"Start reading"** (`R/1440-onboard-done.png`), book detail
  **"Continue"** (`R/1440-book-detail.png`), vocabulary **"Start review (2)"**
  (`R/1440-vocabulary.png`, zoom `R/zoom-vocab-cta.png`). Measured cream `#FBF6EC` on accent
  `#E4572E` = **3.42:1**, matching the spec's own 3.45 finding almost exactly. The very
  first CTA a stranger meets in the hosted journey is one of them.
- **smallest fix** `Button.tsx:78` → `const labelColor = disabled ? 'ink3' : 'ink';`

### P0-2 — Today's story can be the book that is already in Continue reading

- **file:line** `apps/client/src/ui/data.ts:185-187`
  `const daily = seededBooks.length > 0 ? seededBooks[dayOfYear(new Date()) % seededBooks.length]! : …`
- **mockup** frame 1 (`app-mockup-v2.html:195-245`) and phone frame 1 (`:319-334`): the
  Continue-reading shelf and the Today's story spread carry **different books**; the spread's
  primary action is "Read", i.e. an invitation to start something.
- **app** With the run-8 seed profile (`shots.mjs`, fr-FR / A2 / La Chèvre 30 %), **La Chèvre
  de M. Seguin appears twice on Home** — ribboned under Continue reading and again as the
  whole Today's story spread, offering "Read" for a book that is a third read. Evidence
  `R/1440-home.png` (desktop) and `R/375-home-130.png` (phone). The daily index has no
  awareness of `continueIds`, which is computed eight lines above it at `data.ts:165`.
- **smallest fix** at `data.ts:185`, pick from the complement and fall back:
  `const pool = seededBooks.filter((b) => !continueIds.has(b.id)); const from = pool.length ? pool : seededBooks;`
  then index `from` by the same `dayOfYear` expression.

### P0-3 — Home ships two sections where the mockup has three, for the default profile

- **file:line** `apps/client/src/state/selectors.ts:46-52` (`selectRecommendedBooks` =
  *exact* level **and** not started), consumed at `apps/client/src/ui/data.ts:164` and
  hidden by `apps/client/src/ui/homeSections.ts:25-32`.
- **mockup** both Home frames carry three rails: Continue reading → Today's story →
  **Recommended** (`app-mockup-v2.html:335-343` for the phone frame). PLAN decision 10 fixes
  that order.
- **app** fr-FR has exactly one A2 book and it is the one in progress, so the recommended set
  is empty and `resolveHomeSections` correctly drops the section rather than render an empty
  shelf. Net effect: the **default** A2 Home is two sections at both widths
  (`R/1440-home.png`, `R/375-home-130.png`, and `R/styles.txt` → `HOME 1440 › sectionNames`
  = `['Continue reading', "Today's story"]`). This is not a lane regression — `selectors.ts`
  is untouched by the run-8 diff — but the shipped screen does not look like the mockup, and
  the hiding rule plus a strict selector is what makes it so. Lane B diagnosed the same
  content fact and proved the rail renders for an A1 profile (`B/1440-home-a1.png`); it
  treated the gap as a content finding rather than a screen defect.
- **smallest fix** in `selectRecommendedBooks`, fall back one level either side when the
  exact-level set is empty:
  `const exact = books.filter(b => b.level === level && !isStarted(progress, b.bookId)); if (exact.length) return exact; return books.filter(b => ADJACENT[level].includes(b.level) && !isStarted(progress, b.bookId));`
  (Alternatively fix it in content by adding A2 fr-FR books — but the code should not depend
  on a pack being deep.)

---

### P1-1 — dark scheme: the saved-word mark is 2.95:1

- **file:line** `apps/client/src/ui/reader/SelectableSpeechText.tsx:118-121` — the token's
  `color` stays the animated `quiet → colors.ink` interpolation while `backgroundColor`
  becomes `colors.mark`; in dark, `colors.ink` is a light value.
- **mockup** `:107` `.w.saved` is `--mark` under dark `--ink` text.
- **app** dark reader at 375: cream `rgb(241,234,224)` on the mark band, sampled from
  `R/375-reader-dark.png` / `R/zoom-dark-mark.png` = **2.95:1**. Unreadable by the R card's
  own bar. (The peach *selection* fill in dark measures 8.16:1 and is fine.)
- **smallest fix** when `saved || filled`, pin the colour to `lightColors.ink` — the same
  trick `Cover.tsx:96` already uses to keep cover text legible in either scheme.

### P1-2 — dark scheme: the spread's Read CTA label and its cutout both go cream

- **file:line** `apps/client/src/ui/TodaysStorySpread.tsx` (Read button face + cutout use
  scheme-reactive `colors.ink`).
- **mockup** legend `:407`: *"4px 4px 0 ink on the primary CTA"*; `:84` sets the label to
  `#161311`. Both are fixed dark values, not scheme-reactive.
- **app** `R/1440-home-dark.png`, zoom `R/zoom-dark-cta.png`: label sampled at
  `(233,149,121)` on accent `(228,87,46)`, and the cutout renders as a **cream halo** rather
  than an ink shadow.
- **smallest fix** pin both to `lightColors.ink` in `TodaysStorySpread.tsx` (and, once
  P0-1 lands, in `Button.tsx` too — its cutout at `Button.tsx:99` has the same problem).

### P1-3 — DESIGN.md says dark mode does not exist; the app ships a Dark toggle

- **file:line** `planning/design/DESIGN.md:41` — *"Dark mode: not in v1. App is light-only"*
  — versus `apps/client/app/settings/appearance.tsx:20`
  `const SCHEMES = ['system','light','dark']`.
- Lane E rewrote the surrounding block this run and left the line standing. The two dark
  failures above are therefore reachable by any user who taps Settings › Appearance › Dark.
- **smallest fix** decide one way in FINAL.md: either delete the sentence and treat dark as
  shipped (which makes P1-1 and P1-2 blockers), or hide the Dark row until it is designed.

### P1-4 — ink-3 measures 2.61:1 on canvas, and DESIGN.md now asserts it clears 4.5:1

- **file:line** `planning/design/DESIGN.md:15` — `| ink-3 | #9C9287 | muted/legal text
  (4.5:1 on canvas) |`, restated in the new contrast block at `:28` as clearing 4.5:1 "at
  caption size and no smaller".
- **measured** `#9C9287` on canvas `#F4ECDF` = **2.61:1**. It fails 4.5:1 at *every* size,
  not only under 13px. The spec's "fails at 11px" phrasing is what seeded the wrong rule.
- **app** `apps/client/src/ui/BookTile.tsx:89` sets `role="caption" size={12.5}
  color="ink3"` — under the 13px floor the same DESIGN.md edit introduces. (The tile's
  11px mono meta correctly uses ink-2 — verified `R/styles.txt` → `tilePage` `color:
  rgb(110,100,89)`.)
- **smallest fix** correct the DESIGN.md rows to "2.61:1 on canvas — decorative only, never
  body text", and change `BookTile.tsx:89` to `color="ink2"`.

### P1-5 — phone: the transport is docked below the sheet, not inside it *(lane D deviation 4, overruled)*

- **file:line** `apps/client/app/reader/[bookId].tsx:1059-1062` (comment: *"the transport
  still docks below the sheet"*) and `:238-239`.
- **mockup** `app-mockup-v2.html:397` puts `<div class="transport">` as the **last child of
  `.sheet`**, after `.talk`. PLAN decision 11 says the same: *"Transport sits under the
  passage on desktop and **at the bottom of the sheet on phone**."* Lane E's own DESIGN.md
  edit repeats it verbatim. Three sources agree against the implementation.
- **app** `R/375-reader-sheet.png`: the surface sheet ends after "Talk about this passage"
  and the transport sits on canvas beneath it, giving the phone reader two stacked bars and
  a hairline at the screen's edge.
- **lane D's justification** was narration visibility when the sheet is dismissed. That
  reason lapses on D's own account — its report states "the phone sheet is now always
  visible", so nothing is hidden by moving the transport inside.
- **smallest fix** render the transport as the last child of the sheet on phone. If it stays
  out, PLAN decision 11 and the DESIGN.md line lane E just wrote must both be amended in
  FINAL.md — the current state is code and documentation disagreeing.

### P1-6 — the saved token is a full-height block with an invented skew, not a marker band

- **file:line** `apps/client/src/ui/reader/SelectableSpeechText.tsx:120,123`
  `backgroundColor: … saved ? colors.mark …` plus `transform: [{ skewX: '-10deg' }]`.
- **mockup** `:107` `.w.saved{background:linear-gradient(transparent 62%,var(--mark) 62%,var(--mark) 92%,transparent 92%)}`
  — a highlighter band across the lower third, no skew. DESIGN.md device 2 says a skewed
  rectangle is drawn *under* a word.
- **app** measured live: `{"bg":"rgb(255, 216, 168)","transform":"matrix(1, 0, -0.176327, 1, 0, 0)"}`
  (`R/selectors.mjs` output). Visual: `R/zoom-saved-word.png` — the panel's "In this passage"
  marker is a solid rectangle, which reads as the same device as the peach selection fill and
  loses the distinction the mockup draws between "selected now" and "saved".
- **smallest fix** the honest RN answer is a bottom-aligned absolutely-positioned band behind
  the text rather than a `backgroundColor`; if that is judged too large for this run, drop the
  `skewX` (it appears nowhere in the mockup) and record in DESIGN.md that RN renders the
  marker as a full fill.

### P1-7 — covers scale with no floor, so small call sites print 3–4px type

- **file:line** `apps/client/src/ui/Cover.tsx:100-102` (`const scale = width / BASE_WIDTH`,
  `titleSize = px(13)`, `authorSize = px(8)`) with no minimum, used at
  `apps/client/app/(tabs)/vocabulary.tsx:224` and `:287` (32×48 and 44×66).
- **mockup** never renders a cover below 96px; the R card requires every `<Cover` call site
  to read typographically.
- **app** `R/zoom-vocab-cover.png` — title, author and level stamp are illegible smudges at
  the vocabulary book-selector size; at 32px they would be ~3.5px, ~2.1px and ~2.4px.
- **smallest fix** in `Cover.tsx`, when `width < 72` render paper + spine + mark only and
  skip title/author/stamp.

### P1-8 — the author elides on the largest cover in the app

- **file:line** `apps/client/src/ui/Cover.tsx:146` `paddingRight: px(30)` on the author line
  (scales with the cover), with `numberOfLines={1}`.
- **mockup** `:65` `.cv .a{…padding-right:30px}` — a **constant** 30px clearance for the
  level stamp, because the mockup's cover is always 120 wide.
- **app** at 280px (`apps/client/app/book/[bookId].tsx:62`) the clearance becomes 70px and
  "ALPHONSE DAUDET" truncates to **"ALPHONSE …"** — see `R/1440-book-detail.png`. Lane A
  flagged this as "a possible mismatch, not resolved".
- **smallest fix** make the clearance a constant: `paddingRight: px(8) + stampWidth`, or
  simply `paddingRight: 30` unscaled.

### P1-9 — `radius.full` used outside the two rings, in three places

- **mockup** legend `:408`: *"Radius: 2 on covers, 10 on cards, sheets and buttons, **9999
  only on the two rings**."*
- **app**, all three confirmed by grep and by computed style:
  1. `apps/client/app/reader/[bookId].tsx:1385-1390` — `progressSegment` has
     `borderRadius: radius.full` on a 3px-tall bar. Mockup `:115` `.segs i{border-radius:2px}`.
  2. `apps/client/src/ui/Sheet.tsx:108` — the drag handle. Mockup `:161`
     `.handle{…border-radius:2px}`.
  3. `apps/client/src/ui/IconButton.tsx:67` — the base style, so the Home title-row icon
     buttons render **44px fully round** where the mockup `:48` has
     `.ib{width:40px;height:40px;border-radius:10px}`. Lane D noticed the 44-vs-40 and
     deferred it to E; lane E's report claims `IconButton` *"already matches the mockup's
     `.ib`"* and deliberately left it — **that claim is refuted** (see §2).
- **smallest fix** `radius.sm` at the first two sites; add a non-ring `IconButton` shape
  (radius 10, 40px) for the title row and keep `radius.full` for `variant="ring"` only.

---

## 1b. Ban-list sweep (P2 volume)

Sixteen P2s, listed so they are on the record but not itemised at length:

1. `apps/client/src/ui/Chip.tsx` still on disk with zero callers (lane C deferred the
   deletion to Noel, correctly, under the standing no-delete rule).
2. Tab-bar items carry `role="tab"` but **no `aria-selected`** — no element matched
   `[aria-selected="true"]` in `R/styles.txt` → `PHONE 375 › tabOn: NULL`. Lane C's
   `accessibilityState` finding is repo-wide; it fixed only `LevelScale` and `Sidebar`.
3. Panel "Save" (unsaved) label is ink-2; mockup `:124` `.save` inherits ink.
4. `.btn` renders 47px tall against the mockup's `min-height:44px`.
5. Rail-to-rail gap is 48px; mockup `:51` `.rail{margin-top:40px}`.
6. Tile title carries `letter-spacing:-0.14px`; mockup `:56` `.book .tt` sets none.
7. "Recommended for {level}" is used at 375 too; mockup phone frame `:337` says plain
   **"Recommended"**. *(Lane B asked lane R to call this — the phone frame should win; it is
   a one-key change and low stakes.)*
8. Cover glyph collisions: four glyphs for `hash % 3 === 0` guarantees repeats — ◯ and ◐
   each appear twice in one frame (`R/1440-search-q.png`), against "no repeated cover motif".
9. `/library/search` renders a grid with no shelf line and no ribbon, while decision 1
   retires the desktop grid everywhere else.
10. Book detail "Back" is accent text — outside the accent's three jobs (CTA fill, active
    tab, ribbon).
11. Voice UI keeps `role="mono" size={11} color="ink3"` at `TutorModelsPanel.tsx:200`,
    `ControlCluster.tsx:156`, `Transcript.tsx:63` — 2.61:1, pre-existing, out of run-8 scope.
12. DESIGN.md's Don't list still reads *"No accent outside CTA fill and active tab"* — not
    updated for the ribbon, which the colour table above it now allows.
13. DESIGN.md's reader paragraph still says panel word "Fraunces 24" (desktop renders 28,
    per mockup `:118`) and voice-screen selection "18% peach" (now 55% via the shared token).
14. Both Continue-reading covers are teal — a legitimate within-`fables` hash collision, but
    the shelf reads as one repeated colour (`R/1440-home.png`). Lane A's palette-thinness
    finding, confirmed: **no sage and no brick appear anywhere in the 13-book fr-FR pack**
    (`R/1440-search-q.png`).
15. `pnpm format:check` is red at the repo root — but on `thoughts/shared/handoffs/…`, an
    untracked file outside run 8 (verbatim output in §3).
16. Lane D's **pinyin in the form-line slot** is **accepted, not a finding**: the mockup's
    own class is `.ph` (phonetic) and its content is a quiet mono line under the gloss, which
    is exactly what pinyin is. The wording in PLAN decision 11 and DESIGN.md should widen to
    "the mono line under the gloss — pinyin for CJK, lemma · part-of-speech elsewhere once
    `Token` carries those fields", rather than the code moving.

Clean on the rest of the ban list: **no gradients** anywhere in `apps/client/src` or
`app/` (the only `LinearGradient` hits are unused re-exports in `svg.tsx`/`svg.web.tsx`);
**no blurred shadows** (`shadowRadius` / `elevation` return zero hits — every cutout is an
offset `View`); **no progress track on a cover**; **no `art` prop, no moon/triangle SVG at
any of the ten `<Cover` call sites** — all ten pass `book` and render typographically
(verified visually on Home, Library, book detail, search, vocabulary and the reader
completion view). **Accent is used only** on the speaker ring, the play ring, the CTA fill
and the ribbon in the run-8 diff.

**A false positive worth recording so the next reviewer does not re-file it:** the shelf's
computed `border-bottom-width` reads **1px** at both DPR 1 and DPR 2, but the emitted rule
is `.r-borderBottomWidth-ye36v5 { border-bottom-width: 1.5px; }` (`R/shelf.mjs`). Chromium
reports the *used* border width, floored to an integer. The shelf, the collection-link
underline (`library.tsx:102`) and the saved-Save outline are all correctly 1.5 in source.
Computed styles are the right instrument for colour, size, spacing and font, and the wrong
one for border widths.

---

## 2. Claims table — re-grading lane VERIFIED claims I checked myself

| Lane | Claim | My grade | Evidence |
|---|---|---|---|
| A | Cover renders typographically at every call site, no illustrations | **UPHELD** | 10 `<Cover` sites read; Home/Library/detail/search/vocabulary shot |
| A | Cover paper follows PLAN decision 3's triples, varied by id hash | **UPHELD** | `coverPaper.ts:82-93` read and traced; matches decision 3 exactly |
| A | Tile: title Fraunces 400 14, author 12.5 ink-2, mono 11 ink-2 (never ink-3) | **UPHELD** | `R/styles.txt` → `tileTitle`/`tileAuthor`/`tilePage`; mono is `rgb(110,100,89)` |
| A | Shelf is a 1.5px `hairline2` line, 12px under the last caption, full rail width | **UPHELD** | `R/shelf.mjs` shows the 1.5px rule; computed `padding-bottom: 12px`, colour `rgba(34,30,27,0.2)`, width 944 = full rail |
| A | Ribbon 12×44 accent at top −6 / right 14, exactly one | **UPHELD** | `R/styles.txt` → `ribbon` |
| A | Author-line ellipsis at large cover sizes "possible mismatch, unresolved" | **CONFIRMED AS A DEFECT** | P1-8 |
| B | Home order is Continue → Today's story → Recommended → Your books | **UPHELD IN CODE, NOT ON SCREEN** | `homeSections.ts` correct; the rendered default profile shows two sections (P0-3) |
| B | Today's story is a spread, no gradient, no countdown, no nag on Home | **UPHELD** | `R/1440-home.png`; spread measured 184px left column, surface-2, hairline, radius 10 |
| B | The spread's Read CTA label is ink on accent per decision 8 | **UPHELD for the spread, MISLEADING as a run-level claim** | 4.49:1 measured; the shared `Button` was never fixed (P0-1) |
| B | Read → `/reader/<id>`, Listen → `?mode=narration`, About → `/book/<id>` | **UPHELD** | re-walked in `R/probe.mjs`; buttons resolve by `aria-label` |
| C | Level scale is one hairline-segmented control, selected = ink fill / surface text | **UPHELD** | `R/styles.txt` → `scale`/`segOn`: radius 10, 1px `hairline2`, padding 8/13, mono 12 at .06em, `rgb(34,30,27)` fill |
| C | Collection links are plain text, 40px hit height, active = ink + underline | **UPHELD** | `collOn` min-height 40, ink, 1.5px underline in source |
| C | Inline search field 240 wide, surface-2, radius 10 | **UPHELD** | `searchBox` 240×40, `rgb(239,228,210)`, radius 10, padding 9/12 |
| C | `aria-checked` now emitted on the scale | **UPHELD** | probe selected the segment via `[aria-checked="true"]` |
| C | The `accessibilityState` gap is repo-wide and unfixed elsewhere | **UPHELD** | no tab carries `aria-selected` (P2-2) |
| C | Back button does not step through filter changes ("Partly") | **UPHELD, and I agree it is above this lane** | expo-router on web does not push a history entry for `setParams`; not a run-8 regression |
| D | Panel order matches decision 11 minus the form row | **UPHELD** | live DOM order: word, gloss, speaker, save, details, report, passage, talk; `your-words` appears once the book has saved words (`R/375-reader-sheet.png`) |
| D | Passage column 640 centered; panel pinned to 360 with a hairline left edge | **UPHELD** | `passageCol` maxWidth 640 at x=220 (centre 540 = centre of the 1080 reading area); `panel` 360, `border-left: 1px rgba(34,30,27,0.12)` |
| D | Selection fill is exactly `rgba(242,200,180,0.55)` | **UPHELD** | computed on the live token |
| D | No dotted underline on any token; `hosted.mjs` moved to `span[data-token-id]` | **UPHELD** | live: `data-token-id` 240 nodes, `data-tokenid` 0, dotted spans 0 |
| D | Speaker ring is a 44px 2px accent outline, top-right, not filled | **UPHELD** | `R/zoom-panel-top.png`; `IconButton variant="ring"` |
| D | Saved Save button = mark fill + ink outline + 4px ink cutout | **UPHELD** | `R/zoom-panel-top.png` |
| D | `audible-probe.mjs` FAIL is the LLM's phrasing, not the UI | **UPHELD** | reproduced: same single FAIL, 9/10 (§3) |
| D | Phone transport docked below the sheet is a defensible deviation | **OVERRULED** | P1-5 — mockup, PLAN decision 11 and lane E's DESIGN.md all say inside |
| D | Pinyin belongs in the form-line slot | **ACCEPTED** | P2-16 — the mockup's class is literally `.ph`; widen the wording, not the code |
| E | Tab bar: four glyphs at 22px stroke 1.5, active accent, padding 10/8/22 | **UPHELD** | `R/styles.txt` → `tabBar` padding 10/8/22, surface, top hairline; `R/375-home-130.png` |
| E | Sidebar 220 wide on surface with a hairline right edge, Settings pinned bottom | **UPHELD** | `R/1440-home.png` |
| E | `IconButton` deliberately untouched because it "already matches the mockup's `.ib`" | **REFUTED** | `IconButton.tsx:67` is `radius.full` at 44px; `.ib` (`:48`) is radius 10 at 40px — P1-9.3 |
| E | Sidebar rows keep 44px min-height against the mockup's 38 | **ACCEPTED** | DESIGN.md's own 44px tap-target rule should win over a frame measurement |
| E | DESIGN.md brought to the v2 system | **UPHELD WITH THREE ERRORS** | P1-3 (dark), P1-4 (ink-3), P2-12/13 (stale Don't line, stale reader values) |

---

## 3. Checks run, verbatim

`pnpm --filter @sotto/client test` — **pass**
```
 Test Files  39 passed (39)
      Tests  357 passed (357)
   Duration  2.99s
```

`pnpm -r typecheck` — **pass**, 5 of 6 workspace projects, all Done, no diagnostics.

`pnpm lint` — **pass**
```
✖ 23 problems (0 errors, 23 warnings)
```
All 23 are the pre-existing `no-unused-vars` warnings in `packages/content/scripts/`; none
is in a run-8 file.

`pnpm format:check` — **FAIL**, but out of scope
```
$ prettier --check .
Checking formatting...
[warn] thoughts/shared/handoffs/sotto-tutor-bugs-20260905/current.md
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
[ELIFECYCLE] Command failed with exit code 1.
```
`thoughts/` is untracked (`git status --short` → `?? thoughts/`) and belongs to no lane. The
orchestrator's isolated `pnpm check` will hit this too; it is not a run-8 defect.

RECON §8 selectors, re-resolved against the live Metro reader (`R/selectors.mjs`):
```
 span[data-token-id] count = 240
 span[data-tokenid] count  = 0        <- RECON.md §8's guess; lane D's correction is right
 dotted-underline spans    = 0
 role=button name Play|Pause = 1
 role=button name "Save"      = 1
 getByPlaceholder(/Rechercher/i) on /library = 1
```
All four still resolve. Word lookup, save-to-vocabulary and the library filter grammar
(including the legacy `voyage`/`contes` rewrites at `libraryFilters.ts:53-54`) are intact.

`node apps/client/e2e/voice-live.mjs` — **6/6 PASS**, exit 0
```
  [PASS] phase A: learner caption contains "cigarra"
  [PASS] phase A: tutor caption present (word explained)
  [PASS] phase A: state cycled listening -> thinking -> speaking
  [PASS] phase B: learner caption contains "cigarra" (save request heard)
  [PASS] phase B: saved word "cigarra" in vocabulary store
  [PASS] no page/console errors in either phase
```

`node apps/client/e2e/audible-probe.mjs` — **9/10**, exit 1
```
  [PASS] learner turn ("...Provence...") rendered in the transcript
  [PASS] a tutor reply rendered in the transcript
  [PASS] AudioBufferSourceNode.start() was called at least once
  [PASS] at least one sample was actually scheduled
  [PASS] reply mentions Provence (mechanical substring check)
  [FAIL] reply ends with a question (discuss-mode follow-up)
  [PASS] no page/console errors
  [PASS] an opening invitation rendered before the learner turn
  [PASS] the opening invitation was spoken (samples scheduled before the learner turn)
  [PASS] no duplicated tutor sentence in the rendered transcript
```
Same single FAIL lane D reported and the same cause: the local model ended
*"…ses paysages méditerranéens."* rather than a question. Nothing the reader renders.
Narration and talk are not regressed.

Screenshots taken by this lane, all from the live Metro with the run-8 seed:
`R/{1440,375}-{home,library,reader}.png`, `R/1440-book-detail.png`, `R/1440-search-q.png`,
`R/{1440,375}-vocabulary.png`, `R/375-reader-sheet.png`, `R/1440-reader-saved.png`,
`R/1440-saved-token.png`, `R/1440-onboard-done.png`, `R/{1440,375}-home-dark.png`,
`R/{1440,375}-reader-dark.png`, `R/375-{home,library}-130.png`, and the zooms
`R/zoom-{panel-top,saved-word,vocab-cover,vocab-cta,dark-cta,dark-sel,dark-mark}.png`.
No page or console errors on any screen (the one `dueAt` crash in an early vocabulary run
was my own malformed `SavedWord` seed — `review.dueAt` is nested; re-shot clean).

---

## 4. What I could not check, and why

- **130 % Dynamic Type.** Not exercisable on web. Every size in this app is an absolute
  `px` from the token file, and React Native Web emits them as such, so
  `document.documentElement.style.fontSize = '130%'` changes nothing —
  `R/375-home-130.png` is pixel-identical to `R/375-home.png`. Playwright's
  `deviceScaleFactor` scales the whole raster uniformly and proves nothing either. **This
  needs an iOS/Android run with the OS text-size slider**, and DESIGN.md's own line
  "layouts must survive 130%" is currently unverified for the run-8 screens. Lanes A–E
  all skipped it too.
- **Native (iOS/Android).** Everything here is react-native-web on Metro. `position:
  sticky` (panel, transport), `data-token-id`, drag-select and the ribbon's chevron notch
  are web-only code paths.
- **Settings › Account plan row** (lane B's `shouldShowPlanRow`). `cloud.enabled` is false in
  this local build, so the whole Account group is absent; nobody in run 8 has seen the row
  render. It remains INFERRED from `planRow.test.ts` plus a JSX read.
- **"Your books"** on Home and its Library shelf. The seed creates no imports; the
  composition is unit-tested only.
- **CJK reader** — the form-line slot, the pinyin decision (P2-16) and the CJK 22/1.8 type
  override. No zh pack is seeded locally.
- **The voice screen's 55 % selection fill.** Lane D's shared-token change reaches
  `SpeechFillText.tsx:101`; I did not open the voice screen visually, and DESIGN.md still
  documents 18 % there.
- **Full `hosted.mjs`.** It needs a deployed origin plus service-worker/offline assertions.
  I verified only that its selectors still resolve against Metro (§3). The orchestrator's
  run against the free origin is still the real check.
- **Whether the swept commits lost anything.** I reviewed by diff against `27dff1d`, as
  instructed, so content is what I saw; I made no attempt to reconstruct or rewrite the
  attribution. Three lanes independently escalated the same interleaving failure — that is
  the orchestrator's call for FINAL.md, and the mechanical fix (a `GIT_INDEX_FILE` or a
  worktree per lane) is worth adopting before run 9.
