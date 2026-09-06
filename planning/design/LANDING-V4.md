# Landing page, run 7 revision: rebuilt around the learner's decision

Supersedes `LANDING.md`/`LANDING-V2.md`/`LANDING-V3.md`'s structure (this is a new ledger
row, not an addendum — the IA changes, not just the hero block). Source:
`apps/client/web/landing/index.html`.

## Fit read

Job: a first-time visitor understands in ten seconds that Sotto is a free reader, sees
real product (not stock), decides free-start vs sign-in vs try-without-account, and can
find own-key/self-host/install without any of them reading as a subscription tier.
Entered from a shared link, read once or twice, lives for months — quiet beats
spectacular. This is a decision page with real evidence to show (two live screenshots,
a docker compose command, a device-specific install path), not a pure argument, so:
**register = field guide** (rail-and-content, captions do the work, checklist lives
here), not manifesto. Manifesto was this page's last row (2026-09-05) and dossier the
row before that — field guide differs from both, and fits: the page now shows evidence
(screenshots, a comparison, an install checklist) instead of only asserting a claim.

## Register, anchor, flood

- **Register: field guide.** Sections are content rails with captions, not a single
  argument read start to end: hero (one promise + a labeled demo passage), a captioned
  screenshot pair, a three-step loop, a free/plan reference, two secondary-guidance rows,
  a device-detected install checklist, footer links.
- **Anchor: Medium's cream broadsheet register, adapted to Sotto's own paper tokens.**
  Not Medium's hex values — Sotto's own `DESIGN.md` light palette (canvas `#F4ECDF`,
  ink `#221E1B`, accent `#E4572E`), because this page now embeds two real screenshots of
  the actual (light, warm-paper) app; the previous "paper at night" dark canvas made a
  live product screenshot look like a different product dropped onto the page. Literary,
  monochrome-mostly, one accent, matches what "keep the warm bookish character: cream
  surfaces" calls for. Last three anchors (Attio marble, Shade night-cutout, Stripe Press)
  are all different from this. `--canvas:#F4ECDF; --surface:#FBF6EC; --surface-2:#EFE4D2;
  --ink:#221E1B; --ink-2:#6E6459; --ink-3:#9C9287; --hairline:rgba(34,30,27,0.12);
  --accent:#E4572E (one job: primary CTA fill); --peach:#F2C8B4 (cutout shadow + 18%
  word-selection fill)`. `color-scheme: light`.
- **Device: the captioned specimen pair.** Two real product screenshots (reader with the
  word popup open; the voice tutor mid-conversation), hairline-framed, each with one
  caption line naming what it shows — this is the "real, not stock" proof the card asks
  for. Carried over in miniature: the hero's demo passage keeps one tap-a-word
  interaction (peach fill on tap/hover) so the reading feel is felt once, immediately,
  but it is explicitly labeled "A sample passage · Level A2" so it reads as a demo, not
  as the explainer paragraph the old page used it for.

## Type cast (unchanged faces, reused sizes from the shipped page)

| role | face | size / lh / tracking | weight |
|---|---|---|---|
| display (H1) | Fraunces | `clamp(2.25rem, 1.6rem + 3.2vw, 4rem)` / 1.05 / -0.02em | 300 |
| section head | Fraunces | 1.75rem / 1.15 / -0.01em | 300 |
| passage / row title | Fraunces | 1.25–1.375rem / 1.3–1.45 | 400 |
| ui / body | Inter | 1rem / 1.55 | 400, 500 for CTA + row titles |
| caption | Inter | 0.8125rem / 1.5 | 400 |
| metadata (eyebrow, labels) | system mono | 0.6875rem / 1 / 0.08em uppercase | 400 |

## Spacing and grid

- One centered column, `max-width: 44rem` for rails/comparison/steps, `38rem` for prose
  (hero promise, sample passage). Gutters 20px at 375, 48px at 1280+.
- Section rhythm 64px at 375, 112px at 1280+. Rows, never cards — hairline-separated,
  as the shipped page already does. Radius vocabulary stays `{2, 10}`: 2 on
  word-selection fill and screenshot frames, 10 on the CTA. No pills, no card grids.
