SUBTASK: Draw eight book-cover artworks as SVG for a graded-reader app (Sotto), direction "The Mise-en-scene" (every book is a place and a weather).

INPUTS:
Direction anchor: Folio Society flat-scene jackets and Charley Harper geometry: a whole place in four tones.
Art rule: A full-bleed flat scene with a horizon or a stage: a place, a time of day, a weather, and ONE actor or object in it (a small rider before three windmills at dusk; a farmhouse lifting into a funnel; a girl on a forest path; a lone tortoise on a riverbank under a jaguar-shaped shadow). Four tones total, large simple shapes, no outlines, silhouettes not portraits. Then paint a SOLID band from y 232 to 330 (a <rect x="0" y="232" width="220" height="98"/>) in one of the scene's tones as the LAST element; leave that band empty (the app prints the title on it). The band tone must clear 4.5:1 against either ink #221E1B or canvas #F4ECDF; say which in TEXT INK.
Canvas: viewBox="0 0 220 330", width 220 height 330. The cover will be shown 120px and 104px wide, so every shape must still read there: nothing thinner than 2 units, no detail smaller than 10 units, under 60 elements per cover. Flat fills only.
Palette (use exactly 3 to 4 per cover including the band; choose from the STORY, never at random; vary the grounds across the set): sand #E8D6B8, teal #1F4F57, sage #6E9A7C, brick #8C3B2E, peach #F2C8B4, slate #2B2A28, ink #221E1B, canvas #F4ECDF, marker #FFD8A8, forest #4E7D5B, ochre #B8651B.
These eight join a shelf of forty; the eight already drawn use these scenes, so do NOT repeat them: a hidden heart under floorboards, a diamond necklace on velvet, a rider before windmills, a farmhouse in a cyclone, a red cloak on a forest path, a farmer by a rabbit stump, a tortoise under a jaguar shadow, a visitor before closed office doors.
BANNED: gradients, filters, drop shadows, strokes with stroke-width under 2, emoji, any <text> or letterforms, faces with features (one dot for an eye at most), the colour #E4572E, reusing a scene across two books, any element outside the viewBox, external references, raster images.

The eight books:
- ro-capra-trei-iezi: "Capra cu trei iezi" (The Goat with Three Kids) by Ion Creangă, level A0, collections ['folk']. Premise: A mother goat warns her three kids about the wolf, but the wolf has a trick.
- es-licenciado-vidriera: "El licenciado Vidriera" (El licenciado Vidriera) by Miguel de Cervantes, level A1, collections ['classics']. Premise: A brilliant, poor student becomes famous for his wit, then for a strange delusion: he believes his body is made of glass.
- it-pinocchio-inizio: "Pinocchio: il pezzo di legno" (Pinocchio: The Piece of Wood) by Carlo Collodi, level A1, collections ['classics']. Premise: A carpenter gives his friend Geppetto a strange piece of talking wood, and Geppetto carves it into a puppet who comes alive and runs away.
- es-conde-lucanor: "El Conde Lucanor" (Count Lucanor) by Don Juan Manuel, level B1, collections ['fables', 'classics']. Premise: Whenever Count Lucanor faces a difficult decision, his wise advisor Patronio answers with a short story that quietly holds the lesson he needs.
- fr-daudet-les-etoiles: "Les Étoiles" (The Stars) by Alphonse Daudet, level B1, collections ['classics']. Premise: A lonely shepherd on Mont Luberon spends one unforgettable night watching the sky with the young woman he secretly loves.
- en-doyle-red-headed-league: "The Red-Headed League" (The Red-Headed League) by Arthur Conan Doyle, level B2, collections ['classics', 'adventure']. Premise: A red-haired pawnbroker is paid a small fortune to copy an encyclopedia for a mysterious league, and Sherlock Holmes suspects that something far more serious is hidden beneath the strange arrangement.
- fr-merimee-mateo-falcone: "Mateo Falcone" (Mateo Falcone) by Prosper Mérimée, level B2, collections ['classics']. Premise: In the wild hills of Corsica, a ten-year-old boy's small betrayal for the price of a silver watch will cost him everything, including his father's mercy.
- fr-maupassant-le-horla: "Le Horla" (The Horla) by Guy de Maupassant, level C1, collections ['classics']. Premise: A solitary man keeping a diary in his house on the Seine becomes convinced, after the passage of a strange ship from Brazil, that an invisible being has moved into his home and is slowly draining his will.

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
