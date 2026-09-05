# Adversarial review — Sotto, 2026-09-04

Reviewer: independent pass over `docs/verification.md`'s 35-criteria table,
`planning/CONTRACTS.md`, `planning/design/DESIGN.md`, the code, and the
shipped screenshots. Read-only: nothing was fixed. Claims below are marked
VERIFIED (file read and traced, or image opened) or INFERRED (pattern match).

Context: `docs/verification.md` is more honest than most build reports — it
names deferrals upfront and reports a live bug against itself. The problems
are concentrated in **evidence that does not show what the row says it
shows**, and in a handful of controls that are wired but non-functional.

Note: `planning/LEDGER.md` shows F-2 as "running (Opus reviewer + Sonnet
fixer)". Test counts already drifted under me (`pnpm test` now reports
**159 tests / 26 files**, not the 147/25 in `docs/verification.md:114`), so
some of this may be mid-repair.

---

## 1. Top 10 findings

### 1. BLOCKER — every `*-home.png` screenshot shows the onboarding screen, not home
`docs/screenshots/web/{375,393,430,768,1024,1440}-home.png`

Claimed: `docs/verification.md:27` (criterion 1) cites `-home.png` as proof
"a configured install launches into the localized home screen".
`docs/verification.md:41` (criterion 15, **PASS**) says
`375-home.png` shows "the `SessionBar` docked above the tab bar with the real
cover, title, and mode label ('Tres fábulas de Samaniego — Discuter'),
non-overlapping."

True (VERIFIED, images opened + md5): all six files render the onboarding
"Langue de l'app" language picker. Four of the six are **byte-identical** to
their `-onboarding-languages.png` twin:

```
f7229832573a55c2072b21e6600847a2  375-home.png  375-onboarding-languages.png
9bef47e944158325a477af43b4591e8c  430-home.png  430-onboarding-languages.png
de6cd96850ff8c3e4dce9cb8653361f0  768-home.png  768-onboarding-languages.png
981da4004b8658d9e46d911dc4c12fb0 1440-home.png 1440-onboarding-languages.png
```

There is **no screenshot of the home screen, the daily-story card, the rails,
the tab bar, or the SessionBar anywhere in the repo.** The quoted mode label
"Tres fábulas de Samaniego — Discuter" appears in no image on disk. Criterion
15's PASS rests entirely on a description of an image that does not exist.

Cause (VERIFIED): `apps/client/e2e/screenshots.mjs:114-124` does
`page.goto(BASE_URL)` → the app redirects to `/onboarding/languages` → `seed()`
→ `page.reload()`. `reload()` reloads the **current** URL, which is now
`/onboarding/languages`, and `apps/client/app/onboarding/languages.tsx` has no
`onboarded` guard, so it re-renders the wizard. Every later screen used an
explicit `page.goto(...)` and is fine.

Smallest fix: `screenshots.mjs:120` → `await page.goto(BASE_URL, {waitUntil:'networkidle'})`
instead of `page.reload()`; re-run; then rewrite rows 1/15/19 against what the
new images actually show.

Secondary, and independently real: `apps/client/app/onboarding/languages.tsx`
renders for an already-onboarded user who lands on that route.

### 2. BLOCKER — tapping a tutor-mode chip never changes the UI
`apps/client/src/voice/sessionManager.ts:123-125`

```ts
export function setMode(mode: TutorMode): void {
  active?.provider.setMode(mode);
}
```

`useVoiceSession` derives the displayed mode as
`sessionRecord?.mode ?? modeParam ?? preferences.defaultTutorMode`
(`apps/client/src/voice/useVoiceSession.ts:46`), and `sessionRecord.mode` is
written **once** at `startSession` (`sessionManager.ts:92-99`). Nothing patches
it on a user-initiated mode change — `patchSessionRecord({mode})` exists only
in `apps/client/src/voice/toolContext.ts:140`, i.e. only when the *tutor*
switches mode via `set_session_mode`. `createVoiceController`
(`apps/client/src/voice/controller.ts:24-52`) has no `mode` event case.

