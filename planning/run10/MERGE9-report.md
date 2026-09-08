# Merge 9 report — run 9's Discuss-tutor quality work onto run 10's main

Branch: `merge/run9`, based on `main` (3926e4a). Merged: `run9/integration`
(b8a1a1a, 30 commits). Merge base: `f811168` ("ledger: landing sells the
tutor"). Worktree: `/Users/noelturlington/Claude/sotto-run10/wt/merge9`.
`main` was not touched and nothing was pushed.

The dry run's three conflicts were the only three. Everything else auto-merged,
including the two files both sides edited without colliding
(`packages/voice/src/browser-cascade/provider.ts`, nine i18n catalogs) and one
where both sides made the *same* edit (`apps/client/e2e/hosted.mjs`: both
switched the landing link from "Try a sample" to "Read free, no account";
run 10 additionally halved the wizard, so the merged file is byte-identical to
main's).

---

## Conflict 1 — `apps/client/app/voice/[bookId].tsx`

One hunk, at the transcript/spacer branch.

**What main wanted.** cd326af..3926e4a added the free build's Discuss decision
list: `TRIAL_URL` + `openTrial()` (lines 60-69), the `FreeTutorChoices`
component and its stylesheet (83-166), the render branch
`panelState && !cloud.enabled ? <FreeTutorChoices .../> : panelState ? <old
panel> : null` (420-427), and — the conflicting line — a third arm on the
transcript branch so the `styles.spacer` view is skipped when the decision
list is about to render, with a comment saying why (the spacer would push the
list to the bottom of the screen).

**What run 9 wanted.** Four unrelated edits to the same screen: the
`captionCorrection` / `micPress` imports (32-33), the `correctionPrefill`
state (203-206), the extra `correctableId` / `onCorrectCaption` props on
`<Transcript>` (the conflicting line), the `micPressAction` barge-in guard
inside `onPushToTalk` (516-518), and `prefill={correctionPrefill}` on
`<TextFallback>` (537).

**What the merged code does** (lines 393-407):

```tsx
{!isUnavailable ? (
  <Transcript
    captions={session.captions}
    onReplaySentence={session.replaySentence}
    correctableId={correctableCaptionId(session.captions, session.activePath)}
    onCorrectCaption={(text) =>
      setCorrectionPrefill((prev) => ({ text, nonce: prev.nonce + 1 }))
    }
  />
) : panelState && !cloud.enabled ? null : (
  // The free app's decision list (below) sits directly under the
  // passage; the spacer would push it to the bottom of the screen and
  // leave a blank band where a stranger expects the next step.
  <View style={styles.spacer} />
)}
```

run 9's `<Transcript>` in the true arm, run 10's three-arm false branch and its
comment verbatim. Nothing else in the file was edited by hand.

**Check.** `diff main:[bookId].tsx merged` is exactly run 9's four hunks and
nothing else; `diff run9:[bookId].tsx merged` removes exactly three lines, all
of them lines main replaced (the `react-native` import line, `) : (`, and
`{panelState ? (`). No third behaviour was invented.

**Live check.** Static export served at :8091, `/voice/fr-cendrillon` at 375
wide with no CloudAdapter (`cloud.enabled === false`): the screen renders
passage → "Try the tutor free for 3 days" → "$9.99 a month or $79 a year after
the trial. Nothing to install." → "Run it in this browser" / "About 1462 MB,
downloaded once. Slower than the plan." → "Use your own OpenAI key" → "Read
alone", with the list directly under the passage and no blank spacer band.
That is main's design unchanged.

---

## Conflict 2 — `packages/voice/src/browser-cascade/worker.ts`

Two hunks: the import block and the `tools`-unsupported retry.

**What main (cd326af) wanted.** Move the JSON-tool fallback prompt and parser
out of `worker.ts` into `tool-protocol.ts` (deleting ~50 lines of inline
`TOOL_BLOCK_RE` / `withJsonToolInstruction` / `parseJsonToolBlock`), switch the
requested shape to Qwen's native `<tools>` / `<tool_call>`, re-render tool
history into Qwen's own roles, and — the behavioural core, documented as
defect 1 in `planning/BROWSER-TUTOR.md` "Run 9 status (2026-09-07)" — apply the
instruction on *every* call once the fallback is engaged rather than only on the
retry. That is why cd326af changed the retry from
`this.chat(withJsonToolInstruction(messages), ...)` to `this.chat(messages, ...)`:
re-wrapping there would now append the instruction twice.

**What run 9 wanted.** `prepareForSpeech` and `maxTokensForMode` imports, the
per-mode `max_tokens` (`options?.maxTokens ?? 400`, line 254), and an
`options` argument threaded through `LlmEngine.chat` — including through the
retry, so a retried call keeps the mode's ceiling.

**What the merged code does.**

- Imports (lines 50-52): all three kept, `tool-protocol.ts` first.
- Retry (lines 287-294):

```ts
this.supportsTools = false;
// cd326af: the instruction is applied at the TOP of `chat()` whenever
// `supportsTools` is false, so the retry must NOT wrap `messages`
// again — that would append it twice. `options` still rides along
// (run 9): the retry has to keep this mode's `max_tokens`.
return this.chat(messages, handlers, signal, options);
```

cd326af's inline fallback code was **not** reintroduced: `grep TOOL_BLOCK_RE`,
`grep 'function withJsonToolInstruction'` and `grep 'function
parseJsonToolBlock'` all return nothing in `worker.ts`; the only references are
the import (50) and the two call sites (240, 368).

Everything else in the file auto-merged and was verified by reading the full
three-way diff in both directions. The result is exactly cd326af's diff applied
on top of run 9's worker:

| Behaviour | Owner | Merged at |
|---|---|---|
| instruction on every fallback call | cd326af | 240 |
| per-mode `max_tokens` | run 9 lane B | 254 |
| drain the aborted stream instead of `break` | cd326af | 335 |
| await `interruptGenerate()` before returning | run 9 lane R P1-5 | 356 |
| `parseJsonToolBlock` on the fallback path | cd326af | 368 |
| `llm_turn_ms` / `tool_result` metrics | cd326af | 380, 679 |
| transcript gate, `NOT_CAUGHT_CAPTION` | run 9 lane A/H | 957-975 |
| PTT pre-roll + `too_short` drop | run 9 lane A/H | 1160-1200 |
| half-duplex hold until `playback_drained` | run 9 lane A/H | 606-655, 1215 |
| Kokoro fp32 on WebGPU | run 9 lane C | 484 |
| `prepareForSpeech` in `speakSentence` + `sample` | run 9 lane C | 712, 1270 |
| `compact: true` prompt + `maxTokensForMode` | run 9 lane B | 774-781 |
| `announcesListening` on barge-in during drain | run 9 lane D/R | 1046 |

**The one place the two sides genuinely interact, and why it is fine.** run 9's
sentence cap aborts the engine routinely (any discuss reply past three
sentences), not just on barge-in. Under run 9 alone that abort went through
`break`, which is precisely the WebLLM 0.2.84 lock leak cd326af diagnosed as
defect 3 — the next `create()` would block forever. The merge composes them in
the right order: the cap aborts, `onAbort` fires `interruptGenerate()`, the loop
`continue`s to the generator's end so the lock is released, and the `finally`
awaits the interrupt promise before `chat()` resolves. The merged behaviour is
strictly safer than either parent's, and no design decision was needed.

**Prompt/protocol interaction, checked not assumed.** run 9 sets
`compact: true`, so the system message is `buildCompactInstruction`'s eleven
numbered rules; `withJsonToolInstruction` appends the `<tools>` block after
them, which leaves the tool shape last — where a 2B model weights hardest, and
where run 9 lane B deliberately put the shape rule. No rule contradicts the
block: rule 8 forbids "bullet points, numbered lists, headings, asterisks, or
emoji", not XML tags or fences, and rule 6's marker whitelist is about
`[[double-bracket]]` markers. The block is stripped from the reply by
`parseJsonToolBlock` before `TutorTurnRunner` ever shapes it, and held back
from streamed captions by `markers.ts`, which cd326af taught both
`` ```tool `` and `<tool_call>`. Rule 11's "last character is a question mark"
and the instruction's "put the block at the very start" are compatible.

---

## Conflict 3 — `planning/LEDGER.md`

Both sides appended a section at EOF. Kept both, verbatim, in chronological
order: run 9's "Run 9 (2026-09-06 → 07…)" block at line 817, then run 10's
"Run 10 (2026-09-08, the closeout…)" block at line 824. No text edited — run
9's entry still says "NOT merged to main" and run 10's still says "run9/
integration still needs a real merge", because both were true when written and
the ledger is a record, not a status board. This merge's own line is the
orchestrator's to add after review.

---

## Proof

| Check | Result |
|---|---|
| `pnpm typecheck` (root) | clean — all 5 projects, no output |
| `pnpm test` (root) | **102 files, 1046 tests, 1046 passed, 0 failed** (main alone: 840) |
| `pnpm --filter @sotto/voice test` | **17 files, 292 tests, all green** |
| `npx eslint` on the two resolved source files | **0 errors, 0 warnings** |
| `pnpm lint` (whole tree) | 6 errors / 25 warnings, all 6 errors in `planning/design/launch-cards/shots2x.mjs`, pre-existing on main and untouched here |
| `npx prettier --check` on the three resolved files | "All matched files use Prettier code style"; `--write` changed nothing |
| `pnpm content:validate` | **0 errors, 223 warnings** — identical to main's recorded baseline; no pack was touched |
| `pnpm --filter @sotto/client web:export` | exit 0, 9 packs + landing + PWA manifest |
| `BASE_URL=http://localhost:8091 node e2e/hosted.mjs` | **RESULT: PASS**, `TAPS landing -> reader = 4` at 375 **and** 1440, offline reload honoured at both |

Both parents' key test files pass side by side: cd326af's
`browser-cascade-tool-protocol.test.ts` (10) and `browser-cascade-markers.test.ts`
(23) alongside every run 9 suite — `browser-cascade-transcript-gate.test.ts`
(59), `browser-cascade-reply-shape.test.ts` (24), `browser-cascade-llm-turn.test.ts`
(26), `browser-cascade-vad.test.ts` (19), `browser-cascade-tts-text.test.ts` (12),
`browser-cascade-speaking-window.test.ts` (11), plus the client's
`playbackHold` (8), `captionCorrection` (8), `micPress` (4) and `didNotCatch` (4).
**No run 9 test and no cd326af test had to be traded off; nothing was
escalated.**

Servers: I started the static server on :8091 and stopped it after the smoke.
I did **not** start the content server on :8790 — it was already up (health
`{"ok":true,...}`) and belongs to another session, so I left it alone; it had
exited on its own by the time I checked again afterwards. The smoke does not
depend on it: it logs "skipping content-cache assertion — BASE_URL's hostname
is a local-dev loopback name" and serves packs out of `dist/content/packs`.

**Not run, by instruction:** run 9's acceptance probe
`apps/client/e2e/discuss-quality.mjs`. It downloads and runs Whisper, Qwen and
Kokoro in a real browser and scores the spoken audio; it is a live-model probe,
not a merge gate. Its last recorded result is run 9's 18/18 ×2 on
`run9/integration` (`planning/run9/H2-report.md`).

## Uncertain / worth a second pair of eyes

1. **No test covers `worker.ts` itself.** It is a Worker entry point with no
   unit test on either branch; the 292 green voice tests exercise the modules it
   wires (`tool-protocol`, `transcript-gate`, `reply-shape`, `markers`,
   `llm-turn`, `speaking-window`, `tts-text`), not the wiring. Both conflict
   hunks are in `worker.ts`, so both resolutions were verified by reading the
   full bidirectional diff and by matching them against
   `planning/BROWSER-TUTOR.md`'s "Run 9 status" checklist, not by a test that
   would have caught a mistake. A live in-browser run (`discuss-quality.mjs`,
   or the standard-tier e2e) is what would actually prove the composed
   fallback path end to end, and it has not been run on this merge.
2. **`markers.ts` is main's version, unreviewed by run 9.** run 9 never touched
   it, so there was no conflict, but cd326af's `safeReleaseIndex` rewrite now
   runs underneath run 9's `ReplyNormalizer` and sentence cap. Its 23 tests
   pass and the two operate on different things (hold-back index vs. leading
   filler / sentence budget), but that pairing has never run against a live
   model.
3. **`tool-protocol.ts` documents run 9 failures it fixed on run 10's branch.**
   Its comments describe run 9's live large-tier e2e; the code lives only on
   main. Nothing to resolve, but it means the file's history reads as if it
   were run 9 work when the merge is read later.

---

## BLOCKER for the orchestrator — `main` moved while this merge was running

`main` was `3926e4a` when this worktree was created (16:49 reflog:
`fetch . run10/integration:main: fast-forward`). At **16:56** another session
fast-forwarded `main` again, to **`b2b65fc`** — "merge: origin/main (PRs #1-#5:
UX findings, capture gate, service-worker refresh, streamed speech, imported
narration, parchment covers) onto run 10" — and pushed it to `origin/main`.

`3926e4a` is still an ancestor of `b2b65fc`, so nothing is lost, **but
`merge/run9` can no longer be fast-forwarded into `main`**: it does not contain
`b2b65fc`. The plan's last step ("the orchestrator fast-forwards main after
review") needs a decision.

Dry run of the follow-on merge, `git merge-tree --write-tree merge/run9
b2b65fc`, reports **two conflicts**, both in files this merge already touched:

- `packages/voice/src/browser-cascade/protocol.ts` — the PRs add
  `turnDetection`/`muted` to `WorkerInitPayload` and a `turn_detection`
  message; run 9 added `playback_drained`.
- `packages/voice/src/browser-cascade/worker.ts` — and this one is a real
  design overlap, not a textual one. PR "gate tutor capture by explicit mute
  and push-to-talk intent" rewrites the `ptt` case
  (`buffer.clear(); buffer.start()`, now guarded by `!session.muted`) and adds
  an `inputGeneration` epoch plus mute checks inside `transcribeSegment` —
  which is exactly where run 9 put the PTT pre-roll (`buffer.start(
  PTT_PRE_ROLL_MS)`, deliberately *without* the `clear()`) and the `too_short`
  drop. PR "Await streamed speech handlers before completing tutor replies"
  lands in the same reply pipeline as run 9's sentence cap. Those two want
  reading against each other, the way this merge read cd326af against run 9.

That is a second merge with its own conflicts and its own judgement calls, and
it was not in this task's scope, so I stopped here rather than expanding it
unasked. `merge/run9` is complete and green against the base it was given
(`3926e4a`), nothing was pushed, and neither `main` nor `run9/integration` was
touched. Suggested next step: a `merge/run9+prs` lane that merges `b2b65fc`
into `merge/run9` and re-runs this report's proof list.

---

## Second merge: main b2b65fc

The blocker above is cleared. `git merge --no-ff main` on `merge/run9`
(1014247 + report 7b1b5ed) with `main` at **b2b65fc** — origin/main's PRs
#1-#5 merged onto run 10 — produced the merge commit **c6eb248**
(`merge: main (origin PRs #1-#5 and run 10) into the run 9 line`, parents
`7b1b5ed b2b65fc`). Merge base: `3926e4a`, the base the first merge was cut
from, so main's side of this merge is exactly the thirteen commits
`3926e4a..b2b65fc`. `main` was not touched, nothing was pushed, nothing was
checked out, reset, stashed or deleted; only the four resolved paths were
`git add`ed by name.

Git reported **two** conflicted files, both predicted by the blocker note.
The test suite found a **third**, semantic, conflict that git could not see
(`packages/core/src/prompt.ts` vs run 9's golden fixture). All three are
below.

---

## Conflict 1 — `packages/voice/src/browser-cascade/protocol.ts`

One hunk, at the same position in the `MainToWorker` union: both sides
appended a member immediately after `| { t: 'ptt'; active: boolean }`.

**main** (3669ff5):

```ts
  | { t: 'turn_detection'; mode: 'auto' | 'push' }
```

**run 9**: `| { t: 'playback_drained' }` with its eight-line comment (the
main thread owns the AudioContext, so only it can say the speakers went
silent; the worker's half-duplex gate needs that, and holds a safety timeout
in case the message is lost).

**Merged** (lines 72-82): both, main's one-liner first, then run 9's
commented member. Nothing else. The other half of 3669ff5's protocol change —
`turnDetection?: 'auto' | 'push'` and `muted?: boolean` on
`WorkerInitPayload` (lines 33-34) — auto-merged; run 9 never touched that
interface.

---

## Conflict 2 — `packages/voice/src/browser-cascade/worker.ts`

Three hunks conflicted. The fourth region the blocker note warned about —
the `ptt` case itself — auto-merged into exactly the right shape, which is
worth stating explicitly because it is the one place the two PRs genuinely
overlap.

### 2a. `SessionState` (worker.ts:552-565)

main added `inputGeneration: number;`, run 9 added the documented
`speaking: boolean;`, both between `muted` and `turnMode`. Kept both, main's
first, and gave `inputGeneration` the doc comment it did not have — with two
epoch-ish fields now adjacent, an undocumented one is a trap:

```ts
  /**
   * Capture epoch. Bumped by every explicit change of capture intent —
   * mute, and a turn-detection switch — so a `transcribeSegment` that was
   * already in flight when the learner muted cannot post its result into
   * the new epoch (`current()` below). Privacy, not tidiness: the segment
   * is dropped rather than transcribed.
   */
  inputGeneration: number;
```

### 2b. `transcribeSegment` head (worker.ts:891-903)

**main wanted** the privacy bail and the epoch capture:

```ts
  if (!session || session.muted || !sttPipeline) return;
  const s = session;
  const generation = s.inputGeneration;
  const current = () => session === s && !s.muted && generation === s.inputGeneration;
```

**run 9 wanted** the pre-transcription measurement its gate weighs the
transcript against:

```ts
  if (!session || !sttPipeline) return;
  const stats = measureSegment(segment, WORKER_SAMPLE_RATE);
```

**Merged**: main's guard and epoch capture **first**, then run 9's
`measureSegment`. Order is the point, not taste — a segment that arrives
after the learner muted is now not even measured, let alone transcribed. The
three `if (!current()) return;` guards main added downstream (lines 924, 951,
995) and its `await loadStt(s.payload.stt, 'wasm')` auto-merged; all four
were read and are present. So is run 9's transcript gate
(`classifyTranscript`, lines 970-990) with its `too_short` branch and
`NOT_CAUGHT_CAPTION`.

### 2c. `init` (worker.ts:1104-1107)

```ts
          muted: msg.payload.muted ?? false,
          inputGeneration: 0,
          speaking: false,
          turnMode: msg.payload.turnDetection ?? 'auto',
```

main's three lines plus run 9's `speaking: false`. A session that starts
muted, or starts in push mode, now begins that way in the worker too, and
run 9's half-duplex flag still initialises.

### 2d. The `ptt` case (worker.ts:1192-1246) — auto-merged, and why it is right

Git composed main's guard and run 9's body without a conflict:

```ts
      case 'ptt':
        if (session && !session.muted) {
          session.turnMode = 'push';
          if (msg.active) {
            ...
            session.buffer.start(PTT_PRE_ROLL_MS);
          } else {
            const seededMs = session.buffer.seededPreRollMs;
            const segment = session.buffer.end();
            ...  // run 9's too_short drop
```

That is main's `!session.muted` guard (a press while muted is ignored
entirely) wrapped around run 9's `start(PTT_PRE_ROLL_MS)` **without**
`clear()`, and run 9's mis-tap drop on release. main's `turn_detection` case
(1182-1190), which bumps the epoch and clears the buffer on an auto↔push
switch, sits directly above it.

**Which privacy case applied: the first — the gate guarantees the buffer
holds no audio recorded while muted, so `buffer.start(PTT_PRE_ROLL_MS)`
stays without the `clear()`.** The proving line, and the belt-and-braces
behind it:

- `worker.ts:1010` — `handleFrame`'s first statement is
  `if (!session || session.muted) return;`. Every path that can reach
  `SpeechBuffer.push` goes through `handleFrame`, so no frame recorded while
  muted is ever pushed into `pre` (the ring the pre-roll seeds from) or
  `speech`. **This is the line that decides the case.**
- `provider.ts:265-269` — `syncCapture()` calls
  `input.setEnabled(!this.ended && !this.muted && (this.turnMode === 'auto' || this.held))`,
  and `setMuted` (242-247) calls it before posting the mute. The mic is
  stopped, so in push mode no frame is captured at all between presses.
- `capture-gate.ts:29` — even a late worklet callback is dropped:
  `if (this.enabled && generation === this.generation) this.callback?.(pcm)`.
- `worker.ts:1170-1180` — the `mute` case calls `session.buffer.clear()`
  (and bumps `inputGeneration`) on the way in, so anything already in the
  ring when the mute lands is discarded.

Consequence, stated the way the instruction asks: the first press after
unmuting has an **empty** pre-roll, because the ring was cleared at mute and
nothing was admitted while muted. The only audio the pre-roll can ever seed
is audio captured while unmuted in auto mode — audio the VAD would have sent
to Whisper anyway. Adding `clear()` back would therefore buy no privacy and
would cost exactly the first-syllable clipping run 9 removed it to fix. The
reasoning is recorded in a comment at the call site (worker.ts:1206-1218) so
the next reader does not have to re-derive it.

`packages/voice/test/capture-privacy.test.ts` (4 tests) and 3669ff5's new
"microphone privacy regressions" case in `browser-cascade.test.ts` both pass
unchanged; so do run 9's `browser-cascade-transcript-gate` (59) and
`browser-cascade-vad` (19). No test had to be traded off.

### 2e. Streamed speech vs the sentence cap — checked, nothing to resolve

ff9560e ("Await streamed speech handlers before completing tutor replies")
touches only `apps/server/src/voice/llm.ts` (`onTextDelta?: (delta: string)
=> void | Promise<void>` and `await handlers.onTextDelta?.(...)`) plus its
test. run 9 made **no** change anywhere under `apps/server`
(`git diff --stat 3926e4a merge/run9 -- apps/server` is empty), so that PR
came in clean, along with 3669ff5's `session.ts` transcription-abort work.

The browser worker's own copy of the same contract was already awaited on
both sides (`await handlers.onTextDelta?.(delta.content)`,
worker.ts:341 here, identical on 3926e4a and b2b65fc), and
`llm-turn.ts:60` already types the handler `void | Promise<void>`. So the
composition the task warns about is the one the first merge already built
and this merge leaves intact: run 9's cap fires inside `onTextDelta` ->
`speak()` -> `capAbort.abort()` (llm-turn.ts:227-230); the worker's
`onAbort` calls `interruptGenerate()`; the `for await` loop keeps draining
(`if (signal.aborted) continue`) so WebLLM 0.2.84 reaches `lock.release()`;
and the `finally` does `if (interrupted) await interrupted;` before `chat()`
resolves. The cap does not skip the await, and the await does not resurrect
the lock leak.

---

## Conflict 3 — `packages/core/src/prompt.ts` + `prompt.test.ts` (semantic; git saw no conflict)

`prompt.ts` auto-merged and `pnpm typecheck` was clean, but `pnpm test` came
back **8 failed** — four modes × two assertions in
`packages/core/src/prompt.test.ts`.

**What happened.** 3669ff5 (the capture-gate PR — the prompt edit is inside
it, not inside PR #1's UI commit) deliberately rewrote one sentence of the
non-compact prompt:

```
- Avoid unnecessary greetings or praise. If the learner switches language, reply in the language
+ Avoid unnecessary greetings or praise. Explicit response-language requests take priority over
+ the language used to ask; keep level ${learner.level}. Otherwise, reply in the language
  the learner just used, then offer to return to ${learner.learningLocale}.
```

backed by `docs/ux-findings-2026-09-07.md` ("Browser language limitations":
*Explicit language requests override input language in shared prompt*).
run 9 lane B, meanwhile, added `GOLDEN_NON_COMPACT` — the exact non-compact
bytes for all four modes — precisely so that the paid and local-server
prompt cannot drift while the compact rewrite lands. Two correct changes,
mutually exclusive as written.

**Resolved two ways, both required.**

1. **Regenerated the fixture** (prompt.test.ts, the four golden strings at
   lines 233, 275, 317, 359) to main's wording. Its own docstring says
   "Regenerate ONLY with a deliberate prompt change" — this is that case,
   and the guard did its job by failing. Recorded in the docstring with the
   commit that caused it, so the regeneration is not mistaken for drift.
2. **Carried the rule into compact rule 3** (prompt.ts:200), because the
   compact prompt exists only on the run 9 side and 3669ff5's author never
   saw it:

   ```
   3. Explain in ${learner.explanationLocale} only when a short explanation is needed. An explicit
   request for a particular reply language wins over the language it was asked in; otherwise reply
   in the language the learner just used, then offer to return to ${learner.learningLocale}.
   ```

   Without this, merging run 9 would have silently reverted 3669ff5's fix
   for the in-browser tutor — the only caller of the compact prompt — which
   is exactly the "one side's behaviour lost" failure this merge exists to
   avoid. Rule ORDER and the rule COUNT (11) are unchanged, so lane B's
   measured ordering result stands; "keep level A1" is not repeated because
   compact rule 1 already sets the level. The compact tests are `toContain`
   assertions, not byte-golden, and all still pass.

---

## Proof

| Check | Result |
|---|---|
| `pnpm typecheck` (root) | clean — all 5 projects, no output |
| `pnpm test` (root) | **105 files, 1062 tests, 1062 passed, 0 failed** (merge/run9 alone 1046, main alone 856; +16 from main's PRs) |
| `pnpm --filter @sotto/voice test` | **18 files, 299 tests, all green** |
| `pnpm --filter @sotto/client test` | **48 files, 459 tests, all green** |
| `npx eslint` on the four resolved files | **0 errors, 0 warnings** |
| `pnpm lint` (whole tree) | **0 errors**, 27 warnings — the 6 `shots2x.mjs` errors the first merge recorded are gone, fixed by main's `eslint.config.js` change in PR #1 |
| `npx prettier --check` on the four resolved files | "All matched files use Prettier code style" |
| `pnpm content:validate` | **0 errors, 223 warnings** — identical to the first merge's baseline, and unchanged by the 39 new parchment covers |
| `pnpm --filter @sotto/client web:export` | exit 0, 9 packs + landing + PWA manifest (`v1788901955162.7708`) |
| `BASE_URL=http://localhost:8091 node e2e/hosted.mjs` | **RESULT: PASS**, `TAPS landing -> reader = 4` at **375 and 1440**, offline reload honoured at both. Run twice, same result. |
| Playwright 375×812, `/voice/fr-cendrillon?mode=discuss`, seeded onboarded fr-FR profile | passage card, then **Try the tutor free for 3 days** / "$9.99 a month or $79 a year after the trial. Nothing to install." / **Run it in this browser** / "About 1462 MB, downloaded once. Slower than the plan." / **Use your own OpenAI key** / **Read alone** — the trial-first list directly under the passage, no blank spacer band, no page errors |

Both sides' suites are present and green side by side: main's
`capture-privacy.test.ts` (4) and its `browser-cascade.test.ts` privacy
regression (file now 16), `selectedPath.test.ts` (2), the widened
`availability.test.ts` (43) and `sessionManager.test.ts` (18), the server's
new `llm.test.ts` streamed-speech cases and
`lazyNarrationRegistry.test.ts` (2) — alongside run 9's
`browser-cascade-transcript-gate` (59), `-reply-shape` (24), `-llm-turn`
(26), `-vad` (19), `-speaking-window` (11), `-tts-text` (12), `-markers`
(23), `-tool-protocol` (10), and the client's `playbackHold` (8),
`captionCorrection` (8), `micPress` (4), `didNotCatch` (4).
**Nothing was escalated: no capture-privacy test and run 9 test could not
both pass.**

The static server on :8091 was started for the smoke and stopped afterwards
(port confirmed free). As in the first merge, `discuss-quality.mjs` was not
run: it is a live-model probe, not a merge gate.

## Uncertain / worth a second pair of eyes

1. **Compact rule 3 is my wording, not either PR's.** The behaviour is
   3669ff5's and the necessity is real (otherwise the browser tutor loses
   it), but the exact sentence was written here and has never been put in
   front of the 2B model. run 9 lane B's evidence is that this prompt's rule
   *order* is load-bearing; order is unchanged, but rule 3 is now ~90
   characters longer, and that has not been measured live. If the
   orchestrator would rather ship the merge with run 9's rule 3 untouched,
   reverting that one line is safe and self-contained — the cost is that the
   in-browser tutor keeps ignoring explicit reply-language requests, which
   the UX findings row flags as already imperfect even on the large model.
2. **Still no test covers `worker.ts`.** Carried over from the first merge:
   all three resolved hunks are in a Worker entry point with no unit test on
   any branch. The privacy claim above is argued from four read lines
   (`handleFrame`, `syncCapture`, `CaptureGate`'s callback guard, the `mute`
   case), not from a test that would catch a mistake. `e2e/mic-privacy.mjs`
   arrived with PR #1 and is the thing that would actually prove it in a
   browser; it was not run here (it needs a live mic-permission context, and
   the task's proof list did not ask for it). Worth one run before this is
   fast-forwarded into `main`.
3. **`inputGeneration` is not bumped by `ptt`.** That is main's behaviour,
   kept as-is rather than invented on: a PTT press mid-transcription does
   not cancel the in-flight segment. It is not a privacy hole (that audio
   was captured with intent, while unmuted) but it is the one asymmetry
   between the three epoch bump sites, and it is deliberate on main's part,
   not an artifact of this merge.
4. **The regenerated golden now pins main's wording.** If PR #1's prompt
   sentence is itself revisited, the fixture will fail again — by design.
   The docstring now says which commit it was regenerated for.
