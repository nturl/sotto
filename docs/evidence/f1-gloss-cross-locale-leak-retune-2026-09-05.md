# F1 — `gloss-cross-locale-leak` validator retune (2026-09-05, Lane R3-F)

## What changed

`packages/content/src/validate.ts`'s `glossCrossLocaleLeakIssues` (warning-
only rule) previously flagged every pair of `GLOSS_LOCALES` sharing a
byte-identical, non-identity gloss — 19,684 warnings at last count
(`docs/evidence/checks-preflight-run3-2026-09-05.log`), almost all on
legitimate shared vocabulary: Romance cognates (`persona`/`tigre`/`ser`
identical across `es`/`pt`/`ca`/`it`), Simplified/Traditional Chinese
sharing thousands of unchanged characters, and proper nouns/numbers.

Retuned to fire only when the shared gloss crosses a family boundary that a
real cognate can't plausibly cross:

- **Script boundary**: one locale in `CJK_LOCALES` (`zh-Hans`/`zh-Hant`),
  the other not. A literal string can't be a genuine word in both a
  Han-script locale and a Latin-script one. (`zh-Hans`/`zh-Hant` sharing a
  gloss with _each other_ is explicitly exempted — normal
  Simplified/Traditional overlap.)
- **`en` + a diacritic**: `en` sharing a non-ASCII gloss with any other
  locale — real English words are ASCII; an accented string is a different
  language's word.
- **Romanian-only / Catalan-only characters**: a gloss containing
  Romanian-exclusive letters (`ă â î ș ț`) shared with a pair that doesn't
  include `ro`, or containing the Catalan geminate-l interpunct (`·`)
  shared with a pair that doesn't include `ca`.
- **Wide share including `en`**: a gloss identical across 4+ of the 9
  `GLOSS_LOCALES`, including `en` — a narrower, additional signal for
  widescale copy/paste, gated the same as the others.

Proper nouns (capitalized surface form) and numerals are exempted from all
four tests via `isProperNounOrNumericToken` — a character's name or a
number is routinely identical across many/all locales without being a
leak.

Both new helpers (`isImplausibleGlossPair`, `isProperNounOrNumericToken`)
are exported from `validate.ts` for direct unit testing (see §4).

## Before / after counts

Full run: `pnpm content:validate` (baseline captured before this change:
`docs/evidence/checks-preflight-run3-2026-09-05.log`, tail line
`0 errors, 19684 warnings`; this session's own baseline re-run got
`19652` `gloss-cross-locale-leak` warnings specifically out of that
19,684 — the other 32 were other warning rules, e.g.
`low-alignment-match-rate`).

**Total `gloss-cross-locale-leak` warnings: 19,652 → 74** (well under the
500 target). **0 errors before and after** — this rule is warning-only and
was never gating `pnpm check`.

