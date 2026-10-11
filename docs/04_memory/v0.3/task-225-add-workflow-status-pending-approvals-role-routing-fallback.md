---
id: "task-225-add-workflow-status-pending-approvals-role-routing-fallback"
type: task
title: "Add `workflow status` with pending approvals, role routing, fallback and \"human needed\" lines"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "cli", "approvals", "notifications"]
ref: "spec-017"
bug: []
depends_on: ["task-216-add-workflow-next-naming-next-step-verb-role"]
tmpl_version: 260703
---

## Description

`workflow status [<ref>]` lists every open instance (active first) with phase progress, frontier, pending approvals and `late` candidates, then the ungated elements (elements sitting in a gate state no open instance carries). Approvals are detected on every carrier (bound, selection, created, typed `set_state` targets) and routed `by_role` / `by_person` to `dna.yaml` members; the fallback step is reported after a reject; the CLI output is the v0.3 notification channel.

## Acceptance Criteria

- (red-first) BDD P4.5 sc. 1–3 (both open workflows listed; `--format json|yaml` valid; `no open workflows` exit 0).
- (red-first) BDD P4.14 sc. 1–3: routed to Morgan by role, to Casey by person, and `routedTo: []` with `routingError: "no approver found for role 'approver' in dna.yaml"` (reported, exit 0); a routed member without the `approver` role raises `W_APPROVAL_ROLE_WITHOUT_AUTHORITY`.
- (red-first) BDD P4.15 sc. 1–2 as amended: after a reject the position moves to the `fallback.step` with `reentered: true`, the reject commit and the declared `set_state`; the state is the reject target (spec-017 §5.2). `dev-loop.done`'s fallback is reported only.
- (red-first) BDD X1.1 sc. 1–2 and X1.2 sc. 1: a "human needed" line names the action (`approve or reject`, or `finalize`), the element id(s) or step key and the routed members; none for automated steps.
- (red-first) The seven approval phases no element carries (§5.1 list) await a finalize record once their other evidence is satisfied (`recordNeeded: true`).
- (characterization) BDD files amended per spec-017 Consequences: P4.14 sc. 1 "recorded" → "reported"; P4.15 sc. 1 fixture keeps reject target = `set_state` (v0.3 note), sc. 2 "has the reject target's state", sc. 3 becomes a `workflow list` validation failure; X1.1 Background "notifications enabled" and sc. 3, X1.2 sc. 2 moved to v0.4 (tagged), X1.2 sc. 3 message aligned to P4.14's — each file with a `doc-versioning` bump.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §5.1–§5.4, §7.4, §8 StatusResult/PendingApproval; ruling R13; dl-033 (the P4.14 routing clause: `by_person` override).
- **Features:** P4.5, P4.14, P4.15, X1.1, X1.2.
- **Notes:** Proposal key: A10.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 3 B4 (2026-10-10, `task-216`'s independent review; W3 B4 follow-ups,
  `bug-ingest-rel-v0.3-w3b4-review-findings-plan`).** `workflow next` (`task-216`) prints a `bug.sync_state` manual
  action without the aggregate rule of `dev-loop.yaml` `done`'s `bug.sync_state(for_each: task.bug)` ("in-review ->
  resolved -> closed (once all ITS tasks are done)"): `task-216`'s decision 5 says "a `sync_state` ignores the
  aggregate 'all tasks of the bug' rule". So `next` can print a sync the dev-loop would not make yet, for a bug that
  another open task also names. This task consumes that output (`NextResult`): apply the rule before reporting or
  acting on a sync step — a bug moves past `in-review` only when every task whose `bug:` list names it is `done` —
  and pin a two-task fixture.

## Execution Notes

### Design (architect, 2026-10-10)

**Inputs read.** `depends_on` Execution Notes (dl-015): task-216 (`workflow next`; its decisions 1 and 5, its
merge-order note "task-225 builds on `buildStep` / `NextResult` / `humanNeededLine`"). The B4 handover at the end
of Implementation Notes (the `sync_state` aggregate rule). Cited specs `approved` (`grep -m1 '^status'` over
spec-001, -003, -005, -006, -008, -017 → `approved` each). `memory.yaml` 2.8: `tech-spec` is `amendable: true`.

