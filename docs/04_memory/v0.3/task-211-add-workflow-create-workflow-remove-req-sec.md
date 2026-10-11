---
id: "task-211-add-workflow-create-workflow-remove-req-sec"
type: task
title: "Add `workflow create` and `workflow remove`, with the REQ-SEC-07 referrer check"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "cli", "security"]
ref: "spec-017"
bug: []
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-194-check-workflows-against-memory-yaml-dna-yaml-state", "task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head"]
tmpl_version: 260703
---

## Description

`create <name> (--kind main|sub | [--startable] [--includable]) [--element] [--description]` writes `.wingfoil/workflows/custom/<name>.yaml` (one phase `step-1`) and appends it to `workflows.yaml` in one `wf(workflow): create <name>` commit. `remove <ref>` refuses built-ins, workflows still included elsewhere (all referrers in `details`) and workflows with an open instance, otherwise deletes file and manifest line in one `wf(workflow): remove <name>` commit. Under `dl-066` option 1 no directive references a phase, so neither side checks the other.

## Acceptance Criteria

- (red-first) BDD P4.8 sc. 1–3 with the positional name: file under `custom/`, never `built-in/`; in-flight instances untouched; `workflow already exists: <name>` exit 1 and no overwrite (also when only the file exists on disk, `dl-086`); invalid name, `--kind` with a boolean, or neither → exit 2.
- (red-first) BDD P4.9 sc. 1–3 plus the new scenario: `built-in workflows cannot be removed`; `cannot remove '<name>': included by '<referrer>'`; `cannot remove '<name>': open instance <id>` (`CONFLICT`); a modified `workflows.yaml` is refused by the write guard.
- (red-first) The created file loads with zero diagnostics errors through task-136–task-194.
- (characterization) `dl-066` option 1 amendments: `P3.3-directive-remove.feature:9` drops "or workflow step"; REQ-SEC-07 names `roles.yaml` as the directive half's referrer source with phases covered through `role`; P4.19 sc. 2 reworded for v0.4; P4.8/P4.9 `--name` → positional and the P4.9 open-instance scenario; `06_features.md` P4.8 "interactive" marked post-v0.3 — each with a `doc-versioning` bump.
- (characterization) `dl-030` remainder (E sweep): the still-included refusal is asserted with a test citing `dl-030`, and the TSDoc in `src/core/directive-assign.ts` that says "P4.9's workflow half of clause (b) has no owner in v0.2" points at this command.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §7.7, §7.8, §10, §11; dl-066 option 1 (P3.3:9, REQ-SEC-07, P4.19 sc. 2 rescope); dl-030; REQ-SEC-07.
- **Features:** P4.8, P4.9.
- **Notes:** Proposal key: A15. the `wf(workflow): create|remove` scopes are declared non-Memory by task-126.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-211-add-workflow-create-workflow-remove-req-sec`, worktree `../.wf2-wt/task-211`, cut from
`main` at `3e692099` (pre-batch main for the governance and claims checks: `0671d035`, W3 B6); start
`8587c7d7` (`wf(task): start … [backlog → in-progress]`). `bug: []`, so no bug status syncs.

### design (architect)

**`depends_on` read (dl-015).** All three are `done`, and so are the two models for parity, task-217 and
task-226 (`grep -H "^status:" docs/04_memory/v0.3/task-{129,194,198,217,226}-*.md`).
- `task-129`: a surplus operand is refused by the registrar (`extraOperandsReason`) before any operation
  code runs, for every registered command, so `workflow create a b` / `workflow remove a b` exit `2` with no
  code here; the integration test drives one such case.
- `task-194`: `loadWorkflowRegistryAtRev` / `AtHead` (`src/core/workflow-registry.ts`) is the loader plus the
  core checks at one commit, a core or loader error thrown as a `DiagnosticsError` (`VALIDATION`, exit 1).
  AC 3 ("loads with zero errors through task-136–task-194") is exactly this function.
- `task-198`: `readDeductionSnapshotAtHead` + `deduceWorkflowState` give the open instances
  (`Deduction.instances`, each `instance.workflow`); `remove`'s open-instance refusal reads them, and its
  `<ref>` resolves an open instance id to its workflow as `show` does (`showWorkflow`,
  `src/core/workflow-list-show.ts`).
- `task-217` / `task-226` (the parity model): a new mutating command updates `CORE_MODULES`, the dry-run table
  (`test/cli/dry-run.integration.test.ts`, count 18 → 20), the rosters (`test/core/production-registry.test.ts`,
  `test/core/parity.test.ts`, `test/mcp/read-only-agent-channel.test.ts`), `docs/cli-reference.md`, spends its
  `PLANNED` rows of `test/docs/name-resolvability.allowlist.ts` (four rows name task-211:
  `grep -n "task-211" test/docs/name-resolvability.allowlist.ts` → 94, 96, 205, 207), and records spec-006 §3,
  spec-008 §2/§11/§12, spec-017 and spec-004 §4.1 (task-226's decision 9) as pending amendments.

**Specs and DLs.** `spec-003`, `spec-005`, `spec-006`, `spec-008`, `spec-017` are `approved`; `dl-030`,
`dl-066`, `dl-086` are `ready` (`grep -H "^status:"` on each). `dl-066` option 1 is the ratified answer
(`spec-003` line 933: "`dl-066` option 1 (approve `d1ad0a8b`)"; `release-planning-rel-v0.3-plan` line 600).
`spec-017` §7.7, §7.8, §10, §11 define both commands; nothing in them needs a change before green. §8 defines no
result shape for either command: decision 5 proposes one, recorded in the pending amendment.

**Measured before red.** `grep -c "workflowCreate\|workflowRemove" src/core/index.ts` → `0`.
`grep -n "or workflow step" docs/02_requirements/02_bdd/features/p3-directives/P3.3-directive-remove.feature`
→ line 10 (the task says `:9`; the line is 10). `grep -n -- "--name" …/P4.8-workflow-create.feature` → lines 9, 21.
`grep -rn "P4.9's workflow half" src/` → `src/core/directive-assign.ts:248`. This repository ships no built-in
workflow (`.wingfoil/workflows/built-in/` holds a `.gitkeep`; `init` scaffolds none, `src/storage/templates.ts`
`BUILTIN_WORKFLOWS_DIR`), so the built-in refusal is tested on a fixture that places one there.

**AC classification (T1, `testing` directive).**

| AC | Class | Why |
|---|---|---|
| 1 — BDD P4.8 sc. 1–3, positional name; duplicate (also file-only, `dl-086`); invalid name / `--kind` with a boolean / neither → 2 | **red-first** | no `workflowCreate` operation (grep above) |
| 2 — BDD P4.9 sc. 1–3 + open instance (`CONFLICT`); modified `workflows.yaml` refused by the write guard | **red-first** | no `workflowRemove` operation |
| 3 — the created file loads with zero errors through task-136–task-194 | **red-first** | no file is created today |
| 4 — `dl-066` option 1 document amendments (P3.3:10, REQ-SEC-07, P4.19 sc. 2, P4.8/P4.9 positional + open-instance scenario, `06_features.md` P4.8 "interactive" post-v0.3) | **characterization** (documentation) | text edits, checked by the grep that shows each; no test is fabricated for a sentence |
| 5 — `dl-030` remainder: the still-included refusal asserted by a test citing `dl-030`; the `directive-assign.ts` TSDoc points at this command | the test is **red-first** (it needs the command, so it fails until green — classified by what it is, not by the label the AC carries); the TSDoc edit is documentation | — |

**Decisions (for the approver to confirm at review).**
1. **Code.** `src/workflow/create.ts` renders the new file (pure); `src/workflow/manifest-edit.ts` appends or
   removes one `include:` entry of `workflows.yaml` in place (pure, comment-preserving); `src/core/workflow-create-remove.ts`
   holds the two operations, registered as `workflowCreate` / `workflowRemove` (`mutates: true`) in the
   `workflow` module, so the derived verbs are `workflow create` / `workflow remove` and the MCP Tools (v0.4)
   `workflow.create` / `workflow.remove`.
2. **Prospective load (AC 3 by construction).** Before writing, both commands load the registry as it would be
   after the commit: `HEAD`'s files with the new file and the edited manifest (or the file removed and the
   edited manifest) overlaid, through the same loader and core checks (`loadWorkflowRegistryAtRev` gains an
   optional overlay). Any `spec-003` error refuses the command (`VALIDATION`, exit 1, message
   `workflow '<name>' would not load: <first error>` for `create`, `cannot remove '<name>': the workflows
   would not load: <first error>` for `remove`; every diagnostic in `details`). This catches what no
   dedicated check names: an `--element` type `memory.yaml` does not declare, removing the last startable
   workflow (`E_NO_MAIN_WORKFLOW`) or the last entry (`include` needs one). Warnings of the prospective load are discarded (the real load after the commit
   reports them). Without it a successful command could leave `workflow list` failing.
3. **`--kind` is written as the booleans** `dl-109` K1 (a) makes canonical: `--kind main` → `startable: true`,
   `--kind sub` → `includable: true`; `--startable` / `--includable` as given. The file carries `name`, the
   declaration, `description` and `element` when given (double-quoted when not a plain name), `version: 1.0`,
   and `phases: [ { name: step-1 } ]` — no role, so the phase is a checkpoint the user replaces.
4. **Usage errors (exit 2, before the identity pre-flight, task-125):** a missing `<name>` (the one
   missing-operand form); a name outside `[a-z][a-z0-9-]*` → `invalid workflow name '<name>' (allowed:
   [a-z][a-z0-9-]*)` (`spec-003` `E_WORKFLOW_NAME_INVALID`'s wording); `--kind` other than `main`/`sub` →
   `invalid workflow kind '<k>' (allowed: main, sub)` (`spec-003`'s, BDD P4.1 sc. 3); `--kind` with a boolean →
   `--kind cannot be combined with --startable or --includable (declare one or the other)`; neither →
   `missing required argument: --kind, --startable or --includable` (the shape of `agent execute`'s
   `--next or --element`).
5. **Result shapes** (`spec-017` §8 gains them, pending): `CreateResult { baseline, name, file, startable,
   includable, commit }`, `RemoveResult { baseline, name, file, commit }`; `baseline` is the `HEAD` the command
   decided at. Console: `created workflow <name> (<file>)` / `removed workflow <name> (<file>)` and the sha.
6. **Refusal order.** `create`: usage → identity → initialized project → registry at `HEAD` (a `spec-003` error
   is `VALIDATION`) → name loaded at `HEAD` (`CONFLICT`) → confinement of both targets → the target on disk
   (`dl-086`, `CONFLICT`, same message) → write guard on the target and on `workflows.yaml` → in-place edit →
   prospective load → commit. `remove`: usage → identity → initialized project → registry + deduction at `HEAD`
   → `<ref>` (name, else open instance id → its workflow; else `unknown workflow: <ref>`) → built-in
   (`requireCustomAsset`, REQ-SEC-07 clause (a)) → included by (`CONFLICT`, all referrers ascending in
   `details.referrers`, the first named) → open instance (`CONFLICT`, all ids ascending in
   `details.instances`, the first named) → confinement → write guard on the file and on `workflows.yaml` →
   in-place edit → prospective load → commit. The referrer source is `include:` alone (`spec-017` §7.8,
   `dl-066` option 1).
7. **The manifest edit is in place or refused.** A block `include:` list gains the new entry after its last
   item, at that item's indentation; `remove` deletes the item line whose value resolves to the removed file.
   The result is parsed again and must equal the old `include` plus (or minus) that one entry, else `CONFLICT`
   `workflows.yaml cannot be edited in place: …` (a flow-style `include: [ … ]` among them) — no whole-file
   rewrite, so no `--force` (none is specified). With no `workflows.yaml` at all, `create` writes one holding
   `include:` and the new entry (the prospective load then refuses an includable-only first workflow,
   `E_NO_MAIN_WORKFLOW`). The manifest's own `version:` is not raised: no writer of a config file raises it
   (`directive assign` leaves `roles.yaml`'s: `grep -c version src/directives/roles-edit.ts` → `0`), and the
   version-bump gate is this repository's, on its own files.
8. **One commit, both files**, `wf(workflow): create <name>` / `wf(workflow): remove <name>`, through
   `writeAndCommit` (so `--dry-run` plans it by construction, task-210), then `verifyCommittedPaths` on both
   paths (the post-commit alarm `directive create` / `remove` run on their one path).

### red (qa)

`63b6836d`: `test/core/workflow-create-remove.test.ts` (AC 1–3, AC 5 on the registered operations: P4.8 sc. 1–3
with the file-only duplicate of `dl-086`, every create form loading at `HEAD` with zero errors, the seven usage
errors, an unknown `--element` type, the write guard on `workflows.yaml`; P4.9 sc. 1–3, the open instance named or
given by its id, an unknown and a missing `<ref>`, the write guard on the manifest and on the file, the last
startable workflow), `test/workflow/manifest-edit.test.ts` (the in-place include edit and the scaffold, pure),
`test/cli/workflow-create-remove.integration.test.ts` (exit codes 0/1/2 and the console on `dist/`), and two rows
of `test/cli/dry-run.integration.test.ts` (`workflowCreate`, `workflowRemove`: count 18 → 20, a `retired`
workflow in the fixture) plus two refused dry-run rows. Run: `npx jest test/core/workflow-create-remove.test.ts
test/workflow/manifest-edit.test.ts test/cli/workflow-create-remove.integration.test.ts
test/cli/dry-run.integration.test.ts` → **39 failed, 28 passed** (67), 4 suites failed: every new case on the
missing operations (`workflowCreate is not registered`), `manifest-edit.test.ts` on its missing modules, the
dry-run completeness test on the count; the 28 that pass are the dry-run table's other rows and refusals.

`5afec5c4` — **back to red once, before green** (dev-loop's `tests.unchanged(since: red)`): green's first run of
the dry-run table failed on its own helper. `hunkLines` ended a hunk only at `diff --git`, and a plan's `diff`
concatenates per-file diffs with no such line between them, so the second file's `---`/`+++` pair read as hunk
lines. No mutating operation had planned two paths before these two. The fix ends a hunk at a `---` line followed
by `+++`; the commit holds that test file only, so green touches no test file.

### green (developer)

`b0b7f766`: `src/workflow/create.ts` (`renderCustomWorkflow`), `src/workflow/manifest-edit.ts`
(`withIncludeAdded`, `withIncludeRemoved`), `src/core/workflow-create-remove.ts` (`workflowCreate`,
`workflowRemove`, the console renderers), registered as `workflowCreate` / `workflowRemove` in the `workflow`
module of `src/core/index.ts`; `loadWorkflowsYamlAtRev` and `loadWorkflowRegistryAtRev` take an optional overlay
of repository-relative paths (design decision 2). `npx jest test/core/workflow-create-remove.test.ts
test/workflow/manifest-edit.test.ts test/cli/workflow-create-remove.integration.test.ts` → **49 passed**;
`npx jest test/cli/dry-run.integration.test.ts` → **33 passed** (after `5afec5c4`).

### refactor (developer)

- `287a1611`: `workflow remove`'s two `CONFLICT` refusals also carry `details.issues` (one `included by '<w>'` /
  `open instance <id>` line each), the channel `errorDetails` (`src/core/error-details.ts`) gives both surfaces:
  `details.referrers` alone reached neither the CLI nor MCP. The TSDoc of `src/core/builtin-asset.ts` and
  `src/core/directive-assign.ts` no longer says the workflow half of REQ-SEC-07 clause (b) has no owner (AC 5).
- `35c9d0d4`: the rosters (`test/core/production-registry.test.ts`, `test/core/parity.test.ts`,
  `test/mcp/read-only-agent-channel.test.ts`) list the two operations; the four `PLANNED` rows of
  `test/docs/name-resolvability.allowlist.ts` naming task-211 are spent (`grep -c task-211` → `0`). **Two entries
  are added** to `test/docs/enumeration-parity.allowlist.ts`: `spec-004 §4.1 tools`, surplus `workflow.create` /
  `workflow.remove`, `TOOLS_V04` — the class task-226's decision 9 added `workflow.finalize` to (decision 9 below).
  `test/core/workflow-create-remove-arms.test.ts` (new file): REQ-SEC-01, an uninitialized project, no commit, no
  manifest, a flow-style include, a file outside `custom/`, confinement (a symlinked target; a symlinked
  `custom/`), the two refusal detail lists, the post-commit alarm on both, the renderers → 15 passed.
- `cd992f83`: `docs/cli-reference.md` (two entries; the `--dry-run` list; the `HEAD` bullet of "Git side
  effects"), `docs/user-guide.md` §7 (one sentence), and AC 4: `P3.3-directive-remove.feature` drops "or workflow
  step" (`grep -c "or workflow step" …/P3.3-directive-remove.feature` → `0`); REQ-SEC-07's Fit Criterion names
  `roles.yaml` as the directive half's referrer source, phases through their `role`, and `include:` plus open
  instances as the workflow half's; P4.19 sc. 2 checks the role-transitive binding; P4.8 takes the positional
  name (`grep -c -- "--name" …/P4.8-workflow-create.feature` → `0`) and marks interactive creation post-v0.3;
  P4.9 gains the open-instance scenario; `docs/01_vision/06_features.md` 1.12 → 1.13 (2026-10-11), P4.8's two
  rows say "interactive post-v0.3", and `00_index.md`'s row is re-synced (`test/docs/vision-index.test.ts` → 13
  passed). The BDD files and the SARD carry no `version:` field (`grep -c "^\*\*Version" …` → `0` on each), so
  doc-versioning has nothing to bump there.
- Spec amendments (pending, uncommitted, below): spec-004 §4.1, spec-006 §3, spec-008 §2/§11/§12, spec-017
  §7.7/§7.8/§8/§10. With them in the tree, `npx jest test/docs test/workflow test/core/workflow test/core/builtin
  test/core/directive test/lint` → **1125 passed**.
- `328e5e49`: `test/workflow/manifest-edit-arms.test.ts` (new file) — the include edit's refusals (not YAML, an
  include of mappings, an edit that does not read back, an unterminated quote) → 4 passed; with
  `manifest-edit.test.ts`, `src/workflow/manifest-edit.ts` 100 / 90.69 / 100 / 100.

Gates (with the pending spec amendments in the working tree):
- `npm run test:coverage -- --maxWorkers=2` (dl-170 slot via `waitslot.sh`, load 3.1 at start) → **386 suites, 7153
  tests passed**; All files 99.27 % statements, 97.14 % branches, 97.74 % functions, 99.69 % lines (log
  `devloop-kit/task-211-cov.log`). The W3 B5 gate (`gate-w3b5-cov2.log`): 99.3 / 97.22 / 97.93 / 99.7 — main has
  moved since, so the comparison is indicative. In that run `src/core/workflow-create-remove.ts` 98.87 / 97.84 /
  96.29 / 100 (uncovered: 141, a non-`DiagnosticsError` rethrow; 266, the manifest's confinement in `remove`),
  `src/workflow/create.ts` 100, `src/workflow/manifest-edit.ts` 95.89 / 83.72 / 100 / 96.49 before the arms file
  above (run after it, so the figure above is the targeted one).
- `npm run lint` exit 0; `npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` exit 0 (under the slot).
- `node scripts/check-governance.cjs --base 0671d035` → 5 `wf()` commits checked, 0 findings (before submit).

### review (self, reviewer)

| AC | Status | Evidence |
|---|---|---|
| 1 | met | `workflow-create-remove.test.ts` P4.8: the file under `custom/` (`existsSync` of the `built-in/` path is false), the manifest gaining one line with every comment kept, one commit `wf(workflow): create <name>` holding exactly the two paths; sc. 2 the instance's plan bytes and frontier keys unchanged; sc. 3 loaded name, built-in name, file-only (`dl-086`); seven `UsageError`s; CLI exits 0/1/2 in `workflow-create-remove.integration.test.ts` |
| 2 | met | P4.9 sc. 1 (file and include line gone, one commit, registry without it), sc. 2 (`CONFLICT`, first referrer named, all in `details`), sc. 3 (`built-in workflows cannot be removed`), the open instance (`CONFLICT`, named or by instance id), the write guard on `workflows.yaml` and on the file; CLI exits 1 |
| 3 | met | four create forms, then `loadWorkflowRegistryAtHead` reports no error and the declared facts (`AC 3` case); the prospective load refuses before writing (unknown `--element` type, last startable, includable-only first workflow) |
| 4 | met (documentation) | the greps in refactor's third bullet; `cd992f83` |
| 5 | met | "sc. 2 (dl-030 …)" in `workflow-create-remove.test.ts`; the TSDoc at `src/core/directive-assign.ts` (`grep -n "task-211" src/core/directive-assign.ts`) |

Same-class fixes in touched files: `builtin-asset.ts`'s module doc said `workflow remove` did not exist and its
clause-(b) half had no owner (fixed with the `directive-assign.ts` sentence); the `workflow` module's description
(`src/core/index.ts`) now names create and remove. Not fixed here (files this task does not touch): see
"Candidate findings" in the report.

**Decision 9 (for the approver).** As task-226's decision 9: the `enumeration-parity` allowlist gains two
entries although the batch notes say an allowlist only loses entries. `spec-004` §4.1 must list
`workflow.create` / `workflow.remove` under §4.2's bijection (`spec-004 §4.1 tools vs CORE_MODULES` reported both
as missing until the amendment), and the production server registers no Tool before v0.4, so each is the
documented `TOOLS_V04` surplus.

**Decision 10 (for the approver).** `test/cli/dry-run.integration.test.ts`'s `hunkLines` changed at
`5afec5c4`, a red commit of its own, not in green (see red).

### Pending amendments (approver)

Left uncommitted in the worktree; the coordinator runs `memory amend` at the review gate.
- `spec-004-mcp-surface-contract` — `--reason "task-211 ships workflow create and workflow remove, registered mutates: true, so section 4.1 gains the workflow.create and workflow.remove Tool rows that section 4.2's parity rule requires; both Tools are served from v0.4 with the others (P5.2.3). No URI, Resource or other Tool changes."`
- `spec-006-core-domain-api` — `--reason "task-211 registers workflowCreate and workflowRemove in CORE_MODULES, so the two section 3 rows lose their planned marker. Their MCP Tools stay v0.4; no other row changes."`
- `spec-008-cli-grammar` — `--reason "task-211 ships workflow create and workflow remove: section 2's --dry-run list gains both, section 11's committed-HEAD row gains both with the registry their commit would leave and the filesystem row gains create's target check, and section 12 gains create's --kind, --startable, --includable, --element and --description with their usage refusals and remove's positional. No exit code changes."`
- `spec-017-workflow-commands-and-state-deduction` — `--reason "task-211 implements sections 7.7 and 7.8 and records what they left open: --kind is written as the dl-109 booleans, the include entry is edited in place or the command is refused, both commands load the registry their commit would leave and refuse a spec-003 error before writing, and the refusal order of remove. Section 8 gains CreateResult and RemoveResult, section 10 two rows. No deduction rule changes."`

### Retrospective

- The dry-run table's diff helper assumed one path per plan; the first two-path plans (`workflow create` /
  `remove`) exposed it at green, which `tests.unchanged(since: red)` sends back to red (`5afec5c4`). Evidence:
  `npx jest test/cli/dry-run.integration.test.ts` → 2 failed before `5afec5c4`, 33 passed after.
- `details.referrers` reached no surface: `errorDetails` (`src/core/error-details.ts`) reads only `issues` and
  `diagnostics`, so a refusal's structured `details` key is invisible unless it is also an `issues` line
  (`287a1611`). Proposal: say so in `spec-005` §3, or have `errorDetails` render arbitrary string arrays.
- `X_cli-cmds.md` still spells `workflow create [--name NAME]` and `workflow remove [--name NAME]
  [--verify-includes]` (lines 169–170), which `spec-017` §7 removed; left for its owner (candidate finding).
