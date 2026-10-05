---
id: "task-165-put-bootstrap-commands-command-surface-mcp-specs-bootstrap"
type: task
title: "Put the bootstrap commands on the command surface: `mcp` in the specs, bootstrap exempt from REQ-SYS-05"
status: in-review
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "docs", "specs"]
ref: "dl-046"
bug: ["bug-028", "bug-179", "bug-204"]
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before"]
tmpl_version: 260703
---

## Description

`wingfoil mcp` is missing from the command-surface lists in `spec-005`, `spec-006` §3 and `spec-008` §1 (`bug-028`). `dl-046`: bootstrap commands are exempt from REQ-SYS-05's "every mutating operation reachable via an MCP tool" (A(a)), `audit` is flat (B(a)), and the `{module}{Verb}` naming rule is relaxed for flat self-named ops (C) — which also covers the flat ops v0.3 adds.

## Acceptance Criteria

- (characterization) the three specs list `init`, `mcp`, `audit`, `paths` consistently; REQ-SYS-05's fit criterion states the bootstrap exemption; each with a Revision note.
- (red-first) `test/docs/cli-reference.test.ts` (or a sibling) fails if a registered bootstrap command is missing from `spec-008` §1's list.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-046 A(a), B(a), C; REQ-SYS-05 amendment; spec-006 §3; spec-005; spec-008 §1.
- **Features:** P5.1.3, P5.2.
- **Notes:** Proposal key: C38.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-165-put-bootstrap-commands-command-surface-mcp-specs-bootstrap`, worktree
`../.wf2-wt/task-165`, cut from `main` at `1127a0fd`. Start `2b4d638c`; bug syncs `[planned →
in-progress]`: `bug-028` `0fe3695b`, `bug-179` `ec8086d5`, `bug-204` `570b3751`.

### design (architect)

**`depends_on`: `task-129` (`done`), Execution Notes read (dl-015).** Two facts carry over. It left
`init` and `mcp` out of its sweep because they are wired outside `CORE_MODULES` and already exited `2`
through Commander, and its review filed the wording difference as `bug-179`, which this task carries.
Its `extraOperandsReason` (`src/core/registry.ts`) is the composer the bootstrap refusal reuses, so the
two cannot drift.

**Decision and specs.** `dl-046` is `ready`; its approve commit `2ac5a551` records the ruling: A(a)
bootstrap exempt (amend REQ-SYS-05), B(a) flat `audit`, C relax the naming rule. `spec-004`, `spec-005`,
`spec-006`, `spec-008` and `spec-015` are `approved` (`grep -m1 '^status:'` on each), and `tech-spec`
is `amendable: true` in `.wingfoil/memory.yaml` 2.2, so every spec edit below is a pending amendment
(left uncommitted). `dl-040` (`in-discussion`, v0.4) owns the Resource-URI column, so the `paths` row's
`wingfoil://dna/paths` cell, which the registrar derives as `wingfoil://paths`, is left to it.

**Reading of C.** "Relax the `{module}{Verb}` rule for self-named flat operations" is applied to the
rows too: the `paths` row named `pathsQuery`, which the registry never had (op `paths` on module
`paths`, `src/core/index.ts`), so it now carries `paths`, and the planned audit row `audit`. The two
bootstrap rows name the CLI entry functions `runInit` and `runMcp`, since neither command is a core
function. The approver should confirm this reading.

**`bug-179` is in scope** (it is in `bug:`): `init extra` / `mcp extra` exit `2` with
`too many arguments for 'init'…` (`node dist/cli.js init extra` on `main`). Fix: both commands allow
excess arguments and refuse them in their action with `extraOperandsReason`, before `resolveRoot()`.

