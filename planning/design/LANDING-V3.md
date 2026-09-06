# Landing page, run 6 revision: the decision area steers

Addendum to `LANDING.md` and `LANDING-V2.md` (2026-09-06). Not a new ledger row; a
revision of the same shipped page (manifesto, linked-gloss-focus device, "paper at night"
anchor), noted in `~/Claude/Agents/design/log-archive.md` under the 2026-09-05 entry.
Source: `apps/client/web/landing/index.html` at `be15f33` (635 lines). Line numbers below
are from that commit.

## Fit read

Job: a first-time visitor starts reading in one tap, and, if they want the tutor, sees in
one glance that the plan is the way and that running it yourself is the alternative.
Register, anchor, flood, type cast and device all stay exactly as shipped. This is an IA
and hierarchy fix inside the hero, not a restyle.

## What changed in Noel's priorities (2026-09-06, annotated screenshots)

Run 5 gave own-provider mode and the plan equal billing in one paragraph under the CTA,
and left self-host as the fourth row of a table. Noel now wants: (1) Read, free, unchanged;
(2) the tutor, with the plan as the steered way and own-provider mode as a lighter
mention; (3) self-host surfaced as the named alternative, "run it yourself". And the
guidance under the CTA is "a ton of text": it needs UI, not more prose.

## The real problem

The three tutor options are stated four times on one page: the passage's underlined words
(401-415), the six-entry glossary (431-481), the circled paragraph (421-426) and the
four-row table (483-527). The fix collapses the decision into one block and reassigns the
other three: the passage narrates (unchanged, CONFIRM 15 default holds), the glossary
defines the nouns (prices and origins leave it), the table folds into a reference view
the reader opens on purpose (CONFIRM 16: folded, never deleted).

## The block, design intent

Directly under the existing `.cta-note` (418-420), inside `.start`, two hairline rows in
the file's own row vocabulary. The first row is the tutor: its title is the plan, set in
the glossary's Fraunces 400 1.375rem and linked to the paid origin, with the price and the
"separate sign-in" fact in one body line, and own-provider mode as one light 0.8125rem
line underneath with its docs link. The second row is self-host: title in Inter 500 1rem,
one body line, guide link. Steer by position (first), size (serif 1.375 over sans 1.0)
and copy (an action verb); never by a second accent. Read is the CTA itself; it is not
repeated in the block.

Ban list, unchanged: no cards, no boxes, no border around the block beyond hairline rows,
no new hue, no accent outside `.cta`, radius stays {2, 10} (the block uses none), no new
type sizes, no second button. If the intent cannot be met inside the one-accent budget
without a second button, the fallback is `DESIGN.md:58`'s surface-2 secondary treatment,
but this spec does not need it and the builder must not add it.

## The diff, exact

