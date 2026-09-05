# F3 — Public-flip prep: reference-app-name history audit (2026-09-05, Lane R3-F)

Report only. Nothing in this file was executed — no `git filter-repo`, no
push, no history rewrite. `origin/main == HEAD` (`484547938d665e20d39dc5d9c44c24283b5fbe65`
at the time of this pass) — this repo (`github.com/nturl/sotto`, private)
already has every commit below.

Throughout this file the leaked identity is referred to as **"the
reference name"** (a specific commercial reading-app product name), **"the
reference vendor"** (its publisher, a company name + legal suffix), and
**"the reference price"** (its subscription price). The literal strings are
used only in the `git log`/`git show` commands below (needed to actually
find them) and are not repeated in this document's prose.

## 1. What's leaked, and where

`planning/ADVERSARIAL-REVIEW-2.md` (committed 2026-09-05, this same day)
already found four commits via `git log --all -S"<reference name>"`. Re-
running that pin-point search, plus the same search for the vendor name and
the price string, during this pass turned up a **fifth commit that
ADVERSARIAL-REVIEW-2.md's own four-commit count missed** — because
`ADVERSARIAL-REVIEW-2.md`'s own text quotes the reference name and vendor
name verbatim while describing the leak, and that file's commit is itself
a hit.

```
git log --all -S"<reference name>"      # 5 commits
git log --all -S"<reference vendor>"    # 3 commits (subset)
git log --all -S"<reference price>"     # 3 commits (subset, same 3)
```

| commit    | date (local)        | subject                                                                                                            | files carrying a hit                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `4a3e586` | 2026-09-04 15:55:40 | chore: scaffold Sotto monorepo (WS-0)                                                                              | `.gitignore` (comment naming the reference app next to the `planning/research/` ignore rule)                                                                                                                                                                                                                                                                                                    |
| `df242b2` | 2026-09-04 16:44:28 | feat(client): design system primitives and shell screens (WS-2, Kimi K3) + orchestrator fixups                     | `planning/LEDGER.md`                                                                                                                                                                                                                                                                                                                                                                            |
| `1464906` | 2026-09-04 17:40:50 | content: 12 draft source bundles (FR/ES/EN x3, pt-BR, zh-CN, ca-ES) + planning docs                                | `planning/BRIEF.md`, `planning/DECISIONS.md`, `planning/KICKOFF-PROMPT.md`, `planning/PLAN.md`, `planning/design/DIRECTIONS-SPEC.md` — **`DECISIONS.md` is the worst one: reference name, reference vendor (with legal-form suffix), reference price, and personal trial dates, all in one place**                                                                                              |
| `3d67d24` | 2026-09-04 21:53:01 | planning: scrub the reference app's name, pricing, trial dates, and recording-derived notes before the public flip | `.gitignore`, `planning/BRIEF.md`, `planning/DECISIONS.md`, `planning/KICKOFF-PROMPT.md`, `planning/LEDGER.md`, `planning/PLAN.md`, `planning/design/DIRECTIONS-SPEC.md` — this is the **forward scrub commit**: it edits these files to remove the leak going forward, but (as a plain commit, not a rewrite) leaves the original strings fully intact in every ancestor commit's blob history |
| `7704b0d` | 2026-09-05 01:39:19 | planning: adversarial review 2 + ledger corrections (estimated timestamps disclaimed)                              | `planning/ADVERSARIAL-REVIEW-2.md` — **new finding, this pass**: this commit's own text (documenting the leak) quotes the reference name and vendor name verbatim                                                                                                                                                                                                                               |

## 2. This is not purely historical — there is a LIVE leak in the current tree

`ADVERSARIAL-REVIEW-2.md` states "The current tree is clean — ✓ VERIFIED
zero hits across the whole tree". That was true when it was written, but
became false the moment that very file was committed (`7704b0d`), because
the file quotes the reference name and vendor name while explaining the
`git log -S` finding. Verified this pass:

```
$ git grep -n -i -E "<reference name>|<reference vendor>|<reference price>" -- .
planning/ADVERSARIAL-REVIEW-2.md:48:...
```

