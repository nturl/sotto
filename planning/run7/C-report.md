# Lane C — account creation, sign-in, onboarding

Opus, separate process. Card: `planning/run7/cards/C-account.md`. All decision defaults in
force (D-1 accounts on the paid origin, D-2 no Google, D-5 no Fly deploy).

## Commits

**`~/Claude/sotto`** (pushed to `origin/main`)

| SHA | What |
|---|---|
| `4270689` | `run7(C): a real sign-in screen, a four-step onboarding, and a root that knows` |
| `57dc10a` | `run7(C): give the account email its own card so a real address fits at 375` |

**`~/Claude/sotto-cloud`** (pushed to `origin/main`)

| SHA | What |
|---|---|
| `91f7224` | `run7(C): carry returnTo through the sign-in link, advertise real sign-in methods` |
| `52802e1` | `run7(C): serve the pack listing as JSON, so the paid origin can list books` |
| `49eb419` | `run7(C): bump vendor/sotto to 57dc10a` |

Vendor pin: `28f1e3b` → `57dc10a`. `pnpm install --lockfile-only` after the bump reported
"Already up to date" — the bump changed no dependency, so `pnpm-lock.yaml` is untouched.
VERIFIED (ran it, saw the output, `git status` clean afterwards).

### Files

sotto-cloud: `src/auth/returnTo.ts` (new), `src/auth/returnTo.test.ts` (new),
`src/auth/routes.ts`, `src/auth/routes.test.ts`, `src/app.ts`, `src/static.test.ts`,
`docs/google-sign-in.md` (new), `docs/accounts-and-guest-data.md` (new), `README.md`,
`vendor/sotto`.

client: `app/index.tsx`, `app/start.tsx`, `app/account/index.tsx`, `app/account/magic.tsx`,
`app/onboarding/index.tsx`, `app/onboarding/done.tsx` (new), `app/onboarding/languages.tsx`,
`app/onboarding/level.tsx`, `src/cloud/{returnTo,destination}.ts` + tests (new),
`src/cloud/{types,http,fake,null}.ts`, `src/cloud/{http,fake}.test.ts`,
`src/onboarding/{wizard,levelSamples,recommend,useVoiceSample}.ts` + tests (new),
all nine `src/i18n/*.json`.

Nothing outside the card's ownership was edited. Other lanes had files staged in the shared
index when I committed (`app/profile.tsx`, `app/settings/**`, `src/voice/**`, `docs/byok.md`);
I committed with `git commit -- <explicit paths>` so their staged entries survived untouched
— VERIFIED by `git status --porcelain` before and after.

---

## A real production bug, found and fixed

**`GET /content/packs` on `app.readsotto.app` returns the app shell, not JSON — so the paid
origin cannot list a single book.** VERIFIED live before the fix:

```
https://app.readsotto.app/content/packs → 200 text/html   (the app shell)
https://readsotto.app/content/packs     → 200 application/json
```

It is an extension-less GET like any client route, so sotto-cloud's SPA fallback answered it
with `app.html`. `apps/client/src/state/contentApi.ts` fetches this to list the packs;
`loadPacks` got HTML, failed to parse and swallowed the error. Consequence on the paid
origin: empty library, empty Home rails, and — once this run added it — an onboarding
recommendation with nothing to recommend. `apps/client/vercel.json` has always carried this
rewrite for the free origin and `scripts/serve-static.mjs` mirrors it locally; sotto-cloud
never had it.

Found by this lane's own Playwright walk (the recommendation screen rendered "No books at
that level yet"), then confirmed against the live origin with `curl` before writing a line of
fix. Failing test first (`src/static.test.ts`), then the rewrite in `src/app.ts`'s static
block. **This fix is in the tree and green, but it does not reach learners until Noel
deploys** — see "For Noel" below.

---

## What changed, against the card's directives

**1. Failing tests first.** Every behaviour below has a test that failed before the change:
`src/auth/returnTo.test.ts` (new module), the `returnTo on the sign-in link` and
`GET /auth/config` blocks in `src/auth/routes.test.ts`, the pack-listing test in
`src/static.test.ts`, and the four new client modules' tests. VERIFIED — I ran them red
(6 server failures, 4 client files failing to resolve) before implementing.

**2. Create vs return framing.** `/account?intent=start` renders "Create your free account":
"No card, no key, nothing to set up. Just an email address.", three benefit lines, an email
field and a primary CTA. `/account` signed out renders "Sign in" / "We'll email you a link.
There's no password to remember." with a secondary CTA. Each carries a switch to the other.
States: idle → sending ("Sending…") → sent ("Check your email", resend on a 30s countdown,
"Use a different address") → error. Cancel goes to a validated `returnTo`, else back, else
onboarding/home. The oracle protection is untouched: the server still answers `200 {}`
whether or not the address is registered.

