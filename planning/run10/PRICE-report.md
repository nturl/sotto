# run10 — price lane: the free build's Discuss gate quotes the live plan

Branch `feat/live-trial-price`, off `merge/run9` (084dabd).
Worktree `/Users/noelturlington/Claude/sotto-run10/wt/price`. Not pushed.

## The problem

readsotto.app runs on `NullCloud`, so `useCloud().enabled` is false and the
Discuss gate cannot ask what a subscription costs. It said so in words
instead: `voice.trial.cta` = "Try the tutor free for 3 days" and
`voice.trial.note` = "$9.99 a month or $79 a year after the trial. Nothing to
install.", written out by hand in nine catalogs. A price change was a copy
edit in nine files, in seven languages, that someone would forget — and the
free app would go on quoting a price the checkout no longer charges.

The paid service already answers `GET https://app.readsotto.app/billing/plans`
to anyone, no auth, off the same plan table Stripe charges against. The gate
now reads it. A price change is a server change and nothing else.

## What changed, per file

### New: `apps/client/src/cloud/priceFormat.ts`

The paywall's `Intl.NumberFormat` lifted out so two screens stop each owning
their own copy of it. Two exports, one shared implementation:

- `formatUsd(amount, locale)` — the paywall's, byte-identical to before:
  always two decimals, so the card, the Stripe/Apple confirmation line and
  the web-price line agree down to the last digit.
- `formatUsdCompact(amount, locale)` — for prose, where a whole-dollar price
  written "$79.00 a year" reads like a form field. Whole dollars lose the
  cents ("$79", "$99"); anything else keeps them ("$9.99", "$12.50").

Both fall back to the `en` locale if ICU cannot parse the tag, so a bad
locale is never a reason to render no price at all.

### New: `apps/client/src/cloud/trialOffer.ts`

- `TrialOffer` = `{ monthly, yearly, days }`.
- `FALLBACK_TRIAL_OFFER = { monthly: '$9.99', yearly: '$79', days: 3 }` —
  the single hard-coded price left in the client, and today's real price
  rather than a placeholder, because every failure path returns it.
