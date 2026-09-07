# Run 8 — ship the app UI v2 mockup

Orchestrator: Fable. Workers: Opus, one per lane. Spec: `planning/KICKOFF-8-FABLE.md`.
Visual contract: `planning/design/app-mockup-v2.html`. Values: `planning/design/APP-V2-SPEC.md`.
Recon: `planning/run8/RECON.md` (scout, read-only). Common rules: `planning/run8/cards/COMMON.md`.

## Waves

| Wave | Lane | Owns | Depends on |
| --- | --- | --- | --- |
| 1 | **A Books** | Cover system, tile, shelf, ribbon, page label, theme tokens | — |
| 1 | **D Reader** | Reader layout, tokens, panel order, transport | — (Cover contract from A, see below) |
| 1 | **E Nav + DESIGN.md** | Tab bar glyphs, sidebar, Glyphs.tsx additions, DESIGN.md | — |
| 2 | **B Home + Settings** | Home order, Today's story spread, plan row to Settings › Account | A landed |
| 2 | **C Library** | Level scale, collection links, inline search, `?filter=` | A landed |
| 3 | **R Review** | Adversarial read of every lane against the mockup | all lanes |
| 3 | orchestrator | isolated `pnpm check`, deploy free origin, hosted.mjs, sotto-cloud pin, FINAL.md | R |

## Decisions fixed here so lanes do not diverge

1. **The shelf replaces the desktop grid.** `Rail` renders one horizontal row at every width (scroll indicator hidden). Desktop covers 120x180, gap 24; phone 104x156, gap 18. The shelf is a 1.5px `hairline2` line on the rail container below the row (full rail width, 12px under the last caption line). DESKTOP.md's 3/4-column grid tiers are retired; `useBookGridTier` goes away.
2. **Cover contract** (lane A ships it in its first commit; B, C, D consume it):
   ```ts
   type CoverSource = { id: string; title: string; author: string; level: BookLevel; categories: BookCategory[]; svgUrl?: string };
   <Cover book={CoverSource} width={n} height={n} cutout? cutoutSize? accessibilityLabel? />
   ```
   Typographic render from metadata: paper colour from `coverPaper(book)`, 3px spine strip left (`rgba(0,0,0,.22)`), one mark (initial or glyph) from `coverMark(book)`, title Fraunces 300, author small caps, level stamp mono bottom-right. All sizes scale by `width / 120`. `svgUrl` remains the fallback only when `title` is empty. The `art` prop and the eight flat illustrations are deleted.
3. **Collections are the seven core categories.** `LibraryBook.categories` becomes `@sotto/core`'s `BookCategory[]` (tales, fables, adventure, classics, folk, idioms, daily); the lossy 7→3 fixture mapping in `data.ts` and its inverse go away (`Library.byCategory` takes a core category). **Paper per collection, variation by id**: primary collection = first entry of `categories`; palette triples — tales → sand, peach, brick; fables → sage, teal, sand; adventure → teal, slate, sage; classics → slate, brick, sand; folk → brick, sand, peach; idioms → peach, sage, teal; daily → sand, teal, peach. Pick within the triple by a stable hash of `book.id`. Text is ink on sand/sage/peach, canvas on teal/brick/slate. Tokens: `paper.{sand,teal,sage,brick,peach,slate}` and `hairline2` (`rgba(34,30,27,0.2)`) added to `packages/core/src/theme.ts` (light and dark); sage is #6E9A7C.
4. **Mark**: `hash(id) % 3 === 0` → glyph from `['✶','◐','△','◯']` by hash, else the initial of the title after stripping a leading article (Le, La, Les, L', Un, Une, Des, El, Los, Las, Un, Una, Il, Lo, Gli, O, A, Os, As, The, A, An, Der, Die, Das, Ein). CJK: first character.
5. **Progress label** replaces the bar. `LibraryBook.progress` is a 0..1 fraction (VERIFIED: `BookTile.tsx` renders `progress * 100`%). `progressLabel({ minutes, progress })` → `{ kind: 'page', page, pages }` when `0 < progress < 1`, else `{ kind: 'minutes', minutes }`. `pages = max(1, round(minutes))`, `page = clamp(1 + floor(progress * pages), 1, pages)`. One page ≈ one minute of reading; this is a CONFIRM for Noel, recorded in FINAL.md.
6. **Ribbon**: exactly one, on `ribbonBookId` — the book with the most recent `progress.updatedAt` that is not completed. `Library.currentBookId` comes from `data.ts` (lane A). `Rail` and `BookTile` take `ribbonBookId?` / `ribbon?`.
7. **Selected-word fill is peach at 55%** (`rgba(242,200,180,.55)`, the mockup's value). DESIGN.md's 18% is invisible on canvas. Recorded in DESIGN.md by lane E and as a CONFIRM in FINAL.md. No dotted underline on any token.
8. **CTA label is ink** (`colors.ink`) on the accent fill, 4px ink cutout. Every primary button in scope follows this (Read on the spread, Save when saved keeps the mark fill).
9. **Library params**: `?filter=` keeps its run-7 grammar for collections, now over the seven core categories (`all|tales|fables|adventure|classics|folk|idioms|daily`); the legacy value `voyage` is read as `adventure` and `contes` as `tales`. The level scale writes `?level=A0..C1` (absent = All). A legacy `?filter=<level>` is read as `level=<that>` and rewritten. Both survive reload, back and a direct link.
10. **Home order**: Continue reading (no See all) → Today's story spread → Recommended for {level} (See all → `/library?level=<level>`) → Your books (imports; only when non-empty). New releases leaves Home. PaywallNagRow leaves Home for Settings › Account. The gift icon leaves; the title row's icon buttons are Search (→ `/library/search`) and Settings on desktop, Search only on phone (Settings is a tab).
11. **Reader panel order** (desktop panel and phone sheet alike): word · gloss · form line (only if the token carries lemma/part-of-speech data; otherwise omitted, no placeholder) · speaker ring (top-right of that block) · Save / Details / Report row · In this passage · Your words in this book · Talk about this passage (pinned to the panel bottom; last item in the sheet before the transport). Transport sits under the passage on desktop and at the bottom of the sheet on phone.
12. **Glyphs**: the tab bar uses the mockup's four paths (book-open, shelves, bookmark, gear), 22px, stroke 1.5, round caps. Only lane E edits `Glyphs.tsx`; any other lane needing a glyph that does not exist yet draws it locally in a file it owns and says so in its report, and E folds it in during wave 2.
13. **Text sizes on the tile**: title Fraunces 400 14/1.3 ink one line; author Inter 12.5 ink2 one line; page/minutes mono 11 tracked 0.06em uppercase ink2. Mono metadata never uses ink3 (spec finding).
14. **Link hit height 40px** for every text link (See all, collection links, Details/Report, About this book).

## Proof required from every lane
Failing test first for its pure logic; `pnpm --filter @sotto/client test`, `pnpm -r typecheck`, `pnpm lint`, prettier on touched files; Playwright shots at 375 and 1440 of its screen(s) from the live Metro (`node ~/Claude/sotto-run8/shots.mjs <outDir>` shoots Home, Library and Reader in one go; use it, or copy its seed pattern for a narrower shot); report in `planning/run8/<lane>-report.md`.