Errors are specific per failure, replacing the old single "Couldn't send the link. Try
again." for everything: `rate_limited`, `invalid_request`, `no_cloud`, and a network failure
each get their own sentence. VERIFIED in the walk for the malformed-address and
unreachable-server cases.

**3. `returnTo`.** `POST /auth/magic-link` takes an optional `returnTo`; the verify redirect
honours it. It is a path on `APP_BASE_URL`'s origin and nothing else — `safeReturnPath`
refuses schemes, hosts, `//host`, `/\host`, their percent-encoded twins, and anything with
whitespace or a control character. It runs **twice**: at mint time (a bad value is a `400`,
not a silent drop) and again at verify time, because the link comes back out of an inbox
where the query string is editable. Without the second check this would be an open redirect
that arrives pre-authenticated. Native gets `sotto://account?session=…&returnTo=…`.

Defaults: the client always sends `/account/magic` when it has nothing better, and that
screen decides — un-onboarded → `/onboarding`, onboarded → `/(tabs)/home`. The server cannot
make that call: "onboarded" is a local preference it has never seen. With no `returnTo` at
all the server still redirects to `/account`, so an older client is unaffected.

**4. Apple — NOT registered. Decision and reasoning.**

I did not register `registerAppleSignIn`, and I judge that correct:

- The comment at `routes.ts:263-278` is about an *unadvertised* route being a second
  unattended way into an account. Registering it would not address that concern; it would
  realise it.
- Registering it usefully needs an `APPLE_SERVICES_ID` and a Return URL in Apple's developer
  console for the web flow — a console action, which the card says to escalate on, not a code
  change.
- The real defect was the *mismatch*, not the absence: the client drew an Apple button on iOS
  that called a route which 404s in production. That is now impossible to reintroduce.

Instead: `GET /auth/config` (public) reports `{ magicLink, apple, google }`, and the flag it
reports **is** the flag that registers the route — `registerAuthRoutes(app, ctx, { apple:
true })` does both, so they cannot drift. A test proves that with `apple: true` the endpoint
says so *and* `POST /auth/apple` answers 200; with the shipped configuration it says `false`
*and* the route 404s. The client renders a provider button only for what the endpoint
advertises, and an unreachable or older server answers magic-link-only — an unknown answer
never becomes a button. Shipped today: `{"magicLink":true,"apple":false,"google":false}`,
VERIFIED live against the local server.

`docs/google-sign-in.md` is the Google follow-up: exactly what only Noel can do (the OAuth
client), the server work (PKCE authorisation-code flow, a `google.ts` modelled on `apple.ts`,
and the `email_verified` check that is the whole account-takeover defence when linking to an
existing magic-link account), the client work, and the tests. No fake Google button anywhere.

**5. Onboarding — four steps.** `/onboarding` is now one screen with four in-screen steps in
the card's order: interface language, language to learn, level, explanation language. Each is
pre-filled with the old fast path's proposal, so it is confirmation rather than a blank form.
Progress reads "Step N of 4" and steps 2-4 have a Back.

The level step carries the "not sure?" helper: three sample sentences per level, for all six
levels, in the language being learnt — written for all nine content languages (en, fr, es,
pt, it, ro, ca, zh-CN, zh-TW), with regional variants sharing a set and the two Chinese
scripts kept apart. Tapping a group sets that level. A language with no samples hides the
helper rather than showing English ones.

No tutor-mode step. `/onboarding/done` recommends one book (exact level first, then nearest
below, then nearest above, shortest first within a level), links to the library, and says
"The voice tutor is optional. You can set it up later, in Settings." `/onboarding/languages`
and `/onboarding/level` stay as redirects so old links do not 404.

"Changing the learning language never changes the interface language" is now a test
(`src/onboarding/wizard.test.ts`), along with the reverse and the level case.

**6. Account area.** Email (in its own card — see below), plan line ("Free" / the plan
name), renewal only when there is one, and **"See plans" for a free account instead of
"Manage subscription"**, because a free account has nothing in a Stripe portal. Then a "Your
reading" group: "Where it's stored — On this device", with "Your progress and saved words
stay in this browser. Syncing them across devices isn't a feature yet." Sign out and the
existing two-step delete flow, unchanged.

