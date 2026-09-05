# Adversarial review 3 (run 3, 2026-09-05, read-only)

Reviewed at OSS `9f58143` and sotto-cloud `d9fbf58`. Nothing was written outside this
file, nothing was committed, no history was rewritten, no request was made against
production.

Working-tree state at the start of the pass, which bounds what this review covers:

- OSS: clean except three untracked run-in-flight files (`docs/evidence/word-audio-full-run-2026-09-05.log`,
  `packages/content/packs/en-US/books/en-aesop-fables/audio/words.{json,mp3}`) and one
  modified `book.json` for that book. Lane W's background sprite job was still running.
- sotto-cloud: `migrations/004_import_jobs.sql` untracked. **During the pass Lane C4 wrote
  four more uncommitted files** (`src/import/{cost,openai-fetch,pipeline,queue}.ts`, 784
  lines) and modified `.env.example`, `src/config.ts`, `src/storage.ts`. Those are
  **not reviewed here** and they currently break `pnpm check` (see §2). The hosted-import
  attack surface therefore has no review coverage in this document.

Command results, run read-only during the pass:

- OSS `pnpm check`: **exit 0**, 54 test files / 425 tests passed, eslint 0 errors / 22
  warnings.
- OSS `pnpm content:validate`: **0 errors, 106 warnings** across `packages/content/packs`.
- sotto-cloud `pnpm check`: **exit 1**. `prettier --check` fails on the four uncommitted
  C4 files. At `d9fbf58` alone the suite is green: an earlier run in this pass reported 12
  files / 205 tests passed. A second concurrent run of the same suite failed
  `src/voice/cascade.test.ts:254` on a timing assertion (`secondsUsed: 2` observed where
  `6` was expected), so that case is load-sensitive.
- Secret grep (`sk-[A-Za-z0-9]{10}|whsec_|ek_[A-Za-z0-9]{8}`) over both worktrees and over
  `git log -p` of the run 3 range and of the whole sotto-cloud history: **no real
  credential found**. The four `whsec_` hits are the `.env.example` placeholder and three
  test fixtures (`src/billing/stripe.test.ts:14,205`, `src/test-helpers.ts:37`). Both
  `.env` files were inspected by key name only: each contains exactly one key,
  `OPENAI_API_KEY`, and both are gitignored (`sotto-cloud/.gitignore:3`).

---

## 1. Ranked findings

### 1. HIGH. A signed-in Realtime subscriber can mint unlimited concurrent OpenAI sessions

`sotto-cloud/src/voice/realtime.ts:181` (`POST /voice/realtime/secret`), `:220`
`const maxSeconds = gate.remainingSeconds;`, `:283` `openVoiceSession(...)`.

