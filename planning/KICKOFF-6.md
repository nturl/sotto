# Sotto Run 6 — steer-to-pay landing redesign + two real bug reports

Input from Noel, live, on top of Run 5's shipped landing page (annotated screenshots, paraphrased into the specifics below since images don't travel across sessions). cwd `~/Claude/sotto` (OSS, public) and `~/Claude/sotto-cloud` (private) as before. Read `planning/LEDGER.md`'s "Run 5" section first — this builds directly on it, don't re-litigate CONFIRM 10.

Noel is reachable this time (unlike Run 5, which was overnight and unattended) — if Lane B or C can't be diagnosed from code and evidence alone, ask him the one or two questions that unblock it (device/browser, exact symptom, which words). Don't turn that into a long back-and-forth; get the fact, keep moving.

## Lane A — redesign the landing page's decision area (Cleo-led)

Noel's words: "I think you should steer people to pay for it first, but there's the option for running it yourself. Also, it's free to read and get definitions, but if you really want the AI tutor, that's where the OpenAI keys come in, or when you pay for it." And separately: the opening paragraph is good, "Start reading" is good, but the BYOK guidance text is "a ton of text" and needs real UI work, not more prose.

**What's live now** (Run 5, `apps/client/web/landing/index.html`): right under the "Start reading" CTA, one paragraph names BYOK and the paid plan as roughly equal-weight alternatives, then a retitled "Compare all four ways" table lower on the page. Noel circled exactly that paragraph and the table in his annotations — both read as too much text, and the priority ordering is backwards from what he actually wants.

**The reordering, explicit:**
1. **Read, free** — unchanged, this is the zero-friction default that stays exactly as is.
2. **AI tutor** — two ways to get it, but they are NOT equal billing:
   - **Pay for the plan** ($9.99/mo, 3-day trial, app.readsotto.app) — this should now be the *steered* option, closer in visual weight to "Start reading" than BYOK is.
   - **Bring your own key** — still real, still documented, but demoted to a lighter mention (a smaller link/note, not a co-equal sentence next to the paid plan).
3. **Self-host** — positioned as *the* alternative for people who don't want either the free-hosted reading nor the paid tutor plan: "run it yourself." Currently buried as the 4th row of a comparison table; Noel wants it surfaced as a real, named option, not comparison-table trivia.

**Cleo's actual job**: don't just reshuffle the same paragraph — the specific complaint is "a ton of text" for something that should be simple to scan. Consider a compact visual treatment for the three-way choice (tutor via paid plan / tutor via your own key / self-host) instead of a sentence with an em-dash chain. Keep the one-emphasis-color budget (`--accent` stays reserved for "Start reading" per the existing design system, `planning/design/LANDING-V2.md` and the original `planning/design/LANDING.md`) — the paid plan being "steered" should read through hierarchy/position/copy, not by handing it a second accent-colored button. Whether the four-way comparison table survives, shrinks, or moves is Cleo's call; the reader who wants exhaustive comparison shouldn't lose that, but it's clearly not the first thing to show now.

