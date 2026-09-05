# Voice pipeline

Owner: WS-3 (`apps/server/**`, `packages/voice/src/transports/**`,
`packages/voice/src/local-cascade.ts`). Wire protocol is fixed in
`planning/CONTRACTS.md` §5b — this doc explains how `apps/server` implements
it, not a competing spec.

## Overview

```
apps/client (LocalCascadeProvider)
   |  POST /voice/session            -> { sessionId, wsUrl, sampleRate, limits }
   |  ws://host:8790/voice/ws?session=<id>
   v
apps/server (VoiceSession state machine, apps/server/src/voice/session.ts)
   |  VAD (vad.ts)  ->  STT (stt.ts)  ->  LLM (llm.ts)  ->  TTS (tts.ts)
   v
whisper-server / llama-server / Kokoro (local cascade, planning/CONTRACTS.md §5d)
```

One `VoiceSession` instance owns one WebSocket connection end to end. It has
no shared mutable state with other sessions except the process-wide Silero
model cache (`vad.ts`).

## States

`VoiceState = idle | connecting | listening | thinking | speaking | paused |
muted | reconnecting | ended | error` (CONTRACTS §5a). Server-side, a session
starts at `idle` and immediately moves to `listening` once constructed. Every
transition is pushed to the client as `{ t: 'state', state }` — the client
never has to infer state from side effects.

- **listening**: waiting for learner speech (VAD-driven) or a `ptt`/`text`
  message.
- **thinking**: STT running, or the LLM is streaming/waiting on a tool
  result. No audio plays during this state.
- **speaking**: at least one TTS'd sentence is currently streaming to the
  client as binary PCM16 frames.
- **muted**: client sent `{ t: 'mute', muted: true }` — inbound audio frames
  are dropped before they reach the VAD.
- **ended**: session limits hit, or `{ t: 'end' }` received, or the socket
  closed. Terminal.
