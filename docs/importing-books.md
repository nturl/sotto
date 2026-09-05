# Importing your own book

Sotto can turn a book you already own into a private, fully-interactive
reader: tap-to-translate glosses, sentence translations, and narration,
all generated the same way the seeded library is built.

## Formats

| Format              | Supported                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EPUB (DRM-free)     | Yes                                                                                                                                                        |
| Plain text (`.txt`) | Yes                                                                                                                                                        |
| Markdown (`.md`)    | Yes                                                                                                                                                        |
| PDF                 | Not yet — layout extraction (columns, footnotes, page furniture) is its own project. The import screen shows PDF as visibly disabled, not a broken button. |

## The DRM rule

Most books bought from a major storefront (Kindle, Apple Books, Kobo, a
DRM'd Adobe EPUB) are encrypted and cannot be parsed — Sotto detects this
and refuses cleanly rather than producing garbage from encrypted bytes.
Detection covers:

- Adobe ADEPT / any generic container-level encryption: `META-INF/
encryption.xml` declaring an `<EncryptedData>` element.
- Apple FairPlay: a `META-INF/rights.xml` or `META-INF/*sinf*` file.
- Readium LCP: `META-INF/license.lcpl`.

If your file is refused, remove the lock with your bookseller's own tool
first (most support this for personal backup), or pick a DRM-free EPUB,
TXT, or Markdown file instead.

## How it works

1. **Parse.** The file's chapters and paragraphs are extracted — by `#`/
   `##` headings for Markdown and EPUB books whose spine is a single
   document, by each spine document for a multi-file EPUB, or by
   ~1,500-word blocks for a heading-free `.txt`.
2. **Detect language.** A small stopword-frequency scorer over the parsed
   text suggests a content locale; you can correct it before anything
   else runs.
3. **Gloss + translate.** Every word gets a gloss in each of the nine
   catalog locales (en, fr, es, pt, it, zh-Hans, zh-Hant, ro, ca); every
   sentence gets a translation in the same nine locales — the identical
   `fillGlossesBatch`/`translateSentencesBatch` calls the seeded content
   pipeline uses, against your local model stack.
4. **Narrate.** Chapter 1 is narrated first (Kokoro TTS + whisper STT +
   word-level alignment, same as `content:narrate`), so the book is
   readable in minutes. Later chapters narrate lazily — the first time
   you open them, or in the background if you leave the import running.

The free tier runs all of this against your own local model stack
(`apps/server` + Kokoro/whisper.cpp/llama.cpp). Measured on the machine
this lane was built on (Apple Silicon Mac, CPU-hosted `qwen3.6-35b-a3b`
via llama.cpp): a single 40-word gloss-fill batch took **~234 seconds**,
and one sentence-translation pass over 8 target locales for a one-
paragraph, 43-word file took **~97 seconds** — see
`docs/evidence/import-e2e-2026-09-05.log` for the full run. Glossing and
translating a real chapter-length import on this hardware is
correspondingly slow; the import screen's time estimate is honest about
being specific to your machine ("Estimation pour ce Mac"), not a fixed
number.

## Where private books live

An imported book is marked `private: true` and never written under
`packages/content/packs` — it lives only in your device's local storage
(IndexedDB on web via `idb-keyval`, `expo-sqlite`'s kv-store + a
document-directory file for audio on native). It is:

- **Never shared.** No other reader, on this device or any other, ever
  sees it.
- **Never deduplicated or reused.** Even if two readers import the exact
  same public-domain text, each gets their own independently-generated
  glosses, translations, and narration — no cross-user sharing of
  derived content.
- **Deleted with your account** on the hosted tier, or immediately when
  you delete it yourself (Profile → "Vos livres importés" → the delete
  icon next to a book) on the free tier.

The word translations, sentence translations, and narration are AI-
generated specifically for you, from a file you already have — this is
private, personal use, not redistribution.

## CLI usage

```
pnpm content:import <file> --locale fr-FR --out <dir> [--narrate none|first|all]
```

- `<file>` — path to a DRM-free `.epub`, `.txt`, or `.md` file.
- `--locale` — content locale to import into (e.g. `fr-FR`, `es-419`).
  If omitted, the CLI runs language detection and uses its top guess.
- `--out` — directory to write the resulting pack into. **Never**
  `packages/content/packs` — the CLI does not enforce this, but a book
  imported this way is not reviewed or licensed the way seeded content
  is, so it does not belong in the shared pack tree.
- `--narrate` — `none` (text + glosses + translations only), `first`
  (default: narrate chapter 1), or `all` (narrate every chapter now,
  slower).

The command writes a pack-shaped directory (`book.json`, `chapters/*.json`,
`audio/*.{mp3,wav}`, `cover.svg`, `attribution.json`) and prints a summary
including per-stage timing, so you can see exactly how long glossing,
translating, and narrating took on your machine.

Reads its LLM/TTS/STT endpoints from the same `SOTTO_LLM_URL`/
`SOTTO_TTS_URL`/`SOTTO_STT_URL` environment variables `content:narrate`
and `content:build` use (defaults: `http://127.0.0.1:8080/v1`,
`http://127.0.0.1:8880/v1`, `http://127.0.0.1:9001/v1`).
