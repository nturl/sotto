# Sotto interface contracts (v1, fixed 2026-09-04 by the orchestrator)

Every worker codes against this file. If a task needs to change something here, STOP and escalate; do not improvise a different shape. Paths are relative to the repo root `~/Claude/sotto`.

## 0. Workspace

- pnpm workspaces, TypeScript strict, ESM. Node 26, pnpm 11. Expo SDK 57 (latest stable), Expo Router, React Native Web.
- Packages (names are exact):
  - `@sotto/core` -> `packages/core` (domain models, language defs, tokenizers, review scheduler, tutor prompt builder, tool schemas, export/import, theme tokens)
  - `@sotto/content` -> `packages/content` (source bundles, built packs, `sotto-content` CLI: build, validate, narrate, covers)
  - `@sotto/voice` -> `packages/voice` (VoiceProvider interface, event types, FakeVoiceProvider + fixtures, LocalCascadeClient (WS transport), OpenAIRealtime stub)
  - `@sotto/client` -> `apps/client` (Expo app, web + iOS)
  - `@sotto/server` -> `apps/server` (Fastify: content API + voice orchestrator)
- Root scripts (exact names): `pnpm dev` (server + web client together), `pnpm dev:server`, `pnpm dev:web`, `pnpm ios` (expo run:ios on "iPhone 17 Pro"), `pnpm check` (format:check + lint + typecheck + test + content:validate), `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm content:build`, `pnpm content:validate`, `pnpm content:narrate`, `pnpm content:covers`.
- Tooling: vitest for unit tests, eslint (flat config) + prettier, tsc project references or per-package `tsc --noEmit`. No jest.
- Licenses: `LICENSE` = Apache-2.0 (code). `packages/content/LICENSE-CONTENT` = CC BY-SA 4.0 (abridgments, glosses, covers). Each asset also carries its own license field.
- Never add: auth, payments, analytics, telemetry SDKs, Expo Go-only assumptions for voice.

## 1. Locales

Learning/content locales (BCP 47): `en-US`, `en-GB`, `es-419`, `es-ES`, `fr-FR`, `pt-BR`, `pt-PT`, `it-IT`, `zh-CN` (Hans), `zh-TW` (Hant), `ro-RO` (beta), `ca-ES` (beta).
UI message catalogs (9): `en`, `es`, `fr`, `pt`, `it`, `zh-Hans`, `zh-Hant`, `ro`, `ca`. A locale maps to a catalog by base language (+ script for zh). Region differences inside a catalog are not modeled in v1.
Explanation (gloss) locales shipped in packs tonight: `en`, `fr`, `es`. Any other explanation locale falls back to `en` and the UI shows a small "translation shown in English" caption. (Decision: scope; documented in docs/verification.md.)
Seed packs tonight: `fr-FR` (3 books), `es-419` (3), `en-US` (3), `pt-BR` (1), `it-IT` (1), `zh-CN` (1, with a `zh-TW` edition of the same book), `ro-RO` (1), `ca-ES` (1). Example community pack: `ca-ES` doubles as the example.

`LanguageDefinition` (packages/core/src/languages.ts): `{ locale, baseLanguage, region?, script: 'Latn'|'Hans'|'Hant', nativeName, localizedNames: Record<catalog, string>, direction: 'ltr', stability: 'stable'|'beta', tokenizer: 'latin'|'presegmented', typography: 'latin'|'cjk', pronunciationGuide: 'none'|'pinyin', tutorNotes: string, ttsVoice: string, ttsLangCode: string, sttLanguage: string, catalog: UiCatalog }`.

## 2. Content

