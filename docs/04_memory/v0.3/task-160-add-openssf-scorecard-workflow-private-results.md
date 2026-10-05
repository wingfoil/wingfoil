---
id: "task-160-add-openssf-scorecard-workflow-private-results"
type: task
title: "Add the OpenSSF Scorecard workflow with private results"
status: approved
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "trust", "ci"]
ref: "dl-129"
bug: []
depends_on: []
tmpl_version: 260703
---

## Description

Nothing outside the code shows the project is maintained and safe. Scorecard runs on push to `main` and weekly, results private for the first run.

## Acceptance Criteria

- (characterization) `.github/workflows/scorecard.yml`: official action pinned by SHA, `publish_results: false`, only the documented permissions; a test pins these.
- (characterization) the first run's scores recorded in Execution Notes; each low check listed for the approver's decision before Q1 (a) publication.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-129 §1 (Q1 (b) first run).
- **Notes:** Proposal key: D35.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-160-add-openssf-scorecard-workflow-private-results`, worktree
`../.wf2-wt/task-160`, cut from `main` at `1127a0fd` (`git merge-base --is-ancestor 1127a0fd HEAD`
→ exit 0). Start `a8689eb4`. No `bug:` and no `depends_on`, so no bug sync and no upstream notes to read.

### design (architect)

**Decision ratified.** `dl-129` is `ready`; its approve commit `adfc3c39` records "Q1 (b) for the first
run, then (a)" (`git log --grep=dl-129 --format=%b`). So this task ships `publish_results: false`;
the switch to (a) is an approver decision after the first run (AC 2).

**Specs.** No tech-spec governs `.github/workflows/`; `dl-129` Decision 1 is the contract (push to
`main` + weekly, official action pinned by SHA, only the documented permissions). No spec is missing
or needs revision. No backticked name was added to a spec, ADR or SARD file, so
`test/docs/name-resolvability.test.ts` is unaffected.

**Upstream facts, read 2026-10-05** (each is the command that establishes it):

- latest `ossf/scorecard-action` release is `v2.4.4` (`gh api repos/ossf/scorecard-action/releases/latest
  --jq .tag_name`); its commit is `2d1146689b8cda280b9bc96326124645441f03bc`
  (`git ls-remote --tags https://github.com/ossf/scorecard-action`, the dereferenced `v2.4.4^{}`; the
  tag itself is annotated, object `55891bbd…`). `action.yaml` at `v2.4.4`: `runs.using: docker`, image
  `ghcr.io/ossf/scorecard-action:v2.4.4`, `publish_results` default `false`.
- latest `github/codeql-action` v4 release is `v4.38.2`, commit `2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2`
  (`git ls-remote --tags https://github.com/github/codeql-action | grep '\^{}' | sort -k2 -V`);
  `upload-sarif/action.yml` at that tag: `runs.using: node24` — the runtime `task-113` requires.
- permissions documented by the action's README at `v2.4.4`: `security-events: write` for the
  code-scanning upload; `id-token: write` only for `publish_results: true`; and, as job-level reads,
  `contents`, `issues`, `pull-requests`, `checks`. The upstream example workflow
  (`.github/workflows/scorecards.yml` at `v2.4.4`) uses the same `actions/checkout` pin as `publish.yml`.

**Design choices** (for the approver to confirm, see review):

