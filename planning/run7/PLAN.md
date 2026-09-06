# Run 7 plan (Fable touch #1, 2026-09-06 ~18:15)

Spec: `planning/KICKOFF-7-FABLE.md`. Recon: `~/Claude/sotto-run7-recon/scout-1-navigation.md`,
`scout-T-tutor.md`, `scout-L-landing-account.md` (all file:line cited; VERIFIED beats INFERRED).
Decision slots D-1..D-7: all defaults taken (ledger, Run 7, first bullet).

## Ground truth that reorders the kickoff

1. A Vitest file inside `app/reader/` crashed the dev server on every route. Fixed first
   (`01e1139`). Dev servers now run from this session: content server :8790, Metro :8081.
   Lanes use them; nobody starts a second Metro.
2. Free signed-in users get **zero** hosted tutor minutes by design (`sotto-cloud/src/plans.ts:87-100`,
   broker returns `402 plan_required`). Free = read, listen, lookups, vocabulary, browser-model
   tutor, own-provider mode. This is D-3's default, now confirmed by code.
3. Sign in with Apple is implemented but **never registered** in production (`sotto-cloud/src/auth/routes.ts:263-278`);
   the client still shows the Apple button on iOS. Email magic link is the only live sign-in.
4. The paid origin shows onboarding **before** any sign-in (`app/index.tsx` redirects on a local
   `onboarded` flag; both origins ship one bundle). That is why "Sign in" felt like it jumped into
   the app: the landing links to the paid origin's root, not to `/account`.
5. Guest data is IndexedDB, same-origin only. There is no free-origin → paid-origin handoff and
   cannot be one without unifying origins (parked, CONFIRM 10). "Try a sample" must say so.
6. Settings (`/profile`) is reachable only from the Home gear. Sidebar and TabBar hard-code three
   rows. No `+not-found.tsx`. Library and Home render nothing for loading, error, and empty alike
   (`Rail.tsx:78`, no `packsStatus` read).
7. Tutor: own-provider speech synthesis swallows transient failures and still prints the caption
   (`packages/voice/src/openai-direct/provider.ts:423-434`); Profile reads the own-provider flag
   once on mount (`profile.tsx:56-58`); an invalid setting shows as "Connection lost"; blocked
   playback is never detected; no e2e asserts audible output. The "listening + push-to-talk
   caption" contradiction is UNKNOWN and needs a live repro.
8. Word popup is a full-width bottom sheet capped at 60% height with no scroll; vertical clipping
   is possible, edge clipping is not. Save has no toast.
9. Corpus regeneration (`word-audio --force`, pid 28546) is running: `packages/content/packs/**`
   is changing under us. No lane touches packs; no lane ever runs `git add -A`, `git stash`,
   `git checkout`, `git reset`.

## CONFIRMs made in this plan (Noel can reverse any at review)

- CONFIRM 22: the four-fact product model (account / hosted access / tutor mode / deployment) as
  in the kickoff table.
- CONFIRM 23: "Start free" on the landing goes to the paid origin's account screen with a
  create-account intent (`/account?intent=start`); after the magic link lands, an un-onboarded
  learner goes to onboarding, an onboarded one to their return destination. "Try a sample" stays
  on the free origin (current reader), labelled honestly. "Sign in" goes to `/account`.
- CONFIRM 24: the Apple button is hidden on web and on iOS until the route is registered; the
  account lane decides whether registering is safe enough to ship, and documents the Google
  OAuth follow-up for Noel.
- CONFIRM 25: navigation becomes four rows on both desktop sidebar and phone tab bar: Home,
  Library, Vocabulary, Settings. `/profile` is renamed `/settings` (old path redirects). Reader
  and voice headers carry a quiet Settings entry. `+not-found.tsx` exists.
- CONFIRM 26: the own-provider setting is stored and selected by one deliberate action
  ("Connect and use this key"); the stored flag lives in the store so every screen reads one
  source. Storage and validation code is reviewed by the cordoned Opus process before merge.
- CONFIRM 27: the voice screen gets a transcript, one control cluster, and in-place input-mode
  switching; "listening" only when capture is live; a Playwright audible-output probe becomes
  the proof for any spoken exchange.

## Lanes, file ownership, model

