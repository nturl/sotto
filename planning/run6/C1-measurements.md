# R6-C1 — Sprite trim-onset measurements

Lane R6-C1. Read-only on the repo; script and clips live at `~/Claude/sotto-run6-recon/`
(script: `onsets.py`, machine-readable dump: `onsets_results.json`, clips: `clips/`).

## Escalation check

**PASSED** — no format-latch drift detected. Max delta across all 38 sprited books between
`words.json`'s last entry `endMs` and the ffmpeg-decoded duration of `audio/words.mp3`:
**0.96ms** (`es-419/es-becquer-maese-perez`), far under the 48.0ms (one MP3 frame at 24kHz)
threshold. The theoretical format-latch bug at `word-audio.ts:282-311` (format captured from
the first synthesized word only, then reused for every later word's duration math) does not
manifest detectably in any of the 38 books measured. ✓ VERIFIED (measured, all 38 books, not
just the 3 sampled in the earlier recon pass).

## Method

- Every book with `audio/words.mp3` + `audio/words.json` (38 of 40; `ca-patufet` and
  `ro-capra-trei-iezi` have neither, per prior recon — unaffected, out of scope here).
- `audio/words.mp3` decoded once per book via `ffmpeg -i words.mp3 -f s16le -ac 1 -ar 24000 -`
  (pipe to stdout), parsed with Python's `array` module (`'h'`, native little-endian, confirmed
  on this Mac via `sys.byteorder`).
- **Pad assumption — VERIFIED by reading `packages/content/src/word-audio.ts:280-311`**: the
  loop records `clipStartMs = cumulativeMs` *before* pushing `leadSilence` (120ms,
  `LEAD_PAD_MS`), then pushes the trimmed word PCM, then pushes `tailSilence` (250ms,
  `TAIL_PAD_MS`), then writes `index[normalized] = [clipStartMs, cumulativeMs]` — i.e.
  `words.json`'s `[startMs, endMs]` span covers the *whole padded clip*, and the trimmed word
  audio itself occupies `[startMs + 120, endMs - 250]`. This matches the task's stated
  assumption exactly; no correction needed.
- Per entry: RMS of first 10ms and first 5ms of the trimmed word audio, RMS of last 10ms and
  last 5ms, and peak RMS over non-overlapping 5ms blocks across the whole trimmed span.
  `onset_ratio = first5ms_rms / peak5ms_rms`, `tail_ratio = last5ms_rms / peak5ms_rms`.
  HARD onset/tail: ratio ≥ 0.35. SOFT band: 0.15 ≤ ratio < 0.35.
- Pre-lead-pad check: RMS of the 10ms immediately before the trimmed start (inside the baked
  lead pad, i.e. `[startMs, startMs+10ms)`). Result: **every single one of the 18,598 measured
  entries reads near-digital-silence there (RMS < 50/32767)** — confirms the lead pad is real
  encoded silence, not leaked audio, everywhere in the corpus. ✓ VERIFIED (measured, 100% of
  entries).
- Grapheme classification: simple per-first/last-character tables (fricative includes digraphs
  `th/sh/ch` checked first, then single chars `f v s z h j x ç ʃ`; plosive `p b t d k g c q`;
  nasal `m n ñ`; liquid `l r`; vowel `a e i o u y à é è ê ù û ô î ï â ü ö ä`; else "other").
  `zh-CN`/`zh-TW` marked `cjk` and reported separately (117 entries each, no attempted
  phonetic classification — INFERRED not needed since neither shows an onset/tail signal above
  ~1%).
- Corpus run: 38 books, **18,598 word entries**, ~21s wall time (single ffmpeg decode per book,
  pure-Python RMS, no numpy available on this machine — confirmed absent, fell back to
  `array`/loops as instructed).

## Per-class rates (all locales combined)

| class     |     n | hard-onset % | soft-onset % | hard-tail % |
|-----------|------:|-------------:|-------------:|------------:|
| cjk       |   234 |          0.9 |         15.0 |         0.0 |
| fricative |  4226 |          5.6 |         47.3 |         0.0 |
| plosive   |  6754 |          4.0 |         48.4 |         0.1 |
| nasal     |  1569 |          9.6 |         60.7 |         0.0 |
| liquid    |  1721 |          7.0 |         59.0 |         0.1 |
| vowel     |  3855 |         11.5 |         59.7 |         0.4 |
| other     |   239 |         30.5 |         43.5 |         0.0 |

Corpus-wide weighted hard-onset rate: **6.97%** (1296/18598).

## Per-locale × per-class rates

