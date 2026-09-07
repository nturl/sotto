# Lane C report — Library: level scale, collection links, inline search, `?filter=`

Wave 2. Card: `planning/run8/cards/C.md`. Claims are VERIFIED (read / run / seen) unless
marked INFERRED.

## Commits

| SHA | What | Note |
| --- | --- | --- |
| `54c9211` | `run8(C): library filter grammar and rail composition, RN-free` — `src/ui/libraryFilters.ts` + `.test.ts` | mine, path-staged, pushed |
| `fc423f9` | `voice: BYOK defaults to gpt-transcribe + gpt-5.6-terra; GPT-5.x request shape` | **Swept.** My nine i18n keys across all nine catalogs landed inside this concurrent session's commit. See escalation 1. |
| `02015b0` | `planning: sotto-cloud fc806ee deployed to Fly, §5 checks` | **Swept.** `app/(tabs)/library.tsx` (the whole rebuild) and `src/ui/LevelScale.tsx` landed inside this one. See escalation 1. |
| `e855467` | `run8(C): canonicalise legacy library URLs, aria state on scale and links` | mine, path-staged, pushed |
| this file | report | |

Everything is on `origin/main`: `git diff origin/main --` over my four files is empty.

## What changed

**New, RN-free: `apps/client/src/ui/libraryFilters.ts`** (+ `libraryFilters.test.ts`).
The URL grammar and the rail composition, away from `react-native` so vitest can run them
(RECON §7 / risk 9, the `railView.ts` precedent):

```ts
CORE_CATEGORIES  // tales, fables, adventure, classics, folk, idioms, daily — link + shelf order
LEVELS           // BOOK_LEVELS
type Collection = 'all' | BookCategory | 'yours'
type LibraryFilters = { collection: Collection; level: BookLevel | undefined }
parseLibraryParams({filter?, level?}) -> LibraryFilters
serializeLibraryParams(filters)      -> {filter?: string; level?: string}
paramsNeedRewrite(raw, filters)      -> boolean
composeRails({books, yourBooks, filters}) -> Array<{key: Collection; books; seeAll?}>
```

**New: `apps/client/src/ui/LevelScale.tsx`** — mockup `.scale` / `.scale span(.on)`: one
bordered group (`hairline2`, radius 10), segments mono at .06em with `hairline2` dividers,
selected = ink fill + surface text, `accessibilityRole="radiogroup"`/`"radio"`. Desktop
padding 8/13 at 12px, `compact` gives the phone's 8/9 at 11px.

**Rebuilt: `apps/client/app/(tabs)/library.tsx`.** Title row is display + mono meta
(`{language} · {n} books` on desktop, `{n} books` on the phone — the mockup drops the
language there); the import (+) button stays when the server is reachable and the search
icon button is gone. Desktop controls are one wrapping row at gap 28 — scale, collection
links, search field pushed right at 240. Phone: search field full width under the title,
then the scale in a horizontal ScrollView **with the style on the outer View, never on the
ScrollView** (the run-7 342px trap, RECON §2), then the collection links in the same shape.
Collection links are plain text at 40px hit height, ink2, active = ink with a 1.5px inset
underline. Every shelf gets `ribbonBookId={library.currentBookId}`. `Chip` is no longer
imported anywhere.

**i18n**, one `i18n-add.mjs` pass, nine keys × nine catalogs, real translations (verified
present in all nine): `library.count`, `library.collection.{everything,tales,classics,folk,idioms,daily}`,
`library.rail.results`, `library.a11y.level`. `library.filter.fables` and
`library.filter.voyage` are **reused** as the Fables/Travel link labels (they already say
exactly that in all nine catalogs) and `library.filter.all` as the scale's "All".
`library.rail.fables` / `library.rail.voyage` stay as the two authored shelf headings.

## The five URL behaviours

Script `~/Claude/sotto-run8/C/urls.mjs` (Playwright, 375, live Metro, no page or console
errors). Output, verbatim:

| # | Behaviour | Result | Shot |
| --- | --- | --- | --- |
| 1 | click A2 → `?level=A2`; reload → still selected | `/library?level=A2`, `scale=A2` both before and after reload | `375-url1-level-a2.png`, `375-url1b-level-a2-reloaded.png` |
| 2 | click Fables → `filter=fables&level=A2` | `/library?level=A2&filter=fables`, `scale=A2 coll=Fables`, one "Animal fables" shelf | `375-url2-fables-a2.png` |
| 3 | direct `/library?filter=voyage` → Travel selected, URL rewritten | `/library?filter=adventure`, `coll=Travel`, one "Travel" shelf | `375-url3-legacy-voyage.png` |
| 4 | back button restores the previous state | **Partly.** Back from a book opened out of a filtered Library returns to `/library?level=A2&filter=fables` with both controls still on. Back does **not** step back through successive filter changes — see escalation 2. | `375-url4-back.png` |
| 5 | type "chèvre" → one Results shelf | `rails=…\|Results`, exactly one shelf holding La Chèvre de M. Seguin | `375-url5-search.png` |

## Tests

- **Failing test first: VERIFIED.** `libraryFilters.test.ts` was written and run before
  `libraryFilters.ts` existed — `Error: Failed to load url ./libraryFilters … Does the file
  exist?`, `Test Files 1 failed | Tests no tests`. It then failed once more on a real
  assertion (my hand-built list gives a `folk` shelf I had not predicted) before going green.
- `pnpm --filter @sotto/client test` → **39 files, 357 tests, all pass**, 16 of them mine.
  (The file/test count is 1/2 lower than lane A's because lane B deleted `nagOnce.test.ts`
  in the same tree; nothing of mine regressed.)
- `pnpm -r typecheck` → all five projects Done, 0 errors.
- `pnpm lint` → **0 errors**, 23 warnings, all pre-existing and in files this lane does not own.
- `pnpm exec prettier --check` on all four owned files → clean.

## Screenshots

`~/Claude/sotto-run8/C/`, live Metro :8081, no page or console errors in any run.

| Shot | Frame | Reading |
| --- | --- | --- |
| `1440-library.png` | mockup frame 2 | VERIFIED against `app-mockup-v2.html:245-281`: one bordered level scale with All filled ink, collection links (Everything underlined, then only the categories fr-FR actually has — Tales, Fables, Travel, Classics), the 240 search field right-aligned, mono meta "Français · 13 books" with the + button, shelves with the hairline, one coral ribbon and `P. 3 OF 7`. No pills anywhere. |
| `375-library.png` | phone 2 (`:352-374`) | VERIFIED: search field full width under the title, compact scale, links row, shelves. The scale row is a normal 36px row — the run-7 342px blowup does not recur. |
| `375-url*.png` | — | the five states above |
| `1440-home.png` / `375-home.png` / `*-reader.png` | — | other lanes' screens, shot only to show I broke nothing |

## Deviations and decisions recorded

1. **`yours` is an eighth `?filter=` value.** PLAN decision 9 fixes the grammar at
   `all|<seven categories>`, but the mockup's collection row carries a "Your books" link
   when imports exist and a link that writes nothing to the URL would not survive a reload
   like every other one in the row. `Collection` therefore includes `'yours'`, documented in
   `libraryFilters.ts`. Not exercised in the shots (the seeded profile has no imports) —
   the composition is unit-tested, the rendering is INFERRED.