Nothing is consumed, reserved, or counted at mint time. `checkTutorGate`
(`src/voice/metering.ts:78`) reads `spendToday` (`:88`), and `spend_daily` is only ever
advanced by `closeVoiceSession` (`:229`), which runs at `/end` or at reap. There is no
per-user concurrency check anywhere in `src/voice/` (grep for an open-row count returns
only the reaper's own query, `realtime.ts:362`), and no rate limiter is attached to any
voice route: the only `RateLimiter` instances are `magicLinkPerIp`, `magicLinkPerEmail`
and `appleSignInPerIp` (`src/context.ts:89-95`).

What a bill does: a Plus account has `remainingSeconds` up to 36,000. It calls
`/voice/realtime/secret` a thousand times in a minute and receives a thousand valid
ephemeral secrets, each minted with `maxSeconds = 36000`. `expires_after` is 120 s
(`realtime.ts:59`), which the file's own comment correctly says bounds only how long a
credential may be used to *open* a call, not the call. Every gate check during that minute
still sees `spendToday = 0`, because no row has closed. At the `realtime` row's own price
table (`src/voice/providers.ts:133-138`, ~$0.058/conversation-minute) a thousand
simultaneous calls is roughly $58 per minute of wall clock, against a configured daily
ceiling of $20. The reaper (`realtime.ts:353`) only fires at
`started_at + max_seconds + 60 s`, i.e. ten hours later for a Plus balance.

The README states the exposure accurately but understates the bound: "the day can overshoot
by at most the sessions that were already running" (`sotto-cloud/README.md:156`). That set
is unbounded.

Smallest fix: in `/voice/realtime/secret`, refuse the mint when the user already has an
`open` row, and book a non-refundable minimum (say 60 s) at mint. Then include open rows'
`max_seconds` priced at list into `checkTutorGate`'s ceiling comparison rather than closed
spend alone. Same open-row refusal on `/voice/session`.

### 2. HIGH. Magic-link host is attacker-controlled: link poisoning to account takeover

`sotto-cloud/src/auth/routes.ts:277-285` `publicOrigin()`, used by `verifyUrl()` at `:287`
and by the deletion-confirmation URL at `:238`.

```
const forwardedHost = request.headers['x-forwarded-host'];
const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? request.headers.host;
```

Neither `x-forwarded-host` nor `host` is checked against `APP_BASE_URL` or any allowlist.
Fly's proxy does not strip a client-supplied `X-Forwarded-Host`.

What an attacker does: `POST /auth/magic-link {"email":"victim@example.com"}` with
`X-Forwarded-Host: attacker.example`. The service mints a real, valid, single-use token,
builds `https://attacker.example/auth/magic-link/verify?token=<real token>` and emails it
to the victim from the real sender. The victim clicks; the token lands in the attacker's
logs; the attacker replays it against the real host inside the 15-minute TTL and gets the
victim's session. The same header controls the deletion-confirmation link. The one honest
mitigation already present (`consumeMagicLink`, `src/auth/magic-link.ts:64`, is a single
transaction so the link works exactly once) is what makes the race winnable rather than
detectable: the victim gets `invalid_token` and assumes a stale link.

CORS does not help. This is a server-generated email, not a browser request.

Smallest fix: build both URLs from `config.APP_BASE_URL` (or a new `PUBLIC_ORIGIN`), never
from request headers. `safeReturnUrl` (`src/billing/index.ts:283`) already establishes that
pattern in this codebase for the checkout URLs; the same discipline is simply missing here.
`publicOrigin` in `src/billing/index.ts:318` has the identical shape and should go the same
way.

### 3. HIGH. The Realtime path's two client-side defenses do not exist in the shipped client

`sotto-cloud/DECISIONS.md` #22 lists four defenses. Numbers 1 and 3 are asserted, not
implemented, in the app that would use them:

- `HttpCloudAdapter` implements `realtimeSecret` (`apps/client/src/cloud/http.ts:227`) and
  has **no method for `/voice/realtime/end` at all**. The `CloudAdapter` interface
  (`apps/client/src/cloud/types.ts:109-130`) does not declare one.
- `OpenAIRealtimeProvider` is never constructed by the app. `pickProvider`
  (`apps/client/src/voice/sessionManager.ts:57-77`) builds only `FakeVoiceProvider` (`:58`),
  `BrowserCascadeProvider` (`:60`) or `LocalCascadeProvider` (`:70`, `:76`); the cloud path
  is `LocalCascadeProvider` with a `createSession` override at `:73`. So the `maxSeconds`
  timer at `packages/voice/src/transports/openai-realtime.ts:283` and the `onEnd` hook at
  `:517` never run in the product.
- `cloud.realtimeSecret()` has no caller outside the adapter definitions and the fake.

Consequence: any Realtime session that ever does happen is booked only by the reaper, at
the full ceiling, after `max_seconds + 60 s`. Until then the account's
`tutor_seconds_used` does not move, so the cap gate keeps approving new mints (compounds
finding 1). `README.md:113` states "the client connects WebRTC to OpenAI itself and calls
`POST /voice/realtime/end` on hangup". No client does.

Smallest fix: do not mint what cannot be ended. Either wire `end()` into `CloudAdapter` +
`OpenAIRealtimeProvider.onEnd` and construct the provider in `pickProvider`, or make
`/voice/realtime/secret` return 503 until that lands, and drop `realtime`/`realtime-mini`
from the default plan table (`src/plans.ts:87`, `:98`) in the meantime.

### 4. HIGH. Client-reported audio drives the cost row, so a client can zero out the spend ceiling

`sotto-cloud/src/voice/realtime.ts:158-169` `attributeRealtimeAudio`, used at `:327`; the
resulting `computeCostUsd` goes to `closeVoiceSession` at `:332`, which is the only writer
of `spend_daily` (`src/voice/metering.ts:229`).

```
if (reported.audioSecondsIn !== undefined || reported.audioSecondsOut !== undefined) {
  return { audioSecondsIn: reported.audioSecondsIn ?? 0, audioSecondsOut: reported.audioSecondsOut ?? 0 };
}
```

`endBody` (`:65-69`) accepts any non-negative number, so `POST /voice/realtime/end
{"callId":"...","audioSecondsIn":0,"audioSecondsOut":0}` produces `costUsd = 0`, and
`addSpend` (`metering.ts:158`) short-circuits on `if (!(usd > 0)) return;`. The day's spend
never moves, so the ceiling in `checkTutorGate:88` never trips, no matter how much real
OpenAI money was spent. The admin page's "Spend today vs ceiling" meter
(`src/admin.ts` `renderPage`, the `overCeiling` computation) reads the same zeroed rollup.

`DECISIONS.md` #22 says these numbers "are never trusted for the cap". True. It does not say
they are trusted for the cost row and therefore for the kill ceiling, which is the control
that protects Noel's money rather than the learner's balance.

Smallest fix: price the row from `bookedSeconds` (the clamped wall clock, already computed
at `:324`), and store the client's reported numbers in separate columns purely as the
cross-check `DECISIONS.md` #22 says they are.

### 5. HIGH. On the deployed web build, an imported book is uploaded off-device

`apps/client/src/state/contentApi.ts:27-45` `serverUrl()`:

```
if ((globalThis as {...}).window?.__SOTTO_STATIC__) { if (loc) return loc.origin; }
if (loc && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)) return loc.origin;
return 'http://localhost:8790';
```

`apps/client/src/import/api.ts:36` `await fetch(\`${serverUrl()}/import\`, { method: 'POST', body: form })`
sends the user's whole file. On `sotto-steel.vercel.app` (a static export, so
`__SOTTO_STATIC__` is stamped) `serverUrl()` resolves to the Vercel origin. The import
entry point is ungated: `apps/client/app/(tabs)/library.tsx:77` `router.push('/import')`,
and `app/import/index.tsx` never imports `useCloud`.

