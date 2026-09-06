# Run 7 — Lane B report: navigation, settings reachability, library states, route survival

Commit: `1d9bf0c` — `run7(B): four-row navigation, Settings reachable everywhere, library/home states`
Pushed to `origin/main` (was `55be58d`, now `1d9bf0c`).

i18n keys (`tabs.settings`, `home.gift`, `notFound.*`, `packs.status.*`) were added via
`node apps/client/scripts/i18n-add.mjs` with real (non-English-fallback) translations for
all 9 catalogs, but landed inside lane E's commit `a1b59c1` — we both write to the same
`src/i18n/*.json` files and E committed while my keys were sitting unstaged in the shared
working tree. VERIFIED all 12 keys/translations are present and correct as committed (read
every catalog's values directly, see below) — nothing is missing or English-fallback.

## What changed

- **`src/ui/navRows.ts`** (new): pure nav-row data (`NAV_ROWS`, `SETTINGS_ROW`,
  `buildTabRows`) shared by Sidebar and TabBar. Split into a standalone module — **not**
  because the card asked for a new file, but because this repo's plain `vitest run` cannot
  parse any module that imports `react-native` (no RN transform configured; confirmed by
  the exact `RollupError: Parse failure: Expected 'from', got 'typeOf'` on RN's own
  `import typeof * as ReactNativePublicAPI`). `Sidebar.tsx`/`TabBar.tsx` import from here
  and re-export for compatibility.
- **`src/ui/railView.ts`** (new): same reasoning — `resolveRailView`/`RailViewState`
  pulled out of `Rail.tsx` so `Rail.test.ts` can import it without pulling in `react-native`.
- **`src/ui/Sidebar.tsx`**: four rows — Home/Library/Vocabulary scroll, Settings pinned to
  the bottom via a `flex:1` spacer (confirmed the spacer works because Shell's `row` style
  already has `flexDirection:'row'` with default `alignItems:'stretch'`, so Sidebar's
  column stretches to full height without needing `flex:1` on the sidebar itself — that
  would have fought its fixed `width:220`). Settings counts "active" on both `/settings`
  and `/profile` (interim route).
- **`src/ui/TabBar.tsx`**: `buildTabRows` appends a Settings row after the three real
  `Tabs.Screen` routes (Settings lives outside the `(tabs)` group at
  `app/settings/index.tsx`, so it can't be a real tab) — pressing it calls
  `router.push('/settings')` instead of `navigation.navigate`.
- **`src/ui/Rail.tsx`**: new `emptyLabel` prop; an empty `books` array with `emptyLabel`
  set renders a titled empty line instead of `null`. No `emptyLabel` keeps the old
  hide-when-empty behaviour (e.g. Home's "Resume" rail — normal, not an error, when nobody
  has started a book).
- **`src/state/selectors.ts`**: `resolvePacksBanner(packsStatus, bookCount)` →
  `'loading' | 'error' | 'emptyLevel' | 'none'`, and `isFilterEmpty(rails)` for the
  filter-yields-nothing case. Both pure, both unit-tested.
- **`src/ui/data.ts`**: `Library` now exposes `packsStatus` and `retryPacks` (just
  `loadPacks` re-exposed — its own guard already skips only `'loading'`/`'ready'`, so
  calling it again from `'error'` is safe and re-fetches).
- **`app/(tabs)/home.tsx`**: gear now pushes `/settings` (was `/profile`); gift control's
  a11y label is `home.gift` = "Today's story" (was "Gift Sotto") — same behaviour, opens
  the daily book; added the loading/error/emptyLevel banner ahead of the daily
  card+rails, using `resolvePacksBanner` + a Retry button + a "Change level or language"
  link to `/settings/learning-language`.
- **`app/(tabs)/library.tsx`**: same three banners, plus a fourth (`isFilterEmpty`) —
  "No books match this filter" + Clear filters. **Fixed a real bug found by the recon**:
  the filter chip was a plain `useState<Filter>('all')`, not persisted anywhere, resetting
  to `'all'` on every remount (recon: "Library filter persistence" section). It's now read
  from/written to the `filter` URL query param via `useLocalSearchParams` +
  `router.setParams`, the same mechanism `bookId` already uses on other routes — this makes
  it survive refresh, back, and a direct link, not just the same-session in-app case a
  Zustand store field alone wouldn't have fixed for "direct link".
- **`app/+not-found.tsx`** (new): "That page isn't here" (`notFound.title`) + two buttons
  (`notFound.toHome`, `notFound.toLibrary`) via `router.replace`. Its link data lives in
  `src/ui/notFoundLinks.ts`, deliberately **not** under `app/` — Expo Router eagerly
  requires every file under `app/` for its route table, so a co-located `.test.ts` would
  reproduce the exact crash this run's recon flagged as BLOCKING (commit `01e1139` hit the
  identical problem with a reader test; confirmed that commit already fixed that instance
  before I started — `git log` shows it, and `curl localhost:8081` returned 200 with the
  app actually rendering, not the crash overlay).
- **`app/_layout.tsx`, `app/library/**`**: read, no changes needed.

## Tests — failing first, then green

This repo has **no component-render test setup** (no `@testing-library/react-native`, no
`react-test-renderer` in `node_modules`; confirmed by search). Every existing `.test.ts` in
the repo is pure-logic, never a `.test.tsx`. Given that, and the RN-import parse failure
above, "failing tests first" here means pure-logic tests for exported constants/functions
(nav row data, the empty-view decision, the banner decision) rather than component render
assertions — the same shape every other test in this codebase already takes. Noting this
as a real deviation worth flagging, not silently working around it.

New/changed test files (all confirmed **failing** before their implementation existed, via
`pnpm --filter @sotto/client test -- --run <files>`, then green after):
- `src/ui/Sidebar.test.ts` — `NAV_ROWS` has exactly Home/Library/Vocabulary; `SETTINGS_ROW`
  targets `/settings` with `tabs.settings`; no duplicate settings row in `NAV_ROWS`.
- `src/ui/TabBar.test.ts` — `buildTabRows` appends `{name:'settings', isSettings:true}`
  after the given routes.
- `src/ui/Rail.test.ts` — `resolveRailView`: books present → content; empty + label →
  `{kind:'empty', label}`; empty + no label → `{kind:'hidden'}` (old behaviour preserved).
- `src/ui/notFoundLinks.test.ts` — `NOT_FOUND_LINKS` is Home then Library, using the
  `notFound.*` i18n keys.
- `src/state/selectors.test.ts` (appended) — `resolvePacksBanner` for idle/loading/error/
  ready-empty/ready-with-books; `isFilterEmpty` for no-rails/some-books/all-empty.

Full suite: `pnpm --filter @sotto/client test` → **34 test files, 267 tests, all green**
(VERIFIED, ran at the end of the session). Mid-session, 3 unrelated failures surfaced from
concurrent lanes' in-flight work (`src/onboarding/levelSamples.test.ts` — lane C,
`src/cloud/destination.test.ts` and `src/voice/voiceStartGate.test.ts` — lanes C/F1,
confirmed via `git status`/`git log` showing those files untracked or mid-edit, not touched
by this lane); by the final run they had resolved on their own as those lanes progressed.

