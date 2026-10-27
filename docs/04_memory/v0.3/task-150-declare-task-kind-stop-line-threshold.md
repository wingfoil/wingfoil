---
id: "task-150-declare-task-kind-stop-line-threshold"
type: task
title: "Declare a task `kind` and the stop-the-line threshold"
status: done
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "memory-config", "governance"]
ref: "dl-133"
bug: []
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

v0.2's fix share was invisible: six of nine "planned fixes" were feature tasks that absorbed a bug. The task template gains `kind: feature | fix`; the 30 % threshold is stated once for task-221's `start` check and task-222's Q18/Q19. It carries no dependency: the v0.3 tasks are added with the `kind` their backlog entry assigns, and this task declares the field they already carry.

## Acceptance Criteria

- (characterization) `memory.yaml` `task` declares `kind` `[AUTHORING]` (enum `feature|fix`, required from v0.3 tasks on); template carries it; version bumped.
- (characterization) every v0.3 task file carries `kind` (stamped from its proposal; a hand frontmatter edit per §5.1 or the amend verb if shipped); v0.1/v0.2 tasks are not edited — the heuristic (name or `bug:`) is used only by task-233 to backfill.
- (red-first) `memory submit` of a v0.3 task without `kind` is refused (required field), pinned on a scratch repo.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-133 §1 Q1 (b), §3 (Q3 (a)).
- **Features:** P1.13.
- **Notes:** Proposal key: D12. Independent of task-230 after dedupe (only a `memory.yaml` version bump to sequence). See backlog question Q11 on stamping `kind` before this lands.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect) — 2026-10-02

**Inputs.** `depends_on: []`, so no upstream Execution Notes to read (`dl-015`). Sources: `dl-133`
(`ready`) §1 Q1 (b) and §3 Q3 (a) / Q4 (i); `dl-100` (`ready`) §3, which `dl-133` §3 amends; the
v0.3 dev-loop plan §2 ("threshold declared by `task-150`, `start` check by `dev-loop.yaml` v1.6
(`task-221`)"). No tech-spec needs a revision: `spec-001` declares every `memory.yaml` object
`.passthrough()` ("unknown fields preserved, not fatal"), so new `[AUTHORING]` keys need no schema
change, and `spec-010` leaves type-specific required fields to `spec-001`'s
`template.frontmatter.required` ("out of scope here").

**How `kind` becomes required.** `kind` joins the `task` type's `template.frontmatter.required`.
The tool already enforces that list: `memory submit` refuses a missing field
(`missingRequiredFields`, `src/core/index.ts`, "missing required field on submit"), and so does
`memory amend` on a non-draft document (`requireRequiredFieldsKept`, `src/core/memory-amend.ts`).
No code change is needed; the behaviour is new only for `task`, so AC 3 is a genuine red against the
committed configuration.

**Value set.** `feature | fix` is declared as data next to the required list
(`template.frontmatter.values.kind: [ feature, fix ]`), `[AUTHORING]`. The tool does not read it:
there is no value-enum validation of frontmatter anywhere (`grep -rn "values" src/memory/schema.ts`
finds none), the same position as `release.kind` (`minor | patch`, a comment only, `dl-092`). Adding
enum enforcement would be a `spec-001` schema change outside this task's ACs; the value set is
pinned instead by the AC 2 test over the v0.3 task files. Recorded as a candidate finding.

**"Required from v0.3 tasks on" — the effect on older tasks.** The required list has no per-release
scope, so it applies to every task the next time a verb checks it. Checked on the worktree:
- every task outside `docs/04_memory/v0.3/` is `done`
  (`for f in $(ls docs/04_memory/*/task-*.md | grep -v /v0.3/); do grep -m1 '^status:' $f; done | sort | uniq -c`
  → only `status: done`), so none of them is submitted again;
- no older task carries a frontmatter `kind` (`grep -l '^kind:'` outside v0.3 matches three files,
  all on body lines: a `kind: patch` / `kind: custom` code sample, not frontmatter);
- `memory history` reads commits and is unaffected;
- the one reachable effect is `memory amend` on an older task: it is refused with
  `missing required field on amend: kind` unless the amendment adds `kind`. An amendment may add it
  (`kind` is not one of the fields amend refuses to touch: status, release, rejection_reason,
  supersedes, id, type). Pinned by a test, so the consequence is a decision, not a surprise. The
  v0.1/v0.2 files are not edited (AC 2); `task-233` classifies them by the heuristic when it measures.

**Where the threshold lives — `memory.yaml`, on the `task` type.** Options weighed:
- `dev-loop.yaml` `start.checks.pre` argument, like `tests.coverage(min: 80)`: that file is
  `task-205`'s (v1.5) then `task-221`'s (v1.6), and the threshold has a second consumer, the
  catalogue's Q18/Q19 (`task-222`) and its measurement (`task-233`). A value inside one check's
  arguments would be restated by the other.
- `dna.yaml`: project identity, stacks, team and paths; it holds no process rule since `conventions`
  moved to directives (v1.1).
- a directive: prose for agents; the check is mechanical (`dl-133` Q4 (i), "a declared check that
  P4.12 enforces").
- `memory.yaml` `task` (chosen): the rule is a predicate over task documents (`kind`, `status`,
  `release`), and keeping it next to the field it reads states the classification, the "open"
  predicate and the limit once, precise enough to reimplement (`dl-089`'s requirement, quoted in
  `dl-133` §1). `dl-100`'s growth threshold sits on `release` the same way through `task-230`
  (`backlog_committed` on `memory.yaml` `release`).

Declared block (`[AUTHORING]`, read by no code yet): `stop_the_line: { field: kind, counts: fix,
blocks: feature, open: "status != done", scope: release, max_share: 30, at: "dev-loop start" }`
— fire when open fix tasks are **strictly more** than 30 % of the release's open tasks ("exceed",
`dl-133` §3); a release with no open task never fires; fix tasks are never blocked.

**Observation for the approver.** On `main` at `cac8a447` the literal rule already fires: 31 open fix
tasks of 101 open v0.3 tasks, 30.7 %
(`for f in $(git ls-tree --name-only main docs/04_memory/v0.3/ | grep task-); do …; done`, counting
`status != done` and `kind: fix`). The dev-loop plan §2 reads the 33 % planned composition as "not
the in-release tail the rule measures", but `dl-133` §3 counts every open task of the release, so
once `task-221`'s check lands feature pick-up is blocked until the fix share drops. Not decided
here: the declaration follows `dl-133`'s text.

**Version and template.** `memory.yaml` 1.8 → 1.9 (only `memory.yaml` writer in B3). The template
gains `kind: ""  # REQUIRED — feature | fix`. Its `tmpl_version` stays `260703`, following the
precedent of the template's own earlier edits (`dl-045`'s `bug:` list, `task-114` at `4ce1fc5d`,
neither re-stamped); re-stamping would make the 121 v0.3 tasks that already carry `kind` look
scaffolded from a stale template. `wingfoil init`'s generic scaffold (`src/storage/templates.ts`) is
not changed: `kind` is this project's process rule (`dl-133`), not a WingFoil default.

