# Sotto — adversarial review of overnight run 2

Read-only pass. Range `ef4fc18..e098e73` (33 commits; HEAD moved twice during this review — Lane B5 landed `ce59984`, `32fbc1d`, `e098e73`). Lane B5's in-flight paths (`packages/voice/src/browser-cascade/**`, `apps/client/src/voice/**`, `app/voice/[bookId].tsx`, `e2e/browser-tutor.mjs`) were read **from git, not the working tree**, as instructed; everything else from the working tree. Every claim is marked ✓ VERIFIED (I read the file / opened the image / ran the probe) or ? INFERRED.

---

## §1 — Top 10 findings

### 1. The offline PWA does not work offline. It has never once been tested offline. ✓ VERIFIED (by code reading)
`apps/client/public/sw.js:245-262` (shell handler), and the same pattern at `:216`, `:226`, `:234`.

Every fetch handler resolves its cache name by calling `getManifest()`, which does `fetch('/sw-manifest.json', {cache:'no-store'})` (`sw.js:24-32`). Offline that fetch throws, `getManifest()` returns `null`, and the cache name falls back to the literal `'dev'`:

```js
const shellCache = SHELL_CACHE_PREFIX + (manifest?.version ?? 'dev');
```

So offline, the worker looks in `sotto-shell-dev` and `sotto-content-dev` — caches that do not exist. Everything was written to `sotto-shell-1788586333806.6306` / `sotto-content-...`. `cacheFirst` misses, falls through to `fetch()`, throws; the navigate fallback then opens the same empty `sotto-shell-dev`, finds no `/index.html`, and rethrows. **Offline reload of an opened book fails completely** — the exact scenario the whole SW exists for.

- **Claimed:** OVERNIGHT-2 Lane A3 "offline reload of an opened book works"; ledger Gate 2 "first-visit content cache holds the chapter JSON AND narration audio".
- **True:** the cache is genuinely populated (8 files, ✓ VERIFIED in `docs/evidence/hosted-smoke-live-2-2026-09-05.log`) but is unreachable while offline. Both hosted-smoke logs end with an explicit `WARN — real offline navigation hit the known Playwright/Chromium CDP limitation … relying on the cache-inspection checks above instead`. The test limitation was disclosed honestly; the resulting untested code is broken.
- **Smallest fix:** cache the manifest itself. In `install`, `cache.put('/sw-manifest.json', …)` into the versioned shell cache; in the handlers, fall back to `caches.keys()` and pick the newest `sotto-shell-*` when the network manifest is unavailable. Then verify by hand in a real browser (DevTools → Network → Offline, then reload) — Playwright cannot prove this.

### 2. The in-app tutor panel tells the user it can save words. No tool round trip has ever succeeded. ✓ VERIFIED
`apps/client/src/i18n/en.json` → `tutor.browser.sliceNote`: *"The tutor listens, replies, and can save words now."* Same claim in `docs/browser-tutor.md:44` — *"The tutor listens, replies, and can call the same seven tools as the local server (save a word, jump to a sentence, switch modes, and so on) — all inside the browser."*

Across all four evidence logs, the tool round trip has **never** completed:
- `browser-tutor-slice4-2026-09-05.log` (the post-fix run on the unmodified production path): `[FAIL] tutor caption (final) within the reply budget`, `[FAIL] "Guarda la palabra cigarra" heard`, `[FAIL] tool round trip: cigarra actually saved to the vocabulary store`. 4 of 8 assertions FAIL.
- `browser-tutor-slice2-3-2026-09-05.log`: the one and only tutor caption ever produced in a browser (`t+101.5s`) was a reply to the garbage transcript `de de de de…`, and that run was killed before the second utterance.
- The slice-4 log is admirably honest about this ("WHAT DID NOT COMPLETE, AND WHY THIS LOG SAYS SO RATHER THAN HIDING IT"). The *docs and the shipped UI copy* are not.

**Smallest fix:** change `tutor.browser.sliceNote` to "The tutor listens and replies. Saving words by voice is still being finished." and downgrade `docs/browser-tutor.md:44` to what the logs support. This is user-facing copy on a live site, so it should not wait for the follow-up fix.

