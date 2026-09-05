# Local models

`apps/server` talks to three OpenAI-compatible HTTP endpoints — no API key
required by default (defaults verified against `apps/server/src/config.ts`):

| Role           | Env var         | Default                    | Model                                                                                                                |
| -------------- | --------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Speech-to-text | `SOTTO_STT_URL` | `http://127.0.0.1:9001/v1` | `SOTTO_STT_MODEL` (only used by speaches/OpenAI; whisper.cpp ignores it and uses whatever model it was started with) |
| Chat / LLM     | `SOTTO_LLM_URL` | `http://127.0.0.1:8080/v1` | `SOTTO_LLM_MODEL` (default `qwen3.6-35b-a3b`)                                                                        |
| Text-to-speech | `SOTTO_TTS_URL` | `http://127.0.0.1:8880/v1` | `SOTTO_TTS_MODEL` (default `kokoro`)                                                                                 |

Copy [`.env.example`](../.env.example) to `apps/server/.env` and adjust as
needed. `GET /health` on the server probes each endpoint's `/models` route
(2s timeout) and reports which of `stt` / `llm` / `tts` are reachable, plus
which VAD backend is active (`silero` or the `energy` fallback).

The server binds `127.0.0.1` by default and has no accounts/auth (see
docs/voice-pipeline.md "Security"). Set `SOTTO_HOST=0.0.0.0` only to test
from a phone on the same LAN, and only on a trusted network.

## Getting a local stack running

Any server that speaks the OpenAI `/v1/audio/transcriptions`,
`/v1/chat/completions`, and `/v1/audio/speech` APIs will work. There is no
`pnpm dev:stt` script (yet) — start the STT server directly. Two options:

- **Reference: native whisper.cpp `whisper-server`** (verified 2026-09-04:
  fastest option tested — 0.34s for a 3s clip on a tiny model, 2.2s on
  large-v3-turbo; returns word-level timestamps in `verbose_json`, needed for
  narration alignment, CONTRACTS §2c/§5d):

  ```sh
  whisper-server \
    -m "$SOTTO_WHISPER_MODEL" \
    --host 127.0.0.1 --port 9001 \
    --inference-path /v1/audio/transcriptions --convert
  ```

  `SOTTO_WHISPER_MODEL` should point at a `ggml-*.bin` model (e.g.
  `ggml-large-v3-turbo.bin`); build whisper.cpp with Metal support on Apple
  Silicon for GPU acceleration. `SOTTO_STT_MODEL` is not consulted — the
  model is fixed by whichever `.bin` file the server was started with.

- **Alternative: [speaches](https://github.com/speaches-ai/speaches)**
  (faster-whisper under the hood, e.g. in Docker) on port 9000 — set
  `SOTTO_STT_URL=http://127.0.0.1:9000/v1` and
  `SOTTO_STT_MODEL=Systran/faster-whisper-small` (or another faster-whisper
  model id). Measured 2026-09-04 at ~11s per turn on CPU, vs. whisper.cpp's
  sub-second/few-second times above — whisper.cpp is the recommended default.

For the other two services:

- **LLM**: [llama-server](https://github.com/ggml-org/llama.cpp) (llama.cpp)
  or [LiteLLM](https://github.com/BerriAI/litellm) as a router, on port 8080,
  serving a tool-calling-capable model (Qwen3.6-35B-A3B or similar). The
  request body sends `chat_template_kwargs: { enable_thinking: false }`
  (required or Qwen3.6 reasons for ~15s before responding) and
  `cache_prompt: true` (llama-server extension — reuses the KV cache across
  turns that share the stable system-instruction prefix; without it, prompt
  evaluation alone can take 10-15s per turn on a long tutor system prompt).
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

## Voice activity detection

`apps/server` prefers Silero VAD v5 via `onnxruntime-node` if
`apps/server/models/silero_vad.onnx` is present (`pnpm --filter @sotto/server
models:fetch` downloads it); otherwise it falls back to a simple RMS energy
VAD with hangover. **Known issue** (see `apps/server/src/voice/vad.ts`'s
header comment): on this stack's onnxruntime-node build, Silero returns
near-zero speech probability on both Kokoro-synthesized audio and its own
upstream test fixture, even though the integration was checked byte-for-byte
against the official Python reference — the fallback energy VAD is the path
actually exercised end-to-end. `GET /health`'s `vad` field reports which
backend is live.

## Whisper request shape

Multipart form: `file`, `model`, `language`, `response_format=verbose_json`
(narration alignment additionally requests
`timestamp_granularities[]=word`).
