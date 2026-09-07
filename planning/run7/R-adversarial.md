# Lane R — adversarial review of run 7

Read-only pass over `ae32132` (plus `f774c99`, the ledger commit), re-verifying each lane's
strongest claims against the tree and against live servers, not against its own report.
Everything below is either **VERIFIED** (I ran it or read the traced code myself) or
**INFERRED** (mechanism reasoned from code, symptom observed). Where a lane's report and my
repro disagree, my repro is what is written down.

Environment used: the orchestrator's Metro on `:8081` (PID 5185, process env carries only
`EXPO_PUBLIC_SERVER_URL=http://localhost:8790` — no `EXPO_PUBLIC_VOICE=fake`, checked with
`ps eww`), the content/voice server on `:8790` (`/health` → `stt/llm/tts` all true). No
server was started, restarted or killed. No `.env` was read. No real stored setting exists
anywhere in this session; every own-provider check used the literal string
`sk-test-not-a-real-key-…` with `api.openai.com` intercepted by Playwright.

My scripts and screenshots: `~/Claude/sotto-run7-recon/R2/`. The previous (stopped) R
process's screenshots in `~/Claude/sotto-run7-recon/R/` were reused only where the filename
makes the check unambiguous; everything load-bearing was re-taken.

---

## 1. What holds up

These are the run's real wins, independently reproduced:

- **Suites are green, at head, on my machine.** `pnpm --filter @sotto/client test` 274/274
  (34 files); `pnpm vitest run packages/voice/test` 136/136 (12 files);
  `pnpm --filter @sotto/core test` 52/52; `pnpm -r typecheck` clean across all five
  packages; `pnpm lint` 0 errors / 23 warnings; `sotto-cloud` `pnpm test` 375/375 (23
  files). Lane G's and lane C's numbers are exact. VERIFIED.
- **`returnTo` is genuinely locked to the origin.** I wrote my own throwaway suite against
  `sotto-cloud/src/auth/returnTo.ts` with 17 hostile vectors — `//evil`, `https://x`,
  `/\x`, `javascript:alert(1)`, `//evil.com/a`, `/\/evil.com`, `/%2f%2fevil`, `/%2F/evil`,
  `/%5cevil`, a leading TAB, a trailing LF, `http://x`, `sotto://x`, `''`, a 600-char path,
  `' //evil'`, `ab` — all return `null`; five real destinations round-trip unchanged;
  `returnUrl` degrades to `/account`. 3/3 passed, then the file was deleted (tree clean).
  Validating at both mint and verify time is the right call and it is actually implemented
  twice. VERIFIED.
- **No secret can reach a URL, a log line, or an error string.** `git log --stat
  01e1139..HEAD` plus a grep of the whole diff for added `console.*` turns up exactly one
  new log line in app code — `apps/client/app/account/index.tsx`'s
  `if (process.env.NODE_ENV !== 'production') console.warn('requestMagicLink failed', err)`
  — dev-only and carrying a fetch error, not the address. Every other addition is inside
  `apps/client/e2e/*.mjs` and `scripts/i18n-add.mjs`. `packages/voice/src/openai-direct/
  api.ts` only ever puts the setting in an `Authorization` header; `OpenAIHttpError`'s
  message is built from `HTTP <status>: <detail>` (`api.ts:143`), never from the request.
  In the live own-provider walk, the only off-origin request was
  `https://api.openai.com/v1/models` with no query string. VERIFIED.
- **The own-provider flow's states are truthful *within a session*.** Live at 375: hub row
  "Not connected" → guided flow → a rejected key gives the specific "That key wasn't
  accepted. Check it and try again." and the hub row reads "Key rejected" → an accepted key
  gives "Connected. Ready to try the tutor." (never the word "saved") → tapping Back
  in-app, same JS context, the hub row reads **Connected** with no remount. Lane E's P0
  claim is real. VERIFIED (`R2/375-byok-*.png`). *But see finding 1.*
- **Lane E did not touch storage or validation.** `git diff 01e1139..HEAD --
  apps/client/src/voice/byokKey.ts` is empty. `packages/voice/src/openai-direct/api.ts`
  did change (+17/−8) but that is lane F1's error-code work (`byok_invalid_key` →
  `provider_rejected_setting`, a `stage: 'speech'` 429 → `quota_exceeded`); the validation
  call itself (`GET /v1/models`) is untouched. VERIFIED.
