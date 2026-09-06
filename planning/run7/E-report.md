# Lane E report: own-provider mode as a guided flow, and the Settings hub

Status: DONE — committed and pushed.

## Interface, published early (unchanged since the first draft)

- Hook: `useOwnProviderStatus()` in `apps/client/src/voice/ownProviderStatus.ts`.
  Also exports `setOwnProviderStatus(status)` (write) and `getOwnProviderStatus()`
  (read outside a component).
- Status enum (`OwnProviderStatus`, same file):
  `'disconnected' | 'connecting' | 'connected' | 'active' | 'invalid' | 'unavailable'`
  — matches the six "truthful states" named in `planning/KICKOFF-7-FABLE.md` and the
  run-7 E card.
- Single source of truth lives in the store: `apps/client/src/state/createStore.ts`
  gained one field (`ownProviderStatus`, default `'disconnected'`) and one setter
  (`setOwnProviderStatus`). VERIFIED: unit-tested in
  `apps/client/src/state/createStore.test.ts`.
- Only the guided flow (`app/settings/openai-key.tsx`) writes the field. Readers:
  the settings hub row, `TutorModelsPanel`, and (via the exported hook, once F2
  wires it in) the voice screen.
- `byokKey.ts` was left untouched — no change to storage or validation, per the
  card's cordon. The flow module reads `getByokKey`/`setByokKey`/`removeByokKey`/
  `maskKey` exactly as before and layers `setOwnProviderStatus` calls around them.

## What changed

- `apps/client/src/state/createStore.ts` — `ownProviderStatus` field + setter.
- `apps/client/src/state/createStore.test.ts` — failing-test-first coverage for
  the status transitions (directive 1): default value, and a walk through all six
  states.
- `apps/client/src/voice/ownProviderStatus.ts` — new file: the type, the read hook,
  the writer, and a non-hook getter.
- `apps/client/app/settings/openai-key.tsx` — rewritten as the guided flow (card
  directive 3): what connecting enables, who bills and how (works with/without the
  plan), a link to `platform.openai.com`, the existing masked/paste-friendly input,
  validation via the existing `validateOpenAIKey` (`GET /v1/models`, untouched),
  "Connect and use this key" as the single action that stores AND selects, "Test
  the tutor" (opens `/voice/<bookId>` for the current-or-first book via
  `useLibrary()`), and a connected-state summary with Replace / Disconnect /
  "Switch to browser models or the plan". Toast copy never says "saved" — it says
  "Connected. Ready to try the tutor." (`byok.flow.connected`).
- `apps/client/src/voice/TutorModelsPanel.tsx` — optional `ownProviderStatus` prop;
  when `connected`/`active`, an extra line ("Your own OpenAI key is connected and
  can run the tutor — browser models are optional.") is added to all three panel
  states, kept separate from the existing browser-install line (directive 4).
- `apps/client/app/settings/models.tsx` — passes `useOwnProviderStatus()` through
  to the panel so the standalone "Tutor models" screen shows the same note.
- `apps/client/app/profile.tsx` → git-mv'd to `apps/client/app/settings/index.tsx`;
  `apps/client/app/profile.tsx` re-created as a one-line `<Redirect href="/settings" />`
  so any existing `/profile` link (this lane does not own the nav components that
  might still point at it) keeps working.
- `apps/client/app/settings/index.tsx` (the hub) — regrouped per directive 5:
  Account (unchanged), Languages (unchanged), **Reading** (new group: narration
  speed, captions, appearance — moved out of the old "Tutor preferences" group),
  **Tutor preferences** (speech detection, correction frequency, speaking pace,
  default tutor mode, the new "Tutor voice" mode-selector row reading
  `ownProviderStatus`, and the existing "Tutor models" row), Data (unchanged),
  About (unchanged). Every existing setting is still present — nothing was
  dropped, only regrouped. The mode-selector row replaces the old always-stale
  `byok.row` toggle; it reads the single store field instead of a screen-local
  `useState` + one-time `hasByokKey()` call, which was the root cause (VERIFIED,
  `~/Claude/sotto-run7-recon/scout-T-tutor.md` §1) of the "saved but the toggle
  read off" defect.
- `docs/byok.md` — updated the two "how to connect" / "how to remove" paths from
  `Profile → Tutor preferences → Use your own OpenAI key` to
  `Settings → Tutor → Tutor voice`, and the Export mention from `Profile → Export`
  to `Settings → Export`.
- i18n: 19 new keys (`byok.flow.*`, `byok.status.*`, `tutor.browser.ownProviderNote`,
  `settings.group.reading`, `settings.tutorMode`) added via
  `node apps/client/scripts/i18n-add.mjs`, real translations (not English
  fallbacks) for ca/es/fr/it/pt/ro/zh-Hans/zh-Hant in every case. (An early pass
  also added an unused `settings.title` scaffolding key; removed before this
  commit — every remaining key is referenced from a screen this lane touched.)

### Not owned by this lane, left as-is (flagged per COMMON.md)

- `README.md`'s BYOK row (`Profile → Tutor preferences → Use your own OpenAI key`)
  and `docs/browser-tutor.md`/`docs/verification.md`'s mentions of the old
  `Profile → Tutor preferences` path are now stale. README is owned by lane A
  (`docs/README install section`); the other two are historical run logs. Needs a
  follow-up pass by whichever lane owns README, or a dedicated docs pass.
- The mid-session "invalid own-provider key" panel on the voice screen
  (`voice/[bookId].tsx`, scout §5 row 4: shows generic "Connection lost." with no
  link back to Settings) is F2's file — not touched here. This lane's guided flow
  fixes the up-front invalid-key experience (a specific message before a session
  ever starts); the mid-session case is unchanged.
- The voice screen (F2) has not yet been wired to `useOwnProviderStatus()` — that
  wiring is F2's to do, per the card ("exported for the voice screen (F2 reads
  it)"). The hook and enum are ready for it.

