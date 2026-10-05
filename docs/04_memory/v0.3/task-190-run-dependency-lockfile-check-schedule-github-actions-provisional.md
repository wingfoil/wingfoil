---
id: "task-190-run-dependency-lockfile-check-schedule-github-actions-provisional"
type: task
title: "Run the dependency and lockfile check on a schedule in GitHub Actions (provisional cadence trigger)"
status: in-review
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "workflow", "ci", "cadence"]
ref: "dl-105"
bug: ["bug-225", "bug-238"]
depends_on: ["task-140-run-packaging-gate-push-pull-request-separate"]
tmpl_version: 260703
---

## Description

Lockfile drift arriving from the registry is seen only at a tag (`dl-069`). `dl-105` schedules an intermediate task in v0.3: a GitHub Actions workflow with `on: schedule` that runs `npm ci` and `npm run check:lockfile`, read-only, keyed on exit status, until the engine takes the trigger over.

## Acceptance Criteria

- (red-first) A test in `test/cli/` (the `publish-pipeline.test.ts` style) parses the new workflow file and asserts: an `on: schedule` cron (five fields) plus `workflow_dispatch`, `permissions: contents: read` only, no push/tag/publish step, steps `npm ci` then `npm run check:lockfile`, pinned Node at the CI `NODE_VERSION`.
- (characterization) The cron string is recorded in the file header next to a pointer to `dl-105`, so the future phase `cadence: { recurring: { cron } }` reuses the same string (R1 (a)).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-105 Decision 3–4, Action 2; R2 (c); R4.
- **Features:** P4.1.
- **Notes:** Proposal key: A21. coordinate with the `dl-076` (D) `ci.yml` task and `dl-129`'s Scorecard workflow (other domains) so CI files and their pinning test stay consistent. Declaring `cadence` on `dl-089`/`dl-100`/`dl-088` phases (Action 3) waits for those phases to exist and for the engine (v1.0); not in v0.3.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Triage of 2026-10-05 (`bug-ingest-rel-v0.3-w1b6-review-findings-plan`):** the scheduled check also runs
  `npm audit --omit=dev --audit-level=high` (`bug-223`, fixed by `task-250`), and `bug-225` adds a
  directory-wide test that every `uses:` in `.github/workflows/` is a full commit SHA with its tag comment.

## Execution Notes

### design (architect, 2026-10-05)

- **depends_on:** `task-140` is `done` (`grep -n "^status" docs/04_memory/v0.3/task-140-*.md`); its notes carry no
  handover to this task (`grep -n "task-190" docs/04_memory/v0.3/task-140-*.md` → nothing). The one handover is
  `task-250`'s (`grep -n "task-190" docs/04_memory/v0.3/task-250-*.md`): call the named script `npm run check:audit`,
  so ci.yml and this workflow run one command.
- **Specs cited:** none — the task implements `dl-105` (`ready`, `grep -n "^status" docs/04_memory/design/dls/dl-105*.md`)
  Decision 3–4 / Action 2 / R1 (a), R2 (c), R4. No tech-spec names the CI workflow files
  (`grep -rln "check:audit\|ci\.yml\|scorecard" docs/04_memory/design/specs docs/02_requirements` → nothing), so no
  spec edit and no pending amendment.
- **Shape.** A new `.github/workflows/dependency-check.yml` (`ci.yml` is untouched: its step list is pinned by
  `test/cli/ci-workflow.test.ts`). One job on `ubuntu-24.04`, `NODE_VERSION` `22.12.0` equal to ci.yml, the same two
  action pins as ci.yml. Steps: `npm ci` (id `install`), then `check:lockfile`, `check:audit`, `check:audit:all`, each
  `if: ${{ !cancelled() && steps.install.outcome == 'success' }}` so one red check never hides another and a failed
  install adds no extra reds (the rule ci.yml uses for `typecheck`).
