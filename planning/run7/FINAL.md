# Run 7 — final handoff

Spec: `planning/KICKOFF-7-FABLE.md`. Plan: `planning/run7/PLAN.md`. Lane reports:
`planning/run7/{A,B,C,D,E,F1,F2,G,G2,H,H2}-report.md`. Review:
`planning/run7/R-adversarial.md`. Re-graded claims table: `docs/verification.md`
§ "Run 7".

Head at the time of writing: `b4de9cc` (sotto), `fc806ee` (sotto-cloud). Isolated
`pnpm check` green on `b4de9cc`; sotto-cloud 375/375 at `fc806ee`. The free origin is
deployed from `b4de9cc` (`https://readsotto.app`, Vercel `sotto-g07kz9uds-nturls-projects`).
The paid origin is **not** deployed — that is Noel's one blocking action (§5).

---

## 1. The journey as implemented, and the CONFIRMs

**The journey.** A visitor lands on `readsotto.app`: one promise, a labelled sample
passage, and three choices in a real hierarchy — **Start free** (primary, to the paid
origin's account screen with a create-account intent), **Sign in** (secondary, same
origin's `/account`), **Try a sample** (tertiary, the no-account reader on this origin,
captioned with the honest fact that progress and saved words stay in this browser). Below
that: two real product screenshots, the read → understand → speak loop in three lines, a
free-vs-plan reference using only the live price, "Use your own key" and "Run it yourself"
as guidance rather than tiers, and device-detected install steps. Start free opens a
real sign-in screen (email magic link; Apple hidden until its route is registered), then
four separate onboarding questions — interface language, language to learn, level (with a
"not sure?" helper of sample sentences in the language being learnt), explanation
language — then one recommended book and the library. No key, no card, no plan to finish.
Inside the app there is one navigation with four rows (Home, Library, Vocabulary,
Settings) on both the desktop sidebar and the phone tab bar, plus a quiet Settings entry
in the reader and voice headers; every library state is distinct; language, level, filter
and reading position survive refresh, back and a direct link. In the reader, a word tap
gives a scrollable popup, a save toast, padded word audio, and "Talk about this passage",
which opens the tutor on that chapter with the passage in view. The tutor opens the
conversation itself with one short spoken sentence, keeps a readable transcript, shows one
control cluster with the input-mode switch in place (no "go to settings" dead end), has a
text fallback, and gives a specific recovery panel for a denied mic, no input device, a
rejected key, quota, blocked playback and a lost connection. Own-provider mode is a guided
flow from Settings *and* from the tutor, with one deliberate "Connect and use this key"
that stores and selects, and a status that now reads the same on every screen and survives
a reload.

