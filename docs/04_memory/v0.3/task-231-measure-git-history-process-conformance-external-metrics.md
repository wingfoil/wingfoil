---
id: "task-231-measure-git-history-process-conformance-external-metrics"
type: task
title: "Measure the git-history, process-conformance and external metrics"
status: done
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "scripts"]
ref: "dl-089"
bug: []
depends_on: ["task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin", "task-222-declare-release-health-catalogue-v2-report-schema-release"]
tmpl_version: 260703
---

## Description

`scripts/release-health/measure.cjs`, history half: window/snapshot metrics derived from git at an immutable measurement point, in a throw-away worktree, never writing git config.

## Acceptance Criteria

- (red-first) G01–G15 and the P measures computed on a fixture repository with known answers (tests under `test/scripts/` or `test/release-health/`), raw counts beside every percentage, `small-sample` under 30 items.
- (red-first) the script never writes git configuration: a test snapshots `git config --list --show-origin` of the fixture before/after (identity via `git -c`/env only, dl-089 §6).
- (characterization) external snapshot (stars, forks, watchers, 14-day traffic, npm downloads) is recorded with the command and date read, or `not-measurable` offline.
- (characterization) report records Node/npm versions and lockfile hash; the scripts are not in the npm tarball (`npm pack --dry-run`).
- (red-first) the history half also measures `dl-111` Action 4's share of `wf()` commits carrying the `WingFoil-Version` trailer, `dl-101` Action 4's duplicate-id scan across branches (G15), and G08 against `dl-117`'s attribution rule (Action 3), each on the fixture with known answers.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §1 measure, §6 (G01–G15); dl-131 Decision 3 (P); dl-130 step 3; dl-111 Action 4 (share of `wf()` commits carrying `WingFoil-Version`); dl-101 Action 4 (duplicate-id scan, G15); dl-117 Action 3 (G08 against the attribution rule).
- **Features:** P4.1.
- **Notes:** Proposal key: D15.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B4 (2026-10-10, `task-222`'s independent review; W3 B4 follow-ups,
  `bug-ingest-rel-v0.3-w3b4-review-findings-plan`).** This task is the first consumer of the catalogue `task-222`
  wrote (`docs/08_health/metrics.yaml` version 2, validator `scripts/release-health/catalogue.cjs`), and the
  review found gaps in both:
  - **Validator gaps** in `catalogue.cjs` (each passes today and should be refused, with a rule test per case): a
    `floor` metric with `floor: null`; a `redefined` or `retired` id that names no metric; `added` given as a string
    instead of a list; a `direction` value outside the declared set on an `info` metric. Fix them before measuring,
    since the measure reads these fields.
  - **REQ-STATE-10's BDD is partial.** `P1.2-versioning-audit-trail.feature` has two scenarios under the comment
    "REQ-STATE-10 (US-6-12, task-222)" ("Process conformance names every failing item", "… byte-identical on a
    rerun"); both exercise check kind 1 (a malformed `wf()` commit). Kinds 2–5 of the fit criterion
    (`03_state-context.md`, REQ-STATE-10: legal transitions, `produces:` present, traceability links, actor per
    role) need a `Scenario Outline` with one example per kind, and the reviewer asked for an `@REQ-STATE-10` tag on
    them: the requirement is named in a comment only, and no feature file uses Gherkin tags yet (`grep -rln '^ *@'
    docs/02_requirements/02_bdd/features` → nothing, while `grep -rn "Scenario Outline"` over the same folder finds
    `P4.5` and `P4.18`), so the tag would be the first; keep the comment convention if a tag is not wanted. Kind 6 (two runs from one base) is the byte-identity scenario's neighbour and stays as it is unless the
    measure needs it.

## Execution Notes

### design (architect, 2026-10-10)

- **depends_on read (dl-015).** `task-192` (`done`): every commit written through `commitPaths` ends with a
  `WingFoil-Version: <semver> (<sha>)` trailer paragraph, read by `parseVersionTrailer` (`src/memory/commit-message.ts`)
  — G16 reuses that reader. `task-222` (`done`): catalogue v2 at `docs/08_health/metrics.yaml` (49 metrics), the
  report schema `docs/08_health/release-health.schema.json`, the validator `scripts/release-health/catalogue.cjs`, and
  the binding `release-health.measure` → `node scripts/release-health/measure.cjs --release <vX.Y[.Z]>`
  (`.wingfoil/workflows/bindings.yaml`). Its handover (B4 review) is in scope: four validator gaps and REQ-STATE-10's
  BDD kinds 2–5.
- **Decisions cited are ratified:** `grep -m1 '^status' docs/04_memory/design/dls/dl-{089,101,111,117,130,131}-*.md`
  → all `ready`. No tech-spec governs `scripts/release-health/` (`grep -ln "scripts/release-health" docs/04_memory/design/specs/`
  → nothing; a bare `release-health` matches spec-002, spec-003 and spec-017, which name the folder and the workflow, not the
  script — corrected at review, F1): the contract is dl-089 §1/§6, the catalogue and the schema. No spec edit is required.
- **Scope split (from the sibling tasks' Descriptions):** this task writes `measure.cjs` and its history half — G01–G16,
  P01–P07 and E01–E05. Q01–Q04, Q11, Q12, Q17 are `task-232`'s, Q05–Q10, Q13–Q16, Q18–Q20 are `task-233`'s (Q20 is
  handed to 233 by its own B4 handover), and the comparison is `task-241`'s. `measure.cjs` writes one entry per catalogue
  metric, in catalogue order (schema); a metric no measurer of this script covers yet is `not-measurable` with the
  reason naming its owning task, so the report is complete and 232/233 replace those entries. D01 and P06 need the
  benchmark's two runs (dl-089 §2, dl-131): a patch release records them `not-comparable` (schema); otherwise they
  are `not-measurable` ("needs D01's two benchmark runs, not run by this script") until a task owns the benchmark run.
- **Design.**
  - **Measurement point** (dl-089 §1): `--at <rev>` overrides; otherwise the release element whose `version` is
    `--release` is read at `HEAD`; the point is the highest tag named `<version>` or `<version>.<n>` (a patch:
    `<version>` exactly) that is not another release element's version, else the commit carrying the release's
    `[… → released]` transition. The tag rule is a reading of "the version actually published": `v0.2.0` (tagged, never
    published, `bug-135`) is passed over because `v0.2.1` is higher — a failed publish with no later tag cannot be told
    from git alone (decision for the approver).
  - **Window** (dl-089 §2): `<previous point>..<point>`; previous = `--previous <rev>`, else the most recent earlier
    `release-health-<v>.json` under `paths.health` (its `measurement_point.commit`), else none (first run: the whole
    history, `previous: null`).
  - **Throw-away worktree** (dl-089 §6): `git worktree add --detach` in a `mkdtemp` directory, hooks off through
    `git -c core.hooksPath=…`, removed in `finally`; every other read is `git log`/`git show <rev>:<path>`/`ls-tree` at
    the point. Nothing writes git configuration and no identity is needed (nothing is committed).
  - **Reuse, not re-implementation:** the commit grammar readers of `dist/memory` (`parseMemoryOperation`,
    `parseApproverTrailerLine`, `parseReasonBlock`, `parseVersionTrailer`, `isValidAttribution`), the spec-007 scanner
    `scanText` of `dist/validation` (G14), and `checkGovernance` of `scripts/check-governance.cjs` for P01 (rules
    subject/bracket/body), P02 (rule state) and P05's approval half (rule authority), run with `--root` the worktree and
    `base` the previous point; every finding counts, gated or not (a measure, not a gate).
  - **Definitions this script fixes where the catalogue leaves a choice** (each in `measure.cjs`'s header, decision for
    the approver): G01 conventional = `^[a-z]+(\([^)]+\))?!?: \S`; G02 trailer lines = the final paragraph's
    `Co-Authored-By`/`AI-Model`/`WingFoil-Version`/`Signed-off-by` lines; G03 percentiles nearest-rank, median the mean
    of the two middle values; G05 an id = `task-NNN` or `bug-NNN`; G07 identity = author and committer email in
    `team.members` (case-insensitive), and `isValidAttribution` (RFC 2606 / `.(none)`); G08 the rule's ratification =
    the `wf(decision-log): approve dl-117…` commit, commits at or before it counted apart; G09 the verb list read from
    `src/memory/audit.ts`'s `MEMORY_OPERATIONS` at the point, the measuring build's when the file is absent,
    configuration scopes excluded from the denominator; G11 subjects `Merge … 'main' into task/…` over
    `Merge branch 'task/…'`; G15 refs = `refs/heads/*` and `refs/remotes/*` (not `*/HEAD`), a duplicate = one
    `<prefix>-<NNN>` under two different ids across the refs and the point; P03 a phase recorded complete = a `plan`
    element that is `done` at the point and was not at the previous point, judged on its workflow's string
    `produces:` entries (its `phase:` when that names a phase, else every phase), tokens resolved from the plan's
    `element` (`{release.<field>}`, `{release-line}`); an entry with a token left unresolved is counted, not judged;
    typed `{ type, path }` entries are Memory elements, judged by P02; P04 the tasks touched in the window, each link
    must resolve at the point — `ref`/`bug`/`depends_on`/`supersedes` element ids, feature ids in
    `docs/01_vision/06_features.md`, `REQ-*` headings under `docs/02_requirements/03_sard/`, `US-*` under the story
    map, cited `.feature` paths; P05 approval authority (governance) + run records added in the window (`paths.runs`):
    role = the phase's declared role, the agent's `executes_as` holds it, and no shared `session` with a phase its
    `distinct_from` names; P07 P01–P06 computed twice and compared byte for byte.
  - **E01–E05** (dl-130 Q2 (a)): read through an injectable reader (`gh api repos/<owner>/<repo>`, `…/traffic/views`,
    `…/traffic/clones`; `https://api.npmjs.org/downloads/point/last-{week,month}/wingfoil`), owner/repo from the
    point's `package.json` `repository.url`; `read_on` is the date of the response's `Date` header, so the script reads
    no clock; `--offline` or a failed read → `not-measurable` with the reason.
  - **Toolchain** (dl-089 §6): `process.version`, `npm --version`, sha256 of `package-lock.json` at the point.
  - **Handover, validator gaps** (`catalogue.cjs`): `floor: null` on a floor metric, a `redefined`/`retired` id naming no
    metric, `added` not a list, a `direction` outside the set on any kind — each refused, with a rule test; fixed
    before measuring, since `measure.cjs` validates the catalogue first and refuses an invalid one (exit 2).
  - **Handover, BDD:** `P1.2-versioning-audit-trail.feature` gains a `Scenario Outline` with one example per kind 2–5,
    tagged `@REQ-STATE-10` (the first Gherkin tag in the folder; the two existing scenarios get it too, the comment
    stays). The scenarios are exercised by the fixture test.
- **AC classification (testing directive), corrected:**

| AC | Class | Why |
|---|---|---|
| 1 — G01–G15, P on a fixture, raw counts, small-sample | red-first | `scripts/release-health/measure.cjs` does not exist (`ls scripts/release-health` → `catalogue.cjs catalogue.d.cts`) |
| 2 — never writes git configuration | red-first | new script; the before/after `git config --list --show-origin` snapshot |
| 3 — external snapshot or `not-measurable` | **red-first** (was characterization) | no code records E01–E05 today; a characterization test would fail on first run |
| 4a — Node/npm versions, lockfile hash | **red-first** (was characterization) | same reason |
| 4b — scripts not in the npm tarball | characterization | `package.json` `files: [dist, README.md]` already excludes `scripts/` |
| 5 — G16, G15's duplicate-id scan, G08 against dl-117 | red-first | new measures |
| handover — four validator gaps | red-first | `validateCatalogue` accepts each today |
| handover — BDD kinds 2–5 | red-first (doc + test) | the P checks do not exist |

### red (qa)

- `9db07518` — `npx jest test/release-health` → `Test Suites: 2 failed`, `Tests: 4 failed, 22 passed, 26 total`: the four
  validator-gap tests fail (`validateCatalogue` accepts each case), and `measure.test.ts` fails to load (`Cannot find
  module '../../scripts/release-health/measure.cjs'`). The same commit adds the `@REQ-STATE-10` Scenario Outline (kinds
  2–5) to `P1.2-versioning-audit-trail.feature` and tags the two existing scenarios.

### green (developer)

- `f9ba420a` `feat(release-health)`: `scripts/release-health/measure.cjs` (+ `.d.cts`) and the four `catalogue.cjs`
  refusals. `npx jest test/release-health/measure` → `Tests: 38 passed, 38 total` on its first run;
  `npx jest test/release-health/catalogue` → `26 passed`.

### refactor (developer)

- `fbf52c48`: a two-commit fixture for the tests that do not read the history ledger (the suite took 221 s under load
  with four full ledger fixtures; `time npx jest test/release-health` → 31.5 s afterwards at a low load); the measurement
  point tested through `resolveMeasurementPoint` (a patch's own tag is never the minor's point); `main` and the HTTP
  reader tested; `.wingfoil/WORKFLOW.md` says `measure.cjs` exists and which metrics it leaves to task-232/233.
- `0e9ad758` `fix`: measuring this repository (`node scripts/release-health/measure.cjs --release v0.2.2 --previous
  v0.2.1 --offline`, 249 s, 206 MB, load ~25) showed four misreadings, each fixed with a fixture test: commits made
  before `.wingfoil/` existed (the task-111 move) were counted failing (now `unchecked` in P02/P05: 121 and 59 commits);
  free-text `produces:` of older workflow files were judged as paths (now `unresolved`); a `ref:` naming a requirement
  was read as an element id; `.feature` paths cited relative to the BDD folder did not resolve, and a feature id inside a
  `.feature` file name was counted as a feature link.
- `4681e9ee`: `test/lint/git-log-readers.test.ts` lists the new reader file (its enumeration test failed in the full run).
- **The v0.2.2 window measured** (v0.2.1..v0.2.2, after the fixes): G01 100 % (529/529), G02 34.59 % (183/529), G03
  median 15 / p90 128 / 2.65 % over 500, G04 mean 103.24 / 76.94 % over 72, G05 100 % (38/38), G06 100 % (92/92),
  G07 22 of 573, G08 0 of 346 judged conforming (`Co-Authored-By: Claude Opus 5.5 …`, no `AI-Model:`), 30 approve/reject
  with AI attribution, G09 1.31 % (4/306), G10 99.45 % (180/181), G11 1.12, G12 50 % (7/14), G14 0, G15 2 stale remote
  branches / 0 duplicate ids, G16 0 % (the trailer is v0.3's); P01 35, P02 1 (121 unchecked; that one item is bug-308's false positive, so it becomes 0 once task-278 merges), P03 2 of 10 (19
  unresolved), P04 5 of 932, P05 1 (59 unchecked), P06 not-comparable (patch), P07 true. Not committed: the reports
  are task-241's (backfill).
- The live external readers parse what the services answer: `gh api --include repos/wingfoil/wingfoil` and `curl
  --include https://api.npmjs.org/downloads/point/last-week/wingfoil` through `parseHttp` → `ok`, `Date: Sun, 11 Oct
  2026 …` → `read_on 2026-10-11`, `downloads: 174`.
- Gates (one run, load 22–35, other worktrees active; before `4681e9ee`):
  - `npm test` → `Tests: 1 failed, 6519 passed, 6520 total`, the failure being the git-log-readers roster, fixed in
    `4681e9ee`: `npx jest test/lint/git-log-readers` → `3 passed`. `npx jest test/release-health` → `69 passed`.
  - `npm run test:coverage` → same single failure; All files 99.29 / 97.04 / 97.74 / 99.69 (stmts / branches / funcs /
    lines), equal to the W3 B4 gate main (`../devloop-kit/gate-w3b4-cov.log`): not regressing (`scripts/` is outside
    `collectCoverageFrom`).
  - `npm run lint` → 0; `npm run docs:api` → 0; `npx tsc --noEmit -p tsconfig.json` → 0;
    `npx tsc -p tsconfig.build.json --noEmit` → 0; `node scripts/check-governance.cjs --base 30b268a3` → `1 wf()
    commits`, `gated: 0 findings`; `node scripts/lint-claims.cjs --base 30b268a3` → 0 warnings.

### review (reviewer, self)

- AC 1 met: `measure.test.ts` "the history metrics on a fixture with known answers" — G01–G16 each against the ledger
  in `historyFixture`'s doc comment, raw counts beside every share, `small_sample: true` at 20 items and `false` at 30.
- AC 2 met: "never writes git configuration" — `git config --list --show-origin` and `git worktree list --porcelain`
  byte-identical before and after.
- AC 3 met: E01–E05 offline → `not-measurable` with the reason; online (stub) → value, `command`, `read_on` from the
  `Date` header; a failed read (HTTP 403) → `not-measurable`, never 0.
- AC 4 met: toolchain test (`process.version`, npm semver, sha256 of the point's lockfile); `npm pack --dry-run --json
  --ignore-scripts` lists no `scripts/` file.
- AC 5 met: G16 (2/11 signed), G15 duplicate (`task-001: task-001-alpha, task-001-other`), G08 (ratified at the
  `dl-117` approve, 1 before the rule, 2 of 3 conforming, 1 approve with AI).
- Handover met: four validator rule tests; the P1.2 Scenario Outline kinds 2–5 with `@REQ-STATE-10`, exercised by
  "Process conformance names every failing item — kind 1…5" and the rerun scenario.
- Same class in files touched: `catalogue.cjs`'s header names the new rules; WORKFLOW.md's sentence on the scripts.

### review fixes (developer, 2026-10-11)

- The independent review (APPROVE WITH FIXES; its coverage run on `d9f22ad7`: 6520 tests, 99.29 / 97.04 / 97.74 / 99.69)
  asked for:
  - F1: the design note's spec grep corrected (above).
  - F2: G15 reads the running clone's live refs, so it is not reproducible at a fixed point. The header says so, and
    the G15 entry carries `raw.refs_from: "live refs at run time"`, pinned in the G15 test. The catalogue wording is a
    follow-up the coordinator files; `metrics.yaml` is unchanged
    (`git diff 30b268a3 HEAD -- docs/08_health/metrics.yaml` → empty).
  - F3: `withWorktree` no longer runs the repository-wide `git worktree prune` after every run, only when its own
    `worktree remove --force` failed.
  - F9: the fixture report and the online (stub) report are validated against `release-health.schema.json` with ajv
    (`ajv/dist/2020`, present as `@modelcontextprotocol/sdk`'s dependency: `npm ls ajv`).
  - The header gives the manual cleanup for a worktree left behind by a signal
    (`git worktree remove --force /tmp/wf-release-health-<suffix>/tree`); signal handling is a follow-up.

### Pending amendments (approver)

- None. No tech-spec or ratified decision needed an edit (design, above).

### Retrospective

- The governance check spawns one git process per read; in this environment a spawn from Node costs ~125 ms
  (`node -e` loop of 20 `execFileSync('git', ['show', …])` → 2.46 s), so P01/P02/P05 on a 573-commit window take
  minutes, twice for P07. A release-health run is a per-release job, but the cost grows with the window.
- A worktree added by the measure survives a SIGKILL/SIGTERM of the process (the `finally` does not run): two stale
  `/tmp/wf-release-health-*/tree` worktrees had to be removed by hand during this task.
- A full `npm test` run in parallel with the real-repository measure rebuilt `dist/` under it (jest globalSetup):
  the measure exited 2 "`dist` is not built". One heavy job at a time (dl-170) avoids it.