`docs/importing-books.md:63-68` says the book "lives only in your device's local storage",
and `:51-52` says the free tier "runs all of this against your own local model stack". On
the live deploy neither is true: the bytes leave the device to a third-party host. The
request 404s there so nothing is processed, but the upload happens.

Note this sits outside what `docs/evidence/cloud-boundary-2026-09-05.log` tested: that run
visited `/profile`, `/paywall` and `/usage` only, against `localhost:8096` where
`serverUrl()` is loopback by construction. Its "[PASS] No request went to any external/cloud
host" line could not have caught this.

Smallest fix: in `app/import/index.tsx`, refuse to start an import when `serverUrl()` is not
loopback and `EXPO_PUBLIC_SERVER_URL` was not explicitly configured, with the honest line
that import needs the local server.

### 6. HIGH. Quadratic sentence-splitting regex, reachable by a 25 MB unauthenticated upload

`packages/content/src/import/sentences.ts:12`:

```
const LATIN_SENTENCE_RE = /[^.!?…]+(?:[.!?…]+(?=["'’”)\]]*(?:\s+|$))|$)/gu;
```

driven by the `while ((match = re.exec(paragraph)))` loop at `:21`, called from
`packages/content/src/import/pipeline.ts:104`. When a long run of non-terminator characters
ends in a period whose lookahead fails (a period not followed by whitespace or end), the
greedy `[^.!?…]+` backtracks across the entire run and the scan restarts one position later.

Reproduced independently in this pass with the exact regex copied from the file:

| run length | time |
| ---------- | ---- |
| 5,000 | 69 ms |
| 10,000 | 661 ms |
| 20,000 | 2,835 ms |
| 40,000 | 8,539 ms |

Clean 4x per doubling. Extrapolated, one 600,001-character paragraph is on the order of 30
minutes of blocking CPU; a 25 MB single paragraph is effectively permanent. This runs on the
Fastify event loop (the import "background" job is same-thread,
`apps/server/src/import/jobs.ts:70`), so the whole server, including `/voice/session` and
content serving, stalls. `POST /import` has no auth
(`apps/server/src/import/routes.ts:47`, and `apps/server/src/security.ts:6` states the
server has none by design); the only gate is the `SOTTO_HOST` default of `127.0.0.1`
(`apps/server/src/config.ts:31`), which the same file documents being set to `0.0.0.0` for
phone-on-LAN use. Benign prose is unaffected (585 kB of normal text: 3 ms).

There is also no cap on total characters, chapter count, or paragraph size anywhere in the
import path. `TARGET_WORDS_PER_CHAPTER = 1500` (`parse/text.ts:7`) is a minimum, not a
maximum. 25 MB of text becomes roughly 16,000 chapters, each dispatching local LLM batches.

Smallest fix: cap paragraph length in the parsers (hard-split above, say, 20,000
characters), and add a total-character cap alongside `MAX_UPLOAD_BYTES`.

### 7. MEDIUM. EPUB is fully inflated in memory before any check, including the DRM check

`packages/content/src/import/parse/epub.ts:175` `files = unzipSync(bytes);`, with
`detectDrm(files)` only at `:183`.

`fflate`'s `unzipSync` is called with no options and no filter, so every entry is inflated
synchronously into a `Record<string, Uint8Array>` in one call. There is no decompressed-size
check before or during extraction, and no entry-count cap. A 25 MB archive at a 1000:1
ratio attempts ~25 GB of allocation on the event loop. Zip-slip is not exploitable, because
no entry is ever written to disk (entries are only looked up by name, `:186`, `:202`), and
`joinPath` at `:35-46` normalizes `..` anyway.

