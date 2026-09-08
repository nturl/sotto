# Run 9 — lane H, the fix pass on lane R's findings

Worktree `~/Claude/sotto-run9/wt/integ`, branch `run9/integration`, six
commits on top of `db5b9c6` (lane R's review). Evidence under
`~/Claude/sotto-run9/AFTER2/`. Not pushed.

**Headline: every P0/P1 the orchestrator assigned is fixed, and the
re-run acceptance probe scores 16/18 — the two failures are P0-2 (the
trailing question), which my A/B runs show is a coin flip at 2B, not a
regression from anything in this lane.** Details in §"Acceptance" below;
read that before reading the fixes as clean.

## Commits

| SHA | What |
|---|---|
| `be5d657` | P1-1, P1-2 (pure half), P1-8 — the transcript gate |
| `6c23c67` | P1-3, P1-4, P1-5 (engine half), P1-2 wiring — the drain window |
| `bdaf915` | P1-5 (metric), P1-6 — the reply budget |
| `b116314` | P0-3 — the Kokoro download size |
| `94876b9` | P1-7 — compact rule 6 |
| `cd3d708` | P2 — WER numerals, D-report correction |

## P0-1 and P0-2: closed by ACCEPTANCE.md, no code change

Per the orchestrator's decision, and recorded here rather than re-argued:

- **P0-1** ("nobody has ever run the integrated worker") was answered by
  the H0 acceptance run — the integrated bundle ran end to end, mic frame
  through audio out, on `run9/integration`. It has now run four more times
  in this lane, on a bundle that also carries every fix below.
- **P0-2** was closed on H0's evidence that the reply ended in `?` in both
  scenarios at WER 0.026. **My runs do not reproduce that**, and I am
  re-opening it as carried work rather than letting the closure stand
  silently. See §Acceptance.

## What changed

### P0-3 — the panel now states the size that is actually downloaded
`packages/voice/src/browser-cascade/models.ts` (`b116314`)

`KOKORO.sizeMb` 90 → **312**. Measured from the repo manifest rather than
estimated: `onnx/model.onnx` (the fp32 file WebGPU now loads) is
325,532,232 bytes = 310.4 MB in the binary convention every other row in
this file uses, against `onnx/model_quantized.onnx`'s 92,361,116 bytes =
88.1 MB, which is where the old 90 came from. Plus tokenizer/config and
the one 0.5 MB `af_heart` voice kokoro-js fetches — the same rounding as
the whisper rows. VERIFIED against
`https://huggingface.co/api/models/onnx-community/Kokoro-82M-v1.0-ONNX?blobs=true`;
the Chromium profile cache stores these inside the CacheStorage database,
so there is no per-file size to read off disk.

`sizeMb` has no device axis and the panel renders it *before* the worker
has probed for WebGPU, so, as directed, it shows the larger number to
everyone. The comment on `KOKORO` says why, and says that a device-aware
size means a per-device `sizeMb` on `TutorModelSpec` plus a probe in the
panel — not a smaller constant. `TutorModelsPanel.tsx` and
`app/settings/models.tsx` both read the field, so the row, the
"needs download" total and the Settings `eventualTotal` all move together;
no label needed editing. Standard tier total: 1240 → **1462 MB**.

No panel test existed on the number. Added one
(`packages/voice/test/browser-cascade.test.ts`): the TTS row is ≥ 300 MB,
and each tier total is the sum of the three rows the panel lists.

### P1-1 — the gate counts CJK
`transcript-gate.ts` (`be5d657`)

`countWords(normalized, locale)` replaces `normalized.split(' ')`. Where
the text contains Han/kana it segments with `Intl.Segmenter` (`locale`,
now actually read off `TranscriptContext`, is the hint) and falls back to
one CJK character per word when `Intl.Segmenter` is missing or throws.
Everything else is unchanged — a space-delimited transcript takes exactly
the old path.

Tests: 为什么这只狗在雪地里不高兴？ is `ok` at QUIET_RMS **and** at
LOUD_RMS; 好的 and 嗯 are still `hallucination` at QUIET_RMS; the
segmenter is pinned to disagree with a plain split.

### P1-2 — the PTT pre-roll no longer hides a mis-tap
`vad.ts`, `transcript-gate.ts`, `worker.ts` (`be5d657`, `6c23c67`)

`SpeechBuffer` gained `seededPreRollMs` (set by `start()`, cleared by
`clear()`, deliberately **not** by `end()` so the release path can read it
after closing the segment). `spokenDurationMs(samples, rate, seededMs)`
subtracts it, and the worker's `ptt` release reads the seed before calling
`end()`.

Test (the directive's exact case): 12 × 50 ms frames of rolling pre-roll,
`start(PTT_PRE_ROLL_MS)`, a single 50 ms frame, `end()` → the segment
measures 350 ms whole, `seededPreRollMs` is 300, `spokenDurationMs` is 50,
and `classifyTranscript` at that duration returns `too_short` — the one
verdict `worker.ts` drops **without** posting a caption.

### P1-3 + P1-4 — the half-duplex gate now covers the drain, and a barge-in inside it speaks up
new `packages/voice/src/browser-cascade/speaking-window.ts`, plus
`protocol.ts`, `provider.ts`, `worker.ts` (`6c23c67`)

- **New main→worker message `playback_drained`.** The provider arms a
  timer on every `audio` chunk for its own `playbackRemainingMs()` (the
  value lane D already computed for the label), re-arms if a chunk lands
  mid-queue, and posts the message when the queue is really empty. Cleared
  on `interrupt()`, on a cancelled `audio_end`, and on teardown.
- **The worker holds `speaking` until that message or a safety timeout.**
  `runTutorTurnBody` no longer clears the flag at the end of generation; it
  calls `releaseSpeakingWhenDrained`, which holds for
  `releaseAfterMs(queuedMs)` = queued + 500 ms. A stale drain timer from
  the previous turn is cancelled when a new turn starts (the flag itself
  stays up). Losing the message costs a late release, not a stuck gate.
- **A barge-in during the drain posts `listening`.** `interruptSession`
  records whether a drain timer was pending and calls
  `announcesListening({hadAbort, draining})`. A state event is also what
  bumps `controller.ts`'s epoch, which is what cancels the already-armed
  `holdSpeaking` flush — so the screen cannot sit in SPEAKING with the
  speakers silent.

Pure logic (`PlaybackWindow`, `releaseAfterMs`, `announcesListening`) is a
tested module, 11 tests; the worker and provider carry only timers and
wires. The multiplier `HALF_DUPLEX_THRESHOLD_SCALE = 2.0` is still
unmeasured — carried, see below.

### P1-5 — the budget abort is now safe, and audible in the log
`worker.ts`, `llm-turn.ts` (`6c23c67`, `bdaf915`)

`WebLlmEngine.chat`'s abort handler kept `void interruptGenerate()`, so
`chat()` could return before WebLLM had unwound — and `currentTurnPromise`,
whose entire job is to stop a second `create()` racing that cleanup, is
the promise that resolves with it. The interrupt promise is now captured
and awaited in `chat()`'s `finally`, so `currentTurnPromise` genuinely
covers the unwind.

New `TutorTurnDeps.onMetric`, wired by the worker to a `metric` message;
`llm_capped` is posted with the mode and the sentence count when the
budget fires. **It fired live** in acceptance run 1:
`[t+76.3s] [sotto-tutor] llm_capped=0ms discuss 3`.

Test: a fake engine whose `chat()` settles only when released. The cap
fires, the stream breaks, three sentences are spoken — and `run()` does
**not** resolve until the engine call settles. That is the property
`currentTurnPromise` needs and did not have.

### P1-6 — 160 → 240 tokens for the conversational modes
`reply-shape.ts` (`bdaf915`)

`maxTokensForMode` returns 240 for discuss/read_with_me/pronunciation;
`read_to_me` keeps 400. Test pins the numbers and asserts headroom for
three sentences (~70 tokens) plus the smallest useful fenced tool block
(~40).

**This one has live evidence, unexpectedly.** In the 160-token control run
I did while bisecting the acceptance failures (below), the text scenario's
reply was cut off mid-sentence — `"...it is not a small, fluffy"` — Kokoro
read the fragment, and the round-trip WER went to **0.649**, failing an
assertion that has never failed before. That is exactly P1-6's mechanism
(truncation inside the budget) showing up in prose rather than in a tool
block. 240 has not truncated in any of the three runs at that setting.

### P1-7 — compact rule 6 stops forbidding `[[reading:]]`
`packages/core/src/prompt.ts` (`94876b9`)

Rule 6 was "…Nothing else goes in double brackets." — last in a prompt
whose rule order lane B deliberately tuned for recency, contradicting the
read_to_me guidance above it. It now reads:

> 6. Three markers exist and no others: `[[pace: slow]]` and
> `[[pace: normal]]`, which start your next reply when the learner asks you
> to slow down or to go at normal speed, and `[[reading: ...]]`, which
> read_to_me begins its reply with. Never invent a different
> double-bracket marker.

The old test only asserted the marker string appeared somewhere in the
prompt and could not see the contradiction. The new one slices the prompt
at `Rules. Follow every one.` and asserts the rules block contains
`[[reading: ...]]` and does not contain the old sentence; a second test
pins that invented markers are still forbidden, in all four modes.

Not verified on the real model: read_to_me was never driven live in run 9
by any lane, and this probe does not exercise it. Carried.

### P1-8 — "okay" is an answer
`transcript-gate.ts` (`be5d657`)

The stock list is split. `QUIET_ONLY_HALLUCINATIONS` = okay / ok / bye /
thanks / thank you, rejected **only** when `rms < SPEECH_RMS_THRESHOLD`.
Everything else — `you`, the subtitle-corpus phrases, the bracketed sound
tags, the fillers — stays unconditional.

One judgement call worth flagging: the directive said "below the silence
threshold". Taken literally that is `SILENT_RMS_THRESHOLD` (0.005), but
the `silent` verdict already fires before the stock check, so the entries
would be unreachable dead code. I used `SPEECH_RMS_THRESHOLD` (0.02) —
lane R's own recommendation, and the one that makes "at normal RMS they
pass" true of the ambiguous quiet band rather than vacuously.

### P2 — the two I was asked to take
`apps/client/e2e/lib/wer.mjs`, `planning/run9/D-report.md` (`cd3d708`)

- `normalizeForWer` spells whole numbers 0–999 ("50" → "fifty",
  "25" → "twenty five", matching "twenty-five"). Past 999 the readings
  diverge and it leaves the digits alone rather than inventing errors.
  Six new assertions. **This paid immediately**: acceptance run 1's reply
  contained "50", "60" and "70" and scored WER **0.000**; under the old
  scorer those three would have been three word errors on a 69-word
  reference (0.043 — still inside the gate, but for the wrong reason).
- D-report §7's claim that the "you" in Noel's transcript now carries
  *Not what you said? Type it* is corrected in place: the gate suppresses
  that caption entirely, so the affordance applies to transcripts that are
  real but wrong.

## Tests, typecheck, format

```
$ pnpm test
 Test Files  99 passed (99)          (was 98)
      Tests  991 passed (991)        (was 955)          exit 0

$ pnpm -r typecheck
 packages/core, packages/content, packages/voice, apps/server, apps/client: Done
                                                        exit 0

$ pnpm exec prettier --write <my 19 files>              clean

$ pnpm lint
 ✖ 31 problems (6 errors, 25 warnings)
```

All 6 lint errors are the pre-existing ones in
`planning/design/launch-cards/shots2x.mjs` (confirmed: every error line in
the output belongs to that file). No warning is in a file I touched.

## Acceptance

Rebuilt and re-run exactly as ACCEPTANCE.md documents — same symlinked
model cache, `pnpm build:tutor-worker` then `pnpm web:export` (both exit
0), then:

```
$ cd ~/Claude/sotto-run9/wt/integ
$ PORT=8096 \
  OUT_DIR=/Users/noelturlington/Claude/sotto-run9/AFTER2 \
  PROFILE_NAME=discuss-quality-profile \
  node apps/client/e2e/discuss-quality.mjs
```

`ps` before the build found **zero** `chrome-headless-shell` and zero
playwright processes — the foreign Chromium H0 recorded was gone, so
nothing was contended for and nothing was waited on.

Bundle freshness, VERIFIED by grep on
`apps/client/public/tutor/tutor-worker.js`: `playback_drained` 1,
`llm_capped` 1, `quiet_stock` 1.

### Run 2 (`AFTER2/run2.log`), verbatim

```
===== discuss-quality: PASS/FAIL =====
  [PASS] scorer  self-test: known-good 24 kHz WAV round-trips at WER <= 0.2                — WER=0.000 heard="The dog is unhappy but loyal."
  [PASS] setup   no server anywhere: /health unreachable, so the browser cascade must run  — status 0
  [PASS] mic     fake capture device delivered audio frames at all                         — 4083 frames, 10.9s
  [PASS] mic     learner caption contains "husky" or "dog"                                 — "Tell me more about the grey husky dog Tell me about the gray husky Dog"
  [PASS] mic     tutor reply is at most 3 sentences                                        — 3 sentence(s)
  [PASS] mic     tutor reply has no list/emphasis markup                                   — clean
  [FAIL] mic     tutor reply ends with "?"                                                 — m cabin waiting at the end of the trail.
  [PASS] mic     tutor reply mentions the dog
  [PASS] mic     spoken audio is at least 1s                                               — 17.40s
  [PASS] mic     spoken audio RMS above 0.005 and finite                                   — rms=0.0702 nan=0
  [PASS] mic     round trip: spoken audio matches the caption (WER <= 0.35)                — WER=0.017
  [PASS] text    tutor reply is at most 3 sentences                                        — 3 sentence(s)
  [PASS] text    tutor reply has no list/emphasis markup                                   — clean
  [FAIL] text    tutor reply ends with "?"                                                 — m cabin waiting at the end of the trail.
  [PASS] text    tutor reply mentions the dog
  [PASS] text    spoken audio is at least 1s                                               — 17.40s
  [PASS] text    spoken audio RMS above 0.005 and finite                                   — rms=0.0702 nan=0
  [PASS] text    round trip: spoken audio matches the caption (WER <= 0.35)                — WER=0.017
  16/18 passed
```

Metric lines:

```
[t+51.4s] [sotto-tutor] stt_load_ms=2059ms webgpu
[t+53.0s] [sotto-tutor] llm_load_ms=3691ms
[t+61.5s] [sotto-tutor] stt_ms=1295ms webgpu 10.9s
[t+61.5s] [sotto-tutor] llm_tools_unsupported=0ms Qwen3.5-2B-q4f16_1-MLC is not supported ...
[t+69.3s] [sotto-tutor] tts_load_ms=1370ms webgpu/fp32
```

No `error` message of any kind on the worker channel, either scenario.
The only console line is the probe's own deliberate `/health` block
(`net::ERR_FAILED`), which the "no server anywhere" assertion depends on.
`stt_rejected` never fired (unchanged: the fixture is an 11 s deliberate
hold, which is not what the gate catches).

### Against H0

| # | Assertion | H0 | H (run 2) | |
|---|---|---|---|---|
| 1 | scorer self-test WER ≤ 0.2 | PASS (0.000) | PASS (0.000) | held |
| 2 | setup: /health unreachable | PASS | PASS | held |
| 3 | mic: fake device delivered frames | PASS (4065) | PASS (4083) | held |
| 4 | mic: learner caption names the dog | PASS | PASS | held |
| 5 | mic: reply ≤ 3 sentences | PASS (3) | PASS (3) | held |
| 6 | mic: no list/emphasis markup | PASS | PASS | held |
| 7 | **mic: reply ends with "?"** | PASS | **FAIL** | **flipped** |
| 8 | mic: reply mentions the dog | PASS | PASS | held |
| 9 | mic: audio ≥ 1 s | PASS (12.97 s) | PASS (17.40 s) | held |
| 10 | mic: RMS > 0.005, finite | PASS (0.0725) | PASS (0.0702) | held |
| 11 | mic: round trip WER ≤ 0.35 | PASS (0.026) | PASS (0.017) | held |
| 12 | text: reply ≤ 3 sentences | PASS (3) | PASS (3) | held |
| 13 | text: no list/emphasis markup | PASS | PASS | held |
| 14 | **text: reply ends with "?"** | PASS | **FAIL** | **flipped** |
| 15 | text: reply mentions the dog | PASS | PASS | held |
| 16 | text: audio ≥ 1 s | PASS (12.97 s) | PASS (17.40 s) | held |
| 17 | text: RMS > 0.005, finite | PASS (0.0591) | PASS (0.0702) | held |
| 18 | text: round trip WER ≤ 0.35 | PASS (0.026) | PASS (0.017) | held |

### Why 7 and 14 flipped, and why it is not my changes

I did not accept "probably variance". Four probe runs, bisecting:

| Run | Build | Reply ends "?" | Score | Third sentence, verbatim tail |
|---|---|---|---|---|
| 1 | HEAD (240 tokens, new rule 6) | no | 16/18 | "…but it knew the danger." |
| noprompt | 240 tokens, **old** rule 6 | no | 16/18 | "…the danger better than the man did." |
| 2 | HEAD (240 tokens, new rule 6) | no | 16/18 | "…a warm cabin waiting at the end of the trail." |
| 160 | **160 tokens**, new rule 6 | no | **15/18** | "…it is not a small, fluffy" *(truncated)* |

Four runs, four **different** replies, none ending in a question — with
the prompt change in and out, and with the token ceiling at both values.
Reverting either of my two prompt-affecting changes does not bring the
question back, and the 160 control is strictly worse (it truncated
mid-sentence and blew the WER assertion to 0.649). Decoding is
`temperature: 0.4`, so the reply is a fresh sample every run.

So: **the trailing question is a coin flip at 2B, exactly as lane B
measured (0/4 replies) and lane R argued in P0-2.** H0's 18/18 was one
sample of it landing. Combined, the record is now 2 replies with a
question (H0) and 8 without (lane B's 4, mine at 4 runs × the same reply
in both scenarios). Nothing in run 9's integration made the model worse;
what changed is how many samples we have.

**P0-2 is therefore back open and is Noel's / the orchestrator's call**,
in the terms lane B and lane R already framed: either a
question-only continuation call after the capped reply, or amend the
acceptance criterion. It is not something H can fix by prompting — I have
now driven the real model four more times and the ceiling holds.

## Carried, not fixed

Everything below was explicitly out of scope for this lane, or is newly
surfaced by it. Nothing here is done.

1. **P0-2, re-opened.** Above. The one thing in this run still failing its
   own stated gate.
2. **`llm_tools_unsupported` still fires** every session. Unowned in run 9;
   the request still offers OpenAI-shaped tools to a model that rejects
   them, and the fallback path (P1-6's fenced block) is the only tool path
   that works. The clean fix is to stop offering them for known-rejecting
   model ids.
3. **The whole `[[reading:]]` path is untested against the real model.**
   P1-7 fixes a contradiction the prompt tests can now see; nobody has run
   read_to_me on the browser cascade in run 9.
4. **`HALF_DUPLEX_THRESHOLD_SCALE = 2.0` is unmeasured** (lane A said so).
   My drain fix means it now applies for the *right* window, which makes
   measuring it worth doing rather than moot.
5. **The `playback_drained` round trip is not covered by a live probe.**
   The pure logic is tested and the wiring is small, but no probe in this
   repo drives a barge-in during a drain. `voice-live.mjs` is where that
   would go.
6. **P2s I was told to skip**: `worker.ts` still 1,200+ lines with no unit
   tests; the golden fixture pins one context shape; two acceptance
   assertions (≤3 sentences, no markup) are now guaranteed by
   construction; `playPcm`'s test re-implements `floatToPcm16`;
   `SILENT_RMS_THRESHOLD` unmeasured against a real quiet speaker; `fp16`
   still reachable via a worker global; `NOT_CAUGHT_CAPTION` and
   `didNotCatch.ts` equal only by convention; `micPressAction` consulted on
   release; `turnMode` one-way.
7. **`voice-live.mjs` still not run** (H0 skipped it too). No foreign
   Chromium was in the way this time, but it tests the main tree, not this
   branch.

## Not done, and why

- **Not pushed**, as directed.
- **`dist/` and `public/tutor/tutor-worker.js` are gitignored**, so the
  four builds left no tracked change. The tree at HEAD is the 240-token,
  new-rule-6 build; the two control builds were reverted in place and the
  final export rebuilt from HEAD (`pnpm test` re-run clean afterwards).
- **The only untracked path is `apps/client/e2e/.cache`**, H0's model-cache
  symlink. Untouched.
