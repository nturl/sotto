# Lane H2 report — the live proofs lane H could not produce

Card: the H2 brief (produce lane H's missing live proofs against the restarted servers, fix
any defect found on the way). Files owned: the same set as lane H.

## Environment (this is the difference from lane H)

Both dev servers were up for this entire lane and I started/restarted neither:
`http://localhost:8081` (Metro) returned 200 on three spaced polls; `http://localhost:8790/health`
returned `{"ok":true,"stt":true,"llm":true,"tts":true,"vad":"energy"}`. The voice server runs
under plain `tsx` (no `watch`) — PID 36861, `tsx … src/index.ts` — so it holds the code it was
started with. That matters for one item below and is called out there.

No secret was used anywhere. Every own-provider check used the literal placeholder
`sk-test-not-a-real-key-…` with `https://api.openai.com/**` intercepted by Playwright and
fulfilled with a canned 200 models list. The only off-origin request the whole walk made was
`https://api.openai.com/v1/models`, with no query string.

Scripts and screenshots: `~/Claude/sotto-run7-recon/H2/`.

## Per-finding table

| Finding | What was asked | Proof | Verdict |
|---|---|---|---|
| 1 (P0) — own-provider status survives a reload | connect at 375 with validation intercepted, hub reads Connected, reload, hub still Connected | `H2/f1-byok.mjs`; `f1-01-hub-before.png`, `f1-02-connected.png`, `f1-03-hub-before-reload.png`, `f1-04-hub-after-reload.png` | **PASS**, VERIFIED |
| 8 — the tutor screen reads `ownProviderStatus` | voice screen shows own-provider as a selectable mode carrying the same status | `H2/f8-voice.mjs`; `f8-voice-chips-1440.png`, `f8-voice-byok-selected-1440.png` | **PASS**, VERIFIED |
| 3 (P0) — denied microphone | recovery panel within 5 s, no stuck "connecting" | `H2/f3-deny.mjs`; `f3-mic-denied-390.png` | **PASS**, VERIFIED |
| 4 (P1) — phone filter chip row | `/library?filter=…` at 375, chip row ≤ 48 px | `H2/f4-library.mjs`; `f4-375-unfiltered.png`, `f4-375-C1.png`, `f4-375-fables.png`, `f4-375-after-tap.png` | **PASS**, VERIFIED |
| 2 + 9 — audible probe twice, no duplicate sentence, opening invitation spoken first | two exit-0 runs, 7/7 | `H2/probe-run2.log`, `H2/probe-run3.log` (both exit 0, now **10/10**), `probe-run3-final-transcript.png` | **PASS** on two consecutive runs; one earlier run flaked, see below |
| voice-live.mjs | run once with `SOTTO_SCREENSHOT_DIR` | `H2/voice-live.log` (exit 0, 6/6), `H2/voice-live/*.png` | **PASS**, VERIFIED |
| New defect found and fixed: sentence chunker split at `M.` | — | `apps/server/src/voice/chunker.test.ts`, `packages/voice/test/browser-cascade-chunker.test.ts` | **FIXED**, unit-verified; not live-verified (see below) |

## 1 + 8 — own-provider status survives a reload, and the tutor screen reads it

`f1-byok.mjs`, 375 × 812, `api.openai.com` intercepted:

```
1. HUB before                    : Tutor voice | Not connected
2. KEY SCREEN after connect      : A key is stored on this device (sk-••••••••). | Connected
3. HUB after connect (no reload) : Tutor voice | Connected
4. HUB after FULL RELOAD         : Tutor voice | Connected     <- the bug R2 recorded is gone
   localStorage key names        : ["sotto.byok.openaiKey"]
OFF-ORIGIN REQUESTS              : ["https://api.openai.com/v1/models"]
ERRORS                           : []
```

Line 4 is the whole finding: R2's repro reported `Not connected` here. Lane H's `hydrate()`
change works live, not only in the unit test. VERIFIED.

Finding 8, `f8-voice.mjs` at 1440 with the same placeholder stored, on
`/voice/fr-chevre-de-m-seguin?mode=discuss`:

```
PATH CHIPS: ["Local","Your key — Connected"]
```

The byok chip carries the same `byok.status.*` string the Settings hub row shows — the screen
does read `ownProviderStatus` now. Tapping it makes own-provider the selected path (the chip
backgrounds swap, dark = active):

```
AFTER SELECTING OWN-PROVIDER: [{"text":"Local","chipBg":"rgb(239, 228, 210)"},
                               {"text":"Your key — Connected","chipBg":"rgb(34, 30, 27)"}]
```

