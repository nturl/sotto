# Library expansion run: 18 -> 40 books, levels A0 -> C1

Run prompt for the 2026-09-05 content expansion. Orchestrator: Fable (plans, dispatches, reviews, runs the pipeline). Keystrokes: Sonnet subagents. This file is the spec every lane reads; the ledger for the run is the "Library expansion" section appended to `planning/LEDGER.md`.

## Goal

Sotto's library grows from 18 books (19 with the zh-TW edition) to 40 base books, and the CEFR ladder extends from A0/A1/A2 to A0/A1/A2/B1/B2/C1 end to end: schema, CLI, client filters, onboarding, tutor prompt, server validation, docs. Every new book is a public-domain classic abridged and retold at its target level, with the full existing pipeline applied: 9-locale glosses, 9-locale sentence translations, cover, Kokoro narration with whisper word alignment, word-pronunciation sprite, validator green. All new books ship `reviewStatus: "draft"`.

## Definition of done

1. `SourceBundleSchema.level` and every other CEFR enum in the repo accept `A0|A1|A2|B1|B2|C1` (list below). `pnpm typecheck`, `pnpm lint`, `pnpm test` green.
2. Library and onboarding show six level chips/options; 9 UI catalogs have `onboarding.level.b1.desc`, `.b2.desc`, `.c1.desc`.
3. 22 new source bundles exist under `packages/content/source/`, built under `packages/content/packs/<locale>/books/<bookId>/`, each with `cover.svg`, `audio/*.mp3` with startMs/endMs on tokens, `audio/words.mp3` + `words.json`, and 9-locale glosses and sentence translations. `pnpm content:validate` reports 0 errors.
4. `docs/content-qa.md` gains a level-sanity table for the 22 new books (report only, no promotions). `docs/supported-languages.md` book counts updated.
5. Committed (own files only), pushed, deployed with `pnpm deploy:web`, and the hosted site opens one new B2 book and one new C1 book in the reader with narration playing.

## Book list (22 new)

