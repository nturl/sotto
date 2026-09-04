# Running the voice cascade on OpenAI

`apps/server`'s voice pipeline speaks plain OpenAI-compatible HTTP to three
endpoints (STT, chat, TTS) — see [docs/local-models.md](local-models.md). You
can point that same cascade at OpenAI's own API instead of local models by
setting, in `apps/server/.env`:

```sh
SOTTO_STT_URL=https://api.openai.com/v1
SOTTO_STT_MODEL=whisper-1

SOTTO_LLM_URL=https://api.openai.com/v1
SOTTO_LLM_MODEL=gpt-4o-mini

SOTTO_TTS_URL=https://api.openai.com/v1
SOTTO_TTS_MODEL=tts-1

SOTTO_API_KEY=sk-...
```

`SOTTO_API_KEY` is sent as a `Bearer` token to all three endpoints. It lives
only in server-side env — never in the client bundle, and never committed
(`.env` is gitignored; `.env.example` has no real values).

This is _not_ the OpenAI Realtime API — `packages/voice`'s
`OpenAIRealtimeProvider` is an interface stub only (throws `NotImplemented`)
and is not wired up in v1. This doc covers running the existing
STT → LLM → TTS cascade against OpenAI's non-realtime endpoints, which is a
drop-in swap for the local stack.
