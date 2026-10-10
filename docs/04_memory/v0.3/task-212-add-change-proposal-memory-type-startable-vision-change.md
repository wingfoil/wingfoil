---
id: "task-212-add-change-proposal-memory-type-startable-vision-change"
type: task
title: "Add the `change-proposal` Memory type and the startable `vision-change` workflow"
status: in-review
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "memory", "vision", "configuration", "process"]
ref: "dl-132"
bug: ["bug-270"]
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

After inception the vision can only be changed by hand. `dl-132` adds a `change-proposal` type (`kind: feature | vision`, machine `draft → in-analysis(→ draft) → accepted → scheduled`, plus `deprecated`), its template (the change, the impact analysis per layer with explicit "no impact" entries, the target release), and a startable `vision-change` workflow: capture → impact analysis (approval gate) → scoped downcast (includes the existing `user-story-mapping`, `specification-by-examples`, `volere-requirements` only for the layers the analysis names) → schedule (assigned to a release in the sequencer and the release's `features:`). Configuration only (REQ-SYS-04: a new type needs no code).

## Acceptance Criteria

- (red-first) `memory add --type change-proposal` → `memory submit` → `memory approve` / `reject` walk the declared machine on a fixture copy of this repository's config, with no source change (REQ-SYS-04 fit criterion).
- (red-first) `vision-change` loads with zero errors (task-199's test), is `startable`, its capture phase is self-creating (`memory.add(type: change-proposal)`), and `workflow show vision-change` nests the three included subs.
- (characterization) `COLLABORATION.md` *What you can contribute* gains the fifth row; `.wingfoil/README.md` / `WORKFLOW.md` list the new type and workflow; `memory.yaml` and `workflows.yaml` version bumps.
- (characterization) The downcast subs accept being included from a second workflow (they are `kind: sub` and element-compatible), checked by the loader.
- (characterization) `memory.yaml` declares `change-proposal`'s path and `id_pattern`; its template has sections for the change, the per-layer impact analysis (P / US / BDD / REQ / tasks, an explicit "no impact" allowed per Q2 (ii)) and the target release (from proposal D13).
- (characterization) The REQ-SYS-04 walk is also run on a scratch clone of this repository with the worktree build, transcript in Execution Notes; `WORKFLOW.md` draws `vision-change` and task-148's phase-name test stays green.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-132 Q1 (a), Q2 (ii), Q3 (x), Actions 2–4; dl-109 (startable).
- **Features:** P1.13, P4.1.
- **Notes:** Proposal key: A20 (merged: D13). the feature id for the process (`dl-132` Action 5) is the first output of the process itself, not this task. Merged with proposal D13 (same `dl-132` configuration). A Persona-7 journey (`dl-113`, task-186) is the process's natural first input.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the W2 B4b triage (2026-10-06).** `bug-270` is absorbed here: no test checks
  `docs/01_vision/00_index.md` against the vision files (the index drifted within days of `task-141`'s re-index).
  The `vision-change` workflow's index element (`dl-132`) gains a test that runs `task-141`'s index check over
  `docs/01_vision/` and fails on any mismatch of version, date, line count or section ranges.

## Execution Notes

Branch `task/task-212-add-change-proposal-memory-type-startable-vision-change`, worktree `../.wf2-wt/task-212`,
cut from `main` at `b56e8721` (start `5266512f`; `bug-270` `[planned → in-progress]` at `8bc1018f`).

### design (architect, 2026-10-09)

**Inputs read.** `dl-132` (`ready`; the task implements Q1 (a), Q2 (ii), Q3 (x), Actions 2–4), `dl-109` (`ready`),
`bug-270` (handover), `task-199`'s Execution Notes (the only `depends_on`, `done`: the conformance test reads the
registry at `HEAD`, every deliberately unbound check needs its reason in the notes). Specs: `spec-001`, `spec-003`,
`spec-004`, `spec-010`, `spec-017` are `approved` (`grep -m1 '^status:' docs/04_memory/design/specs/spec-00{1,3,4}*.md
docs/04_memory/design/specs/spec-01{0,7}*.md`).

**The type** (`.wingfoil/memory.yaml` 2.6 → 2.7, configuration only, REQ-SYS-04):
- `change-proposal`, path `docs/04_memory/change-proposals/{id}.md`, `id_pattern: "cp-{n}-{slug}"`,
  `amendable: true` (a proposal is corrected like a decision-log), required `[title, kind]`, declared values
  `kind: [feature, vision]`.
- Machine `sequence: [draft, in-analysis, accepted, scheduled]`, `gates: { in-analysis: { reject: draft } }`,
  `waiting: [accepted]` (accepted → scheduled is the workflow's `schedule` step, no CLI verb); `deprecated` implicit.
- Template `.wingfoil/memory/templates/change-proposal.md` (`tmpl_version: 261009`): frontmatter `title`, `kind`
  (REQUIRED), `feature`, `target_release`, `release` (stamped by `schedule`, the `traceability` meaning),
  `contributor`, `credit`; body *The change*, *Impact analysis* (one subsection per layer: features P*, user
  stories US-*, BDD feature files, SARD REQ-*, delivered tasks/ADRs/specs — each "no impact" allowed, Q2 (ii)),
  *Target release* (proposal D13), *Notes*.

**The workflow** `vision-change` (`kind: main`, self-creating, no `element:`), `workflows.yaml` 1.3 → 1.4:
1. `capture` (product-owner): `memory.add(type: change-proposal)`, `memory.submit` (draft → in-analysis); the
   submit carries the change **and** the impact analysis; `checks.post: frontmatter.required: [title, kind]`.
2. `impact-analysis` (architect): `agent.execute` (the reverse walk of the traceability chain against the
   element's analysis), `memory.approve` (in-analysis → accepted), `approval: { by_role: approver }`,
   `fallback: { step: capture }` (a reject lands on `draft`).
3. `update-vision` (product-owner): apply the change to the vision documents the analysis names, with their
   `doc-versioning` bumps and `00_index.md` in the same commit (`dl-132` element 5); `checks.post: [vision-index.current]`.
4. `downcast-stories` → `user-story-mapping`, `downcast-scenarios` → `specification-by-examples`,
   `downcast-requirements` → `volere-requirements`: each `optional: true` (Q2 (ii): run only for the layers
   the analysis names; skipped once a later phase is complete, `spec-017` §4.10).
5. `schedule` (product-owner): `element.set_release("{change-proposal.target_release}")`,
   `element.set_state(scheduled)`; the sequencer entry and the release's `features:` named in the description;
   `checks.post: [vision-index.current]`.

`vision-index.current` is bound in `workflows/bindings.yaml` (1.2 → 1.3) to `npm test -- test/docs/vision-index.test.ts`,
the `bug-270` test, exactly as `workflow-md.complete` is bound to its suite.

**Spec edits (pending amendments, uncommitted):** `spec-001` (Context type list, worked example, Revision note),
`spec-004` §2.1 `{type}` list (the enumeration-parity gate compares it), `spec-010` (`type` row and Context list),
`spec-003` (the "24 files" count of workflow files becomes 25).

**AC classification** (testing directive; corrected where noted):

| AC | Class | Why |
|---|---|---|
| 1 — REQ-SYS-04 walk on a fixture copy | red-first | the type does not exist: `memory add --type change-proposal` fails today |
| 2 — `vision-change` loads, startable, self-creating, `show` nests 3 subs | red-first | the workflow does not exist |
| 3 — COLLABORATION row, README/WORKFLOW.md, version bumps | characterization | documentation; evidence by `workflow-md.test.ts`, `version-bump.test.ts` and grep |
| 4 — the subs include from a second workflow, loader-checked | characterization | the loader rule (`E_WORKFLOW_ELEMENT_MISMATCH`, include resolution) exists; the test needs the includer, so it lands with green |
| 5 — path, `id_pattern`, template sections | **red-first** (was characterization) | the template and type entry are new content: a test written first genuinely fails |
| 6 — scratch-clone walk, WORKFLOW.md draws it | characterization | transcript + existing suite |
| bug-270 — vision index test | characterization | the index is correct today with fences parsed (task-141's script reports one false mismatch, `06_features.md` L357–520, only because it hard-codes lines 380/414 as the `#` lines inside fences, which are now 382/416 — corrected at review: `grep -n '^#' docs/01_vision/06_features.md | sed -n '/^38[0-9]:/p;/^41[0-9]:/p'` → `382:`, `416:`); synthetic drift cases prove each mismatch kind is caught |

### red (2026-10-09, `709d0c55`)

`test/core/change-proposal-type.test.ts` (AC 1, AC 5) and `test/core/vision-change-workflow.test.ts` (AC 2; its
AC 4 block was held back to green, being characterization). Run on `709d0c55`:
`npx jest test/core/change-proposal-type.test.ts test/core/vision-change-workflow.test.ts` → **2 suites failed,
15 / 15 tests failed**: the walk with `.wingfoil/memory/templates/change-proposal.md is not committed at HEAD`,
the machine and scaffold tests with no `change-proposal` type, the workflow tests with `vision-change`
undefined. Every failure is the absence of the configuration under test, none a test defect. `main` had not
moved (`git merge-base --is-ancestor main HEAD`), so the red main-sync was a no-op.

### green (2026-10-09, `de774b29`)

Configuration only: `.wingfoil/memory.yaml` 2.6 → 2.7, the new `.wingfoil/memory/templates/change-proposal.md`,
`.wingfoil/workflows/custom/vision-change.yaml` (1.0), `.wingfoil/workflows.yaml` 1.3 → 1.4,
`.wingfoil/workflows/bindings.yaml` 1.2 → 1.3; tests: the AC 4 block, `test/docs/vision-index.test.ts` and its
checker `test/docs/support/vision-index.ts` (`bug-270`). `git diff --stat b56e8721 HEAD -- src/` → nothing: the
type and the workflow need no source change (REQ-SYS-04's fit criterion).
- First commit attempt failed to load: `memory.yaml`'s description, a plain scalar, contained `` `kind: feature` ``
  (`E_YAML_PARSE_ERROR … 274:72`); reworded to "kind `feature`" and the unpushed commit amended.
- AC 4's includer order is manifest order: `vision-change` is listed with the startable mains, before
  `specification-downcast`; the expectation was corrected to that order.
- `npx jest test/core/change-proposal-type.test.ts test/core/vision-change-workflow.test.ts test/docs/vision-index.test.ts`
  → **24 / 24 passed**.

Docs commit `0c557d6f`: `.wingfoil/WORKFLOW.md` (section *Vision Change*, the Change Proposal state machine, roles),
`.wingfoil/README.md` (type list, workflow tree, main count), `COLLABORATION.md` 1.3 → 1.4 (fifth row, `in-analysis`,
feature requests through the Proposal form go to `vision-change`); `test/core/workflow-repository-conformance.test.ts`
gains the one new unbound check (`vision-change` `phases[0].checks.post[0]`, `frontmatter.required`: deliberately
unbound, like every ingest capture's — no command asserts it before P4.12, task-199's reason) and the checkpoint
`vision-change.update-vision` (27 checkpoints); `test/memory/template-wording.test.ts` counts ten scaffolds.

### refactor (gates, 2026-10-09, branch at `0c557d6f`, the four spec amendments in the working tree)

Load average 80–92 during the run (`uptime`, ten B4 agents).
- `npm test`: 322 suites, **6081 / 6083**; the two failures were `test/core/query-latency.test.ts` (REQ-PERF-02
  `memory search` p95 over 1000 ms) and `test/cli/agent-execute.integration.test.ts` (task-218 AC 7, a 434 s
  suite). Re-run alone: `npx jest test/core/query-latency.test.ts test/cli/agent-execute.integration.test.ts` →
  **36 / 36 passed** (load 40); both also passed in the coverage run below. Wall-clock flakes under load; no
  budget touched, and the branch changes no `src/` file (`git diff --stat b56e8721 HEAD -- src/` → nothing).
- `npm run test:coverage`: **322 suites, 6083 / 6083 passed**; All files **99.21 stmts / 97.03 branches /
  97.54 funcs / 99.67 lines**. No source change, so coverage cannot regress against `main` by construction.
- `npm run lint` exit 0; `npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` exit 0.
- `node scripts/check-governance.cjs --base b56e8721` exit 0: "2 wf() commits … gated: 0 findings".
- Version bumps (`test/lint/version-bump.test.ts`, in `npm test`): `memory.yaml` 2.7, `workflows.yaml` 1.4,
  `bindings.yaml` 1.3, `COLLABORATION.md` 1.4 / 2026-10-09; `vision-change.yaml` is new at 1.0.
- BDD: no scenario covers a vision-change process yet; the feature id for it is `dl-132` Action 5, "the first
  output of the process itself, not this task" (Implementation Notes). P1.13's REQ-SYS-04 scenario is pinned by
  AC 1's walk; P4.1/P4.16 (a main composed with `include:`) by AC 2/AC 4.
- Main-sync at the end of refactor: `main` still `b56e8721` (`git rev-parse main`), nothing to merge.

**AC 6 — the walk on a scratch clone, worktree build** (`node dist/cli.js --version` → `0.2.2 (0c557d6f…)`;
script and log in `../.wf2-wt/devloop-kit/task-212-scratch/walk.{sh,log}`). The clone of `0c557d6f` gets one
fixture commit granting a scratch identity the `approver` role (never in the repository); `kind` is filled by
`sed` before the first submit:

```
$ wingfoil memory add --type change-proposal --title Scratch feature request   → cp-001-scratch-feature-request [exit 0]
$ wingfoil memory submit cp-001-…                                             → draft → in-analysis [exit 0]
$ wingfoil memory reject cp-001-… --reason "The impact analysis names no BDD layer."  → in-analysis → draft [exit 0]
$ wingfoil memory submit cp-001-…                                             → draft → in-analysis [exit 0]
$ wingfoil memory approve cp-001-… --reason "The analysis covers every layer." → in-analysis → accepted [exit 0]
$ wingfoil memory approve cp-001-… --reason "probe: …"
error: illegal transition accepted -> (none) for type 'change-proposal'                           [exit 1]
$ git log --format=%s -6
wf(change-proposal): approve cp-001-scratch-feature-request [in-analysis → accepted]
wf(change-proposal): submit cp-001-scratch-feature-request
wf(change-proposal): reject cp-001-scratch-feature-request [in-analysis → draft]
wf(change-proposal): submit cp-001-scratch-feature-request
wf(change-proposal): add cp-001-scratch-feature-request
scratch: approver identity for the walk
```

And on the worktree: `node dist/cli.js workflow show vision-change --format json` → startable, `element` null, the
seven phases with evidence `capture [created, produces]`, `impact-analysis [state]`, `update-vision [record]`, the
three downcast phases `optional`, `[include]`, nesting `user-story-mapping`, `specification-by-examples`,
`volere-requirements`, `schedule [state]`; `node dist/cli.js workflow list` lists `vision-change` among the six
startable workflows.

### review (self, reviewer, 2026-10-09)

| AC | Status | Evidence |
|---|---|---|
| 1 — REQ-SYS-04 walk on a fixture copy, no source change | met | `test/core/change-proposal-type.test.ts` (walk + edge table); `git diff --stat b56e8721 HEAD -- src/` → nothing |
| 2 — loads with zero errors, startable, self-creating capture, `show` nests 3 subs | met | `test/core/vision-change-workflow.test.ts` AC 2; `workflow show` transcript above |
| 3 — COLLABORATION fifth row, README / WORKFLOW.md, version bumps | met | `grep -n 'Change-Proposal' COLLABORATION.md`; `test/docs/workflow-md.test.ts`; `test/lint/version-bump.test.ts` |
| 4 — downcast subs included from a second workflow, loader-checked | met | AC 4 block: each sub `kind: sub`, no `element`, includers `[vision-change, specification-downcast]`, vision-change's only diagnostic its unbound `frontmatter.required` |
| 5 — path, `id_pattern`, template sections | met | AC 5 block of `change-proposal-type.test.ts` |
| 6 — scratch-clone walk, WORKFLOW.md draws it, task-148's test green | met | transcript above; `npx jest test/docs/workflow-md.test.ts` green in `npm test` |
| bug-270 — vision index test | met | `test/docs/vision-index.test.ts`: the real index → no finding; synthetic version/date/lines/start/end/missing cases caught |

Same-class sweep in files touched: every enumeration of the nine types / four ingest mains in `.wingfoil/README.md`,
`.wingfoil/WORKFLOW.md`, `COLLABORATION.md`, `memory.yaml`'s header and specs 001/003/004/010 now names the new one
(`grep -rn "plan, service\|four ingest\|4 ingest" .wingfoil COLLABORATION.md docs/04_memory/design/specs`).
Left as they are, outside this task's files: `CLAUDE.md` (owned by `align-agent-docs`, `dl-025`). At submit these
notes also left `spec-017` §3.4 / §12 to `task-216`; that was wrong (the review found no spec-017 change on its
branch), and the review fixes below add this task's own `spec-017` amendment.

### Decisions for the approver

1. **The impact analysis is written before the submit.** `capture` submits the change and its analysis together;
   `impact-analysis` (architect) checks it by a reverse walk and the approver accepts or rejects it back to
   `draft`. The alternative — analysing while `in-analysis` — would need `memory amend`, which no workflow action
   token names.
2. **An `update-vision` phase** between acceptance and the downcast applies the change to `docs/01_vision/` with the
   index (`dl-132` element 5); the task's phase list named capture → impact analysis → downcast → schedule only. It
   declares no evidence, so it is a checkpoint (completes by `workflow finalize`).
3. **`target_release` and `release` are two fields**: the proposer's request, and the assignment `schedule` stamps
   (`element.set_release("{change-proposal.target_release}")`), so `release` keeps the `traceability` meaning.
   Since the review, `schedule` says the product-owner fills `target_release` first and carries the pre-check
   `change-proposal.target_release is not empty` (an empty value would stamp nothing).
4. **`schedule` has no approval gate**, and the release's `features:` can be edited only while the release is
   `draft` (`release` is `amendable: false`): a change scheduled into a release past `draft` needs the approver's
   one-off hand amend of the release, as for `minor-v1.0` in W1. Ruling wanted: accept this, or gate `schedule`.
5. **`amendable: true`** for `change-proposal`, and the id prefix `cp-`, are my choices (the other types' values
   came from approver rulings).

### Pending amendments (approver)

Left uncommitted in the worktree; the coordinator runs `memory amend`:
- `spec-001-memory-yaml-schema` — `--reason "task-212: dl-132 Q1 (a) adds the change-proposal type in memory.yaml 2.7; the Context's type list, the worked example and its introduction name it, and a dated Revision note records it. No key, rule or diagnostic changes."`
- `spec-004-mcp-surface-contract` — `--reason "task-212: the §2.1 {type} enumeration gains change-proposal (dl-132, memory.yaml 2.7), as spec-001's Context does; no URI, Resource or Tool changes."`
- `spec-010-memory-frontmatter-schema` — `--reason "task-212: the Context's type list and the type and title rows name change-proposal (dl-132, memory.yaml 2.7); its scaffold keeps release in the shared meaning and the proposer's request as target_release. No field or rule changes."`
- `spec-003-workflows-yaml-schema` — `--reason "task-212: the startable vision-change main (dl-132) makes 25 workflow files that validate under the kind alias; no field, rule or diagnostic changes."`
- `spec-011-storage-layout` — `--reason "task-212: the workflows/{built-in,custom}/ split lists six startable kind: main workflows, adding vision-change (dl-132); the layout and its algorithms are unchanged."`
- `spec-017-workflow-commands-and-state-deduction` — `--reason "task-212: §3.4 names vision-change among the self-creating workflows, and §12's consequence lists name it (a self-creating instance, the checkpoint vision-change.update-vision, the Memory-carried approval vision-change.impact-analysis). §12's figures are left to the batch gate, which re-measures them after merging main, where task-222's revision re-measures them first. No rule, command or diagnostic changes."`

### review fixes (independent review: approve with fixes, 2026-10-10)

1. **bug-270 checker** (`test/docs/support/vision-index.ts`) returned `[]` for seven kinds of drift. It now
   reports: a vision file without exactly one document-map row and one section-map block (given the folder
   listing); an unparseable row (strict row pattern, so a malformed `Lines` cell is a finding); a hyphen range
   `Lx-y`; a section-map single-line anchor or a *Quick lookup* reference (single or range start) that is not a
   heading, except the declared prose anchors `INDEX_ANCHORS` (`01_product-brief` L108, `08_mvp-canvas` L57,
   `06_features` L102–104). The seven cases are a new `describe` block in `test/docs/vision-index.test.ts`, each
   mutating the real index once, plus the unmutated folder with coverage → `[]`. The file was committed at green
   (`de774b29`), not red; the earlier synthetic fixture gained a *Quick lookup* section and the "no map" case
   expects a third finding, `quick lookup`, because the section is now required.
2. `spec-011` lines 169–170: six startable mains, pending amendment (below).
3. `test/docs/support/name-resolvability.ts`: `cp` joins `ELEMENT_ID` and `SHORT_ELEMENT_ID`, as `svc` did.
4. `spec-017` §3.4 and §12's lists: pending amendment (below); the §12 figures are the gate's.
5. Decision 3: `schedule` names the product-owner filling `target_release` and pre-checks it is not empty
   (`vision-change.yaml`, still 1.0: the file is not on `main`); the conformance test gains that unbound check,
   the AC 4 test expects it, `WORKFLOW.md`'s node shows it.
6. The fence lines in the design table are corrected to 382/416.

Not this task's: decision 4 waits for an approver ruling; the `ingest/` branch prefix for `vision-change` runs is
`task-208`'s.

### Retrospective

- The task named four phases; carrying out `dl-132` element 5 needed a fifth (`update-vision`): a decision-log's
  elements and a task's phase list drifted. Evidence: Decisions 2 above.
- `task-141`'s index script, the only check of `00_index.md`, already reported a false mismatch on `main`
  (`06_features.md` L357–520) because its fence lines were hard-coded; the fence-parsing test reports none
  (`bug-270` step 4, re-observed at `b56e8721`).
- A plain YAML scalar holding `` `kind: feature` `` broke `memory.yaml` at HEAD, caught only by the tests that
  read HEAD; nothing lints `memory.yaml` before the commit. Proposal: none beyond the existing tests.
- The submitted notes said `task-216` amends `spec-017` without checking its branch; the review found it does not.
  A claim about another task's work needs the command that shows it (`git diff main...task/task-216-… -- docs/04_memory/design/specs/spec-017*`).
