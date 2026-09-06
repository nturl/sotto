# Content QA

## Gloss coverage — COMPLETE 2026-09-05 (Lane D1b)

Lane D1 (previous session) widened glossary/vocab/metadata coverage to pt for 3 of 18
books using the local Qwen model, then found it too slow (~9 tok/s) to finish. Lane D1b
finished the sweep against **DeepSeek** (`deepseek-v4-flash`, OpenAI-compatible chat
completions at `https://api.deepseek.com/chat/completions`, bearer token read at runtime
from `~/.config/deepseek/api_key`) instead of the local model:

- `packages/content/scripts/fill-locales.mjs` gained a `--backend=deepseek` flag
  (default stays `local` for contributors without a key): same batch-prompt shape as
  before (~40 words/call, one retry on parse failure or 5xx), now running up to 8 books
  concurrently per locale.
- **Important fix**: DeepSeek's `deepseek-v4-flash` is a reasoning model by default —
  the first test call against it produced ~2000 "thinking" tokens for a single word and
  would have made the sweep impractically slow/expensive. Passing `thinking: {type:
"disabled"}` in the request body turns that off; every call in this lane's scripts
  sets it.
- **Identity-locale bug found and fixed**: for a book whose own content language matches
  one of the target explanation locales (`ro-RO`→`ro`, `it-IT`→`it`, `pt-BR`→`pt`,
  `ca-ES`→`ca`, `zh-CN`→`zh-Hans`), the established convention already visible in every
  existing bundle (e.g. an English book's `glossary[word].en` is always the word itself,
  a French book's `.fr` likewise) is that the same-language gloss is **identity**, not a
  translation. The first real run against `ro-capra-trei-iezi` violated this — the model
  filled `glossary["capră"].ro` with `"goat"` (the _English_ gloss) instead of `"capră"`
  — because asking an LLM to "translate X into the language X is already written in" is
  degenerate. Fixed with a `NATIVE_EXPLANATION_LOCALE` map: glossary/vocabulary-gloss and
  `localizedTitles` are set to the word/title itself (no LLM call) for a book's native
  locale; `premise`/`summary` are still real translations even for the native locale
  (they're English-authored meta-text, translated per locale the same as book text — see
  e.g. `fr-chat-botte`'s `premise.fr`, which is a genuine translation of `premise.en`, not
  a copy of any book text). The five corrupted `ro-capra-trei-iezi` glossary/vocab
  entries were cleared and correctly re-filled as identity before continuing.
- One data-quality artifact found in `es-quijote-molinos`'s glossary: a duplicate key
  `"br\nilla"` (literal embedded newline, pre-existing from before this lane) alongside
  the correct `"brilla"` key. Filled by copying `"brilla"`'s translations rather than
  re-deriving a nonsense key.

Coverage table: glossary words with a value for that locale / total glossary words in
the book. **100% for all nine locales across all 18 books** (en/fr/es were already
complete from the prior session; pt/it/zh-Hans/zh-Hant/ro/ca are the six this lane
added). `vocabulary[].gloss`, `localizedTitles`, `premise`, and `summary` are equally
100% across all nine locales for all 18 books (verified by direct read of every source
bundle, not just the glossary table below).

| book                    | en   | fr   | es   | pt   | it   | zh-Hans | zh-Hant | ro   | ca   |
| ----------------------- | ---- | ---- | ---- | ---- | ---- | ------- | ------- | ---- | ---- |
| ca-patufet              | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| en-aesop-fables         | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| en-alice-rabbit-hole    | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| en-oz-cyclone           | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| es-fabulas-samaniego    | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| es-lazarillo            | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| es-licenciado-vidriera  | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| es-monte-de-las-animas  | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| es-quijote-molinos      | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| fr-cendrillon           | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| fr-chat-botte           | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| fr-chevre-de-m-seguin   | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| fr-fables-la-fontaine   | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| fr-petit-chaperon-rouge | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| it-pinocchio-inizio     | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| pt-jabuti-onca          | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| ro-capra-trei-iezi      | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |
| zh-chengyu-stories      | 100% | 100% | 100% | 100% | 100% | 100%    | 100%    | 100% | 100% |

### Sentence translations — COMPLETE

`packages/content/src/translate-sentences.ts` gained the same DeepSeek backend switch
(`SOTTO_LLM_BACKEND=deepseek` env var, since this is the project's own CLI command, not
a standalone script — flags stay `--locale`/`--book`/`--dry-run`), the same
`thinking:{type:"disabled"}` fix, the same native-locale identity short-circuit (a
sentence's own-language "translation" is the sentence text verbatim — confirmed against
every existing book, e.g. an English book's `sentence.translation.en` already equals
`sentence.text`), and up to 8 books concurrently. Ran once with no `--locale` filter
(defaults to all nine `GLOSS_LOCALES`); en/fr/es were already complete so those did
nothing. Every sentence in every book now has a `translation` entry for all nine
locales — `pnpm content:translate-sentences` reports 0 `missingAfter` for every
(book, locale) row this run touched, and `zh-Hant` targets explicitly ask for
Traditional characters (Taiwan conventions).

### GLOSS_LOCALES widened (code change applied)

`packages/content/src/gloss-fill.ts`'s `GLOSS_LOCALES` is now the full nine explanation
locales (`en, fr, es, pt, it, zh-Hans, zh-Hant, ro, ca`), and `fillGlossesBatch`'s system
prompt now builds its locale list from a `LOCALE_NAMES` map instead of the old hardcoded
"English (en), French (fr), and Spanish (es)" string, with an explicit
Traditional-Chinese instruction for `zh-Hant`. This makes `content:build --fill` (and
`validate.ts`'s `missing-sentence-translation` check, which already iterated
`GLOSS_LOCALES`) natively cover all nine locales going forward — no more need to route
through the standalone `fill-locales.mjs` script for new books, though it stays useful
as a fast, resumable, book/locale-filterable bulk tool.

### Rebuild — alignment/timing fields preserved (bug found and fixed)

`pnpm content:build` (full rebuild, all 18 books) ran clean after the above. Before
running it, `packages/content/src/build.ts`'s `mergeExistingChapterAssets` was found to
merge forward `audio`/`durationMs` from the previous `book.json` but **not** the
`alignment` field that `content:align` (Lane C) writes onto `book.json`'s chapter
summaries — a plain rebuild would have silently dropped every book's alignment stats.
Fixed by also copying `prev.alignment` forward under the same "wordCount unchanged"
condition already used for audio. Verified with a byte-for-byte diff of
`packages/content/packs/fr-FR/books/fr-chat-botte/book.json` and its `chapters/*.json`
before and after the full rebuild: **identical**, including `chapters[].alignment`
(`{matched, total, method}`) and every token's `startMs`/`endMs`.

### Validator

`pnpm content:validate`: **0 errors, 0 warnings** across all packs, including the
`zh-Hant` simplified-character check (`zh-tw-unconverted-simplified`) on the
`zh-chengyu-stories-hant` edition.

### DeepSeek spend estimate

Token usage taken directly from the API responses (`usage.prompt_tokens` /
`usage.completion_tokens`), no external pricing lookup performed in this session:

| stage                                      | calls | prompt tokens | completion tokens |
| ------------------------------------------ | ----- | ------------- | ----------------- |
| glossary/vocab/titles/premise/summary fill | 1,024 | ~911,000      | ~300,700          |
| sentence translations                      | 468   | ~247,100      | ~202,400          |
| level-sanity CEFR calls (D3, below)        | 20    | ~25,700       | ~11,200           |
| **total**                                  | 1,512 | ~1,183,800    | ~514,300          |

DeepSeek's dashboard has the authoritative dollar figure for this key; at
`deepseek-v4-flash`'s published per-token rates this is a low-single-digit-dollar run
(DeepSeek's flash/chat tier is priced in cents per million tokens), but that rate was
not independently re-verified here — check the DeepSeek billing dashboard for the exact
figure.

### Notes

- The `br\nilla` duplicate-key artifact in `es-quijote-molinos`'s glossary predates this
  lane and was not otherwise touched (its `en`/`fr`/`es` values were already present);
  worth a follow-up to delete the corrupted key entirely and confirm nothing in
  `packages/content/src/build.ts`'s tokenizer is producing it fresh from the source text.
- `fill-locales.mjs --backend=local` (the original llama.cpp path) is left intact and
  still the default, so contributors without a DeepSeek key can still run the sweep —
  just slowly.

## Level-sanity report 2026-09-05 (Lane D3)

Deterministic stats computed from each built pack's own tokenization (`isWord` tokens
per sentence — the same tokenizer `content:build` uses per language, so word counts are
language-appropriate, e.g. Chinese words rather than characters). CEFR estimate is one
DeepSeek call per book (`deepseek-v4-flash`, `thinking` disabled), given the book's full
text and its claimed level, asking for A0/A1/A2/B1 plus three reasons citing tense
inventory and vocabulary. Covers all 18 books plus the `zh-TW` Traditional edition
(`zh-chengyu-stories-hant`) — 19 rows. This is a report only: no book's `level` or
`reviewStatus` was changed, and no file besides this one was touched to produce it
(`packages/content/scripts/level-sanity.mjs` is read-only against `packs/`).

| book                                    | claimed | estimated | verdict   | sentences | mean len | max len | TTR   | distinct words |
| --------------------------------------- | ------- | --------- | --------- | --------- | -------- | ------- | ----- | -------------- |
| ca-patufet                              | A0      | A1        | one above | 49        | 8.7      | 13      | 42.2% | 179            |
| en-aesop-fables                         | A0      | A1        | one above | 65        | 7.4      | 10      | 45.9% | 222            |
| en-alice-rabbit-hole                    | A1      | A1        | matches   | 155       | 8.4      | 13      | 31.8% | 412            |
| en-oz-cyclone                           | A1      | A1        | matches   | 122       | 9.0      | 12      | 40.1% | 439            |
| es-fabulas-samaniego                    | A0      | A1        | one above | 54        | 7.5      | 11      | 52.1% | 211            |
| es-lazarillo                            | A1      | A1        | matches   | 112       | 8.9      | 12      | 48.4% | 482            |
| es-licenciado-vidriera                  | A1      | A1        | matches   | 62        | 8.6      | 14      | 47.7% | 255            |
| es-monte-de-las-animas                  | A2      | A2        | matches   | 52        | 11.5     | 15      | 42.2% | 252            |
| es-quijote-molinos                      | A1      | A1        | matches   | 100       | 10.9     | 13      | 44.1% | 483            |
| fr-cendrillon                           | A1      | A1        | matches   | 63        | 9.3      | 14      | 46.0% | 269            |
| fr-chat-botte                           | A1      | A2        | one above | 103       | 10.3     | 13      | 41.8% | 444            |
| fr-chevre-de-m-seguin                   | A2      | A2        | matches   | 55        | 12.6     | 18      | 42.4% | 293            |
| fr-fables-la-fontaine                   | A1      | A1        | matches   | 116       | 9.2      | 11      | 42.2% | 449            |
| fr-petit-chaperon-rouge                 | A0      | A1        | one above | 68        | 7.3      | 11      | 45.0% | 222            |
| it-pinocchio-inizio                     | A1      | A1        | matches   | 114       | 9.0      | 12      | 33.2% | 339            |
| pt-jabuti-onca                          | A0      | A1        | one above | 58        | 7.6      | 9       | 47.3% | 209            |
| ro-capra-trei-iezi                      | A0      | A1        | one above | 50        | 6.1      | 9       | 56.0% | 172            |
| zh-chengyu-stories                      | A0      | A1        | one above | 48        | 6.2      | 13      | 39.1% | 117            |
| zh-chengyu-stories-hant (zh-TW edition) | A0      | A1        | one above | 48        | 6.2      | 13      | 39.1% | 117            |

Verdict summary: 10 of 19 match the claimed level exactly; 9 are one level above claim
(8 x A0→A1, 1 x A1→A2 for `fr-chat-botte`); none are below claim.

### Reasons and reviewer notes

**ca-patufet** (one above): present-tense-only narration with no other tense marking;
basic concrete vocabulary (food, coins, farm objects); simple common adjectives
throughout. _For the human reviewer_: claimed A0, model says A1 — the "no past tense"
observation is solid A1 (not pre-A1) evidence; worth a manual read before promoting past
draft.

**en-aesop-fables** (one above): present simple/continuous only, no past or future;
mostly concrete vocabulary but includes abstract terms ("kindness", "desire") and two
proverbs ("Slow and steady wins the race"). _For the human reviewer_: the proverbs are
likely the reason this reads as A1 rather than A0 — consider whether they're essential
to the fable or could be simplified if A0 is the intended shelf.

**en-alice-rabbit-hole** (matches): present/past simple only; high-frequency concrete
vocabulary; simple connectors, no subordinate clauses beyond time references.

**en-oz-cyclone** (matches): present/past simple plus "will" for future; mostly concrete
vocabulary with occasional abstractions ("joy", "slavery"); simple direct dialogue.

**es-fabulas-samaniego** (one above): present narration with preterite for completed
actions; concrete vocabulary plus a few abstract/genre terms ("engaño", "moraleja");
simple dialogue, no complex subordination. _For the human reviewer_: the moral-fable
vocabulary ("moraleja", "engaño") is genre-appropriate but slightly abstract for A0.

**es-lazarillo** (matches): present/preterite/occasional imperfect, indicative only, no
subjunctive/conditional; concrete everyday vocabulary; short simple sentences.

**es-licenciado-vidriera** (matches): present tense only; basic concrete vocabulary; no
idioms or complex subordination.

**es-monte-de-las-animas** (matches): preterite and imperfect narration typical of A2
storytelling; some abstract terms ("leyenda", "amor", "miedo") alongside concrete
vocabulary; direct speech and connectors ("sin embargo", "finalmente") fit A2.

**es-quijote-molinos** (matches): present/present-perfect only; concrete vocabulary;
short sentences with basic connectors.

**fr-cendrillon** (matches): present tense and passé composé; concrete household
vocabulary; simple short sentences with common connectors.

**fr-chat-botte** (one above): present narration with some passé composé, no passé
simple/imparfait; mostly concrete vocabulary but includes abstractions ("confiance",
"courage", "intelligence", "modestie"); a few idioms ("de toutes ses forces", "prendre à
part"). _For the human reviewer_: this is the largest gap in the set (claimed A1,
estimated A2) — the abstract-noun cluster and idioms are the likely drivers; worth
checking whether they're load-bearing for the plot or could be swapped for more concrete
phrasing if A1 is the firm target.

**fr-chevre-de-m-seguin** (matches): passé composé plus imparfait, typical A2 narrative
tenses; mostly concrete vocabulary with A2-appropriate abstractions ("liberté",
"courage"); a couple of idioms and one complex subordinate clause, still manageable at
A2.

**fr-fables-la-fontaine** (matches): present tense plus passé composé/imparfait;
concrete vocabulary with some abstraction ("vanité", "flatterie"); mostly simple
sentences with one more complex structure noted as still manageable at A1.

**fr-petit-chaperon-rouge** (one above): present tense and imperative only; concrete
vocabulary with light abstraction ("danger", "confiante"); one well-known idiomatic line
("C'est pour mieux t'embrasser"). _For the human reviewer_: the classic idiom is
arguably essential to the story and not really an A2 signal on its own — a plausible
false positive worth a second read.

**it-pinocchio-inizio** (matches): present tense plus passato prossimo; concrete
everyday vocabulary; short sentences with basic connectors, no idioms beyond common
fixed expressions ("avere paura", "avere fame").

**pt-jabuti-onca** (one above): present tense only; concrete animal/nature vocabulary
with a few A1-range abstractions ("sábio", "esperto", "inteligência", "vitória"); simple
subject-verb-object sentences. _For the human reviewer_: fairly borderline — the
abstractions are common enough that A0 is defensible too.

**ro-capra-trei-iezi** (one above): present tense plus a few compound-past forms ("a
auzit", "a intrat", "a văzut"), no subjunctive/conditional; concrete everyday
vocabulary; short sentences with basic conjunctions. _For the human reviewer_: the
compound-past forms are the likely A1 signal — check whether they're avoidable for a
strict A0 shelf.

**zh-chengyu-stories** (one above): aspect markers 了/过 only; high-frequency concrete
vocabulary; the two chengyu (idioms) explained in simple language nonetheless read as
above-A0 content. _For the human reviewer_: idiom stories are near-tautologically
"above A0" since the idiom itself is the point — this may be a claimed-level mismatch
worth revisiting rather than a content problem.

**zh-chengyu-stories-hant (zh-TW edition)** (one above): same tense/vocabulary profile
as the Simplified edition (expected, since it's a script conversion of the same text);
idioms 守株待兔/狐假虎威 are the same above-A0 driver noted above.

## Library expansion — 2026-09-05/06 (18→39 books)

`packages/content/scripts/expand-library.sh` ran unattended against a 22-book target
list (French/Spanish/English classic-literature excerpts plus one Italian, one
Portuguese, one Chinese), pipeline: assemble→build→fill→translate→rebuild→covers→
narrate→words→validate, `SOTTO_LLM_BACKEND=deepseek`. 21 of 22 shipped; 1 parked (below).
Three passes were needed while pipeline bugs were found and fixed:

- **`gloss-fill.ts`'s own-locale identity bug**: `fillMissingGlosses` (build.ts) never
  forced a book's own-content-locale glossary entry back to identity after the LLM call
  — the same class of bug already fixed in `fill-locales.mjs` (see `ro-capra-trei-iezi`
  above) but missed here. Surfaced as `fr-daudet-derniere-classe`'s `glossary["m"].fr`
  coming back `"M."` (copied from `en`) instead of the token's own form `"m"`. Fixed with
  an `OWN_GLOSS_LOCALE` map forcing identity post-fill; the one already-corrupted entry
  was hand-patched in `source/fr-daudet-derniere-classe.bundle.json`.
- **Unhandled `JSON.parse` on truncated/malformed DeepSeek responses**: both
  `translate-sentences.ts`'s and `gloss-fill.ts`'s batch-fill functions threw uncaught on
  a bad parse, killing the whole book. Fixed in both with: 2 retries (was 1), an explicit
  quote-escaping instruction in the system prompt, and logging the raw response (first
  2000 chars) plus the API's `finish_reason` on final failure — the diagnostic that later
  proved this was genuine `finish_reason: "length"` truncation, not a quoting bug.
  `gloss-fill.ts` also gained an explicit `max_tokens: 8000` (was provider-default) and a
  smaller batch size for pinyin-needing (Chinese) books — 5 words/call instead of 40,
  since each entry carries 10 fields (pinyin + 9 locales) versus 9, and DeepSeek's ceiling
  was being hit mid-response even at 8000 tokens for a full batch.
- One cascade artifact of the above: `validate` scans the whole corpus, so any
  in-progress book with incomplete sentence translations shows every other book's
  `validate` step as hundreds of `missing-sentence-translation` errors until that one
  book is fixed. Not a bug — resolved itself once the root book was fixed each time.

### Parked: `zh-luxun-kong-yiji` (孔乙己, Lu Xun)

Not shipped. Root cause is a content-authoring defect, not a pipeline bug: this book's
Chinese text has **zero** author-inserted spaces in any of its 88 sentences (the
`presegmented` tokenizer splits purely on the space character — see
`packages/core/src/tokenize.ts`'s `tokenizePresegmented`), so un-splittable sentences
become single giant "word" tokens. ~50 of these were already baked into
`bundle.glossary` as whole-sentence keys (pre-existing, wrong) and 38 more were still
unglossed, both spanning close to the book's full 88 sentences — this is a systemic
re-authoring job (proper Chinese word segmentation across the whole text), not a
targeted patch. It's what was blowing up `gloss-fill.ts`'s batches (a single "word" that
is actually a full sentence needs a full sentence's worth of pinyin + 9 translations,
easily exceeding any reasonable per-call token budget) — the `max_tokens`/batch-size
fixes above are still correct and worth keeping for future books, they just couldn't fix
_this_ book's underlying content gap.

Source bundle moved (not deleted) to
`packages/content/drafts/parked/zh-luxun-kong-yiji.bundle.json`; its partial built pack
output under `packages/content/packs/zh-CN/books/zh-luxun-kong-yiji/` was removed.
Follow-up would need proper Chinese word segmentation (space-inserting) across the whole
text before re-attempting the pipeline — either a dedicated segmentation pass or a
from-scratch glossary rebuild.

### Validator

`pnpm content:validate` (after parking the book above): **0 errors, 223 warnings**
across all packs (up from 106 warnings at the start of this run — all pre-existing
`gloss-cross-locale-leak`/`gloss-not-identity` warning classes, none new; no errors).

### Level-sanity — 21 new books

Same method as the Lane D3 report above, run against the full corpus post-expansion
(40 rows total, only the 21 new ones shown here — see the table above for the original
18 plus the `zh-TW` edition). **Caveat**: `level-sanity.mjs`'s CEFR estimator only
outputs A0/A1/A2/B1 — it has no B2/C1 bucket. Every book below claimed **B1** is a
genuine within-scale signal; every book claimed **B2 or C1** will mechanically show
`one below` or `unknown` regardless of how accurate the claim actually is, since the
tool cannot output anything above B1. Treat the B2/C1 rows as unverified by this tool,
not as evidence of over-claiming.

| book                       | claimed | estimated | verdict    | sentences | mean len | max len | TTR   | distinct words |
| -------------------------- | ------- | --------- | ---------- | --------- | -------- | ------- | ----- | -------------- |
| en-doyle-red-headed-league | B2      | B1        | one below* | 94        | 18.4     | 33      | 39.7% | 687            |
| en-london-build-a-fire     | B1      | B1        | matches    | 103       | 14.3     | 27      | 34.6% | 510            |
| en-poe-tell-tale-heart     | C1      | B1        | unknown*   | 108       | 18.5     | 34      | 32.8% | 656            |
| es-becquer-maese-perez     | B2      | B1        | one below* | 89        | 18.1     | 26      | 37.4% | 602            |
| es-clarin-adios-cordera    | B2      | B1        | one below* | 100       | 16.0     | 27      | 37.3% | 597            |
| es-conde-lucanor           | B1      | A2        | one below  | 116       | 12.5     | 16      | 35.8% | 521            |
| es-dario-rey-burgues       | C1      | B1        | unknown*   | 94        | 22.3     | 36      | 41.4% | 868            |
| es-larra-vuelva-usted      | C1      | B1        | unknown*   | 87        | 23.5     | 46      | 36.6% | 749            |
| es-palma-tradiciones       | B1      | B1        | matches    | 88        | 14.0     | 25      | 40.4% | 499            |
| es-quiroga-almohadon       | B2      | B1        | one below* | 92        | 17.9     | 24      | 40.9% | 673            |
| es-quiroga-tortuga-gigante | B1      | A2        | one below  | 108       | 12.7     | 16      | 36.7% | 503            |
| fr-daudet-derniere-classe  | B1      | B1        | matches    | 95        | 14.2     | 23      | 38.8% | 522            |
| fr-daudet-les-etoiles      | B1      | A2        | one below  | 87        | 15.5     | 24      | 36.7% | 495            |
| fr-flaubert-coeur-simple   | C1      | B1        | unknown*   | 100       | 21.1     | 42      | 38.1% | 802            |
| fr-maupassant-la-parure    | B2      | B1        | one below* | 110       | 17.1     | 27      | 40.2% | 758            |
| fr-maupassant-le-horla     | C1      | B1        | unknown*   | 105       | 22.5     | 38      | 34.6% | 816            |
| fr-merimee-mateo-falcone   | B2      | B1        | one below* | 122       | 18.6     | 27      | 34.2% | 777            |
| fr-verne-tour-du-monde     | B1      | A2        | one below  | 86        | 15.1     | 20      | 40.8% | 531            |
| fr-voltaire-candide        | B2      | B1        | one below* | 120       | 18.6     | 30      | 38.3% | 853            |
| it-de-amicis-scrivano      | B1      | A2        | one below  | 104       | 12.3     | 16      | 36.6% | 469            |
| pt-machado-cartomante      | B1      | B1        | matches    | 95        | 12.8     | 15      | 40.6% | 495            |

\* B2/C1 claim — verdict is a tool-ceiling artifact, not independently verified (see
caveat above).

Genuine (within-scale) mismatches worth a human read: `es-conde-lucanor`,
`es-quiroga-tortuga-gigante`, `fr-daudet-les-etoiles`, `fr-verne-tour-du-monde`,
`it-de-amicis-scrivano` — all claimed B1, estimated A2, one level over. Everything else
either matches or is a starred tool-ceiling row above.
