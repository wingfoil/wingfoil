---
id: "task-145-replace-cli-test-helpers-fabricated-stderr-child-real"
type: task
title: "Replace the CLI test helpers' fabricated `stderr: ''` with the child's real stderr"
status: done
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "tests"]
ref: "dl-121"
bug: ["bug-070"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

Seven helpers under `test/cli/` return a literal `stderr: ''` on success (`fresh-init-transitions:65`, `journey-0a:56`, `missing-verb-exit-code:75`, `npm-distribution:74`, `program.integration:91`, `help-positional-required:41`, `commander-parse-exit-codes:55`), so every "printed nothing to stderr" assertion is vacuous. The workflow/agent CLI suites A and B write would copy it; one shared `spawnSync` helper ends it.

## Acceptance Criteria

- (red-first) a shared helper returns the real stderr on every path; a meta-test shows a helper call to a command that writes to stderr and exits 0 reports that text.
- (red-first) a `test/lint/` check fails if a `test/` file returns a literal `stderr: ''`.
- (characterization) the seven suites use the helper and stay green, or each newly visible stderr line is recorded and, if a defect, filed.

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-121 T1.
- **Notes:** Proposal key: C19.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-145-replace-cli-test-helpers-fabricated-stderr-child-real`, worktree
`../.wf2-wt/task-145`, cut from `main` at `cac8a447`. Start `a9d13c82`; `bug-070`
`[planned → in-progress]` `0a47bd5e`.

### design (architect)

**`depends_on` (dl-015):** none (`depends_on: []`).

**Specs.** The task implements `dl-121` T1 (`status: ready`, `grep -n "^status" docs/04_memory/design/dls/dl-121-*.md`).
No tech-spec governs test helpers; no spec is missing or needs revision. No BDD feature covers
`test/` internals, so no `.feature` file is touched.

**Scope, measured** (`grep -rn "stderr: ''" test/`): the Description lists seven helpers, but there are
**eight** returning the literal on success — `parse-error-format.integration.test.ts:52` is the eighth.
All eight are in scope. Ten other `test/cli` suites already carry their own correct `spawnSync`
helpers (`grep -rl "spawnSync('node'" test/cli`); they report real stderr, so they are left as they
are (see review, candidate finding). `reason-control-chars.integration.test.ts:87` holds
`let refused: CliRun = { … stderr: '' }` as a placeholder that is overwritten before use — not a
returned value, not fabricated.

**Design.** One helper, `test/cli/helpers/spawn-cli.ts`: `spawnCapture(command, args, {cwd})` over
`spawnSync`, returning `{status, stdout, stderr}` exactly as the child wrote them; it **throws** when
the child cannot be spawned or ends on a signal (the old helpers mapped a null status to `1`, which
reads a crash as an ordinary exit). Two thin wrappers, `runCliHarness(root, args)` and
`runCliEntry(cwd, args)`, plus the `DIST_DIR` / `CLI_ENTRY` / `CLI_HARNESS` / `CLI_FIXTURE_ROOT`
paths every suite redeclared. The gate is `test/lint/no-fabricated-stderr.test.ts`: a TypeScript-AST
walk of every `test/**/*.ts` flagging a `return` / arrow body whose object literal has a `stderr`
initialised to **any** string literal (so comments and the `let` placeholder are invisible to it, not
special-cased).

**AC classification (testing directive).**

| AC | Class | Why |
|---|---|---|
| 1 — shared helper returns the real stderr; meta-test with an exit-0 stderr writer | **red-first** | no shared helper exists |
| 2 — `test/lint/` check fails on a returned literal `stderr: ''` | **red-first** | no such check; it fails today on the eight sites |
| 3 — the suites use the helper and stay green, or new stderr is recorded/filed | characterization | the suites' behaviour under test is unchanged; only their observation of it changes |

### red (developer)

`9967d2c9`: `test/cli/spawn-cli.test.ts` (10 cases) and `test/lint/no-fabricated-stderr.test.ts`
(3 cases). `npx jest test/lint/no-fabricated-stderr.test.ts test/cli/spawn-cli.test.ts` →
**2 suites failed; 2 tests failed, 1 passed**. `spawn-cli.test.ts` fails to run
(`Cannot find module './helpers/spawn-cli'`). The gate's sweep fails listing exactly the eight
`stderr: ''` sites, and its coverage check fails because `cli/helpers/spawn-cli.ts` does not exist.
The gate's self-check (flags `''`, ` `` `, `"fixed"`; ignores the `let` placeholder, a comment and a
non-literal) passes, as it should — it tests the gate, not the tree.

### green (developer)

`ae5409dd`: `test/cli/helpers/spawn-cli.ts` added; the eight suites' runners now delegate to
`runCliHarness` / `runCliEntry` (local names `runCli`, `runCliInRoot`, `runBinIn`, `wingfoil` kept,
so no assertion line changed), and their `CliResult`/`CliRun`/`ExecFileSyncError` declarations and
redeclared path constants are gone. Three module docs that said the status came from `execFileSync`
(`missing-verb-exit-code`, `commander-parse-exit-codes`, `program.integration`) now say `spawnSync`.
`help-positional-required` used to pass `stdio: ['ignore', …]`; the helper leaves stdin as a closed
pipe, which no command it runs reads.
The ten suites → **10 passed, 203 tests**.

**AC3 — newly visible stderr: none.** Every suite stayed green with real stderr; no assertion was
loosened (`git diff main -- test/cli/*.test.ts ':!test/cli/spawn-cli.test.ts' | grep "^[-+].*expect"` → only
`existsSync(CLI)` / `existsSync(BIN_ENTRY)` → `existsSync(CLI_ENTRY)` renames). The suites contain 34 lines asserting an
empty stderr (`grep -cE "stderr\)\.toBe\(''\)|stderr\]\)\.toEqual\(\[0, ''\]\)"` per file:
program 17, fresh-init 9, missing-verb 3, npm-distribution 2, journey-0a 2, commander 1).

**They can now fail — probe.** A `--require` preload writing `probe: stderr on success` to stderr in
every `dist/cli.js` / `cli-harness.cjs` child (`NODE_OPTIONS="--require <probe>" npx jest` over the six
suites holding such assertions):
- before the fix (`git stash -u`, red commit): **30 failed, 131 passed**; `journey-0a` and
  `fresh-init-transitions` PASS outright — every one of their empty-stderr assertions was vacuous;
- after the fix: **76 failed, 85 passed**, all six suites fail.

### refactor (developer)

On `ae5409dd`:
- `npm test` → 190 suites, **3208 tests passed**.
- `npm run test:coverage` → 98.84 / 95.24 / 95.01 / 99.54 (stmts / branches / funcs / lines),
  equal to `main`'s B2 gate figures in the dev-loop plan; no `src/` file changed.
- `npm run lint` → exit 0. `npm run docs:api` → exit 0.
- `npx tsc --noEmit -p tsconfig.json` → exit 0; `npx tsc -p tsconfig.build.json --noEmit` → exit 0.

### review (reviewer)

- AC1 met: `spawn-cli.test.ts` "a child that writes to stderr and exits 0 is reported with that text"
  plus non-zero, both-streams, quiet, cwd, spawn-failure and signal cases; two cases through the real
  compiled CLI.
- AC2 met: `no-fabricated-stderr.test.ts` fails on the eight sites at `9967d2c9` (red above) and is
  green after; its self-check proves it can fail.
- AC3 met: eight suites (seven named + `parse-error-format`) use the helper, green, no new stderr.
- T1: the gate's module doc states what it does not flag (non-returned initialisers, comments). The
  helper's doc does not claim the old suites were wrong today — only that their assertions could not
  fail, which the probe establishes.
- Same-class sweep: none left — the gate itself is the check (`npx jest test/lint/no-fabricated-stderr.test.ts`
  → 3 passed). `grep -rn "stderr: ''" test/` still prints prose and the gate's own sample strings, and
  the `reason-control-chars` placeholder; none is a returned value.
- No `src/` change; no Memory element other than this task and `bug-070` touched. **Pending
  amendments (approver): none.**

**Candidate findings (not filed):**
1. Ten `test/cli` suites keep their own local `spawnSync` helper (approval-authority-baseline,
   check-governance, directive-inventory-at-head, dirty-document-refusal, history-scaffold-phantom,
   memory-add-set, memory-add-type-baseline, own-memory, reads-resolve-at-head,
   reason-control-chars). They are correct, but duplicate `spawn-cli.ts`; a consolidation is a
   follow-up, not a defect.
2. Many suites still run `git`/`npm` through bare `execFileSync` for setup/readback (stdout only;
   stderr inherited). Not a fabricated value — `execFileSync` throws on a non-zero exit — so out of
   this task's class.

### review (independent)

Coordinator's independent review: **approve with fixes**. No assertion was lost and the helper's
semantics match. Applied while the task stays `in-review`:

- **F1 — the gate missed forms and flagged mocks.** Red `4d3e7c43`: the self-check was split into a
  "flags" case and an "exempt" case, and gained the reviewer's variants.
  `npx jest test/lint/no-fabricated-stderr.test.ts` → **2 failed, 2 passed**. The gate missed a quoted
  key (`'stderr': ''`), a ternary branch, `stderr: EMPTY` with `const EMPTY = ''`, the shorthand
  `stderr` with `const stderr = ''`, and a returned `const r = { …, stderr: '' }`. It flagged
  `spy.mockImplementation(() => ({ stdout: 'x', stderr: '' }))`.

  Fix `605ddf2a`:
  - property names are read by `.text`, so quoted keys and shorthand properties are covered;
  - a ternary's two branches are followed;
  - identifiers are resolved lexically to a `const` initialiser (block and file statements; a
    parameter, `let`/`var` or destructuring binding stops the resolution), for the value and for the
    returned object;
  - only a **spawn result** is checked, meaning an object that also carries a `status` key, so a mock
    body is exempt.

  The exempt cases are pinned: placeholder, comment, `run.stderr`, the mock, a parameter shadowing a
  `const stderr = ''`, a reassigned `let`, and a destructured `stderr`. The forms the gate still does
  not see are stated as known limits in its module doc: a call value, a spread-only `status`,
  `Promise.resolve({…})`, a never-reassigned `let`, an imported const, and `catch`/loop shadowing.
  After the fix: 4 passed.
- **F2 — recorded, filed by the coordinator.** The ten local `spawnSync` helpers in other
  `test/cli` suites still map a signal to exit `1`, for example
  `test/cli/approval-authority-baseline.integration.test.ts:41-45` with `status: run.status ?? 1`.
  Consolidating them onto `test/cli/helpers/spawn-cli.ts`, which throws on a signal instead, is a
  follow-up.

Re-run on `605ddf2a`:
- the gate, `spawn-cli.test.ts` and the eight migrated suites → 10 suites, **204 tests passed**;
- `npm run lint` → exit 0;
- `npx tsc --noEmit -p tsconfig.json` → exit 0;
- `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