Per pack-locale directory (the scope prefix `content:validate` groups by —
i.e. the _book's own_ pack locale, not the gloss locale pair):

| pack locale | before | after |
| ----------- | -----: | ----: |
| ca-ES       |    529 |     0 |
| en-US       |  5,782 |     0 |
| es-419      |  3,932 |    23 |
| fr-FR       |  5,814 |    17 |
| it-IT       |  1,570 |     4 |
| pt-BR       |    830 |    18 |
| ro-RO       |    433 |     0 |
| zh-CN       |    381 |     6 |
| zh-TW       |    381 |     6 |
| **total**   | 19,652 |    74 |

## What the remaining 74 warnings are

Manually reviewed every unique message (74 lines, `sort -u`). Two shapes:

1. **`en`/`zh-Hans`/`zh-Hant` sharing the string `"that"` for the token
   `que`** (30 of the 74, across `es-monte-de-las-animas`,
   `fr-chat-botte`, and others) — a Latin-script string in a
   `zh-Hans`/`zh-Hant` gloss field. This is arguably a **genuine finding**
   worth a human look: either the Chinese gloss for this function word was
   never actually translated into Chinese and is carrying the English
   gloss instead, or (less likely) `que`→`that` is an intentional
   simplification that happens to read identically in the "en" field. Not
   auto-fixed here — it's a warning, and F4 (human review of FR/ES drafts)
   is explicitly out of scope for this lane; flagging in case it's useful
   for that pass or a follow-up.
2. **Everything else (44 of the 74)** — the "4+ locales including `en`"
   wide-share signal firing on genuine pan-Romance/English loanwords/
   cognates: `animal` (en/fr/es/pt/ro/ca, 6 locales), `jaguar`/`onça`
   (en/fr/es/ro/ca, 5 locales — "jaguar" is itself a loanword from Tupi
   into all five), `idea`/`idée`/`ideia` (en/es/it/ca, 4 locales),
   `moment`/`momento` (en/fr/ro/ca, 4), `secret`/`secreto` (en/fr/ro/ca,
   4), `important`/`importante` (en/fr/ro/ca, 4), `instrument`/
   `instrumento` (en/fr/ro/ca, 4), `actor`/`attore` (en/es/ro/ca, 4),
   `favor`/`favore` (en/es/pt/ca, 4), `familiar`/`familier` (en/es/pt/ro/
   ca, 5). Every one of these is a real, well-attested cross-language
   cognate, not a leak — the R3-F1 task brief explicitly named "identical
   across 4+ locales including en" as one of the heuristics to add, and it
   does reduce false positives dramatically overall (19,652 → 74), but on
   inspection it doesn't catch any additional _true_ leaks in this corpus
   beyond what the CJK-script and `en`-diacritic tests already catch — its
   entire remaining yield here is well-known loanwords. Kept as specified
   (still only a warning, never an error), but noting for the record that
   a future tightening pass could drop this specific sub-rule (or raise
   its threshold further) without losing real-leak coverage in the
   current corpus.

No false negatives found: the actual known real-leak class (a book's own-
locale gloss carrying a _different_ locale's gloss verbatim — the
`es-licenciado-vidriera` bug from F2.3) is still caught, at full strength,
by the separate `gloss-not-identity` rule (error severity), which this
change did not touch.

## Fixture and tests

- `packages/content/test/fixtures/invalid/gloss-cross-locale-leak/books/fx-book/chapters/01.json`:
  the fixture's `chat` token previously relied on an `es`/`pt` "gato"/"gato"
  pair to trip the rule — under the retuned rule that pair is a correctly-
  suppressed Romance cognate, so the fixture no longer exercised the rule
  under test (it still "passed" only incidentally, via unrelated
  `missing-sentence-translation` errors already present in the fixture).
  Added a `"zh-Hans": "cat"` gloss to the same token — a genuine
  script-boundary leak (Latin text in a Chinese gloss field) — so
  `pnpm --filter @sotto/content validate --fixtures` genuinely exercises
  `gloss-cross-locale-leak` again. The `es`/`pt` "gato" pair is left in
  place deliberately, now serving as an in-fixture negative case.
- `packages/content/test/validate.test.ts`: updated the existing
  `gloss-cross-locale-leak` describe block's assertions to match (now
  asserts on the `"en" and "zh-Hans"` pairing, and explicitly asserts the
  `"es" and "pt"` pairing is _not_ flagged).
- `packages/content/test/gloss-cross-locale-leak-heuristic.test.ts` (new,
  fixture-free): 8 cases calling the exported `isImplausibleGlossPair`
  directly — 4 true-leak shapes (CJK/non-CJK crossing both directions, `en`
  - an accented Romance string, a Romanian-only-diacritic string shared
    outside `ro`) and 4 cognates that must pass (`es`/`pt` "tigre",
    `zh-Hans`/`zh-Hant` sharing a character, `en`/`ca` "animal", a
    Romanian-diacritic string when `ro` actually is one of the two locales).

All 11 tests across both files pass (`pnpm vitest run
packages/content/test/gloss-cross-locale-leak-heuristic.test.ts
packages/content/test/validate.test.ts`).
