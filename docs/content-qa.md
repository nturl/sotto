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
