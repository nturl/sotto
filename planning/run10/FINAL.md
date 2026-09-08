# Run 10 (2026-09-08): the closeout, as a stranger

Prompt: `planning/run10/PROMPT.md`. Orchestrator Fable (as Cleo for the landing), three Opus lanes in their own worktrees (`~/Claude/sotto-run10/wt/{A,B,C}`), cherry-picked onto `run10/integration` (`~/Claude/sotto-run10/wt/integ`), base `main` @ `cd326af`. Cross-family critique before the build via /fanout (Grok 4.6, GPT-6 Astra through Codex, DeepSeek V4 Pro; 1 call each, headroom GREEN so plan tokens did the build).

## 1. What the walk found

Headless walk of readsotto.app at 375 and 1280, every screen read as a screenshot (`~/Claude/sotto-run10/proof/` holds the run's proof; the first walk is in this session's scratch). Six taps from the landing page to the first page of a book. Step 1 "App language" listed nine rows with Continue below the fold. Step 2 flashed "Sample unavailable" and doubled its list with regional variants. Step 3 hid the level examples behind a toggle. Step 4 asked the explanation language nobody can answer yet. The free origin's Discuss gate opened on a 1240 MB download form with no mention of the trial the landing had just sold. The Library title carried "Needs the local server or the paid tier". An A1 learner's Home led with a B1 story. The landing's "See it working" screenshots were from before run 8's UI. The three outside critiques flagged the same items and added one that shipped: the set-up screen has one button.

## 2. What shipped (branch `run10/integration`, 16 commits, pushed)

Lane A, onboarding (`dee3b44` .. `d6594a7`):
- Two steps: "I'm learning" (eight language rows; US/UK, Latin America/Spain, Brazil/Portugal and the Chinese scripts as a hairline-segmented control under the selected row, `src/onboarding/languageFamilies.ts` + `VariantSegments.tsx`) and "Your level" (each row is the level code plus the first sample sentence at that level, English description as the caption). No "Not sure which level?" toggle. The voice row renders only once a sample exists.
- Continue and Finish pinned to the viewport via one optional `footer` prop on `Shell` (rendered outside the ScrollView; every other caller unchanged). Measured at 375x812: Continue bottom 796, Finish bottom 744; at 1280x900: 884 and 832.
- Set-up screen is a spread: authored cover left, level, title, author, premise right; one primary "Start reading"; "Browse the library" as a text link; "Menus and explanations in English. Change" (to Settings); the tutor-is-optional line.
- `e2e/hosted.mjs` walks "Read free, no account" and the two steps; logs `TAPS landing -> reader = 4`.
- Three new i18n keys plus the reworded `onboarding.level.samplesHint` in all nine catalogs.

Lane B, the funnel (`6e1241f`, `361a835`, `39dfda8`, `c701f27`):
- Discuss gate on the free app (`cloud.enabled` false): "Try the tutor free for 3 days" (to `https://app.readsotto.app/account?intent=start&returnTo=%2Fpaywall`, same tab), the price line, "Run it in this browser" revealing the existing download panel (or "This browser can't run the tutor on the device." without WebGPU), "Use your own OpenAI key", "Read alone". `src/voice/ui/FreeTutorChoices` inside `app/voice/[bookId].tsx`. Paid origin branch untouched.
- Library: import affordance and its caption only when the local server answers (`showImportAffordance`, tested). The title has no subtitle.
- Today's story: `pickDailyBook` takes the learner's level; nearest level searched one step easier, then harder; stable per day; eight tests. Today an A1 learner gets "Three Fables by La Fontaine" instead of "The Stars" (B1).

Lane C, landing V6 (`efa846f`, `23e90d3`, `fae205e`; spec `planning/run10/LANDING-V6-SPEC.md`):
- Two doors: the trial button and "Read free, no account" as a secondary button; the hero's duplicate "Sign in" removed.
- Phone tab strip on one line, no numerals under 600px. Desktop scenes 56vh (page 4587 to about 3900px at 1280x900; every scene still fires at rootMargin -30%).
- "See it working" re-shot from the real product: the reader with "loup" tapped and "wolf" shown; the Library shelf with the authored covers. `planning/run10/embed-shots.mjs` re-embeds them.
- Scene 05: "Pick where it runs: Sotto's server, your own key, or this device."
- Prettier had never been run on this file; formatting alone moved 171 lines.

Director's pass (`fdfce5f`, `02ce692`): the Discuss decision list sits under the passage (the transcript spacer no longer renders in front of it); at 900px and up the two landing doors stack as equal-width buttons (the copy column is 332 to 444px, too narrow for a row); the library screenshot re-embedded from the integrated build; node globals declared in the embed script.

## 3. Verification (what actually ran)

