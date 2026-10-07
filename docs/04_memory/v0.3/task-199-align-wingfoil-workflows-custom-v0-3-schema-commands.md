---
id: "task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"
type: task
title: "Align `.wingfoil/workflows/custom/` with the v0.3 schema and commands, bind every token, and pin zero load errors"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "workflow", "configuration", "dogfooding"]
ref: "spec-003"
bug: ["bug-224"]
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-175-declare-phase-evidence-produces-ownership-selections-awaits-collections", "task-185-accept-validate-executor-attributes-mode-distinct-phase-cadence", "task-194-check-workflows-against-memory-yaml-dna-yaml-state"]
tmpl_version: 260703
---

## Description

The minor-v0.3 success criterion: every workflow under `.wingfoil/workflows/custom/` loads through the workflow commands with zero errors. Beyond task-175's `retrospective.explore` fix, this task rewrites the nine implicit-owner `produces` in `{ type, path }` form, gives `end-of-life.deprecate` a selection, rewrites `release-planning.build-backlog`'s `{dl.id}`/`{bug.id}` against a selection, removes `git.create_branch`'s partial interpolation (OQ6: `key: value` form, prefix into the binding), splits `e2e-smoke`'s `cli.run("…; …")`, reduces `agent.<x>` actions to `agent.execute` (the instruction moves to the phase `description`, carried by the role's session prompt, `dl-090` Q6 (b)), gives the approval-only phases their Memory action where one exists (`retrospective.approve` = `wf(decision-log): approve retro-{version}`), and writes the first `.wingfoil/workflows/bindings.yaml` (the `dev-loop.refactor.checks.post` bindings that today live in a comment first, then every remaining project token).

## Acceptance Criteria

- (red-first) A characterization-style test loads every workflow at `HEAD` through task-194's function and asserts **zero errors**, plus the exact remaining warning set (codes and paths), so any regression in files or loader is caught (spec-017 §12 last paragraph).
- (red-first) `W_PHASE_PRODUCES_OWNER_IMPLICIT` × 9, `W_PHASE_TOKEN_OUT_OF_SCOPE` × 2 and `W_PHASE_ACTION_UNTARGETED` × 1 are gone; `W_WORKFLOW_UNBOUND_TOKEN` counts only tokens deliberately left unbound, each listed in Execution Notes with its reason.
- (characterization) `workflow show dev-loop` reports each `agent` step as `wingfoil agent execute --workflow <id> --step <key>` and each `set_state` / `sync_state` as `manual` with a declared-verb subject (task-126's list only).
- (characterization) `spec-017` §12's deduction consequences re-measured and recorded: the 28 checkpoint phases and 7 finalize-approval phases listed, and each `produces` rewritten in D3 form no longer mis-completes `dev-loop.design` or `plan-next-release-line`.
- (characterization) Every edited file gets its `version:` bump with a one-line reason in its header comment (`doc-versioning`); `workflows.yaml` too if touched.
- (characterization) `dl-025` remainder (E sweep): `release-line-cycle.yaml`'s `plan-next-release-line` runs `user-docs`' `align-agent-docs` phase (the ratified open question: reuse the same phase), with a `version:` bump citing `dl-025`; the workflow loads with zero errors.

## Implementation Notes

- **Size:** L · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-003 Consequences (alignment list) and OQ6; spec-017 §12; dl-104 Action 2; dl-090 Action 3; dl-079 (verbs in config); plan idea 7; dl-025 remainder (`plan-next-release-line` reuses `align-agent-docs`).
- **Features:** P4.1, P4.11.
- **Notes:** Proposal key: A17. `dev-loop.yaml`'s v1.5 *content* changes are task-205 (after this task, same file). Anyone adding a later workflow (task-212, the `dl-089`/`dl-100` phases) must keep task-199's test green. `bug-134` (`e2e-smoke`'s missing `produces:`) is task-207's, which depends on this task; if its absence leaves a warning here, it is listed with the others. `.wingfoil/workflows/custom/` is also edited later by task-205, task-213, task-221, task-219, task-230, task-222, task-215 — each keeps this task's zero-error test green.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Triage of 2026-10-05 (`bug-224`, split):** only the `initial-design.yaml` `produces:` bare
  `{release-line}` is in scope here (bind it to the release-line's id or version explicitly). Refusing a
  `memory add` release-line value that names no release-line is a separate v0.4 bug.
- **Handover from wave 2 B2 (2026-10-05, `dl-153`, ratified (A)).** `workflows/bindings.yaml` is a `dl-149` file kind: the first `bindings.yaml` this task writes carries `format: 1`, and the loader checks it like the other kinds (`src/validation/format.ts`, `task-251`).
- **Handover from wave 3 B1 (2026-10-07, `task-194`).** `test/core/workflow-core-checks.test.ts` (AC 5) pins this repository's current warning set: 1 × `W_PHASE_FALLBACK_NOT_REENTRANT` (`bug-ingest` `phases[1].fallback.step`) and 2 × `W_PHASE_TOKEN_OUT_OF_SCOPE` (`release-planning` `phases[6].actions[2]` and `[4]`): update it when this task removes them. `spec-017` §12 cites `release-planning.yaml:118,120` (now 123 and 125) and §2 still names `roles.yaml` as a core-check input, which `spec-003` no longer does: correct both. Load through `loadWorkflowRegistryAtHead` from `src/core`.

## Execution Notes

Branch `task/task-199-align-wingfoil-workflows-custom-v0-3-schema-commands`, worktree
`../.wf2-wt/task-199`, cut from `main` at `4fd77678` (start `87d034a2`; `bug-224` `[planned →
in-progress]` `2bc12cde`). Batch W3 B2, merge order 264 → **199** → 198 → …: `task-264` changes
`src/core/workflow-core-checks.ts`, so `main` is merged at the gate and
`test/core/workflow-repository-conformance.test.ts` / `test/core/workflow-core-checks.test.ts` re-run.

### design (architect)

**`depends_on` read (dl-015).** `task-126`, `task-175`, `task-185`, `task-194` are `done`
(`grep -m1 '^status' docs/04_memory/v0.3/task-{126,175,185,194}-*.md`). Carried over:
- `task-126`: the declared verb list is `MEMORY_OPERATIONS` (`src/memory/audit.ts`); the `start` /
  `finalize` / `sync` emitters are the workflow commands' task (`task-216`), not this one.
- `task-175`: `resolveToken` / `isBuiltinToken` / `tokenName` (`src/workflow/bindings.ts`) and the
  loader's Layer 3 read (`loadBindingsFrom`, `src/core/loaders.ts`); "the real `bindings.yaml` for this
  repository is task-199's". Its repository characterization ("task-199 extends") is extended by a new
  suite, `test/core/workflow-repository-conformance.test.ts`, rather than inside `workflow-evidence.test.ts`.
- `task-185`: `mode` / `distinct_from` / `cadence` — no workflow file declares them; nothing to align.
- `task-194`: `loadWorkflowRegistryAtHead` (barrel), the AC 5 characterization to update, spec-017 §12's
  `release-planning.yaml:118,120` (123/125 at `4fd77678`) and §2's `roles.yaml` mention.

**Specs.** `spec-003` and `spec-017` are `approved` (`grep -m1 '^status'
docs/04_memory/design/specs/spec-0{03,17}-*.md`). `dl-153` is `ready`, option (A) (this task's handover);
`dl-025`'s approve commit `1f00a005` rules "Reuse the same phase from plan-next-release-line rather than
defining a second one".

**Measured before** (the build's `loadWorkflowRegistryAtRev(root, 'HEAD')` at `4fd77678`, via `node -e`):
23 workflows, 85 phases, 0 errors, 105 warnings — 92 `W_WORKFLOW_UNBOUND_TOKEN`, 9
`W_PHASE_PRODUCES_OWNER_IMPLICIT`, 2 `W_PHASE_TOKEN_OUT_OF_SCOPE`, 1 `W_PHASE_ACTION_UNTARGETED`, 1
`W_PHASE_FALLBACK_NOT_REENTRANT`. The static reading of spec-003 § "Evidence" written for the new suite
(`measure()`) reproduces spec-017 §12 exactly at `4fd77678`: 28 checkpoints, 7 finalize approvals.

**Design decisions** (each listed for the approver under "Decisions" below):
1. *A selection's types are in scope for its action arguments.* No token could name a selected element,
   so "rewrite `{dl.id}`/`{bug.id}` against a selection" (spec-003 Consequences) needed a rule.
   `build-backlog` gains `where: { type: [decision-log, bug], status: [ready, triaged], release: ["",
   "{release.version}"] }`, its tokens become `{decision-log.id}` / `{bug.id}`, and the core check puts a
   selection's `type` values in scope for action arguments only (`selectedTypes`,
   `src/core/workflow-core-checks.ts`); `{element.<f>}` still names the bound element. spec-017 §4.1 and
   spec-003's row and § "Selections" state it (pending amendments).
2. *`align-agent-docs` is reused through a one-phase workflow, `agent-docs`.* A phase `include` names a
   workflow, never a phase (spec-003 Layer 2), and `release-line-cycle` (element release-line) cannot
   include `user-docs` (element release: `E_WORKFLOW_ELEMENT_MISMATCH`). The phase moves unchanged to
   `agent-docs.yaml` (no `element`); `user-docs.align-agent-docs` includes it, and `release-line-cycle`
   gains an `align-agent-docs` include phase right before `plan-next-release-line`; `workflows.yaml` 1.3
   lists it. Its last check becomes the bound token `workflow-md.complete`.
3. *`dev-loop.yaml` is bumped to `1.41`, not `1.5`*: `task-205`'s title and ACs reserve 1.5 for the
   `dl-134` rewrite, and `task-221` 1.6; `1.5` here would renumber both.
4. *`bug-ingest.triage` loses `fallback: { step: capture }`*: a reject at `open` goes to `closed`
   (memory.yaml `bug` gates), so the fallback could never be re-entered (`W_PHASE_FALLBACK_NOT_REENTRANT`).
   The AC does not list it; the B1 handover (w3-b2 notes) asks to remove "the three warnings" of AC 5.
5. *`retrospective.approve` declares `decision-log.set_state(ready)`*, not `memory.approve`: an untyped
   approve targets the bound element (the release, spec-017 §4.2); the typed form targets the
   decision-log `capture` created and, under `approval:`, emits `approve` (spec-003 verb rule) —
   `wf(decision-log): approve retro-{version} [in-discussion → ready]`.
6. *`end-of-life.deprecate`'s selection*: `type: [release, adr, decision-log]`, `status: [draft, planning,
   in-development, releasing, pending, accepted, in-discussion, ready]` — what the phase description names.
7. *Manual action bindings.* `git.create_branch(task: "{task.id}")` / `git.create_worktree(task: …)`:
   open question 6 keeps the `task/` prefix out of the value, and an argv binding cannot add it
   (`E_BINDING_PARTIAL_INTERPOLATION`), so the binding is `manual` and the prefix stays git-conventions
   §1's. `git.merge`, `git.remove_worktree`, `git.commit`, `git.tag`, `npm.pin_advance`, `cli.run`,
   `approver.execute` are `manual` too, each with its reason in `bindings.yaml`. `git.commit(message:
   "release {release.version}")` keeps a literal around a placeholder inside a token value: legal while
   its binding is manual; a `run` binding would need a whole-value argument.
8. *`workflow show` does not ship yet* (`node dist/cli.js workflow --help` lists only `list`; it is
   `task-204`'s). AC 3 is verified on what `workflow show` / `next` report per step: `resolveToken`
   (`--workflow <id> --step <key>` are the caller's operands, `TokenBinding.argv`).
9. *`dl-153` (A) rides here*: `BINDINGS_YAML_FORMAT = 1` (`src/validation/format.ts`),
   `format: formatField(…)` in `BindingsYaml`, `newerFormatIssue` before the structural pass in
   `loadBindingsFrom`.

**AC classification** (testing directive, T1):

| AC | Class | Why |
|---|---|---|
| 1 — zero errors + exact warning set at HEAD | red-first | the pinned set is new; the suite fails at `4fd77678` |
| 2 — the 9 + 2 + 1 codes gone, unbound = deliberate | red-first | needs the rewrite and the selection-scope rule |
| 3 — agent → `agent execute`; set/sync_state manual + declared verb | characterization | `resolveToken` already resolves every `agent.*` and `set_state`/`sync_state` so (`task-175`); passes at `4fd77678`. The added "one agent step per phase" assertion is new and red |
| 4 — §12 re-measured, D3 owners | red-first (reclassified) | the lists (27/6) and the `{ type, path }` owners are produced by this task's edits; calling it characterization would fabricate a green |
| 5 — version bump + reason per edited file | characterization | evidence by command (refactor); the four config files are also guarded by `test/lint/version-bump.test.ts` |
| 6 — release-line-cycle reuses `align-agent-docs` | red-first (reclassified) | a new include phase; fails at `4fd77678` |
| dl-153 (A) — bindings `format` | red-first | `format: 1` drew `Warning: .wingfoil/workflows/bindings.yaml: unknown field(s) ignored: format`, `format: 2` loaded |
| `tests.coverage(min: N)` = jest threshold | characterization | `jest.config.js` `coverageThreshold.global` is 80 ×4; passes at `4fd77678` |

### red

`2aa87815`: new `test/core/workflow-repository-conformance.test.ts`; `test/core/format-key.test.ts`
gains the `workflows/bindings.yaml` kind; `test/core/workflow-core-checks.test.ts` gains the selection
scope tests and its AC 5 expects no core diagnostic. Run with the config edits uncommitted and the code
unchanged (`npx jest` over the three suites): **26 failed, 138 passed, 164** — 10 in the conformance suite
(AC 1, 2, 4, 6, one-agent-step, bindings), 14 bindings format cases (2 baselines × `format: 1`, two newer-
format, four malformed), the selection-scope case and AC 5. Passing as expected: AC 3's resolution test,
the verb-rule test, the coverage-threshold test, the iterate-filter guard.

### green

`cda2ed63`: the workflow files, `agent-docs.yaml`, `bindings.yaml` (`format: 1`, 11 check and 10 action
bindings), `workflows.yaml` 1.3, `WORKFLOW.md`, the format key and the selection scope (code above);
`test/cli/mcp-registration.test.ts`'s pinned action follows the `key: value` form. Measured after
(`node -e` over `loadWorkflowRegistryAtHead`): 24 workflows, 87 phases, 0 errors, 61 warnings, all
`W_WORKFLOW_UNBOUND_TOKEN` on checks.

**Deliberately unbound — 61 check occurrences, each with its reason** (no command asserts them yet; in
v1.0 they fail closed, dl-090 Q2 (c)):
- `frontmatter.required: […]` × 17 — enforced on the element by `memory submit`'s required-field check;
  no read-only command checks one element's frontmatter.
- `spec-review.passed` × 4 (initial-design, release-planning) — the dl-022 review is a reviewer's
  judgement; an agent-asserted check is no gate (dl-090 Q6).
- Specification-phase quality criteria × 12 (specification-downcast × 4, user-story-mapping,
  specification-by-examples × 3, volere-requirements, backlog-export × 3) — judgement criteria with no
  command.
- Memory state queries × 4 (`all releases … are status`, `all tasks …` × 2, `all bugs …`) — need a query
  command with an exit status (`memory search` exits 0 regardless).
- `advance-pinned-build` prose × 3 (version equality, pin forward-only, switch-commit scope) — compare npm
  and git state; no command.
- `dev-loop.design`: `tech-spec.approved`, `depends_on.acknowledged` (dl-090 Q6 asks for a non-agent
  command reading the Execution Notes; none exists); `dev-loop.red`: `tests.exist`, `tests.failing` (the red
  evidence is judged at review; `tests.unchanged` is v1.0).
- `user-docs.align-user-docs` prose × 1 and `agent-docs` CLAUDE.md comparisons × 4 — no command compares
  the documents with the configuration (only `workflow-md.complete` has one, and is bound).
- `e2e-smoke` prose × 7 (`exit-code-zero` × 2, round-trip, exit-codes, schema-invalid, server version,
  channel set) — `task-207` rewrites the phases (`bug-134`); `scripts/e2e-smoke.cjs` asserts them as a whole
  and is bound as `e2e-smoke-passed` on `gate`.
- `release-publishing`: `on-branch-is-main`, `release-branch-merged-to-main` (no single command exits 1),
  `staged version approved on npm …` (an outside party, dl-104 D4's `awaits`).
- `end-of-life.deprecate`'s REQ-STATE-06 sentence and `service-ingest`'s `secret-scan.clean` — no
  standalone command per element.

### refactor

- `64662a4e`: the positional-argument guard covers project tokens only (the built-in `set_state(<s>)` /
  `set_release(<v>)` forms are spec-003's own); `end-of-life`'s comment cites `memory.yaml`, not
  `CLAUDE.md`; `CLAUDE.md` §3/§6 and `.wingfoil/README.md` name `agent-docs`, release-line-cycle's
  `align-agent-docs` and `bindings.yaml`.
- `abbbf65b`: `release-planning.yaml` carried a 1.7 history line without moving `version:` (found by the
  AC 5 command below) — now 1.7; selection-scope edge cases (scalar `type`, repeated / in-scope types, a
  type-less `where`) pinned.
- **AC 5 evidence**: `for f in $(git diff 4fd77678 HEAD --name-only -- .wingfoil/workflows.yaml
  .wingfoil/workflows/custom); do …grep -m1 '^version'…; done` → workflows.yaml 1.2→1.3, bug-ingest
  1.0→1.1, dev-loop 1.4→1.41, e2e-smoke 1.2→1.3, end-of-life 1.0→1.1, initial-design 1.2→1.3,
  release-line-cycle 1.0→1.1, release-planning 1.6→1.7, release-publishing 1.1→1.2, retrospective 1.2→1.3,
  user-docs 1.2→1.3; agent-docs 1.0 and bindings 1.0 new. Each carries its reason in the header comment.
- **Gates** (with the spec-003 / spec-017 amendments in the working tree, at `64662a4e`): `npm test` 292
  suites, 5457 tests, exit 0; `npm run test:coverage` exit 0, All files 99.29 / 97.06 / 97.11 / 99.72
  (B1 gate on main: 99.29 / 97.05 / 97.11 / 99.72); `npm run lint`, `npm run docs:api`,
  `npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` exit 0. After `abbbf65b`:
  `npx jest test/core/workflow-core-checks.test.ts test/core/workflow-repository-conformance.test.ts
  test/docs test/lint/version-bump.test.ts` 135 passed; `npx eslint` on the two touched files exit 0.
- `node dist/cli.js workflow list` (code build) exit 0 with no `unknown field(s) ignored: format`
  warning; the pinned build 0.2.2 and any build without this task's loader change still print it, since
  they ignore the key.
- BDD: no feature file names these workflow files' tokens (`grep -rn "bindings.yaml\|agent-docs"
  docs/02_requirements/02_bdd/features/` → nothing); no scenario added.

### review (self, reviewer)

Every AC is pinned by a test that reads `HEAD` (table above). Same-class fixes in the files touched:
the line citations into the edited workflow files in spec-003/spec-017 now name the phase and key
(`dl-075` (A), fix on touch; citations anchored to a commit keep their offset); `WORKFLOW.md`'s stale
"dl-025 leaves open whether `align-agent-docs` also runs at `plan-next-release-line`" is replaced by the
`agent-docs` section; the `produces` shown in WORKFLOW.md take the D3 form.

**Pending amendments (approver)** — uncommitted in the worktree, for `memory amend`:
- `spec-003-workflows-yaml-schema` — `--reason "task-199: bindings.yaml is a dl-149 file kind (dl-153 (A)); a selection's types are in scope for its action arguments; open question 6 settled; the repository re-measured after the workflow alignment, citations into the edited workflow files by phase and key. See the 2026-10-07 Revision note."`
- `spec-017-workflow-commands-and-state-deduction` — `--reason "task-199: §4.1 gains the selection scope rule; §12 re-measured after the workflow alignment (zero errors, 61 unbound checks, 27 checkpoints, 6 finalize approvals); §2 no longer names roles.yaml; §4.2, §5.1 and §5.2 follow. See the 2026-10-07 Revision note."`

Note: `test/docs/name-resolvability.test.ts` passes only with the spec-003 amendment applied — the
committed spec-003 still cites `agent.verify_specs`, which no configuration file carries after this task.
