# Adding a book (Gutenberg → merged PR)

A step-by-step walkthrough for turning a public-domain plain-text source
into a shippable Sotto content pack, from nothing but a URL. If you already
know the schema, see [adding-a-language.md](adding-a-language.md) and
[planning/CONTRACTS.md](../planning/CONTRACTS.md) §2a/§2b instead — this
page is the guided path for a first contribution.

## 0. Sourcing rules

Before touching any text, make sure you actually have the right to adapt
it:

- **Public domain worldwide** is the safest basis — a work whose original
  author died long enough ago (life + 70 years in most jurisdictions, but
  check the specific one) that no copyright remains anywhere. Traditional
  folk tales with no single identifiable author (like `ca-patufet`, a
  Catalan rondalla) are effectively public domain by nature.
- **CC-BY-SA-4.0 (or a compatible CC license)** is also fine if you can
  point to the license explicitly — Sotto's own content contributions ship
  under CC BY-SA 4.0 (`packages/content/LICENSE-CONTENT`), so a
  share-alike-compatible source is the bar. A source under a
  non-commercial or no-derivatives license (CC BY-NC, CC BY-ND) does **not**
  qualify — Sotto abridges the text, which is a derivative work.
- **State the jurisdiction explicitly.** "Public domain" is not a single
  global fact — a text can be public domain in the US (Project Gutenberg's
  own basis, typically pre-1929 US publication) while still under copyright
  in the EU or elsewhere. Write down which jurisdiction(s) you're claiming
  ("Public domain in the US (pre-1929 publication)"; "Public domain
  worldwide (traditional folk tale, no identifiable author)") — this
  becomes the bundle's `sourceJurisdiction` field and is exactly what a
  reviewer checks first.
- **Never adapt from a copyrighted edition, translation, or annotated text**
  — even when the underlying work is public domain, a specific modern
  translation, critical edition, or annotated edition can carry its own,
  separate copyright. Project Gutenberg's plain "Etext" editions (the
  `.txt` files, not a publisher's illustrated/annotated reissue) are the
  safe default; if you're not sourcing from Gutenberg, pick the oldest
  faithful edition you can find and say so in `sourceEdition`.
- Only contribute text you personally verified against the rules above —
  "probably fine" isn't good enough for a merged PR. If in doubt, open an
  issue with the `.github/ISSUE_TEMPLATE/language_pack.md` template first
  and ask.

## 1. Get the source text

Project Gutenberg's plain-text mirror works well for this. Example — a
short French fable collection:

```sh
curl -s https://www.gutenberg.org/cache/epub/49712/pg49712.txt -o /tmp/source.txt
```

Open the file and strip Gutenberg's boilerplate header/footer (the
"*** START OF THE PROJECT GUTENBERG EBOOK _**" / "**_ END ..." markers and
everything outside them) — only the actual story text should go into your
working file. Note the exact URL and edition/printing you used; you'll need
both for provenance.

## 2. Abridge to A0 / A1 / A2

Sotto books are short, simplified retellings, not the raw source text
verbatim — abridge the story down to the target CEFR level before running
it through the scaffold. `docs/content-qa.md`'s level-sanity report (a
DeepSeek-scored pass over all 18 shipped books) gives the empirical
heuristics reviewers actually use, distilled here:

- **Tense inventory is the single strongest level signal.** A0 stays in
  present tense only, no past/future marking at all. A1 allows one simple
  past tense (passé composé, preterite, etc.) alongside the present. A2
  allows two narrative past tenses together (e.g. French passé composé +
  imparfait, Spanish preterite + imperfect) and simple future.
- **Concrete vocabulary over abstract.** A0/A1 should stay almost entirely
  in high-frequency, concrete nouns and verbs (animals, food, family,
  everyday objects/actions). Abstractions ("courage", "kindness",
  "freedom") and idioms are what repeatedly pushed books one level above
  their claimed target in the level-sanity report — if the story needs an
  abstract word to make sense, that's a signal the target level should be
  A2, not that the word should be forced lower.
- **Sentence length and structure.** A0 sentences run short (mean ~7-8
  words in the shipped set) with simple subject-verb-object structure and
  minimal subordination. A2 tolerates longer sentences (mean ~11-13 words)
  with a connector or two ("however", "finally", "because") and an
  occasional subordinate clause.
- **Type-token ratio** (distinct words / total words) isn't a hard rule but
  a low, repetitive vocabulary reads easier than a large one even at the
  same sentence complexity — reusing the same handful of nouns/verbs across
  the story is a deliberate A0/A1 technique, not a flaw.

Rewrite/shorten the source into your own abridged retelling at the chosen
level — you're producing a new adapted text, not copy-pasting the original
(see the sourcing rules above: even a public-domain original doesn't mean
skipping abridgment is fine license-wise if the source is long and you only
want a short excerpt — clearly labeling it as an abridged excerpt is fine).
Save the abridged story as one plain-text file, one blank line between
paragraphs.

## 3. Scaffold the bundle

```sh
pnpm content:new -- fr-my-fable --locale fr-FR --title "Ma fable" \
  --author "La Fontaine (adapted)" --from /tmp/abridged.txt --level A1
```