- Isolated check on a `git archive` of `fdfce5f` (`~/Claude/sotto-run10/isolated/`): typecheck clean (5 projects); `pnpm test` 840 passed; `content:validate` 0 errors, 223 warnings; `format:check` clean; `lint` 14 errors of which 8 were the new embed script (fixed at `02ce692`, eslint clean on the file) and 6 are pre-existing in `planning/design/launch-cards/shots2x.mjs` (identical at `cd326af`).
- Static export of the integration head served locally; `BASE_URL=http://localhost:8090 node e2e/hosted.mjs` (content server on :8790 for the loopback carve-out): RESULT PASS at 375 and 1440, four taps, first-visit content cache, offline reload of the reader. Over the LAN address the same smoke reaches four taps and then stops at `navigator.serviceWorker.ready`: plain http off localhost has no service worker, an environment limit, not a product one.
- The headless walk re-run against the export at 375 and 1280; landing, both steps, the set-up screen, the reader, the tapped word, the Discuss gate, Home, Library, Settings read as images. The set-up cover is the authored scene (probe: `cover.svg` 200, 220x330, complete).
- Cleo verify on the served landing: PASS with 4 WARN, all the CTA's 4px ink cutout (the app's own elevation token, same as V5).
- Deploy: see section 4.

## 4. Deploy

Free origin only, on Noel's say-so (2026-09-08: "Do what you recommend"), via `pnpm deploy:web` from a clean `git archive 02ce692` with `apps/client/.vercel` copied in. Deployment id and the live smoke result are recorded at the end of this file.

Ground truth checked before the deploy, because Noel remembered Vercel as retired: `readsotto.app` resolves to Vercel anycast (216.150.16.1, 216.150.1.65) and answers `server: Vercel`; `app.readsotto.app` is a CNAME to `sotto-cloud.fly.dev`; the live entry bundle matched `main`, not `run9/integration` (its strings were absent) and not the security branch (its CSP and frame headers were absent). Run 9's branch was therefore not live when this run started.

## 5. Needs Noel

1. `git merge --ff-only run10/integration` on `main` (`run10/integration` is `main` plus this run; a fast-forward). Then delete the `~/Claude/sotto-run10/wt/*` worktrees and `run10/{A,B,C}` branches.
2. `run9/integration` (30 Discuss commits, transcript gate, PTT pre-roll, half-duplex gate, Kokoro fp32) is still unmerged and is not what readsotto.app serves. It needs a real merge or rebase onto `main` because `cd326af` touched the same worker files. Run 9's FINAL.md §4 still applies.
3. `security/hardening-2026-09-07` (4 commits plus uncommitted edits in `~/Claude/sotto`) is another session's; its CSP is untested against the model host and the tutor worker. Not deployed by this run.
4. Paid origin: bump sotto-cloud's vendor pin to the merged sha and `fly deploy --app sotto-cloud` so the two-step setup, the Library fix and the level-aware daily story reach app.readsotto.app. The trial link from the free app lands on `/account?intent=start&returnTo=%2Fpaywall`, the URL the landing already used.
5. Product call: `voice.trial.note` hard-codes "$9.99 a month or $79 a year" in nine catalogs while `/paywall` reads live prices. A price change is a nine-file edit until it reads `cloud.plans()`.

## 6. Carried

Dead i18n keys (`import.library.captionOffline`, the `onboarding.fast.*` and `onboarding.level.notSure`/`hideSamples` family) in all nine catalogs. The one-frame cover flash while the SVG loads (run 9 note). Six pre-existing lint errors in `planning/design/launch-cards/shots2x.mjs`. Whether the paid origin's root walks a signed-in stranger through the two-step setup is untested here (it needs Noel's inbox for the magic link). Run 9's carried list.

## 7. Deployment record

- 2026-09-08 16:40 EDT: `pnpm deploy:web` from a clean `git archive 02ce692` with `apps/client/.vercel` copied in. Production deployment `dpl_JDkd2DnkjpNUqz1671iXrfHXZ42Z` (`sotto-38ujghbir-nturls-projects.vercel.app`), aliased to https://readsotto.app and https://www.readsotto.app.
- Live checks: the landing serves the secondary door (`class="cta secondary" href="/start"`) and the scene 05 line; `node apps/client/e2e/hosted.mjs` against the live origin: RESULT PASS at 375 and 1440, `TAPS landing -> reader = 4` at both, first-visit content cache and offline reload green.
- Returning visitors with a cached PWA shell get the old landing until `sw.js` changes bytes (run 7 note); a hard reload fetches V6.
- **Regression and restore, 2026-09-08 16:40 to 16:57 EDT.** The 16:40 deploy was built from local `main` (cd326af + run 10) and did not contain `origin/main`, which another session had advanced through GitHub pull requests #1 to #5 (UX findings, capture gate, service-worker refresh per build, streamed-speech await, imported narration, parchment cover catalog) at 16:02 the day before, one minute before that day's production deploy. The pre-deploy probe compared the live bundle against local branches only and never fetched `origin`, so the PRs went unnoticed and the 16:40 build removed them for 17 minutes. Fix: `origin/main` merged onto the run 10 line (`b2b65fc`, conflicts in `e2e/hosted.mjs` and the landing resolved by hand; workspace suite 856 green; local export smoke PASS), `main` fast-forwarded and pushed, redeployed as `dpl_BEPpotvDcQ1ebxt7ECpxYFRjMhqK` (`sotto-hpyejodyg`) at 16:57. Live: cover.webp 200, the secondary door present, hosted smoke PASS at 375 and 1440 with four taps.

