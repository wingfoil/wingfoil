---
id: "task-179-give-missing-operand-unknown-command-errors-shape-spec"
type: task
title: "Give missing-operand and unknown-command errors the one shape `spec-005`/`spec-008` declare"
status: in-review
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "cli", "errors"]
ref: "spec-005"
bug: ["bug-104", "bug-168", "bug-180", "bug-198", "bug-226", "bug-245"]
depends_on: ["task-129-refuse-operand-beyond-command-declares-exit-2-before", "task-130-show-coreerror-details-surface-give-refusal-shape-under"]
tmpl_version: 260703
---

## Description

The missing-operand line names `memory submit <id>` for Memory/directive verbs but a full `wingfoil dna update <path> --value <value>` usage for DNA verbs (`bug-168`). The unknown-command suggestion is Commander's `(Did you mean memory?)` rather than `spec-005` §3.1's `hint:` line, and a test pins Commander's wording (`test/cli/commander-parse-exit-codes.integration.test.ts:174`; `bug-104`). v0.3 adds many verbs, so the new ones must be born consistent.

## Acceptance Criteria

- (red-first) every verb with a required operand prints the one `spec-008` form when it is missing, exit 2 (table-driven over the registry).
- (red-first) `wingfoil memry` prints the `hint:` line through `src/cli/error.ts`, exit 2; the Commander-wording test is rewritten.
- (characterization) `bug-115`/`bug-116` (v0.4) stay out of scope; their text is not changed.
- (red-first, `bug-180`, added at design) the four DNA path verbs refuse a surplus operand at registration like every
  other command: from a subdirectory, `dna set project.name bogus --value y` exits `2` with the surplus message (the
  `the value travels in --value` hint appended by the registrar from a declared `surplusHint`), not
  `E_NOT_AT_GIT_ROOT` at exit `1`; `CorePositional.refusesExtraItself` is removed; `P2.1-dna-set.feature`'s
  malformed-path scenario is written with `--value`.
- (red-first, `bug-226`, added at design) every command checks the global `--format` first: `--format bogus init
  extra` and `--format bogus mcp extra` give the invalid-`--format` refusal at exit `2`, as `--format bogus paths a b`
  does; `--format bogus mcp` is refused at exit `2` too.
- (red-first, `bug-198`, added at design) in a git repository with no `.wingfoil/`, `dna show`, `paths` and
  `memory search x` refuse with `WINGFOIL_NOT_INITIALIZED`, exit `1`, and no absolute path.
- (red-first, `bug-245`, added at design) with a `.wingfoil/` that lacks `dna.yaml` or `memory.yaml`, or holds an
  invalid one, `dna show`, `paths`, `memory search`, `wingfoil mcp` and the `wingfoil://memory/*` Resources name the
  file repository-relative (`.wingfoil/dna.yaml is missing: …`, validation issues labelled `(.wingfoil/dna.yaml)`),
  never the absolute host path or a raw `ENOENT`.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-005 §3.1 (`hint:` line); spec-008 §4/§5.
