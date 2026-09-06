# Run 6 adversarial review (R6-R, read-only at `fad28ee`, 2026-09-06)

Dispatched as a read-only critic (Read/Grep/Glob only, the orchestrator's choice of agent type), so every
verdict below is a trace and cross-check, not a re-run. The re-runs the reviewer could not do were done by
the orchestrator at Gate 2 and are recorded in `planning/LEDGER.md`: isolated `pnpm check` on `fad28ee`
(72 files / 551 tests, `content:validate` 0 errors), `onsets.py --book fr-FR/fr-petit-chaperon-rouge`
(0 hard onsets on the committed pack), curl greps and `hosted.mjs` on the live free origin.

## Claims versus evidence

| Claim | Where | Verified how | Verdict | Severity |
|---|---|---|---|---|
| Landing live matches `899cea4`; decision block present; "works either way" gone | LEDGER 13:30 | evidence log read in full; HTML source compared to LANDING-V3 strings; orchestrator's own curl | HOLDS | LOW |
| Fold closed by default, JS-off parity, keyboard reachable | LANDING-V3 DoD | native `details`/`summary` markup read; focusable and togglable with no script | HOLDS | — |
| Plan row steered, own-provider mode lighter | LANDING-V3, ledger | shipped HTML read: serif 1.375rem title first, 0.8125rem ink-3 sub-line | HOLDS | — |
| B3: capture starts from a tap and keeps user activation | B3 writeup; verification.md row | call chain traced: `start()` → `startSession` → `LocalCascadeProvider.connect()` → `await fetch(POST /voice/session)` → `await res.json()` → WebSocket `open` → `startCapture()` → `getUserMedia`. Two network round trips sit between the tap and capture. The Playwright proof uses fake-media flags, which auto-grant regardless of activation timing, so it proves "no call before the tap", not "activation survives to the call" | OVERSTATED: mount-time auto-start is gone (verified by screenshots); the round-trip question is untested on a real device and the verification row says FIXED | HIGH |
| Local path announces `listening` once; gate flushes on capture ready | B3 writeup | `voiceStartGate.ts`, `sessionManager.ts`, `apps/server/src/voice/session.ts` read; tests exercise real transitions | HOLDS for the local path | — |
| The same gate covers own-provider mode | verification.md | `wrapAudioForGating` is provider-agnostic by construction; never live-tested on the own-provider path this run | INFERRED, not VERIFIED | MED |
| Sprite cached with the book, playable offline, no double download | LEDGER R6-C2 | `sw.js` read: book-open warm checks `cache.match` first; the Range pass-through schedules `fillCacheFromNetwork` on every pass-through with no in-flight guard, so two rapid taps on an uncached sprite start two full downloads (idempotent `cache.put`, bandwidth only). Navigate guard untouched | PARTIALLY OVERSTATED (race undisclosed) | MED |
| C1: fricative hypothesis refuted, vowel/nasal worst, fix (a) | C1 | methodology and arithmetic checked (1296/18598 = 6.97%); explanation labelled INFERRED by the lane | HOLDS | LOW |
| C3: 3.60% → 0.00% hard onsets | C3, ledger | evidence log consistent (222/222, 2m19s); the fade forces a zero sample at the edge so the metric reads 0 by construction after the fix; C3 discloses this, the ledger's one-liner does not; perceptual judgment is the listening kit, handed to Noel | HOLDS with caveat | LOW |
| Voiceless books' button never renders | C3 | book.json and the reader gate quoted with file:line | HOLDS by trace | LOW |
| Self-host fallback also correct for Docker | LEDGER R6-D | Dockerfile read: build stage runs `web:export`, runtime copies `apps/client/dist` whole, so `app.html` exists where `app.ts` looks | HOLDS | — |
| Tier 5 rows honest | Gate 2 | PARTIAL rows candid; one row ("Capture starts from a tap") reads FIXED where B3's own prose lists the caveat | OVERSTATED (one row) | HIGH (same as above) |
| B2 desktop row reflects real desktop capture | B2 | B2 caveats it itself | HOLDS | — |

## Ranked findings

1. HIGH. `docs/verification.md` "Capture starts from a tap (run 6 B3)" is marked FIXED. Verified: no auto-start on mount. Untested: whether the tap's activation survives the session-creation round trip (`packages/voice/src/local-cascade.ts` connect path) before `getUserMedia` fires on real iOS Safari. Reword to PARTIAL with that sentence.
2. HIGH, same root. B3's fix was live-tested only on the local path; the own-provider path, the one Noel named, was not exercised end to end with the Start tap. Provider-agnostic by construction; say so as a sentence in the ledger and the verification row.
3. MED. `apps/client/public/sw.js` `fillCacheFromNetwork` has no in-flight guard; add a `Set` of URLs being filled, or disclose the harmless race.
4. LOW. This review lane could not execute probes; the orchestrator's Gate 2 evidence covers the tests, validate, onsets and live curl.
5. LOW. C3's onset metric self-confirms after a fade; the ledger summary should say the listening kit is the real check.

## What a skeptical reader should believe

The landing redesign is real and verified on the live origin. The trim fix and the C1 measurement are sound and honestly caveated. The weakest claim is the voice-capture fix: it kills the mount-time auto-start, which the screenshots prove, but a network round trip sits between the tap and `getUserMedia`, the fix was never run on the own-provider path, and Noel's original complaint is not yet demonstrated fixed on a device. Nothing here is fabricated; the overselling is one level up, in summary rows, relative to the lanes' own writeups.