| locale | class     |    n | hard% | soft% | tailhard% |
|--------|-----------|-----:|------:|------:|----------:|
| en-US  | fricative |  862 |   9.7 |  47.1 |       0.1 |
| en-US  | liquid    |  227 |  36.6 |  46.7 |       0.0 |
| en-US  | nasal     |  212 |  39.6 |  42.5 |       0.0 |
| en-US  | other     |  191 |  38.2 |  40.3 |       0.0 |
| en-US  | plosive   |  904 |  13.1 |  57.0 |       0.0 |
| en-US  | vowel     |  530 |  26.4 |  58.5 |       0.4 |
| es-419 | fricative | 1344 |   5.6 |  57.0 |       0.0 |
| es-419 | liquid    |  591 |   4.6 |  67.2 |       0.3 |
| es-419 | nasal     |  616 |   7.3 |  85.7 |       0.0 |
| es-419 | other     |   30 |   0.0 |  66.7 |       0.0 |
| es-419 | plosive   | 2579 |   3.8 |  64.8 |       0.2 |
| es-419 | vowel     | 1535 |  11.3 |  66.1 |       0.8 |
| fr-FR  | fricative | 1669 |   4.0 |  43.9 |       0.0 |
| fr-FR  | liquid    |  786 |   1.1 |  57.9 |       0.0 |
| fr-FR  | nasal     |  600 |   2.8 |  43.8 |       0.0 |
| fr-FR  | other     |   15 |   0.0 |  33.3 |       0.0 |
| fr-FR  | plosive   | 2677 |   1.3 |  31.6 |       0.0 |
| fr-FR  | vowel     | 1484 |   8.0 |  56.9 |       0.0 |
| it-IT  | fricative |  209 |   0.0 |  10.0 |       0.0 |
| it-IT  | liquid    |   70 |   0.0 |  34.3 |       0.0 |
| it-IT  | nasal     |   73 |   0.0 |  19.2 |       0.0 |
| it-IT  | plosive   |  320 |   0.3 |  22.5 |       0.0 |
| it-IT  | vowel     |  136 |   0.0 |  19.9 |       0.0 |
| pt-BR  | fricative |  142 |   8.5 |  52.1 |       0.0 |
| pt-BR  | liquid    |   47 |   2.1 |  72.3 |       0.0 |
| pt-BR  | nasal     |   68 |   7.4 |  85.3 |       0.0 |
| pt-BR  | other     |    3 |   0.0 |  66.7 |       0.0 |
| pt-BR  | plosive   |  274 |   6.2 |  60.2 |       1.8 |
| pt-BR  | vowel     |  170 |   5.9 |  60.6 |       0.0 |
| zh-CN  | cjk       |  117 |   0.9 |  15.4 |       0.0 |
| zh-TW  | cjk       |  117 |   0.9 |  14.5 |       0.0 |

en-US stands out with consistently higher hard-onset rates across every class (nasal 39.6%,
liquid 36.6%, other 38.2%, vowel 26.4%) than every other locale — plausibly a different Kokoro
voice's onset envelope for that language, or the 64k-vs-96k LAME bitrate split (en-US's larger
books drop to `LOW_BITRATE`, per prior recon §2) interacting with the RMS trim. ? INFERRED —
not isolated here; would need a same-locale bitrate A/B to confirm.

## 20 worst onset clips (corpus-wide)

| book | word | ratio | trimmed-start ms in words.mp3 |
|---|---|---:|---:|
| en-US/en-alice-rabbit-hole | own | 1.000 | 221200.0 |
| en-US/en-doyle-red-headed-league | own | 1.000 | 386515.0 |
| en-US/en-london-build-a-fire | onto | 1.000 | 258520.0 |
| en-US/en-london-build-a-fire | own | 1.000 | 262575.0 |
| en-US/en-oz-cyclone | onto | 1.000 | 227615.0 |
| en-US/en-poe-tell-tale-heart | own | 1.000 | 359125.0 |
| en-US/en-aesop-fables | sheep | 0.952 | 134835.0 |
| en-US/en-doyle-red-headed-league | excellent | 0.928 | 203095.0 |
| en-US/en-aesop-fables | away | 0.906 | 11890.0 |
| en-US/en-alice-rabbit-hole | away | 0.903 | 21520.0 |
| en-US/en-oz-cyclone | away | 0.903 | 20180.0 |
| en-US/en-london-build-a-fire | away | 0.903 | 26875.0 |
| en-US/en-doyle-red-headed-league | away | 0.896 | 55335.0 |
| en-US/en-poe-tell-tale-heart | away | 0.888 | 34780.0 |
| en-US/en-doyle-red-headed-league | accident | 0.883 | 7525.0 |
| en-US/en-oz-cyclone | emerald | 0.858 | 88355.0 |
| pt-BR/pt-machado-cartomante | visite | 0.846 | 482870.0 |
| en-US/en-alice-rabbit-hole | again | 0.824 | 5320.0 |
| en-US/en-aesop-fables | again | 0.823 | 1675.0 |
| en-US/en-london-build-a-fire | again | 0.823 | 7940.0 |

