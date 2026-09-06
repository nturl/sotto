# R6-C3 — word-audio trim fix (roll + fade) + regeneration of fr-petit-chaperon-rouge

Lane R6-C3. Implements fix (a) from `planning/run6/C1-measurements.md`'s verdict.

## What changed and why

C1 measured a corpus-wide 6.97% hard-onset rate (1296/18,598 sprite word entries) from
`trimSilence`'s RMS-threshold cut (`SILENCE_RMS_THRESHOLD=500/32767`, 5ms blocks, no fade) —
worst on vowel (11.5%) and nasal (9.6%) onsets, negligible on tails everywhere (max 1.8%,
one cell). C1's verdict explicitly favored fix (a) — a fixed pre/post-roll of original audio
around the trim points plus a linear fade — over lowering the RMS threshold, because the
worst-affected classes (vowel/nasal) aren't the low-amplitude classes a lower threshold would
specifically rescue.

`packages/content/src/word-audio.ts`'s `trimSilence` now keeps `TRIM_ROLL_MS = 25` of the
*original* (untrimmed) audio on each side of the RMS-threshold trim points — clamped to the
clip's own bounds — and applies a `TRIM_FADE_MS = 10` linear fade-in/fade-out at the new
edges, before `LEAD_PAD_MS`/`TAIL_PAD_MS` silence is baked on. The RMS threshold itself is
unchanged. Both constants are exported (along with the previously-internal `LEAD_PAD_MS`/
`TAIL_PAD_MS`) so `packages/content/src/word-audio.test.ts` can assert against them directly.

Failing-test-first: `word-audio.test.ts` builds a synthetic Int16 fixture (silence / ramping
tone / silence), independently re-derives the block-based RMS trim boundaries, and asserts (1)
the kept region starts exactly 25ms before the threshold crossing (or clamps to 0 when the
crossing is within 25ms of the start — second test case), (2) ends exactly 25ms after the last
crossing, (3) the very first and very last samples of the kept clip are silenced by the fade
(gain 0, exact), (4) the sample exactly `TRIM_FADE_MS` in from each new edge — the first/last
sample the fade no longer touches — matches the original unfaded raw sample exactly, and (5) a
duration regression: `LEAD_PAD_MS + trimmed-duration + TAIL_PAD_MS` composes correctly. All 3
new tests fail before the fix (constants undefined) and pass after. Full package suite:
119/119 passing, `tsc --noEmit` clean.

## Before/after rates — fr-FR/fr-petit-chaperon-rouge

Measured with `~/Claude/sotto-run6-recon/onsets.py --book fr-FR/fr-petit-chaperon-rouge`
(same RMS/5ms-block/hard-onset-ratio-≥0.35 definition as C1):

| | hard-onset count | hard-onset rate | n |
|---|---:|---:|---:|
| before | 8 | 3.60% | 222 |
| after | 0 | 0.00% | 222 |

The 8 pre-fix hard onsets (`envie` 0.481, `explique` 0.417, `près` 0.395, `rusés` 0.392,
`vers` 0.374, `à` 0.358, plus two soft/near-hard others) all drop to onset ratio 0.000 after
regeneration — the fade forces a true zero-to-full ramp at the new edge regardless of where the
underlying content sits, so the "first 5ms RMS" measurement (which samples right at the trimmed
start) reads silent every time now. `de`/`et`/`un` (never hard before: 0.142/0.141/0.116) also
drop to 0.000. `pnpm content:validate`: 0 errors (pre-existing unrelated warnings only).
Package tests: 119/119 passing both before and after the regeneration.

## Regeneration

Command: `node packages/content/src/cli.ts word-audio fr-petit-chaperon-rouge --force` (run
from `packages/content/`; Kokoro confirmed answering at `http://127.0.0.1:8880/v1/models`
before starting). Wall clock: **2:19.28** for 222 unique word tokens, 0 fallback words, no
ffmpeg/Kokoro errors. Log: `docs/evidence/word-audio-run6-2026-09-06.log`.

