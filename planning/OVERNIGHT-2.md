# Sotto overnight run 2 — plan (written 2026-09-04 evening)

Fable orchestrator, Sonnet/Opus subagents and /fanout workers do the keystrokes.
Companion prompt: `planning/KICKOFF-2.md`. Ledger continues in `planning/LEDGER.md`.

## Where we actually are (verified before writing this)

- The hosted link ALREADY EXISTS: https://sotto-steel.vercel.app (HTTP 200, packs index served).
  It is Tier 1: reading, narration, tap-translate, save, review. No voice tutor (by design:
  the static host has no server), onboarding voice sample says "Sample unavailable".
- Deploy path: `cd apps/client && pnpm web:export`, then `vercel build --prod` +
  `vercel deploy --prebuilt --prod` (team nturls-projects). CLI only, not git-triggered.
- `docs/verification.md`: 9 PASS / 18 PARTIAL / 4 DEFERRED / 4 NOT VERIFIED. Rows 15, 16, 24
  are NOT VERIFIED; 22 (voice smoke beyond ES/FR/EN) and 27 (human review) are DEFERRED.
- Not built: phrase/sentence translation (research called it a day-one fix), dark mode,
  PWA/offline shell, desktop-shaped layout (Noel: "still feels phone-shaped"), gloss
  locales beyond en/fr/es, Silero VAD.
- Known quality gaps: FR/ES narration alignment only 65-70% matched (rest interpolated),
  zh ~50%; local tutor first audio 7-12 s; onboarding keeps the prior interface language
  on two steps after a language pick.
- Working tree has 17 uncommitted files from the Vercel-deploy session (serverUrl origin
  fallback, voice error codes, web-audio tweaks, two screenshots). See pre-flight.

## Thesis for the night

"Free, runs locally, and you can try it from a link" is one product, not a trade-off:
the static site stays the front door, and the voice tutor moves INTO the browser
(WebGPU models, downloaded on opt-in, cached) so the link gives the full experience
with no server and no spend. Everything else below makes that first visit land.

## Lanes (disjoint file ownership; all commit to main, push at every gate)

### Lane A — First-contact on the hosted link  (Sonnet; design spec from a Cleo pass first)
Goal: a stranger who opens the link is reading a narrated story within two taps, on a
phone or a 1440 desktop, and can install it.
1. Fast path: detect browser language; offer "Start reading in French / Spanish / …" on the
   first onboarding screen with sensible defaults (interface = browser language, level A1),
   full wizard still available. Shareable deep links `/read/<bookId>` that work cold.
2. Desktop pass: Cleo subagent writes `planning/design/DESKTOP.md` (extend DESIGN.md:
   two-column reader at >=900px, translation panel docked right, home rails as a grid,
   typographic measure ~65ch). Implementer follows it. Proof: 1024 and 1440 screenshots
   reviewed by the orchestrator against the spec, not by the worker.
3. PWA: web manifest + service worker (workbox or hand-rolled) caching the app shell and
   any pack the user opens (audio included, per book, not all 51 MB). Installable on iOS
   Safari and Chrome; offline reload of an opened book works. Icons via
   ~/Claude/app-icons/build_icons.py.
4. Fix the onboarding stale-language bug (interface language not applied on two steps).
5. `pnpm deploy:web` script wrapping export + vercel build + deploy; a Playwright smoke
   (`pnpm e2e:hosted`) that runs against the DEPLOYED URL: cold visit, two taps to a
   playing narration, tap-translate, save, reload persists, zero console errors.
