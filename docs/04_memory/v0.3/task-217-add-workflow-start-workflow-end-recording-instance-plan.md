---
id: "task-217-add-workflow-start-workflow-end-recording-instance-plan"
type: task
title: "Add `workflow start` and `workflow end`, recording each instance as a `plan` element"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "cli", "memory"]
ref: "spec-017"
bug: []
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-128-allocate-element-ids-highest-number-ref-across-folder", "task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-203-read-instance-history-walk-step-linkage-created-elements"]
tmpl_version: 260703
---

## Description

`start <name> [--element <type>:<id>] [--title] [--set phase=|scope=]` refuses a non-startable workflow, resolves the element (declared, inherited from the active instance, context, or self-creating), derives the plan tokens (phase = element id else `1`, with a `-<n>` collision suffix checked on every ref per `dl-101`; scope = workflow name) and writes `wf(plan): add` then `wf(plan): submit` through the Memory verbs. `end [<ref>]` refuses an incomplete or draft instance and writes `wf(plan): finalize <id> [active → done]`.

## Acceptance Criteria

- (red-first) BDD P4.2 sc. 1–3 with the positional `<name>`: the instance becomes active and its first step is printed; a second start makes the new one active; `cannot start a sub workflow directly: dev-loop` exit 1, nothing written.
- (red-first) BDD P4.3 sc. 1–3 with complete instances: `end` closes it and reports the now-active one; `no active workflow to end` exit 1; a new scenario: `workflow '<name>' is not complete: current step <key>` exit 1 with the `memory deprecate` hint.
- (red-first) Each `start` commit touches only the plan file (`verifyCommittedScope`); a failing second commit leaves the plan `draft` and names `wingfoil memory submit <id>`; a project without a `plan` type is refused with spec-017 §10's message.
- (red-first) Element errors of §10: `needs a <type> element`, `element not found: <type>:<id>`, `plan id already exists: <id>` (`CONFLICT`) for a colliding `--set phase=`.
- (characterization) `.wingfoil/memory.yaml` / the plan template gain the optional `parent` field; `src/storage/templates.ts` declares the `plan` type in `init`'s scaffold (spec-017 Consequences, `templates.ts:171`); a fresh `init` can `workflow start` without edits.
- (characterization) `spec-008` §1/§7 carry the `workflow` grammar of spec-017 §7 and `--element`; REQ-STATE-03's `--name` wording and BDD P4.2/P4.3 `--name <w>` become the positional (spec-017 Consequences), with `doc-versioning` bumps.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §3.1, §3.4 (element resolution), §3.5, §7.1, §7.2, §10; ruling R18; dl-109 K2 (a)→(b); REQ-STATE-03.
- **Features:** P4.2, P4.3.
- **Notes:** Proposal key: A12. the grammar lines for `memory add --workflow/--step` are task-227's; `agent execute --step` is the agent domain's.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-217-add-workflow-start-workflow-end-recording-instance-plan`, worktree
`../.wf2-wt/task-217`, cut from `main` at `30b268a3` (W3 B5); start `8a1e0945`. The session was stopped four
times by the machine and the coordinator; each resume re-checked `git status` / `git log` and re-ran the
interrupted run (the first `npm test` was killed, exit 137, and re-run).

### design (architect)

**`depends_on` read (dl-015).** `task-126`, `task-128`, `task-129` and `task-203` are `done`
(`awk '/^status:/{print $2;exit}' docs/04_memory/v0.3/task-{126,128,129,203}-*.md`). What they hand over:
`task-126` declares `wf(plan): finalize` (`spec-008` §2's `finalize` row names "`workflow end` for a plan")
and says the emitters are this task's; `task-128` allocates ids over every ref (`dl-101`), which `start`'s
collision check reuses (`sequenceCandidatePaths`); `task-129` refuses a surplus operand in the registrar, so
`start <name> extra` exits 2 with no code here; `task-203` reads the start commit, linkage and records from
history, which `start`'s output (the first step) and `end`'s completeness check consume through
`deduceWorkflowState`. `grep -rn "task-217" docs/04_memory docs/05_plans` names no other handover.

**Specs.** `spec-017`, `spec-008`, `spec-006`, `spec-005`, `spec-001`, `spec-010`, `spec-011` are `approved`
(`awk '/^status:/'` on each). `spec-017` §3.1–§3.5, §7.1, §7.2, §8, §10, §11 define the two commands. Three
cases §10 leaves open were decided here and written into `spec-017` §10 as a pending amendment (decisions
D1–D3 below); `spec-008` §1/§2/§7/§11/§12 and `spec-006` §3 follow the new commands (pending amendments).

**Design.** `src/core/workflow-start-end.ts`. Both commands decide from one `readDeductionSnapshotAtHead`.
`start` writes through the registry's own `memoryAdd` and `memorySubmit` (handed in by `CORE_MODULES`, no
copy of their checks), so its two commits are exactly what `wingfoil memory add` / `submit` write and carry
their scope post-conditions (`committedScopeError`, `verifyCommittedScope`). `memoryAdd` gains a core-only
`fields` param for the plan's `element` (not a token; the CLI and MCP never populate it). `end` uses the
transition preamble (`beginMemoryTransition`) with a new resolution `finalize` — the forward `waiting` edge,
`resolveWaitingTarget` in `src/memory/state-machine.ts` — and `commitMemoryTransition`. The init scaffold
declares `plan` (`draft → active → done`, `waiting: [active]`, path `docs/memory/plan/{scope}/{id}.md`,
template with `workflow`/`phase`/`element`/`parent`).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — BDD P4.2 sc. 1–3 | red-first | no `workflow start` command exists (`node dist/cli.js workflow start x` → exit 2, unknown command) |
| 2 — BDD P4.3 sc. 1–3 + incomplete | red-first | no `workflow end` |
| 3 — commit scope, refused second commit, no `plan` type | red-first | same |
| 4 — element errors, `--set phase=` CONFLICT | red-first | same |
| 5 — `parent` field; init declares `plan`; fresh init can start | **red-first** (corrected from characterization) | the template had no `parent:` and `templates.ts` declared no `plan` (`grep -n plan src/storage/templates.ts` → only a delivery phase name), so a fresh project could not start a workflow: a genuine red |
| 6 — spec-008 grammar, REQ-STATE-03 / BDD positional, doc-versioning | documentation | no behaviour; pending amendments + committed doc edits |

### red (qa)

`cb77570f`: `test/core/workflow-start-end.test.ts` (27 cases), `test/cli/workflow-start-end.integration.test.ts`
(11, through `dist/`), `test/core/plan-parent-field.test.ts` (2). `npx jest` on the three files →
**3 suites failed, 39 of 39 tests failed**, each because `workflowStart`/`workflowEnd` were not registered
(core: thrown "is not registered"; CLI: exit 2 `unknown command`) or the template lacked `parent:`. One
correction before green, amended into the red commit before any later commit existed (nothing pushed): the
core test looked operations up by `entry.moduleName`, which `EnumeratedOperation` does not have
(`npx tsc --noEmit` → TS2339); it is `entry.module.name`. The lookup throws "not registered" either way, so
the red is unchanged.

### green (developer)

`9d913efd`. `src/core/workflow-start-end.ts` (`workflowStart`, `workflowEnd`, the console renderers) wired in
`CORE_MODULES` as `workflow.workflowStart` / `workflow.workflowEnd` (`mutates: true`); `start` writes through
the registry's `memoryAdd` / `memorySubmit` (`MemoryAddParams.fields`, core-only, carries `element`);
`resolveWaitingTarget` (`src/memory/state-machine.ts`) and the `finalize` resolution in
`src/core/memory-transition.ts`; `idOccupied` (`src/memory/add.ts`, the `dl-101` baselines);
`src/storage/templates.ts` declares `plan` in the init scaffold; `.wingfoil/memory.yaml` 2.8 → 2.9 (the
`parent` annotation) and `.wingfoil/memory/templates/plan.md` gains `parent: ""` (`tmpl_version` 261010).
The three red files → 39/39 (`npx jest test/core/workflow-start-end.test.ts test/core/plan-parent-field.test.ts
test/cli/workflow-start-end.integration.test.ts`).

### refactor (developer)

- `6f3424d3` docs: `docs/cli-reference.md` (one entry per command, the `--dry-run` list, the git side effects:
  `start` writes two commits), `docs/user-guide.md` §7, BDD P4.2/P4.3 with the positional and a new P4.3
  scenario (incomplete instance), REQ-STATE-03's `<ref>`, journey 0a step 3 and US-0A-16 without `--name`
  (`05_journeys.md` 1.5 → 1.6, `00_index.md` row re-synced); the dry-run table rows (`workflowStart`
  compared with its first commit, `commits: 2`), and the two `task-217` enumeration-parity allowlist
  entries removed as spent.
- `0bba8b64`, `8715629b`: the rosters that pin the mutating set (`production-registry`, REQ-SYS-05 `parity`,
  REQ-SEC-05 `read-only-agent-channel`), `usage-before-identity` (`workflow end` requires no operand, so it is
  exempted from "throws at least one usage error", with the reason), journey 0a's "known gap" now starts
  `sw-life-cycle`, `e2e-smoke`'s fresh-init shape test names `plan`'s own machine, `templates.test.ts` pins
  the scaffolded `plan` type. The first full run found these 9 failures in 6 suites (all rosters/pins of the
  surface this task changes), nothing else.
- `ea16d2f0`, `097e2220`: `test/core/workflow-start-end-arms.test.ts` for the arms the acceptance suite does
  not reach (renderers, a `{n}` plan id, a submit refused by result, abandoned / not-loaded instances,
  `resolveWaitingTarget`, no identity, no `.wingfoil/`), and two impossible `?? ''` branches removed.
  `workflow-start-end.ts` → 100 % lines, 91 % branches (targeted run).
- red's tests unchanged since red: `git log --first-parent --no-merges --format=%h cb77570f..HEAD --
  <the three red files>` → empty.

Gates, at `097e2220` (interim gate rule dl-170: one heavy gate at a time, `--maxWorkers=2`, load ≤ 14):

| Command | Result |
|---|---|
| `npm run test:coverage -- --maxWorkers=2` | exit 0; 351 suites / 6548 tests; 99.22 / 96.92 / 97.67 / 99.69 (the W3 B4 gate log `gate-w3b4-cov.log` read 99.29 / 97.04 / 97.74 / 99.69, so −0.07 / −0.12 / −0.07 / 0; see the report) |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `node scripts/check-governance.cjs --base 30b268a3` | 0 findings (1 `wf()` commit, 7 others) |

Main was not merged into the branch (the coordinator merges at the gate, w2-b2 notes); `git log 30b268a3..main`
was not consulted for this run.

### review (reviewer, self-review)

- AC 1: `workflow-start-end.test.ts` "BDD P4.2" (sc. 1–3, unknown name) + CLI suite (exit 0 / 1, console).
- AC 2: "BDD P4.3" (sc. 1–3, `<ref>` by name and by id, not open / unknown, incomplete with hint) + CLI.
- AC 3: "commit scope…" (two commits, each `['docs/plans/checklist/checklist-1-plan.md']`; a `commit-msg`
  hook refusing the submit leaves `draft` and the message; no `plan` type).
- AC 4: "element errors and collisions" (needs, not found at `HEAD`, working-tree-only element, wrong type,
  `--element` on an element-less workflow, `--set phase=` CONFLICT).
- AC 5: `plan-parent-field.test.ts`; CLI "AC 5" (fresh `init --template Kanban` → `workflow start
  sw-life-cycle` exit 0, clean tree); `templates.test.ts` plan machine.
- AC 6: `spec-008` §1/§2/§7/§11/§12 (pending amendment); REQ-STATE-03 and BDD P4.2/P4.3 committed;
  doc-versioning: SARD, BDD and story-map files declare no version; `05_journeys.md` bumped once.
- Same-class sweep in touched files: `grep -rn "start --name\|end --name" docs/01_vision docs/02_requirements
  docs/*.md` → none left.

#### Pending amendments (approver)

Uncommitted in the worktree (`git status --short docs/04_memory/design`):
- `spec-017-workflow-commands-and-state-deduction` — reason: "task-217 implements workflow start and workflow end. §10 gains the three refusals the implementation needed: an --element of another type reads as the element being absent, --element on a workflow that declares no element is refused, and a --set name other than phase or scope is a usage error. End's refusal of an incomplete instance names why an empty frontier is not complete and carries the memory deprecate hint. No deduction rule changed."
- `spec-008-cli-grammar` — reason: "task-217 ships workflow start and workflow end. §1 names the Workflow pillar's verbs and their positional ref, §7 gains workflow start --element, §12 its three options and two refusals, §2's dry-run list both commands (start plans its first commit only), §11's committed-HEAD row both. No exit code changes."
- `spec-006-core-domain-api` — reason: "task-217 registers workflowStart and workflowEnd in CORE_MODULES, so §3's two rows lose their planned marker. Their MCP Tools stay v0.4; no other row changed."

#### Decisions for the approver

- D1 `--element` naming another type than the workflow's `element:` → the `needs a <type> element` message
  (VALIDATION, exit 1).
- D2 `--element` on a workflow that declares no element → refused, VALIDATION exit 1 (it is not taken as a
  context: §3.5's context comes from the active instance only).
- D3 `--set` names other than `phase` / `scope` → usage error, exit 2 (`workflow` is never overridable).
- D4 `end` on an open instance with an empty frontier that is not complete (abandoned, workflow not loaded)
  → the same CONFLICT, with the reason in place of the step key, and the deprecate hint.
- D5 `end <ref>` naming a plan id that is not open (e.g. `done`) → `workflow is not open: <ref>` (not
  `unknown workflow`), unlike `workflow next`, which says `unknown workflow` for it.
- D6 AC 5 reclassified red-first (a fresh `init` could not start a workflow: genuine red).
- D7 init scaffold's `plan`: path `docs/memory/plan/{scope}/{id}.md`, required `[id, type, title, status,
  workflow, phase]`, machine `draft → active → done`, `waiting: [active]`, amendable.

### Retrospective

- The session was stopped four times (machine shutdown, coordinator restarts, a usage limit); two full runs
  were killed (exit 137) at load 150+. Evidence: `uptime` 161 at 22:56, 2026-10-10. Proposal: the dl-170
  interim rule (one heavy gate at a time) from the start of a batch.
- A test-only type error (`entry.moduleName`) surfaced only at `tsc`, after the red commit: run
  `npx tsc --noEmit` before the red commit.