1. Permissions: workflow-level `contents: read` (the repository's convention, as `ci.yml`), job-level
   exactly `security-events: write` + four reads (`contents`, `issues`, `pull-requests`, `checks`).
   Those four are the README's set for PRIVATE repositories ("Additional permissions for private
   repositories"); this repository is public and would run without them. They are kept so a
   visibility change does not break the run (review fix 3). Not `read-all` (the GitHub starter
   workflow's choice): narrower, and explicit.
2. "Private" (Q1 (b)) means **not published**: `publish_results: false`, so nothing reaches
   api.scorecard.dev and there is no badge. It does not make the scores secret: scorecard-action
   v2.4.4 writes the SARIF to the results file and to stdout (`internal/scorecard/format.go`,
   `io.MultiWriter(resultFile, os.Stdout)`; read with `gh api
   "repos/ossf/scorecard-action/contents/internal/scorecard/format.go?ref=v2.4.4"`), so the full
   report, low checks included, is in the public run log. Leaving out `upload-artifact` is defence in
   depth, not what keeps results private. Seeing the scores before any exposure needs a local
   Scorecard CLI run (`GITHUB_AUTH_TOKEN=$(gh auth token) docker run --rm -e GITHUB_AUTH_TOKEN
   gcr.io/openssf/scorecard:v5.5.0 --repo=github.com/wingfoil/wingfoil --format=json --show-details`)
   before step 1 below — the approver's decision (review fix 1). The workflow header also warns never
   to set `repo_token` to a PAT that is not a registered secret: `options/options.go` `Validate` prints
   the token env var to the log, and only registered secrets are masked.
3. Triggers: `push: branches: [main]` and `schedule: '23 5 * * 1'` (Mondays 05:23 UTC), nothing else —
   no `workflow_dispatch`, no `branch_protection_rule`. The latter, with `permissions: read-all`, is in
   GitHub's starter workflow (`gh api repos/actions/starter-workflows/contents/code-scanning/scorecard.yml`);
   scorecard-action's own v2.4.4 example has only `workflow_dispatch` (review fix 5). `dl-129` names
   push + weekly only.
4. The workflow already meets the Scorecard API's restrictions on a publishing workflow (no
   `env`/`defaults`, no workflow-level write, no container/services, hosted Ubuntu, only approved
   actions), so Q1 (a) is two lines: `publish_results: true` + `id-token: write` on the job.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `scorecard.yml`, SHA pin, `publish_results: false`, documented permissions, a test pins them | **red-first** (corrected from characterization) | the file does not exist on `main` (`ls .github/workflows` → `ci.yml publish.yml`); its test fails first for real |
| 2 — first run's scores recorded, low checks listed for the approver | characterization / **external** | a measurement of a GitHub Actions run; needs a push to `main` the agent cannot make — see "Approver steps" |

### red (developer)

`test/cli/scorecard-workflow.test.ts` (`f85ed710`), modelled on `ci-workflow.test.ts`: 8 tests —
existence; triggers exactly push-to-`main` + one weekly cron; unpublished results (`publish_results: false`,
`sarif`, `upload-sarif` reads the `results_file`, no `upload-artifact`); permissions (workflow
`{contents: read}`, job exactly the five documented ones); no OIDC/secret/credential and
`persist-credentials: false`; the Scorecard API's workflow shape; every `uses:` full-SHA with its tag in a
comment, frozen to the three lines above; the checkout line identical to `publish.yml`'s.
`npx jest test/cli/scorecard-workflow.test.ts` → **8 failed, 8 total** (each `ENOENT … scorecard.yml`).

### green (developer)

`.github/workflows/scorecard.yml` (`f8c5815d`): one job `analysis` on `ubuntu-24.04`, checkout →
`ossf/scorecard-action` → `upload-sarif`, with a header in the style of `ci.yml`/`publish.yml` explaining
the trigger, the privacy, the Q1 (a) switch and the permissions. First run of the test: 7 passed,
1 failed — the credential scan found `id-token` in the **header comment** (the Q1 (a) explanation). The
test was over-strict, not the workflow: it now scans only non-comment lines (comment in the test says
why), committed with the green. Then `npx jest test/cli/scorecard-workflow.test.ts
test/cli/ci-workflow.test.ts test/cli/publish-pipeline.test.ts` → 3 suites, 42 tests passed.
No `actionlint`/`act` on this machine (`which actionlint act` → nothing), so the workflow is checked
structurally only; its real check is the first run.

### refactor (developer)

| Gate | Command | Result |
|---|---|---|
| tests | `npm test` | 215 suites, 3854 tests passed |
| coverage | `npm run test:coverage` | 215 suites / 3854 tests; All files 98.88 / 95.56 / 95.34 / 99.58 — `src/` untouched; plan's last `main` figure 98.88 / 95.53 / 95.34 / 99.57 |
| lint | `npm run lint` | exit 0 |
| API docs | `npm run docs:api` | exit 0 |
| tsc | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| tsc build | `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

No CLI command or help changed, so `docs/cli-reference.md` is untouched. No BDD feature covers CI
workflows (`grep -rli scorecard docs/02_requirements/02_bdd` → nothing).

### review (reviewer)

- AC 1: met — `scorecard.yml` exists, `ossf/scorecard-action@2d11466… # v2.4.4`, `publish_results: false`,
  permissions as documented, pinned by `test/cli/scorecard-workflow.test.ts` (8 tests green).
- AC 2: **open, pending the approver** — the first run needs `scorecard.yml` on `main` on GitHub.
- Security: no secret, no PAT, no OIDC; `persist-credentials: false` (test asserts it).
- Service element: none needed for Q1 (b) — nothing is switched on outside the repository
  (a SARIF upload to a public repository's code scanning is expected to need no setting — to confirm at the first run). Q1 (a) publication
  will be external state (api.scorecard.dev result + badge) and should then be recorded as a `service`
  (`dl-129` Rationale, `dl-088`).

**Approver steps for AC 2** (the agent cannot push or run Actions):

1. Merge this branch to `main` and push `main`. The push itself triggers `scorecard` (the workflow
   runs only on `main`; pushing the task branch does not run it).
2. Record the run: `gh run list --workflow scorecard.yml --limit 1` (run id, conclusion).
3. The low checks, from code scanning, one line per check (alerts repeat per location, and the API
   pages at 30 by default):
   `gh api --paginate "repos/wingfoil/wingfoil/code-scanning/alerts?tool_name=Scorecard&state=open&per_page=100"
   --jq '.[] | [.rule.id, .most_recent_instance.message.text] | @tsv' | sort -u -t$'\t' -k1,1`.
   This is NOT the full score table: the SARIF omits a check that scored at or above its policy score
   or was inconclusive (ossf/scorecard v5.5.0 `pkg/scorecard/sarif.go`), so a check with no alert
   scored 10 or was inconclusive.
4. The complete table (every check and its score): the SARIF printed in the run log
   (`gh run view <run-id> --log`, `runs[].tool.driver.rules`), or a local JSON run
   (`GITHUB_AUTH_TOKEN=$(gh auth token) docker run --rm -e GITHUB_AUTH_TOKEN
   gcr.io/openssf/scorecard:v5.5.0 --repo=github.com/wingfoil/wingfoil --format=json --show-details`).
5. Paste run id + per-check scores into these notes; list each low check (expected: Code-Review,
   Branch-Protection, Dependency-Update-Tool, possibly Maintained/CII-Best-Practices/Fuzzing) with a
   decision line for Q1 (a).

### Pending amendments (approver)

None.

### review fixes (coordinator review, APPROVE WITH FIXES)

1. "Private" overstated → workflow header, test docstring/titles and design choice 2 now say "not
   published"; the SARIF is in the public run log; local CLI run named for pre-exposure viewing.
2. AC 2 steps 3–5 rewritten: `--paginate` + `per_page=100`, grouped by `.rule.id`, a check with no
   alert scored 10 or was inconclusive, complete-table sources named.
3. The four job-level reads are labelled the README's private-repo set, kept for a visibility change.
4. Test title: Q1 (a) is a two-line change.
5. Starter-workflow attribution corrected (design choice 3).
Plus a `repo_token` PAT warning in the workflow header. Re-run: see the gate line below.


Gates after the fixes: `npx jest test/cli/scorecard-workflow.test.ts` → 8 passed; `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
