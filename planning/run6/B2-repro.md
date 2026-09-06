# R6-B2: simulator/desktop repro of the mic-capture path, no setting entered

ESCALATE (partial): the Home Screen install context could not be exercised at
all, and the Safari-tab context could only be exercised via a direct URL
navigation rather than the real "Talk to the tutor" tap, because this
environment has no way to tap inside the iOS Simulator. Detail in
"What could not be exercised" below. The desktop-browser-pane context is
fully exercised. A real-iPhone checklist is included to cover the untested
ground.

## Configuration used

`apps/server` health, queried directly before serving anything (VERIFIED, `curl`):

```
$ curl http://127.0.0.1:8880/health   # Kokoro TTS
{"status":"healthy"}
$ curl http://127.0.0.1:9001/health   # STT
{"status":"ok"}
$ curl http://127.0.0.1:8080/health   # LLM
{"status":"ok"}
```

All three services healthy, so per `apps/client/src/voice/availability.ts:73`
this means `availabilityFromHealth` returns `{status:'ready', path:'local'}`
and the gate should pick the **local** path outright — own-provider mode is
not reached in this configuration, exactly as B1 §3 predicted. This run's
purpose (per the orchestrator) was therefore to observe the **local**-path
capture behavior (microphone prompt + state), not own-provider mode, with no
setting present anywhere.

Built and served: `cd apps/client && pnpm web:export` (production export,
`dist/`), then `apps/server` with `SOTTO_STATIC_DIR` pointing at the export
and `SOTTO_PORT=8790`. `GET /health` from the running server confirmed:
`{"ok":true,"stt":true,"llm":true,"tts":true,"vad":"energy"}`.

**Bug found and worked around (not fixed — out of scope for this lane):**
`apps/server/src/app.ts`'s SPA-fallback `setNotFoundHandler` (~line 318-322)
serves `index.html` for every unmatched extension-less GET path. But
`apps/client/scripts/build-web.mjs` makes the *landing* marketing page own
`dist/index.html`, and moves the actual Expo app to `dist/app.html`
(`apps/client/vercel.json`'s rewrite `"/(.*)" -> "/app.html"` is what makes
the real (Vercel-hosted) free/paid origins work — root "/" hits the static
`index.html` file directly and everything else rewrites to `app.html`).
`apps/server`'s fallback does not replicate that split: it always serves the
landing page, so on a fresh load, **every route other than "/" is
unreachable** through `apps/server` + `SOTTO_STATIC_DIR` — `/onboarding`,
`/book/<id>`, `/voice/<id>`, `/settings/openai-key` all just re-render the
marketing landing page. `apps/client/scripts/serve-static.mjs` (the plain
static server, used for `pnpm serve:web`) gets this right (falls back to
`app.html`, only serves `index.html` for the literal `/`) — its own code
comment claims to mirror `apps/server`, but `apps/server` does not actually
match it. This blocks the entire one-origin self-hosting flow described in
`docs/self-hosting.md`, not just this repro.

**Workaround used for this run only** (a build artifact, not tracked
source — `apps/client/dist/` is gitignored): copied `dist/` to
`/tmp/sotto-dist-fixed` and overwrote its `index.html` with a copy of
`app.html`, then pointed `SOTTO_STATIC_DIR` at that copy instead. This
reproduces exactly what `serve-static.mjs`/Vercel already do correctly for
non-root paths, without touching repo source. No repo files were changed.

## Table

