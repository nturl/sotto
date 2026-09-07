# Run 8 — final handoff: the app UI v2 mockup, shipped

Spec: `planning/KICKOFF-8-FABLE.md`. Plan and fixed decisions: `planning/run8/PLAN.md`.
Recon: `planning/run8/RECON.md`. Lane reports: `planning/run8/{A,B,C,D,E,H}-report.md`.
Review: `planning/run8/R-adversarial.md`. Visual contract: `planning/design/app-mockup-v2.html`,
values `planning/design/APP-V2-SPEC.md`, system now recorded in `planning/design/DESIGN.md`.

Orchestrator Fable; every lane and the review on Opus (Noel, 2026-09-06).

**Deployed.** The free origin `https://readsotto.app` serves sotto `49265dc` (Vercel
`sotto-rhl24li57-nturls-projects`, built and deployed from a `git archive` copy with
`apps/client/.vercel` copied in, `pnpm deploy:web`). `node apps/client/e2e/hosted.mjs`
against the live origin: **PASS** at 375 and 1440 (landing → Try a sample → wizard →
reader in six taps, narration playing, a word tapped and saved, surviving a reload, offline
reload served by the service worker). sotto-cloud vendor pin bumped to `49265dc` at
`906b159`, lockfile refreshed with `pnpm install --lockfile-only` (no change),
**not** `fly deploy`ed — that is Noel's.

---

## 1. What shipped, screen by screen

Before/after at 375 and 1440 in `planning/run8/shots/` (`before-*` = `27dff1d`, `after-*` =
`49265dc`, same seeded profile: en interface, fr-FR A2, La Chèvre 30 % read).

| Screen | Mockup frame | What changed |
| --- | --- | --- |
| Covers everywhere | `.cv` | Typographic covers rendered at runtime from title / author / level / categories: six papers (sand, teal, sage #6E9A7C, brick, peach, slate) chosen per collection with variation by book id, 3px spine, one initial or one glyph, Fraunces 300 title, small-caps author, mono level stamp; `cover.svg` kept only as the fallback for a book with no title. No pack regeneration. Below 72px only paper + spine + mark render (vocabulary thumbs). |
| Shelf + ribbon | `.shelf`, `.ribbon`, `.pg` | Every rail is one horizontal shelf on a 1.5px hairline at every width (desktop 120x180, phone 104x156); the DESKTOP.md grid tiers are retired. One cutout per cover. The coral ribbon sits on the most recently read unfinished book; progress reads "p. X of Y" in mono (one page ≈ one minute, CONFIRM 29). "See all" is a text link with a 40px hit height. No pills. |
| Home | frame 1 / phone 1 | Continue reading first (ribboned), Today's story as a spread (surface card, cover on surface-2, mono meta, display title, synopsis on desktop, **Read** with an ink label on coral and the 4px ink cutout, **Listen** → reader with narration started, **About this book** → book detail), then Recommended for {level} (widens to ±1/±2 levels when the exact level is empty), then Your books when imports exist. New releases, the countdown, the gift button and the plan nag are gone from Home; the nag is now a row in Settings › Account (cloud builds only). Today's story never picks a book already in Continue reading. |
| Library | frame 2 / phone 2 | Hairline-segmented level scale (All, A0…C1; selected = ink fill, `aria-checked`), collection text links over the seven core categories (only those with books: Tales, Fables, Travel, Classics in fr-FR; plus Your books), inline search field that turns the shelves into one Results shelf, mono "Français · 13 books" meta. URL: `?filter=` keeps the run-7 grammar for collections, `?level=` is new; legacy `voyage`/`contes`/`?filter=A2` are read and rewritten. Survives reload and a direct link; back from a book restores the state. |
| Reader | frame 3 / phone 3 | Passage 640 centered on desktop; plain tokens (no dotted underline), peach at 55 % on the selected word, the marker band on saved words (no skew); transport as a thin bar under the passage on desktop and inside the sheet on phone; chapter mono top-left, Settings and Close top-right. Panel / sheet order: word · gloss · (pinyin in the form slot for CJK) · speaker ring · Save / Details / Report · In this passage · Your words in this book · Talk about this passage. The header mic moved into that last row. |
| Tab bar + sidebar | phone frames, `.side` | Four ink glyphs from the mockup (book-open, shelves, bookmark, gear), active accent, `aria-selected`; sidebar rows to the mockup's numbers (44px tap floor kept). |
| DESIGN.md | — | Accent's job widened to "where you are" (CTA, active tab, ribbon); the paper table and `hairline2`; the shelf as the fourth signature device; the cover system; the v2 Home / Library / Reader orders; the verify findings — CTA label ink (cream on coral 3.45:1), ink-3 measures **2.61:1** on canvas so never for text (DESIGN.md's 4.5:1 claim was wrong), sage lightened to #6E9A7C, 40px link hit height; selected word 55 %; dark mode exists (Settings › Appearance). Don't: no pills anywhere, no progress bars on covers, no second tile shadow, no countdown. |

