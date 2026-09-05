# readsotto.app landing page (Cleo spec, 2026-09-05)

One static explainer at the apex. One CTA into the app. Dark-only. No analytics.
Skeleton at real structural fidelity: `planning/design/landing-skeleton.html`.
Shipped source: `apps/client/web/landing/index.html` (built into `dist/index.html`).

## Fit read

Job: be persuaded in ten seconds and start reading, then compare four ways to run it.
Read on a phone from a shared link, opened once or twice, lives for years. So: quiet
beats spectacular, and the page must not tire. Entry is always from the top.

**Register: Manifesto.** Centered column, 36rem reading measure, sentence-by-sentence
pacing. Rotation check: last three ledger rows are broadsheet, poster, catalog, so
manifesto is fresh (last used 2026-09-02). Not monument: no hairline stat row, no
tracked-mono-against-giant-type hero.

**Organizing metaphor: the page is a Sotto passage.** A reading app's landing page is
itself a short graded text you read in 30 seconds. Glossed words carry the reader's
dotted peach underline; their glosses are the explainer. Encode, do not decorate.

## Anchor, flood, device

- **Anchor:** Shade (editorial paper cutouts) moved onto a night desk, with ElevenLabs'
  whisper-weight display discipline. Changed: canvas is the app's own dark palette
  ("Paper at night", `packages/core/src/theme.ts` `darkColors`), not white; display is
  Fraunces 300, not Inter Display; the cutout shadow is the app's dark peach, not grey.
- **Flood:** warm charcoal. Every value comes from `darkColors`. No invented colors.
  canvas `#1B1815` · surface `#232019` · surface-2 `#2C2820` · ink `#F1EAE0` ·
  ink-2 `#B8AFA3` · ink-3 `#8A8176` · hairline `rgba(241,234,224,0.12)` ·
  accent `#E4572E` (ONE job: the CTA fill, exactly one appearance on the page) ·
  peach `#6B3F30` (cutout shadow, word-selection fill) · quiet start state uses ink-3.
- **Device (the one):** linked gloss focus. Glossed words in the passage are the
  reader's word tokens (1px dotted underline in peach at 35 percent). Hover or tap a
  word and its gloss row below gets `surface-2` and the word gets an 18 percent peach
  fill; hover a gloss and the word lights. Everything is visible with no interaction
  and with JavaScript off; the interaction is emphasis only.
- **Motion budget:** one moment. Speech fill on the hero passage, once, on load: words
  start at ink-3 (still 4.5:1, readable) and step to ink with a 40ms stagger, total
  under 1.8s. Hover transitions 120ms ease. `prefers-reduced-motion` renders the final
  frame. No scroll reveals, no loops.
- **Elevation:** the cutout only. CTA `box-shadow: 4px 4px 0 0 #6B3F30`; pressed
  `translate(2px,2px)` with the shadow at 2px, 120ms. Everything else is hairlines.

## Type cast

| role | face | size / lh / tracking | weight |
|---|---|---|---|
| display (the one headline) | Fraunces | `clamp(2.25rem, 1.6rem + 3.2vw, 4rem)` / 1.05 / -0.02em | 300 |
| passage | Fraunces | `clamp(1.375rem, 1.15rem + 1vw, 1.75rem)` / 1.45 / -0.005em | 300 |
| gloss word | Fraunces | 1.375rem / 1.2 | 400 |
| reading (glosses, table, steps) | Inter | 1rem / 1.55 | 400, 500 for the CTA |
| caption | Inter | 0.8125rem / 1.5 | 400 |
| metadata (eyebrow, column heads, level tag) | system mono | 0.6875rem / 1 / 0.08em uppercase | 400 |

Fraunces 300 and 400 and Inter 400 and 500 are served from the same origin under
`/fonts/` (copied at build from `@expo-google-fonts`). Fallbacks: Iowan Old Style,
Georgia, serif; -apple-system, Inter, sans-serif. `font-display: swap`. No bold
Fraunces anywhere. Tabular numerals on the price.

## Spacing and grid

