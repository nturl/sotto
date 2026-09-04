# Sotto — design directions spec (Cleo, 2026-09-04)

Product: open-source graded-reader app (books, audiobook narration with word sync, tap-to-translate, saved vocabulary, review) with a live voice tutor. Targets iPhone + responsive web. Reference product: the reference app (warm cream, coral accent, serif reading text, peach offset cover shadows). We keep the concept and rebuild the expression.

Fit read: reader's job is absorbing text for 5 to 15 minutes at a time, then occasionally acting (save word, answer tutor). Temperature: warm, low-stakes, daily habit. Venue: phone in hand, sometimes a laptop. Lives for years, opened daily, so quiet-every-time beats spectacular-once, and the fun must come from one device, not from chrome.

Axis for the three directions: WHERE THE DELIGHT LIVES.
A = in the object (books as paper things). B = in the chrome (color as emotion, sticker controls). C = in the voice (the text itself speaks).

Shared, non-negotiable across all three (the fundamentals):
- Tinted canvases, never #fff/#000. Text never pure black.
- One saturated accent per direction with one stated job. Secondary hues only inside cover illustrations.
- Reading text is a serif (Iowan Old Style / Charter / Georgia stack on the sheet; the app will bundle a face). Controls in one sans. Mono only for tiny metadata (11px, uppercase, 0.08em).
- Hierarchy by size and tracking, not bold. Display weights 300 to 500, except where a direction names a single-weight heavy rounded face as its one display face.
- Radius vocabulary of at most 3 values per direction, semantic.
- Motion: 120 to 150ms on hover/press; 180 to 400ms named cubic-bezier for the one celebratory moment. Frozen under prefers-reduced-motion.
- Tap targets 44pt. Word tokens in the reader get a dotted 1px underline in the accent at 35% alpha; selected word gets a translucent accent fill at 18%.

Ban list (all directions): no glass/blur cards, no gradient washes on surfaces (one gradient allowed only on the primary CTA in B), no mascot or parrot, no pill-chip rows as the main navigation, no 3-up card grid on the sheet, no the reference app strings/covers/logo, no em dashes anywhere in copy.

## Direction A: "Paper" (delight in the object)
Thesis: a book is a thing you hold. Every cover is a paper cutout sitting on the page; the app is the desk.
Anchor: Medium cream broadsheet (monochrome discipline, serif that is never bold) crossed with Shade's hard offset shadow (paper cutout, zero blur).
Canvas #F4ECDF (warm oat). Ink #221E1B. Secondary text #6E6459. Accent: #E4572E coral, job = primary CTA fill and the cutout shadow color only. Cover shadow: 6px 6px 0 0 #F2C8B4 (peach, hard, zero blur); CTA shadow 4px 4px 0 0 #221E1B.
Type: display = serif at 300 to 400 (Iowan Old Style / Georgia), 34 to 44px on phone, -0.015em; UI = system sans 400/500 at 15 to 17px; mono labels 11px.
Radii: {2, 10}. 2 on covers and images, 10 on sheets/buttons.
Signature device: THE CUTOUT. Covers, the daily-story card, the translation sheet, and the primary button all cast the same hard offset shadow. Press a button: it moves 2px down-right and the shadow shrinks to 2px (the paper gets pushed flat). That press is the app's single tactile joy.
Hero fragment to render: a book detail top half at phone scale (390px wide frame, real type sizes): cover 150x225 with the cutout shadow, title in serif 300 at 34px, author, a rounded metadata strip (mono "12 MIN · A1"), and two actions: filled coral "Start voice mode" with cutout shadow, and a bone-colored "Read alone". Beside it, a second fragment: a row of three original covers (draw them as inline SVG with simple geometric illustration in three different flat palettes; no text on them except a title in the serif) sitting on a hairline "shelf" rule, each casting the cutout shadow.
Commits to: tactility, calm, editorial confidence. Trades away: overt playfulness; on a phone the hard shadow needs discipline or it reads as retro. Right when: Noel wants adults to feel this is a serious reading habit that happens to be charming.
Taken all the way: the whole app feels like a well-set paperback with one coral ribbon.

