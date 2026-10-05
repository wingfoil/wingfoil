---
id: "task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections"
type: task
title: "Declare phase evidence: `produces` ownership, selections, `awaits`, collections and the Layer-3 bindings file"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "schema", "bindings"]
ref: "dl-104"
bug: []
depends_on: ["task-136-validate-workflows-startable-includable-resolve-phase-include-name"]
tmpl_version: 260703
---

## Description

A phase must say how its completion is known (`dl-104`) and every token must resolve through a binding (`dl-090`). This task adds the `produces` union (`string | { type, path }`), the path-pattern rule, typed selections, `awaits`, collection references (`dna:<path>`, `bindings:<name>`), the optional `.wingfoil/workflows/bindings.yaml` (Layer 3) with the built-in binding table, and their loader diagnostics. `dl-104` Action 2 requires the on-disk error to be removed "in the same change": `retrospective.explore`'s prose `produces` becomes a path here.

## Acceptance Criteria

- (red-first) Loader rows fire on fixtures: `E_PHASE_PRODUCES_NOT_A_PATH`, `E_PHASE_PRODUCES_OWNER_NOT_CREATED`, `E_PHASE_SELECTION_UNTYPED`, `E_BINDING_PARTIAL_INTERPOLATION`, `E_BINDING_BUILTIN_TOKEN`, `E_BINDING_AGENT_CHECK`, `W_WORKFLOW_UNBOUND_TOKEN` (warning in v0.3, exit 0), `W_PHASE_PRODUCES_OWNER_IMPLICIT`, `W_PHASE_ACTION_UNTARGETED`.
- (red-first) `bindings.yaml` validates per Layer 3: exactly one of `run`/`manual`, `run` min 1, `severity` warn|reject default reject, `args` patterns, `collections` with unique keys matching spec-009's ID class; an absent file is no bindings.
- (red-first) The built-in bindings resolve without a `bindings.yaml`: `memory.*` → `wingfoil` with argv; `element.set_state` / `<type>.set_state` / `<type>.sync_state` / `element.set_release` → `manual`; `config.init` → `wingfoil init`; `agent.*` → `agent` (spec-003 built-in table). A resolver function returns `{ kind, argv?, expectedCommit? }` for any token (consumed by task-216).
- (red-first) `retrospective.yaml`'s `explore.produces` is a path pattern (the friction inventory's file), with a `version:` bump; after this task the repository's workflows load with **zero errors** (spec-003 § Diagnostics "Measured"), pinned by a characterization test that task-199 extends.
- (characterization) SARD amended per `dl-090` Action 2: a REQ-SEC requirement for token arguments (argv only, ID class or declared pattern, no shell) in `05_security-compliance.md`, and a REQ-INT-04 clause for check exit codes (0 pass / 1 fail → fallback / 2 misconfiguration, blocked) in `04_integrations.md`, each with a `doc-versioning` bump and traceability to `dl-090`.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-104 D1 (c), D2 (b), D3, D4, D5 (b), Actions 1 (spec half), 3; dl-090 Q1 (a), Q2 (c), Q3 (a), Q4, Q5 (c), Q6 (a)+(b), Actions 1, 2; spec-003 § Evidence, § Selections, § Collections, § Action expressions (built-in table), § Check expressions, Layer 3.
- **Features:** P4.1, P4.11, P4.13.
- **Notes:** Proposal key: A03. `src/workflow/schema.ts`, a new `src/workflow/bindings.ts`, `src/core/loaders.ts`, `.wingfoil/workflows/custom/retrospective.yaml`. The real `bindings.yaml` for this repository is task-199's.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections`,
worktree `../.wf2-wt/task-175`, cut from `main` at `c80167d6`. Start `12407d1a`. `bug: []`, so no
bug status sync.

### design (architect)

