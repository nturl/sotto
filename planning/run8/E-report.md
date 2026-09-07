# Lane E report — nav glyphs, tab bar, sidebar, DESIGN.md

Wave 1. Owned files only. All claims below are VERIFIED (read/run/seen) unless marked INFERRED.

## Commits (pushed to origin/HEAD)

| SHA | What |
| --- | --- |
| `cf61631` | `run8(E): mockup glyph paths, tab glyphs, useTheme in GlyphShell` — `apps/client/src/ui/Glyphs.tsx` |
| `d2fa5c6` | `run8(E): tab bar on the mockup's four glyphs, sidebar to the mockup` — `navRows.ts`, `TabBar.tsx`, `TabBar.test.ts`, `Sidebar.tsx` |
| `29ec267` | `run8(E): DESIGN.md to the v2 system` — `planning/design/DESIGN.md` |

`IconButton.tsx` was **not** touched: the 40px ink button already matches the mockup's `.ib` (40x40, radius 10, transparent, ink strokes) once the glyphs carry 1.6 strokes, so no variant was needed.

## Glyphs for lanes B / C / D

Added (new exports in `src/ui/Glyphs.tsx`, all landed in `cf61631` so they are available now):

| Export | Mockup source | Notes |
| --- | --- | --- |
| `BookOpenGlyph` | `app-mockup-v2.html:345` | For you tab. The split open book. **Not** the pre-existing `OpenBookGlyph`, which is the older single-spine drawing still used by the book-detail metadata strip — both now exist. |
| `ShelvesGlyph` | `:346` | Library tab. Three upright books plus a leaning fourth. |
| `GearGlyph` | `:348` / `:289` | Settings **tab** — the sun-style gear. Distinct from `SettingsGlyph` (the cog at `:206`), which stays as the title-row icon button. |

Changed (same names, mockup paths and stroke weights):

| Export | Change |
| --- | --- |
| `SearchGlyph` | path `M21 21l-4.3-4.3` → `M20 20l-3.5-3.5`; default stroke 1.8 → **1.6** (`.ib svg` / `.search svg`) |
| `CloseGlyph` | path → `M6 6l12 12M18 6 6 18`; stroke 2 → **1.6** |
| `SpeakerGlyph` | path → `M4 9v6h4l5 4V5L8 9H4z` + `M16 9a4 4 0 0 1 0 6`; stroke 2 → **1.8** (`.spk svg`) |
| `BookmarkGlyph` | path already matched the mockup (`M6 3h12v18l-6-4-6 4z`); stroke 2 → **1.8** (`.save svg`). Doubles as the Vocabulary tab glyph at 1.5. |
| `MicGlyph` | body `Rect` → the mockup's capsule path `M12 3a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z`; stroke stays 1.8 |
| `SkipPrevGlyph` / `SkipNextGlyph` | were **filled** `Svg`s; now stroked `GlyphShell`s at **1.6** with the mockup's `.tc svg` paths. Signature is unchanged (`GlyphProps`), but a caller that relied on the fill look will see a stroke — lane D, this is the transport pair. |
| `PlayGlyph` | triangle recentred to `M7 4l13 8-13 8z` so it reads as the mockup's 12px triangle inside the 44px accent ring. Still a filled `Svg`, not stroked. |
| every glyph | `strokeLinecap="round"` / `strokeLinejoin="round"` added on `GlyphShell` |

**Risk 10 closed.** `GlyphShell`, `PlayGlyph`, `PauseGlyph` and `HandDrawnArrowGlyph` no longer read the module-scope `themeColors` proxy; a `useGlyphColor(color?)` hook calls `useTheme()` and falls back to the live `colors.ink`. `Glyphs.tsx` no longer imports `themeColors` at all (`grep` confirms one remaining mention, in a comment).

If a lane needs a glyph that still does not exist, draw it locally and say so (PLAN decision 12); I will fold it in during wave 2.

## Tab bar

`navRows.ts` now carries the row → glyph pairing as plain data, so it is testable without a `react-native` import:

- `NavGlyphName = 'bookOpen' | 'shelves' | 'bookmark' | 'gear'`, `NAV_GLYPH_NAMES` (tab order), `NAV_GLYPHS` (route name → glyph).
- `NavRow` gains a required `glyph`; `TabRow` gains an optional one; `buildTabRows` stamps each route from `NAV_GLYPHS` and gives the appended settings row `gear`. An unknown route name yields `undefined` rather than a guessed glyph.

`TabBar.tsx`: `TAB_GLYPHS` maps the name to the component; glyphs draw at **22px, stroke 1.5**, coloured `accent` when focused and `ink2` otherwise (unchanged logic); label stays `role="caption" size={11}` at Inter Medium when focused. Bar padding is the mockup's `10 / 8 / 22`, with `Math.max(insets.bottom, 22)` so a device's safe-area inset takes over when it is larger. The `width >= 900` literal is now `DESKTOP_BREAKPOINT` imported from `Shell.tsx` (no import cycle: `Shell` imports `Sidebar`, never `TabBar`).

e2e: `accessibilityRole="tab"` and the visible labels are untouched, so `e2e/rows.mjs:188` (`getByRole('tab', { name: 'For you' })`) still resolves. No e2e script was edited.

## Sidebar

Matched to `.side` / `.nav` / `.wordmark`: wordmark `role="display"` **26** (was 22), rows `paddingVertical: 9` (was 10), `borderRadius: radius.md` = 10 (was `space.sm` = 12), `marginBottom: 2` (was 4). Padding 24/20, width 220, active surface-2 + ink 500 were already right. Text rows, no glyphs, Settings pinned bottom — unchanged. `SIDEBAR_WIDTH = 220` is now a named export instead of a literal.

**One deliberate deviation:** the row keeps `minHeight: space.tapTarget` (44). The mockup's row box is 38 tall. DESIGN.md "Radius, elevation, spacing" requires a 44 minimum, so the surface-2 active fill is 6px taller than the mockup's. A comment in `Sidebar.tsx` says so. Flag for lane R if the frame comparison should win instead.

## DESIGN.md

Every existing section heading is preserved (RECON risk 12 — ~20 code comments cite them). One heading text changed: `## Signature devices (exactly three, each with one job)` → `(four, each with one job)`; the device letters A/B/C that comments cite are unchanged and the shelf is added as **D**.