Note: the worst-onset list is dominated by en-US vowel/nasal/liquid-initial words ("own",
"onto", "away", "again"), not fricatives — see verdict below.

## 20 worst tail clips (corpus-wide)

| book | word | ratio | trimmed-end ms in words.mp3 |
|---|---|---:|---:|
| pt-BR/pt-jabuti-onca | de | 0.458 | 50110.0 |
| pt-BR/pt-machado-cartomante | de | 0.458 | 126325.0 |
| pt-BR/pt-machado-cartomante | dos | 0.415 | 159840.0 |
| es-419/es-palma-tradiciones | al | 0.405 | 7590.0 |
| es-419/es-lazarillo | al | 0.405 | 16145.0 |
| es-419/es-becquer-maese-perez | al | 0.404 | 18475.0 |
| es-419/es-quiroga-tortuga-gigante | al | 0.404 | 16495.0 |
| es-419/es-fabulas-samaniego | al | 0.404 | 2765.0 |
| es-419/es-conde-lucanor | al | 0.403 | 12900.0 |
| es-419/es-dario-rey-burgues | al | 0.402 | 20240.0 |
| es-419/es-quiroga-almohadon | al | 0.402 | 12920.0 |
| es-419/es-licenciado-vidriera | al | 0.402 | 4010.0 |
| es-419/es-quijote-molinos | al | 0.402 | 10010.0 |
| es-419/es-larra-vuelva-usted | al | 0.402 | 22005.0 |
| es-419/es-monte-de-las-animas | al | 0.401 | 2215.0 |
| es-419/es-clarin-adios-cordera | al | 0.400 | 13475.0 |
| es-419/es-conde-lucanor | real | 0.389 | 384205.0 |
| es-419/es-clarin-adios-cordera | real | 0.388 | 439050.0 |
| en-US/en-alice-rabbit-hole | eye | 0.376 | 89905.0 |
| en-US/en-poe-tell-tale-heart | eye | 0.375 | 160570.0 |

Note: even the *worst* tail ratio in the entire 18,598-entry corpus (0.458) barely clears the
0.35 hard threshold — nothing approaches the onset list's 1.000 ratios. Sheared tails are a
negligible phenomenon corpus-wide (hard-tail% is 0.0-1.8% in every class/locale cell above).

## Clip index (`~/Claude/sotto-run6-recon/clips/`)

Pre-existing from the earlier recon pass (not re-extracted, per "do not overwrite"):

| file | source span (ms) | duration |
|---|---|---|
| fr-petit-chaperon-rouge-sprite-de.wav | 44170–44785 | 0.615s |
| fr-petit-chaperon-rouge-sprite-et.wav | 64310–64875 | 0.565s |
| fr-petit-chaperon-rouge-sprite-un.wav | 172945–173590 | 0.645s |
| fr-petit-chaperon-rouge-sprite-couverture.wav | 38040–39250 | 1.210s |
| fr-petit-chaperon-rouge-sprite-rencontre.wav | 145315–146520 | 1.205s |
| fr-petit-chaperon-rouge-sprite-confiante.wav | 32875–34070 | 1.195s |
| fr-petit-chaperon-rouge-narrationslice-et-raw.wav | 18250–18380 | 0.130s |
| fr-petit-chaperon-rouge-narrationslice-et-padded.wav | 18170–18650 | 0.480s |

New this run (en-US default words + 6 worst fricative-onset words, each with its narration-slice
padded equivalent where the word has token timings in a chapter JSON — all 6 did):

