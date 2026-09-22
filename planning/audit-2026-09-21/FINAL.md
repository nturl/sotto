# Audit and fix run, 2026-09-21

Noel asked for two things: clean up Sotto's search results (Google showed four
"Sotto" links: www.readsotto.app, app.readsotto.app with the shell's noscript
text, GitHub, LinkedIn) and dig through the app for improvements. This note
is the handoff. Everything below shipped from a worktree at origin/main; the
`~/Claude/sotto` checkout was never touched.

## 1. What shipped

### Search engines (free origin `68e463e`, `aad1f31`; paid origin sotto-cloud `42caa33`, Fly v38)

- `vercel.json` redirects www.readsotto.app and sotto-steel.vercel.app to the
  apex with a 308, path and query preserved. `/:path*` does not match the bare
  root on Vercel; `/:path(.*)` does.
- The landing carries `rel=canonical`, `og:locale`, `twitter:description` and
  WebApplication JSON-LD (`web/landing/seo.test.ts`).
- `scripts/seo.mjs` gives `build-web.mjs` a `<meta name="robots" content="noindex">`
  on app.html (every client-side route, both origins), a real `dist/robots.txt`
  (free build: Allow / plus Disallow /content/ /_expo/ /tutor/ and the sitemap
  line; paid build, `EXPO_PUBLIC_CLOUD_URL` set: Disallow /) and a one-URL
  `dist/sitemap.xml`. Neither file is precached.
- sotto-cloud answers every response with `x-robots-tag: noindex, nofollow`
  and serves its own `/robots.txt` (Disallow /) ahead of the export.
- GitHub repo homepage set to readsotto.app, topics added.
- Left for Noel: Search Console. Add readsotto.app if it is not a property,
  submit `/sitemap.xml`, and use Removals for `app.readsotto.app/*` and
  `www.readsotto.app/*`. Google's re-crawl takes days either way.

### App fixes (free origin `73516d5`, paid origin pin `73516d5` + sotto-cloud `dfdbf20`, `5bbde69`)

A ten-lens audit (live UX at phone and desktop widths, client code, a11y,
perf, i18n, PWA/offline, the carried list, content packs, repo health) found
73 issues; each was re-verified by an independent refuter, 61 survived.
Twenty-nine of those shipped, in six reviewed lanes:

- Reader: chapter navigation now exists for books without narration
  (ro-RO, ca-ES were stuck on chapter 1); a bad `?chapter=` no longer bricks a
  book; the -10/+10/speed controls are 44px tall with button roles and
  translated names (`reader.transport.*`); `/reader/<unknown>` says Book not
  found with a way out; the passage and the lookup headword carry `lang`.