| Lane | Model | Owns (nobody else edits) |
|---|---|---|
| A landing | Sonnet, Cleo brief | `apps/client/web/landing/**`, `planning/design/LANDING-V4.md`, `docs/README` install section |
| B navigation + library states | Sonnet | `src/ui/Sidebar.tsx`, `TabBar.tsx`, `Rail.tsx`, `data.ts`, `src/state/selectors.ts`, `app/(tabs)/**`, `app/profile.tsx` → `app/settings/index.tsx`, `app/+not-found.tsx`, `app/_layout.tsx`, `app/library/**` |
| C account + onboarding | **Opus, separate headless process** | `apps/client/app/account/**`, `app/onboarding/**`, `app/index.tsx`, `app/start.tsx`, `src/cloud/**`, `~/Claude/sotto-cloud/src/auth/**`, `src/static.ts`, docs for sign-in |
| D reader | Sonnet | `app/reader/**`, `src/ui/reader/**`, `src/ui/Sheet.tsx`, `src/ui/audio*` (arbitration) |
| E own-provider flow UI | Sonnet | `app/settings/openai-key.tsx`, `app/settings/models.tsx`, `src/voice/TutorModelsPanel.tsx`, `src/voice/byokKey.ts` (flag-in-store only), the Profile/Settings own-provider row (coordinate: B renames the file; E edits the row after B's rename lands, or B leaves the row block untouched) |
| F1 tutor pipeline | Sonnet | `packages/voice/src/openai-direct/**`, `packages/voice/src/events.ts`, `src/voice/sessionManager.ts`, `controller.ts`, `voiceStartGate.ts`, `micIndicator.ts`, `apps/client/e2e/voice-*.mjs` + new audible probe |
| F2 voice screen | Sonnet | `app/voice/**`, `src/voice/useVoiceSession.ts`, `passage.ts`, `packages/core/src/prompt.ts` |
| R adversarial review | Opus (general-purpose) | read-only, then `docs/verification.md` |

Shared: `apps/client/src/i18n/*.json` only via `node apps/client/scripts/i18n-add.mjs` (atomic,
all nine catalogs, real translations before the lane ends). Commits are path-scoped
(`git add <owned paths>`), message prefixed `run7(<lane>):`, pushed by the lane. If a lane must
touch a file it does not own, it stops and writes the need into its report.

## Proof per lane (behaviour, not existence)

- A: `cleo_verify` 0 FAIL; screenshots 375/1440; claims table re-checked sentence by sentence
  against `scout-L` §2; every link resolves; install copy matches device detection in a browser.
- B: failing tests first for empty-state, not-found, settings reachability; Playwright walk:
  refresh + back + direct link on `/settings`, `/library`, a reader route; four library states
  rendered and screenshotted (kill the content server for the error state, restart it after).
- C: Playwright against a local sotto-cloud (stub billing, mail captured in the log) proving:
  landing "Start free" → account create → link → onboarding → library; returning user → home;
  cancel/error states. No live Fly deploy (D-5).
- D: 375 screenshot with a long gloss showing the sheet scrolls; save toast; "Talk about this
  passage" lands on the voice screen with the passage; audio arbitration test; a measured onset
  and offset for three French words Noel tapped (fr-fables-la-fontaine or fr-petit-chaperon-rouge).
- E: unit tests for the state transitions; Playwright walk with a fake provider (no real setting)
  showing connect → connected + selected across Settings and the tutor; disconnect; invalid.
- F1: unit test that a swallowed speech failure now surfaces; the Playwright audible probe
  (AudioContext bufferSource.start count > 0, samples > 0) passing on the local path with
  `apps/server` and the local models if present, else with an injected fake AudioAdapter and a
  mocked fetch returning PCM; documented which one ran.
- F2: state screenshots for ready / connecting / listening / thinking / speaking / muted / error;
  the pttDisabled contradiction reproduced or ruled out with a state log; text fallback sends a
  turn; recovery keeps the book.

## Stop / escalate (all lanes)

Stop when the card's proof exists and the path-scoped commit is pushed. Escalate (write to
`planning/run7/<lane>-report.md` and stop) when: a file outside ownership must change; a change
in `packages/content/packs` seems needed; anything requires a real stored setting, a real card,
a Fly deploy, or a real iPhone; or two serious attempts at a reproduction fail.