Smallest fix: stream with `fflate`'s `unzip` filter, refuse the archive once cumulative
decompressed bytes pass a ceiling (10x the upload cap is generous), and cap entry count.

### 8. MEDIUM. `request.ip` is the Fly proxy for every user, so both IP rate limiters are global

`sotto-cloud/src/app.ts:48-67` builds Fastify with no `trustProxy` option, so
`request.ip` is the socket peer, which behind Fly is the proxy for every request.
`ctx.limits.magicLinkPerIp` (`src/context.ts:92`, 10 per minute) is checked at
`src/auth/routes.ts:142` and `appleSignInPerIp` (20 per minute) at `:81`.

Effect: one client can consume the whole global budget and lock every other user out of
sign-in, at 10 requests per minute of effort. The per-email limiter (`:147`) still protects
individual inboxes, so this is availability, not takeover. The same missing `trustProxy`
makes `request.protocol` `http` behind the proxy, which is why `wsUrlFor`
(`src/voice/cascade.ts:236-239`) has to read `x-forwarded-proto` by hand.

Smallest fix: `Fastify({ trustProxy: 1, ... })`.

### 9. MEDIUM. A hung import bricks the OSS server's import until restart, with an SSE stream and timer leaked per client

`apps/server/src/import/jobs.ts:94-101`:

```
if (job.expiresAt < now && job.status !== 'running') { this.jobs.delete(id); ... }
```

`sweep()` never evicts a `running` job, so `runningJobId` (`:37`) never clears and every
later `POST /import` answers 429 `import_in_progress` (`routes.ts:48-51`). Nothing bounds
the run: `ImportOptions` has a `signal` field, and `start()` explicitly `Omit`s it
(`jobs.ts:53`), and none of `gloss-fill.ts:100`, `translate-sentences.ts:189`,
`narrate.ts:66/:89` sets a fetch timeout or abort. Meanwhile each attached SSE client holds
a listener in an unbounded `Set` (`routes.ts:142`) plus a 500 ms `setInterval`
(`:144-151`) that only clears when the job stops being `running`. There is no max stream
duration and no cap on concurrent streams.

Separately, finished jobs retain their entire `ImportResult`, audio `Uint8Array`s included,
for 30 minutes (`JOB_TTL_MS`, `jobs.ts:17`), and eviction is lazy: `sweep()` only runs from
`isBusy()`/`get()`, so an idle server frees nothing.

Smallest fix: pass an `AbortSignal` with a wall-clock ceiling into `importBook`, and let
`sweep()` fail a `running` job that has passed it.

### 10. MEDIUM. `docs/verification.md` asserts two things that are false in HEAD, and has no Tier 4 section

`docs/verification.md` "Deferred / not done tonight" still says the Realtime provider and
the WebRTC transport "are interface stubs only (`NotImplemented`)". That is no longer true:
`packages/voice/src/transports/openai-realtime.ts` is a complete WebRTC implementation as of
`eb37c7e` (peer setup `:228-256`, the Realtime event map `:300-402`, tool calls `:367-379`).
The same section says "**User-uploaded books** are not a feature in this build; the library
is the bundled seed packs only, no way for a learner to add their own text", which R3-I
shipped.

`grep -n "Tier 4" docs/verification.md` returns nothing: the hosted section R3-E owes does
not exist yet. Anyone reading the current file is told the paid tier does not exist.

Smallest fix: R3-E rewrites both bullets and adds the Tier 4 section. See §5 for the rows.

---

## 2. Minor findings

- `sotto-cloud` `pnpm check` currently exits 1: `prettier --check` fails on
  `src/import/{cost,openai-fetch,pipeline,queue}.ts` (C4, uncommitted). Not a defect in
  committed code; it does mean the gate is red right now.
- `sotto-cloud/src/voice/cascade.test.ts:254` asserts an exact `secondsUsed: 6` against a
  live 30 ms-tick WebSocket; it observed `2` under concurrent load in this pass. Timing
  assertion, not a fixed count.
- Text tokens are never metered on either path: `src/voice/cascade.ts:429-433` and
  `src/voice/realtime.ts:332` both call `computeCostUsd` with audio seconds only, leaving
  `textTokensIn/Out` undefined (`metering.ts:137-138`). The `text in /Mtok` and
  `text out /Mtok` columns in `README.md:137-142` are therefore never applied to a real
  session, and `realtime`'s $4/$16 row is the larger share of a short call.
- `apps/client/app/paywall/index.tsx:26-27` point Terms and Privacy at
  `docs/terms.md` and `docs/privacy.md`; neither file exists in the repo. App Review
  rejects a dead privacy link.
