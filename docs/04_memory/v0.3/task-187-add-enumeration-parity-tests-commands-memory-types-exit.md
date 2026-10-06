---
id: "task-187-add-enumeration-parity-tests-commands-memory-types-exit"
type: task
title: "Add enumeration parity tests for commands, Memory types, exit codes and MCP surfaces"
status: approved
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "docs", "testing", "parity"]
ref: "dl-116"
bug: ["bug-206"]
depends_on: ["task-151-check-backticked-name-specs-adrs-requirements-resolves-head"]
tmpl_version: 260703
---

## Description

One test per enumeration a document restates, modelled on `cli-reference.test.ts`.

## Acceptance Criteria

- (red-first) one test each under `test/docs/`: spec-005/spec-008 command list vs `CORE_MODULES`; spec-001 types/states vs `memory.yaml`; spec-008 §5 / spec-009 §3 exit codes vs `src/core`; spec-004 §4 MCP Tools and §2.1 Resources vs the registered set; each fails on a fixture drift.
- (characterization) warn mode for v0.3 like task-151; findings counted.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-116 Q1 (A).
- **Notes:** Proposal key: D39. the agent-guide enumeration (dl-116 names it) is left to `align-agent-docs`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-06)

- **Sources.** `dl-116` (`ready`; approve commit `a6276d34`: Q1 (C) with (B) first, Q2 (a), Q3 (ii)).
  (B) is `task-151` (`done`), so this task is the (A) half. The specs whose enumerations are compared
  are all `approved` (`grep -m1 "^status:" docs/04_memory/design/specs/spec-00{1,4,5,8,9}-*.md`).
  No spec governs `test/docs/` (`task-151` design checked the same), so none is missing. `bug-206`
  (`in-progress`) rides on this task.
- **depends_on (dl-015).** I read `task-151`'s Execution Notes and reused its model:
  - findings keyed without line offsets (`dl-075`);
  - a `MODE`-style constant, `'warn'` for v0.3 and `'fail'` named for v0.4;
  - an allowlist where an unlisted finding fails in both modes;
  - `planned` entries citing non-done tasks, spent once all are `done`.
  `taskStatuses` is imported from `test/docs/support/name-resolvability.ts`, not copied.
- **Layout.** Test-only; nothing under `src/` changes (`git diff --stat 1abafadd -- src` → empty).
  - `test/docs/support/enumeration-parity.ts` is the engine. It holds `compareEnumeration`, which
    reports both directions (`missing` = the code has it and the document does not; `surplus` = the
    reverse), the section and list readers, `stateFacts` and the allowlist check.
  - `test/docs/support/parity-gate.ts` is the shared repository assertion.
  - `test/docs/enumeration-parity.allowlist.ts` holds `PARITY_MODE` and the entries;
    `enumeration-parity.allowlist.test.ts` checks its shape.
  - There is one gate per AC enumeration, each with a drifted fixture under
    `test/docs/fixtures/enumeration-parity/`:
    - `commands-parity.test.ts`: spec-008 §1 nouns, flat commands, the dna/directive/directives
      verbs, the §11 command list, and spec-005's Context pillar and flat lists, against the
      Commander tree `buildProgram(CORE_MODULES)` builds.
    - `memory-types-parity.test.ts`: spec-001's worked-example YAML block (types, plus every machine
      flattened to one fact per declared item, `returns`/`limits` included) and spec-004 §2.1's
      `{type}` list, against `loadMemoryYaml`.
    - `exit-codes-parity.test.ts`: the tables of spec-008 §5 and spec-005 §1, and spec-009 §3's
      `**`n`**` bullets (`E_CODE → n`), against `src/core`'s selection. The code side runs every
      outcome kind through the selection. `CORE_ERROR_CODES` is typed `Record<CoreErrorCode, true>`,
      so tsc fails it when the union changes. Each bound `E_*` code is built as `src` builds it and
      run through `exitCodeForThrow`.
    - `mcp-surface-parity.test.ts`: spec-004 §2.1's URI block, against the production server's
      `resources/list` and `resources/templates/list`. Spec-004 §4.1's Tool names are compared with
      the production `tools/list`, which is `[]` (spec-014 §3), and also with the Tools
      `registerCoreModules` derives from `CORE_MODULES`, which is §4.2's bijection.
