# Sotto desktop layout spec (extends DESIGN.md, >= 900px)

Applies Direction A "Paper" to two breakpoints: **900–1199** and **>= 1200**. Below 900, phone layout stands as specified in DESIGN.md. All tokens, colors, radii, and the three signature devices are inherited unchanged — this file adds no new color, radius, or device.

Noel's complaint this fixes: desktop currently renders phone-width content in a stretched viewport (rails as vertical single-file stacks, book detail as a centered phone column, reader text underused). Every section below replaces a "just add gutters" pattern with real desktop composition: grids, side-by-side columns, docked panels.

## 1. Shell

| | 900–1199 | >= 1200 |
|---|---|---|
| Sidebar | 220px, fixed, as DESIGN.md (surface, hairline right edge, Fraunces 300 wordmark, three nav rows) | same |
| Content region max-width | 760 | 1040 |
| Content gutters (left/right of the max-width column, inside the remaining viewport) | 32 | 48 |
| Content top padding | 32 | 48 |

Content region is centered in the space right of the sidebar, not flush to it: `margin-left: max(32px, (available - maxWidth) / 2)`. This is what stops the "stretched phone column" look — at 1440 the reading/library column sits with real breathing room on both sides, not pinned left with a wall of empty canvas on the right.

Settings (gear) and gift icon buttons: same 40px ink-stroke icon buttons as phone, top-right of the content region on Home only, inline with the display title's baseline. They do NOT move into the sidebar — sidebar rows are navigation only, never actions.

## 2. Home

- Daily-story card: full-width of the content region (760 / 1040), height unchanged from phone proportions (teal-to-sage gradient panel is a **fixed 320px** left column at >= 900, not a third-of-width fraction — prevents the panel from ballooning at 1040).
- Rails become a **grid**, not a horizontal scroll:

| | 900–1199 | >= 1200 |
|---|---|---|
| Columns | 3 | 4 |
| BookTile size | 150 x 225 cover, cutout unchanged | 160 x 240 cover |
| Column gap | 20 | 24 |
| Row gap | 32 | 32 |

