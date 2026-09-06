# Sotto run 6: A, B, C. Landing decision area, own-provider voice path, word-tap audio.

Orchestrator commission for `planning/KICKOFF-6.md`. Launch in a **fresh** session with
cwd `~/Claude/sotto`: on Fable, `/fable planning/KICKOFF-6-FABLE.md` (the gate check runs
first); on Sonnet, "Execute planning/KICKOFF-6-FABLE.md end to end". It runs the same either
way: the orchestrator plans and reviews, Sonnet subagents do the keystrokes. Every `Agent`
call carries `model: "sonnet"` explicitly (a session on Fable leaks its model into unpinned
subagents), a finished subagent is never resumed by `SendMessage` for new work (the resume
drops the pin; spawn fresh), never haiku, and the orchestrator opens the editor only for
small glue at the final review.

Vocabulary for this run, used in every card, report, commit message and ledger line:
"own-provider mode" for the feature the docs call BYOK; "the setting" for the value a
learner pastes into Settings; "the account link" for the header link to the paid origin;
"the paid origin" for app.readsotto.app, "the free origin" for readsotto.app. The recon
reports under `~/Claude/sotto-run6-recon/` use the docs' older names; quote paths and line
numbers from them, not their prose.

Ledger continues in `planning/LEDGER.md` as "Run 6", in "Run 5"'s style (timestamped
bullets, one per commit or decision). CONFIRM numbers continue from 14.

---

## The prompt

You are the run 6 orchestrator for Sotto, an Apache-2.0 open-source graded-reader app with
a voice tutor, shipped as a free PWA on the free origin and as a paid, separately hosted
app on the paid origin. Read, in this order, before any dispatch: `planning/KICKOFF-6.md`
(Noel's brief, his words verbatim; this document adds ground truth and orchestration on top
of it, it does not replace his intent), `planning/LEDGER.md` "Run 5" and "Run 5 FINISH
LINE" (do not re-litigate CONFIRM 10: one front door, own-provider mode is a
same-destination detail, not a second fork), `planning/design/LANDING.md` and
`LANDING-V2.md`, `~/Claude/Agents/design/LEDGER.md` (top 10 rows and the Rotation state),
`docs/verification.md` Tier 5 rows, then `~/Claude/sotto-run6-recon/scout-A-landing.md`
and `scout-C-word-audio.md` (read-only Sonnet recon, 2026-09-06 morning, against
`e7973d3`; every claim file:line-cited and marked VERIFIED or INFERRED; treat VERIFIED as
true until a file contradicts it, re-verify INFERRED before building on it). Do not read
`scout-B-voice-path.md` yourself; it is written in the docs' older vocabulary and is an
input for lane B's worker only, who restates it in this run's.

### What this run ships

Three lanes: A first in priority, B and C in parallel with it on disjoint files. No
sotto-cloud change is implied by any lane; `~/Claude/sotto-cloud` is out of scope. If a
lane finds it needs a file there, stop and report.

- **A. The landing page's decision area, redesigned to steer.** Noel, 2026-09-06, on top of
  annotated screenshots of the run-5 page: "steer people to pay for it first, but there's
  the option for running it yourself"; "it's free to read and get definitions, but if you
  really want the AI tutor, that's where [own-provider mode] comes in, or when you pay for
  it"; the opening passage is good, "Start reading" is good, the guidance text under it is
  "a ton of text" and needs real UI work, not more prose. Weight after this run: (1) Read,
  free, unchanged; (2) the tutor, with the plan as the steered way ($9.99/mo, 3-day trial,
  the paid origin) and own-provider mode as a lighter mention; (3) self-host, surfaced as
  the named alternative ("run it yourself"), no longer table trivia. This is Noel's product
  call for the landing page; `planning/STRATEGY.md`'s "paid tier parked" language is not
  edited by this run (CONFIRM 14).
- **B. Own-provider mode does not work for Noel personally.** His words: "I still haven't
  been able to try out the [setting] myself." Find out why, with reproduction, and either
  fix what is a defect in the microphone and session path or write the exact real-device
  checklist that still needs him.
- **C. Word-tap audio is "still a bit clippy and not smooth for specific words."** Measure,
  reproduce, fix what is a defect, and resolve the two voiceless books one way or the
  other.

### Noel's answers (front-loaded; the run asks nothing mid-flight)

Filled in by Noel before launch. A blank slot takes the default in brackets; say which
defaults were taken in the first report.

- B-1 Device and how it was opened (Home Screen icon, Safari tab, desktop browser; which
  origin): ______ [blank: unknown; B2 reproduces all three contexts]