**AC classification (testing directive).**

| AC | Planned | Confirmed | Why |
|---|---|---|---|
| 1 `memory.yaml` declares `kind`, template carries it, version bumped | characterization | **red-first** | the declaration does not exist yet; a test on the committed config fails until green writes it |
| 2 every v0.3 task carries `kind` | characterization | characterization | true before this task (`grep -L '^kind:' docs/04_memory/v0.3/task-*.md` → none; 81 feature, 40 fix); the test passes on first run |
| 3 submit of a v0.3 task without `kind` refused | red-first | red-first | today the repository's `memory.yaml` lets it through |

### red (developer) — 2026-10-02

`test/core/task-kind.test.ts`, commit `2dc6045d`. It reads this repository's working-tree
`.wingfoil/memory.yaml` and task scaffold (`loadMemoryYaml`), the v0.3+ task files, and runs the real
`CORE_MODULES` `memorySubmit` / `memoryAmend` on a temp git repo seeded with that same
`memory.yaml`.

`npx jest test/core/task-kind.test.ts` → **6 failed, 2 passed, 8 total**. The six reds are the
four AC 1 declarations (version 1.8, `required: [title, release]`, no `values`, no
`stop_the_line`, no `kind` scaffold line) and the two AC 3 checks, which fail for the right reason:
`expect(result.ok).toBe(false)` received `true` — the submit without `kind`, and the amend of a
`done` task without `kind`, both go through today. The two passing tests are AC 2 (characterization,
true before the change) and the AC 3 control (a task with `kind` submits).

### green (developer) — 2026-10-02

Commit `94ddf015`, configuration only (`git diff main --stat -- src` → empty):
- `.wingfoil/memory.yaml` 1.8 → **1.9**: `task.template.frontmatter.required: [ title, release, kind ]`;
  `task.template.frontmatter.values.kind: [ feature, fix ]`; the `task.stop_the_line` block
  (`field: kind, counts: fix, blocks: feature, open: "status != done", scope: release,
  max_share: 30, at: "dev-loop start"`); the type `description` names `kind`.
- `.wingfoil/memory/templates/task.md`: `kind: ""  # REQUIRED — feature | fix (dl-133 Q1 (b)) …`
  after `release`; `tmpl_version` unchanged (design).
