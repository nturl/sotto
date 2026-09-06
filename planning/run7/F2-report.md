# Lane F2 — voice screen: report

Card: `planning/run7/cards/F2-voice-screen.md`. Scope: redesign
`app/voice/[bookId].tsx` into a conversation screen, tune the tutor prompt.

## Step 0 — the `pttDisabled`/"listening" contradiction

**Reproduced/ruled out: the header state and the mic-ring caption never
literally co-occurred.** Both read the identical `session.voiceState`
field (scout-T-tutor.md §3), so a genuine simultaneous
"listening" + "Enable push-to-talk..." was already suspected impossible
under the code as read; this instruments it live to confirm rather than
infer.

Method: `~/Claude/sotto-run7-recon/F2/step0-repro.mjs` — Playwright,
Chromium with a fake silent mic, real local voice path (no key needed),
French book `fr-daudet-les-etoiles`, `turnDetection: 'auto'`. Navigated to
`/voice/fr-daudet-les-etoiles`, tapped Start, sampled the header state text
and the `voice.pttDisabled` caption every 200ms for ~3s before and ~4s
after clicking the Mute button. Full table logged to stdout (`console.table`);
reproduced here:

| t (s) | header state | pttDisabled caption |
|---|---|---|
| 2.83–5.67 (pre-mute, 15 samples) | `connecting` → `listening` (briefly `speaking` once) | *(empty)* |
| 5.93–9.80 (post-mute, 20 samples) | `muted` | `Enable push-to-talk in settings to speak` |

**Verdict: no sample ever showed `listening` and the caption together.**
The transition from `listening` to `muted` (and the caption appearing) was
atomic at the 200ms sampling granularity — confirms explanation (a)/(b)
from the recon: the recording's "listening" moment was the pre-mute state,
and the mute (or a stale render a frame wide) happened at most 200ms later,
not simultaneously. Not proof that a one-frame race is *impossible*, only
that it doesn't reproduce here; treated as ruled-out for practical
purposes.

**Fix regardless of the verdict, per the card:** the dead-end caption is
gone. It's replaced by an in-place segmented control ("Hold to talk" /
"Open mic", `ControlCluster.tsx`) that writes `preferences.turnDetection`
via the store's existing `setPreferences` — no navigation away from the
screen, and nothing can render "Enable X in settings" with no X to press
anymore, because there is no settings-only path left for this control.

## What changed

- `apps/client/app/voice/[bookId].tsx` — rewritten. Passage card at top
  (title + "Change passage" back to `/reader/[bookId]`), a scrollable
  `Transcript` in the middle, one bottom `ControlCluster`, a `TextFallback`
  field, and `RecoveryView` for every broken state. Header shrank to a
  Close button and a quiet Settings icon (directive 7) — the old corner
  status dot is gone; state now shows once, in the control cluster, next to
  the control that actually changes it.
- `apps/client/src/voice/useVoiceSession.ts` — added `retry` and
  `resumePlayback`, thin wrappers over the two new `sessionManager` exports
  F1 published mid-lane (see "F1 interfaces used" below). No other change.
