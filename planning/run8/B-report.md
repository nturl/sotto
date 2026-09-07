# Lane B report — Home order, Today's story spread, plan row to Settings › Account

Worker: Opus. Date: 2026-09-06. Card: `planning/run8/cards/B.md`.
All claims VERIFIED (read, run, or seen) unless marked INFERRED.

## Commits

| Intended commit | Where it landed | Note |
| --- | --- | --- |
| 1 — pure decisions (`homeSections.ts`, `planRow.ts`, tests) | **`890fd9b`** `run8(B): home section order and the settings plan row as pure decisions` | Mine, path-staged, pushed. |
| 2 — Home + spread + i18n | **`fc423f9`** (`voice: BYOK defaults to gpt-transcribe + gpt-5.6-terra…`) | **Swept.** See Escalation 1. Content intact and on `origin/main`; message and prefix are wrong. |
| 3 — deletion of `PaywallNagRow.tsx`, `nagOnce.ts`, `nagOnce.test.ts` | **`02015b0`** (`planning: sotto-cloud fc806ee deployed to Fly, §5 checks`) | **Swept**, same cause. |
| 4 — settings plan row + `RowSpec.accent` | **`6056110`** `run8(B): the plan row moves to Settings › Account` | Mine, path-staged, pushed. |
| report | this file | |

Everything is on `origin/main`.

## What changed

- **`apps/client/app/(tabs)/home.tsx`** rewritten. Title row: `Search` → `/library/search`
  at every width, `Settings` → `/settings` on desktop only (phone has the Settings tab).
  The gift button and `home.gift` usage are gone (the key is left in the catalogs, unused).
  The packs banner branches (`loading` / `error` / `emptyLevel`) are untouched. The `none`
  branch now renders whatever `resolveHomeSections` returns, in this order:
  1. Rail `home.rail.continue` ("Continue reading"), `ribbonBookId={library.currentBookId}`,
     no See all, hidden when empty.
  2. Rail head `home.dailyEyebrow` ("Today's story") + mono `home.today.changes`
     ("Changes at midnight", desktop only), then `<TodaysStorySpread>`.
  3. Rail `home.rail.recommended` ("Recommended for {level}") with See all →
     `/library?level={level}` at both widths.
  4. Rail `import.library.rail` ("Your books"), only when `library.yourBooks` is non-empty.

  "New releases" is gone from Home. `PaywallNagRow` is gone from Home.