- One centered column: passage and glosses at `max-width: 36rem`; the four-ways table
  and the phone steps at `max-width: 44rem`. Gutters 20px at 375, 48px at 1440.
- Section rhythm: 64px at 375, 112px at 1440. Inside a section: 24 / 32.
- Radius vocabulary {2, 10}: 2 on the word-selection fill, 10 on the CTA. Nothing else
  is rounded. No pills.
- Rows, never cards: the four ways and the phone steps are hairline-separated rows in
  a three-column grid at 44rem and stacked at 375 (labels become mono eyebrows).
- Tap targets 44px minimum. The CTA is 56px tall at 375, full column width.

## Sections, top to bottom

1. **Masthead.** Wordmark "Sotto" in Fraunces 300 at 1.5rem, right side mono
   "FREE · OPEN SOURCE · NO ACCOUNT". Hairline below.
2. **Hero.** Mono eyebrow with the level and the read time. One display sentence.
   Then the passage: five sentences about what Sotto is, six glossed words.
3. **Glosses.** The six glossed words with their meanings, as rows. Each meaning is
   one real explainer sentence (this is where "voice tutor", "own key", "plan",
   "self-host" get explained). Linked to the passage words by `data-gloss`.
4. **CTA.** "Start reading" cutout button, `href="/start"`. Caption under it: no
   account, nothing leaves your device, works offline once a book is open.
5. **Four ways to run it.** Rows: read for free (hosted) / talk to the tutor with your
   own OpenAI key / talk to the tutor on the plan ($9.99 a month, 3-day trial,
   app.readsotto.app) / run it yourself (Docker, one origin). Columns: way, cost, where.