One line, one file, still present in `HEAD`/`origin/main` right now — this
is not a `git filter-repo`-only problem. **Recommend a same-day forward
fix**: edit that one line in `planning/ADVERSARIAL-REVIEW-2.md` to name the
strings the same indirect way this document does ("the reference name" /
"the reference vendor" / "the reference price") instead of quoting them.
That's a `planning/` edit, outside this lane's (R3-F) path permissions
(`packages/content/src/validate.ts`, `apps/client/app/voice/[bookId].tsx` +
`src/voice/**`, `apps/client/e2e/rows.mjs`, `docs/evidence/**`) — flagging
here for Noel or whichever lane owns `planning/` to make as a small,
independent, non-history-rewriting commit. It does not block or change
either option below (the same string still needs stripping from the
five earlier commits' history either way, and `--replace-text` /
fresh-history would each also cover `7704b0d` once it's in scope).

## 3. Two options

### Option A — `git filter-repo --replace-text`

Rewrites every commit's blobs in place (all six commits above, once
`7704b0d` is folded in), keeping the rest of history, authors, and commit
hashes' _ancestry shape_ intact — but every commit's SHA changes, because
`filter-repo` rewrites the blobs, trees, and therefore every commit's hash
from the first rewritten commit forward.

1. Create a replacements file (not committed — keep it outside the repo,
   e.g. `~/Claude/sotto-flip/replacements.txt`), one `literal==>replacement`
   pair per line, using the literal reference strings found above:

   ```
   <reference name>==>REDACTED_APP
   <reference vendor>==>REDACTED_VENDOR
   <reference price>==>REDACTED_PRICE
   ```

   (Fill in the actual strings locally — see `git show 1464906:planning/DECISIONS.md`
   for the exact spellings including the vendor's legal-form suffix and
   currency/period formatting on the price.)

2. From a **fresh clone** (filter-repo requires this — it refuses to run
   in a repo with a working tree that has unpushed/uncommitted state, and
   rewrites the clone in place):

   ```
   git clone https://github.com/nturl/sotto.git sotto-flip
   cd sotto-flip
   git filter-repo --replace-text ~/Claude/sotto-flip/replacements.txt
   ```

3. Verify clean, then force-push (this is the one point of no return):

   ```
   git log --all -S"<reference name>" | wc -l    # expect 0
   git push origin --force --all
   git push origin --force --tags
   ```

**Consequences to weigh:**

- Every commit SHA in the repo changes from `4a3e586` forward (i.e. all of
  them — `4a3e586` is the root commit). Anyone with an existing clone
  (there are no other collaborators today, per `user-noel-profile.md`, but
  this is the general cost) must re-clone; their local branches/stashes
  based on old SHAs will not fast-forward and will need to be
  re-based or discarded.
- GitHub keeps cached views of the old commits (e.g. anything already
  indexed, permalinks, PR/issue references, and — notably — GitHub's own
  cached blob/commit pages) reachable via direct SHA URL for some time
  after a force-push, even though they're unreachable from any ref. GitHub
  support can purge these on request, but there's no self-service purge.
  For a currently-private repo with no external forks/stars/PRs against
  it, this residual-cache exposure is low-consequence, but it is not
  instantaneous or guaranteed.
- Any GitHub Action run logs, release artifacts, or cached CI state that
  quoted these strings survive independently of `git` history and need a
  separate check/purge (this repo currently has no CI workflows found
  under `.github/`, so this is likely moot — confirm before flipping).

### Option B — Fresh-history repo from a squashed snapshot

Discards all history and starts a new repo from the current (already-
scrubbed, once `7704b0d` is fixed per §2) tree state as a single commit.

```
mkdir ~/Claude/sotto-public
cd ~/Claude/sotto-public
git init
cp -R ~/Claude/sotto/. .   # or a clean `git archive` export from HEAD
rm -rf .git-old-refs-if-any
git add -A
git commit -m "Initial public release"
git remote add origin <new-or-same-repo-url>
git push -u origin main --force   # only if reusing the same GitHub repo
```

