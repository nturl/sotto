# @sotto/content

Language packs and the `sotto-content` CLI.

- `source/` — authored source bundles (`<bookId>.bundle.json`), see
  [../../docs/contracts.md](../../docs/contracts.md) §2a.
- `packs/` — built packs consumed by the app and served by `apps/server`,
  see §2b.
- `messages/` — UI message catalogs, one per catalog locale.
- `src/cli.ts` — the `sotto-content` CLI: `build`, `validate`, `narrate`,
  `covers` (run via `pnpm content:*` from the repo root).

Content here is licensed under [CC BY-SA 4.0](LICENSE-CONTENT), separately
from the Apache-2.0 code license — see the root [README](../../README.md#license).

See [docs/adding-a-language.md](../../docs/adding-a-language.md) for how to
contribute a new pack.