## Tests run

- `cd apps/client && npx vitest run` — 34 files, **267/267 passed** (includes 2 new
  tests in `createStore.test.ts`, confirmed failing before the field/setter
  existed — directive 1's failing-test-first).
- `pnpm -r typecheck` (root) — clean across all 5 packages.
- `pnpm lint` (root) — 0 errors; the 2 pre-existing errors and all warnings are in
  other lanes' files (`e2e/.cache/provence-exchange.mjs`, `e2e/audible-probe.mjs`,
  etc.), none in files this lane owns.
- `pnpm exec prettier --check` on every file this lane touched — clean.

## Playwright proof

`~/Claude/sotto-run7-recon/E/walk.mjs` (against the shared dev server,
`localhost:8081` Metro web / `localhost:8790` content — started nothing, killed
nothing). No real OpenAI key: `https://api.openai.com/v1/models` is intercepted
with a fake 401 then a fake 200, exactly like a real invalid/valid key would
answer. Navigates in-app (clicking rows / Back) rather than `page.goto` between
steps — a full-page reload would reset the in-memory Zustand store and silently
mask exactly the class of bug this lane exists to fix.

Ran at both 375 and 1440; both passed every assertion:

1. Settings hub: "Tutor voice" row reads "Not connected" — VERIFIED (fresh state).
2. Invalid key → the specific message ("That key wasn't accepted...") shows, and
   the hub row reflects "Key rejected" (the `invalid` state), not silently
   "Not connected" or a stale value — VERIFIED.
3. Valid key → "Connected. Ready to try the tutor." toast, never "saved" — VERIFIED.
4. **The P0 fix**: navigating back to the hub (same JS context, in-app nav) shows
   "Tutor voice: Connected" immediately, with no remount/refetch needed — VERIFIED.
5. `/settings/models`'s `TutorModelsPanel` shows the own-provider note — VERIFIED.
6. Disconnect → hub row returns to "Not connected" — VERIFIED (off everywhere).
7. `/profile` redirects to `/settings` — VERIFIED.

Screenshots (12, both widths, all 6 steps): `~/Claude/sotto-run7-recon/E/{375,1440}-0{1..6}-*.png`.
The walk script itself lives at `~/Claude/sotto-run7-recon/E/walk.mjs` (not committed
to the repo, per COMMON.md's "throwaway scripts under `~/Claude/sotto-run7-recon/<lane>/`").

## Not verified / out of scope

- **"Test the tutor" button's actual voice session** — the walk proves the button
  exists, is enabled when a book is available, and (by code read) calls
  `router.push('/voice/<bookId>')`; it does not exercise a live voice session
  (that's F1/F2's territory, and would need `EXPO_PUBLIC_VOICE=fake` or a real
  cascade running, neither of which this lane's card asked for).
- **Native (iOS) behavior** — everything here was verified on web only, matching
  every other file this lane touched (all are cross-platform React Native code,
  but `expo-secure-store`'s native branch is untestable under vitest per
  `byokKey.test.ts`'s own comment, and this lane did not touch that file).
- **`unavailable` status** — reserved for a device where key storage itself is
  blocked (see `ownProviderStatus.ts`'s doc comment); not exercised by the walk
  since Playwright's Chromium always has working `localStorage`. No code path
  currently sets it — flagging as a known gap, not a defect, since directive 2
  only asked for the enum to exist and be truthful when used.
- **`active` status** — reserved for "own-provider mode is the path actually
  driving the current/most recent session," to be set by the tutor pipeline
  (F1/sessionManager), not by this lane. Not set anywhere yet.

## Commits

- `73b9861` — `run7(E): ownProviderStatus store field + hook, early interface report`
  (the store field/setter, the hook module, this report's first draft).
- Final commit (this pass): guided flow, hub move + regroup, TutorModelsPanel note,
  docs/byok.md update, i18n — see `git log --oneline -1` after push for the SHA
  (recorded in the final chat message).