## 8. The five items, tackled (2026-09-08 evening, Noel: "tackle all of these")

1. **main fast-forwarded.** `run10/integration` landed on `main` by a ref update (`git fetch . run10/integration:main`, no checkout of another session's tree); the push was rejected because `origin/main` had five merged pull requests (see §7), so `origin/main` was merged first (`b2b65fc`) and `main` fast-forwarded to that. Lane worktrees `wt/A,B,C` and branches `run10/A,B,C` removed.
2. **Run 9 merged.** Two lanes: `merge/run9` (run 9 onto the old main; conflicts in the voice screen, `worker.ts`, the ledger; 1062 tests), then main `b2b65fc` into it (conflicts in `protocol.ts` and `worker.ts`: the capture gate's mute guard and `inputGeneration` epoch kept, run 9's PTT pre-roll kept without `clear()` because `handleFrame` drops every frame while muted, so the buffer never holds muted audio; run 9's golden prompt fixture regenerated because PR #1 rewrote the response-language sentence, and that priority carried into compact rule 3). `discuss-quality.mjs` on the final tree: **18/18** (mic and text scenarios, WER 0.05 and 0.00), after the harness learned to open "Run it in this browser" first (it scored 4/18 on the door alone).
3. **Security branch merged and its headers tested.** `merge/security` (one conflict, `ci.yml`: PR #1 had removed the duplicate pnpm `version:` line, so the SHA pins stayed and the version line did not); then onto the run 9 line (`prompt.ts`: the fence moved into `renderDynamicContext()` so both prompts carry it; `prompt.test.ts`: both suites kept, fixture regenerated). Headers verified three ways: the exact response headers on a Vercel preview (`sotto-52w9y3yde`), a local server applying `vercel.json`'s headers, and a WebGPU Chromium probe that downloaded the 1.2 GB tutor and loaded it with zero policy messages, enforced or report-only. The enforcing policy is `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`; the full policy is report-only.
4. **Paid origin.** sotto-cloud: `origin/main` merged onto the local security commits (`41cd17b`), `CORS_ORIGINS` set to the marketing origin for `/billing/plans` (`f2a23cd`), pushed. Pin bump and `fly deploy` recorded in §9.
5. **Live trial price.** `src/cloud/trialOffer.ts` (`pickTrialOffer`, `FALLBACK_TRIAL_OFFER`, `useTrialOffer` with a session cache, `credentials: 'omit'`, 4 s abort, silent fallback) and `src/cloud/priceFormat.ts` (the paywall's formatter lifted out; prose gets `$79`, the paywall keeps `$79.00`). The nine catalogs use `{days}`, `{monthly}`, `{yearly}`. Proof: 23 new tests, Playwright with the plans route fulfilled (7 days, $12.50, $99) and aborted (3 days, $9.99, $79). Left as noted by the lane: seven catalogs now render ICU's `$US` marker; `trialDays: 1` would read "1 days"; the landing's four prices stay hand-written.

Landing, same evening: Noel wanted the two doors side by side as in the lane's preview. The two-column stage now starts at 1240px (grid `1fr / 1.05fr`, copy column 488px, doors at 15px type, 465px together, measured on the live page); from 600 to 1239px the page keeps the single column with the tab strip, where the doors already share a line.

Final tree: `merge/final` = main + run 9 + security + live price + the landing revision; 1099 tests, isolated proof in the lane reports (`MERGE9-report.md`, `MERGESEC-report.md`, `PRICE-report.md`).

## 9. Deployment record, closeout items

- 2026-09-08 17:41 EDT: free origin, `pnpm deploy:web` from a clean `git archive dd870d8` (main), production `dpl_7iCTntw6jgM4sgXv1oCCXK7xvjcQ` (`sotto-ca35sr68t`), aliased to readsotto.app. Live: the landing serves the 1240px stage rule; `node apps/client/e2e/hosted.mjs` against the live origin: RESULT PASS at 375 and 1440, four taps.
- Gate before it, on the served export of `3389ca8`: hosted smoke PASS (four taps), doors on one line at 700, 1000, 1239 (single column) and 1240, 1280, 1440, 1600 (two columns, 23px spare), walk at 375 and 1280 read, Cleo verify PASS with the four CTA-cutout WARNs. The walk's only console errors were the plans fetch blocked by CORS from the LAN test origin, which the paid origin's `CORS_ORIGINS` change removes for readsotto.app.
- sotto-cloud `c6ebabb`: vendor pin `dd870d8`, lockfile reconciled (`@fastify/static@10.1.3` for the vendored server), `pnpm check` 408 tests, pushed. Fly deploy and its live checks: see the line below.