`pnpm -r typecheck`: fails, but only on **`app/settings/index.tsx`** (lane E's file,
staged as new before this session started per its `git status`/mtime — 19 `TS2307 Cannot
find module` errors from wrong relative import depth, e.g. `'../src/cloud/provider'`
instead of `'../../src/cloud/provider'`, since it's one level deeper than the old
`app/profile.tsx`) and `src/onboarding/levelSamples.test.ts` (lane C's untracked file). No
error in this run references any file this lane owns or created — confirmed by reading the
full error list. Not mine to fix (not owned; both predate this session).

`pnpm lint`: 0 errors from my files. 3 pre-existing `no-undef` errors in
`e2e/audible-probe.mjs`/`e2e/.cache/provence-exchange.mjs` (lane F1's untracked work,
confirmed via `git status`), 26 pre-existing warnings elsewhere, none in files I touched.

`pnpm exec prettier --check` on every file I touched: clean (ran `--write` once on 3 files
that needed reformatting after I wrote them, then re-checked clean).

`node packages/content/src/cli.ts validate` (`content:validate`): 0 errors, 223 warnings —
all pre-existing content-quality warnings (`gloss-cross-locale-leak`/`gloss-not-identity`),
unrelated to i18n catalog parity. Confirms the new i18n keys are complete across all 9
catalogs (an incomplete catalog would show as an error here, per the recon's own read of
`validateMessageCatalogs`).

## Live proof (Playwright, 375 + 1440, against the shared dev server — 8081/8790, neither
started nor killed here)

Script: `~/Claude/sotto-run7-recon/B/walk.mjs` (throwaway, per COMMON.md — seeds an
onboarded profile the same way `apps/client/e2e/screenshots.mjs`'s `seed()` does, straight
into IndexedDB, so every screen under test is the real shell, not onboarding).
Screenshots: `~/Claude/sotto-run7-recon/B/{375,1440}-*.png`.

