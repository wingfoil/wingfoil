---
id: "task-207-drive-e2e-smoke-through-fresh-project-use-scenario"
type: task
title: "Drive e2e-smoke through a fresh-project use scenario with exact exit codes and a report"
status: done
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "process", "release-gate", "smoke", "ci"]
ref: "dl-099"
bug: ["bug-132", "bug-133", "bug-134"]
depends_on: ["task-140-run-packaging-gate-push-pull-request-separate", "task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

The smoke asserts only exit 0, never re-loads what a command wrote, and its phase declares no `produces:`, so it can neither fail on a wrong error code nor be deduced complete. v0.3 also flips it from warn to hard reject.

## Acceptance Criteria

- (red-first) bug-132: each step declares an expected exit; at least one exit-1 and one exit-2 step per spec-005 §3; a step returning the wrong code fails the smoke (pinned in `test/cli/e2e-smoke.test.ts` with a fault-injected step).
- (red-first) bug-133: after the last writer, every written artifact is re-loaded through its own loader (`dna show`, `memory search`/`history`, `directives list`, `workflow list`); a corrupted write fails the smoke (fault-injection case).
- (characterization) for every template `init` supports, one element of each built-in machine shape goes `add → submit → approve`, plus one `reject`, one `deprecate`, `memory history` each; clean tree after every mutation (dl-099 §3).
- (red-first) bug-134: `e2e-smoke.yaml` declares the report under `produces:` (a path), the gate's severity is `reject` (dl-023), version bumped; the script writes that report.
- (characterization) `ci.yml` (task-140) gains a smoke job on push/PR running the smoke against the packed tarball (dl-099 §4 (c) smoke part); the staging rehearsal stays out of CI.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-099 §3, §4 ((c) smoke part); dl-023 (hard-reject from v0.3).
- **Features:** X1.2 (smoke gate).
- **Notes:** Proposal key: D09. spec-015 §3's staging smoke uses the same script; confirm the publish-staging gate still passes (`npm run publish:staging` transcript in Execution Notes). Single owner of the smoke-gate cluster `bug-132`/`bug-133`/`bug-134` (Appendix A): the `produces:` fix needs the report the reworked script writes, so it is not an task-199 alignment edit.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  `task-267` (B9) adds `release/**` to `ci.yml` `on.pull_request.branches` and may make the concurrency group spare
  `release/*` pushes as it spares `main`. The smoke job inherits the workflow's `on:` and declares no trigger or
  `if:` of its own that names `main`, nor compares against `origin/main`; keep `test/cli/ci-workflow.test.ts`'s
  trigger assertion a single expectation `task-267` can widen.

## Execution Notes

Branch `task/task-207-drive-e2e-smoke-through-fresh-project-use-scenario`, worktree `../.wf2-wt/task-207`,
cut from `main` at `1ce84a54` (W3 B3 pre-batch main); start `01f8fa3a`, `bug-132`/`133`/`134`
`[planned → in-progress]` `a50fefca`, `2ffbe11c`, `85fcba33`.

### design (architect)

**`depends_on` read (dl-015).** Both are `done` (`grep -m1 '^status:'` on each file).
- `task-140`: `ci.yml` is one job, `packaging-gate`, pinned by `test/cli/ci-workflow.test.ts` (job list,
  step list, `uses:` lines equal to `publish.yml`'s, no `continue-on-error`, read-only, no secret). Its AC 3
  (first real run) needed a push; the same holds here for the new job.
- `task-199`: `e2e-smoke.yaml` went 1.2 → 1.3; its seven prose checks stay `W_WORKFLOW_UNBOUND_TOKEN`
  warnings "until `task-207` rewrites the phases", and `gate`'s check is bound in
  `.wingfoil/workflows/bindings.yaml` as `e2e-smoke-passed: { run: [node, scripts/e2e-smoke.cjs] }`.
  `test/core/workflow-repository-conformance.test.ts` pins the warning set at `HEAD`; this task updates
  its `e2e-smoke` rows. The pinned build 0.2.2 cannot read the workflows: the dev build is used.

**Sources.** `dl-099` and `dl-023` are `ready`; `dl-099` was ratified with "(a) now, with the smoke part of
(c) as soon as dl-103's CI lands" (`git log` on the file: approve `1bab7629`). `spec-005`, `spec-015` and
`spec-003` are `approved` (`grep -m1 '^status:'`). `spec-005` §1 gives the three codes, §3 the error shape
every non-zero exit carries (`error: <reason>` on stderr, or `{"error": …}` under `--format json`).
`spec-003` Layer 3: a `CheckBinding.severity` is `warn | reject`, default `reject`; a `{<key>}` placeholder
fills a whole `run` element; `args` declares a pattern where spec-009's ID class is too narrow.
No BDD scenario covers the smoke: `X1.2`, the feature the task names, is *Notification Routing*
(`grep -n "X1.2" docs/01_vision/06_features.md`) — a mis-traced feature id, reported as a candidate finding;
`grep -rln "e2e-smoke" docs/02_requirements/02_bdd/features/` finds nothing.

**What a fresh project offers** (`node dist/cli.js init --template <T>` in a scratch repo, then reading
`.wingfoil/memory.yaml`): both templates declare one machine, `defaults` (`draft → pending → approved`,
`gates.pending.reject: draft`), and no type carries its own `states:` (the only `states:` below `types:` is
the commented `bug` example). So "one element of each built-in machine shape" is one `task` per template,
walked `add → submit → approve`, a second one `reject`ed, a third `deprecate`d, `memory history` on all
three. The first `approve` exits 1 (`user not authorized to approve type 'task'`, REQ-SEC-03) until the
smoke's git identity is bound as an `approver` with `dna add team.members` — the natural exit-1 step
(`bug-132`'s note). Measured by hand in the scratch repo: missing operand and unknown option exit 2; a
`submit` of the `approved` task exits 1 (`illegal transition approved -> (none) for type 'task'`);
`memory search --status deprecated` returns the deprecated task; `memory history` lists `add`/`submit`/
`approve`/`reject`/`deprecate` with `approver` and `reason`.

**Design.**
- `scripts/e2e-smoke.cjs`: every step declares `exit` (0, 1 or 2). A non-zero step must also carry spec-005
  §3's error on stderr, parsed (`error:`/`hint:` lines, or the JSON object) into `{ error, hint }`, which
  `expect` can match. `expect` takes dotted paths (`matches.0.id`, `entries.length`) and values that may be
  `{capture.field}` placeholders. After **every** step the working tree must be clean (it was checked once,
  at the end). After the last writer (`memory deprecate`), the readers re-load each written artifact and
  assert its content, not only exit 0: `dna show` (the `dna set` value, the `dna add` approver),
  `memory search --status <s>` per element, `memory history` per element, `paths`, `directives list`,
  `workflow list` (exit 0 + JSON only: `task-204` reshapes its payload). `--report <path>` writes a
  Markdown report — the checks, their verdicts, the result — with nothing from the clock, so the same run
  writes the same bytes; it is written on a failure too. `smokeTemplate` takes an optional step list, so
  the mechanics are unit-tested against stubs without driving the whole scenario.
- `e2e-smoke.yaml` 1.4: `drive-cli` names the scenario's calls; its checks state exact exits, re-load and
  clean-after-every-mutation; `gate` declares `produces: docs/07_gates/rl-{release.release-line}/rel-{release.version}-e2e-smoke.md`
  and runs `e2e-smoke-passed(report: <that path>)`; the staged-warn text becomes hard-reject (`dl-023`
  staging record, 2026-09-28/29). `bindings.yaml` 1.1: `e2e-smoke-passed` passes `--report {report}` with an
  `args` pattern and states `severity: reject` explicitly. **Decision for the approver:** the report path
  (`docs/07_gates/`, a new numbered folder for gate reports, beside `06_runs/` and the planned
  `06_retrospectives/`).
- `ci.yml`: a second job, `e2e-smoke`, inheriting the workflow's `on:` (no trigger or `if:` naming `main`,
  `dl-159` handover): checkout, setup-node, `npm ci`, `npm pack` into `$RUNNER_TEMP` (its `prepack` builds
  `dist/`), `npm install --global --prefix` of that tarball, then the smoke against the installed bin with
  `--expect-version` (package.json) and `--expect-commit "$GITHUB_SHA"`, as `publish.yml`'s stage does. No
  `publish:staging` (the rehearsal stays out of CI, `dl-099` §4).
- `spec-015` §3 stage 3 describes the smoke it reuses: a pending amendment (Revision note) says the staging
  smoke now walks the scenario. `.wingfoil/WORKFLOW.md`'s `e2e-smoke` diagram follows the YAML.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — expected exit per step, an exit-1 and an exit-2 step, wrong code fails | **red-first** | `commandCheck` fails every non-zero exit; no step can expect one |
| 2 — re-load after the last writer, a corrupted write fails | **red-first** | no reader follows the last writer; a corruption the next command does not read passes |
| 3 — add→submit→approve, reject, deprecate, history; clean after every mutation | characterization + **red-first** | characterization for the verb walk (the CLI does it on a fresh init: `test/cli/fresh-init-transitions.test.ts`), **red-first** for "clean after every mutation" (checked once, at the end, today: a step that dirties the tree and a later one that cleans it passes) |
| 4 — `produces:`, severity `reject`, version bump, the script writes the report | **red-first** | none exists |
| 5 — `ci.yml` smoke job on the packed tarball, no staging | **red-first** (corrected from characterization) | the job does not exist, so a test of it fails first; its first real run needs a push (approver) |

### red (developer)

`79c2ff67`: `test/cli/e2e-smoke.test.ts` rewritten around the scenario, `test/cli/ci-workflow.test.ts` gains the
`e2e-smoke` job, `test/fixtures/smoke/wingfoil-proxy.cjs` is a `wingfoil` that forwards to `dist/cli.js` and
injects one declared fault (`SMOKE_FAULT`: `exit=<n>`, `mute`, `dirty`, `corrupt`, each documented in its
header); `scripts/e2e-smoke.d.cts` declares the step's `exit`, `smokeTemplate`, `formatReport` and `reportPath`
so the failures are assertions, not type errors. `npx jest test/cli/e2e-smoke.test.ts test/cli/ci-workflow.test.ts
--verbose` (log kept in the batch scratch folder) → **Tests: 25 failed, 25 passed, 50 total**, 528 s under a load
average of ~90. The 25: the four `ci.yml` job tests; AC 1 × 5 (step `exit` per template ×2, wrong code ×2, no §3
error); AC 2 × 3; AC 3 × 3 (walk ×2, dirty tree — the old script passed `dna set` and failed only its final
clean-tree check); AC 4 × 5; the four task-107 stub tests (they now drive `smokeTemplate`, not yet exported);
the real run (its labels name the scenario's verbs). The 25 passing include the shape test (a fresh init
declares one machine, `defaults` — AC 3's characterization half, green on first run as classified) and the
task-254 stamp tests.

### green (developer)

`1612b757` (bug-132, bug-133, bug-134):
- `scripts/e2e-smoke.cjs`: the scenario as data (`smokeSteps`): 26 steps per template — `init`; `dna show`;
  `dna show --no-such-option` (exit 2) and `memory approve` with no operand (exit 2); `dna set`; the `approved`
  task's add/submit; its `approve` refused at exit 1 (`user not authorized to approve type 'task'`); `dna add
  team.members` binding the smoke identity as approver; the accepted `approve`; a `submit` of the approved task
  refused at exit 1 (`illegal transition approved -> (none) for type 'task'`); `rejected` add/submit/reject;
  `deprecated` add/deprecate; then the re-loads: `dna show` (`project.name`, the member's email and role),
  `memory search <id> --status <s>` and `memory history <id>` per task (entry count, operations, approver,
  reason), `directives list` (10 entries), `paths`, `workflow list`. Each check also runs `git status
  --porcelain`. `--report <path>` writes `formatReport`'s Markdown, on failure too. An `expect` placeholder may
  name the step's own capture (the `memory add` steps assert their `path`) — found by the first manual run,
  `node scripts/e2e-smoke.cjs --expect-version 0.2.2 --report … -- node "$PWD/dist/cli.js"` → exit 1 on
  `{approved.id} not found`, fixed before the commit; re-run → exit 0, 54/54 `ok`.
- `.wingfoil/workflows/custom/e2e-smoke.yaml` 1.3 → 1.4 (reason in the header): the scenario in `drive-cli`, its
  three checks, the gate's `produces:` and `e2e-smoke-passed(report: …)`, hard-reject text.
  `.wingfoil/workflows/bindings.yaml` 1.0 → 1.1: `e2e-smoke-passed: { run: [node, scripts/e2e-smoke.cjs,
  --report, "{report}"], severity: reject, args: { report: "^[A-Za-z0-9._/-]+$" } }`.
- `.github/workflows/ci.yml`: job `e2e-smoke` (checkout, setup-node, `npm ci`, `npm pack` into
  `$RUNNER_TEMP/pack`, `npm install --global --prefix "$RUNNER_TEMP/wingfoil"` of the tarball, the smoke
  against `$RUNNER_TEMP/wingfoil/bin/wingfoil` with `--expect-version` and `--expect-commit "$GITHUB_SHA"`); no
  `if:`, `needs:` or branch name; header paragraph. The `packaging-gate` job and the `on:` trigger assertion are
  untouched (`dl-159` handover: `task-267` widens it).
- `test/core/workflow-repository-conformance.test.ts`: the `e2e-smoke` warning rows (2 → 3 prose checks in
  `drive-cli`: 62 warnings, 0 errors, measured with `loadWorkflowRegistry('.')` over `dist/core`), and
  `e2e-smoke.gate` leaves the checkpoint list (26): its `produces:` is now evidence — `bug-134`'s point.
  Finalize approvals unchanged (6).
- `test/cli/publish-staging.test.ts`: "passes the stage on the exact stamp" drives the proxy (a `wingfoil` on
  PATH forwarding to `dist/cli.js`), since the scenario needs a real CLI; the stub tests of failing stamps are
  unchanged. `.wingfoil/WORKFLOW.md`: the `e2e-smoke` diagram and intro.
- `npx jest test/cli/e2e-smoke.test.ts test/cli/ci-workflow.test.ts test/cli/publish-staging.test.ts
  test/cli/mcp-registration.test.ts test/docs/workflow-md.test.ts` → 5 suites, **116 passed**.

### refactor (developer)

- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json
  --noEmit`: exit 0.
- `npm test` → 300 suites, 5733 tests, **1 failed**: `test/lint/no-signal-as-exit.test.ts` (bug-197) flagged
  `fixtures/smoke/wingfoil-proxy.cjs:49` (`run.status ?? 1`). Fixed in `a4981877`: the proxy re-raises the
  child's signal. `npx jest test/cli/e2e-smoke.test.ts test/cli/publish-staging.test.ts
  test/core/workflow-repository-conformance.test.ts test/lint` → 13 suites, **174 passed** (exit 0).
- `npm run test:coverage` (same run, before `a4981877`, which touches a fixture only): All files **99.28 / 97.18 /
  97.33 / 99.71** — equal to the W3 B2 gate on main (`gate-w3b2-cov.log`: 99.28 / 97.18 / 97.33 / 99.71); no
  `src/` file changed (`git diff 1ce84a54 --stat -- src` is empty).
- `node scripts/check-governance.cjs --base 1ce84a54` → 4 `wf()` commits checked, 0 findings.
- `node dist/cli.js workflow list --format json` exit 0. `docs/cli-reference.md` untouched: no command, option or
  exit code changed.
- BDD: none (design). The `npm run publish:staging` transcript the Implementation Notes ask for is **not**
  recorded: it starts a local registry and publishes to it — left to the approver (see review).

### review (reviewer)

| AC | Status | Evidence |
|---|---|---|
| 1 | met | each step's `exit` (test "each step declares exit 0, 1 or 2"); two exit-2 and two exit-1 steps with their §3 reasons; faults `exit=1@dna show --no-such-option`, `exit=0@memory approve …`, `mute@…` each fail the named step |
| 2 | met | readers after the last writer, each with content `expect` (test); `corrupt@memory deprecate` passes the deprecate step and fails `memory search task-003-deprecated-task --status deprecated` with `matches.length=0` |
| 3 | met | walk test (approved/rejected/deprecated, history each); one-machine shape test per template; `dirty@dna set` fails that step |
| 4 | met | `e2e-smoke.yaml` 1.4, gate `produces:` = the check's `report:`, binding `severity: reject`, no `warn` text; report written on failure (CLI test) and deterministic (format test) |
| 5 | met offline | job pinned by `ci-workflow.test.ts`; its first real run needs a push (approver) |

Same-class sweep: the old staged-warn wording survives only in `spec-003` line 538 (an example sentence,
"staged gates such as `e2e-smoke.yaml`'s `gate.checks.post`") — an approved spec outside this task's ACs,
reported as a candidate finding rather than amended. `grep -rn "staged: warn" .wingfoil docs/*.md CLAUDE.md` →
nothing.

**Pending amendments (approver)** — uncommitted in the worktree:
- `spec-015-packaging-publishing`: §3 stage 3 states the use scenario, plus a dated Revision note. Proposed
  `--reason`: "task-207 (bug-132, bug-133): the staging smoke reuses scripts/e2e-smoke.cjs, which now drives the
  dl-099 §3 use scenario with exact exit codes and re-loads; §3 stage 3 says so and the ci.yml e2e-smoke job is
  recorded."

**Decisions for the approver.** (1) The report path `docs/07_gates/rl-{release-line}/rel-{version}-e2e-smoke.md`
(a new numbered folder for gate evidence). (2) AC 5 reclassified red-first. (3) The CI job runs beside
`packaging-gate` (no `needs:`), with `--expect-commit "$GITHUB_SHA"`.

### Review fixes

- Review (APPROVE WITH FIXES): F1 — `bindings.yaml`'s `args.report` pattern accepted `/etc/passwd`, `../../x.md`
  and `-rf`; it is now `^(?![/-])(?!.*(?:^|/)\.\.(?:/|$))[A-Za-z0-9._/-]+$` (still 1.1), with those refusals pinned
  in `test/cli/e2e-smoke.test.ts`. F2 — the pending `spec-015` Revision note no longer says the old script
  "asserted only exit 0" (`git show 1ce84a54:scripts/e2e-smoke.cjs`: JSON parsing, a `submit` edge at line 63, a
  final clean-tree check at line 153); the proposed `--reason` is unchanged.
