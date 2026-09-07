# Run 7 status page, Cleo spec

Output: `~/Claude/sotto/planning/run7/status.html`. Single file, one `<style>`, one `<script>` (only for the reduced-motion-safe tick reveal and a copy control), no external requests, no CDN fonts.

**Fit read.** Reader: Noel, on a laptop or phone, checking in on a run that has been going for four hours; job: reconstruct what landed, what is proven, what still needs him; lives one evening. So: light chronicle.

**Register: Chronicle.** Time is the axis. Last three ledger rows are field guide, dossier, manifesto; chronicle is fresh.

**Anchor:** Linear changelog discipline (cool light canvas, tabular mono timestamps, hairline rails) adapted: canvas warmed one step toward Sotto's paper so it reads as the same family without repeating the cream broadsheet. Canvas `#f1f2ef`, ink `#1c1d1a`, muted `#6b6e66`, hairline `#d8dad3`. Dark scheme via `prefers-color-scheme`: canvas `#121212`, ink `#d2d2d2`, hairline `#2a2b28`.

**Flood:** cool paper, one color world. **Emphasis hue:** one, Sotto green `#2F5D3A` (dark: `#8fbf9a`), job: the "proven live" marks and the single primary link. **Semantic states** (always with a glyph and a word): verified `#2F5D3A` ●, partial `#B8860B` ◐, unsupported `#A23B2E` ○, pending `#6b6e66` ◌.

**Device (F11, content-carrying): the commit rail.** A vertical rail down the left of the chronicle; each event is a tick with a tabular mono time and a short SHA; lane events sit on the rail in landing order; the rail's colour turns green only from the point where the spoken-exchange proof passed. It encodes what the page is about: things landing over time, and the moment the finish line was crossed.

**Type cast.** Display: system sans stack (`"Helvetica Neue", "Inter", system-ui, sans-serif`) weight 300, `clamp(2rem, 1.2rem + 3vw, 3.5rem)`, tracking -0.02em, line-height 1.0. Reading: same stack 400, 1.0625rem, line-height 1.55, measure 38rem max. Metadata: `ui-monospace, "SF Mono", Menlo, monospace` 0.75rem, tracking 0.04em, `font-variant-numeric: tabular-nums`, uppercase only for the section eyebrows.

**Spacing and grid.** 8px base. Page max-width 64rem, padding `clamp(1rem, 4vw, 3rem)`. Chronicle grid: `grid-template-columns: 7rem 1fr` on desktop (time column, content), collapsing to one column under 640px with the time inline. Section gaps 4rem. Radius vocabulary {0, 4}. Borders hairline 1px; no shadows.

