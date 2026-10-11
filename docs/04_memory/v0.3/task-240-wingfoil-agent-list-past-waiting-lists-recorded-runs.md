---
id: "task-240-wingfoil-agent-list-past-waiting-lists-recorded-runs"
type: task
title: "`wingfoil agent list --past|--waiting` lists recorded runs and the frontier steps an agent role can take, from `HEAD`"
status: in-review
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "agent", "cli", "read-only"]
ref: "dl-135"
bug: []
depends_on: ["task-161-revise-command-baseline-which-verbs-read-head-filesystem", "task-206-agent-execute-records-run-json-lines-line-under", "task-225-add-workflow-status-pending-approvals-role-routing-fallback"]
tmpl_version: 260703
---

## Description

`agentList` (`mutates: false`, CLI only in v0.3). It has two sources: - past = the run logs at `HEAD`; - waiting = every frontier step of every open instance whose `agentRole` is true, in `spec-017` §1.3's order. Both can be filtered by `--element` and `--phase`. Console and JSON/YAML follow §5, and the payload carries `baseline` and `diagnostics`. `W_UNCOMMITTED_INPUTS` is emitted when `--past` alone runs no deduction. The command reads at `HEAD` as the declared R15 exception.

## Acceptance Criteria

- (red-first) Past: records from two element files, ordered by element id (byte order) and then append order. Each console line is `<id>  <role>  <agent>  <exit_status>  <duration>  <tokens>`, with tokens as `in/out` or `not-reported`. An empty result prints `no past runs`, exit 0.
- (red-first) Waiting: two open instances with parallel frontier steps, one of them with a non-agent role. Only agent-role steps are listed, in frontier order, each with the DNA-ordered `agents` that have an adapter.
- (red-first) No flag, or both flags → both sections. `--active` → exit 2 (v0.4).
- (red-first) A run log changed only in the working tree is not read (HEAD). Its path appears in a `W_UNCOMMITTED_INPUTS` diagnostic, printed as a `warning:` line on the console.
- (red-first) Missing `paths.runs` → past is empty, with `warning: dna.yaml declares no run log (paths.runs)`, exit 0. A §4.5 violation → exit 1.
- (characterization) Docs, each with a `doc-versioning` bump: new BDD `p5-interaction/P5.3.4-agent-list.feature` (id per the new row); `06_features.md` new P5.3 row "agent list" (proposed `P5.3.4`) (`dl-135` Action 3); `spec-006` §3's feature column replaces the `dl-135` citation with the new id; `minor-v0.3` `features:` gains the id through `memory amend` (dl-108); `docs/cli-reference.md` entry naming its `HEAD` baseline.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-135 points 1, 4 (v0.3 half: `--past`, `--waiting`); spec-016 §5, §5.1; R15.
- **Features:** P5.3.1 (until the new row lands), new P5.3 row "agent list.
- **Notes:** Proposal key: B12.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B2 (2026-10-07, `task-198`).** `W_UNCOMMITTED_INPUTS` is emitted once per dirty input path (`spec-017` §1.2's "naming the paths" read per path); keep that form or settle it before reusing the code.

## Execution Notes

Branch `task/task-240-wingfoil-agent-list-past-waiting-lists-recorded-runs`, cut from `main` at `3e692099`
(wave 3, batch B6; pre-batch main `0671d035`); start `d59bee21`. `bug: []`, so no bug syncs.

### design (architect)

**`depends_on` (dl-015).** `task-161`, `task-206`, `task-225` are `done`, and so are the siblings
`task-220`, `task-228`, `task-235` (`grep -m1 "^status:"` on each). What they hand this task:
- `task-161`: `spec-006` §6 item 6 already declares `agentList` a `HEAD` read (R15), with its table row
  (`grep -n agentList docs/04_memory/design/specs/spec-006-core-domain-api.md` → lines 381, 398): no
  baseline sentence is owed here.
- `task-206` / `task-220`: the strict §4.5 reader (`parseRunLog`, `readRunLogAt`), `resolveRunLogPath`
  (`action: 'read'`), `RUN_RECORD_KEYS`; `agent show`'s shape (the `CoreFn` in `src/core/agent-*.ts`,
  `renderConsole`, `dna.yaml` read at the one `HEAD` commit, `NOT_FOUND` when `dna.yaml` is not
  committed). Reused as given.
- `task-225`: `readNextInputs` + `buildStep` build the frontier steps `StatusResult.open[].frontier`
  holds; `Step.agentRole` is `spec-017`'s predicate. `task-198`'s handover (in this task): one
  `W_UNCOMMITTED_INPUTS` per dirty path — the deduction already emits that form and already counts
  `paths.runs` among its inputs (`readDirty`, `src/core/workflow-deduction.ts`).
