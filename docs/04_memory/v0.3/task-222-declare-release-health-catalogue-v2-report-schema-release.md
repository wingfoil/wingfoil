---
id: "task-222-declare-release-health-catalogue-v2-report-schema-release"
type: task
title: "Declare the release-health catalogue v2, its report schema and the release-health workflow"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "release-health", "workflow-config"]
ref: "dl-089"
bug: ["bug-299"]
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands", "task-213-write-retrospective-notes-during-release-templates-retrospective-workflow"]
tmpl_version: 260703
---

## Description

The two catalogues are fixed in a versioned file, not chosen per run. v2 adds the fix share (Q18/Q19), the process-conformance measures P (dl-131), the external visibility snapshot as `info` metrics (dl-130), bug net flow (dl-100 §4 (a)) and a mechanical Q15 definition (dl-116).

## Acceptance Criteria

- (characterization) `docs/06_health/metrics.yaml` (catalogue v2) holds G01–G15, Q01–Q19, D01 and the new P and external entries, each with id, definition, scope, kind, direction/tolerance; D01 is O (dl-131), with dl-089's equivalence criterion (≥ 90 % agreeing, every critical scenario passing).
- (characterization) a JSON schema for `release-health-<version>.json` and the `.md` layout; `dna.yaml` `paths:` gains the `health` entry for `docs/06_health/` (dl-089 (A)).
- (characterization) `release-health.yaml` (measure → compare → propose, roles per dl-089 §1) added; `release-cycle.yaml` runs it between `publishing` and `retrospective` (D01 on major/minor only); `retrospective.yaml` `explore`/`additional-points` read it and `retro-*` gains `## Release health`; versions bumped; zero load errors.
- (red-first) a test validates `metrics.yaml` against the catalogue rules (unique ids; every metric has scope/kind; a `retired` metric keeps its entry).
- (characterization) `.wingfoil/WORKFLOW.md` draws `release-health`; task-148's phase-name test stays green.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-089 §1, §2 (`{health-dir}` (A)), Actions 3–4; dl-133 §1 (Q18, Q19); dl-131 Action 8 (P measures); dl-130 step 3 / Q2 (a); dl-100 §4 (a); dl-116 Action 2 (Q15 definition).
- **Features:** P4.1.
- **Notes:** Proposal key: D14. `script.run(...)` tokens bind through `bindings.yaml` (dl-090); until P4.10 the scripts run by hand. `dl-090` Action 4: the `script.run(...)` tokens of this workflow are bound in task-199's `bindings.yaml`. `dl-114` Action 3 (cost metrics from the run records) is optional in the catalogue, decided at design.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B2 (2026-10-02, `task-141`'s independent review).** REQ-STATE-10 (`docs/02_requirements/03_sard/03_state-context.md`, ratified 2026-10-01) cites the catalogue v2 process-conformance entries that this task declares: add the P entries its fit criterion lists (checks 1-6, byte-identical reruns), and give REQ-STATE-10 its user story and BDD scenario, which it still lacks.
- **Handover from wave 3 B3 (2026-10-09, `task-207`'s review; W3 B3 follow-ups).** `docs/07_gates/` is a new
  numbered folder, used by the e2e-smoke gate's report (`e2e-smoke.yaml` `gate` `produces:`
  `docs/07_gates/rl-{release.release-line}/rel-{release.version}-e2e-smoke.md`, `task-207`): fold it into the
  numbering ruling `bug-299` asks for.

## Execution Notes

### design (architect, 2026-10-09)

- **depends_on read (dl-015).** `task-199`: every action token must resolve (built in or `bindings.yaml`), project
  tokens take `key: value` arguments only, and a later workflow keeps `test/core/workflow-repository-conformance.test.ts`
  green. `task-213`: `retrospective.yaml` 1.4 (`### Retrospective` read first, `proposals.disposed` with six outcomes) —
  the release-health proposals ride that check unchanged.
- **Specs / decisions cited:** dl-089, dl-133, dl-131, dl-130, dl-100, dl-116, dl-111, dl-117, dl-101, dl-114 are all
  `ready` (`grep -m1 '^status:' docs/04_memory/design/dls/dl-{089,100,101,111,114,116,117,130,131,133}-*.md`); the
  options taken are those of their approve commits' `Reason:` (`git log --grep='approve dl-089'` etc.). spec-002 and
  spec-017 are `approved`: their edits are pending amendments (below).