- Same-class, per `memory.yaml`'s P4.12 alignment rule ("If the two lists diverge, the template is the
  authoritative definition — update the workflow check"): `release-planning.yaml` 1.3 → **1.4**,
  `build-backlog.checks.post: ["frontmatter.required: [title, release, kind]"]`; `.wingfoil/WORKFLOW.md`'s
  build-backlog node shows `✔ P4.12: [title, release, kind]`. `grep -rn "frontmatter.required" .wingfoil/workflows`
  shows no other task check.

First run of the green: `E_YAML_PARSE_ERROR … bad indentation of a mapping entry (118:205)` — the
description's plain scalar contained `kind: feature | fix`; reworded ("declares a `kind`, feature
or fix"). Then `npx jest test/core/task-kind.test.ts` → **8 passed, 8 total**.

### refactor (developer) — 2026-10-02

- `npx tsc --noEmit -p tsconfig.json` first exited 2 (`task-kind.test.ts(55,35): TS2532 Object is
  possibly 'undefined'`, tuple indexing); `releaseOf` now returns `{ major, minor }`. Re-run → exit 0.
- `npm run test:coverage` → exit 0, **189 suites, 3201 tests**, coverage **98.84 / 95.2 / 95.01 / 99.54**
  (statements / branches / functions / lines). `main` per the v0.3 dev-loop plan (B2 gate): 188 / 3192,
  98.84 / 95.24 / 95.01 / 99.54. `src/` is identical to `main` (`git diff main --stat -- src` → empty),
  so the 0.04-point branch delta is run-to-run variance of environment-dependent branches, not this
  change; the 80 % gate holds.
- `npm test` → 188 suites passed, 1 failed: `test/mcp/resource-latency.test.ts` p95 1072 ms vs the
  1000 ms budget, with the other B3 worktrees running jest. Re-run alone,
  `npx jest test/mcp/resource-latency.test.ts` → 4 passed. A load flake, not this change (no `src/`
  diff); the threshold is not touched.
- `npm run lint` → exit 0 · `npm run docs:api` → exit 0 · `npx tsc --noEmit -p tsconfig.json` → exit 0 ·
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- `npm run build && node dist/cli.js workflow list` → exit 0, empty stderr (the edited
  `release-planning.yaml` 1.4 loads).
- BDD: `P1.13-memory-element-schema.feature` has three scenarios (well-formed schema, defaults
  block, undeclared state); none is about a type's fields, and `kind` is `[AUTHORING]`, so no
  scenario is added. No CLI command or help text changed (`docs/cli-reference.md` untouched).

### review (reviewer) — 2026-10-02

| AC | Status | Evidence |
|---|---|---|
| 1 `memory.yaml` `task` declares `kind` (`feature\|fix`, required), template carries it, version bumped | met | `task-kind.test.ts` "AC 1" ×4 green; `memory.yaml` 1.9 |
| 2 every v0.3 task carries `kind`; v0.1/v0.2 not edited | met | "AC 2" green (every non-draft task in `v0.3`+ has `kind ∈ {feature, fix}`); `git diff main --stat -- docs/04_memory/v0.1 docs/04_memory/v0.2 docs/04_memory/v0.2.2` → empty |
| 3 submit of a v0.3 task without `kind` refused, on a scratch repo | met | "refuses to submit a task without `kind`" green: `VALIDATION` `missing required field on submit: kind`, HEAD unchanged, file unchanged |

Also pinned: the effect on older tasks (amend of a `done` task without `kind` refused unless the
amendment adds it). Directives checked: `determinism` (sorted file reads, no clock in the test),
`traceability` (`dl-133` cited at every new key), `doc-versioning` (`memory.yaml` and
`release-planning.yaml` bumped once each; `WORKFLOW.md` and the template carry no `version:`),
`claim-evidence` (each claim above names its command).

**Pending amendments (approver):** none. No approved element was edited.

**Decisions for the approver to confirm.**
1. The threshold lives on `memory.yaml` `task.stop_the_line` (design, "Where the threshold lives").
2. "Exceed" read as strictly more than 30 %; the denominator is every open task of the release.
   Under that reading the rule fires on `main` today (31 / 101 open v0.3 tasks = 30.7 %), which the
   v0.3 dev-loop plan §2's "planned composition" reading does not anticipate.
3. `kind` is required for every task, not only from v0.3: the only reachable effect on the 125
   older tasks, all `done` (`ls docs/04_memory/v0.1/task-*.md docs/04_memory/v0.2/task-*.md docs/04_memory/v0.2.2/task-*.md | wc -l`), is that an amend must add `kind`.
4. The task template's `tmpl_version` is not re-stamped.
5. The `feature | fix` value set is declared but not enforced by the tool.