**What exists.** No `workflow status` (`grep -c workflowStatus src/core/index.ts` → 0). `buildStep` reports
`awaiting` only for a third party (`grep -n "kind: 'approval'" -r src` → the type declaration alone,
`src/core/workflow-next.ts:100`). The deduction gives no approval a say in a phase's completion (`grep -n approval
src/workflow/deduce.ts` → one comment line), so `dev-loop.review` is complete as soon as the task is
`in-review` (task-216's test "Before the reject the review's state evidence holds (task in-review), so done is
next"). The exit-state computation already lists the gates a phase holds (`PhaseExitState.held`,
`src/core/workflow-exit-state.ts`), which is §5.1's "gate state the phase's actions pass through".

**Shape.**
- `src/workflow/deduce.ts` (the one deduction, §4.3 "A phase with `approval:` also needs what §5.1 says"):
  - each leaf step of a phase with `approval:` gets `approval: { elements, recordNeeded }`. `elements` are its
    **carried elements** that **await**: the targets of its actions (bound, selection, created, run — a
    `sync_state` is never a carrier, §4.2) whose `(type, status)` is a gate the phase holds (`exit.held`).
    `recordNeeded` is `true` when the phase holds no gate (§5.1: "carry no element through a gate");
  - such a phase gains `record` evidence (§5.1: "has its approval recorded by `workflow finalize`"), so it is
    `finalizable` once its other evidence holds;
  - a phase is complete only when its evidence holds **and** no carried element awaits (§5.1 "The approval is
    given when no carried element awaits any more … and the phase's other evidence is satisfied");
  - `Deduction.gated`: every element at `HEAD` sitting in a `gates` state of its type, ascending `(type, id)` —
    the input of `status`'s ungated elements (§5.1);
  - a `<T>.sync_state(for_each: <S>.<field>)` action reports, per target, the **other** elements of `<S>`
    whose field names it (`DeducedAction.source.peers`), for the aggregate rule below.
- `src/core/workflow-next.ts` (`buildStep`, shared by `next` and `status`):
  - `awaiting: { kind: 'approval', … }` when carried elements await, or when `recordNeeded` and the only
    missing evidence is the record (§5.1); otherwise a third party as before (§5.4);
  - routing (§5.1, P4.14, dl-033): `by_role: R` → every member holding `R`, ascending `(name, email)`; none →
    `routedTo: []`, `routingError: "no approver found for role '<R>' in dna.yaml"` (reported, exit 0);
    `by_person: P` → the member whose name or email is `P` (the registry refuses an unknown one at load,
    `E_PHASE_APPROVER_UNKNOWN`);
  - `W_APPROVAL_ROLE_WITHOUT_AUTHORITY` for each routed member without the `approver` role
    (`APPROVER_ROLE`, `src/core/approval-authority.ts`), appended to `diagnostics` in frontier order (§1.3
    "step-attached codes in frontier order"), by `next` and `status` alike;
  - **the aggregate sync rule** (B4 handover): a forward `sync_state` moves a target only once every peer
    has reached the source's state — at or after it in `<S>`'s sequence, or, when the source is in its last
    state (`done`), that last state. So `done`'s sync moves a bug past `in-review` only once every task naming
    it is `done`, and `review`'s only once every such task is `in-review` or later (the two comments of
    `dev-loop.yaml`: "once all ITS tasks are" / "once all ITS tasks are done"). A move back (after a reject) is
    never held. An archived peer does not hold a bug.
- `src/core/workflow-status.ts` (new): `statusWorkflow` (pure), `workflowStatusAtHead`, `renderStatusConsole`;
  `StatusResult` / `PendingApproval` per §8. Registered as `CORE_MODULES` `workflow.workflowStatus`
  (`mutates: false`, optional positional `<ref>`, console renderer). `HEAD`, declared (§1.1, ruling R15).
  - every open instance (or the one `<ref>` selects), active first and marked, with its top-level phase
    progress, its frontier as built `Step`s, its `late`; the pending approvals of the listed instances' frontier
    steps in frontier order; the ungated elements: `Deduction.gated` less the elements a pending approval of
    **any** open instance carries;
  - `no open workflows` (exit 0) when no instance is open and nothing is ungated (§7.4, P4.5 sc. 3);
  - console: one block per instance, then the "human needed" lines (§5.3): one per pending approval
    (`humanNeededLine`, task-216) and one per ungated element, routed to the `approver` role's holders.
- No MCP Resource (`wingfoil://workflows/-/status` is a later task's, as `-/next` is task-239's).