- `apps/client/eas.json` `production` profile has no `env` block at all, so a production
  build gets no `EXPO_PUBLIC_CLOUD_URL` and falls to `NullCloud`
  (`apps/client/src/cloud/provider.tsx:31`): the shipped App Store build would have no
  paywall and no IAP. `docs/app-store.md:82` nonetheless says "real IAP is required there".
- `apps/client/eas.json:20` sets `EXPO_PUBLIC_CLOUD_STAGING=1` on the `preview` profile,
  which makes the free "S'abonner (test)" action visible
  (`apps/client/app/paywall/index.tsx:29-30`, rendered `:213-222`). Intended per
  `docs/app-store.md:66-72`; worth knowing that every internal-distribution build ships a
  one-tap free upgrade.
- EPUB DRM detection (`packages/content/src/import/parse/epub.ts:56-71`) is filename-based
  plus one substring. A DRM scheme that does not declare `META-INF/license.lcpl`,
  `META-INF/rights.xml`/`*sinf*`, or an `encryption.xml` containing `EncryptedData` is
  parsed as plaintext and its garbage tokens are sent to the LLM.
- The same check false-positives: IDPF font obfuscation, used by many legitimately
  DRM-free EPUBs, also ships `encryption.xml` with `<EncryptedData>` elements.
  `epub.ts:67` matches the bare substring with no `EncryptionMethod Algorithm` check, so
  those books are refused as DRM'd.
- `packages/content/src/import/parse/epub.ts:42` `if (part === '..') out.pop();` silently
  no-ops on an empty array rather than erroring. Harmless today (nothing is written to
  disk); a hazard if this path ever feeds an `fs` write.
- `apps/server/src/import/routes.ts:35` sets only `fileSize` on `@fastify/multipart`; no
  `files`, `fields`, `parts` or `fieldSize` limit, and `:68`
  `fields[part.fieldname] = String(part.value)` accumulates unbounded field parts.
- `apps/server/src/import/routes.ts:63-66` returns 413 from inside the
  `for await (const part of request.parts())` loop, abandoning the rest of the multipart
  stream unconsumed.
- No ownership check on `/import/:jobId/{events,result,audio/:file,narrate/:chapterIndex}`
  (`routes.ts:106,159,177,193`). Ids are `randomUUID()` (`jobs.ts:58`) so guessing is
  impractical, but a leaked id yields another caller's full book text and audio and a free
  `narrate` trigger against the local TTS/STT stack.
- `packages/content/src/word-audio.ts:282-287` latches the WAV format from the **first**
  word only, then computes every later clip's duration with it (`:306-311`) while
  concatenating that clip's raw PCM verbatim (`:305`). A Kokoro response at a different
  sample rate makes `cumulativeMs` drift monotonically, so tail entries can point past the
  end of the file.
- The same index (`word-audio.ts:315`) is measured against raw PCM and then written
  unchanged (`:417`) after LAME encoding at `:405` and a possible bitrate re-encode at
  `:407`. Encoder delay shifts the whole timeline; nothing re-measures.
- Nothing bounds-checks a sprite span at any layer: not in `word-audio.ts`, not in
  `packages/content/src/validate.ts:515-543` (which checks asset existence and coverage
  only), and not in `apps/client/src/platform/audio.ts:252-263`, where `span[0]`/`span[1]`
  go straight into `playSlice` with no clamp against the loaded duration.
- `packages/content/src/word-audio.ts:318` silently hardcodes
  `{ sampleRate: 24000, numChannels: 1, bitsPerSample: 16 }` when nothing synthesized.
- Only 2 of the narrated books have committed sprites
  (`packages/content/packs/{fr-FR/fr-petit-chaperon-rouge,es-419/es-fabulas-samaniego}/audio/words.json`);
  `en-aesop-fables` is untracked and mid-run
  (`docs/evidence/word-audio-full-run-2026-09-05.log` is 5 lines, last entry
  `=== en-alice-rabbit-hole 13:41:15`). The ledger states this; docs should not imply
  otherwise before the run lands.
- `sotto-cloud/src/security.ts:26` `if (!origin) return true;` waves through every
  originless request. Correct for native clients, and it means CORS protects nothing
  against a non-browser caller. Stated for the record, since several comments lean on CORS
  as the whole CSRF story (`src/app.ts:77-79`).
- `sotto-cloud/src/admin.ts` renders every user's recent magic link in staging
  (`stagingLinks` in `renderPage`, gated to `config.isStaging`). Admin-only and staging-only,
  and labelled as working credentials, but it does mean a staging admin can take over any
  staging account.
- `apps/client/src/cloud/provider.tsx:24` detects platform with
  `typeof document === 'undefined' ? 'native' : 'web'` rather than `Platform.OS`. Fails
  closed (a `document` polyfill on native breaks auth rather than leaking the token), but
  it is a fragile discriminator.
