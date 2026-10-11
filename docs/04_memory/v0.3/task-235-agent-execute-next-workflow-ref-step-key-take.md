---
id: "task-235-agent-execute-next-workflow-ref-step-key-take"
type: task
title: "`agent execute --next`, `--workflow <ref>` and `--step <key>` take workflow, phase, element and role from the workflow's frontier"
status: approved
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "workflow", "cli"]
ref: "spec-016"
bug: []
depends_on: ["task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence", "task-216-add-workflow-next-naming-next-step-verb-role", "task-228-agent-execute-launches-agent-forwards-right-signals-records"]
tmpl_version: 260703
---

## Description

This task wires `spec-017`'s deduction into step 1 of the resolution: - `--workflow <ref>` selects the instance, and `--step <key>` selects a frontier step (either one implies `--next`); without `--step` the step is `NextResult.next`; - the element comes from `--element`, else the step's scope element, else the instance's bound element; - the role comes from `--role`, else the step's `role`. The run record carries the workflow and phase, and `n` counts per `(element, phase)`. Every v0.3 run is `fresh` whatever the phase allows. `distinct_from` is not checked (P4.12, v1.0).

## Acceptance Criteria

- (red-first) P5.3.1 sc. 1: with an active instance whose next step targets `task:<id>` as `developer`, `agent execute --next` launches the fake as `developer` on that element. The record has the step's `workflow` and `phase` and id `<id>/<phase>/1`.
- (red-first) P5.3.1 sc. 3: `next: null`, or no open instance → exit 1 `no next step to execute`, and no process is spawned.
- (red-first) P5.3.2 sc. 1–2: the role comes from the step. sc. 3: a step role not in DNA → exit 1 `step role 'ghost' not defined in dna.yaml` (verbatim).
- (red-first) `--step <key>` not on the frontier → `CONFLICT` `step '<key>' is not on the frontier of <instance>`. `--workflow` naming no workflow → `unknown workflow: <name>`; no open instance → `workflow is not open: <ref>`. `NO_STEP_ELEMENT` and `NO_STEP_ROLE` use their §3.7 messages.
- (red-first) With two parallel frontier steps, `--workflow <instance> --step <key>` launches on the named one. This is the `agent` binding argv of `spec-017` §6.1, run as written.
- (red-first) A phase declaring `mode: [fresh, resume]` still runs `fresh` and prints no warning. `--resume` → exit 2 (v0.4).
- (characterization) BDD `P5.3.1` / `P5.3.2` gain scenarios for `--workflow`, `--step` and the recorded `mode`, with a `doc-versioning` note. The `--resume`-refused-on-a-fresh-only-phase scenario is written tagged v0.4. `spec-008` / `cli-reference` `agent execute` entries are updated if task-228 did not already carry the step flags.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §3.1 (`--next`, `--workflow`, `--step`), §3.2 steps 1–3, §3.7 (step rows); R16; dl-135 point 3 (v0.3: `fresh` only).
- **Features:** P5.3.1, P5.3.2.
- **Notes:** Proposal key: B11.
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

- **Depends-on notes read (dl-015).** task-185 (phase `mode` / `distinct_from` parsed, one value per phase);
  task-216 (`workflowNextAtHead`, `NextResult`, `Step`; its decision 5: `sync_state` ignores the aggregate
  rule; its decision 6: the agent argv `--workflow`/`--step` is this task's); task-228 (launch, run record,
  §12 rows marked "not registered before task-235"). Cited specs `approved`: `grep -m1 '^status'
  docs/04_memory/design/specs/spec-0{08,16,17}-*.md` → `approved` ×3.
- **Shape.** New `src/agent/step.ts`: `readNextAtHead` (the deduction, throws mapped as `workflow next`
  maps them), `selectFrontierStep`, `stepTargetElement`, `resolveStepRole` — pure but the first. The
  pipeline (`src/agent/execute.ts`) reads the deduction first under a step form and takes its
  `baseline.commit` as the run's one `HEAD` (no second `rev-parse`, so no race between two reads); the
  stepless form keeps its own `resolveRevision(root, 'HEAD')` (`grep -n "resolveRevision(root, 'HEAD')"
  src/agent/execute.ts` → the one call, in the fallback for the stepless form and a repository with no
  commit). `CORE_MODULES` gains the flag `--next` and the options `--workflow <ref>`,
  `--step <key>`; `agentExecuteFn` treats either option as implying `--next`.
