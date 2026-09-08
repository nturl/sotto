# Lane C, run 10: landing page V6

Branch `run10/C`, based on main @ `cd326af`. One file changed:
`apps/client/web/landing/index.html`, plus the embed script, the spec note, and this report.

Verified: cleo_verify 0 FAIL 4 WARN (all four are the CTA's 4px ink cutout, the same four V5
shipped with); screenshots 375 and 1280 read; scenes read->tap->listen->speak->power at 56vh;
JS-off panes 5/5; prettier clean.

## The five changes

### 1. Two doors

CSS. Dropped the `.cta-links` rule. Added `.cta.secondary`: `--surface-2` fill, ink label, 1px
hairline border, `box-shadow: none`. It inherits the 56px min-height and the 10px radius from
`.cta`. `.cta.secondary:active` keeps the 2px press nudge without a shadow. `.cta-row` gap at
600px and up went from `16px 28px` to `16px`.

Markup. The `.cta-links` span (which held "Read free, no account" and a second "Sign in") is gone.
In its place a single `<a class="cta secondary" href="/start">Read free, no account</a>`. The link
text is byte-identical to what the hosted smoke clicks. The masthead SIGN IN is untouched, so
signing in is still one tap from the top of the page. The `.cta-note` price line is unchanged.

Measured at 375: primary 335x56 ending at y=554, secondary 335x56 from y=566 to y=622, gap 12px,
both inside the 812px fold. Secondary computed style: `rgb(239, 228, 210)` (`--surface-2`),
`box-shadow: none`, `border-radius: 10px`, `border-top-width: 1px`.

One deviation, written into the spec as well. The spec says the pair sits in one row from 600px.
It does from 600px to 899px, but only after trimming the secondary to `padding: 0 24px` at 600px
and up: at 40px both they need 580px against a 576px measure cap and never share a line. At 900px
and up the stage splits and the copy column is 332px to 444px, so the pair wraps. Side by side
there would need 548px, so no CSS reaches it without shrinking the primary, which the spec fixes
as unchanged. Widths measured: 600/700/768/899 one row; 375/900/1024/1280/1440 stacked. Both doors
sit above the fold at every one of those widths.

### 2. Phone tab strip on one line

Two new blocks after `.tab[aria-selected='true']`. Under 900px: `.tabs { flex-wrap: nowrap }`,
`.tabs li { display: flex; flex: 1 1 0; min-width: 0 }`, `.tab { flex: 1 1 0;
justify-content: center; padding: 0 4px }`. Under 600px: `.tab b { display: none }`, hiding the
01..05 numerals. The `display: flex` on the `li` and `flex: 1 1 0` on the `.tab` are additions to
the spec's list; without them the inline-flex anchor does not fill the stretched `li` and the
centering has nothing to center in. Font is untouched: mono 0.6875rem, 0.08em, uppercase.

Measured at 375: all five tabs share `top`, one row, each 62x63px wide by 44px tall, strip runs
x=20 to x=355, so 335px used of 335px available. `document.documentElement.scrollWidth === 375`.
At 768 the numerals are back and the strip is still one row. At 1280 the strip is `display: none`
as before; under `prefers-reduced-motion` at 1280 it returns as one wrapped row, unchanged.

### 3. Desktop scenes at 56vh

`min-height: 70vh` to `56vh` inside the `@media (min-width: 900px)` block. Nothing else in that
block moved: the sticky book, the `threshold: 0.5` / `rootMargin: -30% 0px -30% 0px` observer and
the 240ms transitions are as they were. rootMargin did **not** need loosening to -25%; every scene
fires at -30%. Computed `min-height` at 1280x900 is 504px on all five scenes.

### 4. Current screenshots

Both base64 JPEGs in `#preview` replaced from the 900x560 1x captures of the live app. Byte
checks: shot 1 sha256 `f88fb2ff1c7c...`, 113,930 bytes; shot 2 sha256 `de96bf33c0dc...`,
63,601 bytes; both decode at 900x560, matching the unchanged `width="900" height="560"`.
`loading="lazy"` and the frame styles are unchanged.

- Shot 1 alt: "The Sotto reader with the word loup tapped and its meaning, wolf, beside the
  passage". Caption unchanged: "Tap any word for its meaning, mid-story."
- Shot 2 alt: "The Sotto library: a shelf of illustrated covers, each stamped with its level".
  Caption now: "Every book on the shelf is rewritten to a level."

The library shot still carries a caption under its title that another lane is removing. It is
embedded as briefed; the orchestrator can re-embed a fresh capture with the script below.

`planning/run10/embed-shots.mjs` takes two JPEG paths and rewrites only the two `src` attributes
inside `#preview`, first image reader, second image library. It refuses to run if it does not find
exactly two, and it checks the JPEG magic bytes before encoding.

    node planning/run10/embed-shots.mjs <reader.jpg> <library.jpg>

