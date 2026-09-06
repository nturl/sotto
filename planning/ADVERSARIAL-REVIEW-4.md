# Adversarial review 4 — "what leaks, what costs, what is fake"

Lane R4-R. Read-only review of the run 4 surface at the Gate 2 SHAs:

- OSS `sotto` at `8273f74` (working tree dirty with another session's content work;
  committed state read with `git show` wherever the distinction mattered — nothing
  in this repo was staged, stashed, checked out, or otherwise touched)
- Cloud `sotto-cloud` at `1efe061`

Every claim below is marked **VERIFIED** (I read the file and traced it, or ran the
read-only check) or **INFERRED** (pattern match / platform behaviour I could not
exercise without mutating live state). Live checks were limited to unauthenticated
`GET`s and read-only `fly` list calls. No secret was printed, no Fly machine was
started or stopped, no Stripe object was created, and the LaunchAgent was not
kickstarted (that would have sent Noel a real iMessage).

The four pinned defects are not re-derived. §1 judges whether their scope is right
and names what else shares their root cause; §5 records that judgement explicitly.

---

## 0. Escalations

Four findings meet the escalation bar set in the brief.

| # | Escalation | Category |
| --- | --- | --- |
| H1 | The sunset switch's Stripe path counts only `status=active`, so a subscriber inside the live 3-day trial reads as **zero** and the two-month cutoff stops production on a real paying customer | sunset stops production early |
| H2 | `fly machine stop` — the switch's only automated action — is undone by the app's own `auto_start_machines = true` on the next inbound request | sunset fails to stop it at all |
| H3 | Account deletion never cancels the Stripe subscription: a paying customer who deletes their account **keeps being charged**, and the local mapping row is gone so nothing reconciles | money at risk on the live app |
| H4 | The 3-day trial has no eligibility check of any kind and the deletion cascade destroys the customer mapping, so subscribe → cancel → delete → re-signup yields unlimited free trials | money at risk on the live app |

---

## 1. Ranked findings

### HIGH

---

#### H1. The sunset switch's definition of "paying subscriber" is narrower than the service's own, and the difference is exactly the 3-day trial

**VERIFIED.**

`sotto-cloud/ops/sunset-check.mjs:246`

```js
url.searchParams.set('status', 'active');
```

`sotto-cloud/src/billing/stripe.ts:45` — the service's own definition, used by the
webhook handler that writes entitlements:

```ts
const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing']);
```

A Stripe subscription created with `trial_period_days` has status `trialing`, not
`active`, for the whole trial. The trial is live: `sotto-cloud/fly.toml:58`
`SOTTO_CLOUD_TRIAL_DAYS = "3"`, default `3` at `sotto-cloud/src/config.ts:92`, set
unconditionally on every Checkout session at `sotto-cloud/src/billing/stripe.ts:111`.
`past_due` (a failed renewal charge in its retry window) is likewise excluded.

The Stripe count **overrides** the entitlements fallback rather than being reconciled
with it — `sotto-cloud/ops/sunset-check.mjs:682-690`:

```js
let activeSubs = flyData.activeSubs;   // entitlements fallback — would count trialing
...
activeSubs = await getStripeActiveSubCount(key, excludeCustomer);   // overrides it
source = 'stripe';
```

There is no `Math.max`, no cross-check, and no warning when the two disagree.

