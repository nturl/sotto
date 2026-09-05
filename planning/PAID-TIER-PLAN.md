# Sotto run 3 — free local tier + paid hosted tier (plan, written 2026-09-04 late)

Companion prompt: `planning/KICKOFF-3.md`. This run starts only after overnight run 2 has
closed out (gate defined in the kickoff). Ledger continues in `planning/LEDGER.md`.

## The play, in Noel's words (2026-09-04)

- **Free tier**: runs locally. Open-source repo. Anyone can add books, both by contributing
  public-domain readers to the repo and by importing their own books on their own machine.
- **Paid tier**: hosted. OpenAI voice for the tutor ("really get the AI tutor where you can
  have a discussion about the book"). Web and iPhone (App Store). Upload your own books.
- Concerns Noel named: (1) where does the other-language equivalent of an uploaded book
  come from; (2) OpenAI voice API cost.

## Feasibility verdict (orchestrator's read before the run)

Feasible, with two things that are not what the play assumes:

1. **There is no "other-language equivalent" to fetch.** Nobody sells a parallel-text
   edition of arbitrary books, and a translated edition is a separate copyrighted work
   anyway. Sotto already answers this for its own seed books: the pipeline GENERATES the
   learner-facing layer from the source text — per-word glosses (`gloss-fill.ts`), per-
   sentence translations (`translate-sentences.ts`), narration (`narrate.ts`) and word
   timings (`align.ts`). The seeds are built by exactly the pipeline an importer needs; the
   pre-build decision in DECISIONS.md ("do not special-case seeds") was made for this
   moment. So an uploaded book becomes a private content pack: tokenize -> gloss -> sentence-
   translate -> narrate -> align. Free tier does that with local models on the user's Mac.
   Paid tier does it on a hosted worker. The "equivalent" is a derived, private, per-user
   artifact; it is never a translation of the book you can hand to someone else.
2. **OpenAI voice is too expensive to sell unmetered.** Public per-minute figures (checked
   2026-09-04; verify at build time): gpt-realtime around $0.06-0.11/min in practice,
   gpt-realtime-mini around $0.02-0.05/min, and the chained cascade (mini-transcribe
   ~$0.003/min + a small chat model + mini-tts ~$0.015/min) around $0.02-0.03/min. A learner
   who talks 20 min/day costs $12-66/month on the full Realtime model. A subscription in
   the $8-12/month band (the commercial reference sells at about $90/yr) only works with
   **hard minute caps per plan, the mini model or the cascade by default, and the big model
   as an add-on**. This is a product decision, not a code decision; the plan below encodes
   caps as first-class and names the numbers as CONFIRM items.

Everything else (accounts, billing, App Store, hosting) is ordinary work with known
shapes. The genuinely unsettled item is Apple's cut on external payment links in the US
(see known unknowns); StoreKit in-app purchase is the safe default.

Sources for the numbers above (re-check before quoting to users):
https://www.cloudzero.com/blog/openai-pricing/ ,
https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions ,
https://invertedstone.com/calculators/whisper-pricing ,
https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/ ,
https://www.revenuecat.com/app-to-web-purchase-guidelines

## Naming the voice API

Noel said "OpenAI Wispr". Wispr Flow is an unrelated dictation company. Two readings:
(a) OpenAI **Realtime** API (speech-to-speech, `gpt-realtime` / `gpt-realtime-mini`),
the thing the original BRIEF.md asked for and `OpenAIRealtimeProvider` is stubbed for;
(b) OpenAI **Whisper** (STT only) inside the existing cascade, which `docs/openai.md`
already documents (Tier 2). Assumption for this run: **(a) is the paid-tier headline,
(b) is the paid-tier default** because it is 3-5x cheaper per minute, and the plan
selects between them per plan. CONFIRM with Noel in the first report.

## Shape: open core

- `github.com/nturl/sotto` stays Apache-2.0, complete, and useful with zero cloud: reading,
  narration, tap-translate, vocabulary, review, local voice tutor, and (new) local import.
  CONTRACTS.md §0 "never add auth, payments, analytics" **stays true for this repo**.
- A new private repo `sotto-cloud` (Noel's call whether it ever goes public) holds the
  hosted pieces: accounts, entitlements, billing webhooks, the import job queue, the
  OpenAI voice broker, usage metering. It depends on `@sotto/core`, `@sotto/content`,
  `@sotto/voice` as published workspace packages (or a git dependency at first).
- The client is ONE Expo app. Cloud features are a `CloudAdapter` behind an interface with
  a `NullCloud` implementation; the OSS build ships NullCloud, the App Store build ships the
  real one. No fork of screens.

## Lanes

### Lane I — Importer (OSS repo; no security surface; Sonnet)
Goal: "Import a book" on Mac web and iOS, producing a private pack that the reader,
narration, tap-translate, and tutor treat like any seed.
1. Parsers: EPUB (DRM-free only; detect DRM and say so), plain text, Markdown. PDF deferred
   (layout extraction is its own project; say so in the UI).
2. Chaptering + sentence splitting per locale using the existing tokenizers; a preview
   screen showing detected language, chapter count, word count, estimated processing time
   and (paid) estimated cost before anything runs.
3. Pipeline reuse: `@sotto/content` build/gloss/translate/narrate/align exposed as a
   library API (`importBook(source, opts)`) with progress events, not just a CLI. Lazy
   narration: chapter 1 first, remaining chapters on demand, so a 400-page novel is
   readable in minutes and the audio cost is spread.
4. Storage: private packs live in the app's local store (IndexedDB/SQLite), never in
   `packages/content/packs`, never exported with learner data unless the user asks.
5. Optional "simplify to my level": an LLM rewrite of a chapter to A1/A2, clearly labeled,
   private to the user, off by default. (Derivative work; private use only; never shared.)
6. Free tier runs all of this against the local stack (`~/ods`) with honest throughput
   numbers in the UI ("about 4 minutes per chapter on this Mac").
Owns: packages/content/src/import/**, apps/client/app/import/**, apps/client/src/import/**,
docs/importing-books.md, new i18n keys (lane-prefixed) in all nine catalogs.

### Lane P — Community content path (OSS repo; Sonnet, low effort)
Goal: a stranger can add a public-domain reader by PR without touching core.
1. `docs/adding-a-book.md` walkthrough from a Gutenberg URL to a validated bundle, using
   the importer's CLI mode plus the validator; `pnpm content:new <bookId>` scaffold.
2. CI job on PRs: validator + license-field check + "no copyrighted source" checklist in
   the PR template; a CODEOWNERS-free review rule written in CONTRIBUTING.md.
Owns: docs/adding-a-book.md, .github/**, CONTRIBUTING.md, packages/content/src/cli.ts (scaffold only).

### Lane C — Cloud services (private repo `sotto-cloud`; Opus for auth/billing/key handling, Sonnet for the rest)
Security-adjacent by substance (accounts, tokens, API keys, webhooks): route to Opus, never Fable.
1. Accounts: Sign in with Apple + email magic link (Apple requires Sign in with Apple when
   any third-party login is offered). Account deletion in-app (App Store guideline 5.1.1(v)).
2. Entitlements service: one truth table `{userId, plan, tutorMinutesCap, minutesUsed,
   importBooksCap, renewsAt}`; fed by StoreKit 2 (iOS) and Stripe (web) webhooks; the
   client reads it, never computes it.
3. Voice broker: mints short-lived Realtime client secrets (or proxies the cascade) per
   session; enforces the minute cap server-side; meters by audio seconds; the standard
   OpenAI key never leaves the server. Model per plan: cascade default, `gpt-realtime-mini`
   on the standard plan, `gpt-realtime` as a metered add-on.
4. Import worker: queue (one process + SQLite/Postgres is enough to start) running the same
   `importBook` library with OpenAI models; per-user isolation of derived assets (no
   cross-user dedup of glosses or audio, see known unknowns); storage with signed URLs.
5. Hosting: the voice path is WebSocket/WebRTC, so not Vercel serverless. Fly.io or
   Railway for `sotto-cloud`; Vercel stays for the static client. Document the choice.
6. Cost guardrails: daily spend ceiling on the OpenAI project, per-user minute cap, per-book
   character cap, kill switch env var, and a usage dashboard page for Noel.
Owns: everything in `sotto-cloud`; plus `packages/voice/src/openai-realtime/**` in the OSS
repo (the provider implementation itself is fine to open-source; it holds no secrets).

### Lane S — Store and paywall (Expo app; Sonnet, with a Cleo pass on the paywall)
1. EAS Build + TestFlight pipeline; bundle id, icons (build_icons.py), privacy manifest,
   microphone/speech purpose strings, privacy nutrition labels, App Review notes with a demo
   account.
2. StoreKit 2 subscriptions via `expo-iap` or RevenueCat (decide, document why); web
   Stripe Checkout; one `Paywall` screen designed by Cleo in the Paper system, no mid-session
   interruptions (DECISIONS.md §7), free tier never nagged more than once per session.
3. US storefront: show the web price with a plain link as guideline 3.1.1(a) allows today;
   keep IAP as the primary button. Do not build around zero commission (see unknowns).
Owns: apps/client/app/paywall/**, apps/client/src/cloud/**, eas.json, app.config.ts,
docs/app-store.md.

### Lane E — Verification (Sonnet, high effort; after I, C, S land)
1. Importer e2e: a Gutenberg EPUB imported on web with the local stack, first chapter
   narrated and tap-translatable, evidence log.
2. Paid path e2e against a staging `sotto-cloud`: sign in (test account) -> subscribe
   (StoreKit sandbox / Stripe test mode) -> tutor session with the cascade -> minute cap
   hit -> clear message. Realtime path verified live once with a real key and the cost of
   that session written into the ledger.
3. iOS: TestFlight build installed on the iPhone 17 Pro simulator, walkthrough screenshots;
   physical device only if Noel has connected it.
4. `docs/verification.md` gains a "Tier 4: hosted" section.

## Sequence and gates

0. **Gate 0 — wait for run 2** (in KICKOFF-3.md). Then read run 2's finish-line section in
   LEDGER.md and the updated verification.md; the tree may have changed under this plan
   (in-browser tutor, PWA, phrase translation). Re-check every file path named above
   before dispatching; fix the plan, not the workers.
1. Pre-flight: `pnpm check` green on a clean tree; confirm the local stack (`/health`
   all true); create `sotto-cloud` (private, `gh repo create --private` is allowed);
   write seven-field task cards for every lane into LEDGER.md; write the CONFIRM list
   (below) into the first iMessage to Noel and proceed on the stated defaults.
2. Wave 1: I, P, C1-C3 in parallel. Gate 1: importer produces a readable private pack on
   web with local models; sign-in + entitlement read works against staging.
3. Wave 2: C4-C6, S, I5-I6. Gate 2: full `pnpm check` in both repos; staging deploy; paid
   e2e; TestFlight build uploaded.
4. Adversarial review (Opus, read-only): "what leaks, what costs, what is fake". Fix lane.
5. Close-out: verification.md, LEDGER finish-line section, memory update, one iMessage.

## Known unknowns (each is a CONFIRM item or a named default)

| # | Unknown | Default for this run | Who decides |
|---|---|---|---|
| 1 | "OpenAI Wispr" = Realtime (speech-to-speech) or Whisper (STT in the cascade)? | Build both providers; cascade is default, Realtime-mini on Standard, Realtime full as add-on | Noel |
| 2 | Plan prices and minute caps | Free: local only. Standard $9.99/mo: 200 tutor min + 5 imports/mo. Plus $19.99/mo: 600 min, gpt-realtime-mini, 20 imports. Numbers are placeholders; the entitlement table makes them config | Noel |
| 3 | Uploaded copyrighted books: legal posture | Private use, per-user derived assets, no cross-user sharing or dedup, no redistribution, deletion on account deletion, ToS says so. Not legal advice; Noel may want counsel before launch | Noel |
| 4 | DRM'd EPUBs (most bought books) cannot be parsed | Detect and refuse with a clear message; support DRM-free EPUB/TXT/MD; PDF deferred | Plan |
| 5 | Apple external-link commission (US) | Ship StoreKit IAP as primary; show web price link where allowed; do not model revenue on 0% | Plan; re-check the SCOTUS case before launch |
| 6 | Apple Developer Program enrollment and dev team (DECISIONS.md: none configured) | Blocks TestFlight upload. Everything up to the upload proceeds; upload is a Noel step | Noel ($99/yr) |
| 7 | Should `sotto-cloud` be public? | Private for this run | Noel |
| 8 | Hosting for WebSocket voice + import workers | Fly.io, one small machine + volume; Postgres later | Plan |
| 9 | Narration cost per imported book on the paid tier | Roughly $7-10 per full novel on hosted TTS; mitigated by lazy per-chapter narration and per-book character caps; alternative is Kokoro on a rented GPU box, deferred | Plan |
| 10 | Does the run-2 in-browser tutor (WebGPU) change the paid pitch? | If it landed, the free tier already has a no-server tutor on capable machines; paid = quality (OpenAI voices, latency), phone, uploads, hosted processing. Re-read run 2's close-out before writing the paywall copy | Orchestrator at Gate 0 |
| 11 | Accounts on the OSS client | NullCloud in OSS builds; account UI only renders when a CloudAdapter is present | Plan |
| 12 | Sync of learner data across devices | Not in this run; export/import stays the path; the entitlement is the only cloud-held per-user state besides imports | Plan |

## Routing and cost

- Orchestrator: **Opus**, not Fable. This run is security-adjacent in substance (auth,
  keys, billing webhooks); CLAUDE.md routes that to Opus. Fable earned nothing here that
  Opus cannot do; Lane I and Lane P could be Sonnet-orchestrated on their own.
- Opus lanes: C1-C3, adversarial review. Sonnet: everything else. /fanout only for
  volume (i18n keys, docs).
- Never in worker prompts: real keys, token allowances, the reference app's name.

## Deferred on purpose

PDF import; Android; cross-device sync; human review of community PRs (process only);
physical iPhone unless connected; public flip of either repo; custom domain; Kokoro-on-GPU
hosting; "simplify to my level" beyond one chapter demo.