Sections touched:
- **Tokens › Color** — `accent` job widened to "CTA fill, the active tab, and the ribbon on the book you are in"; `hairline2` row added; a **Paper** sub-table with the six cover colours (sage #6E9A7C) and which text colour sits on each; a **Contrast findings (measured, run 8)** block with the four verify findings (ink CTA label at 5:1 vs cream at 3.45:1; ink-3 never under 13px so mono metadata is ink-2; sage lightened; 40px link hit height).
- **Signature devices** — device **D, the shelf** (1.5px hairline2 under every rail, one cutout per cover, one ribbon on the current book, printed `p. X of Y` instead of a bar). Device 3 now records the **55% peach** selection fill and "no dotted underline on any token".
- **Covers** (new section, between Navigation and Screens) — paper by collection, 3px spine, one mark (initial after stripping a leading article, or one of ✶ ◐ △ ◯ by hash), Fraunces 300 title, small-caps author, mono level stamp, 6px cutout, no repeated motif, v1's eight illustrations retired.
- **Navigation** — phone is four tabs with the four ink glyphs at 22/1.5 and the 10/8/22 bar; the desktop bullet gets the sidebar's real numbers and the 640 passage column; **DESKTOP.md's 3- and 4-column grid tiers retired** in one line pointing at device D.
- **Screens › Home** — v2 order: Search/Settings icon buttons (Search only on phone, no gift), Continue reading first, Today's story as a spread with Read / Listen / About, Recommended for {level} with See all → `/library?level=`, Your books; New releases and the plan nag leave Home.
- **Screens › Library** — inline search field, A0..C1 hairline-segmented level scale writing `?level=`, collections as plain text links writing `?filter=`, no pills.
- **Screens › Reader** — 640 centered passage, transport under the passage (bottom of the sheet on phone), plain tokens, 55% selection fill, and the full v2 panel order including the omit-don't-placeholder rule for the form line and "Talk about this passage" pinned to the bottom.
- **Don't** — five new lines: no pill chips anywhere (filters, See all, actions); no progress bars on covers; no second shadow on a tile; no countdown on the daily story; no repeated cover motif.

## Proof

- **Failing test first.** `TabBar.test.ts` gained a `tab glyph pairing` describe block; it failed 3/4 (`glyph` undefined, `NAV_GLYPH_NAMES` undefined) before `navRows.ts` was changed — `Test Files 1 failed | 33 passed`, `Tests 3 failed | 282 passed`.
- `pnpm --filter @sotto/client test` → **35 files, 300 tests, all passing** (the count includes other lanes' new tests landing in the shared tree).
- `pnpm -r typecheck` → all 5 projects Done, 0 errors.
- `pnpm lint` → **0 errors**, 23 warnings, all pre-existing and all in files this lane does not own (`fill-locales.mjs`, unused `_`-prefixed destructures).
- `pnpm exec prettier --check` on `Glyphs.tsx`, `TabBar.tsx`, `TabBar.test.ts`, `Sidebar.tsx`, `navRows.ts`, `planning/design/DESIGN.md` → all clean.
- No i18n keys were added or changed (the four tab labels already exist as `tabs.*` in all nine files).

## Screenshots (live Metro :8081, no page or console errors)

| File | Frame it answers to |
| --- | --- |
| `~/Claude/sotto-run8/E/375-home.png` | mockup frame 4, phone For you |
| `~/Claude/sotto-run8/E/375-library.png` | mockup frame 5, phone Library |
| `~/Claude/sotto-run8/E/375-reader.png` | mockup frame 6, phone Reader |
| `~/Claude/sotto-run8/E/375-tabbar-crop.png` | **zoom crop, 3x DPR**, tab bar vs `app-mockup-v2.html:344-349` |
| `~/Claude/sotto-run8/E/1440-home.png`, `1440-library.png`, `1440-reader.png` | mockup frames 1-3 |
| `~/Claude/sotto-run8/E/1440-sidebar-crop.png` | **zoom crop, 2x DPR**, sidebar vs frames 1-2 |

Read and compared against the mockup:
- **Tab bar VERIFIED** — all four glyphs render as the mockup draws them (split open book, shelves, bookmark, sun-gear), 22px, even weight, round caps. "For you" is accent glyph + accent 500 label; the other three are ink-2. Surface bar, hairline top, 10/8/22 padding. `375-library.png` confirms the active state moves to Library with the shelves glyph in accent.
- **Sidebar VERIFIED** — "Sotto" at Fraunces 300 / 26, active "For you" row on surface-2 with an ink 500 label and radius 10, inactive rows ink-2, hairline right edge, Settings pinned to the bottom (below the crop).
- **Reader VERIFIED** (glyph regressions only) — mic, close, speaker-in-accent-ring, bookmark on Save, the newly stroked skip-prev/next and the recentred play triangle all render correctly at their call sites.

## Not verified / needs Noel

- **Native only:** the safe-area substitution (`Math.max(insets.bottom, 22)`) is INFERRED. `insets.bottom` is 0 on web, so the shots show the flat 22px. Cannot be checked without a device or simulator run.
- **Dark mode:** the `useTheme()` migration in `Glyphs.tsx` is VERIFIED to compile and render in light mode; the actual scheme-switch fix is INFERRED — DESIGN.md says dark mode is not in v1 and there is no in-app toggle to exercise.
- Everything else visible in the phone shots (pills on Library, illustrated covers, progress bars, New releases on Home, the gift icon in the title row) belongs to lanes A / B / C and is untouched here.
- **Escalation: none.** Nothing needed two attempts. The one judgement call is the 44px sidebar row minimum vs the mockup's 38 — recorded above for lane R.