- Service worker: HTML answered under a `.js/.json/.mp3` URL (the catch-all
  rewrite's 200) is never cached; the content cache is named by a digest of
  the packs (`contentVersion` in `sw-manifest.json`), so a code deploy no
  longer wipes downloaded books; the two vitest files moved out of `public/`;
  og.png, index.html and `/landing/` are no longer precached; the 32 unused
  TTFs are unlinked from dist (6.5 MB per deploy). `e2e/hosted.mjs` checks the
  offline shell by `/app.html`.
- i18n: `useT` selects plural arms by CLDR category (ro and zh no longer
  render raw ICU in the vocabulary count); `voice.trial.cta` is a real plural;
  the Feedback screen, four Settings strings, the Library empty banner and the
  paywall disclosure are translated in all nine catalogs; `<html lang>` follows
  the UI catalog; 34 dead keys removed.
- Navigation and errors: Back and Close have a destination on a cold load
  (`src/ui/goBackOr.ts`); sign-out failure and a failed import start show
  their existing error UI; the import progress screen has a way out;
  `mic_unavailable` no longer offers a personal OpenAI key; option rows are
  radios with `aria-checked`; the Settings row in the phone bar is a link.
  `apps/server` and `packages/content` now have real `test` scripts; eslint's
  e2e block knows the browser globals.
- Landing: focus ring restored on Sign in and its hover label passes AA; the
  scene strip is a valid tablist with arrow keys; the two screenshots are
  files under `public/landing/` (page is 100 KB instead of 307 KB).
- Paid origin: a spent or expired magic link opened in a browser gets a page
  with the message and a "Request a new sign-in link" link instead of JSON.

Verification: `pnpm check` green (1280 tests), `e2e/hosted.mjs` and
`e2e/ux-regression.mjs` PASS against a local export; on production
`ux-regression` PASS and `hosted` passes every step, failing only on the
console noise described in §2.1.

## 2. Verified and still open

Each item below survived the refuter. The lane brief with evidence and the
corrected fix lives in the session scratch, not the repo; the audit's
`apps/client/e2e/audit-*.mjs` probes were not committed.

### 2.1 Needs Noel's call

- Stranger at the tutor gate sees "Sign in" instead of the trial the landing
  sold (`app/voice/[bookId].tsx:136`). Two verifiers disagreed: one confirmed
  the fall-through is safe, the other found the sign-in wall deliberate and
  test-locked. Funnel decision.
- The free build probes `GET app.readsotto.app/me` on the voice screen
  (`src/cloud/paidAccess.ts`); the 401 for strangers is browser console noise
  and fails `hosted.mjs`'s console check on production only. Options: a
  no-auth probe endpoint on sotto-cloud, or accept the noise.
- Light palette `quiet` (#B5AB9F, 1.93:1) and `ink3` fail AA as text;
  darkening `quiet` flattens the speech-fill device. Design token change,
  Cleo's.
- Saved words stay on the free origin when a learner upgrades; the gate has
  no warning or pointer to Export (`app/voice/[bookId].tsx`, all five
  `openPaidClient` sites).
- zh-Hant sentence translations in two books are byte-identical Simplified
  text (`packs/fr-FR/.../fr-verne-tour-du-monde/chapters/01.json:20`,
  `es-419/.../es-clarin-adios-cordera`); needs a validator rule plus a
  regeneration from the source bundles.

### 2.2 Effort M, safe to schedule

- Reader passage is 322 tab stops on web (`SelectableSpeechText.tsx:138-148`,
  web branch only); roving tabindex plus a skip link, keeping the native
  per-word role.
- Word-lookup sheet is a docked panel on phone, so no dialog role; announce
  the headword with a live region instead.
- No headings or landmarks in app screens (`Text.tsx` role=display is the
  screen title; do not map `role="heading"` wholesale, it is also the tile
  label).
- Service worker never calls `registration.update()`; an installed app can
  sit on a stale build (keep `skipWaiting`, it is what makes first-visit
  offline work).
- Landing fonts: the four TTFs ship twice (`/fonts/` and the hashed export)
  and there is no woff2.
- 20 more hard-coded English strings across eight screens (list in the i18n
  lane brief); an ESLint rule cannot catch eight of them.
- Onboarding level C1 is below the fold at phone height with no scroll cue;
  the affordance belongs in `Shell.tsx`'s footer, not the screen.
- `lang` on OptionRow's native names needs `lang?: string` on `TextProps`.

### 2.3 Small, deliberately not done

- Cover flash: the proposed ground colour puts dark text on dark paper for 20
  of 40 books; needs a ground that matches each cover's ink.
- Sentence-final punctuation wraps alone; a word joiner does not fix it (the
  break comes from the `<button>` boundary).
- `paywall.notAvailable` copy on the free origin's /account, /paywall,
  /usage; the key is reused for a server error on the paid origin.
- `Cache-Control: immutable` for `/_expo/static` is unsafe while the
  catch-all rewrite answers misses with 200 HTML.
- Landing registering the service worker from `<head>` would start a 4 MB
  precache for every bouncer.
- Content: five Gutenberg "Source" links are search pages; every
  `attribution.json` calls the cover generated art; two zh-TW tokens have no
  timing; English titles missing for four books in the source bundles.
- Validator only checks key presence, not ICU shape or script.

## 3. How this run worked

Audit: Workflow of ten Opus finders, one refuter per finding and a second for
high severity, then a completeness critic (100 agents). Fixes: six lanes,
each in its own worktree at origin/main, Opus implementer test-first, Opus
reviewer re-running every check, one fix round; integrated by cherry-pick
into a fresh worktree, `pnpm check`, local export smoke, push, deploy. Lane A
and lane C both appended catalog keys, which conflicts on cherry-pick;
resolved by a union of keys. Deploy quirks are in `~/Claude/CLAUDE.md`.