So: the selected chip highlight and the `SessionBar` mode label stay pinned to
the mode the session started in, forever. Criterion 6 is "Mode switching
updates both the tutor behavior **and the UI**";
`docs/verification.md:32` reports this as PARTIAL because "live
mode-switching not exercised" — it is not un-exercised, it is broken, and
reading the code shows it.

Smallest fix: `sessionManager.setMode` → also
`useSottoStore.getState().patchSessionRecord({ mode })`.

### 3. BLOCKER (on publish) — `planning/` is tracked and would ship with the public repo
`git ls-files planning` → 15 files

`planning/research/` is correctly gitignored (`.gitignore:28`), but the rest is
committed. It contains, VERIFIED: the competitor product named with its price
and Noel's personal trial dates (`planning/DECISIONS.md:4`); repeated
instructions to "**Steal** B's highlighter sweep" / "Steal C's speech fill"
from that paid competitor (`planning/DECISIONS.md:35`,
`planning/design/DIRECTIONS-SPEC.md:19,39,59`, `planning/design/directions.html:616-797`);
Noel's private model-routing/orchestration workflow including which subagent
was blocked by a content filter and that a `gh repo create --public` was
refused twice (`planning/LEDGER.md:76,82-83`, `planning/KICKOFF-PROMPT.md`);
and `~/Claude`, `~/ods`, `~/Downloads/<screen recording>.mp4` paths.

Currently latent: `gh repo view nturl/sotto` returns `isPrivate: true`
(VERIFIED). This becomes live the moment visibility is flipped, and the
history already contains it.

Smallest fix: untrack `planning/` (gitignore the directory) **before** the
public flip; a history rewrite is required since it is already pushed. Also
scrub the `~/Claude` / `~/ods` paths that leaked into shipped docs
(`docs/contracts.md:3,143`, `apps/client/assets/build_icon.py:4`).

### 4. BLOCKER — the voice server has no authentication, reflects any CORS origin, and binds 0.0.0.0
`apps/server/src/index.ts:38`, `:116-137`, `:139-240`; `apps/server/src/config.ts:12`

`await app.register(cors, { origin: true })` reflects any `Origin`
(live-confirmed: `curl -H "Origin: http://evil.example" http://127.0.0.1:8790/health`
returns `access-control-allow-origin: http://evil.example`). `POST /voice/session`
and the `/voice/ws` upgrade have no key check, no origin allowlist, no rate
limit (`@fastify/rate-limit` is not a dependency), and no cap on concurrent
sessions (`activeSessions`, `index.ts:36`). `SOTTO_HOST` defaults to `0.0.0.0`.
The server holds `SOTTO_API_KEY` and forwards it as a Bearer token to
STT/LLM/TTS (`index.ts:56`, `:172-186`).

Net: any web page open in the operator's browser, and any device on the LAN,
can open a tutor session and drive the local LLM — or burn a real provider key
if the cascade is pointed at one. `docs/verification.md:52` (criterion 26,
PASS) checks only that no key is *committed*; criterion 19's "no leaked
credentials" likewise only covers the repo, not the runtime.

Smallest fix: origin allowlist from config + a shared-secret header on
`/voice/session` and the WS upgrade; default `SOTTO_HOST` to `127.0.0.1`.

### 5. SERIOUS — the headline "Found, not fixed" finding blames a file that is dead code
`docs/verification.md:69` vs `packages/core/src/prompt.ts:74-95`

The report's root cause: "`packages/core/src/prompt.ts`'s
`buildSystemInstruction` renders the passage to the LLM as
`TutorPassageSentence { id, text }` … it never includes per-word `tokenIds`".

VERIFIED: (a) the function is named `buildTutorInstruction`, not
`buildSystemInstruction`; (b) it is **used by nothing but its own test** —
`grep buildTutorInstruction` hits only `packages/core/src/prompt.ts` and
`packages/core/src/prompt.test.ts`; (c) the live path is
`apps/server/src/voice/prompt.ts:68-113`, which **does** render the word→tokenId
map (`renderSentence`, `cigarra=t6`) and instructs the model to use it
(`prompt.ts:90-93`).

So the diagnosis in the report is wrong, and `packages/core/src/prompt.ts` is
dead code exported from `@sotto/core` (`packages/core/src/index.ts:14`)
that a contributor will reasonably assume is the tutor prompt.