All of the following are VERIFIED (I read the actual screenshots, not just the script's
pass/fail lines):

- **Settings reachable from Home, Library, Vocabulary** at both widths — `01/03-home`,
  `02/04/05-*` screenshots. Phone: 4-icon tab bar (star/book/cap/gear) with Settings
  highlighted when active. Desktop: 3-row sidebar list + Settings pinned at the bottom with
  a visible gap above it.
- **Library's four states**: normal (`03-library.png`, rails render), error+Retry
  (`11-home-packs-error.png`, forced via `context.route('**/content/packs', abort)` —
  route interception, the shared server was never touched), filter-yields-nothing was
  exercised at the selector-test level (`isFilterEmpty`) — none of A2/B1/B2/C1 chips on the
  seeded fr-FR pack actually produced zero results live, so the empty-filter banner wasn't
  photographed end-to-end; not a gap in the logic (unit-tested), a gap in this content
  pack having a level with zero books to trigger it against.
- **Not-found**: a typo'd route and `/profile/x` both show "That page isn't here" + Go to
  Home/Go to Library, at both widths (`07/08-notfound-*.png`).
- **`/settings` directly**: resolves to a real screen, not `+not-found` — lane E's
  `app/settings/index.tsx` landed mid-session (confirmed via its mtime predating this
  session and its own commit `a1b59c1`). This is expected per the card's own note ("until
  E lands... /profile still works") — E landed during this run, so the interim 404 case is
  no longer reproducible, but the not-found screen itself is proven via the typo/`/profile/x`
  cases above.
- **Persistence — refresh / back / direct link**: `filter=fables` in the URL survives a
  full page reload (`http://localhost:8081/library?filter=fables` after `page.reload()`)
  and a **direct link** opened in a brand-new page/tab (not just in-place navigation) —
  this is the fix described above, confirmed live at both widths. `/reader/fr-cendrillon`
  survives a refresh at 375; at 1440 one run of the walk script showed it bounce to
  `/(tabs)/home` after refresh, but re-running the same navigation in isolation (no prior
  route interception, no long navigation chain) succeeded twice in a row — logged as
  **INFERRED test-harness artifact, not a confirmed app bug** (most likely residual state
  from my own `context.route('**/content/packs', abort)` call two steps earlier in the same
  script run). `app/reader/**` is lane D's file regardless; flagging rather than touching it.
- Store-level persistence for `learningLocale`/`interfaceLocale`/`explanationLocale`/
  `level`/reading progress: not re-verified from scratch — the run-7 recon already read
  `createStore.ts`'s `KEYS`/`hydrate()` and marked this VERIFIED (all under
  `sotto.preferences`/`sotto.progress`, written on every relevant state change). The only
  gap the recon found was the Library filter chip, fixed above.

## Not verified / known gaps

- The empty-filter banner (`packs.status.emptyFilter` + Clear filters) is unit-tested
  (`isFilterEmpty`) but not photographed live end-to-end — the seeded fr-FR content pack
  has books at every level chip I tried. Confirming it live needs either a pack with a
  genuinely empty level, or forcing it via the same route-interception trick used for the
  error state.
- `/reader/<bookId>` refresh at 1440 desktop: one flaky repro, two clean repros in
  isolation. Worth a second look from lane D if it recurs, but not chased further here —
  outside this lane's ownership and not reproducible on its own.
- `pnpm -r typecheck` for the whole workspace still fails (lane E's `app/settings/index.tsx`
  import-path bug, lane C's `levelSamples.test.ts`) — not mine to fix, flagged for those
  lanes.

## Needing Noel / other lanes

- Lane E: `app/settings/index.tsx`'s imports are one `../` short everywhere (it's nested
  one level deeper than the old `app/profile.tsx` it replaces) — 19 `TS2307` errors,
  confirmed via `pnpm -r typecheck`.
- Lanes D and F2 (reader, voice header): per the card's own escalation clause, a quiet
  Settings entry on those screens is out of this lane's ownership — noting it, not adding it.
- README: the push-time hook flagged this as touching navigation/routes without a README
  update. Out of this lane's ownership/scope (not on the owned-files list, and `/readme`
  is a separate flow) — flagging for whoever runs that gate next, not run here.

## Stop condition

Committed (`1d9bf0c`), pushed to `origin/main`, this report written. Stopping per the
card's Stop condition.