| Context | Prompt shown | State reached | Panel text (verbatim) | Storage visible |
|---|---|---|---|---|
| Safari tab, simulator (direct nav to `/voice/fr-cendrillon`, not a tap on "Talk to the tutor" — see escalation) | **Yes** — real iOS system sheet: "localhost" Would Like to Access the Microphone / Cancel / Allow | UI shows `listening` (top-left status dot + label, and under the mic button) while the system sheet is still pending — the app's own UI is optimistic and does not wait for the OS prompt to resolve | Status dot + `listening`; mic button ringed, `listening` caption underneath. No error/broken panel reached because the sheet was never dismissed (no tap capability — see below) | Not tested in this context — no Home Screen container to compare against (see escalation) |
| Home Screen install, simulator | **Not tested** — could not open the Share sheet or tap "Add to Home Screen" | — | — | — |
| Desktop browser (Browser pane / headless Chromium via `mcp__Claude_Browser__*`, `local` path) | **No** OS prompt — the pane's own sandbox blocks `getUserMedia` outright and surfaces a pane-level notice ("the page … requested microphone access, which is blocked in the Browser pane"); no permission UI is shown to click through | `error` (status dot + label) | Exact text on screen: **"Microphone unavailable. Allow microphone access for this site, then reopen the tutor."** (`voice.micUnavailable`, `voice/[bookId].tsx`'s `isBroken` panel, `session.error?.code === 'mic_unavailable'` branch), plus a **"Read alone"** button | Verified via `localStorage.setItem('r6b2-marker-do-not-use-real-key','probe')` in the page's own console context (`javascript_tool`) → read back `'probe'` in the same origin/tab. Confirms the mechanism works; cross-container (tab vs. installed-app) comparison not testable here (see escalation) |

Second-order (Settings screen, read-only, no value typed): the Profile
screen's "Use your own OpenAI key" row reads **"Off"** before the tutor was
ever opened, confirmed two ways — `get_page_text` on the desktop pane
(`profile.tsx`, byok row) returned `... Use your own OpenAI key / Off ...`,
and the same row exists on the identical Profile screen loaded in the
simulator's Safari tab (`run6-tab-settings.png`, below the fold — could not
scroll to it without tap capability, see escalation).

## Step-by-step observations and screenshots

1. `docs/screenshots/web/run6-tab-recheck.png` — Safari tab, simulator,
   landing page (`http://localhost:8790/`) loaded correctly before the
   `SOTTO_STATIC_DIR` workaround was applied (this screenshot is from the
   *unfixed* server — landing renders fine at `/`, confirming the bug above
   is specific to non-root paths).
2. `docs/screenshots/web/run6-tab-onboarding.png` — Safari tab, simulator,
   `http://localhost:8790/onboarding`, after the workaround: onboarding
   screen ("Read a story out loud", French/A1 preselected, "Start reading in
   French" button) renders correctly in real WebKit.
3. `docs/screenshots/web/run6-tab-voice.png` — Safari tab, simulator,
   `http://localhost:8790/voice/fr-cendrillon` (direct navigation, not a tap
   — see escalation): the real iOS "localhost Would Like to Access the
   Microphone" system sheet is up, with the app's own UI already showing
   `listening` behind it.
4. `docs/screenshots/web/run6-tab-settings.png` — Safari tab, simulator,
   `http://localhost:8790/profile`: Account/Languages/Tutor Preferences rows
   visible; the byok row is one scroll further down (not reachable without
   tap capability in this environment) but is confirmed "Off" via the
   desktop-pane text extraction of the same screen.
5. Desktop browser pane: drove `/onboarding` → tapped "Start reading in
   French" (landed in the reader for `fr-cendrillon`) → used
   `history.pushState`+`popstate` (client-side, since the pane could not
   click the RN-web "Voice mode" button by `ref` — its bounding box reported
   zero-size; coordinate click worked) to reach `/book/fr-cendrillon`,
   clicked "Voice mode" → reached the voice screen, watched it go
   `connecting` → `error` within ~3s, quoted panel text above. Read-console
   showed the pane's own explicit note: microphone access was requested and
   blocked by the pane's sandbox, no OS prompt shown.
6. Confirmed via `get_page_text` on `/profile` (desktop pane): "Use your own
   OpenAI key … Off" before ever visiting the tutor.

## What could not be exercised, and why

- **Tapping inside the iOS Simulator, at all.** The dedicated
  `mcp__Claude_Code_iOS_Simulator__control` tool refused every `attach` call
  with "Xcode is installed but not selected. Run `sudo xcode-select -s
  /Applications/Xcode.app/Contents/Developer`" — even though `xcode-select -p`
  on this machine already reports that exact path. The tool's own check
  disagrees with the actual `xcode-select` state and requires a `sudo`
  command this agent cannot run (no password). Fallbacks tried and ruled
  out: `idb`/`idb_companion`/`fbsimctl` are not installed (`which` found
  none); `xcrun simctl` has no tap/touch subcommand (`ui` only covers
  appearance); AppleScript/System Events against the Simulator app's window
  failed ("Can't get window 1 of process 'Simulator'" — no window
  enumerable, likely no interactive GUI session attached to this agent);
  `mcp__computer-use__request_access(["Simulator"])` came back
  `denied: user_denied` (no interactive approval available in this session).
  **Net effect: every simulator observation in this report came from
  `xcrun simctl openurl` (a direct URL load, equivalent to typing a URL, not
  a tap) plus `xcrun simctl io screenshot` (headless).** The Home Screen
  install step specifically (Share sheet → Add to Home Screen) has no
  non-tap equivalent, so it was not attempted at all.
- **The storage-container comparison** (marker set in a Safari tab, read
  back from the Home Screen icon's own container) — depends on the Home
  Screen install above, so also not tested.
- **A real OS microphone grant.** Even where a prompt did appear (Safari
  tab, step 3 above), nothing could tap "Allow"/"Cancel", so the actual
  captured-audio path past permission grant was never observed on-device.
- The desktop **browser pane** context is a real finding, not a gap: its
  `getUserMedia` block is a property of the pane's own sandbox, disclosed by
  the tool itself, and expected to behave differently from a real desktop
  browser — this table row should not be read as "desktop browsers can't
  get the mic," only "this particular pane can't."

## Real-iPhone checklist (first draft, for Noel)

Vocabulary: "own-provider mode", "the setting", "the free origin"
(readsotto.app), "the paid origin" (app.readsotto.app).

1. On your iPhone, in Safari, open the free origin (or your self-hosted
   one-origin URL over Tailscale/Caddy per `docs/self-hosting.md` — plain
   `http://<lan-ip>` will not get you a mic prompt at all, only `https://`
   or `localhost` do). Do **not** enter the setting anywhere yet.
