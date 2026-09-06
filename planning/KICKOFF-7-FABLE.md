# Sotto run 7: one coherent journey, from the landing page to a spoken conversation about a book

Orchestrator commission. Launch in a **fresh** session with cwd `~/Claude/sotto`:
`/fable planning/KICKOFF-7-FABLE.md` (the gate check runs first). The three Loom
recordings that ground this run are shared in the launch message, not committed here
(unlisted links, and one shows a key being pasted). The transcripts are in Appendix A.

Same orchestration rules as run 6: the orchestrator plans, dispatches, and reviews; it
opens the editor only for small glue at the final review. Every `Agent` call carries an
explicit `model` (`"sonnet"` for build lanes, `"opus"` for the two cordoned lanes below); a
finished subagent is never resumed by `SendMessage` for new work (spawn fresh); never haiku;
adversarial reviews go to `general-purpose`, not `critic`. Non-trivial dispatches get the
seven-field card (Task / Inputs / Output / Proof / Permissions / Stop-when / Escalate-when).
Two serious attempts on a lane, then the route changes.

Vocabulary for this run, used in every card, report, commit and ledger line: "own-provider
mode" for the feature the docs call BYOK; "the setting" for the value a learner pastes into
Settings; "the free origin" for https://readsotto.app; "the paid origin" for
https://app.readsotto.app; "the account link" for the landing header's link to the paid
origin; "the plan" for the hosted subscription. Product name is **Sotto** everywhere; the
transcripts say Soto/Soda/Oto, all mean Sotto.

Ledger continues in `planning/LEDGER.md` as "Run 7", run-5 style. CONFIRM numbers continue
from 22. Nothing in this document overrides `~/.claude/CLAUDE.md`.

---

## The prompt

You are the run 7 orchestrator for Sotto, an Apache-2.0 open-source graded-reader app with
a voice tutor. Two live surfaces: the free origin (Vercel project `sotto`, static landing at
`apps/client/web/landing/index.html`, app shell at `/app.html`, local-first, **no accounts**,
own-provider mode, deploy ONLY via `cd apps/client && pnpm deploy:web`) and the paid origin
(Fly app `sotto-cloud`, private repo `~/Claude/sotto-cloud` with this repo vendored as a
pinned submodule at `vendor/sotto`; magic-link email sign-in and Sign in with Apple in
`src/auth/`; Stripe live, one plan at $9.99/mo or $79/yr with a 3-day card-required trial;
entitlements table is the single truth; a sunset switch cordons the machine on 2026-11-01
if there are zero subscribers).

Noel recorded three Loom walkthroughs on 2026-09-06 and wants the **whole journey** fixed,
not another landing-page pass: discover Sotto, understand why, create an account, try the
free experience, pick a language and level, read, listen, look up words, talk to a tutor
about the passage aloud, upgrade when it makes sense, or connect a key or self-host if
preferred. Ordinary learners must never need to understand deployment, keys, or browser
models to start.

### Read first, in this order, before any dispatch