### 2a. Source bundle (what content authors produce) — `packages/content/source/<bookId>.bundle.json`
```jsonc
{
  "schemaVersion": 1,
  "bookId": "fr-petit-chaperon-rouge",        // kebab, starts with base language
  "contentLocale": "fr-FR",
  "editions": ["zh-TW"],                      // optional, zh only: extra script edition generated from this text
  "title": "Le Petit Chaperon rouge",
  "author": "Charles Perrault",               // original author
  "sourceEdition": "Histoires ou contes du temps passé (1697), Project Gutenberg #...", 
  "sourceUrl": "https://www.gutenberg.org/ebooks/...",
  "sourceJurisdiction": "Public domain worldwide (author died 1703)",
  "adaptationEditor": "Sotto contributors (AI first draft)",
  "reviewStatus": "draft",                    // draft | reviewed | stable. Tonight: ALWAYS "draft".
  "level": "A1",                              // A0 | A1 | A2 | B1 | B2 | C1
  "categories": ["tales"],                    // tales | fables | adventure | classics | folk | idioms | daily
  "estimatedMinutes": 6,
  "localizedTitles": { "en": "...", "fr": "...", "es": "..." },
  "premise": { "en": "one sentence", "fr": "...", "es": "..." },
  "summary": { "en": "spoiler-light 2-3 sentences", "fr": "...", "es": "..." },
  "contentWarning": null,
  "tutorNotes": { "pronunciation": "...", "grammar": "...", "culture": "...", "commonErrors": "..." },
  "vocabulary": [ { "word": "tanière", "gloss": { "en": "den", "fr": "tanière", "es": "guarida" } } ], // 10-20 items
  "comprehension": [ { "question": { "en": "...", "fr": "...", "es": "..." } } ],                   // 3-5
  "license": { "spdx": "CC-BY-SA-4.0", "attribution": "Sotto contributors; based on the public-domain original by Charles Perrault" },
  "chapters": [
    {
      "title": "Chapitre 1",
      "paragraphs": [
        { "sentences": [
            { "text": "Le petit renard sort de sa tanière.", "translation": { "en": "...", "fr": "...", "es": "..." } }
        ] }
      ]
    }
  ],
  "glossary": { "renard": { "en": "fox", "fr": "renard", "es": "zorro" }, "sort": { "en": "goes out", "fr": "sort", "es": "sale" } }
}
```
Rules: sentences are one plain string each; the builder tokenizes. Chinese (`zh-CN`): write `text` with a single ASCII space between words (pre-segmented by the author), and the glossary entries carry `"pinyin": "tán"` in addition to glosses; the builder removes the spaces for display. The glossary key is the lowercase surface form (diacritics preserved). Cover the whole text: every content word must appear in `glossary` (function words too). `translation` for every sentence in en+fr+es (a pack whose own language is one of these keeps that key as the identity text).

