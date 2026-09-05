# Sotto deep bug audit

You are auditing Sotto, an open-source graded-reader app with narration, tap-translate, spaced-repetition vocabulary, and a live local-AI voice tutor. Repo root: `~/Claude/sotto` (pnpm monorepo, TypeScript, Expo Router client for web + iOS, Node WebSocket server, three shared packages). It was built in one day (2026-09-04) by several AI coding agents working in parallel against a fixed interface contract, then reviewed once. That build history is the reason you are here: parallel workers coding to a contract produce seams, and one review pass does not find them all.

Your job is to find bugs that nobody has found yet, and to name the questions nobody has asked yet. You are not here to fix anything.

## What is already known (do not re-report)

Read these first so you know the floor:

- `planning/ADVERSARIAL-REVIEW.md`: a prior reviewer's top 10 findings plus a long list of one-liners. Anything in that file is known. If you find that one of its findings is wrong, or has a deeper root cause than stated, that IS new and worth reporting.
- `docs/verification.md`: 41 acceptance criteria with PASS / PARTIAL / DEFERRED / NOT VERIFIED status, and an explicit "Deferred" list (physical iPhone, nine-locale voice smoke, demo recordings, human content review, WebRTC provider stubs, Silero VAD fallback, dark mode). Deferred items are known gaps, not findings.
- `planning/LEDGER.md`: task cards and dated decisions. The "integration fixups queued" entries and every "NOT done" line are known.
- `planning/CONTRACTS.md`: the interface contract every worker coded against. This is the spec. Where code and contract disagree, the contract wins unless a LEDGER decision says otherwise.

Then read `planning/DECISIONS.md` and `docs/architecture.md` for intent.

## Two kinds of target

**Unknown unknowns**: defects no document mentions. Assumptions one worker made that another worker violated. Behaviors that are wrong but that no acceptance criterion would catch. Things that work in the one tested path and break in the untested neighbor.

**Known unknowns**: questions the code raises that the docs never answer. "What happens when X?" where no test, doc, or comment addresses X. You will not always be able to answer these. List them anyway, with the exact file and line that provoked the question and what you would need to answer it.

Both lists are deliverables. A thin known-unknowns list means you did not read closely enough.

## How to work

1. **Read, do not grep.** A grep hit is a lead. A finding requires that you read the file and traced the code path end to end. Every finding you report gets tagged VERIFIED (read and traced) or INFERRED (pattern match, not traced). Aim for zero INFERRED in the top tier.
2. **Trace across package boundaries.** The bugs live at the seams: `packages/core` -> `packages/content` -> `apps/client/src/state`, and `packages/voice` -> `apps/server/src/voice` -> `apps/client/src/voice`. For every exported type or function that crosses a boundary, check that the consumer's assumptions match the producer's guarantees.
3. **Run what you can.** `pnpm check` should be green (it was at commit 80aa57c). `pnpm test` runs vitest. `pnpm content:validate --fixtures` exercises the pack validator. If you can write a failing test that demonstrates a finding, do so in a scratch file and include it in the report, but do not commit it. Do not start the voice server or the local model stack unless you have them; report what you could not exercise.
4. **Every finding needs a failure scenario.** Concrete inputs or state -> wrong output, crash, data loss, or silent misbehavior. "This looks fragile" is not a finding. "When the learner saves a word, then rebuilds the pack, then opens vocabulary, the saved word points at a different token because tokenIds are positional" is a finding.
5. **One idea per finding.** Do not bundle.
6. **Do not edit source files, do not commit, do not touch `planning/research/` or `packages/content/packs/`.** Write your report to `planning/ASTRA-AUDIT.md` only.

## Where to dig

Work through all of these. Report per area even if the answer is "clean, and here is what I traced to conclude that."

### A. Identity and stability of tokenIds
`packages/core/src/tokenize.ts`, `packages/content/src/build.ts`, `apps/client/src/state/vocabulary.ts`, `packages/core/src/review.ts`. Saved words, reading position, review cards, and narration timings all key on tokenIds. Ask: are tokenIds stable across a content rebuild? Across a source-bundle edit that inserts a word? Across the zh-TW simplified-to-traditional override map added in commit 390ef4b? What does a stale tokenId do at every consumer? What happens to a saved word whose token no longer exists?

