# Sotto strategy: what the product is, what it costs, what stops (2026-09-05)

Planning-only session, Sonnet, no code. Reasoned from PAID-TIER-PLAN.md,
ADVERSARIAL-REVIEW-3.md, LEDGER.md Run 3, docs/app-store.md,
docs/evidence/public-flip-plan-2026-09-05.md, and sotto-cloud's
docs/evidence/voice-broker-staging-2026-09-05.log + DECISIONS.md. Evidence tags:
MEASURED (a number from a log), VERIFIED (read in the tree), INFERRED (pattern or
outside knowledge, not checked here), ASSUMED (nobody has checked).

## The short version

Sotto is **the free open-source app plus the hosted PWA**. That is the whole product
today, and it is the product Noel actually uses. The paid tier stays in the tree as
finished-enough scaffolding that costs nothing while it sits unused. It launches only
on a named trigger (below), as **one web-billed plan, no App Store**. Nothing gets
spent on Apple, Fly, or Vercel Pro until that trigger fires.

## 1. Free OSS + PWA only, or add paid?

**Decision: free OSS + PWA is the product. Paid is parked, not deleted.**

Why:

- Nobody pays and nobody has asked to (ASSUMED, and stated as such in the brief).
  A subscription with zero users teaches nothing and costs real money to keep
  standing up (§3 fixed costs).
- The paid build is stub-tested only (VERIFIED: LEDGER R3-C2/C3, ADVERSARIAL-REVIEW-3
  §3 "Claims vs evidence"). Six HIGH findings, of which four sit in the money path:
  unlimited concurrent Realtime mints, magic-link account takeover, a Realtime client
  that does not exist, and a client-zeroable spend ceiling. Launching means finishing
  those under Opus and then living with an on-call surface for a product with no users.
- The thing Noel personally wants from "paid", OpenAI voices on his iPhone, does not
  need a paid tier. The OSS server already speaks OpenAI as Tier 2 (docs/openai.md,
  VERIFIED exists; not re-read this session). Hosting apps/server plus the static
  client on one small machine gives Noel a personal instance reachable from the phone
  PWA, with his own key and no accounts, billing, or Apple. Cost is the same few
  dollars a month as the sotto-cloud staging box, minus every security finding.
  INFERRED: the client's `serverUrl()` resolves to the page origin on a non-localhost
  host (ADVERSARIAL-REVIEW-3 finding 5 quotes the code), so same-origin self-hosting
  works without a settings field. CONFIRM 5.
- The OSS repo must stay useful with no cloud (CONTRACTS §0, VERIFIED). Parking paid
  changes nothing there; it was additive by design (NullCloud in OSS builds).

What "parked" means: sotto-cloud stays private and undeployed; `SOTTO_CLOUD_REALTIME_ENABLED`
stays default-off; the fix lanes X1/X2 finish (they are cheap, already dispatched, and
finding 5 is a free-tier PWA defect, not a paid one); after that no new lane touches
sotto-cloud or the paywall until a trigger fires.

**Triggers to un-park** (any one):

1. Three separate strangers ask for a hosted tutor or phone tutor after the public
   flip, in issues or messages, unprompted.
2. Noel has used his own self-hosted instance for the tutor for four weeks and his
   OpenAI bill for it is over $10/mo. At that point the per-minute economics are his
   own measured numbers, not a projection.
3. Someone offers to pay before being asked.

## 2. If paid: one plan, priced off measured cost

**Decision: one plan, web billing only. Working name "Sotto Plus".**

| Item | Value | Basis |
|---|---|---|
| Price | $9.99/mo or $79/yr | Reference app sells at about $90/yr (PAID-TIER-PLAN.md); undercut on annual, match monthly |
| Tutor provider | OpenAI cascade (gpt-4o-mini transcribe + chat + tts) | MEASURED $0.0124/conversation-min |
| Tutor cap | 250 min/mo (~8 min/day) | Full-cap vendor cost $3.10 |
| Hosted imports | 2 books/mo, lazy per-chapter narration, 2 h of narrated audio/mo | ~$1.80 at gpt-4o-mini-tts $0.015/min (MEASURED rate) |
| Realtime (gpt-realtime-mini / gpt-realtime) | Not sold | $0.0242 and ~$0.0875/min MEASURED/derived; the client path does not exist (finding 3) |
| Billing | Stripe only, ~3% + $0.30 | No Apple cut, no $99/yr, no StoreKit |