### 5. Scene 05 copy

`.body` under "05 Power" now reads: "Pick where it runs: Sotto's server, your own key, or this
device." Twelve words, replacing two sentences that pointed at a control the scene does not show.

## Verification, in full

1. **cleo_verify, full run.** `cleo_verify.py apps/client/web/landing/index.html --proof
   /Users/noelturlington/Claude/sotto-run10/proof/C/verify`. 1 FAIL, 4 WARN, 18.2s.
   The FAIL is `console`: 16 `net::ERR_FILE_NOT_FOUND`, which is the four same-origin
   `/fonts/*.ttf` faces failing to resolve over `file://`, counted once per viewport and scheme.
   Re-run against the served export, where the fonts do resolve, gives **0 FAIL, 4 WARN**, proof
   in `proof/C/verify-http`: `console  0 console.error, 0 uncaught page errors`.
   The four WARN are `shadows-{1280,375}-{light,dark}`, all the same element:
   `a.cta:rgb(34, 30, 27) 4px 4px 0px 0px`. That is the ink cutout, the deliberate anchor of the
   whole page and the same four warnings V5 shipped with. Not fixed on purpose.
   Note on the interpreter: the system `python3` has no `playwright`, so the harness was run under
   its own shebang interpreter,
   `/Users/noelturlington/.local/share/uv/tools/shot-scraper/bin/python`. Same script, same
   arguments.
2. **Real screenshots with the fonts.** `pnpm web:export` from `apps/client` (clean, 9 packs,
   landing page and 4 fonts copied to `dist/`), then `node scripts/serve-static.mjs 8093`, then
   shot-scraper at 375x812 and 1280x900 plus full-page versions, plus a 768 shot and crops of
   `#preview` and `#scene-power`. All read as images. Both doors are above the fold at 375, the
   tab strip is one line with all five labels, `scrollWidth === 375`, the book is sticky at 1280
   and the scenes switch under it.
3. **Scene check at 1280x900.** Scrolled in 120px steps over the 4055px page, 34 samples, reading
   `document.querySelector('#book').dataset.state` at each stop. Sequence: `read, tap, listen,
   speak, power`, in order, with no extra transitions.
4. **JavaScript disabled** (Playwright `java_script_enabled: false`). All five right-page panes
   present and visible: `pane read, pane tap, pane listen, pane speak, pane power`, 5 of 5. All
   five `.scene` blocks visible. The secondary door renders. cleo_verify's own js-disabled check
   agrees: 2124 visible chars with JS off against 1684 with it on, ratio 1.26.
5. **Prettier.** The file was **not** clean at HEAD. `prettier --write` ran first, before any
   content edit: formatting alone moved 171 lines, 138 insertions and 33 deletions, mostly
   exploding the one-line `<li>` tab markup and the `.passage` word spans. The full HEAD-to-final
   diff is 181 insertions and 49 deletions, so roughly 43 and 16 of that is real change.
   `prettier --check` is clean on the final file.
6. **Links.** Every `href` returns 200. `https://app.readsotto.app/account`,
   `.../account?intent=start&returnTo=%2Fpaywall`, `https://github.com/nturl/sotto` and the three
   `docs/` pages (`adding-a-book.md`, `byok.md`, `self-hosting.md`) checked with curl. `/`,
   `/start`, `/favicon.ico`, `/icons/apple-touch-icon.png` checked against the served export.
   `/start` is relative and stays relative on the secondary door.

## File size

- HEAD: 269,565 bytes, 1269 lines.
- Final: 328,023 bytes, 1401 lines.
- The 58,458 byte increase is the two screenshots. The old pair encoded to about 118 KB of base64
  in the file, the new pair to about 235 KB.

## Copy rules

No em dashes added. The one in the file sits in a JavaScript comment and predates this branch. No
"honestly". Longest new sentence is 12 words. No claims beyond the five changes.

## Not done

Nothing in the spec is outstanding. Two things worth the orchestrator's eye:

- The library screenshot still shows the caption another lane is removing. Re-embed with
  `embed-shots.mjs` once that lands.
- At 900px and up the two doors stack rather than sharing a row. That is geometry, not a bug, and
  it is written into the spec's deviation notes.

## Proof

`/Users/noelturlington/Claude/sotto-run10/proof/C/`

    landing-375.png            375x812 viewport
    landing-375-full.png       375 full page
    landing-768.png            768x900, the one-row door band
    landing-1280.png           1280x900 viewport
    landing-1280-full.png      1280 full page
    landing-js-off-full.png    1280 full page, JavaScript disabled
    preview-1280.png           the two replacement screenshots in frame
    scene-power-1280.png       scene 05 copy
    verify/                    cleo_verify full run against the file
    verify-http/               cleo_verify full run against the served export