Owns: apps/client/app/onboarding/**, apps/client/src/ui/** (layout files), apps/client/public/**,
apps/client/scripts/**, apps/client/e2e/hosted.mjs, planning/design/DESKTOP.md.

### Lane B — Voice tutor in the browser, no server  (Opus lead for design + first slice; Sonnet for the rest)
Goal: on the static site, a capable browser (WebGPU, >=8 GB) can opt into "Download tutor
models" and then run the same four-mode tutor entirely client-side.
- New `BrowserCascadeProvider` in `packages/voice/src/browser-cascade/` implementing the
  existing `VoiceProvider` interface (connect/disconnect/setMode/setMuted/pushToTalk/
  interrupt/replayLast/sendText/respondTool/on) and emitting the SAME event vocabulary as
  `LocalCascadeProvider`, so the voice screen, session bar, captions, and the seven tools
  (already executed client-side via toolContext) work unchanged.
- Stack: `@huggingface/transformers` 4.x whisper (base or small, WebGPU, wasm fallback) for
  STT; `@mlc-ai/web-llm` 0.2.x with a Qwen3 1.7B or 4B q4 build for the LLM, reusing
  `apps/server/src/voice/prompt.ts` logic moved into `packages/core` so both providers share
  one prompt builder; `kokoro-js` 1.2.x for TTS; energy VAD reused from the server (port it to
  a Worker). Everything runs in Web Workers; the main thread only plays audio and renders.
- Capability gate + download UI: a Settings row and a voice-screen panel showing model
  sizes, progress, and "Remove models". Models cached by the browser (Cache API/OPFS);
  never auto-download. Unsupported browsers keep today's clear "unavailable" panel.
- Also: onboarding voice sample and the translation-panel pronunciation can use kokoro-js
  when models are present (falls back to the mp3 slice today).
- Proof: unit tests with fake model shims; a live Playwright run against the static build
  with Chromium's fake mic (same recipe as `pnpm e2e:voice`), headless WebGPU via
  `--enable-unsafe-webgpu --use-angle=metal`; if headless WebGPU fails after two attempts,
  run the wasm path with whisper-tiny + kokoro q8 for the e2e and record a real-browser
  Browser-pane session for the WebGPU path. Evidence log to docs/evidence/.
- Escalate (to the orchestrator, not push through): WebLLM cannot load any Qwen3 build in
  Chromium on this Mac; kokoro-js produces no audio for fr/es voices; per-turn latency on
  the wasm path exceeds 20 s (then ship STT+TTS in-browser and keep LLM as "needs local
  server", honestly labeled).
Owns: packages/voice/src/browser-cascade/**, packages/core/src/prompt*.ts (delete the dead
buildTutorInstruction while there), apps/client/src/voice/availability.ts + provider
selection, apps/client/app/settings/** (models row), new i18n keys in all nine catalogs.

### Lane C — Reader depth  (Sonnet; content generation via local Qwen or /fanout Codex)
1. Phrase and sentence translation: long-press-drag (touch) or click-drag (web) selects a
   span; a pre-built sentence translation shows for full sentences, and a span gets a
   composed gloss line. Content pipeline gains `sentenceTranslations[<locale>]` per
   sentence, generated at build time (local Qwen via llama-server, same pattern as the
   gloss auto-fill), validator-checked, for en/fr/es explanation locales first.
2. Alignment quality: raise FR/ES matched % from ~65-70 toward 90+. Force whisper language,
   normalize elisions/apostrophes/diacritics before matching, use DTW over the token
   sequence instead of greedy matching. Report before/after per book in the ledger.
   Rebuild timings only; do not re-narrate.
3. Dark mode: `scheme` tokens in packages/core theme, `useColorScheme` on the client,
   Cleo-approved dark palette for Paper (ink on warm charcoal, marker stroke stays), a
   Settings toggle (system/light/dark). Lowest priority in this lane.
Owns: packages/content/src/** (align, build, validate, schema), packages/content/packs/**
(regenerated fields only), apps/client/src/ui/reader/** (selection + panel),
packages/core/src/theme.ts.

### Lane D — Content breadth  (/fanout: Codex for drafts, Kimi K3 for zh; local Qwen for glosses)
1. Gloss locales: fill glosses for every explanation locale x every book (pt, it, zh-Hans,
   zh-Hant, ro, ca on top of en/fr/es), validator-checked, so "Explain in Portuguese" is
   real instead of an English fallback caption.
2. Two more short readers each for FR and ES (public domain, A1/A2, labeled draft), narrated
   with timings. Codex was the reliable drafter last run; raise
   CLAUDE_CODE_MAX_OUTPUT_TOKENS to 64000 for long JSON.
3. An LLM level-sanity pass over every book (sentence length, frequency-band vocabulary,
   tense inventory vs claimed CEFR) written to `docs/content-qa.md`. Books stay `draft`;
   this is a report for the human reviewer, not a promotion.
Owns: packages/content/bundles/** (new books + gloss fields), docs/content-qa.md.

### Lane E — Verification debt and iOS  (Sonnet; runs after A-C land)
1. Playwright e2e for the NOT VERIFIED rows: 15 (session bar placement and return), 16
   (completion -> next-book recommendation recorded), 24 (language-pair switch keeps the
   other pair's progress and vocab); mode-chip switch updates UI (row 6).
2. iOS interactive walkthrough on the iPhone 17 Pro simulator via the simulator MCP
   (`xcode-select -p` already points at /Applications/Xcode.app/Contents/Developer):
   onboarding -> home -> reader -> tap-translate -> save -> vocabulary, screenshots to
   docs/screenshots/ios/. Voice on iOS stays deferred unless it just works.
3. Voice smoke for pt, it, zh-Hans, zh-Hant against the local stack (row 22).
4. Rewrite `docs/verification.md` rows touched tonight with evidence paths.
Owns: apps/client/e2e/**, docs/verification.md, docs/screenshots/**, docs/evidence/**.

## Sequence and gates

0. Pre-flight (orchestrator): `pnpm check` on the dirty tree; if green, commit the 17 files
   as "wip: deploy-session follow-ups (serverUrl origin fallback, voice error codes)";
   if not green, leave them, note it, and have lanes avoid those files. Start Docker,
   `~/ods/installers/macos/ods-macos.sh start`, whisper-server on :9001, llama-server with
   `cache_prompt: true` and `enable_thinking:false`; confirm /health shows stt/llm/tts true
   at http://127.0.0.1:8790. Write every lane's seven-field task card into LEDGER.md.
1. Wave 1 in parallel: A (Cleo spec first, then implementer), B (Opus design + slice 1),
   C1+C2, D1+D2 via /fanout. Disjoint ownership as listed; i18n catalogs are append-only
   with lane-prefixed key namespaces to avoid merge fights.
2. Gate 1 (orchestrator review, Browser pane): A's fast path + desktop at 1440; C's span
   selection; B's model download panel and first STT round trip. Fix or re-dispatch.
3. Wave 2: A5 deploy + hosted smoke; B remaining slices; C3 dark mode; D3 QA report; E1-E3.
4. Gate 2: full `pnpm check`, deploy to Vercel, `pnpm e2e:hosted` against the live URL,
   in-browser voice evidence log, iOS screenshots.
5. Adversarial review (Opus, read-only): "what is fake, fragile, or unverified", ranked.
   Fix lane (Sonnet) for the top findings. Re-run Gate 2 checks that the fixes touch.
6. Close-out: verification.md, LEDGER finish-line section, README "Try it" section with
   the link and a 20-second demo GIF (demo-video skill), memory file update, iMessage to
   Noel with: link, what changed, what was deferred, changed-file count, Fable-bar note.

## Proof the orchestrator must hold at close-out (not worker claims)

- Completion: commits on main, Vercel deployment id, files listed per lane.
- Behavior: `pnpm e2e:hosted` log against sotto-steel.vercel.app; 375/1440 screenshots of
  home, reader, translation panel, voice screen; in-browser voice evidence log (or an
  honest deferral naming which of STT/LLM/TTS ran in-browser); alignment before/after
  table; iOS screenshots; `pnpm check` tail.
- Boundary: `git diff --stat` per lane vs its ownership list; no new server dependencies
  for the static path; no analytics, accounts, or payments added; nothing pushed to any
  other repo.

## Routing and cost

- Fable: plan (this doc is most of it), Gate 1, Gate 2, close-out. Nothing else.
- Opus: Lane B design + first slice, adversarial review.
- Sonnet: every other implementer and the fix lane. High effort on Lane E (thoroughness).
- /fanout: Codex for readers and sentence translations if llama-server is slow; Kimi K3 for
  zh content and any UI component with a written spec; grok/DeepSeek for gloss volume.
  Always typecheck fanout output; Kimi cannot run pnpm.
- Never in any worker prompt: token allowances, the reference app's name, auth/key/secret
  wording (the in-browser tutor needs none; say "no server, no account").

## Deferred on purpose (say so in the report)

Physical iPhone; OpenAI Realtime/WebRTC provider; human content review (drafts stay
drafts); user-uploaded books; Silero VAD (retry only if Lane B has slack); custom domain
and the public repo flip (Noel's calls).

## Noel, before bed (five minutes)

1. Settings -> Usage: read the Fable bar. Two Fable runs already happened today. If under
   ~40% remains, paste KICKOFF-2.md into an Opus session instead; the plan is the same.
2. Decide the dirty tree: default in the kickoff is "commit if `pnpm check` is green".
   If you would rather discard those 17 files, say so in the first message.
3. `caffeinate -dims` in a terminal so the Mac stays awake; leave Docker Desktop to the run.
4. Optional, unrelated to the run: flip github.com/nturl/sotto to public if you want the
   README "Try it" link to point at a public repo by morning.
