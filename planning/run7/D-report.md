# Lane D report — the reader, refined without breaking what works

Card: `planning/run7/cards/D-reader.md`. Recon read: `scout-1-navigation.md` §5/§6,
`scout-T-tutor.md` §7, `planning/run6/C1-measurements.md`, `C3-writeup.md`.

## What changed

- `apps/client/src/ui/Sheet.tsx` — wraps `children` in a `ScrollView` (`flexShrink:1,
  flexGrow:0` so it yields height to the sheet's own `maxHeight` instead of forcing the
  sheet to grow), moved horizontal/bottom padding onto the scroll content container, added
  `overflow:'hidden'` on the sheet itself. Used by the reader's mobile word/span popup, and
  (unchanged behaviourally, since their content already fit) by `profile.tsx`/`settings/index.tsx`
  and `(tabs)/vocabulary.tsx`'s picker sheets.
- `apps/client/app/reader/[bookId].tsx`:
  - Desktop translation panel (`desktopPanel`) changed from a plain `View` to a `ScrollView`
    with `maxHeight: '100vh'` (web) so a long span/gloss scrolls instead of bleeding past the
    panel's bottom edge, matching the mobile sheet.
  - Save/remove-word now calls `setToast(...)` with new i18n strings (`reader.savedToast`,
    `reader.removedToast`) through the existing `Toast` component (`src/ui/Toast.tsx`) —
    **not** the store's `pushToast`/`state.toasts`, which nothing in the whole client renders
    (verified: no other file reads `state.toasts`; the report-failure call was already dead
    for the same reason). Migrated the report-failure toast to the same local-state
    convention already used by `profile.tsx`/`home.tsx` (`useState<string|null>` + `<Toast
    message={toast} onHide={...}/>`), fixing that pre-existing dead toast as a side effect of
    switching the mechanism, not a separate scope item.
  - Added a "Talk about this passage" mic icon and a Settings gear icon to the reader header
    (next to Close). Talk routes to `` `/voice/${bookId}?mode=discuss` `` (same pattern as
    `review.tsx`'s existing discuss link). Settings routes to `/settings` (confirmed live —
    lane B/E had already completed the `profile.tsx` → `settings/index.tsx` move with a
    `/profile` → `/settings` redirect by the time this lane ran; verified both routes exist
    on disk).
  - New a11y-labelled icon strings: `book.a11y.talkAboutPassage`, `book.a11y.settings`.
- `apps/client/src/platform/audioBus.ts` (new) + `audioBus.test.ts` (new, 7 cases) —
  arbitration bus: `claimAudio(owner, stop)` / `releaseAudio(owner)` /
  `currentAudioOwner()`, owners `'narration' | 'word' | 'tutor'`. Claiming a different owner
  calls the previous owner's `stop`. Pure module, no React/native deps.
- `apps/client/src/platform/audio.ts` — wired the bus in:
  - `useNarrationPlayer`'s `play()` claims `'narration'` (stop = `player.pause()`); `pause()`
    releases it.
  - `playAudioSlice` (span-selection tap) and the shared `playSlice` engine behind
    `playWordAudio` (single-word tap, sprite or narration-slice fallback) both claim
    `'word'` at the start of their own `stop`-based lifecycle and `releaseAudio('word')`
    inside their own `stop()`.
  - `packages/voice` (tutor speech, lane F1's file) is **not** touched — `audioBus.ts`'s doc
    comment documents the interface F1 should call (`claimAudio('tutor', ...)` on speech
    start, `releaseAudio('tutor')` on end) so tapping a word or narration starting cuts tutor
    audio and vice versa. **Escalation-lite**: this is the one cross-lane hook the card
    anticipated (§ Owned files); I did not edit `packages/voice`, only defined and exported
    the interface, per the card's instruction.
  - Added 3 new arbitration cases to the existing `audio.test.ts` (word claims the bus and a
    later narration/tutor claim stops the in-flight word clip; span selection also claims
    `'word'`).

## Live-browser proof (Playwright, `apps/client/e2e/*.tmp.mjs`, deleted after use per the
card's "throwaway scripts... under `~/Claude/sotto-run7-recon/<lane>/`" — screenshots kept
there, scripts were temporary and not committed)

Ran against the orchestrator's Metro (`:8081`) + content server (`:8790`), book
`fr-fables-la-fontaine`, seeded via the same `idb-keyval` write `e2e/screenshots.mjs` uses.

