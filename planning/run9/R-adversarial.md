# Run 9 — lane R, the adversarial review

Worktree `~/Claude/sotto-run9/wt/integ`, branch `run9/integration` (18 commits
on top of `main`). Nothing was fixed; nothing outside this file was touched.

## Numbers I ran myself

```
$ pnpm test
 Test Files  98 passed (98)
      Tests  955 passed (955)          exit 0

$ pnpm -r typecheck
 packages/core, packages/content, packages/voice, apps/server, apps/client: Done
                                      exit 0

$ pnpm --filter @sotto/voice test      (now works — commit 64bc385)
 Test Files  15 passed (15)
      Tests  230 passed (230)
```

`apps/client/public/tutor/tutor-worker.js` in this worktree IS built from the
integrated source: `grep -c` finds lane A's `stt_rejected` and "I didn't catch
that", lane B's "Never use bullet points", and lane C's `TTS_DTYPE` /
`webgpu:"fp32"`, all 1. So the bundle is current. Nothing has RUN it.

Verdicts below are VERIFIED (I read the code and traced the path) or
PLAUSIBLE (reasoned, not executed). Line numbers are this worktree's HEAD.

---

# P0

## P0-1 — Nobody has ever run the integrated worker. Three lanes edited it.
VERIFIED (from the five reports plus the test layout).

`packages/voice/src/browser-cascade/worker.ts` now carries lane A's gate +
PTT + speaking flag, lane B's compact prompt + mode/maxTokens, and lane C's
dtype + `prepareForSpeech`. **No test in the repo imports worker.ts** — it
cannot be imported (it pulls three ML libraries at module scope), and
`grep -rl browser-cascade/worker packages/voice/test apps/client` returns only
the build script. Every lane's browser evidence was collected on its OWN
worktree with only its own lane's changes (A: port 8091; B: 8092; C: 8093 —
and C's matrix ran a bundle one commit behind even its own final commit; D:
8094 on the LOCAL cascade, which does not exercise any of this; E: 8095
against unfixed `main`).

