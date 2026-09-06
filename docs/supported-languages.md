# Supported languages

Three independent axes (CONTRACTS §1): **interface** (UI chrome — 9 catalogs),
**explanation/gloss** (the language a translation or grammar note is shown
in — 3 shipped), and **learning/content** (the language you're reading and
speaking — 12 locales, content seeded for 9 tonight). A locale maps to an
interface catalog by base language (+ script for Chinese); region
differences (`en-US` vs `en-GB`, `es-419` vs `es-ES`, `pt-BR` vs `pt-PT`)
share one catalog and are not separately localized in v1.

Generated from `packages/core/src/languages.ts` (the `LanguageDefinition`
table) and `packages/content/packs/` on 2026-09-04, seeded-book counts
refreshed 2026-09-05 after the library-expansion run (18→39 books, see
content-qa.md); regenerate by hand if either changes.

## Interface catalogs (`apps/client/src/i18n/*.json`)

All 9 are complete (`pnpm content:validate` checks every catalog's keys
against `en.json` — 0 errors as of this report).

| Catalog   | Language             |
| --------- | -------------------- |
| `en`      | English              |
| `es`      | Spanish              |
| `fr`      | French               |
| `pt`      | Portuguese           |
| `it`      | Italian              |
| `zh-Hans` | Chinese, Simplified  |
| `zh-Hant` | Chinese, Traditional |
| `ro`      | Romanian             |
| `ca`      | Catalan              |

## Explanation (gloss) locales

Shipped in every content pack's per-token glosses and sentence translations
(CONTRACTS §2a): **en, fr, es**. Any other interface language chosen as the
_explanation_ locale falls back to English glosses, with a small "shown in
English" caption in the reader/voice UI (documented scope decision, not a
bug — see [verification.md](verification.md) criterion 21).

## Learning/content locales

| Locale   | Interface catalog | Script          | Stability | Kokoro TTS voice | Whisper STT lang | Seeded books                        | Narration audio                                |
| -------- | ----------------- | --------------- | --------- | ---------------- | ---------------- | ----------------------------------- | ---------------------------------------------- |
| `en-US`  | en                | Latin           | stable    | `af_heart`       | en               | 6                                   | yes (all 6)                                    |
| `en-GB`  | en                | Latin           | stable    | `bf_emma`        | en               | 0 (shares en-US content*)           | —                                              |
| `es-419` | es                | Latin           | stable    | `ef_dora`        | es               | 13                                  | yes (all 13)                                   |
| `es-ES`  | es                | Latin           | stable    | `ef_dora`        | es               | 0 (shares es-419 content*)          | —                                              |
| `fr-FR`  | fr                | Latin           | stable    | `ff_siwis`       | fr               | 13                                  | yes (all 13)                                   |
| `pt-BR`  | pt                | Latin           | stable    | `pf_dora`        | pt               | 2                                   | yes (all 2)                                    |
| `pt-PT`  | pt                | Latin           | stable    | `pf_dora`        | pt               | 0 (shares pt-BR content*)           | —                                              |
| `it-IT`  | it                | Latin           | stable    | `if_sara`        | it               | 2                                   | yes (all 2)                                    |
| `zh-CN`  | zh-Hans           | Simplified Han  | stable    | `zf_xiaoxiao`    | zh               | 1                                   | yes                                            |
| `zh-TW`  | zh-Hant           | Traditional Han | stable    | `zf_xiaoxiao`    | zh               | 1 (zh-TW edition of the zh-CN book) | yes                                            |
| `ro-RO`  | ro                | Latin           | **beta**  | none             | ro               | 1                                   | **no Kokoro voice — silent, transport hidden** |
| `ca-ES`  | ca                | Latin           | **beta**  | none             | ca               | 1                                   | **no Kokoro voice — silent, transport hidden** |

39 distinct stories seeded across all locales (40 physical book packages,
counting the `zh-TW` script edition separately from its `zh-CN` source) —
see content-qa.md's library-expansion section for the 21 added this run. A
22nd candidate (`zh-luxun-kong-yiji`) was drafted but parked before
shipping; not counted above.

\* Regional pairs (`en-GB`, `es-ES`, `pt-PT`) are fully defined
`LanguageDefinition`s (own TTS voice, STT language hint) but have no
region-specific seed content tonight — content built for the sibling region
locale (`en-US`, `es-419`, `pt-BR`) is the reference; a contributor can seed
region-specific books following [adding-a-language.md](adding-a-language.md)
without any code changes.

Pronunciation guide: Pinyin with tone marks, shown for `zh-CN`/`zh-TW` only
(`pronunciationGuide: 'pinyin'` in the language definition; every other
locale is `'none'`). Chinese packs are pre-segmented at authoring time (a
single ASCII space between words in the source bundle) rather than
tokenized at runtime — see CONTRACTS §2a.

## Voice-quality smoke test coverage

Verified against the live local stack tonight (see
[verification.md](verification.md) criterion 22): **es-419** (multiple runs,
[voice-live.mjs](../apps/client/e2e/voice-live.mjs)), **fr-FR** (`apps/server`
smoke script, `pnpm --filter @sotto/server smoke`), **en** (interface only,
via screenshots). The other 6 stable/beta locales are pipeline-complete
(pack + Kokoro voice + STT language hint, where applicable) but **not**
individually smoke-tested tonight — deferred, see verification.md.