### 3. Every ledger timestamp after Gate 1 is invented. The run took 3h12m; the ledger narrates 10 hours. ✓ VERIFIED
`planning/LEDGER.md`, entries from `~03:30` onward.

| Ledger says | Actual commit time |
|---|---|
| `~03:30` Lane E report (`181b4a3`) | **23:59:46** |
| `~05:30` Lane B slices 2+3 (`d0fe16b`) | **00:34:33** |
| `~06:35` Lane C3b (`f52ba8f`) | **01:00:01** |
| `~08:40` Gate 2 deploy | **01:28** (Vercel `last-modified: 05:28 GMT`, `dist/index.html` mtime `01:28`) |
| `~09:30` redeploy | **01:32** |

`ef4fc18` (task cards) is `09-04 22:20:18`; `e098e73` is `09-05 01:32`. The drift grows monotonically, so this is not a timezone offset — the elapsed times were fabricated. This matters because the ledger is the only record of *how long things ran*: a reader estimating "the 1.1 GB WebLLM download plus tool-calling work took two hours" is reading fiction (16 minutes elapsed between `8be5ab7` and `d0fe16b`). **Smallest fix:** replace the timestamps with the real `git log --date` values, or drop clock times and keep commit shas.

### 4. The reference commercial app's name, vendor, price and Noel's trial dates are still readable in pushed public history. ✓ VERIFIED
`git log --all -S"the reference app"` returns four commits — `4a3e586`, `df242b2`, `1464906`, `3d67d24`. `3d67d24` ("scrub the reference app's name, pricing, trial dates, and recording-derived notes **before the public flip**") was a forward edit, not a history rewrite. `git show 1464906:planning/DECISIONS.md` recovers the product name, the vendor `[vendor]`, `[price]`, and the personal trial dates. `origin/main == HEAD`, so this is already on `github.com/nturl/sotto`.

The current tree is clean — ✓ VERIFIED zero hits across the whole tree, all of `git log -p ef4fc18..HEAD`, every commit message, and the new untracked `planning/KICKOFF-3.md` / `PAID-TIER-PLAN.md`. The leak is purely historical. **Smallest fix:** this cannot be fixed forward. Before any public flip: `git filter-repo` those four commits, or push a fresh-history repo. Flag to Noel — the repo is private today, so there is time, but "the scrub is done" is not true.

### 5. In-browser TTS has never run in a browser. ✓ VERIFIED
`docs/browser-tutor.md`'s capability matrix, row "Voice (TTS) — English only", reads as a shipped browser capability. The only proof anywhere is in `browser-tutor-slice2-3-2026-09-05.log`: *"English TTS was separately proven end-to-end with a **standalone Node script** (kokoro-js `generate()`, af_heart voice)"*. Every browser e2e used an es-419 fixture, where TTS is deliberately never engaged. So Kokoro-in-the-worker — through esbuild's node-shim alias, through the worker protocol, through the audio adapter — is completely unexercised. **Smallest fix:** run `browser-tutor.mjs` once against an `en-US` book, or label the row "English only, proven in Node; not yet exercised in the browser worker."

### 6. Dark mode has five light islands, including one on every tab. ✓ VERIFIED
These files import the light-only palette statically (`import { colors, … } from '@sotto/core/theme'`) and build module-level StyleSheets from it, so they cannot react to the scheme:

- `apps/client/src/ui/SessionBar.tsx` — rendered unconditionally in `app/(tabs)/_layout.tsx:11`, so it appears over Home/Library/Vocabulary
- `apps/client/app/voice/[bookId].tsx` — the entire voice screen
- `apps/client/src/ui/SpeechFillText.tsx` — used by the voice screen
- `apps/client/src/voice/TutorModelsPanel.tsx:26` — `colors.surface`, `colors.hairline`, `colors.surface2`, `colors.accent`
- `apps/client/src/ui/PlaceholderScreen.tsx`

(`Cover.tsx` is also static, but that is disclosed and deliberate — colourways stay.)