Residual real risk (VERIFIED): `save_vocabulary`'s `word` field is
`required: ['tokenId']` only (`packages/core/src/tools.ts:138`) despite the
description saying "Always pass word too"; and `set_reading_position` has no
word hint at all, so the wrong-target class of bug is unmitigated there.

Smallest fix: delete `packages/core/src/prompt.ts` (+ its test), and rewrite
finding 5 against `apps/server/src/voice/prompt.ts` after re-running the e2e.

### 6. SERIOUS — the live-voice evidence cited by four rows does not exist on disk
`docs/verification.md:34` (row 8, PASS), `:35` (row 9), `:33` (row 7), `:48` (row 22)

Row 8's PASS is "Full timeline printed by `apps/client/e2e/voice-live.mjs`
(see the task 4 run log)". VERIFIED: there is no run log in the repo —
`git ls-files docs` lists nine `.md` files and the screenshots; no `*.log`, no
transcript, no captured stdout anywhere. Row 7's barge-in evidence is
"LEDGER 2026-09-04 18:05", which is a prose sentence in the ledger, not an
artifact. A contributor cannot check any of it.

Compounding: `apps/client/e2e/voice-live.mjs:337-345` asserts
`phase B: saved word "cigarra" in vocabulary store`, and
`docs/verification.md:69` states the store ended up with **"verano"** in 2/2
live runs — meaning the script exited **1**. Yet `docs/verification.md:46`
(criterion 20, PASS) offers that same script as the satisfied "one live e2e".

Smallest fix: commit the actual stdout of both e2e scripts to
`docs/e2e-runs/` and link them; downgrade row 20's live-e2e half until the
run is green.

### 7. SERIOUS — push-to-talk is unreachable; the report implies the control works
`apps/client/app/voice/[bookId].tsx:219-241`, `apps/client/src/state/createStore.ts:42`

The PTT ring is only interactive when `preferences.turnDetection === 'push'`;
otherwise it renders as a disabled ink-3 ring plus a "pttDisabled" caption.
The default is `'auto'` (`createStore.ts:42`), and grep across
`apps/client` finds **no UI that ever sets `turnDetection`** — `profile.tsx`'s
tutor group is narration-speed and captions, both stubs (see finding 8). So
push-to-talk cannot be reached in the shipped app.

`docs/verification.md:33` (criterion 7, PARTIAL) says PTT "was not exercised
this pass (UI controls exist and are visible in every voice screenshot: mute
icon, **PTT ring**)". What is visible is the permanently-disabled state.

Smallest fix: add a turn-detection row to the tutor settings group, or default
the ring to enabled.

### 8. SERIOUS — settings rows display values for preferences that do not exist
`apps/client/app/profile.tsx:79`, `:158-166`, `:180-188`

`const soon = () => setToast(t('settings.comingSoon'))` backs five rows:
Narration speed, Captions, Privacy, Terms, Feedback. The first two are worse
than dead — they render a **value**: `settings.speed.normal` ("Normal") and
`settings.captions.on` ("On"), hardcoded, ignoring
`preferences.narrationSpeed` (which the reader *does* change,
`reader/[bookId].tsx:499-510`) and `preferences.captionsEnabled`. The screen
therefore asserts a setting state that is not read from state and cannot be
changed.

`docs/verification.md:44` (row 18, PARTIAL) mentions only that
`settings/licenses.tsx` "wasn't opened" and that destructive-action
confirmation wasn't exercised (it exists and looks correct,
`profile.tsx:191-215`). It does not disclose that three of the four "About"
destinations and both tutor preferences are toasts. Criterion 18 requires
"legal/feedback destinations open".

Smallest fix: bind the two value rows to real preferences (or drop the values),
and point Privacy/Terms/Feedback at real in-app pages.

### 9. SERIOUS — the shipped "live voice" screenshot shows duplicated captions and an unreadable passage
`docs/screenshots/web/voice-live-B-save-final.png`; `apps/client/src/state/createStore.ts:257-262`

VERIFIED by opening the image. The captions strip reads:

```
Tutor: La palabra "cigarra" está guardada.
Tutor: ¿Quieres que te explique algo más sobre la historia?
Tutor: La palabra "cigarra" está guardada. ¿Quieres que te explique algo más sobre la historia?
```