### B. The voice state machine and wire protocol
`apps/server/src/voice/session.ts`, `apps/client/src/voice/controller.ts`, `sessionManager.ts`, `useVoiceSession.ts`, `packages/voice/src/local-cascade.ts`, `packages/voice/src/events.ts`. Contract is CONTRACTS.md section 5. Enumerate every state transition the server can emit and every one the client handles. Find the ones that are unhandled, out of order, or racy. Specifically:
- Barge-in while a tool_call is in flight. Who wins? Is the tool result dropped, applied late, or applied to the wrong turn?
- Client sends `{t:'passage'}` while the server is mid-LLM-stream. Does the prompt update, and does the model's `save_vocabulary` then target the old or new passage?
- WebSocket close during `audio_start` .. `audio_end`. Does the client playback drain, hang, or leak an AudioWorklet?
- `limit` (max_duration, idle) racing with a user `end`. Double-cleanup? Persisted session record written twice?
- Reconnect. `VoiceState` includes `reconnecting`. Does anything implement it, and if not, what does the client show when the socket drops?
- Binary frame boundaries. Client sends 20-40 ms PCM16 frames; does the server VAD assume frame alignment? What if a frame is an odd byte count?
- Sample rate mismatch. Server expects 16 kHz in, sends 24 kHz out. Find every place a rate is hardcoded and check they agree, including the native audio adapter.

### C. Tool execution and the model's view of the passage
`packages/core/src/tools.ts`, `apps/server/src/voice/tools.ts`, `apps/server/src/voice/prompt.ts`, `packages/core/src/prompt.ts`, `apps/client/src/voice/toolContext.ts`. Commit da695d3 added a word->tokenId map because the tutor saved the wrong word. Check the fix is complete: every tool that takes a tokenId, every place the prompt renders the passage, and the re-resolution rule in CONTRACTS 5c ("never a silent save of a different word"). Then ask what else the model can do wrong that the zod schemas do not prevent: a tokenId from a different chapter, `set_reading_position` backward past a completed section, `mark_section_complete` on the last section, `show_explanation` with an empty body, a tool call the server relays but the client never answers.

### D. Persistence, import, export
`apps/client/src/platform/persistence.{web,native}.ts`, `persistence.types.ts`, `apps/client/src/state/createStore.ts`, `importExport.ts`, `packages/core/src/export.ts`. Two storage backends (idb on web, expo-sqlite on native) behind one interface. Ask: is every field the store writes actually round-tripped by both backends? The prior review found import drops `sessions`. What else drops? Is there a schema version? What happens when a v-next export is imported into this build, or when the store shape changes and an existing idb database is opened? Concurrent writes from two tabs on web? A crash between the progress write and the vocabulary write?

### E. The review scheduler
`packages/core/src/review.ts` (SM-2-lite). Trace the interval math for every grade at every step. Look for: intervals that never grow, intervals that overflow, cards due in the past forever, timezone handling of "due today", what happens to a card whose token was removed, and whether `review.test.ts` actually pins the schedule or just checks shape.

### F. Content pipeline and validator
`packages/content/src/{build,validate,align,narrate,gloss-fill}.ts`. The prior review said the validator cannot detect mixed-script text. What else can it not detect? Look at what `validate.ts` checks against what `types.ts` promises. Check `align.ts` LCS for the empty-transcript, single-word, and all-unmatched cases. Check `interpolateTimings` at chapter boundaries. Check `gloss-fill.ts` for what it does when a gloss is missing versus wrong. Check `prng.ts` for whether "deterministic" is actually deterministic across Node versions.

### G. Platform splits
Every `*.web.ts` / `*.native.ts` pair under `apps/client/src/platform` and `apps/client/src/ui/svg*`. For each pair: same exported surface? Same error behavior? Same async contract? Metro resolves the platform file; vitest resolves the bare `.ts`. Which file do the tests actually exercise, and is the other one tested at all?