| file | source span (ms) | duration |
|---|---|---|
| en-poe-tell-tale-heart-sprite-the.wav | 487140–487805 | 0.665s |
| en-poe-tell-tale-heart-narrationslice-the-padded.wav | 7140–7620 (ch.01, `the` startMs=7220/endMs=7370, padded −80/+150,min250) | 0.480s |
| en-poe-tell-tale-heart-sprite-is.wav | 258060–258805 | 0.745s |
| en-poe-tell-tale-heart-narrationslice-is-padded.wav | 36450–36930 (ch.01, `is` startMs=36530/endMs=36730) | 0.480s |
| en-aesop-fables-sprite-sheep.wav | 134715–135525 | 0.810s |
| en-aesop-fables-narrationslice-sheep-padded.wav | 1360–1890 (ch.04, `sheep` startMs=1440/endMs=1740) | 0.530s |
| pt-machado-cartomante-sprite-visite.wav | 482750–483835 | 1.085s |
| pt-machado-cartomante-narrationslice-visite-padded.wav | 128549–129089 (ch.01, `visite` startMs=128629/endMs=128939) | 0.540s |
| es-clarin-adios-cordera-sprite-hacerlo.wav | 236005–236955 | 0.950s |
| es-clarin-adios-cordera-narrationslice-hacerlo-padded.wav | 61590–62250 (ch.04, `hacerlo` startMs=61670/endMs=62100) | 0.660s |
| es-conde-lucanor-sprite-hacerlo.wav | 214460–215410 | 0.950s |
| es-conde-lucanor-narrationslice-hacerlo-padded.wav | 18659–19249 (ch.03, `hacerlo` startMs=18739/endMs=19099) | 0.590s |
| es-clarin-adios-cordera-sprite-hacia.wav | 237825–238720 | 0.895s |
| es-clarin-adios-cordera-narrationslice-hacia-padded.wav | 87287–87947 (ch.02, `hacía` startMs=87367/endMs=87797) | 0.660s |
| es-dario-rey-burgues-sprite-fragua.wav | 333390–334245 | 0.855s |
| es-dario-rey-burgues-narrationslice-fragua-padded.wav | 120162–120722 (ch.03, `fragua` startMs=120242/endMs=120572) | 0.560s |

Note: `en-poe-tell-tale-heart` (656 tokens) was used for the en-US default-word pair rather
than the strictly-largest en-US book, `en-doyle-red-headed-league` (687 tokens), because
`en-doyle-red-headed-league`'s `words.json` has no `is` entry (the word never occurs in that
book's text) — `en-poe-tell-tale-heart` is the largest en-US book containing both `the` and
`is`. ✓ VERIFIED (checked both books' `words.json` keys directly).

## Verdict

**PARTIALLY CONFIRMED, but not the way the fricative-specific framing predicted.** A material
share of the corpus — 6.97% of all 18,598 sprite entries — shows a hard onset (first-5ms RMS ≥
35% of the clip's peak 5ms RMS), i.e. `trimSilence`'s 500/32767 threshold with 5ms blocks and no
fade genuinely does shear into audible attack on a non-trivial minority of words, confirming the
core mechanism (RMS-threshold cut with no fade produces an audible hard edge on some clips).
However, the fricative-specific hypothesis is **REFUTED by the class breakdown**: fricative-
initial words hard-onset at 5.6%, *below* the 6.97% corpus average and below vowel (11.5%),
nasal (9.6%), liquid (7.0%), and "other" (30.5%, small n=239) — plosives are lowest at 4.0%.
The worst-20 onset list is dominated by vowel/nasal-initial function and content words ("own",
"onto", "away", "again"), not the hypothesized quiet-onset fricatives/soft-onsets. A plausible
read (INFERRED, not measured here): fricatives are continuous turbulent noise that crosses the
RMS threshold close to their true acoustic onset regardless of where trimSilence cuts, while
vowels have a natural gradual glottal-pulse ramp that the hard 500-RMS/5ms-block trim slices
through mid-ramp, producing the sharper jump-to-near-peak signature this measurement flags as
"hard." Sheared tails are **REFUTED outright**: hard-tail rate is 0.0-1.8% in every single
class/locale cell, and even the single worst tail ratio in the whole corpus (0.458) barely
clears the hard threshold.

Given the numbers — onset hardness is real but spread broadly across phoneme classes rather than
concentrated in the classes a lowered RMS threshold would specifically rescue (fricatives), and
tail shearing is negligible everywhere — **the numbers favor fix (a): a fixed 20-30ms pre/post-
roll around the trim points plus a 10ms linear fade**, over fix (b) (lowering the RMS threshold).
Lowering the threshold would help vowel/nasal-initial words no more than fricative-initial ones
(the classes most affected aren't the low-amplitude ones the threshold targets), while a
class-agnostic pre-roll+fade fixes the audible edge everywhere the hard-onset signature appears,
without per-locale/per-class threshold retuning (en-US's markedly higher rates across every
class suggest a single retuned threshold would need to be locale-aware anyway, which a fixed
pad+fade avoids).

All measurement claims above are ✓ VERIFIED (measured from decoded PCM against `words.json`) or
✓ VERIFIED (read and traced in `word-audio.ts`), except the two explicitly marked ? INFERRED
(the en-US bitrate/voice explanation, and the vowel-ramp-vs-fricative-noise-floor explanation for
why hard onsets skew away from fricatives) — neither of those two inferences affects the
escalation-check result, the per-class rate tables, the worst-20 lists, or the fix-direction
recommendation, all of which rest on the measured numbers above.