- The screenshot pair: two columns at ≥700px (`1fr 1fr`, gap 24px), stacked at 375.
  Each frame: 1px hairline border, radius 10, `box-shadow: 6px 6px 0 0 var(--peach)`
  (the app's own cutout token, DESIGN.md elevation rule) — the one earned second use of
  the cutout shadow (CTA is the other), never a third place.
- Tap targets 44px minimum. CTA 56px tall at 375, full column width; auto width ≥600px.

## Hierarchy, top to bottom (per the card's directive 2)

1. **Masthead.** Wordmark only, left. Right: "Sign in" link only (mono meta voice,
   `https://app.readsotto.app/account`). No "Free · Open source · No account" line
   (directive 3 — removed).
2. **Hero.** Mono eyebrow "A FREE GRADED READER". H1 "Sotto reads with you." One-sentence
   promise: read, listen, and talk about what you read. Then the demo: "A sample
   passage · Level A2" label above a short passage with one tappable word (peach fill),
   no glossary list under it (concepts move to the sections below, so the term is never
   left unexplained per D-6 — it is explained at first real use in the loop and
   comparison sections, not floated in the hero). CTA row: **Start free** (primary
   cutout, `https://app.readsotto.app/account?intent=start`), **Sign in** (secondary text
   link, `https://app.readsotto.app/account`), **Try a sample** (tertiary text link,
   `/start`) with one caption line: "No account needed — progress and saved words stay
   in this browser until you create one."
3. **Product preview.** The captioned specimen pair: reader-with-popup screenshot
   captioned "Tap any word for its meaning", tutor screenshot captioned "Talk about what
   you just read."
4. **The loop.** Three mono-numbered rows, one line each: `01 Read` — pick a language
   and level, open a book adapted to you (machine-adapted drafts, levels are estimates —
   the caveat lives here, next to book choice, not the hero); `02 Understand` — tap a
   word for its meaning, hear it narrated, save it for later; `03 Speak` — talk about the
   passage with a voice tutor that already knows what you read.
5. **Free vs the plan.** Two-column reference row (stacks at 375): **Free** — reading,
   listening, tap-to-translate, saved vocabulary, and the in-browser tutor (on-device
   models, nothing leaves this device) are free, no account required to try, an account
   to keep them; **The plan** — the hosted voice tutor with nothing to set up, `$9.99` a
   month or `$79` a year after a 3-day trial, at a separate sign-in
   (`app.readsotto.app`); one line naming what it is not: no transcripts or recordings
   are stored, only usage minutes and billing.
6. **Secondary guidance**, two hairline rows, never framed as tiers: **Use your own
   key** — works with or without the plan; paste an OpenAI key in Settings, the page
   calls OpenAI directly from your browser, the key stays on this device, and OpenAI
   bills you, not us (link: `docs/byok.md`). **Run it yourself** — free on your own
   hardware; `docker compose up` serves the app and tutor from one origin, with local
   models or your own key (link: `docs/self-hosting.md`).
7. **Install Sotto.** One block, device-detected via `navigator.userAgent` (iOS Safari /
   Android Chrome / desktop Chrome), each showing only its own 2–3 numbered steps; a
   generic fallback block is the no-JS default and stays for any other browser. Closing
   line, unchanged from the shipped page and re-verified: "A book you have opened keeps
   working offline." No broader offline claim.
8. **Footer.** GitHub, self-hosting doc, own-key doc, add-a-book doc. Legal line:
   licenses (Apache-2.0 code, CC BY-SA 4.0 stories), "no analytics on this page or in the
   app."

## Ban list

- No cards, boxed grids, or borders around whole sections — hairline rows only, the two
  screenshot frames are the one named exception (device, not decoration).
- No gradients, blurred shadows, or glow. The cutout shadow (peach, hard-edged) appears
  exactly twice: the CTA and the screenshot frames. Nowhere else.
- No accent color outside the primary CTA fill. Sign in / Try a sample are ink links with
  a hairline underline, not filled buttons — three visually different weights, one
  accent budget.
- No new claim that isn't in the scout's claims table or D-3's minute-free wording — no
  minute counts, no "unlimited," no invented offline scope beyond the one sentence above.
- No stock imagery, device frames, or illustration standing in for product — only the
  two real screenshots.

## Definition of done

- `cleo_verify.py` on the built file, `--proof <dir>`: 0 FAIL, every WARN named.
- Screenshots at 375 and 1280 (or 1440) read as images: CTA trio above the fold at 375,
  screenshot pair legible and not overlapping, accent appears once (the CTA fill).
- Every href resolves live (GitHub docs 200, paid origin 200).
- Install block verified for iOS Safari, Android Chrome, and desktop Chrome via UA
  override, plus the generic fallback with no UA match.
- Claims table cross-check: every privacy/capability sentence on the page matches its
  tutor mode per scout-L §2.
- `git diff --stat` touches `apps/client/web/landing/index.html` only (plus this file and
  the ledger, which are the card's other owned paths).