- **Audio arbitration works in the browser, not just in the mock.** Started narration
  (transport clock 0:03), tapped "corbeau", pressed its speaker: the clock froze at 0:04
  across 1.6 s and the transport's accessibility label flipped to "Play". Lane D's claim
  reproduces independently. VERIFIED (`R2/375-reader-arbitration.png`).
- **Routes survive refresh and direct navigation.** `/settings` direct-load and reload both
  land on the real hub at 375 and 1440; `/reader/fr-fables-la-fontaine` survives a reload at
  **both** widths — lane B's flagged 1440 flake did not reproduce in three attempts, so its
  "test-harness artifact" reading was correct. `/library?filter=…` survives a reload and a
  cold direct link. Zero page or console errors across the walk. VERIFIED.
- **"Talk about this passage" lands correctly** on `/voice/fr-fables-la-fontaine?mode=discuss`
  with the passage rendered. VERIFIED.
- **i18n parity is real.** All nine catalogs hold an identical 436-key set. I sampled 20 of
  the run's new keys across `fr`, `es`, `zh-Hans`: zero English fallbacks in any of the
  eight non-English catalogs. VERIFIED. (Nit: `zh-Hans` renders "tutor" as 辅导 in
  `settings.tutorMode` but 导师 in `voice.muteSpeaker` — inconsistent, not wrong.)
- **The free-origin build is clean.** `cd apps/client && pnpm web:export` exits 0;
  `dist/index.html` is the new landing (203 KB, `<title>Sotto reads with you</title>`,
  "Start free" present). The exported bundle contains **zero** `'fake'` string comparisons —
  Metro constant-folded `EXPO_PUBLIC_CLOUD`/`EXPO_PUBLIC_VOICE` away, so no fake-adapter
  behaviour can be selected in a shipped build. (`FakeCloudAdapter`/`FakeVoiceProvider`
  *code* is still bundled as dead weight, which `e2e/boundary.mjs:172` already documents.)
  VERIFIED.
- **Landing hrefs and install detection.** All eight external/internal hrefs return 200
  live. Install detection: the generic block renders with JS off; the iOS/Android/desktop
  branches are real UA tests. Landing focus is visible on every CTA (`1px solid #221E1B`
  outline on all eight tab stops) and the page carries a `prefers-reduced-motion` media
  query with nothing animating under `reducedMotion: 'reduce'`. VERIFIED.
- **The $79/year figure lane A left unverified is correct**: `sotto-cloud/src/plans.ts:105`
  `yearlyPriceUsd: 79`, `:104` `priceUsd: 9.99`. VERIFIED — upgrade that row.
- **"No analytics on this page or in the app"**: grep for every common SDK
  (`googletagmanager|google-analytics|gtag(|plausible.io|posthog|mixpanel|analytics.js|sentry`)
  across `apps/` and `packages/` returns one hit, and it is `e2e/boundary.mjs`'s own guard
  regex. The landing has one inline `<script>` and no external one. VERIFIED — upgrade from
  lane A's INFERRED.
- **No forbidden git command lost work.** Two lanes admitted one each: lane A ran
  `git reset --soft HEAD~1` + `git reset` to unpick an accidentally-swept rename, and lane
  F1 ran `git stash push -u -- <3 paths>` + `git stash pop` to prove its test red. Checked:
  `git stash list` is empty; `08eb6dd` still exists as a dangling commit; the
  `profile.tsx → settings/index.tsx` rename landed intact in `a1b59c1` with the
  `/profile` redirect present; all 16 files in F1's `70a85ee` are present, including
  `packages/voice/src/mic-error.ts`. No lane admitted `git add -A`, `checkout`, `clean`,
  `rebase` or `merge`, and none shows in the history. VERIFIED — nothing was lost.

---

## 2. Findings

### F1 — DEFECT, P0. The "saved but the toggle is off" bug is not fixed; it survives a reload.

The complaint in Noel's recording 3 is *"it seems like it saved it okay. But then if it's
saved okay, this should be turned on right now. It's off."* Lane E fixed the same-session
case and declared the P0 closed. It is not closed for the path a learner actually takes.

Repro (`~/Claude/sotto-run7-recon/R2/e-byok3.mjs`, 375, live against `:8081`):

```
HUB before                  : Tutor voice | Not connected
HUB after connecting (in-app): Tutor voice | Connected      <- lane E's proof
HUB after a full page reload : Tutor voice | Not connected   <- the original bug
KEY SCREEN after that reload : "A key is stored on this device (sk-••••••••)." | Connected
localStorage keys           : ["sotto.byok.openaiKey"]
```

