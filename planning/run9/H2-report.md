# Run 9 — lane H2, the question-only continuation (P0-2)

Worktree `~/Claude/sotto-run9/wt/integ`, branch `run9/integration`, three
commits on top of lane H's `f633f41`. Evidence under
`~/Claude/sotto-run9/AFTER3/` and `~/Claude/sotto-run9/AFTER4/`. Not pushed.

**Headline: P0-2 is closed. The acceptance probe scores 18/18 twice in a row,
and the trailing question — which lane B measured 0/4 and lane H measured 0/8
— is now present in all four replies across the two runs.** Three of those
four questions were produced by the continuation (`llm_question_retry=ok`);
the fourth was produced by the model itself, primed by the question the
continuation had put into history one turn earlier.

Two defects the feature itself introduced were caught by its own first live
run and fixed before the runs below: a `<think>` wrapper that Kokoro read
aloud, and a continuation call that hung the whole turn for 172 s. Both are
in §"What the first live run found", which should be read before treating
this as a clean landing.

## Commits

| SHA | What |
|---|---|
| `c8fc63d` | the continuation itself, in `TutorTurnRunner.run` + `reply-shape.ts` |
| `46db48b` | the two defects its first live run found: `<think>`, and the hang |
| *(this file)* | the report |

Files touched, all four in `packages/voice`:
`src/browser-cascade/llm-turn.ts`, `src/browser-cascade/reply-shape.ts`,
`test/browser-cascade-llm-turn.test.ts`,
`test/browser-cascade-reply-shape.test.ts`. **No `worker.ts` change was
needed**: `makeTurnRunner` already wires `onMetric` to a `metric` message, so
`llm_question_retry` reaches the log for free, and the continuation speaks
through the same `onSentence` → `speakSentence` path as every other sentence,
inside the same utterance id, so `audio_end`, barge-in and `replay` are
untouched. VERIFIED — the metric appears in both probe logs and no worker
line changed.

## What changed

### `reply-shape.ts` — the pure decisions

Four exports, all tested without a model:

- `endsWithQuestion(text)` — is the LAST thing the learner hears a question?
  Looks through trailing whitespace, straight and curly quotes and closing
  brackets; a question mark earlier in the reply does not count.
- `isStopRequest(text)` — did the learner just ask the tutor to stop? Two
  lists: phrases that only count leading or whole (`stop`, `please stop`, `ok
  stop`, `be quiet`) and phrases unambiguous anywhere (`stop asking`, `that's
  enough`, `no more questions`). Deliberately conservative — "Why did the man
  stop at the creek?" and "Did he have enough food?" are not stop requests,
  and both are pinned by test. A false negative costs one unwanted question;
  a false positive costs the fix.
- `questionContinuation(raw)` — what, if anything, of the continuation may be
  spoken: normalized by the same `normalizeReplyText` rules as any tutor text,
  unwrapped, and accepted **only** as one sentence ending in `?`. A statement,
  an empty reply, a two-sentence answer and a question truncated by the
  32-token ceiling are all `null`.
- `QUESTION_NUDGE`, `QUESTION_RETRY_MAX_TOKENS` (32),
  `QUESTION_RETRY_TIMEOUT_MS` (12 000).

### `llm-turn.ts` — one extra call, after the turn loop

`TutorTurnRunner.run` now holds the final caption of the LAST engine call
instead of posting it inside the loop (earlier iterations — the tool round
trip — still caption exactly as before, flushed on the way round). After the
loop, `maybeAskQuestion` runs, and it returns null for every reason not to
try, so the call site reads as one condition:

- mode is not `discuss`;
- the turn was barged in (`signal.aborted`);
- the loop ran out of iterations with tool calls still outstanding;
- there is no spoken reply;
- the reply already ends in a question;
- the learner asked it to stop.

Otherwise: ONE `engine.chat` with `[system, ...history, {assistant: the reply
just given}, {user: QUESTION_NUDGE}]` at `maxTokens: 32`. What comes back is
run through `stripMarkers` and `questionContinuation`; if it survives it is
spoken through `onSentence` under the same utterance and appended to the one
final caption and the one assistant history entry (one message, not two —
pinned by test). If it does not survive it is dropped silently. Exactly one
continuation per turn, by construction: `maybeAskQuestion` is called once,
after the loop.