**`bug-204`** (absorbed at the B4 triage): `spec-004` `workflow.yaml` → `workflows.yaml`; `spec-008`
`tech_stack.cli` → a `stacks.technologies` entry (§Context) and `src/mcp-server` → `src/mcp`
(Consequences); `spec-015` `scripts/publish-staging` → `scripts/publish-staging.cjs` (scope, §3, the
2026-09-21 revision). `ls scripts | grep publish` → `publish-staging.cjs`, `publish-staging.d.cts`.
`spec-008`'s Process Notes keep `tech_stack.cli`, the key `dna.yaml` really had then
(`git log -S tech_stack -- docs/self/.wingfoil/dna.yaml` → `c6791928`, `f94bf602`), so that entry
stays in the allowlist with a `historical` reason rather than being removed.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — the three specs list `init`, `mcp`, `audit`, `paths` consistently; REQ-SYS-05 states the exemption; Revision notes | characterization (documentation) | spec and requirement text; pinned by the AC 2 suite once written |
| 2 — a test fails if a registered bootstrap command is missing from `spec-008` §1's list | **red-first** | no such test existed and `mcp` was missing (`bug-028`) |
| bug-179 — `init`/`mcp` surplus gives the shared refusal | **red-first** | Commander's wording today |

### red (developer)

`5606553b`:
- `test/docs/command-surface-specs.test.ts` (new). It walks `buildProgram(CORE_MODULES)`, takes every
  top-level command with no verb (`init`, `mcp`, `paths`), and requires `spec-008` §1's grammar comment
  and `<noun>` bullet, `spec-005`'s Context and `spec-006` §3 (a row with CLI `` `wingfoil <cmd>` ``)
  to name each. It also requires REQ-SYS-05's Fit Criterion to name each bootstrap command (the flat
  commands not derived from `CORE_MODULES`). A vacuity guard pins the bootstrap set to `init`, `mcp`.
- `test/cli/extra-operand-refusal.integration.test.ts`: `init extra` and `mcp extra` must print exactly
  `error: wingfoil <cmd> takes no positional (got 1 positional)`, exit `2`, with `HEAD` and the working
  tree unchanged.

`npx jest test/docs/command-surface-specs.test.ts test/cli/extra-operand-refusal.integration.test.ts`
→ **6 failed, 25 passed** (31). The 6: `mcp` missing from spec-008's comment and bullet, from spec-005,
from spec-006 §3, `init`/`mcp` not named by REQ-SYS-05, and the two bootstrap wordings
(`Received: error: too many arguments for 'init'. Expected 0 arguments but got 1: extra.`).

### green (developer)

- `aa71024d` fix: `src/cli/program.ts` gains `refusedSurplus`. `init` and `mcp` call
  `allowExcessArguments(true)` and refuse a surplus first thing in their action, in the active
  `--format`, at exit `2`. `src/core/exit-code.ts`'s comment no longer claims the bootstrap commands
  raise `commander.excessArguments` (the code stays in the set, so a later command without the opt-in
  still exits `2`). `commander-parse-exit-codes.integration.test.ts`'s bootstrap case now asserts the
  shared wording.
- `af39b61c` docs: REQ-SYS-05's Fit Criterion exempts `init` and `mcp` by name, ratified by `dl-046`
  A(a); the SARD index row says "(bootstrap exempt)".
- `eb971526` test: the allowlist loses the six entries the amendments resolve (`spec-004`
  `workflow.yaml`; `spec-006` `project.init`, `projectInit`, `projectAudit`; `spec-008`
  `src/mcp-server`; `spec-015` `scripts/publish-staging`). Three entries get a real reason in place of
  `UNTRIAGED`: `pathsQuery` (historical, the 2026-09-17 Revision note), `tech_stack.cli` (historical,
  the Process Notes) and `wingfoil audit` (planned, P5.1.3, no task yet).
- `c59880b2` BDD: `P5.1.4-cli-ux.feature` gains "a bootstrap command refuses an operand in the same
  words"; the integration case executes it and names it.
- Spec amendments, uncommitted (see "Pending amendments" below): `spec-008` §1 (`mcp` in both lists,
  what a bootstrap command is, the surplus rule naming them) + §Context/Consequences names; `spec-005`
  §Context; `spec-006` §3 bootstrap table (rows `init`, `mcp`, `audit`, MCP cells per A(a)/B(a)), the
  preamble and §5 naming rule (C), the `paths` rows in §3 and §6, §5's parity bullet; `spec-004` §4.2
  (the exemption) and `workflows.yaml`; `spec-015` the script name. Each has a dated
  2026-10-05 Revision note.

### refactor (developer)

`7a3778bc`: coverage showed `refusedSurplus` uncovered (the integration suite runs `dist/`, which
coverage does not count). `test/cli/program.test.ts` now runs `init extra` and
`--format json mcp a b` in process: message, exit `2`, and neither `resolveRoot` nor the command runs.