**7. Guest data.** VERIFIED end to end in the walk: a guest sets the app up through
`/start`, reads a book, then signs in through a real magic link — every `sotto.*` key in
IndexedDB is byte-identical afterwards (`sotto.preferences`, `sotto.progress`; the walk
compares the serialised values, not just the key list). Signing in adds a cookie and a `/me`
response and touches the store not at all. Cross-origin (free → paid) cannot carry anything —
IndexedDB is origin-scoped by the browser — and that is written up in
`sotto-cloud/docs/accounts-and-guest-data.md` with the two real fixes (one origin, or actual
server-side sync) named as parked features rather than patches.

**8. Static routing.** `/account`, `/account/magic`, `/onboarding`, `/onboarding/done`,
`/settings`, `/settings/openai-key`, `/voice/<id>`, `/reader/<id>`, `/library`, `/usage` all
serve the app shell on direct navigation and refresh; a missing asset with an extension still
404s as JSON. **No code change was needed for this half** — the existing SPA fallback already
handled it; the test now pins it. VERIFIED live with `curl` against the local server (all
200, `/_expo/static/missing.js` → 404) and by reload-in-place in the walk. The card named
`src/static.ts`; that file does not exist — the static block lives in `src/app.ts`.

**9. Secrets.** No `.env` was read. The `SESSION_SECRET` for the local run was generated
inline and never printed. Magic-link URLs came only from the server's own staging log, never
a mailbox, and no link, token or cookie appears in this report, in any committed file, or in
any screenshot. One test asserts the destination stays out of the ordinary request log (the
half that runs in production); the staging log deliberately carries the whole link, which is
the documented staging affordance and the only reason the walk can run at all.

---

## Proof

### Tests

| Suite | Result |
|---|---|
| sotto-cloud `pnpm test` | **375 passed**, 23 files |
| sotto-cloud isolated `pnpm check` | **exit 0** — `--shared` clone of `49eb419`, `git submodule update --init` (pin restored at `57dc10a`), fresh `pnpm install --frozen-lockfile`; prettier clean, eslint clean, tsc clean, 375/375 |
| client `pnpm --filter @sotto/client test` | **267 passed**, 34 files |
| `pnpm -r typecheck` | clean, all packages |
| `pnpm exec prettier --check <owned files>` | clean |
| `pnpm exec eslint <owned files>` | 0 errors, 0 warnings |
| i18n catalog parity | all nine at 433 keys; **0 English fallbacks** among the 35 new keys |

The run 4/5 trap applies and was handled: `git archive` does not carry a submodule, so the
isolated check used `git clone --shared` plus `git submodule update --init`.

### Playwright walk — **55 PASS, 0 FAIL**

Script: `~/Claude/sotto-run7-recon/C/walk.mjs`. Log: `~/Claude/sotto-run7-recon/C/walk.log`.
Ran against a **local sotto-cloud** (`http://localhost:8093`, stub billing, SQLite on disk in
the scratchpad, `SOTTO_CLOUD_STATIC_DIR` pointing at an export built from vendor pin
`57dc10a` by `scripts/build-client.sh`). Port 8080 was already taken by something else on
this machine, so the export and the server were both built for 8093. No deploy.

What it proves, at 375 and 1440:

- `/` on the paid origin sends a signed-out stranger to `/account?intent=start`, not into
  onboarding. `/start` ("Try a sample") still goes straight to onboarding on both origins.
- Start free → sent state (resend countdown + change address visible) → follow the link
  taken from the server log → `/onboarding` → four steps, titles in the right order
  ("App language / I'm learning / Your level / Explain in"), the level helper opening and
  selecting a level from a French sample → `/onboarding/done` naming one book
  ("Little Red Riding Hood") and the tutor-is-optional line → `/library`.
- Returning learner: `/account` shows the "Sign in" framing with "New here? Start free", and
  the link lands on `/home` rather than on `/account`.
- Cancel returns to a same-origin `returnTo`; an off-origin `returnTo` is ignored rather than
  followed (the browser never leaves the origin).
- A malformed address and an unreachable server each get their own message.
- Refresh in place on `/account` and `/onboarding` both re-render the app; `/onboarding`
  after setup redirects to `/home` instead of redoing setup.
- Guest → account: the `sotto.*` store is identical before and after signing in.

### Screenshots — `~/Claude/sotto-run7-recon/C/`

375 and 1440 each: `root-create`, `account-create`, `account-sent`, `onboarding-1`,
`onboarding-level-help`, `onboarding-4`, `onboarding-done`, `library`, `account-signed-in`.
Plus `1440-account-signin`, `1440-returning-home`, `375-account-error-invalid`,
`375-account-error-offline`. 22 files.