- **Features:** P5.1.4.
- **Notes:** Proposal key: C10.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-179-give-missing-operand-unknown-command-errors-shape-spec`, worktree `../.wf2-wt/task-179`,
cut from `main` at `0cf8b131` (wave 2, batch B3). Bug syncs `[planned → in-progress]` for `bug-104`, `bug-168`,
`bug-180`, `bug-198`, `bug-226`, `bug-245` precede the work (`git log --oneline 0cf8b131..HEAD`).

### design (architect)

**`depends_on` (dl-015).** Read the Execution Notes of `task-129` (surplus refusal in the registrar; the DNA
path verbs kept `refusesExtraItself` only because `P2.1-dna-set.feature` wrote `dna set ..language python`) and
`task-130` (Commander's refusals in the active `--format`; the `(Did you mean X?)` line became `hint` with
Commander's wording, "reconciling it … is `bug-104`'s"). Neither defers work to this task beyond those two
pointers.

**Specs.** `spec-005-cli-command-contract`, `spec-006-core-domain-api` and `spec-008-cli-grammar` are
`approved` (`grep -n "^status:" docs/04_memory/design/specs/spec-00{5,6,8}*.md`). `tech-spec` is
`amendable: true` in `.wingfoil/memory.yaml`, so their edits are pending amendments (below).

**Measured before any change** (`npm run build`, then `node dist/cli.js …` in an empty `git init` repo):
`memroy add` → `error: unknown command 'memroy'` + `(Did you mean memory?)`, exit 2; `dna show`, `paths`,
`memory search x` → `error: ENOENT: no such file or directory, open '<abs>/.wingfoil/…'`, exit 1;
`--format bogus mcp extra` → the surplus message, exit 2; `--format bogus mcp` → the not-initialized refusal,
exit 1 (an invalid `--format` was never refused by `mcp`, the same class as `bug-226`).
`grep -n "missing required argument" src/core/index.ts` → `memory <verb> <id>` (6 verbs), `directive remove
<name>`, `wingfoil dna ${verb} <path> --value <value>`: `bug-168`'s two shapes.

**ACs added at design** for the four bugs absorbed at triage/planning, each from its Expected Behavior:
AC 4 (`bug-180`), AC 5 (`bug-226`), AC 6 (`bug-198`), AC 7 (`bug-245`) — see Acceptance Criteria.

**Decisions taken (approver to confirm):**

1. **The missing-operand form** (`bug-168` leaves the exact text open): `missing required argument: <name>` —
   the positional's `--help` placeholder, beside `spec-008` §4's `--<name>` for an option — plus the usage on
   the `hint:` line, required options included: `hint: usage: wingfoil memory approve <id> --reason <text>`.
   Enforced by the registrar from `CorePositional.required`, after the surplus check and before
   `resolveRoot()`; each `CoreFn` keeps the same refusal (`missingOperandReason`) for a caller without the
   registrar. A noun without its verb (task-103's `missing required argument: wingfoil dna <command>`, modelled
   on the old DNA form) gets the same shape: `missing required argument: <command>` + `hint: usage: wingfoil
   dna <command>` — same class, same file (`src/cli/program.ts`).
2. **The suggestion** (`bug-104`, "either … WingFoil's own emitter, or the specs record the delegation"): WingFoil's
   own. `src/cli/suggest.ts` — Levenshtein ≤ 2 (`spec-008` §1), nearest wins, tie → code-unit order — matched
   against `Help#visibleCommands` of the level the unknown token was typed at (walk of `program.args`),
   written as `hint: did you mean "<name>"?` through `emitError`, in console too (console used to write
   Commander's text verbatim). Commander's suggestion for an unknown **option** is kept but re-worded into the
   same `hint:` line (`spec-008` §1 fixes the algorithm for commands only). The reason text stays Commander's
   `unknown command 'memroy'` (single quotes): `P5.1.4-cli-ux.feature` pins it; spec-005's double-quoted
   examples are corrected instead.
3. **`bug-115`/`bug-116` untouched:** the `help <unknown>` path keeps `unknown command '<x>'` with no hint.
4. **`bug-180`:** `refusesExtraItself` removed; `CorePositional.surplusHint` declared by the four DNA path verbs
   and appended by the registrar. `P2.1-dna-set.feature` sc. "invalid dotted key path" becomes `dna set
   ..language --value python` (an acceptance-contract change; `spec-008` §5 already wrote it so).
5. **`bug-226`:** `--format` first everywhere. `init`/`mcp` check it before the surplus; `mcp` now refuses an
   invalid value at exit 2 instead of falling back to `console` and starting. One composer,
   `invalidFormatReason` (`src/cli/output.ts`).
6. **`bug-198`:** `dna show`, `paths`, `memory search` and (same class) `memory history` and the DNA mutation
   verbs' load go through `loadConfigOrError` → `requireInitializedProject` first. `workflow list` keeps
   task-136's empty registry.
7. **`bug-245`:** the working-tree loaders read and label repository-relative (`readConfigFile`): dna, memory,
   roles (+ workflows' and directives' parse labels, same class). A missing file is `ConfigFileMissingError`
   (`code: 'ENOENT'`, so `coreErrorOf` still maps it to `NOT_FOUND`, exit 1) with the message
   `.wingfoil/<file> is missing: restore it from git, or re-create it ('wingfoil init' scaffolds a complete
   .wingfoil/ in a project that has none)`. Over MCP the Resource error keeps JSON-RPC `-32603` (every Resource
   refusal has that code today) but its message is that sentence — no host path, no `ENOENT` text.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — one missing-operand form, every verb, exit 2 | **red-first** | two shapes today (grep above) |
| 2 — `memry`/`memroy` → `hint:` through `src/cli/error.ts`; Commander-wording test rewritten | **red-first** | Commander's suffix today |
| 3 — `bug-115`/`bug-116` text unchanged | characterization | pinned so the change cannot leak into the help path |
| 4 — `bug-180` DNA surplus at registration | **red-first** | `E_NOT_AT_GIT_ROOT` from a subdirectory today |
| 5 — `bug-226` `--format` first | **red-first** | surplus first today; `mcp` lets a bad value through |
| 6 — `bug-198` not-initialized | **red-first** | raw `ENOENT` today |
| 7 — `bug-245` relative names (CLI + MCP) | **red-first** | absolute paths today |

### red (developer)

`212bf3fa` adds `test/cli/operand-error-shape.integration.test.ts` (AC 1–5, the AC 1 table derived from
`enumerateOperations(CORE_MODULES)` filtered on `positional.required`: 11 commands),
`test/cli/config-missing-refusal.integration.test.ts` (AC 6–7, CLI), `test/mcp/config-missing-refusal.test.ts`
(AC 7, MCP Resources over the in-memory transport), `test/cli/suggest.test.ts` (the matcher), and rewrites the
Commander-wording case of `test/cli/commander-parse-exit-codes.integration.test.ts` to the `hint:` line.
`npx jest test/cli/operand-error-shape test/cli/config-missing-refusal test/mcp/config-missing-refusal
test/cli/suggest` → **4 suites failed, 36 failed / 5 passed (41)**. The 5 that pass are characterizations:
the table-size guard, `dna set ..language --value python` (already `invalid key path`), `help memroy`,
`help help`, and `--format bogus paths a b` (a derived command already checked `--format` first). The MCP
failures read e.g. `Received: "MCP error -32603: ENOENT: no such file or directory, open
'/tmp/wf-storage-…/.wingfoil/memory.yaml'"`; `suggest.test.ts` fails on the missing module.

### green (developer)

`833ec080`:
- `src/core/registry.ts`: `missingOperandReason`, `commandUsage`; `CorePositional.surplusHint` replaces
  `refusesExtraItself`.
- `src/cli/registrar.ts`: surplus (with `surplusHint`) then missing-operand refusal, both before `resolveRoot()`.
- `src/cli/suggest.ts` (new); `src/cli/program.ts`: every Commander refusal through `emitError` with the hint
  (`commanderRefusal`, `commandsBeside`), the missing-verb shape, `refusedInvalidFormat` for `init`/`mcp`.
- `src/cli/output.ts`: `invalidFormatReason`, used by the registrar, `init-command.ts` and `program.ts`.
- `src/core/index.ts`: `loadConfigOrError`; `dnaPathPositional` loses its surplus check; the core refusals use
  `missingOperandReason`.
- `src/core/loaders.ts`: `ConfigFileMissingError`, `readConfigFile`, relative labels.
- Docs (non-Memory): `P2.1-dna-set.feature` (decision 4), `docs/cli-reference.md` (Argument grammar, Where to
  run it, Exit codes; `Unreleased (v0.3)` markers), `docs/01_vision/X_cli-cmds.md` (the missing-argument
  example; version 1.4 → 1.5, first edit since main).
- Existing tests that pinned the old wording or the old exception were updated: `program.test.ts`,
  `program.integration.test.ts`, `parse-error-format.integration.test.ts`,
  `missing-verb-exit-code.integration.test.ts`, `extra-operand-refusal{,.integration}.test.ts`,
  `usage-error-dispatch.test.ts`, `dna-mutation-surface.test.ts` (the "second positional" cases now pin the
  declared `surplusHint`; the CLI refusal is driven by the integration suites), `memory-{submit,approve,
  reject,deprecate,history}.test.ts`, `directive-remove.test.ts`, `production-registry.test.ts` (NOT_FOUND
  needs a `.wingfoil/` now; + 3 not-initialized cases), `format-key.test.ts` (working-tree labels are relative).
- After the green commit (committed with the notes, `refactor` below): one more AC 2 case, an unknown
  option's re-worded hint (`dna show --formt json` → `hint: did you mean "--format"?`).

### refactor (developer)

The first `npm test` after green: 247 suites, **1 failed** — `test/docs/name-resolvability.test.ts` flagged the
removed symbol `refusesExtraItself` named in the pending spec-006 Revision note; the note was reworded without
it (`npx jest test/docs/name-resolvability` → 11 passed).

Coverage first came out below main (in-process only: the new behaviour was exercised through the spawned
`dist/`). Added in-process cases: `test/core/registry.test.ts` (`missingOperandReason`, `commandUsage`,
`extraOperandsReason` with a hint), `test/core/config-file-missing.test.ts` (`ConfigFileMissingError` for
dna/memory/roles, `coreErrorOf` → `NOT_FOUND`, a non-`ENOENT` failure propagates), and two `program.test.ts`
cases (unknown verb and unknown option hints). Same class, file touched: `runDnaMutation`'s re-validation
labelled its issues with the absolute `dna.yaml` path; it now uses `DNA_YAML_PATH`. `ConfigFileMissingError`
is exported from `src/core`.

| Command | Result |
|---|---|
| `npm run test:coverage` (branch, final code) | exit 0; 248 suites / 4687 tests; All files 99.10 / 96.30 / 96.24 / 99.68 |
| `npm run test:coverage` (main `0cf8b131`, detached worktree, same `node_modules`) | exit 0; 243 suites / 4609 tests; 99.07 / 96.21 / 96.18 / 99.68 — no regression |
| `npm test` (final, with the pending spec amendments in the working tree) | exit 0; 248 suites / 4687 tests |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `node scripts/check-governance.cjs --base 0cf8b131` | exit 0 |

`test/docs/cli-reference.test.ts` is green with the `docs/cli-reference.md` edits (inside `npm test`). BDD:
`P5.1.4-cli-ux.feature`'s unknown-command scenarios are executed by `operand-error-shape` and
`parse-error-format`; `P2.1-dna-set.feature`'s rewritten scenario by `operand-error-shape` (AC 4) and
`dna-mutation-surface.test.ts`. The perf suites (`query-latency`, `resource-latency`) failed once in the
first full run under the 8-task load and passed on every later run (no threshold touched).

### review (reviewer, self)

- AC 1: every one of the 11 commands declaring a required positional (derived from `CORE_MODULES`) exits 2
  with `error: missing required argument: <name>` + `hint: usage: …`, nothing written; `--format json` gives
  `{error, hint}`; from a subdirectory still exit 2 (before the root). `operand-error-shape` AC 1 block.
- AC 2: `wingfoil memroy add` → `error: unknown command 'memroy'` / `hint: did you mean "memory"?`, exit 2,
  through `emitError`; `memory sbmit` → `"submit"`; `memxyz` (distance 3) → no hint; the Commander-wording test
  (`commander-parse-exit-codes.integration.test.ts`) asserts the `hint:` line now.
- AC 3: `help memroy` and `help help` keep their `error:` line, no `hint:` (characterization).
- AC 4: from a subdirectory `dna set project.name bogus --value y` → surplus message, exit 2;
  `refusesExtraItself` gone (`grep -rn refusesExtraItself src test` → nothing); P2.1 scenario rewritten.
- AC 5: `--format bogus` + `init extra` / `mcp extra` / `mcp` / `paths a b` → the invalid-`--format` line, exit 2.
- AC 6: no `.wingfoil/` → `{"error": WINGFOIL_NOT_INITIALIZED}` for `dna show`, `paths`, `memory search x`,
  exit 1, neither spelling of the repo path in stderr.
- AC 7: `.gitkeep`-only `.wingfoil/` → `error: .wingfoil/dna.yaml is missing: …` for `dna show`, `paths`, `mcp`;
  invalid `dna.yaml` → `E_VALIDATION modules (.wingfoil/dna.yaml)`; no `memory.yaml` → `memory search` and the
  `wingfoil://memory/task[/<id>]` Resources name `.wingfoil/memory.yaml`; no host path, no `ENOENT` text.
- Same class in touched files, fixed: the missing-verb refusal (decision 1), the workflows/directives/roles
  working-tree labels and `runDnaMutation`'s re-validation label (decision 7), `memory history` and the DNA
  mutation load (decision 6), `mcp`'s silent `--format` fallback (decision 5), stale comments in `program.ts`,
  `registry.ts`, `index.ts` (`grep -rn "missing required argument: memory \|wingfoil dna \${verb} <path>" src`
  → nothing), spec-005 §4's wrong `--reason` example.
- Not fixed (other files, other tasks' ground) — candidate findings in the final report: `directive assign`
  labels `roles.yaml` validation with the absolute path (`src/core/directive-assign.ts` `parseRoles(text,
  filePath)`, `filePath = join(root, ROLES_YAML_PATH)`); every MCP Resource refusal answers JSON-RPC `-32603`
  (InternalError), WingFoil refusals included.

### Pending amendments (approver)

Edited in the worktree, NOT committed (approved tech-specs, `amendable: true`):

- `spec-005-cli-command-contract` — `--reason "task-179 (bug-104, bug-168): §3.1 states the unknown-command
  hint (WingFoil's own Levenshtein <= 2 match at the level typed, wording did you mean \"<name>\"?) and the one
  missing-operand form with the usage as hint; §3.1/§4 examples corrected; dated Revision note."`
- `spec-008-cli-grammar` — `--reason "task-179 (bug-104, bug-168, bug-180, bug-226): §1 drops the DNA surplus
  exception, adds the missing-operand bullet and one order of usage checks, and names the hint the unknown-command
  suggestion is; §4 states the missing-positional form; dated Revision note."`
- `spec-006-core-domain-api` — `--reason "task-179 (bug-180): §2 declares CorePositional (name, required,
  description, surplusHint); refusesExtraItself removed; dated Revision note."`
