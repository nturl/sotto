# Run 9 — acceptance (H0): the integrated branch against lane E's probe

Worktree `~/Claude/sotto-run9/wt/integ`, branch `run9/integration` (lanes A–E
integrated). Nothing in `apps/`, `packages/` or `scripts/` was edited to
produce this file — the only working-tree change outside `planning/` is an
untracked symlink, `apps/client/e2e/.cache -> ~/Claude/sotto/apps/client/e2e/.cache`,
which is lane A's model-cache convention (COMMON.md's "download once per
machine"). Evidence under `~/Claude/sotto-run9/AFTER/`.

**Result: 18/18 PASS, exit 0, on the first run.** Baseline was 14/18. All four
baseline failures flipped to PASS. No run 2 was needed — nothing in run 1
looked environmental.

## Exact commands

Model cache wired first, so no weights were re-downloaded:

```
$ cd ~/Claude/sotto-run9/wt/integ
$ ln -s /Users/noelturlington/Claude/sotto/apps/client/e2e/.cache apps/client/e2e/.cache
$ cp -c -R ~/Claude/sotto-run9/wt/E/apps/client/e2e/.cache/discuss-quality-profile \
           /Users/noelturlington/Claude/sotto/apps/client/e2e/.cache/
$ cp -c -R ~/Claude/sotto-run9/wt/E/apps/client/e2e/.cache/hf-node \
           /Users/noelturlington/Claude/sotto/apps/client/e2e/.cache/
```