- **AC classification.**

| AC | Class | Why |
|---|---|---|
| 1 P5.3.1 sc. 1 | red-first | `--next` was an unknown option |
| 2 P5.3.1 sc. 3 | red-first | idem |
| 3 P5.3.2 sc. 1–2 | red-first; sc. 3 see decision 1 | role from the step is new |
| 4 step refusals | red-first | new |
| 5 parallel steps, binding argv as written | red-first | new |
| 6 mode fresh, no warning | red-first; `--resume` exit 2 is characterization | `--resume` was already an unknown option |
| 7 BDD / spec-008 / cli-reference | characterization (documentation) | |
| B4 handover (sync aggregate) | characterization, see decision 3 | |

### Red (qa, 2026-10-10)

- `ec27c12f` — `test/agent/helpers/agent-execute-step-fixture.ts` (a `delivery` instance with two parallel
  `loop.implement` steps, `mode: resume`, an `agent.execute` action; `chores`, `roleless`, `review-only`
  instances), `test/cli/agent-execute-step.integration.test.ts`, `test/core/agent-execute-step.test.ts`.
- Run: `npx jest test/cli/agent-execute-step.integration.test.ts test/core/agent-execute-step.test.ts` →
  2 suites failed; 17 failed, 1 passed (the AC 6 `--resume` characterization); the in-process suite failed
  on `Cannot find module '../../src/agent/step'`.

### Green (developer, 2026-10-10)

- `4c1eaaa8` — `src/agent/step.ts`, the pipeline edit, the registration, `docs/cli-reference.md` (grammar,
  option table, refusals; the `workflow next` "Planned" note no longer lists `agent execute`), and
  `test/cli/journey-0a.integration.test.ts` (its `--next` "known gap" now pins exit 1
  `no next step to execute`: `node dist/cli.js agent execute --next` on a fresh `init --template Scrum`
  project → that line, exit 1).
