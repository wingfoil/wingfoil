---
id: "task-129-refuse-operand-beyond-command-declares-exit-2-before"
type: task
title: "Refuse every operand beyond the one a command declares, with exit 2 and before any write"
status: done
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "cli", "grammar"]
ref: "dl-082"
bug: ["bug-131", "bug-171"]
depends_on: []
tmpl_version: 260703
wave: "w0"
---

## Description

`memory submit|approve|reject|deprecate|history` and `dna show` act on the first operand and silently drop the rest with exit 0 (`bug-171`); commands with no positional accept any (`allowExcessArguments(true)`, `src/cli/program.ts:192`; `bug-131`). Per `dl-082` each command takes at most one positional; only `dna set` refuses today. One registration-level refusal covers all commands, including the workflow and agent commands A and B add.

## Acceptance Criteria

- (red-first) `memory approve a b --reason x` exits 2, writes no commit, and names the command and the count; the same for every command in `CORE_MODULES` with a positional (table-driven test over the registry, so new commands are covered without editing the test).
- (red-first) `workflow list x` and `directives list developer` exit 2 (`bug-131`).
- (characterization) `dna set`'s migration message is unchanged.
- (characterization) `spec-008` §1 states "one id per call" and that the multi-id subject form `{id1}, {id2}` is historical only; carried to the agent-facing docs through `dl-025`'s `align-agent-docs` phase.

## Implementation Notes