Run Cleo for a spec + skeleton (same process as Run 5's `LANDING-V2.md` — this is `LANDING-V3.md` or similar, another revision of the same shipped page, so check `~/Claude/Agents/design/LEDGER.md`'s rule: a revision isn't a new ledger row, note it in `log-archive.md` under the existing entry). Build on Sonnet directly per Cleo's own "on Sonnet, build directly" rule. Verify with `cleo_verify.py` (0 FAIL gate) and read the actual screenshots, not just the harness output — Run 5 caught a real tap-target regression and a copy-length/measure tradeoff this way that the first pass missed.

Deploy: free origin only (`pnpm deploy:web` from a clean `git archive` of HEAD, matching Run 5's pattern — the OSS working tree may still be dirty with unrelated in-flight work from other sessions; check `git status` fresh and never touch anything you didn't create). No sotto-cloud change implied by this lane alone.

## Lane B — Noel still can't get BYOK working for himself

Noel's words: "I still haven't been able to try out the OpenAI key myself."

**What's already known** (don't rediscover this, verify it's still true and go from there): `docs/self-hosting.md` and the project memory both flag that Safari's standalone-PWA microphone permission has **never been tested on a real iPhone** — as far back as Run 4, the landing copy was deliberately written to make no voice claim about the installed app specifically because of this untested gap. If Noel installed Sotto to his home screen and is testing from there, this is the leading hypothesis: the mic may simply not be grantable/working in that exact browser context (standalone PWA vs. Safari tab vs. Chrome).

**Investigate, in this order:**
1. Ask Noel directly (this is the fast path): what device and browser, did he install it to the home screen or use it in a regular tab, what exactly happened when he tried — no prompt for the mic at all, a prompt that didn't work, a key that failed to validate, or something else entirely. Don't guess past this if he's reachable.
2. Read the actual mic-permission request path (`apps/client`'s voice screen / `getUserMedia` call sites) and check what happens on failure — does it fail silently, or does it surface something the learner would notice?
3. If it does turn out to be the standalone-PWA gap, that's a real fix worth scoping (getUserMedia in an installed PWA has known platform quirks); if a real device/simulator is available, reproduce it there rather than guessing from source.
4. Consider genuinely that this might not be a code bug at all — getting an OpenAI key with billing enabled is itself real friction, separate from anything in this codebase. If investigation turns up no defect, say so plainly rather than inventing a fix for a working feature Noel just hasn't gotten around to trying yet.

## Lane C — word-tap audio sounds "clippy," not smooth, on specific words

Noel's words: the tutor and even just tapping a word for its pronunciation are "still a bit clippy and not smooth for specific words."

**What's already known, verified tonight, don't rediscover:** `packages/content/src/word-audio.ts` synthesizes a per-book Kokoro sprite (`audio/words.mp3` + `audio/words.json`) so the reader's speaker button plays a clean standalone clip instead of slicing the word out of the full-chapter narration (the narration slice is the historically clipped path — short/contiguous words measured 120-160ms sliced out of context in the original defect). The reader falls back to the narration slice **only** when a word has no sprite entry.

**Confirmed tonight:** 2 of 40 books have no `audio/words.mp3` at all — `ca-ES/books/ca-patufet` and `ro-RO/books/ro-capra-trei-iezi` (word-audio.ts's own log line suggests this is "no Kokoro voice" for those locales, not a bug — verify that read is right). Any word tapped in those two books falls straight to the clipped narration slice.

That's real but almost certainly not the whole story — Noel didn't say he was reading Catalan or Romanian, and "specific words" sounds like it happens elsewhere too. Other candidate mechanisms to check, roughly in order of how cheap they are to rule in/out:
- **Partial sprite coverage within a book that has `words.mp3`**: `words.json` indexes "unique word tokens," but is every token actually in it, or can generation silently skip some words (a failed Kokoro request, a punctuation/casing edge case)? Compare a chapter's token list against its `words.json` keys for a book Noel's likely read.
- **The audio-seek/Range-request path**: `apps/client/public/sw.js` has a `rangeFromCache` handler for audio seeking over the service worker — a bug there could truncate playback for reasons that have nothing to do with the sprite itself, and would explain clipping that seems to hit specific words unpredictably rather than whole missing-sprite books.
- **Kokoro output quality for certain word shapes**: very short words, certain phonemes, or particular locales might just synthesize badly even when isolated. Listen to actual generated clips for a handful of short/common words across a couple of locales before assuming it's a serving bug rather than a synthesis quality issue.

If reproduction stalls, ask Noel which words and which book — a specific repro is worth more than broad speculation here.

## House rules (same as Run 5, still apply)

- Bug fix = failing test first, then fix. Reproduce before changing anything.
- Smallest diff that solves the problem now — no drive-by refactors.
- Explicit-path `git add` only, never `-A`/`.`; check `git status` fresh before starting, other sessions may still have the tree dirty with unrelated work.
- Isolated `pnpm check` (`git archive HEAD | tar -x` + `pnpm install --frozen-lockfile` + `pnpm check`) is the honest gate, not the shared working tree.
- Keys live only in the macOS keychain; never print, never write to a file, never cat a credential file.
- Verify UI changes in a real browser (or the iOS Simulator for Lane B) before claiming done — screenshots, not just green tests.

## Definition of done

- Lane A: Cleo spec + skeleton, built, `cleo_verify` 0 FAIL, screenshots at 375/1280 read as images, deployed to the free origin, live-verified.
- Lane B: either a real fix (with device/simulator proof it now works) or a clear, honest writeup of what was found and what still needs Noel (e.g., "needs a real iPhone test, here's exactly what to check").
- Lane C: either a real fix (with before/after audio evidence) or, at minimum, the two missing-sprite books resolved one way or another (fixed or explicitly documented as an accepted gap) plus a clear writeup of what else was investigated and ruled out.
- `planning/LEDGER.md` gets a Run 6 section in the same style as Run 5's.
