# The tutor in the browser (Lane B / ledger O2-B)

Written 2026-09-04 during overnight run 2, after slice 1 shipped and its
numbers were measured. Everything stated as fact here was either read out of a
dependency's source or observed in `docs/evidence/browser-tutor-slice1-2026-09-05.log`.

## The problem

`sotto-steel.vercel.app` is a static export. There is no server, so `/health`
answers nothing, so the voice screen has always shown "the voice tutor needs
the Sotto server". Reading works from the link; the tutor does not. That split
makes "free, local, and you can try it from a link" read as a trade-off rather
than one product.

The fix is not to add a server. It is to run the same four-mode tutor inside
the browser, on models the learner explicitly chooses to download once.

## Architecture

```
  main thread (Metro bundle, ~1.6 MB)          worker (esbuild bundle, 0.5 MB)
  ─────────────────────────────────────        ─────────────────────────────────
  voice screen  ── VoiceProvider ──┐
  SessionBar        (unchanged)    │
  captions                         │
  toolContext (7 tools, unchanged) │
                                   ▼
                        BrowserCascadeProvider
                          │            ▲
        WebAudioAdapter   │            │        postMessage (typed protocol.ts)
        mic → PCM16 16k ──┤  audio ────┼──────▶  energy VAD  (vad.ts)
        speaker ◀─ PCM16 ─┤  audio ◀───┤              │ speech_end
                          │            │              ▼
                          │  state ────┤        whisper  @huggingface/transformers
                          │  caption ──┤          (WebGPU, wasm fallback)
                          │  tool_call ┤              │ learner text
                          │            │              ▼
                          │            │        (slice 2) Qwen3 @mlc-ai/web-llm
                          │            │              │ text deltas + tool calls
                          │            │              ▼
                          └────────────┘        (slice 3) Kokoro kokoro-js
```

Nothing above `BrowserCascadeProvider` changes. It implements the same
`VoiceProvider` interface (CONTRACTS §5a) and emits the same `VoiceEvent`
vocabulary as `LocalCascadeProvider` — `state`, `caption`, `tool_call`,
`reading`, `limit`, `error` — so the screen cannot tell which tutor it is
talking to. The seven tools already execute client-side through `toolContext`,
so they need no change at all: the worker asks, the main thread answers.

The two providers are the same translation layer over two transports: a
WebSocket in one case, a worker port in the other. That is why the worker
protocol deliberately mirrors the server's wire protocol (§5b) message for
message rather than inventing a second vocabulary.

## Keeping ML out of Metro

The hard constraint. Metro bundles `apps/client`; anything reachable from that
module graph ships to every visitor whether or not they ever open the tutor.
`@huggingface/transformers` alone would dwarf the app.

The rule that enforces it: **`packages/voice/src/browser-cascade/worker.ts` is
the only module in the repo that imports an ML library, and nothing imports
`worker.ts`.** `packages/voice/src/index.ts` exports the provider, the
protocol, the model catalog and the VAD — never the worker.
`apps/client/scripts/build-tutor-worker.mjs` compiles it with esbuild into
`apps/client/public/tutor/tutor-worker.js`, and the provider reaches it by URL:
`new Worker('/tutor/tutor-worker.js', { type: 'module' })`.

Verified after slice 1: the Expo web bundle is 1.6 MB and
`grep -c "onnxruntime\|huggingface"` over it returns 0.

esbuild was added as a devDependency of `@sotto/client` for exactly this. It is
the smallest thing that can produce one self-contained ES-module worker from
TypeScript sources across a pnpm workspace, and it is already an allowed build
in `pnpm-workspace.yaml`.

`build-web.mjs` calls the worker build before `expo export`, so `public/tutor`
is populated before Expo copies `public/` into `dist`. The output is
gitignored (`apps/client/public/tutor/.gitignore`): it is generated, and ~77 MB
of it is onnxruntime wasm.

## What comes from where

| Asset | Source | When |
|---|---|---|
| `tutor-worker.js` (0.5 MB) | our own origin | with the app |
| onnxruntime wasm runtime (~77 MB, 8 files) | our own origin, `/tutor/ort/` | on first tutor use |
| whisper weights (~95 MB) | Hugging Face hub | on explicit opt-in |
| Qwen3 weights (~1.1 GB, slice 2) | MLC CDN | on explicit opt-in |
| Kokoro weights (~90 MB, slice 3) | Hugging Face hub | on explicit opt-in |

