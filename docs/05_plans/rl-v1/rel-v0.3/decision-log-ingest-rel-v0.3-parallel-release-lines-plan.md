---
id: decision-log-ingest-rel-v0.3-parallel-release-lines-plan
type: plan
title: "Decision-log-ingest — rel-v0.3 parallel release lines"
status: active
version: "1.0"
workflow: "decision-log-ingest"
phase: "rel-v0.3-parallel-release-lines"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 261006   # Orignal template version
---

## Context

Once `v0.3.0` is tagged, `main` becomes v0.4, and a 0.3 patch has nowhere to go: `dl-002` point 3 forbids
long-lived release branches, and `dl-092`'s parallel-release rule (option (a), the partial freeze) would freeze v0.4
code for the life of every patch. The approver decided on 2026-10-07 to run a maintenance line `release/X.Y` merged
forward into `main`, and asked for it to be captured as a decision-log, with the three pipeline tasks it needs in
v0.3 and handover notes on the backlog tasks that touch the same files. It is captured through
`decision-log-ingest` (`.wingfoil/workflows/custom/decision-log-ingest.yaml` v1.0), during v0.3's dev-loop (wave 3,
B1 done, B2 next), on branch `design/parallel-release-lines` in the worktree `.wf2-wt/design-parallel-lines`, cut
from `main` at `5017321c`. The branch name was given by the coordinator; `git-conventions` §1 puts an ingest main on
`ingest/`, so the prefix is a deviation the approver may want renamed before the merge.

Build: the build under development (`npm ci && npm run build`, then `node dist/cli.js memory …`; the commits carry
`WingFoil-Version: 0.2.2 (<sha>)`), as the v0.3 dev-loop does for Memory operations; the pinned build 0.2.1 has no
`--set` and cannot add a `task` or a `plan`.

Every fact the decision-log and the tasks state is checked at capture, against `5017321c`:
- `dl-002` point 3 and `dl-092`'s rule, verbatim, and both `ready` (`grep '^status:'`; `dl-092` approve `864d8bdf`);
- `publish.yml` (gate step "Tag commit is on main (dl-024)", promote's `npm stage publish` with no `--tag`),
  `ci.yml` (`on.pull_request.branches: [main]`), their pins in `test/cli/publish-pipeline.test.ts` and
  `test/cli/ci-workflow.test.ts`, `scripts/check-release-tag.cjs` (present, `task-115`), `server.json`;
- `spec-015` §3 stage 4 and §4 ("tag on `main`");
- `nextSequenceNumber` / `sequenceCandidatePaths` in `src/memory/add.ts` (all `refs/heads`, `refs/remotes`, `HEAD`,
  index, untracked), `TRUNK_BRANCH = 'main'` in `test/lint/helpers/version-bump.ts`;
- npm's implicit-`latest` guard, in the npm sources of 11.19.0, 11.20.0 and 12.1.0 (`lib/commands/publish.js`,
  `lib/commands/stage/publish.js`), and `npm stage publish --help` (lists `--tag`).

## Phases / Steps

1. **capture** (product-owner): `memory add --type decision-log` → `dl-159`, filled, `memory submit` →
   `in-discussion`. The three B9 tasks: `memory add --type task --set release=v0.3`, filled, `memory submit` →
   `pending`. Handover bullets on the seven backlog tasks that touch the same files, left **uncommitted** for the
   coordinator's `memory amend` (they are approved elements).
2. **approve** (⛔ approver): ratify `dl-159` (`in-discussion → ready`) before the `v0.3.0` tag; approve the three
   tasks (`pending → backlog`); run the seven amendments.

## Handoff

- **Approver:** the ratification, the three task approvals, the seven `memory amend` commits (reasons below), the
  open questions below.
- **Agent:** capture, the fact checks, the task drafts and the handover text.
- **Completion criteria:** `dl-159` `ready` (or rejected to `draft`); `task-265`..`task-267` `backlog`; the seven
  amendments committed; this plan `active → done`.

## Execution Notes

- **capture done (2026-10-07)** on `design/parallel-release-lines`: plan add `35cebcb4`; `dl-159` add `76d8ceb4`,
  submit `ddc139aa` (`in-discussion`); tasks add `c3fb6b8e`, `6328100d`, `f61337f7`, submit `395b812d`, `ed826279`,
  `c07688d8` (all `pending`). Every tool-written commit carries the `git-conventions` §7 trailers, added with
  `git commit --amend --no-edit --trailer …` (§8). No push, no merge.
- **Decision-log:** `dl-159-patch-a-released-minor-on-a-release-x.y-branch-merged-forward-into-main-alongside-the-next-minor-on-main`,
  release `v0.3`. Supersedes `dl-002` point 3 and `dl-092`'s parallel-release rule option (a); keeps `dl-092` Q1
  (A), Q2 (ii). Actions A1 (the three tasks) and A2 (deferred to the v0.3 retrospective and `patch-v0.3.1`'s
  prerequisites step on `release/0.3`: `git-conventions` §1–§3, `doc-versioning`/`testing` baseline and
  `TRUNK_BRANCH`, `memory.yaml` `release.branch` + patch seeding + one fix task per line, `patch-cycle.yaml` and a
  parametric base branch in `dev-loop.yaml`/`release-publishing.yaml`, the `dl-095` pin per line).
