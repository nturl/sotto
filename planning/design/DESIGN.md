# Sotto design system (Direction A "Paper", finished level)

North star: a well-set paperback with one coral ribbon. Books are paper things on a warm desk; the app stays quiet so the text and covers carry the delight. The one tactile joy is the cutout press.

## Tokens

### Color
| token | hex | role |
|---|---|---|
| canvas | #F4ECDF | app background, every screen |
| surface | #FBF6EC | cards, sheets, docked panels, tab bar |
| surface-2 | #EFE4D2 | secondary buttons, chips, metadata strip, progress track |
| ink | #221E1B | primary text, primary-button shadow, icon strokes |
| ink-2 | #6E6459 | secondary text, inactive tab labels |
| ink-3 | #9C9287 | decorative only — 2.61:1 on canvas, never body text at any size |
| hairline | rgba(34,30,27,0.12) | borders, dividers |
| hairline2 | rgba(34,30,27,0.20) | the shelf line under a rail, and the level-scale segmented control |
| accent | #E4572E | ONE job, three places, all of them "where you are": CTA fill, the active tab, and the ribbon on the book you are in. Nowhere else. |
| peach | #F2C8B4 | the cutout shadow color, and the 55% word-selection fill |
| mark | #FFD8A8 | the saved-word marker stroke (B's sweep) |
| quiet | #B5AB9F | unspoken narration words (C's speech fill start state) |
| ok | #4E7D5B | offline/ready states only, never a button |
| warn | #B8651B | error/limit text only |

**Paper** — the six cover colours. A cover's paper is chosen by its primary collection, varied within a collection by a stable hash of the book id (run 8 PLAN decision 3). Text on a cover is ink on sand, sage and peach; canvas on teal, brick and slate.
| token | hex | text on it |
|---|---|---|
| paper.sand | #E8D6B8 | ink |
| paper.teal | #1F4F57 | canvas |
| paper.sage | #6E9A7C | ink |
| paper.brick | #8C3B2E | canvas |
| paper.peach | #F2C8B4 | ink |
| paper.slate | #2B2A28 | canvas |