**Reproduction.** A learner subscribes on 2026-10-30 and is inside the 3-day trial on
2026-11-01. `ops/README-sunset.md` ("To make Stripe the live path: enable
'Subscriptions: Read' on the `sotto-stripe-sunset` restricted key") is a standing
instruction to Noel; once he follows it:

1. LaunchAgent fires 2026-11-01 08:00 (`com.noel.sotto-sunset.plist`, verified loaded
   with `Day 1 / Hour 8` via `launchctl print gui/502/com.noel.sotto-sunset`).
2. `getStripeActiveSubCount` returns **0** (the only subscription is `trialing`).
3. `decide()` (`ops/sunset-check.mjs:181-207`) with `bucket === 2` and `activeSubs === 0`
   returns `stop_and_notify_destroy`.
4. `flyMachineStop` runs (`:718`) and Noel is texted the three `fly … destroy` commands
   for an app that has a live, card-on-file customer.

**Why it is latent today, and why that is not comfort.** The key currently 403s
(`more_permissions_required`), so the run falls through to the entitlements table,
which *does* count a trialing subscriber (the webhook writes the entitlement while
`trialing` — `src/billing/stripe.ts:230`, and `src/billing/stripe.test.ts:128` asserts
it). The switch is safe only for as long as the key stays broken. The README instructs
Noel to fix it.

**Fix.** Drop the `status` filter (Stripe's default returns every non-canceled
subscription) or pass `status=all` and count `active | trialing | past_due` — i.e. reuse
`ACTIVE_STATUSES`. Then take `Math.max(stripeCount, entitlementsCount)` and note a
disagreement in the ledger `note` column rather than letting one path silently win.

---

#### H2. `fly machine stop` cannot cut anything off — the app's own service config restarts it

**VERIFIED** for the code and config; **INFERRED** for the platform consequence (I did
not stop a machine to prove it).

`sotto-cloud/ops/sunset-check.mjs:718` is the switch's only automated action:

```js
flyMachineStop(app, machineId);
console.log(`EXECUTED: fly machine stop ${machineId} -a ${app}`);
```

`sotto-cloud/fly.toml:75-81`:

```toml
auto_stop_machines = false
auto_start_machines = true
min_machines_running = 1
```

Read-only confirmation from the live machine (`fly machine list -a sotto-cloud --json`):

```
83095da7642648 started
  service: {'protocol':'tcp','internal_port':8080,'autostop':False,'autostart':True,'min_machines_running':1}
```

With `autostart` true, Fly Proxy starts a stopped machine when a request arrives.
`app.readsotto.app` is a public URL with a landing-page funnel, a PWA that phones keep
in their app switcher, and whatever crawlers and uptime probes find it. The first such
request after the stop brings the machine back — Fly billing and the OpenAI broker
resume — while `ops/sunset-ledger.csv` records `stop_and_notify_destroy` and the text
says "Executed." Nothing rechecks for a month.

The script also never verifies the stop: `flyMachineStop` discards its output and no
subsequent `flyMachineList` confirms `state === 'stopped'`.

Secondary (**VERIFIED**): `machines[0]?.id` (`:708`) stops exactly one machine. Correct
today — one machine exists — but nothing in `fly.toml` pins the count, and
`min_machines_running = 1` is not a maximum.

**Fix.** The stop must be something the proxy cannot undo: `fly scale count 0`, or flip
`auto_start_machines = false` / `min_machines_running = 0` and redeploy, or `fly apps
suspend`. Then re-read the machine list and put the observed state in the ledger row and
the text. Whatever is chosen, iterate every machine, not `[0]`.

---

#### H3. Account deletion never cancels the Stripe subscription — a deleted account keeps paying

**VERIFIED.**

`sotto-cloud/src/auth/users.ts:117-146` (`deleteUser` / `deleteUserAndStorage`) does
database work and blob deletion only. It never imports or calls anything under
`src/billing/`. The service's only outbound Stripe calls are
`checkout.sessions.create` (`src/billing/stripe.ts:87`) and
`billingPortal.sessions.create` (`:126`) — there is no `subscriptions.cancel` or
`subscriptions.update` anywhere in the service.

`migrations/003_billing.sql:15-19` makes `stripe_customers` `ON DELETE CASCADE` off
`users`, so deletion also destroys the `user_id → customer_id` mapping. The
subscription keeps renewing at Stripe, and when a later `customer.subscription.*`
webhook arrives there is no local row to reconcile it against.

**Reproduction (do not run against live).** Subscribe → wait for the entitlement to flip
→ `DELETE /account` → the Stripe subscription is still `active` in the dashboard and
invoices on the next period boundary.

**Scope note.** `docs/verification.md` Tier 4 records "Account deletion from the web —
**PASS** — signs out; `/me` 401 afterwards". Signing out and a 401 prove session
invalidation. They prove nothing about billing, and the row reads as if the deletion
story is closed.

---

#### H4. The 3-day trial has no eligibility check, and deletion resets the only thing that could enforce one

**VERIFIED.**

`sotto-cloud/src/billing/stripe.ts:86` reads `SOTTO_CLOUD_TRIAL_DAYS` and `:111` applies
it to every Checkout session:

```ts
...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
```

There is no per-user, per-email, or per-customer check anywhere between
`requireUser` and the API call (`src/billing/index.ts:88-118`). Trial subscribers get
the full `standard` caps from minute one (`stripe.ts:45`, `trialing ∈ ACTIVE_STATUSES`).

Stripe's own "one trial per customer" dashboard setting is defeated by H3's cascade:
after `DELETE /account`, `#customerFor` (`src/billing/stripe.ts:322-336`) finds no
`stripe_customers` row and creates a **brand-new** Stripe Customer.

Lower-friction variant: `normalizeEmail` (`src/auth/users.ts:12-14`) is trim +
lowercase only — no plus-address stripping, no Gmail dot folding — so `a+1@`, `a+2@`
are free, independent accounts, each with its own 3-day trial and 250 tutor minutes
against Noel's OpenAI key.

The `$5/day` broker ceiling (`fly.toml:50`) is the only thing bounding the damage, and
it is a *global* ceiling: farmed trials burn the same budget every real customer shares.

No test covers trial eligibility in either repo.

---

#### H5. The next vendor-pin bump replaces the entire paid app with the free marketing landing page

**VERIFIED** in code and against both live origins.

The OSS client's web build now renames the app shell and writes the landing page in its
place — `apps/client/scripts/build-web.mjs:66`:

```js
renameSync(path.join(dist, 'index.html'), path.join(dist, 'app.html'));
```

That script *is* `web:export` (`apps/client/package.json:15`), which is exactly what
`sotto-cloud/scripts/build-client.sh` and `sotto-cloud/Dockerfile:51` run to produce the
paid client.

The cloud's SPA fallback still sends `index.html` — `sotto-cloud/src/app.ts:206`:

```ts
return reply.header('Cache-Control', 'no-cache').sendFile('index.html', staticDir);
```

So after a pin bump, `/account`, `/paywall`, `/usage`, `/reader/*` and `/` all serve the
free landing page. That includes the magic-link destination: `src/auth/routes.ts:140`
redirects a verified sign-in to `${APP_BASE_URL}/account`. The landing page also carries
no `__SOTTO_STATIC__` flag (`build-web.mjs:110` injects only into `app.html`), which is
what `apps/client/src/state/contentApi.ts:37-39` uses to resolve its own origin.

**Not yet live.** The pin is `34201b2` (`git ls-tree HEAD vendor/sotto`), which predates
the landing commits `18b0074` / `64fa2e4`. Live proof that the two origins already run
divergent builds:

```
curl -s https://app.readsotto.app/sw.js | grep -c app.html   → 0
curl -s https://readsotto.app/sw.js     | grep -c app.html   → 4
```

**Nothing tests it.** `sotto-cloud/src/static.test.ts:22-27`'s `makeExport()` hand-writes
`index.html` into a temp dir, so all three static tests keep passing while production
breaks. The fix lane must bump the pin (it changes OSS client code for all four pinned
defects), so this fires on the very next paid deploy.

**Fix.** Make the cloud's fallback file configurable and pick `app.html` when present,
and replace the synthetic fixture with one built from the real `web:export` output — or
at minimum assert that the file the fallback names exists at boot.

---

#### H6. The service-worker workaround persists every authenticated API response to disk, unboundedly, and sign-out never clears it

**VERIFIED.** Same root cause as pinned defect 4, but a consequence the pinned scope
does not name.

`apps/client/src/cloud/http.ts:126-129` makes every web GET a unique URL:

```ts
const bustedPath =
  isGet && this.platform === 'web'
    ? `${path}${path.includes('?') ? '&' : '?'}_sw=${Date.now()}`
    : path;
```

`apps/client/public/sw.js:175-182` writes every OK response into the shell cache:

```js
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
```

`apps/client/public/sw.js:149-173` (`activate`) deletes whole caches by **name** when the
manifest version changes; it never prunes entries inside the current one.

Sign-out does not touch Cache Storage: `apps/client/app/account/index.tsx:102-104` →
`apps/client/src/cloud/http.ts:196`.

Live confirmation the worker runs on the paid origin:
`GET https://app.readsotto.app/sw.js` → `200 application/javascript`.

Two consequences:

1. **Growth.** Every `/me`, `/usage`, `/billing/plans` GET writes a permanent cache entry
   under a URL that can never be matched again. It accumulates for the life of a shell
   version.
2. **Leak.** The signed-in learner's email, plan, entitlement and usage sit in the
   browser profile's on-disk cache and survive sign-out. On a shared or borrowed browser
   that is a real disclosure. On the free origin this never existed, because there was no
   same-origin API to cache.

**Scope judgement.** The pinned fix ("exempt API paths in `sw.js`, drop the query
parameter") does close this — *provided both halves land*. Exempting API paths in `sw.js`
while leaving the `_sw=` buster in `http.ts` leaves the growth and the leak in place,
because the buster's whole job is to make the URLs unique. Whoever does the fix must
also add a `caches.delete` / prefix sweep on sign-out for browsers that already hold the
entries.

---

#### H7. The self-host kit's default and its documented Fly quickstart both put an unauthenticated, key-spending tutor endpoint on a network

**VERIFIED.**

`docker-compose.yml:9` publishes `'8790:8790'` (host `0.0.0.0`), `:15` hardcodes
`SOTTO_HOST: 0.0.0.0`, and `:38` leaves `SOTTO_BASIC_AUTH: ${SOTTO_BASIC_AUTH:-}` empty
by default. The kit's own guidance contradicts it — `docs/self-hosting.md:159`: "Keep
`SOTTO_HOST` on `127.0.0.1` unless you need LAN/phone access."

`docs/self-hosting.md:66-71` gives the Fly quickstart as exactly `fly launch` /
`fly secrets set SOTTO_API_KEY=sk-...` / `fly deploy` — no `SOTTO_BASIC_AUTH` anywhere.
Following it verbatim puts a public internet URL in front of `/voice/*`, which spends the
operator's OpenAI key. `fly.toml.example:19-21` mentions basic auth only in a comment.

`/health` is exempt from the auth fence (`apps/server/src/app.ts:71`) and its handler
(`:124-131`) fires three outbound probes carrying `Authorization: Bearer
${config.SOTTO_API_KEY}` (`:96`) — unauthenticated, unrate-limited request amplification.

And the OSS server sets no `trustProxy` at all (`apps/server/src/app.ts:31` is
`Fastify({ logger: true })`), so the per-IP session limiter keyed on `request.ip`
(`:155`) collapses to one global bucket behind Docker's bridge, Fly, Tailscale
Serve or Caddy — all four documented paths. This is adversarial review 3's finding 8,
fixed in the cloud repo and still shipping in the OSS deploy kit.

Neither image sets `USER` (`Dockerfile` in both repos; `docker image inspect
sotto-sotto:latest` returns `User=""`), so both run as root.

---

#### H8. The live Terms of Service, which paying customers accept at Checkout, contains a placeholder addressed to the operator

**VERIFIED live, read-only:**

```
curl -s -w '%{http_code}' https://app.readsotto.app/terms   → 200
… "Governing law: TODO Noel."
```

`docs/verification.md` Tier 4 records "Legal pages — **PASS** — `/terms` and `/privacy`
200 with the markdown rendered", with the TODO as a trailing sentence. A live consumer
contract on a $9.99/mo product with an unfilled governing-law clause is not a PASS row;
it is an open defect with a real charge already run through it.

---

### MEDIUM

#### M1. The `stop_early` spend branch is structurally dead on the real schedule

**VERIFIED.** `ops/sunset-check.mjs:601` computes `monthPrefix = realDate.slice(0, 7)` —
the **current** month — and the remote query sums
`spend_daily WHERE day LIKE '<current month>%'` (`:304`). The LaunchAgent fires only on
the 1st at 08:00, so the sum always covers a month roughly eight hours old. All of the
month that actually spent the money is invisible.

The branch has never run on real data: `ops/sunset-ledger.csv` row 3 is
`pretendSpend=12.34`, and `docs/evidence/s-2026-09-06.log` records "spend_daily: empty
(month-to-date spend = $0.00 today)". Separately, `sunset.json`'s `spendCeilingUsd: 5` is
compared against a *monthly* total, while `fly.toml:50` uses the same number as the
broker's *daily* ceiling.

**Fix.** Sum the previous month (`day LIKE '<prev month>%'`), or scale the ceiling by
days elapsed, and say which in the text.

#### M2. After the month-2 stop there is no steady state — every later run texts "BLOCKED"

**VERIFIED.** `queryFlyEntitlementsAndSpend` (`ops/sunset-check.mjs:293-315`) shells
`fly ssh console` at `:308`. Against a stopped machine that fails, so `main()` takes the
Gate-2 blocked path (`:645-679`), writes `action=blocked`, texts "Action: BLOCKED …
refusing to guess", and exits 1. Every month after the cutoff produces an alarming text
about an app that is stopped on purpose.

#### M3. The switch's only notification channel is unproven in the context it will run in

**INFERRED** — I deliberately did not `launchctl kickstart` the agent, because a real run
sends Noel an unsolicited iMessage.

All four proof runs in `ops/sunset-ledger.csv` were driven from an interactive terminal,
which carries that terminal's own TCC grants. Under launchd, `sendIMessage`
(`ops/sunset-check.mjs:427-455`) needs an Automation grant for `osascript` → Messages,
and `maxRowidSync` / `confirmSent` need Full Disk Access for `/opt/homebrew/bin/node` to
read `~/Library/Messages/chat.db`. Neither can prompt from a background agent. On
failure the only record is `ops/sunset-cron-err.log`, which nobody reads — and on the
month-2 fire the machine stops whether or not the text lands.

**Fix.** One `--dry-run` fired through `launchctl kickstart -k
gui/502/com.noel.sotto-sunset` (Noel's call, since it sends a text) proves the whole
path in its real context. Ten minutes, once.

#### M4. Every unknown extension-less GET on the API origin returns `200` and the app shell

**VERIFIED live:**

```
curl -s -o - -w '%{http_code} %{content_type}' https://app.readsotto.app/billing/success
→ 200 text/html; charset=utf-8   (the SPA shell)
```

`sotto-cloud/src/app.ts:200-207` registers `setNotFoundHandler` app-wide, so the only
thing separating an API 404 from an SPA route is `path.extname(pathname)`. `GET
/admin/typo`, `GET /voice/anything`, `GET /billing/success` all answer 200 HTML.

This is why pinned defect 2 surfaces as "Unmatched Route" rather than a 404, and it means
any uptime probe pointed at an API path reads as healthy forever. **Scope judgement for
defect 2:** repointing `successUrl`/`cancelUrl` (`apps/client/src/cloud/http.ts:216-217`)
fixes the user-visible symptom and leaves this. Worth exempting the enumerated API
prefixes from the fallback in the same pass — the Gate 2 list is complete (see §2).

#### M5. Adversarial review 3 finding 5 did **not** stay closed

**VERIFIED.** `apps/client/src/import/api.ts:37` still posts to `${serverUrl()}/import`,
and `serverUrl()` (`apps/client/src/state/contentApi.ts:37-43`) resolves to the page
origin on any static export. On `readsotto.app` that is Vercel, whose catch-all
(`apps/client/vercel.json:9`) rewrites everything to `/app.html` — so the book's bytes
leave the device to Vercel's edge and the import then fails. Run 4 documented the hosted
path ("Importing on the hosted PWA" in `docs/importing-books.md`) rather than closing the
finding. Its coincidental correctness on the paid origin (where `serverUrl()` *is* the
API) is what kept it out of sight.

#### M6. "Daily spend ceiling ($5) — PASS — verified live" has no live evidence

**VERIFIED as unsupported.** Grep across both repos' evidence logs finds the ceiling only
as an env-var readback (`sotto-cloud/docs/evidence/d3-live-2026-09-05.log:77`) and as an
owed item (`:133`, "Still owed … then kill switch and ceiling"). The kill switch *was*
exercised live (ledger 2026-09-06 00:10, `SOTTO_CLOUD_TUTOR_DISABLED=1` → `/health`
`tutorDisabled true`); the ceiling was not. The code change that justifies upgrading
review 3's PARTIAL is real — `src/voice/metering.ts:99-108` now adds `openExposureUsd`
to closed spend — so the honest row is "PASS (code + unit tests)", not "verified live".

#### M7. BYOK: removing the key does not stop a session that is already spending it

**VERIFIED.** `apps/client/app/settings/openai-key.tsx:73-79` calls only
`removeByokKey()`. The running `OpenAIDirectProvider` captured the key into
`this.apiKey` at construction (`packages/voice/src/openai-direct/provider.ts:103`) and
`sessionManager.active` still holds that provider. A learner who revokes the key in
Settings mid-session keeps billing until the 20-minute cap
(`packages/voice/src/openai-direct/provider.ts:44`) or an explicit End.

#### M8. BYOK: "Saved" is asserted, never verified

**VERIFIED.** `apps/client/src/voice/byokKey.ts:96-107` swallows a
`localStorage.setItem` throw and no-ops when `expo-secure-store` failed to load (`:48`
`.catch(() => null)`). `openai-key.tsx:66-70` unconditionally sets the mask and toasts
`byok.saved`. In a browser with site data blocked, the learner is told the key is on
their device when it is only in the module-level cache, and it vanishes on reload.

#### M9. BYOK: a rate-limited but valid key is reported as invalid and discarded

**VERIFIED.** `packages/voice/src/openai-direct/api.ts:166` computes
`{ ok: false, reason: 'rate_limited' }` for a 429, but `openai-key.tsx:63` maps
everything except `'network'` to `t('byok.invalid')` — "That key wasn't accepted."
There is no `byok.rateLimited` string in any of the nine catalogs. The same path swallows
a 5xx from OpenAI.

#### M10. BYOK has no budget of any kind, and there is no cap on session count

**VERIFIED.** `packages/voice/src/openai-direct/provider.ts:44` gives a 20-minute hard
cap and a 90-second idle cut-off per session (matching `apps/server/src/app.ts:22`), and
those are real and armed (`:137, :249-263`). What does not exist is any dollar or token
budget, or anything preventing an immediate restart after a cut-off. `docs/byok.md:104-106`
admits "No usage meter" and `:43-44` pushes the budget onto OpenAI's dashboard. Per
learner utterance the path can issue up to four chat completions
(`provider.ts:46` `MAX_TOOL_ITERATIONS = 4`) plus one TTS request **per sentence**
(`provider.ts:373`), and it bills an STT call for every VAD `speech_end` even when the
transcript comes back empty (`provider.ts:318-320, :340-343`).

#### M11. Deletion silently fails from the shipped UI more than ten minutes after sign-in

**VERIFIED.** The account screen calls `cloud.deleteAccount()` with no argument
(`apps/client/app/account/index.tsx:112` → `apps/client/src/cloud/http.ts:201-204`), so
it issues a bare `DELETE /account` and never touches `POST /account/delete/request` or
the `?confirm=` token. Past the 10-minute `isFreshAuth` window
(`sotto-cloud/src/auth/sessions.ts:19, :95-96`), the server answers 403 `reauth_required`
(`sotto-cloud/src/auth/routes.ts:214`) and the learner gets a generic toast with no
in-app way to finish. The email-confirm path D1 built and documented is unreachable from
the shipped client.

#### M12. `fly.toml` ships a configuration that only boots because a Fly secret contradicts it

**VERIFIED.** `sotto-cloud/fly.toml:27-28` sets `SOTTO_CLOUD_ENV = "production"` **and**
`SOTTO_CLOUD_BILLING = "stub"` — the exact pair `assertBillingConfig`
(`sotto-cloud/src/config.ts:258-263`) throws on. The machine boots only because a Fly
secret overrides `SOTTO_CLOUD_BILLING`; live `/health` returns
`{"env":"production","billing":"stripe"}`. `fly secrets unset SOTTO_CLOUD_BILLING` puts
the app in a boot crash loop. The file is also self-contradicting on its face: `:55-58`'s
comment says the trial is "off … stage 5f puts this back to 3 days" directly above
`SOTTO_CLOUD_TRIAL_DAYS = "3"`.

#### M13. The deploy kit's 4.49 GB figure is right; its breakdown is narrated, not measured, and does not reconcile

**VERIFIED for the headline.** `docs/evidence/deploy-kit-2026-09-05.log:17` —
"4m38s wall clock, image 4.49GB" — and `docker images` reports `sotto-sotto:latest
4.49GB` today.

Softer than it reads:

- The size lines in that log are prose, not captured command output, unlike the `$ curl`
  and `$ docker stats` lines around them. The "10.2GB before" figure at `:9` is
  unverifiable — that image no longer exists.
- The attribution at `:22-27` ("1.7GB node_modules … plus 132MB packs shipped twice")
  does not reconcile: `docker history` shows the runtime `COPY /app /app`
  (`Dockerfile:59`) as one **2.85 GB** layer, and the committed packs are 119.9 MB at
  `8273f74`, leaving roughly 2.5 GB of `node_modules`. **INFERRED** — I did not
  `docker run` to `du` inside.
- Docker's three readouts disagree (`docker images` 4.49 GB, `docker history` sum
  ~3.18 GB, `docker image inspect .Size` 1.32 GB). The doc quotes the largest.

Nothing in the kit is fake: `/health` exists (`apps/server/src/app.ts:124`) so the
`HEALTHCHECK` at `Dockerfile:61-62` hits a real route, and every documented script
(`web:export`, `serve-static.mjs`, `build-web.mjs`, `e2e/hosted.mjs`,
`e2e/self-hosted-voice.mjs`) exists. Two doc nits: `docker-compose.yml:10-11` requires a
**root** `.env` or compose aborts, while `.env.example:1` says "Copy to
`apps/server/.env`"; and `fly.toml.example` defines no Fly healthcheck (Fly ignores
Docker `HEALTHCHECK`).

---

### LOW

- **L1.** `ops/sunset-ledger.csv` is tracked, so every monthly run leaves the repo dirty;
  `ops/.sunset-notify.lock` is not in `.gitignore` (**VERIFIED** — `grep -n 'sunset\|\.lock'
  sotto-cloud/.gitignore` returns nothing). A crashed run leaves an untracked lockfile.
- **L2.** `.github/workflows/sunset.yml` declares no `permissions:` block, so the job runs
  with the repository default `GITHUB_TOKEN` scope. Harmless today (private repo,
  `workflow_dispatch` only) but free to tighten. **VERIFIED**.
- **L3.** Citation drift. `docs/verification.md` cites `src/voice/realtime.ts:223` for the
  realtime 503; the guard is `:222`. The ledger's R4-S audit cites the destroy text at
  "lines 525-528"; the three commands are `:526-528`. Both substantively correct.
  **VERIFIED**.
- **L4.** `apps/client/src/state/contentApi.ts:31-33` still says the static flag is stamped
  into `dist/index.html`; `build-web.mjs:110` stamps `app.html`. **VERIFIED**.
- **L5.** The BYOK key is warmed into a module-level cache on **Profile mount**
  (`apps/client/src/voice/byokKey.ts:61`, `apps/client/app/profile.tsx:57-59`), so it sits
  in the JS heap for the app's lifetime after merely opening Profile — wider than the
  session that needs it. **VERIFIED**.
- **L6.** `packages/voice/src/openai-direct/api.ts:127-135` embeds up to 200 characters of
  the OpenAI error body into the thrown `Error`, which reaches the store's ephemeral
  `voiceError`. OpenAI's 401 body contains a partially masked key. Not persisted, not
  rendered (`apps/client/app/voice/[bookId].tsx:323-327` shows a generic string), but it
  is in memory and in any state dump. **VERIFIED**.
- **L7.** Stale comment: `apps/client/app/voice/[bookId].tsx:229-233` says the alternatives
  chip row is "desktop-only … Phones never see this", but `availability.ts:128-131`
  returns `alternatives: ['cloud','byok']` on a phone and the render guard
  (`:234-236`) is `alternatives.length > 1` with no desktop check. **VERIFIED**.
- **L8.** Profile's BYOK On/Off row is stale after save or remove:
  `apps/client/app/profile.tsx:56-59` reads `hasByokKey()` in a `useEffect` with `[]` deps
  and no focus listener. **VERIFIED**.
- **L9.** `sotto-cloud/src/auth/users.ts:144` awaits the blob delete with no catch, and the
  "orphaned blobs are swept later" its own comment promises (`:112-116`) does not exist
  anywhere in `src/`. **INFERRED** (grep + read; no sweeper found).
- **L10.** `apps/client/scripts/build-web.mjs:46` spreads `{...process.env}` into the Expo
  export, so any `EXPO_PUBLIC_*` variable in the builder's shell is inlined into the
  bundle. Controlled inside the Dockerfile; not controlled for a local
  `scripts/build-client.sh` run. **VERIFIED**.
- **L11.** `.dockerignore` (OSS) excludes `.env`, `.git`, `node_modules`, `planning`,
  `docs/screenshots|evidence|media` — but not `docs/` generally or `.github/`, so ~265 KB
  of `docs/verification.md` and the author's name and bundle id ship in the self-host
  image. Attribution, not secrets. **VERIFIED**.

---

### What is genuinely solid (checked, and it held)

- **No secret material anywhere it shouldn't be.** The deployed client bundle
  (`/_expo/static/js/web/entry-81e61e….js`, 1.94 MB, fetched read-only) contains zero
  matches for `sk-`, `sk_live_`, `sk_test_`, `rk_`, `whsec_`, `re_` or `SESSION_SECRET`;
  the only baked value is `https://app.readsotto.app`. Neither Docker image bakes a
  secret. The logger redacts `authorization`/`cookie`/`set-cookie` and strips query
  strings (`sotto-cloud/src/app.ts:79-91`); `fail()`/`ERRORS` are fixed strings;
  `billingFailure` logs only `err.code` (`src/billing/index.ts:314-324`). **VERIFIED**.
- **BYOK never leaks the key off `api.openai.com`.** The only consumer is `authHeaders`
  (`packages/voice/src/openai-direct/api.ts:123-125`); every `apiKey` reference in
  `packages/voice/src` feeds that one function. Never in a URL, never logged (the single
  `console.info` at `provider.ts:246` takes metric names and error codes), no telemetry
  exists in the client at all, and the cold-cache fallback constructs
  `LocalCascadeProvider` **without** the key (`sessionManager.ts:97-101, :126`). The
  storage claim matches the code: `localStorage` on web, `expo-secure-store` on native
  (`byokKey.ts:32-51`), documented accurately at `docs/byok.md:68-73`. The mask shows no
  key-derived characters (`byokKey.ts:138-142`). The service worker passes cross-origin
  requests through untouched (`sw.js:263`), so BYOK traffic is never cached. **VERIFIED**.
- **BYOK is not a stub.** All ten `VoiceProvider` members are implemented with real
  behaviour (`packages/voice/src/openai-direct/provider.ts:114-212`); key validation is a
  real `GET /v1/models` (`api.ts:149-168`), not a regex. **VERIFIED**.
- **Review 3 finding 2 (magic-link host injection) stayed closed.** The link is built from
  `config.publicOrigin` (`sotto-cloud/src/auth/routes.ts:241-243`) and never from `Host`
  or `X-Forwarded-Host`; 32 random bytes, HMAC-SHA256 at rest, 15-minute TTL, single-use
  inside one transaction (`src/auth/magic-link.ts:17-82`). **VERIFIED**.
- **Review 3 finding 8 (trustProxy) stayed closed, and the run-4 same-origin move did not
  reopen it.** `sotto-cloud/src/app.ts:74` is `(_address, hop) => hop === 0`, which makes
  `request.ip` the rightmost `X-Forwarded-For` entry — the one Fly appends. A client that
  prepends a forged address does not win; `src/app.test.ts`'s "trustProxy: exactly one
  hop" tests assert exactly that (`docs/evidence/d1-2026-09-05.log:128-136`). The audit
  log stores no IP at all (`src/db.ts:104-117`). **VERIFIED**.
- **Review 3 finding 4 (client-reported audio zeroing the cost row) stayed closed**, and
  the ceiling now counts open exposure as well as closed spend
  (`sotto-cloud/src/voice/metering.ts:99-108`, `:189-207`). **VERIFIED**.
- **Review 3 findings 1 and 3 (Realtime) are moot by configuration**: `/voice/realtime/secret`
  returns 503 with the flag off (`src/voice/realtime.ts:222-231`), `SOTTO_CLOUD_REALTIME_ENABLED = "0"`
  in `fly.toml:52`, and live `/health` reports `production` + `stripe`. **VERIFIED**.
- **The Gate 2 API-prefix enumeration is complete.** Every route registered under
  `sotto-cloud/src/` at `1efe061` falls under `/account /admin /auth /billing /health
  /import /imports /me /voice /webhooks`, and `/terms` + `/privacy` are correctly added
  (`src/legal.ts:126-127`). **VERIFIED** by enumerating the route table.
- **The sunset script's remote query is safe.** Read-only `better-sqlite3` open,
  base64-wrapped so no shell layer can inject, `execFileSync` with array args
  (`ops/sunset-check.mjs:293-315`). The `source IN ('stripe','apple')` filter that excludes
  the stray `source='manual', source_ref='stub'` row is correct and would otherwise have
  frozen the cutoff forever. Destroy commands appear only in the message text
  (`:526-528`), never in an `execFileSync`. **VERIFIED**.
- **The blocked gates do what the audit says — for the failure mode they cover.** Both Fly
  gates (`:613-642`, `:645-679`) exit before any stop decision, so an infrastructure failure cannot
  read as a false zero. What they do not cover is a Stripe call that *succeeds* with a
  semantically wrong number (H1). **VERIFIED**.

---

## 2. Claims vs evidence

Covers every PASS asserted in `planning/LEDGER.md`'s Run 4 entries from the Gate 1
section to the end, the Gate 1 and Gate 2 sections, and the Tier 4 / Tier 5 /
deploy-kit rows the orchestrator appended to `docs/verification.md` in `b72819c`.

**VERIFIED** = the evidence supports the claim as written. **PARTIAL** = true but
narrower or softer than stated. **UNSUPPORTED** = the named evidence does not
establish the claim.

### 2a. Ledger, Gate 1 → end

| # | Claim | Where | Evidence checked | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Gate 1 PASSED: isolated `pnpm check` on `da0e4e1` exit 0, 63 files / 498 tests | LEDGER 2026-09-05 17:55 | `docs/evidence/checks-gate1-oss-run4-2026-09-05.log` exists and is committed | **VERIFIED** |
| 2 | B2: "the key never reaches our origin" — 17 same-origin requests, 0 `Authorization`; 5 `api.openai.com`, 5 | LEDGER 17:20; Tier 5 | `docs/evidence/byok-live-2026-09-05.log`; independently re-traced in code: the key's only consumer is `openai-direct/api.ts:123-125` | **VERIFIED** (and stronger than the header count alone) |
| 3 | B2: on-device key storage, `localStorage` web / `expo-secure-store` native | LEDGER 17:20 | `apps/client/src/voice/byokKey.ts:32-51`; dependency present at `apps/client/package.json:38`, plugin at `app.config.ts:48` | **VERIFIED** |
| 4 | B2 PARTIAL: Safari standalone-PWA mic untested; native secure-store not run on a simulator | LEDGER 17:20 | Self-declared; consistent with Tier 5 | **VERIFIED** (correctly self-limited) |
| 5 | D1: plan table trimmed to free + standard; `planForStripePrice` resolves both ids | LEDGER 18:20 | `sotto-cloud/docs/evidence/d1-2026-09-05.log`; live `/billing/plans` reachable | **VERIFIED** |
| 6 | D1: `POST /auth/apple` 404s | LEDGER 18:20 | Route absent from the registered table at `1efe061`; the notFoundHandler's GET-only guard leaves POST as a JSON 404 | **VERIFIED** |
| 7 | D1: `automatic_tax` + `customer_update.address=auto` on Checkout | LEDGER 18:20 | `src/billing/stripe.ts:104-112`; D1b could not exercise it (no head-office address), D3 closed it in sandbox | **VERIFIED for the code**; see row 27 |
| 8 | D1: `/terms` + `/privacy` served from `legal/*.md`; "Governing law: TODO Noel" pinned by a test | LEDGER 18:20 | Live `GET /terms` → 200 containing "Governing law: TODO Noel." | **VERIFIED** — and the TODO is *live*, see H8 |
| 9 | D1: trustProxy regression tests | LEDGER 18:20 | `d1-2026-09-05.log:128-136`; `src/app.ts:74` re-read and traced through `@fastify/proxy-addr` | **VERIFIED** |
| 10 | D1: "deletion path documented for D2" | LEDGER 18:20 | Documented, yes. The client D2 shipped ignores the documented `POST /account/delete/request` + `?confirm=` half (M11) | **PARTIAL** |
| 11 | D1b: sandbox product + both prices; real Checkout URLs; webhook flips entitlement; unsigned → 400 | LEDGER 19:05 | `sotto-cloud/docs/evidence/d1-stripe-2026-09-05.log` | **VERIFIED** |
| 12 | D2 DONE: cloud serves the client export, SPA fallback, cache headers, tests | LEDGER 20:40 | `src/app.ts:169-208`; `src/static.test.ts` — but the fixture hand-writes `index.html`, so the tests cannot see H5 | **PARTIAL** |
| 13 | D2: paywall one card, month/year, Terms/Privacy to the cloud origin, nothing App-Store-shaped on web | LEDGER 20:40 | `apps/client/app/paywall/index.tsx:34-35` (`TERMS_URL`/`PRIVACY_URL`), `:120, :153, :252` all `Platform.OS === 'ios'` guarded | **VERIFIED** |
| 14 | D2: "account deletion with confirm" | LEDGER 20:40 | `apps/client/app/account/index.tsx:112` sends a bare `DELETE /account`; there is a UI confirm dialog but not the server's confirm token (M11) | **PARTIAL** — "confirm" means the dialog, not the documented flow |
| 15 | D2: proof at 375 and 1440 — magic link → paywall → stub subscribe → caps → real cascade turn → `cap_exhausted` → delete → 401 | LEDGER 20:40 | `docs/evidence/paid-web-2026-09-05.log`, 30 PASS / 0 FAIL | **VERIFIED** (local staging, as stated) |
| 16 | D2 found the SW cache-first bug, worked around in `http.ts`, durable fix deferred | LEDGER 20:40 | `sw.js:295-312`, `http.ts:118-129` — both confirmed; the workaround has its own consequences (H6) | **VERIFIED** for the finding; the "worked around" framing understates the cost |
| 17 | D3 2-4: one 512 MB machine, no OOM, 1 GB volume, cold start 16.8 s, image 2.4 GB | LEDGER 23:10 | `d3-staging-2026-09-05.log`; live `fly machine list` shows one `shared-cpu-1x` in `ewr` | **VERIFIED** |
| 18 | D3 2-4: D2 flow against `https://app.readsotto.app` 33/33 incl. a real cascade turn | LEDGER 23:10 | `d3-staging-2026-09-05.log` | **VERIFIED** |
| 19 | D3 2-4: sandbox Checkout shows the 3-day trial; webhook path treats `trialing` as active | LEDGER 23:10 | `d3-stripe-sandbox-checkout-trial.png`; `src/billing/stripe.ts:45` | **VERIFIED** — and this is precisely what the sunset switch's Stripe query contradicts (H1) |
| 20 | D3 5a-5d: live product/prices/webhook; CORS fix; `/health` production + stripe | LEDGER 23:35 | `d3-live-2026-09-05.log`; live `/health` → `{"ok":true,"env":"production","db":true,"billing":"stripe","tutorDisabled":false}` | **VERIFIED** |
| 21 | D3 5e: live $9.99 charge, three webhooks, entitlement `standard` / `source stripe` | LEDGER 23:56 | `d3-live-2026-09-05.log`; the ids are recorded; orchestrator confirms the row reverted | **VERIFIED** |
| 22 | D3 5: refund + cancel → entitlement back to `free` | LEDGER 2026-09-06 00:10 | `d3-live-…log`; `docs/evidence/s-2026-09-06.log` independently re-read the row as `free` | **VERIFIED** |
| 23 | D3 5f: kill switch exercised live (`TUTOR_DISABLED=1` → `/health` true, `POST /voice/session` refused) | LEDGER 00:10 | Ledger transcript | **VERIFIED** |
| 24 | D3 5f: "machine env verified TRIAL=3 CEILING=5 … CORS unset" | LEDGER 00:10 | Live machine env read read-only: `SOTTO_CLOUD_TRIAL_DAYS` `"3"`, `SOTTO_CLOUD_DAILY_SPEND_CEILING_USD` `"5"`, no `CORS_ORIGINS` | **VERIFIED** — but reading an env var is not exercising a ceiling (see row 39) |
| 25 | R4-S: four proof runs logged — pretend-months 2 and 3, the spend branch, and one real month-0 run | LEDGER 20:30 | `ops/sunset-ledger.csv` holds exactly those four rows; row 4 is `dryRun=false, action=none` | **VERIFIED** |
| 26 | R4-S audit: "the dry-run guard at `ops/sunset-check.mjs:706-721` is correct … destroy commands only ever appear in the message text, lines 525-528" | LEDGER 20:30 | Read `:704-721` and `:521-529`. Guard correct; destroy strings at `:526-528` (one-line drift) | **VERIFIED** |
| 27 | R4-S audit: "two 'blocked' gates … so an infrastructure failure can never read as a false zero" | LEDGER 20:30 | Both gates confirmed at `:613-642` and `:645-679`. True for Fly-path *failures*. It does not cover a Stripe call that succeeds and returns a wrong zero (H1), which is the false zero that matters | **PARTIAL** |
| 28 | R4-S audit: the remote query is read-only, base64-wrapped, `execFileSync` with array args | LEDGER 20:30 | `:293-315` re-read | **VERIFIED** |
| 29 | R4-S finding: production `entitlements` holds a stray `source='manual'` stub row; `plan != 'free'` alone would have frozen the cutoff forever | LEDGER 20:32 | `docs/evidence/s-2026-09-06.log`; orchestrator re-verified over `fly ssh`; the filter is at `:298-303` | **VERIFIED** — the best catch in the run |
| 30 | LaunchAgent installed, "plutil OK, loaded, PATH covers node/fly/security/osascript" | LEDGER 20:30 | `launchctl print gui/502/com.noel.sotto-sunset` shows it loaded with `Day 1 / Hour 8`; `env -i PATH=…` resolves `fly` → `/opt/homebrew/bin/fly` and `node` → v26.7.0 | **VERIFIED** |
| 31 | GitHub Action "only texts (no Fly token)" | LEDGER R4-S task card | The shipped workflow **cannot** text (no Messages.app on a runner) and writes `$GITHUB_STEP_SUMMARY` instead; the deviation is documented at length in `sunset.yml`'s header and `README-sunset.md` | **PARTIAL** — a reasoned, documented deviation from the card, not a defect |
| 32 | Landing page shipped; hosted smoke PASS at both widths against `https://readsotto.app` | LEDGER 22:50 | `docs/evidence/landing-2026-09-05.log` | **VERIFIED** — and it is the change that creates H5 |

### 2b. Gate 2 section

| # | Claim | Evidence checked | Verdict |
| --- | --- | --- | --- |
| 33 | OSS half PASSED at `37e229a`: isolated `git archive` + frozen install, `pnpm check` exit 0, 64 files / 500 tests, 0 eslint errors / 24 warnings, `content:validate` 0 errors / 106 warnings | `docs/evidence/checks-gate2-oss-run4-2026-09-06.log` committed in `b72819c` (387 lines) | **VERIFIED** |
| 34 | sotto-cloud PASSED at `2c2bd7c`: exit 0, 20 files / 313 tests | `sotto-cloud/docs/evidence/checks-gate2-cloud-run4-2026-09-06.log`, committed as `1efe061` | **VERIFIED** |
| 35 | "The two OSS commits after `37e229a` (`b72819c`, `b89e96e`) touch documentation only, no code" | `git show --stat b72819c` → `docs/evidence/…log` + `docs/verification.md` only. `b89e96e` → `planning/LEDGER.md` only | **VERIFIED** |
| 36 | Defects re-verified at file:line, "read and traced, not grepped" | All four confirmed at the cited lines: `account/index.tsx:272-291` (Apple block, exactly as pinned), `i18n/en.json:242` (`account.signedOut.subhead`, "…and iPhone access"), `http.ts:216-217`, `profile.tsx:234/236`, `voice/[bookId].tsx:284-309`, `sw.js:295-312`, `http.ts:118-129`. No `apps/client/app/billing/` directory exists | **VERIFIED** |
| 37 | API prefixes to exempt, "enumerated from the cloud routes": `/account /admin /auth /billing /health /import /imports /me /voice /webhooks`, plus `/terms` and `/privacy` | Enumerated every registered route at `1efe061`; all 27 fall under those prefixes, and `src/legal.ts:126-127` confirms the last two | **VERIFIED** — the enumeration is complete |
| 38 | Method note: `git archive` drops the submodule, so the first isolated cloud attempt failed on an empty `vendor/sotto`; the passing run used a `--shared` clone with the pin restored at `34201b2` | Consistent with `git ls-tree HEAD vendor/sotto` → `34201b2` | **VERIFIED** |

### 2c. `docs/verification.md` Tier 4 (LIVE) — audited hardest, since these were written from ledger entries

| # | Row as written | Verdict | Basis |
| --- | --- | --- | --- |
| 39 | Fly deploy — **PASS**, `/health` reports production + stripe | **VERIFIED** | Live `GET /health` returns exactly that |
| 40 | Magic link, real mail — **PASS**, Resend from `hello@readsotto.app`, delivered 23:52:17, clicked 23:52:32 | **VERIFIED** | Ledger + `d3-live` log; `MAGIC_LINK_FROM` confirmed in the live machine env |
| 41 | Apple identity token — **REMOVED from the web surface**; "See defect 1: the *button* is still rendered" | **VERIFIED** | Route absent; button at `account/index.tsx:272-291`. The row is honest |
| 42 | Live Stripe Checkout — **PASS** | **VERIFIED** | Live product and both price ids recorded; live `/billing/plans` serves them |
| 43 | Real charge → entitlement — **PASS** | **VERIFIED** | Charge/subscription ids recorded; entitlement row independently re-read in `s-2026-09-06.log` |
| 44 | Live webhooks — **PASS**, six handled events, three on the charge leg, unsigned → 400 | **VERIFIED** | `d3-live` log |
| 45 | Refund + cancel → downgrade — **PASS** | **VERIFIED** | `customer.subscription.deleted` at 00:00:33Z; entitlement back to `free` |
| 46 | Stub checkout absent in production — **PASS**, 404 | **VERIFIED** | Stub routes only registered under `if (stubMode)`; `/health` reports `billing: stripe`. Caveat M12: `fly.toml` itself still says `stub` |
| 47 | Plan table trimmed — **PASS** | **VERIFIED** | `src/plans.ts`; live `/billing/plans` |
| 48 | 3-day trial, card required — **PASS**, `TRIAL_DAYS=3` on Fly + a sandbox screenshot | **PARTIAL** | The **sandbox** Checkout page was screenshotted; the live trial was never exercised (stage 5e ran with `TRIAL_DAYS=0` on purpose). And nothing checks trial eligibility (H4) |
| 49 | Automatic tax — **PASS (sandbox)** … live charge computed $0 tax (no NY registration) | **PARTIAL, and the parenthesis is the whole story** | `automatic_tax: true` with **zero** tax registrations computes $0 for every customer, everywhere. The row reads as a shipped capability; what shipped is the plumbing |
| 50 | Daily spend ceiling ($5) — **PASS**, "verified live, upgraded from run 3's PARTIAL" | **UNSUPPORTED as written** | No evidence log shows the ceiling being tripped live; `d3-live-…log:133` lists it as still owed. The *code* upgrade is real (`metering.ts:99-108`); the live verification is not (M6) |
| 51 | Kill switch — **PASS**, verified live | **VERIFIED** | Ledger 00:10 transcript, `/health` `tutorDisabled` toggled and unset |
| 52 | Realtime mint with the flag off — **PASS**, 503 at `realtime.ts:223` | **VERIFIED** (line is `:222`) | Guard read and traced |
| 53 | Legal pages — **PASS**; "Governing-law line is still a TODO" | **PARTIAL** | Live `/terms` really does say "Governing law: TODO Noel." A live consumer contract with a placeholder is not a PASS (H8) |
| 54 | Account deletion from the web — **PASS**, "signs out; `/me` 401 afterwards" | **UNSUPPORTED as a deletion claim** | 401 proves session invalidation. The row does not cover the Stripe subscription that keeps billing (H3), the deletion flow that 403s past 10 minutes from the shipped UI (M11), or the blob-sweep that does not exist (L9). The DB cascade itself is genuinely correct (`users.ts:117-146`, `storage.ts:57-62`) |
| 55 | `trustProxy` behind Fly — **PASS**, "client IPs resolve correctly through Fly's proxy" | **PARTIAL** | Proven by unit tests that inject `X-Forwarded-For` (`src/app.test.ts`, `d1-…log:128-136`) and by re-tracing `@fastify/proxy-addr`. Not proven by a live request through Fly's proxy. The conclusion is right; the wording claims a live check that was not run |
| 56 | Hosted import (C4) — **PASS (staging)**, "not re-run against production" | **PARTIAL** (self-labelled) | `import-hosted-staging-2026-09-05.log`. The row labels itself correctly |
| 57 | App Store build — **DEFERRED** | **VERIFIED** | Unchanged |
| 58 | "Deployment shape, measured: one shared-cpu-1x 512 MB machine, ~337 MB available under load, one 1 GB volume, cold start 16.8 s" | **VERIFIED** | Live `fly machine list` confirms shape; the load/cold-start numbers come from `d3-staging-…log` |
| 59 | Open defect list (4 items, "recorded as defects, not folded into a PASS") | **VERIFIED, and correct practice** | All four are real and correctly located. Severities are understated for #4 (see H6) and #2's root cause is broader than stated (M4) |

### 2d. `docs/verification.md` Tier 5 (BYOK)

| # | Row | Verdict | Basis |
| --- | --- | --- | --- |
| 60 | Key entered through the UI, stored on-device — **PASS** | **PARTIAL** | True on a working browser. The save path swallows storage failures and toasts success anyway (M8), so "stored on-device" is asserted, not checked |
| 61 | A bad key is rejected without overwriting a good one — **PASS** | **PARTIAL** | True for a genuinely bad key. A valid key that 429s or hits a 5xx is also rejected, and mis-labelled "not accepted" (M9) |
| 62 | One full tutor turn on the BYOK path — **PASS**, 7.3 s, Chromium fake mic | **VERIFIED** | `docs/evidence/byok-live-2026-09-05.log` |
| 63 | The key never reaches our origin — **PASS**, 17 same-origin / 0 `Authorization`, 5 `api.openai.com` / 5 | **VERIFIED**, and independently stronger | Re-traced in code: the key's only consumer is `api.ts:123-125`; the SW passes cross-origin through (`sw.js:263`); no telemetry exists in the client |
| 64 | No broker WebSocket on the BYOK path — **PASS** | **VERIFIED** | `sessionManager.ts:88-101` returns before the cloud branch; the WebRTC transport is never constructed |
| 65 | Settings screen at 1440 with a stored key — **PASS** | **VERIFIED** | `byok-settings-1440.png` committed |
| 66 | Safari standalone-PWA microphone — **PARTIAL**, not tested | **VERIFIED** (honest) | Self-limited correctly |
| 67 | Native `expo-secure-store` branch — **PARTIAL**, unit-tested, not run on a simulator | **VERIFIED** (honest) | Self-limited correctly |
| 68 | Discoverability — **FAIL (UX)**, only Profile → Tutor preferences | **VERIFIED** | Exhaustive search for `openai-key` across the tree finds exactly one navigation: `apps/client/app/profile.tsx:236`. The BYOK chip at `voice/[bookId].tsx:249-252` only appears once a key already exists, so it cannot be an entry point. Pinned defect 3's scope is exactly right |
| 69 | Tier 5 has **no cost row at all** | **UNSUPPORTED by omission** | The tier documents a path that spends the learner's money with no budget, no session-count limit, and no meter (M10), and where deleting the key does not stop a session already spending it (M7). A tier about someone else's API key needs a cost row |

### 2e. Deploy-kit section

| # | Claim | Verdict | Basis |
| --- | --- | --- | --- |
| 70 | "Walked end to end in a container by lane C" | **VERIFIED** | `docs/evidence/deploy-kit-2026-09-05.log`, `docs/evidence/selfhost-2026-09-05.log` |
| 71 | "README's quick start walked cold: first tutor turn in about one minute" | **VERIFIED** | `docs/evidence/readme-walk-2026-09-05.log` exists and is committed |
| 72 | "The built image is 4.49 GB, dominated by a full non-production `node_modules`" | **PARTIAL** | 4.49 GB confirmed by the log and by `docker images` today. The breakdown is narrated prose that does not reconcile with `docker history` (M13) |
| 73 | Implicit: the kit is safe to follow as documented | **UNSUPPORTED** | The kit's default `docker compose up -d` and its documented Fly quickstart both publish an unauthenticated, key-spending endpoint (H7). No verification row covers this |

**Tally: 56 VERIFIED / 13 PARTIAL / 4 UNSUPPORTED** (73 rows).

The four UNSUPPORTED rows are 50 (daily spend ceiling "verified live"), 54 (account
deletion), 69 (Tier 5 has no cost row) and 73 (the deploy kit is safe to follow as
documented).

---

## 3. Process

Four incidents, plus one the ledger did not flag. Judged plainly.

### 3a. D2 worker: `git checkout -- <its own i18n edits>` in the shared OSS tree

**Rule violation.** `~/.claude/CLAUDE.md` is unambiguous: history-touching git —
`checkout` explicitly named — requires an explicit yes first. The worker self-reported it
(LEDGER 2026-09-05 20:50) and the mitigating facts are real: only its own files, the
orchestrator verified Dia and the nine catalogs intact afterwards. But the rule exists
precisely because "only my own files" is a judgement the worker makes *before* running
the command, in a tree it does not fully own, while another session has 33 modified files
in flight. Being right this time does not make it allowed.

The companion `git checkout <sha>` inside `vendor/sotto` to bump the submodule pin is
**not** a violation — that is the submodule mechanic, operating on a pinned checkout the
lane owned. Correctly noted "for completeness" and correctly not treated as the same
thing.

*Prevention:* the lane brief should name the recovery move for an unwanted edit — `git
stash push -- <path>` is not allowed either, so the answer is to reverse the edit with the
editor, or to hand the file back to the orchestrator. A worker with no permitted way to
undo its own edit will reach for `checkout`. Give it one.

### 3b. D2 worker: `pkill -9 -f chrome`

**Rule violation in substance, not in letter** — `pkill` is not on the named list, but it
is an unscoped, unrecoverable action against processes the lane did not start. Noel's
browser is Dia (Chromium-based); the pattern `chrome` matches Chromium helper processes.
The orchestrator confirmed Dia's pid 26844 survived, so nothing was lost. That is luck,
not design: `-9` gives the target no chance to save, and a Dia window with an unsaved
draft would simply have been gone.

*Prevention:* Playwright cleanup should kill by the pid the lane itself launched, or
`pkill -f` a pattern that includes the lane's own temp profile directory
(`--user-data-dir=<scratch>`). Never a bare process-name match, and never `-9` first.

### 3c. README walker: `screencapture`

**Untidy, not a violation.** `screencapture` grabs whatever is on Noel's display, which
can include unrelated windows — mail, messages, another session's terminal. Nothing in
the standing rules forbids it and no leak resulted (the committed
`docs/evidence/*.png` files are all browser-viewport captures). But a full-screen grab is
a privacy dice-roll every time, and it defeats the reproducibility the evidence folder
exists for: a `screencapture` image cannot be regenerated from the repo.

*Prevention:* use Playwright's `page.screenshot()` (which the rest of the run already
does — that is where every `375-*`/`1440-*` PNG came from), or `screencapture -l
<windowid>` scoped to a single window. Reserve full-screen grabs for cases where nothing
else can produce the artifact, and say so in the log.