1. Appendix A below (Noel's words, verbatim). Then try `WebFetch` on the three Loom links
   for the hosted transcript and any frames; if Loom blocks it, the appendix is the source.
   A Loom transcript is an observation; nothing from it counts as a defect until a lane
   reproduces it in the current build.
2. `planning/LEDGER.md` "Run 5", "Run 6" and both FINISH LINE sections. Do not re-litigate
   CONFIRM 10 (one front door on the landing; own-provider mode is a same-destination
   detail), CONFIRM 14 (STRATEGY.md's "parked" language stays) or CONFIRM 17 (capture
   starts from a tap, never on mount). CONFIRM 10 (one origin, costed and parked) is
   still parked: **do not unify the two hostnames this run**.
3. `planning/STRATEGY.md`, `planning/KICKOFF-6-FABLE.md`, `planning/run6/B3-writeup.md`
   (the honest gap: own-provider mode's start path was never exercised end to end on a
   real device) and `planning/BUGS-TUTOR-RUN5.md`.
4. `planning/design/DESIGN.md`, `LANDING-V3.md`, `ACCOUNT.md`, `PAYWALL.md`, `DESKTOP.md`,
   and `~/Claude/Agents/design/LEDGER.md` (top 10 rows + Rotation state). Cleo (`/cleo`)
   owns visual direction; drive that lane directly, log the skeleton it chooses.
5. `docs/verification.md`, `docs/byok.md`, `docs/voice-pipeline.md`, `docs/browser-tutor.md`,
   `docs/self-hosting.md`, `docs/architecture.md`.
6. `apps/client/src/voice/availability.ts` (`VoicePath = 'local' | 'browser' | 'cloud' |
   'byok'`), `sessionManager.ts`, `useVoiceSession.ts`, `app/voice/[bookId].tsx`,
   `app/(tabs)/_layout.tsx`, `app/(tabs)/home.tsx`, `app/_layout.tsx`, `app/onboarding/*`,
   `app/settings/*`, `app/account/*`, and `apps/client/src/i18n/en.json` (every new UI
   string touches all nine `i18n/*.json` files or `pnpm check` fails).

### Leads from a 10-minute read of the tree (file-cited; VERIFIED = read, INFERRED = guess)

- VERIFIED: the landing header reads "Free · Open source · No account · Sign in" and "Sign
  in" is a bare link to the paid origin (`web/landing/index.html:444`). The "Level A2 ·
  About 30 seconds" line at `:452` is the passage device from LANDING.md, unlabelled.
- VERIFIED: the Home tab's gear pushes `/profile` (`app/(tabs)/home.tsx:36`); there is no
  `app/settings/index.tsx`, only `app-language`, `appearance`, `explanation-language`,
  `learning-language`, `licenses`, `models`, `openai-key`. INFERRED: "Unmatched route" in
  recording 2 is a link to `/settings` or a stale route; lane B reproduces before fixing.
- VERIFIED: the "shopping bag" in recording 2 is `GiftGlyph` on Home, label `home.gift`,
  and it opens the daily story (`home.tsx:38-42`). It is not "books you are reading".
- VERIFIED: `voice.pttDisabled` = "Enable push-to-talk in settings to speak"
  (`i18n/en.json:117`), shown as a caption with no action next to the control.
- VERIFIED: the tutor's own-provider start path was flagged untested end to end in run 6
  (`docs/verification.md` Tier 5, PARTIAL row; `planning/run6/B3-writeup.md`).
- VERIFIED: sotto-cloud auth is magic-link email + Sign in with Apple. There is no Google
  sign-in and no Clerk anywhere in either tree. Clerk is history, not a requirement.
- VERIFIED: the setting is per-origin and per-container (`sotto.byok.openaiKey` in
  localStorage; Home Screen install, Safari tab, and the paid origin are three stores).
- INFERRED: recording 3's "saved but toggle still off" is the settings screen reading
  provider selection from a different source than storage; lane E confirms with a repro.
- INFERRED: recording 3's silent reply (text, no speech) is the cascade path completing
  STT+LLM and failing or skipping TTS/playback without surfacing it; lane F measures
  each stage separately (capture, transcription, model, speech synthesis, playback).

### Product model this run establishes (CONFIRM 22 unless Noel's slot below says otherwise)

Four independent facts, each shown to the learner only where it matters:

| Fact | Values | Where the learner sees it |
|---|---|---|
| Account | none (sample) / signed in | account area, header |
| Hosted access | free / plan | paywall, usage, one upgrade prompt |
| Tutor mode | browser models / own provider / the plan / self-host server | tutor setup + Settings, one selector |
| Deployment | hosted / self-hosted | landing "run it yourself", docs |

Journey defaults (Noel's slots D-1..D-6 can change them):

- **First-time visitor** on the free origin: promise, "Start free" (primary), "Sign in"
  (secondary, opens real authentication on the paid origin), "Try a sample" (tertiary,
  the current no-account reader, with an honest note that progress and vocabulary stay on
  this device until they sign in).
- **Start free** → account creation on the paid origin (magic link now, Apple where
  available) → onboarding (learning language, level with help, interface language,
  explanation language; four separate questions, changing one never changes another) →
  a recommendation → the library. No key, no plan, no card to finish onboarding.
- **Signed-in free user**: reads, listens, looks up and saves words, uses the browser-model
  tutor where the device supports it; sees exactly one honest upgrade prompt where the
  hosted tutor is gated.
- **Paid user**: hosted tutor, usage screen, manage plan.
- **Own-provider user**: guided setup from Settings and from the tutor; works with or
  without a plan; billed by the provider, explained in plain words.
- **Self-hosted user**: reaches `docs/self-hosting.md` from the landing in one click; the
  self-host server's account/plan surfaces stay hidden.
- **Returning reader**: lands where they left off; direct links, refresh and back all
  survive.

### Noel's answers (front-loaded; the run asks nothing mid-flight)

A blank slot takes the bracketed default; the first report lists which defaults were taken.

- D-1 Where does "Start free" create the account: ______ [default: on the paid origin
  with a `free` entitlement, because that is where accounts already exist; adding accounts
  to the free origin or unifying the origins is out of scope this run]
- D-2 Google sign-in: ______ [default: ship email magic link + Apple now; write the Google
  OAuth work up as an Opus follow-up that needs a Google Cloud OAuth client from Noel;
  do not add a fake "Continue with Google" button]
- D-3 What the free hosted tier includes: ______ [default: reading, narration, lookups,
  vocabulary, browser-model tutor; the hosted tutor requires the plan or own-provider
  mode; write no minute counts or quotas into copy unless Noel fills this slot]
- D-4 Own-provider mode without a plan on the paid origin: ______ [default: allowed, as
  it is on the free origin today]
- D-5 May the run deploy sotto-cloud to Fly unattended: ______ [default: NO. sotto-cloud
  changes are committed, vendor pin bumped, isolated `pnpm check` green, and left for
  Noel with the exact `fly deploy` line; the free origin may deploy via `pnpm deploy:web`]
- D-6 Keep "Sotto reads with you." and the passage device on the landing: ______
  [default: keep the headline, label the passage as "A sample passage · Level A2" or drop
  the meta line]
- D-7 Noel's device for the tutor checklist (Home Screen icon / Safari tab / desktop):
  ______ [default: desktop Chrome for automated proof; the iPhone checklist stays his]

### What this run ships (lanes; A first, others parallel on disjoint files)

- **A. Landing (Sonnet, Cleo-driven).** `apps/client/web/landing/index.html` +
  `planning/design/LANDING-V4.md`. Hierarchy: promise; Start free / Sign in; a real
  product preview (screenshots or a captioned strip of reader + word popup + tutor from
  `docs/screenshots/`, not stock); the read → understand → speak loop in three lines;
  free vs plan comparison using only the live price and D-3; "Use your own key" and
  "Run it yourself" as secondary guidance, never as tiers; Install Sotto with
  device-detected steps (iOS Safari share-sheet, Android install prompt, desktop Chrome
  install icon) and no offline promise the service worker does not keep; support links.
  Explain "graded reader" as "books adapted to your level"; keep the machine-adapted-draft
  and estimated-level caveats but move them next to book choice. Audit every privacy
  sentence against the four tutor modes ("everything runs in your browser" is true only
  for the browser-model mode; "nothing is recorded" must say what the provider receives
  in own-provider and plan modes). Remove "Free · Open source · No account" from the
  header.
- **B. Navigation, settings, library continuity (Sonnet).** Reproduce "Unmatched route",
  the disappearing books, the gift icon confusion, and settings vanishing off the Home
  tab. Give the app one nav: Home (For you), Library, Vocabulary, Settings/Account, with
  Settings reachable from reader and tutor (desktop sidebar bottom slot; mobile: a quiet
  control that keeps reading space). Rename or re-icon the daily story control so it says
  what it does. Library states: loading / empty filter result / no books for this
  language+level / error, each distinct, never a blank screen. Language, level, filters
  and reading position survive navigation, refresh, direct link and back. Failing tests
  first for every reproduced bug.
- **C. Account, sign-in, onboarding (Opus, cordoned).** In sotto-cloud and
  `apps/client/app/account/*`, `app/onboarding/*`: a real sign-in screen (email magic link,
  Apple), account creation vs returning paths, loading/cancel/error states, a visible
  account area, return destination after sign-in, and guest-to-account handoff of
  reading progress and saved vocabulary without loss. Onboarding: four separate language
  and level questions, level help, skip-able tutor setup, finish with a recommendation
  and the library. No key required. This lane owns anything that touches sessions,
  tokens, magic links, or the entitlements table. Deploy per D-5.
- **D. Reader (Sonnet).** Preserve narration, sync highlighting, translation, word
  details, vocabulary save, progress. Improve measure, sizing, spacing, responsive
  layout, popup visibility (selected word and controls fully on screen at 375 and 1440),
  save feedback, and the "Talk about this passage" entry. Verify the word-pronunciation
  complaint both ways: visual clipping of the popup and audio truncation of the word
  (measure onset/offset on the sprite vs the narration slice; run 6 fixed the fades, this
  lane checks the specific words Noel taps in recording 2, French). Audio arbitration:
  narration, word pronunciation and tutor speech never overlap.
- **E. Own-provider setup flow (Sonnet for UI; Opus for storage/validation, cordoned).**
  A guided flow reachable from Settings and the tutor: what the setting enables; who
  bills and how it relates to the plan; provider setup link; masked field; validation
  through the existing `GET /v1/models` check; "Connect and use this key" as the single
  deliberate action that stores AND selects; a short tutor test; replace / disconnect /
  switch mode. Truthful states: connecting, connected, active, invalid, unavailable,
  disconnected. A provider failure never silently switches mode. Fix the "saved but
  toggle off" defect at its source. Browser-model install status is a separate fact from
  "is the selected mode ready". The setting never appears in URLs, logs, screenshots,
  analytics or error text; the Opus worker reviews every log line the UI lane adds.
- **F. Tutor conversation (Sonnet; the primary product lane).** Reproduce recording 3
  first: French passage, learner asks in French what Provence is and whether it is in
  France. Instrument each stage (capture → transcription → model → speech synthesis →
  playback) and report which fail, per mode. Then build: passage as context; a short
  spoken opening invitation; mic, speaker, session controls in one place; ready /
  connecting / listening / thinking / speaking / muted / error states, "Listening" only
  when capture is live, no indefinite connecting after a failure; a readable transcript
  replacing the caption strip; input-mode instructions beside the control (push-to-talk
  vs open mic, one tap to switch, no "go to settings"); text-input fallback; retry that
  keeps the book and transcript. The tutor answers aloud with text when voice output is
  on; proof is a captured audio element playing with non-zero duration, not a text
  reply. Prompting: ground in the passage, learning language at level, explanation
  language on request, short spoken turns, one follow-up question, proportionate
  correction, no invented passage details, barge-in where the provider supports it.
  Specific recovery for mic denied, no input device, connection failure, unusable
  setting, quota, and blocked autoplay.
- **R. Adversarial review (general-purpose, Opus).** Before the final report: every
  claim in the run's reports re-verified against the tree and a live walk; the claims
  table in `docs/verification.md` updated with VERIFIED / PARTIAL / UNSUPPORTED; any
  privacy or key-handling sentence on the landing or in-app checked against code.

### Definition of done

- A new visitor on the free origin understands the offer and the free start; "Sign in"
  opens real authentication; "Try a sample" is explicit and honest.
- Onboarding separates learning, interface and explanation languages; no key needed.
- Library shows content or a specific empty/error state; settings routes work and stay
  reachable from Home, Library, reader and tutor; nothing disappears on navigation.
- Word lookup, save, pronunciation and narration still work (regression tests green).
- Connecting a usable setting yields one consistent state across Settings and the tutor.
- A spoken exchange is verified with audible output in at least one mode on desktop
  Chrome, and the Provence question gets a grounded French answer aloud plus text.
- Unsupported or failed voice paths show specific recovery, never a stuck indicator.
- Free, plan, own-provider and self-host each have an accurate sentence and a working
  destination; install guidance matches the device.
- Routes survive refresh and direct navigation; critical flows pass at 375 and 1440.
- Isolated `pnpm check` green in both repos (`git archive` drops the submodule and
  `.vercel`; restore both before checking or building, see LEDGER run 4/5 traps).
- Mocked tests may prove failure states; live auth, billing and voice count as verified
  only from a real walk. Anything needing Noel (Fly deploy, iPhone Home Screen test,
  Google OAuth client, Apple entitlement) is listed, not claimed.

### Final handoff (to `planning/run7/FINAL.md` and the ledger)

The implemented journey and each CONFIRM; a concise change list with SHAs; before/after
screenshots at 375 and 1440 for landing, sign-in, onboarding, library, reader, tutor;
what was tested live and in which mode; unresolved decisions and external dependencies;
remaining issues ranked by learner impact; and a nine-line iPhone checklist for Noel if
the Home Screen container is still unproven. Keep the review tied to the three
recordings: each complaint in Appendix A gets a line saying fixed / not reproduced /
needs Noel.

---

## Appendix A: Noel's recordings, 2026-09-06 (transcripts verbatim, auto-captioned)

### Recording 1: landing page and sign-in

> Okay, so trying to do some quick design thoughts for the next Englishota. Um, so as you
> can see on my screen right here, um, I have the read Soto dot app, and then I have
> app.read Soto dot app. Um so read Soto dot app on the left tells you a little bit about
> Soto. Um, you have this top banner, Soto, free open source, no account. Then you click
> sign in, and then sign in like jumps straight to the app.read Soto.app. Um I think there
> needs to be some kind of like email and then like Google all sign in. Um I know we've
> used Clerk in the past, um, but like some kind of like account view um when you click
> sign in. So that's like the top banner. Level A two, about thirty seconds. That seems a
> bit unnecessary. But yeah, I don't know why that's there. This is all just like design
> stuff. So Soda reads with you. Soda is a free graded reader. You pick a language and a
> level, open a book, tap anyone. Word for a translation, or plus play to hear the story
> narrated. When you want to talk about what you read, a voice tutor listens and answers
> your own key or the plan. Okay, using your own key or the Plan. Okay, that's like a lot.
> Nothing is recorded, everything runs in your browser, and if you'd rather run it on your
> own machine, you can self-host it. So, how I view Soto. Is first, it should be a paid
> product, and like that's what the landing page says. And then I log in, set up an
> account, and try. It. If someone wants to go and self-host it, then they can go and do
> that, and the landing page tells you how to do it. There's steps, you got to go to the
> GitHub. I think the guiding flow of how that works is not very clear, and I want you to
> tackle that. Okay, so start reading. Click start reading, and I immediately jump. Into,
> like, I guess, like, the free, like, book view as it stands today, um, which is great,
> but, like, I I I don't know. It's it's a bit um I think like the user flow is not really
> figured out. The underlying words, graded A graded reader. Book written at your level, so
> does books are machine-adapted drafts, and their levels are estimates. Narrated, every
> story has audio, the words fill in as the narrator reaches them. This is all great, but
> like the Landing page needs to be better, and then this like matrix of like your
> different options needs to be better from a design point of view, and then adding. Them
> PWA at the bottom needs to be clear. Then it links to GitHub, which I guess you can see
> the source code of Soda. Great. Self-host. Saying okay, shows you how to do that. Um,
> like it should be super easy for someone to be able to go and self-host. Um. If they
> want to, and I guess that's fine for now. Your own key. Um, so, like, the way I Envision
> it is more. I get to this landing page, I sign in, I use the free version. I mean, the
> way it Is set up now is like the free version doesn't um you can just go and use it. Um,
> I guess, like, my whole like user flow is just not. Really figured out. But yeah, like,
> what if I want to use my own Open AI keys? So let's just click sign in. I'm seeing the
> same thing: app readzoto.app. That's okay. Um, I see like portois. Um, let me just switch
> everything to English for um the time being.

### Recording 2: settings, library, reading, tutor

> Back now, okay. I'm back now in Soto. Um, let's say, so I go to the settings, portois.
> Um, great little settings icon. Um, let's Unmatched route. Okay, so like what's going on
> there? Um, I don't I don't really get that Also, where did all the books go? Something's
> wrong there. Start reading. Okay, now the little shopping bag, so like it's unc Of
> unclear, like what that icon, like maybe those are the books that you're reading. Um,
> but let me just switch, um, for simplicity. I want to learn Spanish, French, um.
> Language of the app is in French and explain in English. So these are the different
> French. Books, I can pick. This is like the library of everything. You can pick based on
> your level. That's all fine. Let me. Go this book. I know French. Now I'm going to
> listen. Okay, so that the audio is working well, Abek. But when I click on a specific
> word, I'm going to save it. That's what it means. In English, um, details, that's nice,
> um, but like the actual word. is is it still a little bit clipped? Like I I want you to
> just say like the the specific word. Um Trouvet, that that that works. Connect. Yeah, so
> I mean, that's working okay. But, like, what if I want to use the AI tutor and I click?
> Discuss, I get this connecting icon up here. Now it's like listening, but like the
> enable push to talk in settings to speak. Doesn't seem to be working too well, and then
> I get this like caption down here. Um, the tutor is just not that great, and that's
> something that really needs to improve. And then, like, where do I put my opening? Eye
> keys and then like library, all the like settings icons like disappear. Maybe they
> should be down here in the bottom corner as well. It only Shows up on the 4U Tudor
> models are installed on this browser. But, like, what if I want to use my Open AI key?
> Alright, I guess I can see it here. But there should be like a clear onboarding flow for
> like throwing in your OpenAI key. I'm going to try that in another video.

### Recording 3: using an OpenAI key and the tutor

> Okay, so I'm gonna go try to throw my Open AI key in this Oto. So I just created a key
> and now I'm gonna try to put that into Soto. And let's see how Alright, so it seems like
> it saved it okay. But then if it's saved okay, this should be Turned to on right now.
> It's off. Use your own OpenAI key and setting should be turned on. Let me try voice
> mode. Okay, so now I get an option: browse. Or your key. So let's try your key. I'm
> trying to use like the AI tutor. Short answer is like the AI tutor is just not working
> right now. And like that needs to be really improved upon. So it's listening. I see that
> it's listening now, it's thinking in this top corner. Okay, so it captures. That so,
> like, uh, question. So, I'm at the hunt and uh South. South. Okay. Um jeux practices.
> Passage, uh, with the Open AI, uh, Monsieur Seguin habité in the Blanche to Bordeaux
> Charmins Village de Provence. Esque du Per mix piquet, que s que c'est Provence et ceur
> in France. So what I'm trying to showcase is like, okay, now I have like the open AI
> key, but like the tutor is still not great. So it answered like Paul Bon said, you know,
> he's on his suit. De la France conduit for the paysage, once it's chants of civil
> chamois, it's destination population. It didn't speak that out to me, and like I want
> the tutor to. be like a real like like human like tutor experience and it's not doing
> that right now. So anyway, these are all things that I want to be improved upon. um with
> the like Soto like tutor experience. Um and then like as we said before like just kind
> of like the like guiding um view for the The user, like there's this landing page, a lot
> like can be improved here. And so I'm like doing these Loom videos so you can create a
> prompt to like tackle these improvements.

The key Noel pasted in recording 3 is his; it is never to be read from the video, typed,
logged, or reused. If a frame shows it, the frame is not saved.
