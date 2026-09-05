# Sotto

Sotto (as in _sotto voce_) is an open-source, free, voice-first graded-reader
language-learning app. The front door is **reading**: narrated, tap-to-translate
graded readers with a vocabulary review loop, plus an optional local voice tutor
you can talk to about the passage you're reading.

- Read short, leveled stories (A0-A2) with word-synced narration.
- Tap any word for a translation; save words to a spaced-repetition review deck.
- Optionally start a voice session and talk through a passage with a tutor that
  can read to you, explain grammar, quiz your pronunciation, or just discuss
  the story — running entirely on local models by default, no API key required.
- No accounts, no payments, no analytics. Your data stays on your device
  (export/import as a single JSON file).

## Quickstart

```sh
pnpm install
pnpm dev       # starts apps/server (voice + content API) and the Expo web client together
pnpm ios       # runs the iOS app in the Simulator (expo run:ios)
pnpm check     # format:check + lint + typecheck + test + content:validate
```

Optional e2e scripts (need the local model stack up — see below; not run in
CI, only deterministic unit/fake-transport tests are):

```sh
pnpm e2e:screenshots   # Playwright: disk screenshots at 6 widths, docs/screenshots/web/
pnpm e2e:voice         # Playwright + a fake Chromium mic fed real Kokoro audio: live voice round-trip
```

Requires Node 26 and pnpm 11 (see `.nvmrc` / `packageManager`). `pnpm dev:server`
and `pnpm dev:web` run each half individually.

## Three ways to run it

| Tier                      | What works                                                                                                                                                                                                  | What you need                                                                                               | Status                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. No models              | Reading end to end: onboarding, home, book detail, reader with narration and word-sync speech fill, tap-to-translate, save word, vocabulary. Voice tutor is unavailable but offers a "Read alone" fallback. | `pnpm install && pnpm dev`                                                                                  | Verified 2026-09-04                                                                                                             |
| 2. OpenAI                 | Full voice tutor (STT, LLM, TTS) via OpenAI's API instead of local models                                                                                                                                   | `SOTTO_API_KEY` plus the OpenAI URLs/models below, in `apps/server/.env` or the shell                       | Code path exists and is unit-tested at the transport level, but not verified live against OpenAI in this pass (no key was used) |
| 3. Local models (default) | Full voice tutor, fully offline                                                                                                                                                                             | whisper.cpp, llama-server, Kokoro-FastAPI running locally, see [docs/local-models.md](docs/local-models.md) | Verified live 2026-09-04                                                                                                        |

**Tier 1, no models.** Run `pnpm install && pnpm dev` and stop there. The
server starts with every model URL unreachable, and `GET /health` reports
`{"ok":true,"stt":false,"llm":false,"tts":false,"vad":"energy"}`. Reading
works fully: the pre-recorded per-chapter narration in each pack streams
from the server's static route, word-sync speech fill and tap-to-translate
work, and the translation panel's speaker button replays the tapped word's
slice of that same chapter narration, so it needs no TTS. The onboarding
"play a voice sample" button shows "Sample unavailable" (it needs TTS), and
the voice tutor screen shows an unavailability notice naming which of
stt/llm/tts is down, with a "Read alone" option.

**Tier 2, OpenAI instead of local models.** Set `SOTTO_STT_URL` /
`SOTTO_LLM_URL` / `SOTTO_TTS_URL` to `https://api.openai.com/v1` with
`SOTTO_STT_MODEL=whisper-1`, `SOTTO_LLM_MODEL=gpt-4o-mini`,
`SOTTO_TTS_MODEL=tts-1`, and `SOTTO_API_KEY`, in `apps/server/.env` (read at
startup, see "Server env vars" below) or the shell. `/health` sends the
bearer token when probing. See [docs/openai.md](docs/openai.md).

**Tier 3, local models.** whisper.cpp on 9001, llama-server on 8080, and
Kokoro-FastAPI on 8880 give you the full voice tutor offline; see
[docs/local-models.md](docs/local-models.md). This is the default the
server's env vars point at.

The client still needs the server for content today (packs are served from
`packages/content/packs` by `apps/server`); a static build that bundles
packs so the web app runs with no server at all is a planned follow-up, not
available yet.

## Monorepo layout

```
apps/client/      Expo (SDK 57) app: Expo Router, React Native Web, iOS + web
apps/server/       Fastify server: content API + voice orchestrator
packages/core/     domain models, language defs, review scheduler, theme tokens, tool schemas
packages/content/  language packs (source bundles, built packs) + the sotto-content CLI
packages/voice/    VoiceProvider interface, fixtures, transports
docs/              architecture, local-models setup, OpenAI setup, contracts
```

## Local voice models

The voice tutor talks to an OpenAI-compatible STT / chat / TTS cascade over
plain HTTP — by default a fully local stack, no API key required:

| Role           | Default local server                                                                                   | Env var                                              |
| -------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Speech-to-text | whisper.cpp `whisper-server` (reference) or [speaches](https://github.com/speaches-ai/speaches)        | `SOTTO_STT_URL` (default `http://127.0.0.1:9001/v1`) |
| Chat / LLM     | [llama-server](https://github.com/ggml-org/llama.cpp) or [LiteLLM](https://github.com/BerriAI/litellm) | `SOTTO_LLM_URL` (default `http://127.0.0.1:8080/v1`) |
| Text-to-speech | [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)                                             | `SOTTO_TTS_URL` (default `http://127.0.0.1:8880/v1`) |

There's no `pnpm dev:stt` script — start whisper.cpp directly:

```sh
whisper-server -m "$SOTTO_WHISPER_MODEL" --host 127.0.0.1 --port 9001 \
  --inference-path /v1/audio/transcriptions --convert
```

### Server env vars

The server reads `apps/server/.env` at startup, if present; shell variables
already set in your environment override values from that file. The server
has no accounts/auth — anything that can reach it can drive your local
models, so these matter even on a laptop:

| Var                  | Default                             | Meaning                                                                                                                                                                              |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SOTTO_HOST`         | `127.0.0.1`                         | Bind address. Set to `0.0.0.0` only to test from a phone on the same trusted LAN.                                                                                                    |
| `SOTTO_CORS_ORIGINS` | Expo web dev ports (`8081`, `8082`) | Comma-separated allowlist of browser `Origin` headers. Any `localhost`/`127.0.0.1` origin is always allowed regardless of this value; native clients send no Origin and always pass. |
| `SOTTO_MAX_SESSIONS` | `4`                                 | Caps concurrent voice sessions (pending + connected) across all clients.                                                                                                             |

See `.env.example` for the full list, including the STT/LLM/TTS URLs above.

See [docs/local-models.md](docs/local-models.md) for the full setup (all
three services, VAD notes, LLM call shape), or
[docs/openai.md](docs/openai.md) to point the same cascade at OpenAI's
`/v1` endpoints instead (set `SOTTO_API_KEY`; still not the Realtime API —
see that doc).

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

This is a first build (one overnight session plus one adversarial-review
fix pass), not a finished product. All app copy in this README/docs is
hand-written, but **every seeded book is AI-drafted** — a first-draft
abridgment produced with AI assistance from a public-domain source
(`reviewStatus: "draft"` in every `book.json`) — and **none has a recorded
human language review yet**. Treat the readers as a functional demo of the
pipeline, not vetted learning material, until a `reviewedBy` review lands.

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
