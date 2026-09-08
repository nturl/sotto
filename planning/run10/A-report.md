# Run 10 lane A — two-step onboarding, pinned CTA

Branch `run10/A`, based on `main` @ cd326af. Worktree
`/Users/noelturlington/Claude/sotto-run10/wt/A`. Proof PNGs and the
Playwright script live outside the repo, in
`/Users/noelturlington/Claude/sotto-run10/proof/A/`.

`pnpm install --frozen-lockfile --prefer-offline` ran clean and did not want
to touch `pnpm-lock.yaml` (`git diff --stat pnpm-lock.yaml` is empty at the
end of the lane).

## What a stranger sees now

Landing "Read free, no account" -> "I'm learning" (Continue) -> "Your level"
(Finish) -> "You're set up." (Start reading) -> the first page of a book.
Four taps, measured below. It was six.

## What changed, per file

### `apps/client/src/onboarding/wizard.ts`
`ONBOARDING_STEPS` is `['learningLocale', 'level']`. `WizardState` keeps all
five fields, `initialWizardState` still fills `interfaceLocale` and
`explanationLocale` from `fastPathDefaultsFor(detectBrowserLanguage())`, and
`preferencesFrom` is unchanged: four preferences, Chinese still resolved to
the chosen script, still one write with `onboarded`.