**`depends_on` read (dl-015).** `task-136` is `done` (`grep -m1 "^status" docs/04_memory/v0.3/task-136-*.md`).
Its notes leave two things to later tasks that matter here: the success payload kept its
`{ manifest, workflows }` shape because task-136 owned no warning row ("task-204 reshapes the
payload"), and the loader checks live in `src/core/workflow-diagnostics.ts` called once per file.
This task owns the first warning rows, so the loader result gains `diagnostics` (warnings only; an
error still throws `DiagnosticsError`) and `bindings`.

**Specs.** `spec-003-workflows-yaml-schema` and `spec-009-validation-strategy` are `approved`;
`dl-104` and `dl-090` are `ready` (`grep -m1 "^status"` over the four files). spec-003 § Evidence,
§ Selections, § Collections, § Action expressions (built-in table), § Check expressions, Layer 3 and
§ Diagnostics fix every code, severity and rule implemented here. No spec edit was needed at design;
the review added one (`E_BINDING_COLLECTION_KEY`, see "review fixes" and "Pending amendments").

**Design.**
- `src/workflow/schema.ts`: `produces` is `(string | { type, path })[]` (object strict, per spec-003's
  Zod shape); `awaits: { party (min 1), evidence }` strict; `PATH_PATTERN_RE`, `producesPath`.
  Kept in a delimited block, away from the `fallback:` line task-185 extends.
- `src/workflow/bindings.ts` (new): the Layer-3 schema (`CheckBinding`: `run` min 1, `severity`
  warn|reject default reject, `args` compiled as regexes; `ActionBinding`: exactly one of `run` /
  `manual: true`; `collections`: entry keys unique, in spec-009's ID class, key = scalar, else map
  `id`, else `name`), the built-in table (`isBuiltinToken`) and `resolveToken(token, role, bindings)`
  → `{ kind, source, argv?, expectedCommit?, severity? }` for task-216. Built-ins: `memory.*` →
  `wingfoil` with argv `wingfoil memory <verb>` (`--type T` for add); `element.set_state` /
  `<type>.set_state` → `manual`, verbs `[approve, finalize, start]` (the rule under spec-003's verb
  table picks one; it needs `memory.yaml`, so it is the caller's); `<type>.sync_state` → `manual`
  `sync`; `element.set_release` → `manual` `assign`; `config.init` → `wingfoil init`; `agent.*` →
  `agent`, argv `wingfoil agent execute`.
- `src/core/workflow-diagnostics.ts`: one `phaseEvidenceDiagnostics` call per phase after the
  task-136 rows, emitting in table order E_PHASE_PRODUCES_NOT_A_PATH, E_PHASE_PRODUCES_OWNER_NOT_CREATED,
  E_PHASE_SELECTION_UNTYPED, W_WORKFLOW_UNBOUND_TOKEN, W_PHASE_PRODUCES_OWNER_IMPLICIT,
  W_PHASE_ACTION_UNTARGETED; `bindingsFileDiagnostics` for the three E_BINDING_* rows.
- `src/core/loaders.ts`: `bindings.yaml` is read through the same source (working tree or a rev),
  before the workflow files are checked, and its diagnostics are appended last (spec-003 order). A
  bindings file that is not YAML or fails its structural pass leaves W_WORKFLOW_UNBOUND_TOKEN
  undecided (spec-003: a loader diagnostic is not decided when its inputs are missing).
- Readings settled here where spec-003 leaves room: a token's name is the text before its first `(`
  or `:`; a `{<field>}` token for W_PHASE_PRODUCES_OWNER_IMPLICIT is a bare (undotted) placeholder;
  a self-creating workflow's creating phase is the phase holding its first `memory.add`. These
  reproduce spec-003's measurement exactly (below).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — the nine loader rows | **red-first** | none of the codes is emitted on `main` |
| 2 — `bindings.yaml` validates per Layer 3; absent file = no bindings | **red-first** | the file is not read on `main` |
| 3 — built-in bindings resolve without `bindings.yaml`; resolver | **red-first** | `src/workflow/bindings.ts` does not exist |
| 4 — `retrospective.explore` a path, `version:` bump, zero errors pinned | **red-first** | with the AC 1 rule and the old file, the load fails with `E_PHASE_PRODUCES_NOT_A_PATH` (shown below) |
| 5 — SARD REQ-SEC (token arguments) and REQ-INT-04 clause (check exit codes) | characterization (documentation) | — |

### red (developer)

`9a630935`: `test/core/workflow-evidence.test.ts`, `test/workflow/bindings.test.ts`. With the
implementation stashed (`git stash push -- src/... .wingfoil/...`, `bindings.ts` moved out):
`npx jest test/core/workflow-evidence.test.ts test/workflow/bindings.test.ts` → **2 suites failed;
34 failed, 1 passed, 35 total**, plus `Cannot find module '../../src/workflow/bindings'` for the
resolver suite. The one that passes is "a `{ type, path }` entry with an unknown key fails its
structural pass" (on `main` every object entry fails `produces: string[]`). AC 4 red: with the
implementation in place and `retrospective.yaml` stashed, `npx jest test/core/workflow-evidence.test.ts
-t "zero errors"` → 1 failed, `DiagnosticsError: E_PHASE_PRODUCES_NOT_A_PATH phases[0].produces[0]
(workflows/custom/retrospective.yaml)`.

### green (developer)

`1d91ae7b` (`feat(workflow)`): `src/workflow/bindings.ts` (new), `src/workflow/schema.ts`,
`src/core/workflow-diagnostics.ts`, `src/core/loaders.ts`; `retrospective.yaml` **1.1 → 1.2**
(`explore.produces` = `docs/05_plans/rl-{release.release-line}/rel-{release.version}/retrospective-friction-inventory.md`,
moved at review to `docs/06_retrospectives/…`);
`docs/cli-reference.md` (`workflow list` names the new `bindings` / `diagnostics` keys). Existing
tests pinning the old result shape updated (`test/core/workflow-diagnostics.test.ts`,
`test/core/loaders-at-rev.test.ts`: `{ manifest: null, workflows: [], bindings: null, diagnostics: [] }`).
`test/docs/name-resolvability.allowlist.ts`: 15 `PLANNED` entries for names this task ships
(spec-003 / spec-017: the nine codes, `awaits.evidence`) went stale and were removed
(`npx jest test/docs/name-resolvability.test.ts` → "0 stale allowlist entries", 11 passed).
`e70912dc` (`docs(requirements)`): **REQ-SEC-12** "Workflow token arguments reach a command as argv
only" in `05_security-compliance.md`; a "Check exit codes" clause in REQ-INT-04
(`04_integrations.md`), both tracing to `dl-090` Q3/Q4 and Action 2; `00_index.md` registry and
counts (SEC 12, total 45).

**Measured on this repository** (`npm run build && node dist/cli.js workflow list --format json`):
exit 0; 23 workflows, 85 phases; `bindings: null`; 0 errors; warnings
W_WORKFLOW_UNBOUND_TOKEN × 91 (17 action occurrences of 10 distinct names: `npm.pin_advance`,
`git.create_branch`, `git.create_worktree`, `tests.bdd.run`, `git.merge`, `git.remove_worktree`,
`cli.run`, `git.commit`, `git.tag`, `approver.execute`; 74 check entries),
W_PHASE_PRODUCES_OWNER_IMPLICIT × 9 (the nine phases spec-017 §12 lists),
W_PHASE_ACTION_UNTARGETED × 1 (`end-of-life.deprecate`). spec-017 §12 measured 90 at `997e8998`
(13 "distinct tokens" counting `cli.run` / `git.commit` per phase; 73 checks): `git diff 997e8998
HEAD -- .wingfoil/workflows` shows `user-docs.yaml` gained one check since, hence 74.

### refactor (developer)

`20baa6be`: a test for an empty `bindings.yaml` and a `wingfoil` check that is not
`agent execute` (coverage); `awaits` moved next to `produces`, off the `fallback:` line task-185
extends.

| Command | Result |
|---|---|
| `npx jest --coverage --coverageReporters=json-summary` (alone in the worktree) | exit 0; 220 suites / 3940 tests; 98.92 / 95.70 / 95.52 / 99.60 (stmts / branches / funcs / lines) |
| same on `main` `c80167d6`, temporary detached worktree | 98.88 / 95.57 / 95.34 / 99.58 — no regression |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `node scripts/check-governance.cjs --base c80167d6` | exit 0 |

BDD: no test under `test/` runs a P4.1 / P4.11 / P4.13 feature file (`grep -rln "P4.1-workflow-config\|P4.11\|P4.13" test/`
→ nothing), and the ACs add no scenario; the behaviours are covered by the two new suites.

### review (reviewer, self)

- AC 1: each of the nine rows has a fixture with a `toEqual` on code, severity, file, path and
  message (or code+path for variants); table order within a phase pinned; W_WORKFLOW_UNBOUND_TOKEN
  through `workflowList` is `ok` (exit 0) with the warnings in `diagnostics`.
- AC 2: `run`/`manual` exclusivity, `run` min 1, `severity` default and domain, `args` patterns,
  collection key uniqueness / ID class / map key, absent and empty file, YAML failure, rev-loaded file.
- AC 3: `test/workflow/bindings.test.ts` pins every built-in row with `resolveToken(…, null)`.
- AC 4: `test/core/workflow-evidence.test.ts` "load with zero errors" on the live repository.
- AC 5: SARD files declare no version (`grep -n -i version docs/02_requirements/03_sard/0[045]*.md`
  → no version key), so per `doc-versioning` § Scope nothing is bumped; the index counts are updated.
- Determinism: arrays and insertion-ordered records only; bindings sections in a fixed order
  (`checks`, then `actions`).

### review fixes (independent review: approve with fixes; approver rulings 2026-10-05)

- **D1 (a) — collection keys are a loader row.** Red `8e738e52`: three `E_BINDING_COLLECTION_KEY`
  cases (duplicate key, key outside the ID class, map entry with neither `id` nor `name`), each also
  asserting that `W_WORKFLOW_UNBOUND_TOKEN` still fires; `npx jest test/core/workflow-evidence.test.ts`
  → 4 failed, 33 passed (the fourth is the D2 path test). Green `8fee27c9`: the key rules left the
  `BindingsYaml` structural pass (`collectionKeyIssues`, `src/workflow/bindings.ts`) and are emitted
  by `bindingsFileDiagnostics` after the `checks` / `actions` rows, path `collections.<name>[<i>]`.
  The map entry with no key moved with the other two rules (same reason: it would otherwise leave
  the file undecided).
- **D2 (b) — friction inventory outside every Memory path.** `retrospective.yaml`
  `explore.produces` = `docs/06_retrospectives/rl-{release.release-line}/rel-{release.version}-friction-inventory.md`
  (no second version bump: 1.2 is this branch's one bump), pinned by the live-repository test.
- **Nit:** `00_index.md` REQ-INT-04 row traces P4.15 too.
- **Notes corrected:** the design claim "No spec edit was needed" now says the review added one.
- **Merge of `main` (`a350cdd0`, with task-185) — `0dc0e332`.** Conflicts resolved as asked:
  `src/workflow/schema.ts` keeps both blocks (task-185's first) and one Phase doc comment;
  `src/core/workflow-diagnostics.ts` calls `executorDiagnostics` then `phaseEvidenceDiagnostics`.
- **`main` `a350cdd0` fails `tsc`** (`src/agent/discovery.ts:128` calls `atHeadOr` with two arguments;
  task-171 added a `root` parameter). `2d2ea25a` applies the one-line fix main needs; with it,
  `jest`'s globalSetup builds again (without it the whole suite stops at `npx tsc -p tsconfig.build.json`).

| Command (after the merge, pending spec-003 amendment in the working tree) | Result |
|---|---|
| `npx jest --coverage --coverageReporters=json-summary` | exit 0; 229 suites / 4167 tests; 98.96 / 96.03 / 95.80 / 99.60 |
| same on `main` `a350cdd0` + the `discovery.ts` one-liner, temporary worktree | 227 suites / 4113 tests; 98.92 / 95.92 / 95.65 / 99.58 — no regression |
| `npm run lint`, `npm run docs:api`, both `tsc` | exit 0 |
| `node scripts/check-governance.cjs --base c80167d6` | exit 0 |
| `node dist/cli.js workflow list --format json` | exit 0; 23 workflows; W_WORKFLOW_UNBOUND_TOKEN × 91, W_PHASE_PRODUCES_OWNER_IMPLICIT × 9, W_PHASE_ACTION_UNTARGETED × 1; no error |

### Pending amendments (approver)

- `spec-003-workflows-yaml-schema` (uncommitted in the worktree). Proposed `--reason`:
  "task-175's review moved the key rules of a bindings.yaml collection out of the structural pass
  (approver ruling D1 (a), 2026-10-05), because a structural failure left the file undecided and a
  duplicate key silenced every unbound-token warning. Section Diagnostics gains the loader row
  E_BINDING_COLLECTION_KEY, and E_WORKFLOW_COLLECTION_UNRESOLVED keeps the unresolved name and the key
  rules of a dna.yaml list. The Layer 3 example no longer binds tests.coverage with a partial
  interpolation the loader refuses, and the measured count of unbound action tokens reads 10
  distinct names instead of 13. No other code, severity or message changes."

### Decisions for the approver

1. **Loader / `workflow list` payload gains `bindings` and `diagnostics`.** spec-003 says
   `workflow list` reports unbound tokens in `diagnostics` and exits 0; task-204 still owns the
   reshape and the stderr printing of warnings in console format (dl-050), not done here.
2. **The friction inventory becomes a committed file.** *(Superseded at review, ruling D2 (b): it
   lives outside every Memory path, `docs/06_retrospectives/rl-{release.release-line}/rel-{release.version}-friction-inventory.md`.)*
   The v0.2 retrospective plan kept it in the session scratchpad; `dl-104` D3 needs a path an engine can test.
3. **No version bump on the SARD files**: the AC asks for one, but they declare no version and
   `doc-versioning` forbids adding one; the amendment is traced in each requirement instead.
4. `resolveToken`'s `expectedCommit` for a `set_state` lists the three candidate verbs; choosing
   one needs `memory.yaml` and the phase's `approval:`, left to task-216.

### Candidate findings (not filed)

- spec-003 § Diagnostics "Measured" counts 13 distinct unbound action tokens; by name they are 10.
  Wording only, for whoever next amends spec-003 / spec-017 §12.
- *(Settled at review, ruling D1 (a).)* `E_WORKFLOW_COLLECTION_UNRESOLVED` (core, task-194) keeps
  the unresolved name and the key rules of a `dna.yaml` list; a `bindings.yaml` collection's keys are
  `E_BINDING_COLLECTION_KEY`.
