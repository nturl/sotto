# Run 9, lane C — intelligible speech from Kokoro

Worktree `~/Claude/sotto-run9/wt/C`, branch `run9/C`. Evidence (WAVs, JSON,
logs, the browser script) in `~/Claude/sotto-run9/C/`.

## The short version

Two separate defects, either one of which alone would have made the tutor
unintelligible. PLAN.md flagged both, one as INFERRED and one not at all;
both are now measured.

1. **Kokoro at `q8` on WebGPU produces noise.** VERIFIED, on this machine,
   through the real bundled worker — not inferred from the vendor's warning.
   The reference husky sentence round-trips as *"Shama, Ah, those yorks,
   yorks, yorks, yorks…"* (WER 4.346). At `fp32` on the same GPU, same
   sentence, same bundle: WER 0.000. `loadTts` asked for q8. That is Noel's
   gibberish. kokoro-js's own README warned about it and nobody had read it
   (1.2.1 `README.md` line 29: *"If using `webgpu`, we recommend using
   `dtype="fp32"`"*). WebGPU now gets fp32; wasm keeps q8.
2. **The tutor's markdown was being spoken out loud.** VERIFIED, and it is a
   second, independent defect. `- **The dog** is unhappy but *loyal*. 🐺` — the
   exact shape of the five caption lines in Noel's report — round-trips
   through Kokoro and Whisper as *"Astroskastrisk the dog Astroskastrisk is
   unhappy but Astrosk loyal Astrosk. Wolfface"*. WER 0.833. That is
   dtype-independent: q8, fp32 and fp16 all produce it, because it is not a
   numerics problem at all. `prepareForSpeech` takes it to WER 0.000.

A third finding is a warning rather than a fix: **fp16 is not safe**. On the
longest fixture sentence it produced an all-NaN waveform (RMS `NaN`, WER
1.000) while the shorter sentences at the same dtype were fine. Nothing in
the codebase offers fp16 today; nothing should start.

`playPcm`'s Int16→float conversion and its 24 kHz buffer are **correct** —
now proven by three new unit tests rather than by inspection.

## Files changed

| File | What |
|---|---|
| `packages/voice/src/browser-cascade/tts-text.ts` | NEW. `prepareForSpeech(sentence): string[]` — strips markdown/emoji, normalizes quotes/dashes/ellipses, expands `°`/`%`/`&`, splits past `MAX_SPEECH_CHARS`. |
| `packages/voice/test/browser-cascade-tts-text.test.ts` | NEW. 12 tests, written and run red before the module existed. |
| `packages/voice/src/browser-cascade/worker.ts` | `loadTts` dtype per device + a debug override; `speakSentence` and the `sample` case both go through `prepareForSpeech`. |
| `packages/voice/test/web-audio.test.ts` | +3 tests on `playPcm` (card output 4). |
| `packages/voice/scripts/tts-roundtrip.mjs` | NEW. The objective ear: Kokoro → Whisper base → WER. Also scores WAVs captured elsewhere (`SCORE_MANIFEST`). |
| `packages/voice/scripts/load-tts-text.mjs` | NEW. Two lines, so the script can import the TS module with no build step. |

Commits (branch `run9/C`, **not pushed**):

- `e62fdb1` — prepareForSpeech + fp32 Kokoro on WebGPU, and a Node round trip that scores the audio
- `c47853c` — back MAX_SPEECH_CHARS with a measured phoneme ratio, score captured WAVs, satisfy lint
- `0bf1f5d` — point the dtype-override note at where the matrix script actually lives
- `c1d6d98` — a decoration-only sentence no longer claims SPEAKING
- (this report)

`c1d6d98` is the one behaviour change beyond the card's four outputs, and it
is three lines: `prepareForSpeech` can legitimately return no pieces (a lone
emoji, a stray `**`), and opening an utterance for that would post
`audio_start`/`audio_end` with nothing between while parking the UI in
SPEAKING — exactly the dishonesty the locale guard immediately below it
already exists to prevent. Flagging it for lane D, whose card owns the
speaking-state question from the UI side.

## Table 1 — Node round trip (Kokoro on cpu → Whisper base on cpu)

`OUT_DIR=~/Claude/sotto-run9/C DTYPES=q8,fp32,fp16 node packages/voice/scripts/tts-roundtrip.mjs`
Raw output: `~/Claude/sotto-run9/C/baseline.md`, `baseline.log`, `roundtrip.json`.
WER is Levenshtein over words against the sentence we asked Kokoro to say.

BASELINE — text handed to Kokoro verbatim, as `speakSentence` used to:

| sentence | dtype | secs | rms | WER | heard |
|---|---|---|---|---|---|
| husky | q8 | 9.45 | 0.0714 | **0.000** | The dog was a big native husky, the proper wolf dog, gray-coated, and without any visible… |
| numbers | q8 | 5.38 | 0.0690 | 0.188 | It was 50 degrees below zero and the trail had not been traveled for three days. |
| quotes | q8 | 4.97 | 0.0735 | 0.000 | The man said, we must keep moving, and the dog followed him without a sound. |
| emdash | q8 | 4.92 | 0.0662 | 0.000 | The Husky was loyal, unhappy, but loyal, and it watched the man closely. |
| question | q8 | 3.77 | 0.0658 | 0.000 | What do you think the dog was feeling out there on the frozen trail? |
| long60 | q8 | 20.15 | 0.0718 | 0.016 | The dog was unhappy because the cold was far beyond the cold of its ancestors, and it knew… |
| **markdown** | **q8** | 7.05 | 0.0674 | **0.833** | **Astroskastrisk the dog Astroskastrisk is unhappy but Astrosk loyal Astrosk. Wolfface** |
| symbols | q8 | 5.85 | 0.0665 | 0.063 | The temperature fell to 50 degrees and 90% of the men and dogs were exhausted. |
| husky | fp32 | 9.50 | 0.0745 | 0.000 | (same as q8) |
| numbers | fp32 | 5.38 | 0.0702 | 0.188 | It was 50 degrees below zero, and the trail had not been traveled for three days. |
| quotes | fp32 | 4.97 | 0.0747 | 0.000 | The man said, we must keep moving, and the dog followed him without a sound. |
| emdash | fp32 | 5.08 | 0.0686 | 0.000 | The Husky was loyal, unhappy, but loyal, and it watched the man closely. |
| question | fp32 | 3.83 | 0.0657 | 0.000 | What do you think the dog was feeling out there on the frozen trail? |
| long60 | fp32 | 20.07 | 0.0741 | 0.016 | (same as q8) |
| **markdown** | **fp32** | 7.00 | 0.0690 | **0.833** | **Astroskastrisk the dog Astroskastrisk is unhappy but Astrosk loyal Astrosk. Wolfface** |
| symbols | fp32 | 5.83 | 0.0684 | 0.063 | The temperature fell to 50 degrees and 90% of the men and dogs were exhausted. |
| **husky** | **fp16** | 9.50 | **NaN** | **1.000** | **!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!** (all-NaN waveform) |
| numbers | fp16 | 5.38 | 0.0703 | 0.188 | It was 50 degrees below zero, and the trail had not been traveled for three days. |
| quotes | fp16 | 4.97 | 0.0748 | 0.000 | The man said, we must keep moving, and the dog followed him without a sound. |
| emdash | fp16 | 5.05 | 0.0688 | 0.000 | The Husky was loyal, unhappy, but loyal, and it watched the man closely. |
| question | fp16 | 3.83 | 0.0659 | 0.000 | What do you think the dog was feeling out there on the frozen trail? |
| long60 | fp16 | 20.07 | 0.0739 | 0.016 | (same as q8) |
| **markdown** | **fp16** | 7.00 | 0.0690 | **0.833** | **Astroscastrosc the dog Astroscastrosc is unhappy but Astrosc loyal Astrosc. Wolfface** |
| symbols | fp16 | 5.83 | 0.0686 | 0.063 | The temperature fell to 50 degrees and 90% of the men and dogs were exhausted. |

AFTER — same Kokoro, same dtype, text through `prepareForSpeech` first
(`PREPARED=1 DTYPES=q8`; raw output `prepared.md`, `roundtrip-prepared.json`):

| sentence | dtype | pieces | secs | rms | WER | heard |
|---|---|---|---|---|---|---|
| husky | q8 | 1 | 9.45 | 0.0714 | 0.000 | The dog was a big native husky, the proper wolf dog, gray-coated, and without any visible… |
| numbers | q8 | 1 | 5.38 | 0.0690 | 0.188 | It was 50 degrees below zero and the trail had not been traveled for three days. |
| quotes | q8 | 1 | 4.97 | 0.0735 | 0.000 | The man said, we must keep moving, and the dog followed him without a sound. |
| emdash | q8 | 1 | 5.05 | 0.0656 | 0.000 | The Husky was loyal, unhappy but loyal, and it watched the man closely. |
| question | q8 | 1 | 3.77 | 0.0658 | 0.000 | What do you think the dog was feeling out there on the frozen trail? |
| long60 | q8 | **2** | 20.65 | 0.0719 | 0.016 | The dog was unhappy because the cold was far beyond the cold of its ancestors, and it knew… |
| **markdown** | **q8** | 1 | 2.52 | 0.0635 | **0.000** | **The dog is unhappy but loyal.** |
| symbols | q8 | 1 | 5.85 | 0.0665 | 0.063 | The temperature fell to 50 degrees and 90% of the men and dogs were exhausted. |

**Reading the two non-zero rows that did not move.** Neither is an audio
defect, and I am flagging them so nobody chases them:

- `numbers` 0.188 — Kokoro was given the words *"fifty degrees"* and *"3
  days"*; Whisper writes them back as *"50 degrees"* and *"three days"*. The
  speech is right; the orthography round-trips differently. Listen to
  `numbers.q8.wav`.
- `symbols` 0.063 — `prepareForSpeech` correctly turns `90%` into "90
  percent", and Whisper correctly writes what it hears as `90%`. One word of
  edit distance against my reference string.

That is why the acceptance threshold in the plan (WER ≤ 0.35) is the right
shape: real speech lands at 0.00–0.19 here, and the failure lands at 0.83.

## Table 2 — Browser matrix (real worker bundle, real WebGPU)

**This is the table that matters.** The Node round trip runs Kokoro on CPU,
where q8 is fine — so on its own it would have cleared q8 of any wrongdoing.
Noel's machine ran WebGPU. Driving the actual bundled worker
(`dist/tutor/tutor-worker.js`) in headless Chromium with
`--enable-unsafe-webgpu --use-angle=metal`, one `sample` message per cell,
PCM captured and scored by the same Whisper base:

| sentence | device | dtype | secs | rms | WER | heard | worker metric |
|---|---|---|---|---|---|---|---|
| **husky** | **webgpu** | **q8** | 10.57 | 0.0545 | **4.346** | **"Shama, Ah, those yorks, yorks, yorks, yorks, yorks, yorks, yorks, yorks, yorks, …"** | tts_load_ms=7226 webgpu/q8 |
| **markdown** | **webgpu** | **q8** | 2.50 | 0.0588 | **1.000** | **"Yeah, a 99.5."** | tts_load_ms=944 webgpu/q8 |
| husky | webgpu | **fp32** | 9.50 | 0.0745 | **0.000** | The dog was a big native husky, the proper wolf dog, gray-coated, and without an… | tts_load_ms=15827 webgpu/fp32 |
| markdown | webgpu | **fp32** | 2.50 | 0.0645 | **0.000** | The dog is unhappy but loyal. | tts_load_ms=959 webgpu/fp32 |

(A WER above 1.0 is not a bug in the metric: Whisper hallucinated *more*
words out of the noise than the reference sentence contains. "yorks, yorks,
yorks…" is what a degenerate waveform does to an ASR model.)

So the diagnosis in PLAN.md item 3 — INFERRED there, *"kokoro-js has produced
noise with q8 on WebGPU in some builds"* — is now **VERIFIED on this machine,
in this build**. It is not a subtle quality regression. WebGPU q8 is noise,
and it is what shipped.

Note the durations: q8/webgpu renders the husky sentence as 10.57 s where
every good render of it is 9.45-9.50 s. The extra second is the model
wandering, and it is a cheap smoke signal if anyone wants a cheaper check
than a full ASR round trip.

fp32 costs 15.8 s to load against 7.2 s for q8 on a cold cache (and 330 MB
against 90 MB on the wire). That is the price, and it is the right trade
against speaking noise.

Raw: `~/Claude/sotto-run9/C/browser.log`, `browser-matrix.webgpu.json`,
`browser-table.md`, and the four `browser.*.wav` clips. Script:
`~/Claude/sotto-run9/C/tts-browser-matrix.mjs`.

### before.wav / after.wav

The card asks for a before/after pair on the husky sentence. Both are from
this table, because that sentence is exactly where the dtype shows up and
`prepareForSpeech` does not (it is clean prose):

- `~/Claude/sotto-run9/C/before.wav` — WebGPU **q8**, what Noel's session
  produced. WER 4.346.
- `~/Claude/sotto-run9/C/after.wav` — WebGPU **fp32**, what it produces now.
  WER 0.000.

For the *markdown* half of the fix, compare `markdown.q8.wav` (baseline,
"Astroskastrisk…") against `markdown.q8.prepared.wav` — both in the same
directory.

### One caveat on this table

The browser cells ran the **fixed** worker, so both dtypes already had
`prepareForSpeech` applied; the markdown row therefore does not show the
markdown defect (Table 1 does). What the markdown row shows instead is that
even a short, clean, five-word sentence comes out as noise at webgpu/q8.

## `playPcm` (card output 4) — VERIFIED

`packages/voice/test/web-audio.test.ts` now proves, rather than asserts by
inspection, three things:

- the Int16→float conversion is the exact inverse of `worker.ts`'s
  `floatToPcm16` (negatives ÷ 0x8000, positives ÷ 0x7fff), including that
  both full-scale endpoints come back as exactly ±1;
- `createBuffer` is given **24000**, not the AudioContext's own rate. This
  mattered enough to test: every Mac runs a 48 kHz context, and a 24 kHz
  buffer replayed at 48 kHz is double-speed chipmunk audio — an extremely
  convincing imitation of "gibberish";
- consecutive chunks queue back to back at 24 kHz timing (two 2400-sample
  buffers → the second starts at t = 0.100 s), so a multi-piece sentence from
  `prepareForSpeech` plays as one continuous utterance and not as overlaps.

The existing fake `AudioContext` in that file was extended (retained channel
data, a `duration` getter, recorded sources) — no production change.

## What changed in `loadTts`, and why

```ts
const TTS_DTYPE: Record<'webgpu' | 'wasm', 'fp32' | 'q8'> = {
  webgpu: 'fp32',
  wasm: 'q8',
};
```

Before, both devices asked for `q8`.

- **webgpu → fp32.** kokoro-js's own README (1.2.1, line 29) says *"If using
  `webgpu`, we recommend using `dtype="fp32"`"*. Noel's session was on
  WebGPU. The Node table cannot test this (Node has no WebGPU backend), so
  the evidence is Table 2, which reproduces the failure directly.
- **wasm stays q8.** Deliberate. q8 scores as well as fp32 on CPU in Table 1,
  and wasm is the fallback for machines with no WebGPU at all — the machines
  least able to afford a 330 MB download and fp32 inference instead of 90 MB.
- **fp16 is offered by kokoro-js and is not used anywhere.** Table 1 says
  don't.

Table 2 is what actually justifies the webgpu row: the README warning turned
out to understate it. q8 on WebGPU is not "lower quality", it is noise
(WER 4.346 vs 0.000).
- **`debugTtsDtype()`** reads `self.__SOTTO_TTS_DTYPE__`. The card allowed
  either the `debug` field of the init payload or an env-driven constant;
  the `debug` field would have meant editing `protocol.ts`,
  `sessionManager.ts` and `provider.ts`, none of which lane C owns, so the
  knob is a worker-global instead. The browser matrix sets it by spawning a
  one-line module-blob worker that assigns the global and then dynamically
  imports the real bundle. Nothing in the app sets it.

`speakSentence` now loops over `prepareForSpeech(sentence)` and speaks each
piece **inside the same utterance id**, so `audio_start`/`audio_end`,
barge-in (`interruptSession`) and `replay` are all unchanged. The `sample`
case gets the same cleaning, with the pieces concatenated because
`sample_result` is a single one-shot buffer.

## `MAX_SPEECH_CHARS` = 320, and where the number comes from

Kokoro's limit is 510 phoneme tokens. VERIFIED in kokoro-js 1.2.1's bundle,
not taken from the model card: `generate` tokenizes with `{ truncation: true }`
and `generate_from_ids` computes the style-vector offset as
`256 * Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509)`. So past that
point the text is silently truncated *and* the style vector stops advancing.

Measured phoneme-token cost per character, using kokoro-js's own `phonemizer`
plus Kokoro's tokenizer (script kept at `~/Claude/sotto-run9/C/phoneme-ratio.mjs`):

| text | chars | phoneme tokens | ratio |
|---|---|---|---|
| husky reference sentence | 149 | 156 | 1.047 |
| long60 fixture | 331 | 349 | 1.054 |
| "What do you think the dog was feeling…" | 68 | 72 | 1.059 |
| "It was fifty degrees below zero…" | 84 | 94 | 1.119 |
| `"aaaaaaaaaa "` × 20 (contrived worst case) | 220 | 281 | 1.277 |
| `"strengths"` × 8 (dense consonants) | 79 | 73 | 0.924 |

At the worst ratio observed, 320 characters is 410 tokens — ~20% under the
509 clamp. No real tutor sentence reaches it (the reference husky line is 149
characters), so in practice `prepareForSpeech` returns exactly one piece and
the split path only fires on a runaway model.

## Tests

```
$ pnpm --filter @sotto/voice exec vitest run
 ✓ test/browser-cascade-tts-text.test.ts (12 tests)
 ✓ test/web-audio.test.ts (5 tests)
 … 13 files
 Test Files  13 passed (13)
      Tests  153 passed (153)

$ pnpm -r typecheck
packages/core … apps/client typecheck: Done          (all 5 clean)

$ pnpm lint
✖ 31 problems (6 errors, 25 warnings)
```

The 6 remaining lint errors are all in
`planning/design/launch-cards/shots2x.mjs`, which lane C does not own and did
not touch; they are present on `main` too. Every file this lane touched is
clean, and `pnpm exec prettier --check` on all six passes.

## Not verified / caveats

- **The `°`, `%`, `&` expansions are belt-and-braces, not proven necessary.**
  The `symbols` baseline row scored 0.063 *without* `prepareForSpeech`, i.e.
  Kokoro's eSpeak path already said "50 degrees" and "90 percent" correctly.
  The expansions make the behaviour explicit and version-independent rather
  than fixing an observed failure. INFERRED that they help; VERIFIED that
  they do not hurt.
- **No listening test.** Every judgement here is Whisper's, not a human's.
  A clip can score WER 0.0 and still sound bad (wrong prosody, clipped
  onsets). Noel should play `~/Claude/sotto-run9/C/after.wav` against the
  known-good landing-page Kokoro clip (`planning/LEDGER.md`, "Landing V5").
- **fp16's NaN was seen once, on one sentence.** I did not chase whether it
  is length-dependent, ORT-version-dependent, or a one-off. It is enough to
  keep fp16 out of the code; it is not a full characterization.
- **The browser matrix covered two sentences and two dtypes, not the full
  fixture set.** Each cell is a cold model load; eight sentences × three
  dtypes in-browser was not worth the wall clock when the q8/fp32 split is
  this unambiguous. wasm was not measured in-browser at all — the wasm row of
  `TTS_DTYPE` rests on Table 1's CPU numbers, which is the same execution
  path but not literally the same backend. INFERRED.
- **The browser matrix ran the `sample` message, not a live Discuss turn.**
  That exercises `loadTts` and `speakSentence`'s text path through the real
  bundle on real WebGPU, but not the LLM→chunker→speak chain end to end;
  lane E's `discuss-quality.mjs` is what covers that.
- **`prepareForSpeech` is deliberately aggressive about `*` and `_`.** It
  removes them wholesale rather than matching pairs, because unbalanced `**`
  is common in truncated model output. A learner asking about literal
  asterisks would not hear them. Judged the right trade.

## Requests outside my lane

1. **`packages/voice/package.json` has no `test` script.** `pnpm --filter
   @sotto/voice test` (the command COMMON.md tells every lane to run) is a
   silent no-op — it prints nothing and exits 0. I ran
   `pnpm --filter @sotto/voice exec vitest run` instead. Suggested diff, for
   whoever owns that file:

   ```diff
      "scripts": {
   +    "test": "vitest run",
        "typecheck": "tsc --noEmit"
      },
   ```

2. **`eslint.config.js` does not cover `packages/voice/scripts/**/*.mjs`.**
   Its Node-script block lists `apps/client/e2e`, `apps/client/scripts` and
   `packages/content/scripts`. My new script directory is not in it, so
   `process`/`console`/`Buffer` were flagged. I worked around it with a
   `/* global … */` comment in the file, which is fine but is the wrong place
   for it. Suggested diff:

   ```diff
        'apps/client/e2e/**/*.mjs',
        'apps/client/scripts/**/*.mjs',
        'packages/content/scripts/**/*.mjs',
   +    'packages/voice/scripts/**/*.mjs',
   ```

3. **The browser matrix script has no home in the repo.** It is at
   `~/Claude/sotto-run9/C/tts-browser-matrix.mjs`. The card names only
   `packages/voice/scripts/tts-roundtrip.mjs` as lane C's script and gives me
   nothing under `apps/client/e2e`, and COMMON.md says throwaway scripts stay
   under `~/Claude/sotto-run9/<lane>/`. If the orchestrator wants it kept it
   drops in at `apps/client/e2e/tts-browser-matrix.mjs` with one change: the
   `createRequire` shim for `playwright` becomes a plain import.

4. **`wer()` is duplicated.** Lane E's `apps/client/e2e/lib/*` had not landed
   on `run9/E` when I checked (`git ls-tree -r --name-only run9/E` returned
   nothing matching), so `tts-roundtrip.mjs` carries its own copy. If E's
   version lands, one of the two should go — mine is the disposable one.

## For Noel

Nothing is blocked on you. One thing worth ten seconds of your ears: play
`~/Claude/sotto-run9/C/before.wav` and then `after.wav`. Before is what your
session was doing; after is what it does now.
