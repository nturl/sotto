# Run 9 — FINAL (2026-09-07, Fable orchestrator, Opus lanes)

## 1. What was wrong, proven

Noel's report (Discuss, English book, no own-provider key): he asked "Tell me more about the gray husky dog", the transcript showed "you", the tutor posted a five-line summary, and the audio was gibberish. Three separate defects, each reproduced by machine before it was fixed:

- **STT**: whisper-base transcribes silence as the word "you" (lane A reproduced it with 12 s of digital silence). Nothing filtered it, so the LLM answered a one-word "question".
- **Reply**: the shared prompt asks for two sentences plus one question; the 2B model drops the question ~8 times in 10 (lanes B and H, ten real-model samples) and nothing stripped markdown or capped length.
- **Audio**: Kokoro `q8` on WebGPU is noise. Lane C: same sentence, same GPU, WER 4.35 (q8) vs 0.00 (fp32); Whisper heard "yorks, yorks, yorks". Markdown was also spoken aloud ("Astroskastrisk"). Lane E's baseline: round-trip WER 1.67 (mic) / 1.00 (text).

## 2. What shipped (branch `run9/integration`, 30 commits, pushed; deployed to the free origin)

- `transcript-gate.ts`: hallucination list, silent/too-short verdicts with RMS and duration, CJK-aware word count, "I didn't catch that. Could you say it again?" caption (localized client-side, key `voice.didNotCatch`), metric `stt_rejected`. PTT keeps a 300 ms pre-roll; mis-taps drop. Half-duplex VAD threshold ×2 while the tutor speaks, held until the client reports playback drained (new main→worker message).
- `prompt.ts` `compact` flag (worker only; golden fixture pins the non-compact prompt byte-for-byte for all four modes). `reply-shape.ts`: markdown/emoji/filler stripping, streaming-safe; `ReplyBudget` (3 spoken sentences in discuss) with a safe engine abort and `llm_capped` metric; `max_tokens` 240 for discuss/feedback modes. Question-only continuation (`llm_question_retry`, 12 s deadline) when a discuss reply lacks its question: 4/4 live, ~5.5 s added per continued turn.
- `loadTts`: WebGPU → fp32, wasm → q8, numbers in the comment; `tts-text.ts` `prepareForSpeech` (markdown, quotes, dashes, symbols, long-sentence split into pieces under one utterance id). Kokoro size label 312 MB.
- Voice screen: mic press mid-utterance interrupts first; space-held push-to-talk on web; "Not what you said? Type it" under the newest learner caption; SPEAKING held until playback drains; the hidden-mic claim in PLAN.md was REFUTED with screenshots (lane D).
- `discuss-quality.mjs` acceptance probe with a Whisper round trip on the spoken audio, WER/WAV helpers in `apps/client/e2e/lib/`. `@sotto/voice` gained a `test` script (it was a silent no-op for every earlier lane).

## 3. Proof

- Acceptance probe on the integrated build: baseline 14/18 → 18/18 (H0), 16/18 (H, question missing), 18/18 twice (H2). Round-trip WER 0.000–0.115. Reports: `ACCEPTANCE.md`, `H-report.md`, `H2-report.md`; WAVs under `~/Claude/sotto-run9/AFTER*/`.
- Isolated check on `git archive 1e5ea57`: typecheck 5/5, 1009 tests, content 0 errors; `format:check` fails only on `apps/client/web/landing/index.html` and `pnpm lint` only on `planning/design/launch-cards/shots2x.mjs`, both pre-existing on main and owned by another session.
- Deployed from that archive with `apps/client/.vercel` copied in: `dpl_2QMDzgXxJ1uQDBNw97CDzdRSH9Mm`, live at https://readsotto.app; the served worker bundle carries the run-9 markers and `fp32`. `hosted.mjs` live: RESULT PASS at 375 and 1440 (after pointing its landing step at the guest link the landing now uses, "Read free, no account").
- Adversarial review `R-adversarial.md`: 3 P0 (all closed), 8 P1 (all fixed in H), 13 P2 (2 fixed, 11 carried).

## 4. Needs Noel

1. **Land the branch on main**: `git merge --ff-only run9/integration` from `~/Claude/sotto` once the other session's uncommitted tool-protocol edits in `packages/voice/src/browser-cascade/` (worker.ts, provider.ts, markers.ts, tool-protocol.ts) are committed or set aside; they overlap worker.ts and will need a rebase onto this branch. The orchestrator did not merge (history-touching git needs your yes).
2. Listen to `~/Claude/sotto-run9/C/before.wav` vs `after.wav` (ten seconds).
3. `fly deploy` for the paid origin, after bumping sotto-cloud's vendor pin to the landed sha.
4. Product call: the ~5.5 s question continuation is on; two cheaper levers are noted in `H2-report.md`.

## 5. Carried

Tool calling on Qwen3.5-2B (`llm_tools_unsupported`; another session is moving the fallback to Qwen's native `<tool_call>` in the main tree); `[[reading:]]` under compact never driven on the real model; `HALF_DUPLEX_THRESHOLD_SCALE = 2.0` unmeasured acoustically; the cap-then-continue WebLLM hang is contained by a deadline, not explained; `voice-live.mjs` not re-run this run; `sttLanguageHint` impossible on transformers.js 4.2.0 (`prompt_ids` disabled upstream); the automatic opening turn posts no caption (lane B, pre-existing); the idle session ends itself at ~85 s (lane B, pre-existing); R's nine remaining P2s.
