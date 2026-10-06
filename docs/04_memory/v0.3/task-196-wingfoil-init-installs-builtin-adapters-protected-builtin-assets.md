---
id: "task-196-wingfoil-init-installs-builtin-adapters-protected-builtin-assets"
type: task
title: "`wingfoil init` installs the built-in adapters as protected built-in assets"
status: in-review
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "agent", "init", "security"]
ref: "spec-016"
bug: ["bug-183"]
depends_on: ["task-135-make-init-scan-builtin-templates-secrets-refuse-reinitialize", "task-177-adapter-manifests-load-validate-wingfoil-agents-builtin-custom", "task-188-correct-spec-011-bindings-id-stale-builtin-templates"]
tmpl_version: 260703
---

## Description

The package ships its built-in adapter manifests, and `init` writes them to `.wingfoil/agents/built-in/`, as it does for the P3.8 directive templates (`task-057`), under the same integrity pre-flight (`verifyBuiltinTemplates`, `src/core/init.ts:108`, `:193`). The installed copy pins the launch argv in git history, so two clones launch the same argv (REQ-SYS-07). `custom/` is scaffolded empty.

## Acceptance Criteria

- (red-first) A fresh `init` writes one file per shipped built-in adapter plus an empty `agents/custom/`, all in the single init commit. With a test-only source list (no real built-ins yet), the mechanism is exercised on a fixture manifest.
- (red-first) A built-in manifest that fails the task-177 schema aborts `init` before anything is written (REQ-SEC-10, the same message shape as the built-in directive case).
- (red-first) The built-in adapter sources are secret-scanned before they are written, the same step `spec-007` §4 step 5 asks of the other built-ins. If `bug-038`'s task lands first, this reuses its caller.
- (characterization) Docs with `doc-versioning` bumps: `spec-011` storage layout gains `.wingfoil/agents/{built-in,custom}/`; `REQ-SEC-07` (`05_security-compliance.md`, section "REQ-SEC-07 — Immutable built-in assets") gains built-in adapters in its description and fit criterion (`spec-016` Consequences, recommended at Appendix C). If the approver keeps it an analogy at review, the ruling goes to Execution Notes and the SARD stays untouched.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §2.1 (init installs built-ins); adr-012 point 2; REQ-SEC-07 extension; REQ-SEC-10.
- **Features:** P5.1.1, P5.3.1.
- **Notes:** Proposal key: B06. `src/core/init.ts`, `src/storage/templates.ts` / `layout.ts`, `src/core/builtin-integrity.ts`. There is no `adapter remove` command, so there is nothing to refuse (`spec-016` §2.1).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-196-wingfoil-init-installs-builtin-adapters-protected-builtin-assets`, worktree
`../.wf2-wt/task-196`, cut from `main` at `ed4607a4` (wave 3, batch B1).

### design (architect)

- **depends_on read (dl-015).** `task-135` (`done`): the secret scan already runs inside
  `verifyBuiltinTemplates` after the schema check, so AC 3 reuses that caller rather than adding one
  (`bug-038`'s task landed first, as the AC foresees); its follow-up (dotenv forms) is unrelated.
  `task-177` (`done`): `parseAdapterManifest(text, {name, kind, file})` is the manifest validator, and a
  `built-in` kind requires `verified_with`; `loadAdapter` reads at `HEAD`. `task-188` (`done`): left
  `spec-011` ready for the `agents/` extension.
- **Specs cited are approved:** `spec-016`, `spec-011`, `spec-007` `approved`; `adr-012` `accepted`
  (`grep -n "^status" docs/04_memory/design/{specs,adrs}/…`).
- **bug-183 is in scope.** It was absorbed into this task by the approver's triage of 2026-10-01
  (`bug-ingest-rel-v0.3-w1b1-review-findings-plan`, "bug-183 → task-196"), though no AC names it. Treated
  as an extra red-first AC: a built-in workflow template must meet the loader's per-file rules.
- **Shape.** A new `src/storage/builtin-adapters.ts` holds the shipped list `BUILTIN_ADAPTERS` (empty:
  the `spec-016` §2.8 built-ins are their own tasks), mirroring `builtin-directives.ts`.
  `templateScaffold(def, adapters = BUILTIN_ADAPTERS)` writes `agents/built-in/<name>.yaml` per adapter
  (a `.gitkeep` while the list is empty, as for `workflows/built-in/`) and `agents/custom/.gitkeep`.
  `BuiltinTemplateKind` gains `adapter`, classified by directory in `builtinSourceOf`, so the existing
  derived-set guard checks every installed manifest with no new wiring. `initWingfoilProject` gains a
  4th, test-only parameter `builtinAdapters` (the AC's "test-only source list"). The minimal
  `scaffoldFiles()` skeleton (P1.1) is unchanged: `agents/` is not P1.1 ground, as `workflows/` is not.
- **Message.** `built-in adapter template integrity check failed: <name>` — the directive message's
  exact shape (AC 2); the secret-scan message is the existing generic `built-in <kind> template secret
  scan failed: <name> (<pattern_id>, line <n>)`.
- **Protection.** No `adapter remove` exists (`spec-016` §2.1), and no operation writes under
  `.wingfoil/agents/built-in/` other than `init` (`grep -rn "BUILTIN_ADAPTERS_DIR" src` → `templates.ts`,
  `builtin-integrity.ts`, `index.ts` only), so there is nothing to refuse; `builtin-asset.ts` is unchanged.

| AC | Classification | Why |
|---|---|---|
| 1 init writes built-ins + empty `agents/custom/` in the init commit | red-first | no `agents/` in the scaffold (`grep -rn "agents/" src/storage` on `ed4607a4`: none) |
| 2 schema-invalid built-in manifest aborts before writing | red-first | files under `agents/built-in/` were not classified, so nothing checked them |
| 3 built-in manifests secret-scanned before writing | red-first | same |
| 4 docs (`spec-011`, `REQ-SEC-07`) | characterization | documentation |
| bug-183 workflow template meets loader per-file rules | red-first | `isValidWorkflowSource` ran the schema only |

### red

Commit `d0b0bb35`: `test/core/init-builtin-adapters.test.ts` (AC 1–3, with a fixture built-in manifest
validated by `parseAdapterManifest` first, so a failure is the seam and not the fixture) and
`test/core/builtin-workflow-loader-rules.test.ts` (bug-183).
`npx jest test/core/init-builtin-adapters.test.ts test/core/builtin-workflow-loader-rules.test.ts --json`:
**15 failed, 5 passed**. The 5 passing are characterizations — the fixture's own validity, the path sort,
and three bug-183 cases that must stay passing (`startable: true` with no kind; an `include` naming a
workflow outside the template; a `W_` warning). Every failure was an assertion, not a compile error
(e.g. the unrecognized-kind message `built-in template integrity check failed: fixture-agent
(unrecognized kind "adapter")`, and `ok: true` where the secret scan must refuse).

### green

Commit `fabe16db`: `src/storage/builtin-adapters.ts` (new), `src/storage/templates.ts`
(`BUILTIN_ADAPTERS_DIR`, `CUSTOM_ADAPTERS_DIR`, `adapterScaffold`, kind `adapter`), `src/storage/index.ts`,
`src/core/init.ts` (the `builtinAdapters` seam), `src/core/builtin-integrity.ts`: an `adapter` policy that
runs `parseAdapterManifest` as a built-in, and `isValidWorkflowSource` now also runs
`workflowFileDiagnostics` over the template as a one-file registry with `namesComplete: false`, failing on
any `error`-severity diagnostic (cross-file rules stay undecided, as the loader leaves them). Same command:
**20 passed**. `npx tsc --noEmit -p tsconfig.json` and `npx tsc -p tsconfig.build.json --noEmit` exit 0.

### docs (AC 4)

- `docs/02_requirements/03_sard/05_security-compliance.md`: `REQ-SEC-07` description, rationale, fit
  criterion and traceability gain built-in agent adapters (keyed on `.wingfoil/agents/built-in/`);
  `REQ-SEC-10`'s description and traceability gain the adapter manifests, since `init` now schema-checks
  them. **This is the approver ruling the AC reserves**: if the approver keeps §2.1's analogy, revert
  the `REQ-SEC-07` hunk and record the ruling here. The SARD file carries no `version` field.
- `spec-011` gains an "`agents/{built-in,custom}/` split" subsection and a dated Revision note — a
  pending amendment (below). It carries no `version` field; its Revision notes are the precedent.
- `docs/cli-reference.md` (`init` entry), `docs/user-guide.md` §3 tree and BDD
  `P5.1.1-init.feature` sc. 1 ("… workflows, agents") name the new directories.

### refactor

Commits `63d104cb` (the integrity module's header names the `adapter` kind) and `fdf2b981` (docs above).
Gates, with the `spec-011` amendment in the working tree, under load average 68–85 (`uptime`) from nine
parallel agents:
- `npm test`: 275 suites, **5088 passed, 1 failed** — `test/core/query-latency.test.ts` (p95 1395 ms vs
  1000 ms). Re-run alone, `npx jest test/core/query-latency.test.ts`: **4/4 passed**. A load flake; no
  budget touched.
- `npm run test:coverage`: 275 suites, 5088 passed, 1 failed — `test/docs/name-resolvability.test.ts`:
  my first `REQ-SEC-07` fit criterion named the path `.wingfoil/agents/built-in/`, which this repository
  does not have. Reworded to "a built-in agent adapter"; `npx jest test/docs/name-resolvability.test.ts`:
  11/11 passed, and `npx jest test/docs …` (17 suites, 105 tests) passed after the rewording. All files
  **99.23 / 96.73 / 96.54 / 99.71**; touched files: `builtin-integrity.ts` and `builtin-adapters.ts`
  100/100/100/100, `templates.ts` 100/96/100/100 (the uncovered branch, line 593, is the pre-existing
  sort comparator's equal case), `init.ts` 98.7/97.5/100/100 (line 297, pre-existing).
- `npm run lint`, `npm run docs:api`: exit 0. `npx tsc --noEmit -p tsconfig.json` and
  `npx tsc -p tsconfig.build.json --noEmit`: exit 0.
- `node scripts/check-governance.cjs --base ed4607a4`: exit 0.
- No CLI command, option, exit code, Memory type/state or MCP surface changed, so no parity amendment
  (spec-005/008/009/001/004) is due; `test/docs/cli-reference.test.ts` passes with the `init` entry
  updated.

### review (self, reviewer)

- AC 1 — met: `init-builtin-adapters.test.ts` › "writes the manifest and an empty agents/custom/, both in
  the single init commit" (`git rev-list --count HEAD` = 1, `git show --name-only HEAD` lists both), and
  the installed manifest loads through task-177's `loadAdapter` as `kind: built-in`.
- AC 2 — met: four broken manifests (unknown key, no `verified_with`, name ≠ basename, non-YAML) each
  return `VALIDATION` `built-in adapter template integrity check failed: fixture-agent`, exit 1, no
  `.wingfoil/`, persistence snapshot unchanged.
- AC 3 — met: a schema-valid manifest carrying a PEM header returns `built-in adapter template secret
  scan failed: fixture-agent (private-key-pem, line 20)`, nothing written. Reuses task-135's caller.
- AC 4 — met, with the ruling below; `spec-011` pending amendment.
- bug-183 — met: neither-startable-nor-includable, kind+boolean conflict and a duplicated phase name now
  fail the P4.17 check; a cross-file `include` and a `W_` warning do not.
- Same-class sweep in touched files: the `BuiltinTemplateKind` doc, `builtinTemplateSources` doc, the
  integrity module header and the `INTEGRITY_POLICY` doc now name the adapter kind.

### Review fixes (2026-10-06, independent review: approve with fixes; status stays `in-review`)

- **F1.** `spec-016` §2.1 still called `REQ-SEC-07` an analogy that "names built-in directives and
  workflow templates only", which became false with `fdf2b981`. §2.1 now says the requirement names
  built-in agent adapters, keyed on location, and `REQ-SEC-10` names their manifests. The SARD line
  offset is replaced by the section name (`dl-075`), and a dated Revision note records the change.
  `spec-016` is approved, so the edit is uncommitted and listed as a second pending amendment below. It
  is dropped if the approver keeps the analogy.
- **F2.** `src/core/builtin-asset.ts`: the header and the `AssetKind` comment now say `REQ-SEC-07` also
  names built-in adapters, which this module does not check because no operation removes one. Comments
  only.
- **F3.** The adapter clause of `REQ-SEC-07`'s fit criterion had no evidence. The new characterization
  test `test/core/builtin-adapter-writers.test.ts` (3 tests) checks two things:
  - the `agent` module registers no mutating operation outside an explicit, empty reviewed list, so
    `agentExecute`'s task must list it;
  - only `src/storage/templates.ts` and `src/agent/discovery.ts` spell the adapter directory in code,
    and only those, the integrity check and the barrels use its constants.

  The SARD sentence now cites `npx jest test/core/builtin-adapter-writers.test.ts`. The test's stated
  limit: a user-configured `memory.yaml` `path` under `.wingfoil/agents/` is configuration, not code.
- The line-offset citation `05_security-compliance.md:77-85` in this task's AC 4 is replaced by the
  section name.
- Gates:
  - `npm run lint` and both `tsc` runs exit 0;
  - `npx jest test/docs` with the touched suites (`builtin-adapter-writers`, `builtin-asset`,
    `builtin-integrity`, `init-builtin-adapters`, `builtin-workflow-loader-rules`, `init-project`,
    `test/storage/templates.test.ts`): 21 suites, 225 tests passed;
  - `node scripts/check-governance.cjs --base ed4607a4` exits 0.

### Decisions for the approver

1. **REQ-SEC-07 extended** (the AC's reserved ruling): built-in agent adapters join built-in directives
   and workflow templates. If the analogy should stay an analogy, revert the `REQ-SEC-07` hunk of
   `fdf2b981` and record the ruling here.
2. **REQ-SEC-10 extended too** (not named by the AC): its description already listed what `init`
   schema-checks, and `init` now checks adapter manifests.
3. **`agents/built-in/.gitkeep` while no adapter ships**, as `workflows/built-in/` is reserved; the
   `.gitkeep` disappears automatically once `BUILTIN_ADAPTERS` is non-empty.
4. **The adapter abort message** `built-in adapter template integrity check failed: <name>` copies the
   directive message's shape; no BDD scenario pins it yet.

### Pending amendments (approver)

- `spec-011-storage-layout` — proposed `--reason`: "task-196 (spec-016 §2.1 and Consequences): a new
  subsection states the agents/{built-in,custom}/ split that wingfoil init now scaffolds, with the
  built-in manifests installed under the same pre-write integrity pass as the built-in directive
  templates and custom/ scaffolded empty. The layout tree is unchanged, because it lists this
  repository's own configuration, which has no agents/ directory. A dated Revision note records it."
- `spec-016-agent-execution` — proposed `--reason`: "task-196 (review F1): the Consequences amendment
  to REQ-SEC-07 landed, so §2.1 no longer calls the rule an analogy. It states that REQ-SEC-07 names
  built-in agent adapters, keyed on the agents/built-in/ location, and that REQ-SEC-10 names the
  adapter manifests init schema-checks. The line-offset citation of the SARD file is replaced by the
  section name. A dated Revision note records it."