6. **Add it to your phone.** Three numbered rows: iPhone Safari Share then Add to
   Home Screen; Android Chrome menu then Install app; open a book once so it works
   offline. No claim about the voice tutor inside the installed app until Noel's
   iPhone microphone check passes (Noel's product call, LEDGER 2026-09-05 20:20).
7. **Footer.** GitHub, self-hosting doc, own-key doc, add-a-book doc, licenses
   (Apache-2.0 code, CC BY-SA 4.0 stories), the honesty line: books are
   machine-adapted drafts and levels are estimates. Plain text: no analytics.

## Ban list

- No screenshots, device frames, or demo GIFs. The passage is the demo.
- No cards, boxed grids, or borders around sections. Hairline rows only.
- No gradients, blurred shadows, glass, or glow. One cutout shadow on one button.
- No accent outside the CTA fill. Links are ink with a hairline underline.
- No scroll-triggered reveals, no looping motion, no third-party fonts, scripts,
  or analytics. Zero requests off the origin.

## Fixture copy (for the build lane; Noel reads it before deploy)

Masthead right: `FREE · OPEN SOURCE · NO ACCOUNT`
Eyebrow: `LEVEL A2 · ABOUT 30 SECONDS`
Display: `Sotto reads with you.`

Passage (glossed words marked with brackets, six of them):

> Sotto is a free [graded reader]. You pick a language and a level, open a book, and
> read. Tap any word for a translation, or press play and hear the story
> [narrated]. When you want to talk about what you read, a [voice tutor] listens and
> answers, using [your own key] or the [plan]. Nothing is recorded. Everything runs
> in your browser, and if you would rather run it on your own machine, you can
> [self-host] it.

Glosses (word, then meaning):

- graded reader: A book rewritten at your level. Sotto's books are machine-adapted
  drafts, and their levels are estimates.
- narrated: Every story has audio. The words fill in as the narrator reaches them, and
  single words have their own pronunciation.
- voice tutor: Talk about the passage. It can read to you, explain grammar, quiz your
  pronunciation, or just discuss the story.
- your own key: Paste an OpenAI key in Settings. The page calls OpenAI directly from
  your browser; the key stays on your device and OpenAI bills you, not us.
- plan: One hosted plan at app.readsotto.app, $9.99 a month with a 3-day trial, for
  people who would rather not manage a key.
- self-host: `docker compose up` serves the app and the tutor from one origin on your
  own hardware, with local models or your own key.

CTA: `Start reading` · caption: `No account. Nothing leaves your device. A book you
have opened keeps working offline.`

Four ways (way / what it costs / where):

- Read / Free / readsotto.app
- Talk to the tutor with your own key / You pay OpenAI directly, about a cent a
  minute / Settings in the app
- Talk to the tutor on the plan / $9.99 a month, 3-day trial / app.readsotto.app
- Run it yourself / Free, your hardware / docs: self-hosting

Add it to your phone:

1. iPhone: in Safari, tap Share, then Add to Home Screen.
2. Android: in Chrome, open the menu, then Install app.
3. Open a book once. It keeps working offline.

Footer links: GitHub `https://github.com/nturl/sotto` · Self-hosting
`https://github.com/nturl/sotto/blob/main/docs/self-hosting.md` · Your own key
`https://github.com/nturl/sotto/blob/main/docs/byok.md` · Add a book
`https://github.com/nturl/sotto/blob/main/docs/adding-a-book.md`.
Footer text: `Code Apache-2.0. Stories CC BY-SA 4.0. The books are machine-adapted
drafts and their levels are estimates. No analytics on this page or in the app.`

## Serving architecture (the build lane's contract)

The Vercel project `sotto` (root `apps/client`, `outputDirectory: dist`,
`pnpm deploy:web`) serves the Expo web export as a single-file SPA with a
catch-all rewrite to `/index.html`. The landing takes over `/`; the app keeps every
other path on the same origin.

1. `apps/client/web/landing/index.html` is the landing source (one file, one
   `<style>`, one `<script>`, fonts referenced at `/fonts/…`).
2. `scripts/build-web.mjs`, after the Expo export: rename `dist/index.html` to
   `dist/app.html` and do the existing manifest, meta, and `__SOTTO_STATIC__`
   injection on `app.html`; copy the landing to `dist/index.html`; copy
   `Fraunces_300Light.ttf`, `Fraunces_400Regular.ttf`, `Inter_400Regular.ttf`,
   `Inter_500Medium.ttf` from `node_modules/@expo-google-fonts/*` to `dist/fonts/`.
   Manifest `start_url` becomes `/start` (an installed PWA must open the app, not the
   landing). The sw-manifest walk already includes `app.html`, `index.html`, fonts.
3. `vercel.json`: catch-all rewrite destination becomes `/app.html`. Vercel serves
   the static `index.html` at `/` before rewrites run.
4. `public/sw.js`: the offline navigate fallback matches `/app.html`, not
   `/index.html` (line ~304). Nothing else in the worker names the shell file.
5. `scripts/serve-static.mjs`: `/` serves `index.html`; the SPA fallback serves
   `app.html`.
6. `app/start.tsx`: `export { default } from './index';` so `/start` redirects to
   home or onboarding exactly as `/` did.
7. `e2e/hosted.mjs`: at `BASE_URL`, assert the landing headline, click "Start
   reading", then continue the existing smoke from the app. Landing check runs at 375
   and 1440.

Not in scope: `docs/*.md`, `README.md`, `packages/**`, `apps/server/**`, anything the
content session is editing (Run 4 shared-tree rules in `planning/LEDGER.md`).

## Definition of done

- `cleo_verify.py http://localhost:8090/ --proof <dir>`: 0 FAIL. Expected WARN:
  none. Fonts are same-origin, so `external` must pass.
- Screenshots at 1280 and 375 read by Cleo: nothing overlaps, CTA above the fold at
  375, passage measure 45 to 75 characters per line, accent appears once.
- `hosted.mjs` smoke green against the local static serve at 375 and 1440, including
  the CTA click into onboarding.
- Lighthouse-free proof of no analytics: the network log for `/` shows only
  same-origin requests (html, four fonts, favicon).
- `pnpm check` green on the committed tree in an isolated worktree.
- Deploy is the LAST step and runs only after Cleo's director's pass:
  `cd apps/client && pnpm deploy:web`, then `BASE_URL=https://readsotto.app node
  e2e/hosted.mjs`.
