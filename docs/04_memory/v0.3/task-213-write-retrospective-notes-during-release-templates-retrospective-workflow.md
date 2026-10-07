---
id: "task-213-write-retrospective-notes-during-release-templates-retrospective-workflow"
type: task
title: "Write retrospective notes during the release: templates and retrospective workflow"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "workflow-config", "retrospective"]
ref: "dl-115"
bug: []
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

Retrospective input is reconstructed after the release. The task, bug and plan templates gain a `### Retrospective` subsection; `retrospective.yaml` lists every secondary source and gives every proposal a disposition before its gate. The `done` existence check is task-221.

## Acceptance Criteria

- (characterization) `task.md`, `bug.md`, `plan.md` templates end `## Execution Notes` (or the equivalent closing section) with `### Retrospective`, one line per item, "None" valid.
- (characterization) `retrospective.yaml` `explore` lists its secondary sources; `additional-points` gains a `checks.pre` that every proposal has one of dl-115's four outcomes; version bumped; loads with zero errors.
- (characterization) `memory add --type task` (worktree build) on a scratch repo scaffolds the new subsection (template copied verbatim).

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-115 (Q1 (A), Q3 (x)).
- **Features:** P4.1.
- **Notes:** Proposal key: D07.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from `dl-163` (2026-10-07, approver; `dl-115` amended the same day).** The `additional-points` check this task adds accepts six outcomes for a consumer feedback note: `dl-115`'s four plus `declined` and `needs-info`. A later task (dl-163 S3d, batch B5) adds the `collect-feedback` phase to `retrospective.yaml` after this task and `task-222`; keep the check written so that phase's notes can be listed as a secondary source of `explore`.

## Execution Notes

### design (architect)

- **depends_on (dl-015):** `task-199` (`done`, `grep -m1 '^status:' docs/04_memory/v0.3/task-199-*.md`). Read its
  Execution Notes: `retrospective.yaml` is at 1.3 (its), every check no command asserts stays an unbound warning
  listed with a reason, and `test/core/workflow-repository-conformance.test.ts` pins the exact warning set at
  `HEAD` (61 rows before this task). So the two new checks are unbound and the suite gains two rows.
- **Decisions read:** `dl-115` (`ready`) Q1 (A), Q3 (x), with its 2026-10-07 amendment (six outcomes for a consumer
  note); `dl-163` (`ready`) S3d-b and the handover (the check must let `task-272`'s `collect-feedback` read record be
  one more source). Q2 (a), the `done` existence check, is `task-221`'s. No tech-spec governs Memory templates'
  bodies or the retrospective workflow's checks: no spec edit, no pending amendment.
- **Where the subsection goes:** task → end of `## Execution Notes`; bug → end of `## Triage & Execution Notes`
  (its closing running log); plan → the template has no running log (`## Handoff` is last), so it gains
  `## Execution Notes` closed by `### Retrospective`. Most plans already end that way by hand (for example
  `docs/05_plans/rl-v1/rel-v0.2.2/bug-ingest-rel-v0.2.2-mcp-registry-findings-plan.md` and
  `dev-loop-rel-v0.2.2-plan.md` end with `## Execution Notes…`; `grep '^## ' <plan> | tail -1`). Decision for the
  approver (below). The init built-in scaffolds (`src/storage/templates.ts`) are generic and out of scope.
