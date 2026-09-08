# Run 9 — Lane B report: the reply contract for a 2B model

Worktree `~/Claude/sotto-run9/wt/B`, branch `run9/B`. Scratch, logs and
screenshots: `~/Claude/sotto-run9/B/`. Port 8092. Nothing pushed.

## What changed

One commit, `99ef0ee` — `run9(B): enforce the reply contract for the
in-browser 2B model`.

| File | What |
|---|---|
| `packages/core/src/prompt.ts` | optional `compact` in `PromptContext`; a compact instruction builder; `renderDynamicContext` extracted so both paths render the identical session-context block |
| `packages/core/src/prompt.test.ts` | +297 lines: the byte-identity fixture for all four modes, plus the compact assertions |
| `packages/voice/src/browser-cascade/reply-shape.ts` | NEW — `ReplyNormalizer`/`normalizeReplyText`, `ReplyBudget`, `SENTENCE_CAPS`, `sentenceCapForMode`, `maxTokensForMode` |
| `packages/voice/test/browser-cascade-reply-shape.test.ts` | NEW — 16 tests |
| `packages/voice/src/browser-cascade/llm-turn.ts` | normalize each released chunk before the chunker; cap-driven engine abort that is NOT a barge-in; optional `mode`/`maxTokens` deps; `EngineChatOptions` |
| `packages/voice/test/browser-cascade-llm-turn.test.ts` | +8 tests (the 5 pre-existing ones untouched and still green) |
| `packages/voice/src/browser-cascade/worker.ts` | `compact: true`, `mode`/`maxTokens` wired into `makeTurnRunner`, `max_tokens: options?.maxTokens ?? 400` in the `WebLlmEngine.chat` request literal |

Nothing outside the card's owned list was edited. `markers.ts`,
`chunker.ts`, `speakSentence`, `transcribeSegment` and the client are
untouched. VERIFIED: `git diff --stat HEAD~1` lists exactly the seven files
above.

### 1. `compact` (card output 1)

VERIFIED by test. When `compact` is absent or `false`, `buildSystemInstruction`
returns the exact bytes it returned before this commit — the fixture
`GOLDEN_NON_COMPACT` in `prompt.test.ts` was captured from the pre-change
builder for all four modes with a context that exercises `savedWords`,
`recentSummary` and `interfaceLocale`, and eight tests pin it. So the paid
provider and the local server send an unchanged prompt.

Compact reorders rather than rewrites: a one-line identity head, then the
full session context (passage + word map) unchanged, then a one-line mode
guidance, then eleven short numbered imperatives at the END. It carries, in
these words, the card's required text: *"Reply in plain sentences only. Never
use bullet points, numbered lists, headings, asterisks, or emoji."*, *"Never
begin with filler such as \"Okay\" or \"Let's see\"."*, *"Two sentences that
answer, then one question."* (discuss's rule 6) and *"If the learner's
message is empty, a single word, or does not make sense, do not summarize the
passage; ask them to repeat the question in one sentence."* (all four modes).
`read_to_me` compact keeps `[[reading: id1 id2]]`; the pace markers, the
tokenId-assembly rule, the no-numeric-score rule and the opening-invitation
rule all survive. Compact is shorter than the prompt it replaces in every
mode.

### 2. `reply-shape.ts` (card output 2)

`normalizeReplyText` / `ReplyNormalizer` strip line-start bullets
(`-*+•·–—`), ordered-list numbering, `#` headings and `>` blockquotes;
`*_`backtick`~` emphasis anywhere; emoji, regional indicators, skin-tone
modifiers, VS16, ZWJ and the keycap combiner; collapse newlines to spaces;
and drop a leading filler sentence from a fixed list (the card's five plus
"Ok.", "Alright.", "Well.", "Good question." and two `let's see` variants),
matched only as a COMPLETE leading sentence so "Okay is not a word in the
passage." survives.

