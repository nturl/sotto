## What does this change?

## Why

## How was this tested?

- [ ] `pnpm check` passes locally
- [ ] Tested on web
- [ ] Tested on iOS Simulator (if UI-affecting)

## Checklist

- [ ] No inline colors added in `apps/client` screens (use `@sotto/core/theme`)
- [ ] No auth, payments, analytics, or telemetry SDKs added
- [ ] Content changes carry correct license/attribution metadata

## Content contributions

Only for PRs that add or change a book (`packages/content/source/*.bundle.json`) — see [docs/adding-a-book.md](../docs/adding-a-book.md).

- [ ] Source is public domain (state the jurisdiction) or under a CC-BY-SA-4.0-compatible license — [sourcing rules](../docs/adding-a-book.md#0-sourcing-rules)
- [ ] `sourceUrl`, `sourceJurisdiction`, and `sourceEdition` are filled with real values (no leftover `CONFIRM: ...` placeholders)
- [ ] No text copied from a copyrighted translation or edition — only the original public-domain/CC text, abridged in your own words
- [ ] `pnpm content:validate` passes with 0 errors
- [ ] `reviewStatus` is `"draft"`, unless a named reviewer is listed as `reviewedBy` with `reviewStatus: "reviewed"` or `"stable"`
