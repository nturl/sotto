# Sotto — defensive security audit, 2026-09-07

Static source review of `~/Claude/sotto` (plus targeted reads in `~/Claude/sotto-cloud`
to answer questions the OSS repo raised). No live probing, no fuzzing, no exploits,
no fixes committed.

VERIFIED = file read and code path traced. INFERRED = pattern match only.

---

## Scope: what's actually here vs. what was described

Three corrections before the findings.

1. **`main` is not what shipped.** `run9/integration` is 31 commits ahead of `main`;
   `main` is 1 commit ahead of integration (`cd326af`). They have diverged — the
   ff-merge never happened. Audit was done against the working tree (`main`) with
   integration-only code cross-read where it differs.

2. **The "no-key" Discuss tutor has no key because it has no server.** It runs
   entirely in the browser on WebGPU — Whisper + Qwen3.5 via `@mlc-ai/web-llm` +
   Kokoro, downloaded on opt-in from Hugging Face's CDN
   (`packages/voice/src/browser-cascade/models.ts:122-163`, `docs/browser-tutor.md:1-8`).
   There is no shared provider credential on that path, so there is nothing for a
   user to drain. Cost falls on the learner's own device and HF's bandwidth.

3. **Accounts, sessions, billing and the database are in a different repo.**
   `~/Claude/sotto-cloud` is the paid backend (Fastify + SQLite migrations + Stripe +
   Apple IAP). Scope items 3 (auth/sessions), 4 (data access) and 5 (server-owned
   truth) live mostly there, not in `~/Claude/sotto`. This repo holds only the client
   adapter and the OSS self-host server, which has no accounts at all by design.

---

## Findings

### 1. `@fastify/static` 8.3.0 — four advisories, one HIGH route-guard-bypass traversal
**Severity: High** — a path-traversal advisory in a dependency that ships in the
running server image.
**Location:** `apps/server/package.json:16`; registered at `apps/server/src/app.ts:84-88`
and `:317-322`.
**VERIFIED**

`pnpm audit`: 11 advisories, 0 critical, 5 high, 6 moderate. Four of them are this one
package — GHSA-83w8-p2f5-377r (high, `<=10.1.0`, patched `>=10.1.1`) plus three
moderates. It is a production dependency of `@sotto/server` and is in the Docker
runtime image (`Dockerfile:58`).

**Not currently exploitable here, for a reason that is fragile.** The advisory's
precondition is an app that relies on *route-scoped* guards to protect served files.
This server has exactly one hook — `app.ts:70`, a root-level `onRequest` added before
every `register()`, inherited by all child contexts. There is nothing route-scoped to
skip past. Separately, `@fastify/send@4.1.1` (`lib/send.js:184-200`) normalizes and
tests against `UP_PATH_REGEXP` twice, so a leading `..` cannot escape the root.

**What breaks:** nothing today. The day someone adds a `preHandler` to a route to
protect a file path, this becomes live, silently.

**Fix:** bump to `>=10.1.2`. That is a two-major jump from 8.x — check the Fastify 5
peer range before merging; this is not asserted to be drop-in.

---

### 2. No `trustProxy` — the rate limiter collapses and the tutor's WebSocket URL downgrades
**Severity: High** — on the documented Fly deploy this both breaks the voice tutor and
makes the per-IP throttle meaningless.
**Location:** `apps/server/src/app.ts:31` (no `trustProxy`), `:155` (`request.ip`),
`:178` (`request.protocol`).
**VERIFIED** — against Fastify 5.12.1 source: `lib/request.js:232-238` (`ip` returns
`socket.remoteAddress` when `trustProxy` is unset) and `:270-276` (`protocol` returns
`socket.encrypted ? 'https' : 'http'`, ignoring `x-forwarded-proto`).

`fly.toml.example` sets `force_https = true`. Fly terminates TLS and forwards plain
HTTP to the container. So:

- **(a) Rate limiting.** `sessionCreateLimiter.allow(request.ip)` keys on Fly's proxy
  address, identical for every client. The 10-per-minute budget is global, not
  per-caller: one client can consume everyone's, and a single attacker owns the whole
  budget. `SOTTO_MAX_SESSIONS=4` is likewise global.
