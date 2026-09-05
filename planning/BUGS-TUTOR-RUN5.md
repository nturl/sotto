# Tutor ("Discuss") bug report for run 5

Filed 2026-09-05 from Noel's local session (French interface, Spanish book "El Monte de las Ánimas", Discuss mode, auto turn detection). Noel spoke English; the transcript came back in Spanish. Noel's call: do not fix in run 4, carry into run 5.

Legend: VERIFIED = read and traced in code. INFERRED = consistent with the screenshot and the code path, but not reproduced with logs.

## What the screenshot shows

```
Tuteur: ¿Te gustaría que te ayudara a entender este pasaje?
Toi:    ¿Dienes que me ha causado 5 bugs?
Tuteur: ¿Dienes que me ha causado 5 bugs?
Toi:    No me parece que...
Toi:    Discusion y el tutor realmente funciona el mejor
Toi:    Por ejemplo, estoy hablando de inglés ahora y estoy hablando en inglés, pero es translado en español.
```

Every "Toi" line is English speech rendered as Spanish. Three learner turns in a row have no tutor reply. One tutor line is a verbatim echo of the learner. The mic area says push-to-talk is off while the session is in fact listening.

## Bugs

### 1. STT forces the learning language, so English speech is transcribed as Spanish (P0, VERIFIED)

Every STT path sends the learner's learning locale as Whisper's `language` and never lets the model detect the spoken language:

- BYOK: `packages/voice/src/openai-direct/provider.ts:334` passes `learningLocale`; `packages/voice/src/openai-direct/api.ts` line ~223 appends it as the form `language`. No fallback at all.
- Self-hosted cascade: `apps/server/src/voice/stt.ts` `transcribeWithFallback` retries with the explanation locale only when the first transcript is EMPTY. A forced-Spanish decode of English speech is not empty, it is a Spanish paraphrase, so the fallback never fires.
- Browser tutor: `packages/voice/src/browser-cascade/worker.ts:676` forces `language` too, with `task: 'transcribe'`.

Whisper with a forced `language` decodes whatever it hears into that language. That is exactly the "estoy hablando en inglés, pero es translado en español" line. The comment in api.ts ("so the model doesn't guess") is the design intent; it is wrong for a tutor whose learner is expected to fall back to their explanation language.

Consequences downstream: the LLM receives garbled Spanish, so its replies are off, and the saved-word / reading tools get nonsense.

Fix candidates for run 5 (pick one, then measure on a 20-utterance mixed EN/ES set):
- a. Omit `language` for OpenAI transcription (auto-detect is good on `gpt-4o-transcribe`/`whisper-1`), and pass a `prompt` hint naming both languages. Cheapest; test that short Spanish utterances at A1 still decode correctly.
- b. Keep the forced language for the learning locale but run a second decode with the explanation locale when the first result scores low, using `verbose_json` `language`/`avg_logprob` on whisper-compatible servers. Doubles cost on ambiguous turns only.
- c. Add a "speak in my language" toggle in the session bar that swaps the forced code per turn. Explicit, but adds UI to a screen that is already crowded.

Whatever the path, the same rule must land in all three providers, and the browser worker needs `task` left as transcribe with `language` undefined, which transformers.js supports.

### 2. Tutor never answers in the learner's explanation language (P1, VERIFIED prompt, INFERRED effect)

`packages/core/src/prompt.ts:120-123`: "Speak {learningLocale} at level … and use {explanationLocale} briefly when explanation is needed." There is no rule for "if the learner speaks their explanation language, reply in it." Combined with bug 1, an English question gets a Spanish-only answer. Run 5 should add one line to the stable rules: reply in the language the learner used for that turn, then offer to return to the learning language.

### 3. Three learner turns with no tutor reply (P1, INFERRED)

Two mechanisms both fit the transcript:

- Barge-in eats replies. In auto mode `handleFrame` (provider.ts:305-318) calls `interruptInternal()` on every `speech_start`. `TutorTurnRunner.run` (`packages/voice/src/browser-cascade/llm-turn.ts:157`) only emits the tutor caption when the turn was NOT aborted, and only pushes the assistant message to history if `finalText` is non-empty. An interrupted reply therefore vanishes from both the transcript and the model's memory. If the energy VAD is hearing the tutor's own speaker output (no echo cancellation on the energy VAD, it is raw frames), the tutor interrupts itself on every turn.
- Silent failure. `failTurn` (provider.ts:465) emits an `error` event and returns to `listening`; if the voice screen only surfaces non-recoverable errors, a 429 or a network blip reads as "the tutor ignored me."

Repro for run 5: turn on the diagnostic channel (`stt_ms`, `audio_start`, `audio_end … cancelled`) and count cancelled utterances per learner turn during a 2-minute session with the laptop speaker on, then again with headphones. If cancellations drop to zero with headphones, it is the VAD. Fix: half-duplex gate (ignore VAD `speech_start` for ~300 ms after playback starts and raise the threshold while speaking), or use the browser's AEC-enabled `getUserMedia` constraints. Also: an aborted turn should still leave its partial caption in the transcript, marked as cut off.

### 4. Learner utterances split mid-sentence ("No me parece que...") (P2, INFERRED)

The energy VAD's `speech_end` fires on a pause; a natural mid-sentence pause becomes a turn, each half is transcribed separately, and each triggers an LLM call. Run 5: lengthen the end-of-speech hangover (check `EnergyVad` defaults) or wait for the next segment for ~600 ms and merge before transcribing. Measure on the same 20-utterance set as bug 1.

### 5. Tutor echoes the learner verbatim (P2, INFERRED)

"Tuteur: ¿Dienes que me ha causado 5 bugs?" is the learner's garbled line back. The caption store dedupe (`apps/client/src/state/createStore.ts:377-393`) only collapses same-speaker non-final runs, so this is not a caption-merge artefact; the model most likely repeated an unintelligible input as a clarification. Likely disappears once bug 1 is fixed. Keep it on the list until the mixed-language test set shows zero echoes.

### 6. Mic caption says push-to-talk is required while the mic is live (P2, VERIFIED)

`apps/client/app/voice/[bookId].tsx:397-401`: when `turnDetection !== 'push'` the screen renders a greyed mic and the string `voice.pttDisabled` ("Enable push-to-talk in settings to speak"). In auto mode the microphone is open and listening, so the copy tells the learner the opposite of what is happening. Replace with a live state indicator (listening / thinking / speaking) and keep the settings hint only when the session is muted.

### 7. Interface language was French for an English-explanation learner (P3, CONFIRM with Noel)

The screen shows French UI strings and the prompt injects `Interface language: fr` (`prompt.ts:145`), so the tutor may also drift to French. Default is `interfaceLocale: 'en'` (`createStore.ts:38`), so either Noel set French in settings or an earlier onboarding wrote it. Not a code bug unless Noel says they did not choose it.

## Suggested run 5 shape

1. Test set first: 20 recorded utterances (10 EN, 10 ES at A1/A2, a few code-switched), scored for language and word error rate through all three STT paths. Ships as `packages/voice/test/fixtures/mixed-language/` plus a script.
2. Bug 1 + bug 2 together (one lane, all three providers, prompt rule).
3. Bug 3 + bug 4 together (VAD lane, diagnostics-driven).
4. Bug 6 alone (small UI lane).
5. Re-run Noel's session on the same book and paste the transcript into this file as the after.

Acceptance: an English question during a Spanish book gets an English transcript and an English answer; no tutor line disappears in a 2-minute laptop-speaker session; the mic caption never says push-to-talk is off while listening.
