# Self-hosting: one origin, your own key, no accounts

## Why

Sotto's paid tier (accounts, Stripe, a hosted Realtime add-on) is parked —
see `planning/STRATEGY.md` §1 and §5. What most people actually want from
"my own AI tutor on my phone" doesn't need any of that: `apps/server` already
speaks plain OpenAI-compatible HTTP for the voice cascade (STT → LLM → TTS,
[docs/openai.md](openai.md)), and the client's `serverUrl()`
(`apps/client/src/state/contentApi.ts`) resolves to the page's own origin on
a static export (`window.__SOTTO_STATIC__`, stamped by
`apps/client/scripts/build-web.mjs`) or on any non-loopback hostname. Point
those two facts at each other — serve the static web client and the API
from the same server, same port — and the phone PWA talks to it with no
settings field, no login, and no cloud in between. This is the personal
tutor path (`planning/STRATEGY.md` CONFIRM 5), proven end to end in this
lane.

## The one-origin layout

```
apps/client   --pnpm web:export-->   dist/
                                        |
                                        v
apps/server  --SOTTO_STATIC_DIR=dist-->  serves dist/ at "/" (SPA fallback)
             --serves-->                 /content/packs, /health, /voice/*, /import/*
             --talks to-->               OpenAI (or any local cascade), via SOTTO_*_URL
```

One process, one port. The client's static export already stamps
`window.__SOTTO_STATIC__ = true` into `dist/index.html`, so every fetch
(`fetchPacks`, `fetchBook`, `fetchHealth`, and the voice WebSocket URL
returned by `POST /voice/session`) resolves to whatever origin served the
page — no `EXPO_PUBLIC_SERVER_URL` to set, and nothing to configure on the
phone beyond the URL you type once.

## Running it

```sh
cd apps/client && pnpm web:export        # -> apps/client/dist

cd apps/server
SOTTO_STATIC_DIR=$(cd ../client/dist && pwd) \
SOTTO_HOST=0.0.0.0 \
SOTTO_BASIC_AUTH=sotto:choose-a-real-password \
SOTTO_STT_URL=https://api.openai.com/v1 SOTTO_STT_MODEL=whisper-1 \
SOTTO_LLM_URL=https://api.openai.com/v1 SOTTO_LLM_MODEL=gpt-4o-mini \
SOTTO_TTS_URL=https://api.openai.com/v1 SOTTO_TTS_MODEL=tts-1 \
SOTTO_API_KEY=sk-... \
pnpm dev
```

Then open `http://<your-mac's-lan-ip>:<port>` from your phone, on the same
Wi-Fi. `SOTTO_HOST=127.0.0.1` (the default) only serves localhost; LAN
access needs `0.0.0.0` — see docs/voice-pipeline.md "Security" for what that
does and does not protect against.

## Env vars this adds

