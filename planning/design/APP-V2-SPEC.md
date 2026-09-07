# Sotto app UI, v2 mockup (Cleo spec, 2026-09-06, built on Fable by Noel's instruction)

Output: `planning/design/app-mockup-v2.html`, one file, screens rendered at real fidelity (desktop 1100 frame, phone 390 frame). Fonts: Iowan Old Style / Georgia stand in for Fraunces, system sans for Inter, per DESIGN.md's own sheet rule.

**Fit read.** Noel judging whether the app looks like something to pay for, laptop and phone; job is to compare before and after screen by screen; so: a catalog sheet whose items are the screens.

**Register (the sheet):** catalog. Rotation before: chronicle, field guide, dossier. **Register (inside the screens):** the product's own system, DESIGN.md "Paper", kept; this is a sharpening, not a reskin.

**Anchor:** Sotto's own tokens (canvas #F4ECDF, surface #FBF6EC, surface-2 #EFE4D2, ink #221E1B, ink-2 #6E6459, ink-3 #9C9287, accent #E4572E, peach #F2C8B4). Sheet backdrop #ECE9E1 so the paper frames read as the product. What changed against DESIGN.md: accent's job widens from "CTA + active tab" to "where you are" (CTA, active tab, and the ribbon on the book you are in); pills are removed from filters and "See all"; the daily card loses its gradient panel.

**Device (content-carrying): the shelf.** Every rail of books rests on a 1.5px hairline shelf; covers stand on it with one cutout; the book you are reading wears a coral ribbon over its top edge. The shelf replaces the stray progress underline and the second shadow; the ribbon replaces the progress bar.

**Cover system.** Typographic covers, six paper colours (#E8D6B8 sand, #1F4F57 teal, #6E9A7C sage (lightened from DESIGN.md’s #5B8A6B so ink text clears 4.5:1), #8C3B2E brick, #F2C8B4 peach, #2B2A28 slate) chosen per collection, a 3px darker spine strip on the left, one large initial or one simple glyph, title Fraunces 300, author small caps 9px tracked, level printed as a mono stamp bottom-right. No repeated moon/triangle set.

**Type.** Display Fraunces 300 at 34 (screen titles), heading 22/400, reading 20/1.55, ui 16, caption 13, mono 11 tracked 0.08em uppercase. Sizes carry hierarchy; no bold serif.

**Spacing and grid.** 8px base; desktop sidebar 220 + content max 1100 with 48 gutters; phone gutters 20; rail gap 20; cover 120x180 desktop, 104x156 phone; reader passage column 640 centered, panel 360 docked right with a hairline left edge.

**Screens on the sheet.** (1) Desktop Home: title, one row of two icon buttons, "Continue reading" shelf first with the ribboned book and "p. 12 of 40" mono, then "Today's story" as a spread (cover left on surface-2 with hairline, right: eyebrow, title display, mono meta, primary cutout "Read", secondary "Listen"), then Recommended shelf. No plan nag on Home. (2) Desktop Library: title + search field inline; level scale A0..C1 as one hairline-segmented control (selected = ink fill); collections as plain text links; shelves. (3) Desktop Reader: passage 640 centered, chapter mono top-left, close top-right, tokens plain (peach 18% fill only on the selected word, marker stroke on saved), transport as a thin bar under the passage; right panel: word Fraunces 28, gloss ui, speaker ring 44 accent outline, Save cutout, Details / Report captions, "Talk about this passage" as a surface-2 button at the panel bottom. (4) Phone Home, (5) Phone Library, (6) Phone Reader with the translation sheet, tab bar with four ink glyphs, active accent.

**Found while verifying.** DESIGN.md's CTA (cream text on accent #E4572E) measures 3.45:1; the mockup sets the CTA label in ink (5:1). Ink-3 #9C9287 fails 4.5:1 at 11px on canvas; small mono metadata uses ink-2. Cream on sage #5B8A6B fails at 13px; sage covers carry ink text. These three should go back into DESIGN.md.

**Ban list.** No pill chips; no gradients on surfaces; no blurred shadows; no second shadow on tiles; no progress bars on covers; no repeated cover motif; no emoji.

**Verification.** cleo_verify 0 FAIL; screenshots at 1280 and 375 read; nothing overlaps at 375 (the phone frames stack, the desktop frames scroll inside an overflow container, the page never scrolls sideways).
