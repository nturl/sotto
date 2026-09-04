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
| ink-3 | #9C9287 | muted/legal text (4.5:1 on canvas) |
| hairline | rgba(34,30,27,0.12) | borders, dividers |
| accent | #E4572E | ONE job: primary CTA fill + active tab. Nowhere else. |
| peach | #F2C8B4 | the cutout shadow color, and the 18% word-selection fill |
| mark | #FFD8A8 | the saved-word marker stroke (B's sweep) |
| quiet | #B5AB9F | unspoken narration words (C's speech fill start state) |
| ok | #4E7D5B | offline/ready states only, never a button |
| warn | #B8651B | error/limit text only |

Dark mode: not in v1. App is light-only; system bars handled (status bar dark content).

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

## Signature devices (exactly three, each with one job)
1. **The cutout** (A): covers, daily card, primary CTA. Press pushes paper flat.
2. **The marker stroke** (from B): a skewed #FFD8A8 rectangle with rough ends drawn under a word when saved, 240ms, left to right. Unsaving erases it right to left. Saved words in the reader always carry it, so a page shows your marks.
3. **Speech fill** (from C): during narration each word transitions quiet -> ink as the narrator reaches it, 60ms stagger; the current sentence gets no box. Tap-selected word: 18% peach fill. Never chase words with a highlight box.

## Navigation
- Phone: three tabs (Pour toi / Bibliothèque / Vocabulaire) on a surface tab bar with a top hairline. Active: accent icon + label, 500 weight. Inactive: ink-2. Tab bar hidden on detail/reader/voice/review/search/settings.
- Session bar (voice active or resumable): 56px surface bar above the tab bar, hairline top, cover thumb 32x48 with a 2px cutout, title + mode in ui 500/caption, state word in mono, one control (mute or resume).
- Desktop >= 900: 220px left sidebar on surface with hairline right edge; wordmark in Fraunces 300; three nav rows; content max-width 1100. Reader is split: passage column 620 max, right panel 360 for translation/tutor.

## Screens (what each must contain, phone 390 unless noted)
- **Onboarding**: canvas, display title, one question per screen (App language / Explain in / I'm learning / Region or script / Level), options as surface rows with hairlines and a native-name + localized-name pair, selected row gets an accent left bar 3px. Continue = primary cutout CTA pinned above the home indicator. Voice sample row with a speaker button.
- **Home (Pour toi)**: display title with two 40px icon buttons right (settings glyph, gift glyph, ink strokes). Daily-story card: surface with a deep-teal (#1F4F57) to sage (#5B8A6B) gradient panel on the left third holding the cover with cutout, right two-thirds ink text on surface, mono eyebrow "HISTOIRE DU JOUR", live countdown in mono. Rails: heading + horizontal scroll of BookTile (cover 110x165 cutout, title caption ink, author caption ink-2, 3px progress bar in surface-2 with accent fill when in progress).
- **Library**: display title + search icon. Chips: outlined hairline pills in surface-2 text ink; selected chip = ink fill, surface text (no accent). Rails as Home with "Voir tout" in ui 500 ink-2. Search screen: input in surface-2 radius 10, live results as list rows with 56x84 covers.
- **Book detail**: "Retour" in accent ui 500 with chevron. Cover 180x270 centered with cutout. Title display 30, author ui ink-2, subtitle caption ink-3 "Version simplifiée". Metadata strip: surface-2 radius 10, mono "12 MIN | A1" with two 16px glyphs and a hairline divider. Heading "Qu'y a-t-il dedans ?" + synopsis ui. Disclaimer caption ink-3. Actions: **primary cutout CTA = "Lire" (read alone / continue) with narration play glyph**, secondary surface-2 button = "Mode vocal" with a waveform glyph. This ordering is deliberate: reading leads.
- **Reader**: canvas, close X top-right (ink), chapter label mono top-left. Reading text 20/1.55 with 24 gutters. Word tokens: dotted 1px underline in peach at 35% (subtle; only visible on close look). Selected: 18% peach fill radius 2. Saved: marker stroke. Narration playing: speech fill. Docked translation panel: surface, radius 10 top corners, hairline top, drag handle 36x4 ink-3. Word in Fraunces 24, gloss ui ink-2, Pinyin caption between them for Chinese, speaker button 44 accent ring (outline, not filled; the accent's fill is reserved for CTA and active tab). Save button: surface-2 radius 10 with bookmark glyph; saved state = ink outline 1.5px + marker-yellow fill + 4px 4px 0 ink cutout. Secondary text actions "Détails" and "Signaler" as caption ink-2. Empty state text "Touchez un mot pour le traduire" caption ink-3. Narration transport below the panel: prev / -10 / play ring 56 accent outline 2px / +10 / next, segmented progress (one segment per paragraph) in surface-2 with ink fill, mono elapsed / speed / remaining.
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
- No highlight box chasing narration; speech fill only.
- No inline colors in screens; every value comes from the token file.