The two sentence-chunked partials **and** the concatenated final are all
retained: `pushCaption` appends unconditionally and never supersedes a
non-final entry with the `final: true` one. `docs/verification.md:34`
(criterion 8) is **PASS** for "Live captions … accurately track Realtime
events"; its own strongest artifact contradicts it.

Same image, second defect: the whole passage renders in `colors.quiet`
(#B5AB9F on #F4ECDF, ≈1.9:1 — far below WCAG AA). `SpeechFillText` paints
every token quiet when `currentIndex === -1`
(`apps/client/src/ui/SpeechFillText.tsx:89`), which is the permanent state in
`discuss` mode, where nothing is ever "read". `375-voice-speaking.png` shows
the same thing while the state label says `parle`. The reader does the
opposite (`reader/[bookId].tsx:550`: `narratingIndex < 0 ? true : …`), so the
two screens disagree.

Third, same images: the push-to-talk ring is clipped off the bottom of the
viewport at 375 and 430, and its caption is not visible. Criterion 19 ("no
clipped text") and 28 are both PASS.

Smallest fix: in `pushCaption`, replace the trailing non-final entry from the
same speaker when `final` arrives; default `currentIndex` handling to ink when
no reading event has been received.

### 10. SERIOUS — the in-app licences screen fabricates a uniform licence for every book
`apps/client/app/settings/licenses.tsx:46-53`

```tsx
{[...library.books, library.daily].map((book, index, all) => (
  <LicenseRow label={`${book.title} — ${book.author}`} value="CC BY-SA 4.0" ... />
))}
```

The literal string is hardcoded per book. Nothing reads the real
`attribution.json` (which carries `sourceEdition`, `sourceUrl`,
`sourceJurisdiction`, `license.spdx`, `adaptationEditor`), so the one surface
a user sees provenance on shows none of it — and `library.daily` is already in
`library.books`, so one book is listed twice. `library.books` is also only the
*current learning locale's* pack, so most bundled books are absent.

Criterion 27 requires per-book "source/edition/license provenance";
`docs/verification.md:53` marks provenance PASS on the strength of the data
files, without noting the screen ignores them.

Smallest fix: render from each book's `attribution.json` (it is already served
under `/content/packs/…`); dedupe `daily`.

---

## 2. Every other finding, one line each

**Fakes / dead controls**
- `apps/client/app/onboarding/languages.tsx:94` — voice-sample speaker button is `onPress={() => undefined}`, an outright dead control; criterion 19 ("no dead primary controls") is PASS.
- `apps/client/src/ui/SessionBar.tsx:70` — mute button is `onPress={() => setMuted(true)}`: one-way, no unmute, no visual state.
- `apps/client/app/reader/[bookId].tsx:288` — "Signaler" opens `mailto:feedback@sotto.app`, a domain that does not resolve to a Sotto inbox; reports go nowhere.
- `packages/core/src/prompt.ts` — dead code exported from `@sotto/core`; `packages/core/src/tools.ts:225-232` claims "this is what the tutor prompt renders", which is false for that file.
- `apps/client/src/ui/PlaceholderScreen.tsx` — WS-0 scaffold placeholder still in `src/ui/`; verify no route reaches it before publish.
- `apps/client/src/ui/dev/fixtures.ts` is still imported by `apps/client/src/ui/data.ts:19` for the `BookCategory`/`BookLevel` types and the 3-value category taxonomy; real pack categories are squashed onto it (`data.ts:76-85`), so the library chips are a fixture taxonomy, not the content's own.
- `apps/client/src/ui/data.ts:71-75` — `hashCover()` assigns cover art by hashing the book id; a fallback behind `svgUrl`, but it means a book with a missing `cover.svg` silently gets an unrelated illustration rather than an error.

**Design-spec drift (`planning/design/DESIGN.md`)**
- Device B: the reader draws the marker stroke as a plain skewed `View` (`reader/[bookId].tsx:710-718`) — no rough ends, no 240ms left-to-right draw, no right-to-left erase. The real `MarkerStroke` component is used **only** in `app/(tabs)/vocabulary.tsx:58`, i.e. the device is correct everywhere except the one screen DESIGN says must always carry it.
- Device C: reader narration reimplemented speech fill as an instant colour swap (`reader/[bookId].tsx:601`), no stagger, no animation; `SpeechFillText` was used only on the voice screen. *(This one changed under me mid-review — the reader now imports `SpeechFillText`; re-check rather than re-fixing.)*
- `SpeechFillText.tsx:53` uses `motion.speechFillStaggerMs` as each word's *duration*, not as a per-word stagger — all words animate simultaneously.
- Completion view's "hand-drawn arrow (single 1.5px ink SVG path with slight wobble)" is the text character `↓` (`reader/[bookId].tsx:645-647`).
- Desktop onboarding renders **inside** the tabs sidebar shell — `1024-home.png` / `1440-home.png` show "Pour toi / Bibliothèque / Vocabulaire" nav next to the onboarding wizard.
- Expo's dev-tools lightning badge is baked into several committed screenshots (bottom-left of `393-home.png`, `1024-home.png`, `1440-home.png`) — a debug artifact, under criterion 19's PASS for "no debug artifacts".
- `apps/client/src/ui/Cover.tsx:37-110` hardcodes ~40 hex literals including `#F4ECDF` (the `canvas` token) — sanctioned as cover colourways, but the canvas duplicate should be the token.

**Fragility**
- `reader/[bookId].tsx:549` — `flatTokens.indexOf(token)` runs per token per render; with narration updating `positionMs` every ~60ms this is O(n²) per frame (a 2 000-token chapter ≈ 4M comparisons per tick). Pass an index instead.
- `reader/[bookId].tsx:159-170` — completion fires on `percentComplete >= 0.999` from the **scroll** fraction, so scrolling to the bottom of the last chapter marks the book complete without reading it.
- `useVoiceSession.ts:104` — the connect effect's deps are `[bookId, chapterId, !!chapter]` with `exhaustive-deps` disabled; the session is started with whatever `passage`/`savedWords` existed at that moment and never re-syncs.
- `apps/server/src/voice/types.ts:31-44` — `passageContextSchema` has no `.max()` on any string or array, and no explicit Fastify `bodyLimit` is set; ~900 KB of client-supplied text goes straight into the LLM system prompt (`apps/server/src/voice/prompt.ts:100-111`).
- `apps/client/src/platform/importExport.web.ts:17-34` — if the user cancels the file dialog, `onchange` never fires and the returned promise never settles.
- `apps/client/app/profile.tsx:99` and `:126` — `catch { setToast(...) }` swallows the underlying export/import error entirely; nothing is logged.
- `apps/client/app/profile.tsx:119-124` — import calls `replaceUserData`, which drops the `sessions` array that `buildExport` writes (`profile.tsx:95`); the round trip is asymmetric.
- `apps/server/src/index.ts:29-34` — a process-wide `unhandledRejection` handler that logs and continues; pragmatic for barge-in aborts, but it will also silently swallow genuine bugs.
- `apps/client/e2e/screenshots.mjs:219-224` — collects `issues` (missing save button, state label never seen) and prints them, but always exits 0; nothing fails the screenshot run.
- `apps/client/e2e/voice-live.mjs:66-79` — the "learner" is Kokoro TTS (`ef_dora`), i.e. clean synthetic speech from the same family the tutor uses; recognition of it is a weak proxy for criterion 22's "verify recognition".
- `apps/server/src/config.ts:4-5` — `SOTTO_STT_URL` defaults to `:9001` (whisper.cpp) while `SOTTO_STT_MODEL` defaults to `Systran/faster-whisper-base` (the speaches model id); the two defaults are from different backends.

**Content / licensing**
- `packs/zh-TW/books/zh-chengyu-stories-hant/book.json:5` — the Traditional-Chinese book's own title is `三个成語故事`: simplified `个` next to converted `成語`. `chapters/02.json` and `03.json` retain simplified `别人`. The zh-Hant edition is a hand-listed 48-entry `hantOverrides` map applied by exact token match (`packages/content/src/build.ts:248-303`); anything not listed ships unconverted, and `validate.ts` has no script-consistency rule, so this passes `content:validate` clean. Criteria 23 and 25 do not cover it.
- `packages/core/src/languages.ts:302-304,321-323` — zh-CN and zh-TW share the Kokoro voice `zf_xiaoxiao`/lang `z`; the Traditional edition has no Taiwan-Mandarin voice.
- `packs/{en-US,es-419,fr-FR}/books/*/attribution.json:7` — nine books reuse one Gutenberg **bookshelf** URL per locale (`/ebooks/bookshelf/20`, `/420`, `/392`) rather than the specific title's page; passes validation because the validator only checks the field is non-empty (INFERRED as templated rather than researched).
- `docs/attribution.md:5,39` says "14 books"; there are 15 `book.json` files (the zh-TW edition is missed). `docs/verification.md:53` says 15.
- `docs/supported-languages.md:44-53` labels seven content locales "stable" in the same table as their narration claims, with no inline note that every book under them is `reviewStatus: draft`.
- `packs/es-419/books/es-lazarillo/book.json:12` claims `level: A1` for text that is dense mixed preterite/imperfect with several irregulars (INFERRED CEFR judgment); `level` is not validated at all.
- `packages/content/src/narrate.ts:296-304` prints matched-vs-interpolated word counts to console but never persists them, so a chapter whose timings are mostly evenly-spaced guesses is indistinguishable in the shipped pack from one that was genuinely aligned.
- Validator gaps that matter: no check that a licence/`sourceUrl` is real or specific, no Han-script consistency, no pinyin correctness (presence only), no timing monotonicity, no cross-book `sourceUrl` uniqueness, no check that `reviewedBy` names a real person.

**Repo truthfulness / hygiene**
- `apps/client/package.json` `"ios": "expo run:ios --device \"iPhone 17 Pro\""` — README.md:21 tells everyone to run `pnpm ios`; on any fork without that exact simulator it fails.
- `.env.example:5` ships `SOTTO_STT_URL=http://127.0.0.1:9000/v1` while `config.ts:4`, README.md:54, `docs/local-models.md:8` and `docs/contracts.md:143` all use 9001; copying `.env.example` breaks `/health.stt`.
- No `license` field in the root or any of the five workspace `package.json` files, despite README.md:106 and NOTICE:4 both declaring Apache-2.0.
- `playwright` is a root devDependency but `pnpm e2e:screenshots` / `e2e:voice` also need `playwright install chromium`; the README does not say so (INFERRED from the script's `chromium.launch()`).
- `docs/verification.md:114` reports 147 tests / 25 files; `pnpm test` currently reports 159 / 26 — the report's numbers are already stale.
- `docs/verification.md:30` (criterion 4) cites a no-results state that was "manually checked … not saved to disk, described here" — an assertion, not evidence.
- The `-10`/`+10` seek controls (`reader/[bookId].tsx:467`, `:483`) and the speed toggle (`:499`) are bare `Pressable`s with no `accessibilityRole`/`accessibilityLabel`.
- `.github/workflows/ci.yml` checks out clean: `permissions: contents: read`, no secrets, pnpm 11 matching `packageManager`, Node 26 matching `.nvmrc`, no `continue-on-error`/`|| true`. `runs-on: macos-latest` looks unnecessary for `pnpm check` (INFERRED).

---

## 3. Rows in `docs/verification.md` whose status I would change

| # | Now | Change to | Why |
|---|---|---|---|
| 1 | PARTIAL | **FAIL (web half)** | The cited `-home.png` files show onboarding; there is no evidence a configured install reaches home on web. |
| 2 | PASS | PARTIAL | Catalog parity is proven by the validator; "3 tabs navigate, distinct active states" has no screenshot on disk (there is no image of the tab bar). |
| 6 | PARTIAL | **FAIL (UI half)** | Mode switching cannot update the UI — `sessionManager.setMode` never patches `sessionRecord.mode` (finding 2). |
| 7 | PARTIAL | PARTIAL, restated | PTT is not "not exercised" — it is unreachable at the default `turnDetection: 'auto'` with no UI to change it. Barge-in evidence is a ledger sentence, not an artifact. |
| 8 | PASS | PARTIAL | The cited timeline log is not in the repo, and the one committed live screenshot shows triplicated captions. |
| 9 | PARTIAL | PARTIAL, re-diagnosed | Root cause named in finding 5 is a dead file; the live prompt does carry the word map. Re-test before restating. |
| 13 | PASS | PASS (keep) | Real mp3s + real whisper-derived timings verified; leave it. |
| 15 | PASS | **NOT VERIFIED** | No image on disk shows the SessionBar; the quoted mode label appears nowhere. |
| 18 | PARTIAL | PARTIAL, expanded | Must disclose that Privacy/Terms/Feedback are "coming soon" toasts and that the two tutor rows display hardcoded values. |
| 19 | PASS | **FAIL** | Dead control (onboarding voice sample), one-way mute, Expo dev badge visible in committed screenshots, PTT ring clipped at 375/430. |
| 20 | PASS | PARTIAL | Unit tests and lint are genuinely green, but the "one live e2e" script's own assertion for the saved word did not pass at report time. |
| 23 | NOT VERIFIED | **FAIL** | Not merely unexercised: the shipped zh-TW pack contains simplified characters in its title and body. |
| 25 | PASS | PARTIAL | The fixture matrix is real, but the validator cannot detect the mixed-script defect in row 23 or implausible provenance — worth saying in the row. |
| 26 | PASS | PARTIAL | `.env.example`'s STT port does not match the documented default; `pnpm ios` is pinned to one simulator. CI itself is clean. |
| 27 | DEFERRED | DEFERRED, with a caveat | Data-level provenance is real, but the in-app licences screen hardcodes one licence per book and lists the daily book twice. |
| 28 | PARTIAL | PARTIAL, expanded | Clipping *was* found once the images are read closely (PTT ring at 375/430), plus a ≈1.9:1 contrast passage on the voice screen. |
| 35 | PARTIAL | PARTIAL, expanded | Import drops the `sessions` array that export writes; web import never settles if the file dialog is cancelled. |

Summary line as it stands (13 PASS / 14 PARTIAL / 4 DEFERRED / 4 NOT VERIFIED
/ 0 FAIL) should become roughly **6 PASS / 19 PARTIAL / 4 DEFERRED / 3 NOT
VERIFIED / 3 FAIL**. A zero-FAIL table on a five-hour build is itself a signal
worth distrusting.

---

## 4. Three things that are genuinely solid — do not touch

1. **The narration alignment pipeline is real, not synthesized.**
   `packages/content/src/align.ts` + `src/narrate.ts`: Kokoro synthesizes each
   sentence, the same audio round-trips through whisper `verbose_json`, and
   `alignWordsLcs()` does genuine LCS matching, with `interpolateTimings()`
   only splitting the unmatched leftovers between real neighbours. Spot-checked
   token deltas in `packs/es-419/.../chapters/01.json` track syllable count
   ("Durante" 470ms, "el" 120ms, "verano" 630ms) — not a flat cadence. The
   documented limitation (Kokoro returns empty timestamps for non-English
   voices) is real and correctly worked around.

2. **Server logging and audio hygiene hold up.** Every `app.log.*` call site in
   `apps/server/src` was read: `session.ts:356` logs `captionLength`, not the
   transcript; `:446`/`:490` log latencies; `:332` logs `{callId, ok}`;
   `config.ts:20` logs Zod *field* names, not values. No call site logs the API
   key, prompt text, transcript, or audio. Criterion 14's "no raw microphone
   audio stored" is genuinely true — inbound PCM lives only in in-memory arrays.

3. **The tool layer is properly built.** `packages/core/src/tools.ts` parses
   every call with zod before touching state, returns `{ok:false,error}` rather
   than throwing, guards the executor with try/catch, and
   `apps/server/src/voice/session.ts` waits for the client's `tool_result`
   before telling the model anything succeeded. `apps/client/src/voice/toolContext.ts`
   drives the *same* `buildSavedWord` + store action the reader's tap-to-save
   uses, so touch and voice genuinely cannot diverge in state shape — and
   `resolveWordToken` (`toolContext.ts:64-86`) refuses rather than silently
   saving a mismatched word. Book detail also correctly puts "Lire" first as a
   primary cutout CTA with "Mode vocal" secondary (`app/book/[bookId].tsx:72-81`),
   per DESIGN's deliberate ordering.
