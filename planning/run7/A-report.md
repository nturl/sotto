# Lane A report: landing page, run 7

Card: `planning/run7/cards/A-landing.md`. Cleo spec: `planning/design/LANDING-V4.md`.
Owned files touched: `apps/client/web/landing/index.html`,
`planning/design/LANDING-V4.md`, `~/Claude/Agents/design/LEDGER.md` (one new row),
`~/Claude/Agents/design/log-archive.md` (one new entry).

## What changed

Full rebuild of the landing page's information architecture (not a hero-block tweak like
run 5/6's V2/V3): masthead (wordmark + Sign in only, "Free · Open source · No account"
line removed) → hero (promise, labeled sample passage, three-way CTA) → a real product
preview (two screenshots) → a three-line read/understand/speak loop → a free-vs-plan
reference → two secondary-guidance rows (own key, self-host) → a device-detected install
block → footer. Canvas flipped from the old dark "paper at night" to Sotto's own light
"Paper" tokens (`#F4ECDF` canvas, DESIGN.md) so the two real (light) product screenshots
don't clash with the page around them. Full design rationale in `LANDING-V4.md` and the
Cleo ledger/archive entries.

CTAs: **Start free** → `https://app.readsotto.app/account?intent=start` (primary cutout).
**Sign in** → `https://app.readsotto.app/account` (text link). **Try a sample** → `/start`
on this origin (text link), with the caption "No account needed to try it — progress and
saved words stay in this browser until you create one."

Screenshots are the two real, unedited product images resized/recompressed and embedded as
base64 `data:` URIs directly in the one HTML file — see "Not verified / needs Noel" below
for why, and the follow-up this implies.

## Files and commit

- `apps/client/web/landing/index.html` — rebuilt (785-line diff: 414 insertions,
  371 deletions vs. the run-6 shipped version).