The key is still stored and the key screen still says Connected; the Settings hub says Not
connected. Two screens disagree again, which is exactly the symptom run 7 was commissioned
to remove. Cause: `apps/client/src/state/createStore.ts:439` defaults `ownProviderStatus` to
`'disconnected'` and the field is not in `KEYS` and not read by `hydrate()`
(`createStore.ts:57`, `:476-482`), so every reload, new tab, and Home Screen relaunch starts
it at disconnected while `sotto.byok.openaiKey` persists. The hub row reads it at
`apps/client/app/settings/index.tsx:250`. Screenshot:
`R2/375-byok-hub-after-reload.png`. VERIFIED.

Fix shape: derive the initial status from `hasByokKey()` during hydrate (or make the row
fall back to the stored key when status is `disconnected`).

### F2 — DEFECT, P0. Every tutor turn leaves a duplicated sentence in the transcript.

Two independent runs of `apps/client/e2e/audible-probe.mjs` (the stopped R process's and
mine) both end with a stray fragment rendered as a second TUTOR bubble under the complete
reply. Visible in `~/Claude/sotto-run7-recon/G/screens/state-99-final.png` (my run):

```
TUTOR  Oui, la Provence est en France. C'est une région dans le sud. C'est célèbre
       pour son soleil et ses villages charmants. As-tu envie de visiter la France un jour ?
TUTOR  C'est célèbre pour son soleil et ses villages charmants.        <- duplicate
```

`apps/client/src/state/createStore.ts:389-414` de-duplicates by dropping the **trailing**
run of same-speaker non-final captions when a `final` arrives; a non-final that arrives
*after* the final survives forever. Its own comment cites `ADVERSARIAL-REVIEW.md §1.9` —
this is a **regression of a bug a previous adversarial review already caught**, made visible
again because lane F2 replaced the transient caption strip with a persistent transcript, so
a stale fragment that used to flash and vanish is now a permanent bubble. Symptom VERIFIED
(2/2 runs); the exact ordering mechanism (server emits a per-sentence caption after the
merged final, `apps/server/src/voice/session.ts:458` vs `:531`, and/or a second tool-loop
pass) is INFERRED.

### F3 — DEFECT, P0. A denied microphone strands the voice screen on CONNECTING forever.

The kickoff's definition of done says "Unsupported or failed voice paths show specific
recovery, never a stuck indicator", and F1 built `mic_denied` for exactly this. It never
reaches the screen on the local path — the one path that actually runs on this Mac.

Repro (`R2/deny3.mjs`, 390×844, `getUserMedia` stubbed to reject with `NotAllowedError`):
`getUserMedia` is called once and rejects; the control cluster reads **CONNECTING** and is
still reading CONNECTING **45 seconds later**, with no recovery panel, no message, and no
way forward. `EVER LISTENING? false` — so the "listening only when capture is live" rule
does hold, but at the cost of a permanent lie in the other direction. Screenshot:
`R2/390-voice-mic-denied.png`. VERIFIED.

Mechanism (INFERRED): `packages/voice/src/local-cascade.ts:192-206` does emit
`{type:'error', code: mic_denied}` and `{type:'state', state:'error'}`, but the server
announces `listening` exactly once at session creation, and
`apps/client/src/voice/voiceStartGate.ts:56-70` downgrades that to `connecting` when capture
is not ready — so a late `listening` message overwrites the `error` state. The screen's
`isBroken` gate (`apps/client/app/voice/[bookId].tsx:144-147`) requires
`voiceState === 'error'`, so `RecoveryView` never renders even though `recoveryPanel.ts` has
a perfectly good `mic_denied` branch and nine passing unit tests for it. The unit tests are
true and the product is still broken — this is the clearest case in the run of tests proving
a module rather than a behaviour.

### F4 — DEFECT, P1. The phone library's filter chips blow up to 342 px after any filter.

At 375 the Library chip row is 36 px tall on first load and **342 px** — 42 % of the
viewport — after tapping any chip or opening `/library?filter=…` directly. At 1440 it stays
36 px (desktop uses the wrapping `View`, phone uses the horizontal `ScrollView` at
`apps/client/app/(tabs)/library.tsx:133-147`, whose `styles.chips` has no height cap). Only
reachable through lane B's new `?filter=` URL param (`library.tsx:40-43`), which is the
run-7 change. Measured:

```
375 direct filter=C1     pill height 342  (should be 36)
375 direct filter=fables pill height 342
1440 direct filter=C1    pill height  36
1440 direct filter=fables pill height 36
```