- `task-235`: `stepTargetElement`'s rule (scope element, else the instance's bound element) is the one
  `spec-016` §5 names for the waiting step's element.

**Specs.** `spec-016` (§4.5, §5, §5.1, §8), `spec-017`, `spec-006`, `spec-008`, `spec-005` are `approved`;
`dl-135` is `ready` (`grep -m1 "^status:"`).

**Design.**
- `src/core/agent-list.ts`: `agentListFn` (`mutates: false`), registered as `agent.agentList` with flags
  `--past`, `--waiting` and value options `--element <type:id>`, `--phase <name>`; `--active` is not
  declared, so Commander refuses it (exit `2`). A malformed `--element` is a `UsageError` (exit `2`)
  before the project is read, as `agent execute --element`.
- **One baseline.** With the waiting section, the deduction snapshot (`readDeductionSnapshotAtHead`) is
  read first and its `commit` is the baseline the run logs are read at too; without it, `HEAD` is
  resolved once. `dna.yaml` comes from that commit.
- **Past.** `src/agent/run-log.ts` gains `readRunLogsAt(root, commit, runs)`: every `<runs>/*.jsonl`
  directly inside the run-log directory at the commit, in path byte order (= element id order), each
  through the strict reader, records in line order. The directory is confined first
  (`requireConfinedTarget`, `read`). A §4.5 violation is the reader's `VALIDATION`, exit `1`. No
  `paths.runs` → `past: []` and the success warning `dna.yaml declares no run log (paths.runs)`.
- **Waiting.** `deduceWorkflowState(snapshot)`, `readNextInputs`, `buildStep` per frontier step of every
  open instance, kept where `agentRole`; frontier order kept by the filters (AC 2 filter case). Each item
  `{instance, key, workflow, phase, element, role, allowedModes, agents}`, `agents` = the
  `team.agents[]` names, in DNA order, whose `executes_as` holds the role and that declare an `adapter`.
- **Diagnostics.** With the deduction: its `diagnostics` as it returns them (AC 4 `it.each`, both sections). `--past` alone: one
  `W_UNCOMMITTED_INPUTS` per dirty path under `paths.runs`, built by the same function the deduction
  uses (`uncommittedInputDiagnostic`, exported from `src/workflow/deduce.ts`; the dirty-path read
  `readDirtyPaths` exported from `src/core/workflow-deduction.ts`), so the two cannot drift.
- **Console** (`renderConsole`): `past runs: <n>` then one `<id>  <role>  <agent>  <exit_status>
  <duration>  <tokens>` line per record, or `no past runs`; `waiting steps: <n>` then `<key>  <role>
  <agents>`, or `no waiting steps`. Each diagnostic is also a success warning (`CoreResult.warnings`),
  so the console shows it as a `warning:` line on stderr; `json`/`yaml` carry it in `diagnostics`
  (and, like every success warning, on stderr).

