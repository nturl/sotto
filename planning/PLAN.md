# Sotto — build plan (Fable touch #1, 2026-09-04)

Read order for a new session: DECISIONS.md, this file, LEDGER.md, then BRIEF.md only for section-level detail when a workstream needs it. research/ is background; do not re-read it wholesale.

## Finish line for tonight (Phase 1)

Done means all of the following are true and evidenced in LEDGER.md:

1. `pnpm dev` starts server + web client; the Mac browser completes onboarding -> home -> book -> reader (tap word, translate, save) -> vocabulary -> review -> settings, with state surviving reload.
2. Narration plays for every seeded book with word-level highlight sync (Kokoro-generated audio + timestamps, cached on disk, bundled for seeds).
3. Live voice tutor works in the browser against the local stack (whisper -> Qwen3 -> Kokoro) in all four modes, with barge-in, captions, mute, push-to-talk, and the seven tools validated.
4. Same journey runs on the iPhone 17 Pro simulator (dev build).
5. Fake transport drives all automated tests; `pnpm check` (format, lint, typecheck, unit, pack-validate) is green; CI workflow committed.
6. Seed content: French and Spanish packs with 3 short readers each (draft-labeled), English with 3, and one short piece for pt-BR, it, zh-CN (+zh-TW edition), ro, ca. Every asset has license metadata.
7. UI locale messages complete for all 9 stable+beta locales.
8. Public GitHub repo with Apache-2.0, README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, .env.example, templates, docs/adding-a-language.md, docs/architecture.md, docs/local-models.md, docs/openai.md.
9. Screenshots at 375/393/430 and 768/1024/1440, plus verification report mapped to the 35 criteria with deferred items named.