Streaming safety, the `safeReleaseIndex` idea copied from `markers.ts`: the
tail after the last newline is held back while it could still become a line
marker, and a trailing lone high surrogate is held back so half an emoji
never escapes. A property-style test feeds the same reply in 1/2/3/5/8/13
character deltas and asserts the streamed result equals the whole-string
result.

`ReplyBudget` counts sentences as the chunker emits them: 3 for discuss,
unlimited for `read_to_me`, 2 for the two feedback modes, unlimited when no
mode is given. `maxTokensForMode` is 160 except `read_to_me`'s 400.

### 3. `llm-turn.ts` (card output 3)

Each released chunk goes `stripMarkers` -> `ReplyNormalizer.push` ->
`SentenceChunker`, and every emitted sentence is taken from the budget before
it is spoken. When the budget is exhausted the runner aborts a SEPARATE
`AbortController`, merged with the caller's signal only for the engine call.
That distinction is the whole point: a barge-in flips the caller's signal and
deliberately suppresses both the final caption and the `listening`
transition, whereas hitting the cap must still finalize the caption, still
record history and still return to `listening`. A test asserts all of that
plus `external.signal.aborted === false`.

The caption and the history entry are now exactly the joined spoken
sentences, so a half-sentence cut off by the cap can never appear in either.

`mode` and `maxTokens` are OPTIONAL deps: a runner constructed without them
behaves exactly as before (a test asserts an uncapped four-sentence reply).

### 4. `worker.ts` (card output 4)

`compact: true`; `mode: () => s.payload.mode` and
`maxTokens: () => maxTokensForMode(s.payload.mode)` on the runner (both read
fresh, so a mid-session `mode` message is picked up); `max_tokens:
options?.maxTokens ?? 400` in the request literal, and the JSON-tool fallback
recursion forwards `options`. `temperature` is UNCHANGED at 0.4 — nothing in
the live failure pointed at sampling; the reply was fluent and confident and
simply the wrong shape, which is a prompt-and-post-processing problem.

## Tests

Failing first, in this order: the 16 reply-shape tests (module did not
exist), 8 llm-turn tests, 8 compact-prompt tests. Then implemented.

```
pnpm --filter @sotto/core test
 Test Files  6 passed (6)
      Tests  73 passed (73)

packages/voice: npx vitest run
 Test Files  13 passed (13)
      Tests  162 passed (162)

pnpm -r typecheck
 packages/core, packages/voice, packages/content, apps/server, apps/client: Done

pnpm exec prettier --check <the 7 files>
 All matched files use Prettier code style!
```

`pnpm lint` exits 1 on this tree with 6 errors, ALL of them pre-existing in
`planning/design/launch-cards/shots2x.mjs` (`process`/`console`/`indexedDB`
not defined). VERIFIED: no error or warning names any file this lane
touched. My own first lint run did flag one error in `reply-shape.ts`
(`no-misleading-character-class` on the emoji character class); it was fixed
by turning the class into an alternation before the commit.

## The real-model check (card "Proof")

Ran, not skipped. Static export built from THIS worktree, served on port
8092, Chromium with `--enable-unsafe-webgpu --use-angle=metal`, `:8790/health`
blocked so the capability gate picks the browser cascade, persistent profile
`run9-B-profile` under the shared
`~/Claude/sotto/apps/client/e2e/.cache`. Book: `en-london-build-a-fire`,
"Chapter 1 — The Trail" — Noel's own book and chapter. Learner turns go
through the text fallback (`TextFallback.tsx` -> `session.sendText`), so no
mic and no STT are in the loop and this measures the reply contract alone.

WebGPU came up (`navigator.gpu=true adapter=true`), whisper-base loaded in
~2.3 s and Qwen3.5-2B in ~4-6 s, both on webgpu. VERIFIED that the build
under test contains the compact prompt: `grep -c "Rules. Follow every one"
apps/client/dist/tutor/tutor-worker.js` -> 1.

