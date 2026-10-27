---
id: "task-140-run-packaging-gate-push-pull-request-separate"
type: task
title: "Run the packaging gate on every push and pull request in a separate ci.yml"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "ci"]
ref: "dl-076"
bug: []
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

The pipeline environment is entered once per release; v0.2's two npm/git blockers surfaced only at the tag. A second workflow runs `npm ci` + `prepublishOnly` on push and PR at the same `NODE_VERSION`, leaving `publish.yml`'s trigger untouched.

## Acceptance Criteria

- (characterization) `.github/workflows/ci.yml`: `on: push` (all branches) and `pull_request` to `main`; `ubuntu-24.04`; Node from the same pinned value as `publish.yml` (one source, or a test asserting equality); actions pinned by SHA; `permissions: contents: read`.
- (red-first) a test in `test/cli/` (as `publish-pipeline.test.ts` does for `publish.yml`) asserts the trigger, runner, Node equality, the two steps and the permission set.
- (characterization) first run green on the task branch (run URL in Execution Notes).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-076 (D) (Q1 two tasks, Q2 a CI failure on the branch, Q4 no adr-009 amendment).
- **Notes:** Proposal key: D19. (A) corepack/packageManager, Q3 and `bug-119` stay v0.4.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-140-run-packaging-gate-push-pull-request-separate`, worktree `../.wf2-wt/task-140`,
cut from `main` at `c43221c4`; start `9c66bf06`. No linked bugs (`bug: []`), no `depends_on`.

### design (architect)

**`depends_on` read (dl-015).** None declared.

**Sources.** `dl-076-toolchain-divergence-unexercised-until-tag` is `ready`; its approve commit
`4e1ca12e` rules (D) now as "a separate `ci.yml` on push/PR (`npm ci` + `prepublishOnly` on
ubuntu-24.04 at `NODE_VERSION`), with no adr-009 amendment (Q4). Q2: a CI failure on the branch".
`spec-015-packaging-publishing` is `approved`, `adr-009-npm-publishing-pipeline` is `accepted`
(`awk '/^status:/{print $2;exit}'` on each). Neither needs a revision: spec-015 describes
`publish.yml`, and `grep -n -i "push\|pull_request\|ci.yml" spec-015` finds no clause that a second
workflow contradicts. Q4 is honoured by not touching `publish.yml` (`git diff c43221c4 --
.github/workflows/publish.yml` is empty), and `publish-pipeline.test.ts` still pins its trigger to the
tag alone. No BDD scenario covers CI workflows (`grep -rln -i "workflows/\|ci.yml"
docs/02_requirements/02_bdd/features/` finds only `P4.8-workflow-create.feature`, which is about
WingFoil workflows), so no BDD change.

**Design choices.**
- `on.push: {branches: ['**']}`. A `branches` filter alone means a tag push does not trigger the
  workflow, so a release tag does not run the gate twice (the tag's gate is `publish.yml`'s).
- Node: GitHub Actions cannot share `env` across workflow files, so the AC's "test asserting equality"
  branch is the one taken. `ci.yml` writes `NODE_VERSION: '22.12.0'` and the test asserts it equals
  `publish.yml`'s.
- Action pins: the test requires every `uses:` line of `ci.yml` to equal a line `publish.yml` already
  has. The SHA-to-tag table stays in one place (`publish-pipeline.test.ts`).
- `fetch-depth: 0`, `persist-credentials: false` and `package-manager-cache: false`, all as in
  `publish.yml`'s gate, so the suite runs on the same checkout the release gate uses.
- Q2 (a red gate is a CI failure): no `continue-on-error`, pinned by the test.
- Concurrency (not in the ACs, added): `group: ci-${{ github.ref }}`, cancelling an older run only off
  `main` (`cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`). This answers adr-009's
  push-cost concern for branch iteration. *Corrected at the independent review (below): the claim
  that every commit on `main` still gets its own result was false.* **The approver should confirm
  the corrected rule.**

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `ci.yml` shape | characterization (as declared) | it is the artifact AC 2's test pins; it adds no behaviour of its own, and it lands in the green commit that turns AC 2 green |
| 2 — test in `test/cli/` | **red-first** | `ci.yml` does not exist at `c43221c4`, so every assertion fails (ENOENT) |
| 3 — first run green on the task branch | characterization, **not executable in this session** | needs a push to `origin`, which this session may not do (no push; `act` is not installed: `which act` prints nothing) |

### red (developer)

`test/cli/ci-workflow.test.ts`, commit `22253a28`. `npx jest test/cli/ci-workflow.test.ts` gives
`Tests: 9 failed, 9 total`, each failing with `ENOENT ... .github/workflows/ci.yml`.

### green (developer)

`.github/workflows/ci.yml`, commit `c93f5383` (the concurrency line was added before that commit). One
job, `packaging-gate`, on `ubuntu-24.04`: checkout, setup-node at `${{ env.NODE_VERSION }}`, then
`npm ci` and `npm run prepublishOnly`. `permissions: contents: read` at workflow level only. The
header records the rationale, what is kept equal to `publish.yml`, and the local equivalent.
`npx jest test/cli/ci-workflow.test.ts test/cli/publish-pipeline.test.ts` gives `Tests: 31 passed,
31 total`. YAML parse: `node -e "require('js-yaml').load(fs.readFileSync('.github/workflows/ci.yml'))"`
loads without error, and `.concurrency` reads back as written. No `actionlint` is available
(`which actionlint` prints nothing), so the workflow is validated by parse and test only.

### refactor (developer)

Run sequentially, in the worktree, after `npm ci`. Local Node v22.21.0 / npm 11.6.2.

| Command | Result |
|---|---|
| `npm run prepublishOnly` (the two CI commands, locally: build + test + lint) | exit 0; 167 suites / 2769 tests passed; eslint clean |
| `npm run test:coverage` | exit 0; 167 / 2769; 98.73 / 94.58 / 94.01 / 99.49 (stmts / branches / funcs / lines). Not a regression: `git diff --stat c43221c4 -- src` is empty, so the covered sources are unchanged. task-127's notes record the same four figures at its review |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

`docs/cli-reference.md` is untouched, because no CLI command changed.

### review (reviewer, self)

- AC 1: met. The trigger, `ubuntu-24.04`, Node equal to `publish.yml`, SHA pins and
  `permissions: contents: read` are each asserted by `ci-workflow.test.ts`.
- AC 2: met. 9 tests assert the trigger, runner, Node equality, the two steps (exactly `npm ci`, then
  `npm run prepublishOnly`), the permission set, no `continue-on-error`, the pins, and that there is
  no credential.
- AC 3: **open — needs a push.** The first run's URL must be added after the approver or coordinator
  pushes the branch. Closest local evidence: the job's two commands, run here, exit 0 (refactor
  table). They ran under Node 22.21.0 / npm 11.6.2, not under the job's 22.12.0, so this does not
  replace the run.
- Same-class sweep: `publish.yml` is the only other workflow, and it is unchanged.

### review (independent)

Verdict: **approve with fixes**. Three findings, fixed in ``b45ded21``:

1. **The `ci.yml` "Concurrency:" header claimed something false.** A push of several commits runs once,
   on its tip. With `cancel-in-progress: false`, GitHub keeps one running and one pending run per
   group, and a third push cancels the pending one, so `main` did not get one result per commit.
   - Fix: on `main` the group is now the commit SHA, unique per push:
     `group: ci-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}`, with
     `cancel-in-progress: true`. Branch and PR groups are still the ref.
   - The header now states the actual guarantee: "every push to `main` gets its own run of its tip
     commit", and intermediate commits of a multi-commit push are not tested.
   - `ci-workflow.test.ts` pins the group and the cancel rule.
2. **The header said a test pins `fetch-depth: 0`, but none did.** The reviewer set `fetch-depth: 1`
   and all 9 tests still passed.
   - Fix: a new assertion requires `fetch-depth: 0`, equal to the value in `publish.yml`'s gate
     checkout.
   - Re-checked here: with `fetch-depth: 1`, `npx jest test/cli/ci-workflow.test.ts` gives `Tests: 1
     failed, 10 passed, 11 total`. Restored to 0, both files together give `33 passed, 33 total`.
3. **Accepted cost, now recorded in the header:** a branch with an open PR into `main` runs twice per
   push, once for `push` and once for `pull_request`.

**Reviewer's environment evidence for AC 3.**
- Command: `npm ci && npm run prepublishOnly`, run in Docker `node:22-bookworm` (Node 22.23.3,
  npm 10.9.9), with no git identity and `CI=true`.
- Result: `npm ci` exit 0; 167 suites / 2769 tests green.
- Output file: `scratchpad/task-140/docker-gate.out`, re-read here with `grep -E "Tests:|Test
  Suites:|v22"`.
- This is the closest stand-in for the runner. It is not the run itself. **AC 3 stays open until the
  approver decides the push.**

Gates after the fixes, run one after another in the worktree:

| Command | Result |
|---|---|
| `npm run prepublishOnly` | exit 0; 167 suites / 2771 tests (2 new) passed; eslint clean |
| `npm run test:coverage` | exit 0; 167 / 2771; 98.73 / 94.58 / 94.01 / 99.49, unchanged (no `src/` change) |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

### Pending amendments (approver)

None.

### AC 3 — first run on the task branch (coordinator, 2026-10-01)

The approver authorised the push of this branch at the review gate. Run
<https://github.com/wingfoil/wingfoil/actions/runs/36858971902> (workflow `ci`, event `push`, head
`f0d37268`) concluded **success**. The `packaging-gate` job passed every step (checkout, setup-node
22.12.0, `npm ci`, `prepublishOnly`), and its log reports `Test Suites: 167 passed, 167 total` and
`Tests: 2771 passed, 2771 total` (`gh run view 36858971902 --log`). AC 3 is met.
