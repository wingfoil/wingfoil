---
id: "task-194-check-workflows-against-memory-yaml-dna-yaml-state"
type: task
title: "Check workflows against `memory.yaml`, `dna.yaml` and the state machines at `HEAD`"
status: approved
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "validation"]
ref: "spec-003"
bug: ["bug-150"]
depends_on: ["task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections", "task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence"]
tmpl_version: 260703
---

## Description

`bug-150`: a phase naming an undefined role or Memory type loads silently. The core checks need `memory.yaml`, `dna.yaml` and `roles.yaml` at `HEAD`, so they run in the workflow operations of `src/core`, not in the pillar-isolated loader (spec-003 "Where each check runs"). This task adds them and exposes one function that returns the full registry + ordered diagnostics for every workflow command.

## Acceptance Criteria

- (red-first) `E_PHASE_ROLE_UNKNOWN` (`unknown role '<role>' (not defined in dna.yaml)`), `E_PHASE_APPROVER_UNKNOWN`, `E_WORKFLOW_ELEMENT_TYPE_UNKNOWN`, `E_WORKFLOW_COLLECTION_UNRESOLVED`, `W_PHASE_TOKEN_OUT_OF_SCOPE`, `W_PHASE_EXIT_STATE_UNDETERMINED`, `W_PHASE_FALLBACK_STATE_MISMATCH`, `W_PHASE_FALLBACK_NOT_REENTRANT` each fire on a fixture, in spec-003 order after the loader diagnostics (`bug-150`'s `role: nobody` / `memory.add(type: nonsense)` reproduction is one fixture).
- (red-first) A cadence `on:` event whose `<type>` or `<state>` is not in `memory.yaml` is a validation error (OQ3 recommendation, code named at design).
- (red-first) The exit-state computation of spec-017 §4.4 (static application of a phase's actions along the machine, the `set_state` verb rule of spec-003) is a pure function unit-tested on `dev-loop`, `release-planning.commit-backlog` and `bug-ingest.triage` fixtures; it is reused by task-198.
- (red-first) Every read is at `HEAD`: a test with a dirty `dna.yaml` that removes a role still validates against the committed roles.
- (characterization) On this repository the core checks raise exactly spec-017 §12's set (2 × `W_PHASE_TOKEN_OUT_OF_SCOPE` at `release-planning.yaml:118,120`, 1 × `W_PHASE_FALLBACK_NOT_REENTRANT` on `bug-ingest.triage`) and no error — recorded; task-199 then removes the removable ones.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-003 § Diagnostics "core" rows; spec-017 §2; spec-003 OQ3 (event names).
- **Features:** P4.1, P4.14, P4.15.
- **Notes:** Proposal key: A04. `src/core/workflow-*.ts` (new), `src/core/loaders.ts`. Relies on the existing HEAD readers (`loadDirectivesAtHead` pattern).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-194-check-workflows-against-memory-yaml-dna-yaml-state`, worktree `../.wf2-wt/task-194`,
cut from `main` at `ed4607a4` (W3 batch B1). Start `c7c26476`; bug sync `bug-150` `[planned → in-progress]`
`7b338f7a`.

### design (architect)

**`depends_on` read (dl-015).** `task-175` and `task-185` are `done` (`grep -m1 "^status"` over both).
task-175 leaves `E_WORKFLOW_COLLECTION_UNRESOLVED` to this task for the unresolved name and the key rules of
a `dna.yaml` list (ruling D1 (a); a `bindings.yaml` collection's keys are its `E_BINDING_COLLECTION_KEY`),
and gives `tokenName` / `memoryAddType` / `collectionKeyIssues` (`src/workflow/bindings.ts`), reused here.
task-185 leaves AC 2 (the existence check of an `on:` event's type and state) to this task; its
`CADENCE_EVENT_RE` already checks the shape. task-137's handover: resolve the rev once and read every
input at that sha — done in `loadWorkflowRegistryAtRev`.

**Specs.** `spec-003` and `spec-017` are `approved` (`grep -m1 "^status"`). spec-003 § Diagnostics gives
every core code, severity and rule; spec-017 §4.2–§4.4 and §5.1 give what an action targets, the exit-state
rule and the gates a phase holds. Open question 3 left the cadence code unnamed: named
`E_PHASE_CADENCE_EVENT_UNKNOWN` (pending amendment below).

**Design.**
- `src/core/workflow-exit-state.ts` — `workflowExitStates(workflow, memoryYaml, start, workflows?)`, pure
  (AC 3): per phase `{ phase, boundType, entry, exit, undetermined, created, run, held }`. Transitions go
  through `resolveTransitionTarget` (the engine every Memory verb uses); `set_state(s)` yields `s` when `s`
  is a state of the type and lies after the current state. Plain `include:` runs the sub on the same
  element and continues from its last exit; `iterate_over` leaves the bound state alone.
  `iterationStartState` gives §4.4's start under `iterate_over`. This is the function task-198 reuses.
- `src/core/workflow-core-checks.ts` — `workflowCoreDiagnostics(registry, inputs)`, pure: the static rows
  per file, then a walk from every startable workflow in manifest order through its includes (scope chain,
  start state per §4.4), deduped by `(file, path, code)` (first context wins), emitted by file, workflow
  level, phase, row.
- `src/core/workflow-registry.ts` — the "one function" of the Description: `loadWorkflowRegistryAtRev(root,
  rev)` / `…AtHead(root)` (every input at one sha: workflow files, `bindings.yaml`, `memory.yaml`,
  `dna.yaml`, Memory templates) and `loadWorkflowRegistry(root)` (working tree). Result shape = the
  loader's `{ manifest, workflows, bindings, diagnostics }`, core warnings appended; a core error throws
  `DiagnosticsError` (exit 1), as a loader error does. Core checks run only on a registry the loader
  accepted.
- `workflow list` (`src/core/index.ts`) now calls `loadWorkflowRegistry` (closes `bug-150`'s reproduction).
- Readings settled here: (a) "in spec-003 order after the loader diagnostics" = every loader diagnostic,
  then the core ones in spec-003's order among themselves — a **change** to spec-003's Order paragraph,
  which interleaved them per field, grounded on AC 1's wording and on the core checks running only on a
  load the loader accepted (corrected at review, F2: an earlier version of this note claimed spec-017
  §1.3 already ordered them so; §1.3's "this spec's" are the deduction codes); (b) no core row reads `roles.yaml` (roles are `dna.yaml` `team.roles`);
  (c) a core check is not decided when its input is absent (no `dna.yaml` / `memory.yaml` / template);
  (d) a token is checked on every include path from a startable workflow; a workflow no startable one
  reaches gets its exit states (from its type's first state) but no token check; (e) an event's state may
  be a `sequence` state, a reject/return target or `deprecated`; (f) `approval` becomes spec-003's union
  `{ by_role } | { by_person }` (the schema only accepted `by_role`, so `E_PHASE_APPROVER_UNKNOWN` could not
  fire; found at green).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — eight core codes on fixtures, order after loader | **red-first** | none emitted on `main` (`grep -rn "E_PHASE_ROLE_UNKNOWN" src` → nothing before this task) |
| 2 — cadence event existence | **red-first** | only the shape was checked (task-185) |
| 3 — exit-state pure function | **red-first** | no such function on `main` |
| 4 — every read at `HEAD` | **red-first** | no registry function on `main` |
| 5 — this repository's core set | characterization | pins the current files; task-199 changes them |

### red (developer)

`fe3d3ae0` adds `test/core/workflow-core-checks.test.ts` and `test/core/workflow-exit-state.test.ts`.
`npx jest test/core/workflow-core-checks.test.ts test/core/workflow-exit-state.test.ts` → **2 suites failed**,
`Cannot find module '../../src/core/workflow-registry'` / `'../../src/core/workflow-exit-state'` (the modules
the ACs require do not exist; the `workflow list` test asserts bug-150's exit 1, which `main` answers 0).

### green (developer)

`d860b4cd`: the three modules, `workflow list` wired, `approval` union in `src/workflow/schema.ts`, a
structural test for "both `by_role` and `by_person`", `docs/cli-reference.md` (`workflow list` entry), and
the twelve `name-resolvability.allowlist.ts` entries `plannedBy: ['task-194'…]` removed (the names now
resolve; `npx jest test/docs/name-resolvability.test.ts` → 11 passed). Both new suites: 27 passed.

### refactor (developer)

`92fc35e5`: the guards the loader makes unreachable are dropped (duplicate names, unresolved
includes, cycles — the walk terminates on its `done` set anyway; a non-`ValidationError` from
`resolveTransitionTarget`), `run` is a set, and tests cover every branch of the three modules
(`npx jest --coverage --collectCoverageFrom='src/core/workflow-*.ts' test/core/workflow` → branches 181/181,
140/140, 27/27). Tests import through the `src/core` barrel, which task-198/199/204/211 use.

| Gate | Result |
|---|---|
| `npx jest --coverage` (full suite, = `npm test`'s set) | 275 suites, 5107 tests passed; statements 99.26 %, branches 97.02 %, functions 96.78 %, lines 99.71 % — main `ed4607a4` measured the same way at start: 99.23 / 96.72 / 96.53 / 99.71 (no regression) |
| perf flakes under load | `test/mcp/resource-latency`, `test/core/query-latency` failed in two loaded full runs (load average 33–67, `uptime`), passed alone (8/8) and in the final full run; no budget touched |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `node scripts/check-governance.cjs --base ed4607a4` | exit 0 |
| `test/docs/` (cli-reference, name-resolvability, enumeration parity) | passed, in the full run above |
| `npm run build && node dist/cli.js workflow list --format json` on this repository | exit 0; 23 workflows; diagnostics: 92 W_WORKFLOW_UNBOUND_TOKEN, 9 W_PHASE_PRODUCES_OWNER_IMPLICIT, 1 W_PHASE_ACTION_UNTARGETED (loader) + 2 W_PHASE_TOKEN_OUT_OF_SCOPE, 1 W_PHASE_FALLBACK_NOT_REENTRANT (core) |

BDD: no scenario covers these codes (`grep -rln "E_PHASE_ROLE_UNKNOWN\|by_person" docs/02_requirements/02_bdd/features/` → only P4.14's `by_person` routing, task-225's), so none was added.

### review (self, reviewer)

| AC | Status | Evidence |
|---|---|---|
| 1 | met | one fixture per code with exact `{code, severity, file, path, message}`; `bug-150`'s fixture through the registry and through the `workflowList` CoreFn (`VALIDATION`, reason `E_PHASE_ROLE_UNKNOWN phases[0].role …`); an order test (loader `W_WORKFLOW_UNBOUND_TOKEN` first, then core by file/phase/row) |
| 2 | met | `release-released` / `task-shipped` → `E_PHASE_CADENCE_EVENT_UNKNOWN`; `task-done`, `release-line-active`, `bug-deprecated` pass |
| 3 | met | `workflow-exit-state.test.ts`: dev-loop (backlog → in-progress → in-review → done; design's submit moves the created tech-spec), release-planning.commit-backlog (release planning → in-development; build-backlog's two tasks pending → backlog), bug-ingest.triage (self-created bug open → triaged, holds gate `open` rejecting to `closed`); refusals carry the engine's reason |
| 4 | met | dirty `dna.yaml` without `developer`: at `HEAD` no diagnostic, working tree `E_PHASE_ROLE_UNKNOWN`; dirty `memory.yaml` / workflow file ignored |
| 5 | met | this repository at `HEAD`: no error; exactly `W_PHASE_FALLBACK_NOT_REENTRANT` at `bug-ingest.yaml` `phases[1].fallback.step` and `W_PHASE_TOKEN_OUT_OF_SCOPE` at `release-planning.yaml` `phases[6].actions[2]` (`{dl.id}`) and `[4]` (`{bug.id}`) — today's lines 123 and 125 (`grep -n '{dl.id}\|{bug.id}' .wingfoil/workflows/custom/release-planning.yaml`), spec-017 §12's 118/120 at `997e8998` |

Determinism: `grep -rn "Date.now\|Math.random\|new Date" src/core/workflow-*.ts` → nothing; the walk is in
manifest and phase order; a deep-equal two-run test.

### Review fixes (approve with fixes, 2026-10-07)

Red `3b048787` (`npx jest test/core/workflow-core-checks.test.ts test/core/workflow-exit-state.test.ts -t "F1|F3"`
→ 4 failed: the second token and the 2nd–4th key problems missing, no `held` gate and no mismatch for a
typed `set_state` on a selection); fix `de8dfc41`; the unregistered-type arm of the selection fallback is covered by the same test (`workflow-exit-state.ts` branches 151/151, `workflow-core-checks.ts` 182/182, `workflow-registry.ts` 27/27 — `npx jest --coverage --collectCoverageFrom='src/core/workflow-*.ts' test/core/workflow`).

- **F1 (defect).** The collector deduped on `(file, path, code)`, dropping distinct problems that share a
  path (`git.x(a: "{foo.id}", b: "{bar.id}")` reported only `{foo.id}`; a `dna:modules` list with a bad, a
  duplicate and a missing key reported only entry 0). The key now also carries the problem: the token for
  `W_PHASE_TOKEN_OUT_OF_SCOPE`, the message for `E_WORKFLOW_COLLECTION_UNRESOLVED`. The same token raised on
  a second include path is still reported once, with the first path's message (the existing test still
  passes). Tests: one per case, through `workflowCoreDiagnostics`.
- **F2.** The claim that spec-017 §1.3 already orders the core rows after the loader's was wrong (its "this
  spec's" are the deduction codes). Design reading (a), the spec-003 Revision note and the proposed reason
  now say the Order paragraph **changes**, grounded on AC 1 and on the core checks running only on a load
  the loader accepted.
- **F3.** `<T>.set_state(s)` now falls back to the phase's selection when it selects `T` (spec-017 §4.2): the
  selection is not moved, and the phase holds each selected gate state whose approve target is `s` (§5.1),
  so `where { type: task, status: pending }` + `task.set_state(backlog)` + `fallback.set_state: done` raises
  `W_PHASE_FALLBACK_STATE_MISMATCH` exactly as `memory.approve` does (test runs both actions). Header comment
  of `workflow-exit-state.ts` updated.
- **F7.** `docs/cli-reference.md` (`workflow list`): it now fails when `dna.yaml` or `memory.yaml` is invalid.
- Left to the coordinator's follow-ups, as instructed: the silent skip when a core input is absent; an unknown
  `T` in `<T>.set_state` / `sync_state` / `where.type`; spec-017 §2's `roles.yaml` mention and §12's line cites.

Gates after the fixes: `npx jest test/core test/docs` → 112 suites, 2461 tests passed; `npm run lint`,
both `tsc --noEmit`, `npm run docs:api` and `node scripts/check-governance.cjs --base ed4607a4` exit 0 (load
average 20.5, `uptime`). Status stays `in-review`: no re-submit.

### Pending amendments (approver)

- `spec-003-workflows-yaml-schema` (uncommitted in the worktree): `--reason "task-194 implements the core rows of the Diagnostics table. Open question 3 left the cadence event code unnamed, so the table gains E_PHASE_CADENCE_EVENT_UNKNOWN (core, error) with its path, message and the states an event may name, and Recurring phases names it. The Order paragraph changes: it interleaved the core rows with the loader rows per field, and now puts every core diagnostic after every loader diagnostic, in spec-003 order among themselves, as task-194 AC 1 asks and because the core checks run only on a load the loader accepted. Where each check runs names the two files, drops roles.yaml, which no core row reads, and says a core check is not decided without its input. No other code, severity or message changes."`

### Decisions for the approver

1. `workflow list` keeps its working-tree baseline (the core checks read `memory.yaml`/`dna.yaml` from the
   working tree too, one baseline per call); the move to `HEAD` (spec-017 §1.1, R15) stays task-204's, with
   its payload change — doing it here would break the fixture tests that write uncommitted files and the
   e2e-smoke run on an uncommitted `init`.
2. Core diagnostics come after every loader diagnostic (reading (a) above), not interleaved per file.
3. The `approval` schema becomes the spec-003 union (strict) — a phase declaring both keys, or an unknown
   key beside `by_role`, is now a structural error. No file in this repository does
   (`grep -rn "approval:" .wingfoil/workflows/custom/` → only `{ by_role: approver }`).
4. Cadence event code name `E_PHASE_CADENCE_EVENT_UNKNOWN`; an event may name `deprecated`.

### Candidate findings (not filed)

- `<T>.set_state` / `<T>.sync_state` with a `T` that `memory.yaml` does not register, and a selection's
  `where.type`, are in no spec-003 row: a typo there (`tsak.set_state`) is silent.
- spec-017 §12 cites `release-planning.yaml:118,120`; the lines are now 123/125 (wording only, for task-199).

### Merge-order notes

Shares no file with the other B1 tasks except `docs/cli-reference.md` (210, 209 edit other entries) and
`test/docs/name-resolvability.allowlist.ts` (removals only). `src/workflow/schema.ts`'s `approval` line is
mine alone in B1.