- **Cron: `17 6 * * *` (daily, 06:17 UTC)** — decision for the approver to confirm. Daily because lockfile drift and
  new advisories arrive from outside the repository and dl-105's rationale is catching drift "on the day it began";
  an off-the-hour minute because GitHub delays runs queued on the hour. Recorded in the header on the same line as
  `dl-105` and the future `cadence: { recurring: { cron: … } }` string (AC 2).
- **bug-238: fixed AND reported.** `npm audit fix` clears all five dev-tree advisories as a lockfile-only refresh
  (no `package.json` dependency change, `git diff 0cf8b131 -- package.json` shows only the new script); the
  whole-tree audit is a new named script `check:audit:all` = `npm audit --audit-level=high`, run by the scheduled
  workflow only — not by ci.yml, so a push stays gated on the production tree and the dev tree is a scheduled report
  (`bug-238` Notes). The scheduled step fails the run on a new high advisory (exit status, dl-105 R4): the red run is
  the report. Decision for the approver to confirm (alternative: `continue-on-error`, which R4 rules out).
- **bug-225:** `test/cli/workflow-action-pins.test.ts` reads `.github/workflows/*.y{a,}ml` as a directory; the rule is
  `owner/repo[/path]@<40 hex> # vX.Y.Z`, with `./` and `docker://` exempt by rule. A second check compares the
  `uses` values the YAML parser sees (job- and step-level) with the scanned lines, so a flow-style `{ uses: … }`
  cannot escape the line scan.
- **AC classification** (testing directive, dl-014/T1):

  | AC / bug | Classification | Why |
  |---|---|---|
  | AC 1 — workflow shape | red-first | the file does not exist on `0cf8b131` |
  | AC 2 — cron in header next to dl-105 | **red-first** (was: characterization) | nothing to characterize: the header is new with the file; its test fails before the file exists |
  | bug-225 — directory-wide pin rule | characterization | all three existing files are already pinned (`ci-workflow`/`scorecard-workflow`/`publish-pipeline` suites); the new suite passes on them on first run, and a self-test of the matcher shows it rejects tag-only, short-SHA, uncommented and non-semver-comment forms |
  | bug-238 — dev-tree advisories | red-first | the lock on `0cf8b131` carries the five advised entries |

### red (2026-10-05)

- `0a9b19aa` — three new suites: `test/cli/dependency-check-workflow.test.ts` (AC 1–2),
  `test/cli/workflow-action-pins.test.ts` (bug-225), `test/cli/dev-advisories.test.ts` (bug-238: the script, its
  scheduled run, and a snapshot that no lock entry — hoisted or nested — of the five packages is inside the advised
  ranges `bug-238` recorded).
- Run on main's lockfile: `npx jest test/cli/dependency-check-workflow.test.ts test/cli/workflow-action-pins.test.ts test/cli/dev-advisories.test.ts`
  → **Suites 2 failed / 1 passed; Tests 17 failed / 8 passed**: all 10 dependency-check tests and all 7 dev-advisories
  tests fail (no file, no script, five advised entries incl. the nested `js-yaml@3.15.0`); the 8 pin tests pass
  (characterization).

### green (2026-10-05)

- `fa6ecd23` — `.github/workflows/dependency-check.yml`; `package.json` script `check:audit:all`;
  `package-lock.json` refreshed by `npm audit fix`: 14 entries moved, all `dev: true` — `brace-expansion` ×6
  (hoisted 2.1.1→2.1.7; nested under `test-exclude` 1.1.15→1.1.21; under `eslint`, `@eslint/config-array`,
  `@typescript-eslint/typescript-estree`, `typedoc` 5.0.7→5.0.12), `browserslist` 4.28.4→4.29.3, nested `js-yaml`
  (`@istanbuljs/load-nyc-config`) 3.15.0→3.15.2, `baseline-browser-mapping` 2.10.41→2.11.27, `markdown-it`
  14.3.0→14.3.2, `caniuse-lite` 1.0.30001800→1.0.30001814, `electron-to-chromium` 1.5.387→1.5.444, `node-releases`
  2.0.50→2.0.57, `update-browserslist-db` 1.2.3→1.3.3. Listed by
  `git show 0cf8b131:package-lock.json > old.json` then a node diff of `old.json` `.packages` vs HEAD's `.packages`
  by install path and `version` (14 lines, every one `dev`). New engines ranges are `20 || >=22`
  (`git diff -U0 0cf8b131 -- package-lock.json | grep '"node":'`), compatible with the 22.12.0 floor.