**CONFIRMs for Noel (each reversible).**
- **CONFIRM 29** — "p. X of Y" derives pages from `estimatedMinutes` (one page ≈ one minute of reading). The alternative that is exactly true is "Ch. X of Y". Change is one function, `apps/client/src/ui/progressLabel.ts`.
- **CONFIRM 30** — selected-word fill is 55 % peach (the mockup's HTML), not the 18 % DESIGN.md had; 18 % was invisible on canvas.
- **CONFIRM 31** — no lemma / part-of-speech data exists on `Token` (`packages/core/src/models.ts`), so the mockup's form line ("trouver · third person, present") cannot render; CJK pinyin sits in that slot. Adding the data is a content-pipeline change.
- **CONFIRM 32** — Recommended widens to neighbouring levels when the learner's level has no unstarted book (fr-FR has exactly one A2 book). The heading still says the learner's level.

---

## 2. Change list

**`~/Claude/sotto`** — 31 `run8(...)` commits plus one `planning:` commit, `27dff1d..49265dc`, all pushed to `origin/main`.

| Lane | SHAs | What landed |
| --- | --- | --- |
| plan | `78c86ce`, `27dff1d` | PLAN.md with 14 fixed decisions, RECON.md, six cards |
| A books | Cover + palette + tokens inside `b952095` (see §4), `418100d`, `b51a410` | `Cover` rewritten typographically, `coverPaper.ts` / `progressLabel.ts` with tests, `BookTile` and `Rail` as the shelf, ribbon, `Library.currentBookId`, categories widened to the seven core values, `paper.*` and `hairline2` tokens in both schemes |
| D reader | `03e51cb`, `e0abd0e`, `11cf1c5`, `daccdb4`, `fe441da` | Plain tokens, `readerPanel.ts` view model (15 tests), 640 measure, transport under the passage, panel order, `hosted.mjs` word finder moved to `span[data-token-id]` |
| E nav | `cf61631`, `d2fa5c6`, `29ec267`, `b952095` | Mockup glyph paths, four tab glyphs, sidebar, `Glyphs.tsx` on `useTheme()`, DESIGN.md v2 |
| B home | `890fd9b`, Home rewrite inside `fc423f9` and `02015b0` (see §4), `6056110`, `a72fcf7` | `homeSections.ts` / `planRow.ts` with tests, `TodaysStorySpread`, `DailyStoryCard` and `PaywallNagRow` deleted, plan row in Settings › Account |
| C library | `54c9211`, `e855467`, Library rebuild inside `02015b0` (see §4), `9b9e927` | `libraryFilters.ts` (16 tests), `LevelScale`, collection links, inline search, URL canonicalisation with `router.replace` |
| glue | `5cfd8d8` | prettier on two files another session had landed unformatted |
| R review | `280b572` | 3 P0, 9 P1, 16 P2, claims table |
| H fix pass | `1265048`, `3b4d5c8`, `ba0bf36`, `7824901`, `a523510`, `c0ee8b3`, `dfb7f96`, `0316d2a`, `c7a8ecf`, `a70bfbd`, `e63c76c`, `49265dc` | All three P0s and nine P1s: ink CTA labels in the shared `Button`, daily pick excludes in-progress books, recommended widens by level, dark-scheme legibility for the mark and the CTA, DESIGN.md corrections, phone transport inside the sheet, marker band, cover size floor, `radius.full` only on the two rings, `aria-selected` on tabs |

**`~/Claude/sotto-cloud`** — `906b159` vendor pin → `49265dc`. Not deployed.

---

## 3. What was verified, and how

**Live, on the deployed free origin.** `hosted.mjs` PASS at 375 and 1440 (log `~/Claude/sotto-run8/hosted.log`).

**Live, on the local Metro (`:8081`, real voice/cloud env) and content server (`:8790`).**
- `voice-live.mjs` 6/6 by lanes D, R and H (explain a word, save it, states cycle).
- `audible-probe.mjs` 10/10 (lane D, run 2); 9/10 on two other runs, each time the same local-LLM "reply ends with a question" assertion the run-7 handoff already documents as model compliance, not code.
- Lane B: Read → `/reader/<id>` (Play visible), Listen → `/reader/<id>?mode=narration` (Pause visible, narrating), About → `/book/<id>`, See all → `/library?level=…`, search and settings buttons.
- Lane C: five URL behaviours (click A2 → `?level=A2` and survives reload; A2 + Fables → both params; `/library?filter=voyage` rewritten to `adventure`; back from a book restores the filter state; typing "chèvre" → one Results shelf). Back does **not** step through successive filter changes — `setParams` and `push` both replace on web; noted in code.
- Lane D: panel order read back from the DOM, `hosted.mjs`'s new word finder proven at both widths.
- Lane R: computed styles of every mockup value at 1440 and 375, the ban-list grep, all `<Cover` call sites, the four RECON §8 selectors, dark scheme shots.
- Lane H: after shots for every finding, dark Home and Reader at 375, phone reader at the end of a chapter.

**By unit test.** Client 40 files / 385 tests (up from 281), core 54; whole repo 793 in the isolated copy. Failing-first for `coverPaper`, `progressLabel`, `readerPanel`, `homeSections`, `planRow`, `libraryFilters`, the tab-glyph pairing and the lane-H selectors; `pickRibbon` was written in the same pass (lane A said so).

**Isolated `pnpm check` on the `git archive` of `49265dc`.** Lint 0 errors (24 pre-existing warnings), typecheck 5/5, 793 tests, content validation 0 errors / 223 pre-existing warnings. `format:check` fails on exactly one file, `apps/client/web/landing/index.html`, which a parallel session is actively editing (see §4); I formatted it once at `5cfd8d8` and it was re-edited unformatted eleven minutes later, so I did not touch it again.

**Not verified.**
- Native iOS/Android: nothing in this run ran on a device; the new `Cover` is plain Views so it should be portable, INFERRED.
- Settings › Account plan row: invisible on the local OSS build (`cloud.enabled` false); proven by `planRow.test.ts` and by reading the JSX only.
- "Your books" shelf and link: no imported book in the seeded profile.
- CJK reader (pinyin in the form slot), the folk / idioms / daily collections (fr-FR has none), and the voice screen's inherited 55 % fill.
- 130 % Dynamic Type: RN Web pins px, so the browser bump is a no-op; needs a device.
- The paid origin: `app.readsotto.app` still serves whatever sotto-cloud last deployed (`fc806ee`, run 7); this run's client reaches it only after Noel's `fly deploy`.

---

## 4. Incidents and things that need Noel

**A parallel session was committing in the same working tree all run.** Its commits (`aa04cf8` voice max_tokens, `f0c5dc4` / `745ac72` landing V5, `fc423f9` BYOK defaults, `02015b0` / `6d637da` / `a04fb3d` planning) used `git add -A` and swept run-8 lanes' staged work into them: lane A's `Cover` rewrite and lane D's half-written reader into `b952095`, lane B's Home rewrite and lane C's Library rebuild into `fc423f9` / `02015b0`. Nothing was lost (every lane verified its files by reading the committed tree) and no history was rewritten; attribution is wrong in `git log`, so read this run by diff (`git diff 27dff1d..49265dc`), not by commit message. Those commits, including landing V5 and the BYOK model defaults, are **inside the deployed `49265dc`**. Two suggestions for the next run: give each lane its own worktree, or stop other sessions from committing while a run is live.

**Uncommitted in the tree, not mine, left alone:** `.claude/launch.json` (that session added a `static` entry), three tracked PNGs under `docs/screenshots/web/` re-written by `voice-live.mjs` runs that did not set `SOTTO_SCREENSHOT_DIR`, and the pre-existing `packages/content/packs/**` modifications.

**Needs Noel.**
1. `fly deploy --app sotto-cloud` from `~/Claude/sotto-cloud` at `906b159`, then the run-7 §5 checks. That session's planning note says `fc806ee` was deployed; this run's client is not on the paid origin until this runs.
2. CONFIRM 29–32 above.
3. `apps/client/src/ui/Chip.tsx` has zero callers and can be deleted; the safety rule wants your explicit yes before a file deletion.
4. The catalog is thin where the design wants variety: fr-FR yields only sand, peach, teal and slate covers (sage appears on two zh books only; brick nowhere), has one A2 book, and no folk / idioms / daily books. A taxonomy pass on `categories` in the packs would light up the palette and the collection links; it is content, not code.
5. The author elides on the 280px book-detail cover ("ALPHONSE …"); lane H measured it as the string against the measure, not padding. Options: two author lines, or `shortAuthor` on large covers.
6. The ink-3 sweep: DESIGN.md now says ink-3 never carries text, but ~20 caption call sites across 12 screens still pass it. One mechanical pass.
7. react-native-web 0.21 drops `accessibilityState` → `aria-*`; fixed on the level scale, tabs and sidebar, still silent on `OptionRow`, `Button`, `ControlCluster` and `settings/appearance`.

---

## 5. Carried to run 9

- `ReadingProgress.tokenId` is still not written, so "Talk about this passage" opens the chapter's first window (run 7 §5).
- Library back button stepping through filter changes needs an expo-router answer.
- The landing's base64 screenshots (run 7) — check whether landing V5 changed this.
- `DELETE /account` unreachable from the UI (pre-existing).
- CONFIRM 10 (one origin) and CONFIRM 28 (the one-tap fast path) remain parked.