This writes `packages/content/source/fr-my-fable.bundle.json` with every
schema-required field present (`packages/content/src/types.ts`'s
`SourceBundleSchema`). `--from` splits your file into one chapter: blank
lines become paragraphs, sentences within a paragraph are split by a simple
punctuation-based splitter. **Review the split** — it's deliberately naive
(doesn't know abbreviations, won't handle unusual dialogue punctuation) and
you're expected to fix any bad breaks by hand in the bundle JSON before
moving on. Without `--from`, you get a single placeholder chapter to fill
in by hand instead.

The scaffold cannot know your source's provenance, so it fills those
fields with literal `CONFIRM: ...` placeholder text:
`sourceEdition`, `sourceUrl`, `sourceJurisdiction`, `adaptationEditor`, and
`license.attribution`. **Replace every `CONFIRM: ...` string** with the
real value before you're done — grep the bundle for `CONFIRM:` to make sure
none remain:

```sh
grep -n 'CONFIRM:' packages/content/source/fr-my-fable.bundle.json
```

It refuses to overwrite an existing bundle — pick a different `bookId` (or
edit the existing file directly) if you get that error. `bookId` must be
kebab-case and start with the base language code (`fr-...`, `es-...`,
`ca-...`).

While you're in there by hand, also fill in: `categories` (one of `tales`,
`fables`, `adventure`, `classics`, `folk`, `idioms`, `daily`),
`estimatedMinutes`, `localizedTitles`/`premise`/`summary` (at least an
`en` entry — other locales can be filled by the LLM step below),
`tutorNotes` (pronunciation/grammar/culture/commonErrors notes for a
learner), and at least one real `vocabulary` entry and `comprehension`
question.

## 4. Fill glosses and translations

Point the local model stack's LLM endpoint at `SOTTO_LLM_URL` (default
`http://127.0.0.1:8080/v1`) — see [local-models.md](local-models.md) for how
to run one. Then:

```sh
pnpm content:build fr-my-fable --fill
```

This tokenizes every sentence, looks up each word in the bundle's
`glossary`, and — with `--fill` (or automatically, if it detects the LLM is
reachable) — asks the LLM to draft glosses for whatever's missing, writing
them back into the source bundle. It also builds the pack under
`packages/content/packs/fr-FR/books/fr-my-fable/`.

Sentence-level translations (the `translation` map on each sentence, used
for tap-to-translate) are filled separately:

```sh
pnpm content:translate-sentences -- --book fr-my-fable
```

Both commands are draft-quality LLM output — **read them before trusting
them**, especially any content word you know is tricky (idioms, false
friends, culturally specific terms). Re-run `pnpm content:build fr-my-fable`
after any manual glossary edits to regenerate the pack.

## 5. Cover and narration

```sh
pnpm content:covers
```

Generates a deterministic, seeded flat-geometric `cover.svg` for any book
missing one (palette chosen by `categories[0]`) — no art assets needed.

```sh
pnpm content:narrate fr-my-fable
```

Only if `fr-FR`'s `LanguageDefinition.ttsVoice` in
`packages/core/src/languages.ts` is set (not `null`) — calls Kokoro,
transcribes the result with whisper for word-level timestamps, and aligns
those onto the pack's tokens. Skip this step entirely for a locale with no
Kokoro voice yet (the reader hides the transport controls for that book
instead, which is a fully supported, just non-narrated, state).

## 6. Validate

```sh
pnpm content:validate
```

Checks (CONTRACTS §2b): missing license, invalid locale, duplicate ids,
token/sentence id mismatch, missing gloss for a word token, missing
referenced asset file, `reviewStatus: stable` without `reviewedBy`,
incomplete UI/content message catalogs, and (Chinese only) a missing
pinyin. This must report **0 errors** before you open a PR (warnings are
fine to leave for a human reviewer — see below). Run
`pnpm content:validate -- --fixtures` if you're touching the validator
itself; not needed for a normal content PR.

Finally, run the full gate before opening the PR:

```sh
pnpm check
```

## 7. Open the PR

Push your branch and open a PR. The template
(`.github/PULL_REQUEST_TEMPLATE.md`) has a "Content contributions"
checklist — fill it out honestly, it's exactly what a reviewer checks:

- source is public domain or compatibly licensed, with the basis linked/stated
- `sourceUrl` / `sourceJurisdiction` / `sourceEdition` are filled with real
  values (no `CONFIRM: ...` left over)
- no text copied from a copyrighted translation or edition
- `pnpm content:validate` passes
- `reviewStatus` is `draft` unless a named human reviewer signs off

**Every AI-drafted book ships as `reviewStatus: "draft"`** — that's the
scaffold's default, and it stays that way until a named human reviewer
reads the text, glosses, and translations and is willing to attach their
name as `reviewedBy` with `reviewStatus: "reviewed"` or `"stable"`. Don't
flip that field yourself just because the validator passes; a clean
validator run means the pack is structurally correct, not that a human
verified the content. See [CONTRIBUTING.md](../CONTRIBUTING.md#reviewing-content-prs)
for what a reviewer is checking on their side.
