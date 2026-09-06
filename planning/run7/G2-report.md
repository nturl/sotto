# Lane G2 — re-run of the audible probe against the replaced Metro: report

Context: lane G's original report (`planning/run7/G-report.md`) diagnosed the
shared `:8081` Metro as bundled with `EXPO_PUBLIC_VOICE=fake` baked in at
build time, which made `audible-probe.mjs` fail 4/7 assertions (canned
fixture script instead of the real local cascade) and made `voice-live.mjs`
fail fast with the same diagnosis. This lane picks up after that Metro was
replaced by the orchestrator.

## Pre-flight (VERIFIED)

- `curl localhost:8790/health` → `{"ok":true,"stt":true,"llm":true,"tts":true,"vad":"energy"}`.
- Confirmed the new Metro's actual process environment directly (not
  inferred from behavior): `lsof -iTCP:8081 -sTCP:LISTEN` → PID 51492;
  `ps eww -p 51492 | grep EXPO_PUBLIC` → only
  `EXPO_PUBLIC_SERVER_URL=http://localhost:8790`. No
  `EXPO_PUBLIC_VOICE=fake`. Did not start or restart any server.
- Polled `http://localhost:8081/` until it returned real HTML (`<!DOCTYPE
  html>...<title>Sotto</title>`) — ready on the first poll, no wait needed.

## Directive 4 result: `audible-probe.mjs` — PASS, first attempt, no fix needed

Ran `node apps/client/e2e/audible-probe.mjs` against `:8081` unmodified
(lane G's rewrite was already correct — the only blocker was the
environment, exactly as G-report predicted). No code changes were required;
the script needed no repair.

**Exact output:**

```
[t+0.0s] Local server healthy: {"ok":true,"stt":true,"llm":true,"tts":true,"vad":"energy"}
[t+0.9s] Tapping Start
[t+2.7s] state -> listening
[t+2.7s] Sending learner turn via text fallback: "Qu'est-ce que c'est, la Provence ? Est-ce en France ?"
[t+3.3s] state -> thinking
[t+3.3s] caption: You: Qu'est-ce que c'est, la Provence ? Est-ce en France ?
[t+14.4s] state -> speaking
[t+22.0s] caption: Tutor: Oui, la Provence est une région du sud de la France.
[t+23.5s] state -> listening
[t+23.6s] caption: Tutor: Oui, la Provence est une région du sud de la France. C'est un lieu ensoleillé et charmant. As-tu déjà visité le sud de la France ?

===== Audio probe =====
  {"started":80,"totalSamples":188317}

===== Assertions =====
  [PASS] learner turn ("...Provence...") rendered in the transcript
  [PASS] a tutor reply rendered in the transcript
  [PASS] AudioBufferSourceNode.start() was called at least once
  [PASS] at least one sample was actually scheduled
  [PASS] reply mentions Provence (mechanical substring check)
  [PASS] reply ends with a question (discuss-mode follow-up)
  [PASS] no page/console errors
```

7/7 assertions pass. `started: 80` calls to `AudioBufferSourceNode.start()`,
`totalSamples: 188317` — real PCM scheduled through the Web Audio graph.

**Transcript, verbatim:**

- Learner line: `"Qu'est-ce que c'est, la Provence ? Est-ce en France ?"`
- Tutor reply (final, after both streamed captions merged): `"Oui, la
  Provence est une région du sud de la France. C'est un lieu ensoleillé et
  charmant. As-tu déjà visité le sud de la France ?"`

**Judged by reading it (not just the mechanical checks):**
- In French: yes.
- Mentions Provence/France: yes — names "la Provence" directly and "le sud
  de la France" / "le sud de la France" again in the follow-up question.
- Ends with a question: yes — "As-tu déjà visité le sud de la France ?"

This is the real local cascade (STT → local LLM → local TTS →
`AudioAdapter.playPcm`), not the `FakeVoiceProvider` fixture script — the
reply text does not match `packages/voice/fixtures/discuss.json`'s canned
lines from G-report's earlier fake-provider run, and the ~19s
thinking-to-speaking latency (t+3.3s → t+22.0s) is consistent with a real
local LLM+TTS turn, not a scripted fixture.

## Directive: `voice-live.mjs` — ran once, PASS

`node apps/client/e2e/voice-live.mjs` (unmodified — this is F1's
`816c00e` version testing the explain/save word flow on
`es-fabulas-samaniego`, not the Provence exchange) ran both phases (A:
explain, B: save-to-vocabulary) to completion against the same Metro.

6/6 assertions passed:
- Phase A: learner caption contains "cigarra"; tutor caption present; state
  cycled listening → thinking → speaking.
- Phase B: learner caption contains "cigarra" (save request heard); word
  "cigarra" persisted to the vocabulary store; no page/console errors in
  either phase.

Exit code 0. Screenshots written to
`apps/client/docs/screenshots/web/voice-live-A-explain-final.png` and
`...-B-save-final.png` (the script's own hardcoded output location).

## Attempts used

1 of 3 (probe passed outright; no diagnosis, no fix, no rerun needed).

## Code changes

None. No defect found in `apps/client/app/voice/**`,
`apps/client/src/voice/**`, or `packages/voice/src/**` — the only prior
blocker (the stale Metro's baked-in `EXPO_PUBLIC_VOICE=fake`) was an
environment issue outside any of those files, already correctly diagnosed
by lane G, and resolved by the orchestrator replacing that Metro before
this lane ran. No commits made, nothing to push.

## Screenshots

`~/Claude/sotto-run7-recon/G2/screens/` (copied from the probe's actual
output directory, `~/Claude/sotto-run7-recon/G/screens/`, which is
hardcoded in `audible-probe.mjs` relative to `__dirname` and was not
changed):
- `state-00-pre-start.png`
- `state-01-post-start.png`
- `state-02-listening.png`
- `state-03-sent-turn.png`
- `state-04-thinking.png`
- `state-05-speaking.png`
- `state-06-listening.png`
- `state-99-final.png`
- `control-cluster-speaker-button.png`, `control-cluster-speaker-muted.png`
  (pre-existing from lane G's earlier run, also in that directory)

`voice-live.mjs`'s own screenshots (its hardcoded location, not this
lane's recon dir): `apps/client/docs/screenshots/web/
voice-live-A-explain-final.png`, `voice-live-B-save-final.png`.

## What is NOT verified

Nothing outstanding for this lane's two directives — both scripts ran
clean against the replaced Metro with real audio and real transcript
content. G-report's other escalations (server-side `bookTitle`,
automatic-opening-turn on local/cloud/browser paths, `self-hosted-voice.mjs`
timeout on `127.0.0.1:8792`) are unrelated to this lane's task and were not
re-investigated.

## Stop

No commits (nothing needed fixing). This report written. Stopping.