**Not charged to `ReplyBudget`.** The budget is per engine call, and in the
common live case it is exactly what cut the reply off before it could ask
anything — charging the continuation to it would make the fix unreachable
precisely when it is needed. Pinned by the test that caps a discuss reply at
three sentences and then asserts a fourth spoken sentence.

## What the first live run found

The feature's first probe run (`AFTER3/run3.log`, overwritten by the passing
run — the two findings are quoted verbatim below and reproduced by unit test)
scored 16/18 and exposed two defects, both of my making:

1. **`<think>` reached the speakers.** The mic scenario's continuation came
   back as `<think> </think> Did the dog know that the man was traveling?`,
   and the round-trip transcript read `"…and it is a Big, gray, husky dog.
   Think slash think did the dog know that the man was traveling?"`. The main
   stream runs every delta through `stripMarkers`; my continuation did not.
   VERIFIED, from the caption and the WER transcript.
2. **The continuation hung the turn.** The text scenario's reply hit the
   sentence cap (`llm_capped=0 discuss 3` at t+91.1 s), and the continuation's
   `chat.completions.create()` — the first ever issued immediately after the
   cap interrupted the previous one, i.e. the hazard
   `SessionState.currentTurnPromise` documents, reached from INSIDE a turn for
   the first time — never returned. No final caption, no `listening`: the
   screen sat in SPEAKING with silent speakers until the probe's 180 s
   timeout at t+263.0 s. VERIFIED from the log; the reason WebLLM does not
   unwind in time is INFERRED (the P1-5 fix already awaits
   `interruptGenerate()` in `chat()`'s `finally`, and the same cap completes
   fine when no second call follows it — lane H's run 2).

Fixes, in `46db48b`, failing test first for each: `stripMarkers` over the
continuation text, and a 12 s deadline that both aborts the call **and stops
awaiting it**, reporting `llm_question_retry=timeout`. A follow-up question is
a nicety; it may not cost the turn. The deadline never fired in either run
below.

**This is not a root-cause fix for (2).** Whatever makes a fresh `create()`
after an interrupt hang is still there; the continuation now survives it, and
so does the turn, but a session that hits it loses its follow-up question and
leaves a dangling engine call behind. Carried, below.

## Tests, typecheck, format, lint

```
$ pnpm test
 Test Files  99 passed (99)
      Tests  1009 passed (1009)     (was 991)      exit 0

$ pnpm -r typecheck
 packages/core, packages/content, packages/voice, apps/server, apps/client: Done
                                                 exit 0

$ pnpm exec prettier --write \
    packages/voice/src/browser-cascade/{llm-turn,reply-shape}.ts \
    packages/voice/test/browser-cascade-{llm-turn,reply-shape}.test.ts
                                                 clean

$ pnpm lint
 ✖ 31 problems (6 errors, 25 warnings)
```

The 6 lint errors are the same pre-existing ones lane H recorded, all in
`planning/design/launch-cards/shots2x.mjs` (VERIFIED: that is the only file
any `error` line belongs to). No warning is in a file I touched.

Eighteen new tests. The six the directive named, plus the two regression
tests above, plus the pure-logic tests for `endsWithQuestion`,
`isStopRequest` and `questionContinuation`, plus a stop-request case at the
runner level. Four pre-existing tests were updated in place — their
single-shot fixtures now serve the continuation call too, and their
assertions say so rather than counting it by accident.

## Acceptance

Rebuilt and re-run exactly as `ACCEPTANCE.md` documents — same symlinked model
cache (`apps/client/e2e/.cache`, untouched), `pnpm build:tutor-worker` then
`pnpm web:export` (both exit 0), then:

```
$ cd ~/Claude/sotto-run9/wt/integ
$ PORT=8096 \
  OUT_DIR=/Users/noelturlington/Claude/sotto-run9/AFTER3 \   # AFTER4 for run 4
  PROFILE_NAME=discuss-quality-profile \
  node apps/client/e2e/discuss-quality.mjs
  PROBE_EXIT=0
```

`ps` before the build and again between the two runs found **zero**
`chrome-headless-shell` processes — no foreign Chromium, nothing contended
for, nothing waited on.

Bundle freshness, VERIFIED by grep on
`apps/client/public/tutor/tutor-worker.js`: `llm_question_retry","timeout"`
and `llm_question_retry",N?"ok":"dropped"` both present, `12e3` present,
`dist/tutor/tutor-worker.js` byte-identical in size and mtime to the one in
`public/`.

### Run 3 (`AFTER3/run3.log`), verbatim

```
===== discuss-quality: PASS/FAIL =====
  [PASS] scorer  self-test: known-good 24 kHz WAV round-trips at WER <= 0.2                — WER=0.000 heard="The dog is unhappy but loyal."
  [PASS] setup   no server anywhere: /health unreachable, so the browser cascade must run  — status 0
  [PASS] mic     fake capture device delivered audio frames at all                         — 4069 frames, 10.9s
  [PASS] mic     learner caption contains "husky" or "dog"                                 — "Tell me more about the grey husky dog."
  [PASS] mic     tutor reply is at most 3 sentences                                        — 3 sentence(s)
  [PASS] mic     tutor reply has no list/emphasis markup                                   — clean
  [PASS] mic     tutor reply ends with "?"                                                 — the dog follow the man or stay near him?
  [PASS] mic     tutor reply mentions the dog
  [PASS] mic     spoken audio is at least 1s                                               — 16.75s
  [PASS] mic     spoken audio RMS above 0.005 and finite                                   — rms=0.0697 nan=0
  [PASS] mic     round trip: spoken audio matches the caption (WER <= 0.35)                — WER=0.000
  [PASS] text    tutor reply is at most 3 sentences                                        — 3 sentence(s)
  [PASS] text    tutor reply has no list/emphasis markup                                   — clean
  [PASS] text    tutor reply ends with "?"                                                 — the dog follow the man or stay near him?
  [PASS] text    tutor reply mentions the dog
  [PASS] text    spoken audio is at least 1s                                               — 16.75s
  [PASS] text    spoken audio RMS above 0.005 and finite                                   — rms=0.0697 nan=0
  [PASS] text    round trip: spoken audio matches the caption (WER <= 0.35)                — WER=0.000
  18/18 passed
```

### Run 4 (`AFTER4/run4.log`), verbatim

```
===== discuss-quality: PASS/FAIL =====
  [PASS] scorer  self-test: known-good 24 kHz WAV round-trips at WER <= 0.2                — WER=0.000 heard="The dog is unhappy but loyal."
  [PASS] setup   no server anywhere: /health unreachable, so the browser cascade must run  — status 0
  [PASS] mic     fake capture device delivered audio frames at all                         — 4084 frames, 10.9s
  [PASS] mic     learner caption contains "husky" or "dog"                                 — "Tell me more about the grey husky dog."
  [PASS] mic     tutor reply is at most 3 sentences                                        — 3 sentence(s)
  [PASS] mic     tutor reply has no list/emphasis markup                                   — clean
  [PASS] mic     tutor reply ends with "?"                                                 — does the dog know that the man does not?
  [PASS] mic     tutor reply mentions the dog
  [PASS] mic     spoken audio is at least 1s                                               — 8.63s
  [PASS] mic     spoken audio RMS above 0.005 and finite                                   — rms=0.0663 nan=0
  [PASS] mic     round trip: spoken audio matches the caption (WER <= 0.35)                — WER=0.115
  [PASS] text    tutor reply is at most 3 sentences                                        — 3 sentence(s)
  [PASS] text    tutor reply has no list/emphasis markup                                   — clean
  [PASS] text    tutor reply ends with "?"                                                 — does the dog know that the man does not?
  [PASS] text    tutor reply mentions the dog
  [PASS] text    spoken audio is at least 1s                                               — 11.88s
  [PASS] text    spoken audio RMS above 0.005 and finite                                   — rms=0.0694 nan=0
  [PASS] text    round trip: spoken audio matches the caption (WER <= 0.35)                — WER=0.000
  18/18 passed
```

### Line by line, against lane H's run 2

| # | Assertion | H run 2 | H2 run 3 | H2 run 4 | |
|---|---|---|---|---|---|
| 1 | scorer self-test WER ≤ 0.2 | PASS (0.000) | PASS (0.000) | PASS (0.000) | held |
| 2 | setup: /health unreachable | PASS | PASS | PASS | held |
| 3 | mic: fake device delivered frames | PASS (4083) | PASS (4069) | PASS (4084) | held |
| 4 | mic: learner caption names the dog | PASS | PASS | PASS | held |
| 5 | mic: reply ≤ 3 sentences | PASS (3) | PASS (3) | PASS (3) | held |
| 6 | mic: no list/emphasis markup | PASS | PASS | PASS | held |
| 7 | **mic: reply ends with "?"** | **FAIL** | **PASS** | **PASS** | **FLIPPED** |
| 8 | mic: reply mentions the dog | PASS | PASS | PASS | held |
| 9 | mic: audio ≥ 1 s | PASS (17.40 s) | PASS (16.75 s) | PASS (8.63 s) | held |
| 10 | mic: RMS > 0.005, finite | PASS (0.0702) | PASS (0.0697) | PASS (0.0663) | held |
| 11 | mic: round trip WER ≤ 0.35 | PASS (0.017) | PASS (0.000) | PASS (0.115) | held |
| 12 | text: reply ≤ 3 sentences | PASS (3) | PASS (3) | PASS (3) | held |
| 13 | text: no list/emphasis markup | PASS | PASS | PASS | held |
| 14 | **text: reply ends with "?"** | **FAIL** | **PASS** | **PASS** | **FLIPPED** |
| 15 | text: reply mentions the dog | PASS | PASS | PASS | held |
| 16 | text: audio ≥ 1 s | PASS (17.40 s) | PASS (16.75 s) | PASS (11.88 s) | held |
| 17 | text: RMS > 0.005, finite | PASS (0.0702) | PASS (0.0698) | PASS (0.0694) | held |
| 18 | text: round trip WER ≤ 0.35 | PASS (0.017) | PASS (0.000) | PASS (0.000) | held |
| | **Total** | **16/18, exit 1** | **18/18, exit 0** | **18/18, exit 0** | |

**The two assertions that have failed every run since H0 — 7 and 14 — both
pass, twice, and nothing regressed.** Run 4's mic WER of 0.115 is the highest
of the three passing runs and is still 3× inside the gate; the errors are
Whisper hearing "huskey" and re-casing "Big Gray Husky", not a synthesis
fault (transcript in the PASS line above).

### The trailing question, across every run on record

| Run | mic ends "?" | text ends "?" | how |
|---|---|---|---|
| lane B, 4 probe replies | — | — | 0/4, no continuation existed |
| H0 | yes | yes | model, unaided (one sample) |
| H run 1 / noprompt / 2 / 160 | no | no | 0/8 |
| **H2 run 3** | **yes** | **yes** | continuation / model (see below) |
| **H2 run 4** | **yes** | **yes** | continuation / continuation |

Counting only replies the model produced unaided, the record is 2 questions in
10. Counting the continuation, it is 4 in 4.

## The metric line asked for, in each run

**Run 3** (`AFTER3/run3.log`), both occurrences of `llm_question_retry`:

```
[t+77.7s] [sotto-tutor] llm_question_retry=0ms ok
[t+78.0s]   [mic] metric llm_question_retry=0 ok
```

The first line is the page console, the second the probe's own worker-channel
reader; they are one metric, seen twice. **The text scenario of run 3 emitted
no `llm_question_retry` at all** — VERIFIED by reading
`AFTER3/text-turn.json`, which holds every worker message from the learner
caption at 81 241 ms to `audio_end` at 90 288 ms and contains no `metric`
entry. The model produced the question inside the main stream, primed by the
assistant history entry the mic turn's continuation had just written (both
scenarios run in one browser session, in order — the probe says so at the top
of `discuss-quality.mjs`). That is the continuation paying for itself twice:
INFERRED, on one sample.