VERIFIED. Note the chip row is only offered when the gate found more than one usable path
(`availability.ts`), which on this Mac means local + own-provider; at 375 with only one usable
path there is no row to show, which is by design and not a regression.

## 3 — a denied microphone shows recovery, fast

`f3-deny.mjs`, 390 × 844, context created with `permissions: []` plus `clearPermissions()`,
`getUserMedia` wrapped only to count calls (the denial is the browser's own, not a stub):

```
GUM CALLS: 1
FIRST recovery-panel mention at: 0.40s
EVER stuck CONNECTING at end?  false
```

At t+0.7 s the screen reads:

> Microphone unavailable. Allow microphone access for this site, then reopen the tutor. |
> Allow the microphone for this site in your browser settings, then tap Start again. |
> Try again | Use your own OpenAI key | Read alone

Well inside 5 s, with the three recovery actions. R2's "still CONNECTING 45 s later" does not
reproduce. VERIFIED (`f3-mic-denied-390.png`).

## 4 — the phone filter chip row

`f4-library.mjs`, 375 × 812, measured with `getBoundingClientRect()` up the chain from the
"All" chip. The row is the 335 px-wide `View` wrapping the scroller:

```
375 unfiltered        -> chip row 36 px
375 filter=C1         -> chip row 36 px
375 filter=fables     -> chip row 36 px
375 after tapping a chip -> chip row 36 px
```

36 ≤ 48 in every case, and filtered is identical to unfiltered. R2's 342 px is gone. Lane H
flagged this as its weakest fix because it could not watch it; it is now watched. VERIFIED.

## 2 + 9 — the audible probe, and what I added to it

The probe as lane G2 left it did not assert either half of finding 9 (an opening invitation,
spoken before the learner's turn) or finding 2 (no duplicated tutor sentence). It also fired
the learner turn the instant the text box appeared, roughly 2.5 s in, which raced the opening
turn the server now begins on its own and interleaved the two replies' sentence captions —
an exchange no learner would ever have. I changed `apps/client/e2e/audible-probe.mjs` to:

- wait for the tutor's opening invitation to render **and** for the session to settle back to
  `listening` before sending the learner turn (60 s cap, so a missing invitation fails loudly
  rather than hanging);
- record the Web Audio sample counter immediately before the learner turn, so "the invitation
  was spoken" is a claim about the opening turn's own playback;
- assert three more things: the opening invitation rendered before the learner turn, samples
  were scheduled before the learner turn, and no tutor line in the final rendered transcript is
  wholly contained in another one (finding 2's duplicate shape).

Two consecutive clean runs, **10/10, exit 0** each:

`probe-run2.log`:
```
[PASS] learner turn ("...Provence...") rendered in the transcript
[PASS] a tutor reply rendered in the transcript
[PASS] AudioBufferSourceNode.start() was called at least once
[PASS] at least one sample was actually scheduled
[PASS] reply mentions Provence (mechanical substring check)
[PASS] reply ends with a question (discuss-mode follow-up)
[PASS] no page/console errors
[PASS] an opening invitation rendered before the learner turn
[PASS] the opening invitation was spoken (samples scheduled before the learner turn)
[PASS] no duplicated tutor sentence in the rendered transcript

Opening invitation: "Bienvenue dans l'histoire de Blanquette, la petite chèvre de M. Seguin.
                     Comprends-tu qui est Blanquette ?"
Samples scheduled before the learner turn: 41050
Last tutor reply: "Oui, la Provence est une région en France, au sud du pays. C'est un endroit
                   connu pour son beau climat et ses paysages. Est-ce que tu connais d'autres
                   régions en France ?"
```

`probe-run3.log`:
```
[PASS] learner turn ("...Provence...") rendered in the transcript
[PASS] a tutor reply rendered in the transcript
[PASS] AudioBufferSourceNode.start() was called at least once
[PASS] at least one sample was actually scheduled
[PASS] reply mentions Provence (mechanical substring check)
[PASS] reply ends with a question (discuss-mode follow-up)
[PASS] no page/console errors
[PASS] an opening invitation rendered before the learner turn
[PASS] the opening invitation was spoken (samples scheduled before the learner turn)
[PASS] no duplicated tutor sentence in the rendered transcript

Opening invitation: "Bonjour !"
Samples scheduled before the learner turn: 228656
Last tutor reply: "La Provence est une région du sud de la France. C'est un endroit célèbre pour
                   son climat ensoleillé et ses paysages magnifiques. Avez-vous déjà visité le
                   sud de la France ?"
```

Finding 2 (the duplicated tutor sentence) is gone in every run I made — four in all — and the
probe now fails if it comes back. Finding 9's opening invitation is real, is in the transcript
before the learner's line, and had tens of thousands of PCM samples scheduled before the
learner turn was sent, i.e. it was spoken, not just printed. VERIFIED.

**The flake, recorded rather than buried.** `probe-run1.log` exited 1 with 9/10: the only
failing assertion was "reply ends with a question". The model's second reply that run was
*"La Provence est une région en France, au sud-este. C'est un endroit connu para son beau climat
et ses villages charmants."* — grounded, French, but with no follow-up question, which
`packages/core/src/prompt.ts:88-91` explicitly requires ("never leave a turn with no question").
That is the local 8B model failing to comply, not a defect in any file this lane owns, and
`prompt.ts` is outside the owned set so I did not touch it. Observed rate this session: 1 miss
in 4 runs. The card asked for two exit-0 runs and got two consecutive ones; I am recording the
third run as an honest flake rather than reporting 2/2 and stopping.

## voice-live.mjs

```
SOTTO_SCREENSHOT_DIR=~/Claude/sotto-run7-recon/H2/voice-live node apps/client/e2e/voice-live.mjs
EXIT=0
[PASS] phase A: learner caption contains "cigarra"
[PASS] phase A: tutor caption present (word explained)
[PASS] phase A: state cycled listening -> thinking -> speaking
[PASS] phase B: learner caption contains "cigarra" (save request heard)
[PASS] phase B: saved word "cigarra" in vocabulary store
[PASS] no page/console errors in either phase
```

`SOTTO_SCREENSHOT_DIR` kept it out of `docs/screenshots/web/` — `git status` shows no tracked
PNG modified by this run, which was R's "e2e script dirties tracked files" trap. VERIFIED.

## Defect found on the way, and fixed: the chunker split every "M. Seguin"

Seen live in the first probe run of this lane, before I touched anything:

```
[t+15.2s] caption: Tutor: M.
[t+15.2s] caption: Tutor: Bonjour.
...
Opening invitation: "Dans cette histoire, M."
```

`apps/server/src/voice/chunker.ts`'s `BOUNDARY_RE = /[.!?…]+[\s]+|\n+/` treats the full stop in
"M. Seguin" as a sentence end. The consequence is not cosmetic: each chunk is a separate TTS
call **and** a separate caption, so the tutor spoke a lone "M." aloud and the transcript grew a
one-token bubble. `fr-chevre-de-m-seguin` — the probe's own book — says "M. Seguin" throughout,
and the French catalogue is full of the same shape.

Failing test first (`apps/server/src/voice/chunker.test.ts`, three new cases, all red before the
fix, output captured at the time: `["A.", "Daudet a écrit ce conte."]` where
`["A. Daudet a écrit ce conte."]` was expected). Fix: a boundary that is a lone `.` is skipped
when the word before it is a title abbreviation (`m, mm, mme, mmes, mlle, mlles, mr, mrs, ms,
dr, drs, pr, prof, st, ste, sr, jr`) or a single capital letter (an initial). Deliberately narrow
— "etc." and "p." are *not* in the set, because they really do end sentences often enough that
splitting is the safer default. `!`, `?`, `…` and runs like "..." are untouched and always split.
`flush()` still returns a trailing "…de M." at end of stream, so nothing can be swallowed.

`packages/voice/src/browser-cascade/chunker.ts` is a deliberate byte-for-byte port of the server
one (its own header says so), so it got the identical change and two mirrored tests.

**Not live-verified, and here is why:** the voice server on :8790 runs under plain `tsx`, not
`tsx watch`, so it is still executing the chunker it was started with. Restarting it is outside
what this lane may do. The fix is unit-verified on both copies (10/10 and 8/8) and typechecks;
the live "M." fragments in `probe-run1.log` are the pre-fix behaviour and should disappear the
next time the server is restarted. Whoever restarts it next can confirm in one probe run —
`Opening invitation:` should no longer end mid-name.

## Suites

```
pnpm --filter @sotto/client test   34 files, 281 passed
vitest run apps/server/src         14 files,  99 passed
vitest run packages/voice/test     12 files, 138 passed
pnpm --filter @sotto/core test      6 files,  52 passed
pnpm -r typecheck                  clean, all 5 projects
pnpm lint                          0 errors, 23 warnings (all pre-existing)
pnpm exec prettier --check <touched files>   all clean
```

## Not verified / for Noel

- The chunker fix live (needs the :8790 server restarted — see above). Everything else in this
  report is live.
- The "reply ends with a question" assertion is model-dependent and missed once in four runs.
  If the probe is ever used as a CI gate it will be flaky at roughly that rate until the prompt
  or the local model changes; `prompt.ts` is not this lane's file.
- Nothing in this lane touched storage, validation, `packages/content/packs/**`, or any deploy.
