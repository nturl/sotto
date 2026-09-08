# MERGESEC — security hardening merged onto main

Branch: `merge/security` (merge commit `0453827`, parents `b2b65fc` main + `b906c2f` security)
Worktree: `/Users/noelturlington/Claude/sotto-run10/wt/mergesec`
Date: 2026-09-08

Merges `security/hardening-2026-09-07` (4 commits closing the 2026-09-07 audit)
onto `main` @ `b2b65fc` (run 10 plus origin/main's PRs #1-#5). Nothing was
pushed and `main` was not touched.

## 1. The one conflict: `.github/workflows/ci.yml`

`git merge` reported exactly one conflict, as the dry run predicted. Both
sides had edited the `pnpm/action-setup` step.

### main's side (PR #1, commit `64f71a2` "ci: use the repository-pinned pnpm version")

```yaml
      - uses: actions/checkout@v4

      # Read the exact pnpm version from package.json; a second version conflicts.
      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 26
          cache: pnpm
```

### security branch's side

```yaml
      # Actions pinned to commit SHAs, not floating tags: a tag can be moved
      # to point at new code, and this job runs against repo source.
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
        with:
          version: 11

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 26
          cache: pnpm
```

### Why the two sides disagree

The merge base (`cd326af`) had `version: 11` with unpinned `@v4` tags.

- PR #1 **removed** `version: 11` so the pnpm version is read from the root
  `package.json` `packageManager` field (`pnpm@11.25.0`, present at the merge
  base and on main). `pnpm/action-setup@v4` fails when a version is specified
  in both places — that is what its retained comment means by "a second
  version conflicts".
- The security branch **added the three SHA pins** and left `version: 11`
  untouched from the merge base. That line is merge-base leftover, not a
  security change: the security commit `fde8a89` only replaced the floating
  tags.

Taking the security side verbatim would have re-introduced `version: 11`
alongside the `packageManager` pin and broken CI with a duplicate-version
error. Taking main's side verbatim would have dropped the SHA pinning.

### Resolution (both intents kept)

```yaml
      # Actions pinned to commit SHAs, not floating tags: a tag can be moved
      # to point at new code, and this job runs against repo source.
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4

      # Read the exact pnpm version from package.json; a second version conflicts.
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 26
          cache: pnpm
```

All three actions stay SHA-pinned (security intent) and the pnpm version stays
repository-pinned — in fact more precisely than `version: 11`, since
`packageManager` pins `11.25.0` (PR #1 intent). Both explanatory comments are
retained. Verified by diffing the resolved file against each parent:

- vs the security branch: only adds PR #1's comment, only removes `version: 11`.
- vs main: only the three SHA pins plus the SHA-pinning comment.

The file parses as YAML (6 steps; `action-setup` now has no `with:` block).

Bonus check, since this is a security merge: all three pinned SHAs were
confirmed against GitHub and each is exactly what that action's current `v4`
tag points at.

| action | pinned SHA | equals `v4` |
|---|---|---|
| `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` | yes |
| `pnpm/action-setup` | `b906affcce14559ad1aafd4ab0e942779e9f58b1` | yes |
| `actions/setup-node` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | yes |

## 2. CSP values in `apps/client/vercel.json` (unchanged, quoted as required)

Read after the merge and **not modified**. `prettier --write` on the file
reported "unchanged", so nothing was reformatted either.

Enforcing header — matches the required value exactly:

```
Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

The full policy sits under the report-only header, as required:

```
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self' https://huggingface.co https://*.huggingface.co https://raw.githubusercontent.com https://cdn.jsdelivr.net https://api.openai.com https://app.readsotto.app; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

## 3. Lockfile

The security branch bumps `@fastify/static` `^8.2.0` -> `^10.1.3` in
`apps/server/package.json`, and `pnpm-lock.yaml` moves with it. The lockfile
merged without conflict, and the merged lockfile is kept:

- `pnpm install --frozen-lockfile --prefer-offline` on main (baseline): exit 0.
- `pnpm install --frozen-lockfile --prefer-offline` after the merge: exit 0
  ("Lockfile is up to date, resolution step is skipped"; `Packages: +2 -8`).
- `git diff --stat -- pnpm-lock.yaml` after that install: empty, i.e. the
  install did not rewrite the lockfile.

No manual lockfile edits were made.

## 4. Proof

| check | result |
|---|---|
| `pnpm typecheck` | clean — all 5 projects `Done`, 0 errors |
| `pnpm test` (workspace root) | **870 passed / 870**, 96 files, 0 failed |
| apps/server tests | **111 passed / 111**, 14 files (see caveat below) |
| `pnpm --filter @sotto/core test` | **59 passed / 59**, 6 files |
| `pnpm lint` | **0 errors** (27 warnings, all pre-existing, none in files this merge touches) |
| `pnpm format` / `format:check` | resolved files already formatted; repo-wide "All matched files use Prettier code style!" |
| `pnpm content:validate` | **0 errors** (223 warnings, pre-existing content-authoring warnings) |
| `pnpm --filter @sotto/client web:export` | succeeded, exit 0 |

Root total is 870 vs main's 856 — the +14 are the security branch's new tests
(`app.test.ts`, `security.test.ts`, `packages/core/src/prompt.test.ts`,
`apps/server/src/voice/prompt.test.ts`).

Last three lines of `web:export`:

```
web build: 9 packs copied to dist/content/packs
web build: landing page + 4 fonts copied to dist/
web build: PWA manifest + sw-manifest.json written (39 shell files, v1788901256009.471)
```

Nothing was deployed. `apps/client/dist/` is gitignored and was not committed.

### `git diff --stat main..HEAD`

```
 .env.example                          |   8 +
 .github/workflows/ci.yml              |   8 +-
 Dockerfile                            |   4 +
 apps/client/vercel.json               |  23 +++
 apps/server/package.json              |   2 +-
 apps/server/src/app.test.ts           |  84 ++++++++++
 apps/server/src/app.ts                |  35 +++-
 apps/server/src/config.ts             |  17 ++
 apps/server/src/import/routes.ts      |   5 +-
 apps/server/src/security.test.ts      |  42 ++++-
 apps/server/src/security.ts           |  23 ++-
 apps/server/src/voice/prompt.test.ts  |   7 +-
 docker-compose.yml                    |   7 +-
 docs/self-hosting.md                  |  42 +++--
 fly.toml.example                      |   7 +
 packages/core/src/prompt.test.ts      |  74 ++++++++-
 packages/core/src/prompt.ts           |  50 +++++-
 planning/SECURITY-AUDIT-2026-09-07.md | 301 ++++++++++++++++++++++++++++++++++
 pnpm-lock.yaml                        |  76 ++-------
 19 files changed, 714 insertions(+), 101 deletions(-)
```

This is identical to `git diff --stat main...security/hardening-2026-09-07`,
which confirms the merge brought in the security branch's changes and nothing
else.

## 5. Uncertain / worth knowing

1. **`pnpm --filter @sotto/server test` is a silent no-op.** `@sotto/server`
   defines no `test` script (nor do `@sotto/voice` or `@sotto/content`); only
   the root, `@sotto/client` and `@sotto/core` do. Under a filter, pnpm exits
   0 with no output when the script is missing, so that command "passes"
   without running anything. This **predates the merge** — `main`'s
   `apps/server/package.json` has no `test` script either, and the security
   branch's only edit to that file is the `@fastify/static` bump.

   The server tests really run from the root vitest config, so the honest
   proof is `npx vitest run apps/server`: **14 files, 111 tests, all passing**.
   That number is what the table above reports. Adding `"test": "vitest run"`
   to the non-root packages would make the filtered commands mean what they
   look like, but that is out of scope here and was not done.

2. **`pnpm lint` does not cover the resolved file.** ESLint has no
   configuration matching `.github/workflows/ci.yml` ("File ignored because no
   matching configuration was supplied") — 0 errors, 1 ignore warning. YAML
   correctness was therefore checked by parsing the file and by prettier,
   which reports it already formatted. Repo-wide `pnpm lint` is 0 errors.

3. **The 27 lint warnings and 223 content warnings are pre-existing** and sit
   in files this merge does not touch. I confirmed no warning falls in
   `apps/server/src/{app,config,security}.ts`,
   `apps/server/src/import/routes.ts`, or `packages/core/src/prompt.ts`.

4. **`packages/core/src/prompt.ts` auto-merged** (both sides had edited it) and
   the result is coherent: the prompt-injection fencing (`fenceSafe`,
   `PASSAGE_FENCE`) applies to sentence text, word text, book/chapter titles,
   saved words and the recent-turn summary, and the passage is wrapped in the
   fence block. Its 22 core prompt tests pass. Reviewed by eye, not merely by
   green tests.

5. Nothing was pushed, `main` was not modified, and the primary checkout at
   `/Users/noelturlington/Claude/sotto` (which holds another session's
   uncommitted work) was never touched.

## 6. Follow-up for Noel

- `merge/security` is ready but unpushed; merging it to `main` is a separate
  decision.
- CI will exercise this ci.yml for the first time on the next push/PR. The
  resolution is the only combination of the two intents that does not error,
  but it has not been run on GitHub from here.
