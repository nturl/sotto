# Run 10, lane B — the first five minutes of the free app

Branch `run10/B`, three commits on `cd326af`. Worktree
`/Users/noelturlington/Claude/sotto-run10/wt/B`. Proof PNGs and the
Playwright script live outside the repo at
`/Users/noelturlington/Claude/sotto-run10/proof/B/`.

| Fix | Commit | What it was |
|-----|--------|-------------|
| B1 Discuss gate | `78fb41d` | The download panel was the gate |
| B2 Library caption | `0bcc06c` | "Needs the local server or the paid tier" under the title |
| B3 Today's story | `a64de9f` | Level-blind pick |

---

## B1 — the Discuss gate offers the trial first

`apps/client/app/voice/[bookId].tsx`

The `panelState` recovery block now forks on `cloud.enabled`. The paid
branch and the `isServerUnavailable` branch are byte-for-byte unchanged;
only `!cloud.enabled` (readsotto.app, `NullCloud`) gets the new list.

New in that file:

- `TRIAL_URL` and `openTrial()`. Same tab on web via `location.assign`,
  `Linking.openURL` on native. `Linking.openURL(url, '_self')` was not an
  option: react-native's own type is `openURL(url: string)`, one argument,
  so the second-argument form react-native-web supports does not typecheck.
  The `(globalThis as {...}).location` shape is the pattern already used in
  `src/state/contentApi.ts` and `src/ui/Shell.tsx`.
- `FreeTutorChoices`, a component (not inline JSX) because the reveal needs
  its own `useState` and hooks cannot be conditional.
- `choiceStyles`: `column` (gap `space.md`), `columnDesktop` (`maxWidth: 480`,
  `alignSelf: 'center'`, at `useLayoutMetrics().isDesktop`, i.e. >= 900),
  `choice` (gap `space.xs`), `readAlone` (height 40, centred),
  `readAloneLabel` (underline). No colour is named anywhere in it, so there
  is nothing to drift from the theme.

The list, top to bottom:

1. `Button` primary — `voice.trial.cta`, caption `voice.trial.note` (ink2).
2. `Button` secondary — `voice.browser.choice`, caption
   `voice.browser.choiceNote` with `{size}` from
   `totalSizeMb(modelsForTier('standard'))`, the same two helpers
   `TutorModelsPanel` itself calls, so the number cannot go stale. Renders
   **1240 MB**. When `panelState.kind === 'unsupported'` this button is
   replaced by one caption, `voice.browser.noWebgpu`.
3. `Button` secondary — existing `byok.row` -> `/settings/openai-key`.
4. `Pressable` -> `Text role="ui" size={15} color="ink2"`, underlined, 40px
   hit height — existing `voice.readAlone` -> `router.replace(readSeulPath)`.

`<TutorModelsPanel state={panelState} onChanged={...} showRemove={false} />`
renders below the list only after choice 2 is pressed. **TutorModelsPanel.tsx
was not edited** — no new prop was needed; the reveal is the parent's state.

`apps/client/src/cloud/paidOrigin.ts` (new): one exported constant,
`PAID_ORIGIN`, resolving `EXPO_PUBLIC_CLOUD_URL ?? 'https://app.readsotto.app'`
exactly as `app/paywall/index.tsx` does locally. A shared module was needed
because the paywall's copy is a file-local `const CLOUD_ORIGIN`, not an
export. No new dependency: `Linking` and `Platform` come from `react-native`,
already imported by this screen.

### Keys

Five keys, not four: the brief names `voice.browser.noWebgpu` in item 2 as
well as the four in the list. All five sit immediately after
`voice.pttDisabled` in the `voice.*` region, nowhere near `onboarding.*`.

| Key | English |
|-----|---------|
| `voice.trial.cta` | Try the tutor free for 3 days |
| `voice.trial.note` | $9.99 a month or $79 a year after the trial. Nothing to install. |
| `voice.browser.choice` | Run it in this browser |
| `voice.browser.choiceNote` | About {size} MB, downloaded once. Slower than the plan. |
| `voice.browser.noWebgpu` | This browser can't run the tutor on the device. |

