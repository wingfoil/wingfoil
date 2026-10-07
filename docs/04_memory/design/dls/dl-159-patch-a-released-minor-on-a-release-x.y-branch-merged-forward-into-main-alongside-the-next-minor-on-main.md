---
id: dl-159-patch-a-released-minor-on-a-release-x.y-branch-merged-forward-into-main-alongside-the-next-minor-on-main
type: decision-log
title: "Patch a released minor on a release/X.Y branch merged forward into main, alongside the next minor on main"
status: in-discussion
context: "release-planning"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 261006   # Orignal template version
---

## Context

Once `v0.3.0` is tagged, `main` moves on to v0.4. A defect found in 0.3 then needs a `0.3.1` that does not
carry v0.4's unreleased work. Two ratified decisions forbid every way of doing that today:

- **`dl-002-git-branching-trunk-based`** (`ready`), *Decision* point 3: "**No long-lived release branches**: There
  are no separate release/* or develop branches; all delivery flows through main." Its preamble says this point
  survived `dl-014`'s partial supersession ("no long-lived release branches, main always releasable").
- **`dl-092-tracking-a-patch-after-its-minor-is-released`** (`ready`, approve `864d8bdf`: Q1 (A), Q2 (ii) and "the
  parallel-release rule (option a) as already ruled"). Its *parallel-release rule* keeps trunk-based development:
  both lines land on `main`, and "From then until the `v0.2.2` tag, v0.3 merges into `main` only Memory and process
  documents" (option (a), *partial freeze*). It declined option (c), a patch branch cut from the minor's tag,
  because "it contradicts `dl-002` point 3 and would need a decision-log that supersedes it". This is that
  decision-log.

The partial freeze worked for v0.2.2 because v0.3 was still planning when the patch ran. It does not scale past
that: a patch of 0.3 found while v0.4 is in implementation would freeze every v0.4 code merge until the patch is
tagged, or would publish v0.4 code inside a patch that promises no behaviour change (`dl-092` *Rationale*, second
bullet).

Facts read on `main` at `5017321c`, with the build under development (`node dist/cli.js`, version 0.2.2 at that
commit):

- **The publish pipeline assumes one line.** `.github/workflows/publish.yml` job `gate`, step "Tag commit is on
  main (dl-024)", runs `git merge-base --is-ancestor "$GITHUB_SHA" origin/main`; `test/cli/publish-pipeline.test.ts`
  ("gate asserts tag-on-main + tag↔version, …") pins that exact line. A tag cut on `release/0.3` before it is
  merged forward fails this gate.
- **GitHub Actions runs the workflow file of the tagged commit.** A `v0.3.1` tag on `release/0.3` therefore runs
  the `publish.yml` that `release/0.3` carries, which is the one in the tree `v0.3.0` was cut from. Whatever the
  pipeline needs for a maintenance line must be in that tree before `v0.3.0` is tagged.
- **The promote step names no dist-tag.** Job `promote` runs `npm stage publish ./dist-pack/*.tgz --provenance
  --access public`, pinned by `publish-pipeline.test.ts`. npm's client refuses to apply `latest` implicitly to a
  version lower than the highest published one: `lib/commands/publish.js` throws "Cannot implicitly apply the
  "latest" tag because previously published version … is higher than the new version …" when no `--tag` is given.
  Read in the npm source of 11.19.0 (the npm Node 24.21.0 bundles, which `promote` pins via
  `PROMOTE_NODE_VERSION`), 11.20.0 and 12.1.0; `npm stage publish` is `class StagePublish extends Publish`
  (`lib/commands/stage/publish.js`), so the guard applies to staging too. So a `0.3.1` staged after `0.4.0` is
  live fails at promote today; what dist-tag a staged version receives when it is approved is not settled here
  (`npx -y npm@11.19.0 stage publish --help` lists `--tag`, and the documentation says nothing on approval).
- **CI does not watch a maintenance branch's pull requests.** `.github/workflows/ci.yml` `on.pull_request` is
  `branches: [main]` ("the one branch releases are cut from", its header comment); `test/cli/ci-workflow.test.ts`
  pins `{ branches: ['main'] }`. `on.push` is `branches: ['**']`, so a push to `release/0.3` already runs CI.
- **`spec-015-packaging-publishing`** (`approved`) §3 stage 4 ends "Triggered on a `vX.Y.Z` tag on `main`", and §4
  says the tag is "created **on `main`**" and that CI "asserts that the tagged commit is an ancestor of
  `origin/main`" (`dl-074`).
- **Id allocation already sees other worktrees.** `nextSequenceNumber` (`src/memory/add.ts`) takes `1 +` the highest
  number found over `sequenceCandidatePaths`, which reads the trees of every `refs/heads/*` and `refs/remotes/*`,
  `HEAD`, the index and the untracked files (`dl-101` §2 (a), `task-128`). Worktrees of one clone share
  `refs/heads`, so an `add` committed on the maintenance line's branch is visible to the next `memory add` on any
  other line of the same clone at once; a second clone sees it only after a push and a fetch.
- **Nothing states a parallel-release rule beyond v0.2.2.** `dl-092` Action 3 asked to "Add the parallel-release
  rule to `dl-002`'s successor text or to the `git-conventions` directive"; `grep -n -i 'parallel\|patch\|release/'
  .wingfoil/directives/custom/git-conventions.md` prints only §6.5 ("Agents do not allocate in parallel
  worktrees"), while the same file's `intake/` prefix is found 3 times by `grep -c -i 'intake/'`.
- **Other places that assume `main`:** `release-publishing.yaml` phase `tag` (`pre: ["on-branch-is-main", …]`,
  `git.tag("{release.version}", on: main)`); `dev-loop.yaml` `git.merge(to: main, ff: false)`; the
  `doc-versioning` directive's baseline ("the version on `main`") and `test/lint/helpers/version-bump.ts`
  `TRUNK_BRANCH = 'main'`; `git-conventions` §1 (closed prefix list, no `release/`) and §3 (tag on `main`).
- **Today's state:** tags `v0.2.0`, `v0.2.1`, `v0.2.2`; no `release/*` branch (`git branch -a | grep -i release`
  lists only `design/release_*` phase branches).

## Decision

**Two release lines may be open at once: `main` carries the next minor, and a `release/X.Y` branch carries the
patches of the released minor `X.Y`.** This supersedes `dl-002` *Decision* point 3 ("No long-lived release
branches") and `dl-092`'s parallel-release rule, option (a) (the partial freeze), for every patch from 0.3.1 on;
`dl-092` Q1 (A) and Q2 (ii) (a `release` element per patch, every phase but the retrospective) stand.

1. **The lines.** `main` is the next minor: v0.4 once `v0.3.0` is tagged. `release/X.Y` (e.g. `release/0.3`) is
   cut from the tag `vX.Y.0`, and only when the first patch of `X.Y` is needed; a minor that is never patched never
   gets a branch.
2. **Merge forward, never back.** A fix lands on the **oldest** affected line first. That line is then merged into
   `main` with `git merge --no-ff`. Fixes are never cherry-picked or rebased between lines: a cherry-picked
   `wf()` approve or reject commit is a second commit for one transition, with an `Approver:` line the approver
   did not write on that line, so `memory history` would report it twice; this is the audit trail `dl-035` and
   `git-conventions` §2 protect. `main` is never merged into `release/X.Y`. A fix needed only on the newer line
   stays on `main`.
3. **One owning line per element change.** A Memory element changes state only on the line that owns its fix (a
   bug fixed in 0.3.1 moves on `release/0.3` and reaches `main` by the merge forward), so the merge never has to
   reconcile two different transitions of one frontmatter.
4. **Tags.** A patch tag `vX.Y.Z` (Z ≥ 1) is created on the pushed `release/X.Y`; a minor tag `vX.Y.0` on the
   pushed `main`. "Pushed" is the precondition `dl-074` set for `main` ("tag on pushed main"; `spec-015` §4),
   extended to the maintenance branch.
5. **Work layout.** One clone, with a long-lived worktree for the maintenance line (e.g.
   `/home/robypomper/Workspaces/.wf2-wt/release-0.3`). Worktrees share refs, so `memory add`'s allocator sees
   the other line's `add` commits at once; two clones would not until a push and a fetch. `git-conventions` §6.2
   ("Push the `add` commit at once") becomes mandatory on both lines, not a recommendation.
6. **npm dist-tags.** A version lower than the highest published one never becomes `latest`; it is published
   under `latest-X.Y` (e.g. `latest-0.3`). `latest` goes to a version only when it is the highest published.

## Rationale

- **Merge-forward keeps every record once.** Each `wf()` commit exists on exactly one line and reaches `main`
  through a merge commit, so `memory history`, the governance check over pushed `wf()` commits (`task-167`) and
  `dl-035`'s no-rebase rule keep working unchanged. Cherry-picking (the usual alternative) duplicates commits
  by construction.
- **Oldest line first** is the only order that needs no back-merge: a fix made on `main` would have to be
  cherry-picked down, which point 2 forbids.
- **Cutting the branch lazily** keeps the common case (a minor never patched) trunk-based, as `dl-002` intended.
- **One clone with worktrees** is the layout this repository already runs (`.wf2-wt/`), and it is what makes
  `dl-101` §2 (a) collision-free across lines without the network.
- **The pipeline must be ready before `v0.3.0`** because the tag's own `publish.yml` runs: a gate, a dist-tag
  and a CI trigger added on `main` after `v0.3.0` would never reach `release/0.3`, which point 2 forbids
  back-merging. The `v0.3.0` publish on the `main` path exercises them first.
- **Declined:** keeping `dl-092` (a) (freezes v0.4 code for the life of each patch); a `develop` branch
  (git-flow: a third line with nothing to release from it); two clones (allocation collisions, `dl-101`).
- **Consequences accepted.** Every merge forward conflicts on the version-bearing files (`package.json`
  `version`, `server.json`, `CHANGELOG.md`, the `dl-095` pin); the resolution keeps `main`'s values and is
  recorded in the merge commit. A Memory element both lines edit (a release-line roadmap, a plan) needs the same
  care; point 3 keeps state changes out of that set.

## Actions

**A1 — in v0.3, before release-submit** (wave 3, batch B9; the three tasks this decision-log names in their
`ref`). They change the pipeline in the tree `v0.3.0` is cut from:

1. `publish.yml` gate: accept a tag whose commit is an ancestor of `origin/main` **or** of `origin/release/X.Y`,
   `X.Y` being the tag's own major.minor.
2. `publish.yml` promote: an explicit dist-tag, `latest` only for the highest published version, otherwise
   `latest-X.Y`; the MCP Registry listing checked for the same ordering.
3. `ci.yml`: `release/**` in `pull_request.branches`; `spec-015` §3/§4 amended ("tag on `main`" → the line's
   branch); the `npm-publish` environment and the OIDC trusted publisher confirmed for a tag from `release/*`.

**A2 — deferred, explicitly out of v0.3.** Owner: the v0.3 retrospective, then `patch-v0.3.1`'s prerequisites
step, done on `release/0.3` and merged forward:

1. `git-conventions` §1–§3: the `release/` prefix, the merge-forward rule (point 2), patch tags on
   `release/X.Y`, and the parallel-release clause `dl-092` Action 3 promised.
2. `doc-versioning` and `testing`: the baseline is the branch's integration branch (`release/X.Y` or `main`), not
   `main` alone; `test/lint/helpers/version-bump.ts` `TRUNK_BRANCH` follows.
3. `memory.yaml`: a `branch` field on `release`; a patch-seeding action; one fix task per line for a bug that
   affects both.
4. Workflows: a `patch-cycle.yaml` (`dl-092` Q1 option (C), if the retrospective wants it) and a parametric base
   branch in `dev-loop.yaml` (`git.merge(to: …)`) and `release-publishing.yaml` (phase `tag`).
5. `dl-095`: the pinned build per line (each line moves its own pin forward; a merge forward keeps `main`'s).

## Relations

- **Supersedes:** `dl-002-git-branching-trunk-based` point 3; `dl-092-tracking-a-patch-after-its-minor-is-released`
  parallel-release rule option (a). Both stay `ready` for the rest of their decisions.
- **Related:** `dl-024-git-branch-tag-conventions` (tag on `main`), `dl-035-task-branch-sync-with-main` (merge,
  never rebase), `dl-074-tag-must-be-on-pushed-main`, `dl-095-which-wingfoil-build-develops-wingfoil`,
  `dl-101-id-allocation-across-refs`, `dl-119-a-git-conventions-directive`; `spec-015-packaging-publishing` §3–§4.
- **Interacts with:** `task-223-declare-per-type-which-branches-may-receive-transitions` (v0.3 backlog): its
  per-type branch patterns must admit the maintenance line once `release/X.Y` exists (A2.3).
- **Traceability:** P1.13 (the `release` type), P4.1 (release workflows); REQ-STATE-01, REQ-SEC-01.
