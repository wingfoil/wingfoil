---
id: "task-153-reconcile-req-state-08-p1-13-scenario-memory"
type: task
title: "Reconcile REQ-STATE-08, the P1.13 scenario and `memory.yaml`'s annotations with `spec-001`, and ship the commented per-type example"
status: done
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "docs", "memory", "init"]
ref: "dl-072"
bug: ["bug-052", "bug-053", "bug-177", "bug-196"]
depends_on: []
tmpl_version: 260703
---

## Description

REQ-STATE-08 (`03_state-context.md:96`), `P1.13-memory-element-schema.feature:17` and `.wingfoil/memory.yaml:56` still name the retired `approved/rejected` default (`bug-052`); `spec-011`'s `memory.yaml` row and `memory.yaml:14,72` still say `values/initial/transitions` (`bug-053`). `dl-072` ratifies the shipped shared `defaults` machine and adds a commented `states:` example on `bug` in the scaffold (S1).

## Acceptance Criteria

- (characterization) the SARD is edited first, then the BDD, then the `[SPEC]` annotations (field provenance rule); `memory.yaml` `version:` bumped.
- (red-first) `wingfoil init`'s `memory.yaml` carries a commented `states:` example on `bug` that, uncommented, loads without error (test).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-072 (A)+S1+S3/S4; spec-001.
- **Features:** P1.13, P5.1.1.
- **Notes:** Proposal key: C36.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-02)

- **Inputs.** `depends_on: []`, so no upstream Execution Notes to read (`dl-015`). Specs cited are
  `approved` and `dl-072` is `ready`: `grep -m1 "^status" docs/04_memory/design/specs/spec-01[01]-*.md
  docs/04_memory/design/dls/dl-072-*.md` → `approved`, `approved`, `ready`; `spec-001` → `approved`.
  `dl-072`'s approve commit `260a2472` ratified (A) + S1 + S3/S4. The bug list carries four bugs:
  `bug-052` and `bug-053` (planned with the task), `bug-177` (absorbed at the triage of 2026-10-01,
  `bug-ingest-rel-v0.3-wave0-review-findings-plan`) and `bug-196` (absorbed 2026-10-02, amend commit
  `38d85d27`). The two absorbed bugs add acceptance this task's AC list does not spell out, recorded
  here (`dl-045`):
  - `bug-177`: `memory.yaml` validation refuses a type named after a configuration commit scope, and
    `spec-001` lists the reserved names.
  - `bug-196`: `spec-010`'s illustrative task frontmatter matches the template, or says it is an example.
- **AC classification** (testing directive):

  | AC | Class | Why |
  |---|---|---|
  | AC1 — SARD, then BDD, then `[SPEC]` annotations; `memory.yaml` `version:` bumped | characterization | documentation; no behaviour changes, the engine already implements `spec-001`'s machine (`test/memory/element-schema.test.ts` scenario 2 was green before the task) |
  | AC2 — `init`'s `memory.yaml` carries a commented `states:` example on `bug` that loads uncommented | red-first | new scaffold content |
  | `bug-177` — reserved type names refused | red-first | new validation rule (`grep -n RESERVED src/memory/schema.ts` reserved only `deprecated`) |
  | `bug-053`, `bug-196` — spec text | characterization | documentation (pending amendments) |

- **Shape of the `bug-177` fix.** One list, `RESERVED_TYPE_NAMES` in `src/memory/schema.ts`; the audit
  reader's `CONFIGURATION_SCOPES` *is* that list, so the reader and the schema cannot drift. The
  refusal is a `MemoryYaml` `.superRefine` issue, the layer that already knows type names (P1.13
  scenario 3), so the loader reports it like every other schema refusal (`E_VALIDATION`, exit 1).
