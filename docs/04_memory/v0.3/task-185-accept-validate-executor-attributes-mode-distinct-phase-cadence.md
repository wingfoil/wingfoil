---
id: "task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence"
type: task
title: "Accept and validate the executor attributes `mode` / `distinct_from` and the phase `cadence`"
status: in-review
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "schema"]
ref: "spec-003"
bug: []
depends_on: ["task-136-validate-workflows-startable-includable-resolve-phase-include-name"]
tmpl_version: 260703
---

## Description

`dl-134` §4 (c) and `dl-135` add per-phase `mode` (fresh | resume | reference, default fresh) and `distinct_from`; `dl-105` adds `cadence: once | { recurring: { cron } | { on } }`. The schema accepts none of them today (they pass only through `.passthrough()`). This task adds them with their loader rules, and implements `spec-003` open questions 3–5 by their recommendations, which were settled when spec-003 was approved at gate 5 (no new ruling needed).

## Acceptance Criteria

- (red-first) `E_PHASE_DISTINCT_FROM_UNKNOWN`, `E_PHASE_DISTINCT_FROM_SELF` and `E_PHASE_MODE_NOT_INDEPENDENT` (a `reviewer` or `qa` phase declaring `resume`/`reference`, checked on the raw declaration) fire with spec-003's messages and paths.
- (red-first) OQ4: `mode` or `distinct_from` on a phase without `role` is a loader error (`E_PHASE_EXECUTOR_WITHOUT_ROLE`, raw declaration, an absent `mode` never counts as declared). OQ5: `mode` takes exactly one value.
- (red-first) `cadence` accepts `once`, `{ recurring: { cron: "<5-field expr>" } }` and `{ recurring: { on: <event> } }`, refuses two triggers or an unknown key; the default is `once` and existing files are unchanged.
- (red-first) OQ3: an `on:` event is `<memory-type>-<state>`; the check that the type and state exist runs as a core check in task-194 (listed there).
- (characterization) `workflow list --all` / `show` (task-204) will report the parsed values; here a unit test pins the parsed shape and that no v0.3 code path enforces `distinct_from` at run time (spec-003 release boundaries).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-003 § Execution independence, § Recurring phases; dl-134 §4 (c); dl-135 points 3–4 (schema half); dl-105 R1 (a)+(c); R2 (c); R3 (a); spec-003 open questions 3, 4, 5 (recommendations, settled at gate 5).
- **Features:** P4.1.
- **Notes:** Proposal key: A02. `src/workflow/schema.ts`. Enforcement of `distinct_from` and `tests.unchanged` stays P4.12 (v1.0, `dl-134` Action 6).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence`, worktree
`../.wf2-wt/task-185`, cut from `main` at `c80167d6`. Start `a8a7827f`. `bug: []`, so no bug sync.

### design (architect)

**`depends_on` read (dl-015).** `task-136` is `done` (`grep -m1 "^status" docs/04_memory/v0.3/task-136-*.md`).
Its notes fix the frame this task extends: the loader rows live in `src/core/workflow-diagnostics.ts`
(`workflowFileDiagnostics`, phase rows in table order), `src/workflow/schema.ts` stays structural, and
messages not pinned by BDD are worded by the task (lower case, no trailing period, spec-005 §3.1).

**Specs and decisions.** `spec-003-workflows-yaml-schema` is `approved`; `dl-105`, `dl-134`, `dl-135`
are `ready` (`grep -m1 "^status"` over the four files). spec-003 § "Diagnostics" lists
`E_PHASE_DISTINCT_FROM_UNKNOWN` / `_SELF` / `E_PHASE_MODE_NOT_INDEPENDENT` without a message, and does
not list `E_PHASE_EXECUTOR_WITHOUT_ROLE` (open question 4) at all. Open questions 3–5 were settled by
their recommendations at gate 5 but were still worded as open. Both are closed by a pending spec-003
amendment (below), so the paths and messages the ACs call "spec-003's" are in the spec, not only in
the code. No BDD scenario covers these fields (`grep -rln "distinct_from\|cadence" docs/02_requirements/02_bdd/features/` → nothing).

**Design.**
- `src/workflow/schema.ts`, one delimited block (`---- task-185 … end task-185`, for task-175's merge):
  `PHASE_MODES`, `INDEPENDENT_ROLES` (`reviewer`, `qa`), `CRON_EXPRESSION_RE`, `CADENCE_EVENT_RE`,
  `Cadence`; `Phase` gains `mode: z.enum(PHASE_MODES).optional()` (**no default**, so the parsed value is
  the raw declaration), `distinct_from: z.array(z.string()).optional()`, `cadence: Cadence.default('once')`.
- `cadence` is checked **structurally** (spec-009 structural codes, as for any Zod failure): `once`, or
  `{ recurring: { cron | on } }` with exactly one trigger, `.strict()` at both levels (the AC refuses
  an unknown key). Cron: five whitespace-separated fields of `[0-9A-Za-z*,/-]` (values not range-checked).
  Event (OQ3): `^[a-z][a-z0-9]*(-[a-z0-9]+)+$`; the type/state split needs `memory.yaml` and is task-194's
  core check.
- `src/core/workflow-diagnostics.ts`: `executorDiagnostics` (one delimited block), called after the
  `fallback.step` row, emits in table order: every `distinct_from` unknown entry, every self entry,
  `MODE_NOT_INDEPENDENT`, then `EXECUTOR_WITHOUT_ROLE` once per declared field (`mode` then
  `distinct_from`). Paths `phases[i].distinct_from[k]`, `phases[i].mode`, `phases[i].distinct_from`.
- Release boundary: nothing outside the schema and its loader check reads `distinct_from` (pinned by a test).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — distinct_from unknown/self, mode not independent | **red-first** | no such code emitted on `main` (`grep -rn DISTINCT_FROM src/` → nothing) |
| 2 — OQ4 executor without role; OQ5 one mode value | **red-first** | fields pass through `.passthrough()` unchecked |
| 3 — cadence accepts/refuses, default `once` | **red-first** for refusals and default; the "accepts" cases are guards that pass on `main` via passthrough |
| 4 — OQ3 event shape `<memory-type>-<state>` | **red-first** (shape); existence check is task-194's AC 2 |
| 5 — parsed shape pinned; no run-time enforcement of `distinct_from` | **characterization** per the task; it also fails on `main` because the shape does not exist yet (no fabricated red: the test is the AC's own) |

### red (developer)

`test/core/workflow-executor-cadence.test.ts` (`20cabab0`).
`npx jest test/core/workflow-executor-cadence.test.ts --json` → **29 failed, 10 passed, 39 total**.
The 10 passing are the guards: legal modes per role, absent `mode` not declared, `accepts mode
fresh|resume|reference`, the five `accepts <cadence>` cases. Every failure is an assertion
(`expected loadWorkflowsYaml to throw`, `success` true where false expected, missing default), none
a compile error.

### green (developer)

`68187041` (`feat(workflow)`): `src/workflow/schema.ts`, `src/core/workflow-diagnostics.ts`.
`npx jest test/core/workflow-executor-cadence.test.ts` → 39 passed.
`npm test` → one failure, `test/mcp/read-only-resources.test.ts:390`, which pins a phase's parsed
shape `{ name, optional: false }`: every parsed phase now carries `cadence: 'once'` (spec-003's
`Cadence.default("once")`). Updated in the same commit.

**Behaviour change beyond the ACs:** the `wingfoil://workflows/{name}` MCP resource and every
payload that serializes parsed phases now carry `cadence: "once"` on each phase, as they already carry
`optional: false`. No doc pins that shape (`grep -rn 'optional": false\|optional: false' docs/*.md docs/examples README.md` → nothing).

