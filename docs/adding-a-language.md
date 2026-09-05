# Adding a language

Three separate things can be added independently: a **content locale** (a
book you can read/listen to), an **interface catalog** (translated UI
chrome), or an **explanation/gloss** language (what translations are shown
in). See [supported-languages.md](supported-languages.md) for what's shipped
today. The authoritative shapes are [planning/CONTRACTS.md](../planning/CONTRACTS.md)
§1 (locales) and §2 (content pack contract).

## Adding a book to an existing content locale

1. Pick a public-domain (or otherwise freely CC-BY-SA-4.0-adaptable) source
   text you have the right to abridge.
2. Write `packages/content/source/<bookId>.bundle.json` following CONTRACTS
   §2a. `<bookId>` is kebab-case, starting with the base language
   (`fr-...`, `es-...`, `ca-...`). Required fields include full provenance
   (`author`, `sourceEdition`, `sourceUrl`, `sourceJurisdiction`,
   `adaptationEditor`, `license`), a level (`A0`/`A1`/`A2`), sentence-level
   `translation` in `en`+`fr`+`es`, and a `glossary` covering **every**
   content word (function words included) — see
   `packages/content/source/ca-patufet.bundle.json` for a complete real
   example (a Catalan folk tale, `ca-ES`, A0, the community-pack example
   referenced in CONTRACTS).
3. Build: `pnpm content:build` (compiles every source bundle) or
   `pnpm --filter @sotto/content build <bookId>` for just one. `--fill`
   asks the local LLM to fill in any glosses you left out (draft quality —
   review before shipping).
4. Validate: `pnpm content:validate`. Checks (CONTRACTS §2b): missing
   license, invalid locale, duplicate ids, token/sentence id mismatch,
   missing gloss for a word token, missing referenced asset file,
   `reviewStatus: stable` without `reviewedBy`, incomplete UI/content
   message catalogs, and (Chinese only) a word token missing pinyin.
   `pnpm content:validate --fixtures` runs the validator's own self-test
   against `packages/content/test/fixtures/invalid/*` (one broken pack per
   rule) plus the real `packages/content/packs/`.
5. Covers: `pnpm content:covers` generates the deterministic flat-geometric
   `cover.svg` (seeded by `bookId`, palette by category).
6. Narrate (only if the locale has a Kokoro voice — see below):
   `pnpm content:narrate <bookId>`, or `pnpm content:narrate` for every
   book. Calls Kokoro, transcribes the result with whisper for word-level
   timestamps, aligns those onto the pack's tokens, writes `audio/<nn>.mp3`
   plus per-token `startMs`/`endMs`. Cached by `sha256(text+voice)` under
   `packages/content/.cache/` — safe to re-run.

## Adding a new content locale

1. Add a `LanguageDefinition` entry to `packages/core/src/languages.ts`:
   `locale`, `baseLanguage`, `script` (`Latn`/`Hans`/`Hant`), `nativeName`,
   `localizedNames` (one per UI catalog), `tokenizer` (`latin` or
   `presegmented` — Chinese only), `typography` (`latin`/`cjk`),
   `pronunciationGuide` (`none` or `pinyin`), `tutorNotes`, `ttsVoice`
   (a Kokoro voice id, or `null` if none exists yet — CONTRACTS §5d lists
   the shipped voices), `ttsLangCode`, `sttLanguage` (ISO 639-1, sent as
   Whisper's `language` field), `catalog` (which of the 9 UI catalogs this
   locale uses).
2. If `ttsVoice` is `null`, that locale ships with no narration/live-voice
   audio — the reader hides the transport controls and the voice tutor is
   unavailable for it (this is the ro-RO/ca-ES situation today; still a
   fully readable, tap-to-translate book).
3. Add at least one book per "Adding a book" above.
4. `pnpm content:validate` should pass with 0 errors.

## Adding a UI interface catalog

UI strings live in `apps/client/src/i18n/<catalog>.json` (CONTRACTS §1's 9
codes: `en`, `es`, `fr`, `pt`, `it`, `zh-Hans`, `zh-Hant`, `ro`, `ca`), one
flat JSON object with dotted keys (`common.*`, `tabs.*`, `onboarding.*`,
`home.*`, `library.*`, `book.*`, `reader.*`, `voice.*`, `vocabulary.*`,
`review.*`, `settings.*`, `errors.*`, `import.*` — CONTRACTS §6) and simple
`{var}` interpolation / one ICU-style plural form
(`"{count, plural, one {# word} other {# words}}"`). Copy `en.json`, keep
every key, translate the values. `apps/client/src/i18n/useT.ts` loads
whatever catalog files exist via Metro's `require.context` (so a
work-in-progress catalog file doesn't need to exist yet for the app to
build) and falls back to `en` for any catalog or key that isn't present.
`pnpm content:validate` reports every catalog's missing keys against
`en.json`; also add the new code to `APP_LANGUAGES` in
`apps/client/src/ui/languages.ts` so it's selectable in Settings/onboarding.

## Adding an explanation (gloss) language

Explanation locales are the ones every book's `translation`/`glossary`
fields are written in — CONTRACTS scopes this to **en, fr, es** for tonight
(14 books × 9 languages of glosses wasn't a one-night job; the schema
supports more). Picking any other interface language as your _explanation_
language falls back to English glosses with a small "shown in English"
caption. To add a fourth explanation locale, every existing book's
`translation`/`glossary` entries need that language added (a source-bundle
edit + rebuild, not a new pack) and `EXPLANATION_LANGUAGES` in
`apps/client/src/ui/languages.ts` needs the new option.

## Proposing a pack

See `.github/ISSUE_TEMPLATE/language_pack.md`. Include the source, its
license/public-domain basis, and which of the three additions above it is.