### 3d. The pbpaste key mis-paste

**Untidy, and a near miss.** Reading the clipboard to obtain a key means the key's value
passes through the worker's own context, and the clipboard's contents are whatever Noel
copied last — which is exactly how a wrong value, or an unrelated secret, gets pulled in.
Run 4 converged on the right pattern by the 19:20 ledger entry: "Noel now stores keys
only in the keychain; the orchestrator validates each with a read call and stages it on
Fly from the keychain (never printed, never in a file)."

*Prevention:* that pattern, made mandatory rather than emergent. A key reaches a lane only
as a keychain *service name*; the lane pipes `security find-generic-password -w` straight
into the consumer and validates with a status code. `pbpaste` never appears in a lane that
handles credentials.

### 3e. R4-S: `cat ~/.fly/config.yml` printed a live Fly access token into the transcript

**Rule violation — the sharpest one in the run**, and the one the brief for this review
names as its own prohibition. Run 4's standing rule is that keys are never printed; the
worker self-reported it (LEDGER 2026-09-06 20:33) and the containment claim is credible:
it reached no file, no log, no commit, and did not leave the machine.

Two things make it worse than it looks. First, that token is not narrow — a Fly personal
access token can deploy, read every secret name, `ssh console` into the machine holding
the SQLite file with every customer's email, and destroy the app and its volume. Second,
the worker did not need it: the script it was writing deliberately does **not** thread a
token through (`ops/sunset-check.mjs:41-46` — `fly auth token` is called only to prove the
CLI is authenticated, and the value is discarded). The `cat` was curiosity about a file
whose contents the design had already decided not to use.