- **Claimed:** `f52ba8f` "finish dark-mode migration across shell/primitives/screens"; ledger C3b "every primitive and owned screen theme-reactive".
- **True:** every screen C3b *owned*. The voice screen and SessionBar are Lane B's files and were never migrated. There is no dark screenshot of either — `docs/screenshots/web/dark/` has no `*-voice-dark.png` and no session-bar shot, so the orchestrator's dark review could not have caught it.
- **Smallest fix:** four files switch to `useTheme()` and move their StyleSheets into `useMemo`, the pattern `onboarding/index.tsx:98` already uses. Then capture `375-voice-dark.png` and a session-bar dark shot.

### 7. `docs/verification.md` never mentions the night's headline feature, and its test-count row is stale. ✓ VERIFIED
- `grep -ci 'browser-tutor\|webgpu\|in-browser tutor' docs/verification.md` → **0**. Zero occurrences. The in-browser tutor, the four browser-tutor evidence logs, and the WebGPU capability gate appear nowhere in the acceptance-criteria report. `sotto-steel` and `vercel`: also 0 — the hosted deployment the whole run was aimed at is not cited either. `colorScheme`: 0. `sentence translation`: 0.
- **Row 20 (PASS)** still says "`pnpm check` green tonight … **180/180** unit tests" citing `docs/evidence/checks-2026-09-04.log`. Tonight's Gate 2 run is **318 tests / 41 files** in `docs/evidence/checks-gate2-2026-09-05.log` — a file `verification.md` does not reference at all. ✓ VERIFIED (read the log tail).
- **Row 16 (PASS)** opens "Not exercised via the UI this pass (still true)" and then, three sentences later, describes exercising it end-to-end with a `completedAt` timestamp. The old body was never trimmed.
- Also uncited: `docs/evidence/ios-walkthrough-2026-09-05.log`, `docs/evidence/hosted-smoke-live*.log`, `docs/screenshots/ios/*` (9 files on disk), `docs/screenshots/web/dark/*` (22 files).
- **Smallest fix:** delete row 16's stale first sentence, refresh row 20's numbers and log path, and add the new evidence paths to rows 13/20/34. The in-browser tutor genuinely has no row among the 35 BRIEF criteria — say so in the preamble rather than leaving it silently absent.

### 8. "99.4% alignment" covers 38.8% of the corpus, and two books have no timings at all. ✓ VERIFIED
`docs/evidence/alignment-2026-09-05.log`, the ledger's before/after table, and `docs/verification.md` row 13 (PASS) all quote 99.4%.

Recomputed against the packs: the denominator **5,115 is exactly right**, per-chapter, for the 17 chapters in the table. But that is **17 of 54 chapters in 6 of 19 books** — 5,115 of 13,192 words. Whole-corpus timing presence is **12,459/13,192 (94.4%) across 50/54 chapters**. `ca-patufet` (2 ch, 424 words) and `ro-capra-trei-iezi` (2 ch, 307 words) have **zero timings** — those locales have no Kokoro voice, which is correct and disclosed in `attribution.json`, but it is not visible behind the 99.4% headline.

Two further precision points: there is **no `alignment` field on chapters in the packs** — the number is a build-time match-quality metric, not stored coverage, and the 32 unmatched words still carry interpolated `startMs`. And the four new books were aligned (585/585, 691/691, 535/535, 597/597, ✓ VERIFIED) but appear in **no** log. **Smallest fix:** one clause — "99.4% of narrated FR/ES words (5,115 of the corpus's 13,192); ro-RO and ca-ES ship without narration."

### 9. `es-licenciado-vidriera` ships 15 French strings in its Spanish gloss fields. ✓ VERIFIED
`packages/content/packs/es-419/books/es-licenciado-vidriera/chapters/{01,02,03}.json` — the `es` gloss was copied from the `fr` field on 15 tokens: `enfant` ×2 (`01.json` `b1.s2.t2`, `b1.s4.t5`, for surface `niño`) and `à` ×13 (e.g. `01.json b1.s8.t2`, `03.json b1.s11.t2`, for surface `a`). A corpus-wide sweep for French-only orthography in `es` fields returns exactly these and nothing else — 15 of 13,480 es glosses, confined to one of the four new books. Everything else in DeepSeek's output is clean: **zero simplified characters in any zh-Hant field** across 13k+ tokens (✓ VERIFIED against the full simplified-form list), no genuine English leakage (the 1,108 "gloss == en gloss" hits are all true cognates — `animal`, `moment`, `jaguar`, Catalan `ball`), and the identity rule holds perfectly (pt 442/442, it 1021/1021, ro 307/307, ca 424/424). **Smallest fix:** a validator rule that flags an `es` gloss byte-identical to the same token's `fr` gloss when the surface form is not, then refill those 15.