**Spec edits (pending amendments, uncommitted).**
- `spec-017`: §6.1's sentence "The aggregate rule … is not applied in v0.3" is replaced by the rule above
  (the B4 handover's ruling, from `task-216`'s independent review); §5.1 states the routing of an ungated
  element's line and the `W_APPROVAL_ROLE_WITHOUT_AUTHORITY` diagnostic's file/path; §5.1's count is six on
  this repository (the AC's "seven" is the pre-`task-199` figure, §12 "7 before task-199").
- `spec-006` §3: the `workflowStatus` row loses `*(planned)*`.
- spec-008 needs nothing: `workflow status` is already in §11's declared-`HEAD` row and has no option.

**AC classification** (testing directive, T1).

| AC | Class | Why |
|---|---|---|
| 1 — BDD P4.5 sc. 1–3 | red-first | no `workflow status` (`grep -c workflowStatus src/core/index.ts` → 0) |
| 2 — BDD P4.14 sc. 1–3, `W_APPROVAL_ROLE_WITHOUT_AUTHORITY` | red-first | `buildStep` never reports an approval (`src/core/workflow-next.ts:100` is the only `kind: 'approval'`) |
| 3 — BDD P4.15 sc. 1–2 as amended, through `status` | red-first | the `status` view is new. The `next` half (fallback step, `reentered`, reject commit) is task-216's and stays pinned by its test; it is not re-claimed here |
| 4 — BDD X1.1 sc. 1–2, X1.2 sc. 1 | red-first | no step carries an approval, so no "human needed" approval line is ever printed |
| 5 — approvals no element carries await a `finalize` record (`recordNeeded: true`) | red-first | the deduction adds no `record` to an approval phase (`src/workflow/deduce.ts` `leaf`: record only for `awaits` or a checkpoint) — six phases on this repository, not seven |
| 6 — BDD file amendments | characterization | documentation; each file gets a dated `# Revised` header (the BDD files carry no `version:`; precedent `P5.3.1-agent-execute.feature`) |
| handover — the `sync_state` aggregate rule, two-task fixture | red-first | `expectedCommit` applies none (task-216 decision 5) |

### Red (qa, 2026-10-10)

`e0c63ba9`: `test/core/workflow-status.test.ts` (AC 1–5 and the handover) and `test/cli/workflow-status.integration.test.ts`
(BDD P4.5 sc. 1–3, P4.14 sc. 3, exit codes, `--format json|yaml`). In `test/core/workflow-next.test.ts`, one task-216
expectation changes to the §5.1 reading: before the reject, `next` is the review awaiting its approval, not `done`.
The failing run on the tree without the implementation was `npx jest test/core/workflow-status.test.ts
test/core/workflow-next.test.ts test/cli/workflow-status.integration.test.ts`: **37 failed, 20 passed**. The status
suite failed 28 times on "no workflowStatus operation in CORE_MODULES" and once on the registration matcher. The CLI
suite failed 7 times on `unknown command 'status'`, and the changed task-216 case failed on `done` ≠ `review`. The
repo-level AC 5 characterization passes on that tree, as a characterization must.

Two red corrections, each with its reason in the commit body:
- `15e6bc8e`: the §8 field-set test also expects `ungatedRoutedTo`. §5.3 has every ungated line name its routed
  members, but §8 gave an ungated element no routing, and the console renderer reads only the payload.
- `e94c2728`: the CLI fixture submits before it approves. An instance's static start is the type's first state
  (§4.4), and a `memory.approve` from `draft` is undetermined, so the fixture's phase held no gate.

`git log --first-parent --no-merges e0c63ba9..HEAD -- test/core/workflow-status.test.ts
test/cli/workflow-status.integration.test.ts test/core/workflow-next.test.ts` lists only these two commits.

### Green (developer, 2026-10-10/11)

`597e2792` changes these files:
- `src/workflow/deduce.ts`:
  - `DeducedStep.approval` holds the carried elements that await, plus `recordNeeded`.
  - A phase that declares `approval:` and holds no gate gains `record` evidence.
  - A phase is complete only when no carried element awaits.
  - `DeducedStep.reentryFallback`: each reaching re-entry carries the fallback that took it.
  - `Deduction.gated` lists every element that sits in a gate state.
  - `DeducedAction.source.peers` lists, per target, the other source elements naming it.
- `src/core/workflow-next.ts`:
  - approval `awaiting`;
  - `routeApproval`;
  - `approvalDiagnostics` (`W_APPROVAL_ROLE_WITHOUT_AUTHORITY`, also in `next`'s diagnostics);
  - `approvalLine`;
  - a re-entered step reports its re-entering `fallback`;
  - the aggregate `sync_state` rule.
- `src/core/workflow-status.ts` (new): `statusWorkflow`, `workflowStatusAtHead` and `renderStatusConsole`.
- `src/core/index.ts`: `workflowStatus` is registered in `CORE_MODULES` (read-only, positional `<ref>`, console
  renderer), with barrel exports.

`99014084` makes `workflow show` follow the same record rule (`declaredEvidenceKinds` gains `holdsGate`, so §8 keeps
"one rule"; without `memory.yaml` no gate is known, so nothing is added). It also updates the task-198, task-203 and
task-204 fixtures to the §5.1 reading:
- a review stays current while its task is `in-review`;
- an approval on a gateless release needs its record.

`bd0d7245` covers the docs and the rosters:
- `docs/cli-reference.md` gains a `workflow status` entry.
- BDD amendments to P4.14, P4.15, X1.1 and X1.2, each with a dated `# Revised` header and v0.4 scenarios tagged
  `@v0.4`. P4.5 needed no change.
- `production-registry` and `parity` list `workflowStatus` and its test-only Resource.
- The allowlists only lose entries: 10 name-resolvability entries (`wingfoil workflow status` ×4, `StatusResult` ×2,
  `workflowStatus` ×2, `W_APPROVAL_ROLE_WITHOUT_AUTHORITY`, `routedTo`) and 1 enumeration entry (`spec-008 §11`
  surplus `workflow status`). With them removed, `npx jest test/docs/commands-parity.test.ts
  test/docs/name-resolvability.test.ts test/docs/enumeration-parity.allowlist.test.ts` gives 18 passed.

### Refactor (developer, 2026-10-11)

`3cafe9d6`:
- `by_person` routing is a single `find`.
- The peer check ranks states once.
- `test/core/workflow-status-render.test.ts` covers the renderer's arms and the routing arms that no fixture
  reaches. A `by_person` naming nobody is refused at load (`E_PHASE_APPROVER_UNKNOWN`).

Main has not moved since the pre-batch commit (`git log 30b268a3..main` → empty), so no main-sync was needed.

| Command | Result |
|---|---|
| `npm run test:coverage -- --maxWorkers=2` (at `3cafe9d6`, gate slot free, load 4.5) | 350 suites, **6524 passed**. All files **99.3 / 97.01 / 97.63 / 99.7**. Main's W3 B4 gate log: 99.29 / 97.04 / 97.74 / 99.69. Branch coverage is 0.03 lower: the leftover arms are defensive `??` in `workflow-status.ts` (95.45) and `workflow-next.ts` (97.18). `deduce.ts` is 100 / 99.79 |
| `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` | exit 0 each |
| `node scripts/check-governance.cjs --base 30b268a3` | 1 `wf()` commit checked, 0 findings |
| `node dist/cli.js workflow status` on this repository | exit 0. 8 open instances, the decision-log-ingest plan marked active; 0 pending approvals; **119 ungated elements** (bugs `open`/`triaged`/`planned` and the others, routed to the approver) |

BDD coverage. P4.5 sc. 1–3, P4.14 sc. 1–3, P4.15 sc. 1–2 (sc. 3 is task-194's `E_PHASE_FALLBACK_STEP_UNKNOWN` test,
`test/core/workflow-diagnostics.test.ts`), X1.1 sc. 1–2 and X1.2 sc. 1 are pinned by the two status suites, which cite
each scenario.

### Review (reviewer self-check, 2026-10-11)

| AC | Status | Evidence |
|---|---|---|
| 1 P4.5 | met | "AC 1" blocks: both instances, active first and marked, 1 pending approval, ungated listed. The CLI suite covers `--format json` and `yaml` (parsed with `JSON.parse` / `js-yaml`) and `no open workflows` at exit 0 |
| 2 P4.14 | met | sc. 1 routes to Morgan, and the test asserts `git rev-parse HEAD` is the same before and after and `git status --porcelain` is empty. sc. 2 routes to Casey, raises `W_APPROVAL_ROLE_WITHOUT_AUTHORITY` at `team.members[1].roles`, and `next` reports the same approval. sc. 3 gives `routedTo: []` and the routing error at exit 0 |
| 3 P4.15 | met | sc. 1: red with `reentered`, the reject sha and `fallback: { step: red, setState: in-progress }`; the scope status is the reject target. sc. 2: `setState: null`. `done`'s fallback is reported, `reentered: false` |
| 4 X1.1/X1.2 | met | the line names the action, `spec-1` and Casey; no line for `red`; routed to Morgan, not Casey |
| 5 finalize record | met | `planning.commit-backlog`: `['state','record']`, `recordNeeded: true` once the state holds, complete after the record. On this repository the six phases are pinned by the characterization test. The AC says "seven", which is the count before task-199 (§12) |
| 6 BDD amendments | met | `git show bd0d7245 --stat -- docs/02_requirements` → 4 files, each with a `# Revised 2026-10-10 (task-225 …)` header |
| handover | met | the two-task fixture: review holds bug-1 until task-2 is `in-review`; done holds it until task-2 is `done`; a deprecated task does not hold it; a move back is never held |

Same-class sweep in touched files:
- `show`'s evidence kinds follow the new `record` rule (`99014084`).
- A `fallback` on a re-entered step is reported only through `buildStep` (`grep -n "reentryFallback" src/core/*.ts` →
  `workflow-next.ts` only).

### Pending amendments (approver)

Uncommitted in the worktree; the gates ran with them.
- `spec-017-workflow-commands-and-state-deduction`: `--reason "task-225 implements workflow status and approvals. §6.1 now applies dev-loop's aggregate rule to a forward sync_state, as the W3 B4 review of task-216 asked: a bug passes in-review only once every task naming it is done, and a move back is never held. §5.1 gives W_APPROVAL_ROLE_WITHOUT_AUTHORITY its file and path. §5.2 says a re-entered step reports the fallback that re-entered it. §5.3 and §8 route an ungated element's line to the approver role's holders, carried in StatusResult.ungatedRoutedTo. No command, deduction rule or diagnostic code is added."` (after task-226's spec-017 amendment, in merge order)
- `spec-006-core-domain-api`: `--reason "task-225 registers workflowStatus in CORE_MODULES, so its §3 row loses the planned marker. Its MCP Resource stays a later task's; no other row changed."`

### Decisions for the approver

1. **An approval holds its phase.** A phase with `approval:` is complete only once no carried element awaits
   (§4.3/§5.1, read literally). `dev-loop.review` therefore stays current while the task is `in-review`, where before
   `done` showed as next. Three tests of task-198, task-203 and task-204 changed with this reading.
2. **"Carries no element through a gate" is decided by the exit-state computation's `held` list.** On this repository
   that gives the six phases of §5.1. A phase whose static start leaves the gate undetermined (approve from `draft`)
   counts as holding none and asks for a record.
3. **A re-entered step's `fallback`** is the fallback that re-entered it. This is how `red` reports `set_state:
   in-progress` (P4.15). On any other step it is the phase's own fallback.
4. **The ungated elements are routed to the `approver` role's holders**, carried in a new
   `StatusResult.ungatedRoutedTo` field (§8 amended). With `<ref>`, `status` still lists every ungated element. Carriage
   is computed over all open instances.
5. **The aggregate sync rule is applied to every forward `sync_state` move**, at the review sync and at the done sync,
   following dev-loop.yaml's two comments. The handover named only the "past in-review" case. Archived peers never
   hold a bug back.
6. **`by_person` naming nobody** returns `routingError: "no member '<P>' found in dna.yaml"`. This cannot happen on a
   loaded registry.
7. **`message: no open workflows`** is set only when no instance is open **and** nothing is ungated (§7.4, literally).
   Otherwise the console prints `open workflows: none`.

### Candidate findings (not filed)

- **119 ungated elements on this repository** (`node dist/cli.js workflow status`), most of them bugs in `open` /
  `triaged` / `planned`, the bug machine's gates. The "human needed" list is too long to act on as a notification. A
  filter (by type, or by `release:`) or a summary line may be needed. This is a v0.4 notification-design input.
- **The static start state** of an instance is the type's first state (§4.4). A startable workflow whose first phase
  approves an element already past `draft` gets an undetermined exit state and a spurious `record` requirement. The
  CLI fixture hit this (`e94c2728`). Seeding the start from the bound element's status at `HEAD` would avoid it.
- **The red sync after a reject**: when the bug is `in-review` and another task naming it is still `in-review`, the
  rule moves the bug back to `in-progress`. This is consistent with dl-061 A.1, but the other task's review then shows
  a bug not in review. It needs a ruling on whether a move back should also wait.

### Merge-order notes

- **task-226** (`workflow finalize`, merges before this task) exports `readNextInputs`, `unresolvedRef`,
  `emptyFrontierMessage` and `stepLines` from `src/core/workflow-next.ts`, and changes the "waiting for" line. Expect
  conflicts in `workflow-next.ts`: `humanNeededLine` is refactored here into `approvalLine` plus `describeMembers`.
  `workflow-status.ts` duplicates the `NextInputs` assembly that 226's `readNextInputs` provides. The `statusWorkflow`
  `<ref>` errors equal its `unresolvedRef`, which can be reused at the gate.
- task-226's finalize of the six approval phases depends on this task's `record` rule in `deduce.ts` (AC 5).
- `src/core/index.ts` (`CORE_MODULES` workflow block, barrel exports), `docs/cli-reference.md` (Workflow section),
  `test/core/parity.test.ts`, `production-registry.test.ts` and the two allowlists are shared with task-217, task-226,
  task-227 and task-235: adjacent-line conflicts.
- spec-017 and spec-006: the pending amendments are recorded after task-226's (merge order 226 → 227 → 225).
- task-235 consumes `NextResult.next`: an approval step now carries `awaiting.kind: 'approval'`, and a review step
  stays the next step while its task is `in-review`.

### Review fixes (independent review: approve with fixes, 2026-10-11)

- **Red** `7aab0f4d`: failing tests for F1 and F2 in `test/core/workflow-status.test.ts`. The fixture bug machine
  gains `triaged` as both a gate and a `waiting` state, as this repository's does. The run before the fix,
  `npx jest test/core/workflow-status.test.ts`, gave 2 failed, 29 passed.
- **Green** `a17d4896`:
  - **F1**: `Deduction.gated` leaves out a gate state that is also `waiting`. Its forward edge is verb-less (dl-123),
    so `memory approve` refuses it, and no "approve or reject" line may name it.
  - **F2**: `no open workflows` is set whenever no instance is open (BDD P4.5 sc. 3 says only that), and the ungated
    elements are listed after it. The renderer's `open workflows: none` arm became unreachable and is removed.
  - **F3**: `docs/user-guide.md` §7 has one sentence on `workflow status`.
  - **F5**: `declaredEvidenceKinds` takes `holdsGate` as a required argument; its default arm was never used.
- **F5** `b2b5790e`: the functions drop in `src/core/index.ts` was three compiled re-export getters that no test
  reached through the barrel: `statusWorkflow`, `workflowStatusAtHead` and `W_APPROVAL_ROLE_WITHOUT_AUTHORITY`.
  `workflowStatusFn` itself was already hit 31 times in-process (a targeted coverage run with
  `--coverageReporters=json` over `test/core/workflow-status.test.ts`). A test now uses the three through
  `src/core`.
- **Repository re-measured** at `a17d4896`: `node dist/cli.js workflow status --format json` gives 8 open
  instances, 0 pending approvals and **40 ungated elements** (was 119). They are 21 decision-log `in-discussion`,
  15 bug `open`, 2 service `pending`, 1 task `in-review` and 1 change-proposal `in-analysis`.
- **`tests.unchanged(since: red)`**:
  `git log --first-parent --no-merges --format='%h %s' e0c63ba9..HEAD -- test/core/workflow-status.test.ts
  test/cli/workflow-status.integration.test.ts test/core/workflow-next.test.ts` prints three commits:
  - `7aab0f4d` (the review fixes' own red);
  - `e94c2728` red correction: the CLI fixture submits before it approves;
  - `15e6bc8e` red correction: StatusResult also carries ungatedRoutedTo.

  Read literally, the check therefore fails. The two red corrections were made before green. Each returns to a red
  that is correct under the spec, and its commit body gives the reason.
- AC 5's text still says "seven"; six is correct (spec-017 §5.1, §12). The AC text is left for the coordinator to
  raise with the approver.

| Command | Result |
|---|---|
| `npm run test:coverage -- --maxWorkers=2` (at `b2b5790e`, gate slot free, load 2.4) | 350 suites, **6528 passed**. All files **99.3 / 97.06 / 97.8 / 99.7**, against main's 99.29 / 97.04 / 97.74 / 99.69. `src/core/index.ts` functions 89.72 (main 89.13) |
| `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` | exit 0 each |

Final `--reason` texts, which supersede the ones under "Pending amendments" above:
- `spec-017`: "task-225 implements workflow status and approvals. §6.1 now applies dev-loop's aggregate rule to a forward sync_state, as the W3 B4 review of task-216 asked: a bug passes in-review only once every task naming it is done, and a move back is never held. §5.1 gives W_APPROVAL_ROLE_WITHOUT_AUTHORITY its file and path, and leaves a gate state that is also waiting out of the ungated elements, since no approver can act on it. §5.2 says a re-entered step reports the fallback that re-entered it. §5.3 and §8 route an ungated element's line to the approver role's holders, carried in StatusResult.ungatedRoutedTo. §7.4 prints no open workflows whenever no instance is open, as BDD P4.5 sc. 3 states it. No command, deduction rule or diagnostic code is added."
- `spec-006`: unchanged.

### Retrospective

- Three session restarts and one machine overload interrupted full-suite runs (exit 137, orphaned processes).
  Worktree state always survived (`git status` at each resume). The dl-170 gate rule (one heavy gate, load ≤ 14)
  ended it: the final coverage ran in one go at load 4.5.
- A red fixture encoded a workflow the static exit-state rule cannot read (`e94c2728`). Writing fixtures from a
  repository workflow's shape (submit then approve) would have avoided the correction.
