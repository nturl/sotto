# Run 9 — lane A report (STT hygiene)

Branch `run9/A`, worktree `~/Claude/sotto-run9/wt/A`. Not pushed.

## What changed

| File | What |
|---|---|
| `packages/voice/src/browser-cascade/transcript-gate.ts` (new) | The one gate: `classifyTranscript()` + `measureSegment()` + `NOT_CAUGHT_CAPTION` |
| `packages/voice/test/browser-cascade-transcript-gate.test.ts` (new) | 44 tests |
| `packages/voice/src/browser-cascade/vad.ts` | `EnergyVad.setThresholdScale()`, `SpeechBuffer.start(preRollCapMs?)`, `HALF_DUPLEX_THRESHOLD_SCALE`, `PTT_PRE_ROLL_MS` |
| `packages/voice/test/browser-cascade-vad.test.ts` | +9 tests (half-duplex, PTT pre-roll cap) |
| `packages/voice/src/browser-cascade/worker.ts` | wiring only: `transcribeSegment`, `handleFrame`'s session state, the `ptt` case, plus one line in `speakSentence` and one each in `runTutorTurnBody` / `interruptSession` for the speaking flag |

`protocol.ts` was NOT touched: metric names are a plain `string` on
`WorkerToMain`, so `stt_rejected` needed no type change. VERIFIED.

Commits:

- `6748bce` run9(A): transcript gate + VAD half-duplex scale and PTT pre-roll cap
- `9dc99ac` run9(A): wire the transcript gate, half-duplex VAD and PTT pre-roll into the worker
- (this report)

## The gate

`classifyTranscript(text, { durationMs, rms, locale })` →
`{ verdict: 'ok' | 'hallucination' | 'too_short' | 'silent', reason }`.

Order is deliberate — capture problems before content problems, so a
fumbled push-to-talk press reads as `too_short` (dropped silently) rather
than as a hallucination (which would ask the learner to repeat something
they never said):

1. `durationMs < 250` → `too_short`
2. no words after normalization → `silent` (empty) / `hallucination` (pure punctuation: `.`, `…`)
3. `rms < 0.005` → `silent`
4. stock-phrase list (case- and punctuation-insensitive, Unicode-aware) → `hallucination`
5. subtitle-credit prefixes (`subtitles by …`) → `hallucination`
6. degenerate repetition (the old `isDegenerateTranscript` rule, restated) → `hallucination`
7. ≤ 2 words AND peak RMS < 0.02 → `hallucination`
8. otherwise `ok`

Stock list: `you, thank you, thanks, thanks for watching, thank you for
watching, thanks for watching and see you next time, bye, bye bye, goodbye,
okay, ok, hmm, mm, mhm, uh, um, ah, oh, music, blank audio, silence,
applause, inaudible` (post-normalization, so `[MUSIC]`, `(Music)` and
`music.` all collapse onto `music`).

**Threshold justification** (also in the module comment): the gate uses the
segment's **peak** ~20 ms RMS, not its mean. A real utterance arrives
wrapped in 1.2 s of pre-roll and 1 s of end-of-speech hangover, so its mean
RMS is dragged far below its peak; the peak is the statistic that answers
"was there ever speech in here?". The value, 0.02, is deliberately the same
number as `EnergyVad`'s default `rmsThreshold`, because it is the same
question the VAD asks per window. It is duplicated rather than imported so
the gate stays a dependency-free pure module; both test files pin 0.02, so
a drift fails a test instead of passing silently. `SILENT_RMS_THRESHOLD`
is 0.005 — a quarter of it, under any real voice, over dither.

**A deliberate tradeoff, pinned by a test**: the stock-phrase list is
unconditional, so a learner who says only "okay" loudly loses that turn to
one re-ask. Whisper emits those phrases on silence far more often than a
learner utters one alone, and the cost of the wrong call is one extra "say
that again" rather than a fabricated question answered as fact. Short REAL
words at speech energy still pass — `no`, `yes`, `why`, `the dog`, `Sí`,
`为什么` all have tests.

`isDegenerateTranscript` is folded into the gate but NOT deleted from
`stt-fallback.ts`: that copy feeds a different decision (is WebGPU STT
healthy), not the "is this a learner turn" one. The gate is now the only
thing standing between Whisper and the LLM. VERIFIED.

## worker.ts wiring

