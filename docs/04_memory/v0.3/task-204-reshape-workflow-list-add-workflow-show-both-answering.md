---
id: "task-204-reshape-workflow-list-add-workflow-show-both-answering"
type: task
title: "Reshape `workflow list` and add `workflow show`, both answering from `HEAD`"
status: approved
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "cli"]
ref: "spec-017"
bug: ["bug-281"]
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-145-replace-cli-test-helpers-fabricated-stderr-child-real", "task-161-revise-command-baseline-which-verbs-read-head-filesystem", "task-194-check-workflows-against-memory-yaml-dna-yaml-state", "task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"]
tmpl_version: 260703
---

## Description

`workflow list` today prints the raw loader result. It becomes `ListResult`: startable workflows plus includable ones that are the current phase's sub on an open instance's frontier (`executableNow`), `--all` for every workflow, `no workflows defined` for an absent manifest. `workflow show <ref>` prints the resolved declaration recursively. Both read `HEAD` (the declared R15 exception), carry `baseline` and `diagnostics`. This is the breaking change spec-017 names.

## Acceptance Criteria

- (red-first) BDD P4.6 sc. 1–4 (P4.6 sc. 2 with an open instance whose frontier enters `dev-loop`); each entry has `name, startable, includable, description, executableNow`.
- (red-first) BDD P4.7 sc. 1–3: phases with role, directive ids (spec-012 §5), actions/checks with bindings, `produces` with owner, approval/awaits/fallback, iterate/selection, mode/distinct_from, cadence, evidence kinds, subs nested under their phase; `unknown workflow: ghost` exit 1.
- (red-first) A `spec-003` error makes both exit 1 `VALIDATION` with every diagnostic in `details`; warnings are listed and exit 0.
- (red-first) `workflow list x` and `workflow show a b` are refused at exit 2 (extra operands, per `bug-171`'s rule).
- (characterization) The MCP Resources `wingfoil://workflows` and `wingfoil://workflows/{name}` keep their payload and working-tree baseline (spec-017 §9); `scripts/e2e-smoke.cjs`'s `workflow list --format json` step and `test/cli/e2e-smoke.test.ts` still pass or are updated to the new payload.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §7.5, §7.6, §8 ListResult, §9 (shipped Resources unchanged), §11; ruling R15.
- **Features:** P4.6, P4.7.
- **Notes:** Proposal key: A08. `src/core/index.ts` (`workflowList` rewritten, `workflowShow` added to `CORE_MODULES`), `src/cli`. `bug-045`'s stale op counts are touched by whoever owns that bug.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B1 (2026-10-07, `task-194`).** `workflow list` still loads the working tree, through `task-194`'s `loadWorkflowRegistry`; moving it to `HEAD` (`spec-017` §1.1, R15) is this task's: use `loadWorkflowRegistryAtHead`. Since `task-194` it also fails (exit `1`) when `dna.yaml` or `memory.yaml` is present but invalid, as `docs/cli-reference.md` says.
- **Handover from wave 3 B2 (2026-10-07, `task-198`).** `selectWorkflowInstance` returns only `workflow is not open: <ref>`; `spec-017` §10's `unknown workflow: <name>` row for a name that no manifest declares is this command task's to implement.

## Execution Notes

### Design (architect, 2026-10-07)

**Inputs read.** `depends_on` Execution Notes (dl-015): task-129 (the surplus-operand refusal; `workflow list x`
→ exit 2 already ships), task-145 (spawn helpers), task-161 (`spec-006` §6 item 6 already declares the `HEAD`
read for `workflowList` / `workflowShow`, so no `spec-006` §6 sentence is owed here), task-194 (handover:
move `workflow list` to `loadWorkflowRegistryAtHead`; its decision 1 left the move to this task), task-198
(F5: `unknown workflow: <name>` is this task's; `W_UNCOMMITTED_INPUTS` is one diagnostic per dirty path).
Cited specs, all `approved` (`grep -m1 '^status' docs/04_memory/design/specs/spec-00{3,5,6,8}-*.md
docs/04_memory/design/specs/spec-017*.md`): spec-017 (§1.1, §7.5, §7.6, §8, §9, §10, §11), spec-003, spec-005,
spec-006, spec-008.

**Shape.**
- `workflow list [--all]` and `workflow show <ref>` answer from one `HEAD` snapshot: `readDeductionSnapshotAtHead`
  + `deduceWorkflowState` (task-198), so `executableNow` and `<ref>` resolution come from the same deduction
  `next`/`status` will use (R15), and both carry `baseline` + the deduction's ordered `diagnostics`
  (registry, `W_UNCOMMITTED_INPUTS`, `W_MEMORY_*`, …). A `spec-003` error throws `DiagnosticsError` in the
  snapshot reader → `VALIDATION`, exit 1, every diagnostic in `details.diagnostics` (existing `coreErrorOf`).
- `ListResult` exactly as spec-017 §8. An entry is `executableNow` when it is startable, or when it is the
  `include` of a phase on the trail of some open instance's frontier step (the trail covers a plain include;
  the leaf phase itself covers an `iterate_over` phase, which task-198 reports unexpanded and task-202 will
  expand — both shapes give the same answer). Without `--all` only `executableNow` entries; with it, all.
  Ordered byte-wise by `name` (§1.3). No manifest at `HEAD`: `workflows: []`, `message: "no workflows defined"`,
  exit 0.
- `workflow show <ref>`: `<ref>` is a loaded workflow name, else an open instance id standing for its workflow
  (§7), else `NOT_FOUND` `unknown workflow: <ref>` (§10). The result is `{ baseline, workflow, diagnostics }`;
  `workflow` is the declaration resolved per §7.6: per phase its role, the role's directives (`id`, `title`,
  `resolveRoleDirectives` on `roles.yaml` + directive files at the same commit, plus that resolution's
  warnings), actions and checks with their binding (`resolveToken`, `evaluated: false` on checks),
  `produces` with owner (and `evidence`, as task-198's `ProducesView`), approval / awaits / fallback,
  `iterate` or `selection`, `mode` / `allowedModes` / `distinctFrom`, `cadence`, the phase's evidence kinds
  (§4.3, computed statically with the same rules as the deduction's leaf, sharing `declaresState`), and the
  included sub nested under its phase, recursively (bounded: `E_WORKFLOW_INCLUDE_CYCLE`). The shape is added
  to spec-017 §8 as `ShowResult` (pending amendment): §8 says only "the resolved declaration of §7.6".
- `bug-281`: `workflowCoreDiagnostics` emits one warning per missing input, before the per-file rows,
  `W_WORKFLOW_CHECKS_NOT_RUN` (file `dna.yaml` / `memory.yaml`, path `''`), naming the checks that did not run.
  spec-003 gains the row (pending amendment).
- Unchanged: the MCP Resources `wingfoil://workflows` / `wingfoil://workflows/{name}` (payload and working-tree
  baseline, spec-017 §9); `loadWorkflowRegistry` (working tree) stays exported for them and the tests.
- Console rendering stays the indented JSON of every other command (spec-017 §8: free-form; `dl-043` is v0.4).

**Files.** `src/core/workflow-list-show.ts` (new), `src/core/index.ts` (`workflowList` rewired, `workflowShow`
added, `--all`), `src/core/workflow-core-checks.ts` (bug-281), `src/workflow/deduce.ts` (export `declaresState`
only — task-202/203 edit the same file and merge first), `docs/cli-reference.md`, `docs/user-guide.md` §7,
BDD `P4.7-workflow-show.feature` (`--name` → positional, spec-017 Consequences), the parity allowlist (loses
`workflow show`). Pending amendments: spec-017 §8, spec-008 §11/§12, spec-006 §3, spec-003 (bug-281 row).

**AC classification** (testing directive: never fabricate a red).

| AC | Class | Why |
|---|---|---|
| 1 — P4.6 sc. 1–4, entry fields | red-first | today's payload is the loader result: no `startable`/`executableNow`, nothing filtered, no message for an absent manifest |
| 2 — P4.7 sc. 1–3 | red-first | no `workflow show` command (`grep -c workflowShow src/core/index.ts` → 0) |
| 3 — errors exit 1 `VALIDATION`, warnings exit 0 | red-first (partly) | red for `show` and for the `HEAD` baseline of `list` (an error committed at `HEAD` and fixed only in the working tree exits 0 today; an error only in the working tree exits 1 today); the `details.diagnostics` mapping of `list` itself exists (task-136/194) and is kept by those tests |
| 4 — `workflow list x`, `workflow show a b` → 2 | characterization + red-first | `list x`: characterization (task-129 ships it, `test/cli/extra-operand-refusal.integration.test.ts`); `show a b`: red-first |
| 5 — MCP Resources unchanged; e2e-smoke | characterization |
| bug-281 (task `bug:`) | red-first | `workflowCoreDiagnostics` returns `[]` with `dna.yaml` absent |

### Red (developer, 2026-10-07)

`da08f121` — `test/core/workflow-list-show.test.ts` (P4.6 sc. 1–4, P4.7 sc. 1–3, the `<ref>`-as-instance
case, the evidence-kind parity with the deduction, the `HEAD` baseline both ways, bug-281),
`test/cli/workflow-list-show.integration.test.ts` (exit codes and bytes: `show ghost` → 1, `show a b` → 2,
`show` alone → 2, `list x` → 2, a committed `spec-003` error → 1 on both, `no workflows defined` → 0) and one
characterization in `test/mcp/read-only-resources.test.ts` (both `wingfoil://workflows…` Resources serve an
uncommitted edit). `npm run build && npx jest --verbose test/core/workflow-list-show.test.ts
test/cli/workflow-list-show.integration.test.ts test/mcp/read-only-resources.test.ts` → 3 suites, **23 failed,
29 passed**: every new red test failed for the reason it names (no `workflowShow` → `show` refusals exit 2
"unknown command"; the loader payload has no `startable`/`executableNow`; the working-tree baseline answers
0 where `HEAD` holds an error and 1 where only the working tree does; no `W_WORKFLOW_CHECKS_NOT_RUN`); the
two characterizations (`list x` → 2, the MCP working-tree baseline) passed on first run.

### Green (developer, 2026-10-07)

`f239af66` — `src/core/workflow-list-show.ts` (new: `listWorkflows` / `workflowListAtHead`,
`showWorkflow` / `workflowShowAtHead`, `declaredEvidenceKinds`, the `ListResult` / `ShowResult` types);
`src/core/index.ts` (`workflowList` rewired with `--all`, `workflowShow` registered with the required
positional `<ref>`, the barrel exports, the now unused `wrapReadOnly` removed); `src/core/workflow-core-checks.ts`
(`W_WORKFLOW_CHECKS_NOT_RUN`, bug-281); `src/workflow/deduce.ts` (only `declaresState` exported, so `show`
and the deduction apply one rule); stale comments in `workflow-registry.ts` and `mcp/workflow-resource.ts`.
Same commit: `docs/cli-reference.md` (both entries, *Git side effects*), `docs/user-guide.md` §7, BDD
`P4.7-workflow-show.feature` and three story-map lines (`--name` → positional, spec-017 Consequences), and
the existing tests the new baseline or payload changed, each with the reason in a comment:
`production-registry` / `parity` (the new operation and its test-only mechanical Resource), the fixtures of
`workflow-diagnostics`, `workflow-evidence`, `format-key`, `workflow-list-diagnostics` and
`program.integration` now commit before calling `workflow list` (`HEAD`); the two `pure` cases of
`workflow-core-checks` filter the new warning their dna-less fixture raises and its "without memory.yaml"
case now pins it; `workflow-executor-cadence`'s `distinct_from` reader list gains `workflow-list-show.ts`
(it surfaces the field read-only, spec-017 §0). Allowlists only lose entries: `enumeration-parity`
(`workflow show`, planned by task-204) and `name-resolvability` (`wingfoil workflow show` ×2, `ListResult`,
`executableNow`).

Deviation found while greening: the static CLI fixture root (`test/cli/fixtures/wingfoil-root`) is a
directory of this repository, not a repository, so a `HEAD` read there reads this repository's own
`.wingfoil/`; `program.integration`'s `workflow list` case now commits the fixture files in a temporary
repository. Production resolves the git root (`resolveProjectRoot`, `src/cli.ts:27`), so this is a harness
property, not a defect.

### Refactor (developer, 2026-10-07; load average ~88, nine batch agents)

| Command | Result |
|---|---|
| `npm test` (at `f239af66`) | 302 suites, **5745 passed**, exit 0 |
| `npm run test:coverage` (at `bfc22ebe`, the final code) | 302 suites, **5749 passed**; All files **99.28 % statements, 97.21 % branches, 97.34 % functions, 99.71 % lines**; `workflow-list-show.ts` 99.21 / 97.91 / 97.29 / 100, `workflow-core-checks.ts` 100 |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `node scripts/check-governance.cjs --base 1ce84a54` | 2 `wf()` commits checked, 0 findings, exit 0 |
| `node dist/cli.js workflow list --format json` on this repository | exit 0; the 5 startable mains (`adr-ingest`, `bug-ingest`, `decision-log-ingest`, `service-ingest`, `sw-life-cycle`), no open instance; diagnostics 61 `W_WORKFLOW_UNBOUND_TOKEN`, 6 `W_MEMORY_UNREADABLE` (the six pre-`dl-019` plans, spec-017 §1.4), plus `W_UNCOMMITTED_INPUTS` for this worktree's uncommitted spec/task edits; 15.9 s wall, 1.9 s user under load |
| `--all`, then `workflow show <name>` for each of the 24 | 24 listed; every `show` exit 0 — spec-017 §12's "zero errors" measured through both commands |

A first coverage run at `f239af66` gave 96.88 % functions: `src/core/workflow-list-show.ts` had untested
branches (memory.yaml / roles.yaml absent, a collection iteration, `by_person`, a non-fresh mode, an empty
repository) and the barrel's seven new value re-exports counted as uncovered getters. `212a7f99` added the
tests and `bfc22ebe` keeps those functions module-internal
(only the payload types are exported; no consumer imports them yet). The coverage baseline is the W3 B2 gate's `npm run test:coverage` on main (the W3 B2 gate run, 5712 tests: 99.28 /
97.18 / 97.33 / 99.71).

### Review (reviewer self-check, 2026-10-07)

| AC | Status | Evidence |
|---|---|---|
| 1 — P4.6 sc. 1–4, five fields | met | `workflow-list-show.test.ts` "BDD P4.6" blocks (sc. 2 both shapes: a plain include and an `iterate_over` leaf) |
| 2 — P4.7 sc. 1–3 | met | "BDD P4.7" block; CLI `show ghost` → 1 |
| 3 — error exit 1 `VALIDATION` with details, warnings exit 0 | met | "AC 3" blocks (core and CLI) |
| 4 — `list x`, `show a b` → 2 | met | CLI integration test; `extra-operand-refusal.integration.test.ts` now sweeps `workflow show` too |
| 5 — MCP Resources unchanged; e2e-smoke | met | `read-only-resources.test.ts` characterization; `test/cli/e2e-smoke.test.ts` passes unchanged in `npm test` (its `workflow list --format json` step only parses the JSON) |
| bug-281 | met | "bug-281" block, both missing files |

Same-class sweep in the files touched: every `--name` spelling of `workflow show` under
`docs/02_requirements/` (`grep -rn "workflow show --name" docs/02_requirements` → none); every comment that
said "until task-204" (`grep -rn "until task-204" src` → none). Out of the files I own, `docs/agents.md`,
`CLAUDE.md` and `.wingfoil/README.md` still describe `workflow list` as the payload with phases or the only
workflow operation (candidate finding below); `docs/01_vision/X_cli-cmds.md:168` keeps `--name` (task-245
owns that file: handover).

### Pending amendments (approver)

Uncommitted in the worktree; gates ran with them.
- `spec-017-workflow-commands-and-state-deduction` — `--reason "task-204: §8 said only that workflow show returns the resolved declaration of §7.6; implementing it needed a shape. §8 gains ShowResult with WorkflowView, PhaseView, CheckTokenView and the TokenBinding spec-003's resolution yields, and states that a phase's evidence kinds follow §4.3 as deduction applies them and that list and show carry the deduction's diagnostics. No command, rule or diagnostic changed."` (record after task-203's and task-202's spec-017 amendments).
- `spec-008-cli-grammar` — `--reason "task-204 moves workflow list to the declared HEAD baseline (spec-017 §1.1, ruling R15) and ships workflow show: §11's working-tree row loses 'workflow list until its v0.3 reshape', and §12 gains the one flag the reshape adds, workflow list --all. No other row changed."` (task-218 also amends spec-008: merge order 204 first).
- `spec-006-core-domain-api` — `--reason "task-204 registers workflowShow in CORE_MODULES beside the reshaped workflowList, so §3's row loses its planned marker. No other row changed."`
- `spec-003-workflows-yaml-schema` — `--reason "task-204 fixes bug-281: a core check skipped for want of dna.yaml or memory.yaml left no trace, so an empty diagnostics list could mean checked and clean or not checked. The table gains W_WORKFLOW_CHECKS_NOT_RUN (core, warning, one per missing file, before the other core rows) and Where each check runs says the two skips are reported. The skip itself is unchanged."`

### Decisions for the approver

1. `list` and `show` carry the **whole deduction's** `diagnostics` (registry, `W_UNCOMMITTED_INPUTS`,
   `W_MEMORY_*`, …), not the registry's alone: both resolve against the deduction (`executableNow`, an
   instance id as `<ref>`). On this repository that adds the six `W_MEMORY_UNREADABLE` plans to every call.