Probe: `~/Claude/sotto-run9/B/discuss-text-probe.mjs` (throwaway, not in the
repo). Logs: `probe-run5.txt` (first attempt), `probe-run6.txt` (second, after
the rule reorder below). Machine-readable: `discuss-text-probe.json`.

### The five captions (run 6, the shipped build)

1. **"Tell me more about the gray husky dog."** -> *"The dog was big and gray,
   standing beside the man on the frozen trail. It did not like traveling, but
   its instinct told it a truer story than the man's judgment could. The dog
   wanted to lie down in the snow and wait out the storm, while the man had a
   warm cabin and friends cooking food nearby."*
   3 sentences, prose, no markdown, no filler, no emoji. **No question.**
2. **"you"** -> *"You asked about the dog. The passage says it was big and
   gray, and it knew the danger better than the man. It wanted to wait in the
   snow, while the man had a warm cabin."*
   3 sentences, prose. **It summarized the passage instead of asking for a
   repeat.**
3. **"Why was there no sun?"** -> *"The passage says the morning was cold and
   gray, and no sun showed in the sky above the frozen Yukon trail."*
   1 sentence, prose, passage-grounded. **No question.**
4. **"What does fifty below mean?"** -> *"Fifty below means very cold, colder
   than sixty, even seventy. The dog knew the danger, not the numbers."*
   2 sentences, prose, passage-grounded. **No question.**
5. **"stop"** -> *"You asked to stop. The passage ends with the man walking on
   in silence, and the dog following close behind."*
   2 sentences, prose, no question — which is what the contract wants after
   "stop".

### Score against the card

| Criterion | Result |
|---|---|
| at most 3 sentences | 5/5 PASS |
| prose only — no bullets, numbering, markdown, emoji | 5/5 PASS |
| no opening filler | 5/5 PASS |
| ends with `?` (turns 1-4) | **0/4 FAIL** |
| "you" gets a repeat request, not a summary | **FAIL** |

VERIFIED, all of it read off the rendered transcript. Noel's reported failure
mode — a filler line plus a five-line spoken list — did not recur in either
run: nine of ten replies across the two runs were plain prose within the cap.

### The second attempt, and what it changed

First run (`probe-run5.txt`, shape rule in the middle of the compact rule
list): every reply was ONE sentence, and two of them left the passage —
*"the sky was covered by a thick layer of frozen snow and ice"* (the passage
says the sky was clear) and a wrong definition of fifty below. Still no
questions.

So I moved the three rules the live failure actually broke — no markdown, no
filler, reply shape — to the END of the compact rule list, shape last, and
made the discuss shape rule spell out that the last character should be a
question mark. Second run (`probe-run6.txt`) is the table above: better
grounded (no hallucination in five replies), longer, still no questions. That
is two serious attempts; I stopped there per the card.

### Honest read: the 2B model does not meet the full contract

VERIFIED by the ten captions above: Qwen3.5-2B reliably obeys the *mechanical*
half of the contract once the prompt is compact and the normalizer and budget
are in place (prose, no markdown, no filler, within the cap), and reliably
IGNORES the two *behavioural* halves — the trailing follow-up question and
the ask-for-a-repeat rule. Prompting alone did not move either across two
orderings. INFERRED: this is an instruction-following ceiling at 2B, not a
prompt-wording problem; reply 1 in run 6 used all three sentences answering
and was cut by the budget, so even the room for a question was spent.

No model was switched. The smallest alternative I would test next, in
priority order:

1. **A question-only continuation call.** When the mode is `discuss`, the
   budget still has a sentence left, and the streamed reply does not end in
   `?`, run ONE more engine call with a single-line instruction ("Ask the
   learner one short question about the passage. One sentence, ending in a
   question mark. Nothing else.") at `max_tokens: 32`, and speak the result
   as the last sentence. It is a second decode of ~1 second on this adapter,
   it is deterministic about the thing the model will not do on its own, and
   it keeps the tutor's own words rather than a canned template. I did not
   build it: it is a product decision about the tutor speaking a separately
   generated sentence, and it needs Noel or the orchestrator to say yes.
2. **A canned repeat request.** If the learner turn is unusable, do not ask
   the model at all — the worker speaks one localized "Sorry, I didn't catch
   that. Could you say that again?" string. Cheaper and more reliable than
   rule 10, but it needs nine i18n translations and a client-side string, so
   it crosses into lane D's and the i18n script's territory.
3. Note that lane A's `transcript-gate.ts` should stop "you" reaching the LLM
   in the first place, so criterion 5 above is largely covered upstream; the
   compact rule is the backstop for a garbled-but-not-gated turn.

## Not verified

- **The cap's engine abort against a real WebLLM engine.** VERIFIED against
  the fake engine (the test asserts the stream stops early and the turn is not
  a barge-in). In run 6, reply 1 came back at exactly 3 sentences, which is
  consistent with the cap firing on the real engine and with the next turn
  working normally afterwards — so the escalation the card warned about
  (`interruptGenerate` leaving the engine unusable) did NOT occur in this run.
  But I have no direct log line proving the abort fired rather than the model
  stopping at three on its own, so: INFERRED, not verified. If R wants it
  proven, the smallest change is a `metric` post from `llm-turn.ts` when the
  budget caps a turn.
- **`read_to_me` under compact.** The `[[reading:]]` marker survives the
  compact prompt (unit test) and `ReplyBudget` never caps that mode (unit
  test), but I did not drive read_to_me on the real model.
- **The other three modes' compact guidance on the real model.** Unit-tested
  only.
- **`temperature`.** Left at 0.4 with an argument, not a measurement.
- The e2e selectors in `hosted.mjs`, `voice-live.mjs`, `audible-probe.mjs`
  and `browser-tutor.mjs`: I changed no testIDs and no visible strings and
  added no i18n keys, so nothing there needed updating. I did not re-run
  those scripts.

## Things I noticed but did not touch (outside my lane)

1. **The session ends itself while idle.** Reproduced twice: with the session
   in `listening` and no learner input, the screen went to "This session has
   ended. / Continue / Read alone" about 85 seconds later, with no error
   logged. That is why my first two probe attempts could not find the text
   input. Lane D owns the voice screen and `controller.ts`; worth a look,
   because a learner who reads the passage for a minute before asking a
   question will hit it.
2. **The automatic opening turn produced no caption** in any of my runs — the
   state went `connecting -> listening` with no `thinking` and no tutor line,
   even though `llm_load_ms` had already been posted. The prompt still carries
   the opening-invitation rule. Not mine to chase (it is a worker/session
   sequencing question), but it means a learner opens the Discuss tab to
   silence.
3. **Native tool calling is off for this model.** Every run logs
   `llm_tools_unsupported ... Qwen3.5-2B-q4f16_1-MLC is not supported for
   ChatCompletionRequest.tools`, so the session always falls back to the
   fenced ```tool protocol — as designed, but it means the compact prompt is
   ALSO carrying `withJsonToolInstruction`'s block on every turn, appended
   AFTER my rules. That appended block is now the last thing the model sees,
   which works against the recency ordering I just introduced. I did not
   change it (`withJsonToolInstruction` is not mine). **Requested outside my
   lane:** in `worker.ts`'s `withJsonToolInstruction`, when the system message
   was built with `compact`, append the tool block BEFORE the `Rules.` block
   rather than at the very end — or, simpler, have `buildSystemInstruction`
   take the tool instruction as a slot. Whoever owns the H pass should decide.

## Requests outside my lane

Only the one above (item 3). Nothing else was needed.

## For Noel

Nothing blocking. One judgement call is waiting on him or the orchestrator:
whether the tutor may speak a separately generated follow-up question
(alternative 1 above). Without it the no-key Discuss tutor answers cleanly
but never asks anything back, which is a real change to how the tab feels.