- **Size:** S · **wave:** 0 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-082 (one positional per command); spec-008 §1; spec-005 §1 (REQ-INT-04).
- **Features:** P5.1.4, P1.7.
- **Notes:** Proposal key: C04.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-129-refuse-operand-beyond-command-declares-exit-2-before`, worktree
`../.wf2-wt/task-129`, cut from `main` at `6a28d281`. Start `a66f0439`; `bug-131` `[planned →
in-progress]` `38527912`; `bug-171` `[planned → in-progress]` `7fd5f629`.

### design (architect)

**`depends_on`:** none (`depends_on: []`), so no upstream Execution Notes to read (dl-015).

**Specs.** `spec-005-cli-command-contract` and `spec-008-cli-grammar` are `approved`,
`dl-082-cli-parameter-shape` and `dl-025` are `ready` (`grep -m1 '^status:'` on each). Neither spec
named a surplus operand. `spec-005` §1's exit-`2` row lists the malformed invocations and did not
list this one. `spec-008` §1 did not say how many `[args]` a command takes, and
`git show 6a28d281:docs/04_memory/design/specs/spec-008-cli-grammar.md | grep -c -i "one id\|historical"`
→ `0`. Both were edited by hand, each with a dated Revision note (below).

**Scope, measured at `6a28d281`.** `src/cli/program.ts` registers a declared positional as an
optional variadic `[name...]` and calls `allowExcessArguments(true)` on a command that declares none.
`src/cli/registrar.ts` passes the whole list to `buildParams`. Only `dnaPathPositional`
(`src/core/index.ts`, the four DNA path verbs) refused a second operand. `init` and `mcp` are wired
outside `CORE_MODULES` and already exit `2` through Commander (`too many arguments for 'init'`,
checked on `dist/`). They are out of the registry sweep.

**Where the refusal goes.** In `registrar.run`, after the `--format` check and before
`resolveRoot()`, so nothing is read or written and no operation check runs, the git-identity
pre-flight included (task-125's order stays intact). The four DNA path verbs are the one exception
the code has to keep. `P2.1-dna-set.feature` pins `dna set ..language python` →
`invalid key path: '..language'`, so the malformed-path check must come before the surplus check.
They declare `CorePositional.refusesExtraItself: true`, receive the full list, and refuse the surplus
themselves, after their path check. Both refusals use one composer,
`extraOperandsReason` (`src/core/registry.ts`). The DNA message is that sentence plus the hint
`the value travels in --value`, which keeps it byte-identical (AC 3). The registry sweep drives every
command whoever refuses, so a later opt-out that failed to refuse would fail the sweep.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `memory approve a b` → 2, no commit, names command and count; every command, table-driven | **red-first** | exit `0` and the first id approved today (bug-171) |
| 2 — `workflow list x`, `directives list developer` → 2 | **red-first** | exit `0` today (bug-131) |
| 3 — `dna set`'s migration message unchanged | characterization | the message exists; pinned byte-for-byte |
| 4 — spec-008 §1: one id per call, `{id1}, {id2}` historical | documentation | spec text did not exist (grep above), so this is a spec edit. No test is involved |

### red (developer)

`66f318d9` adds two suites:
- `test/cli/extra-operand-refusal.test.ts` runs in process over fixture modules. A surplus is refused
  with exit `2` and the exact message, and `resolveRoot`, `buildParams` and `fn` are never called.
- `test/cli/extra-operand-refusal.integration.test.ts` runs the compiled `dist/cli.js` in a
  throwaway `init --template scrum` repository with an approver and two `pending` tasks. It covers
  bug-171's reproduction, bug-131's two commands, and a sweep derived from
  `enumerateOperations(CORE_MODULES)`: one operand more than each command declares, with
  `HEAD` + `git status --porcelain --untracked-files=all` compared before and after. It also pins the
  `dna set` migration message and `..language` characterizations.

`npx jest test/cli/extra-operand-refusal` → **20 failed, 9 passed** (29). The headline failure is
`Expected: 2, Received: 0` on `memory approve <a> <b> --reason x`. The 9 that pass are the 4 DNA path
verbs in the sweep, the two DNA characterizations, the vacuity guard, and the two in-process
"still reaches the operation" cases.

### green (developer)

`30dbe15f`:
- `src/core/registry.ts`: `CorePositional.refusesExtraItself`, and `extraOperandsReason(command,
  positionalName, given, hint?)`, which produces
  `wingfoil memory approve takes one positional <id> (got 2 positionals)` and
  `wingfoil workflow list takes no positional (got 1 positional)`.
- `src/cli/registrar.ts`: the refusal, before `resolveRoot()`, which calls `emitError` in the
  requested `--format` and then `exitWith(2)`.
- `src/core/index.ts`: the four DNA path verbs declare `refusesExtraItself: true`, and
  `dnaPathPositional` builds its message with `extraOperandsReason(..., 'the value travels in --value')`.
- `src/cli/program.ts`: the comment on operand registration now describes the new behaviour.
  Registration itself is unchanged.
- Tests that relied on the old acceptance were updated:
  - `help-positional-required.integration.test.ts` lost its task-120 AC 4 half, which asserted that
    an extra operand is *accepted*. That acceptance was bug-131, so the half asserted the defect. The
    header says so.
  - In `program.test.ts`, `registrar.test.ts` and `usage-error-dispatch.test.ts`, fixture operations
    that were given operands now declare their positional; the two DNA fixtures declare
    `refusesExtraItself`.
  - `program.test.ts`'s "declares no positional" case now asserts the refusal.

`npm test` → 163 suites / 2669 tests, all passing.

`e3ee2d4c` (docs):
- `spec-008` §1 gains two bullets, "at most one positional / surplus → exit 2, before any read, with
  the two message shapes" and "one id per call; `{id1}, {id2}` historical only", plus a Revision
  (2026-09-30) note. §2 was not touched, because task-126 edits it.
- `spec-005` §1's exit-`2` row names the case, plus a Revision note.
- `P5.1.4-cli-ux.feature` gains the scenario "an operand beyond the one a command declares is
  refused". The integration suite executes it and names it in its header.
- `docs/cli-reference.md` "Argument grammar" gains one bullet with the example. This file carries a
  user-visible behaviour change, and `test/docs/cli-reference.test.ts` stays green.

### refactor (developer)

| Command | Result |
|---|---|
| `npm test` | exit 0; 163 suites / 2669 tests |
| `npm run test:coverage` | exit 0; 98.68 / 94.34 / 93.85 / 99.47. `main` `6a28d281` with the same command in this worktree (`git switch --detach`): 161 / 2639; 98.68 / 94.29 / 93.84 / 99.47. No regression. `registrar.ts` 100/100/100/100 |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

### review (reviewer, self)

- AC 1: `memory approve <a> <b> --reason x` → exit 2 with
  `error: wingfoil memory approve takes one positional <id> (got 2 positionals)`. `HEAD`, the working
  tree and both tasks' `pending` status are unchanged (integration suite). The sweep covers all 18
  `CORE_MODULES` commands with no hand list, guarded by `COMMANDS.length >= 18`.
- AC 2: `workflow list sw-life-cycle` and `directives list developer` → exact message, exit 2.
- AC 3: `dna set project.name bogus --value y` → byte-identical migration message. `dna set ..language
  python` → `invalid key path` (the BDD ordering).
- AC 4: spec-008 §1 states it (`e3ee2d4c`). This task leaves the agent-facing docs alone. `CLAUDE.md`
  §5.1 still shows `wf({type}): {verb} {id1}, {id2}, ...` without the "historical" qualifier.
  `dl-025`'s `align-agent-docs` phase carries that (`grep -rln "{id1}" --include=*.md .` → `CLAUDE.md`,
  plans, and this task and its bug; no user doc).
- Same class in touched files: the `program.ts` operand comment and `ParamsContext.positionals`'s
  TSDoc both said an operation refuses extra operands itself. Both were corrected. `grep -rn -i "extra
  operand\|allowExcessArguments\|refuses an extra one itself" src test docs/*.md` shows no other
  stale claim.
