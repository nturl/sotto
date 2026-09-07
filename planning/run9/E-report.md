# Lane E — acceptance probe + baseline

Worktree `~/Claude/sotto-run9/wt/E`, branch `run9/E`. Nothing outside my card's files was touched.

## What changed

| File | What it is |
|---|---|
| `apps/client/e2e/discuss-quality.mjs` | the acceptance probe (new) |
| `apps/client/e2e/lib/wer.mjs` | normalize / tokenize / edit distance / WER (new) |
| `apps/client/e2e/lib/wer.test.mjs` | vitest unit test for the scorer (new, 12 tests) |
| `apps/client/e2e/lib/wav.mjs` | 16-bit mono WAV read/write, linear resample, RMS/peak/NaN stats (new) |

Commit `b44c4c9` — `run9(E): discuss-quality acceptance probe with a Whisper round-trip on the spoken audio`.
Report commit: see the last commit on `run9/E`. Not pushed.

Naming note: the card offered `apps/client/e2e/lib/wer.test.ts`. The helpers are `.mjs`, not `.ts`, because the probe is run with bare `node` and apps/client has no vitest config that would let a `.ts` helper be imported from a plain-Node e2e script. Vitest's default `include` picks up `wer.test.mjs` anyway — **VERIFIED**, `pnpm exec vitest list` shows all 12 cases and `vitest run e2e/lib/wer.test.mjs` passes. `eslint.config.js` already scopes `apps/client/e2e/**/*.mjs` to Node ESM, so lint is clean without a config change.

## What the probe does

Static export served on :8095 by `scripts/serve-static.mjs`, `:8790/health` blocked at the browser so the capability gate must choose the browser cascade, an en-US B1 learner seeded into IndexedDB reading `en-london-build-a-fire`, Discuss mode, models downloaded through the panel's own tap. Then one learner turn, two ways:

- **(a) mic** — `say -v Samantha` synthesizes "Tell me more about the gray husky dog.", `afconvert` to 48 kHz mono s16, ffmpeg appends 2.5 s of silence; Chromium plays it on `--use-file-for-fake-audio-capture` and the run holds the "Hold to talk" ring for 11 s.
- **(b) text** — the same sentence through `TextFallback`, isolating LLM+TTS from STT.

Two deliberate design choices worth flagging to R:

1. **Captions, states and metrics are read from the worker→main messages, not scraped off the DOM.** `window.Worker` is wrapped in an init script, so every `caption` (with its `final` flag), `state`, `metric`, `error`, `audio_start/audio/audio_end` is recorded with a timestamp. A restyled `Transcript.tsx` cannot silently change what this probe believes was said. (browser-tutor.mjs's caption assertions had rotted exactly that way — see its `captionLinesFrom` comment.)
2. **The audio evidence is taken at the playback boundary**, by wrapping `AudioContext.createBufferSource` and keeping every `AudioBuffer` handed to `source.start()` — i.e. exactly what `web-audio.ts`'s `playPcm` scheduled. It is written to `<OUT_DIR>/<scenario>.wav` at the buffer's own 24 kHz.

**Why push-to-talk, and why the hold is long.** Chromium's fake capture device starts at browser launch and loops forever with no clock the test can read, so a short aimed press would be a coin flip. Holding longer than one fixture loop (4.59 s) guarantees a complete utterance is inside the buffered segment; `worker.ts`'s `case 'ptt'` sets `turnMode = 'push'`, so `handleFrame` buffers instead of running the VAD and nothing is lost. **The cost: this run does NOT exercise PLAN.md diagnosis 1's pre-roll path** ("`ptt active` clears the pre-roll so the first syllables after the press are lost"). A probe for that needs a press timed inside the utterance, which this fixture cannot do. Flagged, not attempted.

## BASELINE — run against unfixed `run9/E` (= run 8 HEAD `7624c59`)

`node apps/client/e2e/discuss-quality.mjs`, exit 1. Full log at `~/Claude/sotto-run9/E/baseline-run1.log`.

```
===== discuss-quality: PASS/FAIL =====
  [PASS] scorer  self-test: known-good 24 kHz WAV round-trips at WER <= 0.2                — WER=0.000 heard="The dog is unhappy but loyal."
  [PASS] setup   no server anywhere: /health unreachable, so the browser cascade must run  — status 0
  [PASS] mic     fake capture device delivered audio frames at all                         — 4051 frames, 10.8s
  [PASS] mic     learner caption contains "husky" or "dog"                                 — "Tell me more about the grey husky dog."
  [PASS] mic     tutor reply is at most 3 sentences                                        — 1 sentence(s)
  [PASS] mic     tutor reply has no list/emphasis markup                                   — clean
  [FAIL] mic     tutor reply ends with "?"                                                 — dog is described as a "big, gray husky."
  [PASS] mic     tutor reply mentions the dog
  [PASS] mic     spoken audio is at least 1s                                               — 3.55s
  [PASS] mic     spoken audio RMS above 0.005 and finite                                   — rms=0.0560 nan=0
  [FAIL] mic     round trip: spoken audio matches the caption (WER <= 0.35)                — WER=1.667 heard="Yeah, don't conkan khen khen hang hanging out as long as it needs to be seen."
  [PASS] text    tutor reply is at most 3 sentences                                        — 2 sentence(s)
  [PASS] text    tutor reply has no list/emphasis markup                                   — clean
  [FAIL] text    tutor reply ends with "?"                                                 — g, gray husky. It is a large, heavy dog.
  [PASS] text    tutor reply mentions the dog
  [PASS] text    spoken audio is at least 1s                                               — 5.53s
  [PASS] text    spoken audio RMS above 0.005 and finite                                   — rms=0.0591 nan=0
  [FAIL] text    round trip: spoken audio matches the caption (WER <= 0.35)                — WER=1.000 heard="Hello, hello, how are you doing? I'm Henshi Singh. I'm Yang Xingniang, taxi."
  14/18 passed
```

Captions as the worker emitted them:

- mic — learner `"Tell me more about the grey husky dog."`, tutor final `The dog is described as a "big, gray husky."`
- text — learner `"Tell me more about the gray husky dog."`, tutor final `The dog is described as a big, gray husky. It is a large, heavy dog.`

Evidence files (all under `~/Claude/sotto-run9/E/`): `baseline-run1.log`, `discuss-quality.log`, `discuss-quality-results.json`, `mic.wav`, `text.wav`, `mic-turn.json`, `text-turn.json`, `final.png`.

**The scorer itself is proven, twice.** The card's proof (`say -o` + afconvert to 24 kHz, round-trip WER ≤ 0.2) runs as step 0 of every invocation and scored **0.000** — Whisper-in-Node read the known-good WAV back word for word. So a high WER on the tutor's audio is a fact about the audio, not about the scorer, the WAV writer or the 24→16 kHz resampler.

## What the evidence says about PLAN.md's four diagnoses

### 1. STT gate is missing — NOT REPRODUCED here, but not contradicted either

The fake device delivered **4051 worklet frames / 10.8 s** of 16 kHz PCM (**VERIFIED**), which contradicts audible-probe.mjs's one-time "zero binary frames" observation for this environment. Whisper transcribed the 10.8 s segment as `"Tell me more about the grey husky dog."` — grey/gray is a spelling variant, not an error. So on a segment that genuinely contains clear speech, STT is fine and no `"you"` hallucination appeared.

This neither supports nor contradicts the diagnosis: my 11 s hold is precisely the case the missing gate does not affect. Noel's `"you"` came from a short or near-silent segment, which a long deliberate hold cannot produce. **Lane A's gate is still worth having; this probe just cannot be the thing that proves it.** A regression test for it belongs in `transcript-gate.ts`'s own unit tests, not here. **INFERRED.**

### 2. Reply contract is unenforced — PARTIALLY REPRODUCED, and the failing half is the question

- "at most two sentences": held on its own in this run (1 and 2 sentences). **Noel's five-line list did not reproduce.** Honest reading: the 2B model is not *reliably* verbose, it is *unpredictably* verbose — one sample is not evidence that the max_tokens/markdown problem is gone. **VERIFIED that it did not happen here; nothing more.**
- **"exactly one trailing question": FAILED in both scenarios.** Both replies are flat declaratives that end the turn dead. This is the reproducible half of diagnosis 2 and the strongest case for lane B's `reply-shape.ts`.
- New, out-of-plan: the mic reply contains **straight double quotes** — `The dog is described as a "big, gray husky."` — which `speakSentence` hands to Kokoro verbatim. Lane C should decide whether `tts-text.ts` strips them.

### 3. Spoken audio is unproven — REPRODUCED, and now VERIFIED rather than inferred

This is the headline. Both WAVs are **loud and well-formed** (rms 0.056 / 0.059, peak 0.40 / 0.38, zero NaN, correct duration for the sentence) and both are **unintelligible**. That is exactly why `audible-probe.mjs` ("samples > 0") stayed green through Noel's session: the failure is not silence, it is wrong sound.

I isolated it (scratch script `~/Claude/sotto-run9/E/kokoro-node-probe.mjs`, not in the repo). Same model `onnx-community/Kokoro-82M-v1.0-ONNX`, **same `dtype: 'q8'`**, same voice `af_heart`, same sentence, but run in **Node on cpu/wasm** instead of the browser on WebGPU:

| Path | duration | rms | Whisper heard | WER |
|---|---|---|---|---|
| Node, q8, **cpu** | 3.33 s | 0.067 | "The dog is described as a big grey husky." | **0.111** |
| Browser, q8, **webgpu** (mic scenario) | 3.55 s | 0.056 | "Yeah, don't conkan khen khen khen khen khen…" (a repetition collapse) | 24.7 |
| Browser, q8, **webgpu** (text scenario) | 5.53 s | 0.059 | "Hello, hello, how are you doing? I'm Henshi Singh…" | 1.00 |

**VERIFIED**: the model, the text, the voice, the WAV writer and the resampler are all fine. The variable that changes the outcome is the execution device. `loadTts` tries `['webgpu', 'wasm']` in that order and the browser run took the WebGPU branch (`tts_load_ms=1950ms webgpu` in the log). PLAN.md's diagnosis 3 was marked INFERRED; it can be marked VERIFIED, with the WebGPU device — not the q8 dtype on its own — as the thing that breaks it.

**Recommendation to lane C (their call, not my edit):** the cheapest correct fix is to drop `webgpu` from `loadTts`'s attempt order for Kokoro and load TTS on wasm, rather than changing dtype. Evidence above is a single-sentence A/B, so it should be re-run across a few sentences by lane C's `tts-roundtrip.mjs` before it is treated as settled.

### 4. The screen hides the mic while speaking — the STATE half is REPRODUCED here

From `text-turn.json` (**VERIFIED**, worker timestamps in ms): the second and last audio chunk (100 800 bytes = 50 400 samples ≈ **2.1 s** at 24 kHz) was posted at `t=106615`, and `state -> listening` at `t=107328` — **713 ms later, with ~1.4 s of audio still queued to play.** Same shape in the mic scenario: a 3.55 s chunk posted at `t=77893`, `listening` at `t=78779`. The label and the audio disagree, exactly as diagnosed. The hidden-mic *rendering* is lane D's to confirm; this probe says nothing about it.

## Found in passing, outside my lane

`Qwen3.5-2B` cannot do tool calls at all, and the turn ends in an error:

```
metric llm_tools_unsupported: Qwen3.5-2B-q4f16_1-MLC is not supported for
  ChatCompletionRequest.tools. Currently, models that support function calling are:
  Hermes-2-Pro-Llama-3-8B…, Hermes-3-Llama-3.1-8B…
error llm_pipeline_failed: Role is not supported: tool
```

**VERIFIED** in the mic scenario: after the final tutor caption the worker went `thinking` → `llm_pipeline_failed` → `listening`. It did not corrupt the reply in this run, but a `tool` role is being pushed onto a model that rejects it. Not mine to fix; flagging for R/H. No diff requested.

## Requested outside my lane

None. Nothing outside `apps/client/e2e/discuss-quality.mjs`, `apps/client/e2e/lib/**` and this report was edited.

## Tests run

```
$ pnpm exec vitest run e2e/lib/wer.test.mjs      (apps/client)
 ✓ e2e/lib/wer.test.mjs (12 tests) 5ms
 Test Files  1 passed (1)
      Tests  12 passed (12)

$ pnpm --filter @sotto/client test
 Test Files  40 passed (40)
      Tests  398 passed (398)

$ pnpm exec eslint apps/client/e2e/discuss-quality.mjs apps/client/e2e/lib/
 (clean)

$ pnpm exec prettier --check apps/client/e2e/discuss-quality.mjs apps/client/e2e/lib/*.mjs
 All matched files use Prettier code style!
```

`pnpm -r typecheck` and `pnpm lint` results are recorded at the bottom of this file.

## NOT verified, and why

- **The pre-roll loss on a short push-to-talk press.** Not testable with a looping fake device; see the design note above.
- **Auto (VAD) turn detection.** This run never used it — scenario (a) is push-to-talk, and the half-duplex gap (BUGS-TUTOR-RUN5 #3) is therefore untouched by this evidence.
- **A five-line markdown reply.** Did not occur in this sample. The markup assertions are in the probe and passed; they are a guard, not a reproduction.
- **That WebGPU is the *only* cause of the TTS corruption.** One sentence, one machine, one browser build. It is a strong A/B, not a survey.
- **Anything about the rendered screen** (mic visibility, control layout). Deliberately out of scope; lane D owns it.
- **Nothing was deployed, pushed, or run against a hosted origin.**

## For Noel

Nothing blocking. One thing worth knowing: the tutor's voice being gibberish is **not** a "the models are too small" problem — the same 82 M Kokoro reads the same sentence perfectly when it runs on the CPU path. It is a WebGPU execution problem, and lane C has the evidence it needs.

## Full-repo checks

```
$ pnpm -r typecheck        -> 0 (all packages Done)
$ pnpm lint                -> 1, but ONLY from a file I did not touch:
    planning/design/launch-cards/shots2x.mjs  6x no-undef (process/indexedDB/console)
  Pre-existing, from 623d77a "planning(design): Sotto launch cards" on the run-8
  base this worktree branched from. `git diff --name-only 7624c59 HEAD` lists
  exactly my four files; eslint on those four is clean. Not fixing it — outside
  my lane, and eslint.config.js's Node-ESM override does not cover
  `planning/**/*.mjs`. Flagged for the orchestrator.
$ pnpm exec prettier --check <my files + this report>  -> All matched files use Prettier code style!
```