Serving onnxruntime ourselves rather than from a CDN means the app reaches
exactly one third-party host, only while a download the learner asked for is
in flight. All eight `ort-wasm-*` variants are copied, not the obvious two:
onnxruntime-web 1.26 probes for `ort-wasm-simd-threaded.asyncify.mjs` during
backend selection and a 404 there fails the whole load with "no available
backend found" (observed, then fixed, during the slice-1 e2e). If the deploy
size becomes a problem, the escape hatch is one line in `worker.ts` pointing
`env.backends.onnx.wasm.wasmPaths` at onnxruntime's CDN.

## Protocol

`packages/voice/src/browser-cascade/protocol.ts`. Main → worker: `init`,
`download`, `audio` (transferred ArrayBuffer of PCM16 @ 16 kHz), `mode`,
`mute`, `ptt`, `interrupt`, `replay`, `text`, `tool_result`, `passage`, `end`.
Worker → main: `progress`, `ready`, `state`, `caption`, `tool_call`,
`reading`, `audio_start` / `audio` / `audio_end`, `error`, `metric`.

Two messages have no server equivalent. `progress` carries the libraries'
normalized download callbacks to the panel. `metric` carries timings
(`stt_load_ms`, `stt_ms`, and their device) that the provider prints to the
local console only — the worker otherwise has no way to say where it ran, and
the e2e log needs it. Nothing leaves the browser.

`init` always carries `allowDownload: false`. A session never fetches weights.
Only the panel's `download`, on a tap, sets it true.

## Models

Two tiers, chosen by the learner ("Tutor size", `preferences.tutorModelTier`,
default `standard`). `packages/voice/src/browser-cascade/models.ts` holds both
as `TUTOR_TIERS`; `modelsForTier(tier)` is what the gate, the panel, the
provider and the worker payload all read.

| Tier | Stage | Model | Size | Notes |
|---|---|---|---|---|
| standard | STT | `onnx-community/whisper-base`, encoder fp32 + decoder_merged q8 | 134 MB | encoder dtype changed fp16→fp32 2026-09-05, see below |
| standard | LLM | `Qwen3.5-2B-q4f16_1-MLC` | 1,016 MB | replaced Qwen3 1.7B 2026-09-06 (latency + listening) |
| standard | TTS | Kokoro 82M ONNX | 90 MB | |
| large | STT | `onnx-community/whisper-small`, encoder fp32 + decoder_merged q8 | 490 MB | same dtype rule, including the wasm decoder upgrade |
| large | LLM | `Qwen3.5-4B-q4f16_1-MLC` | 2,264 MB | offered only where `deviceSupportsLargeTier()` passes |
| large | TTS | Kokoro 82M ONNX | 90 MB | |

Totals: **1,240 MB** standard, **2,844 MB** large.

All six figures are measured, not estimated. The LLMs are the sum of `nbytes`
in `https://huggingface.co/mlc-ai/<id>/raw/main/tensor-cache.json` plus the
`model_lib` wasm; whisper is the exact ONNX files those dtypes select
(`encoder_model.onnx` + `decoder_model_merged_quantized.onnx`) plus the
tokenizer/vocab/config files transformers.js fetches with them.

Both LLM ids were verified against the pinned `@mlc-ai/web-llm@0.2.84`: each
appears in its `prebuiltAppConfig`, each `model_lib` URL under
`binary-mlc-llm-libs/web-llm-models/v0_2_84/base/` returns 200, and each
`mlc-ai/<id>` HF repo exists. The Qwen3.5 repos ship the newer
`tensor-cache.json` manifest rather than `ndarray-cache.json` — which is what
0.2.84 reads (it has no `ndarray-cache.json` code path left). `enable_thinking:
false` is still honoured: WebLLM implements it itself by pushing an empty
`<think></think>` block into the prompt before decoding, so it does not depend
on the model's Jinja chat template.

Switching tiers does **not** evict the other tier's weights. The libraries'
caches keep both; only `removeModels()` ("Remove models") clears them. This is
deliberate scope, and both the panel and `docs/browser-tutor.md` say so.