- `sotto-cloud/src/voice/index.ts:113-121` installs a process-wide `unhandledRejection`
  handler that logs and continues. Documented and justified (`:97-111`); it also means any
  unrelated unhandled rejection anywhere in the service is now silent-by-default.
- `sotto-cloud/src/voice/openai-compat.ts:22-26` states plainly that the OpenAI request
  adaptation was never verified against the live API. Carrying it forward as a known gap.

---

## 3. Claims vs evidence

| Claim | Where it is made | Evidence | Verdict |
| --- | --- | --- | --- |
| No secret is committed in either repo | `sotto-cloud/README.md:60` | Grep of both worktrees, the run 3 range, and all of sotto-cloud's history; `.env` key-name inspection | SUPPORTED |
| The reference app's name, vendor and price are gone from the current OSS tree | LEDGER R3-F entry, `docs/evidence/public-flip-plan-2026-09-05.md` §2 | `git grep -i` for all three strings over the tracked tree: 0 hits. Confirmed the forward scrub landed as `25ecf43` | SUPPORTED for the tree |
| That leak is fixed | same | The strings remain in 6 commits' blobs (`git log --all -S`: 6), reachable from `HEAD`, and the gitignored `planning/research/` note named after the reference product still exists locally (never pushed). sotto-cloud has 0 hits of its own but vendors the OSS repo as a submodule at `5c755bd`, so the history travels with it | PARTIAL. History rewrite is Noel's call and was correctly not run |
| "importer e2e: Gutenberg EPUB imported via the UI on the local stack" | LEDGER R3-I proof line; R3-I DONE entry | `docs/evidence/import-e2e-2026-09-05.log` (22 lines) imports `petit.txt`, a plain-text file with 330 characters of body text. No EPUB, no Gutenberg, one chapter | UNSUPPORTED for the EPUB half. Chapter-1 narration, tap-to-translate ("chat" -> "cat") and the audio control are genuinely shown |
| OSS build with no `EXPO_PUBLIC_CLOUD_URL` renders no cloud UI and makes no external request | LEDGER R3-S proof; `docs/evidence/cloud-boundary-2026-09-05.log` | The log's 8 PASS lines cover `/profile`, `/paywall`, `/usage` only. The UI half is independently confirmed in code (`provider.tsx:27-32`, `paywall/index.tsx:63`, `account/index.tsx:132`, `usage/index.tsx:94`, `profile.tsx:124`, `PaywallNagRow.tsx:24`, `availability.ts:45`). The no-external-request half was tested only on a loopback dev server and does not cover `/import`, which does leave the device on a static deploy (finding 5) | PARTIAL |
| No analytics, telemetry or crash reporter in the OSS app (CONTRACTS §0) | LEDGER R3-S entry; `docs/app-store.md:54-58` | Grep across `apps/client` and `packages` for sentry/bugsnag/posthog/mixpanel/amplitude/segment/firebase/crashlytics/datadog: zero. No such dependency in `apps/client/package.json` | SUPPORTED |
| expo-iap and expo-apple-authentication are inert without a cloud adapter | LEDGER R3-S entry | Both are statically imported (`src/cloud/iap.ts:15-24` via `paywall/index.tsx:12`; `account/index.tsx:11`), so they link into every build, but every call site sits below a `!cloud.enabled` return (`paywall:63`, `account:132`) and behind `Platform.OS === 'ios'` | SUPPORTED |
| "the client connects WebRTC to OpenAI itself and calls `POST /voice/realtime/end` on hangup" | `sotto-cloud/README.md:113`; `DECISIONS.md` #22 defenses 1 and 3 | No client method exists (`http.ts` has no `/end`; `types.ts:109-130` declares none) and `OpenAIRealtimeProvider` is never constructed (`sessionManager.ts:57-77`) | UNSUPPORTED |
| Client-reported audio seconds are "never trusted for the cap" | `DECISIONS.md` #22 | True for the cap (`realtime.ts:324-325` books clamped wall clock). They are trusted for the cost row and hence for the daily ceiling (`:327-332`) | PARTIAL, and misleading about what it protects |
| `SOTTO_CLOUD_DAILY_SPEND_CEILING_USD` bounds the day's OpenAI spend | `README.md:153-156`; `.env.example` | `checkTutorGate:88` compares against a rollup only advanced at session close (`metering.ts:229`), with no concurrency limit and no rate limit on the voice routes | PARTIAL. The README's own caveat is right; the overshoot is unbounded, and finding 4 can zero the rollup entirely |
| `SOTTO_CLOUD_BILLING=stub` cannot run in production | `README.md:52`, `DECISIONS.md` #19, `src/billing/stub.ts:14-19` | `assertBillingConfig` throws at load (`src/config.ts:162-167`), and the stub routes are only registered under `if (stubMode)` (`src/billing/index.ts:198`), so they 404 rather than 403 otherwise | SUPPORTED |
| Checkout return URLs cannot be an open redirect | `DECISIONS.md` #20; `src/billing/index.ts:277-282` | `safeReturnUrl` (`:283-298`) parses the candidate and falls back unless `url.origin === base.origin` | SUPPORTED |
| The admin page is unreachable without an admin email | `src/admin.ts:12-13` | `requireUser` plus `config.adminEmails.includes(email)` (`src/admin.ts:24-30`); unset variable means an empty list | SUPPORTED |
| `/voice/ws` cannot be joined with a guessed session id | `src/voice/cascade.ts:171-178` | 32 random bytes (`:311`), single-use `take()` (`:194-203`), 60 s TTL (`:47`), and the row is closed on expiry (`:252-262`) | SUPPORTED |
| A magic link works exactly once | `src/auth/magic-link.ts:55-63` | Check and mark-used are one `db.transaction` (`:71-81`); a deletion link is refused as a sign-in (`routes.ts:172-181`) | SUPPORTED |
| "an imported book lives only in your device's local storage" | `docs/importing-books.md:63-68` | True for the local-server path; false on the deployed static web build, where `POST /import` targets the page origin (finding 5). The "deleted with your account on the hosted tier" clause describes C4, which is not committed | PARTIAL |
| word sprite coverage is 100% of word tokens per narrated book | LEDGER R3-W proof line | `docs/evidence/word-audio-2026-09-05.log` proves it for 2 books (222 and 211 words, min span 545/530 ms, 0 silent). 15 books were still generating at review time and are uncommitted | PARTIAL, and the ledger says so |
| `pnpm check` is green in both repos | LEDGER gate 1 entry | OSS: exit 0, 425/425. sotto-cloud: green at `d9fbf58` (205/205) but exit 1 in the working tree because of C4's unformatted files | PARTIAL |
| Realtime per-minute cost is measured | R3-C3 proof list | Not measured; `DECISIONS.md` #23 and `README.md:131` both say so plainly and label the table as list prices | SUPPORTED as a disclosure, the underlying proof is correctly marked undone |