### `apps/client/src/onboarding/languageFamilies.ts` (new, pure, no React)
Groups `LEARNING_LANGUAGES` on the base subtag: eleven codes become eight
rows (en, es, fr, pt, it, zh, ro, ca). A family with more than one code drops
the region from its names ("Español (Latinoamérica)" -> "Español"); a family
with one code keeps its names verbatim, so "Romanian (beta)" keeps saying
beta. Also `familyIdFor`, `familyForCode`, `defaultVariantFor` (the fast-path
default when it belongs to the family, else the family's first code) and
`shortVariantName` (the region inside the localized name — "US", "UK",
"Latin America", "Spain", "Brazil", "Portugal" — falling back to the native
name, which is what the two Chinese scripts use).

### `apps/client/src/onboarding/languageFamilies.test.ts` (new)
11 tests: row order, region stripped only where it disambiguates, beta kept,
every code in equals every code out with none added, family sizes, base
subtag parsing, default-variant fallback, segment labels.

### `apps/client/src/onboarding/VariantSegments.tsx` (new)
The segmented control, styling copied from `src/ui/LevelScale.tsx` (the
Library's level scale): one box, 1px `hairline2` border, radius 10 on the box
only, `hairline2` dividers, selected segment filled with `ink` and lettered in
`surface`, unselected on `surface` in `ink`, 44px minimum height. Accent is
not used. Its accessible group name reuses the existing key
`onboarding.step.script` ("Region or script"), so no new a11y string.

### `apps/client/app/onboarding/index.tsx`
Two steps. Step 1 renders the eight family rows in the existing `OptionRow`
(native + localized pair, 3px accent bar on the selected row); when the
selected family has variants, `VariantSegments` opens directly under that row,
inside the list, on `surface` with the list's hairline under it. Chinese keeps
`SCRIPT_OPTIONS`/`state.script`. The voice row renders only when `sample` is
non-null, so "Sample unavailable" can no longer appear; the label and the
play behaviour are unchanged.

Step 2 has a caption line (`onboarding.level.samplesHint`), then one row per
level: `A1 · Je vais au travail en bus tous les matins.` in the reading role
(the code and the first sentence from `levelSamplesFor(activeLocale)`, joined
with a middot) over the existing English description as the caption. Locales
with no samples fall back to code + description. The "Not sure which level?"
toggle and the block it expanded are gone.

Both steps put the primary button (and Back on step 2) in Shell's new
`footer`.

### `apps/client/src/ui/Shell.tsx` (the one UI file this lane was allowed)
One new optional prop, `footer`. When it is undefined — every existing caller
— the tree is exactly what it was: the same `ScrollView` or `View`, same
styles, same paddings. When it is set, that node renders outside the
`ScrollView` in a canvas strip with `space.md` top padding, the screen's
gutter, and `space.lg` plus the phone's safe-area inset under it; the content's
own bottom padding drops the inset, since the footer now owns it. On desktop
the strip is width-matched to the same centered column.

`OptionRow.tsx` was not touched.

### `apps/client/app/onboarding/done.tsx`
A spread rather than a card: `Cover` on the left with the peach cutout
(104x156 phone, 120x180 desktop) in a `surface2` column with a hairline right
edge, and on the right the level eyebrow, the title (display 22), the author
(caption ink2) and the premise (reading 16). The `CoverSource` is built by
`toLibraryBook(summary, preferences, 0)`, the same mapping Home and the
Library use. Below it: one primary "Start reading", "Browse the library" as a
text link (ui 15, ink2, 40px hit height), then two ink2 captions — the
languages line with its "Change" link to `/settings`, and the existing
tutor-is-optional line. `TodaysStorySpread` is not reused: it always prints
Read / Listen / About.

The level eyebrow is `role="mono" color="ink2"` rather than `SectionEyebrow`,
which prints ink3 — DESIGN.md's "ink3 never for text".

### `apps/client/app/onboarding/{languages,level}.tsx`
Comments only. Both are still redirects to `/onboarding`; their headers
described the four-step wizard and the "not sure?" helper.

### `apps/client/src/i18n/*.json` (nine catalogs)
`onboarding.level.samplesHint` reworded to "Pick the hardest line you can
still follow." (it used to say "group", which was the old expandable block).
Three new keys next to the other `onboarding.*` ones:
`onboarding.done.languages`, `onboarding.done.languagesSplit`,
`onboarding.done.change`. All nine files stay key-parallel at 468 lines.

### `apps/client/e2e/hosted.mjs`
The guest link is `Read free, no account` (verified in
`apps/client/web/landing/index.html:791`; the file was still looking for "Try
a sample"). `WIZARD_STEPS` is the two titles. The "Not sure which level?"
assertion is gone. The pre-selected-option probe (OptionRow's 3px accent bar)
is untouched, and the tap counter falls out at four.

## Keys left untranslated

None. `onboarding.done.languages`, `onboarding.done.languagesSplit` and
`onboarding.done.change` are translated in fr, es, it, pt, ca, ro, zh-Hans and
zh-Hant, and the reworded `onboarding.level.samplesHint` was updated in all
eight as well.

`onboarding.level.notSure` and `onboarding.level.hideSamples` are now unused
by the client but were deliberately left in all nine catalogs, per the brief.

## Proof

### Checks

| Check | Result |
|---|---|
| `pnpm typecheck` (workspace root) | clean, 5 of 5 projects (core, voice, content, server, client) |
| `pnpm --filter @sotto/client test` | **398 passed, 40 files** (baseline on cd326af: 386 / 39) |
| `pnpm exec eslint <touched files>` | 0 errors (9 warnings, all "JSON: no matching eslint config") |
| `pnpm exec prettier --check <touched files>` | all pass, after `--write` on the same list |

The 12 new tests are 11 in `languageFamilies.test.ts` plus one in
`wizard.test.ts` ("keeps the browser-language defaults for the two steps that
are gone").

`pnpm lint` across the whole repo reports 6 errors, all of them in
`planning/design/launch-cards/shots2x.mjs` (`no-undef` on `process`,
`indexedDB`, `console`). That file is untouched by this lane and fails the
same way on cd326af.

### Live walk (Playwright, dev server)

`proof/A/pinned-footer.mjs`, run from `apps/client` (it lives outside the repo,
so it resolves `playwright` through `createRequire` pointed at the client
package). The content server was already up on :8790 (`/health` returned
`{"ok":true,...}`), so this lane started only the web client:
`CI=1 pnpm --filter @sotto/client dev:web` on :8081.

`RESULT: PASS`. Continue/Finish bounding boxes, with `window.scrollY === 0`
and every inner scroll box at `scrollTop === 0`:

| Width | Step | Button | Top | Bottom | Viewport | Inner scrollTops |
|---|---|---|---|---|---|---|
| 375x812 | 1, I'm learning | Continue | 746 | **796** | 812 | [0] |
| 375x812 | 2, Your level | Finish | 694 | **744** | 812 | [0] |
| 1280x900 | 1, I'm learning | Continue | 834 | **884** | 900 | [] (nothing scrolls) |
| 1280x900 | 2, Your level | Finish | 782 | **832** | 900 | [] (nothing scrolls) |

Then, at both widths, accepting every default: the set-up screen named
"Cendrillon" at `/onboarding/done`, and "Start reading" landed on
`http://localhost:8081/reader/fr-cendrillon`. Taps from `/start` = 3, plus the
landing link = **4**.

At 375x812 the eight-row list does scroll (it is 812 tall, the rows are not);
the button never does. At 1280x900 nothing scrolls at all.

Screenshots in `proof/A/`: `{375x812,1280x900}-step1-learning.png`,
`-step1-variants.png`, `-step2-level.png`, `-done.png`, `-reader.png`, plus
`dev-web.log`.

### What the screenshots actually show

- **375x812 step 1**: "Step 1 of 2" / "I'm learning", eight rows — English,
  Español, Français, Português, Italiano, 中文, Română (beta), Català (beta) —
  Français carrying the accent bar, and the Continue button whole and on
  canvas at the bottom of the frame with the list clipped behind it.
- **375x812 step 1 with Español picked**: the segmented control sits under the
  Español row, "Latin America" filled with ink and lettered in surface,
  "Spain" on surface in ink, one hairline between them, box corners rounded.
- **375x812 step 2**: the hint line, then A0..B2 visible as sentences in
  French with their English descriptions under them, A1 selected, Finish and
  Back both in the frame.
- **375x812 set-up**: the Cendrillon cover with its peach cutout on a surface2
  column, A1 / Cendrillon / Charles Perrault / the premise on the right, then
  Start reading, "Browse the library", "Menus and explanations in English.
  Change", and the tutor line.
- **1280x900**: the same, in the centered 560 column, with the whole language
  list and all six levels visible at once and the button still pinned. The
  reader screenshot is Cendrillon chapter 1 with the transport bar.

## Things worth flagging

1. **The hosted smoke was edited but not executed.** It needs a static export
   plus an origin that serves `web/landing/index.html` at `/`; the Metro dev
   server serves the app at `/`, so there is no landing page to click locally
   without running `pnpm web:export` and `serve-static.mjs`, which would fight
   the other lanes for a build. Its four assumptions were checked by hand
   instead: the landing markup carries
   `<a class="tap-link" href="/start">Read free, no account</a>`; the live app
   prints "Step 1 of 2"/"Step 2 of 2" and the two titles exactly as the file
   now expects; and a replica of the file's `selectedOption()` probe returned
   exactly one 3px-bordered row on each step at both widths ("FrançaisFrench",
   then "A1 · Je vais au travail en bus tous les matins.I know the basics").
2. **Two edits in `hosted.mjs` beyond the four listed.** The file header
   described clicking "Try a sample" and walking four questions, and the
   per-step log line hard-coded `step N/4`. Both are direct consequences of
   the step change, and leaving them would have left the file documenting the
   opposite of what it does. Nothing else in that file moved.
3. **The no-book fallback on the set-up screen.** When the pack has no book at
   all (packs never loaded, or an empty locale), there is no "Start reading",
   so "Browse the library" stays a primary button rather than a text link —
   otherwise the screen would have no primary action.
4. **The level rows join the code and the sentence with a middot** in one
   reading-role string, because `OptionRow` takes strings and this lane may
   edit only one of Shell/OptionRow (it spent that on Shell's footer).
5. **Desktop onboarding is no longer vertically centered when the viewport is
   taller than the content** in the strict sense: the scroll area centers its
   content and the footer sits under it, so the column reads as centered in
   the space above the button. Nothing else about DESKTOP.md §8 changed.
6. **Order of work.** The grouping helper was written just before its test
   rather than just after; both landed in the same commit, and the test does
   define the contract (codes in equal codes out) rather than describe the
   implementation.

Nothing in the escalate list was hit: the pinned footer needed one optional
prop and no restructuring for other screens, no new locale codes were
required, the dev server started, and typecheck and tests are green.
