# Lane D — the mic stays usable and the state label tells the truth

Worktree `~/Claude/sotto-run9/wt/D`, branch `run9/D`. Evidence, throwaway scripts
and screenshots: `~/Claude/sotto-run9/D/`.

## 1. The hidden-mic claim is REFUTED

PLAN.md diagnosis 4 says "the screen hides the mic while speaking", marked
INFERRED from Noel's screenshot. It does not.

**From the code (VERIFIED, read and traced).** `app/voice/[bookId].tsx` renders
`<ControlCluster>` whenever `session.startControl === 'active'`, and
`startControlState()` (`src/voice/voiceStartGate.ts`) returns `'active'` for
every value of `availability.status` once a session has been started. Inside
`ControlCluster` the mic ring is rendered unconditionally — `voiceState` only
feeds `ringColor()` and the state label, never a mount condition. There is no
branch anywhere on the path that removes the control for `speaking`.

The control *is* replaced — deliberately, by `RecoveryView` — when `isBroken`
(`voiceState === 'error' | 'reconnecting'`, or a `limitReason`). That is the
error case the card exempts, and it also takes `TextFallback` with it.

**From screenshots (VERIFIED).** Real cascade sessions (local stack, fake mic),
`speaking` and `listening` captured live off the DOM state label:

| | before (main tree, unchanged code) | after (this worktree's export on :8094) |
|---|---|---|
| 1440×900 | `shots/before-1440-{speaking,listening}.png` | `shots/after-1440-{speaking,listening}.png` |
| 375×812 | `shots/before-375-{speaking,listening}.png` | `shots/after-375-{speaking,listening}.png` |

The mic ring, the Hold-to-talk/Open-mic toggle, Replay/Stop/Speaker and the text
fallback are all on screen in `SPEAKING` at both widths, before and after.

I also squeezed the viewport to 1440×600 (`shots/before-short-1440-speaking.png`)
looking for an overflow that pushes the cluster below the fold. It does not
happen: the transcript is the flexible child, so at that height the *transcript*
collapses to nothing and the cluster stays put. If anything, that is a separate
(unreported) layout weakness — captions vanish on a short window.

**What I could not reproduce is what Noel saw.** Two possibilities I cannot
distinguish without his original PNG: the session was actually in `error` /
`reconnecting` (RecoveryView, no mic, but the label would not read SPEAKING), or
the screenshot was cropped. INFERRED. Asking Noel for the untrimmed screenshot
would settle it.

**What was actually wrong with the control** (and is now fixed) is what pressing
it *did* mid-utterance: it only started capture. The tutor kept playing, so the
learner talked over it and the cascade heard its own output back through the
speakers.

## 2. What changed

`070c81f` — pure decisions, controller, provider, i18n
`6dab58f` — the screen and its three UI components

| File | Change |
|---|---|
| `apps/client/src/voice/micPress.ts` (+`.test.ts`, new) | `micPressAction(voiceState)`: barge-in first when the tutor holds the floor (`speaking`/`thinking`); no-op in `error`/`ended`. |
| `apps/client/src/voice/playbackHold.ts` (+`.test.ts`, new) | `createPlaybackTracker()` (queue-drain arithmetic mirroring `WebAudioAdapter`'s private `playbackQueueEndAt`) and `holdSpeaking(next, remainingMs)`. |
| `apps/client/src/voice/captionCorrection.ts` (+`.test.ts`, new) | `correctableCaptionId(captions, path)`: the newest *final* learner caption, on `browser`/`local` only. |
| `apps/client/src/voice/didNotCatch.ts` (+`.test.ts`, new) | `DID_NOT_CATCH_CAPTION` + `isDidNotCatchCaption()` (apostrophe/whitespace tolerant). |
| `apps/client/src/voice/controller.ts` (+ tests) | Every provider `state` event goes through a `publish()` that applies `holdSpeaking` against `provider.playbackRemainingMs?.()`, re-arming until the queue drains, with an epoch guard so a newer state (an error, a barge-in) always beats a pending flush. New optional 4th arg `{ clock }` for tests. |
| `packages/voice/src/browser-cascade/provider.ts` | Tracks `playbackQueueEndAt` from the PCM it forwards to the audio adapter; resets it on `interrupt()` and on a cancelled `audio_end`; exposes `playbackRemainingMs()`. |
| `apps/client/app/voice/[bookId].tsx` | Mic press runs `micPressAction` and calls `session.interrupt()` before capture; wires `correctableCaptionId` → `Transcript` → `TextFallback` prefill (nonce-keyed). |
| `apps/client/src/voice/ui/ControlCluster.tsx` | Space-held push-to-talk on web (ignores keys aimed at inputs/textareas/buttons/contenteditable, ignores auto-repeat, releases on unmount); `accessibilityHint` on the ring. |
| `apps/client/src/voice/ui/Transcript.tsx` | "Not what you said? Type it" under the correctable caption; lane A's fixed English gate caption renders as `voice.didNotCatch`. |
| `apps/client/src/voice/ui/TextFallback.tsx` | `prefill={{ text, nonce }}` sets the value and focuses the field. |
| the nine `src/i18n/*.json` | `voice.didNotCatch`, `voice.correctCaption`, `voice.holdToTalkHint` — added with `apps/client/scripts/i18n-add.mjs`, real translations for ca/es/fr/it/pt/ro/zh-Hans/zh-Hant. |

### Why `provider.ts` and not the client (card asks me to say which)

The `speaking`-until-drained decision could not be done entirely client-side
**within my lane's file list**. The client's only playback signal would come from
`sessionManager.ts`, which builds the `AudioAdapter` (`wrapAudioForGating`) — and
that file is read-only for me this run. The `VoiceEvent` stream the controller
sees carries no `audio_start`/`audio_end`; those are worker→provider messages.

So: the pure decision and the wiring live in files I own
(`playbackHold.ts`, `controller.ts`), and `provider.ts` gained one additive,
optional method (`playbackRemainingMs()`) plus the bookkeeping behind it. The
controller declares that method structurally rather than adding it to the shared
`VoiceProvider` interface, so no other provider or lane is touched, and a
provider without it behaves exactly as before (tested).

Consequence, stated plainly: **the hold only applies to the browser cascade.**
`LocalCascadeProvider` has the same defect (see the baseline timeline below) and
still has it. Fixing that one needs `packages/voice/src/local-cascade.ts` — see
"Requested outside my lane".

## 3. Tests

Failing first, then implemented. Four new test files failed to resolve their
modules on the first run (`Test Files 4 failed | 39 passed`, `Tests 386 passed`)
before the modules existed.

```
$ pnpm --filter @sotto/client test
 Test Files  43 passed (43)
      Tests  414 passed (414)

$ pnpm test          # whole workspace
 Test Files  94 passed (94)
      Tests  831 passed (831)

$ pnpm -r typecheck
packages/core ✓  packages/content ✓  packages/voice ✓  apps/server ✓  apps/client ✓

$ pnpm exec prettier --check <my files>
All matched files use Prettier code style!
```

`pnpm lint`: 6 errors, all pre-existing and all in
`planning/design/launch-cards/shots2x.mjs` (`process`/`console`/`indexedDB`
undefined) — a file I did not touch. No error and no new warning in any file of
mine. VERIFIED by reading the eslint output file-by-file.

`packages/voice` has **no `test` script** in its `package.json`, so
`pnpm --filter @sotto/voice test` fails outright today; the root `pnpm test`
picks its tests up. Flagging it because COMMON.md tells every lane to run it.

## 4. e2e

`apps/client/e2e/voice-live.mjs`, against the real local stack (whisper :9001,
llama :8080, Kokoro :8880 through apps/server :8790):

- **Before any change**, against the main-tree Metro on :8081 — 6/6 PASS
  (`~/Claude/sotto-run9/D/voice-live-before.log`).
- **After**, against this worktree's static export on :8094 — 6/6 PASS
  (`~/Claude/sotto-run9/D/voice-live-after-8094.log`). Selectors and
  `readVoiceSnapshot`'s line pairing are unaffected by the new affordance.

Re-running it against :8081 afterwards would have tested the *main tree's*
unchanged code, so I ran it against my own build instead — a stricter check.

The before log is also the evidence for PLAN.md diagnosis 4's real half:

```
[t+18.1s] state: speaking
[t+22.9s] caption: Tutor: En inglés, se llama "cicada".
[t+23.7s] caption: Tutor: La cigarra es un insecto que canta en verano.
[t+25.3s] state: listening        <- generation ended; audio still playing
```

Extra probe, `~/Claude/sotto-run9/D/kbd-bargein.mjs`, against the export on :8094:

```
{"before":"rgba(0, 0, 0, 0)","held":"rgb(228, 87, 46)","released":"rgba(0, 0, 0, 0)"}
SPACE HOLD: PASS
SPACE IN TEXT FIELD IGNORED: PASS
BARGE-IN: state during press = listening PASS
```

(`shots/kbd-space-held.png` is the ring lit by the space bar.)

### How the :8094 export was driven

`pnpm web:export` in this worktree, then a scratch server
(`~/Claude/sotto-run9/D/serve-8094.mjs`) that serves `dist` exactly as
`scripts/serve-static.mjs` does but proxies `/health`, `/voice/session` and
`/voice/ws` to :8790. That gives a real cascade turn on my own build without the
1.2 GB browser-tutor model download (the cached Chromium profiles under
`e2e/.cache` are bound to `localhost:8091`, lane A's port, so they are not
reusable at 8094). No repo file was changed to do this.

## 5. NOT verified

- **The `speaking` hold has never run against a live browser cascade.** Its pure
  logic has 12 passing tests and the provider bookkeeping was read and traced,
  but every live session I ran used `LocalCascadeProvider`, which does not
  implement `playbackRemainingMs()` — so on those runs the hold was inert by
  design. INFERRED for the real path. Lane E's `discuss-quality.mjs` (browser
  cascade, port 8095) is the place to confirm it.
- **`DID_NOT_CATCH_CAPTION` is not yet a shared constant.** I copied the text
  from `planning/run9/cards/A-stt-hygiene.md`:
  `"I didn't catch that. Could you say it again?"`. If lane A's gate module ships
  a different string (or a different apostrophe — I normalise `’` to `'`, nothing
  else), the caption renders untranslated rather than wrong. **Integration check
  for the orchestrator: diff lane A's constant against
  `apps/client/src/voice/didNotCatch.ts`.**
- **Native (iOS/Android).** The space-bar handler is `Platform.OS === 'web'`
  only; hold-to-talk on native is unchanged `Pressable` touch. Not run on a
  device this session.
- **Own-provider mode.** `correctableCaptionId` returns null for `byok` and
  `cloud` by design (card directive 2), but I did not run either path to check
  they already show "something equivalent" — I could not find one in the code, so
  those paths simply have no correction affordance. INFERRED.
- **Noel's original screenshot** — see §1.

## 6. Requested outside my lane

1. **`packages/voice/src/local-cascade.ts`** — the same `speaking`-until-drained
   fix, so the local (and cloud-cascade) path stops lying too. Exactly the diff
   already in `browser-cascade/provider.ts`: a `playbackQueueEndAt` field updated
   wherever binary audio frames are handed to `this.audio.playPcm`, zeroed in
   `interrupt()` and on a cancelled utterance, plus

   ```ts
   playbackRemainingMs(): number {
     return Math.max(0, this.playbackQueueEndAt - Date.now());
   }
   ```

   `controller.ts` already reads it structurally, so nothing else changes.

2. **`packages/voice/package.json`** — add `"test": "vitest run"` to `scripts`, so
   COMMON.md's `pnpm --filter @sotto/voice test` actually runs.

3. **`planning/design/launch-cards/shots2x.mjs`** — 6 pre-existing eslint
   `no-undef` errors keep `pnpm lint` (and therefore `pnpm check`) red for every
   lane. Either an `/* eslint-env node, browser */` header or an eslint override
   for `planning/**/*.mjs`.

## 7. For Noel

- The untrimmed screenshot of the run-9 session would settle §1. As shipped, the
  mic ring is on screen in `SPEAKING` at 375 and 1440.
- New on the voice screen: hold the **space bar** to talk (web), and pressing the
  mic while the tutor is talking now cuts it off instead of talking over it.
- A misheard learner line (the "you" in your report) now carries
  **"Not what you said? Type it"** — it drops the transcript into the text box,
  focused, for you to fix and send.