**Contrast findings (measured, run 8).** These four are rules, not preferences:
- The CTA label is **ink**, not cream. Cream on accent #E4572E measures 3.45:1 and fails; ink on accent measures 5:1. Every primary cutout button sets its label in ink.
- **ink-3 is never used for text.** Measured, it is **2.61:1** on canvas — it fails 4.5:1 at every size, not only under 13px. Muted text (the tile's author line, the 11px mono metadata: page label, level stamp, eyebrows) uses **ink-2**; ink-3 is left for decoration. Run 8 fixed the tile; ~20 caption call sites elsewhere (empty states, disclaimers, the voice UI) still read ink-3 and are an open sweep, listed in `planning/run8/H-report.md`.
- **Sage is #6E9A7C**, lightened from the original #5B8A6B, so that ink text on a sage cover clears 4.5:1. Cream on the old sage failed at 13px.
- **Every text link carries a 40px hit height** — See all, the collection links, Details, Report, About this book. A text link with no box still needs a target.

Dark mode ships: Settings › Appearance offers System / Light / Dark, and every screen reads the active scheme through `useTheme()`. The dark palette is `darkColors` in `packages/core/src/theme.ts` — same token names and roles as the light one, warm charcoal rather than black. The three artwork colourways (the six cover papers, the peach selection fill and the mark band) stay light in both schemes, so text sitting on them is pinned to the light ink.

### Type
Two families. Bundled in the app: **Fraunces** (variable, opsz) for display and reading, **Inter** for UI. Sheet previews use Iowan Old Style / Georgia and system sans as stand-ins. Mono: system mono.
| role | face | size / lh / tracking | weight |
|---|---|---|---|
| display (screen titles: Pour toi, Bibliothèque, Vocabulaire, book title) | Fraunces | 34 / 1.05 / -0.015em | 300 |
| heading (section rails, sheet titles) | Fraunces | 22 / 1.15 / -0.01em | 400 |
| reading (chapter text) | Fraunces | 20 / 1.55 / 0 | 400 (Chinese: system CJK serif, 22 / 1.8) |
| ui | Inter | 16 / 1.4 | 400, 500 for buttons |
| caption | Inter | 13 / 1.4 | 400 |
| mono label | system mono | 11 / 1 / 0.08em uppercase | 400 |
Dynamic Type scales all roles proportionally; layouts must survive 130%.

### Radius, elevation, spacing
- Radius {2, 10, 9999}: 2 on covers and images, 10 on cards/sheets/buttons, 9999 only on the speaker button and the play ring.
- Elevation = the cutout: `box-shadow: 6px 6px 0 0 peach` on covers and the daily-story card; `4px 4px 0 0 ink` on the primary CTA and the translation-sheet Save button when saved. Pressed: translate(2px,2px) and shadow shrinks to 2px, 120ms ease. No blurred shadows anywhere. Cards otherwise use hairline borders.
- Spacing scale 4/8/12/16/24/32/48. Screen gutters 20 (phone), 32 (tablet), 48 (desktop). Section rhythm 32 on phone, 48 on desktop. Tap targets 44 minimum.
- Motion: 120ms ease on press/hover (transform, color, border, shadow). 240ms cubic-bezier(.2,.8,.2,1) for sheet slide and the saved-word sweep. 60ms stagger per word for speech fill. Everything resolves instantly under reduced motion.

## Signature devices (four, each with one job)
1. **The cutout** (A): covers, daily card, primary CTA. Press pushes paper flat.
2. **The marker stroke** (from B): a skewed #FFD8A8 rectangle with rough ends drawn under a word when saved, 240ms, left to right. Unsaving erases it right to left. Saved words in the reader always carry it, so a page shows your marks.
3. **Speech fill** (from C): during narration each word transitions quiet -> ink as the narrator reaches it, 60ms stagger; the current sentence gets no box. Tap-selected word: **55% peach fill** (rgba(242,200,180,.55)). 18% was invisible on canvas; the run-8 mockup's 55% is the value. No dotted underline on any token — tokens are plain until touched. Never chase words with a highlight box.
4. **The shelf** (D): every rail of books rests on a 1.5px `hairline2` line running the full width of the rail, 12px under the last caption line. Covers stand on the shelf, each with one peach cutout and no second shadow. The book you are in wears one coral ribbon over its top edge — exactly one ribbon in the app, on the most recently read incomplete book. Progress is printed, not drawn: `p. 12 of 40` in mono ink-2 under the author, replacing the progress bar entirely. One page counts as roughly one minute of reading.

## Navigation
- Phone: four tabs (Pour toi / Bibliothèque / Vocabulaire / Settings) on a surface tab bar with a top hairline. Active: accent glyph + label, 500 weight. Inactive: ink-2. Tab bar hidden on detail/reader/voice/review/search/settings.
- Session bar (voice active or resumable): 56px surface bar above the tab bar, hairline top, cover thumb 32x48 with a 2px cutout, title + mode in ui 500/caption, state word in mono, one control (mute or resume).
- Desktop >= 900: 220px left sidebar on surface with hairline right edge (24/20 padding, wordmark in Fraunces 300 at 26, text rows at 9/12 padding and radius 10, active = surface-2 fill with an ink 500 label); four nav rows, Settings pinned to the bottom; content max-width 1100 with 48 gutters. Reader is split: passage column 640 max centered, right panel 360 for translation/tutor with a hairline left edge.
- Phone tabs are four, and they carry ink glyphs at 22px with stroke 1.5: open book (Pour toi), shelves (Bibliothèque), bookmark (Vocabulaire), sun-gear (Settings). Active = accent glyph and label at 500. Bar padding 10 / 8 / 22, the bottom giving way to the safe-area inset when that is larger.
- **DESKTOP.md's 3- and 4-column book grid tiers are retired.** A rail is one horizontal shelf at every width; see "Signature devices" device D.

## Covers
Covers are typographic, drawn from the book's own metadata; there are no illustrations and no repeated motif set. A cover is:
- **Paper** from the primary collection (the Color table above), with a **3px spine strip** down the left edge in rgba(0,0,0,.22).
- **One mark** — a large initial, or one simple glyph from ✶ ◐ △ ◯ for a third of books, picked by a stable hash of the book id. The initial is the first letter of the title after a leading article is stripped (Le, La, Les, L', Un, Une, Des, El, Los, Las, Il, Lo, Gli, O, A, Os, As, The, An, Der, Die, Das, Ein); for CJK it is the first character.
- **Title** in Fraunces 300, **author** in small caps tracked, **level** as a mono stamp bottom-right.
- Radius 2, a 6px peach cutout, and nothing else. Every size scales from the 120px-wide desktop cover; the phone cover is 104x156.
Two books in the same collection differ by paper and by mark, never by a different drawing. The eight flat illustrations from v1 are retired.

## Screens (what each must contain, phone 390 unless noted)
- **Onboarding**: canvas, display title, one question per screen (App language / Explain in / I'm learning / Region or script / Level), options as surface rows with hairlines and a native-name + localized-name pair, selected row gets an accent left bar 3px. Continue = primary cutout CTA pinned above the home indicator. Voice sample row with a speaker button.
- **Home (Pour toi)**: display title with 40px icon buttons right — Search and Settings on desktop, Search alone on phone (Settings is a tab there). No gift icon. Then, in this order: **Continue reading** (a shelf, the ribboned book first, no See all), **Today's story** as a **spread** — cover left on surface-2 behind a hairline, right side eyebrow / title in display / mono meta / a primary cutout "Read" and a secondary "Listen", and a text "About this book" link. No gradient panel and no countdown. Then **Recommended for {level}** with a See all link to `/library?level=<level>`, then **Your books** when the reader has imports. New releases and the plan nag are not on Home; the plan row lives in Settings > Account. Rails are shelves: cover 120x180 desktop / 104x156 phone, title Fraunces 400 14 ink, author 12.5 ink-2, page or minutes label in mono 11 ink-2.
- **Library**: display title, a book count in mono, and an inline search field (surface-2, radius 10, search glyph, 240 wide on desktop, full width on phone) — no search-icon detour. Level as a **scale**: A0..C1 as one hairline-segmented control, selected segment = ink fill with surface text; it writes `?level=`. Collections as **plain text links** over the seven core categories, writing `?filter=`. No pills anywhere. Then the shelves. Search screen: input in surface-2 radius 10, live results as list rows with 56x84 covers.
- **Book detail**: "Retour" in accent ui 500 with chevron. Cover 180x270 centered with cutout. Title display 30, author ui ink-2, subtitle caption ink-3 "Version simplifiée". Metadata strip: surface-2 radius 10, mono "12 MIN | A1" with two 16px glyphs and a hairline divider. Heading "Qu'y a-t-il dedans ?" + synopsis ui. Disclaimer caption ink-3. Actions: **primary cutout CTA = "Lire" (read alone / continue) with narration play glyph**, secondary surface-2 button = "Mode vocal" with a waveform glyph. This ordering is deliberate: reading leads.
- **Reader**: canvas, close X top-right (ink), chapter label mono top-left. The passage column is **640 max, centered**, with the narration transport **under the passage** on desktop and at the bottom of the sheet on phone. Reading text 20/1.55 with 24 gutters. Word tokens are **plain** — no dotted underline. Selected: 55% peach fill radius 2. Saved: marker stroke. Narration playing: speech fill. Docked translation panel: surface, radius 10 top corners, hairline top, drag handle 36x4 ink-3. Word in Fraunces 24, gloss ui ink-2, Pinyin caption between them for Chinese, speaker button 44 accent ring (outline, not filled; the accent's fill is reserved for CTA and active tab). Save button: surface-2 radius 10 with bookmark glyph; saved state = ink outline 1.5px + marker-yellow fill + 4px 4px 0 ink cutout. Secondary text actions "Détails" and "Signaler" as caption ink-2 with a 40px hit height. **Panel order, on desktop and in the phone sheet alike**: word, gloss, form line (only when the token carries lemma and part-of-speech data — otherwise omitted, never a placeholder), speaker ring at the top-right of that block, then the Save / Details / Report row, then "In this passage", then "Your words in this book", then "Talk about this passage" pinned to the bottom of the panel (the last item in the sheet before the transport). Empty state text "Touchez un mot pour le traduire" caption ink-2 (ink-3 is 2.61:1; the code still says ink-3 — part of the open sweep). Narration transport below the panel: prev / -10 / play ring 56 accent outline 2px / +10 / next, segmented progress (one segment per paragraph) in surface-2 with ink fill, mono elapsed / speed / remaining.
- **Completion**: canvas, cover with cutout top, a hand-drawn arrow (single 1.5px ink SVG path with slight wobble), surface card radius 10 "Choisis ton prochain livre" with two BookTiles side by side, close X.
- **Voice screen**: C's calm within A's palette: canvas stays #F4ECDF, but chrome drops to hairlines and mono. State row: 8px dot (accent while listening, ink while tutor speaks, ink-3 paused) + mono state word. Passage with speech fill for the tutor's reading and 18% peach fill on the word being discussed. Mode switcher: four surface-2 chips, selected = ink fill. Captions: caption ink-2 in a surface strip, toggle. Controls: mute, replay, stop, end as 44px ghost icon buttons, ink strokes; push-to-talk = a 64px accent-outline ring that fills accent while held. Reconnecting/offline: caption warn text + a "Lire seul" surface-2 button. No orb.
- **Vocabulary**: display title, book selector as surface card radius 10 with cover thumb, title, "2 mots" caption, chevron. Word cards: surface, hairline, speaker button 40 accent outline, word Fraunces 20 with marker stroke under it, gloss ui ink-2, trash glyph ink-3 right. Undo toast: ink surface, surface text, 4s. Bottom CTA: primary cutout "Commencer la révision (12)".
- **Review**: one card centered, surface radius 10, word Fraunces 30, speaker, "Afficher la traduction" ui link; ratings as three surface-2 buttons (À revoir / Difficile / Facile), tutor-suggested one gets an ink outline. Progress mono "4 / 12". Summary screen with cutout CTA "Recommencer".
- **Profile/settings**: "Retour" accent. Grouped surface cards radius 10 with hairline rows: LANGUES (I'm learning / Explain in / App language, values ui ink-2 with chevrons), PRÉFÉRENCES DU TUTEUR rows, DONNÉES (Exporter / Importer / Réinitialiser), À PROPOS (Confidentialité / Conditions / Donner un retour / Licences du contenu). Section eyebrows mono ink-3. Destructive row text warn. No subscription rows, no referral card.

## Don't
- No blurred shadows, no glass, no gradients on surfaces (the daily card's teal panel and nothing else).
- No accent outside CTA fill and active tab; the speaker ring uses accent as a 2px outline only.
- No bold Fraunces. Weight 300/400 only.
- No pill-chip navigation, no orb, no mascot, no flags as language identifiers.
- **No pill chips anywhere** — not for filters, not for "See all", not for actions. Filters are a segmented scale or plain text links.
- No progress bars on covers; the ribbon and the printed page label carry progress.
- No second shadow on a tile — one peach cutout and nothing beneath it.
- No countdown on the daily story.
- No repeated cover motif; covers are typographic (see "Covers").
- No highlight box chasing narration; speech fill only.
- No inline colors in screens; every value comes from the token file.