- **error** is never actually held by the server state machine — every
  upstream failure is reported as an `error` event and the state falls back
  to `listening` immediately (CONTRACTS: "never leave the client stuck in
  thinking").

## Turn pipeline

1. **VAD** (`src/voice/vad.ts`) processes 16kHz PCM16 frames and emits
   `speech_start`/`speech_end` boundary events. In `auto` turn detection the
   session buffers frames between those two events (plus a small pre-roll
   buffer so the leading edge of speech isn't clipped) and hands the
   concatenated segment to STT. In `push` mode (once the client sends any
   `ptt` message) VAD is bypassed entirely — `ptt: active=true` starts
   capture, `ptt: active=false` ends the turn.
2. **STT** (`src/voice/stt.ts`) POSTs a WAV-wrapped segment to
   `SOTTO_STT_URL/audio/transcriptions` with `language` set to the learner's
   learning-locale ISO 639-1 code. If the transcript comes back empty, it
   retries once with the explanation locale (the learner may have asked a
   question in their explanation language).
3. **LLM** (`src/voice/llm.ts` + `src/voice/prompt.ts`) streams an
   OpenAI-shaped chat completion with `chat_template_kwargs: { enable_thinking:
false }` (required — otherwise the model reasons silently for ~15s first).
   Text deltas are fed through a streaming-safe marker stripper
   (`src/voice/markers.ts`) and a sentence chunker (`src/voice/chunker.ts`);
   each complete sentence is hand off to TTS immediately, so the first audio
   plays before the reply has finished generating.
4. **TTS** (`src/voice/tts.ts`) POSTs each sentence to Kokoro
   (`response_format: 'pcm'`) and streams the response back to the client in
   ~4800-byte (~100ms) binary frames, wrapped in `audio_start`/`audio_end`.

## `[[reading: ...]]` / `[[pace: ...]]` markers

The system instruction (`src/voice/prompt.ts`) asks the model to prefix a
reply with `[[reading: id1 id2]]` before reading passage sentences verbatim
(`read_to_me` mode), and to emit `[[pace: slow]]` / `[[pace: normal]]` when
the learner asks to slow down or speed back up. `src/voice/markers.ts` strips
these out of the text the learner hears/sees; the server turns `[[reading]]`
into a `{ t: 'reading', tokenIds }` event and `[[pace]]` into the TTS `speed`
used for the rest of the session (0.85 for slow, 1.0 for normal). Because
markers can be split across streamed deltas, the session buffers any
suffix that could be the start of an unclosed `[[...` marker and only
releases text once a marker is either complete or ruled out
(`safeReleaseIndex` in `session.ts`).

## Barge-in

`VoiceSession.bargeIn()` (`session.ts`) is the single choke point: it's
called on a VAD `speech_start`, on `{ t: 'ptt', active: true }`, and on
`{ t: 'interrupt' }`. It aborts whatever `AbortController` is currently in
flight (LLM stream and/or TTS fetch share one controller per turn) and, if an
utterance had started streaming, immediately sends
`{ t: 'audio_end', utteranceId, cancelled: true }` and moves state back to
`listening` — synchronously, without waiting for the aborted fetch to
actually unwind. `replayLast()` keeps the most recent utterance's PCM chunks
(including a cancelled one) in memory so `{ t: 'replay' }` can resend it.

## Tool relay

The server never executes tools or fabricates a result. On `tool_calls` in
the LLM response it sends `{ t: 'tool_call', callId, name, args }` and
`await`s a matching `{ t: 'tool_result', callId, ok, result?, error? }` from
the client, with a 30s timeout that resolves to `{ ok: false, error:
'timeout' }` if the client never answers. The tool result is appended to the
message history as a `role: 'tool'` message and the _same_ LLM turn
continues (up to 4 tool-call round trips per turn, to bound runaway loops).

## Limits

`maxMs` (20 min) starts a timer at session construction; `idleMs` (90s)
resets every time the learner speaks or sends `text`/`ptt`. Either firing
sends `{ t: 'limit', reason }` then ends the session.

## Env vars

See `.env.example` (root) — `SOTTO_STT_URL`, `SOTTO_STT_MODEL`,
`SOTTO_LLM_URL`, `SOTTO_LLM_MODEL`, `SOTTO_TTS_URL`, `SOTTO_TTS_MODEL`,
`SOTTO_API_KEY`, `SOTTO_PORT` (8790), `SOTTO_HOST`. All three upstream URLs
accept an optional Bearer token (`SOTTO_API_KEY`). To run the same cascade on
OpenAI instead of local models, set:

```
SOTTO_STT_URL=https://api.openai.com/v1
SOTTO_LLM_URL=https://api.openai.com/v1
SOTTO_TTS_URL=https://api.openai.com/v1
SOTTO_LLM_MODEL=gpt-4o-mini
SOTTO_API_KEY=sk-...
```

(models `whisper-1`/`tts-1` are wired for STT/TTS in the request bodies
already — only the LLM model name needs overriding via `SOTTO_LLM_MODEL`).

### Swapping STT to speaches

The reference STT is native whisper.cpp `whisper-server` (fast: ~0.3-0.6s per
turn locally). To use speaches instead (Docker, OpenAI-compatible, slower —
~11s/turn on CPU):

```
SOTTO_STT_URL=http://127.0.0.1:9000/v1
SOTTO_STT_MODEL=Systran/faster-whisper-small
```

No code change needed — both speak the same `multipart/form-data`
`/audio/transcriptions` shape.

## VAD backends

`GET /health` reports `vad: 'silero' | 'energy'`. `pnpm --filter @sotto/server
models:fetch` downloads Silero VAD v5 (`apps/server/models/silero_vad.onnx`,
gitignored, MIT-licensed — see `apps/server/models/README.md`). If the model
file is missing, or `onnxruntime-node`'s native addon fails to install/load,
the server falls back to a simple RMS energy VAD (300ms min speech, 700ms
silence-to-end, configurable in `vad.ts`) automatically and logs which
backend won at startup.

### Known issues

**Silero VAD produced unreliable results in this environment (2026-09-04).**
The `SileroVad` implementation in `src/voice/vad.ts` was checked byte-for-byte
against the official Python `onnxruntime` reference (same WAV decode, same
tensor feeds: `input`/`state`/`sr` -> `output`/`stateN`, shape `[2,1,128]` for
the v5 combined-state tensor) using both `silero_vad.onnx` and
`silero_vad_16k_op15.onnx` — the two implementations agree exactly, so the
integration code itself is correct. But on this machine's `onnxruntime-node`
1.29.0 build, both model exports return near-zero speech probability (never
crossing ~0.01, against the documented 0.5 decision threshold) on
Kokoro-synthesized French speech _and_ on the Silero repo's own
`tests/data/test.wav` fixture — verified with a from-scratch harness, not
just the app's own code. This looks like a model/opset snapshot issue
upstream rather than a bug in this integration, but it means Silero should
not be trusted without re-verifying on real microphone audio before turning
it on. **The energy VAD is what's actually verified end-to-end** — it's what
`scripts/voice-smoke.ts`'s logged run exercised — and the downloaded Silero
model was moved out of `apps/server/models/` for this delivery so the server
falls back to it by default. Re-run `models:fetch` and re-verify with real
mic audio before relying on Silero.

## Latencies measured (2026-09-04, local M-series Mac, `pnpm --filter

@sotto/server smoke`, energy VAD, whisper.cpp `ggml-large-v3-turbo`on Metal,
llama-server`qwen3.6-35b-a3b`, Kokoro)

| Stage                | Measured                 |
| -------------------- | ------------------------ |
| `stt_ms`             | 591ms, 616ms             |
| `llm_first_token_ms` | 5090ms, 5768ms           |
| `tts_first_audio_ms` | 7360ms, 11678ms, 12261ms |

The LLM first-token latency is dominated by the 35B model's prefill + the
~31 tokens/s decode rate reasoning through whether to call a tool before
emitting visible text; TTS first-audio latency scales with sentence length
(Kokoro returns a sentence's audio in one shot rather than streaming
word-by-word, so a long sentence's first byte arrives only once the whole
sentence has been synthesized). These are reported as measured, per the WS-3
brief — the models were not tuned.

## Known incomplete items

- Silero VAD: see "Known issues" above — implemented and unit-tested, but
  not verified working end-to-end (ships with energy VAD as the effectively
  active backend).
- `scripts/voice-smoke.ts`'s barge-in demo interrupts within ~1ms of
  `audio_start`, before Kokoro's first TTS byte has necessarily returned —
  it reliably exercises the `audio_end { cancelled: true }` path, but a
  "talking over audio that's already partway through playing" scenario is
  only exercised by the unit test
  (`apps/server/src/voice/session.test.ts`, "barge-in: cancels in-flight
  TTS..."), which stalls a controllable TTS stream mid-flight specifically
  to cover that case.