`deviceSupportsLargeTier()` (`apps/client/src/voice/availability.ts`) gates the
large row: `navigator.deviceMemory >= 8` where the browser reports it, and
otherwise (Safari) a WebGPU adapter with `maxStorageBufferBindingSize >= 1 GiB`
and `maxBufferSize >= 2 GiB`.

The whisper dtype split is measured, not guessed. On the slice-1 fixture (a
Kokoro-synthesized `¿Qué significa la palabra cigarra?`, 3.8 s of es-419),
transformers.js on CPU produced:

- encoder q8 + decoder q8 → "que significa la palabra **sigara**" (wrong)
- encoder fp32 + decoder q8 → "que significa la palabra **cigarras**" (right)
- encoder fp32 + decoder fp32 → "¿Qué significa la palabra cigarras?"

Quantizing the *encoder* is what loses the word; quantizing the decoder costs
punctuation and casing.

The encoder dtype was originally fp16 ("half the bytes, and WebGPU handles it
natively"). That was wrong in a way the slice-1 fixture never caught: fp16
turned out to be the root cause of the STT/LLM-contention regression below —
it causes WebGPU whisper decoding to collapse into a token-repetition loop on
this environment, independent of the LLM. Root-caused and fixed 2026-09-05;
see `docs/evidence/browser-tutor-stt-regression-2026-09-05.log`. The encoder
is now fp32 on every device, in **both** tiers, and the fp16 export is not
used at all. The wasm fallback in `dtypeForDevice` upgrades the decoder to
fp32 too, per-device rather than per-tier, so whisper-small inherits it
unchanged. whisper-small is what the large tier now uses (490 MB with these
dtypes); the standard tier stays on whisper-base at 134 MB.

## Capability gate

`apps/client/src/voice/availability.ts`:

- `EXPO_PUBLIC_VOICE=fake` still wins outright (screenshot e2e, unit tests).
- A healthy local server always beats the browser: a far bigger model on the
  machine's own GPU, no download at all. `{ status:'ready', path:'local' }`.
- No server (the static host: `/health` fails, `fetchHealth` returns null) →
  the browser path. WebGPU + every model cached → `{ ready, path:'browser' }`;
  WebGPU but no models → `{ needs-download, models:[{id,name,sizeMb}] }`; no
  WebGPU → `{ unavailable, reason:'no-webgpu' }`.
- A server that answers with a service down falls through too — it should not
  strand a capable browser — but if the browser also can't run the tutor, the
  more specific "these services are down" message wins over "no WebGPU".

`sessionManager.pickProvider(path)` then builds the matching provider. Nothing
downstream branches on it.

## Cache strategy

The libraries own the weights: `transformers-cache`,
`experimental_transformers-hash-cache`, `kokoro-voices`, and WebLLM's own
entries. Their keys are implementation details that change between versions,
so the gate does not read them. Instead the worker writes a marker Response
per model id into our own `sotto-tutor-models` cache once a load has actually
succeeded, and `cachedModelIds()` reads the markers. "Remove models" deletes
the marker cache and every library cache by name.

Every `caches` access is wrapped: a private window, blocked site data, or a
non-secure context simply reports "not installed" instead of throwing.

## Fallback matrix

| Situation | What the learner gets |
|---|---|
| Local server healthy | LocalCascadeProvider, as today |
| Static host, WebGPU, models cached | in-browser tutor |
| Static host, WebGPU, no models | download panel with names, sizes, progress |
| Static host, no WebGPU | "This browser cannot run the tutor: it has no WebGPU", plus Read alone |
| WebGPU present but adapter load fails | worker retries on wasm automatically; slower, same output |
| STT on WebGPU is slow (>8s) or garbled mid-session | that session switches STT to wasm automatically, discards the bad transcript, and shows a one-time caption saying so (`stt-fallback.ts`) |
| Download fails | panel shows the failure plus the library's own error text |
| Site data blocked / private window | tutor runs this session, panel keeps offering the download |

## Latency

Measured, WebGPU, M-series Mac, slice 1: pipeline construction 3.9 s (weights
already cached), transcription 1.05 s for a 2.7 s segment, 95 MB download in
29 s. That is roughly a third of the local-server stack's per-turn STT+LLM
time today, but the comparison is unfair until slices 2 and 3 land — the
in-browser LLM is the expensive part and is not yet written. Budget for slice
2: first token within ~2 s of the learner finishing, on Qwen3 1.7B.

## What stays on the local-server path

Nothing is being retired. `LocalCascadeProvider` remains the default wherever
`apps/server` is reachable, it uses much larger models (whisper-large-v3-turbo,
Qwen3.6-35B-A3B), and it is what `pnpm e2e:voice` still exercises. The browser
path is what a stranger with a link gets. Silero VAD also stays server-only:
its onnxruntime-node integration is unverified on this machine (see the KNOWN
ISSUE in `apps/server/src/voice/vad.ts`) and it cannot run in a browser worker
anyway, so the browser port is the energy VAD, thresholds unchanged.

## Prompt sharing

`buildSystemInstruction` moved from `apps/server/src/voice/prompt.ts` to
`packages/core/src/prompt.ts`, with its test. The server file is now a
re-export shim; `session.ts` is untouched and its tests still pass through the
old path. A second, near-duplicate "portable" builder (`buildTutorInstruction`)
that lived in core and was only ever called by its own test was deleted rather
than left as a third copy of the rules. One consequence: `apps/server`'s
tsconfig needed `allowImportingTsExtensions`, because it now resolves core's
`.ts` sources like every other package already did.

## Test strategy

- Unit, no models: `packages/voice/test/browser-cascade.test.ts` drives the
  provider with a fake worker shim and a fake AudioAdapter, asserting the
  event translation, the control-message mapping, idle/max-duration limits,
  and that progress/metric/audio plumbing never leaks into `VoiceEvent`s.
  `browser-cascade-vad.test.ts` mirrors the server's VAD test so the port is
  provably equivalent. `availability.test.ts` covers all six gate outcomes
  with a stubbed `caches` and `navigator.gpu`.
- End to end, real models: `apps/client/e2e/browser-tutor.mjs` serves the
  static export, launches Chromium with WebGPU plus the fake-mic flags, taps
  the real download CTA, and asserts a learner caption. Evidence:
  `docs/evidence/browser-tutor-slice1-2026-09-05.log`.
- One piece of stagecraft in that e2e, documented in its header:
  `contentApi.serverUrl()` treats any localhost origin as "dev" and points at
  `:8790`, where this machine really is running apps/server. The run blocks
  exactly one route, `:8790/health` — the only signal the gate reads from a
  server — so the gate falls through to the browser path exactly as it does on
  Vercel. Reaching the export under a non-localhost hostname would be purer
  but costs the secure context that WebGPU and the Cache API both require;
  `--unsafely-treat-insecure-origin-as-secure` was tried and did not restore it.

## Slice 2 + 3 status (2026-09-05)

Both shipped, with one deviation from the Slice 3 plan below: **TTS is
English-only.** The documented workaround — phonemize fr/es with the
`phonemizer` package's eSpeak-NG build, then `generate_from_ids` — was tried
and disproven, not left unattempted. `phonemizer` 1.2.1's bundled eSpeak-NG
wasm hard-rejects every non-English language identifier
(`list_voices()`/`phonemize(text, lang)` both throw "Invalid language
identifier" for `fr-fr`, `es`, and everything else that isn't an English
variant), independent of which Kokoro voice is requested — confirmed with a
standalone Node script before `worker.ts` was touched, printing the model's
own `list_voices()` output. This is a data limitation of the npm package's
wasm build, not a parameter or version issue, so per this document's own
escalation rule it ships as: English TTS for English books, and full text
replies + tool calls (no audio) for every other language, labelled as such
in `worker.ts` (search "HONEST LABEL"), the panel copy
(`tutor.browser.sliceNote`, all locales), and docs/browser-tutor.md.

Everything else in the Slice 2 checklist shipped as written: `chunker.ts` and
`markers.ts` (with `safeReleaseIndex`) ported verbatim into
`packages/voice/src/browser-cascade/`; the tool-call loop lives in the new
`llm-turn.ts` (`TutorTurnRunner`), decoupled from WebLLM so it has its own
fake-engine unit tests; `worker.ts`'s `WebLlmEngine` tries native OpenAI-shaped
`tools` first and falls back to a fenced ` ```tool ` JSON block if the loaded
build rejects that request shape — confirmed needed live:
`Qwen3-1.7B-q4f16_1-MLC is not supported for ChatCompletionRequest.tools`, the
fallback engaged, and the turn completed anyway. Qwen3 also needed
`extra_body: { enable_thinking: false }` in the WebLLM request (the local
server's equivalent is `chat_template_kwargs.enable_thinking`) — caught live
when a `<think>...</think>` reasoning block streamed straight through as
tutor captions before that field was added; `stripThinking`/`safeReleaseIndex`
in `markers.ts` now also strip/hold back `<think>` blocks as defense in depth.

**Resolved 2026-09-05 — root cause was NOT the LLM.** The STT-latency/quality
regression flagged here (whisper transcription of the same 2.7s clip that
took 1.05s and was correct in the slice-1 e2e taking ~21s and producing
garbage repeated tokens, "de de de de...", in two slice-2/3 e2e runs) was
reproduced with the LLM never loaded in the worker at all, with this
machine's native llama-server process stopped, and on a completely fresh
browser profile — disproving the leading "WebGPU contention between the two
resident models" hypothesis outright. The real cause: the whisper-base
encoder's fp16 dtype triggers a WebGPU decoder repetition-collapse in the
currently pinned `@huggingface/transformers`/onnxruntime-web versions on this
hardware (the ~20x slowdown IS the decoder running to its token budget in a
loop, not "the same work done slowly" — confirmed by adding
`no_repeat_ngram_size`/`max_new_tokens` and watching the failure shape change
from slow-and-wrong to fast-and-wrong). Forcing the encoder to fp32 (keeping
WebGPU as the device, keeping the decoder at q8) fixed it outright, verified
on two independent fresh profiles. `STT_MODEL`'s dtype in `models.ts` is now
fp32 for the encoder on every device; a session-scoped safety net
(`stt-fallback.ts`) additionally switches a session to wasm if WebGPU STT is
ever slow or degenerate again, as defense in depth rather than the primary
fix. Full experiment table, the ruled-out hypotheses, and the wasm-side
caveat (its q8 decoder can't build a session at all, independent of this
bug) are in `docs/evidence/browser-tutor-stt-regression-2026-09-05.log`; the
post-fix full e2e re-run is `docs/evidence/browser-tutor-slice4-2026-09-05.log`,
which also surfaced a separate, pre-existing, unrelated issue (the tutor's
first LLM turn sometimes produces no visible reply) — present in the
original slice-2/3 log too, out of scope for this fix and not yet
root-caused at the time. Root-caused and fixed in slice 5 below.

## Slice 5 status (2026-09-05) — turn-1 silence, second utterance, tool round trip

Root-caused two real bugs and fixed both, plus a third found only once the
first was fixed. Full write-up, experiments, and two clean final e2e runs:
`docs/evidence/browser-tutor-slice5-2026-09-05.log`.

1. **VAD frame-size mismatch** (this is why the second learner utterance was
   never heard, and the likely cause of most "no visible reply" cases):
   `EnergyVad` (`vad.ts`) was written and tested assuming ~20ms audio
   frames, but `WebAudioAdapter`'s `AudioWorkletProcessor` posts one message
   per render quantum, ~2.7ms — about 8x finer. At that granularity,
   ordinary voiced speech's natural zero-crossing dips reset the
   `minSpeechMs` accumulator before it ever completes, so only an unusually
   loud first capture ever triggered `speech_start`; every later utterance
   in the same session went undetected. Fixed by having `EnergyVad`
   internally re-chunk into ~20ms evaluation windows before applying its
   (otherwise unchanged) threshold logic.
2. **STT/LLM readiness race**: `session` is assigned synchronously at
   `init`, before `loadStt`/`loadLlm` are awaited, so a learner who speaks
   fast enough could have STT finish while the LLM was still loading —
   `runTutorTurn` used to see `llmEngine === null` and silently drop the
   turn with no caption, no error, no retry. Fixed by starting both loads
   concurrently and having `runTutorTurn` wait on the LLM's load promise
   (bounded to 15s) instead of giving up immediately.
3. Fixing (1) meant `speech_start` correctly re-fires now, which exposed a
   missing piece of server parity: `worker.ts`'s `handleFrame` never called
   `interruptSession` on `speech_start` the way the server's
   `onSpeechStart()` calls `bargeIn()`. Wiring it in surfaced two more bugs
   only reachable once barge-in actually happened: the JSON-tool-fallback's
   fenced `` ```tool `` block could leak into captions mid-stream (fixed in
   `markers.ts`, alongside `<think>`), and starting a new WebLLM
   `chat.completions.create()` immediately after interrupting a previous
   one could hang indefinitely (fixed by serializing turns through a
   tracked `currentTurnPromise`).

**Still open, not a code defect**: Qwen3-1.7B (the in-browser model) is
unreliable at actually calling `save_vocabulary` for a "save this word"
request — it sometimes narrates the action without emitting the tool call,
or calls the wrong tool. The mechanism itself is correct end to end (proven
live: a save completed with the right word, correctly resolved from the
passage, even when STT itself had misheard the spoken word) but it is not
reliable enough to claim as a shipped capability. `tutor.browser.sliceNote`
(all locales) and `docs/browser-tutor.md` now say the tutor listens and
replies, and that saving a word by voice is still being finished, rather
than claiming it works.

## Slice 2 (LLM + tools) — checklist

1. `worker.ts`: load `@mlc-ai/web-llm` `CreateMLCEngine` with
   `Qwen3-1.7B-q4f16_1-MLC`, `initProgressCallback` → the same `progress`
   message, `LLM_MODEL` added to `SLICE_1_MODELS` (rename it `TUTOR_MODELS`).
2. Port `SentenceChunker` (`apps/server/src/voice/chunker.ts`), `stripMarkers`
   (`markers.ts`) and `safeReleaseIndex` (`session.ts`) into
   `packages/voice/src/browser-cascade/` with their tests. They are pure.
3. Build the system prompt with `buildSystemInstruction` from `@sotto/core`
   using `session.payload`; keep a `ChatMessage[]` history trimmed to 24.
4. Stream with `engine.chat.completions.create({ stream: true, tools })`. If
   the loaded Qwen3 build rejects `tools`, fall back to instructing a single
   JSON block and parsing it — mirror `apps/server/src/voice/llm.ts`'s shape,
   and emit the same `tool_call` message either way.
5. Tool round trip: keep a `Map<callId, resolve>` in the worker, post
   `tool_call`, resolve on `tool_result`, 30 s timeout → `{ok:false,'timeout'}`,
   max 4 tool iterations per turn. The main thread needs no change.
6. `reading` markers and `[[pace: ...]]` handled exactly as `session.ts` does.
7. `interrupt` must abort the in-flight stream (`engine.interruptGenerate()`)
   and emit `state: listening`.
8. Test: extend the fake-worker suite with a tool round trip
   (`tool_call` → `respondTool` → worker sees `tool_result`). Extend the e2e to
   assert a tutor caption and a saved "cigarra" in IndexedDB, matching
   `voice-live.mjs`'s phase B.

## Slice 3 (TTS, onboarding sample, pronunciation) — checklist

1. **Read this before starting.** kokoro-js 1.2.1's exported `VOICES` map
   contains ONLY English voices (af_/am_/bf_/bm_), and its `phonemize` call is
   hard-coded to `en-us`/`en`. `generate()` therefore throws for `ff_siwis`
   and `ef_dora` even though those weight files ARE published and ARE in the
   package's `voices/` directory. Verified by reading `dist/kokoro.js`.
2. The workaround: phonemize with the `phonemizer` package directly (eSpeak NG
   wasm, already a kokoro-js dependency) at the right language code —
   `fr-fr`, `es`, `it`, `pt`, `zh` — then call
   `generate_from_ids(ids, { voice })`, which does NOT validate the voice and
   loads the style tensor straight from the hub. Confirm audio actually comes
   out for fr and es before building UI on it; if it does not, escalate
   rather than shipping English-voiced French.
3. Emit `audio_start` / `audio` (PCM16 @ 24 kHz, transferred) / `audio_end`;
   the provider already routes those to `WebAudioAdapter.playPcm`.
4. `replayLast`: keep the last utterance's chunks in the worker, re-emit them.
5. Barge-in: on `speech_start` while speaking, abort TTS and send
   `audio_end { cancelled: true }` — the provider already stops playback on it.
6. Onboarding voice sample and the translation panel's pronunciation button can
   call the same worker when models are present, falling back to today's mp3
   slice. Those files belong to other lanes; coordinate before editing.
7. Add `TTS_MODEL` to the download set and to the panel's list.
