# Architecture

This is a draft overview assembled from [planning/CONTRACTS.md](../planning/CONTRACTS.md)
(also copied verbatim to [docs/contracts.md](contracts.md)) while the workspace comes
online. Treat CONTRACTS.md as the source of truth for exact shapes; this file
explains how the pieces fit together.

## Monorepo

pnpm workspaces, TypeScript strict, ESM, Node 26.

```
apps/client/        Expo (SDK 57) app: Expo Router, React Native Web, iOS + web
apps/server/         Fastify server: content API + voice orchestrator
packages/core/       domain models, language defs, review scheduler, tool schemas, theme tokens
packages/content/    language packs (source + built) and the sotto-content CLI
packages/voice/      VoiceProvider interface, FakeVoiceProvider, LocalCascadeProvider, transports
```

## Navigation

Expo Router, file-based, under `apps/client/app`. Three tabs at the root
(`(tabs)/home`, `(tabs)/library`, `(tabs)/vocabulary`), everything else
(onboarding, book detail, reader, voice, review, profile, settings) is a
stack screen with the tab bar hidden. See CONTRACTS §6 for the exact route
list and screen-content rules (theme tokens + `useT()` only, no inline
colors).

## State

Zustand slices per domain (`preferences`, `library`, `progress`, `vocabulary`,
`session`, `ui`), persisted through one `Persistence` adapter: `idb-keyval`
(IndexedDB) on web, `expo-sqlite` as a key-value store on native. See
CONTRACTS §4.

## Persistence

Everything lives on-device. No accounts. Export/import is a single JSON
document (`{ format: 'sotto-export', version: 1, ... }`, CONTRACTS §3)
covering preferences, reading progress, saved words, and completed books.

## Voice transport

`apps/server` exposes `POST /voice/session` (creates a session, returns a
WebSocket URL) and `ws://host:8790/voice/ws?session=<id>`. Client audio is
PCM16 mono 16kHz frames sent as binary WebSocket messages; the server relays
JSON control/event messages that mirror the `VoiceEvent` union so the UI is
transport-agnostic (the `FakeVoiceProvider` emits the identical event shape
from scripted fixtures). WebRTC is explicitly out of scope for v1 — see
CONTRACTS §5b and the Decision log in planning/DECISIONS.md for why (no
suitable pure-TS Opus implementation without adding a Python sidecar).

## Tool execution

The voice tutor's tools (`get_current_passage`, `set_reading_position`,
`save_vocabulary`, `remove_vocabulary`, `show_explanation`,
`set_session_mode`, `mark_section_complete`) are defined with zod in
`packages/core/src/tools.ts` and executed **client-side** against the
Zustand store after validation. The server only relays `tool_call` /
`tool_result` messages between the LLM and the client — it never fabricates
a successful result. See CONTRACTS §5c.

## Narration pipeline

`pnpm content:narrate` calls the local TTS endpoint (Kokoro) per chapter,
transcribes the generated audio with word-level timestamps, aligns those
words back onto the pack's pre-tokenized text, and writes an mp3 plus
per-token `startMs`/`endMs` timing into the chapter JSON. See CONTRACTS §2c
for the full pipeline and its caching/fallback rules.

## Content packs

`packages/content/source/*.bundle.json` is what content authors write.
`pnpm content:build` compiles that into `packages/content/packs/<locale>/`
(pack.json, per-book metadata, per-chapter token JSON, generated cover SVGs,
narration audio + timings, attribution). `pnpm content:validate` enforces the
pack contract (CONTRACTS §2b). `apps/server` serves built packs at
`GET /content/packs` (summaries) and `GET /content/packs/:locale/*` (static
files).
