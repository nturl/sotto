# Lane F1: the tutor pipeline tells the truth, and we can prove sound came out

Task: make every failure in the own-provider and local voice paths surface as a specific state, detect blocked playback, add retry that keeps the session, and build the audible-output proof.

Inputs: `planning/run7/PLAN.md` (CONFIRM 27); `~/Claude/sotto-run7-recon/scout-T-tutor.md` §2 (speech output), §3 (state machine and the listening gate), §5 (errors), §6 (e2e), "Defects table", "What a spoken-exchange proof would need" (the AudioContext probe); `packages/voice/src/openai-direct/provider.ts` and `api.ts`; `apps/client/src/voice/sessionManager.ts`, `controller.ts`, `voiceStartGate.ts`, `micIndicator.ts`; `apps/client/e2e/voice-live.mjs`, `self-hosted-voice.mjs`, `browser-tutor.mjs`; `docs/voice-pipeline.md`, `docs/local-models.md`; `planning/BUGS-TUTOR-RUN5.md`.

Owned files: `packages/voice/src/**` (all providers, events), `apps/client/src/voice/sessionManager.ts`, `controller.ts`, `voiceStartGate.ts`, `micIndicator.ts`, `availability.ts`, their tests, `apps/client/e2e/voice-*.mjs` and a new `apps/client/e2e/audible-probe.mjs`, `docs/voice-pipeline.md`. NOT `app/voice/**` or `useVoiceSession.ts` (lane F2). Publish new event/error codes in your report early so F2 can render them: propose `tts_failed`, `playback_blocked`, `provider_rejected_setting`, `quota_exceeded`, `mic_denied`, `no_input_device`, `connection_lost` as VoiceEvent error codes with `recoverable` and a `retry` hint.

Directives:
1. Failing test first: `speakSentence` swallowing a transient speech-synthesis failure while the caption fires (`provider.ts:423-434`). Fix: every speech failure emits an error event (recoverable or not) and the caption carries a "not spoken" marker so the UI can show a replay/retry.
2. Blocked playback: detect a suspended AudioContext or a rejected `play()` and emit `playback_blocked` with a resume action that the UI can call from a tap.
3. Invalid setting mid-session: emit `provider_rejected_setting`, not a generic connection error. Quota (429) during speech: emit `quota_exceeded`.
4. Reconnect: a `retry()` on the session that re-enters the same book/chapter with the transcript intact (transcript lives in the store, `captions`).
5. Listening truthfulness: keep the gate; add a test that no `listening` state is reported before capture is live on every provider (local, browser, own-provider, cloud).
6. Prompt-level: none here (F2 owns `packages/core/src/prompt.ts`).
7. The proof: `apps/client/e2e/audible-probe.mjs` injecting the AudioContext probe before the session starts, running against the local path with `apps/server` on :8790 if `docs/local-models.md`'s models are present on this Mac (check; do not download gigabytes), else against a fake provider mode (add an env-gated `EXPO_PUBLIC_VOICE_FAKE=1` provider in `packages/voice` that returns canned PCM) so the probe proves the audio path end to end in the browser. Assert `started > 0 && totalSamples > 0` after a tutor turn. Report which mode ran.
8. Unit-level proof of the swallowed-error path with a mocked fetch returning PCM and a fake AudioAdapter recording `playPcm`.

Proof: tests green; the probe's output pasted; before/after description of each error state as an event code table for F2.

Stop when: committed, pushed, `planning/run7/F1-report.md` written. Escalate when: a real stored setting or a device would be needed to go further (say exactly what).