- **Shape of the S1 example.** Five commented lines under `bug`, after its `template:` block, a
  generic chain (`draft, open, in-progress, resolved, closed`, gates `open → closed`,
  `resolved → in-progress`), introduced as an example, not a recommendation (`dl-072` S1/S2: the
  scaffold takes no position on a user's lifecycle).
- **Same-class sweep** (`grep -rn "states.values\|states.initial\|values/initial\|approved/rejected"
  docs/04_memory/design/specs docs/02_requirements .wingfoil src`): besides the bugs' own hits, the
  `status` row and § Validation rules row of `spec-010` and two code comments quoting that row
  (`src/memory/state-machine.ts`) named the retired keys; fixed here. `spec-009`'s quotation of
  `states.values` and `spec-001`'s own history bullets are left (see review).

### red (2026-10-02)

Commit `94990a7c`. Tests: `test/memory/element-schema.test.ts` (P1.13 scenario 4 — 3 refusals driven by
`CONFIGURATION_SCOPES`, the scope list, a near-miss name accepted) and `test/storage/templates.test.ts`
(per template: the example sits under `bug` and changes nothing commented; uncommented it parses
through `MemoryYaml`, gives `bug` its own machine whose every forward edge resolves, and leaves the
other types on `defaults`).
`npx jest test/storage/templates.test.ts test/memory/element-schema.test.ts` → **7 failed, 56 passed**
(3 × `Expected: false / Received: true` for the refusals, 4 × `Expected length: 1 / Received length: 0`
for the missing example). The other two new tests pass on first run: they pin the scope list and the
accepted near-miss, which already held.

### green (2026-10-02)

Commit `177160e4`: `RESERVED_TYPE_NAMES` + the `MemoryYaml` refinement (`src/memory/schema.ts`, exported
from `src/memory/index.ts`), `CONFIGURATION_SCOPES = RESERVED_TYPE_NAMES` (`src/memory/audit.ts`),
`BUG_STATES_EXAMPLE` in `memoryYaml()` and a header pointer to it (`src/storage/templates.ts`). Same
command → **63 passed**. AC1 commits, in the field-provenance order: SARD `d21ca6f6`, BDD `40e0bb2d`
(scenario 2 names `spec-001`'s machine; scenario 3 says `sequence`, not `values`; new scenario 4),
annotations `03e2294d` (`memory.yaml` 2.0 → **2.1**, `task-168`'s fields kept). Comments `84e262a0`,
user guide `d7ad5d68` (§5.1 the example, §5.2 the reserved names).

CLI smoke on a scratch repo with `dist/` (`init --template Scrum`, uncomment the example, commit):
`memory add --type bug` then `memory submit bug-001-smoke` → `draft → open`; `adr` still
`draft → pending`. A committed type `workflow:` → `memory add --type workflow` exits 1 with
`E_VALIDATION types.workflow … type name 'workflow' is reserved: wf(workflow) commits record
configuration, not Memory`.

### refactor (2026-10-02) — gates, with the pending amendments in the working tree

- `npm test` → 208 suites, **3531 passed** (main `ea637c43`: 3522; +9 new).
- `npm run test:coverage` → 98.86 / 95.45 / 95.29 / 99.57 — equal to main's recorded
  98.86 / 95.45 / 95.29 / 99.57 (dev-loop plan, B4 gates).
- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`,
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- `npx jest test/docs/name-resolvability.test.ts` → 11 passed, 0 stale allowlist entries; the
  untriaged count is unchanged at 77, so no new backticked name dangles.
- BDD: P1.13 is driven by `test/memory/element-schema.test.ts` (scenarios 1–4), all green.

### review (reviewer, 2026-10-02)

- AC1 met: commit order SARD → BDD → annotations is `git log --oneline main..HEAD`; `grep -n
  "approved/rejected\|values/initial" docs/02_requirements .wingfoil/memory.yaml` hits only REQ-STATE-08's
  sentence naming the retired machine as retired. Note the `spec-001` reserved-names paragraph the
  annotation cites is a pending amendment, so it lands after the annotation commit (approver to confirm).
- AC2 met: the template tests above; `bug-177`, `bug-053`, `bug-196` met by the tests and amendments.
- Not changed, out of scope: `spec-009` §1 still quotes `states.values`; `spec-001`'s "Errors:"
  sentence names `E_INVALID_MEMORY_SCHEMA`/`E_INVALID_STATE_GRAPH`, codes `grep -rn` finds nowhere in
  `src/` (the loader reports `E_VALIDATION`). Reported to the coordinator, not filed.

### Pending amendments (approver)

Uncommitted in the worktree; the gates above ran with them.
- `spec-001-memory-yaml-schema` — `--reason "Reserves the type names directive, dna and workflow (bug-177) and records that REQ-STATE-08 and its P1.13 scenario now name this spec's default machine, plus dl-072's scaffold shape (task-153)."`
- `spec-010-memory-frontmatter-schema` — `--reason "The illustrative task frontmatter matches the task template and says it is an example (bug-196); the status rows use the sequence encoding, not states.initial or states.values, and state memory.add's initial status as the declared rule: the head of the type's own or default machine (task-153)."`
- `spec-011-storage-layout` — `--reason "The memory.yaml contract names the sequence/gates/waiting encoding, the defaults block and the init scaffold's shape (bug-053, dl-072); the dna.yaml contract cell and the layout tree's dna.yaml line drop conventions, which spec-002 removed (task-153)."`

### review fixes (2026-10-03, coordinator: approve with fixes; no re-submit)

- F1: `spec-011`'s layout tree line for `dna.yaml` dropped `conventions` too (now `paths`); its Revision
  note covers both places; `--reason` updated above.
- F2: `docs/user-guide.md` §5.1/§5.2 paragraphs prefixed "From v0.3,"; the §5.1 one also says to commit
  the edited `memory.yaml` (Memory commands read it at `HEAD`, task-247) and that `bug` documents in a
  state outside the example machine (e.g. `pending`, `approved`) stop being in a valid state.
- Nit: P1.13 feature header names the `sequence`/`gates`/`waiting` encoding.
- `spec-010` `status` row: the initial status is stated as the declared rule — head of the type's own
  machine, or of `defaults.states` (the built-in default when none is declared) — and says `memory.add`
  writes `draft` literally today (`grep -n "'draft'" src/memory/add.ts` → line 204), tracked separately.
- `npx jest test/docs test/memory/element-schema.test.ts test/storage/templates.test.ts` → 84 passed;
  name-resolvability 0 stale entries, 77 untriaged (unchanged).