All gates run with the uncommitted amendments in the working tree:

| Command | Result |
|---|---|
| `npm test` | exit 0; 215 suites / 3855 tests |
| `npm run test:coverage` | exit 0; 98.88 / 95.57 / 95.34 / 99.58. `main` after B5 (plan, batch B5 gates): 98.88 / 95.53 / 95.34 / 99.57. No regression; `program.ts` 99.27 / 93.82 / 96.77 / 100 |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `npx jest test/docs/name-resolvability.test.ts` | pass; "0 stale allowlist entries" |

On the built CLI, in a scratch directory outside any repository: `node dist/cli.js init extra` →
`error: wingfoil init takes no positional (got 1 positional)`, exit `2`; `mcp extra` → same shape,
exit `2`; `--format json init a b` → `{"error":"wingfoil init takes no positional (got 2 positionals)"}`,
exit `2`. The refusal comes before the root check (no `E_NO_GIT_ROOT`).

### review (reviewer, self)

- AC 1: `spec-008` §1 (comment and bullet), `spec-005` §Context and `spec-006` §3 all list `init`,
  `mcp`, `paths`, `audit`; REQ-SYS-05 names the exemption; each spec carries a 2026-10-05 Revision note.
  Pinned by `command-surface-specs.test.ts` (5 tests, green with the amendments).
- AC 2: the same suite fails when a registered flat command is missing from §1 (red run above:
  `bullet: ["mcp"]`, `comment: ["mcp"]`).
- bug-179: integration (`dist/`) and in-process cases green; P5.1.4 scenario added.
- bug-204: the four stale names are gone from the specs' current text; `name-resolvability` reports 0
  stale entries.
- Same class in touched files: `spec-004` §4.2's bijection also contradicted `init` and now states the
  exemption; `spec-006` §6's baseline row named `pathsQuery` too and now says `paths`.
  `grep -rn "too many arguments" src docs --include=*.ts --include=*.md` → only `program.ts`'s new
  TSDoc and historical Memory text. `docs/cli-reference.md` already stated the surplus rule for every
  command, so it needed no edit (it now holds for `init` and `mcp`).
- Merge order: this branch edits `spec-008` (§1, §Context, Consequences, a new Revision note at the end)
  and must merge before `task-156`, which also edits `spec-008`; `docs/cli-reference.md` is not touched.
  The allowlist removals assume the amendments: at a commit with the allowlist change and without the
  amended specs, `name-resolvability` fails on the six names.

### Pending amendments (approver)

Each edit is in the worktree, uncommitted, for `memory amend` at the review gate:

- `spec-008-cli-grammar` — `--reason "task-165: §1 lists mcp among the flat commands and says what a bootstrap command is (dl-046 A(a), bug-028); the surplus-operand rule names the bootstrap commands (bug-179); §Context and Consequences name stacks.technologies and src/mcp (bug-204). Revision note 2026-10-05."`
- `spec-005-cli-command-contract` — `--reason "task-165: §Context lists mcp among the flat commands (bug-028, dl-046). Revision note 2026-10-05."`
- `spec-006-core-domain-api` — `--reason "task-165: §3's bootstrap table follows dl-046 A(a), B(a) and C: init and mcp rows not MCP-exposed, audit flat with Resource wingfoil://audit, self-named flat operations admitted and the paths rows renamed to the registered op (bug-028). Revision note 2026-10-05."`
- `spec-004-mcp-surface-contract` — `--reason "task-165: §4.2 states REQ-SYS-05's bootstrap exemption (dl-046 A(a)) and names workflows.yaml (bug-204). Revision note 2026-10-05."`
- `spec-015-packaging-publishing` — `--reason "task-165: the staging script is named scripts/publish-staging.cjs in the scope field, §3 and the 2026-09-21 revision (bug-204). Revision note 2026-10-05."`

### Candidate findings (not filed)

- `docs/01_vision/X_cli-cmds.md` (the command map `spec-008` §1 says it matches) has no `wingfoil mcp`
  row.
- `spec-006` §3's `paths` MCP cell (`wingfoil://dna/paths`) still differs from what the registrar
  derives (`wingfoil://paths`); `dl-040` owns it.
- user-docs: a CHANGELOG line for the `init`/`mcp` wording change.
