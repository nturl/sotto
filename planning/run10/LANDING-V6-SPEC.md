# Landing V6: the same stage, two doors, shorter

A revision of V5 (`LANDING-V5.md`), not a new register. Source file stays
`apps/client/web/landing/index.html`, one file, no build step, no new fonts, no new requests.

## Fit read

Job: a stranger from a shared link understands in ten seconds what Sotto is, sees that reading is
free, and picks one of two doors. Phone first (the walk was done at 375), laptop second. Read once
or twice, lives for months. Register stays **scrollytelling stage**; the book is still the one
device. What changes is the door row, the phone tab strip, the desktop scroll budget, the two
product screenshots, and one line of scene copy. Nothing else moves.

## Anchor, flood, device, type

Unchanged from V5: Shade paper cutout x Haptic staged object; `--canvas #F4ECDF`, pages
`#FBF6EC`, `--surface-2 #EFE4D2`, ink `#221E1B`, ink-2 `#6E6459`, accent `#E4572E` (CTA fill and
play ring only), peach `#F2C8B4`; Fraunces 300 display, Fraunces 400 passage, Inter 400/500 UI,
system mono 11px 0.08em uppercase metadata. Radius {2, 10}. Cutout shadow on the book, the primary
CTA, and the two screenshot frames only.

## The five changes

1. **Two doors.** `.cta-row` holds the primary `.cta` (unchanged: accent fill, ink label, 4px ink
   cutout) and a second button `.cta.secondary` with the exact text "Read free, no account",
   `href="/start"`: `--surface-2` fill, ink label, same 56px min-height, radius 10, no shadow,
   1px hairline border. Under 600px both are full width, stacked, gap 12. From 600px they sit in
   one row, auto width, gap 16, primary first. The hero's "Sign in" link and the `.cta-links`
   span are removed; the masthead keeps its SIGN IN. The `.cta-note` price line stays under the
   row, unchanged text.
2. **Phone tab strip on one line.** Under 900px `.tabs` is `flex-wrap: nowrap`, each `li` is
   `flex: 1 1 0; min-width: 0`, `.tab` is `justify-content: center; padding: 0 4px`, and `.tab b`
   (the 01..05 numerals) is `display: none` under 600px. Font stays mono 0.6875rem uppercase.
   Five tabs must fit in 335px at 375 with no horizontal overflow and no wrapping.
3. **Desktop scenes at 56vh.** At 900px and up `.scene { min-height: 56vh }` instead of 70vh.
   The sticky book, the IntersectionObserver (threshold 0.5, rootMargin -30% 0px -30% 0px) and
   the 240ms state transitions stay. If a scene stops firing at 1280x900, loosen rootMargin to
   -25% and say so in the report.
4. **Current screenshots.** Replace both base64 JPEGs in `#preview`:
   - shot 1: the reader with the word "loup" tapped and its gloss "wolf" open beside the passage.
     Alt: "The Sotto reader with the word loup tapped and its meaning, wolf, beside the passage".
     Caption unchanged: "Tap any word for its meaning, mid-story."
   - shot 2: the Library shelf with the illustrated covers. Alt: "The Sotto library: a shelf of
     illustrated covers, each stamped with its level". Caption: "Every book on the shelf is
     rewritten to a level."
   Keep `width="900" height="560"`, `loading="lazy"`, the frame styles. Add
   `planning/run10/embed-shots.mjs`: given two JPEG paths it rewrites the two `src` attributes in
   place, so the shots can be refreshed after the app changes land.
5. **Scene 05 copy.** The `.body` line becomes: "Pick where it runs: Sotto's server, your own key,
   or this device."

## Ban list

- No new sections, no cards, no gradients, no entrance animation, no new copy claims beyond the
  five changes, no white-on-accent text, no CDN or external requests, no font changes.
- No em dashes anywhere. Sentences under 20 words.
- Do not touch `apps/client/e2e/hosted.mjs` (lane A owns it) or any file outside the landing
  file, this spec, the embed script, and the lane report.

## Definition of done

- `python3 ~/Claude/Agents/design/tools/cleo_verify.py apps/client/web/landing/index.html --proof
  <dir>`: 0 FAIL, every WARN named in the report (V5 shipped with 4 WARN, all the CTA's ink
  cutout).
- Screenshots at 375 and 1280 read as images: both doors above the fold at 375 by 812 (the
  secondary button's bottom edge inside the viewport), the tab strip on one line, no overflow.
- Headless scroll at 1280x900: `#book[data-state]` reaches read, tap, listen, speak, power in
  order as the page scrolls through the five scenes at 56vh.
- JavaScript off: all five panes render stacked inside the book (parity unchanged from V5).
- Prettier clean on the file (`pnpm exec prettier --check apps/client/web/landing/index.html`).
- `git diff --stat` on `run10/C` touches only: the landing file, this spec, the embed script,
  `planning/run10/C-report.md`.

## Deviation notes (lane C, run 10)

- **Change 1, "from 600px they sit in one row."** True from 600px to 899px. At 900px and up the
  stage splits into two columns and the copy column is only 332px to 444px wide, so the pair wraps
  to two lines. Side by side there needs 548px. The wrap is `flex-wrap: wrap` from V5 doing its
  job; both doors still land above the fold. To reach one row in the 600 to 899 band the secondary
  takes `padding: 0 24px` at 600px and up, 32px less than the primary. Without it the pair needs
  580px against a 576px measure cap and never shares a line.