- Same run after green → 2 suites passed, 34 tests passed.
- `1359c6e1` — the B4 handover's two-task fixture (decision 3) and the BDD scenarios (AC 7), with a
  `# Revised 2026-10-10` header in each feature file (feature files carry no `version:`; precedent:
  task-228's header).

### Refactor (developer)

- `4bd5199e` — two comments in `src/agent/` reworded: `test/core/workflow-executor-cadence.test.ts` guards
  that no v0.3 path contains `distinct_from` and failed on the comments alone (first coverage run: 1 failed,
  6511 passed); two in-process cases added (invalid `roles.yaml` under a step form; no commit).
- Gates at `4bd5199e`, run one at a time under the dl-170 interim rule (`--maxWorkers=2`):
  - `npm run test:coverage -- --maxWorkers=2` → 349 suites, 6514 tests passed; All files 99.26 / 97.08 /
    97.75 / 99.68 (stmts / branches / funcs / lines) against the W3 B4 gate's main 99.29 / 97.04 / 97.74 /
    99.69 (`grep '^All files' devloop-kit/gate-w3b4-cov.log`): branches and functions up, statements −0.03
    and lines −0.01 — the uncovered lines are `throw error` re-throws of unexpected errors
    (`src/agent/step.ts:50`; `src/agent/execute.ts:506`, pre-existing).
  - `npm test -- --maxWorkers=2` → 349 suites, 6514 tests passed.
  - `npm run lint` → exit 0 (at `1359c6e1`; at `4bd5199e` `npx eslint src/agent` and the new tests → 0).
  - `npx tsc --noEmit -p tsconfig.json` → 0 (at `4bd5199e`); `npx tsc -p tsconfig.build.json --noEmit` → 0
    and `npm run docs:api` → 0 (at `1359c6e1`; `4bd5199e` changes comments only in `src/`).
  - `node scripts/check-governance.cjs --base 30b268a3` → 0 findings (1 `wf()` commit, 4 others, before the
    notes and submit commits).
  - `test/docs/cli-reference.test.ts`, `enumeration-parity*`, `name-resolvability` pass in both full runs.

### Review (self-review against code-review)

- Every AC maps to a test named after it in the two new suites; the related suites
  (`journey-0a`, `test/docs/` incl. `cli-reference`, `name-resolvability`, `enumeration-parity*`,
  `agent-execute` ×2, `help-describes-every-command`, `dry-run.integration`, `parity`, the two new ones) →
  26 suites, 261 tests passed (`npx jest <those paths>`, log in the kit scratch).
- Same-class check in touched files: every `request.element` use in the pipeline now reads the resolved
  `target` (`grep -n "request.element" src/agent/execute.ts` → the stepless assignment and the
  `stepTargetElement` override only).
- `NO_STEP_ELEMENT` / `NO_STEP_ROLE` stay as spec identifiers (no constant), as §3.7 says; the
  name-resolvability allowlist entries naming them did not go stale (that suite passed).

### Review fixes (independent review: approve with fixes, 2026-10-11)

- **F3** — every adapter read now takes the run's one resolved commit: `duplicateAdapterRefusal(root, sha,
  'HEAD')` and `loadAdapter(root, name, sha, 'HEAD')` (`src/agent/execute.ts`), both forms; the two
  functions gain a `label` parameter (`src/agent/discovery.ts`, default `rev`) so messages still say
  `HEAD`. Test: `test/core/agent-execute-step.test.ts` › "review F3" moves `HEAD` (a commit that breaks the
  fake adapter) right after the deduction (step form) or the `resolveRevision` (stepless form) and expects
  the plan at the first commit. With the two calls reverted to `'HEAD'`:
  `npx jest test/core/agent-execute-step.test.ts -t "review F3"` → 2 failed (the duplicate-adapter refusal);
  with the fix → 2 passed. The spec-016 / spec-008 amendment wording ("the one `HEAD`") is now true.
- **F5** — the two state claims the claim lint flagged (Design, decision 4) now name their commands (`node scripts/lint-claims.cjs --base
  30b268a3`).
- A third case pins `duplicateAdapterRefusal` at `HEAD`, at a sha with the `HEAD` label, and with no commit:
  no production caller passes `'HEAD'` any longer, and the first coverage run after F3 showed
  `discovery.ts` functions at 94.73 (main 100).
- Gates at `3824a8a9`: `npm run test:coverage -- --maxWorkers=2` → 349 suites, 6517 tests passed; All files
  99.27 / 97.12 / 97.75 / 99.68 (the W3 B4 gate's main: 99.29 / 97.04 / 97.74 / 99.69); `discovery.ts`
  97.82 / 96.66 / 100 / 98.64. `npx tsc --noEmit -p tsconfig.json` → 0; `npx eslint src/agent
  test/core/agent-execute-step.test.ts` → 0.

### Approver ruling on decision 1 (2026-10-11, option (a))

- P5.3.2 sc. 3 now expects the registry's message, `unknown role 'ghost' (not defined in dna.yaml)`, and still
  "execution does not start"; the feature file has a dated `# Revised 2026-10-11` header citing the ruling,
  and the gap note is gone. **AC 3 says "verbatim": the ruling replaced the scenario's message, so AC 3 is
  met against the amended scenario.** `test/cli/agent-execute-step.integration.test.ts` › "sc. 3 (amended
  2026-10-11)" pins it on a real repository fixture: exit 1, stderr line `error: E_PHASE_ROLE_UNKNOWN
  phases[0].role (workflows/custom/ghostly.yaml): unknown role 'ghost' (not defined in dna.yaml)`, no fake
  invocation, and `expectNothingRan` checks `HEAD` and `git status --porcelain` against their values before the run.
- `resolveStepRole`'s check stays as a defence, pinned on a synthetic step; its test comment and the
  function's doc (`src/agent/step.ts`, comment only) say a repository cannot reach it.
- spec-016 pending amendment: §3.1's closing line names P5.3.2 sc. 3's registry message, the §3.7 step-role
  row is a defence, and the Revision note says so; the proposed `--reason` changed (below).
- Checks: `npx jest --maxWorkers=2 test/core/agent-execute-step.test.ts
  test/cli/agent-execute-step.integration.test.ts test/docs/` → 20 suites, 153 tests passed;
  `npx tsc --noEmit -p tsconfig.json` → 0; `npx eslint` on the three touched code files → 0. No full coverage
  run: the only `src/` change is a three-line doc comment (`git diff 3824a8a9 -- src/` → `src/agent/step.ts`,
  comment lines only).

### Decisions for the approver

1. **(Ruled 2026-10-11, option (a): see above.) P5.3.2 sc. 3 is not reachable verbatim through a repository.** The registry refuses a phase whose role
   `dna.yaml` lacks at load (`E_PHASE_ROLE_UNKNOWN`, task-194) against the same committed `dna.yaml`, so the
   CLI exits 1 with `error: E_PHASE_ROLE_UNKNOWN phases[0].role (workflows/custom/ghostly.yaml): unknown
   role 'ghost' (not defined in dna.yaml)` and spawns nothing (CLI test AC 3 sc. 3). The verbatim
   `step role 'ghost' not defined in dna.yaml` is kept in `resolveStepRole` and pinned on a synthetic step.
   The feature file gains a note; spec-016 §3.7's row says where it is reached (pending amendment).
   Alternative: amend the BDD message to the registry's.
2. **`--step` on an open instance with an empty frontier → `CONFLICT`, not `NO_NEXT_STEP`** (the §3.7 rows'
   order); recorded in spec-016 §3.2 step 1 (pending amendment).
3. **The sync aggregate handover.** `agent execute` neither reports nor performs a step's actions
   (spec-016 §3.6), so it cannot apply the rule; the two-task fixture pins that it acts on no sync (the
   shared bug keeps `in-review`, one commit, the run log only). Applying the rule to what `workflow next`
   *reports* contradicts approved `spec-017` §6.1 ("The aggregate rule … is not applied in v0.3") and is
   the same handover task-225 carries (it merges first, and owns `NextResult` reporting): not done here, to
   avoid two competing implementations in `src/core/workflow-next.ts`. Ruling needed on which task (225)
   amends spec-017 §6.1 and implements it.
4. Deduction diagnostics (`NextResult.diagnostics`, e.g. this repository's unbound-check warnings) are not
   printed by `agent execute`; only the context warnings are, through the same `reportWarning` loop as
   before (`git diff 30b268a3 -- src/agent/execute.ts | grep -n "context.warnings"` → no changed line).
5. The deduction runs only under a step form; the stepless form reads no workflow file (§3.3 step 2).

### Pending amendments (approver)

- `spec-008-cli-grammar` — `--reason "task-235: section 12's step-form row is registered and no longer says the step forms are unregistered, the element row no longer says it is required until they ship, and section 11 names the step forms' baseline, the deduction's commit being the one HEAD every read takes."`
- `spec-016-agent-execution` — `--reason "task-235: the step forms ship; section 3.2 step 1 says an empty frontier under --step is the CONFLICT row and that the deduction's commit is the run's one HEAD; by the approver's ruling of 2026-10-11 P5.3.2 scenario 3 takes the registry's E_PHASE_ROLE_UNKNOWN message, which section 3.1 now names, and section 3.7's step-role row stays as a defence."`

### Candidate findings (not filed)

- `npx jest` interrupted mid-run (session restarts) left `dist/` absent once; the next CLI run failed with
  `Cannot find module …/dist/cli.js` until `npm run build`. Worth a line in the kit's resume prompt.

### Retrospective

- The step role check duplicates the registry's load check (decision 1): a BDD message written before the
  registry validated roles. None else.