**Nothing was left untranslated.** All five are in all nine catalogs (en, fr,
es, it, pt, ca, ro, zh-Hans, zh-Hant), each at 468 keys, each still valid
JSON. Vocabulary was matched to what those catalogs already say rather than
invented: `voice.tutorLabel` for "tutor" (ro "tutore", zh "导师"/"導師"),
`voice.seePlans` for "plan" (fr "forfait", zh-Hans "套餐", zh-Hant "方案"),
and fr uses "Mo" for megabytes, as `tutor.browser.sizeMb` already does.
Amounts follow each locale's decimal convention ("9,99 $" in the Romance
catalogs, "$9.99" in the Chinese ones).

**One thing worth Noel's eye:** the price is hard-coded copy, in nine
languages, while `/paywall` reads live prices from `cloud.plans()`. The
brief specified this string, so it is what shipped, but a price change now
means a nine-catalog edit. Named here rather than solved.

---

## B2 — Library says nothing instead of saying "paid tier"

`apps/client/src/ui/importAffordance.ts` (new) + `.test.ts` (new, 4 tests):

```
showImportAffordance(serverReachable, cloudEnabled)
  = serverReachable === true || cloudEnabled
```

`undefined` (health check in flight) is deliberately not a yes. `cloudEnabled`
is in the rule because `app/import/index.tsx` has a hosted path that works
with no local server at all (`cloud.enabled && signed-in && quota`), so the
paid build keeps its affordance; on the free app `cloud.enabled` is always
false, which reduces the rule to exactly the brief's "only when
`serverReachable === true`".

`apps/client/app/(tabs)/library.tsx`: the screen now reads `useCloud()`,
derives `canImport`, and gates the `+` IconButton on it. The
`serverReachable === false` caption block and its now-dead `offlineCaption`
style are gone. Nothing renders in that slot in any state, so the title row
has no subtitle.

`import.library.captionOffline` is left in all nine catalogs, unused — the
lane's i18n permission is the `voice.*` region only. It is a dead key now
and someone should sweep it.

Settings > Data > Import a book is untouched.

---

## B3 — Today's story at the learner's level

`apps/client/src/ui/data.ts`:

- `levelSearchOrder(home)` — `[home, home-1, home+1, home-2, home+2, ...]`,
  clamped to `BOOK_LEVELS`. Easier before harder at equal distance, which is
  the one judgement call in the fix: too easy costs a few minutes, too hard
  on day one costs the habit.
- `booksNearLevel(books, level)` — the nearest non-empty ring, or `[]` when
  no book carries a level.
- `pickDailyBook(books, continueIds, date, level?)` — `level` optional, so
  every existing call and test keeps its behaviour. Pool order: unstarted at
  level, then the nearest ring, then all unstarted, then the whole shelf.
  Selection inside the pool is still `dayOfYear(date) % pool.length`.
- The generic widened to `T extends { id: string; level?: BookLevel }` so the
  existing level-less test fixtures still compile.

The caller was `useLibrary()` in the same file, line ~215, with
`preferences` already in scope — **`app/(tabs)/home.tsx` did not need
touching**, and was not touched. `library.daily` is computed in exactly one
place.

`apps/client/src/ui/data.test.ts`: 8 new tests. 6 of the 8 failed against
the level-blind implementation before the change (recorded below); the other
2 are the fallback cases, where correct behaviour and old behaviour agree by
design.

---

## Proof

### Static gates

| Gate | Result |
|------|--------|
| `pnpm typecheck` (root, 5 projects) | clean |
| `pnpm --filter @sotto/client test` | **40 files, 398 tests, 0 failures** (baseline 39/386, so +1 file, +12 tests) |
| `pnpm exec eslint` on the 16 touched files | **0 errors** (9 warnings, all "File ignored because no matching configuration was supplied" — the nine JSON catalogs, which eslint does not cover) |
| `pnpm exec prettier --check` on the 16 touched files | "All matched files use Prettier code style!" |
| `pnpm format` | run on every touched file |
| `pnpm install --frozen-lockfile --prefer-offline` | clean, `pnpm-lock.yaml` unmodified |

New tests: 4 in `importAffordance.test.ts`, 8 in `data.test.ts`.

Red-before-green, `data.test.ts` against the old implementation — 6 failed,
9 passed of 15:

```
× offers a book at the learner's own level over any other
× rotates within the level when several books sit at it
× reaches one level easier before one level harder at equal distance
× widens outward a step at a time rather than jumping to the far end
× never offers an in-progress book just because it is at the right level
× keeps the same book all day and moves on the next one
✓ falls back to the whole shelf when every book is in progress
✓ falls back to every unstarted book when none of them carries a level
```

`importAffordance.test.ts` failed to resolve its module before the helper
existed, then 4/4 passed.

