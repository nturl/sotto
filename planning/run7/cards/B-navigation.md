# Lane B: navigation, settings reachability, library states, route survival

Task: give the app one predictable navigation with Settings reachable from everywhere, make Library and Home show loading / empty-filter / no-books / error distinctly, add a not-found screen, and prove routes survive refresh, back and direct links.

Inputs: `planning/run7/PLAN.md` (CONFIRM 25); `~/Claude/sotto-run7-recon/scout-1-navigation.md` §1-3, §6, "Defects reproduced", "Files a fix would touch" (defects 1-3); `planning/design/DESKTOP.md`, `DESIGN.md`; `planning/KICKOFF-7-FABLE.md` §"Fix navigation".

Owned files: `apps/client/src/ui/Sidebar.tsx`, `TabBar.tsx`, `Rail.tsx`, `src/ui/data.ts`, `src/state/selectors.ts`, `app/(tabs)/**`, `app/+not-found.tsx` (new), `app/_layout.tsx`, `app/library/**`, plus tests beside them. NOT `app/profile.tsx` (lane E moves it to `app/settings/index.tsx` and leaves a redirect at `/profile`; your Settings row targets `/settings`; until E lands, `/profile` still works).

Directives:
1. Failing tests first: Rail/Home/Library empty states; Sidebar and TabBar contain a Settings row; not-found renders a way back.
2. Four nav rows on desktop sidebar (Settings pinned at the bottom slot) and phone tab bar: Home, Library, Vocabulary, Settings, with i18n labels (`tabs.settings` exists? check en.json first). Icons consistent with the existing glyph set.
3. Home: rename the gift control's accessibility label and add a visible caption or move it into the daily card so it reads as "Today's story"; keep its behaviour. Keep the header gear (now → `/settings`).
4. Library and Home read `packsStatus`: loading skeleton or line; error → message + Retry that refetches; no packs for the learning language+level → message naming the language and level with a link to change level or language; filter yields nothing → "No books match" with a clear-filters action. `Rail` renders a titled empty line instead of `null` when its parent asks for it.
5. `app/+not-found.tsx`: "That page isn't here" + buttons to Library and Home.
6. Persistence: confirm language, level, filters, reading position survive refresh, back, and direct link (cite the store keys); fix what does not.
7. Reproduce "Unmatched route" on the dev server now that it boots (`/settings` before E lands, `/profile/x`, a typo route) and screenshot before/after.

Proof: tests green; Playwright walk (375 and 1440) with screenshots in `~/Claude/sotto-run7-recon/B/`: settings reachable from Home, Library, Vocabulary; the four library states (for the error state, hit a bad content URL in the page via route interception; do not kill the shared server); refresh/back/direct link on `/library`, `/settings`, `/reader/<bookId>`; not-found page.

Stop when: committed, pushed, `planning/run7/B-report.md` written. Escalate when: the reader or voice header needs a settings entry (that is lanes D and F2; note it and move on) or a file outside ownership must change.