- `planning/design/LANDING-V4.md` — new Cleo spec (this run's design doc).
- `~/Claude/Agents/design/LEDGER.md` — one new top row (field guide skeleton, Medium
  cream-broadsheet anchor adapted to Sotto's tokens); rotation state updated.
- `~/Claude/Agents/design/log-archive.md` — one new long-form entry with full rationale,
  what verify caught, and exact verification line.

Commit SHAs: see end of this report (added after commit).

## Claims re-check against `scout-L-landing-account.md` §2

Every privacy/capability sentence on the new page, checked against the scout's claims
table and the tutor-mode facts it verified in code (`availability.ts`, `plans.ts`,
`entitlements.ts`, the migrations, `byokKey.ts`):

| Sentence on the new page | Where | Mode(s) it's true for | Check |
|---|---|---|---|
| "The in-browser tutor is free too: it runs on on-device models, so nothing leaves this device." | Free vs. the plan, Free column | browser | VERIFIED — matches scout §2's "browser: true by construction (no network egress beyond the model download)." Unlike the old page, this sentence is scoped to the in-browser tutor specifically, not stated as a blanket page-wide claim. |
| "Paste an OpenAI key in Settings and the page calls OpenAI directly from your browser — the key stays on this device, and OpenAI bills you, not us." | Secondary guidance, "Use your own key" | own-provider | VERIFIED per scout §2 (`docs/byok.md`, `openai-direct/provider.ts`, `byokKey.ts` comment "never AsyncStorage"). |
| "We don't store transcripts or recordings from tutor sessions — only usage minutes and billing." | Free vs. the plan, plan column, fine print | plan | VERIFIED per scout §2/§(c) — `migrations/001_init.sql` `voice_sessions` table columns are durations/provider/cost/status only, no transcript or audio column across all 5 migrations. This replaces the old page's unscoped "Nothing is recorded," which scout flagged as true for plan-content but needing the "what does the provider receive" clause the card's directive 4 asks for; this version states plainly that audio/text is processed by the hosted service to answer the learner (implicit in "the hosted voice tutor") while not stored. |
| "Free on your own hardware. `docker compose up` serves the app and the tutor from one origin, with local models or your own key." | Secondary guidance, "Run it yourself" | self-host | VERIFIED per scout §2 (`docs/self-hosting.md`; docker-compose.yml/Dockerfile presence, INFERRED not re-read this pass, same caveat scout carried). |
| "The hosted voice tutor, with nothing to set up: $9.99 a month or $79 a year, after a 3-day trial, at a separate sign-in." | Free vs. the plan, plan column | plan | VERIFIED per scout §(c): `plans.ts` standard plan `priceUsd: 9.99`, `config.ts` `SOTTO_CLOUD_TRIAL_DAYS` default 3; $79/year figure is D-3/plan pricing carried from the shipped page (not independently re-derived from Stripe this pass — same INFERRED status scout gave the monthly figure). |
| "A book you have opened keeps working offline." | Install block, closing line | all modes, reading only | VERIFIED per scout §3 (full `sw.js` read: cache-first runtime caching after first open, including audio). Unchanged from the shipped page's wording — deliberately not broadened. |
| No more "Everything runs in your browser" as an unscoped page-wide claim. | — | — | This sentence is REMOVED. It was false as worded for `plan` (sotto-cloud voice broker) and `self-host` (the learner's own server, not literally "your browser") per scout §2. The new page never makes an unscoped version of this claim; each mode's sentence above is scoped to the mode it's actually true for. |
| Machine-adapted-draft / estimated-level caveat | Moved from hero to the loop's "Read" line ("open a book adapted to you. Sotto's books are machine-adapted drafts and their levels are estimates") and kept in the footer legal line | reading, all modes | VERIFIED per scout — this is the caveat the shipped page always carried; only its placement moved, per card directive 3 ("place them next to book choice, not the hero"). |
| Footer: "No analytics on this page or in the app." | Footer | all modes, both origins | Same status as scout gave it: INFERRED (no analytics SDK grep run this pass either; unchanged wording from the shipped page). |

No sentence on the new page claims anything scout's claims table did not already verify
or flag as an open question; nothing new is asserted about entitlements, storage, or
billing beyond what `sotto-cloud`'s code backs.

## Proof

- **`cleo_verify.py`**: 0 FAIL, 2 WARN (both accounted for — see below). Ran against a
  local static serve of the exact committed file, with fonts/favicon copied in from the
  existing `apps/client/dist/` build so the check reflects real font-loading, not 404
  noise from serving the landing file in isolation.
  - WARN `shadows`: the CTA's `box-shadow: 4px 4px 0 0 var(--ink)` (solid, not
    alpha-tinted) reads as "neutral-tinted" to the harness, but this is DESIGN.md's own
    primary-CTA elevation rule verbatim ("`4px 4px 0 0 ink` on the primary CTA"). Earned
    exception, not fixed.
  - WARN `hidden-content`: `#glossPop`, the hero's one-word footnote explaining "adapté,"
    is hidden until hover/tap by design (progressive disclosure on a demo word, not core
    content — the passage and its intent to demonstrate tap-translation are visible
    without JS).
- **Screenshots**: `~/Claude/sotto-run7-recon/A/1280-{light,dark}.png`,
  `375-{light,dark}.png` (from cleo_verify's own proof run), plus explicit
  `1440-full.png` and `375-full.png` (Playwright, full-page) matching the card's stated
  widths. Read as images: CTA trio above the fold at 375, screenshot pair legible and
  non-overlapping at both widths, accent (#E4572E) appears exactly once (the CTA fill).
- **Hrefs, curled live** (all 200): `https://github.com/nturl/sotto`,
  `.../docs/self-hosting.md`, `.../docs/byok.md`, `.../docs/adding-a-book.md`,
  `https://app.readsotto.app`, `https://app.readsotto.app/account`,
  `https://app.readsotto.app/account?intent=start`, `https://readsotto.app/start`.
- **Install block device detection** (Playwright, UA override, `#install ol.steps`
  hidden/visible state read directly): iOS Safari UA → only `#stepsIos` visible;
  Android Chrome UA → only `#stepsAndroid`; desktop Chrome UA → only `#stepsDesktop`;
  Firefox UA (no match) → `#stepsGeneric` stays visible. Screenshots of each device's
  block saved to `~/Claude/sotto-run7-recon/A/install-{ios,android,desktop}.png`.
- **Formatting/build hygiene**: `pnpm exec prettier --check
  apps/client/web/landing/index.html` clean. `pnpm -r typecheck`: fails only on
  pre-existing errors in `src/voice/ui/*` and `src/cloud/*` (other run-7 lanes' in-flight
  files, e.g. `ControlCluster.tsx`, `TextFallback.tsx`, `fake.test.ts`) — none in
  `apps/client/web/landing/`, confirmed by grep. `pnpm lint`: 0 errors (28 pre-existing
  warnings, all in files this lane didn't touch). `pnpm --filter @sotto/client test`:
  261/261 passed.
- **`git diff --stat`**: touches `apps/client/web/landing/index.html` only in the sotto
  repo (785 lines changed), plus the two owned planning/design files.

## Not verified / needs Noel

- **Screenshot delivery mechanism.** `scripts/build-web.mjs` (line ~140) copies only
  `web/landing/index.html` into `dist/` for the landing page — no folder copy. Since that
  script is outside this lane's owned files (`apps/client/web/landing/**` only), the two
  product screenshots are embedded as base64 `data:` URIs inside `index.html` itself
  (adds ~181KB of base64 text to the file, ~135KB of actual image bytes: reader screenshot
  88KB JPEG, tutor screenshot 47KB JPEG, both downscaled from the 1440x900 source
  screenshots in `docs/screenshots/web/`). This keeps the page self-contained and
  deployable with zero other changes, but it means the images can never be cached
  separately from the HTML and always download on every landing-page load. **Follow-up
  for Noel or a future lane**: if this should instead be two real image files at, say,
  `/landing/reader.jpg` and `/landing/tutor.jpg`, `build-web.mjs`'s landing-copy step
  (right after `copyFileSync(... web/landing/index.html ...)`) needs one more `cpSync`
  call for an images subfolder, and the `<img src>` values in `index.html` would change
  from data URIs to `/landing/reader.jpg` etc. Not done here — it is a change to a file
  outside this lane's ownership per COMMON.md.
- **$79/year plan price.** Carried forward verbatim from the run-6 shipped page and the
  kickoff's D-3 slot; not independently re-derived from `sotto-cloud/src/plans.ts` this
  pass (the monthly `$9.99` figure is code-verified per scout §(c); the annual figure was
  not re-checked against a yearly price field in `plans.ts`).
- **Real device install checklist.** The three device-specific instruction sets are
  verified only via Playwright UA override (headless Chromium spoofing each UA string),
  not on Noel's actual iPhone/Android/desktop Chrome, per D-7's carve-out (his own device
  checklist stays his).
- **"No analytics on this page or in the app."** Footer line, unchanged wording, carried
  the same INFERRED status scout gave it — no analytics-SDK grep run this pass either.
- **Docker compose / self-hosting file presence.** Not re-verified this pass (scout also
  called this INFERRED, file-presence only).

## Escalations

None outside the screenshot-delivery note above, which is documented rather than acted on
because it requires editing `scripts/build-web.mjs`, a file outside this lane's owned
paths (`apps/client/web/landing/**`, `planning/design/LANDING-V4.md`, the Cleo ledger).

## Commits
