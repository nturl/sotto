# Lane G — voice integration and the spoken-exchange proof: report

Card: `planning/run7/cards/G-voice-integration.md`. Commits: `48e4de8`
(`run7(G): wire F2's escalations, arbitrate tutor speech on lane D's audio
bus`), pushed to `origin/main`. A concurrent F1 process landed
`816c00e` (`run7(F1): live-voice e2e — tap Start, scrape the F2 transcript,
guard against the fake-provider bundle`) mid-lane, ahead of my own commit —
see "Cross-lane commit note" below.

## Directive 1: wire F2's four escalations

**(a) Speaker/output mute — DONE, live-verified.**
- `packages/voice/src/transports/audio-adapter.ts`: `AudioAdapter` gained
  optional `setOutputMuted?(muted: boolean): void`.
- `packages/voice/src/transports/web-audio.ts`: `WebAudioAdapter` routes
  every scheduled `AudioBufferSourceNode` through a lazily-created
  `GainNode` (`playbackGain`); `setOutputMuted` toggles its `gain.value`
  between 0 and 1. Capture is untouched — this only affects the playback
  graph. ✓ VERIFIED by `packages/voice/test/web-audio.test.ts` (2 new
  tests, a minimal fake `AudioContext`/`GainNode`) and live in the browser
  (screenshots below).
- `VoiceProvider.setOutputMuted?` added to the interface
  (`packages/voice/src/provider.ts`); implemented in `OpenAIDirectProvider`,
  `LocalCascadeProvider`, `BrowserCascadeProvider` — all three just forward
  to `this.audio.setOutputMuted?.(muted)`.
- `apps/client/src/voice/sessionManager.ts` exports `setOutputMuted`;
  `useVoiceSession.ts` exposes it; `ControlCluster.tsx` gained a speaker
  icon button (new prop `outputMuted`/`onToggleOutputMuted`) next to
  Stop; `app/voice/[bookId].tsx` holds screen-local `outputMuted` state and
  wires the toggle. New i18n keys `voice.muteSpeaker`/`voice.unmuteSpeaker`
  (9 locales, real translations, added via `i18n-add.mjs`).
