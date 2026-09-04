# Sotto — pre-build decisions (2026-09-04)

Working name: **Sotto** (as in sotto voce). Noel may rename.
Reference product: a commercial graded-reader app (subscription, closed source); research notes are gitignored under research/.

## What research changed about the brief

1. **the reference app has no AI voice tutor.** Verified across site, store listings, reviews, and the 161 s recording. the reference app = graded readers + audiobook narration + tap-to-translate + saved-word flashcards + free daily story + streaks. The live tutor in the brief is an extension, not a clone. Phase 1 must nail the the reference app core first; the tutor rides on top.
2. **Local voice stack replaces OpenAI Realtime as the default provider.** Noel asked for zero API spend and local compute. `~/ods` already ships faster-whisper (speaches, :9000), Kokoro TTS (:8880), a native Metal llama-server, and a LiteLLM router, all OpenAI-API-compatible. Recommended pipeline: Silero VAD -> whisper (large-v3-turbo) -> Qwen3 8-14B via llama-server -> Kokoro (+ Piper for ro/ca), orchestrated by Pipecat, WebRTC to clients. Expected turn latency 1-2 s vs OpenAI's sub-second. OpenAI Realtime stays as an optional `VoiceProvider` implementation, not the reference one.
3. **Narration becomes free and universal.** Kokoro can synthesize every chapter with word timestamps, so the audiobook + word-sync path (the thing Noel actually likes in the reference app) works for every seeded book, not just one sample. Human narration remains an optional asset type.
4. **No accounts, so no sign-out / delete-account.** Local-first with export/import. Profile gets "Reset my data" + "Export / Import" instead. Subscription / restore-purchases rows are dropped (open source, free). This also removes most security-adjacent phrasing from the build, which matters for the Fable gate.
5. **Content stays public-domain abridgments** (the reference app licenses modern bestsellers; we cannot). Every abridgment ships labeled draft until a human reviewer signs off. Noel can review FR and ES.
6. **Recording confirms brief's palette and IA** with corrections: background nearer `#FBEBD9`, accent nearer `#E8552E`, teal (not green) daily-story gradient, dashed underline = already-narrated text, solid peach box = selected word, segmented scrubber with elapsed / speed / remaining. Reference app itself is Expo/React Native (build footer v1.26.0), which validates the stack choice.
7. **the reference app user complaints to fix from day one:** phrase/sentence translation (not just single words), audio reliability/offline caching, no mid-session paywall interruptions.

## Environment state

- Installed 2026-09-04: pnpm 11.25, watchman 2026.07.27, CocoaPods 1.17. Node 26.7, Xcode 26.6.
- iOS 26.5 simulator runtime: INSTALLED 2026-09-04; iPhone 17 Pro / 17 Pro Max / 17e simulators available.
- Physical iPhone 17 Pro: not connected; no dev team configured in Xcode. Blocks acceptance criteria 32-33 only.
- Docker Desktop was DOWN at research time; ODS starts via `~/ods/...ods-macos.sh start` (see memory project-ods-local-ai-stack).

## Decisions confirmed by Noel (2026-09-04, later the same day)

- Fable stays as orchestrator; gate exception accepted.
- Name: **Sotto**.
- Repo: **public from creation**.
- Voice provider: ship the local cascade as the reference provider with docs on pointing it at your own local models. Because the local provider speaks OpenAI-compatible STT / chat / TTS endpoints, a user can enter an OpenAI API key and base URL to run the same cascade against OpenAI instead. The OpenAI Realtime WebRTC provider is deferred (interface only).
- Cost routing: use /fanout for volume work. Kimi K3 for UI components and screens (Noel: "really good for UI work"), Codex/Gemini for tests and content tooling, Sonnet subagents when a worker needs full repo context. Fable plans and reviews only.
- Product bar: "a really good open-source language learning tool other people can use," not a personal one-off. Delightful, fun, clean UI. Cleo directions sheet at design/directions.html; Noel picks a direction before screens are built.
- Fable bar headroom: not reported by Noel; check Settings -> Usage before the long run.

## PRE-2 Design direction (chosen by Noel, 2026-09-04)

Build **Direction A "Paper"**. Steal **B's highlighter sweep**, used only on SAVED words (the marker stroke is the saved state; unsaved words keep the dotted underline). Steal **C's speech fill** for NARRATION word-sync (words fill from quiet gray to ink as the narrator reaches them; no highlight box chase). Noel liked the Nightjar and Saltpath cover colorways: keep that flat-geometric cover language and those two palettes as the seeds for the cover generator. Go deeper on A: design/system.html + design/DESIGN.md are the finished-level spec for WS-2.

Product priority note from Noel: the live tutor is valuable but "a little harder, especially at the start." So: reading + narration + tap-translate + vocabulary are the front door; voice mode is the second action on book detail (not the filled primary), and the voice screen uses C's calm canvas and word-state language. Do not let the tutor dominate onboarding or home.

## Files

- BRIEF.md — verbatim original brief (OpenAI-centric; superseded where this file says so).
- research/reference-app.md, research/local-voice-stack.md, research/recording-inventory.md, research/frames/.

## Parked for later (Noel, 2026-09-04)

- **User-uploaded books.** Not in Phase 1. Constraint on the build now: the content-pack contract is the ONLY content format, and seeded books go through the same pipeline (tokenize -> gloss -> narrate with timings) a future EPUB/text importer would. Do not special-case seeds. Later version: local converter on the user's machine, content never redistributed, optional "simplify to my level" companion.
