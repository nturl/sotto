SUBTASK: Draw eight book-cover artworks as SVG for a graded-reader app (Sotto), direction "The Mise-en-scene" (every book is a place and a weather).

INPUTS:
Direction anchor: Folio Society flat-scene jackets and Charley Harper geometry: a whole place in four tones.
Art rule: A full-bleed flat scene with a horizon or a stage: a place, a time of day, a weather, and ONE actor or object in it (a small rider before three windmills at dusk; a farmhouse lifting into a funnel; a girl on a forest path; a lone tortoise on a riverbank under a jaguar-shaped shadow). Four tones total, large simple shapes, no outlines, silhouettes not portraits. Then paint a SOLID band from y 232 to 330 (a <rect x="0" y="232" width="220" height="98"/>) in one of the scene's tones as the LAST element; leave that band empty (the app prints the title on it). The band tone must clear 4.5:1 against either ink #221E1B or canvas #F4ECDF; say which in TEXT INK.
Canvas: viewBox="0 0 220 330", width 220 height 330. The cover will be shown 120px and 104px wide, so every shape must still read there: nothing thinner than 2 units, no detail smaller than 10 units, under 60 elements per cover. Flat fills only.
Palette (use exactly 3 to 4 per cover including the band; choose from the STORY, never at random; vary the grounds across the set): sand #E8D6B8, teal #1F4F57, sage #6E9A7C, brick #8C3B2E, peach #F2C8B4, slate #2B2A28, ink #221E1B, canvas #F4ECDF, marker #FFD8A8, forest #4E7D5B, ochre #B8651B.
These eight join a shelf of forty; the eight already drawn use these scenes, so do NOT repeat them: a hidden heart under floorboards, a diamond necklace on velvet, a rider before windmills, a farmhouse in a cyclone, a red cloak on a forest path, a farmer by a rabbit stump, a tortoise under a jaguar shadow, a visitor before closed office doors.
BANNED: gradients, filters, drop shadows, strokes with stroke-width under 2, emoji, any <text> or letterforms, faces with features (one dot for an eye at most), the colour #E4572E, reusing a scene across two books, any element outside the viewBox, external references, raster images.

The eight books:
- en-aesop-fables: "Four Fables of Aesop" (Four Fables of Aesop) by Aesop, level A0, collections ['fables']. Premise: Four classic short tales with simple animal characters and timeless lessons.
- en-alice-rabbit-hole: "Alice Goes Down the Rabbit Hole" (Alice Goes Down the Rabbit Hole) by Lewis Carroll, level A1, collections ['classics']. Premise: A curious girl follows a clothed white rabbit down a deep hole into a world of locked doors and changing sizes.
- fr-chat-botte: "Le Chat botté" (Puss in Boots) by Charles Perrault, level A1, collections ['tales']. Premise: A clever cat uses boots and bold tricks to change his poor master's life.
- fr-chevre-de-m-seguin: "La Chèvre de M. Seguin" (La Chèvre de M. Seguin) by Alphonse Daudet, level A2, collections ['fables', 'classics']. Premise: A spirited young goat longs for freedom from her rope and her master's small yard, and gets one unforgettable day of it on the wild mountain.
- es-quiroga-tortuga-gigante: "La tortuga gigante" (The Giant Tortoise) by Horacio Quiroga, level B1, collections ['tales', 'classics']. Premise: A sick hunter saves a giant tortoise from a jaguar deep in the jungle, and the grateful animal later saves his life in return.
- it-de-amicis-scrivano: "Il piccolo scrivano fiorentino" (The Little Florentine Scribe) by Edmondo De Amicis, level B1, collections ['classics', 'daily']. Premise: In Florence, a boy named Giulio secretly takes over his exhausted father's night work, hiding the truth even as it costs him his father's affection.
- es-clarin-adios-cordera: "¡Adiós, Cordera!" (Farewell, Cordera!) by Leopoldo Alas "Clarín", level B2, collections ['classics']. Premise: In a green meadow in Asturias, two poor siblings and their beloved old cow watch the railway arrive — and learn, twice over, what a train can take away.
- es-dario-rey-burgues: "El rey burgués" (The Bourgeois King) by Rubén Darío, level C1, collections ['classics']. Premise: A wealthy king who collects art without understanding it turns a starving poet into a music-box organ-grinder, with fatal consequences.

ACCEPTANCE CRITERIA:
1. Exactly eight SVGs, one per book id, each a complete standalone <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 330" width="220" height="330"> ... </svg> that parses.
2. Every fill is one of the eleven palette hexes (uppercase), no other colours, no gradients or filters, no <text>.
3. Each cover uses 3 to 4 palette tones including the band, and the last element is the solid band rect at y 232 height 98.
4. Every cover is recognisably THIS story to someone who knows it: a place, a time of day, one actor or object.
5. No two covers in this set, and none of the eight listed above, share a scene.

OUTPUT FORMAT: Markdown. For each book, in the order listed above:
### <book id>
```svg
<svg ...>...</svg>
```
TEXT INK: ink | canvas
MOTIF: <five words naming the scene>
WHY: <one sentence tying the scene and the band colour to the story>

Nothing else before or after the eight sections. No preamble.

PROOF: The SVG source itself; it will be rendered at 120px and 104px and read by eye.
PERMISSIONS: Write nothing to disk. Produce text only.
STOP WHEN: The eight sections are written once. Do not iterate or offer alternatives.
ESCALATE WHEN: A story genuinely has no drawable scene under the ban list; then draw your best abstract reading of it and say so in WHY, rather than skipping the book.
