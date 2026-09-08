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