Screenshots: `R2/375-direct-C1.png`, `R2/375-library-chip-C1.png`, `R2/375-library.png`
(correct, unfiltered). VERIFIED. Lane B reports "confirmed live at both widths" for filter
persistence — the persistence is real, the layout it leaves behind was not looked at. The
stopped R process's `375-library-filter-fables.png` shows the same thing.

Also worth recording as a positive: the empty-filter banner lane B could not photograph
*does* work — `R/375-library-state-emptyfilter.png` shows "No books match this filter." +
Clear filters. That claim is stronger than lane B knew.

### F5 — OVERCLAIM. The landing never says the hosted tutor sends your voice to OpenAI.

The kickoff is explicit: *"'nothing is recorded' must say what the provider receives in
own-provider and plan modes."* The own-provider row does this well ("the page calls OpenAI
directly from your browser — the key stays on this device, and OpenAI bills you, not us").
The plan column says only "We don't store transcripts or recordings from tutor sessions —
only usage minutes and billing." That storage claim is **true** — `sotto-cloud/migrations/
001_init.sql:64-75` gives `voice_sessions` only durations, provider, model, cost and status
across all five migrations — but it is answering a different question. `sotto-cloud/src/
voice/providers.ts:17` and `openai-compat.ts` broker every hosted turn to
`api.openai.com`, and a reader of that column has no way to learn it. Half of an explicit
acceptance criterion is unmet. Lane A's claims table marks this row VERIFIED without noting
the missing half.

Smaller copy notes on the same page: the `<meta description>` calls Sotto "free" with no
qualifier while the plan is $9.99/mo (the body copy is honest, the search snippet is not);
and "The in-browser tutor … runs on on-device models, so nothing leaves this device" is
true for voice data but the model weights are still a download (served same-origin from
`/tutor/`, so no third party sees it — acceptable, but "nothing leaves" is a stronger word
than the code earns).

### F6 — DEFECT, P2. Install steps tell iOS Chrome and iOS Firefox users to use Safari.

`apps/client/web/landing/index.html`'s detection derives `isSafari` from
`/Safari\//.test(ua) && !/Chrome\//.test(ua)`. Chrome on iOS identifies as `CriOS/…
Safari/604.1` and Firefox on iOS as `FxiOS/… Safari/…` — neither contains `Chrome/`, so
both match `isIos && isSafari` and are told "In Safari, tap the Share icon." Desktop Edge
(`Edg/`) is excluded from `isChrome` and correctly falls through to the generic block,
which is fine. Lane A tested four UAs, none of them CriOS or FxiOS. VERIFIED by reading the
regex against the published UA strings; not driven with a CriOS UA.

### F7 — OVERCLAIM. G2's "audible probe: 7/7, first attempt" is not reproducible.

I ran `node apps/client/e2e/audible-probe.mjs` once, unmodified, against the same Metro:

```
{"started":73,"totalSamples":173511}
[PASS] learner turn rendered   [PASS] tutor reply rendered
[PASS] AudioBufferSourceNode.start() called   [PASS] samples scheduled
[FAIL] reply mentions Provence (mechanical substring check)
[FAIL] reply ends with a question (discuss-mode follow-up)
[PASS] no page/console errors
EXIT=1
```

The stopped R process's earlier run (`~/Claude/sotto-run7-recon/R/audible-probe-R-run1.log`)
failed the same two assertions. So the probe fails 2/7 on two of the three recorded runs,
and its exit code is 1 — it cannot be used as a gate in the state G2 left it.

**The underlying product claim is nevertheless true**, and I am recording it as such: the
tutor's merged reply in my run was *"Oui, la Provence est en France. C'est une région dans le
sud. C'est célèbre pour son soleil et ses villages charmants. As-tu envie de visiter la
France un jour ?"* — French, grounded in the passage, names Provence and France, ends with
one follow-up question, and 173 511 real PCM samples were scheduled through the Web Audio
graph. The Provence exchange from recording 3 **is** fixed. What is not true is that the
harness proves it deterministically: the two failing assertions read only the *last*
caption, and the last caption is the duplicate fragment from finding F2. Fixing F2 fixes the
probe. G2 should have flagged the flake rather than reporting a clean first attempt.

### F8 — GAP. The tutor screen still never reads `ownProviderStatus`.

Lane E exported `useOwnProviderStatus()` "for F2 to wire in"; lane F2's report says it is
F2's to do and did not do it; lane G wired four other F2 escalations but not this one.
`apps/client/app/voice/[bookId].tsx` contains no reference to it (grepped). So the kickoff's
"Connecting a usable setting yields one consistent state across Settings and the tutor" is
satisfied for Settings ↔ Tutor models, and not for Settings ↔ the tutor screen. Combined
with F1 it is worse than it reads: after a reload the store says disconnected and nothing
anywhere re-derives it.

### F9 — GAP. No opening invitation on the only path that runs.

`packages/core/src/prompt.ts` gained the "open with one short grounded sentence" rule and a
unit test that the rule is *present in the string*. An actual opening turn was implemented
only in `OpenAIDirectProvider.connect()` (lane G, directive 1c). On the local path — the
path this Mac can drive and the one the probe uses — the screen sits at "The conversation
will appear here." until the learner speaks (`R2/390-voice-active.png`). Lane G escalated
this honestly; recording it here so the definition-of-done row is not read as met. Same
shape: `apps/server/src/voice/session.ts:124` still sets `this.bookTitle = opts.bookId`, so
on the local path the tutor is told the book is called `fr-chevre-de-m-seguin`.

### F10 — GAP, needs Noel. Nothing lane C built is live, and lane A's landing links into it.

Live right now: `https://app.readsotto.app/content/packs` → `200 text/html` (the app shell,
the production bug lane C found and fixed); `https://app.readsotto.app/auth/config` → the
app shell, not `{"magicLink":true,…}`; the live bundle is
`entry-db96bcbccd6f…`, not this run's. Lane C is correct that only a Fly deploy changes
that. The sequencing risk is new, though: lane A's landing deploys to the free origin with
`pnpm deploy:web` alone, and its primary CTA is
`https://app.readsotto.app/account?intent=start`. Ship the landing without the Fly deploy
and "Start free" lands on the *old* account screen, which has no `intent=start` handling —
a worse first run than today's. **The two deploys have to go together, paid origin first.**