2. `executableNow` for an includable workflow = it is the `include` of **any** phase on the trail of an open
   instance's frontier step (nested includes count), plus an `iterate_over` leaf's own sub.
3. bug-281's code is `W_WORKFLOW_CHECKS_NOT_RUN`, `file` relative to `.wingfoil/` (`dna.yaml`), path `''`,
   emitted ahead of the other core rows, only for a registry with at least one workflow.
4. `--format console` stays the indented JSON (spec-017 §8: free-form; `dl-043` is v0.4); no `renderConsole`.
5. `ShowResult`'s details: `mode` reports `fresh` when absent; `directiveWarnings` beside `directives`
   (`roles.yaml` absent → one warning per role); a string `produces` owner is the phase's bound type from the
   exit-state computation (the includer's for a sub with no `element`).
6. `show` loads the registry a second time at the snapshot's commit to get `bindings.yaml` (the snapshot does
   not carry it; adding it would edit task-203's file). One baseline, double cost of the registry load.

### Candidate findings (not filed)

- spec-017 §8's `ActionView.binding.kind` names `command` where the code (`TokenBinding`,
  `src/workflow/bindings.ts`) and `spec-003` Layer 3 say `run` — for task-216 (`next`) to settle.
- `docs/agents.md` (§ MCP table: "`wingfoil://workflows/{name}` ↔ `workflow list`, the entry with that name";
  § "When asked to run": "`workflow list` → find the workflow and its phases"), `CLAUDE.md` §1/§3/§6 and
  `.wingfoil/README.md` describe the 0.2.x `workflow list` and say it is the only workflow operation — for
  the v0.3 `user-docs` / `align-agent-docs` phase. Review outcome: the coordinator files it as a bug at the gate.
