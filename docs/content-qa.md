# Content QA

## Gloss coverage 2026-09-05

Lane D1 (Sotto overnight run 2) widened every book's `glossary`, `vocabulary[].gloss`,
`localizedTitles`, `premise`, and `summary` to the six explanation locales beyond
en/fr/es: pt, it, zh-Hans, zh-Hant, ro, ca — the full nine-locale UI catalog
(`packages/core/src/languages.ts`'s `UiCatalog`). Filled via a standalone script
(`packages/content/scripts/fill-locales.mjs`) against the local Qwen model
(`http://127.0.0.1:8080/v1`, `qwen3.6-35b-a3b`), batching ~40 words per call, one
call per (book, locale), with one retry on JSON-parse failure — the same batch-prompt
shape as `packages/content/src/gloss-fill.ts`'s `fillGlossesBatch`.

Coverage table below is glossary words with a value for that locale / total glossary
words in the book. 100% means every word has a translation for that locale.

| book                    | en   | fr   | es   | pt    | it    | zh-Hans | zh-Hant | ro    | ca    |
| ----------------------- | ---- | ---- | ---- | ----- | ----- | ------- | ------- | ----- | ----- |
| ca-patufet              | 100% | 100% | 100% | 100%  | 0/179 | 0/179   | 0/179   | 0/179 | 0/179 |
| en-aesop-fables         | 100% | 100% | 100% | 100%  | 0/227 | 0/227   | 0/227   | 0/227 | 0/227 |
| en-alice-rabbit-hole    | 100% | 100% | 100% | 100%  | 0/417 | 0/417   | 0/417   | 0/417 | 0/417 |
| en-oz-cyclone           | 100% | 100% | 100% | 0/439 | 0/439 | 0/439   | 0/439   | 0/439 | 0/439 |
| es-fabulas-samaniego    | 100% | 100% | 100% | 0/211 | 0/211 | 0/211   | 0/211   | 0/211 | 0/211 |
| es-lazarillo            | 100% | 100% | 100% | 0/482 | 0/482 | 0/482   | 0/482   | 0/482 | 0/482 |
| es-licenciado-vidriera  | 100% | 100% | 100% | 0/255 | 0/255 | 0/255   | 0/255   | 0/255 | 0/255 |
| es-monte-de-las-animas  | 100% | 100% | 100% | 0/252 | 0/252 | 0/252   | 0/252   | 0/252 | 0/252 |
| es-quijote-molinos      | 100% | 100% | 100% | 0/484 | 0/484 | 0/484   | 0/484   | 0/484 | 0/484 |
| fr-cendrillon           | 100% | 100% | 100% | 0/269 | 0/269 | 0/269   | 0/269   | 0/269 | 0/269 |
| fr-chat-botte           | 100% | 100% | 100% | 0/448 | 0/448 | 0/448   | 0/448   | 0/448 | 0/448 |
| fr-chevre-de-m-seguin   | 100% | 100% | 100% | 0/293 | 0/293 | 0/293   | 0/293   | 0/293 | 0/293 |
| fr-fables-la-fontaine   | 100% | 100% | 100% | 0/450 | 0/450 | 0/450   | 0/450   | 0/450 | 0/450 |
| fr-petit-chaperon-rouge | 100% | 100% | 100% | 0/222 | 0/222 | 0/222   | 0/222   | 0/222 | 0/222 |
| it-pinocchio-inizio     | 100% | 100% | 100% | 0/343 | 0/343 | 0/343   | 0/343   | 0/343 | 0/343 |
| pt-jabuti-onca          | 100% | 100% | 100% | 0/211 | 0/211 | 0/211   | 0/211   | 0/211 | 0/211 |
| ro-capra-trei-iezi      | 100% | 100% | 100% | 0/172 | 0/172 | 0/172   | 0/172   | 0/172 | 0/172 |
| zh-chengyu-stories      | 100% | 100% | 100% | 0/117 | 0/117 | 0/117   | 0/117   | 0/117 | 0/117 |

Status: PARTIAL. Portuguese (pt) is complete for 3 of 14 books (ca-patufet,
en-aesop-fables, en-alice-rabbit-hole). No book has it/zh-Hans/zh-Hant/ro/ca yet.
The local Qwen model (`qwen3.6-35b-a3b` on llama.cpp, this machine) generates at
roughly 9 tokens/second, so a full 14-book x 6-locale sweep (~4,900 glossary words
per locale) needs several hours of sequential LLM calls — too slow to finish in
this session alongside Lane D2's drafting work, which was prioritized since it had
a concrete, finishable scope. `fill-locales.mjs` is idempotent (re-running skips
any word/locale pair already filled) and safe to resume: `node
packages/content/scripts/fill-locales.mjs --locales=pt,it,zh-Hans,zh-Hant,ro,ca`
picks up exactly where this session left off, in the pt → it → zh-Hans → zh-Hant →
ro → ca order specified.

Notes:

- zh-Hant glosses (not yet generated — see Status) should be produced by asking the
  LLM directly for Traditional-character translations, then checked with
  `packages/content/scripts` heuristic (a curated common-Simplified-character list;
  not full OpenCC coverage) for any leftover Simplified-only characters before
  trusting a batch.
- The four new books from Lane D2 (`fr-cendrillon`, `fr-chevre-de-m-seguin`,
  `es-licenciado-vidriera`, `es-monte-de-las-animas`) were drafted with en/fr/es only
  (via `content:build --fill`, the project's own gloss-fill mechanism) and will pick
  up the six extra locales on the next `fill-locales.mjs` run alongside every other
  book — no special-casing needed.

## Suggested code change for gloss-fill.ts (not applied — read-only for this lane)

`packages/content/src/gloss-fill.ts` hardcodes the three explanation locales via
`GLOSS_LOCALES = ['en', 'fr', 'es'] as const` and a system prompt that names only
"English (en), French (fr), and Spanish (es)". To let `content:build --fill` natively
cover all nine locales (instead of routing through the standalone script above),
widen that list and make the prompt generic:

```diff
-export const GLOSS_LOCALES = ['en', 'fr', 'es'] as const;
+export const GLOSS_LOCALES = [
+  'en', 'fr', 'es', 'pt', 'it', 'zh-Hans', 'zh-Hant', 'ro', 'ca',
+] as const;
```

and in `fillGlossesBatch`'s `system` prompt, replace the hardcoded
`"translation into English (en), French (fr), and Spanish (es)"` wording with a
line built from `GLOSS_LOCALES` (e.g. a `LOCALE_NAMES` map joined into the
sentence), same pattern this lane's `fill-locales.mjs` already uses. `needsPinyin`
and the pinyin field stay orthogonal to this list.