| Var                | Default     | What it does                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOTTO_STATIC_DIR` | unset       | Absolute path to a static web build (`apps/client/dist`, from `pnpm web:export`). When set, served at `/` with an SPA fallback to `index.html` for any unmatched GET path that doesn't look like a file — mirrors `apps/client/scripts/serve-static.mjs`'s rule exactly. `/content/packs`, `/health`, `/voice/*`, `/import/*` are registered routes and always take precedence, regardless of this. |
| `SOTTO_HOST`       | `127.0.0.1` | Already existed (docs/voice-pipeline.md); set to `0.0.0.0` to bind the LAN interface so a phone can reach it. Only do this on a network you trust.                                                                                                                                                                                                                                                  |
| `SOTTO_BASIC_AUTH` | unset       | `user:pass`. When set, every route except `/health` requires that exact credential over HTTP Basic (`WWW-Authenticate: Basic`, 401 without it). `/health` stays open so uptime checks and `GET /health` from docs/verification.md keep working with no credential.                                                                                                                                  |

## What `SOTTO_BASIC_AUTH` is and isn't

It's a **privacy fence**, not an auth system — the product still has none
(docs/voice-pipeline.md "Security"). A single shared credential, over plain
HTTP Basic, checked with a constant-time comparison
(`apps/server/src/security.ts`'s `isBasicAuthValid`). It stops a stray
scanner or a browser tab left open on someone else's device on the same
network from silently driving your tutor session or reading your content —
it does **not** give you multiple accounts, per-user identity, rate limits
beyond the existing per-IP ones, or protection against a determined attacker
on the same network who can sniff the browser's cached credential. Keep
`SOTTO_HOST` on `127.0.0.1` unless you need LAN/phone access, and prefer the
HTTPS setup below over exposing this past your own LAN.

The client sends it automatically once the browser has been prompted:
same-origin `fetch()` calls already work with `credentials: 'include'`
(the client's default), and a browser reuses its cached HTTP Basic
credential for a same-origin WebSocket handshake too — so after the first
page load prompts for the password, the voice session's `/voice/ws`
connection carries it with no extra code.

## iOS Safari and the microphone: HTTPS required (except on localhost)

Verified this run: the server binds the LAN interface and serves it
(`SOTTO_HOST=0.0.0.0` made it listen on both `http://127.0.0.1:8792` and
`http://192.168.1.26:8792` — confirmed via `curl` against the LAN address
from another process on the same machine, `docs/evidence/
selfhost-2026-09-05.log` §7). What could **not** be verified from this
Sonnet lane — no physical iPhone was available in this environment, so
`http://<mac-ip>:8792` was never actually loaded from a phone: iOS Safari
refuses microphone access (`getUserMedia`) on any origin that isn't
`https://` or `localhost` — a plain `http://192.168.x.x:8792` URL would load
the voice screen (reading and narration need no mic and should work) but the
mic permission prompt is expected to fail or silently deny, which blocks the
tutor's listening step specifically. That expectation follows from Safari's
documented behavior, not from a test run here — confirm on an actual iPhone
before relying on it.

The honest phone-with-mic path is one of:

- **Tailscale Serve** (`tailscale serve https / http://localhost:8792`) —
  gives you a real HTTPS URL on your tailnet with no manual certificate
  work. `tailscale` was found installed on this machine (`which tailscale`)
  but the daemon was stopped (`tailscale status` → "Tailscale is stopped");
  starting/logging in a VPN daemon is a system-level change this lane did
  not make unattended. Run `sudo tailscale up` once, then
  `tailscale serve http://localhost:8792` and open the printed `https://`
  URL on your phone (same tailnet).
- **Caddy** with a local CA (`caddy reverse-proxy --to localhost:8792` plus
  trusting Caddy's root CA on the phone) — `caddy` was not found on this
  machine (`which caddy`); `brew install caddy` first.

Either way, point the reverse proxy at `SOTTO_HOST=127.0.0.1` (not `0.0.0.0`)
once you have one, since the proxy — not the phone directly — is what needs
to reach the server.

## Cost: OpenAI per tutor turn

Measured this run (Tier 2 = OpenAI `whisper-1` STT, `gpt-4o-mini` LLM,
`tts-1` TTS, one real turn against `apps/server`'s cascade — a 3.77s learner
utterance, a 2-sentence tutor reply — full breakdown in
`docs/evidence/selfhost-2026-09-05.log` §5-6): **~$0.003 per cascade turn**
(one learner utterance + one tutor reply, STT + LLM + TTS combined). That
figure is not pulled from OpenAI's billing dashboard (no billing API was
available in this session) — it's computed from this run's actual measured
audio duration and reply length against OpenAI's published per-unit rates
(whisper-1 $0.006/min, tts-1 $0.000015/char measured directly; gpt-4o-mini's
token cost is the one estimated component, since the exact system-prompt
token count wasn't measured). `tts-1` dominates the cost here (~80% of the
turn), so a chattier tutor reply costs proportionally more; a terse
"discuss" answer costs less than the "explain a word" turn measured. A
15-minute conversation (roughly 15-30 turns) lands very roughly in the
$0.05-$0.10 range on this basis — well under `planning/STRATEGY.md` §6's
"~$1.70 per typical subscriber" estimate for the (parked) paid tier's
Realtime API, which is a different, pricier product (audio in and out both
billed as tokens, not per-character TTS).

## Deletion / privacy

Nothing about this setup phones home anywhere except the three OpenAI
endpoints you configured. There's no account, no analytics, no server-side
storage beyond the in-memory voice session registry (cleared on
disconnect/restart) and the import job registry (see
`apps/server/src/import/jobs.ts`). Reading progress, saved vocabulary, and
preferences live in the browser's IndexedDB on whatever device opened the
page — clearing that device's site data for this origin deletes all of it.
Turning the server off (or never setting `SOTTO_API_KEY`) means zero
third-party calls of any kind; see docs/local-models.md to run the same
cascade fully offline instead of against OpenAI.

## Evidence

- `docs/evidence/selfhost-2026-09-05.log` — full run log (server env used,
  measured turn latency, exit code, curl checks for the Basic-auth guard).
- `docs/screenshots/web/375-selfhost-reader.png`,
  `docs/screenshots/web/375-selfhost-voice.png` — reader (narration) and
  voice screens at 375px, served from the self-hosted origin.
- `apps/server/src/app.test.ts` ("SOTTO_STATIC_DIR", "SOTTO_BASIC_AUTH"
  describe blocks) and `apps/server/src/security.test.ts`
  ("isBasicAuthValid") — unit coverage for the static route, the SPA
  fallback, and the auth guard.
- Two Tier 2 bugs found and fixed while proving this live (both were
  silently 400ing every real-OpenAI turn before this lane): llama-server-only
  request params sent to `/chat/completions` (`apps/server/src/voice/llm.ts`,
  `llm.test.ts`) and a Kokoro-only voice name/param sent to `/audio/speech`
  (`apps/server/src/voice/tts.ts`, `tts.test.ts`). Both are now conditional
  on the configured URL's hostname.
