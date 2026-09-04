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

See [docs/adding-a-language.md](docs/adding-a-language.md) and the
`language_pack` issue template.

## Content licensing

Content contributions (story text, glosses, translations) are accepted under
CC BY-SA 4.0 (see `packages/content/LICENSE-CONTENT`). Only contribute source
text you have the right to adapt under that license (e.g. public domain
works) — see `docs/adding-a-language.md` for sourcing rules.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