- **Scope found at design, beyond the AC list:**
  - `paths.health` cannot ride `.passthrough()`: `node -e "require('./dist/core').loadWorkflowRegistry('.')"` printed
    `Warning: .wingfoil/dna.yaml: unknown field(s) ignored: paths.health` — every command on this repository would.
    `health` becomes a declared category holding exactly one directory (like `runs`): `src/dna/schema.ts`, the `paths`
    positional description, `docs/cli-reference.md`, spec-002 Categories (pending amendment). AC 2 gains a red-first half.
  - The catalogue v2 also carries the entries other ratified DLs route to it: G16 (`dl-111` Action 4), G08 measured
    against the attribution rule (`dl-117` Action 3, so floor 100 %), G15's duplicate-id scan (`dl-101` Action 4,
    wording only), Q20 bug net flow (`dl-100` §4 (a), floor ≥ 0). `dl-114` Action 3 (cost metrics, optional): **not
    added** — no run record exists here yet (`ls docs/06_runs` → no such directory), so a definition would be a guess.
    `dl-100` §5 (WIP limit) is not added: its approve `Reason:` records no option (`edd953ed`).
  - `bug-299` (+ the B3 handover on `docs/07_gates/`): one number per folder, in the order the release flow writes
    them — `06_runs` (kept; code and tests pin it), `07_gates` (kept; `e2e-smoke.yaml` and its test pin it),
    `08_health` (new), `09_retrospectives` (was `06_retrospectives`, a path only `retrospective.yaml`, its test and
    `task-272`'s AC named; `ls docs/06_retrospectives` → absent). Declared in `dna.yaml`'s `paths` comment; only
    `health` is a category, since only it is read by a command. This overrides AC 1's literal `docs/06_health/`
    (decision for the approver).
  - The REQ-STATE-10 handover (task-141 review): US-6-12 in Journey 6, two scenarios in `P1.2-versioning-audit-trail.feature`,
    and the SARD traceability line no longer says "no BDD scenario yet".
- **AC classification (testing directive):**

| AC | Class | Why |
|---|---|---|
| 1 — catalogue v2 content | characterization | a data file; pinned by the live-catalogue tests |
| 2 — report schema, `.md` layout | characterization | documents; pinned by schema/layout tests |
| 2 — `paths.health` declared | **red-first** | new loader behaviour: no unknown-field warning, one directory |
| 3 — release-health.yaml, release-cycle, retrospective, versions, zero errors | characterization | configuration; pinned by the conformance suite at HEAD |
| 4 — catalogue rules test | **red-first** | new validator `scripts/release-health/catalogue.cjs` |
| 5 — WORKFLOW.md draws release-health | characterization | `test/docs/workflow-md.test.ts` (task-148) |

### red (qa)

- `3c16a73d` — `npx jest test/release-health` → `Test Suites: 1 failed`, `Tests: 0 total`: `Cannot find module
  '../../scripts/release-health/catalogue.cjs'` (the validator does not exist).
- `7e31fb4e` — `npx jest test/core/paths-health` → `Tests: 4 failed, 1 passed, 5 total`: the warning, the two-directory
  refusal, the positional description and this repository's `paths.health` fail; `paths health` returning the entry
  already passed (the operation looks a category up by name through `.passthrough()`), kept as characterization.

### green (developer)

- `a17715ed` `feat(dna)`: `Paths.health` (length 1), positional description, cli-reference; `dna.yaml` 1.8 → 1.9
  (`paths.health: [docs/08_health/]`, the numbering comment).
- `062eccc0` `feat(release-health)`: `docs/08_health/metrics.yaml` (version 2, 49 metrics: G01–G16, Q01–Q20, D01,
  P01–P07, E01–E05, a `changes` log per version), `release-health.schema.json`, `report-layout.md`,
  `scripts/release-health/catalogue.cjs` (+ `.d.cts`).
- `92a4e58c` `feat(workflow)`: `release-health.yaml` 1.0 (measure qa → compare facilitator → propose facilitator,
  dl-089 §1; D01/P06 major/minor only; dl-089 §5's immediate bugs in propose); `release-cycle.yaml` 1.2 → 1.3;
  `retrospective.yaml` 1.4 → 1.5; `bindings.yaml` 1.2 → 1.3 (`release-health.measure` / `.compare` → `node
  scripts/release-health/{measure,compare}.cjs --release <vX.Y[.Z]>`, `args` pattern); `workflows.yaml` 1.3 → 1.4.
- `npx jest test/core/paths-health test/release-health` → `Tests: 24 passed, 24 total`.

### refactor (developer)

- `b4e71fe3`: WORKFLOW.md (Delivery diagram, `### Release Health` section with `measure`/`compare`/`propose`, roles,
  bindings paragraph), `.wingfoil/README.md` tree, `CLAUDE.md` §6 chain; conformance suite: +3 unbound checks,
  checkpoint `release-health.propose` (26 → 27). `5d87dddd`: US-6-12, P1.2 scenarios, SARD (a backticked script path
  that does not exist yet tripped `test/docs/name-resolvability.test.ts`; reworded to cite `task-231`).
- `4faafa4c`: lint (`no-explicit-any` in the schema test), and `test/core/retrospective-notes.test.ts` pinned
  `version: 1.4` exactly — now `>= 1.4` with the 1.4 entry still required in the header (task-272 re-bumps again).
- Gates (load average 53–95 throughout, 10 agents):
  - `npm test` (first run) → `Tests: 6 failed, 6075 passed`: `query-latency`, `resource-latency` (perf under load) and
    `coverage-parity` (`spawnSync ETIMEDOUT`) — each re-run alone passed (`Tests: 43 passed` with the fixed
    retrospective-notes suite; `coverage-parity` `6 passed`); `retrospective-notes` was real, fixed in `4faafa4c`.
  - `npm run test:coverage` (after `4faafa4c`) → `Test Suites: 321 passed`, `Tests: 6081 passed`; All files
    99.2 / 97.03 / 97.48 / 99.67 (stmts / branches / funcs / lines) vs W3 B3 gate main 99.2 / 97.01 / 97.48 / 99.67
    (`../devloop-kit/gate-w3b3-cov.log`): not regressing.
  - `npm run lint` → exit 0; `npm run docs:api` → exit 0; `npx tsc --noEmit -p tsconfig.json` → 0;
    `npx tsc -p tsconfig.build.json --noEmit` → 0.
  - `node scripts/check-governance.cjs --base b56e8721` → `2 wf() commits`, `gated: 0 findings`, exit 0.
  - Registry at HEAD (`loadWorkflowRegistryAtHead`): 25 workflows, 91 phases, 0 errors, 69 warnings (all
    `W_WORKFLOW_UNBOUND_TOKEN` on checks; 66 on main).
- Main-sync not run: main moved only by bug-307's triage commits (`git log --oneline b56e8721..main`), and agents merge
  main on the coordinator's word.

### review (reviewer, self)

- AC 1 met: `test/release-health/catalogue.test.ts` "holds G01–G16, Q01–Q20, D01, P01–P07 and E01–E05" and D01's
  component O + criterion `{ agreeing_min: 90%, critical_scenarios: all pass on both runs }`, releases `[major, minor]`.
- AC 2 met: schema + layout tests; `paths.health` tests (5 passed).
- AC 3 met: conformance suite 14 passed at HEAD (zero errors); release-cycle `release-health` sits between
  `publishing` and `retrospective`; retrospective's explore/additional-points/capture name the report and the
  `## Release health` section; four versions bumped (`test/lint/version-bump.test.ts` green in the full run).
- AC 4 met: 13 rule tests (unique ids, scope, kind, floor/direction, name/definition, retired keeps its entry, dropped
  metric refused, unadded/added twice, changes ends at version, non-catalogue input).
- AC 5 met: `test/docs/workflow-md.test.ts` 6 passed.
- Same class fixed in touched files: the other enumeration of the categories (`docs/cli-reference.md`, positional
  description, spec-002) all name `health`.

### Pending amendments (approver)

- `spec-002-dna-yaml-schema` — `--reason "task-222: Categories gains health, the release-health directory (dl-089 §1 (A)), holding exactly one directory like runs; init does not scaffold it."`
- `spec-017-workflow-commands-and-state-deduction` — `--reason "task-222: §12 re-measured with the release-health sub-workflow (25 workflows, 91 phases, 0 errors, 69 unbound-check warnings, 27 checkpoints); no command, rule or diagnostic changes."`
- `task-272-add-a-read-only-collect-feedback-phase-to-the-retrospective-workflow` — `--reason "task-222: bug-299's numbering moves the retrospective folder to docs/09_retrospectives/, so the feedback-triage path follows it."`

### Retrospective

- `paths` categories: spec-002 says `.passthrough()` lets a future category be added "without invalidating existing
  files", but the loader warns on every load, so a project-specific category is not usable silently (`node -e
  "require('./dist/core').loadWorkflowRegistry('.')"` printed the warning). Proposal: decide whether extra categories
  are allowed without a warning.
- spec-017 §12's figures were already stale on main (61 warnings / 27 checkpoints in the text; the conformance test
  pinned 66 / 26 before this task): workflow-changing tasks update the test but not the spec. Proposal: a parity test
  between §12 and the conformance figures, or drop the figures from the spec.
- Exact-version pins in characterization tests (`retrospective-notes.test.ts` `toBe(1.4)`) break the next legitimate
  bump of the same file; `>=` plus "the entry stays in the header" pins the same fact.