- **(b) Protocol downgrade.** `request.protocol` is always `'http'`, so
  `POST /voice/session` returns `wsUrl: ws://<host>/voice/ws?session=...`
  (`app.ts:178-182`). The client opens it verbatim
  (`packages/voice/src/local-cascade.ts:182`). From an HTTPS page the browser blocks
  `ws://` as mixed content — the tutor just fails. This path is reachable: a
  self-hosted instance serving the static client answers `/health` green, and
  `apps/client/src/voice/availability.ts:80` then picks the `'local'` path.

**What an abuser does:** exhausts the shared session budget from one IP, denying the
tutor to everyone. The downgrade fails closed (browsers block it) rather than leaking,
but were it ever reached over plain `ws://`, the session id and all captured audio
would be in cleartext.

**Fix:** `Fastify({ logger: true, trustProxy: true })` — one line, fixes both.

---

### 3. Self-host server is unauthenticated by default and can drain `SOTTO_API_KEY`
**Severity: High if exposed, otherwise Low** — turns on one env var you must confirm.
**Location:** `apps/server/src/config.ts:57` (`SOTTO_BASIC_AUTH` optional),
`app.ts:68-77` (auth hook only when set), `app.ts:22` (`maxMs: 1_200_000`),
`docker-compose.yml:9` and `:38`.
**VERIFIED** (code) / **CANNOT VERIFY** (whether your live Fly app sets the secret)

Per-turn cost is properly capped: `max_tokens: 400` (`apps/server/src/voice/llm.ts:69,73`),
24-message history and 4 tool iterations (`voice/session.ts:47,58`). **The number of
turns is not capped**, and a session runs up to 20 minutes. With `SOTTO_API_KEY`
pointed at OpenAI — the documented Fly path, since a local model stack isn't reachable
from a Fly machine — anyone who can reach the port streams audio and bills you for
unbounded STT + LLM + TTS.

`docker-compose.yml:9` publishes `'8790:8790'`, which binds all host interfaces, with
`SOTTO_BASIC_AUTH: ${SOTTO_BASIC_AUTH:-}` unset by default. `docs/self-hosting.md:83`
does tell you to set it, and the compose file warns at `:36-37` — this is a documented
default, not an oversight.

**Fix:** confirm `SOTTO_BASIC_AUTH` is actually set on the live instance
(`fly secrets list`). Bind compose to `127.0.0.1:8790:8790`. Consider a per-session
turn ceiling so an authenticated-but-hostile client is bounded too.

---

### 4. No CSP or security headers on the hosted client, with the BYOK key in `localStorage`
**Severity: Medium** — defense-in-depth only today, but it is what stands between a
future script injection and the learner's OpenAI key.
**Location:** `apps/client/vercel.json:1-11` (no `headers` block at all);
`apps/client/src/voice/byokKey.ts:24` and `:94-105`.
**VERIFIED**

There is no CSP, no `X-Frame-Options`/`frame-ancestors`, no `X-Content-Type-Options`
anywhere — not in `vercel.json`, not in the server, not in the static server script.

On web the learner's own OpenAI key is stored as cleartext `localStorage` under
`sotto.byok.openaiKey`, readable by any script on the origin. This is deliberate and
documented (`byokKey.ts:5-6`), and native correctly uses `expo-secure-store`.

**No XSS sink exists today** — VERIFIED: zero hits for `innerHTML`,
`dangerouslySetInnerHTML`, `document.write` or `new Function` across all source. Model
output renders through React Native `<Text>` (`voice/ui/Transcript.tsx:66-68`,
`app/voice/[bookId].tsx:275-278`), which React escapes. So model output is not an XSS
vector.

**What breaks:** the page executes remote WASM and model weights from Hugging Face /
MLC CDNs. Any future injection — an XSS regression, a compromised dependency, a
malicious extension — reads the key in one line, and there is no CSP to constrain where
it gets sent. The app is also framable while it requests microphone permission.