So the integrated `mic frame → VAD → gate → LLM → normalizer → budget →
prepareForSpeech → audio` path has been executed exactly zero times. The
whole run's wiring is unit-test-free by construction, and the acceptance
probe that would cover it (lane E's `discuss-quality.mjs`) has never been run
post-integration. Repro: `node apps/client/e2e/discuss-quality.mjs` against a
static export of THIS worktree. Until that exists, every "fixed" claim in
this run is a claim about a file, not about the product.

## P0-2 — The run's own acceptance criterion is known-failing, and lane B says it cannot be met by prompting.
VERIFIED (PLAN.md "Fixed decisions" vs planning/run9/B-report.md).

PLAN.md: "the tutor reply is prose of at most three sentences **ending in a
question**". `apps/client/e2e/discuss-quality.mjs:507` asserts
`/\?\s*$/.test(tutorText)` in both scenarios. Lane B drove the real Qwen3.5-2B
twice (two rule orderings, ten replies) and got **0/4** replies ending in a
question, and wrote: "reliably IGNORES the two behavioural halves … this is an
instruction-following ceiling at 2B". Lane E's baseline failed the same
assertion on both scenarios.

Nothing in the integration changes that: the budget can only DELETE sentences,
never add the question, and reply 1 of lane B's run 6 spent all three
sentences answering. So `discuss-quality.mjs` will report FAIL on
`tutor reply ends with "?"` for mic and text after integration, and the run
ships against its own stated gate. That is a decision for Noel/the
orchestrator (lane B's "question-only continuation call", or amend the
criterion) — it is not a thing H can quietly fix.

## P0-3 — The Kokoro download is now ~330 MB and the app still tells the learner 90 MB.
VERIFIED.

`packages/voice/src/browser-cascade/worker.ts:474-477` now loads `fp32` on
WebGPU. Lane C measured the cost itself: "330 MB against 90 MB on the wire",
"15.8 s to load against 7.2 s" (C-report.md, and the comment at worker.ts:471).

`packages/voice/src/browser-cascade/models.ts:112-117` is unchanged:

```ts
const KOKORO: TutorModelSpec = { id: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  name: 'Kokoro 82M (text to speech)', sizeMb: 90, stage: 'tts' };
```

That number is what the learner is shown before consenting to the download:
`apps/client/src/voice/TutorModelsPanel.tsx:104` (`totalSizeMb(modelsForTier(tier))`
→ `tutor.browser.sizeMb`), `:296` (the per-model row), and
`apps/client/app/settings/models.tsx:61` (`tutor.browser.eventualTotal`). On
any WebGPU machine — i.e. the default path — the standard tier now downloads
~1.48 GB while the panel says 1240 MB, and the TTS row says 90 MB for a
330 MB file. On a metered connection that is a wrong number the user acted on.
Repro: open the tutor models panel, compare with the network total.

(Also unfixed by anyone: `sizeMb` is a single number with no device axis, so
the honest fix is not a one-character edit — wasm still gets 90 MB.)

---

# P1

## P1-1 — The gate treats an entire Chinese sentence as one word. `zh-CN`/`zh-TW` are shipped packs.
VERIFIED. `packages/voice/src/browser-cascade/transcript-gate.ts:245,254`.

```ts
const words = normalized.split(' ');
...
if (words.length <= 2 && rms < SPEECH_RMS_THRESHOLD) return { verdict: 'hallucination', ... };
```

`normalize()` (`:190`) strips punctuation and collapses whitespace. Chinese has
no inter-word spaces, so "为什么这只狗在雪地里不高兴？" normalizes to a single
token: `words.length === 1`. The rule the module documents as "a SHORT
transcript from a quiet segment" therefore applies to **every** Chinese turn of
any length, and `isDegenerate` (`:204`, `words.length < 4` → false) never fires
either. `packages/content/packs/` contains `zh-CN` and `zh-TW`, so this is a
live locale, and `TranscriptContext.locale` is accepted and never read
(`:221` destructures only `durationMs, rms`) — the module comment calls it
"reserved". The tests pin `为什么` only at LOUD rms
(`browser-cascade-transcript-gate.test.ts:77`, default `LOUD_RMS`), so the
failing case is exactly the one not covered. Any zh learner on a quiet mic
loses every turn to "I didn't catch that".

## P1-2 — Lane A's PTT pre-roll defeats lane A's PTT mis-tap drop.
VERIFIED. `worker.ts:1087` vs `worker.ts:1089-1102`, `vad.ts:274-290`.

`ptt active` now seeds the segment with up to `PTT_PRE_ROLL_MS` (300 ms) of
rolling pre-roll. On release, `worker.ts:1091` computes
`durationMs = segment.length / WORKER_SAMPLE_RATE * 1000` — **on the seeded
segment** — and compares it with `MIN_SEGMENT_MS` (250). A 50 ms mis-tap
therefore measures ~350 ms and is never dropped: it runs Whisper, gets a stock
hallucination over 300 ms of room tone, falls to the `hallucination` verdict
instead of `too_short`, and posts "I didn't catch that" — the exact caption the
code comments say a mis-tap must NOT get ("the learner knows they fumbled the
button, and there is nothing for them to repeat", `:1093`). The same arithmetic
makes the gate's `too_short` branch effectively dead: in auto mode a segment
always carries 1200 ms of pre-roll plus 1000 ms of hangover. Repro: tap and
release the mic ring in under 100 ms with the session idle for a second first.

## P1-3 — The half-duplex gate lifts during exactly the window it was built for, and lane D's playback signal was never fed back to the worker.
VERIFIED. `worker.ts:794-800` vs `apps/client/src/voice/playbackHold.ts`,
`packages/voice/src/browser-cascade/provider.ts:218-233`.

`setSpeakingState(s, false)` runs at the end of `runTutorTurnBody`, i.e. when
GENERATION ends. Lane D measured the gap it leaves: `voice-live` baseline
`speaking` t+18.1 s → `listening` t+25.3 s with ~1.4 s of audio still queued
(D-report §4, E-report §4: 713 ms and 886 ms on two turns). So for the whole
drain the VAD threshold is back at 0.02 while the laptop speaker is still
playing the tutor — which is precisely BUGS-TUTOR-RUN5 #3, the bug the
`HALF_DUPLEX_THRESHOLD_SCALE` change exists to close. Lane A named this in its
own comment (`worker.ts:598-601`) and asked lane D for a playback-finished
signal; lane D built `playbackRemainingMs()` on the provider and wired it only
to the client's label. Nothing posts it back to the worker. Net: the gate is
raised while the tutor speaks and lowered for the tail, which is the half of
the window with the worst echo-to-attention ratio (nobody is talking yet).
Also note the multiplier 2.0 is unmeasured by lane A's own admission.

## P1-4 — A barge-in during the drain window leaves the screen stuck in SPEAKING with the mic live and nothing playing.
VERIFIED by tracing (client + worker).

Sequence: generation ends → `runTutorTurnBody:800` sets `s.currentAbort = null`
→ the runner already posted `state: listening` (`llm-turn.ts:283`) →
`controller.ts` `publish()` sees `remainingMs > 0`, publishes `speaking`, and
arms a flush for the full remaining duration (`playbackHold.ts:66`). The
learner presses the mic: `app/voice/[bookId].tsx:389` sees
`voiceState === 'speaking'`, calls `session.interrupt()` →
`provider.interrupt()` zeroes `playbackQueueEndAt` and stops playback →
`worker.ts:945` `interruptSession` runs with `hadAbort === false`, so it posts
**no state event at all** (`:959`). No state event means no new epoch, so the
already-armed timer still fires at the ORIGINAL time; until then the screen
says SPEAKING while the speakers are silent and the mic is recording. Up to
several seconds, in the one interaction lane D added the barge-in for. Repro:
hold the mic within ~1 s of the tutor's last caption.

(Lesser sibling, P2: `holdSpeaking` only holds `listening`, so the mid-turn
`thinking` posted at `llm-turn.ts:255` still lands while the previous
sentence's audio plays.)

## P1-5 — The budget abort fires `interruptGenerate()` on most discuss turns, unawaited, and `currentTurnPromise` does not cover it.
PLAUSIBLE (lane B marks it INFERRED too; I traced the code path, not a live engine).

`llm-turn.ts:190` `capAbort.abort()` → `worker.ts:335-337`
`onAbort = () => { void this.engine.interruptGenerate(); }` — fire and forget.
`chat()` then `break`s and returns; `run()` returns; `runTutorTurnBody`
finishes; `runTutorTurn:753` clears `currentTurnPromise`. The comment on
`SessionState.currentTurnPromise` (`worker.ts:558-572`) documents a live
finding that starting a second `chat.completions.create()` on the same
MLCEngine before an interrupted call had unwound **hung the session
indefinitely** — and the protection is to await `currentTurnPromise`, which by
then has already resolved. Before run 9 this only happened on a barge-in (rare).
With `SENTENCE_CAPS.discuss = 3` it now happens on any reply longer than three
sentences — lane B's own run-6 reply 1 hit exactly three, consistent with the
cap firing. There is no metric distinguishing "capped" from "the model
stopped", so if this bites in the field it looks like the old 90-second silent
hang. Smallest proof: post a `metric { name: 'reply_capped' }` from
`llm-turn.ts` and drive two capped turns back to back on a real engine.

## P1-6 — `max_tokens: 160` can truncate the fenced tool block, which is the ONLY tool path this model has.
PLAUSIBLE. `worker.ts:291` + `reply-shape.ts:208` + `worker.ts:218-247`.

Lanes A and E both observed, live and twice each, that Qwen3.5-2B rejects
native tools (`llm_tools_unsupported`), so every browser session falls back to
`withJsonToolInstruction` — the model must emit a fenced ```tool block INSIDE
the same 160-token budget as its prose. `parseJsonToolBlock` requires a closing
fence (`TOOL_BLOCK_RE`, `:213`); a reply truncated at 160 tokens mid-JSON
parses as nothing, so `save_vocabulary` / `show_explanation` silently do not
happen, and the learner sees only the prose that promised it. At 400 tokens
there was room. Repro: ask the tutor to save a word in Discuss on the browser
cascade and check for a `tool_call` message. (Related, VERIFIED: a capped turn
also `break`s before any tool call is replayed — `llm-turn.ts:240` — which is
deliberate but means the cap and tool use are mutually exclusive.)

## P1-7 — Compact rule 6 forbids the marker compact's own read_to_me guidance requires.
VERIFIED for the contradiction; PLAUSIBLE for the effect.

`packages/core/src/prompt.ts:96` (read_to_me compact guidance): "Begin your
reply with the marker `[[reading: id1 id2]]`". `prompt.ts:203` (compact rule 6,
which comes AFTER it, in the block lane B deliberately moved last for recency):
"Nothing else goes in double brackets." The non-compact prompt has no such
sentence (grep: line 203 is the only occurrence). So compact tells a 2B model,
last and most emphatically, not to emit the marker its mode instruction just
demanded — and `[[reading:]]` is what drives sentence highlighting via
`stripMarkers`/`onReading`. The test that is supposed to cover this
(`prompt.test.ts:465`, "keeps read_to_me able to emit its [[reading:]] marker")
only asserts the substring is present in the prompt; it cannot see the
contradiction. Lane B never drove read_to_me on the real model ("NOT verified"
in B-report). Repro: switch to Read-to-me on the browser cascade and watch for
`reading` messages.

## P1-8 — "okay" / "ok" / "bye" / "thanks" are rejected unconditionally, and the re-ask has no escape.
VERIFIED. `transcript-gate.ts:152-176`, `worker.ts:882-897`.

The stock list is applied with no RMS or duration condition (the RMS checks are
earlier and only reject; a LOUD "Okay." still lands on `:238`). A learner who
answers the tutor's "shall we go on?" with "Okay" gets "I didn't catch that.
Could you say it again?" — and saying "Okay" again produces the same line,
forever. Lane A calls this a deliberate tradeoff, and it is a defensible one
for `you` and `thanks for watching`; `okay`/`ok`/`bye` are ordinary answers to
the questions this tutor is being pushed (lane B rule 11) to ask. At minimum
these three should be conditioned on `rms < SPEECH_RMS_THRESHOLD`, which is
free — the value is already in the context.

---

# P2

- **`worker.ts` remains 1,192 lines with zero unit tests.** Not a lane's fault;
  it is the structural reason P0-1 is possible. The cheap partial fix is to
  extract the `ptt` release decision and the `transcribeSegment` gate branch
  into a pure sibling the way A/B/C did for everything else.
- **Lane D's "For Noel" is wrong post-integration.** D-report §7 tells Noel the
  "you" in his transcript "now carries *Not what you said? Type it*". It does
  not: lane A's gate stops "you" before any learner caption is posted
  (`worker.ts:882-898`), and `correctableCaptionId` only attaches to a *learner*
  caption (`captionCorrection.ts:33`). The two lanes' user-facing stories
  contradict; the gate's story is the true one.
- **The golden fixture pins one context shape, not "the non-compact output".**
  `prompt.test.ts:403` runs all four modes against a single `goldenCtx` with
  `interfaceLocale`, `recentSummary` and one saved word all present. The
  `ctx.recentSummary ? … : ''` branch (`prompt.ts:177`, which leaves a trailing
  newline when absent), an empty `savedWords`, and every locale but `es-419` are
  unpinned. The refactor moved that block verbatim so the risk is low, but the
  claim "pins the non-compact output for all four modes" is broader than the
  test.
- **Two of the acceptance probe's assertions are now guaranteed by
  construction.** `discuss-quality.mjs:497` (≤3 sentences) and `:505` (no
  list/emphasis markup) can no longer fail while `ReplyBudget` and
  `ReplyNormalizer` are wired — the cap is 3 and the normalizer strips
  `[-*_`~#>]` and emoji deterministically. They are regression guards for the
  guards, not measurements of the model. Only "ends with ?", "mentions the dog"
  and the WER round trip still measure anything.
- **WER is not numeral-normalized.** `apps/client/e2e/lib/wer.mjs:23-31`
  lowercases and strips accents and punctuation but leaves digits, so
  "fifty"/"50" is a full word error — lane C measured 0.188 on one such
  sentence from that alone. Against the 0.35 gate, a two-number reply could
  fail on orthography rather than audio.
- **The `playPcm` "proof" re-implements the thing it verifies.**
  `web-audio.test.ts:150-157` copies `floatToPcm16`'s arithmetic into the test
  instead of importing it from `worker.ts` (it cannot be imported — see P0-1),
  so a drift in the worker's converter passes. And `FakeAudioContext` never
  defines its own `sampleRate`, so "declares the tutor rate, not the context
  rate" (`:167`) cannot actually distinguish the two.
- **`SILENT_RMS_THRESHOLD = 0.005` is a peak, not a mean, so it is safe for
  most mics, but nothing in the run measured a real quiet speaker with AGC off**
  (`transcript-gate.ts:70`; the test at `:163` uses 0.0001, four decades below
  the threshold, which proves nothing about the boundary). PLAUSIBLE risk only.
- **`fp16` is documented as dangerous and still reachable.**
  `worker.ts:489-494` `debugTtsDtype()` accepts `'fp16'` from a worker global,
  and lane C measured an all-NaN waveform at fp16. It ships in the production
  bundle. Nothing in the app sets it and a page cannot reach a worker's
  `globalThis`, so this is hygiene, not a hole.
- **The gate's caption is English in the store, localized only at render.**
  `Transcript.tsx:85` swaps it for `t('voice.didNotCatch')` by exact string
  match against `didNotCatch.ts:19`. The two constants are byte-identical today
  (I diffed them), but nothing enforces it — a future edit to
  `NOT_CAUGHT_CAPTION` silently reverts nine locales to English. A shared
  export, or a test asserting equality across the two packages, would.
- **`micPressAction` is consulted on RELEASE as well as press**
  (`app/voice/[bookId].tsx:389-392`): if the state becomes `error`/`ended`
  between press and release, `capture: false` swallows the release, `pttHeld`
  stays true and the worker never receives `ptt:false`, so `SpeechBuffer` keeps
  capturing. Narrow, but it is a stuck-capture path.
- **`turnMode` is still one-way.** Once any `ptt` message arrives
  (`worker.ts:1076`), `handleFrame` returns before the VAD forever
  (`:916-919`), so auto turn detection — and with it the only in-worker
  barge-in trigger — is dead for the rest of the session. Pre-existing, but
  lane D's space-bar handler makes it one keystroke away. It is correctly
  gated on `isPush` (`ControlCluster.tsx:89`), so this is a latent, not a new,
  regression.

---

## What I checked and found clean

- **Other providers.** `compact` is optional and set in exactly one place
  (`worker.ts:714`). `apps/server/src/voice/session.ts:161` and
  `packages/voice/src/openai-direct/provider.ts:421` never pass it, and the
  golden fixture covers the four modes for the shape they do send. No local- or
  own-provider behaviour change in `prompt.ts`. VERIFIED.
- **Utterance ids.** `speakSentence` opens one id per turn and reuses it across
  `prepareForSpeech` pieces (`worker.ts:661-682`); `audio_end`
  (`:795`), the cancelled `audio_end` (`:955`) and `replayLast` (`:962-972`) all
  use the same id. Lane C's multi-piece split does not change the caption text
  or what reaches the transcript store — the caption is posted from `sentence`,
  the un-split original (`:694`). VERIFIED.
- **The budget abort is not mistaken for a barge-in.** The separate
  `capAbort`/`anySignal` split (`llm-turn.ts:176-177`) does exactly what it
  claims: the caller's signal stays unaborted, the final caption fires, and
  `listening` is still posted. Tested at
  `browser-cascade-llm-turn.test.ts` "aborts the engine stream … without
  marking the turn barged-in". VERIFIED (the WebLLM-side risk is P1-5).
- **The speaking flag does not leak.** `setSpeakingState(s, false)` is
  unconditional at `worker.ts:798` (outside the try/catch) and again in
  `interruptSession:948`; the only way past it is session teardown, which
  replaces the whole `SessionState`. VERIFIED.
- **Real short answers pass the gate at speech energy** — `no`, `yes`, `why`,
  `the dog`, `Sí` all have tests and all pass at peak RMS ≥ 0.02
  (`transcript-gate.test.ts:77`). The false-rejection risk is the two shapes
  above (P1-1, P1-8), not short answers as such.
- **Lane E's probe does assert things nothing else does**: the WER round trip on
  the actual playback buffer, and the scorer self-test that runs first so a
  high WER cannot be blamed on the scorer. It reads worker messages rather than
  the DOM, which is the right call. Its two now-tautological assertions are
  noted in P2.
