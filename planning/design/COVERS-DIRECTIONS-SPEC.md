# Sotto book covers, directions sheet (Cleo, Directions mode, 2026-09-06)

**Brief from Noel.** The run 8 typographic covers (one big initial or glyph on one of six papers, picked by hash) do not delight. "Each book should have its own individual feel and delightful design." Look at the shelf as a reader would: forty small objects that should each be worth picking up.

**Fit read.** Job: browse a shelf and want to open one; phone and laptop; tiles 104 and 120 wide; opened every day for as long as the app lives; light and dark schemes (covers are artwork, one colourway); 40 books across 9 locales including two CJK titles. So: a catalog whose items carry the craft. The cover is the item. The sheet is Directions mode, three bands.

**The axis.** Where a book's individuality lives: in an object, in a place, or in a surface. Three orthogonal bets; none can be reskinned into another by swapping a colour.

| | A. The Pressed Emblem | B. The Mise-en-scène | C. The Endpaper |
|---|---|---|---|
| Says | A library of objects: every book is one thing you can hold. | Every book is a place and a weather. | A shelf of cloth spines: every book has its own woven pattern. |
| Anchor | Penguin Great Ideas / Pelican, cut paper | Folio Society flat-scene jackets, Charley Harper geometry | Coralie Bickford-Smith Clothbound Classics |
| Art | One emblem, 2 to 3 tones on a ground, upper two thirds | Full-bleed flat scene, 4 tones, horizon or stage, one actor | One motif tile repeated as a pattern, 2 to 3 tones, full bleed |
| Text zone | Ground below y 232 (app overlays text) | Solid band y 250 to 330 (app overlays text) | Paper label x 24 to 196, y 210 to 300 (app overlays text) |
| Commits to | Instant recognition at 104px; one drawn thing per book | Atmosphere, era, weather | Individuality at scale; works for abstract and CJK books; cheapest to author |
| Trades away | No atmosphere; a few stories lack an obvious object | Busiest at 104px; hardest to draw well; 40 scenes is the most authoring | Motif reads as texture at 104px; the label is the same shape on every book |

**Held fixed (all three).** viewBox 0 0 220 330. Palette of eleven tones from DESIGN.md, 3 to 4 per cover, one as ground: sand #E8D6B8, teal #1F4F57, sage #6E9A7C, brick #8C3B2E, peach #F2C8B4, slate #2B2A28, ink #221E1B, canvas #F4ECDF, marker #FFD8A8, forest #4E7D5B, ochre #B8651B. Ground and tones chosen per book from its story, never by hash. Text is not in the SVG: the app prints title (Fraunces 300), author (small caps, tracked) and level (mono stamp) over the text zone, as `Cover.tsx` already does; the worker names which ink the zone needs. Shapes read at 104px wide: nothing thinner than 2 units, no detail smaller than 10 units. Under 60 elements per cover.

**Ban list.** No gradients, filters or shadows. No emoji. No text or letters in the art. No faces with features (a dot for an eye at most). No accent #E4572E anywhere on a cover (its one job is the CTA and the ribbon). No motif reused across two books. No decorative frames that are not the direction's own device.

**Fixture (8 of 40).** en-poe-tell-tale-heart, fr-maupassant-la-parure, es-quijote-molinos, en-oz-cyclone, fr-petit-chaperon-rouge, zh-chengyu-stories, pt-jabuti-onca, es-larra-vuelva-usted. Chosen for spread: A0 to C1, six locales, one CJK title, one story with no obvious object (Larra), one dark (Poe).

**Production.** Two model families draw each direction (Codex GPT-5.6 / Kimi K3 for A and B; Kimi K3 / Grok for C) through /fanout; Cleo reads every set as rendered PNGs at 120 and 104 wide, picks per direction (per book where one family clearly wins), fixes by hand, and composes the sheet. Sheet: `planning/design/covers-directions.html`, Sonnet builder, Cleo verifies with `cleo_verify.py`, proof shots in `planning/design/covers/proof/`.

**Ship path after Noel points.** The chosen direction becomes `cover.svg` per pack (art only, 220x330) plus a `coverInk` field in book.json; `Cover.tsx` renders the pack SVG for every book and overlays the text as it does today; `coverPaper.ts` retires. Remaining 32 books authored the same way in one wave.