### 2b. Built pack (what the app loads) — `packages/content/packs/<contentLocale>/`
- `pack.json`: `{ schemaVersion: 1, locale, language: LanguageDefinition summary, books: BookSummary[] , generatedAt }`
- `books/<bookId>/book.json`: bundle metadata minus chapters/glossary, plus `{ cover: 'cover.svg', chapters: [{ id, title, order, file, audio?: 'audio/01.mp3', durationMs?, wordCount }] }`
- `books/<bookId>/chapters/<nn>.json`: `{ id, bookId, title, order, blocks: Block[] }`, `Block = { id, sentences: Sentence[] }`, `Sentence = { id, text, translations: Record<gloss, string>, tokens: Token[] }`, `Token = { id, text, normalized, isWord, glosses?: Record<gloss,string>, pinyin?: string, startMs?: number, endMs?: number }`. Ids: block `b<n>`, sentence `b<n>.s<n>`, token `b<n>.s<n>.t<n>`, stable and unique within the chapter.
- `books/<bookId>/cover.svg` (generated, deterministic seed = bookId, flat geometric, palette per category; Nightjar = deep teal #1F4F57 + peach, Saltpath = sand #E8D6B8 + ink are the two seed colorways).
- `books/<bookId>/audio/<nn>.mp3` + timings written into chapter tokens (startMs/endMs) by `content:narrate`.
- `books/<bookId>/attribution.json`: machine-readable provenance + licenses for text, glosses, cover, audio (audio: "Kokoro-82M, Apache-2.0 model; generated audio CC BY-SA 4.0").
- `messages/<catalog>.json` lives in `packages/content/messages/` (not per pack): flat keys, ICU plural syntax `{count, plural, one {# mot} other {# mots}}`.
- Validator (`pnpm content:validate`) errors on: missing license, invalid locale, duplicate ids, token/sentence mismatch, missing gloss for a word token, missing asset file referenced, `reviewStatus: stable` without `reviewedBy`, incomplete catalogs vs `messages/en.json` keys, zh token lacking pinyin.

### 2c. Narration
`pnpm content:narrate [bookId]` -> Kokoro `/v1/audio/speech` per chapter (voice from LanguageDefinition.ttsVoice, `response_format: wav`) -> STT `/v1/audio/transcriptions` with `response_format=verbose_json` (+ `timestamp_granularities[]=word` for speaches/OpenAI; whisper.cpp returns `segments[].words` always) on that wav -> align whisper words to pack tokens by normalized sequence matching (diff-based; unmatched tokens interpolate between neighbours) -> write mp3 (ffmpeg or lamejs) and token startMs/endMs. Cache by sha256(text+voice) under `packages/content/.cache/`. Kokoro's own `/dev/captioned_speech` timestamps are empty for non-English voices (verified 2026-09-04), so alignment is the reference path. Locales with no Kokoro voice (ro-RO, ca-ES) get no audio tonight: chapter `audio` absent, UI hides transport. Document as deferred.

## 3. Domain models (packages/core/src/models.ts)
`Book`, `Chapter`, `Token` as in 2b. Plus:
- `ReadingProgress { bookId, chapterId, tokenId?, audioPositionMs, percentComplete, updatedAt, completedAt? }`
- `SavedWord { id, bookId, chapterId, tokenId, sentenceId, sourceLocale, explanationLocale, sourceWord, normalizedWord, translation, pronunciationGuide?, contextSentence, savedAt, review: { ease: number, intervalDays: number, dueAt: string, reps: number, lapses: number, lastRating?: 'again'|'hard'|'easy' } }`
- `UserPreferences { interfaceLocale, explanationLocale, learningLocale, level: 'A0'|'A1'|'A2'|'B1'|'B2'|'C1', immersionMode: boolean, tutorVoice?: string, defaultTutorMode: TutorMode, captionsEnabled: boolean, turnDetection: 'auto'|'push', correctionFrequency: 'low'|'normal'|'high', speakingPace: 'slow'|'normal', narrationSpeed: 0.75|1|1.25, onboarded: boolean }`
- `TutorMode = 'read_to_me' | 'read_with_me' | 'pronunciation' | 'discuss'`
- `VoiceSessionRecord { id, bookId, chapterId, mode, status: 'active'|'paused'|'ended', startedAt, endedAt?, lastTokenId?, transcriptSummary?: string }`
- `TutorEvent { id, sessionId, type: 'caption'|'tool_call'|'tool_result'|'state'|'error', speaker?: 'learner'|'tutor', text?: string, payload?: unknown, tokenIds?: string[], createdAt }` (captions are ephemeral; only summaries + saves persist)
- Review scheduler: SM-2-lite: `again` -> interval 0 (due now, lapses+1), `hard` -> interval max(1, prev*1.2), `easy` -> interval max(1, prev*ease), ease 2.5 start, clamp [1.3, 3.0]. Pure function `scheduleReview(prev, rating, now)`.
- Export: `{ format: 'sotto-export', version: 1, exportedAt, preferences, progress[], savedWords[], completedBooks[], sessions[] }`; import validates with zod, rejects `version > 1` with message key `import.unsupportedVersion`.

## 4. Client state (apps/client/src/state)
Zustand slices: `preferences`, `library` (packs loaded from server `/content/packs` or bundled JSON), `progress`, `vocabulary`, `session` (voice), `ui` (toasts). One `persist` middleware with a `Persistence` adapter: web = `idb-keyval` (IndexedDB), native = `expo-sqlite` kv-store. Keys: `sotto.preferences`, `sotto.progress`, `sotto.vocabulary`, `sotto.session`. Selectors live in `apps/client/src/state/selectors.ts` (rails: continue, recommended by level, new; search; filter by category; vocabulary by book; due reviews).

## 5. Voice

### 5a. VoiceProvider (packages/voice/src/provider.ts)
```ts
interface VoiceProvider {
  connect(opts: SessionOptions): Promise<void>;   // opts: { bookId, chapterId, mode, learner: {level, learningLocale, explanationLocale}, passage: PassageContext, savedWords: string[] }
  disconnect(): Promise<void>;
  setMode(mode: TutorMode): void;
  setMuted(muted: boolean): void;
  pushToTalk(active: boolean): void;              // when turnDetection = 'push'
  interrupt(): void;                              // stop tutor speech now (barge-in)
  replayLast(): void;
  sendText(text: string): void;                   // typed fallback
  respondTool(callId: string, result: ToolResult): void;
  on(listener: (e: VoiceEvent) => void): () => void;
}
type VoiceState = 'idle'|'connecting'|'listening'|'thinking'|'speaking'|'paused'|'muted'|'reconnecting'|'ended'|'error';
type VoiceEvent =
  | { type: 'state', state: VoiceState }
  | { type: 'caption', speaker: 'learner'|'tutor', text: string, final: boolean }
  | { type: 'tool_call', callId: string, name: ToolName, args: unknown }
  | { type: 'reading', tokenIds: string[] }          // tutor is reading these tokens now (speech fill)
  | { type: 'limit', reason: 'max_duration'|'idle' }
  | { type: 'error', code: string, message: string, recoverable: boolean };
```
Providers: `FakeVoiceProvider` (scripted from `packages/voice/fixtures/<mode>.json`, clock-driven, `EXPO_PUBLIC_VOICE=fake`), `LocalCascadeProvider` (WebSocket client, default), `OpenAIRealtimeProvider` (throws `NotImplemented`, interface only).

### 5b. Wire protocol (server `ws://host:8790/voice/ws?session=<id>`)
- `POST /voice/session` body `SessionOptions` -> `{ sessionId, wsUrl, sampleRate: 16000, limits: { maxMs: 1200000, idleMs: 90000 } }`.
- Client->server binary frames: PCM16 mono 16 kHz little-endian, 20-40 ms per frame.
- Client->server JSON: `{ t: 'mode', mode }`, `{ t: 'mute', muted }`, `{ t: 'ptt', active }`, `{ t: 'interrupt' }`, `{ t: 'replay' }`, `{ t: 'text', text }`, `{ t: 'tool_result', callId, ok, result?, error? }`, `{ t: 'passage', passage }` (client updates visible passage), `{ t: 'end' }`.
- Server->client binary frames: PCM16 mono 24 kHz tutor audio (Kokoro native rate), preceded by JSON `{ t: 'audio_start', utteranceId }` and followed by `{ t: 'audio_end', utteranceId }`. Server->client JSON mirrors `VoiceEvent`: `{ t: 'state', state }`, `{ t: 'caption', ... }`, `{ t: 'tool_call', callId, name, args }`, `{ t: 'reading', tokenIds }`, `{ t: 'limit', reason }`, `{ t: 'error', ... }`.
- Barge-in: server VAD `speech_start` while speaking -> server cancels TTS + LLM stream, sends `{ t: 'audio_end', utteranceId, cancelled: true }`, state `listening`. Client also stops playback immediately on its own `speech_start` or `interrupt`.
- WebRTC: NOT in v1 transport. `packages/voice/src/transports/webrtc.ts` exports an interface stub only. (Decision 2026-09-04: werift has no Opus codec; Pipecat adds a Python runtime. WS + PCM is the reference; documented in docs/architecture.md and verification.md.)

### 5c. Tools (packages/core/src/tools.ts, zod)
`get_current_passage {}` -> `{ chapterTitle, sentences: [{id, text, tokenIds, words: [{id, text}]}], positionTokenId }` (`words` = the sentence's word tokens in order, punctuation excluded: the word->tokenId map the tutor prompt renders so the model never has to derive an id by counting)
`set_reading_position { tokenId | sentenceId }` -> `{ ok }`
`save_vocabulary { tokenId, translation?: string, word?: string }` -> `{ ok, savedWordId }` (tokenId must exist in the current chapter; translation defaults to the pack gloss; when `word` is given and tokenId's text differs, the client re-resolves to the nearest token with that text or fails — never a silent save of a different word)
`remove_vocabulary { savedWordId | tokenId }` -> `{ ok }`
`show_explanation { tokenId?, title, body, kind: 'translation'|'grammar'|'pronunciation' }` -> `{ ok }`
`set_session_mode { mode: TutorMode }` -> `{ ok }`
`mark_section_complete {}` -> `{ ok, advanced: boolean }`
Tools execute CLIENT-side against the store after zod parse; invalid -> `{ ok: false, error }` returned to the model. Server never fabricates success.

### 5d. Server env (apps/server/.env.example)
`SOTTO_STT_URL=http://127.0.0.1:9001/v1` (reference: native whisper.cpp `whisper-server` with Metal, started by `pnpm dev:stt` = `whisper-server -m ~/ods/data/models/whisper/ggml-large-v3-turbo.bin --host 127.0.0.1 --port 9001 --inference-path /v1/audio/transcriptions --convert`; the model path comes from `SOTTO_WHISPER_MODEL`. Verified 2026-09-04: OpenAI-shaped multipart request, `response_format=verbose_json` returns `segments[].words[] {word,start,end}` in seconds, 0.34 s for a 3 s clip. Alternative: speaches in Docker at `http://127.0.0.1:9000/v1` with `SOTTO_STT_MODEL=Systran/faster-whisper-small`, which is 11 s per turn on CPU), `SOTTO_STT_MODEL=` (only used by speaches/OpenAI; whisper.cpp ignores it), `SOTTO_LLM_URL=http://127.0.0.1:8080/v1`, `SOTTO_LLM_MODEL=qwen3.6-35b-a3b`, `SOTTO_TTS_URL=http://127.0.0.1:8880/v1`, `SOTTO_API_KEY=` (optional Bearer for all three; set the three URLs to `https://api.openai.com/v1` + models `whisper-1`/`gpt-4o-mini`/`tts-1` to run the same cascade on OpenAI), `SOTTO_PORT=8790`, `SOTTO_HOST=127.0.0.1` (set `0.0.0.0` to reach the server from a phone on the LAN). Client: `EXPO_PUBLIC_SERVER_URL=http://localhost:8790`, `EXPO_PUBLIC_VOICE=local|fake`.
LLM call shape (verified 2026-09-04): OpenAI chat completions with `tools`, `stream: true`, `chat_template_kwargs: { enable_thinking: false }`, temperature 0.4, max_tokens 200 for spoken turns. Kokoro voices: fr `ff_siwis`, es `ef_dora`, en `af_heart`, it `if_sara`, pt `pf_dora`, zh `zf_xiaoxiao`; `lang_code` f/e/a/i/p/z. Whisper: multipart `file`, `model`, `language`, `response_format=verbose_json`.

## 6. Client routes and screens (Expo Router, apps/client/app)
`/onboarding/languages`, `/onboarding/level`, `/(tabs)/home`, `/(tabs)/library`, `/(tabs)/vocabulary`, `/library/search`, `/book/[bookId]`, `/reader/[bookId]?mode=read|narration`, `/voice/[bookId]`, `/review?bookId=`, `/profile`, `/settings/learning-language`, `/settings/explanation-language`, `/settings/app-language`, `/settings/licenses`. Tab bar hidden on everything outside `(tabs)`.
Screens use ONLY tokens from `@sotto/core/theme` and strings from `useT()` (`apps/client/src/i18n`). Message keys: dotted namespaces `common.*`, `tabs.*`, `onboarding.*`, `home.*`, `library.*`, `book.*`, `reader.*`, `voice.*`, `vocabulary.*`, `review.*`, `settings.*`, `errors.*`, `import.*`. `en.json` and `fr.json` are the base; other catalogs are validated against `en.json` keys.

## 7. Theme (packages/core/src/theme.ts)
Export `colors`, `type`, `radius`, `space`, `shadow`, `motion` exactly as planning/design/DESIGN.md tokens. Fonts bundled via `@expo-google-fonts/fraunces` and `@expo-google-fonts/inter`.

## 8. Ownership map (no worker edits outside its list)
WS-0: root files, `.github/`, `docs/` baseline, `apps/client` skeleton, `apps/server` skeleton, package skeletons. WS-1: `packages/core/**`, `packages/content/src/**` (CLI), `packages/voice/src/{provider,events,fake}*`, `packages/voice/fixtures/**`. WS-2: `apps/client/src/ui/**`, `apps/client/app/**` (shell screens), `apps/client/src/i18n/**`. WS-3: `apps/server/**`, `packages/voice/src/transports/**`, `packages/voice/src/local-cascade*`. WS-4: `apps/client/src/state/**`, `apps/client/src/platform/**`, `apps/client/app/reader/**`, `apps/client/app/voice/**`, `apps/client/app/review*`, `apps/client/app/(tabs)/vocabulary*`. WS-5: `packages/content/source/**`, `packages/content/packs/**`, `packages/content/messages/**`. WS-6: `apps/client/e2e/**`, `docs/verification.md`, `docs/screenshots/**`.