(`cp -c` is an APFS clone — 3.8 GB of Chromium profile and 280 MB of
Whisper-in-Node weights moved into the shared cache at zero extra disk and
zero download. Confirmed working: the probe's `whisper-base (node, cpu)
loaded in 0.8s` and the browser's model gate cleared in 69 s, versus the
~1.2 GB cold download lane E paid.)

Build. `apps/client/package.json` has `web:export` = `node scripts/build-web.mjs`,
and `build-web.mjs:53-55` shells out to `build-tutor-worker.mjs` **first**,
before the Expo export — so the worker bundle is a prerequisite of the export,
not a sibling step. Run explicitly anyway, in that order:

```
$ cd ~/Claude/sotto-run9/wt/integ/apps/client
$ pnpm build:tutor-worker     # -> ~/Claude/sotto-run9/AFTER/build-tutor-worker.log
  tutor worker: 8.45 MB -> apps/client/public/tutor/tutor-worker.js (+8 onnxruntime files)
$ pnpm web:export             # -> ~/Claude/sotto-run9/AFTER/web-export.log
  Exported: dist
  web build: 9 packs copied to dist/content/packs
  web build: landing page + 4 fonts copied to dist/
  web build: PWA manifest + sw-manifest.json written (39 shell files, v1788755418610.646)
```

Both exit 0.

The probe. It serves its own static host out of `apps/client/dist` (this
worktree's, resolved from the script's `__dirname`), so only `PORT` had to
move to 8096:

```
$ cd ~/Claude/sotto-run9/wt/integ
$ PORT=8096 \
  OUT_DIR=/Users/noelturlington/Claude/sotto-run9/AFTER \
  PROFILE_NAME=discuss-quality-profile \
  node apps/client/e2e/discuss-quality.mjs
  ...
  PROBE_EXIT=0
```

Full stdout at `~/Claude/sotto-run9/AFTER/run1.log`; the probe also wrote its
own `discuss-quality.log`, `discuss-quality-results.json`, `mic.wav`,
`text.wav`, `mic-turn.json`, `text-turn.json` and `final.png` into the same
directory. The log confirms the export under test was this worktree's —
`Serving dist on http://localhost:8096` and the fake-mic fixture resolved
through the new symlink.

## PASS/FAIL, verbatim

```
===== discuss-quality: PASS/FAIL =====
  [PASS] scorer  self-test: known-good 24 kHz WAV round-trips at WER <= 0.2                — WER=0.000 heard="The dog is unhappy but loyal."
  [PASS] setup   no server anywhere: /health unreachable, so the browser cascade must run  — status 0
  [PASS] mic     fake capture device delivered audio frames at all                         — 4065 frames, 10.8s
  [PASS] mic     learner caption contains "husky" or "dog"                                 — "Tell me more about the grey husky dog."
  [PASS] mic     tutor reply is at most 3 sentences                                        — 3 sentence(s)
  [PASS] mic     tutor reply has no list/emphasis markup                                   — clean
  [PASS] mic     tutor reply ends with "?"                                                 — n's judgment could. What does that mean?
  [PASS] mic     tutor reply mentions the dog                                            
  [PASS] mic     spoken audio is at least 1s                                               — 12.97s
  [PASS] mic     spoken audio RMS above 0.005 and finite                                   — rms=0.0725 nan=0
  [PASS] mic     round trip: spoken audio matches the caption (WER <= 0.35)                — WER=0.026 heard="The dog was big, gray, and husky, and it walked beside the man. It knew that the time was not for traveling, and its instinct told a true story than the man's judgment could. What does that mean?"
  [PASS] text    tutor reply is at most 3 sentences                                        — 3 sentence(s)
  [PASS] text    tutor reply has no list/emphasis markup                                   — clean
  [PASS] text    tutor reply ends with "?"                                                 — n's judgment could. What does that mean?
  [PASS] text    tutor reply mentions the dog                                            
  [PASS] text    spoken audio is at least 1s                                               — 12.97s
  [PASS] text    spoken audio RMS above 0.005 and finite                                   — rms=0.0725 nan=0
  [PASS] text    round trip: spoken audio matches the caption (WER <= 0.35)                — WER=0.026 heard="The dog was big, gray, and husky, and it walked beside the man. It knew that the time was not for traveling, and its instinct told a true story than the man's judgment could. What does that mean?"
  18/18 passed
```

## Tutor captions, verbatim, as the worker emitted them

Read off the worker→main message stream (the probe wraps `window.Worker`), not
scraped from the DOM.

**mic** — learner, final:

```
Tell me more about the grey husky dog.
```

**mic** — tutor, streamed in three sentences, then final:

```
The dog was big, gray, and husky, and it walked beside the man.
It knew that the time was not for traveling, and its instinct told a truer story than the man's judgment could.
What does that mean?
```

```
The dog was big, gray, and husky, and it walked beside the man. It knew that the time was not for traveling, and its instinct told a truer story than the man's judgment could. What does that mean?
```

**text** — learner, final:

```
Tell me more about the gray husky dog.
```

**text** — tutor, streamed in three sentences, then final (byte-identical to
the mic reply):

```
The dog was big, gray, and husky, and it walked beside the man.
It knew that the time was not for traveling, and its instinct told a truer story than the man's judgment could.
What does that mean?
```

```
The dog was big, gray, and husky, and it walked beside the man. It knew that the time was not for traveling, and its instinct told a truer story than the man's judgment could. What does that mean?
```

Both replies are prose, three sentences, no markdown, no straight double
quotes (lane C's `tts-text.ts` concern from E's report does not arise here —
the model produced none), and both end in exactly one question.

## WER

| Scenario | caption words | errors | WER | baseline WER |
|---|---|---|---|---|
| scorer self-test | — | — | **0.000** | 0.000 |
| mic | 38 | 1 | **0.026** | 1.667 |
| text | 38 | 1 | **0.026** | 1.000 |

Round trip heard, both scenarios, identically:

```
The dog was big, gray, and husky, and it walked beside the man. It knew that the time was not for traveling, and its instinct told a true story than the man's judgment could. What does that mean?
```

The single error in each is `truer` → `true` — one Whisper substitution on a
comparative, not a synthesis fault. Gate is 0.35; both are 13× inside it.

Captured audio, both scenarios: `12.97s @ 24000 Hz, rms=0.0725 peak=0.470
nan=0 (3 scheduled buffers)`.

## The metric lines asked for

```
[t+76.9s] [sotto-tutor] stt_load_ms=2189ms webgpu
[t+78.5s] [sotto-tutor] llm_load_ms=3809ms
[t+86.6s] [sotto-tutor] stt_ms=1064ms webgpu 10.8s
[t+95.8s] [sotto-tutor] tts_load_ms=2613ms webgpu/fp32
```

- **`tts_load` — device/dtype: `webgpu/fp32`.** This is the line that matters.
  Baseline was `tts_load_ms=1950ms webgpu` on lane E's run with `dtype: 'q8'`.
  Lane C kept the WebGPU device and moved the dtype to fp32 rather than
  falling back to wasm, which is the cheaper of the two fixes E floated, and
  on this evidence it works: same device, new dtype, WER 1.667 → 0.026.
  Load cost went 1950 ms → 2613 ms (+663 ms) for fp32 weights. **VERIFIED**
  for this one machine and this one sentence pair; it is a strong A/B against
  E's baseline, not a survey (E's own caveat still stands).