**Fix:** add a `headers` block to `vercel.json`: `frame-ancestors 'none'`,
`X-Content-Type-Options: nosniff`, and a CSP allowing `'wasm-unsafe-eval'` plus the
model CDN hosts in `connect-src`. Note that a strict `connect-src` is what actually
contains a stolen-key exfiltration attempt.

---

### 5. Prompt injection — passage text is interpolated into the system instruction unfenced
**Severity: Medium** — real and reachable via imported books; bounded by a small,
local, network-free tool surface.
**Location:** `packages/core/src/prompt.ts:110-116` (`renderSentence`) and `:153-162`
(`dynamicContext`).
**VERIFIED end to end**

`chapter.title` and every `sentence.text` flow from
`apps/client/src/voice/passage.ts:30-38` into `buildSystemInstruction`, and land in the
*same* system string as the rules — after them, separated only by a literal
`--- Session context ---` line the content itself can forge. `savedWords` and
`recentSummary` ride along the same way. All three providers use this builder:
`browser-cascade/worker.ts:586`, `openai-direct/provider.ts:420`,
`apps/server/src/voice/session.ts:161`.

The import feature accepts arbitrary user EPUB/text/markdown, so passage text is
attacker-controllable whenever a learner opens a book from an untrusted source.

**What an abuser gets:** control of the tutor's behaviour — wrong or malicious
explanations, attacker-chosen text rendered into the UI via `show_explanation`, forged
`[[reading:]]` / `[[pace:]]` markers moving the reader's position.

**What they do not get:** there is no exfiltration primitive. All seven tools are local
and zod-validated (`packages/core/src/tools.ts:9-17`, `:297-347`), none performs a
network fetch, and unknown tool names are rejected (`browser-cascade/llm-turn.ts:199-201`).
On the browser path the model itself has no network access.

**Fix:** fence the untrusted block — wrap passage text in a delimiter carrying a
per-session random nonce, and add one line to the stable rules saying everything inside
is data and never an instruction. Strip `[[...]]` marker syntax from passage text
before interpolation.

---

### 6. Docker image runs as root
**Severity: Low-Medium**
**Location:** `Dockerfile:60-78` — no `USER` directive anywhere.
**VERIFIED**

Container process is uid 0. Any RCE-class bug in the server runs as root inside the
container.
**Fix:** `USER node` before `CMD` — the `node:26-slim` base already provides that user.

---

### 7. The CORS allowlist cannot exclude localhost
**Severity: Low**
**Location:** `apps/server/src/security.ts:24` (`LOCALHOST_ORIGIN_RE`), `:36-38`.
**VERIFIED**

`isOriginAllowed` returns true for any `http(s)://localhost:*` or `127.0.0.1:*` origin
**regardless of `SOTTO_CORS_ORIGINS`**, and returns true when `Origin` is absent
(deliberate — native clients send none).

**What breaks:** on a hosted instance, any page the user has open on a localhost port
(a dev server, another local app) can drive `POST /voice/session` and read the
`/import/:jobId/events` SSE stream. And since an absent `Origin` always passes, the
check is no boundary at all against non-browser clients.

**Fix:** make the localhost bypass conditional on `SOTTO_HOST` being a loopback address.

---

### 8. CI actions float on major tags
**Severity: Low** — bounded: the workflow holds no secrets and has `contents: read`.
**Location:** `.github/workflows/ci.yml:16`, `:18`, `:22`.
**VERIFIED**

`actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`. A compromised
tag on the third-party `pnpm/action-setup` executes on the runner against your source.
The workflow is otherwise clean: `pull_request` (not `pull_request_target`), explicit
minimal `permissions:`, no secrets referenced.
**Fix:** pin to commit SHAs.

---

### 9. `/health` is exempt from Basic auth and reports model-stack status
**Severity: Low** — reconnaissance only.
**Location:** `apps/server/src/app.ts:71`, `:124-131`.
**VERIFIED**