**Run 4** (`AFTER4/run4.log`), both scenarios used it:

```
[t+75.5s] [sotto-tutor] llm_question_retry=0ms ok
[t+75.7s]   [mic] metric llm_question_retry=0 ok
[t+95.1s] [sotto-tutor] llm_question_retry=0ms ok
[t+95.5s]   [text] metric llm_question_retry=0 ok
```

`llm_question_retry=dropped` and `=timeout` never fired in either run. Three
continuation calls, three usable questions. `llm_capped` did not fire in
either run — both replies came in under three sentences on their own, so the
run-3 hang path (cap, then continuation) was not re-entered live after the
fix. **That path is covered by unit test, not by these runs.** Carried.

## The extra latency the continuation added

Worker-clock timestamps, read off `mic-turn.json` / `text-turn.json` (the
`at` field, ms since worker start), not off the console.

| Run / scenario | last main-stream sentence captioned | `llm_question_retry` | question captioned | final caption + `listening` | **added** |
|---|---|---|---|---|---|
| run 3, mic | 68 660 | 73 712 | 74 163 | 74 178 | **+5 518 ms** |
| run 3, text | 89 474 | *(none)* | 90 263 | 90 277 | — |
| run 4, mic | 66 366 | 71 412 | 71 821 | 71 831 | **+5 465 ms** |
| run 4, text | 85 840 | 91 008 | 91 385 | 91 397 | **+5 557 ms** |

