# Sotto

Sotto (as in _sotto voce_) is an open-source, voice-first graded-reader
language-learning app: narrated, tap-to-translate stories with a spaced-
repetition review deck, plus a voice tutor you can talk to about the
passage you're reading. Code is [Apache-2.0](LICENSE); the story content
is [CC BY-SA 4.0](packages/content/LICENSE-CONTENT).

## Read a book in 30 seconds

1. Open **[readsotto.app](https://readsotto.app)**.
2. Pick a language and a level.
3. Open a book.
4. Tap any word for a translation, or press play to hear it narrated.

Nothing is recorded — no account, no analytics. Everything runs in your
browser and a book you've opened keeps working offline.

## Three ways to run it

| Way                     | What it costs                | How                                                                                                                                                        |
| ----------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosted PWA**          | Free, no account             | Open [readsotto.app](https://readsotto.app) — nothing leaves your device.                                                                                  |
| **Your own OpenAI key** | You pay OpenAI directly      | Profile → Tutor preferences → **Use your own OpenAI key**, or straight from the voice screen when no tutor is available. See [docs/byok.md](docs/byok.md). |
| **Your own server**     | Free (your hardware/hosting) | `docker compose up`. See [docs/self-hosting.md](docs/self-hosting.md).                                                                                     |

## Add a book

- Contribute a book to the shared library: [docs/adding-a-book.md](docs/adding-a-book.md).
- Import a book you own, privately, on your own server: [docs/importing-books.md](docs/importing-books.md).

---

![Sotto demo: fast-path start, narrated reader, tap-to-translate, save](docs/media/demo.gif)

The voice tutor can read to you, explain grammar, quiz your pronunciation,
or just discuss the story. On the hosted PWA it runs via your own OpenAI
key (above); self-hosted, it runs on local models by default, no API key
required. Two honest caveats: the books are machine-adapted drafts and
their levels are estimates ([docs/content-qa.md](docs/content-qa.md)), and
the in-browser (WebGPU) voice tutor is still being finished
([docs/browser-tutor.md](docs/browser-tutor.md)). What is verified and
what is not is tracked in [docs/verification.md](docs/verification.md).

## Quickstart (running it yourself)

Requires Node 26 and pnpm 11 (see `.nvmrc` / `packageManager`).

```sh
pnpm install
pnpm dev       # starts apps/server (voice + content API) and the Expo web client together
```

`pnpm dev` prints two URLs once ready: the web client on
`http://localhost:8081` and the API server on `http://localhost:8790`.
Open the web client URL in your browser — that's the book.

`pnpm dev` needs no model servers to **read** a book — narration,
tap-to-translate, and saving words all work with every voice model
unreachable. The voice tutor needs one of: your own OpenAI key
([docs/openai.md](docs/openai.md)), or local models
([docs/local-models.md](docs/local-models.md)) — see
[docs/self-hosting.md](docs/self-hosting.md) for the full breakdown of
what each tier gets you.

```sh
pnpm ios       # runs the iOS app in the Simulator (expo run:ios)
pnpm check     # format:check + lint + typecheck + test + content:validate
pnpm content:new         # scaffold a new book bundle (see docs/adding-a-book.md)
pnpm content:import      # import a DRM-free EPUB/TXT/Markdown file from the CLI
pnpm content:word-audio  # render per-word pronunciation sprites for a narrated book
```

Optional e2e scripts (need the local model stack up — see
[docs/local-models.md](docs/local-models.md); not run in CI, only
deterministic unit/fake-transport tests are):

```sh
pnpm e2e:screenshots   # Playwright: disk screenshots at 6 widths, docs/screenshots/web/
pnpm e2e:voice         # Playwright + a fake Chromium mic fed real Kokoro audio: live voice round-trip
```

`pnpm dev:server` and `pnpm dev:web` run each half individually.

## Monorepo layout

```
apps/client/      Expo (SDK 57) app: Expo Router, React Native Web, iOS + web
apps/server/       Fastify server: content API + voice orchestrator
packages/core/     domain models, language defs, review scheduler, theme tokens, tool schemas
packages/content/  language packs (source bundles, built packs) + the sotto-content CLI
packages/voice/    VoiceProvider interface, fixtures, transports
docs/              architecture, local-models setup, OpenAI setup, contracts
```

## Language matrix

Interface (UI chrome), explanation (translation language), content
(readable books), STT, and TTS voice per locale — full detail, stability,
and narration coverage in [docs/supported-languages.md](docs/supported-languages.md).

| Locale       | Interface | Explanation | Content books         | STT | TTS voice                 | Status   |
| ------------ | --------- | ----------- | --------------------- | --- | ------------------------- | -------- |
| en-US        | en        | en/fr/es    | 3                     | en  | af_heart                  | stable   |
| en-GB        | en        | en/fr/es    | 0*                    | en  | bf_emma                   | stable   |
| es-419       | es        | en/fr/es    | 3                     | es  | ef_dora                   | stable   |
| es-ES        | es        | en/fr/es    | 0*                    | es  | ef_dora                   | stable   |
| fr-FR        | fr        | en/fr/es    | 3                     | fr  | ff_siwis                  | stable   |
| pt-BR        | pt        | en/fr/es    | 1                     | pt  | pf_dora                   | stable   |
| pt-PT        | pt        | en/fr/es    | 0*                    | pt  | pf_dora                   | stable   |
| it-IT        | it        | en/fr/es    | 1                     | it  | if_sara                   | stable   |
| zh-CN (Hans) | zh-Hans   | en/fr/es    | 1                     | zh  | zf_xiaoxiao               | stable   |
| zh-TW (Hant) | zh-Hant   | en/fr/es    | 1                     | zh  | zf_xiaoxiao               | stable   |
| ro-RO        | ro        | en/fr/es    | 1                     | ro  | none (no narration/voice) | **beta** |
| ca-ES        | ca        | en/fr/es    | 1 (community example) | ca  | none (no narration/voice) | **beta** |

\* No region-specific seed content yet — the sibling region locale's books
are the reference; see [docs/adding-a-language.md](docs/adding-a-language.md).

## Status

This is a first build (one overnight session plus several fix passes), not
a finished product. All app copy in this README/docs is hand-written, but
**every seeded book is AI-drafted** — a first-draft abridgment produced
with AI assistance from a public-domain source (`reviewStatus: "draft"` in
every `book.json`) — and **none has a recorded human language review
yet**. Treat the readers as a functional demo of the pipeline, not vetted
learning material, until a `reviewedBy` review lands.

What's actually been verified, what's PASS/PARTIAL/DEFERRED/FAIL, and what
was found and fixed vs. found-and-not-fixed is tracked honestly in
[docs/verification.md](docs/verification.md) — read that before trusting
any specific feature claim in this file. See also
[docs/attribution.md](docs/attribution.md) for per-book content provenance.

## License

Code is licensed under [Apache-2.0](LICENSE). Content shipped in
`packages/content` (story abridgments, glosses, generated covers and audio) is
licensed separately under [CC BY-SA 4.0](packages/content/LICENSE-CONTENT) —
see `packages/content/README.md` and each pack's `attribution.json`, or the
attribution overview at [docs/attribution.md](docs/attribution.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/adding-a-language.md](docs/adding-a-language.md)
for adding a language pack. This project follows the
[Contributor Covenant](CODE_OF_CONDUCT.md).