- Live checks in the worktree: `npm run check:lockfile` → exit 0; `npm run check:audit` → exit 0;
  `npm run check:audit:all` → `found 0 vulnerabilities`, exit 0 (was 5: 3 high, 2 moderate, `npm audit --json`
  before the fix).
- bug-056 class (npm 10.9 refusing the lock): `npx -y npm@10.9.0 ci --ignore-scripts` on a scratch copy of
  `package.json` + `package-lock.json` → exit 0, `found 0 vulnerabilities` (10.9.0 is the npm Node 22.12.0 bundles).
- The three new suites plus `ci-workflow`, `production-advisories`, `lockfile-peer-overrides`, `check-lockfile-pins`
  → 7 suites, 76 tests passed.

### refactor (2026-10-05)

- `npm test` → 246 suites, 4642 tests passed (includes typecheck and control-character gates).
- `npm run test:coverage` → All files 99.07 stmts / 96.21 branches / 96.18 funcs / 99.68 lines; no `src/` change
  (`git diff --stat 0cf8b131 -- src` → empty), so coverage cannot regress against main.
- `npm run lint` → exit 0; `npm run docs:api` → exit 0; `npx tsc --noEmit -p tsconfig.json` → exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- `node scripts/check-governance.cjs --base 0cf8b131` → 3 wf() commits, 0 findings, exit 0.
- BDD: none — no scenario under `docs/02_requirements/02_bdd/features/` covers a CI workflow file, and P4.1's
  scenarios are about `workflows.yaml`; nothing to extend.
- No refactor was needed beyond the green commit.

### review (reviewer, 2026-10-05)

- AC 1: met — `dependency-check-workflow.test.ts` asserts `schedule` (one five-field cron) + `workflow_dispatch` only,
  `permissions: { contents: read }` and no job-level permissions, no `git push|tag|commit`, `npm publish|version`,
  secret, OIDC or `write` in the non-comment YAML, `persist-credentials: false`, run steps exactly `npm ci`,
  `check:lockfile`, `check:audit`, `check:audit:all`, `NODE_VERSION` equal to ci.yml's, setup-node fed from it,
  runner and action pins equal to ci.yml's. The triage's `check:audit` step and bug-238's `check:audit:all` extend
  the AC's "`npm ci` then `npm run check:lockfile`" in that order.
- AC 2: met — the test finds a header line carrying `'17 6 * * *'` and `dl-105`, and the `cadence: { recurring: { cron:`
  string.
- bug-225: met — the directory suite covers `ci.yml`, `dependency-check.yml`, `publish.yml`, `scorecard.yml`
  (4 files × 2 checks, `npx jest test/cli/workflow-action-pins.test.ts`).
- bug-238: met — 0 advisories in the whole tree, a lock snapshot against regression, and a scheduled report.
- Same-class check in touched files: the other workflow suites keep their own per-file pin checks (bug-225 asks to
  keep them); no other workflow file lacks a pin.
- Not verified here: the workflow's first real run (a cron tick or `workflow_dispatch` after the merge to `main`;
  GitHub runs `schedule` only from the default branch).
- **Review fixes (independent review, 2026-10-05):** the green note named 12 of the 14 moved lock entries
  (missing `node-releases` and `update-browserslist-db`); it now lists all 14 with the command that lists them.
  Prose only; task stays `in-review`.