- **Tasks** (kind `feature`, priority `high`, `ref: dl-159`, wave 3, batch **B9**):
  - `task-265-accept-a-release-tag-on-origin-release-x.y-matching-the-tag-s-major.minor-in-the-publish-gate` —
    writes `.github/workflows/publish.yml` (gate step, header), `scripts/check-release-tag.cjs` + `.d.cts` (or a
    sibling), `test/cli/check-release-tag.test.ts`, `test/cli/publish-pipeline.test.ts`. depends_on `task-244`,
    `task-238`, `task-229`.
  - `task-266-promote-with-an-explicit-npm-dist-tag-latest-only-for-the-highest-published-version-else-latest-x.y`
    — writes `publish.yml` (promote step, possibly the `mcp-registry` job's `if:`, header), a new `scripts/*.cjs`
    + `.d.cts` and its test, `publish-pipeline.test.ts`, `spec-015` §3 stage 4 (Revision note). depends_on
    `task-265`, `task-238`, `task-244`.
  - `task-267-run-ci-on-pull-requests-into-release-and-amend-spec-015-s-tag-on-main-rule-for-maintenance-lines` —
    writes `.github/workflows/ci.yml`, `test/cli/ci-workflow.test.ts`, `spec-015` §3 stage 4 and §4 (Revision
    note). depends_on `task-207`, `task-265`.
- **B9 placement:** after B8, the last batch of v0.3, before `release-submit`. Merge order 265 → 266 → 267.
  Chains: `publish.yml` 229 (B5) → 238 (B6) → 244 (B7) → 265 → 266; `ci.yml` 207 (B3) → 267; `spec-015` 266 →
  267 (each its own Revision note). The coordinator adds the B9 row to `dev-loop-rel-v0.3-plan`'s W3 batch table.
- **Pending amendments** (edits uncommitted in the worktree, each inserted as the last Implementation Notes
  bullet, immediately before the line `## Execution Notes`; `grep -c '^## Execution Notes$'` → 1 in each file;
  `memory amend --dry-run` checked on `task-207`). Proposed `--reason`s:
  - `task-207-drive-e2e-smoke-through-fresh-project-use-scenario`: "Adds the handover from dl-159 (parallel
    release lines): the smoke job inherits ci.yml's triggers and names no main of its own, so task-267 can add
    release branches."
  - `task-219-define-release-candidate-staging-rehearsal-phase-recut-reentry`: "Adds the handover from dl-159
    (parallel release lines): the staging rehearsal and the re-cut rule are written against the candidate commit
    and the release's branch, not main by name."
  - `task-223-declare-per-type-which-branches-may-receive-transitions`: "Adds the handover from dl-159 (parallel
    release lines): the branch patterns must admit release/X.Y maintenance lines and must not read the branch from
    history."
  - `task-229-create-github-release-once-npm-has-version-sweep`: "Adds the handover from dl-159 (parallel release
    lines): the release job does not force the GitHub latest Release and polls npm for the exact version."
  - `task-230-add-waves-governance-resweep-growth-threshold-release-process`: "Adds the handover from dl-159
    (parallel release lines): waves, re-sweep and growth threshold are declared per release element, not per
    branch."
  - `task-238-publish-mcp-registry-github-actions-bound-publish-job`: "Adds the handover from dl-159 (parallel
    release lines): the tag gate stays one step task-265 can replace, and the registry job keeps one condition
    task-266 can extend."
  - `task-244-publish-release-test-results-coverage`: "Adds the handover from dl-159 (parallel release lines): the
    committed summary path is keyed by version, and nothing assumes the committing branch is main."
- **Considered, no handover:** `task-224` (reads `publish.yml` only for a status badge; an npm-version badge shows
  `latest`, which `dl-159` keeps on the highest version); `task-222` (adds `release-health` to
  `release-cycle.yaml`, files outside A1; A2.4 revisits the workflows). Grep used: `grep -lE
  'publish\.yml|ci\.yml|spec-015|release-publishing\.yaml|release-cycle\.yaml|release-submit\.yaml|check-release-tag|server\.json'
  docs/04_memory/v0.3/task-*.md`, filtered to non-`done` tasks.
- **In-flight W3 (B2 next: 199, 198, 200, 220, 223, 260, 261, 264):** no B2 task writes `publish.yml`, `ci.yml` or
  `spec-015`. Only `task-223` receives a handover: land its amend before `task-223` starts (or its branch picks it
  up with `git merge main`, `dl-035`). `task-260` writes `git-conventions.md` (B2): `dl-159` A2.1 changes the same
  file but is deferred past v0.3, so no overlap. `task-199` rewrites `.wingfoil/workflows/custom/` (incl.
  `release-publishing.yaml`): A2.4 is deferred, no overlap.
- **Open questions for the approver:**
  1. Ratify `dl-159` before B9 starts (the tasks are gated on `ready`); then whether `dl-002` and `dl-092` get a
     dated "partially superseded by `dl-159`" note, as `dl-002` carries for `dl-014` (a `memory amend` each).
  2. `task-267`: should `ci.yml`'s concurrency group spare `release/*` as it spares `main` (the AC lets design
     decline it with a reason)?
  3. `task-267`: the external check of the `npm-publish` environment's deployment rule and of the npm trusted
     publisher for a tag pushed from `release/*` (expected to pass; neither names a branch; not verified here).
  4. The branch prefix (`design/` for an ingest run, see *Context*).
  5. `task-266`: whether `npm stage approve` applies the `--tag` given at staging is not settled offline; if design
     cannot settle it, it is checked with `npm view wingfoil dist-tags` after `0.3.0` is approved.