### Smaller items, recorded not ranked

- **Focus order / focus loss on the voice screen.** After tapping Start, focus is dropped
  rather than moved: my first Tab landed on "Hold to talk" (the bottom cluster), not on
  Close. Lane F2 reports the order as Close → Settings → Change passage → mode chips → …;
  that is DOM order, but it is not where focus resumes after the Start button is removed.
  Every new control does carry an accessible label and a ≥44 px target
  (Close, Settings, Change passage, Replay, Mute, Stop, "Mute tutor voice", End, Send) and
  every one shows a visible focus ring.
- **The four mode chips render as bare `DIV`s with no `role`** (confirmed by reading the
  live accessibility tree: `{"role":"DIV","label":"Read to me"}`). Lane F2 flagged it as
  pre-existing and declined to fix; it is still the case, on the run's flagship screen.
- **The passage card truncates mid-word with no ellipsis** ("M. Seguin n'avait jamais eu de
  chance") at 390.
- **`voice-live.mjs` writes into the repo.** Running it (as G2 did, as I did) leaves 12
  committed PNGs under `docs/screenshots/web/` modified in the working tree. An e2e script
  that dirties tracked files is a trap for the next lane that runs `git status` before
  committing — and this run already had one lane accidentally sweep another's staged rename.
- **Lane A's base64 screenshots** add ~181 KB of un-cacheable text to every landing load and
  cannot be cached separately from the HTML. A honestly flagged it; it is worth a follow-up
  because it is the landing page's whole weight budget.
- **`DELETE /account` with a confirm token is unreachable from the UI** (lane C found this,
  pre-existing). Still true.

---

## 3. Method notes

- Every lane's three strongest claims were re-checked, not sampled: A (privacy sentences,
  hrefs, install detection), B (route survival, four library states, filter persistence),
  C (returnTo, `/auth/config` gate, the `/content/packs` rewrite), D (popup scroll, save
  toast, arbitration), E (no-remount hub read, untouched storage/validation), F1/F2/G/G2
  (the unit suites, listening truthfulness, the surfaced speech failure, the not-spoken
  path, the audible probe).
- Claims I could not test and am not calling either way: anything on a real iPhone or a
  real Home Screen container; Apple sign-in end to end (correctly not registered); the
  `notSpoken` → Replay marker live (needs a real failing TTS call on the own-provider path,
  which needs a real stored setting — prohibited, and the unit test does drive the same
  call boundary); native/RN rendering; the level samples' linguistic quality in ro/ca/zh.
- Two serious attempts were made at each finding above before it was written down; the
  mic-denied case got three (6 s, 45 s, and an instrumented `getUserMedia` counter).