- **Popup scroll / long gloss** (screenshots: `375-popup-span-verylong.png`,
  `375-popup-span-verylong-scrolled.png`, `1440-popup-span-verylong-scrolled.png`): selected
  a long multi-sentence span (block 8 of chapter 1, ~350 chars). Measured via
  `getComputedStyle`/`scrollHeight` on the live DOM: the sheet's outer container is capped at
  `maxHeight: 60%` (`overflowY: hidden`, height 487/486px on a 812px viewport) and its inner
  `ScrollView` (`overflowY: auto`) has `scrollHeight: 698` vs `clientHeight: 466` — i.e. 232px
  of content is only reachable by scrolling, not clipped. Scrolling the ScrollView to bottom
  (`el.scrollTop = el.scrollHeight`) brought the previously-hidden "Report" link into view —
  confirmed on screen (before/after screenshots). ✓ VERIFIED live, not inferred. Desktop panel:
  same span at 1440×900 fit inside the panel's own `maxHeight:'100vh'`/`ScrollView` (content
  318px < 900px, so it didn't need to scroll for this example) — the desktop scroll plumbing
  is proven the same way (an `overflowY:auto` ancestor exists, capped at the viewport height),
  just not exercised by a case that actually overflows a 900px-tall desktop viewport.
- **Save feedback** (`375-save-feedback.png`, `1440-save-feedback.png`): tapping Save shows
  the button flip to "Saved" (existing) **and** a toast "Saved to your vocabulary." at the
  bottom of the screen, auto-dismissing (`Toast`'s existing 4s timer, unchanged). Announced to
  screen readers via `Toast`'s existing `accessibilityLiveRegion="polite"` (not new — the
  component already had it; the reader just wasn't using the component before).
- **Talk about this passage** (`375-after-talk-click.png`, `1440-after-talk-click.png`):
  clicking the mic icon navigated to `http://localhost:8081/voice/fr-fables-la-fontaine?mode=discuss`
  (`page.url()` checked directly) and the voice screen rendered with "Discuss" pre-selected
  and the chapter's passage text shown, zero console/page errors.
- **Audio arbitration, live** (`375-narration-playing-highlight.png`,
  `375-arbitration-word-tap-during-narration.png`): started narration (transport clock
  0:00→0:01, confirming real playback), tapped a word and pressed its speaker button —
  the transport clock froze (0:02 read twice, 1.5s apart) and its accessibility label flipped
  from "Pause" to "Play", confirming narration was actually paused by the word tap, not just
  in the unit-test mock. (First attempt at this check mis-detected — I was matching any
  `aria-label` containing "play"/"pause" and picked up the popup's own "Play narration"
  speaker button instead of the transport control; the exact-match retest is what's reported
  above.) Zero console/page errors except one benign `DOMException: The play() request was
  interrupted by a call to pause()` (Chrome's documented informational warning for exactly
  this play-then-pause race, https://goo.gl/LdLk22) — pre-existing pattern in this file (every
  `playSlice`/`playAudioSlice` call already does an unawaited `player.play()` as part of its
  iOS-unlock trick; not something this lane's arbitration introduced a new class of, just a
  new trigger for the same unhandled-rejection style already present everywhere in the file).
- **Narration + highlighting regression** (`375-narration-playing-highlight.png`): narration
  plays (clock advances), spoken tokens render in ink (`rgb(34,30,27)`) vs unspoken in muted
  grey (`rgb(181,171,159)`) — the existing speech-fill highlight is unchanged and still works.

## Word-pronunciation measurement (directive 6)

Card asked for "trouve", "avec", "chèvre" from `fr-fables-la-fontaine` and
`fr-petit-chaperon-rouge`. **"chèvre" does not appear in either book's `words.json`**
(checked directly — present in `fr-chevre-de-m-seguin`, not these two); substituted
"rencontre" (soft nasal/liquid onset, present in `fr-petit-chaperon-rouge`) as the third
word, per the card's "words with soft onsets" guidance.

Reused `~/Claude/sotto-run6-recon/onsets.py`'s `decode_words_mp3`/`measure_book` functions
directly (same RMS/5ms-block methodology C1/C3 used) against the current pack files —
**packages/content/packs is being regenerated live under this run** (PLAN.md item 9); these
numbers are a snapshot, read-only, no pack files touched.

**Sprite (what the UI actually plays for these two books — both have `book.wordAudio` set,
confirmed by reading `book.json`, so `resolveWordPlayback`/`playWordAudio` take the sprite
branch, `leadMs:0, tailMs:0`, i.e. plays the padded sprite region verbatim):**

| book | word | onset ratio | band | tail ratio | band | trimmed span (ms) |
|---|---|---:|---|---:|---|---|
| fr-fables-la-fontaine | trouve | 0.089 | none | 0.095 | none | [369365, 369720] |
| fr-fables-la-fontaine | avec | 0.155 | soft | 0.101 | none | [33920, 34320] |
| fr-petit-chaperon-rouge | trouve | 0.000 | none | 0.011 | none | [182595, 182995] |
| fr-petit-chaperon-rouge | avec | 0.000 | none | 0.015 | none | [11525, 11975] |
| fr-petit-chaperon-rouge | rencontre | 0.000 | none | 0.005 | none | [154035, 154920] |

Hard-onset/hard-tail threshold is ratio ≥ 0.35 (C1's definition). **None of these 5
measurements reach "hard"** — `fr-petit-chaperon-rouge` reads exactly 0.000 across the board
(consistent with run6-C3's roll+fade fix already having regenerated this specific book, per
`C3-writeup.md`'s own before/after table showing the same book at 0% hard-onset after the
fix); `fr-fables-la-fontaine` is "none"/"soft" (not yet fully at 0.000, consistent with the
in-flight `--force` corpus regen not necessarily having reached it yet by this measurement's
timestamp, or simply not needing the fade to zero out completely for these particular words).

**Narration-slice fallback, for comparison (NOT what the UI plays for these books — this is
the raw token `[startMs, endMs]` span from the chapter JSON, unpadded, which is what would
play if a book had no sprite; measured to show why the fallback path needs its own leading/
trailing padding, which `playWordAudio`'s `WORD_FALLBACK_LEAD_MS=80`/`WORD_FALLBACK_TAIL_MS=150`
already adds before playback — see `apps/client/src/platform/audio.ts:157-166`):**

| book (chapter) | word | onset ratio | band | tail ratio | band | raw span (ms) |
|---|---|---:|---|---:|---|---|
| fr-fables-la-fontaine (01) | trouve | 0.119 | none | 0.206 | soft | [1010, 1320] |
| fr-fables-la-fontaine (01) | avec | 0.110 | none | 0.648 | **hard** | [38775, 38925] |
| fr-petit-chaperon-rouge (02) | avec | 0.023 | none | 0.830 | **hard** | [12793, 12923] |
| fr-petit-chaperon-rouge (02) | trouve | 0.715 | **hard** | 0.563 | **hard** | [35287, 35597] |
| fr-petit-chaperon-rouge (01) | rencontre | 0.589 | **hard** | 0.357 | **hard** | [38756, 39156] |

These raw narration spans (what the fallback path would sound like with *no* padding at all)
are severely truncated at word boundaries — this is very likely what Noel is describing when
tapping a word feels "a little bit clipped": if any book's sprite generation hasn't run, or a
token has no sprite entry, the fallback plays a hard-truncated slice unless padded. **Verdict:
already fixed in the client, not a new bug.** `playWordAudio` (`apps/client/src/platform/
audio.ts:263-282`) already routes the fallback through `playSlice` with
`WORD_FALLBACK_LEAD_MS=80`/`WORD_FALLBACK_TAIL_MS=150`/a 60ms fade-out (comment cites this as
the "R3-W ledger note" fix, i.e. done in an earlier run, not this one) — so a learner tapping
a word in a book *without* a sprite still gets a padded, faded slice, not the raw hard-cut
span in this second table.

**Conclusion for directive 6**: for these two books and all three measured words, the sprite
is what plays, and it is not objectively truncated (onset/tail ratios below the hard
threshold, `fr-petit-chaperon-rouge` at exactly 0.000). No client playback change was needed
or made. If Noel still perceives clipping on a live device after this, the next step is a
live audio capture/listen test (this pass is text/RMS-based, matching run6's own kit and
verdict method, not a live listen) — possibly on a book the corpus regen hasn't reached yet,
or a genuine ear-vs-measurement mismatch worth flagging back to Noel with the numbers above,
per the card's explicit fallback instruction.

## Typography / measure (directive 8)

Not changed. Read `planning/design/DESIGN.md` and the reader's existing `passageCapped`
style (`maxWidth: 620` at desktop) — already within the 60-75 character range for the body
text size in use; did not find a violation to fix and made no changes here, to keep the diff
to what needed fixing (COMMON.md/CLAUDE.md: smallest diff that solves the problem now).

## Tests

- New: `apps/client/src/platform/audioBus.test.ts` (7 cases, pure module — written and run
  green immediately; note: I wrote the source and test in the same pass rather than strictly
  red-then-green, since the module is small and its full test surface was designed alongside
  it — the resulting suite does exercise every branch).
- Extended: `apps/client/src/platform/audio.test.ts` (+3 cases: word claims bus and is
  stopped by a later narration/tutor claim; span selection also claims `'word'`).
- `resolveWordPlayback.test.ts` (pre-existing, 4 cases) — untouched, still green (this
  lane's sprite-path findings don't change its decision logic).
- Full `pnpm --filter @sotto/client test`: **34 files / 267 tests, all passing** (verified
  clean at the end of the session; a handful of unrelated files — `Rail.test.ts`,
  `Sidebar.test.ts`, `TabBar.test.ts`, `voiceStartGate.test.ts` — intermittently failed mid-
  session from concurrent edits by other lanes in this shared working tree, not from
  anything in this lane's files; all green by the final run).
- `pnpm --filter @sotto/client exec tsc --noEmit -p .`: clean (0 errors) at the final run.
- `pnpm lint`: 0 errors/warnings in any file this lane touched (3 pre-existing errors and 25
  warnings elsewhere — `apps/client/e2e/audible-probe.mjs`, a `.cache` file, and
  `packages/content/scripts/fill-locales.mjs` — none owned by this lane).
- `pnpm exec prettier --check` on every touched file: clean.
- `node packages/content/src/cli.ts validate` (from `packages/content/`): 0 errors, 223
  pre-existing content-quality warnings unrelated to i18n (catalog parity holds for the 4 new
  keys across all 9 locales).

## Screenshots (`~/Claude/sotto-run7-recon/D/`)

`375-reader-loaded.png`, `375-popup-word.png`, `375-save-feedback.png`,
`375-popup-long-gloss.png`, `375-popup-span-sentence.png`, `375-popup-span-long-sentence.png`,
`375-popup-span-verylong.png`, `375-popup-span-verylong-scrolled.png`,
`375-narration-playing-highlight.png`, `375-arbitration-word-tap-during-narration.png`,
`375-after-talk-click.png`, plus the `1440-*` equivalents of the popup/save/talk shots.

## Not verified / needs Noel

- **Chapter+position handoff to the voice screen is chapter-only, not token-precise.** Voice
  screen (`app/voice/[bookId].tsx`, F2's file — not edited) reads `progress[bookId]?.chapterId`
  (correct, already persisted by the reader's existing `setProgress` calls) and
  `progress[bookId]?.tokenId` for `buildPassageWindow`'s exact sentence-window centring. I
  traced `ReadingProgress` (`packages/core/src/models.ts:174`, a `.strict()` zod-validated
  type in `packages/core/src/export.ts`) and **it has no `tokenId` field at all** — so
  `progress[bookId]?.tokenId` is always `undefined` today, and `buildPassageWindow` falls back
  to the start of the chapter (its own documented behaviour for `undefined`, not a crash).
  "Talk about this passage" therefore correctly opens the right *chapter* but always shows the
  chapter's opening passage window, not the exact scroll position tapped from. Fixing this
  needs a `tokenId` field on `ReadingProgress` in `packages/core` (plus its zod schema in
  `packages/core/src/export.ts`) — outside every file this card lists as owned by lane D, and
  `packages/core` isn't listed as owned by any run-7 lane. I did not make this change.
  **Escalate to Noel**: is this worth a follow-up card, and which lane should own
  `packages/core/src/models.ts`?
- **Tutor-speech arbitration is interface-only.** `audioBus.ts` defines and exports
  `claimAudio`/`releaseAudio` with a `'tutor'` owner and documents exactly where F1 should
  call them (`packages/voice`'s `speakSentence`/playback start and end) — not wired into
  `packages/voice` itself, per the card's file-ownership boundary. Confirmed via a unit test
  (`audio.test.ts`'s third new case) that a `claimAudio('tutor', ...)` call from outside this
  file's own code does correctly stop an in-flight word clip, so the interface itself works;
  F1 needs to make the two calls on their side for the full three-way arbitration to be live.
- Chinese/pinyin long-gloss overflow (CJK books) — not specifically screenshotted; the popup
  scroll fix is generic (any content, any script) and the live-DOM measurement above already
  proves scrolling engages under overflow for a very long Latin-script span, but a CJK book
  wasn't separately checked given the time budget.
- Desktop panel's `maxHeight:'100vh'` scroll was proven structurally (an `overflowY:auto`
  ancestor capped at the viewport height exists) but not exercised by a case that actually
  overflows a 900px-tall desktop viewport in this pass — the span I used didn't need to
  scroll at that width. Low risk (same CSS mechanism as the mobile sheet, which was proven
  under real overflow), flagging for completeness.

## Commits

Path-scoped commits, prefix `run7(D):`, pushed to `origin/HEAD`. See git log for this lane's
files: `apps/client/app/reader/[bookId].tsx`, `apps/client/src/ui/Sheet.tsx`,
`apps/client/src/platform/audio.ts`, `apps/client/src/platform/audio.test.ts`,
`apps/client/src/platform/audioBus.ts`, `apps/client/src/platform/audioBus.test.ts`,
`apps/client/src/i18n/*.json`.
