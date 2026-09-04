# Adding a language

**Stub — WS-5 finishes this doc alongside the seed content packs.** For now,
the authoritative shape is [planning/CONTRACTS.md](../planning/CONTRACTS.md)
§1 (locales) and §2 (content pack contract), also mirrored at
[docs/contracts.md](contracts.md).

## Quick outline

1. **Locale**: pick a BCP 47 content locale. If it's a new UI catalog
   language, add it to `packages/content/messages/<catalog>.json` (base keys
   come from `en.json`).
2. **LanguageDefinition**: add an entry in `packages/core/src/languages.ts`
   (locale, script, tokenizer, typography, TTS voice, STT language, etc. —
   see CONTRACTS §1).
3. **Source bundle**: write `packages/content/source/<bookId>.bundle.json`
   following the schema in CONTRACTS §2a — sourced from a public-domain (or
   otherwise CC BY-SA 4.0-compatible) text you have the right to adapt.
   Every content word needs a glossary entry; every sentence needs en/fr/es
   translations.
4. **Build**: `pnpm content:build` compiles the bundle into
   `packages/content/packs/<locale>/`.
5. **Validate**: `pnpm content:validate` checks licenses, ids, glosses,
   assets, and catalog completeness (CONTRACTS §2b).
6. **Narrate** (if a Kokoro voice exists for the locale):
   `pnpm content:narrate <bookId>`.
7. **Covers**: `pnpm content:covers` generates the deterministic flat
   geometric cover SVG.

See `.github/ISSUE_TEMPLATE/language_pack.md` to propose a new pack.