- `transcribeSegment` measures the segment (`measureSegment`) BEFORE
  transcribing, runs the gate before `runTutorTurn`, and on a non-ok
  verdict posts `metric { name: 'stt_rejected', detail: '<verdict>
  <reason> "<first 40 chars>"' }` and returns to `listening`. Every
  verdict but `too_short` also posts a final tutor caption with
  `NOT_CAUGHT_CAPTION`.
- The old `if (!text || (tripped && isDegenerateTranscript(text)))` is
  replaced by the gate. Note the behaviour change: a degenerate transcript
  is now rejected whether or not it also tripped the wasm fallback. A
  decoder collapse is never a question regardless of which device produced
  it. The wasm fallback logic itself is byte-for-byte unchanged.
- `ptt active` no longer calls `buffer.clear()`; it calls
  `buffer.start(PTT_PRE_ROLL_MS)` — 300 ms, not the full 1200 ms default.
  Reasoning in the code: a learner starts the word as they press, so
  clearing clipped the opening; but the press is an explicit "from here"
  marker and the preceding second may hold the tutor's own audio, so the
  full pre-roll is the opposite mistake.
- `ptt` release under 250 ms of audio is dropped without running Whisper
  at all, with the same `stt_rejected` metric and no caption.
- Half-duplex: `SessionState.speaking` is set in `speakSentence` (one added
  line) and cleared at `audio_end` in `runTutorTurnBody` and in
  `interruptSession`; `setSpeakingState` scales the VAD threshold by
  `HALF_DUPLEX_THRESHOLD_SCALE` (2.0) while it is true.

## The caption string and i18n