- `workflow list` on this repository took 15.9 s wall (1.9 s user) under load 88: the deduction snapshot
  (Memory scan) dominates, as task-198's F5 warned. The reviewer measured 0.9–3.0 s on an idle machine, and
  0.88 s with task-203 and task-204 merged. Not a finding: REQ-PERF-03 (< 1,000 ms p95) binds `workflow next`,
  not `list`.

### Merge-order notes

- After task-203 and task-202 (both edit `src/workflow/deduce.ts`; mine only adds `export` to
  `declaresState`; if task-202 expands `iterate_over`, `frontierSubs` keeps working through the trail — the
  "iterate_over" test pins it either way). Re-run `test/core/workflow-list-show.test.ts` after merging main.
- Before task-207: `scripts/e2e-smoke.cjs` and its test are unchanged here; the `workflow list` step now gets
  `ListResult` (still JSON).
- task-218 also adds to `CORE_MODULES`, `docs/cli-reference.md`, `production-registry` / `parity` lists and
  spec-005/008: expect adjacent-line conflicts.
- Handover for task-245 (`X_cli-cmds.md:168`): `workflow show <ref>`, no `--name`.

### Review fixes (2026-10-08, independent review: approve with fixes; no `src/` change)

- spec-006 §6's baseline table: the working-tree row no longer ends "`workflowList` until its v0.3 reshape
  moves it to item 6"; the Revision note and the proposed `--reason` name §6.