- **Check names:** `secondary-sources.listed(…)` on `explore` `checks.post`, `proposals.disposed(…)` on
  `additional-points` `checks.pre`. Outcome names (mine, from dl-115's prose): `covered`, `element`, `restated`,
  `superseded`; consumer notes also `declined`, `needs-info` (dl-163's words).
- **Version bumps:** `retrospective.yaml` 1.3 → 1.4 once; templates `tmpl_version` 261006 → 261007 (the date-stamp
  convention task-201/209 followed). None of the four version-gated config files is touched.

**AC classification** (testing directive, T1):

| AC | Class | Why |
|---|---|---|
| 1 — templates end with `### Retrospective` | red-first (reclassified) | the subsection is new; the test fails at `73641cd7` — calling it characterization would fabricate a green |
| 2 — `retrospective.yaml` sources + `checks.pre`, bump, zero errors | red-first (reclassified) | the phases' new content is new; fails at `73641cd7`. Zero errors is task-199's suite, which gains the two rows |
| 3 — `memory add` scaffolds the subsection | characterization | `add` copying the body verbatim is existing behaviour (spec-010); at `73641cd7` the body-equality assertion already passes and only the subsection assertion fails, i.e. AC 1's red |

### red

`58b1745a`: new `test/core/retrospective-notes.test.ts` (reads templates through `git show HEAD:…`, workflows
through `loadWorkflowRegistryAtHead`; AC 3 spawns `dist/cli.js memory add` for task, bug and plan in a throwaway
repository seeded with this repository's committed `memory.yaml` and the three templates); the conformance suite
gains the two expected unbound rows. Run: `npx jest test/core/retrospective-notes.test.ts
test/core/workflow-repository-conformance.test.ts` → **13 failed, 14 passed, 27** (2 suites failed): the 6 AC 1
cases, 3 of 4 AC 2 cases (the "other phases keep their shape" guard passes), the 3 AC 3 cases (body equal, last
heading `## Execution Notes`), and the conformance AC 1 row list.

### green

`da67b2a5`: the three templates (subsection + `tmpl_version: 261007`; plan gains `## Execution Notes`),
`retrospective.yaml` 1.4 (explore description + `checks.post`, additional-points description + `checks.pre`, header
reason), `.wingfoil/WORKFLOW.md` retrospective node (two lines). The same commit narrows one assertion of the red
test: the check is written over "every secondary source listed before this gate (the friction inventory's list,
and the read record of any read-only phase run between explore and this one)", because `task-272`'s
`collect-feedback` runs after `explore`, so its record is not on the inventory's list. Run: `npx jest
test/core/retrospective-notes.test.ts test/core/workflow-repository-conformance.test.ts
test/docs/workflow-md.test.ts` → **33 passed, 33**.

### refactor

- `npm test` → 301 suites, **5727 passed**, exit 0. `npm run test:coverage` → exit 0, All files 99.28 / 97.18 /
  97.33 / 99.71, equal to the W3 B2 gate's line (`grep '^All files' ../devloop-kit/gate-w3b2-cov.log`).
- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json
  --noEmit` → exit 0 each.
- `node scripts/check-governance.cjs --base 1ce84a54` → 1 wf() commit checked, 0 findings, exit 0.
- Load at `HEAD` (`loadWorkflowRegistryAtHead` from `dist/core`): **0 errors, 63 warnings** (61 + the two new
  `W_WORKFLOW_UNBOUND_TOKEN`: `retrospective` `phases[0].checks.post[0]` `secondary-sources.listed`,
  `phases[1].checks.pre[0]` `proposals.disposed`). Reason for both, as task-199 gave for the others: no command
  asserts them yet — they check the friction inventory and the gate's dispositions, which only exist at
  retrospective time; the facilitator and the approver check them by hand until the engine runs `checks`.
  `node dist/cli.js workflow list` → exit 0.
- spec-017 §12's "61 warnings" is a measure dated at task-199's `HEAD`, so it is left as is (no amendment).
- BDD: no feature file names the retrospective workflow or these templates (`grep -rli retrospective
  docs/02_requirements/02_bdd/features/` → nothing); no scenario added.

### review (self, reviewer)

Every AC is pinned by `test/core/retrospective-notes.test.ts` (AC 1 six cases, AC 2 four, AC 3 three) and the
conformance suite (zero errors, exact warning set). Same-class check in the files touched: no other template or
workflow phase claims the retrospective reads something it does not; the task template's existing comment ("Raw
material for … the retrospective, not the retrospective itself") still holds beside the subsection. No pending
amendments.

**Decisions for the approver:**
- D1 — the plan template gains a `## Execution Notes` section (the AC's "equivalent closing section" did not exist;
  `## Handoff` is a checklist, not a running log).
- D2 — the outcome names `covered | element | restated | superseded` (+ `declined | needs-info`) are this task's
  labels for dl-115's four prose outcomes; `task-272`'s read record should reuse them.

### Retrospective

- The pinned "61 warnings" set in the conformance suite makes every check-adding task in B3 (205, 207, 213, 214)
  touch the same array: expect the merge conflicts the batch notes predict (`git diff 1ce84a54 --
  test/core/workflow-repository-conformance.test.ts` → 2 added rows here).
