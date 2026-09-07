# Lane H: fix pass after the adversarial review

Read `planning/run7/cards/COMMON.md`, then `planning/run7/R-adversarial.md` in full (findings 1-10 with file:line), then this card. All earlier lanes are finished; you own every file named below. Dev servers: Metro :8081 (real local voice path), content/voice server :8790. Failing test first for every defect.

Owned: `apps/client/src/state/createStore.ts` (+test), `apps/client/src/voice/**`, `apps/client/app/voice/**`, `apps/client/app/(tabs)/library.tsx`, `apps/client/app/settings/**`, `apps/server/src/voice/session.ts` (+test), `packages/voice/src/**`, `apps/client/web/landing/index.html`, `apps/client/e2e/audible-probe.mjs`, `apps/client/e2e/voice-live.mjs`, `apps/client/src/i18n/*.json` via the helper only.

Fix, in this order:
1. Finding 1 (P0): `ownProviderStatus` must survive reload: hydrate it (add to the persisted keys / `hydrate()`), or derive `connected` on boot from the stored setting's presence via the existing `hasByokKey()` and keep `active` as the persisted selection. Test: store status, reload the store from persistence, read it back. Live proof at 375: connect (intercepted validation) → reload → hub still "Connected".
2. Finding 2 (P0): transcript dedup in `createStore.ts:389-414`: a non-final fragment arriving after its `final` must not survive; write the failing test from the reviewer's repro, fix, then rerun `audible-probe.mjs` and make it read the last FINAL tutor caption; it must pass 7/7 twice in a row.
3. Finding 3 (P0): a denied microphone must reach the recovery panel: the listening gate must never downgrade over an `error` state (`voiceStartGate.ts:56-70`); test with the event ordering the reviewer describes; live proof with Playwright's permission denied for the mic: the panel shows within 5 s.
4. Finding 4 (P1): library filter chips at 375 (`library.tsx:133-147`): chips stay one row / wrap compactly, 36 px tall filtered or not; screenshot before/after.
5. Finding 8: the voice screen reads `useOwnProviderStatus()` and shows the selected mode line consistently with Settings.
6. Finding 9: the opening invitation on the local path (server session or client side, whichever the architecture makes honest; the invitation must be spoken and appear in the transcript), and `apps/server/src/voice/session.ts:124` receives the real title.
7. Finding 5 (overclaim): one sentence in the landing's plan column stating that with the plan your voice goes to OpenAI through Sotto's server and Sotto stores no transcripts; keep the layout; rerun `cleo_verify` quick mode.
8. Finding 10: install detection treats `CriOS`/`FxiOS` as iOS non-Safari with their own steps (Chrome and Firefox on iOS can still add to Home Screen via the share menu); test with those UAs.
9. Hygiene: `voice-live.mjs` writes screenshots to `~/Claude/sotto-run7-recon/voice-live/` unless `SOTTO_SCREENSHOT_DIR` is set; then restore the 12 tracked PNGs under `docs/screenshots/web/` with `git restore -- docs/screenshots/web/` ONLY if `git diff --stat -- docs/screenshots/web/` shows only those PNGs (this is the one sanctioned restore; say you did it).

Proof: all suites green (`pnpm test`, `pnpm -r typecheck`, `pnpm lint`, prettier on touched files, `pnpm content:validate`); the audible probe twice 7/7 with output pasted; screenshots for 1, 3, 4 in `~/Claude/sotto-run7-recon/H/`. Commit path-scoped `run7(H):`, push, write `planning/run7/H-report.md`. Stop there. Escalate when a fix needs a file outside this list.