- **Out of scope.** The agent-guide enumeration goes to `align-agent-docs` (task Notes). Naming the
  checks in `dev-loop.yaml` is `dl-116` Action 4 (`task-221`). Prompts (§3.1) derive from DNA at
  start and are not compared.
- **Extraction fails loudly.** A renamed heading or a missing list throws, because a reader that
  found nothing would make the gate pass vacuously. Each gate also asserts that its code side is not
  empty.
- **AC classification** (testing directive T1):

  | AC | Classification | Why |
  |---|---|---|
  | 1 — one test per enumeration; each fails on a fixture drift | red-first | no such gates existed (`ls test/docs` at base: no `*-parity.test.ts`) |
  | 2 — warn mode for v0.3 like task-151; findings counted | characterization (as filed) | the warn branch ships with AC 1's green; the red covered it, since the suites could not load |
  | bug-206 — a phase counts only where its own workflow is documented | red-first | `workflow-md.test.ts` passed on a fixture where `submit`/`gate` occur only dotted or in another section |

### red (2026-10-06)

- I prototyped the engine in the working tree to measure the first run and tune the readers, the
  way `task-151` did. It was moved out of the tree before the red commit, so it was not committed
  with the tests.
- `df47262a test(docs): task-187 — failing test: enumeration parity …`. This commit holds the four
  gates, the four fixtures and an empty allowlist. Running
  `npx jest test/docs/{commands,memory-types,exit-codes,mcp-surface}-parity.test.ts` →
  `Cannot find module './support/enumeration-parity'` ×4, `Test Suites: 4 failed`, `Tests: 0 total`.
- `d6a51f2e test(docs): … (bug-206)`. This commit adds the fixture `workflow-md-drift.md` and a test
  that, under the old predicate, reports nothing for `release-cycle/submit` or `e2e-smoke/gate`.
  `npx jest test/docs/workflow-md.test.ts` → `1 failed, 3 passed`, `Received: []`.

### green (2026-10-06)

- `947de053 fix(docs): … (bug-206)`. A phase counts as documented when one of these holds:
  - the pair `workflow/phase` occurs anywhere;
  - the phase is named in one of its workflow's regions. A region is a section whose heading names
    the workflow in backticks (ending at the next heading of any level), a Mermaid subgraph
    `["workflow"]`, or a node label naming it (a one-node summary).
  In sections and subgraphs the name must be marked (`**phase**` or inline code); in a one-node
  summary a whole word counts. A `.` never bounds a name. Results:
  - `npx jest test/docs/workflow-md.test.ts` → `5 passed`, and the real `WORKFLOW.md` passes
    unchanged.
  - Mutation (not committed): renaming the `**submit**` node and the prose `` `submit` `` in Phase 6
    → `1 failed`, `release-cycle/submit` reported. Reverted with `cp`, and `git status` was clean.
  - Mutation, `gate` only: removing the e2e-smoke `**gate**` node alone still passes. The
    release-cycle diagram's one-node summary of `e2e-smoke` lists `… → gate`, which documents it for
    its own workflow.
- `5cf4acbd feat(docs): …`. This commit adds the engine, the shared gate, the first-run allowlist
  and the allowlist-shape test. Running `npx jest` over the four gates and the allowlist test →
  `5 passed`, `17 passed`.
- Mutation (not committed): dropping `` `memory park` `` from spec-008 §11 → `1 failed`, with
  `spec-008 §11 commands|…|missing|memory park` unlisted. Reverted with `git checkout`.

### first-run findings (AC 2)

