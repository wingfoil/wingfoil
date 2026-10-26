---
id: "task-133-bind-builtin-security-directive-role-stop-tests-pinning"
type: task
title: "Bind the built-in `security` directive to every role, and stop tests pinning live bindings by exact array"
status: done
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "directives", "security"]
ref: "dl-059"
bug: ["bug-112"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

The scaffold's `global:` holds only `security-secrets` (`src/storage/templates.ts:337-340`), so no agent context loads the built-in `security` directive (`dl-059`). Two suites assert this repository's live `roles.yaml` bindings by exact array (`test/directives/schema.test.ts:141`, `test/core/loaders.test.ts:197`), so every binding change — this one first — fails them (`bug-112`).

## Acceptance Criteria

- (red-first) `wingfoil init` (Scrum and Kanban) writes `security` under `global:`; resolution for any role includes it once.
- (red-first) the two suites assert properties (required ids present, no dangling ids) rather than the exact live array; a characterization run with one binding added stays green.
- (characterization) this repository's `roles.yaml` binds `security` globally, `version:` bumped.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-059 option 1 (scaffold + dogfood); REQ-SEC-08.
- **Features:** P3.8, P5.4.2.
- **Notes:** Proposal key: C17.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-133-bind-builtin-security-directive-role-stop-tests-pinning`, worktree
`../.wf2-wt/task-133`, cut from `main` at `c43221c4` (`git merge-base HEAD main`). Start `31c5825c`;
`bug-112` `[planned → in-progress]` `ace532dd`.

### design (architect)

**`depends_on` read (dl-015).** `depends_on: []`, nothing to read.

**Decision and specs.** `dl-059` is `ready` (`awk '/^status:/{print $2;exit}'` → `ready`). Its body
still reads "Approver to choose"; the choice is recorded in its approve commit `551ab524`
(`wf(decision-log): approve dl-059-… [in-discussion → ready]`), whose `Reason:` ratifies **option 1**
(bind `security` globally in the scaffold) and "dogfood: also bind it"
(`git log -1 --format=%b 551ab524`). The same ruling is the dl-059 row of
`release-planning-rel-v0.3-plan` (`grep -n "dl-059" docs/05_plans/rl-v1/rel-v0.3/release-planning-rel-v0.3-plan.md`
→ line 595).
`spec-012-context-loader-relevance-filtering` (globals are unconditional, deduplicated by id) and
`spec-011-storage-layout` are `approved`. No spec is missing or needs revision: the binding is data in
the scaffold, and `resolveRoleDirectives` (`src/core/context.ts`) already resolves globals for every
role and deduplicates by id.

**Scaffold location.** `rolesYaml()` in `src/storage/templates.ts` is shared by Scrum and Kanban: one
`global:` block, so both templates change together (`grep -n "^function rolesYaml" src/storage/templates.ts`
→ one definition). Only that `global:` block is touched; `task-136` edits the same file afterwards
(Kanban workflow `include`), so this task merges first.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — init (Scrum, Kanban) writes `security` under `global:`; every role resolves it once | **red-first** | the scaffold's `global:` lacks `security` today |
| 2 — the two live suites assert properties, not the exact array; a run with one binding added stays green | **red-first (reproduction)** | the red is the existing suites failing under `bug-112`'s Steps to Reproduce, run before the rewrite; no new test was written to fail |
| 3 — this repository's `roles.yaml` binds `security` globally, `version:` bumped | characterization, **observed red** | listed as characterization; in practice the AC 2 rewrite asserts `security` in `global`, which failed until the config changed (recorded below), so it was not a first-run pass |

### red (developer)

- **AC 1** — `test/core/builtin-directive-templates.test.ts`, new `describe` "REQ-SEC-08 — init binds
  the built-in security directive to every role": a real `initWingfoilProject` per `TEMPLATE_NAMES`
  (Scrum, Kanban); `loadRolesYaml` must list `security` in `global` exactly once; `resolveRoleDirectives`
  for every role in the scaffolded `dna.yaml` catalogue plus an undeclared role must yield exactly
  `directives/built-in/security.md`. `npx jest test/core/builtin-directive-templates.test.ts -t task-133`
  → **4 failed** (2 templates × 2 tests), e.g. `developer` → `Received: []`. Commit `33b394f2`.
- **AC 2 (reproduction)** — `- security` added to `developer` in `.wingfoil/roles.yaml` (temporary,
  reverted), then `npx jest test/directives/schema.test.ts test/core/loaders.test.ts` on the unchanged
  suites → **2 failed, 27 passed**, both `Received + 1: "security"`: `bug-112` exactly.

### green (developer)

- `09d484a8` — `rolesYaml()` adds `- security` to `global:` (between `documentation` and
  `security-secrets`) with a two-line comment. AC 1's 4 tests pass;
  `npx jest test/core/builtin-directive-templates.test.ts test/storage/templates.test.ts` → 60 passed.
  The existing "every directive id the scaffolded roles.yaml binds is actually scaffolded" test
  (`test/storage/templates.test.ts`) covers the new id too: `security` is a shipped built-in.
- `73f4e6f7` — the two live suites are rewritten by property (`bug-112`'s Notes: membership of the
  bindings that matter plus a shape assertion):
  - `test/directives/schema.test.ts` "RolesYaml — validates the real, live .wingfoil/roles.yaml file":
    four tests — parses; required ids present (`developer` ⊇ code-quality, testing, determinism,
    command-baseline; `reviewer`/`architect` ∋ command-baseline; `global` ⊇ doc-versioning,
    documentation, security, security-secrets, claim-evidence); no list repeats an id; every bound id
    is the `id` of a file under `.wingfoil/directives/{built-in,custom}/`.
  - `test/core/loaders.test.ts`: the `loadRolesYaml` test keeps its membership assertions as
    `arrayContaining`, adds `global` ⊇ security, security-secrets and a no-duplicates check; a new test
    checks every bound id against `loadDirectives(liveRoot)`.
  Run before the config change: **2 failed** (`global` lacks `security`, AC 3's observed red).
- `4cbd666f` — `.wingfoil/roles.yaml` binds `security` in `global`, `version: 1.1 → 1.2` (first edit
  since `task-094` committed v1.1; the file has no date field). Its header no longer says the
  built-ins are unimplemented or that `security` is left unassigned. Same commit: the two docs that
  stated the old binding — `docs/user-guide.md` §6 (the `global:` example, and "`init` binds
  `security` to no role") and `CLAUDE.md` §7 (the global row and the "`roles.yaml` is at v1.1"
  sentence). `npx jest test/directives/schema.test.ts test/core/loaders.test.ts` → 33 passed.
- **AC 2 characterization and mutation runs**, each a temporary edit of the live `roles.yaml` v1.2
  (restored afterwards, `git diff .wingfoil/roles.yaml` empty), then the same two-suite command:

  | Mutation of `developer` | Result | What it shows |
  |---|---|---|
  | `+ security` (a legitimate new binding) | 33 passed | AC 2: a binding change is no longer a red |
  | `+ testing` (a duplicate) | 2 failed: "no list binds the same id twice", loaders' `loadRolesYaml` test | a duplicating loader is still caught |
  | `+ no-such-directive` (dangling) | 2 failed: both "no dangling binding" tests | a binding with no file is caught |

### refactor (developer)

The first full run surfaced one real consequence of the change:
`test/core/directive-remove.test.ts` "removing a custom directive that shadows a built-in" chose
`security` because it was the one shipped built-in the scaffold bound to no role. Now it is global, so
`directive remove security` is refused (`cannot remove 'security': still assigned to every role via
roles.yaml 'global'`). `3e9f2892`: the fixture unbinds `security` from `global` first (new
`unbindGlobal` helper), which keeps the case the test is about; the stale comment "nine ids across six
roles plus three globals" is corrected to six ids and four globals (counted from `rolesYaml()`:
architecture, code-quality, code-review, determinism, testing, traceability).
`npx jest test/core/directive-remove.test.ts` → 17 passed.

`c98d88b8`: BDD `P3.8-builtin-directive-templates.feature` Scenario 1 gains `And ".wingfoil/roles.yaml"
binds "security" under "global", so every role loads it`, implemented by AC 1's `describe`, and the
test header quotes it. No test parses the feature file (`grep -rn "P3.8-builtin" test` → comment
references only).

| Gate | Result |
|---|---|
| `npm test` | 166 suites / 2767 tests; 2 failed on the first run: the `directive-remove` case above (fixed) and `test/mcp/resource-latency.test.ts` REQ-PERF-04 (load) |
| `npm run test:coverage` | 2765 passed / 2 failed, both perf under load: REQ-PERF-04 and REQ-PERF-02 (`test/core/query-latency.test.ts`). Re-run alone: `npx jest test/mcp/resource-latency.test.ts test/core/query-latency.test.ts` → 8 passed. Coverage **98.73 / 94.58 / 94.01 / 99.49** (stmts / branches / funcs / lines), equal to `task-127`'s final figures, whose `src/` is `main`'s (`c43221c4` adds only a plan) — no regression |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

No CLI command or help text changed, so `docs/cli-reference.md` is untouched.

### review (reviewer, self)

- **AC 1** met — 4 tests, both templates, every catalogue role plus an undeclared one, resolved path
  `directives/built-in/security.md` exactly once.
- **AC 2** met — neither suite has an exact-array assertion over the live file any more
  (`grep -n "toEqual(\[" test/directives/schema.test.ts test/core/loaders.test.ts` → only fixture and
  shape tests); the `+ security` run above stays green; the duplicate and dangling mutations still fail.
- **AC 3** met — `grep -n "^version\|  - security$" .wingfoil/roles.yaml` → `version: 1.2`, `  - security`.
- Same-class sweep over files touched: every statement that `security` is unbound —
  `grep -rn 'to no role\|left unassigned\|NO role and does not' --include=*.md --include=*.ts --include=*.yaml .`
  outside `node_modules`, `docs/04_memory`, `docs/05_plans` → none left. Memory elements and plans that
  describe the old state historically (`dl-059`, the v0.3 release-planning plan) are records, not
  claims about the current tree, and are not edited.
- **Pending amendments (approver):** none.
- **Candidate finding (for the coordinator to file, not filed here — bug-087/162):** `directive remove`
  refuses a **custom shadow** of a built-in id while the id is bound (`src/core/directive-assign.ts`,
  the referrer check), although the binding would still resolve to the built-in after the removal
  (dl-037). Since this task every shipped built-in id is bound in a fresh project, so a user who
  customized `security` (or any built-in) cannot remove the customization without first unbinding the
  id. Pre-existing for the five assigned built-ins; this task extends it to `security`.

### review (independent)

Verdict: approve with fixes, five findings, all applied (task stays `in-review`):

1. `CLAUDE.md` §7 said `task-133` bound "the built-in `security`" — false here: this repository's
   `directives/built-in/` holds only `.gitkeep`, so the id resolves to the P3.8 stand-in
   `custom/security.md`. Reworded (stand-in here, built-in in an `init` scaffold); the §7 table,
   misaligned by the wider global row, is realigned. `b9db06a6`.
2. `docs/user-guide.md` §6.2's example `--directive api-style,security` now taught a redundant binding
   (`security` is global after `init`); it is `api-style,architecture`. `b9db06a6`.
3. `.wingfoil/roles.yaml` said "resolution deduplicates by id, so binding both loads each once" —
   vacuous, `security` and `security-secrets` are different ids. Now: both load for every role, their
   credential rules overlap but do not conflict. No further `version:` bump: 1.2 is not yet on `main`.
   `b9db06a6`.
4. `test/core/directive-remove.test.ts` `unbindGlobal` replaced the first `\n  - <id>\n` anywhere; it
   now searches only the top-level `global:` block. New characterization test: in the default
   scaffold a custom shadow of the now-global `security` is refused (`CONFLICT`, "cannot remove
   'security': still assigned to every role via roles.yaml 'global'", file kept, HEAD unchanged) —
   it pins the behaviour the self-review flagged; the policy question is the coordinator's follow-up.
   `npx jest test/core/directive-remove.test.ts` → 18 passed. `8912cab1`.
5. Design now cites `dl-059`'s approve commit `551ab524` as the source of option 1 (above).

Gates after the fixes: `npm run test:coverage` → exit 0, 166 suites / 2768 tests all passed, coverage
98.73 / 94.58 / 94.01 / 99.49 (unchanged); `npm run lint`, `npm run docs:api`,
`npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
