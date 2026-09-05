# Sotto run 4: A, B, C, D. No E.

Paste this into a fresh **Opus** session with cwd `~/Claude/sotto`. Not Fable: accounts,
Stripe webhooks, and key handling are security-adjacent in substance. Opus orchestrates;
Sonnet lanes do keystrokes where the lane is not security-adjacent; Opus lanes for
anything that touches a key, a token, a webhook, or an entitlement.

Decision record: planning/STRATEGY.md (parking rationale, now superseded on sequence by
Noel's 2026-09-05 evening call), planning/design/strategy-map.html (the five routes).
Noel's call: **do A, B, C, D in that order. E (App Store) is out** until the web page has
paying customers. Ledger continues in planning/LEDGER.md as "Run 4".

---

## The prompt

You are the run 4 orchestrator for Sotto, an Apache-2.0 open-source graded-reader app
with a voice tutor. Read, in this order, before any dispatch: planning/STRATEGY.md,
planning/LEDGER.md (Run 3 and any Run 3 close-out), planning/ADVERSARIAL-REVIEW-3.md,
planning/CONTRACTS.md §0 and §5, docs/verification.md, and in `~/Claude/sotto-cloud`:
DECISIONS.md and README.md. Never name the commercial reference app anywhere; the
strings are scrubbed from history and stay scrubbed.

### What this run ships

Four routes, in sequence, each with its own gate:

- **A. Free self-host** is live. This run only adds the domain and a README that a
  stranger can follow in 30 minutes. The free PWA on Vercel Hobby stays a pure OSS
  build: no cloud adapter, no paywall UI, no external request beyond same-origin.
- **B. Bring your own key.** A learner pastes an OpenAI key into Settings and the tutor
  runs against api.openai.com directly from the static PWA, on any device including
  iPhone Safari. No account, no server of ours, no key of ours. CONTRACTS §0 stays true:
  a user-supplied key is neither auth nor payment.
- **C. Deploy kit.** One command brings up apps/server plus the static client on one
  origin, on Fly or Docker, with the deployer's own key or local model URLs. This is
  "free to deploy" made real, and Noel's own personal hosted instance.
- **D. Paid hosted.** sotto-cloud goes live on Fly under Noel's domain with ONE plan,
  Stripe web billing only, magic-link sign-in only, the OpenAI cascade, and hard caps.
  Sign in with Apple, StoreKit, expo-iap flows, the Plus plan, the Realtime add-on, and
  every App Store artifact are removed from the shipped surface or left inert and
  documented as such.

### Money rules (Noel's constraint: down at most about $50 with zero users)

- The paid client is served by sotto-cloud on the Fly machine, never from Vercel. Vercel
  stays on Hobby for the free PWA only. No Vercel Pro.
- One Fly machine, one volume, SQLite (sotto-cloud DECISIONS #12). No Postgres, no
  second machine, no managed Redis.
- No paid SaaS added: Resend free tier, Stripe with Stripe Tax, no RevenueCat, no error
  tracker, no analytics (CONTRACTS §0).
- Daily OpenAI spend ceiling stays on and defaults to $5/day on the broker. Kill switch
  stays wired.
- Never write a token allowance or a price into a worker prompt as cost control.

### Noel's steps (list these in the first report; proceed on defaults where marked)

1. Domain: DONE 2026-09-05. **readsotto.app** is registered on Vercel (team nturls-projects,
   auto-renew OFF, expires 2027-09-05, renewal would be $15). Apex points at the free PWA
   project `sotto`; `app.readsotto.app` points at the Fly app once it exists. Resend DNS
   records for magic-link mail go on this domain.
2. Fly: create the account or confirm one exists, give the session a `FLY_API_TOKEN` in
   the shell only, never in a file. Without it, everything up to `fly deploy` proceeds
   and the deploy is a one-line Noel step.
3. Stripe: put test keys, then live keys, and the webhook signing secret into Fly secrets
   (`fly secrets set`). Enable Stripe Tax in the dashboard. The run never reads Noel's
   Stripe account through any MCP or dashboard tool; keys arrive only as env.
4. OpenAI: set a hard monthly budget on the project (suggest $20) since auto-reload is
   on. Provide the broker's key as a Fly secret.
5. CONFIRM the plan: $9.99/mo or $79/yr, 250 tutor minutes on the cascade, 2 hosted
   imports with lazy narration and a 2-hour narrated-audio budget per month. Default:
   proceed with these.

### Gate 0, before any dispatch

Run 3 is closed (LEDGER "Finish line — run 3", OSS 366c5d3+, sotto-cloud 73ad92a;
vendor/sotto re-pinned to public history, verified 2026-09-05 evening). Still check:
`HEAD == origin/main` in both repos and `pnpm check` exits 0 on the committed tree.

The OSS working tree is NOT clean and will not be: Noel's parallel content session is
editing packages/content/**, packages/core/src/**, docs/screenshots/web/**, docs/*.md and
planning/*.md (about 36 files on 2026-09-05). Rules: never stage, stash, checkout, or
format those files; `git add <explicit paths>` and `git commit -- <paths>` only, for
files this run created or was permitted to edit; if `pnpm check` is red only because of
those in-flight files, run the check on the committed tree in isolation (git worktree of
HEAD in the scratchpad) and say so in the ledger. If a lane needs a file the content
session is touching, stop and report; do not edit it. Two orchestrators in one index
swept each other's work in run 2; these rules exist so it cannot happen again.

Also confirm before dispatch: the sotto-cloud `vendor/sotto` pin is re-pinned to a SHA
reachable from the public OSS `main` (it pointed at pre-rewrite history on 2026-09-05).
If run 3 did not do it, R4-D1 does, first.

### Known unknowns carried into this run (from the 2026-09-05 planning session)

Browser CORS at api.openai.com (B1 decides). Domain and Stripe live activation are both
DONE (2026-09-05), so Resend verification and live Checkout are no longer blocked on Noel. Fly machine may need 1 GB RAM (~$10/mo, not $5). Sales-tax registration is
Noel's, not Stripe Tax's. Copyrighted-upload posture is unreviewed by counsel. Pending
"S SOTTO" mark. iOS standalone-PWA mic and lock-screen audio untested. Legal pages are
read by Noel before going live. Sunset stop needs the Mac awake on the 1st.

### Lanes and task cards

Every dispatch gets a seven-field card in LEDGER.md before it starts (Task, Inputs,
Output, Proof, Permissions, Stop-when, Escalate-when). Path-scoped commits only
(`git commit -- <paths>`); lanes share one index. Two serious attempts, then the route
changes.

**R4-B1 CORS spike (Opus, 30 minutes, first thing).** Task: prove from a static page in
iPhone-shaped Safari and desktop Chrome that api.openai.com accepts browser calls with a
user-supplied key for `/v1/audio/transcriptions`, `/v1/chat/completions`, and
`/v1/audio/speech`, and that the Realtime WebSocket accepts a standard key from a page.
Inputs: a throwaway key Noel provides in the shell for this spike only, revoked after.
Output: docs/evidence/byok-cors-2026-09-XX.log with request/response shapes and the
exact CORS headers seen, no key material. Proof: three 200s and one open socket from a
`file://` or Vercel-hosted page. Permissions: docs/evidence/** only. Stop when: the four
calls are proven or refused. Escalate when: any of the three REST endpoints refuses
browser origins; then B becomes "BYOK via C's server" and B2 is re-scoped before it
starts.

**R4-B2 BYOK provider and settings (Opus for key handling, Sonnet may take the UI).**
Task: `OpenAIDirectProvider` in packages/voice implementing VoiceProvider over the
three REST calls (or the Realtime socket if B1 proved it and latency is better),
selected by `pickProvider` when a key is present and no local server or cloud adapter
is; a Settings row "OpenAI key (optional)" storing the key on-device only
(localStorage on web behind a clear label, expo-secure-store on native), with a
"Remove" action and honest copy: the key never leaves the device except to OpenAI. The
voice screen's availability probe treats a stored key as an available `byok` path.
Inputs: packages/voice/src/{provider,transports}/**, apps/client/src/voice/
sessionManager.ts and availability.ts, apps/client/app/profile.tsx, docs/openai.md.
Output: provider + tests, settings row, `byok.*` i18n keys in all nine catalogs, docs/
byok.md. Proof: unit tests with a mocked fetch; a live tutor session on the hosted PWA
at 375 with Noel's key entered through the UI, transcript in docs/evidence/; grep proves
the key string never appears in any log line or network request other than to
api.openai.com. Permissions: those paths; no server, no cloud, no content changes.
Stop when: proofs pass and `pnpm check` is green. Escalate when: the key must transit
anything but the device and OpenAI; then stop, do not proxy it through our server.

**R4-B3 BYOK import (Sonnet, only if cheap).** Task: if `importBook` from
@sotto/content can run in a browser worker with fetch-backed gloss/translate/narrate
and no Node-only imports, wire hosted-PWA import to run on-device with the BYOK key.
Otherwise write one paragraph in docs/importing-books.md that import on the hosted PWA
needs either the local stack or a C-style self-hosted server, and stop. Escalate when:
the library needs `fs` or a native module; do not fork the pipeline.

**R4-C Deploy kit (Sonnet).** Task: a root `Dockerfile` that builds the static client
and apps/server into one image where the server serves the client on the same origin;
`docker-compose.yml` with the optional local-model services documented as external
URLs; `fly.toml.example`; docs/self-hosting.md "Run Sotto for yourself" covering
Docker, Fly, and Tailscale-to-your-Mac, with the env table (`OPENAI_API_KEY` optional,
local STT/LLM/TTS URLs optional, at least one path required for the tutor). Inputs:
apps/server/src/{app,config}.ts, apps/client/scripts/serve-static.mjs and
web:export, docs/openai.md, docs/local-models.md. Proof: `docker compose up` on this
Mac, then the Playwright hosted smoke (apps/client/e2e) passes against
http://localhost:<port> including one tutor turn with `OPENAI_API_KEY` set; a Fly
deploy if the token exists, else the exact command and its current failure output in
the doc. Permissions: root Dockerfile, docker-compose.yml, fly.toml.example, docs/
self-hosting.md, README.md "Three ways to run it" section only, .dockerignore. Stop
when: the smoke passes in the container. Escalate when: the server cannot serve the
static export without a client change; then name the one change and stop.

**R4-A README + domain (Sonnet, after B2 and C).** Task: README rewritten so the first
screen answers "what is it, how do I read a book in 30 seconds, three ways to run it
(hosted PWA, your own key, your own server), how to add a book." Domain wired into
README, PWA manifest, and docs once Noel names it. Proof: a fresh clone on a clean
directory followed literally by a Sonnet subagent with no repo context reaches a
readable book in under 30 minutes, timed in the report. Permissions: README.md, docs/
index pages, app.config.ts manifest fields only.

**Gate 1.** B2 live on the hosted PWA with Noel's key, C smoke green in a container,
`pnpm check` green, README walk timed. Report to Noel by iMessage with the CONFIRM
items and the Noel steps still open. Do not start D without the Fly token and Stripe
test keys present as env.

**R4-D1 Cloud trim and hardening (Opus).** Task: in sotto-cloud, confirm the run 3 fix
lanes closed findings 1, 2, 4, 8 of ADVERSARIAL-REVIEW-3 (re-read the code, not the
ledger); make finding 3 moot by removing `realtime` and `realtime-mini` from the plan
table and returning 503 from `/voice/realtime/secret` with the flag off (leave the code
paths in place, documented as parked); drop the Plus plan and the add-on from
`src/plans.ts` defaults; remove Sign in with Apple from the exposed routes (magic link
only; the Apple verifier stays in the tree, unregistered, with a DECISIONS entry);
Stripe Tax enabled on Checkout sessions; ToS and privacy pages served by sotto-cloud
from markdown Noel can edit (plain, factual, no legal boilerplate invented); account
deletion from the web account page. Add `trustProxy` one hop, per DECISIONS #25, and
verify the rate limiters are per-IP behind Fly. Proof: `pnpm check` green, fixture
tests for the trimmed plan table, a staging run showing 503 on the realtime mint, 404
on `/auth/apple`, and a Stripe test-mode Checkout completing end to end with real test
keys from env and the entitlement flipping on the webhook. Permissions: everything in
sotto-cloud except vendor/sotto's contents; re-pin `vendor/sotto` to the current
post-rewrite OSS `main` SHA (it points at pre-rewrite history today). Stop when: proofs
pass. Escalate when: a finding cannot be closed without a schema change; then write
the migration plan and stop.

**R4-D2 Paid client served from Fly (Sonnet, after D1).** Task: sotto-cloud serves the
static client export built with `EXPO_PUBLIC_CLOUD_URL` set to its own origin, so
`app.readsotto.app` is the paid app and the Vercel URL stays the free one. Paywall copy per
planning/design/PAYWALL.md, one plan card, English default, price suffix localized,
"Subscribe" goes to Stripe Checkout, "Manage" to the Stripe portal, no App Store
buttons or restore-purchases row rendered on web. Import screen on the paid origin
uses hosted import (C4 from run 3) behind the entitlement. Proof: Playwright against
staging at 375 and 1440: signed out, sign in by magic link, paywall, stub subscribe in
staging mode, tutor session hits the cascade, cap message at the limit, account
deletion; screenshots in docs/screenshots/web/. Permissions: apps/client/app/paywall/**,
apps/client/src/cloud/**, sotto-cloud static-serving route, build script. Stop when:
the flow passes. Escalate when: any screen needs expo-iap or Apple code to compile on
web; then stub it out behind `Platform.OS === 'ios'` and note it.

**R4-D3 Deploy and switch to live (Opus, Noel present for the live-key step).** Task:
`fly deploy` staging with stub billing, run D2's flow against it, then redeploy with
`SOTTO_CLOUD_BILLING=stripe` and live keys from Fly secrets, verify `/health` shows
stripe and no stub routes, run one real $9.99 Checkout with Noel's own card and refund
it in the dashboard, confirm the webhook flips the entitlement and the refund reverts
it. Set the daily spend ceiling and kill switch env. Proof: staging and live transcripts
in sotto-cloud/docs/evidence/ with no secret material; the refunded charge id.
Permissions: fly.toml, Fly secrets by name only, docs/evidence/**. Stop when: the live
round trip is proven. Escalate when: the webhook does not arrive within five minutes;
do not retry the charge, investigate the endpoint.

**R4-S Sunset switch (Sonnet, after D3; the Stripe read is a restricted read-only key,
so Sonnet is fine).** Task: a scheduled checker that ends the paid experiment on its own
if nobody pays. Script `ops/sunset-check.mjs` in sotto-cloud: reads the count of active
subscriptions from Stripe with a restricted read-only key (Noel creates it; env only),
excludes Noel's own customer id, appends `{date, activeSubs, spendMonthUsd, action}` to
`ops/sunset-ledger.csv`, and texts Noel via the existing iMessage path. Clock starts on
the date the R4-A README walk passes, written into `ops/sunset.json` as `startedAt`.
Rules: month 2 with zero subs = text only ("soft check, one month left"); month 3 with
zero subs = `fly machine stop` on the sotto-cloud machine (compute stops billing, the volume
keeps the database), then text what it did; any month with subs > 0 = do nothing and
say so; any month with zero subs and OpenAI spend over $5 = stop early and text, since
that is a bug or an abuser. Destroying the app, volume, or Stripe products is never
automated; the text names the manual commands. Schedule: LaunchAgent on Noel's Mac
monthly on the 1st (mirror in a GitHub Action with `workflow_dispatch` so it can run
with the laptop closed; the Action only texts, it never stops the machine, since it
has no Fly token). Inputs: the Stripe restricted key and `FLY_API_TOKEN` as env from
Fly secrets or the Mac keychain, never in a file; ~/Claude/loops/ conventions for
specs; the iMessage send path used by other loops. Output: ops/sunset-check.mjs,
ops/sunset.json, ops/README-sunset.md, the LaunchAgent plist under
~/Library/LaunchAgents with the loop spec in ~/Claude/loops/. Proof: a dry run with
`--dry-run` against Stripe test mode producing the ledger row and the text, at each
of the three branches (forced by a `--pretend-month` flag), with the `fly machine
stop` call logged but not executed; one real run in month 0 that reports and does
nothing. Permissions: sotto-cloud/ops/**, ~/Claude/loops/sotto-sunset.md, the plist.
Stop when: three dry-run branches and one real month-0 run are logged. Escalate when:
the Stripe restricted key cannot list subscriptions without write scopes; then use the
webhook-fed entitlement table in SQLite over the Fly API instead, and say so.

**Gate 2.** Live paid round trip proven and refunded. Sunset switch dry-run logged. `pnpm check` green in both repos.
docs/verification.md gains Tier 4 "hosted" and Tier 5 "BYOK" rows with honest
PASS/PARTIAL status.

**R4-R Adversarial review (Opus, read-only).** "What leaks, what costs, what is fake",
across both repos at the gate 2 SHAs, with a "claims vs evidence" table. Then one fix
lane, then re-review only the fixed items.

**Close-out.** LEDGER finish-line section; docs/verification.md; memory update
(project-sotto-reading-app.md); one iMessage to Noel with: live URLs, what he must
still do, what was left PARTIAL and why, and the month-one fixed cost actually
incurred.

### Definition of done

- A learner with no account can read, hear, and tap-translate on the Vercel PWA with
  zero external requests. (A)
- A learner with an OpenAI key can talk to the tutor on the hosted PWA on an iPhone
  with no account and no server of ours. (B)
- A stranger can run `docker compose up` and have Sotto with a tutor on their own key
  within one page of docs. (C)
- A learner can pay $9.99 on `app.readsotto.app`, talk to the tutor within the cap, hit the
  cap and read a clear message, delete their account, and Noel's fixed monthly cost
  for it is one Fly machine. (D)
- Nothing App Store shaped is required for any of the above. (no E)

### Routing and cost

Orchestrator Opus. Opus lanes: B1, B2 key handling, D1, D3, R. Sonnet: B3, C, A, D2.
/fanout only for i18n key fills and doc volume. Never haiku. Never Fable. Check plan
headroom before dispatching parallel Opus lanes.

### CONFIRM (defaults in parentheses; proceed on defaults, report in the first message)

1. Domain: readsotto.app (bought 2026-09-05, auto-renew off). Apex -> free PWA on Vercel; app.readsotto.app -> Fly paid app.
2. Plan numbers ($9.99/mo, $79/yr, 250 min, 2 imports, 2 h narrated audio).
3. Free PWA stays on Vercel Hobby with no cloud UI; paid app served from Fly (yes).
4. Sign in with Apple removed from the web surface (yes).
5. Realtime parked behind a 503 (yes).
6. Stripe Tax on (yes).
7. BYOK import in-browser only if the pipeline runs in a worker unchanged (yes).
8. Sunset switch: paid experiment runs 3 months from the README walk passing; zero
   subscribers at month 3 stops the Fly machine automatically, month 2 is a warning
   text, destroy stays manual (Noel, 2026-09-05).
