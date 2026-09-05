# Sotto deep bug audit, lane 1 of 4: data model: tokenId identity, persistence and import/export, the review scheduler

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
3. **Run what you can, but the orchestrator already ran `pnpm check` for you; its tail is at the bottom of this brief.** Read-only tools (`git log`, `git show`, `grep`, `cat`, `node -e` on pure functions) are fine. If the sandbox blocks a command, note it once and move on; do not burn turns fighting it. If a finding is demonstrable with a short failing test, write the test inline in the report as a code block rather than to disk.
4. **Every finding needs a failure scenario.** Concrete inputs or state -> wrong output, crash, data loss, or silent misbehavior. "This looks fragile" is not a finding. "When the learner saves a word, then rebuilds the pack, then opens vocabulary, the saved word points at a different token because tokenIds are positional" is a finding.
5. **One idea per finding.** Do not bundle.
6. **Your sandbox is read-only and you are one of four parallel auditors, each with three areas.** Do not try to edit or commit anything. Your entire report goes in your final message; the orchestrator captures it verbatim. Anything not in the final message is lost.

## Your areas

You own areas A, D, E. Three other auditors own the rest in parallel; do not spend turns on their areas except where a trace from yours leads there.

### A. Identity and stability of tokenIds
`packages/core/src/tokenize.ts`, `packages/content/src/build.ts`, `apps/client/src/state/vocabulary.ts`, `packages/core/src/review.ts`. Saved words, reading position, review cards, and narration timings all key on tokenIds. Ask: are tokenIds stable across a content rebuild? Across a source-bundle edit that inserts a word? Across the zh-TW simplified-to-traditional override map added in commit 390ef4b? What does a stale tokenId do at every consumer? What happens to a saved word whose token no longer exists?

### D. Persistence, import, export
`apps/client/src/platform/persistence.{web,native}.ts`, `persistence.types.ts`, `apps/client/src/state/createStore.ts`, `importExport.ts`, `packages/core/src/export.ts`. Two storage backends (idb on web, expo-sqlite on native) behind one interface. Ask: is every field the store writes actually round-tripped by both backends? The prior review found import drops `sessions`. What else drops? Is there a schema version? What happens when a v-next export is imported into this build, or when the store shape changes and an existing idb database is opened? Concurrent writes from two tabs on web? A crash between the progress write and the vocabulary write?

### E. The review scheduler
`packages/core/src/review.ts` (SM-2-lite). Trace the interval math for every grade at every step. Look for: intervals that never grow, intervals that overflow, cards due in the past forever, timezone handling of "due today", what happens to a card whose token was removed, and whether `review.test.ts` actually pins the schedule or just checks shape.

## Report format

Your final message IS the report. Use these sections, in this order (omit 6, 7, 8 if they do not apply to your areas, but lane 4 must fill 7 and 8):

1. **Method**: what you ran, what you could not run, how long you spent per area.
2. **Top findings**: ranked by severity, at most 10 for your three areas. Each: title, severity (BLOCKER / SERIOUS / MINOR), VERIFIED or INFERRED, `file:line` anchors, failure scenario, root cause, the smallest fix you would suggest (one or two sentences, no code unless a diff is clearer than prose), and whether the prior review missed it or misdiagnosed it.
3. **All other findings**: one line each, same severity tags, grouped by your areas.
4. **Known unknowns**: questions the code raises that nothing answers. Each with the provoking `file:line` and what would be needed to answer it.
5. **Undocumented assumptions**: things the codebase silently depends on that no document states (environment, model behavior, timing, data shape, platform). These are the seeds of the next incident.
6. **Prior review corrections**: any finding in ADVERSARIAL-REVIEW.md that you believe is wrong, overstated, or has a different root cause. Cite evidence.
7. **Contract drift table**: from area K.
8. **Missing tests**: from area L.
9. **What is solid**: at most five things you traced and would leave alone, with why. Be specific; "the tool layer" is not specific, "zod parse in `tools.ts` rejects a tokenId outside the current chapter at line N" is.

Severity guide: BLOCKER = data loss, crash on a mainline path, security exposure, or a user-visible claim in the README that is false. SERIOUS = wrong behavior on a reachable path, or a contract violation another package depends on. MINOR = everything else worth fixing.

## Stop conditions

Stop when you have covered all three of your areas with a written conclusion for each AND have read every file those areas name at least once, whichever comes later. Read across package boundaries whenever a trace leaves your area; the areas are a starting point, not a fence. Do not stop because the top-findings list is full. If you run out of budget, write the report with what you have and put "INCOMPLETE: area X not covered" at the top.

Do not soften findings to be polite and do not inflate minor ones to fill the list. The reader is the developer who orchestrated the build, is comfortable with bad news, and will act on what you write.


## Orchestrator pre-run results

<<PRECHECK>>
