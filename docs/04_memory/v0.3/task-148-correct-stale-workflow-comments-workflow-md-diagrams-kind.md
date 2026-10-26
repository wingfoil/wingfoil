---
id: "task-148-correct-stale-workflow-comments-workflow-md-diagrams-kind"
type: task
title: "Correct the stale workflow comments, the `WORKFLOW.md` diagrams and the `kind` requirement on the immutable minors"
status: done
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "workflow", "docs", "configuration"]
ref: "dl-092"
bug: ["bug-169", "bug-170", "bug-175"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

Three configuration-document defects that mislead an agent reading the workflows: `initial-design.yaml` / `wingfoil-init.yaml` say the CLI/MCP are "not yet usable" (`bug-169`); `.wingfoil/WORKFLOW.md` draws `release-cycle` without `user-docs`/`e2e-smoke` and `release-planning` without three of its eight phases (`bug-170`); `release-planning.yaml`'s define-scope check and `memory.yaml`'s release `required:` demand `kind` that the immutable pre-`dl-092` minors cannot carry (`bug-175`).

## Acceptance Criteria

- (characterization) `grep -rn -i 'not yet usable' .wingfoil/` → no match; the two headers describe the shipped CLI/MCP, the absence of an engine in v0.3's terms (the workflow commands name steps; P4.10 executes them in v1.0) and the phase plans (`dl-019`).
- (red-first) `bug-170`: a test asserts that every phase name of every workflow `workflows.yaml` includes appears in `.wingfoil/WORKFLOW.md` (dl-116 (A) shape; the bug's step-3 loop as a test), failing before the redraw; `WORKFLOW.md` then draws `release-cycle`'s seven phases, `release-planning`'s eight, `e2e-smoke` with `mcp-registration`, and `user-docs` with its two align phases. `user-docs.yaml`'s `align-agent-docs` `produces:` gains `.wingfoil/WORKFLOW.md` (the bug's proposed guard), with a version bump.
- (red-first) `bug-175`: one rule — the chosen fix (exempt pre-`dl-092` ids in the check, or `kind: minor` on them with the "carry no `kind:`" clause dropped) is decided with the approver at `design` and applied to `release-planning.yaml` and `memory.yaml`; a test reads `minor-v0.3`'s frontmatter against the release `required:` list and the define-scope check's field list and asserts they agree.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** bug fixes only; dl-092 consistency.
- **Features:** P4.1.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q7): bug-175 is fixed by exempting the pre-`dl-092` minors (`minor-v0.1` … `minor-v1.0`) from the define-scope `kind` check; they gain no `kind:`.
- **Notes:** Proposal key: A18 (merged: D32). runs in parallel with task-136 (different files). Tasks that change a workflow later (task-199, task-205, task-212) keep `WORKFLOW.md` in sync as part of their own change. Merged with proposal D32 (redraw of WORKFLOW.md): the redraw lands early and the phase-name test keeps it true; every later task that adds or renames a phase (task-205, task-212, task-213, task-219, task-230, task-222) updates `WORKFLOW.md` in its own change. `bug-175` is owned here, not by task-230.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect)

- **depends_on:** none (`depends_on: []`), so no upstream Execution Notes to read (dl-015). task-150
  (merged) last touched `release-planning.yaml` (1.4) and `WORKFLOW.md` (build-backlog node); both
  kept: the build-backlog node still shows `[title, release, kind]`.
- **Specs:** no tech-spec governs `WORKFLOW.md` or the header comments. `spec-003-workflows-yaml-schema`
  (`approved`) lists the observed check-expression forms; the bug-175 exemption adds one, so §
  "Check expressions" gets a dated Revision (pending amendment below). `dl-092` (`ready`) is the rule
  being reconciled.
- **bug-175 ruling:** approver ruling 2026-09-30 (`release-planning-rel-v0.3-plan` R20, Q7) chose the
  exemption: the pre-`dl-092` minors gain no `kind:`. The fix is applied in the check only; neither
  `memory.yaml` nor any `minor-*` release is edited (`release` and `release-line` are
  `amendable: false`). This narrows the AC's "applied to `release-planning.yaml` and `memory.yaml`":
  `memory.yaml` already states the other half (its `release` `id_pattern` comment declares those ids
  carry no `kind:`), so the check now agrees with it without a second edit. **Approver to confirm.**
- **Check form chosen:** `frontmatter.required: [<fields>] except kind for [minor-v0.1, minor-v0.2,
  minor-v0.3, minor-v0.4, minor-v1.0]` — one string, so the rule is stated once, in the gate that
  applies it. Checks are free strings (`src/workflow/schema.ts`: `const Check = z.string()`), so the
  loader is unaffected.
- **AC classification:**

| AC | Class | Why |
|----|-------|-----|
| 1 — bug-169 headers | characterization | comment-only change; no behaviour, verified by `grep` |
| 2 — bug-170 WORKFLOW.md parity | red-first | new test `test/docs/workflow-md.test.ts` fails on the pre-redraw reference |
| 3 — bug-175 kind rule | red-first | new test `test/workflow/release-kind-rule.test.ts` fails on the pre-fix check |

### red

- Commit `6ad67509`. `npx jest test/docs/workflow-md.test.ts test/workflow/release-kind-rule.test.ts`
  → `Tests: 5 failed, 2 passed, 7 total`:
  - workflow-md: workflow names `e2e-smoke`, `user-docs` missing; 24 phases missing (among them
    `release-cycle/user-docs`, `release-cycle/e2e-smoke`, `release-planning/advance-pinned-build`,
    `triage-bugs`, `reconcile-governance`, `e2e-smoke/mcp-registration`, `user-docs/align-agent-docs`);
  - release-kind-rule: no exemption in the check, and `minor-v0.1/0.2/0.3/0.4/v1.0: kind` missing.
- The parity test matches a name as a whole word (not inside a longer kebab-case name), so `submit`
  matching `release-submit` cannot pass a missing phase. It covers every workflow `workflows.yaml`
  includes, not only `release-cycle`/`release-planning`, as the AC states.

### green

- `6c750163` (bug-175): `release-planning.yaml` 1.4 → 1.5; `define-scope`'s check gains the
  exemption, with a comment naming R20 and the test. `release-kind-rule` → 4/4 passed.
- `94473a6f` (bug-169): `initial-design.yaml` and `wingfoil-init.yaml` 1.0 → 1.1. The headers now
  say the CLI and MCP server ship and read this repository's configuration (pinned build, dl-095);
  that there is no workflow engine — the workflow commands read and name a phase's steps but run
  none, step execution (P4.10) is v1.0 — so actions are carried out through the Memory verbs or by
  hand against a `plan` (dl-019). The `config.init` inline comment says this `.wingfoil/` predates
  `wingfoil init`. `grep -rn -i 'not yet usable' .wingfoil/` → no match (exit 1).
- `715fdc4d`: test fix found while going green — Mermaid labels write line breaks as the two
  characters `\n`, so a name opening a label line (`\nbackbone`) failed the whole-word match; the
  test now reads `\n` as whitespace. No assertion weakened.
- `44082d4e` (bug-170): `WORKFLOW.md` redrawn — `release-cycle` with its seven phases and the
  sub-workflow each includes; `release-planning` with its eight steps (define-scope's node now says
  `memory.submit`, the full required list and the exemption; record-adrs gains approve); new
  `user-docs` and `e2e-smoke` sub-diagrams (`mcp-registration` included); phase names on the
  inception/specification nodes; the second phase of `bug-ingest`/`decision-log-ingest`/`adr-ingest`;
  the release-line `approve` node says `memory.approve` (was `element.set_state(active)`); Roles
  Summary updated for the new phases. `user-docs.yaml` 1.1 → 1.2: `align-agent-docs` `produces:`
  gains `.wingfoil/WORKFLOW.md` and a post-check naming the parity test. The bug's step-3 loop now
  counts `triage-bugs:3 reconcile-governance:3 advance-pinned-build:3 user-docs:5 e2e-smoke:5
  mcp-registration:2 align-agent-docs:4`.
- `f2d80394`: same-class — `CLAUDE.md` §6 and `.wingfoil/README.md` named `align-agent-docs`'
  outputs without `WORKFLOW.md`; both now name it.

### refactor (gates, with the pending spec-003 amendment in the working tree)

- `npm test` → `Test Suites: 202 passed, 202 total`, `Tests: 3372 passed, 3372 total`.
- `npm run test:coverage` → All files 98.85 stmts / 95.35 branches / 95.18 funcs / 99.56 lines; no
  `src/` change, so coverage is main's.
- `npm run lint` exit 0; `npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` exit 0.
- `npm run build && node dist/cli.js workflow list --format json` exit 0, empty stderr, 23 workflows;
  `npx jest test/core/workflow-diagnostics.test.ts` → 41 passed.
- BDD: no ACs touch a `.feature`; none changed.

### review (reviewer)

- AC 1 met: `grep -rn -i 'not yet usable' .wingfoil/` → no match; headers as above.
- AC 2 met: parity test green; `produces:` gained `WORKFLOW.md`, version bumped (1.2).
- AC 3 met per ruling R20 (check only); `release-kind-rule` reads `minor-v0.3` (and every release
  under `docs/04_memory/planning/`) against `memory.yaml`'s release `required:` and the check.
- doc-versioning: each YAML bumped once from its last committed version (release-planning 1.4→1.5,
  user-docs 1.1→1.2, initial-design/wingfoil-init 1.0→1.1); `WORKFLOW.md`, `CLAUDE.md`,
  `.wingfoil/README.md` carry no `version`.

### Review fixes (independent review: approve with fixes)

| Fix | What | Classification | Evidence |
|-----|------|----------------|----------|
| F1 | `WORKFLOW.md` claimed `plan-next-release-line` reuses `align-agent-docs`; reworded: `dl-025` leaves it open, only `user-docs` declares it | documentation (no test) | `grep -rn align-agent-docs .wingfoil/workflows/` → only `user-docs.yaml` |
| F2 | `initial-design` `seed-releases`: action passes `kind: "minor"` (`id_pattern` `{kind}-{version}`); post-check requires `kind` with `define-scope`'s pre-`dl-092` exemption; `WORKFLOW.md` seed-releases node follows (same class). No second version bump (1.1 on this branch; its comment names bug-175 too) | red-first | `npx jest test/workflow/release-kind-rule.test.ts` before the fix → `Tests: 2 failed, 4 passed, 6 total` (commit `7ab1eea5`); after → 6 passed |
| F4 | `CLAUDE.md` overlong user-docs line rewrapped | documentation (no test) | line widths now within the surrounding block |

Gates after the fixes (with the pending spec-003 amendment in the working tree): `npm test` →
`Test Suites: 202 passed, 202 total`, `Tests: 3374 passed, 3374 total`; `npm run lint` exit 0;
`npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0. No `src/` change.

### Pending amendments (approver)

- `spec-003-workflows-yaml-schema` — § "Check expressions" lists the exemption form, plus a dated
  Revision (2026-10-02). Proposed `--reason`: "task-148 (bug-175): the frontmatter gate's exemption
  form `frontmatter.required: [...] except <field> for [<id>, ...]`, which release-planning 1.5 uses on
  define-scope and initial-design 1.1 on seed-releases for the releases added before dl-092, is listed
  among the observed check forms. No schema field changes."