2. Tap "Start reading", pick any book, tap "Talk to the tutor". Note: does
   iOS show the microphone permission sheet at all? What does it say
   exactly? Does it appear before or after the screen shows "listening"?
3. Whatever the mic sheet, tap Allow. Note the state and panel text the
   voice screen reaches afterward (quote it verbatim) — this run showed
   `mic_unavailable`'s panel text as a strong candidate for what an actual
   denial produces; confirm or refute that on-device.
4. Repeat step 2, but tap Cancel/Deny instead. Note the same fields — this
   is the case this run could not reach at all.
5. From the same Safari tab, use Share → Add to Home Screen. Confirm it
   installs (icon appears on the Home Screen) and that opening it shows no
   Safari chrome (address bar, tab switcher) — that's what proves it
   actually launched standalone rather than just reopening Safari.
6. From the Home Screen icon, repeat steps 2-4. Compare every field against
   the Safari-tab run: same prompt behavior? Same panel text? This is the
   core of what B1/B2 could not determine without a physical device.
7. Storage check: in the Safari tab, open any book (this records "recently
   read" locally, no typed value). Then open the Home Screen icon and check
   whether that same book shows as opened/in-progress. If it does not, the
   two contexts have separate storage containers on this iOS version — note
   which iOS version you're on, since this is version-dependent behavior.
8. Only after all of the above: go to Settings, turn on own-provider mode
   by pasting a real key (yours, entered by you — never dictate it to an
   assistant), and repeat steps 2-6 once more, since B1 found this path is
   only reachable with a stored key present.

## Cleanup

Both processes started for this run (`apps/server` on :8790,
`apps/client`'s `serve:web` on :8090) were killed
(`pkill -f "tsx watch src/index.ts"`, `pkill -f "serve-static.mjs"`) before
finishing. The simulator (`CA722C16-13E5-4579-A876-638F0C1C51C6`) is left
booted, per instructions. `/tmp/sotto-dist-fixed` is a scratch copy outside
the repo and was not cleaned up (harmless, not part of the repo).