---

## 4. What is genuinely solid

The fix lane should not spend time re-examining these. Each was read and traced.

- **Session and link token design.** Opaque 256-bit random tokens, HMAC'd at rest with
  `SESSION_SECRET` (`src/db.ts:95`), rows are the truth so revocation is immediate,
  `resolveSession` returns null without a reason so it cannot be probed
  (`src/auth/sessions.ts:66-88`). Magic-link consumption is genuinely atomic
  (`magic-link.ts:71-81`). Deletion needs freshness or a confirmation token
  (`routes.ts:250-263`), so a stolen 30-day session cannot erase an account.
- **The cap itself.** `Entitlements.consumeTutorSeconds` (`src/entitlements.ts:201-226`)
  is a synchronous better-sqlite3 transaction that clamps at the cap. The choice of driver
  is documented as being *for* that property (`src/db.ts:20-23`). Caps are copied onto the
  row at `applyPlan` (`:117-155`), so a config change cannot move a paying user's ceiling
  mid-period.
- **Load-time refusals.** `assertBillingConfig` (`src/config.ts:152-173`) refuses stripe
  mode without both secrets, stub in production, and a replacement Apple trust root in
  production. `createContext` (`src/context.ts:76-80`) refuses to start production without
  an email provider rather than logging live credentials. These are the right shape:
  a bad deploy does not boot.
- **Logging hygiene.** Fastify redaction of authorization/cookie headers plus a request
  serializer that strips the query string, precisely because the verify URL carries a live
  credential (`src/app.ts:48-66`). `ResendSender` never logs the address or the link
  (`src/auth/email.ts:48-59`). `audit()` meta carries only an email domain
  (`magic-link.ts:51`, `:96-99`).
- **Provider selection refuses rather than downgrades.** `providerConfigFor`
  (`src/voice/providers.ts:228-312`) throws `ProviderUnavailable` when `cascade-open`'s URLs
  are unset instead of silently serving a subscriber the OpenAI backend, and the
  learner-facing message never names an environment variable (the names go to the log,
  `cascade.ts:284-287`).
- **HTML escaping** on both server-rendered surfaces: `src/admin.ts` `esc()` and
  `src/billing/stub.ts:99-106`, applied at every interpolation.
- **The client cloud boundary in code.** `NullCloud` rejects every method without a fetch
  (`src/cloud/null.ts:12-17`), and every cloud surface is gated on `cloud.enabled` before
  it renders or fetches. The session token is in an httpOnly cookie on web
  (`http.ts:105-112`) and `expo-secure-store` on native (`:49-58`); nothing sensitive is in
  AsyncStorage or localStorage, and no `console.*` in these files logs a token.