At base `1abafadd`, the gates find **30 findings**, all of them allowlisted. Every count below comes
from `grep -o "reason: [A-Z_0-9]*" test/docs/enumeration-parity.allowlist.ts | sort | uniq -c`.

- **Commands: 10.**
  - `agent` noun, in spec-008 §1 and spec-005: planned by `task-220`, `task-228`, `task-240`.
  - `agent list`: `task-240`. `agent show`: `task-220`. `workflow next`: `task-216`.
    `workflow show`: `task-204`. `workflow status`: `task-225`. These are all §11 surpluses,
    `planned`.
  - `audit`, in spec-008 §1 and spec-005: `AUDIT_V04`. P5.1.3 is in `minor-v0.4`'s `features:` and
    no task builds it yet.
  - **1 untriaged:** spec-005 Context's pillar list lacks `directives`.
- **MCP Tools: 20.**
  - §4.1's 8 Tools vs the production `tools/list` (`[]`): `TOOLS_V04`.
  - §4.1 vs the Tools `CORE_MODULES` derives: `workflow.start`/`workflow.end` → `task-217`,
    `workflow.next` → `task-216` (planned). If `workflow next` ships read-only, the entry will be
    reported as spent rather than resolved, which is exactly what the ratchet is for.
  - **9 untriaged:** §4.1 lacks `directive.assign/create/remove`, `dna.add/remove/set/update`,
    `memory.amend` and `memory.park`. These are mutating verbs that §4.2's bijection requires as
    Tools.
- **Memory types (spec-001, spec-004 §2.1), exit codes (spec-008 §5, spec-005 §1, spec-009 §3),
  MCP Resources (spec-004 §2.1): 0 findings.** spec-001 already carries task-180's `returns`.
- By reason: planned 10, untriaged 10, TOOLS_V04 8, AUDIT_V04 2. Warn report, e.g.
  `MCP-surface parity (warn mode until v0.4): 20 allowlisted finding(s), 9 untriaged, 0 stale, 0
  planned with every task done.`
- The untriaged backlog cannot grow: `enumeration-parity.allowlist.test.ts` caps `UNTRIAGED` at
  the first run's 10.
- Jest prints a gate's `console.warn` report only when that suite runs alone. In a multi-suite run
  (`npx jest --runInBand <4 files>`, which logged 0 `console` lines) it is not shown. The assertions
  are unaffected.

### refactor (2026-10-06)

All run in the worktree, one jest process at a time:
- `npm test` → `Test Suites: 264 passed, 264 total`, `Tests: 4896 passed, 4896 total`.
- `npm run test:coverage` → `All files | 99.11 | 96.3 | 96.37 | 99.69`. It does not regress, by
  construction: `git diff --stat 1abafadd -- src` is empty, and every new file is under `test/`.
- `npm run lint` → exit 0. It found one `preserve-caught-error` in `parseYaml`, fixed with
  `{ cause }` before the green commit.
- `npm run docs:api` → exit 0. `npx tsc --noEmit -p tsconfig.json` → exit 0.
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- `node scripts/check-governance.cjs --base 1abafadd` → `gated: 0 findings`, exit 0.
- BDD: `dl-116` names no P-feature, so no feature file covers a documentation gate, and none was
  added. `.wingfoil/*.yaml` is untouched, so no version bump is needed.

### review (self, reviewer, 2026-10-06)

- **AC 1: met.** The four gates are under `test/docs/`. Each has a fixture test asserting the exact
  drift keys in both directions, and a repository test.
- **AC 2: met.** `PARITY_MODE = 'warn'`, and its comment names the switch to `'fail'` in v0.4. The
  counts are above. The ratchet is the one `task-151` uses: an unlisted finding fails in both modes,
  which is stricter than "warn" for a new divergence. **Approver to confirm**, as for `task-151`.
- **bug-206: met.** Its Expected Behavior asks that "`.` is a boundary that does not satisfy a phase
  name", and that a phase is named for its own workflow. Both are pinned by the two fixture tests.
  The marked-name rule in sections is stricter than the bug's literal wording. **Approver to
  confirm.**
