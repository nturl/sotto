Run the Sotto deep bug audit on GPT-6 Astra through /fanout. You are the orchestrator; Astra does the reading. Judgment, deduplication, and the final report stay with you. Everything you need is pre-built under ~/Claude/sotto/planning/astra/. Do not rewrite the briefs; run them.

Ground facts (verified 2026-09-04, do not re-derive):
- Codex CLI 0.144.0 is logged in. ~/.codex/config.toml already defaults `model = "gpt-6-astra"`, so `fanout_dispatch.py codex` with no `--model` IS Astra. Confirm with `grep '^model' ~/.codex/config.toml` before dispatch; if it drifted, pass `"model": "gpt-6-astra"` in every manifest task instead of editing config.
- Codex cap is 5 calls per /fanout run. The plan spends exactly 5: four parallel audit lanes, then one verification call. A failed lane's retry takes the fifth slot instead; verification is dropped, not the retry.
- The dispatcher runs codex in the current working directory with a read-only sandbox and captures the final message with `-o`. So dispatch from the repo root, and know that Astra cannot write files: each report arrives as the lane's out file.
- Reasoning effort is set in config (`model_reasoning_effort`), not by the dispatcher. For this run it should be `high`.
- ~/Claude/sotto has uncommitted edits from another session (reader, server config, registry). The audit must run against a clean commit, not the dirty tree.

Step 1, prepare (about 5 minutes, no Astra calls):
1. `cd ~/Claude/sotto && git status --short && git log --oneline -1`. Note the HEAD hash. If HEAD is behind origin, `git pull --ff-only` first.
2. Make a clean worktree at HEAD in the scratchpad: `git worktree add <scratchpad>/sotto-audit HEAD`. Then `cd` there and `pnpm install --frozen-lockfile --offline` (fall back to online if offline fails). All dispatching happens from this worktree so Astra reads committed code only. Copy `planning/astra/` into the worktree if it is not already committed there.
3. In the worktree run `pnpm check 2>&1 | tail -60 > planning/astra/precheck.txt`. Then replace the `<<PRECHECK>>` marker in each of the four `brief-*.md` files with the contents of precheck.txt, prefixed by the HEAD hash and the line "Ran by the orchestrator on <date> at commit <hash>; treat as ground truth for what is green."
4. Flip reasoning effort: back up `~/.codex/config.toml` to `config.toml.bak-astra-audit`, then set `model_reasoning_effort = "high"`. You will restore it in step 5 no matter what happens.
5. `python3 ~/Claude/model-routing/fanout_dispatch.py preflight` and `python3 ~/Claude/model-routing/fanout_wave.py --manifest planning/astra/wave.json --dry-run`. Both must pass before spending anything. If preflight says the Codex 5-hour window is nearly spent, stop and tell Noel; do not start a wave that will die mid-lane.

Step 2, run the wave (4 Astra calls, parallel):
`python3 ~/Claude/model-routing/fanout_wave.py --manifest planning/astra/wave.json --max-workers 4` from the worktree root, in the background with a generous timeout (each lane may run 15 to 40 minutes at high effort). Do not poll; wait for the notification. While waiting, do nothing else that spends Codex quota.

Step 3, verify each lane against its own brief (you, not Astra):
For each `out-*.md`, check: (a) all three areas have a written conclusion; (b) top findings carry `file:line`, a failure scenario, and a VERIFIED or INFERRED tag; (c) the known-unknowns and undocumented-assumptions sections are non-empty; (d) it does not re-report the ADVERSARIAL-REVIEW.md top 10 as new. A lane that is INCOMPLETE, empty, or SUSPECT_TRUNCATION gets one retry using the fifth call; if two lanes fail, retry the one covering areas B/C/H (voice) and mark the other as not covered. Log each lane in ~/Claude/model-routing/ledger.csv as `2026-09-04,sotto-audit-lane<N>,codex,high,1,<minutes>,<note>,<retries>,<accepted|rejected>`.

Step 4, the fifth call, verification (1 Astra call):
Merge the four top-findings lists. Deduplicate by root cause. Take the top 12 claims by severity (all BLOCKERs and SERIOUS first). Fill `<<CLAIMS>>` in `brief-5-verify.template.md` with them, numbered, each as: title, claimed severity, cited `file:line`, failure scenario, one-line root cause (copy the auditor's words, do not paraphrase). Save as `brief-5-verify.md`, dispatch it with `fanout_dispatch.py codex --prompt-file planning/astra/brief-5-verify.md --out planning/astra/out-5-verify.md` from the worktree root. Log it in the ledger.

Step 5, restore and synthesize (you, Sonnet, no Astra calls):
1. Restore `~/.codex/config.toml` from the backup. Do this first, before writing anything, so a crash later cannot leave effort pinned high.
2. Write `~/Claude/sotto/planning/ASTRA-AUDIT.md` in the main checkout (not the worktree) with these sections: Method (which lanes ran, retries, wall time, HEAD hash, precheck summary); Top findings (the verified list from step 4, ranked, with verdicts applied: REFUTED claims move to a "Refuted" subsection with Astra's reason, DOWNGRADED claims keep their new severity); All other findings by area A through L (one line each, lifted from the lane reports); Known unknowns (merged from all lanes, deduplicated); Undocumented assumptions (merged); Prior review corrections (merged); Contract drift table (from lane 4); Missing tests (from lane 4); What is solid (merged, at most five). Do not soften Astra's language and do not editorialize; your value-add is dedup, ranking, and the verification verdicts. Keep the raw `out-*.md` files alongside as evidence.
3. `git worktree remove <scratchpad>/sotto-audit`. Then in the main checkout stage ONLY `planning/ASTRA-AUDIT.md` and `planning/astra/` (never the other session's dirty files), commit as `planning: GPT-6 Astra audit, 4 lanes + verification`, push.
4. Final message to Noel: the HEAD hash audited, a count table (BLOCKER / SERIOUS / MINOR after verification, with how many claims were refuted), the top five findings in one line each, the three most important known unknowns, and which lanes if any were not covered. Under 300 words. No praise of the codebase.

Rules for the whole run:
- Never pass `--model` for a downshift here; this run exists to spend Astra.
- Do not fix anything Astra finds. This is an audit, and the tree belongs to another session right now.
- Do not use the Agent tool or /consult; the whole point is that the reading happens on OpenAI's quota, not the Claude plan.
- If the wave dispatcher refuses the manifest on budget grounds, the cap is real; do not hand-roll `codex exec` to get around it.
- If you get stuck for more than two attempts on any mechanical step (worktree, pnpm install, config flip), stop and report exactly where, with the error text.