## Direction B: "Highlighter" (delight in the chrome)
Thesis: learning is marking things up. Color is a highlighter pen you drag over the words.
Anchor: Duolingo classroom (sticker buttons with a real 2px border, one heavy rounded display face) crossed with Ramp's highlighter-marker device.
Canvas #FFF6E8 (warm cream). Ink #1F1A17. Secondary #7A6E64. Accent: #FF5A3C coral, job = the highlighter stroke and the primary sticker button. One allowed gradient: primary CTA #FF5A3C to #F0440A, horizontal. Highlighter tints: #FFD8A8 (current word during narration), #FFE9CF (already-narrated span). Saved-word marker: #FFD8A8 fill with a 2px #1F1A17 outline.
Type: display = system rounded (ui-rounded / SF Rounded fallback to Nunito-like stack) 700 as the ONE heavy face, 30 to 40px, normal tracking; reading serif 19px/1.55; UI sans 400/500; mono 11px.
Radii: {12, 9999}. 12 on cards and sticker buttons (2px border #1F1A17 at 12% alpha on secondary, solid ink on primary outline), 9999 on chips and the play control.
Signature device: THE HIGHLIGHTER SWEEP. During narration the highlight is a marker stroke drawn left to right across the current word (a skewed rectangle with slightly rough ends, animated width over 180ms with cubic-bezier(.2,.8,.2,1)), leaving a paler stroke behind on read text. Saving a word "caps" it with the ink outline. Same stroke appears behind the "For you" heading as a static mark.
Hero fragment to render: the reader at phone scale (390px frame): 5 lines of Spanish A1 prose (write original text about a fox and a crow, public-domain fable retelling, 40 to 60 words, no the reference app text), narration mid-sentence with the sweep frozen mid-word on one word and paler strokes on the words before it, one word tapped and outlined; below, a docked translation panel (12px radius, hairline top, no shadow) with the word in serif 24px, the French gloss 15px, a coral circular speaker button, and a sticker "Save" button with the 2px border. Then the transport row: prev / -10 / play (56px ring in coral) / +10 / next, and a segmented progress bar with elapsed, "1.0x", remaining in mono. Add a JS toggle that replays the sweep animation on click.
Commits to: fun, energy, instant legibility of state (narration progress is visible as marks). Trades away: calm; risks reading young, and heavy rounded type will fight the serif if used beyond headings. Right when: Noel wants the app to feel like a game you play with a pen, and daily-return energy matters more than gravitas.
Taken all the way: every screen has one marker stroke and nothing else colored; the sweep is the brand.

## Direction C: "Voice" (delight in the voice)
Thesis: the tutor is a presence in the text, not a widget above it. The words themselves light up as they are spoken.
Anchor: Things (Apple keynote at half volume, cool mist canvas, restraint as brand) crossed with Haptic's scroll word-fill, repurposed as SPEECH-fill. Defies the warm-consumer gravity knowingly.
Canvas #F2F1EC (cool stone). Ink #1B1D22. Secondary #6B7079. Accent: #1D6B5F deep teal, job = the spoken-word fill and the single live-state dot. No coral anywhere. Tutor bubble: none. The tutor's presence is the fill.
Type: display = serif 300 at 36 to 46px, -0.02em (Iowan / Georgia); reading serif 20px/1.6; UI sans 400/500; mono 11px for state words.
Radii: {0, 8}. 0 on everything content, 8 on the one docked panel.
Signature device: SPEECH FILL. As the tutor speaks, each word's color transitions from #9AA0A8 (unspoken, quiet) to ink, in order, with a 60ms stagger; the learner's own reading, when captured by the mic, fills in teal instead of ink, so a glance shows who said what. A single 8px teal dot next to a plain mono state word ("LISTENING", "TUTOR SPEAKING", "PAUSED") is the only status chrome. No orb, no waveform.
Hero fragment to render: the voice screen at phone scale (390px frame): the state row (dot + mono word), 6 lines of French A1 prose (original text about a cat and a market, 50 to 70 words), with the first 60% filled ink, the next two words filled teal (learner read them), the rest quiet gray; a hairline; then a compact docked caption line in sans showing the last tutor sentence, and a control row of four ghost icon buttons (mute, replay, stop, end) drawn as 24px inline SVG strokes, no fills. Add a JS "Play" control that runs the fill animation across the passage once (respect prefers-reduced-motion by showing the end state).
Commits to: premium calm, the tutor as the product, accessibility (state is always a word). Trades away: warmth and obvious fun; a cool stone canvas is a harder sell for a "cozy books" habit; no color joy for the library screens. Right when: Noel wants the voice tutor to be the reason people talk about this app and is fine letting the library be quiet.
Taken all the way: the whole app is stone and ink with one teal that only ever means "spoken".

## Sheet structure (the deliverable)
One self-contained HTML file at ~/Claude/sotto/design/directions.html. No external requests, no CDN fonts, system font stacks only, inline SVG only.
- Sheet chrome: canvas #EDEBE6, ink #1B1D22, mono labels. Title "Sotto: three directions", one line stating the axis. Max width 1100px, sections separated by 1px hairlines, 96px vertical rhythm.
- Three full-width bands, each with its OWN scoped class and local custom properties (its own tokens), its own canvas color filling the band edge to edge. Inside each band: left column (name, thesis line "This direction says: ...", Commits to / Trades away / Right when / Build DNA / Taken all the way as labeled blocks with mono eyebrows), right column the rendered hero fragment(s) at real phone scale inside a plain 390px-wide frame with a 1px hairline and 40px radius corners (no notch, no device art). At widths under 900px the columns stack, fragment first.
- Every band shows a swatch strip (5 swatches with hex labels in mono) and a type specimen line (display / reading / UI / mono at real sizes).
- Reply builder at the bottom: per band, three toggle chips "steal" / "skip" / "go deeper" (plain 2px-underline tabs, not pills), plus a "Base direction" radio. A textarea composes a paste-ready instruction such as "Build B, take A's cutout shadow on covers, skip C. Go deeper on B." with a Copy button. State in localStorage, wrapped in try/catch.
- Add <meta charset="utf-8"> and a viewport meta. Include a minimal dark-mode block for the SHEET CHROME only (bands keep their own committed light canvases): under @media (prefers-color-scheme: dark) guarded with :root:not([data-theme="light"]) and again under :root[data-theme="dark"], sheet canvas #141518 and sheet ink #D6D5D0. All tokens declared on bare :root first.
- All clamp() math must have spaces around operators. No unspaced clamp.
- Reduced motion: all animations resolve to their end state.
- Copy: honest captions ("Direction fragment, not a finished comp"). No em dashes anywhere.