### 10. `serverUrl()`'s loopback special-case silently breaks the static export on localhost. ✓ VERIFIED
`apps/client/src/state/contentApi.ts:26-34`:

```js
if (loc && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)) return loc.origin;
return 'http://localhost:8790';
```

Anyone who serves `apps/client/dist` the obvious way (`npx serve dist`, `python -m http.server`) gets content fetched from a dev server that isn't running — no books, no obvious cause. It already cost this run a false finding: Lane E4 reported "zero `sotto-content-*` cache entries" and that wrong conclusion is **still written into `docs/verification.md` row 34** as the current state of the offline story, corrected only in the ledger. The workaround (`sotto.localhost`, via the new `scripts/serve-static.mjs`) is undiscoverable from the code. **Smallest fix:** have `build-web.mjs` stamp `window.__SOTTO_STATIC__ = true` into the exported `index.html` and branch on that instead of on the hostname string.

---

## §2 — Everything else

### Fakes and dead controls
- `docs/browser-tutor.md:76` — "If WebGPU is present but the GPU adapter fails to initialize, the tutor falls back to WebAssembly on its own… Slower, same behaviour." The wasm path has **never once loaded successfully**: `browser-tutor-stt-regression` experiment (d) shows a hard `Can't create a session` graph-build failure on both dtypes, and the log itself says "the documented fallback-matrix claim was never actually exercised." The `dtypeForDevice` fix (`worker.ts:134-141` at HEAD) is plausible but unproven. ? INFERRED that it now works.
- The `SttFallbackTracker` **is** properly wired into the worker at HEAD (`worker.ts:618-657`, `packages/voice/src/browser-cascade/stt-fallback.ts`, 13 unit tests) — ✓ VERIFIED, so this is unproven, not fake.
- `TTS_MODEL` (90 MB) is in `TUTOR_MODELS` and downloads for every user, though `models.ts:64` states the worker "only ever calls it for English books." A French learner pays 90 MB for a model that will never run. ✓ VERIFIED.
- The fast path can only ever propose French or Spanish (`fastPathDefaults.ts:66`), though 9 content locales ship. A Chinese or Italian browser is offered French. ✓ VERIFIED — defensible, but "Start reading in French" is the only door for 7 of 9 locales.
- Disclosed already, still open: home "Voir tout" goes to the unfiltered library; book-tile hover isn't eased; SessionBar resume doesn't restore the active mode chip (row 15's new FAIL).

### Overclaims in docs
- `docs/browser-tutor.md:79` — "Roughly 1.5 GB of free disk for the full set, **once slices 2 and 3 land**." They landed in `d0fe16b`. Stale.
- The panel's total is honest: `totalSizeMb` sums 136 + 1100 + 90 = **1326 MB**, rendered via `tutor.browser.needsDownload` **before** the tap, with per-model rows. ✓ VERIFIED — and no engine or pipeline is constructed on mount (`TutorModelsPanel.tsx` only calls `downloadTutorModels` inside `start`). The "never automatic" claim is real.
- Ledger says "Total opt-in download 1285 MB" — pre-fix number, now 1326 MB.
- `planning/BROWSER-TUTOR.md` still carries the DISPROVEN GPU-contention hypothesis as its "Slice 2+3 status" note; the regression log supersedes it but the design doc wasn't updated.
- `docs/content-qa.md` is genuinely good — it names the DeepSeek backend, the `thinking:{type:"disabled"}` fix, and the identity-locale bug it caused and fixed. No overclaim found.

### Fragility
- **SW cache growth across deploys.** `sw.js` is byte-identical between deploys, so the browser never reinstalls it, `activate` never re-runs, and the old-cache eviction in `sw.js:57-72` never fires. Every deploy leaves a stranded ~9.4 MB shell cache plus content caches. It self-heals for *correctness* (cache names are derived from the live manifest per request) but not for *space*. ? INFERRED from the code — a stale SW cannot serve an old `index.html` pointing at deleted bundles, because the empty new-version cache falls through to the network.
- **A network round trip per handled request.** `getManifest()` is called on every fetch with `cache: 'no-store'`, so the SW doubles the request count for every content and shell asset. ✓ VERIFIED.
- First visit precaches **63 files / 9.4 MB**, 36 of them Fraunces + Inter TTFs at every weight and italic. ✓ VERIFIED. `/tutor/**` is correctly excluded (0 entries) — the Gate 1 fix held.
- **`cache.addAll(manifest.files)` is all-or-nothing**: one 404 among 63 aborts the whole precache silently.
- The Gate 2 deploy (`dpl_FhQamC61…`, the id in this review's brief) shipped a **broken narration path** — cache-first answered the media element's Range request with a full 200, which Chromium media rejects. Caught only by the orchestrator's own Browser-pane check, *after* the hosted smoke reported PASS; the smoke passes because it presses play before the warm cache lands. Fixed in `ce59984` and redeployed as `dpl_5PuTC…`. The **current** live site is fine: `curl` confirms `rangeFromCache` in the live `sw.js`, live manifest `1788586333806.6306` matches `hosted-smoke-live-2-2026-09-05.log`. ✓ VERIFIED. Worth noting that the smoke has now missed a central-journey defect once.
- `apps/client/e2e/rows.mjs` is dirty in the working tree (+24/−4): a `firstVisible()` helper working around detached DOM nodes after SPA navigation. The fix is sound; it is uncommitted, and `docs/evidence/rows-e2e-2026-09-05.log` is dirty alongside it, so the committed log does not match the committed script.
- `apps/server/tsconfig.json` gained `allowImportingTsExtensions` in `63cc19b` — a legitimate consequence of moving the prompt builder into `@sotto/core`, but landed in a file no lane owns, under a message about CSS grids. Self-disclosed. ✓ VERIFIED.
- `pnpm-workspace.yaml`'s change is a **tightening**, not a loosening: it adds `protobufjs: false` and `sharp: false` to the deny list; the pre-existing `esbuild: true` / `onnxruntime-node: true` allowances are unchanged. ✓ VERIFIED — this is a supply-chain improvement, contrary to how the ledger's shorthand "allowBuilds change" reads.
- The `git stash` a lane admitted running is recoverable via `git fsck` as dangling commit `20293de`. It round-tripped cleanly — every file in it appears in `327040e`/`d0fe16b`, nothing lost. ✓ VERIFIED. The real signal is that it swept **three lanes'** in-flight work into one blob, which is the shared-index problem again.

### Content
- Coverage claim holds **exactly**: 9 packs, 19 books, 54 chapters, **1,494 sentences with 0 below 9 translation locales**, **288 vocabulary entries and 13,192 word tokens with 0 below 9 gloss locales**. Missing-locale map empty. ✓ VERIFIED by script.
- **No timing regression.** All 10 EN and all 6 Chinese chapters have byte-for-byte identical `startMs` token counts vs `ef4fc18`. ✓ VERIFIED. `build.ts`'s carry-through of the alignment data worked.
- **Monotonicity clean**: 0 overlaps and 0 negative durations across all 50 timed chapters, including the two sampled FR chapters (`fr-chat-botte/01.json` 322 words, `fr-fables-la-fontaine/02.json` 350 words). ✓ VERIFIED. Note sentence-level `startMs` does not exist — sentence timing is derived from tokens.
- **Level-sanity changed nothing.** `packages/content/scripts/level-sanity.mjs` has no write calls (✓ VERIFIED by static check), and every pre-existing book's `level` and `reviewStatus` are byte-identical to `ef4fc18`. All 19 remain `draft`. ✓ VERIFIED both ways.
- The fast path lands every first-time French visitor on **`fr-cendrillon`** — `pack.books[0]`, alphabetically first, drafted by an LLM tonight, `reviewStatus: draft`, never human-reviewed. The front door is the least-reviewed book in the library. ✓ VERIFIED.
- Minor: on `es-licenciado-vidriera` `01.json b1.s2.t7`, `zh-Hans:"对"` and `zh-Hant:"比"` are different words, not a script conversion.

### Hygiene
- **Secrets: clean.** ✓ VERIFIED — no literal tokens in the tree or in `git log -p ef4fc18..HEAD`; every key is an env read or a runtime read of `~/.config/deepseek/api_key`; only `.env.example` is tracked and it is all-placeholder. `docs/openai.md:18`'s `sk-...` is a placeholder ellipsis.
- **No analytics, accounts, or payments.** ✓ VERIFIED — every grep hit is a Zustand `subscribe`/`unsubscribe` or an event-listener `remove`. `packages/voice/src/browser-cascade/provider.ts:292` carries the rule as a comment. `planning/PAID-TIER-PLAN.md` describes Stripe/StoreKit but is a plan doc and explicitly reaffirms CONTRACTS §0; no corresponding code exists.
- **No new server dependency.** ✓ VERIFIED — all four new runtime deps (`@huggingface/transformers`, `@mlc-ai/web-llm`, `kokoro-js`, `phonemizer`) are browser-side, in `packages/voice`, bundled by esbuild into the separate `public/tutor/tutor-worker.js`. onnxruntime's wasm is self-hosted from `public/tutor/ort/` rather than a CDN.
- **Nothing pushed elsewhere.** ✓ VERIFIED — one remote, one branch, `origin/main == HEAD`.
- Undocumented runtime hosts: the Hugging Face hub and MLC's CDN are contacted for model weights via library defaults, so no URL string exists in the repo and a grep misses them. `docs/browser-tutor.md` does name them in prose — good — but nothing enforces it.
- **Boundary: the ownership model did not survive.** 35 files changed tonight sit outside every lane's ceiling. Two are structural rather than sloppy: Lane D's ceiling names `packages/content/bundles/**`, **a directory that does not exist** (the work is in `packages/content/source/`), so all of D's output is nominally out of ceiling; and four entirely new books landed under `packages/content/packs/`, which Lane C owns only "regenerated fields only."
- **Both shared-index slips confirmed, both already pushed.** `63cc19b` ("desktop pass … grids, two-column book detail") actually contains 54 files including all of Lane B's browser-tutor slice 1 (+1,124 lines of `browser-cascade/*`, `planning/BROWSER-TUTOR.md`, `pnpm-lock.yaml` +649). `723857a` ("serve-static 404s missing asset paths", a 7-line fix) actually contains 44 files and ~11,000 lines: the entire four-book Lane D2 output with audio and covers. ✓ VERIFIED. This does matter for public history — `git log --follow` on `worker.ts` will name a commit about CSS grids as its origin, and that is not fixable without a rewrite. Both were self-disclosed in the ledger, and the remediation rule adopted mid-run (path-scoped `git commit -- <paths>`) is correct.

---

## §3 — verification.md rows I would change

| Row | Now | Change to | Why |
|---|---|---|---|
| **34** (offline) | PARTIAL | **FAIL** | The row's body still asserts the superseded "zero cache entries" finding as current. The cache is now populated (✓ VERIFIED live, 8 files), but §1.1 shows offline retrieval is broken by construction and untested. A row about offline that is wrong in both directions should not sit at PARTIAL. |
| **20** (checks / live e2e) | PASS | **PARTIAL** | Cites 180/180 tests and a 09-04 log; tonight's is 318/318 in an uncited file. "One live e2e" now has a companion that FAILS 4/8 (`browser-tutor-slice4`) and is not mentioned. PASS on stale evidence. |
| **13** (narration + alignment) | PASS | **PASS**, reworded | The pipeline is real and the numbers check out — but the row must say the 99.4% covers narrated FR/ES only (38.8% of the corpus) and that ro-RO/ca-ES ship with no timings. |
| **16** (completion) | PASS | **PASS**, trimmed | Correctly PASS on the 2026-09-05 addendum. Delete the leading "Not exercised via the UI this pass (still true)" — the row now contradicts itself. |
| **15** (session bar) | PARTIAL | **PARTIAL** (keep) | Correctly downgraded and correctly records the new mode-chip FAIL. No change; cited as a model of how the others should read. |
| **22** (voice smoke) | PARTIAL | **PARTIAL** (keep) | Honest about pt-BR's timeout, zh-CN's `colors is not defined` crash, and zh-TW's Simplified STT output. Note that the zh-CN crash is almost certainly §1.6's light-island refactor and is now traceable. |
| **new row / preamble** | — | **add** | The in-browser tutor has no row among the 35 BRIEF criteria. Rather than leave the night's headline feature absent, add a preamble note: what ran in-browser (STT on WebGPU, ✓ proven), what did not (LLM turn, tools, TTS), and cite the four `browser-tutor-*` logs. |

Counts: 10 PASS / 22 PARTIAL / 3 DEFERRED = **35**. ✓ VERIFIED — they add up, and the "0 NOT VERIFIED / 0 FAIL" claim is accurate as the file stands. My changes would make it 9 PASS / 23 PARTIAL / 3 DEFERRED, or 9/22/3 + 1 FAIL if row 34 is taken.

---

## §4 — Three things that are genuinely solid

1. **The alignment fix is real engineering, honestly measured.** The root cause — whisper.cpp's `verbose_json` returning BPE sub-word fragments (`" vie"` + `"ux"`) that the old exact-match LCS compared against whole pack tokens — is correct, non-obvious, and was found by reading rather than guessing. It explicitly *disproves* the plausible hypothesis in the plan ("force the whisper language"), which was already true in `narrate.ts`. The before/after replays the same cached transcripts through the old algorithm, so it is a genuine A/B, not a re-run. And the result verifies independently: I recomputed the 5,115 denominator per chapter and it matches to the digit, with 0 overlaps and 0 negative durations across all 50 timed chapters, and no EN/zh chapter lost a single timing.

2. **The STT regression hunt is exemplary adversarial work by the run on itself.** Lane B4 was handed a hypothesis (WebGPU contention between whisper and a resident 1.1 GB LLM) and *killed it* with controlled experiments (a), (c) and a single-utterance control — reproducing the failure with no LLM loaded, llama-server stopped, and a fresh profile — then established ground truth by feeding the identical wav to a native whisper-server. The real cause (fp16 encoder → decoder repetition collapse) was isolated by a targeted A/B on two independent profiles, and the fix ships with three independent layers: the dtype change, bounded generation kwargs, and a unit-tested runtime fallback tracker. It even records a caveat it chose not to chase (transformers.js's cache keying on model id, not id+dtype). This is what the rest of the run's evidence should look like.

3. **The content pipeline's honesty about its own machine-generated output.** The nine-locale sweep is complete and *actually* complete — 1,494 sentences and 13,192 tokens with zero gaps, verified independently. The identity-locale bug (asking a model to translate Romanian into Romanian, which produced English) was caught, root-caused, fixed with a no-LLM `NATIVE_EXPLANATION_LOCALE` map, and 187 poisoned entries were cleaned — and all of that is written down in `docs/content-qa.md` rather than buried. The zh-Hant edition survives a full simplified-character sweep with zero hits. And the level-sanity pass, which found 9 of 19 books a level harder than claimed, promoted nothing and wrote nothing back — the discipline the task card asked for, verified two ways.

---

## §5 — What the hosted link actually is today

> **Try it: [sotto-steel.vercel.app](https://sotto-steel.vercel.app)**
>
> Open the link and you are two taps from a narrated story: the first screen proposes a language based on your browser and drops you straight into a reader, where one press starts the narration with the words highlighting as they are spoken. Tap any word for a translation and a gloss in one of nine explanation languages, drag to select a phrase or a sentence for a pre-built translation, save words, and review them later. Nineteen short public-domain books across French, Spanish, English, Italian, Portuguese, Romanian, Catalan and Chinese, all narrated except Romanian and Catalan. Everything is kept in your browser — no account, no server, no analytics, nothing recorded. It installs as an app, and it has a dark mode. The books are machine-adapted drafts and their CEFR levels are estimates, not editorial judgements. On a desktop browser with WebGPU you can additionally opt into downloading about 1.3 GB of models to run a voice tutor entirely in the page; today that reliably gives you speech recognition, and the conversational replies, spoken audio and word-saving on top of it are still being finished — the panel tells you where that stands before you download anything. Offline reading is partly built and not yet working; treat this as a working demo of the reading experience rather than a finished product.
