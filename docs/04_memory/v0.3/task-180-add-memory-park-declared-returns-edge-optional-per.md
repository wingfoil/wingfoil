---
id: "task-180-add-memory-park-declared-returns-edge-optional-per"
type: task
title: "Add `memory park`, a declared `returns` edge and optional per-state WIP limits"
status: done
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "core", "memory", "workflow-support"]
ref: "dl-110"
bug: ["bug-214"]
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-132-read-approver-identity-once-use-authority-check-approver"]
tmpl_version: 260703
---

## Description

No verb steps a started task back to the backlog, and no state can declare a WIP limit. Ratified: `returns: { in-progress: backlog }` next to `gates`/`waiting`, taken by `memory park <id> --reason` (`wf(<type>): park <id> [in-progress → backlog]`), and `limits: { in-progress: N }` enforced by the verb that enters the state. P2 (dev-loop worktree/branch/bug sync on park) is `dev-loop.yaml`'s, owned by the task implementing `dl-134`'s dev-loop rewrite (domain A).

## Acceptance Criteria

- (red-first) `memory park` on an `in-progress` task writes one commit with the subject above and a `Reason:`; on a state with no `returns` edge it exits 1; missing reason exits 2.
- (red-first) with `limits: {in-progress: 1}` and one task in progress, moving a second task into `in-progress` (by any verb, including A's `start` emitter through the shared primitive) exits 1 and names the holder.
- (red-first) the schema refuses a `returns` target that is not an earlier state of the sequence.
- (characterization) `.wingfoil/memory.yaml` `task` declares `returns`; the Kanban template's WIP sentence (`src/storage/templates.ts`, `KANBAN`) is made true with a declared limit or reworded.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-110 P1 (a); P3 (a), Actions 1 and 3; spec-001 (`returns`, `limits`); spec-008.
- **Features:** P1.13, P4.13.
- **Notes:** Proposal key: C26.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-180-add-memory-park-declared-returns-edge-optional-per`, worktree `../.wf2-wt/task-180`,
cut from `main` at `0cf8b131`. Start `2cbb1844`; `bug-214` `[planned → in-progress]` `aa92daea`.

### design (architect)

**Upstream notes read (`dl-015`).** `task-126` (`done`) already declared `park` in the closed `wf()`
operation list (`MEMORY_OPERATIONS`, `src/memory/audit.ts`) with the bracket `[in-progress → backlog]`
in `spec-008` §2, so `memory history` reads a park commit back today and nothing in the reader changes
here. `task-132` (`done`) made `beginMemoryTransition` the one preamble of every state-moving verb and
added a structural test (`test/core/memory-transition-preamble.test.ts`) that every registered
`memory` mutating op except `memoryAdd` goes through it; `memoryPark` joins by being registered
(`task-132` notes: "`park` joins by being registered").

**Decision and specs.** `dl-110` is `ready`; its approve `6d12740d` takes P1 (a) (declared `returns`
edge + `memory park`), P2 as stated (owned by the `dev-loop.yaml` rewrite, `dl-134`, not this task) and
P3 (a) (optional per-state `limits`, enforced by the verb that enters the state). `spec-001`,
`spec-006`, `spec-008` and `spec-010` are `approved`
(`awk '/^status:/{print $2;exit}'` on each). Their edits are pending amendments (below).

**Design.**
- **Schema (`src/memory/schema.ts`, `StateMachine`).** Two optional keys next to `gates`/`waiting`:
  `returns: { <state>: <earlier state> }` and `limits: { <state>: <positive integer> }`. Refusals in
  the existing `.superRefine()`: a `returns`/`limits` key that is not a `sequence` member or is
  `deprecated`; a `returns` target that is not an earlier state of `sequence` (later, the same state,
  off-chain, or `deprecated`); a limit that is not a positive integer (Zod). Both keys sit inside the
  machine, so `defaults.states` can carry them too and a limit counts per type.
- **Engine (`src/memory/state-machine.ts`).** `TransitionOp` gains `park`; `resolveTransitionTarget`
  returns `returns[<from>]` or throws the usual `E_INVALID_TRANSITION` (the `dl-032` contract message,
  whose `<to>` comes from the unchanged `contractTarget`; tests, docs and specs pin only the
  `illegal transition <from> -> ` prefix, the type and the reason, since `task-181`/`bug-165` changes
  how `<to>` is computed — coordinator note, 2026-10-05). `isMachineEdge` accepts a `returns` edge, so a park bracket inside a `sync` chain is not
  read as an illegal hop. `contractTarget` itself is not edited (`task-181` edits it next).
- **WIP limit, one shared primitive.** `requireWipSlot` (`src/core/memory-transition.ts`) counts the
  documents of the same type that the decision commit holds in the target state, excluding the moving
  element, and refuses with `CONFLICT` (exit 1) naming every holder in path order when the count has
  reached the limit. It is called from `prepareMemoryTransitionAtRev`, the step every transition goes
  through (`submit`, `approve`, `reject`, `park`, the `supersedes:` trigger, and a future workflow
  `start` emitter that prepares its transition there), whenever the target differs from the current
  state (an `amend` self-loop never enters a state). `memory add` calls it too for the initial state,
  since `add` is the verb that enters that state.
- **`memory park <id> --reason <text>`** (`memoryParkFn`, `src/core/index.ts`). Order as `spec-006` §7:
  `<id>`, then `requireReason` (exit 2), then `beginMemoryTransition(root, id, 'park')`, then a
  `status`-only edit committed by `commitMemoryTransition` with
  `wf(<type>): park <id> [<from> → <to>]` and a `Reason:` block. No `Approver:` line and no authority
  check: a park is a scheduling decision, not an approval (`dl-110` Rationale: "returning is not
  rejecting"; it names no approver). **Approver to confirm.**
- **`bug-214`.** `resolveAddType` also returns the head of the type's machine (`resolveStateMachine`
  on the committed `memory.yaml`), and `renderAddDocument` writes it instead of the literal `draft`.
- **Configuration.** `.wingfoil/memory.yaml` `task` declares `returns: { in-progress: backlog }`;
  `version` 2.4 → 2.5 (first edit since `main`). **No `limits` declared here** — the AC asks for none,
  and the dev-loop batches run 7–8 tasks in parallel, so any value is the approver's to choose.
- **Kanban.** The scaffold's machine (`defaults`: `draft → pending → approved`) has no in-progress
  state, and `templates.ts` keeps a starter project off any lifecycle ("a product decision beyond this
  scaffold"), so the sentence is **reworded** rather than made true by a declared limit: Kanban's
  description and cadence say limits are declared per state with `limits:`, and the commented `bug`
  example of the scaffold (`dl-072` S1) gains `returns:` and `limits:` lines, which uncommented load
  through the real schema (`test/storage/templates.test.ts`).

**AC classification (T1).**

| AC | Class | Why |
|----|-------|-----|
| AC1 `memory park` commit; no `returns` edge → 1; missing reason → 2 | red-first | no `memoryPark` op is registered (`grep -n "fn: memory" src/core/index.ts` → add, history, search, submit, approve, reject, deprecate, amend) |
| AC2 `limits` refuses a second entry into the state, by any verb, naming the holder | red-first | no schema key, no check |
| AC3 schema refuses a `returns` target that is not an earlier state | red-first | `StateMachine` has no `returns` key; `.passthrough()` accepts anything today |
| AC4 `memory.yaml` `task` declares `returns`; Kanban sentence | **red-first** (corrected from characterization) | the declaration and the reworded sentence do not exist yet, so the pinning tests fail before the edit; nothing here is existing behaviour |
| `bug-214` add writes the head of the machine | red-first | `src/memory/add.ts` writes `'draft'` literally (`grep -n "'draft'" src/memory/add.ts`) |

### red (developer)

`822afe6d`. New suites `test/memory/state-machine-returns-limits.test.ts` (AC3, the engine's `park`
edge, AC4's `memory.yaml` declaration), `test/core/memory-park.test.ts` (AC1, through the registered
`CORE_MODULES` op, plus `memory history` reading the commit back), `test/core/memory-wip-limits.test.ts`
(AC2: `submit`, `reject`, `park` and `add` into a full state, several holders, the shared primitive
called directly, a slot freed by a park), `test/core/memory-add-initial-state.test.ts` (`bug-214`), and
two cases in `test/storage/templates.test.ts` (AC4: the scaffold example's `returns`/`limits`, the
Kanban wording).
`npx jest test/memory/state-machine-returns-limits.test.ts test/core/memory-park.test.ts test/core/memory-wip-limits.test.ts test/core/memory-add-initial-state.test.ts test/storage/templates.test.ts`
→ `Tests: 39 failed, 57 passed, 96 total`, 5 suites failed. Every new AC test failed on the missing
behaviour (no `memoryPark` op; `returns`/`limits` accepted silently by `.passthrough()`; `status: draft`
where the machine starts at `new`). The ones that passed are pins, not reds: the existing
`templates.test.ts` cases, "below the limit the transition goes through", the built-in default's head
`draft`, and `park` refused from states with no edge (the old engine refused the unknown op too).

### green (developer)

`050cce7c`.
- `src/memory/schema.ts`: `returns` and `limits` on `StateMachine`, with the refusals of the design
  above; the type-level refinement names the owning type for their keys too.
- `src/memory/state-machine.ts`: `TransitionOp` gains `park`; `resolveTransitionTarget`'s `park` case;
  `isMachineEdge` accepts a `returns` edge. `contractTarget` untouched (`git diff 0cf8b131 -- src/memory/state-machine.ts | grep -c contractTarget` → 0).
- `src/core/memory-transition.ts`: `requireWipSlot`, called by `prepareMemoryTransitionAtRev` whenever
  `to !== from`.
- `src/core/index.ts`: `memoryParkFn` + its `CORE_MODULES` entry (the registrar would register it as
  a Tool `memory.park`, as the parity harness shows, but the production server serves no Tools:
  `tools/list` stays `[]`, `spec-014` §3, Tools v0.4 — corrected at the independent review, F6); `memory add` writes `initialState` and checks its slot.
  `src/core/memory-add-type.ts` returns `initialState` and the committed `memoryYaml`;
  `src/memory/add.ts` `renderAddDocument` takes `status`.
- `src/storage/templates.ts`: Kanban description and cadence reworded; the scaffold's commented `bug`
  example gains `returns: { in-progress: open }` and `limits: { in-progress: 3 }`.
- `.wingfoil/memory.yaml` 2.5: `task` `returns: { in-progress: backlog }`; header lists `park`.
- `docs/cli-reference.md`: a `memory park` entry (commit, WIP limits, errors); `memory add`'s summary
  and an Unreleased note for `bug-214`; `park` in the verb lists.
- Same-class test updates: the exhaustive per-state edge tables of `test/core/bug-decline-edges.test.ts`
  and `test/core/service-memory-type.test.ts` gain a `park` column (all `null`: neither type declares
  `returns`); the mutating-op lists of `test/core/production-registry.test.ts`, `test/core/parity.test.ts`
  and `test/mcp/read-only-agent-channel.test.ts` gain `memoryPark` / `memory park` / `memory.park`
  ("thirteen" → "fourteen").

### refactor (developer)

`6339290c`. The first full coverage run left one statement and one branch of `src/core/index.ts`
uncovered that main covers (per-file diff of `coverage/coverage-summary.json` against a run at
`0cf8b131`): `memoryParkFn`'s `if (!committed.ok)` return. A test now parks a task whose document has an
uncommitted edit (refused, exit 1, the edit left on disk); another names an id-less holder by its path.
The `name-resolvability` gate flagged `memory.park` in the spec-006/spec-010 amendments as unresolved;
the `CORE_MODULES` comment now names the Tool `memory.park`, as it does `memory.amend`.
Per the coordinator's note (task-181 / `bug-165` changes the `<to>` of every illegal-transition
message), the park refusal tests match `illegal transition <from> -> \S+ for type '<type>'` plus the
engine's reason, and the cli-reference Errors line names no `<to>`.

Gates, with the pending amendments in the working tree:
- `npm test` → `Test Suites: 245 passed, 2 failed`; the failures were `test/mcp/resource-latency.test.ts`
  (REQ-PERF-04 sustained-session trend, under the batch's parallel load) and one regex this refactor then
  fixed. `npx jest test/memory/state-machine-returns-limits.test.ts test/core/memory-park.test.ts test/mcp/resource-latency.test.ts test/docs`
  → `Tests: 74 passed, 74 total`. The latency suites `test/core/query-latency.test.ts` and
  `test/mcp/resource-latency.test.ts` also failed once in the first full run and passed alone
  (`Tests: 8 passed`).
- `npx jest --coverage` (the `test:coverage` script) → Statements 99.08% (5841/5895), Branches 96.27%
  (3283/3410), Functions 96.19% (1012/1052), Lines 99.68% (5067/5083); `main` at `0cf8b131`, same
  command in a scratch worktree: 99.07% (5786/5840) / 96.21% (3231/3358) / 96.18% (1008/1048) / 99.68%
  (5021/5037). None regresses.
- `npm run lint` clean; `npm run typecheck` (both `tsc --noEmit` configs) clean; `npm run docs:api`
  exit 0; `test/docs/cli-reference.test.ts` green in the full run.
- BDD: no AC asks for a scenario; the P1.6–P1.13 feature suites pass in the full run. A `park`
  scenario under `p1-memory/` is a candidate for the coordinator, not added here.

### review (self, reviewer)

- AC1 met — `test/core/memory-park.test.ts` (11 tests, `npx jest test/core/memory-park.test.ts` → 11 passed): the commit subject and `Reason:` byte-for-byte
  with the `WingFoil-Version` trailer, no `Approver:`, only the document, `status` the only change;
  `memory history` reads `operation: park`, `from in-progress`, `to backlog`; no `returns` edge → exit 1;
  missing/blank `--reason` and missing `<id>` → exit 2; nothing written on any refusal.
- AC2 met — `test/core/memory-wip-limits.test.ts` (9 tests, all passing): `submit`, `reject`, `park` and `add` refused
  with `CONFLICT` (exit 1) naming the holder(s); the shared primitive `prepareMemoryTransition` refuses
  on its own, which is what a later `start` emitter will call.
- AC3 met — `test/memory/state-machine-returns-limits.test.ts`: later, same, off-chain and `deprecated`
  targets refused; key outside `sequence` refused with the P1.13 type-named message too.
- AC4 met — `.wingfoil/memory.yaml` `task.states.returns` is `{ in-progress: backlog }` (asserted by the
  same suite against the real file); the Kanban sentence reworded (asserted in
  `test/storage/templates.test.ts`).
- `bug-214` met — `test/core/memory-add-initial-state.test.ts`: `new`, `todo` (from `defaults`) and
  `draft` (built-in) heads; the scaffold's inline comment survives.
- Unasserted: a limit on the `supersedes:` trigger's `superseded` target goes through the same call
  (`prepareMemoryTransitionAtRev` with op `supersede`), but no test drives it.

### Decisions for the approver

1. `memory park` carries no `Approver:` and runs no authority check (dl-110 names none; a park is a
   scheduling decision). If it should be approver-gated, it is one `requireApprovalAuthority` call.
2. No `limits:` is declared in this repository's `memory.yaml` (the dev-loop runs 7–8 tasks in parallel;
   the value is the approver's).
3. The Kanban sentence is reworded rather than backed by a declared limit (the scaffold's machine has
   no in-progress state); the scaffold's commented `bug` example shows `returns` and `limits`.
4. `memory add` also enforces a limit on the initial state ("the verb that enters the state").
5. `memory park` is registered as Tool `memory.park` only by the registrar harness (`test/core/parity.test.ts`);
   the production MCP server's `tools/list` stays `[]` (`spec-014` §3, Tools v0.4).

### Pending amendments (approver)

Uncommitted in the worktree; run each with `memory amend` at the review gate (five since the review, F2).
- `spec-001-memory-yaml-schema` — `--reason "task-180: adds the returns and limits keys of dl-110 P1 (a) and P3 (a) to the StateMachine sub-schema, its field table, verb list and semantic validation, and returns { in-progress: backlog } to the worked task example, as memory.yaml 2.5 declares it; every file valid before stays valid."`
- `spec-003-workflows-yaml-schema` — `--reason "task-180: the park row of the verb table gives its bracket by rule, from to the type's returns target as spec-008 section 2 states it, instead of the literal in-progress to backlog edge, which stays as this repository's example."`
- `spec-006-core-domain-api` — `--reason "task-180: adds memoryPark, and memoryAmend which task-127 registered without a row, to the section 3 Memory table, and names park in the section 7 pre-flight order with a required reason, no authority step, and the WIP-limit refusal at step 3."`
- `spec-008-cli-grammar` — `--reason "task-180: declares memory park per dl-110 P1 (a), its subject, Reason block, absent Approver line and refusals, states its bracket by the type's returns target, and declares the WIP-limit refusal of dl-110 P3 (a) and the verbs it binds; park joins the reason, one-document and committed-baseline lists."`
- `spec-010-memory-frontmatter-schema` — `--reason "task-180: removes the status row's note that memory.add wrote draft literally, which bug-214 tracked and task-180 fixed, aligns the memory.add ownership row, and adds memory.park as a status-only writer."`

### review (independent) — APPROVE WITH FIXES, fixed in-task

| # | Finding | Red | Fix |
|---|---------|-----|-----|
| F1 | `scripts/check-governance.cjs` pinned `park` to `[in-progress → backlog]` and exempted it from the machine-edge check, so a CLI-written `wf(bug): park … [in-progress → open]` (the scaffold example) was a gated finding | `a208ab4d` `test/cli/check-governance.test.ts` "park — one hop along a declared returns edge": `npx jest test/cli/check-governance.test.ts -t park` → 3 failed, 1 passed | `d5d914a7`: the bracket rule asks for one hop between two different states; `park` left `EDGE_EXEMPT_VERBS`, so the state rule judges the hop with `isMachineEdge` (which reads `returns`); a park needs a `Reason:` block (`spec-008` §2) |
| F2 | `spec-003`'s verb table still gave `park`'s bracket as the literal edge | — | fifth pending amendment, below |
| F4 | `requireWipSlot` dropped an unreadable document silently, and its comment said the transition reported it, which the `memory add` path never did | `617127e8`: two warnings tests in `test/core/memory-wip-limits.test.ts` → 2 failed (`Received has value: undefined`) | `d5d914a7`: `requireWipSlot` returns the scan's `W_MEMORY_UNREADABLE` diagnostics; a transition merges them into its warnings (deduplicated by file against the id lookup's), `memory add` carries them, a `CONFLICT` refusal carries them in `details.issues`; `6fa7b8c2` covers the dedupe and the refusal detail |
| F6 | notes said the MCP Tool `memory.park` follows mechanically | — | corrected above (green section, decision 5) |

Checks after the fixes:
- Scratch repository with the code build (`npm run build`; `wingfoil init --template Kanban`, the
  scaffold's `bug` example uncommented and committed, `memory add`/`submit`/`approve` a bug to
  `in-progress`, then `memory park bug-002-two --reason "Not now."`): exit 0, commit
  `wf(bug): park bug-002-two [in-progress → open]` + `Reason: Not now.` + `WingFoil-Version`, one file;
  `node scripts/check-governance.cjs --root <scratch>` → `gated: 0 findings on 0 commits`, exit 0.
- `npx jest --coverage` → `Test Suites: 247 passed`, `Tests: 4682 passed`; Statements 99.08%
  (5847/5901), Branches 96.28% (3287/3414), Functions 96.20% (1014/1054), Lines 99.68% (5070/5086) —
  all at or above `main`'s (99.07 / 96.21 / 96.18 / 99.68).
- `npm run lint`, `npm run typecheck`, `npm run docs:api` clean;
  `node scripts/check-governance.cjs --base 0cf8b131` → 0 findings, exit 0.
- The task stays `in-review`.

**Focused re-review (2026-10-06) — F1 follow-up.** The state rule still judged a `park` hop with the
generic `isMachineEdge`, so a park along a forward, gate-reject or `deprecated` edge passed (the
reviewer's hand commit `wf(bug): park bug-001-one [open → in-progress]` gave 0 findings), and the
header comment claiming a `returns` check was false. Red `bb99ae4d`: a park along `[backlog →
in-progress]` (forward) and `[in-review → in-progress]` (gate reject) in
`test/cli/check-governance.test.ts` → `npx jest test/cli/check-governance.test.ts -t park` 1 failed,
4 passed. Fix: for `park` the rule requires `(machine.returns ?? {})[from] === to`, as `deprecate`
requires `deprecated`, and the comments say so. `npx jest test/cli/check-governance.test.ts` → 43
passed; `npm run lint` clean; `node scripts/check-governance.cjs --base 0cf8b131` → 0 findings.
