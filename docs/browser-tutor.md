# The tutor in your browser

Sotto's voice tutor normally runs on your own machine through `apps/server`
(see [local-models.md](local-models.md)). On the hosted link there is no
server at all — so, if your browser supports WebGPU, the tutor can run inside
the browser instead, on models you choose to download once.

Nothing is downloaded automatically, no account is involved, and nothing you
say leaves your device.

## Turning it on

Open a book, tap the tutor, and the voice screen offers **Download tutor
models** with the size shown. The same panel lives at **Profile → Tutor
models**, where you can also remove them again.

The models are cached by your browser. Clearing site data, or tapping "Remove
models", frees the space; the app then offers the download again.

| Stage          | Model                                   | Download |
| -------------- | --------------------------------------- | -------- |
| Speech to text | Whisper base (encoder fp32, decoder q8) | 136 MB   |
| Tutor          | Qwen3 1.7B (q4f16, MLC)                 | 1,100 MB |
| Voice          | Kokoro 82M                              | 90 MB    |

Total opt-in download: 1,326 MB (~1.3 GB).

### Honest capability matrix

| Stage          | Where it can run                                                      | Notes                                                                                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Speech to text | WebGPU (default) or WebAssembly                                       | WebGPU is the fast path (~1-2.5s per turn). If a session's WebGPU transcription is ever unreliable — slower than 8s, or a repeated-token transcript — that session switches to WebAssembly on its own for the rest of it, with a one-time caption saying so. |
| Tutor (LLM)    | WebGPU only                                                           | Qwen3 1.7B has no WebAssembly path in this build; without WebGPU, only STT and captions work.                                                                                                                                                                |
| Voice (TTS)    | English only, proven in Node; not yet exercised in the browser worker | See "Speech is English-only for now" above — fr/es/other tutor replies stay text-only captions, never silently attempted.                                                                                                                                    |

The tutor listens and replies entirely inside the browser, no server
involved. Saving a word by voice is still being finished — the tutor can
narrate what it would save, but the tool call that actually stores it in
your vocabulary list is not reliable yet on the small model this runs; the
other six tools (jump to a sentence, switch modes, mark a section complete,
and so on) work the same as the local server's.

**Speech is English-only for now.** Kokoro's bundled phonemizer only ships
eSpeak-NG's English voice data; French and Spanish were tried and hard-reject
with "Invalid language identifier" regardless of the language code passed —
this was verified directly, not left unattempted. So English books get a
spoken tutor voice; every other language still gets full replies and tool
calls, just as text captions rather than audio. The panel says so.

## What it needs

- **WebGPU.** A recent Chrome, Edge or Safari on a desktop. Without it the
  screen says so plainly and reading, narration and tap-to-translate carry on
  working.
- **A secure context** (https, or localhost) — that is what the Cache API and
  the microphone both require.
- About 1.3 GB of free disk for the full set.

If WebGPU is present but the GPU adapter fails to initialize, the tutor falls
back to WebAssembly on its own. Speech recognition also switches to
WebAssembly mid-session, automatically, if it is ever too slow (over 8
seconds) or produces a garbled transcript — a one-time caption says so, and
every turn after that runs on WebAssembly instead. Slower, same behaviour.

## Where the files come from

- The tutor's code and the onnxruntime WebAssembly runtime are served from
  Sotto's own origin, with the app.
- Model weights come from the Hugging Face hub (and, for the tutor model, the
  MLC CDN) at the moment you tap download, and are then cached locally.

That is the only network traffic the tutor causes. Your microphone audio, the
transcripts and the tutor's replies never leave the browser: there is no
server to send them to.

## Privacy

Same rules as the rest of Sotto — no server, no account, no analytics, no
telemetry. The tutor's timings are printed to your browser's own developer
console and nowhere else.

## For contributors

Architecture, protocol, model choices and the measurements behind them are in
[planning/BROWSER-TUTOR.md](../planning/BROWSER-TUTOR.md). In short:

- `packages/voice/src/browser-cascade/provider.ts` — `BrowserCascadeProvider`,
  a drop-in `VoiceProvider` (CONTRACTS §5a).
- `packages/voice/src/browser-cascade/worker.ts` — the only module that
  imports an ML library. Nothing imports it; esbuild bundles it separately so
  Metro never sees it.
- `pnpm --filter @sotto/client build:tutor-worker` builds
  `apps/client/public/tutor/tutor-worker.js`. `web:export` runs it for you.
- `node apps/client/e2e/browser-tutor.mjs` drives the whole thing against the
  static export with a fake microphone.
