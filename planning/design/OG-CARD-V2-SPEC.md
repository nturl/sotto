# Sotto link card, revision 2: the language in the headline

File: `apps/client/public/og.png` (1200 x 630), rendered by `planning/design/og-card.mjs`. Revision of the 2026-09-08 card, no new ledger row.

**Diagnosis.** In an iMessage bubble the card is 300px wide. What survives: the headline (about 24px), the cover as a silhouette, and the caption under the image. What does not: the A1 stamp (5px) and the French title (8px), which were the only language tells. The headline "Read a page. Then talk about it." fits a book club as well as a reader for learners. Nothing legible says language.

**Fit read.** Job: a stranger persuaded in one second from a friend's text; phone, 300px, one committed mode. Register unchanged: poster.

**The move.** Put the language into the one element that survives delivery, and mark it the way the app marks a saved word: "Read a page of French. Then talk about it." with "French" on the reader's marker (`#FFD8A8`, 0.55em, skew -6deg, the landing's `.mark`). One device, the product's own, naming the category and the mechanism in the same 250px. Headline at 88px/1.02, four lines, top 104. Cover, press, URL line unchanged. The caption carries the other languages: og:title "Sotto, learn a language by reading"; og:description names French, Spanish, Italian, Portuguese and more (all present in `packages/content/packs`). Meta tags bump to `?v=3` so cached previews refresh.

**Alternates rendered for Noel to point at.** B "Read French. Then talk about it." at 96px in three lines. C "Learn a language by reading it. Then talk about it." at 84px, language-generic.

**Ban list.** No kicker line above the headline (invisible at 300px). No gloss pop invented on the cover. No flag, no globe. No second hue beyond the marker.

**Definition of done.** Card read at 1200 and inside a 300px bubble mock with its caption; marker legible at 300px; ink on marker and ink on canvas above 4.5:1; generator reproduces the shipped PNG; live og.png byte-identical after deploy.

**Noel's pick (2026-09-08, 21:30).** "C is the best." C ships: "Learn a language by reading it. Then talk about it." at 84px, "language" on the marker. With the headline carrying the category, the caption goes back to "Sotto, a free graded reader" (adds free and the category term instead of repeating the headline); og:image:alt follows C; image URL `?v=4`. A and B stay in the generator as `french-page` and `french-short`.