- **Determinism.** Every side is a sorted set or a sorted fact list. The MCP code side is taken over
  the in-memory transport. Nothing reads the clock or uses randomness.
- **Pending amendments (approver): none.** No Memory element other than this task file was edited.
- **Candidate findings, not filed.** The 10 untriaged entries are real spec drifts:
  - spec-005 Context omits `directives`;
  - spec-004 §4.1's Tool table predates the dna/directive verbs and `memory amend`/`park`.
  The approver may want them amended in v0.3 to empty the warn backlog.

### Review fixes (2026-10-06, independent review: approve with fixes)

Applied in-task on this branch. The task stays `in-review` and is not re-submitted. Commits:
`7eee2cfd` (red, F1), `9a27d0af` (green, F1), `ec550593` (F1 follow-up), `587e1e35` (F2, F4).

- **F1. Prose in a summary label.** This was red-first.
  - The one-node-summary branch counted every bare word of a Mermaid label that names a workflow,
    prose included. So "Approval gate" documented `e2e-smoke/gate`, and "design gate" documented
    `dev-loop/design`. These are bug-206's own examples.
  - A summary label now counts only the names its arrows chain: a name right after a `→`, or right
    before one (an `(opt.)` may sit between). This is the reviewer's pattern.
  - Red: the new fixture case "counts only arrow-chained names in a one-node summary, not its prose"
    → `npx jest test/docs/workflow-md.test.ts` → `1 failed, 5 passed`, `Received: []`.
  - Green: `6 passed`. The real `WORKFLOW.md` passes unchanged.
  - Mutations (not committed, each restored with `cp`):
    - Removing the `**gate**` node and the summary's `→ gate` → `1 failed`.
    - Renaming the `**design**` node and removing the three other marked `design` mentions in the
      dev-loop section (two `` `design` ``, one `` `dev-loop/design` ``) → `1 failed`. Before the
      fix, both passed.
  - `9a27d0af` left `npx tsc --noEmit -p tsconfig.json` failing (`TS2345` on the untyped `match`
    result). `ec550593` types it. The tsc error was found by the re-run below, not by the jest run.
- **F2. The `workflow.next` entries.** Approved `spec-017` §9 makes `workflowNext` `mutates: false`,
  served as the Resource `wingfoil://workflows/-/next`
  (`grep -n workflowNext docs/04_memory/design/specs/spec-017-*.md` → line 674). Its Consequences
  move spec-004 §4.1's row to v1.0 (lines 862–863). `task-239`'s AC makes that amendment.
  - Both `workflow.next` entries (`tools` and `tools vs CORE_MODULES`) now carry
    `WORKFLOW_NEXT_ROW`, a `planned:` reason that says so, with `plannedBy: ['task-239']`.
  - The shape test accepts any `planned: ` reason with `plannedBy`.
- **F4. Pinning the untriaged keys.** `enumeration-parity.allowlist.test.ts` now pins the ten
  first-run `UNTRIAGED` keys (`FIRST_RUN_UNTRIAGED`) in place of the count cap. Fixing one entry
  therefore frees no slot.
  - Mutation (not committed): giving `audit` the `UNTRIAGED` reason → `1 failed`.
- **Counts after the fixes.** There are still 30 findings. By reason
  (`grep -o "reason: [A-Z_0-9]*" test/docs/enumeration-parity.allowlist.ts | sort | uniq -c`):
  planned 9, untriaged 10, `TOOLS_V04` 7, `AUDIT_V04` 2, `WORKFLOW_NEXT_ROW` 2.
- **Gates after the fixes.**
  - `npx jest test/docs` → `12 passed`, `54 passed`.
  - `npm test` → `264 passed`, `4897 passed`.
  - `npm run lint` → exit 0.
  - `npx tsc --noEmit -p tsconfig.json` → exit 0.
  - `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
  - `node scripts/check-governance.cjs --base 1abafadd` → `gated: 0 findings`, exit 0.