- spec-017 §7.5 states the `executableNow` rule `frontierSubs` (`src/core/workflow-list-show.ts`) applies:
  the include of every phase on a frontier step's trail, ancestors included, plus the leaf `iterate_over`
  phase's include, even with no eligible candidate.
- spec-017 §8 no longer contradicts itself: `ActionView.binding.kind` (reused by `CheckView`) reads `run`
  instead of `command`, matching `TokenBinding` (`src/workflow/bindings.ts`) and `spec-003` Layer 3. This
  closes the first candidate finding above.
- Governance at review: `node scripts/check-governance.cjs --base 1ce84a54` → 4 `wf()` commits checked,
  0 findings.

Final proposed `--reason` texts (supersede the ones under "Pending amendments" above):
- `spec-017`: "task-204: §8 said only that workflow show returns the resolved declaration of §7.6; implementing it needed a shape. §8 gains ShowResult with WorkflowView, PhaseView, CheckTokenView and the TokenBinding spec-003's resolution yields, and the binding kind of next's action and check views reads run instead of command, as spec-003 Layer 3 and the code say, so §8 no longer contradicts itself. It states that a phase's evidence kinds follow §4.3 as deduction applies them and that list and show carry the deduction's diagnostics. §7.5 states the executableNow rule list applies: the include of every phase on the trail of an open instance's frontier step, ancestors included, plus a leaf iterate_over phase's include, even with no eligible candidate. No command, rule or diagnostic changed."
- `spec-008`: unchanged.
- `spec-006`: "task-204 registers workflowShow in CORE_MODULES beside the reshaped workflowList, so §3's row loses its planned marker, and §6's baseline table drops 'workflowList until its v0.3 reshape moves it to item 6' from the working-tree row, since both now read HEAD under item 6. No other row changed."
- `spec-003`: unchanged.
