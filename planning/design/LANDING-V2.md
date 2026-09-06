# Landing page, run 5 revision

Addendum to `LANDING.md` (2026-09-05). Not a new ledger row — this is a revision of
the same shipped page (manifesto, linked-gloss-focus device, "paper at night" anchor),
noted in `log-archive.md` under the original entry.

## Fit read

Job: a first-time visitor decides "read, or read + tutor" in one glance; a returning
paid subscriber who lands here by habit needs an exit, fast. Register, anchor, flood,
type, and device all stay exactly as shipped — this is a content/IA fix, not a restyle.

## What's actually confusing (and what isn't)

There is only **one** real navigation fork on this page: free origin vs. paid origin
(different apps, different sign-in). BYOK is not a second fork — it's a same-destination
detail (`/start`, then paste a key in Settings). Treating BYOK as a third button would
be dishonest to the IA and would burn the page's one accent color on a second CTA,
diluting both. So: name BYOK in prose, not in a button; make the origin fork explicit
at the moment of the primary CTA; leave the "four ways" table in place but reframe it
as the reference view, not the decision surface.

## Diff (three small changes, one file: `apps/client/web/landing/index.html`)

1. **Header** — the existing `.meta` line gains a trailing link: `Free · Open source ·
   No account · Sign in` (Sign in → `https://app.readsotto.app`). Same mono meta
   voice, not the accent color. Fixes the returning-subscriber dead end.
2. **Hero** — one new paragraph directly under the existing `.cta-note`, same class
   (no new type scale): names BYOK by name, names the plan, names that
   `app.readsotto.app` is "a separate sign-in from this page." This is the fix for
   both of Noel's complaints, in one place, at the moment of the primary decision.
3. **Ways table** — retitled "Compare all four ways" with one lead sentence signalling
   it's the reference view for people who already decided above; the paid and free
   rows' "Where" cells get one clause of context instead of a bare hostname.

No new colors, no new type sizes beyond one new utility class (`.lead-note`, reusing
existing tokens) for the ways-table lead sentence. No new routes, no infra change.

## Definition of done

- `cleo_verify.py` on the rebuilt file: 0 FAIL, every WARN named.
- Screenshots 375 and 1280 read as images: header wraps cleanly at 375, CTA still the
  single largest visual element, no overlap.
- Network log for `/`: same-origin only (unchanged from ship).
- `pnpm check` green; `hosted.mjs` smoke green post-deploy.