- B-2 Did Settings show the setting as saved on that same device and origin before he tried
  to speak: ______ [blank: unknown; B2 tests both orders]
- B-3 What the screen showed when he tried to talk (a microphone permission prompt that
  appeared / no prompt at all / "Microphone unavailable..." with only "Read alone" / a
  "wasn't accepted" message / something else): ______ [blank: unknown; B2 records what
  each context shows]
- C-1 Which book and locale, and whether he tapped one word or dragged across several:
  ______ [blank: `fr-FR/fr-petit-chaperon-rouge`, single-word taps, the recon's A/B book]
- C-2 Which words, even approximately, and whether the same word clips every time: ______
  [blank: short function words, `de`, `et`, `un`, `the`, `is`, plus the fricative-initial
  words C1 measures]

### Gate 0, before any dispatch

Run 5 is closed (LEDGER "Run 5 FINISH LINE": OSS `28f1e3b`, sotto-cloud `ea08b0d`, vendor
pin `28f1e3b`); two docs-only commits sit on top (`8d5f6fe`, `e7973d3`). Check
`HEAD == origin/main`, then run the isolated check: `git archive HEAD | tar -x` into the
scratchpad, `pnpm install --frozen-lockfile`, `pnpm check`; exit 0 is the baseline (run 5
left 67 files / 523 tests, `content:validate` 0 errors, 223 pre-existing content-quality
warnings).

The OSS working tree is NOT clean and will not be: at 2026-09-06 11:45 another session had
`docs/screenshots/web/*.png` (9 files) modified and `apps/client/docs/`,
`packages/content/drafts/.state/`, `thoughts/` untracked. Rules, unchanged from runs 4 and
5: never stage, stash, checkout, reset, clean or format those paths; `git add <explicit
paths>` and `git commit -- <paths>` only, for files this run created or was permitted to
edit; if `pnpm check` is red only because of in-flight files, run it in the isolated archive
copy and say so in the ledger; if a lane needs a file another session is touching, stop and
report; check `git status` fresh at every commit, not once at start. `thoughts/` is a
stray from run 5, untracked, harmless; leave it.

No lane needs any private value. None is typed, printed or written by an agent anywhere,
including in the simulator.

### Ground truth (recon 2026-09-06 against `e7973d3`; start here, do not rediscover)

**A, the page.** `apps/client/web/landing/index.html`, 635 lines, one file, CSS and one
inline script inside. Sections in DOM order: header 390-398 (wordmark, meta line "Free ·
Open source · No account ·" plus the account link, unchanged by this run); hero `#read`
401-429 (the `.cta` "Start reading" at 417, the `.cta-note` at 418-420, and the run-5
paragraph Noel circled at 421-426: "The voice tutor works either way: your own OpenAI key,
about a cent a minute, or the hosted plan at app.readsotto.app ($9.99/mo, 3-day trial)
[...]"); glossary `#words` 431-481 (six entries: graded reader, narrated, voice tutor, your
own key, plan, self-host); the table `#ways` 483-527 ("Compare all four ways", lead
`.lead-note` 486-489, columns Way / What it costs / Where, rows Read / tutor with own key /
tutor on the plan / Run it yourself); install `#phone` 529-542; footer 545-558 (GitHub,
Self-hosting, Your own key, Add a book). The real problem behind "a ton of text": the three
tutor options appear three times on one page (the passage's underlined words, the six-entry
glossary, the four-row table), and the circled paragraph makes a fourth. The redesign
collapses that into one scannable decision block; it does not add a fifth statement.

Tokens (`:root` 50-72): `--canvas #1b1815`, `--surface #232019`, `--surface-2 #2c2820`,
`--ink #f1eae0`, `--ink-2 #b8afa3`, `--ink-3 #8a8176`, `--hairline rgba(241,234,224,.12)`,
`--accent #e4572e`, `--peach #6b3f30`, `--peach-fill`, `--measure 38rem`, `--wide 44rem`,
`--gutter` 20/48, `--section` 64/112. `--accent` is used exactly once, `.cta` at line 241;
that stays true after this run. The only structural components are `.rows` (289-318, three
columns `1.4fr 1.2fr 1fr` at 700px and up, mobile eyebrows via `data-label`) and `.steps`
(341-352). There is no card, pill, chip, box or secondary-button class anywhere in the file;
LANDING.md's ban list forbids cards, boxed grids, borders around sections, gradients and any
accent outside the CTA fill; radius vocabulary is {2, 10}. Tap-target idioms: `.rowlink`
(322-326, 10px) and `.tap-link` (153-157, 16px, for 11-13px text). The docs say 44px
minimum; the harness only warns under 40; build to 44. Register manifesto, device "the page
is a Sotto passage" (linked gloss focus), anchor "Shade paper cutout on a night desk +
ElevenLabs whisper display" (`~/Claude/Agents/design/LEDGER.md:8`). A revision of a shipped
page is not a new ledger row (`~/Claude/Agents/agents/cleo.md:185`); the run-5 revision
note at `~/Claude/Agents/design/log-archive.md:29` is the format to match.

Verify and deploy: `~/Claude/Agents/design/tools/cleo_verify.py <file> --proof <dir>` (17
checks at 1280 and 375, light and dark; writes `1280-light.png`, `1280-dark.png`,
`375-light.png`, `375-dark.png`; exit 1 on FAIL; `--quick` while iterating). One
pre-existing WARN, `js-disabled` ratio about 0.85, is a harness undercount of the
span-wrapped passage and is named in every ship entry; any other WARN is new. Deploy only
from a clean `git archive` of the commit with `apps/client/.vercel` copied in (gitignored,
exists on disk, needed by `vercel build`), then `pnpm deploy:web` in `apps/client`
(`web:export`, `vercel build --prod`, `vercel deploy --prebuilt --prod`, scope
nturls-projects), then `BASE_URL=https://readsotto.app node apps/client/e2e/hosted.mjs`
(it asserts only the h1 and the "Start reading" click, nothing about the decision area, so
add curl greps for the new block's distinctive strings). The served page matched `e7973d3`
exactly at 11:50 today.

**B, the voice path.** Every microphone acquisition goes through
`packages/voice/src/transports/web-audio.ts:61-90` (`getUserMedia` at 66, `new
AudioContext()` at 69, `await resume()` at 73 if suspended, no try/catch inside). The
own-provider provider wraps it at `packages/voice/src/openai-direct/provider.ts:144-156` and
on rejection emits `mic_unavailable` (not recoverable) then `state: error`; the
browser-cascade and local-cascade providers do the same. Nothing detects standalone display
mode anywhere (`navigator.standalone`, `display-mode: standalone`: zero hits), nothing
checks permission state before a session, no Permissions-Policy or COOP/COEP header exists
(`apps/client/vercel.json` has no headers block), and the service worker
(`apps/client/public/sw.js`) touches only same-origin `/content/packs/**` GETs and the app
shell. Three verified facts outrank the kickoff's "untested standalone permission"
hypothesis:

1. The setting is stored per origin and per container: web storage key
   `sotto.byok.openaiKey` (`apps/client/src/voice/byokKey.ts:24`), origin-scoped by the
   browser. The free and paid origins do not share it, and on iOS a Home Screen install has
   its own storage container separate from the Safari tab. Saved in one place and tested in
   another, it is simply absent, and the availability gate
   (`apps/client/src/voice/availability.ts:116-170`; `byokPathUsable` at 60-62 checks only
   presence) routes elsewhere.
2. No user gesture at capture time: the "Talk to the tutor" tap only does `router.push`
   (`apps/client/app/book/[bookId].tsx:43-48`); the session auto-starts in a `useEffect`
   after an async availability probe (`apps/client/src/voice/useVoiceSession.ts:135-166`),
   so `getUserMedia` and the `AudioContext` are created outside any tap. The playback side
   already needed an iOS gesture unlock (`apps/client/src/platform/audio.ts:111`); capture
   never got one. A context created outside a gesture stays suspended on iOS, which reads
   as "nothing happens".
3. The failure UI is a dead end: `mic_unavailable` lands in the `isBroken` panel
   (`apps/client/app/voice/[bookId].tsx:346-381`) showing `voice.micUnavailable`
   ("Microphone unavailable. Allow microphone access for this site, then reopen the
   tutor.") with only "Read alone"; the "Use your own..." button exists only on the
   pre-session panels (297-345).

Also: the served manifest is generated by `apps/client/scripts/build-web.mjs:83-107`
(`display: standalone`, `start_url: /start`, `scope: /`, Apple meta tags injected), and
`apps/client/web/manifest.json` is dead; the service worker registers only in production
builds (`app/_layout.tsx:13-27`); `docs/byok.md:95-97` and `docs/verification.md:705`
carry the untested-standalone note (KICKOFF-6 attributes it to `docs/self-hosting.md`,
whose microphone section is about plain-http self-hosting, a different gap); the iPhone 17
Pro simulator is booted on this Mac (iOS 26.5, `xcrun simctl list devices available`);
every e2e that speaks uses Chromium fake-media flags, nothing exercises WebKit or an
installed app. The setting's entry screen (`apps/client/app/settings/openai-key.tsx`), its
validation (`packages/voice/src/openai-direct/api.ts:149-168`) and its storage
(`byokKey.ts`) are outside this run's edit scope except for user-facing copy; see R6-B3.

**C, the audio.** Facts by measurement: all 38 books that have `audio/words.mp3` index
100% of their word tokens (`~/Claude/sotto-run6-recon/coverage.py`, 18,949 tokens, 0
missing outside the two voiceless books). `ca-ES/ca-patufet` and `ro-RO/ro-capra-trei-iezi`
have no sprite because `packages/core/src/languages.ts:340-341,359-360` set `ttsVoice:
null` for those locales (`packages/content/src/word-audio.ts:356-358` skips them by design),
and they also have no narration audio and no token timings at all, so the speaker button's
render gate (`apps/client/app/reader/[bookId].tsx:588`, requires `token.startMs !==
undefined && audioUri`) most likely never shows it there (INFERRED; confirm in the reader).
`sw.js`'s `rangeFromCache` (251-278) arithmetic is correct for every case traced, but it
slices only an already-cached full response, and `audio/words.mp3` and `words.json` are
never in the eager cache list (`apps/client/src/state/createStore.ts:171-181`), so every
sprite Range request passes through to the network uncached, and word audio does not
survive offline even though the landing page promises an opened book keeps working. Sprite
clips are 525-1480ms with 370ms of baked silence between words (`LEAD_PAD_MS 120`,
`TAIL_PAD_MS 250`, `word-audio.ts:38-39`); timings come from decoded PCM sample counts; LAME
CBR at 24 kHz with a measured 46ms encoder delay, absorbed by the padding. What remains,
verified in code and unguarded:

- Multi-word selections always play the old narration slice through `playAudioSlice`
  (`audio.ts:104-155`, 40/80ms padding, rate 0.85, no sprite lookup), from
  `reader/[bookId].tsx:514-515`, in every book.
- `words.json` loads lazily per book (`useWordAudioIndex`, `reader/[bookId].tsx:97-129`);
  a tap before it resolves takes the 80/150ms narration fallback (`audio.ts:264-270`) even
  in a fully covered book, and the raw alignment for short words is often near zero
  (`fr-petit-chaperon-rouge/chapters/02.json`: three instances of `et` at 0, 10 and 50ms).
- No cancellation between taps: `playSlice` (`audio.ts:173-229`) creates a new player per
  call with no shared state; a quick second tap overlaps two players.
- `trimSilence` (`word-audio.ts:122-161`) cuts at RMS 500/32767 over 5ms blocks with no
  fade; a quiet onset or tail (f, s, h, th, soft vowels) below that threshold is sheared,
  a synthesis-side way for specific words to start or end abruptly even when isolated. Not
  yet measured; C1 measures it.
- Kokoro's own quality on some word shapes: not assessable by any agent; the listening kit
  in C3 is for Noel.

Regeneration costs hours: Kokoro serialises single words at 2-6s each (zh about 56s); the
pipeline is `pnpm content:word-audio` (`--force` to redo a book) against the local Kokoro
server `word-audio.ts` targets. Check it answers before scheduling any regeneration, and
regenerate one book as proof before the corpus.

### Lanes and task cards

Every dispatch gets a seven-field card in LEDGER.md before it starts (Task, Inputs, Output,
Proof, Permissions, Stop when, Escalate when). Path-scoped commits only; lanes share one
index. Two serious attempts, then the route changes (a better card, or back to Noel), never
a third blind try. Subagents report facts and diffs; the orchestrator judges against the
done-criteria fixed here and reads screenshots and measurements itself. New working notes
go under `planning/run6/`.

**R6-A1 Cleo spec (orchestrator, via `/cleo`, first thing).** Task: a Cleo revision spec
for the decision area, `planning/design/LANDING-V3.md`, an addendum in LANDING-V2's shape
(Fit read; what changed in Noel's priorities; the diff, exact; Definition of done) plus the
full fixture copy for every string that changes and the exact DOM and CSS plan for the new
block. Inputs: KICKOFF-6 Lane A, the ground truth above, LANDING.md's ban list and type
cast, scout-A sections 1-3, the live page. Design intent Cleo owns: replace the circled
paragraph with one compact, scannable three-way block directly under the CTA note (the
plan first and heaviest by position, size and copy, never by a second accent; own-provider
mode as one light line with its docs link; self-host as the named alternative with its
guide link), built from the file's own hairline-row vocabulary and tokens (no cards, no
boxes, no new hue, radius {2, 10}, tap targets 44); decide what the six-entry glossary and
the four-row table become (fold, shrink, or keep as the reference view lower down; the
reader who wants the exhaustive comparison must still find it); the passage stays as Noel
approved it unless one clause must change to match the new order (name it if so, CONFIRM
15). Output: the spec file. Proof: the spec names every line range it replaces and every
new string, with measure (45-75 cpl) and tap-target math written down. Permissions:
`planning/design/LANDING-V3.md` only. Stop when: a builder needs no design judgment to
apply it. Escalate when: the intent cannot be met inside the one-accent budget without a
second button; then propose the one token-layer treatment (`DESIGN.md:58` names the app's
surface-2 secondary treatment) and continue.

**R6-A2 Build (one Sonnet subagent, `model: "sonnet"`).** Task: apply LANDING-V3.md to
`apps/client/web/landing/index.html`, surgical diff, no restyle of anything the spec does
not name. Inputs: the spec, scout-A sections 1-2, the file. Output: the edited file plus a
local `pnpm web:export`. Proof: `cleo_verify.py` on the local export with `--proof`, 0
FAIL, only the known `js-disabled` WARN; the four screenshots delivered as paths; `git diff
--stat` limited to that one file. Permissions: `apps/client/web/landing/index.html` only.
Stop when: the verify line is clean and the diff matches the spec. Escalate when: a check
needs a change outside the file (a token in DESIGN.md, a build-script change); name it and
stop.

**R6-A3 Director's pass, deploy, live verify (orchestrator verifies; one Sonnet subagent
deploys).** The orchestrator re-runs `cleo_verify` itself (a subagent's "verified" is a
claim), reads the four screenshots as images, lists the top fixes with exact values, sends
them back once at most (two rounds maximum, then ship or change approach), and checks by
eye the three things the harness cannot: the plan reads as the steered way at 375 without a
second accent, the block reads in one glance, nothing below it repeats it. Then commit
(prettier on the html first, as run 5 did; `git add apps/client/web/landing/index.html
planning/design/LANDING-V3.md`) and dispatch the deploy: archive of that commit, `.vercel`
copied in, `pnpm deploy:web`, `hosted.mjs` at 375 and 1440, curl greps for two new strings
and for the absence of the circled paragraph's phrase "works either way", deployment id and
alias recorded in `docs/evidence/landing-v3-2026-09-06.log`. Proof: deployment READY and
aliased, hosted.mjs PASS, greps as expected. Permissions: deploy only from the archive,
never from the working tree; no sotto-cloud. Stop when: live matches the commit. Escalate
when: `vercel build` fails on anything but the landing file; do not touch the build script,
report.

Close A with the design ledger note: append a "Revision, Sotto run 6" paragraph under
`## 2026-09-05 · readsotto.app landing` in `~/Claude/Agents/design/log-archive.md` in the
run-5 note's exact shape (what Noel named, spec pointer, what stayed fixed, the insight,
numbered diffs, "no new colors or type sizes" if true, then "Verify caught and fixed", then
the exact "Verified:" line). No new row, no rotation-state change.

**R6-B1 Diagnosis (one Sonnet sleuth, `model: "sonnet"`).** Task: turn scout-B into a
ranked diagnosis of why own-provider mode did not work for Noel, using answers B-1 to B-3,
with one discriminating observable per candidate. Inputs:
`~/Claude/sotto-run6-recon/scout-B-voice-path.md` (read in full), the answers, the files it
cites. Output: `planning/run6/B1-diagnosis.md`: for each of the three candidates above plus
"standalone permission itself" and "not a code defect at all" (a provider account without
billing enabled is real friction outside this codebase), what Noel would have seen, which
answer rules it in or out, and the minimal reproduction for B2. Proof: every claim
file:line, VERIFIED or INFERRED. Permissions: read-only on the repo; write only the
diagnosis file. Stop when: the candidates are ordered and B2's recipe is exact. Escalate
when: the answers point at the setting's validation or storage logic; then write the
handoff bundle (card, files, the exact failed check) and stop; that work goes to a separate
Opus session, not to this run.

**R6-B2 Reproduction in the simulator (one Sonnet subagent, `model: "sonnet"`).** Task:
reproduce the capture path in three contexts on the booted iPhone 17 Pro simulator without
any setting value: serve the production export locally (`pnpm web:export` then `pnpm
serve:web`, port 8090; or `apps/server` with `SOTTO_STATIC_DIR` per `docs/self-hosting.md`
so the local-cascade path is available; `localhost` is a secure context), open
`http://localhost:8090` in the simulator's Safari as a tab, start the tutor, record what
happens (permission prompt yes or no, state reached, the exact panel text); then Add to
Home Screen from the share sheet, launch the icon, repeat; then confirm whether a marker
string written to web storage in the Safari tab (a throwaway key name, never the real one)
is visible from the installed app. The simulator's microphone comes from the Mac (Simulator
I/O menu, Audio Input); if capture cannot be granted at all in the simulator, the prompt and
state observations still stand and the real-device checklist goes to Noel. Use the iOS
Simulator MCP (`attach` first, then screenshots and taps); `xcrun simctl` works headlessly.
Inputs: B1's recipe, `docs/self-hosting.md`, `apps/client/package.json` scripts. Output:
`planning/run6/B2-repro.md` with screenshots as new files under
`docs/screenshots/web/run6-*.png` and a table: context by (prompt shown, state reached,
panel text, storage visible). Proof: screenshots read by the orchestrator. Permissions: no
repo edits; new screenshot files only. Stop when: the table has all three rows. Escalate
when: the simulator cannot install to Home Screen or cannot load localhost; say which, and
write the iPhone checklist instead.

**R6-B3 Fix or writeup (one Sonnet subagent, `model: "sonnet"`, only what B1 and B2
proved).** Task: fix the defects that live in the microphone and session path, each with a
failing test first: (1) capture starts from a tap: the voice screen mounts ready with a
"Start" control and creates the `AudioContext` and calls `getUserMedia` inside that tap's
handler (`useVoiceSession.ts`, `apps/client/app/voice/[bookId].tsx`); the auto-start goes
(CONFIRM 17); (2) the `mic_unavailable` panel gains a way forward: one line naming what to
do on this platform and a button back to Settings, i18n keys in all nine
`apps/client/src/i18n/*.json` catalogs (a missing key fails `content:validate`); (3) if B2
proved the storage-container split, the setting screen's copy and `docs/byok.md` say
plainly that the installed app and the Safari tab keep separate settings, and the paid and
free origins do too; copy only, no logic. Inputs: B1, B2, `apps/client/src/voice/
micIndicator.ts` and its test as the house pattern for a tested pure helper. Output:
commits path-scoped to the files above; `docs/verification.md` Tier 5 rows rewritten with
the new evidence (PASS or PARTIAL, honestly); `planning/run6/B3-writeup.md` stating what was
fixed, what was proven, and the exact real-iPhone checklist that still needs Noel. Proof:
unit tests for the new helper; B2's recipe re-run in the simulator after the fix, before
and after screenshots of the same context; isolated `pnpm check` green. Permissions:
`apps/client/src/voice/**`, `apps/client/app/voice/**`, `apps/client/src/i18n/*.json`,
`docs/byok.md`, `docs/verification.md`, and the settings screen's copy strings only. Stop
when: the proofs pass, or the writeup says plainly that no defect was found. Escalate when:
the fix needs `byokKey.ts`, `openai-key.tsx` logic, or `api.ts`; then handoff bundle,
separate Opus session.

**R6-C1 Measure (one Sonnet subagent, `model: "sonnet"`).** Task: objective onset and tail
analysis of every sprite entry in the corpus, plus the fallback path for the same words.
Script at `~/Claude/sotto-run6-recon/onsets.py` (outside the repo): decode each
`audio/words.mp3` to PCM; for each `words.json` entry, skip the baked lead pad and measure
the first and last 10ms of the trimmed audio (a hard onset is a first 5ms block whose RMS
is a large fraction of the clip's peak; a sheared tail likewise); group by first and last
grapheme class (fricative, plosive, nasal, vowel); report the hard-onset rate per class per
locale; list the 20 worst clips with book, word, ms. Then for C-1 and C-2's words (or the
defaults) extract A/B wav pairs (sprite versus padded narration slice; the recon's `clips/`
shows the format) into `~/Claude/sotto-run6-recon/clips/`. Inputs: scout-C sections 1-6,
`coverage.py`, ffmpeg at `/opt/homebrew/bin`. Output: `planning/run6/C1-measurements.md`
with the tables and the clip index. Proof: numbers reproducible from the script; the
orchestrator re-runs it on one book. Permissions: read-only on the repo. Stop when: the
tables exist and the trim hypothesis is confirmed or refuted by numbers. Escalate when:
decoding disagrees with `words.json` offsets by more than one frame (48ms at 24 kHz) for
any book; that is the format-latch bug (`word-audio.ts:282-311`) manifesting; report which
book.

**R6-C2 Client fixes (one Sonnet subagent, `model: "sonnet"`, failing test first, one
mechanism per commit).** Task: (1) cancel the previous word player when a new tap starts
(`audio.ts:173-229`: a module-level current-player handle, stop and release before
starting); (2) close the lazy-index race: when a book has `wordAudio`, the reader waits for
`useWordAudioIndex` before choosing the fallback (`reader/[bookId].tsx:97-129, 588-605`),
so a covered book never plays the narration slice for a single word; (3) put
`book.wordAudio.file` and `.index` in `bookCacheUrls` (`createStore.ts:171-181`) so the
sprite is cached with the book and `rangeFromCache` has a cached 200 to slice, and in
`sw.js`'s pass-through Range branch (254) keep passing the Range request through for
immediate playback while a `waitUntil` background fetch without the Range header stores
the full 200 for the next tap, with the `mode === 'navigate'` guard untouched; (4)
multi-word selections keep the narration slice; it is the accepted path (CONFIRM 18),
documented in C3's writeup, not changed. Inputs: C1, scout-C sections 3-4, the existing
tests for `audio.ts`, `createStore.ts` and `sw.js` (find them first; if none, add the
smallest vitest with a fake player). Output: commits path-scoped to
`apps/client/src/platform/audio.ts`, `apps/client/app/reader/[bookId].tsx`,
`apps/client/src/state/createStore.ts`, `apps/client/public/sw.js`, and their tests.
Proof: the tests; the reader e2e (`apps/client/e2e/hosted.mjs` against a local
`serve:web`) still passing; for (3), a network log showing the second tap in a session
served from cache and the sprite playable offline. Permissions: those files only. Stop
when: all proofs pass and isolated `pnpm check` is green. Escalate when: (2) changes the
reader's render tree in a way that moves any other control; then do the smaller fix (wait
for the index, keep the button in place) and note it.

