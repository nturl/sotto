# Sotto closeout: the new-user run-through

You are closing out Sotto (`~/Claude/sotto`, Expo Router web client at `apps/client`, live at https://readsotto.app). One last pass, as a stranger, then ship what makes the first five minutes simpler. Nothing else.

## The bar

SplitPay's onboarding (splitpay.com/onboarding/rent) is the reference for feel, not for looks: one centered column, one decision per screen, the choices are the buttons, the next action is always visible, the fine print sits under the button, and "Already have an account? Sign in" is one line. Nothing to figure out. Sotto keeps its own skin (paper canvas, Fraunces and Inter, one coral accent, hairline rows, no pills, no mascots) and takes that discipline.

## Walk it first, on a phone

Open a private window at 375 wide. Do not read the code yet. At every screen, write down before tapping: what is this screen asking me, what is the one thing I should do next, is that thing visible without scrolling, what would a stranger get wrong here. Count taps and scrolls from the landing page to the first page of a book.

The walk: landing page. "Read free, no account". Every onboarding step, accepting the defaults. The screen after setup. The first page of the book. Tap a word. Tap "Talk about this passage" with no tutor set up. Then each tab: For you, Library, Vocabulary, Settings. Then the landing page again at 1280, scrolled end to end.

Repeat the walk headless (Playwright, `apps/client/e2e/hosted.mjs` has the selectors) and keep the screenshots. Every claim below about what a screen shows must come from a screenshot, not from reading the source.

## Rules for what to change

1. One decision per screen. If a screen asks something the browser already knows (interface language) or that nobody can answer yet (explanation language), default it and let Settings own it.
2. The primary action is visible on first paint at 375 by 812. A list that pushes Continue below the fold is a bug.
3. A choice explains itself where it is made. A level row shows a sentence at that level, not a label the reader must decode.
4. The thing the landing page sells must be the thing the app offers at the moment of need. If the page says "try the tutor free for 3 days", the Discuss gate says it too, before any download or key.
5. Remove copy that only makes sense to the person who built it. "Needs the local server or the paid tier" is a builder's note, not a caption.
6. Recommendations respect the level the learner just chose.
7. Smallest diff that makes the screen simpler. No new features, no redesign of screens that already work (the reader on first open, the tab bar, Settings).
8. Copy: no em dashes, no "honestly", under 20 words a sentence, never name the model vendor in sales copy.

## What to ship

In-app, on the free origin and the paid one alike:

- Onboarding becomes two steps: "I'm learning" and "Your level". App language and explanation language default from the browser and are shown as one line on the set-up screen with a "Change" link to Settings. Regional variants (US or UK English, Latin America or Spain, Brazil or Portugal, Chinese script) collapse under the language row they belong to. Level rows carry the sample sentence for that level in the chosen language. The Continue button is pinned to the viewport bottom. No "Sample unavailable" text: the voice row appears only once a sample exists.
- The set-up screen shows the recommended book's cover next to its title and premise, with "Start reading" as the only button and "Browse the library" as a text link. Taps from landing to reader: four.
- The Discuss gate for a learner with no tutor leads with "Try the tutor free for 3 days" and the price line, then "Run it in this browser" (which reveals the download panel), then "Use your own key", then "Read alone". The 1.2 GB list and the tier notes stay inside the revealed panel.
- Library: the import affordance and its caption are hidden when the local server is not reachable. The Library title has no subtitle.
- Today's story is picked at the learner's level, one step easier or harder when the level has nothing, stable for the day.

Landing page (`apps/client/web/landing/index.html`, one file):

- Two doors under the headline at every width: the trial button, then "Read free, no account" as a secondary button, full width on phone, side by side from 600. The hero's "Sign in" link goes; the masthead has one.
- The five scene tabs on phone sit on one line with no numbers.
- Desktop scenes at 56vh instead of 70vh so the stage reads in three screens.
- "See it working" gets current screenshots: the reader with a word tapped and its gloss open, and the Library shelf with the authored covers. Captions stay factual.
- Scene 05's second line tells the reader what the three choices are instead of describing the page.

## Definition of done

- `pnpm check` green on a `git archive` copy of the integration head (`~/Claude/sotto-run8/isolated-check.sh <sha> <dir>`).
- `node apps/client/e2e/hosted.mjs` passes against a local static export at 375 and 1440 and logs four taps from landing to reader.
- The headless walk re-run against the local export; every screenshot read as an image at 375 and 1280; the Continue button's bottom edge is inside the viewport on both onboarding steps at 375 by 812.
- `cleo_verify.py apps/client/web/landing/index.html --proof <dir>`: 0 FAIL, every WARN named.
- One worktree per lane, lane commits cherry-picked onto `run10/integration`, branch pushed. Deploy of the free origin only on Noel's explicit say-so for the deploy path; the paid origin's `fly deploy` stays Noel's.

## Closeout

Write `planning/run10/FINAL.md` (what shipped, what is Noel's, what was left), add the ledger entry to `planning/LEDGER.md`, update the Sotto memory file, and hand back the deploy decision with the DNS and header evidence in the message.