*Prevention, and this is the one worth writing down:* when a lane needs to know whether a
credential exists or works, it gets a **status code or a boolean, never a value**. `fly
auth whoami` (which the worker also ran, and which was sufficient) answers "am I
authenticated" without printing anything sensitive. The lane brief should list the
credential files that are never to be read — `~/.fly/config.yml`, `~/.config/gh/hosts.yml`,
any `.env`, any keychain dump — the same way this review's brief did. Rotating the token
stays Noel's call; the token is still valid until he does.

### 3f. Not flagged in the ledger, but worth naming

The orchestrator wrote Tier 4 and Tier 5 into `docs/verification.md` **from ledger
entries rather than from re-running the proofs**, and said so — which is the right
disclosure. The cost is visible in §2c: rows 50, 54 and 73 assert live verification that
no evidence log supports, and rows 48, 49 and 55 are narrower than their wording. Every
one of those is a transcription optimism, not a fabrication: the ledger entry behind each
is accurate, and the compression into a single-word status is where the fidelity went.

*Prevention:* a verification row should carry the evidence path that establishes it, in
the row. Where the ledger says "still owed" (row 50) or "PARTIAL" (row 55), the table
should inherit that word rather than round it up. A `PASS` with no evidence path is the
tell.

---

## 4. Judgement on the four pinned defects