**R6-C3 Synthesis-side fix and the listening kit (one Sonnet subagent, `model: "sonnet"`,
only if C1 confirmed sheared onsets).** Task: in `packages/content/src/word-audio.ts`, keep
20-30ms of pre-roll and post-roll around the trim points and add a 10ms linear fade in and
out at the trim edges (or lower the RMS threshold with the same fades; pick the one C1's
numbers favour), unit-tested on a synthetic PCM fixture; regenerate the one book Noel named
(default `fr-petit-chaperon-rouge`) with `pnpm content:word-audio --force` against the
running Kokoro server; re-run C1's script on it; produce the before and after A/B wavs.
Then build the listening kit for Noel: `~/Claude/sotto-run6-recon/listen.html`, one local
file with play buttons for each before/after pair, no build step, no external assets.
Output: the pipeline commit; the regenerated pack for that one book (its `audio/words.mp3`
and `words.json` are tracked content; commit them path-scoped, with
`docs/evidence/word-audio-run6-2026-09-06.log`); `planning/run6/C3-writeup.md` naming the
two voiceless books as an accepted gap (no Kokoro voice for ca-ES and ro-RO, no narration
at all, the button does not render; the fix is content, a narrated recording plus
alignment, out of scope) and the corpus regeneration as a background command for Noel to
start (exact command, expected hours). Proof: C1's hard-onset rate for that book before
versus after; the kit opens and plays locally. Permissions: `word-audio.ts` and its test,
the one book's `audio/` files, the evidence log, the writeup. Stop when: the numbers
improve and the kit exists. Escalate when: the Kokoro server is down or the one book takes
more than an hour; do not start the corpus, report.