Returns `{ ok, stt, llm, tts, vad }` with no credential, telling an unauthenticated
caller which model backends are reachable. The exemption itself is deliberate and
fails closed (exact match or `?`-prefix only). Accept, or move it behind a separate
token.

---

## Verified clean — do not re-audit these

- **No secret was ever committed**, on any branch, in this repo's whole history. Only
  `.env.example`. Scanned the built production bundle
  (`apps/client/.vercel/output/static/_expo/.../entry-*.js`) for `sk-`, `sk-proj-`,
  `AIza`, `ghp_`, `xox*`, JWT and PEM patterns: **nothing**. All seven `EXPO_PUBLIC_*`
  vars are non-secret (URLs, a public Apple client id, feature flags).
- `~/Claude/sotto-cloud/.env` holds the real `OPENAI_API_KEY`, is gitignored, and was
  never committed.
- **No XSS anywhere.** No HTML sinks in source; model output renders via escaped
  React Native `<Text>`.
- **No telemetry or analytics SDK.** One `console.warn` in the client, dev-gated,
  logging an error object only.
- **Import pipeline is genuinely hardened**: 25 MB upload cap, 600k char cap, 400
  chapter cap, EPUB zip-bomb entry+inflation-ratio guards
  (`packages/content/src/import/limits.ts`), job ids are `randomUUID()`, and
  `/import/:jobId/audio/:file` reads an in-memory `Map` — **no filesystem path is ever
  built from user input**, so there is no traversal there.
- **Service worker does not cache personalized routes**: API prefixes bypass the
  cache-first shell handler for every non-navigate request
  (`apps/client/public/sw.js:361-366`).
- **BYOK key egress is exactly one host.** Only `https://api.openai.com/v1`, only in an
  `Authorization` header, never in a URL or body. The `baseUrl` override is a test seam
  with no production caller (VERIFIED by grep across `apps/client` and
  `packages/voice`). The key is excluded from the Profile → Export file.
- **No client-supplied `userId` anywhere.** Web auth is an httpOnly cookie; native is a
  bearer token in `expo-secure-store`. No endpoint takes an identity parameter.
- **`/billing/stub/subscribe` is safe.** It ships in the production bundle and points at
  `https://app.readsotto.app`, but it is registered only when `stubMode` is true
  (`sotto-cloud/src/billing/index.ts:212-214`), and `loadConfig` throws when
  `SOTTO_CLOUD_BILLING=stub` meets `SOTTO_CLOUD_ENV=production`
  (`sotto-cloud/src/config.ts:258-263`, called at `:211`). `sotto-cloud/fly.toml:27-28`
  carries `production` + a plaintext `stub` that a Fly secret is expected to outrank —
  if that secret ever disappears the server refuses to boot rather than handing out free
  plans. Fails closed, correctly.

---

## Fix these first

1. **`trustProxy: true`** in `apps/server/src/app.ts:31`. One line. Fixes the broken
   per-IP rate limiter *and* the `ws://` mixed-content failure on the Fly deploy.
2. **Confirm `SOTTO_BASIC_AUTH` is set on the live Fly instance** (`fly secrets list`).
   If it is not, and `SOTTO_API_KEY` points at OpenAI, your bill is open to anyone who
   finds the host.
3. **Bump `@fastify/static`** off 8.3.0 (four advisories, one High). Verify the Fastify 5
   peer range first.
4. **Add a `headers` block to `apps/client/vercel.json`** — CSP with a tight
   `connect-src`, `frame-ancestors 'none'`, `nosniff`. This is what limits the damage of
   any future injection reaching the `localStorage` BYOK key.
5. **Fence the passage in `buildSystemInstruction`** — nonce-delimited data block plus
   one rule line, and strip `[[...]]` markers from passage text.

## Needs live state I cannot see

- `fly secrets list` on both apps: is `SOTTO_BASIC_AUTH` set? Where does `SOTTO_API_KEY`
  point?
- Is `SOTTO_CLOUD_BILLING=stripe` actually present as a secret on `sotto-cloud`?
- Which branch the deployed Fly machine is running — `main` and `run9/integration` have
  diverged.