Repo-wide `pnpm lint` and `pnpm format:check` are **not** clean, in files
this lane never opened and which are identical to `cd326af`:
`packages/content/scripts/fill-locales.mjs` and
`planning/design/launch-cards/shots2x.mjs` (6 `no-undef` errors for
`console`/`indexedDB`), and `apps/client/web/landing/index.html`
(prettier). Pre-existing, not escalated.

### Playwright

`/Users/noelturlington/Claude/sotto-run10/proof/B/proof.mjs`, run from
`apps/client` against `pnpm --filter @sotto/server dev` (:8790, started by
this lane — `curl localhost:8790/health` failed first) and
`CI=1 pnpm --filter @sotto/client dev:web -- --port 8082`.

**30/30 checks passed.**

Profile seeded straight into IndexedDB `keyval-store` / `keyval` /
`sotto.preferences` (the put half of `e2e/hosted.mjs`'s
`readSavedVocabulary`): interfaceLocale en, explanationLocale en,
learningLocale fr-FR, level A1, onboarded true.

Two shims make the dev box behave like readsotto.app, and both are named in
the script:

- `GET /health` is aborted. The dev machine has a healthy local server, so
  without this the gate resolves to `ready/local` and never renders. On the
  static host `/health` 404s and `fetchHealth()` returns null.
- `navigator.gpu` is defined if absent. `hasWebGpu()` is `'gpu' in navigator`
  and headless Chromium here has none, which would show the no-WebGPU line
  instead of the choice being photographed.

Result: `needs-download`, which is a real first-time visitor's state.

**(a) `/voice/fr-cendrillon?mode=discuss`** — `voice-discuss-375-collapsed.png`,
`voice-discuss-375-expanded.png`, `voice-discuss-1280-collapsed.png`,
`voice-discuss-1280-expanded.png`.

At both widths the measured DOM order is
`Try the tutor free for 3 days < Run it in this browser < Use your own OpenAI key < Read alone`,
and before the tap the page contains none of "Download tutor models",
"Run the tutor in this browser" or "Tutor size". After the tap it contains
both "Download tutor models" and "Tutor size". The caption reads
"About 1240 MB, downloaded once. Slower than the plan."

At 1280 the column is centred at 480 wide, matching how the panel centres.

The trial button was also clicked with `app.readsotto.app` stubbed:

```
PASS  trial button opens the paid origin trial URL
      https://app.readsotto.app/account?intent=start&returnTo=%2Fpaywall
PASS  trial button navigates in the same tab — 1 -> 1 tabs
```

**(b) `/home`** — `home-375.png`, `home-1280.png`. Today's story is
**"Three Fables by La Fontaine", A1, 10 min**.

The numbers, checked against the live fr-FR pack (13 books) at the time of
the run:

| | pool | index | book |
|-|------|-------|------|
| before | all 13 unstarted | 251 % 13 = 4 | `fr-daudet-les-etoiles` — "The Stars", **B1, 12 min** |
| after | 3 unstarted A1 | 251 % 3 = 2 | `fr-fables-la-fontaine` — "Three Fables by La Fontaine", **A1, 10 min** |

The old pick is precisely the book in the bug report. (`dayOfYear` is 251
this afternoon and 250 in the first hour of the day — `new Date(y,0,0)`
straddles a DST boundary. Pre-existing, unrelated, not touched.)

**(c) `/library` at 375** — two captures, because the brief asked which case
dev shows:

- `library-375.png` — the free-origin state (health blocked): no caption and
  no import button, since neither the server nor a cloud adapter can import.
- `library-375-server-reachable.png` — the real dev state (health allowed):
  no caption, and the `+` import button **is** shown, because the local
  server answers. This is the case dev normally shows.

The string "Needs the local server or the paid tier" appears in neither.

All nine PNGs were opened and read as images before this was written.

---

## Not done, and why

- **`app/(tabs)/home.tsx` untouched.** The brief allowed wiring here; none
  was needed. `library.daily` is computed once, in `useLibrary()`, where
  `preferences.level` is already in scope.
- **`TutorModelsPanel.tsx` untouched.** No optional prop was required.
- **`import.library.captionOffline` left in all nine catalogs.** Now dead.
  Removing it is outside this lane's i18n permission (`voice.*` only).
- **Price copy is static.** Flagged above; the brief specified the string.
- Nothing under `packages/content` touched. No lockfile change. Every commit
  staged with explicit paths.