**Gate 1 (before any deploy).** A: `cleo_verify` 0 FAIL by the orchestrator's own run,
screenshots read, director's fixes applied. B: B1 and B2 written, B3 scoped. C: C1 written,
C2 tests green. Isolated `pnpm check` green on the integrated tree. First report to Noel
here: the CONFIRM items, the defaults taken, what each lane found.

**Gate 2 (before close-out).** Landing live and curl- and hosted-verified; B3 and C2 (and
C3 if run) committed with their proofs; `docs/verification.md` rows updated; isolated
`pnpm check` green on the final HEAD; a fresh `git status` shows nothing staged from other
sessions.

**R6-R Adversarial review (one Sonnet subagent, `model: "sonnet"`, read-only, at the Gate
2 SHA).** "What is fake, fragile or unverified in run 6": the pessimistic counter-report
before the optimistic one, with a claims-versus-evidence table for every PASS this run
wrote. Then one fix lane for anything HIGH, then re-review only the fixed items. Scrutiny
rises with polish: the cleaner the landing looks, the harder it gets checked.

**Close-out (orchestrator).** LEDGER "Run 6" bullets and a "Run 6 FINISH LINE" section in
run 5's shape (SHIPPED / NEEDS NOEL / PARTIAL, NOT VERIFIED / CARRIED); the design archive
note; `docs/verification.md`; memory
(`~/.claude/projects/-Users-noelturlington-Claude/memory/project-sotto-reading-app.md`, a
RUN 6 paragraph); one row appended to `~/Claude/model-routing/ledger.csv`
(`2026-09-06,sotto-run6,<orchestrator model>-orchestrator+sonnet-lanes,default,1,<review
minutes>,<failed check or none>,<recovery minutes>,<outcome>`); push. Report in chat if Noel
is present, else one iMessage: the live URL, what he must still do (the iPhone checklist,
the listening kit, the corpus regeneration command), what stayed PARTIAL and why.

