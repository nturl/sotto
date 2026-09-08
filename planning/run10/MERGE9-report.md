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