- **`src/ui/TodaysStorySpread.tsx`** (new) replaces **`src/ui/DailyStoryCard.tsx`** (deleted
  in the same commit). Surface card, radius 10, 1px hairline; left column 184 (phone 132)
  on surface-2 with a hairline right edge holding the cover at 120×180 (phone 96×144) with
  the 6px peach cutout; right column: mono meta (`home.today.meta` "{minutes} min · {level} ·
  {language}" on desktop, the existing `home.dailyMeta` "{minutes} min · {level}" on phone),
  title in the display face at 30 (phone 22), synopsis 15/1.5 ink-2 desktop-only, then
  Read / Listen / About this book. No gradient, no countdown, no whole-card press.
- **`app/settings/index.tsx`** — one row appended to the existing Account group (still
  `cloud.enabled`-gated), label `paywall.nag.copy`, value `paywall.nag.cta` in accent,
  → `/paywall`, shown when `shouldShowPlanRow(...)`.
- **Deleted**: `src/ui/PaywallNagRow.tsx`, `src/paywall/nagOnce.ts`, `src/paywall/nagOnce.test.ts`.
  `claimNagSlot` had no other user (`grep` across `apps`, `packages`, `e2e`).
- **New pure modules**: `src/ui/homeSections.ts` (+ test), `src/paywall/planRow.ts` (+ test).

## Buttons: why they are local, not `Button`

`SpreadButton` lives inside `TodaysStorySpread.tsx`. The mockup's `.btn` has its own metrics
(13/18 padding, 15px label; phone `.pmain .btn` 11/14 and 14px) and PLAN decision 8 puts the
CTA label in **ink** on the accent fill, where `src/ui/Button.tsx`'s primary still sets
`surface`. `Button.tsx` is on no lane's owned list, so rather than change a shared component
for one screen I built the three variants locally and kept the system's press device by
reusing `usePressAnimation` — 4px ink cutout that presses to 2px, identical timing.
**If lane R wants one button component, `Button`'s primary label colour is the change to make.**

## Read / Listen / About — where each lands (VERIFIED, `~/Claude/sotto-run8/B/probe.mjs`)

| Button | URL after the click | Narration |
| --- | --- | --- |
| Read | `http://localhost:8081/reader/fr-chevre-de-m-seguin` | Play visible, Pause not — not narrating |
| Listen | `http://localhost:8081/reader/fr-chevre-de-m-seguin?mode=narration` | **Pause visible, Play not — narrating** |
| About this book | `http://localhost:8081/book/fr-chevre-de-m-seguin` | — |

**No lane D change was needed.** `app/reader/[bookId].tsx:191,318-322` already reads
`?mode=narration` (CONTRACTS §6) and calls `narration.play()` once loaded. Home passes that
param; the reader file was not touched by this lane.

Also verified with `probe2.mjs`: See all → `/library?level=A1` at 1440 **and** 375; the search
icon → `/library/search`; the settings icon → `/settings` at 1440 and **is absent at 375**.

## Tests

- `pnpm --filter @sotto/client test` — **39 files, 357 tests, all pass.** (Net of my +13 and
  the −3 from deleting `nagOnce.test.ts`; other lanes' tests move this count too.)
- `pnpm -r typecheck` — all 5 projects Done, 0 errors.
- `pnpm lint` — 0 errors, 23 warnings, all pre-existing and in files this lane does not touch.
- `pnpm exec prettier --check` on every touched file — clean.
- **Failing test first: VERIFIED for both pure modules.** `homeSections.test.ts` and
  `planRow.test.ts` were written and run red first —
  `Error: Cannot find module './homeSections'` / `'./planRow'`, `Test Files 2 failed (2)`,
  `Tests no tests` — before either module existed.

## Screenshots

All in `~/Claude/sotto-run8/B/`. Baseline: `~/Claude/sotto-run8/before/`; lane A's: `../A/`.

| Shot | Frame it answers to | Reading |
| --- | --- | --- |
| `1440-home.png` | frame 1 | VERIFIED: Search + Settings icons, no gift; Continue reading first with the one coral ribbon and `P. 3 OF 7`; "Today's story" head with `CHANGES AT MIDNIGHT` right; the spread — surface-2 left column, hairline divider, 120×180 cover with cutout, mono `7 MIN · A2 · FRANÇAIS`, Fraunces 30 title, synopsis, Read (accent, ink label, ink cutout) / Listen (surface-2) / About this book (ghost). No nag, no countdown, no gradient, no New releases. |
| `375-home.png` | phone 1 | VERIFIED: Search only; 132 left column with a 96×144 cover; meta without the language; **no synopsis**; Read + Listen only, no About. |
| `1440-home-a1.png` / `375-home-a1.png` | frame 1, section 3 | VERIFIED: with an A1 profile the fourth section renders — **"Recommended for A1" with See all**. |
| `1440-after-read.png` / `1440-after-listen.png` / `1440-after-about-this-book.png` | — | Evidence for the destination table above. |
| `1440-library.png` / `375-library.png` / `1440-reader.png` / `375-reader.png` | frames 2 / 3 | Other lanes' screens; shot only to prove I broke nothing. |

No page errors and no console errors in any run.

**Why the default seed shows no Recommended rail.** `shots.mjs` seeds fr-FR at A2, and the
fr-FR pack contains **exactly one A2 book** (`fr-chevre-de-m-seguin` — read from
`packages/content/packs/fr-FR/books/*/book.json`), which that same seed puts in progress.
`selectRecommendedBooks` is `level === preferences.level && !isStarted`, so the set is
genuinely empty and `Rail` correctly hides itself. Lane A's `1440-home.png` shows the same
gap before my change. The A1 shots above are the proof that the section works. This is a
content-catalog thinness, not a code fault — worth Noel's eye alongside lane A's palette note.

## Deviations from the card, stated plainly

1. **"Your books" uses `import.library.rail`, not `library.yourBooks`.** The card names a key
   that does not exist in any catalog; `import.library.rail` is already "Your books" in all
   nine and is what `library.tsx` renders. COMMON.md says reuse an existing key that says the
   same thing.
2. **"Today's story" reuses `home.dailyEyebrow`** rather than adding a key. Its English value
   changed from "Story of the day" to "Today's story"; the eight other translations already
   said exactly that and are unchanged.
3. **"Recommended for {level}" renders at both widths.** The mockup's phone frame says plain
   "Recommended"; the card's Output line names the level form with no phone caveat (unlike the
   synopsis, the About button and the "Changes at midnight" line, which it marks desktop-only),
   and lane E already wrote the level form into DESIGN.md. It fits at 375. **Lane R's call if
   the phone frame should win instead** — it is a one-key change.
4. **The synopsis's `max-width:46ch` is 414px.** React Native has no `ch` unit; 46 × ~9px
   (Inter 15's digit advance) is the closest honest translation. Commented at the call site.
5. **`src/ui/GroupList.tsx` is not on lane B's owned list and I edited it** — one optional
   `accent?: boolean` on `RowSpec`, plus the ternary that reads it, so the plan row's value can
   be the accent action the card asks for instead of the ink-2 fact every other row states.
   Additive, no other lane owns the file, no existing call site changes behaviour. Following
   lane A's precedent of "smallest possible edit, disclosed".
6. **`src/ui/SectionEyebrow.tsx` was not needed** and is untouched.

## Not verified

- **Settings › Account cannot be seen in this build.** `cloud.enabled` is false in the local
  OSS/NullCloud build, so the whole Account group is absent — as `settings/index.tsx:60-62`
  and RECON §6 both say. The row is proved two ways instead: `planRow.test.ts` (6 tests over
  every `useMe` state × plan) and by reading the JSX, which appends the row to the same
  `rows` array the group's plan value uses. **INFERRED that it renders correctly on a
  cloud-enabled build; nobody has seen it.**
- **The "Your books" section was not seen live.** It needs an imported private book, which the
  seed helper does not create. Covered by `homeSections.test.ts` ("hides your books when there
  are no imports" / the full four-section order) and by reading the JSX.
- **Dark scheme: not screenshotted.** Every colour in `TodaysStorySpread` comes from
  `useTheme()` (the surface, surface-2, hairline, accent and ink all re-derive per scheme);
  the cover's paper is deliberately scheme-independent, which is lane A's decision 3.
- **Native (iOS/Android): not verified.** Web only.
- **e2e scripts were not run** (they need the hosted origins / a mic profile). No selector in
  RECON §8 touches Home: `getByTestId` is onboarding-only, and Home's reachable names
  ("Search the library", "Settings", "See all") are unchanged or additive. INFERRED.

## Escalations

1. **Two of my four commits were swept by other sessions, exactly as happened to lane A.**
   Between my `git add <explicit paths>` and my `git commit`, a parallel session ran a commit
   that took the whole index: `fc423f9` (a voice/BYOK commit) carries my Home rewrite, the
   spread, the `DailyStoryCard` deletion and nine i18n catalogs; `02015b0` (a sotto-cloud
   deploy note) carries the `PaywallNagRow` / `nagOnce` deletions. Nothing is lost, nothing is
   broken, and all of it is on `origin/main` — but run 8's history attributes lane B's Home to
   two commits that say nothing about it. **This is now a repeated failure, not a one-off:
   the orchestrator should serialize commits or give each lane its own index
   (`GIT_INDEX_FILE` / a worktree), because "never `git add -A`" plainly is not holding.**
2. **The i18n catalogs are one file per locale and lane C wrote into them mid-flight.** My
   staged `en.json` picked up eight `library.*` keys that are lane C's. I committed them
   rather than trying to split a JSON hunk; no key of mine collides with one of theirs. Said
   so in the commit message.

## For FINAL.md / Noel

- The fr-FR catalog has one A2 book, so an A2 learner who starts it sees no "Recommended for
  A2" rail at all. Same shape of finding as lane A's paper-variety note: the taxonomy and the
  level spread are thin, and Home's third section is the place it shows.
