# Run 9 — the no-key Discuss tutor hears, answers, and speaks (2026-09-06 overnight)

Orchestrator: Fable. Workers: Opus, one git worktree per lane (run 8 incident: a shared tree got swept). Adversarial review on Opus before the deploy.

## The report

Noel, Discuss tab, English book (Jack London, "Chapter 1 — The Trail"), no own-provider key, so the browser cascade (Whisper base → Qwen3.5-2B via WebLLM → Kokoro) ran the turn. He held the mic and asked "Tell me more about the gray husky dog." The transcript shows the learner bubble as the single word "you". The tutor then posted five caption lines ("Okay, let's see." / "The passage is about a man walking on a frozen trail…" / … / "The dog is unhappy but loyal.") and the spoken audio was, in his words, gibberish. The screen sat in SPEAKING with no mic control visible.

## Diagnosis (Fable, from reading the code; VERIFIED = read and traced)

1. **STT gate is missing.** "you" is Whisper's stock hallucination on silence or a near-silent segment. `worker.ts transcribeSegment` only discards empty text or a repeated-token collapse (`isDegenerateTranscript`); a one-word hallucination passes straight to the LLM as the learner's question. VERIFIED. Push-to-talk has no minimum-duration or energy check on the released segment (`ptt` case; `SpeechBuffer.end()`), and `ptt active` clears the pre-roll so the first syllables after the press are lost. VERIFIED. In auto mode the energy VAD has no half-duplex gate while the tutor speaks (BUGS-TUTOR-RUN5 #3, still open). VERIFIED.
2. **Reply contract is unenforced for a 2B model.** `packages/core/src/prompt.ts` asks for "at most two sentences" and exactly one trailing question, but nothing checks it: `llm-turn.ts` streams whatever comes; `markers.ts` strips only `[[…]]`, `<think>`, and ```tool blocks, never markdown bullets, asterisks, headers, or emoji. `max_tokens: 400` lets a five-line list through, and every line is spoken. VERIFIED. There is no rule for a garbled or one-word learner turn ("ask them to repeat"), so the model improvises a summary. VERIFIED.
3. **Spoken audio is unproven.** Kokoro loads `dtype: 'q8'` on WebGPU first (`loadTts`); kokoro-js has produced noise with q8 on WebGPU in some builds, and no test in the repo ever checks that generated audio is intelligible (browser-tutor.mjs deliberately asserts speaking never fires for es-419; audible-probe only checks samples > 0). INFERRED for the noise, VERIFIED for the missing proof. Sentences go to `kokoro.generate` with raw punctuation and no length cap (Kokoro degrades past ~500 phoneme tokens). VERIFIED.
4. **The screen hides the mic while speaking.** Screenshot: state SPEAKING, mic hidden, so the learner cannot interrupt or ask again; `TutorTurnRunner` posts `listening` when generation ends, not when audio ends, so the label and the audio disagree. VERIFIED for the state timing; the hidden-mic rendering is INFERRED from the screenshot (lane D reads `app/voice/[bookId].tsx` and `src/ui/voice/*` to confirm).

## Fixed decisions

- The three models stay (whisper-base, Qwen3.5-2B, Kokoro 82M). No model swap this run; a lane may RECOMMEND one in its report with evidence.
- Every pure decision lands in a new sibling module with a failing test first: `transcript-gate.ts` (lane A), `reply-shape.ts` (lane B), `tts-text.ts` (lane C). `worker.ts` edits are wiring only.
- The prompt builder is shared by every provider; lane B changes are behind a `compact: true` flag the browser worker sets, so the paid and local paths keep today's prompt byte-for-byte.
- Acceptance is lane E's `discuss-quality.mjs`: on the static export with the fake mic saying "Tell me more about the gray husky dog", the learner caption names the dog, the tutor reply is prose of at most three sentences ending in a question, and the captured PCM round-trips through Whisper with WER ≤ 0.35 against the caption. Lane E runs it BEFORE any fix (baseline, expected to fail and to reproduce Noel's report) and the orchestrator runs it after integration.
- Deploy the free origin only, from a clean `git archive` copy, after `pnpm check` is green on that copy and `hosted.mjs` passes live. `fly deploy` stays Noel's.

## Lanes

| Lane | Owns | Output |
|---|---|---|
| E | `apps/client/e2e/discuss-quality.mjs`, `apps/client/e2e/lib/*` (new), `~/Claude/sotto-run9/E/` | the acceptance probe + baseline evidence |
| A | `packages/voice/src/browser-cascade/transcript-gate.ts` (+test), `vad.ts` (+test), `worker.ts` lines in `transcribeSegment`, `handleFrame`, `ptt` | STT hygiene |
| B | `packages/core/src/prompt.ts` (+test), `packages/voice/src/browser-cascade/reply-shape.ts` (+test), `llm-turn.ts` (+test), `worker.ts` `WebLlmEngine.chat` request + `makeTurnRunner` | reply contract |
| C | `packages/voice/src/browser-cascade/tts-text.ts` (+test), `worker.ts` `loadTts` + `speakSentence`, `scripts/tts-roundtrip.mjs` (new, under `packages/voice/scripts/`) | intelligible audio |
| D | `apps/client/app/voice/[bookId].tsx`, `apps/client/src/ui/voice/*`, `apps/client/src/voice/controller.ts` (+test), i18n via the script only | mic stays usable, state honest |
| R | `planning/run9/R-adversarial.md` | the pessimistic review |
| H | whatever R names | fix pass |

Order: E and A–D in parallel (E's baseline first thing); R after integration; H; orchestrator deploy; FINAL.md.