1. **Hero, 421-426.** Delete the second `.cta-note` paragraph ("The voice tutor works
   either way ...") and put the block in its place:

   ```html
   <div class="paths">
     <div class="path lead">
       <a class="pw" href="https://app.readsotto.app">Add the voice tutor</a>
       <p class="pd">
         The plan: <span class="num">$9.99</span> a month after a 3-day trial, at
         app.readsotto.app, a separate sign-in from this page. Nothing to set up.
       </p>
       <p class="pd light">
         Or use your own key: paste it in Settings and OpenAI bills you, about a cent a
         minute.
         <a class="tap-link" href="https://github.com/nturl/sotto/blob/main/docs/byok.md"
           >How it works</a
         >
       </p>
     </div>
     <div class="path">
       <span class="pw">Run it yourself</span>
       <p class="pd">
         Free on your own hardware, app and tutor from one origin, with local models or your
         own key.
         <a class="rowlink" href="https://github.com/nturl/sotto/blob/main/docs/self-hosting.md"
           >Self-hosting guide</a
         >
       </p>
     </div>
   </div>
   ```

2. **CSS, new rules, inserted after `.cta-note` (270-275) and before `.lead-note`.**
   Every value is an existing token or an existing size:

   ```css
   /* 4b The paths: two hairline rows under the CTA, the plan first and heaviest */
   .paths {
     margin-top: 32px;
     border-top: 1px solid var(--hairline);
   }
   .path {
     padding: 18px 0;
     border-bottom: 1px solid var(--hairline);
   }
   .path .pw {
     display: inline-block;
     padding: 10px 0;
     margin: -10px 0;
     font: 500 1rem/1.55 var(--sans);
     color: var(--ink);
   }
   .path.lead .pw {
     font: 400 1.375rem/1.2 var(--serif);
   }
   .path .pd {
     margin: 6px 0 0;
     color: var(--ink-2);
   }
   .path .pd.light {
     margin-top: 8px;
     font-size: 0.8125rem;
     color: var(--ink-3);
   }
   ```

   `a.pw` keeps the global link rule (ink, hairline underline, 94-100); at 1.375rem the
   dotted-peach `.tok` treatment is not used, so the title does not read as a gloss.

3. **Glossary, plan entry, 466-469.** The `dd` loses the price and origin (they now live
   once, in the block):

   ```html
   <dd class="gm">
     The hosted tutor, with nothing to set up: subscribe and it is on. The lighter path is
     your own key.
   </dd>
   ```

   The other five entries are unchanged. "your own key" already reads as a definition
   (no price); "self-host" already reads as a definition (no link).

4. **Ways table, 483-527, folds.** Replace the `h2` (485) and the `.lead-note` (486-489)
   with a `details` element wrapping the untouched `.rows` grid (490-525):

   ```html
   <section id="ways">
     <div class="col wide">
       <details class="fold">
         <summary>Compare all four ways</summary>
         <div class="rows">
           ... 491-524 byte-identical ...
         </div>
       </details>
     </div>
   </section>
   ```

   CSS, inserted after the `.steps` rules (341-352), before `/* 7 Footer */`:

   ```css
   /* 5b The reference view, folded */
   .fold summary {
     list-style: none;
     cursor: pointer;
     display: flex;
     justify-content: space-between;
     align-items: baseline;
     padding: 18px 0;
     border-top: 1px solid var(--hairline);
     border-bottom: 1px solid var(--hairline);
     font: 300 1.75rem/1.15 var(--serif);
     letter-spacing: -0.01em;
   }
   .fold summary::-webkit-details-marker {
     display: none;
   }
   .fold summary::after {
     content: '+';
     color: var(--ink-3);
   }
   .fold[open] summary::after {
     content: '\2212';
   }
   .fold .rows {
     border-top: 0;
   }
   ```

   The summary is set in the `h2` cast so the section keeps its rhythm with "Add it to
   your phone". `.fold .rows` drops its own top hairline because the summary's bottom
   hairline is already there. Closed by default in every context, so the JS-off parity
   check sees the same text either way; the harness's hidden-content check tests
   opacity and visibility only, and a closed `details` sets neither.

5. **Remove the dead rule.** `.lead-note` (276-281) has no remaining user; delete it.

6. **Nothing else moves.** Header, meta line, account link, passage, CTA, first
   `.cta-note`, five glossary entries, the phone steps, the footer, the script (560-633)
   and every token in `:root` are untouched. `--accent` is still referenced exactly once,
   at `.cta` (241).

## Copy, complete fixture of every changed string

- Block, row 1 title (link to `https://app.readsotto.app`): `Add the voice tutor`
- Block, row 1 body: `The plan: $9.99 a month after a 3-day trial, at app.readsotto.app,
  a separate sign-in from this page. Nothing to set up.` (118 characters)
- Block, row 1 light line: `Or use your own key: paste it in Settings and OpenAI bills
  you, about a cent a minute. How it works` ("How it works" links to `docs/byok.md`)
- Block, row 2 title (not a link): `Run it yourself`
- Block, row 2 body: `Free on your own hardware, app and tutor from one origin, with local
  models or your own key. Self-hosting guide` ("Self-hosting guide" links to
  `docs/self-hosting.md`)
- Glossary, plan: `The hosted tutor, with nothing to set up: subscribe and it is on. The
  lighter path is your own key.`
- Fold summary: `Compare all four ways` (unchanged text, new element)
- Removed: the whole paragraph beginning `The voice tutor works either way` and the lead
  sentence `Already decided? Reading and the tutor are both covered above. Here's
  everything side by side.`

## Tap-target math (build to 44, the harness warns under 40)

- Row 1 title `a.pw`: 1.375rem × 1.2 = 26.4px line, plus 10 + 10 padding = 46.4px.
- "How it works" `.tap-link` at 0.8125rem × 1.55 = 20.15px, plus 16 + 16 = 52.2px. Same
  class and size the existing `.cta-note` link used.
- "Self-hosting guide" `.rowlink` at 1rem × 1.55 = 24.8px, plus 10 + 10 = 44.8px. This is
  why row 2's body stays at 1rem, not 0.9375rem (which would land at 43.3).
- Fold summary: 1.75rem × 1.15 = 32.2px plus 18 + 18 = 68.2px; the whole summary is the
  target.
- The account link, footer links and table `.rowlink`s are unchanged from run 5.

## Measure

The block sits inside `.start` at `max-width: var(--measure)` (38rem = 608px at 1280;
355px at 375 after gutters). The harness measures only `p, li, blockquote, dd` elements
over 120 characters; every new `p` is at or under 118 characters, so none enters the
median, and the page's measure stays what the passage and glosses make it (median in the
45-75 band in run 5). At 1280 the 1rem body lines run about 75 characters per line
(608px ÷ ~8.1px per Inter character); at 375 about 44. If a measure WARN appears anyway,
shorten copy, do not widen the column.

## Definition of done

- `cleo_verify.py` on the local `pnpm web:export` build with `--proof`: 0 FAIL; the only
  WARN is the pre-existing `js-disabled` ratio (harness undercount of the span-wrapped
  passage, named in the 2026-09-05 archive entry). Any other WARN is new and gets fixed.
- `accent-count` still 1. `radius-vocab` unchanged. `card-grid-tell` clean (the block has
  two rows, below the check's four-child floor, and they carry no background or radius).
- Screenshots 1280 and 375, light and dark, read as images by the director: the plan row
  reads as the steered way at 375 without a second accent; the block reads in one glance
  under the CTA; nothing below it repeats the prices; the fold reads as a closed row with
  a `+` and opens to the four-row table.
- `git diff --stat` touches only `apps/client/web/landing/index.html`.
- Not in scope: `planning/STRATEGY.md`'s "paid tier parked" language (CONFIRM 14),
  `docs/*.md`, the app, the paid origin.
