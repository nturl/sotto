# Sotto — App Store setup (R3-S)

What's needed before Sotto can build for real devices, submit to App Store
Connect, and let a learner subscribe. Nothing below has been done this
session — no Apple Developer account, no Expo account login, no App Store
Connect app record (DECISIONS.md "Environment state": no dev team
configured). This file is the checklist plus the exact commands and their
real, current failure output.

## 1. Accounts and app records needed

1. **Apple Developer Program** membership ($99/yr), enrolled as the org or
   individual that owns `xyz.noelturlington.sotto`.
2. **A Services ID for web Sign in with Apple** (Certificates, Identifiers &
   Profiles → Identifiers → Services IDs): a new identifier, e.g.
   `xyz.noelturlington.sotto.web`, with "Sign in with Apple" enabled,
   configured with:
   - **Primary App ID**: the app's own bundle ID (`xyz.noelturlington.sotto`).
   - **Domains and Subdomains**: the deployed `sotto-cloud` web app's
     origin (e.g. `app.sotto.dev`).
   - **Return URLs**: wherever `src/cloud/appleWeb.ts` redirects back to
     (its own origin's `/account/magic` route).
     Once created, set `EXPO_PUBLIC_APPLE_WEB_CLIENT_ID` (the Services ID)
     and `EXPO_PUBLIC_APPLE_WEB_REDIRECT_URI` in the client's env — see that
     file's doc comment; without these two, the web "Sign in with Apple"
     button throws `AppleWebNotConfiguredError` (by design, not a bug).
3. **App Store Connect app record**: create the app under the same bundle
   ID, category, age rating, etc.
4. **In-App Purchase products** (App Store Connect → the app → Monetization
   → Subscriptions), matching `packages/.../plans()`'s `appleProductId`
   values (`FakeCloudAdapter`'s fixtures in `src/cloud/fake.ts` — the real
   `sotto-cloud` billing service, built by Lanes C1/C2, is the source of
   truth once live):
   - `sotto.standard.monthly` — $9.99/mo, 200 tutor minutes, 5 imports.
   - `sotto.plus.monthly` — $19.99/mo, 600 tutor minutes, 20 imports.
     Create an auto-renewable subscription group (e.g. "Sotto Plans") with
     both tiers in it, and add App Store server notifications pointing at
     `sotto-cloud`'s `POST /webhooks/apple` (CLOUD-API.md).
5. **EAS project**: `eas init` (interactive; needs an Expo account) to get
   a real `projectId`, which `app.config.ts`'s `extra.eas.projectId`
   currently reads from `EAS_PROJECT_ID` (unset).

## 2. Privacy nutrition labels (App Store Connect → App Privacy)

Based on what this build's `CloudAdapter` actually sends when enabled
(nothing when it isn't — CONTRACTS §0/PAYWALL.md §4):

- **Data linked to you**:
  - **Email address** — sign-in identity (`/auth/apple`, `/auth/magic-link`).
  - **Purchase history** — plan/entitlement state (`/billing/*`).
- **Usage data**: none collected for analytics/tracking purposes. Tutor
  minute/import counters exist only as the learner's own entitlement
  counters (`GET /me`), not behavioral analytics.
- **Diagnostics**: none (no crash/performance SDK is in this build —
  CONTRACTS §0 forbids adding one as a default).
- **Tracking**: none. `NSPrivacyTracking: false` in `app.config.ts`'s
  `ios.privacyManifests`, no tracking domains, and no cross-app/cross-site
  identifiers of any kind.
- Voice audio itself is never logged (CONTRACTS §5, apps/server's voice
  orchestrator) and the cloud broker inherits that same rule.

## 3. App Review notes

Reviewers need a way in without a real Apple ID / real payment method:

- **Demo account**: use the magic-link staging admin page (once
  `sotto-cloud` ships one — Lane C1's concern; not built by this lane) to
  mint a session for a fixed reviewer email, OR set
  `EXPO_PUBLIC_CLOUD_STAGING=1` (already wired into the `preview` EAS
  profile's `env` in `eas.json`) so the paywall's "Subscribe (test)" text
  action (`app/paywall/index.tsx`, calls `stubSubscribe`) is visible and a
  reviewer can grant themselves a plan without StoreKit at all.
- **Reviewer flow to describe in the App Store Connect review-notes box**:
  1. Open the app — reading, narration, and the local/browser tutor work
     immediately with no account (PAYWALL.md's "free stays free" framing).
  2. Tap Profile → "Compte" → "Se connecter" (or the Home quiet row's
     "Voir") to reach the paywall.
  3. On a staging/TestFlight build, use "Subscribe (test)" instead of a
     real purchase to unlock the hosted tutor and hosted import.
  4. Everything paid-gated (OpenAI voices, hosted import, iPhone tutor
     access) is now reachable for review.
- Mention explicitly that `/billing/stub/subscribe` is staging-only and
  404s in production (CLOUD-API.md), so this reviewer path does not exist
  in the shipped production build — real IAP is required there.

## 4. Commands

```sh
cd apps/client
npx eas build --platform ios --profile preview
npx eas submit --platform ios
```

### What they print with no Apple/Expo team configured (captured 2026-09-05)

```sh
$ npx eas-cli build --platform ios --profile preview --non-interactive --no-wait
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable if you're using EAS CLI on CI (Learn more: https://docs.expo.dev/accounts/programmatic-access/)
    Error: build command failed.
```

That's the very first gate — an Expo account, before EAS ever gets far
enough to ask about Apple credentials, `ascAppId`, or `appleTeamId`. Once
logged in (`eas login`, interactive, out of scope for this session — no
accounts were created or logged into per the task's constraints), the next
gates in order are:

1. `eas init` to create/link the EAS project (`extra.eas.projectId`).
2. An Apple Developer Program membership and signing credentials (EAS can
   generate/manage a Distribution Certificate + Provisioning Profile itself
   if given Apple ID + app-specific password, or accept ones you already
   have).
3. For `eas submit`, `eas.json`'s `submit.production.ios.ascAppId` needs
   the real App Store Connect numeric app ID (currently the placeholder
   `REPLACE_WITH_APP_STORE_CONNECT_APP_ID`) and `appleTeamId` needs
   `EXPO_APPLE_TEAM_ID` set in the environment.

### Prebuild sanity check (local, no Apple team needed)

```sh
$ npx expo prebuild --platform ios --no-install
✔ Cleared ios code
✔ Created native directory
✔ Updated package.json | no changes
📦 expo-iap: Added CocoaPods CDN source to Podfile
✔ Finished prebuild
```

Succeeded cleanly with the new `app.config.ts` (expo-apple-authentication,
expo-secure-store, expo-iap all linked without error), and generated
`ios/Sotto/PrivacyInfo.xcprivacy` automatically from `ios.privacyManifests`
— confirms that field is the right mechanism (see `app.config.ts`'s doc
comment) with no extra plugin needed. `ios/` is gitignored
(`apps/client/.gitignore`), so this directory is not part of the commit;
regenerate it with the same command any time.

## 5. Bundle identifier

`xyz.noelturlington.sotto` — unchanged throughout (`app.config.ts`, both
`ios.bundleIdentifier` and `android.package`).