`NOT_CAUGHT_CAPTION = "I didn't catch that. Could you say it again?"` lives
as an exported constant in `transcript-gate.ts`, English only, per the
card. The worker has no i18n table of its own and inventing one for a
single string would be worse than this. **Request for lane D (or whoever
owns the client's i18n bridge)**: map this constant to a key such as
`voice.didNotCatch` across all nine `apps/client/src/i18n/*.json` via
`apps/client/scripts/i18n-add.mjs`, and pass the translated string into the
worker on `init` (a new optional field on `WorkerInitPayload`) so the
worker posts the learner's language. I did not add the i18n key, because
`WorkerInitPayload` is in `protocol.ts` and the client files are not mine.

## Half-duplex multiplier: 2.0, and it is NOT measured

INFERRED, not VERIFIED. I did not make an acoustic measurement — the
machine is running other lanes' work and a speaker-on measurement would
have needed exclusive use of the audio device. The reasoning (also in the
`HALF_DUPLEX_THRESHOLD_SCALE` comment): the default threshold is 0.02;
speech at normal laptop-mic distance lands around 0.1-0.3 RMS (the tests'
0.4-amplitude sine is 0.28). Doubling to 0.04 stays roughly an order of
magnitude below a real barge-in while sitting above the residue AEC leaves
of the device's own output. A larger multiplier starts eating quiet real
barge-ins, which is the worse failure: a learner who cannot interrupt is
stuck; a tutor that occasionally interrupts itself merely repeats.

**Known limitation, not fixed**: `audio_end` is posted when GENERATION
ends, not when the main thread has finished PLAYING the audio, so the gate
lifts slightly early on a long final sentence. Closing that needs a
playback-finished signal from the client — lane D's file
(`apps/client/src/voice/controller.ts`). Noted in the code too.

## sttLanguageHint: not possible on transformers.js 4.2.0

VERIFIED by reading `packages/voice/node_modules/@huggingface/transformers`
(version 4.2.0), not guessed:

- `src/models/whisper/modeling_whisper.js` `generate()` lists `prompt_ids`
  in a **commented-out** block of Whisper-specific options
  (`// prompt_ids = null,`), and never reads it. Init tokens come only from
  `_retrieve_init_tokens()`, which handles `<|startoftranscript|>`,
  `<|lang_id|>`, `<|task|>`, `<|notimestamps|>` and nothing else.
- `get_prompt_ids` — the processor method that would turn a text hint into
  those ids upstream — **does not exist** anywhere in the package's `src/`.
  The only occurrence of the name is a docstring reference in
  `src/models/whisper/generation_whisper.js`.

So there is no supported way to pass `sttLanguageHint(...)` as a Whisper
prompt on this version. `transcribeSegment` is left as it is. Escalation
per the card: this is a **missing feature**, not an API mismatch with what
`transcribeSegment` assumes, so nothing here forces a version bump; I did
not bump anything. If a future lane wants it, the only route is
`decoder_input_ids` (which `generate()` DOES accept and which bypasses
`_retrieve_init_tokens` entirely) — hand-building the
`<|startofprev|> …hint tokens… <|startoftranscript|>` sequence with the
tokenizer. That is a real piece of work with a real risk of degrading
transcription, and should be its own lane with a measured before/after.

## Tests

`COMMON.md` says `pnpm --filter @sotto/voice test`, but `packages/voice`
has no `test` script — vitest is configured only at the root. Ran the
equivalents.

```
$ pnpm exec vitest run packages/voice
 ✓ packages/voice/test/browser-cascade-transcript-gate.test.ts (44 tests) 13ms
 ✓ packages/voice/test/browser-cascade-vad.test.ts (19 tests) 7ms
 ...
 Test Files  13 passed (13)
      Tests  191 passed (191)

$ pnpm test        # the whole workspace
 Test Files  91 passed (91)
      Tests  856 passed (856)

$ pnpm -r typecheck
 packages/core / packages/content / packages/voice / apps/server / apps/client: Done

$ pnpm exec prettier --check <my five files>
 All matched files use Prettier code style!
```

Failing-first is in the history: the first `vitest run` of the two test
files reported `2 failed | 13 passed`, with
`browser-cascade-transcript-gate.test.ts` failing to collect at all
(the module did not exist yet) and six new VAD assertions failing.

`pnpm lint` exits 1 on this worktree, with 6 errors and 25 warnings — ALL
of them pre-existing in files this lane does not own
(`planning/design/launch-cards/shots2x.mjs`,
`packages/content/scripts/fill-locales.mjs`). Zero lint output mentions any
`packages/voice/**/browser-cascade*` file. VERIFIED by grepping the lint
output for my filenames and by confirming `shots2x.mjs` exists unchanged on
the base commit `7624c59`.

Worker bundle: `node apps/client/scripts/build-tutor-worker.mjs` →
`tutor worker: 8.44 MB`, and `grep -c "I didn't catch that"` /
`grep -c "stt_rejected"` are both 1 in
`apps/client/public/tutor/tutor-worker.js` and in the static export's
`apps/client/dist/tutor/tutor-worker.js`. VERIFIED.

## Browser evidence

Real, on this machine. Both phases PASS. Probe script (throwaway, outside
the repo): `~/Claude/sotto-run9/A/gate-probe.mjs`; logs
`~/Claude/sotto-run9/A/silence-run.log` and `speech-run.log`.

Setup: lane A's OWN static export (`pnpm web:export` in this worktree),
served on port 8091 by `apps/client/scripts/serve-static.mjs`; Chromium with
`--enable-unsafe-webgpu --use-angle=metal`, the fake mic, and `:8790/health`
blocked, per `apps/client/e2e/browser-tutor.mjs`. Book
`en-london-build-a-fire` (English, so it matches Noel's run-8 session);
learner en-US/en, standard tier (whisper-base + Qwen3.5-2B + Kokoro).
Model weights came from an APFS clone of the existing
`apps/client/e2e/.cache/browser-tutor-profile` into `run9-A-profile`, so the
1.2 GB download happened zero extra times on this machine (COMMON.md's
"once per machine" convention).

Both phases drive PUSH-TO-TALK, not auto turn detection, because that is
what Noel was doing when he got "you" — and because Chromium's fake audio
device starts the file at launch and loops it, so a cue placed once at the
top of a long wav has played out long before ~25 s of model loading and the
Start tap. (That was the first attempt's failure, and it is why both wavs
are short and self-looping.)

### Phase 1 — silence, PTT held 12 s over pure digital silence

```
[t+28.7s] holding push-to-talk for 12000ms
[t+40.7s] released push-to-talk
[t+40.7s] state -> thinking
[t+42.6s] [sotto-tutor] stt_ms=1969ms webgpu 12.3s
[t+42.6s] [sotto-tutor] stt_rejected=1969ms silent rms_0.0000 "you"
[t+42.7s] state -> listening
[t+42.7s] caption: Tutor: I didn't catch that. Could you say it again?

---- RESULT ----
learner captions   : []
"didn't catch that": 1
PHASE silence: PASS
```

This is Noel's run-8 failure reproduced exactly and then stopped:
**whisper-base transcribed 12.3 seconds of digital silence as the single
word "you"** — the very string in his transcript — and the gate rejected it
(`silent`, peak RMS 0.0000) before it could reach the LLM. No learner
caption, the re-ask line instead, state back to `listening`. On the old
code that "you" would have gone to Qwen3.5-2B as the learner's question.
VERIFIED.

### Phase 2 — the real question, same book, same profile

```
[t+34.5s] holding push-to-talk for 12000ms
[t+46.5s] released push-to-talk
[t+51.4s] [sotto-tutor] stt_ms=4882ms webgpu 12.3s
[t+51.6s] caption: You: Tell me more about the gray husky dog.

---- RESULT ----
learner captions   : ["You: Tell me more about the Grey Husky Dog.",
                      "You: Tell me more about the gray husky dog."]
"didn't catch that": 0
stt_rejected lines : []
full timeline      : [
  "You: Tell me more about the Grey Husky Dog.",
  "You: Tell me more about the gray husky dog.",
  "Tutor: The dog was a big, gray husky, and it knew that the man was not ready to leave."
]
PHASE speech: PASS
```

Two captions because the session was still in auto mode for the first few
seconds after Start (the worker only switches to `push` on the first `ptt`
message), so the energy VAD caught one pass of the looping wav at t+36.6 s
before the held segment landed at t+51.4 s. Both are the real sentence; the
gate passed both and rejected neither. The 12.3 s held segment is the
push-to-talk path with the kept 300 ms pre-roll, and it transcribed the
opening word "Tell" intact. VERIFIED.

### One thing that was NOT lane A's and is worth flagging

Both speech-phase turns logged, from the worker:

```
[sotto-tutor] llm_tools_unsupported=0ms Qwen3.5-2B-q4f16_1-MLC is not
supported for ChatCompletionRequest.tools. Currently, models that support
function calling are: Hermes-2-Pro-Llama-3-8B..., Hermes-3-Llama-3.1-8B...
```

So on the standard tier the browser tutor has **no tool calling at all** —
`save_vocabulary`, `reading`, and the rest are unavailable with Qwen3.5-2B
under WebLLM. Not my file and not my card; flagging it for lane B / the
orchestrator. VERIFIED (observed twice, this run).

### Operational note for other lanes running browser probes

The speech phase hung on its first attempt: the worker never posted
`stt_load_ms` and the session never reached `listening`, while a previous
probe's Chromium GPU processes were still alive. Killing the leftover
Chromium (`pkill -f run9-A-profile`) and re-running produced
`stt_load_ms=3066ms webgpu` in three seconds. Two probe browsers must not
overlap on this machine.

## Requested outside my lane

1. **i18n for the rejection line** (lane D / client): see "The caption
   string and i18n" above. It needs an i18n key added via
   `apps/client/scripts/i18n-add.mjs` with real translations for ca, es,
   fr, it, pt, ro, zh-Hans, zh-Hant, plus an optional field on
   `WorkerInitPayload` in `protocol.ts` to carry it into the worker. Exact
   diff I would want in `protocol.ts`:

   ```diff
      allowDownload: boolean;
   +  /** Localized fixed lines the worker posts as captions. Supplied by
   +   * the client so the worker needs no i18n table of its own. */
   +  strings?: { didNotCatch?: string };
   ```

   and in `worker.ts`'s gate branch:
   `text: session.payload.strings?.didNotCatch ?? NOT_CAUGHT_CAPTION`.

2. **Playback-finished signal** (lane D, `controller.ts`): so the
   half-duplex gate can lift on real audio end rather than generation end.

3. **Possible collision with lane C** in `speakSentence`: I added exactly
   one line there (`setSpeakingState(s, true);` immediately after
   `setState('speaking')`) even though the card lists `speakSentence` as
   not mine, because card item 4 explicitly says to track the speaking
   state "from `speakSentence`/`audio_end`". Whoever integrates should keep
   that line if lane C rewrites the function.

## Not verified

- The 2.0 half-duplex multiplier is reasoned, not measured (above).
- No change was made to how Whisper is invoked, so nothing here improves
  transcription accuracy — the gate only decides what to do with the
  transcript.
- The stock-phrase list is English-centric. Whisper's silence
  hallucinations in the other eight interface locales were not enumerated;
  `TranscriptContext.locale` is accepted and currently unused, so a lane
  with a recording set can add per-locale lists without changing any call
  site.