**CONFIRMs (each reversible at Noel's review).**

- **CONFIRM 22** — the four-fact product model (account / hosted access / tutor mode /
  deployment), each shown only where it matters. Implemented as described above; the
  landing never presents own-provider or self-host as a pricing tier.
- **CONFIRM 23** — "Start free" → `/account?intent=start` on the paid origin; after the
  magic link, un-onboarded → onboarding, onboarded → return destination. "Sign in" →
  `/account`. "Try a sample" stays on the free origin, labelled honestly. Built and
  proved locally; **live only after the Fly deploy**.
- **CONFIRM 24** — the Apple button is hidden until the route is registered; `GET
  /auth/config` and `registerAuthRoutes(…, {apple})` share one flag so they cannot drift;
  Google is written up (`sotto-cloud/docs/google-sign-in.md`), never faked as a button.
- **CONFIRM 25** — four nav rows on sidebar and tab bar, `/profile` → `/settings` with a
  redirect, `+not-found.tsx` exists, Settings reachable from reader and tutor. Done.
- **CONFIRM 26** — the own-provider setting is stored *and* selected by one action; the
  status lives in the store so every screen reads one source. Done, and after the fix pass
  it also survives a reload — which is what Noel's recording-3 complaint was actually
  about.
- **CONFIRM 27** — the voice screen has a transcript, one control cluster, in-place
  input-mode switching, "listening" only when capture is live, and a Playwright
  audible-output probe as the proof for any spoken exchange. Done; the probe is now a
  10-assertion gate.
- **CONFIRM 28 (proposed, Noel decides).** The sample path now runs the **four-step
  wizard with detected defaults** — each question pre-filled with what the old one-tap
  fast path would have chosen, so it is confirmation rather than a blank form. The
  one-tap fast path is gone. This buys four separate, correctable facts (Noel's
  "language of the app is French and explain in English" case) at the cost of three extra
  taps before the first book. If Noel wants the fast path back, the cheapest shape is a
  "Looks right — start reading" button on step 1 that accepts all four detected defaults
  and skips to the recommendation; the wizard stays for anyone who taps a question.

---

## 2. Change list by lane

**`~/Claude/sotto`** (all pushed to `origin/main`)

| Lane | SHA(s) | What landed |
| --- | --- | --- |
| pre-flight | `01e1139` | A Vitest file inside `app/reader/` was read as a route and crashed the dev server on every screen. Moved to `src/ui/reader/` |
| plan | `aacc9e2`, `6d08c4f` | Plan, seven lane cards, and `apps/client/scripts/i18n-add.mjs` — one atomic nine-catalog edit so parallel lanes cannot clobber each other's strings |
| A landing | `0657d02`, `7bcd450` | `web/landing/index.html` rebuilt around the learner's decision (masthead → hero → real product screenshots → the three-line loop → free-vs-plan → own-key / self-host → device-detected install); `planning/design/LANDING-V4.md`; header banner removed; passage labelled; every privacy sentence scoped to the mode it is true for |
| B navigation | `1d9bf0c` | Four-row nav on sidebar and tab bar, `app/+not-found.tsx`, four distinct library/home states with Retry, the gift control relabelled "Today's story", and the library filter moved into the URL so it survives refresh, back and a direct link |
| C account | `4270689`, `57dc10a` | Real sign-in screen with create-vs-return framing and per-failure errors, four-step onboarding with the level helper and a recommendation, `app/index.tsx` root that knows where to send you, `src/cloud/{returnTo,destination}.ts`, `src/onboarding/*` |
| D reader | `87673ad` | Word/span popup scrolls instead of clipping (mobile sheet + desktop panel), save toast, "Talk about this passage" and a Settings gear in the reader header, and `src/platform/audioBus.ts` — narration, word audio and tutor speech can no longer overlap |
| E own-provider | `73b9861`, `a1b59c1`, `55be58d` | `ownProviderStatus` in the store with a hook, the guided connect flow ("Connect and use this key" stores *and* selects; the toast never says "saved"), `app/profile.tsx` → `app/settings/index.tsx` with a redirect, the Settings hub regrouped, `docs/byok.md` paths updated |
| F1 pipeline | `70a85ee`, `816c00e`, `c72f224` | Every swallowed tutor speech/mic/playback failure now surfaces as a specific event (`mic_denied`, `no_input_device`, `provider_rejected_setting`, `quota_exceeded`, `playback_blocked`), the `notSpoken` caption marker, `retry()` and `resumePlayback()`, and the live-voice e2e helpers (tap Start, scrape the transcript, refuse to pass against a fake-provider bundle) |
| F2 voice screen | `12c73d9` | `app/voice/[bookId].tsx` rewritten as a conversation: passage card, transcript, one control cluster with the in-place push-to-talk / open-mic toggle, text fallback, `RecoveryView`; prompt rules in `packages/core/src/prompt.ts` (two-sentence turns, one follow-up question, proportionate correction, passage-only facts, an opening invitation) |
| G integration | `48e4de8` | Wired F2's four escalations — speaker mute through a playback `GainNode`, `notSpoken` → Replay, an automatic opening turn on the own-provider path, real `bookTitle` through `SessionOptions` — and put tutor speech on lane D's audio bus at the one place every provider passes through |
| G2 | `ae32132` | Probe and `voice-live.mjs` re-run clean once the Metro was rebuilt without `EXPO_PUBLIC_VOICE=fake` |
| glue | `1c2dbc9`, `7f63de1` | Server prompt-budget test synced to core; prettier on the i18n helper |
| R review | `98b895e` | Read-only adversarial pass; 10 findings; the first Run 7 claims table |
| H fix pass | `540aac6` | Findings 1,2,3,4,5,8,9,10 + hygiene: `ownProviderStatus` hydrates from the stored key; the duplicate transcript fragment is dropped; the listening gate goes inert after an error; the phone chip row matched to `Rail.tsx`'s working pattern; the landing says hosted audio is brokered to OpenAI; the tutor screen reads the own-provider status; `bookTitle` added to the server's zod schema (it was being silently stripped) and `beginOpeningTurn()` added so the local path opens the conversation; CriOS/FxiOS routed to the iOS install steps; `voice-live.mjs` honours `SOTTO_SCREENSHOT_DIR` so an e2e run stops dirtying tracked PNGs |
| H2 live proofs | `b4de9cc` | Findings 1,2,3,4,8,9 proved against running servers; the probe extended from 7 to 10 assertions (opening invitation rendered, invitation actually spoken, no duplicated tutor sentence); and a new defect found and fixed on the way — the sentence chunker split "M. Seguin", so the tutor spoke a lone "M." aloud and the transcript grew a one-token bubble |

**`~/Claude/sotto-cloud`** (pushed; **not deployed**)

| SHA | What |
| --- | --- |
| `91f7224` | `returnTo` carried through the sign-in link and validated at both mint and verify time; `GET /auth/config` advertises the real sign-in methods |
| `52802e1` | `GET /content/packs` served as JSON — a real production bug: the SPA fallback answered it with the app shell, so the paid origin could not list a single book |
| `49eb419` | vendor pin → `57dc10a` |
| `fc806ee` | vendor pin → `b4de9cc` (run 7 final) |

Two cross-lane attributions worth knowing when reading the history: lane F2's 18 i18n keys
landed inside lane E's `a1b59c1`, and lane G's rewrite of `audible-probe.mjs` landed inside
lane F1's `816c00e`. Both were shared-tree races; nothing was lost (verified by reading the
committed files).