- `packages/core/src/prompt.ts` (+ `prompt.test.ts`) — directive 6:
  - Spoken turns capped at two sentences (except verbatim `read_to_me`
    reading).
  - Correction made proportionate: at most one thing per turn, "most turns
    have no correction at all," no numeric/percentage score (folds the old
    pronunciation-only correction rule into a general one).
  - Passage-only facts: "only state facts that are in it... say so plainly
    rather than inventing detail."
  - `discuss` mode: exactly one follow-up question per turn, never more
    than one, stated explicitly rather than left as "ask one at a time."
  - Opening invitation: a new stableRules paragraph telling the tutor to
    open the session with exactly one short grounded sentence before the
    learner has spoken, no generic "hello."
  - Test budget raised 3800 → 4600 chars for the added rules (comment
    updated); 6 new tests added for all of the above plus a
    real-book-title-rendering check. All 17 tests in the file pass.
  - **`bookTitle` id-vs-title bug (scout-T-tutor.md §4): NOT fixed.** Every
    call site that passes a value into `bookTitle` lives outside this
    lane's owned files (`packages/voice/src/openai-direct/provider.ts:366`,
    `browser-cascade/provider.ts:73`, `apps/server/src/voice/session.ts:124`
    all pass the book **id**). `useVoiceSession.ts` (owned) doesn't build
    `SessionOptions` itself — it calls `sessionManager.startSession(...)`
    (F1's, not owned) with no `bookTitle` field in that params type at all
    (`packages/voice/src/provider.ts`'s `SessionOptions` has no such field
    either). **Escalating**: `SessionOptions` needs a `bookTitle?: string`
    field; `sessionManager.startSession`'s params need the same, threaded
    into the `SessionOptions` it builds; the three provider call sites above
    swap `this.opts.bookId`/`opts.bookId` for it. `useVoiceSession.ts` can
    supply the real value immediately once that lands — it already has
    `books[bookId]?.title` in scope.
- New files, all under `apps/client/src/voice/ui/` (none existed before):
  - `recoveryPanel.ts` (+ `.test.ts`, 9 tests) — pure `code`/`limitReason`
    → `{messageKey, hintKey?, buttons}` mapping for directive 5's recovery
    panels. Unknown/future codes fall through to the existing generic
    "connection lost" panel (the "leave a switch" the card asks for).
  - `ControlCluster.tsx` — mic ring (ready/connecting/listening/thinking/
    speaking/muted colors), the turn-detection segmented toggle +
    instruction line, Replay/Stop/End.
  - `PassageCard.tsx`, `Transcript.tsx`, `TextFallback.tsx`,
    `RecoveryView.tsx` — presentational, described above.
- i18n: 18 new keys × 9 locales added via
  `node apps/client/scripts/i18n-add.mjs` with real (non-English-fallback)
  translations for ca/es/fr/it/pt/ro/zh-Hans/zh-Hant — listed under "i18n"
  below. **These landed inside lane E's commit `a1b59c1`**, not a commit of
  mine: E's commit swept the shared `apps/client/src/i18n/*.json` files
  (which by design every lane writes atomically via the same script) after
  my `i18n-add.mjs` run had already updated the working tree, so `git
  status` shows no diff left for me to commit separately. Verified all 18
  keys are present in `git show a1b59c1:apps/client/src/i18n/fr.json` (and
  `en.json`) — nothing was lost, it's just attributed to the wrong commit.
  Flagging so the final run-7 history doesn't read as "F2 added no i18n."

## F1 interfaces used (published mid-lane, `planning/run7/F1-report.md`)

Read F1-report.md once it appeared (it did not exist at lane start; the
error-code table and the new session API showed up in the shared working
tree partway through this lane's work, then were published as the report).
Wired directly rather than working around them:

- `sessionManager.retry()` — used for every recovery panel's "Try again"
  (`RecoveryView`'s `tryAgain` button → `session.retry`). Re-enters the
  same book/chapter/mode without clearing the transcript.
- `sessionManager.resumePlayback()` — used for the `playback_blocked`
  panel's "Tap to hear the tutor" button.
- New error codes `mic_denied`, `no_input_device`, `playback_blocked`,
  `provider_rejected_setting`, `quota_exceeded`, `byok_rate_limited` — all
  given their own branch in `recoveryPanel.ts` per directive 5's list
  (mic denied / no device / connection lost / provider rejected the
  setting / quota / blocked playback). `plan_required` unchanged.
- `notSpoken?: boolean` on the caption `VoiceEvent` — **not wired into the
  transcript's "not spoken" + Replay marker.** The field exists on
  `packages/voice`'s `VoiceEvent` but is not threaded through
  `apps/client/src/state/types.ts`'s `CaptionEntry` or `createStore.ts`'s
  `pushCaption` (neither owned by this lane, and no other lane's report
  claims it either as of this writing). **Escalating**: add
  `notSpoken?: boolean` to `CaptionEntry` (`state/types.ts`), and in
  whatever `sessionManager.ts` code turns a `caption` `VoiceEvent` into a
  `pushCaption(...)` call, pass the field through. Once that lands,
  `Transcript.tsx` needs one small addition (render a "not spoken" label +
  a Replay button next to that turn, calling `session.replayLast`) — noted
  in the component's doc comment so whoever adds the store field can find
  the exact spot.

## Not shipped (escalations)

1. **Speaker (tutor output) mute** — directive 2 lists it in the control
   cluster. No interface exists to mute tutor TTS playback specifically
   (Mute only mutes capture; Stop is barge-in, not a standing mute).
   Omitted rather than shipped as a button that visually toggles but does
   nothing — that would recreate the exact "nothing to press" complaint
   this screen exists to fix. **Exact interface needed**: a
   `setOutputMuted(muted: boolean)` on `VoiceProvider`
   (`packages/voice/src/provider.ts`) implemented via the same pattern
   already used for capture (`web-audio.ts`'s capture `sinkNode.gain.value
   = 0`) applied to `playbackContext`'s own gain node, plus a
   `sessionManager.setOutputMuted` export. Once that exists, wiring it into
   `ControlCluster` is a small, isolated addition.
2. **Automatic opening turn** — the prompt (`packages/core/src/prompt.ts`)
   now instructs the tutor to open with one grounded invitation before the
   learner speaks, and the unit test asserts the instruction is present.
   Whether the model actually *gets a turn* with no prior learner input is
   a provider/session behavior this lane doesn't own
   (`packages/voice`/`apps/server`) — no code path today runs a model turn
   except in response to learner audio or `sendText`. **Exact interface
   needed**: each provider's `connect()` (own-provider, local, browser,
   cloud) should, immediately after capture/session setup succeeds, run one
   `TutorTurnRunner`/equivalent turn with no learner caption emitted (so the
   transcript's first entry is the tutor's, not a synthetic empty learner
   turn) — the system instruction above is already ready for it.
   **Observed live, likely incidental**: in the real local-path run below,
   the tutor spoke a first line ("Que penses-tu du personnage principal ?")
   within ~1s of Start, before the fake-mic audio could plausibly have been
   transcribed — almost certainly VAD triggering on a short noise/onset
   with little-to-no real content, and the LLM, given (a) the new opening
   rule and (b) the new "always end with one follow-up question" discuss
   rule, producing a generic engagement question rather than an answer.
   Suggestive that the new prompt rules are already influencing output, but
   not proof of a real auto-opening mechanism — recorded as INFERRED, not
   VERIFIED.
3. **The "not spoken" + Replay transcript marker** — see "F1 interfaces
   used" above; blocked on a `CaptionEntry` field this lane doesn't own.
4. **`bookTitle` real-title fix** — see "What changed" above; blocked on
   `packages/voice`/`apps/server` call sites this lane doesn't own.

## The Provence exchange (directive 8)

Fake-provider mode was not usable for this: `EXPO_PUBLIC_VOICE=fake`'s
fixtures (`packages/voice/fixtures/discuss.json`) are static scripted
turns, not something scriptable to say "Provence" without editing F1-owned
fixture files. Drove the **real local cascade** instead (`apps/server`
healthy on :8790, verified before starting: `stt/llm/tts` all `true`), with
Alphonse Daudet's *Les Étoiles* (`fr-daudet-les-etoiles`, set in Provence)
and a Kokoro-synthesized French fake-mic utterance: *"Qu'est-ce que c'est,
la Provence ? Est-ce en France ?"*

Script: `~/Claude/sotto-run7-recon/F2/provence-exchange.mjs` (reuses F1's
`audible-probe.mjs` AudioContext-wrapping probe pattern, injected via
`page.addInitScript` before any app code runs).

**Result, VERIFIED (live run):**
- State transitions correctly: `connecting` → `speaking` → `listening`,
  each with the right header-free, single-source-of-truth state label in
  the new `ControlCluster` (mono, under the ring) — screenshots
  `state-01-CONNECTING.png` … `state-99-final.png` in
  `~/Claude/sotto-run7-recon/F2/screens/`.
- A tutor turn rendered in the new `Transcript` ("TUTOR: Que penses-tu du
  personnage principal ?") — a real caption, not a caption-strip line.
- **Did not get an answer specifically about Provence.** The reply was a
  generic discuss-mode follow-up question, not a response to the actual
  question content — almost certainly the local energy-VAD triggering on
  the fake-mic clip's onset before the full ~17s French utterance played
  through, a known class of problem `voice-live.mjs`'s own doc comment
  describes at length (VAD/timing tuning for synthetic fake-mic audio).
  Out of scope for this lane (VAD tuning lives in the local-cascade/server
  pipeline, not the voice screen) — recorded as NOT VERIFIED for the
  specific "grounded French answer" claim in KICKOFF-7-FABLE.md's
  definition of done; the screen itself rendered whatever the pipeline
  produced correctly and honestly.
- **Audible probe: 0 samples, inconclusive, not attributable to this
  lane's changes.** Re-ran F1's own unmodified `audible-probe.mjs`
  (Spanish book, unrelated to any F2 file) immediately after — it also
  reported 0 samples, and additionally the app **navigated away from the
  voice screen to `/home` mid-run**, a symptom this lane's script never
  produced. Both point to shared-working-tree instability (six lanes
  editing concurrently, including navigation-adjacent files) rather than a
  defect in the redesigned screen. Screenshots in
  `~/Claude/sotto-run7-recon/F2/screens/` show the screen rendering
  correctly throughout the run this lane drove.

## Screenshots (`~/Claude/sotto-run7-recon/F2/screens/`)

- `375-start.png`, `375-active-push.png` — 375, pre-session and active
  (push-to-talk mode, ring shows `LISTENING` in accent).
- `1440-start.png`, `1440-active.png` — 1440, pre-session and active
  (open-mic mode, transcript showing the tutor's first turn).
- `state-00-pre-start.png` … `state-99-final.png` — the Provence run's
  state-by-state captures.
- `kbcheck-muted-after-space.png` — keyboard check result (below).

## Keyboard operation (proof)

Script: ad hoc Playwright run (not preserved as a named file; steps below
reproduce it). 390×844 viewport, real local path, `turnDetection: 'auto'`.

- **Tab order** reaches, in order: Close → Settings → "Change passage"
  (link role) → the four mode chips → the two turn-detection radio chips
  ("Hold to talk"/"Open mic", `role="radio"`) → Replay → the mic ring
  (`role="button"`, label "Mute") → (Stop/End follow, not captured in the
  first 20 stops but present in the DOM, confirmed separately by
  `getByLabel(/^end$/i)` returning 1 match).
- **Space on the mic ring**: focused the ring (label "Mute", i.e.
  open-mic/auto mode), state was `LISTENING`; pressed Space; state became
  `MUTED`. Confirms the ring is a real keyboard-operable control, not just
  a tap target — VERIFIED live.
- **Escape**: pressed after the above. URL stayed on
  `/voice/fr-daudet-les-etoiles` (did not navigate away), and the End
  button was still present in the DOM afterward — confirms Escape does not
  end the session (no handler binds it to anything; this is the absence of
  a keybinding, not a guarded confirm dialog, which satisfies the card's
  "Escape ends nothing without confirm" either way).
- **Minor gap, not a regression**: the four mode chips (`Read to me` /
  `Read with me` / `Pronunciation` / `Discuss`) render as bare `Pressable`s
  with no `accessibilityRole`, same as the pre-existing code they were
  copied from — they get default web focusability but no announced role.
  Not introduced by this lane; flagging as a small follow-up rather than
  fixing inline (out of the card's explicit directives, and touching it
  risks a same-session regression in an already-large diff).

## Tests

- `pnpm --filter @sotto/core test` — 52 tests, 6 files, all pass (17 in
  `prompt.test.ts`, 6 new).
- `pnpm --filter @sotto/client test` — 267 tests, 34 files, all pass
  (9 new in `recoveryPanel.test.ts`).
- `pnpm --filter @sotto/client exec tsc --noEmit -p .` — clean for every
  file this lane touched. Pre-existing errors remain in `app/account/
  index.tsx` and `app/onboarding/*.tsx` (lane C's in-flight, uncommitted
  work referencing i18n keys not yet added) — confirmed via `git status`
  these files were already modified/untracked before this lane touched
  anything; not caused by F2.
- `pnpm exec eslint apps/client/app/voice/[bookId].tsx
  apps/client/src/voice/useVoiceSession.ts apps/client/src/voice/ui
  packages/core/src/prompt.ts packages/core/src/prompt.test.ts` — clean,
  no errors or warnings.
- `pnpm exec prettier --check` on the same file set — clean.

## What is NOT verified

- The Provence answer's actual content (see above) — VAD/timing issue in a
  lane this lane doesn't own.
- The audible-probe's 0-sample result — inconclusive given F1's own
  unmodified probe also failed differently in the same run window; not
  re-attempted after the shared tree settles, given the effort budget.
  Whoever runs the final adversarial review (lane R) should re-run both
  `apps/client/e2e/audible-probe.mjs` and
  `~/Claude/sotto-run7-recon/F2/provence-exchange.mjs` once all lanes have
  landed, before trusting either result.
- The "not spoken" + Replay transcript marker, the speaker/output mute, the
  automatic opening turn, and the `bookTitle` fix — all blocked on
  interfaces outside this lane's owned files, as detailed above.
- Native (non-web) rendering — this lane only drove the web build via
  Playwright, per the orchestrator's running dev servers; RN Android/iOS
  layout of the new components was not visually checked.

## Files touched

- `apps/client/app/voice/[bookId].tsx`
- `apps/client/src/voice/useVoiceSession.ts`
- `apps/client/src/voice/ui/recoveryPanel.ts` (new)
- `apps/client/src/voice/ui/recoveryPanel.test.ts` (new)
- `apps/client/src/voice/ui/ControlCluster.tsx` (new)
- `apps/client/src/voice/ui/PassageCard.tsx` (new)
- `apps/client/src/voice/ui/Transcript.tsx` (new)
- `apps/client/src/voice/ui/TextFallback.tsx` (new)
- `apps/client/src/voice/ui/RecoveryView.tsx` (new)
- `packages/core/src/prompt.ts`
- `packages/core/src/prompt.test.ts`
- `apps/client/src/i18n/*.json` (18 keys, landed in lane E's commit
  `a1b59c1` — see "What changed")

Not touched: `apps/client/src/voice/sessionManager.ts`,
`apps/client/src/voice/micIndicator.ts`, `apps/client/src/voice/
voiceStartGate.ts`, `packages/voice/**`, any settings screen,
`apps/client/src/state/types.ts` / `createStore.ts`.