**Structure, top to bottom.**
1. Masthead: eyebrow "Sotto · run 7 · 2026-09-06", display title "From a landing page to a spoken answer about Provence.", one-line deck stating where the run stands right now (review in progress; free origin not yet deployed; paid origin deploy is Noel's).
2. The state at a glance: four aligned readouts in a hairline row (lanes landed 9 of 9; tests 84 files / 672 green in isolation; proof: spoken exchange live, started 80 / samples 188,317; needs Noel: 5 items). Tabular mono numbers, no cards.
3. The chronicle (the device): every event from the fixture, in time order, with SHA, lane, one sentence, status glyph.
4. Definition of done: the kickoff's acceptance criteria as a two-column list with the state glyph and one line of evidence each. Pending rows say "review running" honestly.
5. Needs Noel: numbered, each with the exact command or decision.
6. Footer line: sources (PLAN.md, LEDGER.md Run 7, lane reports) as plain links to relative paths.

**Ban list.** No cards with empty chrome; no pill chips; no progress bars or percent rings; no emoji as status; no shadows; no reveal-on-scroll (ticks may fade in on load with a 900ms forced-visible fallback and freeze under reduced motion).

**Verification.** `~/Claude/Agents/design/tools/cleo_verify.py status.html --proof ~/Claude/sotto-run7-recon/status-proof` must be 0 FAIL; screenshots read; nothing overlaps at 375; text parity with JS off.

---

## Fixture (real content; do not invent)

Now: 2026-09-06 ~20:40. State: all nine lanes landed and pushed; adversarial review (lane R, Opus) running; free origin (readsotto.app) NOT yet deployed, waits on the review; paid origin (app.readsotto.app) deploy is Noel's call (decision slot D-5 default: no unattended Fly deploy); Noel's corpus regeneration still running in the background, packs untouched.

Events (time, sha, lane, sentence, status):
- 17:30, 46d3ed3, kickoff, "Kickoff committed; /fable gate passed with the account lane cordoned to a separate Opus process.", verified
- 17:35, —, recon, "Three read-only scouts: navigation, tutor pipeline, landing and accounts.", verified
- 17:58, 01e1139, blocker, "A Vitest file inside app/reader/ crashed every dev-server route; moved out.", verified
- 18:20, aacc9e2, plan, "PLAN.md with CONFIRM 22 to 27; seven lane cards; atomic i18n helper for nine catalogs.", verified
- 18:25, —, dispatch, "A, B, D, E, F1, F2 on Sonnet subagents; C on headless Opus.", verified
- 18:45, 0657d02, A landing, "Landing rebuilt: Start free / Sign in / Try a sample, real product screenshots, device-detected install, honest privacy sentences. cleo_verify 0 FAIL.", verified
- 18:50, a1b59c1, E own-provider, "Guided connect flow; one store-backed status; the stale 'off' control fixed at the source; /profile became /settings.", verified
- 18:55, 1d9bf0c, B navigation, "Four-row nav with Settings everywhere; library loading / empty / no-books / error states; +not-found; library filter now survives refresh.", verified
- 19:05, 87673ad, D reader, "Word sheet scrolls; save toast; 'Talk about this passage'; audio bus so narration and word audio never overlap. French word sprites measured: not truncated.", verified
- 19:10, 70a85ee, F1 pipeline, "Swallowed speech failures now surface with a not-spoken marker; specific codes for rejected setting, quota, blocked playback; retry keeps the transcript.", verified
- 19:15, 4270689 + cloud 91f7224, C account, "Real sign-in and create-account screens, four-step onboarding with a level helper, returnTo, Apple button gated by /auth/config. Found and fixed: the paid origin served the app shell for /content/packs, so it could not list books.", verified
- 19:20, 12c73d9, F2 voice screen, "Conversation screen: passage card, transcript, one control cluster, in-place hold-to-talk toggle, text fallback, recovery panels; the 'listening + push-to-talk caption' contradiction ruled out with a state log.", verified
- 19:40, 48e4de8, G integration, "Speaker mute, Replay for unspoken lines, opening turn, book title; tutor speech on the audio bus. Live probe blocked: the shared Metro had the fake voice provider baked in.", partial
- 19:50, —, orchestrator, "Metro restarted on the real local path (new launch entry sotto-metro-real-8081).", verified
- 19:58, ae32132, G2 proof, "audible-probe.mjs PASS: 80 buffer starts, 188,317 samples. Learner: 'Qu'est-ce que c'est, la Provence ? Est-ce en France ?' Tutor: 'Oui, la Provence est une région du sud de la France. C'est un lieu ensoleillé et charmant. As-tu déjà visité le sud de la France ?'", verified
- 20:05, 1c2dbc9 / 7f63de1, glue, "Server prompt-budget test synced; prettier on the helper. Isolated pnpm check green: 84 files, 672 tests, content validate 0 errors.", verified
- 20:20, —, session, "Session restarted; the adversarial reviewer was stopped before writing; relaunched fresh on Opus with its 79 screenshots.", pending
- now, —, R review, "Adversarial review running: re-verifies each lane's strongest claims, writes the Run 7 table in docs/verification.md.", pending

Definition of done (criterion, state, evidence):
- New visitor understands the offer and the free start — verified — landing V4, A-report claims table, screenshots 375/1440
- "Sign in" opens real authentication — verified locally, not on the live paid origin — C-report Playwright walk on local sotto-cloud; deploy is Noel's
- Onboarding separates learning, interface, explanation languages; no key needed — verified — C-report, four steps, tests
- Library shows content or a specific empty/error state — verified — B-report screenshots of four states
- Settings routes work and stay reachable — verified — B, D, F2 header entries; /profile redirect
- Word lookup, save, pronunciation, narration still work — verified — D-report live walk, voice-live.mjs 6/6
- Connecting a usable setting yields one consistent state — verified with intercepted validation, no real key — E-report walk
- A spoken exchange with audible output — verified live on the local path — G2 probe
- Failed voice paths show specific recovery — verified by unit tests and screenshots; own-provider failures not exercised live (needs a real setting) — F1, F2 reports
- Free, plan, own-provider, self-host each explained with a working destination — verified — A-report link check
- Install guidance matches the device — verified — A-report UA-override screenshots
- Routes survive refresh and direct navigation — verified locally — B-report; paid-origin static rewrite tested in C
- Critical flows at 375 and 1440 — verified — every lane's screenshots
- Isolated check green in both repos — verified for sotto (7f63de1); sotto-cloud check is in C-report — pending R's confirmation
- Adversarial review complete — pending

Needs Noel:
1. Deploy the paid origin after reading C-report: `cd ~/Claude/sotto-cloud && fly deploy` (the vendor pin will be bumped to the final OSS SHA first; the /content/packs fix and the sign-in screens do not reach learners until then).
2. Try the own-provider path end to end with a real setting on your device (the run cannot): Settings → Your OpenAI key → Connect and use this key → Test the tutor.
3. Review the 162 level-helper sample sentences in `apps/client/src/onboarding/levelSamples.ts` (Romanian, Catalan, Chinese most of all; no native review).
4. Decide on Google sign-in: plan in `~/Claude/sotto-cloud/docs/google-sign-in.md` needs an OAuth client from you.
5. Decide whether landing screenshots become real cached files (needs a build-web.mjs change) instead of embedded data URIs.