**Parity (the full set, wave 3 rule).** `CORE_MODULES`; `docs/cli-reference.md` (new entry, HEAD
baseline); `spec-008` §12 row (no longer "not registered yet") and §2's `--format` sentence;
`spec-006` §3 row + bullet; `spec-016` §8 row; the enumeration-parity / name-resolvability allowlists
only lose the entries this command makes stale; the rosters in `test/core/production-registry.test.ts`,
`test/core/parity.test.ts`, `test/agent/module.test.ts`. No exit code, Memory type/state or MCP surface
is added (CLI only in v0.3, `spec-016` §8).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 past: two element files, order, console line, `no past runs` | red-first | no `agentList` operation exists (`grep -c agentList src/core/index.ts` → 1, a comment) |
| 2 waiting: two instances, parallel frontier steps, agent roles only, agents | red-first | new |
| 3 no flag / both flags → both sections; `--active` → exit 2 | red-first | new command (the `--active` refusal is Commander's; `grep -c "agentList:" src/core/index.ts` → 0 before green) |
| 4 working-tree-only run log not read; `W_UNCOMMITTED_INPUTS` `warning:` | red-first | new |
| 5 missing `paths.runs` → empty past + warning, exit 0; §4.5 violation → exit 1 | red-first | new |
| 6 docs | characterization (documentation) | BDD, `06_features.md`, `spec-006` §3, `minor-v0.3` `features:`, `docs/cli-reference.md` |

### red (developer)

*As executed:* this phase was run by the developer agent, not by `qa` as `dev-loop` 1.8 assigns it
(`dl-134`, separation of duties): the same agent wrote red, green and refactor. Not relabelled.

`a027acd3` — `test/core/agent-list.test.ts` (the registered operation, 18 cases) and
`test/cli/agent-list.integration.test.ts` (compiled CLI bytes, 8 cases).
- `npx jest test/core/agent-list.test.ts` → **18 failed, 18 total** (`"agentList" is not registered on the
  agent module`).
- `npx jest test/cli/agent-list.integration.test.ts` → **7 failed, 1 passed, 8 total** (`error: unknown
  command 'list'`). The one pass is the malformed `--element` case: an unknown command also exits `2`, so
  it is characterization of the exit code until green, and pins the refusal after it.
- The fixture's frontier was checked before the expectations were written (a throw-away debug suite,
  deleted, printing `workflowStatusAtHead`'s frontier): `pl-1` → `planning.commit-backlog@release:minor-2`
  (developer); `rc-1` → `dev-loop.red@task:task-1` (qa, `agentRole: false`), `dev-loop.start@task:task-2`
  (developer). Agent emails on reserved domains are refused by `dna.yaml`'s schema (bug-261), so the
  fixture uses `*-agent.dev`.

### green (developer)

`20fd6b41` — `src/core/agent-list.ts` (`agentListFn`, `agentListAtHead`, `renderAgentListConsole`,
`diagnosticWarning`), registered as `agent.agentList`; `src/agent/run-log.ts` `readRunLogsAt`;
`src/workflow/deduce.ts` `uncommittedInputDiagnostic` (the deduction now builds its own diagnostics
through it); `src/core/workflow-deduction.ts` `readDirtyPaths` (split out of `readDirty`, unchanged
behaviour); `docs/cli-reference.md` `### wingfoil agent list`, a *Git side effects* bullet, and the
`--format` row and `agent show`'s "the one command" sentence corrected (same class: `workflow
next|status|start|end|finalize` already print their own console text, `grep -n "renderConsole:"
src/core/index.ts` → 7 operations before this task); the three rosters (`test/agent/module.test.ts`,
`test/core/parity.test.ts`, `test/core/production-registry.test.ts`).
One test-file change in green: a type-only cast on `result.warnings` in the AC 5 case (`tsc` refused the
union access); no assertion changed.
- `npx jest test/core/agent-list.test.ts` → **18 passed**; the CLI suite → **8 passed**.

`202cddfe` — AC 6 docs: `06_features.md` 1.12 → 1.13 (2026-10-11), P5.3.4 in the P5.3 table and the
v0.3 table, total 64 → 65, the same count in `01_product-brief.md` (1.9 → 1.10) and `08_mvp-canvas.md`
(1.10 → 1.11); new `p5-interaction/P5.3.4-agent-list.feature` (8 scenarios), in the BDD index
(`p5-interaction` 16 → 17 files, `ls … | wc -l` → 17); `docs/01_vision/00_index.md` re-synced: task-141's
index script, with its two excluded `06_features.md` code-block lines moved to `(384,418)` by the two
inserted rows → `mismatches: []`. The allowlists lose eight entries: `npx jest
test/docs/commands-parity.test.ts` reported `stale … spec-008 §11 commands … agent list`, and
`test/docs/name-resolvability.test.ts` reported `wingfoil agent list` and `agentList` (spec-006, spec-016),
`wingfoil agent execute|list|show` (spec-016) and `agentRole` (spec-016, spec-017) stale; after the
removal neither reports an entry naming the agent module.

### refactor (developer)

`4558ad62` — seven cases (no commit; `dna.yaml` not committed / invalid at `HEAD`; a workflow registry
error → `VALIDATION` with `details.diagnostics`; `paths.runs` outside the root; files that are not run
logs; `none` agents). One defect found and fixed: a run-log directory equal to the root (`./`) was refused
by `requireConfinedTarget` (the root is the boundary it names as outside); the directory is now confined
only when it is not the root.

Gates, with the pending amendments in the working tree:
- `npm run test:coverage -- --maxWorkers=2` under the dl-170 slot (`waitslot.sh`, load 3.1 at start) →
  **384 suites, 7104 passed, 0 failed**, exit 0. It runs the whole suite, so it stands for `npm test`
  too (one heavy gate instead of two). Coverage All files **99.29 | 97.12 | 97.95 | 99.70** against the
  W3 B5 gate's **99.30 | 97.22 | 97.93 | 99.70** (`devloop-kit/gate-w3b5-cov2.log`, a different `main`);
  `agent-list.ts` 98.09 | 92.22 | 100 | 98.85 (line 216, the non-mapped rethrow), `run-log.ts` 99.23 |
  94.85 | 100 | 99.53 (line 332, `readRunLogAt`'s rethrow, not this task's).
- `npm run lint` 0; `npm run docs:api` 0; `npx tsc --noEmit -p tsconfig.json` 0; `npx tsc -p
  tsconfig.build.json --noEmit` 0 (under the slot).
- `node scripts/check-governance.cjs --base 0671d035` → 0 findings; `node scripts/lint-claims.cjs --base
  0671d035` → 0 warnings.
- `npm run test:latency` not run (the coordinator's idle run).

### review (reviewer, self)

| AC | Status | Evidence |
|---|---|---|
| 1 past | met | AC 1 cases: order `task-a/green/1, task-b/red/1, task-b/design/1`; console lines; `no past runs`, exit 0 |
| 2 waiting | met | AC 2 cases: `pl-1`'s and `rc-1`'s developer steps in frontier order, the qa step left out, agents `Zed, Amy` (DNA order, Claude has no adapter) |
| 3 both / `--active` | met | AC 3 `it.each` (no flag, both flags); CLI `--active` → exit 2 `unknown option '--active'` |
| 4 HEAD | met | AC 4: uncommitted record not listed; one `W_UNCOMMITTED_INPUTS` per dirty path, with `--past` alone and with the deduction; CLI `warning:` line |
| 5 no `paths.runs` / §4.5 | met | AC 5 core + CLI: `no past runs` + `warning: dna.yaml declares no run log (paths.runs)`, exit 0; invalid line / duplicate id → exit 1 |
| 6 docs | met, two parts pending | BDD, `06_features.md`, `docs/cli-reference.md` committed; `spec-006` §3 and `minor-v0.3` `features:` are pending amendments (below) |

Decisions for the approver:
1. **Console details §5 left open**, stated in the `spec-016` amendment: `<duration>` = seconds with one
   decimal plus `s` (the run summary's rounding); tokens `in/out`, `not-reported` only when both are; a
   `<source>: <n>` heading per non-empty section; `none` for a step with no adapter-declaring agent.
2. **Diagnostics are success warnings** (`<code> (<file>): <message>`): the console's `warning:` lines, but
   also stderr lines under `json`/`yaml`, beside the payload's `diagnostics`; stdout carries the payload alone (`test/cli/agent-list.integration.test.ts`, the `--format json` case).
3. **`dna.yaml` not committed at `HEAD`** with the past section → `NOT_FOUND`, as `agent show`; with the
   waiting section alone it is not required (no agents, so no waiting step).
4. **Every run log is read, whatever `--element`**: a §4.5 violation in another element's log still exits 1.
5. With the waiting section the run logs are read at the deduction snapshot's commit, so one `baseline`.

Retrospective items (one line each):
- `waitslot.sh` does not see the `npm run build` every targeted jest run starts in `globalSetup`
  (`test/global-setup.cjs`): targeted suites are "free" but each rebuilds `dist/`.
- `spec-008` §2 and `docs/cli-reference.md` said "one command" had its own console text after
  `workflow next|status|start|end|finalize` gained one: the console-exception sentence had no owner.

### Review fixes

Independent review, 2026-10-11: **APPROVE WITH FIXES** (decisions 1, 2, 4, 5 sound; 3 acceptable if
documented). The task stays `in-review`; no re-submit.

- **F1** — past order was full-path byte order, not element-id order (`minor-v0.3.1.jsonl` sorted before
  `minor-v0.3.jsonl`, `.` < `.j`). `readRunLogsAt` now sorts on the basename without `.jsonl`; docstring
  corrected. Case: `test/core/agent-list-edges.test.ts` "an element id that is a prefix of another".
- **F2** — `tests.unchanged(since: red)`: `git log --first-parent --no-merges --format=%h a027acd3..HEAD --
  test/core/agent-list.test.ts test/cli/agent-list.integration.test.ts` → `665c05dc 4558ad62 20fd6b41` (the
  history stays; it is not rewritten). Net effect: `git diff --stat a027acd3 HEAD -- <both files>` →
  `test/core/agent-list.test.ts | 2 +-`, the one line of green's type-only cast (`result.warnings` →
  `(result as { warnings?: readonly string[] }).warnings`, `tsc` refused the union access); the CLI suite is
  byte-identical to red. **Deviations, for the approver:** (a) refactor `4558ad62` appended seven cases to
  red's file; `665c05dc` moved them to `test/core/agent-list-edges.test.ts` over a fixture copy in
  `test/core/helpers/agent-list-fixture.ts`; (b) **waiver requested** for green's type-only cast in red's file
  (no assertion changed). Separation of duties: see the note under red.
- **F3** — the two further exit-`1` refusals of the past section (`dna.yaml` not committed at `HEAD`;
  `paths.runs` outside the root) and "every run log is read whatever `--element`/`--phase`" are now in
  `docs/cli-reference.md`'s Errors bullet (`6cee6ceb`) and in `spec-016` §5's Exit codes (pending amendment).
  Decision 3 is thereby documented.
- **F4** — the `spec-016` Revision note said "three" details and listed four: now "four".
- **F5** — `W_UNCOMMITTED_INPUTS` covered the whole `paths.runs` directory. `isRunLogPath` /
  `runLogDirPrefix` (`src/agent/run-log.ts`) name the run logs (direct `*.jsonl` children);
  `readDirtyRunLogs` (`src/core/workflow-deduction.ts`) keeps only those, used by `agent list --past` and by
  the deduction's `readDirty` (the other input pathspecs unchanged in shape). `spec-017` §1.2 already reads
  "the run-log files (`<runs>/<element-id>.jsonl`)" (`grep -n "run-log files" …spec-017…` → line 99), so the
  deduction now matches its spec and no spec-017 amendment is needed. Cases (edges file): a dirty README and a
  nested `.jsonl` are not reported by `agent list --past` nor by `deduceWorkflowStateAtHead`; with `paths.runs:
  [ ./ ]` a dirty `src/x.ts` is not reported by either. No other suite changed (full run below).
- **F6** — `test/cli/agent-list-edges.integration.test.ts`: `--format json` with a dirty run log → stdout one
  JSON line (the payload, its diagnostic in `diagnostics`), stderr exactly one `{"warning": "W_UNCOMMITTED_INPUTS
  (docs/runs/task-1.jsonl): …"}` line, exit 0.
- Red for F1/F5: with `src/` restored to `7bb82bbb` (files copied aside and back), `npx jest
  test/core/agent-list-edges.test.ts` → **4 failed, 7 passed** (the F1 case and the three F5 cases); after
  `6cee6ceb` → 11 passed.
- Gates after the fixes: `npm run test:coverage -- --maxWorkers=2` under the slot (load 2.6) → **386 suites,
  7115 passed, 0 failed**, exit 0; All files **99.29 | 97.14 | 97.96 | 99.70**; `agent-list.ts` 98.09 | 92.22 |
  100 | 98.85, `run-log.ts` 99.24 | 94.85 | 100 | 99.54, `workflow-deduction.ts` 100 | 98.94 | 100 | 100.
  `npm run lint` 0; `npm run docs:api` 0; `npx tsc --noEmit -p tsconfig.json` 0; `npx tsc -p
  tsconfig.build.json --noEmit` 0 (slot); `node scripts/check-governance.cjs --base 0671d035` → 0 findings.
- **Merge hazard (gate):** task-211 merges first and also bumps `06_features.md` to 1.13: at the gate this
  branch re-bumps it to 1.14 and re-runs the `00_index.md` line-range sync (task-141's script).

### Pending amendments (approver)

- `spec-006-core-domain-api` — proposed `--reason`: "agentList ships (task-240): its section 3 row loses
  the planned marker and its feature cell becomes P5.3.4, the row 06_features.md gained for it, and the
  bullet under the table says so; no other function or surface changes."
- `spec-008-cli-grammar` — proposed `--reason`: "agent list ships (task-240): the section 12 row is
  registered and names the section and filter options, and the section 2 --format row lists every command
  with console text of its own, workflow next, status, start, end and finalize included; no flag, exit
  code or error format changes."
- `spec-016-agent-execution` — proposed `--reason`: "agentList is registered (task-240), so section 8's
  module cell loses the planned marker; section 5 states the four console details it left open (duration in
  seconds with one decimal, a heading per non-empty section, none for a step with no agent, the warning line
  of a diagnostic) and its exit codes name the two further exit 1 refusals of the past section and that every
  run log is validated whatever the filters; no record key, payload key or exit code changes."
- `minor-v0.3` `features:` gains `P5.3.4` — **`memory amend` refuses it**: the `release` type is
  `amendable: false`. Per ruling R1 the coordinator records it by hand at the gate as `wf(release): amend
  minor-v0.3 [in-development → in-development]` (precedent `3b585e33`). Proposed reason: "P5.3.4 (wingfoil
  agent list) is delivered by task-240 and enters minor-v0.3's features as dl-135 Action 3 asks; recorded
  by hand because the release type is amendable: false."