### Definition of done

- A: LANDING-V3.md written; the decision area is one scannable block that steers to the
  plan by hierarchy, names self-host as the alternative, mentions own-provider mode
  lightly; the page states the three options once, not four times; `cleo_verify` 0 FAIL
  with only the known WARN; screenshots at 375 and 1280 read as images by the orchestrator;
  deployed to the free origin from a clean archive; hosted.mjs PASS; the archive note under
  the 2026-09-05 entry.
- B: either a fix with simulator proof (before and after screenshots of the same context)
  or a writeup that says what was found, what was ruled out, and the exact real-iPhone
  checklist; `docs/verification.md` Tier 5 rows honest; nothing in the setting's
  validation or storage logic touched by this run.
- C: the two voiceless books documented as an accepted gap with the button behaviour
  confirmed in the reader; the client race and the overlap fixed with tests; the sprite
  cached with the book and playable offline; and either the synthesis-side fix with before
  and after numbers plus the listening kit, or C1's numbers refuting the trim hypothesis;
  the corpus regeneration handed to Noel as one command if the fix landed.
- The run never asked Noel a question mid-flight; every unfilled slot took its default and
  said so.

### Routing and cost

The orchestrator plans (touch one) and reviews (touch two); every lane above runs on a
Sonnet subagent with `model: "sonnet"` written on the `Agent` call, a fresh agent per
round, never a `SendMessage` resume, never haiku. No Opus lane exists inside this run; the
only Opus work (the setting's validation or storage logic, if B1 lands there) leaves this
run as a handoff bundle for a separate session. A, B and C are separable surfaces (landing
file and design docs; voice screen, session manager, i18n, own-provider docs; audio
platform, reader, store, service worker, content pipeline); no two lanes edit the same
file, and the orchestrator integrates. Plan headroom was GREEN at 2026-09-06 11:50 (5h 3%,
7d 43%); native subagents, no `/fanout`. Never write a token allowance into any card.

### CONFIRM (defaults in parentheses; proceed on defaults, report at Gate 1)

14. The landing page steers to the plan per Noel 2026-09-06; `planning/STRATEGY.md`'s
    parking language is left as is and the divergence is one ledger line (yes).
15. The hero passage is unchanged unless one clause must move to match the new order;
    Cleo names it if so (default: unchanged).
16. The four-way table becomes whatever reference view Cleo decides (shrunk or folded,
    never deleted).
17. B3's "Start" control replaces the auto-start on every platform, not only iOS (yes; a
    gesture-fresh start is correct everywhere and avoids a platform branch).
