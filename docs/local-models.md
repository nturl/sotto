# Local models

`apps/server` talks to three OpenAI-compatible HTTP endpoints — no API key
required by default:

| Role           | Env var         | Default                    | Model                                                                                                                                         |
| -------------- | --------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Speech-to-text | `SOTTO_STT_URL` | `http://127.0.0.1:9000/v1` | `SOTTO_STT_MODEL` (default `Systran/faster-whisper-base`; use `deepdml/faster-whisper-large-v3-turbo-ct2` when available for better accuracy) |
| Chat / LLM     | `SOTTO_LLM_URL` | `http://127.0.0.1:8080/v1` | `SOTTO_LLM_MODEL` (default `qwen3.6-35b-a3b`)                                                                                                 |
| Text-to-speech | `SOTTO_TTS_URL` | `http://127.0.0.1:8880/v1` | `SOTTO_TTS_MODEL` (default `kokoro`)                                                                                                          |

Copy [`.env.example`](../.env.example) to `apps/server/.env` and adjust as
needed. `GET /health` on the server probes each endpoint's `/models` route
(2s timeout) and reports which of `stt` / `llm` / `tts` are reachable.

## Getting a local stack running

Any server that speaks the OpenAI `/v1/audio/transcriptions`,
`/v1/chat/completions`, and `/v1/audio/speech` APIs will work. One way to get
all three running locally:

- **STT**: [speaches](https://github.com/speaches-ai/speaches) (faster-whisper
  under the hood) on port 9000.
- **LLM**: [llama-server](https://github.com/ggml-org/llama.cpp) (llama.cpp)
  or [LiteLLM](https://github.com/BerriAI/litellm) as a router, on port 8080,
  serving a tool-calling-capable model (Qwen3.6-35B-A3B or similar).
- **TTS**: [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) on port 8880.

If you already run a bundled stack for this (e.g. an `ods`-style local AI
box exposing the same three ports), point the env vars at it directly — no
changes needed on the Sotto side.

## Kokoro voices

Per-locale defaults (LanguageDefinition.ttsVoice, CONTRACTS §5d):
`fr` → `ff_siwis`, `es` → `ef_dora`, `en` → `af_heart`, `it` → `if_sara`,
`pt` → `pf_dora`, `zh` → `zf_xiaoxiao`. `ro-RO` and `ca-ES` have no Kokoro
voice yet — those packs ship without narration audio (CONTRACTS §2c).

## LLM call shape

OpenAI-style chat completions with `tools`, `stream: true`,
`chat_template_kwargs: { enable_thinking: false }`, `temperature: 0.4`,
`max_tokens: 200` for spoken turns.

## Whisper request shape

Multipart form: `file`, `model`, `language`, `response_format=verbose_json`
(narration alignment additionally requests
`timestamp_granularities[]=word`).