- `pickTrialOffer(response, locale)` — pure. First plan with `priceUsd > 0`,
  the same rule the paywall's card uses (`res.plans.filter(p => p.priceUsd >
  0)`), so the gate and the paywall can never quote different plans.
  `days` from `trialDays`, 3 when it is absent or not a positive number. No
  priced plan, or no response at all, returns the whole fallback. A priced
  plan with `yearlyPriceUsd` of 0 keeps the fallback yearly price rather than
  advertising "$0 a year".
- `loadTrialPlans(fetch?)` — module-level promise cache, so the fetch happens
  once per app session however many callers ask. `credentials: 'omit'` (this
  is public price data read cross-origin; it must not carry the paid client's
  session) and a 4 s `AbortController` timeout. Resolves to `null` on a
  rejection, a non-200, or a body that is not a plans response. It never
  rejects and never logs.
- `resolveTrialOffer(locale, fetch?)` — the two composed, for callers outside
  React (and for the tests).
- `useTrialOffer()` — returns the fallback on the first render of the session
  and the live values once they land. Later mounts in the same session render
  the live values immediately from the cache. The plans are cached raw, not
  the formatted strings, so switching interface language re-formats in place
  without another request.

### `apps/client/app/voice/[bookId].tsx`

`FreeTutorChoices` calls `useTrialOffer()` and passes the values through:
`t('voice.trial.cta', { days })` and
`t('voice.trial.note', { monthly, yearly })`. Nothing else on the screen
changed — same buttons, same order, same styles.

### `apps/client/app/paywall/index.tsx`

`priceLabel` calls `formatUsd(value, getUiCatalog())` where it used to build
an `Intl.NumberFormat` inline. Same output for the same input. The screen
still reads `cloud.plans()` exactly as before; it gained the shared formatter
and nothing else.

### `apps/client/src/cloud/types.ts` — untouched

`PlansResponse` on `merge/run9` already carries `trialDays?: number`
(types.ts:77-81). Nothing to add.

## The nine catalog edits

Each catalog keeps its own sentence; only the numbers moved out, into the
same `{var}` grammar `useT.ts` already interpolates for `onboarding.progress`
and `voice.browser.choiceNote`.

| catalog | `voice.trial.cta` | `voice.trial.note` |
|---|---|---|
| en | Try the tutor free for **{days}** days | **{monthly}** a month or **{yearly}** a year after the trial. Nothing to install. |
| es | Prueba el tutor gratis durante **{days}** días | **{monthly}** al mes o **{yearly}** al año después de la prueba. No hay que instalar nada. |
| fr | Essayez le tuteur gratuitement pendant **{days}** jours | **{monthly}** par mois ou **{yearly}** par an après l'essai. Rien à installer. |
| pt | Experimente o tutor grátis durante **{days}** dias | **{monthly}** por mês ou **{yearly}** por ano depois do teste. Nada para instalar. |
| it | Prova il tutor gratis per **{days}** giorni | **{monthly}** al mese o **{yearly}** all'anno dopo la prova. Niente da installare. |
| ro | Încearcă tutorele gratuit timp de **{days}** zile | **{monthly}** pe lună sau **{yearly}** pe an după proba gratuită. Nu se instalează nimic. |
| ca | Prova el tutor gratis durant **{days}** dies | **{monthly}** al mes o **{yearly}** a l'any després de la prova. No cal instal·lar res. |
| zh-Hans | 免费试用导师 **{days}** 天 | 试用结束后每月 **{monthly}** 或每年 **{yearly}**。无需安装。 |
| zh-Hant | 免費試用導師 **{days}** 天 | 試用結束後每月 **{monthly}** 或每年 **{yearly}**。無需安裝。 |

Every catalog parses; all nine were edited by exact-match replacement, one
assertion per string, so no other key moved.

## Proof

### Unit tests

23 new tests, all green:

- `src/cloud/priceFormat.test.ts` (5) — the paywall's formatter still prints
  two decimals (`79` -> `$79.00`), the prose formatter drops whole-dollar
  cents (`79` -> `$79`, `12.5` -> `$12.50`), both follow the interface locale
  (`fr` -> `9,99 $US`), and an unparseable locale falls back to `en`.
- `src/cloud/trialOffer.test.ts` (18) —
  `pickTrialOffer`: skips the free plan and picks the priced one; formats
  9.99 as `$9.99` and 79 as `$79`; 12.5/99 as `$12.50`/`$99`; locale-formats;
  missing `trialDays` -> 3; `trialDays` of 0 or negative -> 3; empty plans,
  free-only plans and a null response -> the whole fallback; a priced plan
  with no annual price keeps the fallback yearly; `FALLBACK_TRIAL_OFFER` is
  exactly the copy the catalogs shipped with.
  `resolveTrialOffer`: reads
  `https://app.readsotto.app/billing/plans` with `credentials: 'omit'`;
  falls back on a rejection, on a 500, and on a body that is not a plans
  response; aborts after 4 s (fake timers, a fetch that only settles when its
  signal aborts) and falls back; fetches once however many callers ask.
  `useTrialOffer`: the fallback on first render then the live values; the
  fallback stays when the request fails; a later mount in the same session
  gets the live values straight away. Every one of these also asserts the
  console stayed silent (`log`/`info`/`warn`/`error`/`debug` all spied).

`pnpm --filter @sotto/client test`: **482 passed (50 files)**, up from the
459 on `merge/run9`.

`pnpm typecheck` (all five packages): clean.

`eslint` on the six touched files: **0 errors**, 1 warning —
`react-hooks/exhaustive-deps` on `app/paywall/index.tsx:93`, the existing
`cloud.plans()` effect, unchanged by this lane and present before it.
`prettier --check` on all touched files: clean.

### Playwright

Script: `/Users/noelturlington/Claude/sotto-run10/proof/price/proof.mjs`,
run from `apps/client` against `pnpm --filter @sotto/server dev` (:8790,
started by this lane — `curl localhost:8790/health` failed first) and
`CI=1 pnpm --filter @sotto/client dev:web -- --port 8083`. Both servers were
stopped afterwards; ports 8790 and 8083 are free again.

**17/17 checks passed.**

Profile seeded straight into IndexedDB `keyval-store` / `keyval` /
`sotto.preferences` (the pattern from `planning/run10/B-report.md`):
interfaceLocale en, explanationLocale en, learningLocale fr-FR, level A1,
onboarded true. Two shims borrowed from lane B's proof and named in the
script: `GET /health` is aborted (the dev box has a healthy local server,
which readsotto.app never does — otherwise the gate resolves to `ready/local`
and never renders) and `navigator.gpu` is defined if absent (headless
Chromium has none, which would show the no-WebGPU line instead of the choice
being photographed).

`page.route('**/billing/plans')`, at 375x812, `/voice/fr-cendrillon?mode=discuss`:

