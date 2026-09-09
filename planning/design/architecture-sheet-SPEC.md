# Sotto architecture sheet — spec

**Fit read.** Job: understand how Sotto is put together and certify the spec against what shipped (docs/architecture.md, WS-6); desktop working doc for contributors and for Noel before a run; neutral technical temperature; opened when planning, not daily. So: a dark drafting sheet, single committed mode.

**Register.** Drafting sheet: ruled title-block header rows, one annotated dependency figure with corner ticks and dimension lines, three spec columns as ticked panels, a second figure for the narration pipeline, a notes column. Clean rotation after almanac / specimen / directions sheet.

**Anchor.** Apogee Dynamics (kombai-gallery s.3), adapted: teal #3A8A9A cut so amber #F2B840 is the one accent and its job is the drawing's annotations (ticks, dimension lines, wire labels); Roboto Slab 700 becomes Helvetica Neue 300 at 64px; Archivo becomes system sans; JetBrains Mono becomes system mono; the flight-review header rows stay as the title block.

**Flood.** Navy #0B1026 canvas, panels rgba(230,233,242,.04), cream #DCD4BC ink, muted #9B9583, rules cream at 14 percent. Grid paper 20px at 4 percent, 100px at 8 percent.

**Device.** The dimensioned figure: corner ticks instead of borders on every node, dimension lines with end ticks carrying real counts (2 apps, 3 packages, 8 routes, 7 tools, 6 slices, 9 locale packs, 39 bundles, 127 chapters), wire labels with the actual wire shapes (PCM16 mono 16 kHz binary frames, JSON VoiceEvent). Nodes link to their spec panel.

**Type cast.** Display Helvetica Neue 300 64px -0.02em. Body system sans 15px. Metadata and title block system mono 11px .08em caps. SVG text 12 to 20px.

**Grid.** Full-width bands ruled top and bottom; figure 1180 wide scaling down; spec columns auto-fit 300px; gutters 48 / 20.

**Ban list.** No second accent. No glows or shadows. No decorative grid lines that measure nothing. No rounded corners (radius 0 everywhere).

**Output.** `~/Claude/sotto/planning/design/architecture-sheet.html`.

**Done when.** cleo_verify full run 0 FAIL, WARNs named; screenshots read; SVG legible at 375; ledger row + archive entry.