**Consequences to weigh:**

- Total loss of commit history, authorship trail, and the day-by-day
  build narrative (`planning/LEDGER.md`'s value as a record) from the
  public-facing repo. That history still exists in Noel's local
  `~/Claude/sotto` and can be kept privately/archived separately.
  the same GitHub cached-view caveat from Option A still applies if the
  same `github.com/nturl/sotto` URL is reused (old commit SHAs remain
  fetchable by direct URL until GitHub's cache expires or support purges
  them) — reusing the URL doesn't get around that; only a brand-new repo
  URL avoids it entirely.
- Much simpler to get right (no replacements file, no risk of a missed
  string pattern, no filter-repo dependency to install) — the whole leak
  surface is moot because there's no shared history to house it in.
- Loses `git blame` and any inbound links to specific commit SHAs.

## 4. Recommendation

**Option B (fresh-history repo, at a brand-new GitHub URL), not Option A.**

Reasoning: this repo has no other collaborators and no forks/stars/PRs
today (private, solo-authored per `git log` — every commit here is
`nturl`), so the history-preservation value Option A protects (blame,
existing PR/issue links, collaborators' local clones) doesn't apply. The
copyrighted reference-app research this whole leak stems from
(`planning/research/`) is already gitignored and was never meant to ship
publicly anyway — losing the surrounding planning-doc history for the
public copy is a small, acceptable cost, and it fully sidesteps both the
"did the replacements file catch every spelling/casing variant" risk in
Option A and the GitHub-cached-view residue problem (a _new_ repo URL has
no cached old-SHA pages to worry about; reusing the current URL under
Option B would still have that problem, so if the same URL must be kept,
Option A's residue caveat applies there too — pick a new URL under Option B
whenever possible). Keep the full-history private repo (`~/Claude/sotto`,
current `origin`) exactly as-is as the private working/archive copy —
nothing here proposes touching it.

## 5. Pre-flip checklist

- [ ] **§2 fixed**: `planning/ADVERSARIAL-REVIEW-2.md:48` forward-edited to
      stop quoting the reference name/vendor literally (small, independent,
      non-history-rewriting commit — not done by this lane; flagged for the
      `planning/` owner).
- [x] `planning/research/` is gitignored — ✓ VERIFIED, `.gitignore:29`
      (`planning/research/`), present since `4a3e586` and still present at
      `HEAD`.
- [ ] `planning/` fully scrubbed — **NOT yet true**; §1/§2 above are the
      gap (`7704b0d`, and the five earlier commits still carry the strings
      in history regardless of the forward scrub at `3d67d24`).
- [x] `LICENSE` and `NOTICE` present at repo root — ✓ VERIFIED
      (`ls LICENSE NOTICE` both resolve).
- [x] Secrets scan clean — ✓ VERIFIED this pass:
      `git log -p | grep -iE 'sk-|whsec_|api[_-]?key'` over the full
      history returns only `~/.config/deepseek/api_key` path references
      (a local filesystem path read at runtime, never a literal key
      value), `SOTTO_API_KEY`/env-var-name mentions, and
      `docs/openai.md`'s documented placeholder (`sk-...`, an ellipsis,
      not a real key) — no literal token value found anywhere in history.
- [ ] `git filter-repo` (if Option A is chosen instead of the
      recommendation) or the fresh-history export (Option B) actually run
      — **not done**, per this task's instructions; Noel decides and
      executes.

## 6. Commands used to produce this report (read-only)

```
git log --all -S"<reference name>" --format='%H %ad %s'
git log --all -S"<reference vendor>" --format='%H %s'
git log --all -S"<reference price>" --format='%H %s'
git show <commit> --name-only --format=
git show <commit> -- <file> | grep -i ...
git grep -n -i -E "<reference name>|<reference vendor>|<reference price>" -- .
git log -p | grep -iE 'sk-|whsec_|api[_-]?key'
git rev-parse HEAD / origin/main
git remote -v
```

No `git filter-repo`, `push --force`, `reset`, `checkout`, `clean`,
`stash`, `rebase`, or `merge` was run.