- **The single-job import registry.** One import at a time, enforced twice
  (`jobs.ts:39-42`, `routes.ts:48-51`) with a test at `routes.test.ts:156-176`. This is
  what keeps finding 6 from being trivially parallelizable.
- **No unbounded retry in the import path.** `translate-sentences.ts:218` self-recurses
  exactly once; `word-audio.ts:71` caps at 3; `gloss-fill.ts` and `narrate.ts` do not retry.
  The `deepseek` backend is unreachable from the importer (`pipeline.ts:299-307` passes no
  `backend`, so `translate-sentences.ts:138` defaults to local), and the collected
  `apiKey` is never forwarded, so a misconfigured `SOTTO_LLM_URL` 401s rather than bills.
- **Zip-slip is safe by construction** in the EPUB parser: nothing is written to disk, and
  `joinPath` normalizes anyway (`epub.ts:35-46`).
- **The public-flip audit.** `docs/evidence/public-flip-plan-2026-09-05.md` is careful,
  found a fifth commit the previous review missed, refers to the leaked strings indirectly
  throughout, and correctly ran nothing that rewrites history.

---

## 5. Recommended status changes for `docs/verification.md` Tier 4

There is no Tier 4 section in the file today. R3-E should add one, and fix two stale
bullets in "Deferred / not done tonight" first.

**Corrections to existing text (both currently false in HEAD):**

1. Replace "OpenAI Realtime WebRTC provider and WebRTC transport ... are interface stubs
   only (`NotImplemented`)" with: `packages/voice/src/transports/openai-realtime.ts` is a
   complete WebRTC implementation, never exercised against the live API, and **not wired
   into the client** (`sessionManager.ts:57-77` never constructs it).
2. Replace "**User-uploaded books** are not a feature in this build" with a pointer to
   `docs/importing-books.md` and the R3-I rows below.

**Proposed Tier 4 rows, with the status the evidence actually supports:**

| Row | Status to record |
| --- | --- |
| Accounts: Apple identity token, magic link, opaque sessions | PASS (fixtures only). No Apple Developer Program, so JWKS verification is proven against a fixture, not a real Apple token |
| Entitlements and caps | PASS. `consumeTutorSeconds` is transactional and clamped; 205/205 cloud tests at `d9fbf58` |
| Billing: Stripe webhooks | PASS (fixtures only). No Stripe keys, no real event replayed |
| Billing: Apple StoreKit JWS + notifications V2 | PASS (self-signed chain). No Apple-signed payload; `SOTTO_CLOUD_APPLE_ROOT_CA_TEST_PEM` is what makes the suite possible and is refused in production |
| Billing: stub checkout end to end | PASS. `docs/evidence/billing-stub-staging-2026-09-05.log` |
| Hosted cascade tutor over WS | PASS (staging). `docs/evidence/voice-broker-staging-2026-09-05.log`: tool round trip, 2.74 s of tutor audio, `usage` tick, 402 at cap, 503 for kill switch and ceiling |
| Hosted Realtime tutor | **FAIL / not shipped.** The secret mints, but no client calls it, no client calls `/end`, and no live cost was measured (`DECISIONS.md` #23). Should be recorded as not delivered, not as a partial pass |
| Daily spend ceiling | **PARTIAL.** Enforced only against closed-session spend, with no concurrency limit (finding 1) and a cost row a client can zero (finding 4) |
| Kill switch `SOTTO_CLOUD_TUTOR_DISABLED` | PASS. Refuses new sessions with 503 before the plan and cap gates (`metering.ts:80-87`) |
| Account deletion cascade | PASS. `users.ts:117-146`, blobs after commit, deliberately |
| Client cloud boundary (no `EXPO_PUBLIC_CLOUD_URL`) | PARTIAL. UI and cloud-adapter half verified in code and in `cloud-boundary-2026-09-05.log`; the no-external-request half does not cover `/import` (finding 5) |
| Importer: TXT / Markdown | PASS. `import-e2e-2026-09-05.log` end to end on TXT |
| Importer: EPUB | **UNPROVEN by e2e.** Unit fixtures exist; the named EPUB e2e was run on a `.txt` file |
| Importer: DRM refusal | PARTIAL. Three named schemes refused by filename; non-conforming DRM passes and IDPF font obfuscation false-positives |
| Word pronunciation sprites | PARTIAL. 2 of 17 narrated books committed; span bounds are unvalidated at every layer |
| Hosted import (C4) | NOT REVIEWED, NOT COMMITTED at `d9fbf58`. No row should claim it |
| App Store readiness | PARTIAL. Privacy manifest and review notes written; Terms and Privacy links 404, and the `production` EAS profile ships with no cloud URL |
