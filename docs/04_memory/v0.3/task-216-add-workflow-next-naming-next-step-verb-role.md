---
id: "task-216-add-workflow-next-naming-next-step-verb-role"
type: task
title: "Add `workflow next`, naming the next step's verb, role, element, directives and bindings"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "cli", "performance"]
ref: "spec-017"
bug: []
depends_on: ["task-202-deduce-iterate-over-over-memory-types-collections-live", "task-203-read-instance-history-walk-step-linkage-created-elements", "task-204-reshape-workflow-list-add-workflow-show-both-answering"]
tmpl_version: 260703
---

## Description

`workflow next [<ref>] [--assigned-to <who>]` returns the frontier of the selected instance: the first step is the one `agent execute --next` consumes. Each step reports its key, trail, scope, role, holders and `agentRole`, the role's directives, actions with bindings (`memory.add` argv with `--workflow <instance> --step <key>`, `agent` argv `wingfoil agent execute --workflow <id> --step <key>`, `manual` expected commit subject), checks with `evaluated: false`, evidence kinds and `missing`/`finalizable`, fallback/re-entry, mode/allowedModes/distinctFrom, cadence with `lastRun: "not-recorded"`. Nothing executes.

## Acceptance Criteria

- (red-first) BDD P4.4 sc. 1: the output shows the step name, target element, role and role directives; sc. 2: `--assigned-to me` keeps only steps whose role the git identity's member holds (also a member name/email or role name); sc. 3: `no next step: workflow 'release-cycle' is complete`, exit 0; no open instance → `no open workflows`, exit 0.
- (red-first) A `manual` binding on `dev-loop.start` reports the expected subject `wf(task): start <id> [backlog → in-progress]` per spec-003's verb rule; `release-planning.commit-backlog`'s `release.set_state(in-development)` reports `approve`.
- (red-first) `NextResult` JSON matches the §8 interface (a schema test), and the console view always prints key, trail, role, scope, actions with bindings, directive ids and any "human needed" line (§8).
- (red-first) REQ-PERF-03: `workflow next` on this repository's history (fixture: a clone at a pinned commit with one open instance) completes under 1,000 ms p95 over 20 runs, measured in-process, not by wall-clock sampling of a spawned CLI (the `bug-012` lesson).
- (characterization) No directive content is inlined (spec-012 §7 is `agent execute`'s), and no phase-level directive field exists (`dl-066` option 1).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §6.1–§6.4, §7.3, §8 Step/NextResult, §10, §11; REQ-PERF-03; ruling R16 (agent argv); dl-066 option 1 (directives only through role).
- **Features:** P4.4, P4.14, X1.1.
- **Notes:** Proposal key: A09. B's `agent execute --next` and `agent list --waiting` consume `NextResult` / `StatusResult`; their tasks should depend on task-216/task-225.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B2 (2026-10-07, `task-198`).** REQ-PERF-03 risk: `readDeductionSnapshotAtHead` took 2.4–6.7 s on this repository under load (the Memory scan ~2.1 s over 834 documents, the registry load ~1 s; 47 git spawns per snapshot, 26 of them `cat-file --batch` from the registry loader, `memory.yaml` / `dna.yaml` read twice); the pure deduction takes 8–107 ms. Measure `workflow next`'s p95 on an idle machine early and share the duplicate reads if needed. `selectWorkflowInstance` returns only `workflow is not open: <ref>`; §10's `unknown workflow: <name>` is yours (or task-204's). Since `task-199`, `build-backlog`'s selection never empties: the phase completes through §4.7 (approver ruling 2026-10-07).
- **Handover from wave 3 B3 (2026-10-09, `task-205`, `task-204`, `task-203`, `task-202`, `task-268`; W3 B3 follow-ups).**
  - `task-205` AC 2's `workflow next` half is yours, unasserted there (`task-205`'s Execution Notes, *Unasserted
    (T1)*): after a `review` reject, `next` reports the fallback step (`red`) and the `bug.sync_state` manual action
    whose expected subject is `wf(bug): sync <bug> [in-review → in-progress]` (`dl-061` A.1, the reject path).
    `test/core/dev-loop-v1-5.test.ts` pins what `next` will read.
  - `workflow next` runs the same deduction as `workflow list` (`task-204`'s review): measure it in this task's
    REQ-PERF-03 latency test with real open instances, not an empty history (`task-202` found no open iterating
    instance in this repository).
  - `workflowShowAtHead` (`src/core/workflow-list-show.ts`) loads the registry twice: the deduction snapshot, then
    `loadWorkflowRegistryAtRev(root, snapshot.commit).bindings`. Carry `bindings` on the snapshot so `next` and
    `show` read it once.
  - `showWorkflow`'s `NOT_FOUND` message names the instance's workflow, not `<ref>`, when `<ref>` is the id of an
    open instance whose workflow is not loaded (it passes `name`, not `ref`, to `unknownWorkflowMessage`), while
    `docs/cli-reference.md` says `unknown workflow: <ref>`. Align one to the other.
  - `loadWorkflowRegistry` (the working-tree loader, `src/core/workflow-registry.ts`) has no production caller
    (`grep -rn 'loadWorkflowRegistry(' src` → its definition only; one test calls it): remove it or state who needs it.
  - Re-entry after a park is unspecified in `spec-017` §4.8 / §5.2: does `start` (or the fallback step) become
    current? `task-203` decision 3 found this repository's `park` re-enters no phase; one sentence of `spec-017`.
  - Coverage: one branch of `readLastChange` (`src/core/workflow-deduction.ts`, the empty-output `return null`
    after `task-268`'s resolution) is uncovered, and the half of `spec-017` §4.11 that says a later linked element
    does not rebind an archived self-bound element is untested (`task-202`'s fixes).
  - Two bugs filed by the W3 B3 ingest are yours to keep in mind as the deduction's next writer: `bug-300` (an older
    bracketed submit hides a later bracketless one from the state rule after a re-entry) and `bug-301` (`readDirty`
    omits `.wingfoil/dna.yaml` from `W_UNCOMMITTED_INPUTS`); both `triaged`, v0.3, in no task's bug list.

## Execution Notes

### Design (architect, 2026-10-09)

**Inputs read.** `depends_on` Execution Notes (dl-015): task-202 (iterate_over; the approver ruling that an
`iterate_over` phase hands no re-entry cutoff to its iterations), task-203 (history walk, octopus bound,
ancestry rule for "newer"; its measured snapshot cost), task-204 (`workflow list` / `show`, `ShowResult`;
its candidate findings, one of them — `command` vs `run` — already closed in spec-017 §8). The B2/B3
handovers at the end of Implementation Notes. Cited specs `approved` (`grep -m1 '^status'` over spec-003,
-005, -006, -008, -012, -017): yes.

**Shape.**
- `src/core/workflow-next.ts` (new): `buildStep` (a deduced frontier step → spec-017 §8 `Step`),
  `nextWorkflow` (pure: selection, `--assigned-to`, messages), `workflowNextAtHead`, `renderNextConsole`.
  Registered as `CORE_MODULES` `workflow.workflowNext` (`mutates: false`, optional positional `<ref>`, option
  `--assigned-to <who>`, a console renderer per §8).
- The deduction (`src/workflow/deduce.ts`) resolves each action of a leaf step (§4.1, §4.2): text with the
  tokens substituted, the tokens with no value (now reported `W_UNRESOLVED_TOKEN` at `phases[p].actions[k]`,
  as §4.1 says for action arguments), the target kind and type, the target elements at `HEAD`, the bound
  element's from-state, and a `sync_state`'s source. `workflow-exit-state.ts` gains `actionStates` (the bound
  state before each action). The binding, argv and expected subject are `next`'s (§6.1).
- The snapshot carries `bindings.yaml` and `dna.yaml` (W3 B3 handover): `show` and `next` load the registry
  once.
- Approval detection and routing (§5.1–§5.3) are task-225's (P4.14, its ACs): `awaiting` reports only a
  third party (§5.4) here; the console renderer already prints an approval's "human needed" line.

**AC classification** (testing directive, T1).

| AC | Class | Why |
|---|---|---|
| 1 — BDD P4.4 sc. 1–3, `no open workflows` | red-first | no `workflow next` (`grep -c workflowNext src/core/index.ts` → 0 at `a9121070`) |
| 2 — expected subjects (`start`, `approve`), the reject path's `sync` | red-first | no binding view exists |
| 3 — `NextResult` / `Step` shape, console | red-first | new payload |
| 4 — REQ-PERF-03 | red-first | the timed operation does not exist |
| 5 — no directive content, no phase-level directive field | characterization | dl-066 option 1 holds today (the schema has no phase `directives`; `show` resolves through the role). Its test necessarily runs through the new command, so on the red commit it fails with the others for "no workflowNext operation", not on its own assertion |

### Red (qa, 2026-10-09)

`99cf0362` — `test/core/workflow-next.test.ts` (AC 1, 2, 3, 5), `test/cli/workflow-next.integration.test.ts`
(exit codes and bytes), `test/core/workflow-next-latency.test.ts` (AC 4) and the opt-in placement of that
suite: `test/latency-suites.cjs` gains `IN_PROCESS_LATENCY_SUITES`, `test/core/latency-budget-placement.test.ts`
a rule 5 (an in-process opt-in suite times, spawns nothing it times, records the load). Run on the tree without
the implementation (`npx jest test/core/workflow-next.test.ts test/cli/workflow-next.integration.test.ts
test/core/latency-budget-placement.test.ts test/cli/run-tests.test.ts` → **25 failed, 713 passed**; every
failure "no workflowNext operation in CORE_MODULES" or the CLI's `unknown command`; `npx jest -c
jest.latency.config.js test/core/workflow-next-latency.test.ts` → 2 failed, same reason).

Correction `66938e87`: the CLI test expected `start` for `element.set_state(released)`; `released` is the
fixture's last release state, so spec-003's rule gives `finalize`. The green code first matched the wrong
expectation through a bug (`element.set_state` read `element` as a type), fixed at `1ac349f5`.
`git log --first-parent --no-merges 99cf0362..HEAD -- <red's files>` lists only that commit.

### Green (developer, 2026-10-09)

`b97727b9` — the files above, `docs/cli-reference.md` (`workflow next` entry; `show`'s `unknown workflow:
<name>` aligned to the code, W3 B3 handover), and the existing tests the new operation or shape changes:
`production-registry` / `parity` (the operation and its test-only mechanical Resource), `workflow-exit-state`
(`actionStates`), `workflow-executor-cadence` (`workflow-next.ts` reads `distinct_from`, read-only). Allowlists
only lose entries: `enumeration-parity` (`spec-008 §11 commands` surplus `workflow next`) and
`name-resolvability` (nine `workflow next` / `NextResult` / `workflowNext` entries).

### Refactor (developer, 2026-10-09/10)

- `1ac349f5` — one target resolver per action (`actionTarget`), the bound from-state rule (its `HEAD`
  status until an earlier action of the phase moves it: an instance's static start is its type's first
  state, so commit-backlog's `release.set_state` read `draft → …`), subjects grouped per commit; new suites
  `workflow-next-views`, `workflow-next-render`, `workflow-deduction-gaps` (the two B3 handover cases:
  §4.11 an archived self-bound element is not rebound; `readLastChange`'s empty answer).
- `0fa5c0f1` — REQ-PERF-03: `loadWorkflowsYamlAtRev` reads the included files and `bindings.yaml` in one
  `cat-file --batch` (27 → 3 `cat-file` spawns per `workflow next` on this repository, counted with a
  `spawnSync` wrapper on `dist/core/workflow-next`).
- `1caf413d`, `e854d948` — simpler subject rendering; branch coverage.

| Command | Result |
|---|---|
| `npm run test:coverage` (at `e854d948`) | 324 suites, **6108 passed**; All files **99.23 / 97.02 / 97.59 / 99.68**; main (W3 B3 gate log) 99.2 / 97.01 / 97.48 / 99.67; `workflow-next.ts` 100 / 96.61 / 100 / 100 (targeted run), `deduce.ts` 100 / 99.78 / 100 / 100 |
| `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` | exit 0 each |
| `node scripts/check-governance.cjs --base b56e8721` | 1 `wf()` commit checked, 0 findings, exit 0 |
| `npx jest -c jest.latency.config.js test/core/workflow-next-latency.test.ts` (REQ-PERF-03, loaded) | **loaded, not a REQ-PERF-03 measurement**: p95 1655 ms (n=25, min 736, max 1910), load 23.19 / 29.39 → 18.85 / 27.88; before `0fa5c0f1` p95 3302 ms (min 908) at load 2.86 → 17.13. The idle run is the coordinator's |

BDD: P4.4's three scenarios are pinned by `test/core/workflow-next.test.ts` (sc. 1 "under 1 second" by the
latency suite); the feature file needed no change (`grep -n "\-\-name" P4.4-workflow-next.feature` → none).

### Review (reviewer self-check, 2026-10-10)

| AC | Status | Evidence |
|---|---|---|
| 1 | met | `workflow-next.test.ts` "AC 1" blocks (sc. 1, sc. 2 by name / email / role / `me`, sc. 3, no open instance, unknown `<ref>`); CLI suite exit codes |
| 2 | met | "AC 2" blocks: `wf(task): start task-1 [backlog → in-progress]`, `wf(release): approve minor-2 [planning → in-development]`, and after the review reject `red` with `reentered: true` and `wf(bug): sync bug-1 [in-review → in-progress]` |
| 3 | met | "AC 3" key-set test of `NextResult` / `Step` / `ActionView`; console lines incl. "human needed" and "waiting for" |
| 4 | met in code, measured loaded only | latency suite (opt-in pass); the idle run is the coordinator's |
| 5 | met | "AC 5": no `DIRECTIVE-BODY-SENTINEL` in the payload; a phase's `directives:` is not read |

Same-class sweep in touched files: an expected subject takes its type from the deduced target
(`targetType`), which the deduction sets through `typedStateType` — `element` is never a type
(`grep -c "typedStateType(token)" src/workflow/deduce.ts` → 1; `workflow-next.ts` parses no type of its own);
`show` and `next` both read `snapshot.bindings` (`grep -c loadWorkflowRegistryAtRev
src/core/workflow-list-show.ts` → 0).

### Pending amendments (approver)

Uncommitted in the worktree; gates ran with them.
- `spec-017-workflow-commands-and-state-deduction` — `--reason "task-216: implementing workflow next needed readings §4.8 and §6–§8 left open. §8's Step gains directiveWarnings, the warnings §6.2 already reports; its cadence takes §6.4's shape, recurring plus lastRun not-recorded, null for once; expectedCommit may hold one subject per line. §6.1 states how a manual action's subject names its targets and its from-state, and the sync_state target-state rule. §7.3 gives the messages of an abandoned instance, an instance whose workflow is not loaded and a filter that keeps no step. §4.8 says what a park re-enters. No command, deduction rule or diagnostic changed."` (after task-204's spec-017 amendment).
- `spec-006-core-domain-api` — `--reason "task-216 registers workflowNext in CORE_MODULES, so §3's row loses its planned marker. Its MCP Resource stays task-239's; no other row changed."`
- `spec-008-cli-grammar` — `--reason "task-216 ships workflow next, already in §11's committed-HEAD row; §12 gains its one command-specific option, --assigned-to with a value. No other row changed."` (task-228 also amends spec-008: 216 first.)

### Decisions for the approver

1. `awaiting` reports only a third party (§5.4); approval detection and routing stay task-225's. Until then
   `next` never prints "human needed" for an approval phase (the renderer is ready).
2. The REQ-PERF-03 suite runs in the opt-in latency pass, not the parallel `npm test` (the 2026-10-03
   ruling's reason applies: the budget presupposes an idle machine); `latency-budget-placement` gains rule 5
   for in-process opt-in suites. Its fixture is this repository at `b56e8721` (eight open instances, not
   one: a harder case than the AC's).
3. `--assigned-to`: an unknown `<who>` is read as a role name; a filter that keeps nothing exits 0 with
   `no next step of workflow '<name>' is assigned to '<who>'`.
4. `cadence`: `null` for `once`, `{ recurring, lastRun: "not-recorded" }` otherwise; `directiveWarnings`
   added to `Step` like `PhaseView`.
5. Expected subjects: grouped per (type, verb, bracket), one per line when targets differ; unknown targets
   as `<id>` / `<from>` / `<type>`; a `sync_state` ignores the aggregate "all tasks of the bug" rule.
6. `memory add`'s argv carries `--workflow` / `--step` (task-227 adds the options) and the agent argv
   `--workflow` / `--step` (task-235): following them before those tasks land is refused as unknown options.
7. Action-argument tokens with no value now raise `W_UNRESOLVED_TOKEN` (§4.1), except a `{T.<field>}` whose
   `T` the phase's selection selects (resolved per element when it runs).
8. `loadWorkflowRegistry` (working tree) is kept: no production caller, but `workflow-core-checks.test.ts`
   characterizes the working-tree checks through it (B3 handover: "remove it or state who needs it").

### Candidate findings (not filed)

- `loadDirectivesAtRev` reads each directive with its own `git show` (16 spawns, ~180 ms loaded on this
  repository); `test/core/directive-inventory-baseline.test.ts` pins `readPathAtRev` by name. A batched read
  would help REQ-PERF-03 further.
- The snapshot resolves the same sha nine times (`rev-parse <sha>^{commit}`, ~100 ms loaded): each `*AtRev`
  loader re-resolves its `rev`.
- `bug-301` (`readDirty` omits `dna.yaml`) now matters more: `next` reads `dna.yaml` (holders, agent roles).

### Merge-order notes

- Merges first in B4. task-228 shares `docs/cli-reference.md`, spec-005/008, `production-registry` /
  `parity` rosters: adjacent-line conflicts expected; 216's spec-008 Revision note goes before 228's.
- task-225 (status) builds on `buildStep` / `NextResult` / `humanNeededLine`; task-235 consumes
  `NextResult.next` and the agent argv; task-239 serves the Resource from `workflowNextAtHead`.
- `src/workflow/deduce.ts` and `src/core/loaders.ts` changed here: any B4 task touching them merges main.

### Retrospective

- The red test pinned a wrong subject that a green bug happened to satisfy (`66938e87`): a spec example
  (`mark-released` → `finalize`) in the fixture would have caught it at red.
- The machine was rebooted mid-task; the worktree and scratch survived (`git status` at resume).