- The MCP surface is unaffected, because its `buildParams` never sets `positionals`.

### review (independent)

Verdict: **approve with fixes**, while the task is `in-review`. Fixed in `0ae170ec`; behaviour is
unchanged.

1. **`spec-008` §5 was out of step.** §5 calls itself the single source of truth for exit codes, and
   its exit-`2` row did not list the surplus operand. The row now names it, and the 2026-09-30
   Revision note mentions §5. This keeps it in step with `spec-005` §1, the pairing `task-103` /
   `bug-103` kept.
2. **Overclaim about where and when the refusal happens.** §1's new bullet and the comment in
   `src/cli/registrar.ts` said the rule is "enforced once, where commands are registered" and runs
   "before anything is read". That is false for the four DNA path verbs. They refuse inside the
   operation, after `resolveRoot()` and their `<path>` check. Measured on `dist/` in a throwaway
   repository:
   - from a subdirectory, `dna set project.name bogus --value y` → `E_NOT_AT_GIT_ROOT`, exit `1`;
   - outside a repository → `E_NO_GIT_ROOT`, exit `1`;
   - from the same subdirectory, `memory approve a b --reason x` → the surplus message, exit `2`.

   §1, the registrar comment, the `program.ts` comment and `spec-005`'s Revision note now state the
   exception and the DNA verbs' order: root, then path, then surplus.

Gates after the fixes:
- `npm test` → 163 suites / 2669 tests, exit `0`.
- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json` and
  `npx tsc -p tsconfig.build.json --noEmit` → exit `0`.

Follow-ups the coordinator will file, not this task's:
- `init extra` and `mcp extra` exit `2` with Commander's wording (`too many arguments for 'init'`),
  not `extraOperandsReason`'s.
- The `refusesExtraItself` exception could go away if `P2.1-dna-set.feature`'s two-positional
  scenario moves to `--value` and the hint becomes a declared `surplusHint`. That needs an approver
  ruling.
- user-docs:
  - `docs/cli-reference.md` still says release 0.2.2;
  - the CHANGELOG entry for this behaviour change;
  - a note that `memory search a b` is now refused, so a keyword with spaces must be quoted.
- `CorePositional.refusesExtraItself` is a registry-shape addition that `spec-006` §2 does not
  record.
