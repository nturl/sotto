SUBTASK: Draw eight book-cover artworks as SVG for a graded-reader app (Sotto), direction "The Mise-en-scene".

INPUTS:
Direction anchor: Folio Society flat-scene jackets and Charley Harper geometry: a whole place in four tones.
Art rule: A full-bleed flat scene with a horizon or a stage: a place, a time of day, a weather, and ONE actor or object in it (a small rider before three windmills at dusk; a farmhouse lifting into a funnel; a girl on a forest path; a lone tortoise on a riverbank under a jaguar-shaped shadow). Four tones total, large simple shapes, no outlines, silhouettes not portraits. Then paint a SOLID band from y 250 to 330 in one of the scene's tones; leave that band empty (the app prints the title on it).
Canvas: viewBox="0 0 220 330", width 220 height 330. The cover will be shown 120px and 104px wide, so every shape must still read there: nothing thinner than 2 units, no detail smaller than 10 units, under 60 elements per cover. Flat fills only.
Palette (use 3 to 4 per cover, one of them as the ground; choose from the STORY, never at random, and give the eight covers eight different grounds where the stories allow): sand #E8D6B8, teal #1F4F57, sage #6E9A7C, brick #8C3B2E, peach #F2C8B4, slate #2B2A28, ink #221E1B, canvas #F4ECDF, marker #FFD8A8, forest #4E7D5B, ochre #B8651B.
BANNED: gradients, filters, drop shadows, strokes with stroke-width under 2, emoji, any <text> or letterforms, faces with features (one dot for an eye at most), the colour #E4572E, reusing a motif across two books, any element outside the viewBox, external references, raster images.
Text zone: the solid band y 250..330. The app prints the title over it, so it must be plain.

The eight books:
- en-poe-tell-tale-heart: "The Tell-Tale Heart" (The Tell-Tale Heart) by Edgar Allan Poe, level C1, collections ['classics']. Premise: A nameless narrator insists he is not mad, even as he confesses, in obsessive and feverish detail, to murdering an old man over nothing more than the look of his pale, clouded eye.
- fr-maupassant-la-parure: "La Parure" (The Necklace) by Guy de Maupassant, level B2, collections ['classics']. Premise: A poor clerk's wife borrows a diamond necklace for one glorious evening — and loses it, setting off ten years of ruinous debt for a secret that will finally, cruelly, come out.
- es-quijote-molinos: "Don Quijote y los molinos" (Don Quixote and the Windmills) by Miguel de Cervantes, level A1, collections ['classics']. Premise: An elderly gentleman who believes he is a knight-errant embarks on adventures with his practical squire.
- en-oz-cyclone: "Dorothy and the Cyclone" (Dorothy and the Cyclone) by L. Frank Baum, level A1, collections ['adventure']. Premise: A powerful cyclone carries Dorothy and her dog Toto from Kansas into a magical land.
- fr-petit-chaperon-rouge: "Le Petit Chaperon rouge" (Little Red Riding Hood) by Charles Perrault, level A0, collections ['tales']. Premise: A little girl meets a clever wolf while visiting her sick grandmother.
- zh-chengyu-stories: "三个成语故事" (Three Chinese Idiom Stories) by Traditional (ancient Chinese sources: Han Feizi, Zhan Guo Ce), level A0, collections ['idioms']. Premise: Three classic fables behind famous Chinese idioms, retold in very simple modern Mandarin.
- pt-jabuti-onca: "O jabuti e a onça" (The Tortoise and the Jaguar) by Sílvio Romero (collector), level A0, collections ['folk']. Premise: A clever little tortoise makes a flute from an old bone and outsmarts a hungry jaguar in the Brazilian forest.
- es-larra-vuelva-usted: "Vuelva usted mañana" (Come Back Tomorrow) by Mariano José de Larra, level C1, collections ['classics', 'daily']. Premise: A Spanish narrator watches a brisk Frenchman try to settle his affairs in Madrid in fifteen days, only to be swallowed by an endless chain of offices that always say the same thing: come back tomorrow.

ACCEPTANCE CRITERIA:
1. Exactly eight SVGs, one per book id, each a complete standalone <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 330" width="220" height="330"> ... </svg> that parses.
2. Every fill is one of the eleven palette hexes (uppercase), no other colours, no gradients or filters, no <text>.
3. Each cover uses 3 to 4 palette tones including its ground, and the ground differs across the set wherever the stories allow (at least 6 distinct grounds across 8).
4. The art follows the direction's art rule exactly, including the empty text zone.
5. Every cover is recognisably THIS story to someone who knows it, and no two share a motif.

OUTPUT FORMAT: Markdown. For each book, in the order listed above:
### <book id>
```svg
<svg ...>...</svg>
```
TEXT INK: ink | canvas   (which text colour reads on the text zone: ink #221E1B or canvas #F4ECDF, whichever clears 4.5:1 on the zone's fill)
MOTIF: <five words naming the drawn thing>
WHY: <one sentence tying the motif and the ground colour to the story>

Nothing else before or after the eight sections. No preamble.

PROOF: The SVG source itself is the proof; it will be rendered at 120px and 104px and read by eye.
PERMISSIONS: Write nothing to disk. Produce text only.
STOP WHEN: The eight sections are written once. Do not iterate or offer alternatives.
ESCALATE WHEN: A story genuinely has no drawable motif under the ban list; then draw your best abstract reading of it and say so in WHY, rather than skipping the book.
