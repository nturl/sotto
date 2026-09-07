# Lane R — Adversarial review of run 8 against the mockup (wave 3, Opus, read-mostly)

**Task.** Break the claim "the app UI v2 mockup is shipped". Read every lane's diff and report, run the app, and compare screen by screen against `planning/design/app-mockup-v2.html` and `APP-V2-SPEC.md`. Findings only; no fixes unless the card says so.

**Inputs.** `planning/run8/PLAN.md`, `planning/run8/cards/*.md`, `planning/run8/{A,B,C,D,E}-report.md`, `git log --oneline 78c86ce..HEAD` and `git diff 78c86ce..HEAD -- apps/client packages/core planning/design/DESIGN.md`. Live Metro on :8081 and content on :8790 (already running). Screenshot helper `~/Claude/sotto-run8/shots.mjs`. The mockup's ban list. The e2e scripts in `apps/client/e2e/`.

**Owned files.** `planning/run8/R-adversarial.md` only. You may write throwaway scripts and screenshots under `~/Claude/sotto-run8/R/`.

**Output.** `R-adversarial.md` with, for each finding: severity (P0 = visibly wrong against the mockup or a regression of word lookup / save / narration / talk / library filter / hosted journey; P1 = a mockup value missed; P2 = polish), the file:line, what the mockup says (line ref), what the app does (screenshot path or DOM evidence), and the smallest fix. Then a claims table re-grading each lane report's VERIFIED claims you checked. Then "what I could not check and why". Minimum checks:
- Every hex and size in the mockup CSS for `.cv`, `.shelf`, `.book`, `.ribbon`, `.spread`, `.btn.cta`, `.scale`, `.coll`, `.search`, `.passage`, `.transport`, `.panel`, `.save`, `.talk`, `.tabs` against the rendered computed styles at 1440 and 375 (Playwright `getComputedStyle`), not against the source.
- Ban list: grep the diff for `borderRadius: radius.full` / `9999` outside the speaker and play rings; any gradient; any blurred shadow; any progress track; ink3 on text under 13px; accent used outside CTA fill / active tab / ribbon / the two rings.
- Every `<Cover` call site renders typographically (no moon/triangle SVG anywhere in the app; visit book detail, vocabulary, search results, onboarding done, session bar).
- The four e2e selectors RECON.md §8 lists still resolve; run `node apps/client/e2e/voice-live.mjs` and `audible-probe.mjs` yourself once and paste tails.
- `pnpm --filter @sotto/client test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm format:check` at the repo root: paste failures verbatim.
- Dark scheme: switch Appearance to dark in Settings and shoot Home + Reader at 375; anything unreadable is a P1.
- 130% Dynamic Type equivalent: shoot Home at 375 with `document.documentElement.style.fontSize` bumped, or Playwright `deviceScaleFactor`; overlapping tile text is a P1.

**Permissions.** Read anything, run tests and e2e, write only `R-adversarial.md` and files under `~/Claude/sotto-run8/R/`. Commit `run8(R):` for the report only, push. No deploys.

**Stop when.** The report is committed with at least the minimum checks done and every finding carrying evidence.

**Escalate when.** Metro is down or a lane's commit is missing from HEAD (say which and stop).