### refactor (developer)

No refactor commit was needed. Gates, run with the pending spec-003 amendment in the working tree:

| Command | Result |
|---|---|
| `npm test` | exit 0; 219 suites / 3928 tests |
| `npx jest --coverage --coverageReporters=json-summary` | 98.89 / 95.6 / 95.37 / 99.58 (stmts / branches / funcs / lines). `main` `c80167d6`, same command in a temporary detached worktree: 98.88 / 95.57 / 95.34 / 99.58 (3887 tests). No regression. `workflow-diagnostics.ts` 136/136 stmts, 101/101 branches; `workflow/schema.ts` 38/38 stmts, 12/13 branches (main 10/11: the one uncovered branch is pre-existing) |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

In the coverage run `test/mcp/resource-latency.test.ts` failed once under load (load average ~70,
`uptime`); `npx jest test/mcp/resource-latency.test.ts` alone → 4 passed. Threshold not touched.

### review (reviewer, self)

- AC 1: one `toEqual` per code on the whole diagnostic (code, severity, file, path, message); both
  roles × both non-fresh modes; `fresh` on reviewer/qa and any mode on developer load clean.
- AC 2: `EXECUTOR_WITHOUT_ROLE` one per field on a role-less phase; a role-less phase with no `mode`
  and a reviewer phase with no `mode` load clean (the default is not a declaration). OQ5: a list,
  a one-item list and an unknown value are refused at `phases[0].mode`.
- AC 3: five accepted shapes round-trip; eleven refusals (two triggers, none, unknown key at either
  level, unknown literal, 4/6-field cron, bad cron char, three bad events) fail at
  `phases[0].cadence…`; default `once`; through the loader a bad cron is `E_VALIDATION` at
  `phases[0].cadence.recurring.cron`. Existing files: this repository's workflows load with every
  phase at `cadence: once` and no `mode`/`distinct_from` (test), no workflow file edited.
- AC 4: event shape enforced; the existence check is listed in task-194 (`grep -n "cadence"
  docs/04_memory/v0.3/task-194-*.md` → its AC 2).
- AC 5: parsed shape pinned; a source scan pins that only `core/workflow-diagnostics.ts` and
  `workflow/schema.ts` mention `distinct_from` in `src/`.
- Order: a mixed fixture pins the per-phase table order across all four rows.

### Pending amendments (approver)

- `spec-003-workflows-yaml-schema` (uncommitted in the worktree): diagnostics rows gain path and
  message for the three executor codes and a new `E_PHASE_EXECUTOR_WITHOUT_ROLE` row; § "Recurring
  phases" states the event shape and the structural refusals; the illustrative `Cadence` closes its
  outer object; open questions 3–5 marked settled; dated Revision note (2026-10-05). Proposed reason:
  `--reason "task-185 implements open questions 3-5 as settled at gate 5: the executor rows name their path and message, E_PHASE_EXECUTOR_WITHOUT_ROLE joins the diagnostics table, and Recurring phases states the event shape and the structural refusals of cadence. No existing code, severity or message changes."`
