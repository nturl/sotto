Model: Fable orchestrator, Opus workers (Noel, 2026-09-06: design passes on the best model, Opus not Sonnet for lanes). Launch in a fresh session, cwd ~/Claude/sotto. Fable plans and reviews; workers do the keystrokes; adversarial review on Opus before the deploy.

Goal: ship the approved app UI v2 mockup into the Sotto client. Noel: "this looks great." Source of truth: planning/design/app-mockup-v2.html and planning/design/APP-V2-SPEC.md (read both first; the HTML is the visual contract, the spec names every value). Current system: planning/design/DESIGN.md. Run 7 state and gotchas: planning/run7/FINAL.md, planning/run7/cards/COMMON.md (rules: path-scoped commits, no git stash/checkout/reset, i18n only via apps/client/scripts/i18n-add.mjs, never touch packages/content/packs).

Scope (Expo Router client, apps/client):
1. Cover component: render covers at runtime from book metadata (title, author, level, collection) with the six paper colours, 3px spine, one initial or glyph, mono level stamp; cover.svg stays the fallback. No pack regeneration.
2. Shelf + ribbon: src/ui/Rail.tsx and the tile: hairline shelf under every rail, one cutout per cover, ribbon on the in-progress book, "p. X of Y" mono instead of the progress bar; "See all" as a text link.
3. Home (app/(tabs)/home.tsx): Continue reading first, Today's story as the spread (Read, Listen, About), Recommended; PaywallNagRow moves to Settings › Account.
4. Library (app/(tabs)/library.tsx): hairline-segmented level scale, collection text links, inline search; no pills. Keep the ?filter= URL param from run 7.
5. Reader (app/reader/[bookId].tsx, src/ui/reader): 640 measure centered on desktop, plain tokens (no dotted underline; peach fill on selection, marker stroke on saved), transport under the passage, panel order word / gloss / form line / speaker / Save / Details / Report / In this passage / Your words / Talk about this passage. Phone sheet same order.
6. Tab bar and sidebar: four ink glyphs as in the mockup, active accent.
7. DESIGN.md: record the four verify findings from the spec (CTA label ink, ink-3 not for small text, sage #6E9A7C, 40px link hit height), the widened accent job, the shelf, the cover system, "no pills".

Proof: failing tests first for pure logic (cover palette choice, shelf empty state, level scale); Playwright screenshots at 375 and 1440 of Home, Library, Reader side by side with the mockup's frames; word lookup, save, narration, "Talk about this passage" still work (voice-live.mjs, audible-probe.mjs on the real Metro: use launch entry sotto-metro-real-8081, content server sotto-server-8790); isolated `pnpm check` on a `git archive` copy; deploy the free origin ONLY via `cd apps/client && pnpm deploy:web` from that clean copy with apps/client/.vercel copied in; `node apps/client/e2e/hosted.mjs` live PASS; bump sotto-cloud's vendor pin and `pnpm install --lockfile-only`, do NOT `fly deploy` (Noel's).

Handoff: planning/run8/FINAL.md with before/after shots, what was tested live, and anything needing Noel. Ledger "Run 8" in planning/LEDGER.md.