18. Multi-word selections keep the narration slice; documented, not fixed (yes).
19. C3 regenerates one book in this run; the corpus regeneration is Noel's background
    command, not this run's (yes).
20. Blank answer slots take the bracketed defaults; nothing is asked mid-flight (yes).

---

## Launch notes (Noel)

- Fable gate, read against `~/Claude/model-routing/fable.md`: long-horizon passes only with
  the answer slots filled or their defaults accepted (the run then asks nothing);
  multi-file passes (nine lanes across the landing file, design docs, voice screen and
  session manager, i18n, audio platform, reader, store, service worker, content pipeline,
  docs); security-adjacent passes only because the setting's validation and storage logic
  is cordoned out of the run (R6-B1 and R6-B3 escalate it to a separate Opus session) and
  the vocabulary above is used throughout. The recorded `/triage` verdict for run 6 was
  plain Sonnet; run 5 ran that way. Lane A alone is a one-file Sonnet task; what earns an
  orchestrator here is A, B and C in parallel with two judgment-heavy reviews (the
  director's pass and the defect-or-not calls) and a deploy gate.
- Before launching on Fable: check the Fable bar in `/usage`; headroom.py does not read it.
- Recon inputs live in `~/Claude/sotto-run6-recon/` (three scout reports, `coverage.py`,
  eight A/B clips). `planning/run6/` is created by the run.
- Nothing from the recon session was changed, committed or deployed except this file.