- **`stt_rejected` — never emitted. Zero occurrences in the whole log.**
  Lane A's gate did not reject anything in this run. That is the expected
  outcome, not a gap in the fix: an 11 s deliberate push-to-talk hold over a
  4.59 s speech fixture is precisely the case the gate is not meant to catch.
  E flagged this in advance ("my 11 s hold is precisely the case the missing
  gate does not affect"). **This probe still does not prove lane A's gate.**
  Its proof lives in `transcript-gate.ts`'s unit tests and in lane A's own
  silence-phase browser evidence, not here. **INFERRED** that the gate is
  correct; this run is silent on it.
- **`llm_tools_unsupported` — still fires, unchanged.**

  ```
  [t+86.6s] [sotto-tutor] llm_tools_unsupported=0ms Qwen3.5-2B-q4f16_1-MLC is not supported for ChatCompletionRequest.tools. Currently, models that support function calling are: Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC, Hermes-2-Pro-Llama-3-8B-q4f32_1-MLC, Hermes-2-Pro-Mistral-7B-q4f16_1-MLC, Hermes-3-Llama-3.1-8B-q4f32_1-MLC, Hermes-3-Llama-3.1-8B-q4f16_1-MLC
  ```

  Fired once, in the mic scenario, at `state -> thinking`. E found this and
  flagged it for R/H; no lane owned it, and nothing in run 9 fixed it.

## Error lines

**The `llm_pipeline_failed` error from the baseline is gone.** E's run went
`thinking` → `llm_pipeline_failed: Role is not supported: tool` → `listening`
after the final caption. This run has **no `error` message of any kind** on
the worker channel, in either scenario. The `tool` role is evidently no longer
being pushed onto the model — but `llm_tools_unsupported` still being emitted
means the tools are still being *offered*, so the request is still shaped
wrongly even though the turn now survives it. **VERIFIED** that the error
stopped; **INFERRED** as to why.

The only page/console output, all benign:

```
page/console errors:
  - console: Failed to load resource: net::ERR_FAILED
  - console: 2026-09-07 00:31:39.479400 [W:onnxruntime:, session_state.cc:1280 VerifyEachNodeIsAssignedToAnEp] Some nodes were not assigned to the preferred execution providers which may or may not have an negative impact on performance. e.g. ORT explicitly assigns shape related ops to CPU to improve perf.
  - console: 2026-09-07 00:31:39.481199 [W:onnxruntime:, session_state.cc:1282 VerifyEachNodeIsAssignedToAnEp] Rerunning with verbose output on a non-minimal build will show node assignments.
  - console: 2026-09-07 00:32:01.305299 [W:onnxruntime:, session_state.cc:1280 VerifyEachNodeIsAssignedToAnEp] Some nodes were not assigned to the preferred execution providers which may or may not have an negative impact on performance. e.g. ORT explicitly assigns shape related ops to CPU to improve perf.
  - console: 2026-09-07 00:32:01.306399 [W:onnxruntime:, session_state.cc:1282 VerifyEachNodeIsAssignedToAnEp] Rerunning with verbose output on a non-minimal build will show node assignments.
```

`net::ERR_FAILED` is the probe's own deliberate block on `:8790/health` — the
assertion "no server anywhere" depends on it and passed. The onnxruntime lines
are informational ORT execution-provider notices, two per model load.

## Line-by-line against E's baseline

`node apps/client/e2e/discuss-quality.mjs` on unfixed `run9/E` (= run 8 HEAD
`7624c59`) scored **14/18, exit 1**. This run scores **18/18, exit 0**.

| # | Assertion | Baseline | Now | |
|---|---|---|---|---|
| 1 | scorer self-test WER ≤ 0.2 | PASS (0.000) | PASS (0.000) | held |
| 2 | setup: /health unreachable | PASS | PASS | held |
| 3 | mic: fake device delivered frames | PASS (4051 / 10.8 s) | PASS (4065 / 10.8 s) | held |
| 4 | mic: learner caption names the dog | PASS | PASS | held |
| 5 | mic: reply ≤ 3 sentences | PASS (1) | PASS (3) | held |
| 6 | mic: no list/emphasis markup | PASS | PASS | held |
| 7 | **mic: reply ends with "?"** | **FAIL** | **PASS** | **FLIPPED** |
| 8 | mic: reply mentions the dog | PASS | PASS | held |
| 9 | mic: audio ≥ 1 s | PASS (3.55 s) | PASS (12.97 s) | held |
| 10 | mic: RMS > 0.005, finite | PASS (0.0560) | PASS (0.0725) | held |
| 11 | **mic: round trip WER ≤ 0.35** | **FAIL (1.667)** | **PASS (0.026)** | **FLIPPED** |
| 12 | text: reply ≤ 3 sentences | PASS (2) | PASS (3) | held |
| 13 | text: no list/emphasis markup | PASS | PASS | held |
| 14 | **text: reply ends with "?"** | **FAIL** | **PASS** | **FLIPPED** |
| 15 | text: reply mentions the dog | PASS | PASS | held |
| 16 | text: audio ≥ 1 s | PASS (5.53 s) | PASS (12.97 s) | held |
| 17 | text: RMS > 0.005, finite | PASS (0.0591) | PASS (0.0725) | held |
| 18 | **text: round trip WER ≤ 0.35** | **FAIL (1.000)** | **PASS (0.026)** | **FLIPPED** |

**Flipped to PASS: all four baseline failures — 7, 11, 14, 18.** Nothing
regressed; the 14 baseline passes all held.

**What still fails: nothing in the probe.** The remaining open items are things
the probe does not assert:

1. `llm_tools_unsupported` still emitted (above). Unowned in run 9. The turn
   no longer dies on it, but the request still offers tools to a model that
   rejects them.
2. Lane A's STT gate is still unproven *by this probe* — `stt_rejected` never
   fired, by design of the fixture.
3. Everything E listed under "NOT verified": the pre-roll loss on a short PTT
   press, auto/VAD turn detection and the half-duplex gap, a five-line
   markdown reply (still has not occurred in any sample), and whether WebGPU
   dtype is the *only* cause of the TTS corruption.

### On the reply contract, honestly

The three sentence-shape assertions (5/12, 6/13, 8/15) passed at baseline too,
so they are not evidence for lane B on their own. What *is* new is 7 and 14 —
the trailing question, which E called "the reproducible half of diagnosis 2
and the strongest case for lane B's `reply-shape.ts`". Both flipped, and the
reply is now three sentences instead of one and two, i.e. the model is using
the room the contract gives it and closing with a question. The mic and text
replies are byte-identical, which is what you would expect from a deterministic
shape pass over the same prompt. **VERIFIED** for this sample; one sample is
still one sample, and E's warning that the 2B model is "unpredictably verbose"
rather than reliably terse has not been retired by this run.

### On the TTS fix

This is the headline flip. E's baseline produced loud, well-formed,
*unintelligible* audio (WER 1.667 and 1.000 — a repetition collapse and a
hallucinated greeting). This run produces 12.97 s of audio that Whisper reads
back word for word bar one comparative, from the same model, same voice, same
WAV writer, same 24→16 kHz resampler. The only changed variable in the metric
line is the dtype: `webgpu` → `webgpu/fp32`. E predicted the device was the
culprit and recommended dropping to wasm; lane C kept WebGPU and changed the
dtype instead, and the evidence says that was sufficient.

## Environment notes

**A second headless Chromium was running during and after this probe, and it
is not mine.** Per lane A's warning that two probe Chromiums must not overlap,
recorded rather than touched — no process was killed:

| PID | Role |
|---|---|
| 18921 | browser (main) |
| 18922 | gpu-process |
| 18923 | network service |
| 18924 | renderer |
| 19899 | audio service |

Started 12:32 AM. Command line (PID 18921, abridged at the flag list):

```
~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell
  --headless --enable-unsafe-webgpu --use-angle=metal
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream
  --use-file-for-fake-audio-capture=/Users/noelturlington/Claude/sotto/apps/client/e2e/.cache/browser-tutor.wav
  --user-data-dir=/Users/noelturlington/Claude/sotto/apps/client/e2e/.cache/browser-tutor-profile
  --remote-debugging-pipe about:blank
```

It is a `browser-tutor.mjs`-shaped run against the **main tree** (its profile
and fixture are `browser-tutor-profile` / `browser-tutor.wav`; mine were
`discuss-quality-profile` and `discuss-quality-mic.wav`), started by another
session, not a leftover from lanes A–E. A `ps` sweep taken **before** the
build found no headless Chromium at all, so this one appeared mid-run. It did
not affect the result — this probe passed 18/18 — but it is contending for the
same GPU.

**`voice-live.mjs` was NOT run. Deliberately skipped.** The main-tree Metro on
`http://localhost:8081` *is* up (HTTP 200, checked twice, before and after the
probe), so the stated precondition was met. It was skipped anyway because
launching it would have put a **third** concurrent probe Chromium on this
machine alongside the foreign `browser-tutor` run above, which is exactly the
overlap lane A warned about — and voice-live is context-only here, testing the
main tree rather than `run9/integration`. Trading a possible corruption of
someone else's in-flight run for a non-load-bearing data point is a bad deal.
Worth re-running once the other session's Chromium is gone; it is the one
requested item this report does not carry.

## Not done, and why

- **Only one probe run.** Two were authorised, the second conditional on an
  environmental-looking failure in the first. There was none: exit 0, 18/18,
  no download, no WebGPU fallback, no timeout.
- **No source file was edited.** `git status` before the commit shows only
  this file plus the untracked `apps/client/e2e/.cache` symlink. `dist/` and
  `public/tutor/tutor-worker.js` are both gitignored, so the build left no
  tracked change.
- **Not pushed.**