- Rail heading row: heading left, "Voir tout" (ui 500, ink-2) right-aligned on the same baseline — same affordance as Library's rail header, now also on Home (phone has no "Voir tout" per DESIGN.md; desktop adds it because a grid needs an escape hatch when a rail holds more items than one row shows). "Voir tout" navigates to a filtered Library view.
- A rail longer than one row is **clipped to exactly one row** on desktop (no horizontal scroll, no vertical overflow) — "Voir tout" is the only way to see the rest.
- Hover states (120ms ease, same curve as press): BookTile on hover — cutout shadow shifts from 6px/6px to 8px/8px (grows, doesn't shrink like press) and title text darkens ink-2 -> ink. Buttons (icon buttons, "Voir tout", secondary buttons) on hover — background surface -> surface-2, no shadow change. Primary cutout CTA does not get a hover shadow change (its language is press, not hover); hover only nudges background one step darker within accent (no new token — use the accent value at 92% opacity over surface, i.e. a CSS `filter: brightness(0.96)` on the fill).

## 3. Library and search

- Chips row: unchanged pill row from DESIGN.md, left-aligned, wraps to a second line if it overflows the content width (never scrolls horizontally on desktop).
- Grid: same column counts as Home (3 at 900–1199, 4 at >= 1200), same tile size and gaps.
- Search: search icon in the title row opens the search screen (not a modal) — content region shows a search input at **480px wide**, left-aligned under the title, surface-2 radius 10, same height/type as phone. Results below it are the same grid, not a list — grid affordance stays consistent between Library and its own search.

## 4. Book detail

Two-column layout, not the phone's stacked/centered column:

| Column | Width | Content |
|---|---|---|
| Left | 280 fixed | Cover (280 x 420, keeps the cutout) |
| Right | fills remainder, text measure capped at **~65ch** (≈ 600px at ui 16/1.4) | Title (display 34, left-aligned, not centered), author (ui, ink-2), "Version simplifiée" (caption, ink-3), metadata strip, "Qu'y a-t-il dedans ?" heading + synopsis, disclaimer caption, actions |

- Columns sit side by side with a 48px gap, top-aligned (cover top = title top).
- "Retour" stays above both columns, full content width.
- Primary "Lire" CTA and secondary "Mode vocal" button: **stacked, left-aligned under the text column**, width = text column's measure (not full content width, not centered) — max 400px. This keeps the CTA visually attached to the synopsis it follows, matching phone's reading order (synopsis -> CTA) instead of stranding a wide button under a narrow paragraph.

## 5. Reader

Two-column at >= 900, both columns full-height (100vh minus nothing — reader has no chrome above it besides the close X and chapter label, per DESIGN.md):

| | Value |
|---|---|
| Passage column max-width | 620 (DESIGN.md ceiling, unchanged) |
| Passage column measure at reading size | Fraunces 20/1.55 wraps to ~65ch inside that 620 max — do not widen the column to chase a bigger number; 620 already yields ~65ch at this size/face. If a future face swap makes 620 wider or narrower than 65ch, adjust the *font size*, not the column width — 620 is the fixed device. |
| Translation panel | Docked right, **360px fixed width**, `position: sticky; top: 0`, full column height, surface fill, hairline left edge (not top — desktop panel is a side panel, not the phone's bottom sheet, so it takes the phone's hairline-top rule and rotates it to hairline-left) |
| Chapter label | top-left of the passage column, mono, as phone |
| Close X | top-right of the *passage column*, not top-right of the viewport — keeps it near the text it closes, doesn't stray into the translation panel's territory |
| Narration transport | Bottom of the passage column only (620 max width), `position: sticky; bottom: 0`, surface background so text can scroll under it, hairline top. Same control set as phone (prev / -10 / play ring 56 / +10 / next, segmented progress, mono elapsed/speed/remaining) |

The passage column scrolls independently; the translation panel does not scroll with it (sticky top:0 within its own column keeps it pinned to the viewport while passage text scrolls past on the left).

Implementer note — keyboard affordances (reader has focus, no input field focused):
- `Space` = play/pause narration
- `ArrowLeft` = -10s, `ArrowRight` = +10s
- `Escape` = close reader (same as clicking the X)
These are desktop-only additions (no phone equivalent); do not wire them when a text input or the translation panel's word field has focus.

## 6. Voice screen

Same two-column shape as Reader: passage left (620 max), right panel 360 fixed, sticky, hairline-left. Right panel stacks, top to bottom: state row (8px dot + mono state word), captions strip (caption ink-2, toggle), then the four mode chips in a row (surface-2, selected = ink fill — same chip as Library, just laid out horizontally at the top of the panel's control area, not the bottom). Controls (mute/replay/stop/end, push-to-talk ring) sit at the bottom of the right panel, sticky within it, mirroring where the Reader's transport sits below the passage — the two screens should feel like siblings.

## 7. Vocabulary + review

- Vocabulary: word cards in a grid, same column counts as Home/Library (3 at 900–1199, 4 at >= 1200), card width flexes to the column, height stays content-driven (not forced square). Book selector card stays full content width above the grid, unchanged from phone. Bottom CTA ("Commencer la révision") stays left-aligned under the grid at the text-column width used in Book detail (max 400px) — not full-width, not centered, matching the same "CTA hugs the content it follows" rule as section 4.
- Review: single card, centered in the content region, **max-width 480px** (do not stretch the review card to fill 1040 — it is a focused single-item screen, and DESIGN.md's phone spec is already correct at any width). Progress mono label sits above the card, centered to the same 480px measure.

## 8. Onboarding on desktop

Onboarding (including the new fast-path first screen) is **not** inside the tabs/sidebar shell at any width — full canvas background, no sidebar, no icon buttons.

- **Fast-path screen** (first screen, new — Lane A build):
  - Detects browser language; renders a single centered column.
  - At 1440: column max-width **560px**, vertically centered in the viewport (not pinned to top). Order top to bottom: display title (Fraunces 34) stating the detected-language offer, e.g. "Commencez à lire en français" — localize the sentence to the detected language, not just the book language; primary cutout CTA "Commencer" / "Start reading in French" (localized string, same cutout device as everywhere else); secondary "Choisir mes langues" as a plain ui 500 ink-2 text link (no button chrome) beneath the CTA, centered.
  - At 375 (phone): identical stack, same order, column fills the 20px-gutter width, CTA pinned above the home indicator per DESIGN.md's onboarding CTA rule (not vertically centered — phone's is bottom-anchored, desktop's is viewport-centered). This is the one deliberate difference between the two widths for this screen.
  - Choosing "Choisir mes langues" drops into the existing wizard (Langue de l'app / Explain in / etc.), which follows the rule below.
- **Full wizard screens** (language/level questions): centered single column, max-width **560px**, vertically centered in the viewport at >= 900 (the existing phone screens — see 1440-onboarding-languages.png — currently stretch full-bleed edge to edge; that is the bug this section fixes). Options list, Continue CTA: same as phone, just narrower and centered instead of full-bleed.

## 9. Motion and reduced motion

- All desktop-only additions (grid hover, sticky panels engaging/disengaging) use the existing 120ms ease token — no new duration.
- `prefers-reduced-motion`: hover shadow growth on BookTile and the fast-path CTA's brightness shift both resolve instantly (no transition), same rule as DESIGN.md's phone motion section. Sticky positioning itself is not motion and is unaffected.

### Don't (desktop-specific, in addition to DESIGN.md's list)
- Don't stretch a phone-width column to fill 1040px and call it responsive — every screen above either grids, splits into columns, or caps its measure; none simply widens.
- Don't put rails on horizontal scroll on desktop — grid + "Voir tout" only.
- Don't center Book detail's cover above the text — it's a left column, always.
- Don't let the translation or voice-controls panel scroll with the passage — it's sticky.
- Don't move settings/gift icons into the sidebar, and don't add new sidebar rows for them.
- Don't run onboarding inside the tabs shell at any width.
- Don't introduce a new color, radius, or elevation value for any desktop-only element.

## 10. Proof

At **1024** (900–1199 tier): Home shows the daily card full-width with a fixed-width gradient panel and a 3-column BookTile grid beneath it (no horizontal scrollbar on any rail); Library shows the same 3-column grid with chips wrapping if needed; Book detail shows the 280px cover column beside a left-aligned text column with the Lire/Mode vocal buttons hugging that column's width, not the full page; Reader shows the passage column and a 360px sticky translation panel side by side, transport docked to the bottom of the passage column only. At **1440** (>= 1200 tier): the same screens now show a 4-column grid, a 1040px-max content region visibly centered with real gutter on both sides of the sidebar (not a phone column stranded on the left with empty canvas to the right), and the onboarding wizard/fast-path screen rendering as a centered 560px column, not edge-to-edge. Accept when both screenshots show grids (not vertical lists or horizontal scrollers) and no screen reads as a narrow phone layout simply stretched wider.