### H. Server hardening beyond the known finding
The prior review flagged no auth, reflected CORS, and 0.0.0.0. Assume those get fixed and look at what remains: `apps/server/src/security.ts`, `config.ts`, `app.ts`. Session id entropy. Session lifetime and cleanup (`registry.ts`). Memory growth per session (PCM buffers, caption history). Per-message size limits on the WebSocket. What one malicious client can do to another client's session. Whether `SOTTO_API_KEY` can leak into a log, an error message, or a client-facing event.

### I. i18n and locale plumbing
`apps/client/src/i18n/*.json`, `useT.ts`, `packages/core/src/languages.ts`, `apps/client/src/ui/languages.ts`. Nine catalogs validated for key parity with `en.json`. Parity is not correctness. Look for: interpolation placeholders that differ between catalogs, pluralization, a learning-locale / explanation-locale / app-locale triple that produces an unsupported combination, and what the UI does when the learner picks a learning language with no narration (ro-RO, ca-ES are documented as narration-less).

### J. Expo Router and navigation state
`apps/client/app/**`. Deep link into `/reader/[bookId]` with an unknown bookId. `/review?bookId=` with no saved words. Back-navigation from `/voice/[bookId]` while a session is live. The onboarding gate: what if persistence says onboarded but the stored locale is no longer in the supported list? Commit 80aa57c mentions a deep-link book-load race that was fixed; check whether the fix covers every route that loads a book, not just the one that was tested.

### K. Contract drift
Take CONTRACTS.md section by section and diff it against the code. List every divergence, then classify: documented decision (LEDGER), silent drift, or a contract that was never implemented. The ownership map in section 8 says no worker edits outside its list; check `git log --stat` for violations and read those files with extra care, because two workers touched them.

### L. What the tests do not test
For each `*.test.ts`, state in one line what it pins and what it leaves open. Then name the five highest-value missing tests, each with the bug it would have caught.

## Report format

Write `planning/ASTRA-AUDIT.md` with these sections, in this order:

1. **Method**: what you ran, what you could not run, how long you spent per area.
2. **Top findings**: ranked by severity, at most 15. Each: title, severity (BLOCKER / SERIOUS / MINOR), VERIFIED or INFERRED, `file:line` anchors, failure scenario, root cause, the smallest fix you would suggest (one or two sentences, no code unless a diff is clearer than prose), and whether the prior review missed it or misdiagnosed it.
3. **All other findings**: one line each, same severity tags, grouped by area A through L.
4. **Known unknowns**: questions the code raises that nothing answers. Each with the provoking `file:line` and what would be needed to answer it.
5. **Undocumented assumptions**: things the codebase silently depends on that no document states (environment, model behavior, timing, data shape, platform). These are the seeds of the next incident.
6. **Prior review corrections**: any finding in ADVERSARIAL-REVIEW.md that you believe is wrong, overstated, or has a different root cause. Cite evidence.
7. **Contract drift table**: from area K.
8. **Missing tests**: from area L.
9. **What is solid**: at most five things you traced and would leave alone, with why. Be specific; "the tool layer" is not specific, "zod parse in `tools.ts` rejects a tokenId outside the current chapter at line N" is.

Severity guide: BLOCKER = data loss, crash on a mainline path, security exposure, or a user-visible claim in the README that is false. SERIOUS = wrong behavior on a reachable path, or a contract violation another package depends on. MINOR = everything else worth fixing.

## Stop conditions

Stop when you have covered all twelve areas with a written conclusion for each, or after you have read every file under `apps/*/src`, `apps/client/app`, and `packages/*/src` at least once, whichever comes later. Do not stop because the top-findings list is full. If you run out of budget, write the report with what you have and put "INCOMPLETE: areas X, Y not covered" at the top.

Do not soften findings to be polite and do not inflate minor ones to fill the list. The reader is the developer who orchestrated the build, is comfortable with bad news, and will act on what you write.