Deferred (say so in the report, do not fake): physical iPhone verification (needs Noel's phone + dev team), nine-locale voice smoke tests beyond FR/ES/EN, demo recordings, human content review, OpenAI Realtime WebRTC provider (interface stub only).

## Architecture

Monorepo, pnpm workspaces, TypeScript strict everywhere.

```
sotto/
  apps/client/        Expo SDK (latest stable) + Expo Router + React Native Web, TS
  apps/server/        Node (Fastify) voice orchestrator + content API; talks to local models
  packages/core/      domain models, language defs, tokenizers, review scheduler, tutor prompt builder, tool schemas (zod), export/import
  packages/content/   language packs (JSON + assets), pack validator CLI, narration generator CLI
  packages/voice/     VoiceProvider interface, FakeVoiceProvider (scripted events), LocalCascadeProvider client, OpenAIRealtime stub
  docs/
  .github/workflows/ci.yml
```

### Client
- Expo Router routes exactly as the brief lists. Three tabs on root; stack for detail/reader/voice/review/settings.
- State: Zustand store per domain (preferences, library, progress, vocabulary, session) + a `Persistence` adapter: IndexedDB (idb) on web, expo-sqlite on iOS. One source of truth, selectors for rails/search/filters.
- Platform adapters (typed interfaces in packages/core, impls in apps/client/src/platform/): audio (expo-audio web/native), mic + WebRTC (browser APIs / react-native-webrtc), haptics, keyboard shortcuts (web only), permissions.
- Reader renders tokens from the pack (pre-tokenized, stable IDs). Chinese packs ship pre-segmented tokens plus Pinyin; no runtime segmenter in v1.
- Design tokens in packages/core/theme from the chosen Cleo direction (design/directions.html). Never inline colors in screens.
- Desktop (>= 900px): left sidebar nav + split reader (passage | tutor panel). Below: mobile layout.
- PWA: manifest, icons from ~/Claude/app-icons/build_icons.py, offline shell via workbox-style service worker (seeded packs cached).

### Server (apps/server)
- `POST /voice/session` creates a session (id, book, chapter, mode, learner context) and returns a WebRTC offer/answer exchange endpoint. Transport: WebRTC via `werift` (pure TS) or a Pipecat Python sidecar if werift proves unstable; decide in WS-3 spike within 45 minutes, log the decision.
- Pipeline per session: Silero VAD (onnxruntime-node) -> STT (speaches /v1/audio/transcriptions, whisper large-v3-turbo, language hint = learning locale) -> LLM (llama-server or LiteLLM /v1/chat/completions, Qwen3.6-35B-A3B MoE, tools enabled, /no_think for latency) -> TTS (Kokoro /v1/audio/speech, streaming chunks, voice per locale) -> back over WebRTC. Barge-in: VAD speech-start cancels current TTS and LLM stream.
- Data channel JSON events: `state` (listening|thinking|speaking|paused|muted|reconnecting), `caption` (speaker, text, final), `tool_call`, `tool_result`, `error`. Same event vocabulary as FakeVoiceProvider so the UI is transport-agnostic.
- Tools executed CLIENT-side on the store after zod validation (get_current_passage, set_reading_position, save_vocabulary, remove_vocabulary, show_explanation, set_session_mode, mark_section_complete). Server relays tool calls to the client and waits for the result before continuing the LLM turn. Never report success before the result arrives.
- Provider config: `SOTTO_STT_URL`, `SOTTO_LLM_URL`, `SOTTO_TTS_URL`, `SOTTO_LLM_MODEL`, `SOTTO_API_KEY` (optional; sent as Bearer to all three, so pointing the URLs at api.openai.com with a key runs the same cascade on OpenAI). Defaults point at ~/ods ports (9000 / LiteLLM / 8880). The key lives only in server env.
- Session limits: 20 min max, 90 s idle timeout, friendly limit event.
- Narration generator: `pnpm content:narrate <pack>` calls Kokoro with word timestamps (kokoro-fastapi `/dev/captioned_speech`; if timestamps unavailable, fall back to whisper forced alignment of the generated audio) and writes mp3 + timing JSON next to the chapter.

### Content pack contract (packages/content)
`packs/<locale>/pack.json` (language def + messages + tutor notes), `books/<bookId>/book.json` (metadata, licenses, provenance, review status), `chapters/<n>.json` (blocks -> sentences -> tokens with ids, translations by locale, pinyin optional, timings optional), `assets/` (cover.svg, audio). `pnpm content:validate` enforces the brief's rule list. `docs/adding-a-language.md` documents it. Example community pack: `packs/ca-ES-example`.

Covers: original flat geometric SVG per book, palette per category, generated by a small script with deterministic seeds so they are consistent and not "placeholder-looking".

### Fake voice provider
Deterministic scripted event streams per mode (JSON scripts in packages/voice/fixtures), driven by a clock so tests can step. Used in CI, Storybook-less preview, and the web app when `EXPO_PUBLIC_VOICE=fake`.

## Workstreams and routing

Fable: plan, review gates, integration fixes only. Everything else delegated. Use /fanout for volume where the worker does not need repo-wide context; Sonnet subagents where it does. No worker edits files outside its ownership list. Every dispatch gets a seven-field task card (Task / Inputs / Output / Proof / Permissions / Stop when / Escalate when) copied into LEDGER.md.

| WS | Owner route | Scope (owns these paths) | Depends on |
|---|---|---|---|
| WS-0 Scaffold | Sonnet subagent | repo init, workspaces, Expo app, server skeleton, CI, OSS docs baseline, `pnpm dev`/`check`/`ios` scripts, public GitHub repo | none |
| WS-1 Core + packs schema | Sonnet subagent | packages/core (models, language defs, zod tool schemas, review scheduler, export/import, prompt builder), packages/content validator | WS-0 |
| WS-2 Design system + shell | Kimi K3 via /fanout (UI) reviewed by Sonnet | theme tokens from chosen direction, primitives (Button, Card, BookTile, Rail, MetaStrip, Chip, Sheet, TabBar, Sidebar), tabs + routes, onboarding, home, library, search, book detail, profile/settings | WS-0, direction chosen |
| WS-3 Voice server | Sonnet subagent (Opus if the WebRTC spike fails twice) | apps/server pipeline, VAD, barge-in, tools relay, limits, LocalCascadeProvider client, OpenAI stub | WS-1 |
| WS-4 Reader + vocabulary + review | Kimi K3 via /fanout (UI) + Sonnet for store/persistence | reader tokens, translation panel, narration controls + word sync, completion view, session bar, vocabulary, review (spoken + flashcards), persistence adapters | WS-1, WS-2 primitives |
| WS-5 Content | Codex or Gemini via /fanout for drafting, Sonnet for packaging | FR/ES/EN packs (3 readers each), 1 piece each for pt-BR/it/zh-CN+zh-TW/ro/ca, covers, narration generation, translations, messages for 9 locales | WS-1 schema |
| WS-6 Verification | Sonnet subagent (atlas agent type) | tests on fake transport, e2e web journey, simulator run, screenshots at all widths, criteria report | all |

## Sequence (tonight)

1. Pre-flight (Fable, 10 min): start ODS with `~/ods/installers/macos/ods-macos.sh start` (Docker Desktop must be up first), confirm :9000 whisper, :8880 kokoro, llama-server/LiteLLM respond. LLM: use the already-downloaded MoE `Qwen3.6-35B-A3B-UD-Q4_K_M.gguf` in ~/ods/data/models (fast per-token, strong multilingual + tools); `qwen3-30b-a3b-q4` from the ODS model library is the fallback. Do not pull a new model unless both fail. Confirm the chosen design direction. Create LEDGER rows.
2. WS-0 then WS-1 (sequential, ~1 h). Gate: `pnpm check` green on empty app, `pnpm dev` opens web, `pnpm ios` boots simulator.
3. Parallel: WS-2, WS-3, WS-5 (~2 h). Gate per WS: worker evidence + Fable diff review + the flow launched in the browser.
4. WS-4 (~1.5 h) once WS-2 primitives exist. Gate: vertical slice in browser AND simulator: onboarding -> Spanish reader -> tap word -> save -> vocabulary -> reload persists.
5. Integrate voice (~1 h): real session in browser, four modes, barge-in, tools. Gate: transcript of a session showing explain-word, translate-sentence, slower, repeat, save-word, advance-passage.
6. WS-6 verification + docs + screenshots + report (~1 h). Commit and push at every gate (autoship rule; stage only this session's files).
7. Fable touch #2: adversarial review ("what is fake, fragile, or unverified"), fix, final report, update memory + LEDGER, handoff note.

Rate-limit stalls: if the all-models window trips, shift the waiting work to /fanout workers rather than idling.

## Stop and escalate rules (all workers)

- Stop when the task card's proof is produced, not when the code compiles.
- Escalate (back to Fable) when: a dependency is missing from the pinned set, a spec ambiguity changes data models, a native build fails twice, the local model endpoints are unreachable, or work would require touching another WS's paths.
- Never: commit secrets, copy the reference app strings/assets, label unreviewed content stable, add auth/payments/analytics, install a dependency without stating why in the ledger.