Margin check at a learner who exhausts every cap (the worst case, which most will not
hit):

| Channel | Net of processor | Worst-case vendor cost | Vendor share |
|---|---|---|---|
| Stripe web | $9.39 | ~$5.00 | 53% |
| Apple 15% (Small Business Program) | $8.49 | ~$5.00 | 59% |
| Apple 30% | $6.99 | ~$5.00 | 72% |

Rule: worst-case vendor cost stays under 55% of net revenue. Stripe passes. Apple only
passes at the 15% rate with a higher SKU price, which is one more reason for §3. A
typical learner using a third of the cap costs about $1.70, so the real margin is far
wider; the rule exists so the cap never has to move mid-period (caps are copied onto the
entitlement row, sotto-cloud DECISIONS #8, VERIFIED).

Why not two plans: the Plus placeholder ($19.99, 600 realtime-mini minutes) is 73% of
revenue in vendor cost at full cap before any store cut (MEASURED, voice-broker log).
That is a plan that loses money on exactly the users who love it. Realtime becomes a
future metered add-on only if trigger 2 shows Noel himself prefers it enough to pay
the 2-7x per minute.

Plan table changes when un-parked (config only, DECISIONS #8): drop Plus and the
add-on, rename Standard, set caps above. No code.

## 3. App Store vs PWA-only for phone

**Decision: PWA-only. The App Store lane stays buildable and unspent.**

- The PWA already installs on iPhone from Safari with reading, narration,
  tap-translate, vocabulary, and the local-server tutor path (VERIFIED live at
  sotto-steel.vercel.app per the brief; iOS walkthrough evidence exists).
- The App Store exists to sell subscriptions and to be found. There is nothing to sell
  (§1), and discovery for a personal OSS build comes from the repo and the README, not
  the store.
- What the store costs: $99/yr, 15-30% of every sale, Sign in with Apple, in-app
  account deletion, App Review with a demo account, and an Expo account plus EAS
  project (docs/app-store.md, VERIFIED, none of it done). Every one of those is a
  standing obligation, not a one-off.
- What the PWA gives up on iOS: no StoreKit, no App Store listing, WebGPU in-browser
  tutor only where Safari supports it (INFERRED: Safari 26 ships WebGPU on recent
  iPhones; not tested here). None of those matter for the free product.
- The Expo native build already prebuilds cleanly with the privacy manifest
  (docs/app-store.md §4, VERIFIED). The option costs nothing to keep. It is exercised
  only if a paid tier has paying web users and Apple discovery is the bottleneck.

## 4. What "success" means for a personal build

Revenue is not the metric. These are:

1. **Noel finishes one Spanish book in Sotto**, tutor sessions included, on the
   phone PWA and the Mac, within four weeks of the public flip. Streak and
   books-finished already exist in learner state; no new telemetry (CONTRACTS §0).
2. **A stranger can self-host from the README in under 30 minutes** with no cloud:
   clone, `pnpm dev`, read a book, tap a word. One external issue or PR within a
   month of the flip counts as proof someone tried.
3. **Personal running cost stays under $15/mo** all in: Vercel Hobby for the static
   PWA (free), OpenAI on Noel's own key under a hard project budget, optional one
   small machine for the self-hosted server. Set the OpenAI monthly budget limit now
   because auto-reload is on (CONFIRM 4).
4. **The repo is public with clean history** (public-flip plan), so the project can
   be pointed at from the site and the resume as an AI/LLM build, which is the
   positioning Noel wants.

Not success: MRR, App Store rating, subscriber count. If those show up they are a
trigger (§1), not a goal.

## 5. What to stop building

Stop now (nothing further dispatched on these until a trigger fires):

- Plus plan, Realtime add-on, `gpt-realtime` and `gpt-realtime-mini` paths beyond the
  default-off flag. Do not wire the Realtime client that finding 3 says is missing.
- App Store lane: EAS login, Apple Developer enrollment, StoreKit products, App Review
  notes, Sign in with Apple Services ID, web Sign in with Apple.
- Fly deploy of sotto-cloud. Staging stays local.
- Hosted import (C4) beyond making `pnpm check` green on what is already written.
- Paywall, account, and usage screen polish, including the price-suffix and 1440
  layout items already queued to X2 if they have not landed; those screens render only
  with a cloud adapter and nobody sees them.
- Stripe test-mode and real Apple payload verification (DECISIONS #17 follow-up).
- Cross-device sync, Android, PDF import, "simplify to my level", custom domain.

Finish (already in flight or cheap, and they serve the free product):

- X1/X2 fix lanes for the HIGH findings, especially finding 5 (imported book POSTed
  to the Vercel origin on the static build) and 6 (quadratic split on unauthenticated
  upload), both of which are free-tier PWA defects.
- Lazy narration wired into the reader's chapter switch (R3-I gap).
- Word-audio sprites for the remaining books, then deploy.
- Content QA F4 (Noel's human review of FR/ES levels).
- Public flip: fresh-history repo per the plan's recommendation (CONFIRM 3), then
  flip. sotto-cloud vendors the OSS repo as a submodule at a pre-rewrite SHA and must
  re-pin after the rewrite (ADVERSARIAL-REVIEW-3 §3).
- README section "Run Sotto for yourself on a phone": self-host apps/server + static
  client on one origin with your own OpenAI key. This is the personal-tutor path
  that replaces the paid tier for Noel.
- English default, everything configurable (landed 96d4f4a, VERIFIED in git log).

## 6. Cost picture, for the record

Standing costs today: $0 fixed. Vercel Hobby hosts the static PWA; OpenAI credits are
$50 funded with auto-reload on and no live users, so the only spender is Noel.

If paid un-parks (web-only, per §2 and §3), monthly:

| Item | $/mo | Note |
|---|---|---|
| Fly.io one machine + 1 GB volume | ~5 | sotto-cloud DECISIONS #12 |
| Vercel Pro | 20 | INFERRED: Hobby terms forbid commercial use; CONFIRM 6 |
| Domain | ~1 | optional |
| Resend | 0 | free tier |
| OpenAI | variable | ~$1.70 per typical subscriber, $5 worst case |
| Apple Developer Program | 0 | not taken (§3) |

About $26/mo fixed, so roughly **five web subscribers** cover fixed costs before
Noel's time. That number is the honest bar for trigger 1: three strangers asking is
not five paying, and the decision to un-park is a decision to run at a small loss
until it is.

## CONFIRM list

1. **Park paid** as described in §1, with the three triggers. Yes/no.
2. **One plan at $9.99/mo or $79/yr, 250 cascade minutes, 2 imports, Stripe only**, if
   and when un-parked. Numbers are config; nothing to build now.
3. **Public-flip history: fresh-history repo** (the plan's recommendation) rather than
   `git filter-repo --replace-text`. Noel runs it; nothing here rewrites history. Also
   confirms sotto-cloud re-pins its submodule afterward.
4. **Set a hard monthly budget on the OpenAI project now** (suggest $20) since
   auto-reload is on. Noel's step in the OpenAI dashboard.
5. **Personal phone tutor path**: self-host apps/server + static client on one origin
   with Noel's own key. INFERRED to work from the `serverUrl()` origin logic; needs
   one Sonnet lane to prove it end to end and write the README section. Approve the
   lane.
6. **Vercel Hobby is non-commercial**: INFERRED. If paid ever un-parks, budget Vercel
   Pro at $20/mo or move the static client to the Fly machine. No action now.
7. **sotto-cloud stays private** (known unknown 7). Recommended yes while it carries
   unfixed HIGH findings.
8. **No /consult was used.** The pricing question resolved to arithmetic on measured
   numbers plus a parking decision; nothing here needed Opus. Say so if you disagree
   and want a second opinion on §2 before the numbers go into the plan table.