- ✓ VERIFIED live: `~/Claude/sotto-run7-recon/G/screens/control-cluster-speaker-button.png`
  (ready state, speaker icon visible in the ring row) and
  `control-cluster-speaker-muted.png` (after a real tap on the button by
  its accessibility label "Mute tutor voice" — icon dims from `ink` to
  `ink3`, matching the ring's own muted-state convention).
- Unit tests: `sessionManager.test.ts` "sessionManager.setOutputMuted" (2
  cases) and `openai-direct.test.ts` "setOutputMuted delegates to the audio
  adapter".

**(b) `notSpoken` → Replay — DONE, unit-verified (can't be driven live: needs
a stored own-provider key, which this session must never have).**
- `apps/client/src/state/types.ts`: `CaptionEntry` gained `notSpoken?:
  boolean`. `createStore.ts`'s `pushCaption` needed no code change — it
  already spreads `entry` (`{ ...entry, id, createdAt }`), so the new field
  flows through untouched (card lists `createStore.ts` as owned "caption
  fields only"; the only actual "field" work was the type).
- `apps/client/src/voice/controller.ts`: `onCaption` callback and the
  `'caption'` case now carry `notSpoken`.
- `apps/client/src/voice/ui/Transcript.tsx`: a turn with `notSpoken` shows
  a small "Not spoken" label plus a Replay button (new optional prop
  `onReplaySentence`), calling back with that turn's own text.
- `VoiceProvider.replaySentence?(text)` added to the interface; implemented
  only in `OpenAIDirectProvider` (the only provider that ever emits
  `notSpoken` — grepped confirmed) — it directly re-runs `speak()` +
  `playPcm()` for the given text, independent of the turn/abort machinery,
  and does not re-emit a caption (the text is already in the transcript).
  `sessionManager.replaySentence` + `useVoiceSession.replaySentence` wire
  it through; `[bookId].tsx` passes `session.replaySentence` to
  `Transcript`.
- Unit tests: `openai-direct.test.ts` "replaySentence() re-synthesizes and
  plays the given text without a new caption"; `sessionManager.test.ts`
  "sessionManager.replaySentence" (2 cases).
- **Not live-verified**: reproducing a real `notSpoken` caption needs a TTS
  call to actually fail on the own-provider path, which needs a real
  stored OpenAI key — explicitly out of bounds ("No real stored setting is
  available to you and you must not paste one," COMMON.md). The unit test
  drives the exact same code path with a mocked `fetch`.

**(c) Automatic opening turn — DONE for the one path this lane fully owns
client-side; the other two need a change outside this lane's files.**
- `packages/voice/src/browser-cascade/llm-turn.ts`: `TutorTurnRunner.run`
  gained an optional `{ skipUserTurn?: boolean }` — when set, no
  `{role:'user', content: userText}` is pushed into history, so nothing
  reads back as "the learner said ''".
- `packages/voice/src/openai-direct/provider.ts`: `connect()` calls `void
  this.runTurn('', { skipUserTurn: true })` immediately after capture
  starts and the `listening` state is emitted. The prompt's own
  instruction (`packages/core/src/prompt.ts`'s `stableRules`, from F2's
  lane) already tells the model to open with one grounded invitation.
  ✓ VERIFIED by a new unit test ("connect() runs an automatic opening turn
  with no learner caption") asserting exactly one chat call, at least one
  tutor caption, zero learner captions, and non-zero `audio.played`.
- **Not done for `LocalCascadeProvider`/the cloud cascade or
  `BrowserCascadeProvider`'s worker**: those run the actual LLM turn
  server-side (`apps/server/src/voice/session.ts`) or inside a Web Worker
  (`browser-cascade/worker.ts`), neither of which this card's owned-files
  list covers (`apps/server` isn't listed; `worker.ts` is technically under
  `packages/voice/src/**` but the fix needs a new `MainToWorker` message +
  worker-side session-state handling, a materially larger change than the
  client-only `skipUserTurn` flag, and untestable live here anyway since
  the local path — see below — can't be driven live this session).
  **Escalating**: `apps/server/src/voice/session.ts`'s connection handler
  and `browser-cascade/worker.ts`'s session init should each run one
  `skipUserTurn`-shaped turn on connect, using the same prompt instruction.

**(d) `bookTitle` — DONE for the two owned call sites; the third isn't
owned here.**
- `packages/voice/src/provider.ts`: `SessionOptions` gained optional
  `bookTitle?: string`.
- `packages/voice/src/openai-direct/provider.ts` (line ~383) and
  `packages/voice/src/browser-cascade/provider.ts` (`initPayload`, line
  ~73): both now use `opts.bookTitle ?? opts.bookId` instead of the bare
  id.
- `apps/client/src/voice/sessionManager.ts`: `startSession`'s params and
  `beginSession`'s `SessionOptions` construction both carry `bookTitle`.
- `apps/client/src/voice/useVoiceSession.ts`: `beginSession` passes
  `bookTitle: book?.title` (the `book` binding was already in scope from
  `books[bookId]`).
- ✓ VERIFIED by a new unit test ("sends the real book title in the system
  instruction when present") asserting the built system instruction
  contains `Book: <real title>` and not `Book: <bookId>`.
- **Not fixed**: `apps/server/src/voice/session.ts:124`
  (`this.bookTitle = opts.bookId`) — this is the call site the **local**
  path (the one path verifiable without a stored key on this Mac) actually
  uses, and `apps/server/**` is not in this card's owned-files list.
  `SessionOptions.bookTitle` is already included in the JSON body
  `LocalCascadeProvider.connect` POSTs to `/voice/session` (it just spreads
  `opts`), so the fix on the server side is a one-line change once someone
  owns that file: read `opts.bookTitle ?? opts.bookId` instead of
  `opts.bookId`. **Escalating.**

## Directive 2: audio arbitration (lane D's `audioBus`)

D's doc comment on `audioBus.ts` suggested F1 call `claimAudio`/`releaseAudio`
directly from `packages/voice/src/openai-direct/provider.ts`'s
`speakSentence` — but `audioBus.ts` lives in `apps/client/src/platform`,
outside `@sotto/voice`'s dependency graph (a workspace package cannot import
from the app that consumes it). Wired it instead at
`apps/client/src/voice/sessionManager.ts`'s `onState` handler — the one
place that already sits between every provider (byok/local/browser/cloud)
and the store:

```ts
if (mapped === 'speaking') claimAudio('tutor', () => provider.interrupt());
else releaseAudio('tutor');
```

This covers **every** provider in one hook, not just the byok path the doc
comment named. `provider.interrupt()` is the existing barge-in method every
`VoiceProvider` implements, so a narration/word-audio claim genuinely
silences whatever the tutor is mid-sentence on. `teardownActive()` also
releases the bus unconditionally (a no-op if `'tutor'` wasn't the current
owner) so a session torn down mid-speech doesn't leave the bus stuck.

✓ VERIFIED by 3 new tests in `sessionManager.test.ts` ("sessionManager
audio-arbitration wiring"): claims on `speaking`, releases on any other
state, releases on `endSession()` even mid-speech, and a competing
`claimAudio('narration', ...)` call actually invokes the tutor's
`interrupt()` (using the `FakeVoiceProvider`'s exposed `.emit`/`.interrupt`
for direct state-transition control rather than depending on fixture
timing).

## Directive 3: repair the stale e2e scripts

`apps/client/e2e/voice-live.mjs` and `self-hosted-voice.mjs` didn't click
Start; a concurrent F1 process landed the fix first (commit `816c00e`,
`apps/client/e2e/voice-start.mjs` — shared `tapStart`/`readVoiceSnapshot`/
`installMicProbe`/`assertRealCapture` helpers) while I was independently
diagnosing the same root cause for my own probe rewrite. I verified both
repaired scripts run and their new `assertRealCapture` diagnostic works
correctly:

- `node apps/client/e2e/voice-live.mjs` — clicks Start, reaches `listening`,
  then **fails fast with the exact right diagnosis**: `"the session reached
  a live state but the page never called getUserMedia. The dev server at
  http://localhost:8081 is almost certainly running with
  EXPO_PUBLIC_VOICE=fake"`. That's correct — see "Cross-lane finding"
  below.
- `node apps/client/e2e/self-hosted-voice.mjs` — reaches the reader via a
  different self-hosted instance (`127.0.0.1:8792`, one of several
  `apps/server` copies running in this shared environment), but times out
  waiting for the Start button on `/voice/[bookId]` — a **different**,
  unexplored issue on that specific instance (possibly serving a stale
  client build without F2's redesign). Not chased further: diagnosing a
  third dev-server instance's specific state was outside this card's
  effort budget once the shared `:8081` Metro's blocker was already
  root-caused.

Both scripts are kept (not deleted) — they're correctly structured and will
pass once pointed at a dev server not started with `EXPO_PUBLIC_VOICE=fake`.

## Directive 4: the audible probe

`apps/client/e2e/audible-probe.mjs` — rewritten (this content also landed
in the F1 commit `816c00e` since the concurrent process committed the
shared working tree while my rewrite was already saved to disk; see
"Cross-lane commit note"). Per the card: drives the turn through the
**text fallback**, no microphone capture depended on.

- Book: grepped every pack for "Provence" first. `fr-daudet-les-etoiles`
  only has it in `book.json`'s `tutorNotes.culture`, which
  `packages/core/src/prompt.ts` never reads. `fr-chevre-de-m-seguin`'s
  actual first passage sentence has it verbatim: *"M. Seguin habitait dans
  une petite maison blanche, au bord d'un charmant village de Provence."*
  — used unmodified, so the card's exact learner text applies.
- Learner text: `"Qu'est-ce que c'est, la Provence ? Est-ce en France ?"`.
- The script still requests `getUserMedia` (via
  `--use-fake-device-for-media-stream`) because
  `LocalCascadeProvider.connect` always starts capture regardless of input
  mode — but nothing in the script depends on that device producing real
  frames, sidestepping F1's diagnosed capture/fake-device interaction
  entirely.
- Same `AudioContext` probe as F1's original (wraps
  `createBufferSource().start()`, counts `started`/`totalSamples`).

**Run 1 — against the shared `:8081` dev server (the one COMMON.md says to
use):**

```
[t+2.1s] state -> listening
[t+2.1s] caption: Tutor: Que penses-tu du personnage principal ?
[t+2.1s] Sending learner turn via text fallback: "Qu'est-ce que c'est, la Provence ? Est-ce en France ?"
[t+2.7s] caption: You: Qu'est-ce que c'est, la Provence ? Est-ce en France ?
[t+2.7s] caption: Tutor: D'accord, je l'ai enregistré.

===== Audio probe =====
  {"started":0,"totalSamples":0}

===== Assertions =====
  [PASS] learner turn ("...Provence...") rendered in the transcript
  [PASS] a tutor reply rendered in the transcript
  [FAIL] AudioBufferSourceNode.start() was called at least once
  [FAIL] at least one sample was actually scheduled
  [FAIL] reply mentions Provence (mechanical substring check)
  [FAIL] reply ends with a question (discuss-mode follow-up)
  [PASS] no page/console errors
```

**Root cause, definitively identified (not inferred): the shared `:8081`
Metro dev server's process environment has `EXPO_PUBLIC_VOICE=fake` baked
in.**

```
$ lsof -iTCP:8081 -sTCP:LISTEN -n -P   # -> PID 50927
$ ps eww -p 50927 | tr ' ' '\n' | grep EXPO_PUBLIC_VOICE
EXPO_PUBLIC_VOICE=fake
```

That single fact explains every symptom: the immediate scripted opening
line ("Que penses-tu du personnage principal ?") and the reply
("D'accord, je l'ai enregistré.") are **verbatim, in sequence, with the
exact scripted delays** from `packages/voice/fixtures/discuss.json` — the
`FakeVoiceProvider`'s canned script, not the real local cascade. Expo
inlines `EXPO_PUBLIC_*` at bundle build time, so this is baked into every
page this server serves; no runtime override exists in the compiled
bundle (`pickProvider`'s `if (process.env.EXPO_PUBLIC_VOICE === 'fake')`
branch is a literal-string comparison the bundler already resolved at
transform time — there's nothing left in the shipped JS for a page script
to flip).

The concurrent F1 commit (`816c00e`) reached the identical diagnosis
independently and documented it in `docs/voice-pipeline.md`'s "Known
issues" (their note additionally claims a clean, non-fake dev server
completes a full local-cascade turn end to end — i.e. the underlying
pipeline is fine; only this shared instance is misconfigured).

**Two attempts made, per the card's own rule, before stopping:**
1. Ran the probe against `:8081` as specified by COMMON.md — diagnosed the
   `EXPO_PUBLIC_VOICE=fake` root cause via direct process inspection
   (`ps`), not guesswork.
2. Looked for an already-running alternative that didn't require starting
   new infrastructure: two `serve` processes already running against
   `apps/client/dist` (ports 8091/8092, built by another lane ~19:09,
   `EXPO_PUBLIC_VOICE` not in their env). Pointed the probe at `:8091` —
   `/voice/fr-chevre-de-m-seguin` rendered the **landing page** instead
   (this static export's root/auth-gating shape differs from the dev
   server's; diagnosing it further is lane A/C territory, not this card's).

**Did not attempt**: restarting or starting a second Metro. COMMON.md is
explicit — *"Dev servers already run from the orchestrator... Do NOT start
another Metro. If 8081 is down, write it in your report and stop."* — and
this is the same class of shared, six-lane-wide resource; restarting it
mid-run risks every other lane's in-flight work. This is exactly the
card's own escalation clause: *"the local path cannot produce audio on
this Mac (name the missing piece)"* — the missing piece is not a model or
a service (`/health` was genuinely healthy throughout: `{"ok":true,
"stt":true,"llm":true,"tts":true,"vad":"energy"}`), it's that the one dev
server this session is allowed to use is bundled for the wrong provider.

**Falling back to the unit-level proof, per the card's own precedent**
(F1's card allowed exactly this alternative for the analogous situation):
`packages/voice/test/openai-direct.test.ts`'s "runs one full turn" test
(pre-existing, still green) and the new "connect() runs an automatic
opening turn" test both assert `audio.played.length > 0` with real byte
lengths and the hardcoded 24 kHz sample rate, exercising the identical
`speak() → AudioAdapter.playPcm()` call boundary the live probe would have
measured — the same class of evidence, at one layer below the browser.

**If Metro is restarted without `EXPO_PUBLIC_VOICE`** (an env change, not a
code change — nothing in this lane's commit needs to move), re-running
`node apps/client/e2e/audible-probe.mjs` against `:8081` should produce a
real transcript and a non-zero audio probe; the script itself needs no
further changes for that to happen.

## Directive 5: full suite

- `pnpm --filter @sotto/client test` — **274/274 pass**, 34 files
  (previously-reported pre-existing failures in `destination.test.ts` and
  `levelSamples.test.ts` are now green too — other lanes landed since).
- `pnpm vitest run packages/voice/test` — **136/136 pass**, 12 files (2 new
  suites this lane added: `web-audio.test.ts`, plus 5 new cases in
  `openai-direct.test.ts`).
- `pnpm --filter @sotto/core test` — **52/52 pass**.
- `pnpm -r typecheck` — clean across all 5 typechecked packages.
- `pnpm lint` — **0 errors**, 23 pre-existing warnings, none in any file
  this lane touched (added `apps/client/e2e/.cache/**` to eslint's
  `ignores` — a gitignored scratch dir with a leftover diagnostic script
  from F1's own investigation was tripping `no-undef`; also added
  `window` to the e2e `.mjs` globals list, needed by `voice-start.mjs`'s
  browser-context closures).
- `pnpm exec prettier --check` on every file this lane touched — clean.
- `pnpm content:validate` — 0 errors, 223 pre-existing warnings, all in
  `packages/content/packs/**` (untouched by this lane, the regeneration
  job's own output).
- i18n parity: verified all 9 catalogs have an identical 436-key set
  (Python script diffing key sets); the 3 new keys
  (`voice.notSpoken`/`muteSpeaker`/`unmuteSpeaker`) have real, distinct
  translations in every non-English locale, not English fallbacks.

## Cross-lane commit note

A concurrent F1 process landed commit `816c00e` mid-lane, touching
`apps/client/e2e/{voice-live,self-hosted-voice,audible-probe,voice-start}.mjs`
and `docs/voice-pipeline.md` — files this card also names as owned. By the
time that commit ran (`git log` timestamp 19:16:00), my own rewrite of
`audible-probe.mjs` was already saved to disk, so its content (the
`fr-chevre-de-m-seguin`/Provence/text-fallback version described above) is
what's in that commit, not a second, competing version — verified by
reading the committed file (`BOOK_ID`, `LEARNER_TEXT`, `getByRole
('textbox')` all present). Flagging this the same way F2's report flagged
its i18n keys landing in lane E's commit: **the final run-7 history
attributes this lane's e2e-script rewrite to `run7(F1)`, not to a lane G
commit** — nothing was lost, just misattributed by a shared-tree race.

## Screenshots (`~/Claude/sotto-run7-recon/G/screens/`)

- `control-cluster-speaker-button.png` — ready state, speaker toggle
  visible in the ring row, passage card showing "Provence" in the actual
  book text.
- `control-cluster-speaker-muted.png` — after tapping the speaker button;
  icon dims (`ink` → `ink3`), aria-label flips to "Unmute tutor voice".
- `state-00-pre-start.png` … `state-99-final.png` — the audible-probe run's
  state-by-state captures (fake-provider content, but confirms the F2 UI
  renders the speaker button, transcript, and text fallback correctly
  throughout).

## Tests run (full list)

- `pnpm --filter @sotto/client test` — 274/274.
- `pnpm vitest run packages/voice/test` — 136/136.
- `pnpm --filter @sotto/core test` — 52/52.
- `pnpm -r typecheck` — clean.
- `pnpm lint` — 0 errors.
- `pnpm exec prettier --check` — clean on all touched files.
- `pnpm content:validate` — 0 errors.
- `node apps/client/e2e/audible-probe.mjs` (against `:8081`) — ran to
  completion, 3/7 assertions pass (transcript rendering, no page errors),
  4/7 fail (all traceable to the `EXPO_PUBLIC_VOICE=fake` root cause
  above, not to any change in this commit).
- `node apps/client/e2e/voice-live.mjs` — runs, fails fast with the correct
  `EXPO_PUBLIC_VOICE=fake` diagnosis (confirms F1's `assertRealCapture` fix
  works as designed).
- `node apps/client/e2e/self-hosted-voice.mjs` — runs, times out on a
  different, unexplored issue on a specific self-hosted instance
  (`127.0.0.1:8792`); not chased further (see directive 3).

## What is NOT verified

- The live spoken-exchange proof itself (directive 4's primary ask) — see
  above. The probe script is correct and will pass once the shared Metro
  is restarted without `EXPO_PUBLIC_VOICE=fake`; this session cannot do
  that restart itself (COMMON.md).
- The `notSpoken`/Replay path live (needs a stored own-provider key —
  prohibited).
- The automatic opening turn on the local/cloud/browser paths (needs
  `apps/server`/worker changes outside this lane's ownership).
- `bookTitle` on the local/cloud path (same `apps/server` ownership gap).
- `self-hosted-voice.mjs`'s specific timeout on `127.0.0.1:8792` — flagged,
  not diagnosed further.

## Escalations

1. `apps/server/src/voice/session.ts:124` needs `opts.bookTitle ??
   opts.bookId` instead of `opts.bookId` — the local/cloud path's
   `SessionOptions` already carries the real title (this lane's fix), the
   server just doesn't read it yet. Not owned by this card.
2. `apps/server/src/voice/session.ts`'s connect handling and
   `packages/voice/src/browser-cascade/worker.ts`'s session init each need
   an automatic-opening-turn equivalent to `OpenAIDirectProvider`'s
   `skipUserTurn` fix, for the local/cloud and browser paths respectively.
3. The shared `:8081` dev server needs restarting without
   `EXPO_PUBLIC_VOICE=fake` for `audible-probe.mjs`/`voice-live.mjs` to
   actually pass — an environment fix, not a code change, and outside this
   session's permission to make (COMMON.md: "Do NOT start another Metro").
4. `self-hosted-voice.mjs` times out against `127.0.0.1:8792` specifically
   (times out waiting for "Start") — a separate, unexplored issue on that
   instance.

## Stop

Committed (`48e4de8`, path-scoped — `packages/content/packs/**` excluded),
pushed to `origin/main`. This report written. Stopping per the card's Stop
condition.
