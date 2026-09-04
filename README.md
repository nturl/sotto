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

Requires Node 26 and pnpm 11 (see `.nvmrc` / `packageManager`). `pnpm dev:server`
and `pnpm dev:web` run each half individually.

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
plain HTTP — by default a local stack (speaches, a local llama-server, Kokoro).
See [docs/local-models.md](docs/local-models.md) for setup, or
[docs/openai.md](docs/openai.md) to point the same cascade at OpenAI instead.

## License

Code is licensed under [Apache-2.0](LICENSE). Content shipped in
`packages/content` (story abridgments, glosses, generated covers and audio) is
licensed separately under [CC BY-SA 4.0](packages/content/LICENSE-CONTENT) —
see `packages/content/README.md` and each pack's `attribution.json`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/adding-a-language.md](docs/adding-a-language.md)
for adding a language pack. This project follows the
[Contributor Covenant](CODE_OF_CONDUCT.md).