**Run 1 — fulfilled** with `{ plans: [{ id: 'standard', …, priceUsd: 12.5,
yearlyPriceUsd: 99, … }], addons: [], billing: 'stripe', trialDays: 7 }`
(plus `Access-Control-Allow-Origin: *`, standing in for the service's
`CORS_ORIGINS`). Screenshot `trial-gate-live-375.png`. The screen reads
**"Try the tutor free for 7 days"** and **"$12.50 a month or $99 a year after
the trial. Nothing to install."** No `$9.99`, no "free for 3 days", no
unresolved `{days}` / `{monthly}` / `{yearly}` anywhere in the page. The gate
made exactly one `/billing/plans` request; the only failed request was the
shimmed `/health`.

**Run 2 — aborted.** Screenshot `trial-gate-fallback-375.png`. The screen
reads **"Try the tutor free for 3 days"** and **"$9.99 a month or $79 a year
after the trial. Nothing to install."** No `$12.50` leaked in, no unresolved
placeholder, and `/billing/plans` really did fail (`requestfailed` on
`https://app.readsotto.app/billing/plans`).

Both screenshots were read back as images, not just asserted on.

On console output: the assertion is that the app itself logged nothing, in
both runs, and that failing the price fetch added no app-level output over
run 1 (0 vs 0). Three lines are filtered as the browser's own, and named as
such in the script: react-native-web's dev-mode `useNativeDriver` and
`props.pointerEvents` warnings, and Chromium's `Failed to load resource:
net::ERR_FAILED`, which it prints for any aborted request (both runs abort
`/health`; run 2 also aborts `/billing/plans`). That line is the browser
reporting a dead socket and no client code can suppress it; what the spec
asks for — that the client never logs an error of its own — holds.

## The landing page was not touched

`apps/client/web/landing/index.html` is static HTML with no i18n runtime and
no client bundle, and it keeps its copy: "Try the tutor free for 3 days"
(l.834), "$9.99 a month" (l.839, l.980) and "$9.99 a month or $79 a year,
free for the first 3 days" (l.1005). Four places, in English only, that still
have to be edited by hand when the price changes. Out of scope here; worth a
card of its own if the page ever gets a build step.

## Uncertain, and decisions worth a second opinion

1. **`formatUsd` vs `formatUsdCompact`.** The spec asked for currency
   formatting "identical to the paywall's `priceLabel`" and, in the same
   breath, for 79 to render as "$79". Those cannot both hold: the paywall's
   formatter gives "$79.00", and the required proof string is "$99 a year",
   not "$99.00 a year". Rather than change what the paywall prints (the spec
   also says the paywall only gains the shared formatter), the shared module
   exposes both shapes over one implementation. The paywall's rendering is
   unchanged; prose gets prose. Not escalated, because sharing the formatter
   did not require changing paywall behaviour — but this is the one place
   where the letter of the spec was traded for its intent, and it is the
   thing to look at first if a reviewer disagrees.

2. **Currency markers in the non-English catalogs.** The old hand-written
   strings said "9,99 $" (fr/es/pt/it/ro/ca) and "$9.99" (zh). ICU for those
   locales says "9,99 $US", "9,99 US$", "US$9.99". So the rendered price in
   seven catalogs now carries a US marker it did not before. That is more
   correct — the charge is in dollars and a French reader should not read
   "9,99 $" as euros-in-disguise — but it is a visible copy change nobody
   asked for. Reversing it would mean formatting every locale as `en`, which
   would be worse.

3. **"1 days".** The catalogs interpolate `{days}` plainly, as specified. If
   the service ever sets `trialDays` to 1, English reads "Try the tutor free
   for 1 days". `useT.ts` supports an ICU plural form
   (`{days, plural, one {# day} other {# days}}`) that would fix it in the
   catalogs alone, with no code change. Left as specified; flagged here.

4. **CORS.** The proof stubbed the response, so it did not exercise the real
   cross-origin request. If the `CORS_ORIGINS` deploy slips, the browser
   blocks the fetch, `loadTrialPlans` resolves to null and the gate shows the
   fallback — which is today's copy exactly. The failure mode is "no change",
   not a broken screen. Worth one live check against readsotto.app once the
   service ships.

5. **No React renderer in this repo.** There is no react-test-renderer or
   testing-library, and adding one was out of scope, so `trialOffer.test.ts`
   mocks `react` with a ~40-line hook runtime (state slots, effect queue,
   memo cache) to exercise `useTrialOffer` itself rather than only the plain
   functions under it. It is confined to that one file and documented at the
   top of it. If a later lane brings in a real renderer, that harness should
   go.

## Commits

- `6288464` feat(client): the free build's trial gate quotes the live plan
- `0b82d04` i18n: voice.trial takes the length and prices as placeholders
- this report
