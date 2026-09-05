/fable Build Sotto tonight: an open-source, free, voice-first graded-reader language-learning app (graded-reader-style reading + audiobook narration + tap-to-translate + vocabulary + review, extended with a live AI tutor running on local models). All planning is done. Your job is to execute it as orchestrator and finish with evidence.

Read, in this order, before doing anything else:
1. ~/Claude/sotto/DECISIONS.md (supersedes the brief where they conflict)
2. ~/Claude/sotto/PLAN.md (architecture, workstreams, sequence, tonight's finish line)
3. ~/Claude/sotto/LEDGER.md (task table; keep it updated at every gate)
4. ~/Claude/sotto/design/DESIGN.md (the chosen direction, A "Paper" with B's marker stroke on saved words and C's speech fill on narration, at finished level: tokens, devices, every screen) and design/system.html (rendered key screens). These are the WS-2 spec; UI workers get DESIGN.md verbatim in their prompt.
5. ~/Claude/sotto/BRIEF.md only per section as a workstream needs it. Do not re-read research/.

Operating rules for this run:
- You are the orchestrator. You plan, dispatch, review, integrate, and verify. Subagents and /fanout workers write the code. Do not write screens yourself; direct edits only for glue and fixups.
- Route per PLAN.md: Kimi K3 via /fanout for UI components and screens, Codex/Gemini via /fanout for content drafting and tests, Sonnet subagents for anything needing full repo context (omit the model parameter or use sonnet/opus; never haiku). Every dispatch gets a seven-field task card written into LEDGER.md first.
- Pre-flight first: start the ODS stack (Docker Desktop is off by default; ~/ods/installers/macos/ods-macos.sh start), confirm whisper :9000, Kokoro :8880, and the LLM endpoint answer. Use the already-downloaded Qwen3.6-35B-A3B GGUF in ~/ods/data/models. Then scaffold.
- Repo: ~/Claude/sotto (this folder becomes the repo root; keep BRIEF/DECISIONS/PLAN/LEDGER/research/design in docs/ or a planning/ folder, your call). Public GitHub repo named sotto under Noel's account, Apache-2.0 code, CC BY-SA 4.0 content. Commit and push at every gate; stage only files this run created.
- Verify before declaring anything done: launch the flow in the Browser pane and on the iPhone 17 Pro simulator (iOS 26.5 runtime is installed), read console/logs, take screenshots. A worker's "done" is a claim until you have looked.
- Never: commit secrets, copy the reference app's strings/covers/logo, label unreviewed content stable, add auth/payments/analytics, use Expo Go for voice claims, ask me routine questions. Ask only if the central journey is blocked.
- Local-first voice: reference provider is the local cascade (Silero VAD -> whisper -> Qwen3 -> Kokoro) over WebRTC; a user may set SOTTO_API_KEY plus OpenAI base URLs to run the same cascade on OpenAI. OpenAI Realtime WebRTC provider is an interface stub only. Fake transport drives all tests.
- Product priority (Noel): reading, narration, tap-translate, and vocabulary are the front door; voice mode is the SECOND action on book detail, and the voice screen stays calm (see DESIGN.md). Do not let the tutor dominate onboarding or home.
- Content: public-domain abridgments only, per the brief's source slate. FR/ES/EN get 3 short readers each, other locales one piece each, all labeled draft until a human reviews. Every asset carries license metadata. Narration for every book is Kokoro-generated with word timings.
- Cost control: no token allowances in prompts. Cache-friendly: put stable context first in every worker prompt. If the all-models window trips, move waiting work to /fanout instead of idling.

Finish line = PLAN.md "Finish line for tonight," all nine items, evidenced in LEDGER.md. Then run the adversarial review ("what is fake, fragile, or unverified"), fix what it finds, write docs/verification.md mapping the 35 brief criteria (deferred items named honestly), update memory/project-sotto-reading-app.md, and give me: repo URL, the pnpm dev / pnpm ios commands, screenshots, and the deferred list. Text me via the session-texts alerter when you finish or if you are blocked on me.
