<!-- R6-B3 fix lane. Vocabulary: "own-provider mode" = docs' BYOK term; "the
     setting" = the key pasted in Settings; "the paid origin" =
     app.readsotto.app; "the free origin" = readsotto.app. -->

# R6-B3 writeup: the tutor starts from a tap

## What was fixed and proven

### 1. Capture starts from a tap, not on mount

`apps/client/app/voice/[bookId].tsx` and `apps/client/src/voice/useVoiceSession.ts`
used to start a session in a `useEffect` right after mount. On iOS Safari
this raised the OS microphone sheet with no tap behind it at all, and the
status dot already read "listening" while that sheet was still pending
(B2's finding, screenshot `docs/screenshots/web/run6-tab-voice.png`).

Fixed by:
- The voice screen now mounts in a ready state. The availability probe
  still runs on mount (the pre-session panels — needs-download, no-webgpu,
  server unavailable — read the same probe result as before and are
  unchanged).
- Once the probe resolves `ready`, the screen shows a Start button
  (`voice.start`, all nine i18n catalogs) instead of auto-connecting.
  `apps/client/src/voice/voiceStartGate.ts`'s `startControlState(status,
  started)` is the pure rule deciding `hidden`/`start`/`active`.
- `sessionManager.startSession` — and, inside it, `getUserMedia`/
  `AudioContext` (`packages/voice/src/transports/web-audio.ts`, untouched
  by this lane) — is only ever invoked from `useVoiceSession`'s `start()`,
  called synchronously from the Start button's own `onPress`. No platform
  branch anywhere in this path (CONFIRM 17 satisfied): every platform gets
  the identical tap-gated Start control.
- The status indicator no longer reports `listening` before the capture
  transport actually has a stream. `gateVoiceState(state, captureReady)`
  downgrades a premature `listening` to the existing `connecting` state.
  `sessionManager.ts` wraps the real `AudioAdapter` per session so it can
  tell, from inside apps/client only, whether `startCapture()` has
  actually resolved yet — no changes to `packages/voice` or `apps/server`.
- Found while proving this end to end (see the Playwright run below): the
  local path's server (`apps/server/src/voice/session.ts`'s constructor)
  announces `listening` exactly once, at websocket-session creation, and
  never repeats it. A naive gate stranded the screen at `connecting`
  forever once it suppressed that one announcement. Fixed with
  `createListeningGate`, which flushes the suppressed `listening` the
  moment `startCapture()` resolves.

Tests (`apps/client/src/voice/voiceStartGate.test.ts`, 13 unit tests,
all passing):
- `startControlState` (4 tests): hidden while checking, hidden behind a
  pre-session panel, `start` once ready-and-not-started, `active` once
  started regardless of availability status.
- `gateVoiceState` (3 tests): downgrades `listening` to `connecting` when
  capture isn't ready, passes `listening` through once it is, leaves every
  other state (idle/connecting/thinking/speaking/muted/error/reconnecting/
  ended) untouched either way.
- `createListeningGate` (3 tests): flushes a suppressed `listening` once
  `onCaptureReady()` is called with capture actually ready, does not flush
  when nothing was suppressed, flushes only once.
- `micUnavailablePanelState` (2 tests, task 2's helper) + 1 covering the
  no-error-code default.

`apps/client/src/voice/sessionManager.test.ts` (existing 4 tests) still
pass unchanged — they exercise the fake provider path, which never touches
the gated adapter (`isFakeProvider` short-circuits it), so none of them
were asserting the old auto-start behavior to begin with; nothing there
needed updating.

Full client suite: **174 tests passing** (`pnpm --filter @sotto/client
test`), up from the pre-run-6 baseline of 157 (the 17 new tests above,
minus none removed).

### 2. The microphone-unavailable panel offers a way forward

B1 candidate 3: the mid-session `isBroken` panel for a `mic_unavailable`
error was a dead end — the plain "Microphone unavailable…" message and
only a "Read alone" button. Fixed by adding, gated on
`micUnavailablePanelState(errorCode)` (`voiceStartGate.ts`):
- a hint line (`voice.micUnavailableHint`, all nine catalogs — French uses
  "vous", matching this run's `account.signedOut.freeLink` register rather
  than the "tu" register already in the older `voice.micUnavailable`
  string);
- a "Try again" button (`voice.tryAgain`) that calls `session.start()`,
  the same tap-gated entry point from fix 1;
- a button to the setting's own screen, reusing the existing
  `/settings/openai-key` route and `byok.row` label the pre-session panels
  above it already use.

Every other broken-session error code (`cap_exhausted`, `plan_required`,
a generic connection issue) keeps its plain, single-button panel —
unchanged.

### 3. Gesture proof (desktop Chromium, Playwright)

Ad hoc script (not committed — outside this lane's permitted paths;
`apps/client/e2e/**` was not in scope), run against the production export
served through `apps/server` on `localhost:8792` (same recipe as the
proof re-run below), with Chromium launched
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (so
`getUserMedia` would auto-grant rather than hang on a real prompt — this
is what makes "no call before the tap" a meaningful assertion rather than
a permission-dialog block) and a `getUserMedia` call counter installed via
`page.addInitScript` before the app's own JS ran.

Transcript (final, passing run):

```
[before tap] getUserMedia calls: 0
[before tap] status line: idle
[before tap] Start button present: true
[+1s] status line: listening | gUM: resolved:1tracks
[+2s] status line: listening | gUM: resolved:1tracks
...
[+10s] status line: listening | gUM: resolved:1tracks
[after tap] getUserMedia calls: 1
[after tap] status line: listening
RESULT: PASS
```

(An intermediate run, before the `createListeningGate` fix, showed
`getUserMedia calls: 1` and `Start button present: true` — the tap-gate
half was already correct — but the status line stuck at `connecting` for
the full 10s window instead of reaching `listening`, which is what
surfaced the one-shot-`listening` bug described above.)

Asserted and true in the final run: 0 `getUserMedia` calls before the tap,
the Start button present before any tap, exactly 1 `getUserMedia` call
after tapping Start, and the state reaching `listening` afterward.

### 4. iOS Simulator proof (production export)

Built `apps/client`'s production export (`pnpm web:export`), copied it to
a scratch directory with `index.html` replaced by `app.html` (B2's own
documented workaround for `apps/server`'s SPA fallback always serving the
landing page for non-root routes — not fixed here, out of scope, still
present), served it through `apps/server` (`SOTTO_STATIC_DIR=<scratch>
SOTTO_PORT=8792`), and drove the already-booted iPhone 17 Pro simulator
(`CA722C16-13E5-4579-A876-638F0C1C51C6`) with `xcrun simctl openurl
http://localhost:8792/voice/fr-cendrillon` (same book B2 used), waited 6s,
and screenshotted with `xcrun simctl io screenshot`.

**Before** (B2's finding, unchanged reference, not duplicated here):
`docs/screenshots/web/run6-tab-voice.png` — the OS "localhost Would Like
to Access the Microphone" sheet is up, un-dismissed, while the app's own
UI already shows the status dot and "listening" behind it.

**After** (this lane): `docs/screenshots/web/run6-b3-after-voice.png` —
no microphone sheet on load, status dot shows "idle", a "Start" button is
visible under the passage. Matches the task's expected AFTER state
exactly.

One wrinkle worth recording honestly: the very first attempt at this
screenshot, on port 8790 (reusing B2's port), reproduced the *old*
auto-start bug even after this lane's fix landed. That was not a
regression — a leftover `apps/server` process from an earlier session,
started before this lane's commits, was still bound to port 8790 and
serving a stale pre-fix build. Rebuilding on a fresh port (8792) with a
freshly-copied export produced the correct AFTER screenshot on the first
try. Left as a process-hygiene note, not a code finding.

## What was ruled out (restated from B1/B2, in this run's vocabulary)

- B1 ranked "no user gesture at capture time" (candidate 2) last, on the
  theory that Safari doesn't require a gesture to *show* a permission
  prompt the first time. That theory held for the prompt itself, but B2's
  screenshot showed a second, independent problem this lane actually
  fixed: the app's own status dot claimed "listening" while the OS prompt
  was still pending, which is a client-side UI bug, not a permission
  question — confirmed here by tracing exactly where `listening` gets set
  server-side (`apps/server/src/voice/session.ts`) and client-side
  (`packages/voice`'s providers), and gating the client's *display* of it
  without touching either.
- B1 candidate 3 (dead-end failure UI) is fixed by this lane's second
  commit.
- B1 candidates 1 (storage-container mismatch), 4 (standalone permission
  gap), and 5 (not a code defect — validation/billing) are untouched by
  this lane; they were never in its scope. Candidate 4 specifically
  remains exactly as untested as B1/B2 left it — see below.

## What remains unproven

- **The Home Screen (standalone-PWA) container.** Neither B1, B2, nor this
  lane exercised it — B2 documented that this environment has no way to
  tap "Add to Home Screen" inside the iOS Simulator, and that limitation
  is unchanged. Whether iOS grants/prompts the microphone identically in a
  standalone-installed PWA versus a Safari tab, for either origin, is
  still unknown.
- **A real OS microphone grant/denial on a physical device.** The
  Simulator screenshot proves the *app* no longer requests the microphone
  before a tap; it does not prove what a real iPhone's permission sheet
  does once tapped, nor what a real *denial* looks like end to end (B2
  could not tap "Allow"/"Cancel" either, before or after this fix).
- **Own-provider mode's actual live path**, i.e. an `OpenAIDirectProvider`
  session with a real stored key on a real device. This lane's fixes are
  provider-agnostic (they wrap whichever `AudioAdapter` `pickProvider`
  builds), but `docs/verification.md`'s BYOK tier evidence is all
  Chromium-fake-mic; nothing in run 6 adds a real own-provider-mode device
  run.
- **A billing-rejected key's actual on-screen behavior**, described below
  from reading `packages/voice/src/openai-direct/api.ts` (not edited, not
  in scope) rather than from a live capture with a real unbilled key.

Also untested: whether the tap's activation survives the session-creation
round trip — `packages/voice/src/local-cascade.ts`'s `connect()` awaits
`POST /voice/session` (`local-cascade.ts:139-153`), then the WebSocket
`open` event (`local-cascade.ts:157`), then calls `startCapture`
(`local-cascade.ts:166-168`) — before `getUserMedia` actually fires on a
real iOS Safari. The fix was live-tested only on the local path; own-
provider mode's path shares the gate by construction
(`apps/client/src/voice/sessionManager.ts:221-225` wraps the audio adapter
with `wrapAudioForGating` for every provider) but was not exercised end to
end with the setting this run.

## The setting rejected vs. accepted-but-unbilled (read from api.ts, not edited)

Two different moments, two different codepaths:

1. **At Save, in Settings** (`validateOpenAIKey`, `api.ts`): calls
   `GET /v1/models`. An invalid/revoked key gets a 401/403 there and
   Settings shows `byok.invalid` immediately — the setting is never
   stored. A rate-limited key at this exact moment (429) shows the same
   `byok.invalid` string (B1 already noted this collapse). **A key that is
   valid but on an account with no billing configured will typically still
   pass `GET /v1/models`** (listing models does not require billing on
   OpenAI's API) — so Settings shows `byok.saved` and stores the key. The
   learner sees no warning at all at this point.
2. **At the first real turn** (STT/LLM/TTS calls, `byokError()` in
   `api.ts`): an unbilled account's first actual inference call typically
   comes back 429 (quota exceeded), which `byokError` maps to
   `{ code: 'byok_rate_limited', recoverable: true }` — not the 401/403
   branch, and not the dead-end panel this lane just fixed. Per
   `sessionManager.ts`'s existing `onError` handling (`BUGS-TUTOR-RUN5.md`
   #3, unchanged by this lane), a *recoverable* error returns the session
   straight to `listening` and only adds a caption: "Sorry, something went
   wrong there. Please try again." **From the learner's side, an
   accepted-but-unbilled key looks exactly like a transient network
   hiccup** — there is no text anywhere that says "add a payment method to
   your OpenAI account." This is a real gap, but it is `api.ts`'s error
   mapping and `sessionManager`'s existing recoverable-error handling,
   both out of this lane's permitted scope (`api.ts` is on the explicit
   escalate list); noting it here rather than fixing it.

## Real-iPhone checklist for Noel

Same vocabulary as B2's checklist ("own-provider mode", "the setting",
"the free origin", "the paid origin"); this replaces B2's checklist with
one that also covers what this lane changed.

1. **Pick one origin and one container, and stay in it for the whole
   check.** Decide up front: Safari tab vs. a Home Screen icon, and free
   origin vs. paid origin. Whichever you save the setting in is the only
   place it will be usable (B1 candidate 1 — separate storage containers,
   still unverified end to end on your device). Write down which one
   you're using before step 2.
2. **If you're testing own-provider mode**, go to Settings → "Your OpenAI
   key" *in that same container* and confirm the row reads "On" before you
   ever open a book. If it reads "Off", the key either never saved or
   saved in a different container — stop and re-save here first.
3. Open any book, tap "Talk to the tutor". **Look for:** the voice screen
   should load with a status dot reading **"idle"** and a **"Start"**
   button visible — not a microphone permission sheet. If you see the OS
   permission sheet before you've tapped anything, that's the bug this
   lane was supposed to fix; note exactly what you see.
4. **Tap Start.** Now watch for the OS "Would Like to Access the
   Microphone" sheet. Note whether it appears, and exactly what it says.
5. Before you tap Allow/Cancel on that sheet, look at the status dot
   behind it: it should read **"connecting"** or **"starting"**, not
   "listening" — "listening" now means the app has confirmed it actually
   has a live microphone stream, not just that it asked for one.
6. Tap **Allow**. The status dot should move to **"listening"** within a
   few seconds. If it never does — stuck on "connecting" — that's a new
   bug to report (this lane fixed one specific cause of exactly that
   symptom for the local-server path; there could be others).
7. Now tap **Cancel/Deny** instead (repeat from step 3 with a fresh
   attempt). **Look for:** the screen should now show the
   "Microphone unavailable" panel with **four things**: the original
   message, a new hint line about allowing the microphone in your browser
   settings, a **"Try again"** button, and (if own-provider mode is
   relevant to you) a button to the key's Settings screen — plus the
   existing "Read alone". Confirm all of them are there and that "Try
   again" actually re-shows the Start flow rather than doing nothing.
8. **Home Screen check** (the part B1/B2 could never test): Share → Add to
   Home Screen from the same tab. Confirm it installs and that opening the
   icon shows no Safari chrome. From the icon, repeat steps 2-7 and
   compare every field against the Safari-tab run — same prompt behavior,
   same "idle"/"connecting"/"listening" sequence, same panel. This is the
   one thing in this whole checklist that no amount of simulator or
   Playwright work can substitute for.
9. **If you're checking own-provider mode's billing edge:** with a key
   from an OpenAI account you know has no payment method attached, save
   it (Settings should show "Key saved.", no warning) and start a
   session. **Look for:** the first turn goes quiet, then a caption
   appears that just says "Sorry, something went wrong there. Please try
   again." — there is currently no message anywhere that says the account
   needs billing. If you see that generic caption with a key you know is
   unbilled, that confirms the gap described above; it is not something
   this lane fixed.
