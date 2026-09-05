# Contributing to Sotto

Thanks for considering a contribution. Sotto is a small open-source project;
please keep changes focused and easy to review.

## Getting set up

```sh
pnpm install
pnpm dev
pnpm check   # run this before opening a PR
```

See the [README](README.md) for the monorepo layout and
[docs/architecture.md](docs/architecture.md) / [docs/contracts.md](docs/contracts.md)
for how the pieces fit together.

## Workflow

1. Open an issue first for anything non-trivial (new feature, architecture
   change) so we can agree on the approach.
2. Fork and branch from `main`.
3. Keep pull requests scoped to one change. `pnpm check` must pass.
4. Follow the existing code style (Prettier + ESLint are enforced in CI; no
   inline colors in `apps/client` screens — use `@sotto/core/theme`).
5. Add or update tests for behavior you change.

## Adding a language pack

See [docs/adding-a-language.md](docs/adding-a-language.md) for adding a
locale, UI catalog, or gloss language, or
[docs/adding-a-book.md](docs/adding-a-book.md) for the guided,
Gutenberg-URL-to-merged-PR walkthrough for a single book. Both link the
`language_pack` issue template.

## Content licensing

Content contributions (story text, glosses, translations) are accepted under
CC BY-SA 4.0 (see `packages/content/LICENSE-CONTENT`). Only contribute source
text you have the right to adapt under that license (e.g. public domain
works) — see `docs/adding-a-book.md` for sourcing rules.

## Reviewing content PRs

There's no CODEOWNERS file gating `packages/content/` — any repo
contributor with commit rights can review and merge a content PR. Two
approving reviews ("thumbs up") from anyone with commit rights is the bar
before merging; the author's own review doesn't count toward that.

When reviewing a content PR, check:

- **Licensing first.** Read the PR's "Content contributions" checklist
  (`.github/PULL_REQUEST_TEMPLATE.md`). Confirm `sourceUrl` actually
  resolves to the claimed text, `sourceJurisdiction` states a real basis
  (not just the word "public domain" with nothing to back it), and no
  `CONFIRM: ...` placeholder text was left in the bundle
  (`grep -n 'CONFIRM:' packages/content/source/<bookId>.bundle.json`).
  When in doubt about licensing, ask — don't approve on a guess.
- **No lifted translation.** Skim the abridged text against the linked
  source; it should read as a simplified retelling, not a paragraph lifted
  from a specific (possibly copyrighted) modern translation or annotated
  edition.
- **`pnpm content:validate` passes** (CI runs `pnpm check`, which includes
  this, but re-check the PR's CI status rather than re-running locally
  unless you're changing something).
- **Level fit.** Skim the text against the level heuristics in
  [docs/content-qa.md](docs/content-qa.md) / [docs/adding-a-book.md](docs/adding-a-book.md#2-abridge-to-a0--a1--a2)
  (tense inventory, vocabulary concreteness, sentence length) — a claimed
  A0 book with past-tense narration or abstract vocabulary should either be
  simplified further or have its `level` bumped.
- **Glosses/translations spot-check.** LLM-drafted glosses are usually
  fine but occasionally wrong on idioms, false friends, or culturally
  specific terms — spot-check a handful, especially any word you already
  know is tricky in that language.
- **`reviewStatus` stays `"draft"`** unless you (the reviewer) are willing
  to sign off — in which case set `reviewedBy` to your name/handle and bump
  `reviewStatus` to `"reviewed"` or `"stable"` as part of the review, not
  left for the contributor to self-certify.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