I read them rather than only taking them, which caught one real defect: at 375 a full-length
address overflowed the account screen's email row, because `Row` puts label and value on one
line and does not truncate. Fixed in `57dc10a` by giving the email its own card (label above,
address below, wrapping) and re-verified in the re-taken shot. The rest of the group is
unchanged.

---

## NOT verified, and why

- **Nothing is deployed.** Everything above ran against a local sotto-cloud and a locally
  built export. The live `app.readsotto.app` still has the old client and the `/content/packs`
  bug. D-5.
- **Native / iOS.** Nothing was run on a device or simulator. The native path (`sotto://`
  deep link with `returnTo`, `completeNativeSession`) is covered by the server test and by
  reading the client code — INFERRED, not exercised.
- **Apple sign-in end to end** was not run against Apple, by design: it is not registered.
  The handler's own tests (registered explicitly by the suite) are unchanged and green.
- **The level samples' quality.** I wrote 162 sentences across nine languages. They are
  grammatical and, I believe, correctly graded, but they have had no native review; Romanian,
  Catalan and the two Chinese sets are the ones I would most want a second pair of eyes on.
  They are content, not code — easy to correct in `src/onboarding/levelSamples.ts`.
- **`DELETE /account` with a confirmation token.** `POST /account/delete/request` mails a
  `/account?confirm=<token>` link, but `HttpCloudAdapter.deleteAccount()` sends no
  `confirmToken` and the account screen ignores the `confirm` param — so only the
  fresh-auth (<10 min) path is reachable from the UI. **Pre-existing, not introduced by this
  lane**, and the card said "delete account (existing flow)", so I left it. Worth a card next
  run.
- **The recommendation's title language.** It shows `localizedTitles[interfaceLocale]`, so an
  English interface reading French shows "Little Red Riding Hood". That matches how titles
  are shown elsewhere; flagging it in case Noel wants the original title instead.

## Other lanes' state I touched nothing of

- `apps/client/e2e/.cache/provence-exchange.mjs` and `apps/client/e2e/audible-probe.mjs`
  hold the repo's only two `eslint` **errors** (`'window' is not defined`). They are lane
  F1's files; `pnpm lint` at the root is red because of them, not because of anything here.
- `src/ui/Rail.test.ts` and `src/ui/TabBar.test.ts` were failing to parse when I started
  (lane B mid-edit); they were green by the time I finished. Not mine either way.
- `pnpm check` at the root was not run — the card says it currently fails on an untracked
  docs file; I ran the four pieces instead.

---

## For Noel

**1. Deploy sotto-cloud.** Nothing in this lane reaches a learner until you do. From
`~/Claude/sotto-cloud` at `49eb419`:

```
fly deploy --app sotto-cloud
```

After it lands, check, in this order:

- `curl -s https://app.readsotto.app/content/packs | head -c 40` → must start with `[{` and
  be `application/json`. If it still returns `<!DOCTYPE html>`, the deploy did not take, and
  the paid app still cannot list books.
- `curl -s https://app.readsotto.app/auth/config` → `{"magicLink":true,"apple":false,"google":false}`.
- `https://app.readsotto.app/` in a signed-out browser → should land on
  `/account?intent=start` ("Create your free account"), not on `/onboarding`.
- Request a link with your own address, click it → onboarding if you have never set that
  browser up, home if you have.
- `https://app.readsotto.app/library` → books, which is the visible half of the packs fix.

The Dockerfile builds the client from the vendor pin, so the deploy carries the client
changes with it; no separate `pnpm deploy:web` is needed for the paid origin.

**2. Two things need your console, and blocked nothing else.**

- **Google sign-in** needs a Google Cloud OAuth client (client ID + secret as Fly secrets).
  Everything else is written up in `sotto-cloud/docs/google-sign-in.md`, about a day and a
  half of work once the credentials exist. This was the only part of your "email and then
  like Google" note that could not ship.
- **Sign in with Apple** needs an `APPLE_SERVICES_ID` and a registered Return URL in Apple's
  developer console for the web flow. Until then the button correctly does not appear
  anywhere. Turning it on afterwards is one flag: `registerAuthRoutes(app, ctx, { apple: true })`.

**3. One thing to decide.** The free origin still has no sign-in screen of its own, and a
learner who reads there and later signs in on the paid origin starts fresh — origin
isolation, not a bug we can patch. The only two real fixes are one origin, or server-side
sync of progress and vocabulary. Both are parked (CONFIRM 10). The landing page (lane A) and
the account screen both now say so out loud rather than implying otherwise.