### Scaling to the full corpus (one command for Noel)

```
node packages/content/src/cli.ts word-audio --force
```

(run with no bookId arg — regenerates every book with a Kokoro voice; requires the local
Kokoro server up first). C1's corpus is 38 books / 18,598 word entries. This book measured
~0.63s/word (139s / 222 words) for a non-CJK Latin-script locale. The recon separately measured
zh-CN/zh-TW as far slower per word (~56s/word, 234 zh entries total: 117+117). Rough estimate
scaling this book's rate to the rest of the non-CJK corpus (18,598 − 234 = 18,364 entries ×
~0.63s) plus the zh entries at their measured rate (234 × 56s) is **~3.2h + ~3.6h ≈ ~6.8 hours**
wall-clock for the full corpus, single-threaded (Kokoro is effectively sequential per
`SYNTH_CONCURRENCY = 1`'s comment — concurrent requests contend badly on this local server).
? INFERRED for the non-zh estimate (extrapolated from one book's rate, not measured per-locale);
✓ VERIFIED for the zh 56s/word figure and the 18,598/38-book corpus size (both from C1/the
recon, not re-measured here).

## Clips and listening kit

- Clips (18: 9 words × before/after): `~/Claude/sotto-run6-recon/clips/{word}-{before,after}.wav`
  — `de`, `et`, `un`, plus the 6 worst-onset words from the BEFORE table (`envie`, `explique`,
  `près`, `rusés`, `vers`, `à`). Extracted with ffmpeg from each words.json's `[startMs, endMs]`
  span (before: `words.mp3`/`words.json` copied to
  `/private/tmp/.../scratchpad/c3-before/` prior to regeneration; after: the regenerated
  in-repo files), 24kHz mono `pcm_s16le`.
- Kit: `~/Claude/sotto-run6-recon/listen.html` — single local file, no build step, no external
  assets, one row per word with before/after `<audio>` elements (relative `clips/` src) and
  before/after onset ratio numbers; header states the book, the before/after hard-onset rate,
  and the single-book regeneration command. All 18 referenced clip paths verified to exist via
  `python3 -c` (`os.path.exists`).

## Accepted gap: ca-ES/ca-patufet and ro-RO/ro-capra-trei-iezi have no speaker button

`packages/core/src/languages.ts`: `ro-RO` (`ttsVoice: null, ttsLangCode: null`, lines 340-341)
and `ca-ES` (same, lines 359-360) are the only two locales with no Kokoro voice.
`packages/content/src/word-audio.ts:356-358`'s `wordAudioForBook` skips any book whose
language has `!ttsVoice || !ttsLangCode`, logging `"skipping ... — no Kokoro voice"` — by
design, not a crash. Read `packages/content/packs/ca-ES/books/ca-patufet/book.json` directly:
it has **no `audio` field and no `wordAudio` field at all** (neither key present). The reader's
speaker button render gate (`apps/client/app/reader/[bookId].tsx`, word-selection panel,
`selectedToken.token.startMs !== undefined && audioUri`) requires both a token alignment
timestamp and a resolved `audioUri`; since this book has no chapter-narration audio and no
sprite, `audioUri` is never set and `token.startMs` is never populated by alignment, so the
condition is false for every token and the speaker button does not render anywhere in this
book. **✓ VERIFIED** (read `book.json` directly — confirmed no `audio`/`wordAudio` fields; read
the gate condition in the reader source directly — confirmed both `audioUri` and
`token.startMs` are required and neither exists for this book). The fix is content (a narrated
recording plus alignment for these two locales), out of scope here.

Also note: **CONFIRM 18** (multi-word selections keep the narration slice, i.e. span-selection
playback in the reader still uses `playSpanAudio`/the narration-slice fallback rather than the
per-word sprite, per the existing `isSpanSelection` branch's `playAudioSlice` call) is
documented behavior, not changed by this lane.