Mix favors French and Spanish (Noel's two learning languages), one B1-or-above book for each smaller locale. All authors dead 70+ years, so public domain worldwide; the Doyle and London titles are also pre-1929 US publications.

| bookId | locale | level | source | author (died) |
| --- | --- | --- | --- | --- |
| fr-daudet-les-etoiles | fr-FR | B1 | "Les Étoiles" (Lettres de mon moulin, 1869) | Alphonse Daudet (1897) |
| fr-daudet-derniere-classe | fr-FR | B1 | "La Dernière Classe" (Contes du lundi, 1873) | Alphonse Daudet (1897) |
| fr-verne-tour-du-monde | fr-FR | B1 | Le Tour du monde en quatre-vingts jours, ch. 1-5 abridged (1873) | Jules Verne (1905) |
| fr-maupassant-la-parure | fr-FR | B2 | "La Parure" (1884) | Guy de Maupassant (1893) |
| fr-merimee-mateo-falcone | fr-FR | B2 | "Mateo Falcone" (1829) | Prosper Mérimée (1870) |
| fr-voltaire-candide | fr-FR | B2 | Candide, ch. 1-4 abridged (1759) | Voltaire (1778) |
| fr-maupassant-le-horla | fr-FR | C1 | "Le Horla" (1887, second version), abridged | Guy de Maupassant (1893) |
| fr-flaubert-coeur-simple | fr-FR | C1 | "Un cœur simple" (Trois contes, 1877), abridged | Gustave Flaubert (1880) |
| es-quiroga-tortuga-gigante | es-419 | B1 | "La tortuga gigante" (Cuentos de la selva, 1918) | Horacio Quiroga (1937) |
| es-conde-lucanor | es-419 | B1 | El Conde Lucanor, three exemplos retold (1335) | Don Juan Manuel (1348) |
| es-palma-tradiciones | es-419 | B1 | Tradiciones peruanas, two tradiciones retold (1872-) | Ricardo Palma (1919) |
| es-clarin-adios-cordera | es-419 | B2 | "¡Adiós, Cordera!" (1892) | Leopoldo Alas "Clarín" (1901) |
| es-quiroga-almohadon | es-419 | B2 | "El almohadón de plumas" (1907) | Horacio Quiroga (1937) |
| es-becquer-maese-perez | es-419 | B2 | "Maese Pérez el organista" (1861) | Gustavo Adolfo Bécquer (1870) |
| es-dario-rey-burgues | es-419 | C1 | "El rey burgués" (Azul..., 1888) | Rubén Darío (1916) |
| es-larra-vuelva-usted | es-419 | C1 | "Vuelva usted mañana" (1833) | Mariano José de Larra (1837) |
| en-london-build-a-fire | en-US | B1 | "To Build a Fire" (1908), abridged | Jack London (1916) |
| en-doyle-red-headed-league | en-US | B2 | "The Red-Headed League" (1891), abridged | Arthur Conan Doyle (1930; US pre-1929) |
| en-poe-tell-tale-heart | en-US | C1 | "The Tell-Tale Heart" (1843) | Edgar Allan Poe (1849) |
| it-de-amicis-scrivano | it-IT | B1 | "Il piccolo scrivano fiorentino" (Cuore, 1886) | Edmondo De Amicis (1908) |
| pt-machado-cartomante | pt-BR | B1 | "A Cartomante" (1884), abridged | Machado de Assis (1908) |
| zh-luxun-kong-yiji | zh-CN | B1 | 《孔乙己》(1919), abridged | Lu Xun 鲁迅 (1936) |

Not added: ro-RO and ca-ES stay at one book each (no Kokoro voice, and the run's value is in FR/ES). No zh-TW edition for the new zh book (no `hantOverrides` authored; flagged as follow-up).

## Level targets for authors

Length and complexity ladder, extending the A-level heuristics in `docs/adding-a-book.md` §2. These are the numbers the level-sanity report will be judged against.

| level | chapters | words | mean sentence len | tense/grammar inventory | vocabulary |
| --- | --- | --- | --- | --- | --- |
| B1 | 3 | 1,200-1,600 | 12-15 | all indicative tenses, simple relative clauses, common connectors, occasional conditional; FR/ES: passé composé/imparfait or pretérito/imperfecto freely, plus-que-parfait/pluscuamperfecto sparingly, no subjunctive except fixed phrases | everyday plus some abstract nouns; idioms only when glossable in one line |
| B2 | 3-4 | 1,600-2,200 | 15-19 | full indicative, present subjunctive, conditional, passive, reported speech, longer subordination; FR passé simple allowed in narration | broad; some literary or period vocabulary; irony and implication carried by the text |
| C1 | 4 | 2,000-2,600 | 18-24 | anything the original uses: FR passé simple and subjonctif imparfait if idiomatic, ES pluperfect subjunctive, long periodic sentences, free indirect style | close to the original register; rare words kept when they carry the tone |

Rules for every level: retell in your own words, do not paste the original text (even at C1 the text is an abridged retelling of a public-domain source, not a copy of a copyrighted modern edition). Keep names, places, plot beats and the famous lines that make the story recognizable. No modern translation as source. Dialogue uses the language's conventional punctuation (« » with spaces in French, — dashes in Spanish, curly quotes in English). One sentence per array item; sentence splitting is the author's job, not the scaffold's.

## Draft format (what authors write)

One file per book at `packages/content/drafts/<bookId>.draft.json`. The orchestrator's `scripts/assemble-draft.mjs` turns it into a schema-valid source bundle; authors never touch `source/` or `packs/` and never run `pnpm`.

```json
{
  "bookId": "fr-maupassant-la-parure",
  "contentLocale": "fr-FR",
  "title": "La Parure",
  "author": "Guy de Maupassant",
  "sourceEdition": "Contes du jour et de la nuit (1885), Project Gutenberg plain-text edition",
  "sourceUrl": "https://www.gutenberg.org/ebooks/<id or search page>",
  "sourceJurisdiction": "Public domain worldwide (author died 1893)",
  "level": "B2",
  "categories": ["classics"],
  "estimatedMinutes": 18,
  "localizedTitles": { "en": "The Necklace", "fr": "La Parure" },
  "premise": { "en": "...one sentence...", "fr": "..." },
  "summary": { "en": "...two or three sentences, no spoilers of the ending...", "fr": "..." },
  "contentWarning": null,
  "tutorNotes": {
    "pronunciation": "English prose for the tutor: 2-3 sentences on sounds a learner at this level still gets wrong in this text.",
    "grammar": "2-3 sentences naming the structures this text leans on (e.g. passé simple narration, subjonctif after 'bien que').",
    "culture": "2-3 sentences of period/social context a learner needs.",
    "commonErrors": "2-3 sentences on false friends and confusions this text invites."
  },
  "vocabulary": [{ "word": "parure", "gloss": { "en": "set of jewels, necklace", "fr": "parure" } }],
  "comprehension": [{ "question": { "en": "...", "fr": "..." } }],
  "chapters": [
    {
      "title": "Chapitre 1 — Une invitation",
      "paragraphs": [["Sentence one.", "Sentence two."], ["Next paragraph, sentence one."]]
    }
  ]
}
```

Field rules: `localizedTitles`/`premise`/`summary`/comprehension carry `en` plus the book's own locale key (`fr`, `es`, `en`, `it`, `pt`, `zh-Hans`); the pipeline fills the other locales. The native-locale gloss of a vocabulary word is the word itself. 10-14 vocabulary entries chosen as the words a learner at that level would tap; 4-5 comprehension questions, at least one inferential. `categories` from `tales|fables|adventure|classics|folk|idioms|daily`. `estimatedMinutes` = words / 110 rounded up. zh: vocabulary entries also carry `pinyin` with tone marks; chapter text uses Chinese punctuation and no spaces. `sourceUrl` must be a real Gutenberg, Wikisource, or Biblioteca Virtual Miguel de Cervantes page for the work; if unsure of the exact ebook id, use the author's Gutenberg search URL and say so in `sourceEdition`.

## Lanes

### Lane P: pipeline and schema (Sonnet, one agent, runs first)

Files: `packages/content/src/{types,scaffold,cli,gloss-fill,build}.ts`, `packages/content/src/import/types.ts`, `packages/content/scripts/fill-locales.mjs`, new `packages/content/scripts/assemble-draft.mjs`, `packages/core/src/{models,export}.ts`, `apps/client/src/ui/dev/fixtures.ts`, `apps/client/app/(tabs)/library.tsx`, `apps/client/app/onboarding/level.tsx`, `apps/client/src/import/api.ts`, `apps/client/src/i18n/*.json`, `apps/server/src/voice/types.ts`, `apps/server/src/import/routes.ts`, `docs/contracts.md`, `planning/CONTRACTS.md`, `docs/adding-a-book.md`, tests that assert the enum.

1. Extend every CEFR enum to `A0,A1,A2,B1,B2,C1`. Introduce `BOOK_LEVELS` const in `packages/core/src/models.ts` and derive `BookLevel` from it; import it where a literal list exists today (library chips, onboarding options, scaffold validation, CLI usage string). Keep zod enums explicit but complete.
2. i18n: add `onboarding.level.b1.desc` ("I can read simple stories"), `b2` ("I read comfortably about familiar topics"), `c1` ("I can read almost anything") to all 9 catalogs in each catalog's language; the validator checks key parity against `en.json`.
3. `gloss-fill.ts`: add a `deepseek` backend selected by `SOTTO_LLM_BACKEND=deepseek`, mirroring `translate-sentences.ts` exactly (same URL, model `deepseek-v4-flash`, key from `~/.config/deepseek/api_key`, `thinking: {type:'disabled'}`, `response_format: json_object`, one retry on parse failure or 5xx, usage counters printed at the end of build). `build.ts`: when the backend is deepseek, `shouldTryFill` is true without probing the local URL. Never log the key.
4. `fill-locales.mjs`: add `en`, `fr`, `es` to `LOCALE_LANGUAGE_NAME` and `DEFAULT_ORDER` so a French book's missing `es`/`en` `premise`/`summary`/`localizedTitles`/`vocabulary.gloss` get filled too (glossary entries are already all-locale from gloss-fill; the script's per-locale loop must keep the identity short-circuit for the native locale).
5. `scripts/assemble-draft.mjs <bookId>`: reads `drafts/<bookId>.draft.json`, writes `source/<bookId>.bundle.json` with `schemaVersion: 1`, `adaptationEditor: "Sotto contributors (AI first draft, unreviewed)"`, `reviewStatus: "draft"`, `license: {spdx: "CC-BY-SA-4.0", attribution: "Sotto contributors; based on the public-domain original by <author>"}`, `glossary: {}`, chapters converted from string arrays to `{sentences:[{text, translation:{}}]}`. Validates with `SourceBundleSchema`, refuses if any string contains `CONFIRM:`, refuses to overwrite unless `--force`. Prints sentence count, word count, mean sentence length.
6. Proof: `pnpm typecheck && pnpm lint && pnpm test` green (prettier may fail on another session's dirty files; run `prettier --check` only on the files you touched). Report the file list.

### Lanes A1-A10: authoring (Sonnet, ten agents in parallel, 2-3 books each)

Each agent writes its draft files only. Groups: FR B1 (Daudet x2), FR B1/B2 (Verne, Parure), FR B2 (Mérimée, Candide), FR C1 (Horla, Cœur simple), ES B1 (Quiroga tortuga, Conde Lucanor), ES B1/B2 (Palma, Clarín), ES B2 (Almohadón, Maese Pérez), ES C1 (Darío, Larra), EN (London, Doyle, Poe), other (De Amicis, Machado, Lu Xun). Proof: file parses as JSON, word count within the level band, no `CONFIRM:`, every sentence array non-empty.

### Lane O: orchestrator pipeline (Fable, sequential per book, background)

For each drafted book, in order, under the content build lock:

```sh
node packages/content/scripts/assemble-draft.mjs <bookId>
SOTTO_LLM_BACKEND=deepseek pnpm content:build <bookId> --fill
node packages/content/scripts/fill-locales.mjs --books=<bookId> --backend=deepseek
SOTTO_LLM_BACKEND=deepseek pnpm content:translate-sentences -- --book <bookId>
pnpm content:build <bookId>
pnpm content:covers
pnpm content:narrate <bookId>
pnpm content:word-audio <bookId>
pnpm content:validate
```

Then `node packages/content/scripts/level-sanity.mjs` for the new books appended to `docs/content-qa.md`, docs updates, commit per batch with explicit paths only, push, `pnpm deploy:web`, Browser-pane check of one B2 and one C1 book.

## Constraints and known hazards

- Another session is editing `apps/server/src/*`, `apps/client/app/account/*`, and word-audio for 4 existing books. Never run a full `pnpm content:build` (rebuilds every book); always pass a bookId. Commit with `git commit -- <paths>`.
- Kokoro container `ods-tts` has a 4 GB limit and has OOM-killed before; narrate one book at a time, `docker restart ods-tts` if a call exceeds 30 s.
- whisper-server on :9001 must be up for alignment (it is at run start); llama-server on :8080 is up but is not used (DeepSeek for all fills).
- Pack size grows from 87 MB toward ~400 MB with 22 narrated books plus word sprites. `pnpm deploy:web` copies all packs into `dist/`; the PWA caches per book, so client impact is per opened book only. Watch the deploy upload; if Vercel rejects the size, deploy without `audio/words.mp3` for the new books and note it.
- DeepSeek spend: previous 18-book, 6-locale sweep was ~1.2 M prompt tokens. This run is 22 longer books over 9 locales; expect 4-6 M tokens, still single-digit dollars on v4-flash.
- Levels above A2 mean `selectRecommendedBooks` matches only exact level; a C1 learner sees only C1 books on the recommended rail. Acceptable for this run; note as a follow-up (recommend level and one below).
- Nothing leaves `draft`. Human review of FR/ES by Noel is the path to `reviewed`.