---

## 3. Before / after against Noel's recordings (Appendix A)

**Recording 1 — landing and sign-in**

| Complaint | Verdict | Evidence |
| --- | --- | --- |
| "Soto, free open source, no account" banner at the top | **fixed** | Removed; the masthead is the wordmark plus Sign in (`web/landing/index.html`, `0657d02`, live on `readsotto.app`) |
| "Sign in like jumps straight to the app.read Soto.app" — no account view | **fixed in the tree, needs Noel to deploy** | `Sign in` → `/account`, a real sign-in screen with create-vs-return framing; lane C's 55-assertion walk. The live paid origin still serves the pre-run-7 bundle |
| "There needs to be some kind of like email and then like Google sign in" | **half fixed / needs Noel** | Email magic link is real and tested. Google needs a Google Cloud OAuth client only Noel can create; the full design is `sotto-cloud/docs/google-sign-in.md`. No fake button was added |
| "Level A two, about thirty seconds. That seems a bit unnecessary" | **fixed** | The passage is now labelled as a sample passage (D-6's second option) |
| The hero paragraph is "a lot" | **fixed** | Replaced by a short promise plus the read → understand → speak loop in three lines |
| "It should be a paid product… I log in, set up an account, and try it" | **fixed** | Start free is the primary CTA and the plan is the only priced thing on the page; own-key and self-host are guidance rows, not tiers |
| "The guiding flow of how self-host works is not very clear" | **fixed** | A "Run it yourself" row with one sentence and a one-click link to `docs/self-hosting.md` |
| "Click start reading and I immediately jump into the free book view… the user flow is not really figured out" | **fixed** | That path is now the explicitly tertiary "Try a sample", captioned that progress and saved words stay in this browser until an account exists |
| "This matrix of your different options needs to be better" | **fixed** | One free-vs-plan reference block using only the live price ($9.99/mo, $79/yr, both code-verified) |
| "Adding them PWA at the bottom needs to be clear" | **fixed** | A device-detected install block; iOS Safari / iOS Chrome / iOS Firefox / Android / desktop / no-JS generic all resolve correctly (five UAs driven) |

**Recording 2 — settings, library, reading, tutor**

| Complaint | Verdict | Evidence |
| --- | --- | --- |
| "Let's Unmatched route. What's going on there?" | **fixed** | `/profile` → `/settings` redirect, `app/+not-found.tsx` with Home / Library buttons, and Settings is a real nav row; typo'd routes and `/profile/x` both render the not-found screen at both widths |
| "Where did all the books go?" | **fixed on the free origin; the paid origin needs the deploy** | Library and Home now render loading / error+Retry / no-books-for-this-level / no-books-for-this-filter as four distinct states. The paid origin's emptiness had a second, separate cause: it served HTML for `/content/packs`, fixed in `52802e1`, undeployed |
| "The little shopping bag… it's unclear what that icon is" | **fixed** | Re-labelled "Today's story" (`home.gift`), same behaviour |
| "The actual word… is it still a little bit clipped?" | **not reproduced; needs Noel's ear** | Both books Noel used play the *sprite*, and the sprite's onset/tail ratios for `trouve`, `avec`, `rencontre` are all far below the hard-clip threshold (`fr-petit-chaperon-rouge` reads exactly 0.000). The raw narration-slice fallback *is* hard-cut, but the client already pads it (80 ms lead / 150 ms tail / 60 ms fade). Numbers in `planning/run7/D-report.md`; if it still sounds clipped on the device, that is an ear-vs-metric mismatch worth reporting back |
| "I click Discuss, I get this connecting icon" | **fixed** | The corner status dot is gone; state appears once, next to the control that changes it, and a failure now shows a recovery panel within 0.4 s instead of connecting forever |
| "It's like listening, but 'enable push to talk in settings to speak'" | **not reproduced, and made impossible** | 35 samples at 200 ms never showed the two together (`F2/step0-repro.mjs`); regardless, the dead-end caption is gone — the input mode is now a segmented control on the screen itself |
| "This caption down here… the tutor is just not that great" | **fixed** | A readable, scrolling transcript replaced the caption strip, and the tutor opens the conversation with one short spoken sentence instead of waiting in silence |
| "Where do I put my OpenAI keys?" | **fixed** | A guided flow reachable from Settings *and* from the tutor screen |
| "Library, all the settings icons disappear" | **fixed** | Settings is a permanent nav row on both layouts, plus a gear in the reader and voice headers |
| "It only shows up on the 4U [For you]: tutor models are installed on this browser" | **fixed** | The tutor-models panel is its own Settings screen and now carries the own-provider status line as a separate fact from browser-model install state |

**Recording 3 — the key and the tutor**

| Complaint | Verdict | Evidence |
| --- | --- | --- |
| "It seems like it saved it okay. But… this should be turned on right now. It's off." | **fixed** | This one survived the first fix and was caught by the review: the status defaulted to disconnected on every reload while the key persisted. Now hydrated from the stored key. Live: connect → reload → hub still "Connected" (`H2/f1-04-hub-after-reload.png`) |
| "Now I get an option: browser or your key" | **kept, improved** | The path chips remain, and now carry the same status string Settings shows: `["Local","Your key — Connected"]` |
| "It didn't speak that out to me" | **fixed** | The audible probe asserts real PCM through the Web Audio graph: 10/10 on three separate runs, `started: 107`, `totalSamples: 249,186` on the most recent. Underneath it, own-provider TTS failures used to be swallowed and the caption printed anyway — that path now emits a specific error and marks the caption not-spoken with a Replay button |
| "The AI tutor is just not working right now" (the Provence question) | **fixed** | *"La Provence est une région du sud de la France. C'est un endroit célèbre pour son climat ensoleillé et ses paysages magnifiques. Avez-vous déjà visité le sud de la France ?"* — French, grounded in the passage, one follow-up question, spoken aloud |
| "I want the tutor to be like a real human-like tutor experience" | **improved, not finished** | Opening invitation, two-sentence spoken turns, one follow-up question, proportionate correction, passage-only facts, no duplicated sentences, and barge-in on the audio bus. What is still missing is judgement the local 8B model does not reliably show: roughly one turn in four it drops the follow-up question (§5) |

---

## 4. What was verified live, by unit test, and by mock

**Live, in a browser, against running servers** (Metro `:8081`, voice/content server
`:8790`; scripts and screenshots under `~/Claude/sotto-run7-recon/`):

- A spoken tutor exchange on the local cascade, three times after the fix pass:
  H2's `probe-run2.log` and `probe-run3.log` (10/10, exit 0) and the orchestrator's run
  after restarting the voice server (10/10, `started: 107`, `totalSamples: 249,186`,
  opening invitation "Bonjour."). Pre-turn samples — proof the *invitation* was spoken,
  not merely printed — were 41,050 and 228,656 on the two H2 runs.
- `voice-live.mjs` 6/6 (explain a word, save it to vocabulary, states cycle correctly).
- Own-provider connect → reload → still connected, at 375, with `api.openai.com`
  intercepted and a placeholder string. The only off-origin request in the whole walk was
  `GET /v1/models`.
- A denied microphone: recovery panel at 0.40 s, never stuck on connecting.
- The phone library chip row at four filter states: 36 px each.
- Route survival (`/settings`, `/library?filter=…`, `/reader/<id>`) at 375 and 1440,
  reload and cold direct link, zero console errors.
- Reader: popup scroll under a long span, save toast, "Talk about this passage",
  narration paused by a word tap (clock frozen, transport label flipped).
- Landing: all eight hrefs 200; install detection driven at five real UA strings; focus
  ring on all eight tab stops; `prefers-reduced-motion` honoured; the deployed page
  curled (`<title>Sotto reads with you</title>`, `/content/packs` → JSON).
- The hosted smoke test against the deployed `readsotto.app`: PASS at 375 and 1440 —
  landing → Try a sample → four wizard steps → recommendation → reader in six taps,
  narration playing, a word saved and surviving a reload, and an offline reload served
  from the service worker's shell and content caches.
- Lane C's account and onboarding journey: 55 assertions, 0 failures — but against a
  **local** sotto-cloud with stub billing and the magic link read from the server's own
  staging log, not against the live paid origin.

**By unit test** (the behaviour is real, the environment is not a browser): 281 client
tests, 99 `apps/server`, 138 `packages/voice`, 52 core, 375 sotto-cloud. Notable ones that
carry weight here: the `ownProviderStatus` hydrate cases, the caption de-duplication pair
(drop the stray fragment, still append a genuinely new turn), the listening gate going
inert after an error, `beginOpeningTurn()` speaking without inventing a learner caption,
`bookTitle` reaching the LLM request body, the abbreviation-aware chunker on both copies,
and the nine recovery-panel branches.

**By mock only** — real but never exercised end to end:

- Every own-provider network path. No real key exists in this run and none was ever
  pasted; `fetch` is mocked and `api.openai.com` intercepted. The `notSpoken` → Replay
  marker in particular needs a genuine TTS failure on a real key to be seen live.
- Apple sign-in (deliberately not registered) and the native `sotto://` deep link.
- The browser-model (on-device) tutor path and the hosted/Realtime path — neither was
  driven; the hosted one needs a plan and a deployed origin.
- The chunker fix's live behaviour: unit-verified on both copies, but the post-restart
  probe opened with "Bonjour.", which contains no abbreviation, so the "M. Seguin" case
  has not yet been watched passing on a running server.

---

## 5. Unresolved decisions and external dependencies

**Blocking, and only Noel can do it — deploy sotto-cloud.** Nothing lane C built reaches
a learner until this runs, and the landing is already live pointing at it. From
`~/Claude/sotto-cloud` (now at `fc806ee`, vendor pin `b4de9cc`), exactly as the C report
gives it:

```
fly deploy --app sotto-cloud
```

Then check, in this order:

- `curl -s https://app.readsotto.app/content/packs | head -c 40` → must start with `[{`
  and be `application/json`. If it still returns `<!DOCTYPE html>`, the deploy did not
  take and the paid app still cannot list books.
- `curl -s https://app.readsotto.app/auth/config` → `{"magicLink":true,"apple":false,"google":false}`.
- `https://app.readsotto.app/` signed out → lands on `/account?intent=start` ("Create your
  free account"), not on `/onboarding`.
- Request a link with your own address, click it → onboarding on a fresh browser, home on
  one you have set up.
- `https://app.readsotto.app/library` → books.

The Dockerfile builds the client from the vendor pin, so this deploy carries the client
changes too; no separate `pnpm deploy:web` is needed for the paid origin.

**Other external dependencies**

- **Google sign-in** — needs a Google Cloud OAuth client (client ID + secret as Fly
  secrets). Everything else is specified in `sotto-cloud/docs/google-sign-in.md`, about a
  day and a half of work once the credentials exist. This is the one part of Noel's
  "email and then like Google" note that could not ship.
- **Sign in with Apple** — needs an `APPLE_SERVICES_ID` and a registered Return URL in
  Apple's developer console. Until then the button correctly appears nowhere; turning it
  on afterwards is one flag: `registerAuthRoutes(app, ctx, { apple: true })`.
- **Own-provider mode on a real device with a real key** — still the honest gap carried
  from run 6 (`planning/run6/B3-writeup.md`). Everything in this run used a placeholder
  string with the provider intercepted. Nine-line iPhone checklist below.
- **The 162 level sample sentences** (`src/onboarding/levelSamples.ts`) — three per level
  per language, written by lane C, grammatical but with no native review. Romanian,
  Catalan and the two Chinese sets are the ones most worth a second pair of eyes. They are
  content, not code, and safe to correct in place.
- **Landing screenshot files** — the two product screenshots are base64 `data:` URIs
  inside `index.html` (~181 KB of un-cacheable text on every landing load), because
  `scripts/build-web.mjs` copies only the one HTML file and that script was outside lane
  A's ownership. The fix is one `cpSync` in `build-web.mjs` plus changing two `<img src>`
  values to `/landing/reader.jpg` and `/landing/tutor.jpg`. Noel's call whether it is
  worth a follow-up card.
- **The probe's model-compliance flake** — the "reply ends with a question" assertion
  missed once in four H2 runs (`probe-run1.log`, 9/10, exit 1). The reply was still
  French and grounded; the local 8B model simply dropped the follow-up question that
  `packages/core/src/prompt.ts:88-91` requires. If `audible-probe.mjs` is ever wired into
  CI it will be flaky at roughly that rate until the prompt or the model changes.

**Product decisions still open**

- **CONFIRM 28** (§1): does the one-tap fast path come back alongside the wizard?
- **CONFIRM 10 remains parked**: one origin, or real server-side sync. Until one of them
  happens, a learner who reads on `readsotto.app` and later signs in on
  `app.readsotto.app` starts fresh — origin isolation, not a patchable bug. Both the
  landing and the account screen now say so out loud.
- **`packages/core/src/models.ts` has no owner.** "Talk about this passage" opens the
  right *chapter* but always the chapter's opening window, because `ReadingProgress` has
  no `tokenId` field for `buildPassageWindow` to centre on. Adding one touches
  `packages/core`, which no run-7 lane owned.
- **The recommendation shows the title in the interface language** ("Little Red Riding
  Hood" for an English interface reading French). Consistent with everywhere else; flag if
  the original title is wanted.

**Nine-line iPhone checklist (the Home Screen container is still unproven)**

1. Open `readsotto.app` in Safari, tap Share → Add to Home Screen, open it from the icon.
2. Confirm the install steps you were shown match what you actually did.
3. In the installed app, go to Settings → Tutor → Tutor voice, and connect your own key
   there — the same container you will test in, never Safari's tab.
4. Confirm the row reads "Connected. Ready to try the tutor." and never the word "saved".
5. Force-quit the app, reopen from the icon, and confirm the row still reads Connected.
6. Open a French book, tap a word, and listen for clipping at the start and end.
7. Tap "Talk about this passage", tap Start, and confirm the tutor speaks first without
   you saying anything.
8. Ask it, aloud and in French, what Provence is and whether it is in France; confirm you
   hear the answer, not just read it.
9. Deny the microphone once (Settings → Safari → Microphone) and confirm you get the
   recovery panel, not a spinner.

---

## 6. Remaining issues, ranked by learner impact

1. **The paid origin is a run behind.** "Start free" and "Sign in" resolve against the
   pre-run-7 bundle, and `app.readsotto.app` still cannot list books (`/content/packs` →
   `text/html`). Every signed-in surface this run built — the sign-in screen, onboarding,
   the account area, the library on that origin — is invisible until `fly deploy` runs.
   This is the single highest-impact item and it is one command.
2. **No handoff between the two origins.** Read on the free origin, sign in on the paid
   one, and you start over. Parked under CONFIRM 10; now stated honestly in two places
   instead of being implied away.
3. **No Google sign-in.** Explicitly asked for in recording 1; blocked on an OAuth client
   only Noel can create.
4. **Own-provider mode has still never run on a real device with a real key.** Carried
   from run 6. Every proof this run is a placeholder string with the provider intercepted.
5. **Roughly one tutor turn in four ends without a follow-up question.** Model
   non-compliance, not a code defect, but it is the difference between a conversation and
   an answer — and "make it feel like a real tutor" was the point of recording 3.
6. **The chunker fix is unproven live.** Until an abbreviation actually appears in a turn
   on a restarted server, "the tutor never says a bare 'M.'" is a unit-test claim.
7. **"Talk about this passage" always opens the chapter's first passage**, not where you
   were reading. Needs a `tokenId` on `ReadingProgress` in `packages/core`.
8. **Voice-screen polish**: focus is dropped rather than moved after Start; the four mode
   chips are bare `DIV`s with no role; the passage card truncates mid-word with no
   ellipsis at 390.
9. **The landing carries ~181 KB of base64 image data** that can never be cached
   separately from the HTML — the page's whole weight budget.
10. **`DELETE /account` with a confirmation token is unreachable from the UI**
    (pre-existing; only the fresh-auth path works). Worth a card.
11. **Small copy and i18n nits**: the landing `<meta description>` calls Sotto "free" with
    no qualifier while the plan is $9.99; `zh-Hans` renders "tutor" as 辅导 in
    `settings.tutorMode` and 导师 in `voice.muteSpeaker`.
12. **The sample path now costs six taps** from the landing to the first page of a book
    (landing → Try a sample → four wizard steps → Start reading), counted by the hosted
    smoke test. That is the price of CONFIRM 28 and the reason to decide it.