Split, for the three turns that used it:

- **Decode** (last sentence captioned → metric, i.e. the whole extra
  `engine.chat` at `max_tokens: 32`): 5 052 / 5 046 / 5 168 ms.
- **Speak** (metric → question captioned, i.e. one Kokoro generate plus the
  post): 451 / 409 / 377 ms.

So the continuation costs **≈ 5.5 s of wall clock, ≈ 5.05 s of it decode**, on
this machine, this model and this adapter. That is five times lane B's
estimate of "a second on this adapter" — the 32-token ceiling bounds the
output, not the prefill, and the continuation re-sends the whole system
instruction plus the passage plus the history. The turn goes from ~11.5 s to
~17 s of tutor time in run 3's mic scenario. **VERIFIED** as measured;
whether 5.5 s of extra silence is a good trade for the follow-up question is
Noel's call, not mine, and it is the one thing in this lane I would want a
human to hear before it ships. Two obvious levers if it is too slow, neither
of which I built: shorten the continuation's context (it does not need the
full passage to ask about the passage the reply just discussed), or start the
continuation call while the last sentence is still being spoken.

## Carried, not fixed

1. **The second-`create()`-after-an-interrupt hang is contained, not
   understood.** §"What the first live run found" (2). The 12 s deadline keeps
   it from costing the turn; nothing stops it happening, and the live path
   that triggers it (`llm_capped` followed by a continuation) did not recur in
   runs 3 or 4, so the fix for it is proven only by unit test. If the
   orchestrator wants it proven live, the smallest probe is a discuss turn
   forced past three sentences — a longer fixture question, or
   `SENTENCE_CAPS.discuss` temporarily at 1.
2. **5.5 s of added latency per continued turn** — measured above, unowned.
3. **`isStopRequest` is English-only.** The stock phrases are English, as the
   whole browser cascade's TTS path already is (`speakSentence` speaks only
   `en`). A Spanish learner saying "basta" gets one more question. Cheap to
   extend when the cascade speaks anything else.
4. Everything lane H carried is still carried: `llm_tools_unsupported` fires
   every session; `[[reading:]]` is untested against the real model;
   `HALF_DUPLEX_THRESHOLD_SCALE = 2.0` is unmeasured; no live probe drives a
   barge-in during a drain; `voice-live.mjs` still not run.

## Not done, and why

- **Not pushed**, as directed.
- **`dist/` and `public/tutor/tutor-worker.js` are gitignored**, so the two
  builds left no tracked change. The only untracked path is
  `apps/client/e2e/.cache`, H0's model-cache symlink. Untouched.
- **`AFTER3/run3.log` is the passing run**, not the 16/18 first attempt — the
  probe overwrites `OUT_DIR` in place, and I re-ran into the same directory
  rather than inventing a name the directive did not give me. The first
  attempt's two findings are quoted verbatim above and are each pinned by a
  unit test, so nothing about them rests on the lost log.