| Pinned defect | Scope correct? | Anything else shares the root cause? |
| --- | --- | --- |
| 1. Dead "Sign in with Apple" on web (`account/index.tsx:272-291`, subhead `en.json:242`) | **Yes, and the pin is exact** — the ternary runs `:272-291` and hiding it on non-iOS plus fixing the subhead is the whole fix | The pattern (an iOS-only control rendered on web) does **not** recur: `paywall/index.tsx` guards all three of its Apple/IAP surfaces at `:120`, `:153`, `:252`. `src/cloud/iap.ts` is statically imported but every call site is behind `Platform.OS === 'ios'`. This one screen was the only miss |
| 2. `successUrl`/`cancelUrl` → non-existent routes (`http.ts:216-217`) | **Correct but narrow** | The reason it presents as "Unmatched Route" rather than a 404 is `sotto-cloud/src/app.ts:200-207`, which turns *every* unknown extension-less GET on the API origin into a 200 + app shell (M4). Fixing the two URLs leaves that. Related: `STRIPE_PORTAL_RETURN_URL` and the magic-link redirect both land on `/account`, which is a real route today — and stops being one after a vendor-pin bump (H5) |
| 3. BYOK undiscoverable (only `profile.tsx:234`; extend `voice/[bookId].tsx:284-309`) | **Exactly right** | Confirmed by exhaustive search: one navigation reference in the entire tree. The named panel is the right place, and the voice screen's unavailable state currently offers only "Read alone" (`[bookId].tsx:297-310`) — a learner whose browser can run no tutor is never told BYOK exists. Adjacent, not shared-cause: M7–M10 mean that once BYOK *is* discoverable, more learners hit its cost and save-confirmation gaps |
| 4. SW caches API responses (`sw.js:295-312`), workaround at `http.ts:118-129` | **Correct, and the fix as scoped does close it — if both halves land** | Exempting API paths in `sw.js` while leaving the `_sw=` buster in `http.ts` leaves H6's unbounded cache growth and post-sign-out leak in place, because the buster's purpose is to make every URL unique. Same root cause, unnamed consequences: authenticated `/me` and `/usage` bodies persisted to disk, never pruned by `activate` (`sw.js:149-173`), never cleared by sign-out |

---

## 5. If only five things get fixed

1. **H2 + H1** — the sunset switch cannot currently do its job, and once the Stripe key is
   fixed it can do the wrong job. Both are small diffs in one file.
2. **H3 + H4** — cancel the Stripe subscription inside `deleteUser`, and gate
   `trial_period_days` on something that survives account deletion (a hash of the
   normalised email, or a `trials_granted` table not cascaded off `users`).
3. **H5** — one line in `sotto-cloud/src/app.ts` plus a fixture that comes from a real
   `web:export`, before the fix lane bumps the vendor pin.
4. **H7** — default `SOTTO_HOST` to `127.0.0.1` in `docker-compose.yml`, put
   `SOTTO_BASIC_AUTH` in the Fly quickstart, and add `trustProxy` to the OSS server.
5. **H8** — fill in the governing-law line. It is one sentence, and it is live.