2. **`Library.byCategory` is no longer called from `library.tsx`.** `composeRails` filters a
   book list directly so that the whole four-case composition is one pure, tested function.
   Lane A's `byCategory(core)` works and is unchanged; it simply has no caller on this screen
   any more. The pool is `library.books` (seeded + this locale's imports), which is what run 7's
   "All books" shelf already used.
3. **The imports shelf is still prepended** in the unfiltered view, as in run 7. The card
   describes only the category shelves plus "All books"; dropping the imports shelf was not
   asked for, so it stayed.
4. **`Chip.tsx` was NOT deleted.** `grep` confirms `library.tsx` was its only user and it now
   has none, so the card's condition for deletion is met — but a standing rule in
   `~/.claude/CLAUDE.md` forbids deleting files without Noel's explicit yes, and a card is not
   that. **Needs Noel: delete `apps/client/src/ui/Chip.tsx`** (and with it the `library.filter.*`
   keys, which are now used only as the three reused labels above).
5. **`isFilterEmpty` was not touched.** `RailSpec` still satisfies its `{books: unknown[]}`
   shape, so `selectors.ts` needed no change.
6. **`app/library/search.tsx` was not touched.** The inline field is additive; the
   `/library/search` route still works and `screenshots.mjs`'s `getByPlaceholder(/Rechercher/i)`
   still resolves there. The inline field on `/library` uses the same
   `library.searchPlaceholder` key, so a future script that visits `/library` would find two —
   flagged, not hit today (no e2e script visits `/library` with that selector; VERIFIED by
   reading RECON §8's table).

## Escalations

1. **Two concurrent commits swept lane C's staged work, exactly as lane A reported.**
   `fc423f9` (a voice/BYOK session) took my nine i18n catalog writes, and `02015b0`
   (a planning/deploy commit) took `library.tsx` and `LevelScale.tsx` — in the second case
   between my `git add` and my `git commit`, so my own commit found nothing to commit.
   Nothing is lost and nothing is broken; run 8's history simply attributes part of lane C to
   two unrelated messages. I used `git commit -- <paths>` afterwards so my later commit could
   not sweep lane B's staged `nagOnce*`/`PaywallNagRow` files in return. **The orchestrator
   should decide whether FINAL.md notes this; I attempted no history rewrite.** COMMON.md's
   "never `git add -A`" needs enforcing against non-lane sessions too, not just lanes.
2. **The back button cannot step through filter changes on web. Two attempts, both measured,
   stopping here.** `router.setParams` (run 7's mechanism) and `router.push` of the same route
   with new params both update the address bar without adding a history entry —
   `history.length` stays at 3 across two filter changes, and `page.goBack()` leaves Library
   for `/home`. I kept `setParams` (identical URL behaviour, no remount risk) and recorded the
   limit in a comment. The rest of PLAN decision 9 holds: reload, direct link, and leaving the
   screen and coming back all restore the filters exactly. If literal per-change back is
   required, it needs an expo-router-level answer (a `history.pushState` shim would desync the
   router), which is above this lane.
3. **Repo-wide, not mine to fix: `accessibilityState` is dead on web.** This app is on
   `react-native-web@0.21`, which dropped the `accessibilityState` → `aria-*` mapping. I proved
   it in the DOM: `role="radio"` elements carried **no** `aria-checked` at all until I passed
   `aria-checked` directly. The same silent gap exists at every other `accessibilityState`
   call site — `TabBar.tsx:103` (`selected` on the active tab), `Sidebar.tsx:39`,
   `OptionRow.tsx:28`, `Chip.tsx:25`, `Button.tsx:86` (`disabled`),
   `voice/ui/ControlCluster.tsx:81,91`, `app/settings/appearance.tsx:44`. **Worth a lane R or
   a follow-up run: no screen reader on the web build is currently told which tab, option or
   toggle is active.** I fixed only my two files.

## Not verified

- **Native (iOS/Android): NOT verified.** Web only. The scale's `overflow:'hidden'` rounded
  group, the 1.5px inset underline (an RN `borderBottomWidth`, not a CSS `box-shadow` inset),
  and the phone ScrollView rows were seen on react-native-web only.
- **Dark scheme: NOT screenshotted.** `LevelScale` and the search field read `useTheme()`
  (`hairline2`, `ink`, `surface`, `surface2`, `ink2`), so they follow the scheme by
  construction — INFERRED, not seen.
- **The "Your books" link and shelf: NOT seen.** The seeded profile has no imports; only the
  composition is unit-tested.
- **Collections beyond four: NOT seen.** fr-FR only carries tales, fables, adventure and
  classics, so folk / idioms / daily links and shelves were never rendered. Same
  content-taxonomy thinness lane A reported.
- **e2e: `hosted.mjs` / `voice-live.mjs` / `audible-probe.mjs` NOT run** (they need the hosted
  origins or a mic profile). No selector in RECON §8 reaches Library's controls — the Library
  route is only ever navigated to, and the one search selector belongs to `/library/search`,
  whose placeholder key is unchanged. INFERRED, not verified.
