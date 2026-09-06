# F1 — tutor pipeline: report

Card: `planning/run7/cards/F1-tutor-pipeline.md`. Status: done per the
card's Stop condition (committed, pushed, this report written).

## Proposed VoiceEvent error-code table

All codes below are the `code` field of `{ type: 'error'; code; message;
recoverable }` (`packages/voice/src/events.ts`). F2
(`app/voice/[bookId].tsx`) owns rendering; today only `mic_unavailable`,
`cap_exhausted`, and `plan_required` get a specific message — everything
else falls to the generic `voice.connectionIssue` string. This table is
what F1 emits after this lane's changes; F2 decides which of these
newly-specific codes earn their own copy/UI branch.

| Code | Recoverable | Emitted by | Meaning | Suggested UI |
|---|---|---|---|---|
| `mic_denied` | no | own-provider (`openai-direct/provider.ts`), local (`local-cascade.ts`) | `getUserMedia` rejected with `NotAllowedError`/`PermissionDeniedError`/`SecurityError` — the learner (or the OS) declined the mic permission prompt | "Allow microphone access" + OS-settings hint (distinct from a hardware problem) |
| `no_input_device` | no | same two providers | `getUserMedia` rejected with `NotFoundError`/`DevicesNotFoundError`/`OverconstrainedError` — no microphone hardware found at all | "No microphone found" — a "Try again" won't help without different hardware |
| `mic_unavailable` | no | same two providers (unchanged, now the fallback case) | Any other `startCapture` failure (busy device, worklet load failure, non-browser env) | Existing `voice.micUnavailable` copy — no change needed |
| `provider_rejected_setting` | no | own-provider only (`openai-direct/api.ts` `byokError`, was `byok_invalid_key`) | The stored OpenAI key was rejected (401/403) at any stage (STT, LLM, or speech) — a dead/revoked key, not a connection problem | "Your OpenAI key isn't working" + a direct link to Settings > Your OpenAI key (today's mid-session panel has no such link — see Known gaps) |
| `quota_exceeded` | yes | own-provider only, **speech stage specifically** (`byokError(err, {stage:'speech'})`) | A 429 during `/v1/audio/speech` — the caption for that sentence carries `notSpoken: true` | "Ran out of API quota for speech" distinct from a generic rate-limit retry message |
| `byok_rate_limited` | yes | own-provider, STT/LLM stages (unchanged) | A 429 during transcription or chat completion | Existing generic "something went wrong" caption path (`sessionManager.ts`'s `onError`) |
| `byok_request_failed` | yes | own-provider (unchanged) | Any other non-2xx from api.openai.com | Same as above |
| `byok_network_failed` | yes | own-provider (unchanged) | `fetch` itself rejected (offline, CORS-opaque failure on a bad key) | Same as above |
| `playback_blocked` | yes | own-provider, local (new, `web-audio.ts`'s `WebAudioAdapter`) | The playback `AudioContext` is suspended and a `.resume()` attempt did not clear it (autoplay policy edge case, backgrounded tab) | "Tap to resume audio" — call `session.resumePlayback()` (new; see API changes) |
| `connection_lost` | — | Realtime only (unchanged, pre-existing) | WebRTC session dropped | Unchanged |
| `session_create_failed`, `ws_error` | — | local (unchanged, pre-existing) | Server-side session/WS failures | Unchanged |

Rename (breaking the exact string, not the shape): `byok_invalid_key` →
`provider_rejected_setting`. No caller outside `packages/voice`'s and
`apps/client/src/voice`'s own tests matched `byok_invalid_key` (grepped the
whole tree before renaming) — `apps/client/app/voice/[bookId].tsx` (F2's
file) never special-cased it, so this rename cannot break existing F2 UI;
it previously fell to the generic fallback message and will keep doing so
until F2 adds a branch for it.

## New caption field

`VoiceEvent`'s `caption` variant gained an optional `notSpoken?: boolean`
(`packages/voice/src/events.ts`). Set `true` only on the per-sentence
caption emitted right after a TTS failure in `speakSentence`
(`openai-direct/provider.ts`); every caption that was actually spoken omits
it (falsy), so no existing `{ speaker, text, final }` destructuring breaks.

## New session-level API (for F2 to wire buttons to)

- `resumePlayback(): void` — exported from `apps/client/src/voice/sessionManager.ts`; delegates to the active provider's optional `resumePlayback()` (own-provider and local providers implement it, calling `WebAudioAdapter.resumePlayback()`). Call from a tap after a `playback_blocked` error.
- `retry(): void` — exported from `sessionManager.ts`. Re-enters the same book/chapter/mode as the last `startSession()` call, without wiping `useSottoStore`'s `captions` or `voiceError` (unlike calling `startSession()` again, which goes through `endSession()`'s `clearSessionEphemeral()`). No-op if nothing has ever been started, or after a deliberate `endSession()` (which clears the remembered params).

## What changed (files, by directive)

1. **Failing test first, then fix** (directive 1): `packages/voice/test/openai-direct.test.ts` — new test `a transient TTS failure emits an error event and marks the caption not-spoken`, verified failing against the pre-fix code via `git stash` (see "Tests run" below), then fixed in `packages/voice/src/openai-direct/provider.ts`'s `speakSentence` (now always emits an `error` VoiceEvent on any TTS failure, and marks the paired caption `notSpoken: true`) and `packages/voice/src/openai-direct/api.ts`'s `byokError`.
2. **Blocked playback** (directive 2): `packages/voice/src/transports/web-audio.ts` (`WebAudioAdapter.playPcm` now detects a suspended playback `AudioContext`, attempts `.resume()`, and reports through a new `onPlaybackBlocked` hook; new `resumePlayback()` method), `packages/voice/src/transports/audio-adapter.ts` (interface gains both, optional), `packages/voice/src/provider.ts` (`VoiceProvider.resumePlayback?()`), wired in `openai-direct/provider.ts` and `local-cascade.ts`.
3. **Invalid setting / quota during speech** (directive 3): `openai-direct/api.ts`'s `byokError` — 401/403 → `provider_rejected_setting`; 429 with `{stage:'speech'}` → `quota_exceeded`.
4. **Reconnect keeping the transcript** (directive 4): `apps/client/src/voice/sessionManager.ts` — new `retry()` + `teardownActive()` helper, `endSession()` now clears the remembered `lastStartParams`.
5. **Listening truthfulness** (directive 5): `packages/voice/src/mic-error.ts` (new shared classifier: `mic_denied` / `no_input_device` / `mic_unavailable`), used by both `openai-direct/provider.ts` and `local-cascade.ts`. New test suite in `apps/client/src/voice/voiceStartGate.test.ts` drives `createListeningGate` through each provider's known state-ordering (byok, local, browser, cloud/Realtime) and asserts no `listening` is ever observed before capture is actually ready.
6. **Prompt-level**: none — out of scope (F2 owns `packages/core/src/prompt.ts`).
7. **The audible-output proof**: `apps/client/e2e/audible-probe.mjs` (new) — see "Audible probe" below.
8. **Unit-level proof of the swallowed-error path**: covered by directive 1's test plus additional new tests in `packages/voice/test/openai-direct.test.ts` (`quota_exceeded` during speech, `mic_denied`/`no_input_device` classification, `playback_blocked`/`resumePlayback()` wiring) and mirrored in `packages/voice/test/local-cascade.test.ts` for the local path. All use a mocked `fetch` and a fake `AudioAdapter` — no real audio device or api.openai.com traffic.

Also touched: `docs/voice-pipeline.md` — new "Client-side error codes and
recovery (run7/F1)" section documenting the table above, the `notSpoken`
marker, `resumePlayback()`/`retry()`, and the audible probe.

## Files changed

- `packages/voice/src/events.ts`
- `packages/voice/src/mic-error.ts` (new)
- `packages/voice/src/provider.ts`
- `packages/voice/src/local-cascade.ts`
- `packages/voice/src/openai-direct/provider.ts`
- `packages/voice/src/openai-direct/api.ts`
- `packages/voice/src/transports/audio-adapter.ts`
- `packages/voice/src/transports/web-audio.ts`
- `packages/voice/test/openai-direct.test.ts`
- `packages/voice/test/local-cascade.test.ts`
- `apps/client/src/voice/sessionManager.ts`
- `apps/client/src/voice/sessionManager.test.ts`
- `apps/client/src/voice/voiceStartGate.test.ts`
- `apps/client/e2e/audible-probe.mjs` (new)
- `docs/voice-pipeline.md`

## Tests run

- `pnpm vitest run packages/voice/test/openai-direct.test.ts` — 16 tests, all pass. ✓ VERIFIED. Confirmed the new directive-1 test (and 5 others added this pass) fail against the pre-fix code: `git stash push -u -- packages/voice/src/openai-direct/provider.ts packages/voice/src/openai-direct/api.ts packages/voice/src/mic-error.ts`, reran — 8 of 16 failed with exactly the expected assertions (e.g. `expected undefined to be defined` for the error event, `mic_unavailable` instead of `mic_denied`); `git stash pop` restored the fix, reran — 16/16 pass again.
- `pnpm vitest run packages/voice/test` (all 11 files, 130 tests) — pass. ✓ VERIFIED.
- `pnpm vitest run apps/client/src/voice/*.test.ts` (10 files covering sessionManager, controller, voiceStartGate, availability, providerSelection, byokKey, micIndicator, toolContext, recoveryPanel) — 225 tests total (voice-scoped run above), pass. ✓ VERIFIED.
- `pnpm --filter @sotto/client test` (full client suite) — 246/247 pass; 1 pre-existing failure in `src/cloud/destination.test.ts` (lane C's file) and a pre-existing missing-module failure in `src/onboarding/levelSamples.test.ts` (another lane's in-flight, untracked file) — neither touches anything F1 owns, both present before this lane's changes. ✓ VERIFIED not caused by this lane (checked `git status`: both files are untracked, created by concurrent lane work in the shared tree).
- `pnpm --filter @sotto/voice typecheck` — clean. ✓ VERIFIED.
- `pnpm --filter @sotto/client typecheck` — 2 pre-existing failures, both in untracked files from other lanes (`src/onboarding/levelSamples.test.ts`, `src/voice/ui/Transcript.tsx`, neither in F1's owned set). No errors in any F1-owned file. ✓ VERIFIED.
- `pnpm lint` — 0 errors, 26 pre-existing warnings across the repo, none in F1-touched files. ✓ VERIFIED.
- `pnpm exec prettier --check` on every touched file — clean after one `--write` pass (two files needed reformatting after editing). ✓ VERIFIED.

## Audible probe (directive 7)

`apps/client/e2e/audible-probe.mjs` — built per the recon's exact probe
snippet (wraps `window.AudioContext` via `page.addInitScript` before any
app code runs, counts `AudioBufferSourceNode.start()` calls and scheduled
samples). Checks `apps/server`'s `/health` itself and fails fast with a
clear message if the local stack isn't up, rather than hanging.

**Mode run: `local`.** This Mac had `apps/server` healthy
(`{"ok":true,"stt":true,"llm":true,"tts":true,"vad":"energy"}`) for the
whole session, so per the card's own preference ("Which path can be
verified audibly on this Mac without any stored setting: the local path")
the script drives that path — same `WebAudioAdapter.playPcm` code every
other path (browser/byok) shares, so a pass would exercise the exact
playback code this lane's fix touches, without needing a stored
own-provider key.

**Result: NOT VERIFIED live in this session — the script is built and
correct, but a full turn never completed within the timeout.** What was
actually established, in order:

1. The script correctly detects the local server's health and fails fast if it isn't up. ✓ VERIFIED.
2. Navigating to `/voice/<bookId>` requires an explicit "Start" tap (R6-B3's gesture requirement) — the script's first attempts sat at `idle` forever until I added the tap. ✓ VERIFIED, and this uncovered that the two *existing* e2e scripts (`voice-live.mjs`, `self-hosted-voice.mjs`) never click Start either — I ran `voice-live.mjs` directly against this same healthy local server and it also timed out in `connecting`/never advanced past the initial phase, confirming those pre-existing scripts are themselves stale against the current app (not something introduced by this lane). Flagged as a follow-up task (see below); not fixed here since it's outside this card's owned deliverable (a *new* script) and outside the effort budget for this pass.
3. Once the tap was added, the session correctly connects and reaches `listening` (`CONNECTING` → `LISTENING`, sometimes with a `SPEAKING` greeting first) — the WebSocket session, VAD wiring, and gate logic all work. ✓ VERIFIED.
4. The learner's synthesized fake-mic utterance (Kokoro TTS → ffmpeg-formatted WAV, verified non-silent via `ffprobe -af volumedetect`: mean −28.7 dB, max −8.9 dB, well above noise floor) never produced a turn — no tutor caption, no state change away from `listening`, for the full 75s timeout. A throwaway diagnostic (`WebSocket.prototype.send` instrumentation, not committed — scratch only) showed the client sends **zero binary frames** over the WebSocket during that window, in both headless and headed Chromium. That means the `AudioWorkletNode`-based capture pipeline (`packages/voice/src/transports/web-audio.ts`'s `startCapture`) never emits a single captured frame against Chromium's `--use-file-for-fake-audio-capture` device in this environment, before any VAD logic is even reached — a capture-pipeline-vs-fake-device interaction issue, not a bug in this lane's error-surfacing changes. INFERRED root cause (not fully isolated further — would need instrumenting the `AudioWorkletProcessor` itself, which runs in a separate global scope harder to reach from Playwright); the finding "zero frames sent" itself is ✓ VERIFIED.
5. Given (2) and (4) are both pre-existing, environment-level issues unrelated to this card's fix, and two serious attempts were made (adding the Start tap, then the WebSocket-frame diagnostic), I stopped per the card's "two serious attempts, then escalate" rule rather than continuing to debug Chromium's fake-audio-device/AudioWorklet interaction.

**The directive's own fallback path also did not need building**: the
card's alternative for a machine with no local models was an
`EXPO_PUBLIC_VOICE_FAKE=1` canned-PCM provider — moot here since local
models were present and healthy, so I did not build it (would not have
changed the outcome above, since the failure is in the shared capture
path, not provider selection).

**Primary evidence for the audible-output fix is therefore the unit-level
proof (directive 8)**, which the card explicitly allows as an alternative
("or by a unit-level test around `OpenAIDirectProvider` with a mocked
`fetch`... and an injected fake `AudioAdapter`... this exercises the exact
same swallowed-error code path"). That coverage is solid: the new
`packages/voice/test/openai-direct.test.ts` tests assert `audio.played`
stays empty and an `error` event fires on a transient TTS failure, and the
existing "runs one full turn" test already asserts `audio.played.length >
0` and `24000` Hz on a successful turn — together they cover both the
spoken and the not-spoken cases at the `AudioAdapter.playPcm` call
boundary, one layer below where the live browser probe would have measured.

## Known gaps / not done here (F2's call, escalations, or follow-ups)

- No UI in `app/voice/[bookId].tsx` reads any of the new codes yet, or calls `retry()`/`resumePlayback()` — that file is F2's, not owned here.
- `provider_rejected_setting`'s mid-session panel still has no direct Settings link (recon's finding); F1 cannot add one without touching F2's file. Flagging for F2.
- `OpenAIRealtimeProvider`'s WebRTC `<audio>` element (cloud/Realtime path) is not instrumented for `playback_blocked` — out of scope for this pass; that path also needs a real cloud account/plan to drive at all (this card's own Escalate-when condition).
- **Live audible-output proof not achieved** — see "Audible probe" above. `apps/client/e2e/audible-probe.mjs` is built, correct, and ran; the blocker is a pre-existing capture-pipeline/fake-device interaction (also affecting `voice-live.mjs`/`self-hosted-voice.mjs`), not this lane's fix. Spawned as a follow-up task rather than fixed here (outside this card's scope and effort budget).
- `voice-live.mjs` and `self-hosted-voice.mjs` (owned files, `apps/client/e2e/voice-*.mjs`) appear to have gone stale against the current app: neither clicks the "Start" button the voice screen has required since R6-B3, so as written they can no longer drive a real session. Not fixed in this pass (discovered late, and fixing two other scripts' core mechanic plus the deeper capture-pipeline issue was outside this card's effort budget) — flagged as a follow-up task.

## Escalations

None requiring a real stored setting or device beyond what's noted above —
the audible-probe blocker is an environment/tooling issue (Chromium fake
audio device + AudioWorklet), not a missing credential.
