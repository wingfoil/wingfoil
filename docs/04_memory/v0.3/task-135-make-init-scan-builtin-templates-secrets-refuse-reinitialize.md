---
id: "task-135-make-init-scan-builtin-templates-secrets-refuse-reinitialize"
type: task
title: "Make `init` scan the built-in templates for secrets and refuse to re-initialize storage"
status: done
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "security", "init"]
ref: "spec-007"
bug: ["bug-037", "bug-038", "bug-088"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`dotenv-style-secret-line` is anchored at column 0 (`src/validation/secret-scan.ts:116`, and `spec-007` §2), so indented, `export`-ed or list-item credential lines go unseen (`bug-037`); `init` never secret-scans the built-in templates before writing them, as `spec-007` §4 step 5 requires — the scanner has no production caller (`bug-038`); `initWingfoilStorage` has no already-initialized check and overwrites a committed `dna.yaml` (`src/core/init.ts:92-135`; `bug-088`).

## Acceptance Criteria

- (red-first) the pattern matches `  TOKEN=abcd1234`, `export API_SECRET=…`, `- PASSWORD=…`; the existing negatives still pass; `spec-007` §2 carries the regex and the stale "warn patterns are heuristic" note is corrected.
- (red-first) `init` with a built-in template carrying a blocking finding (test seam) refuses before writing, exit 1, naming template and pattern.
- (red-first) `initWingfoilStorage` on an initialized clean repo refuses like `initWingfoilProject`; the committed `dna.yaml` is unchanged.

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-007 §2 (dotenv pattern), §4 step 5 (init pre-write scan); REQ-SEC-08.
- **Features:** P5.1.1, P3.8.
- **Notes:** Proposal key: C33.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-135-make-init-scan-builtin-templates-secrets-refuse-reinitialize`, worktree
`../.wf2-wt/task-135`, cut from `main` at `5b885fd5`. Start `97170d26`; `bug-037`, `bug-038`, `bug-088`
`[planned → in-progress]` `300961df`, `0304b517`, `72c9b5f4`. The work was interrupted once (the agent
process exited after green); it resumed at `9f725193` with nothing lost.

### design (architect)

**`depends_on` read (dl-015).** `depends_on: []`. `task-131` (merged, `84305032`) is the one the batch
named: it put `requireInspectableTarget` inside `requireUnmodifiedTargets` (`sed -n 280,290p
src/core/write-guard.ts`), which `initWingfoilStorage` calls as its fourth guard. That order is kept;
the new refusal goes after it (decision 2 below).

**Specs.** `spec-007-secret-hygiene-patterns` is `approved`; `dl-031` and `dl-036` are `ready`
(`awk '/^status:/{print $2;exit}'` on each). `spec-007` needs a revision for AC 1 (§2 regex and the
stale `warn` note) and for one wording point in §4 step 5 (decision 1). `tech-spec` is `amendable: true`
in `.wingfoil/memory.yaml`, so the edit is made in the worktree and left uncommitted (pending
amendment, below). No ADR is touched.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — the dotenv pattern matches prefixed lines; negatives hold; spec-007 §2 carries the regex | **red-first** (spec part: documentation) | on `5b885fd5` an indented, `export`-ed or list-item line with a short value produces no dotenv finding (`bug-037`'s table) |
| 2 — `init` refuses a built-in template carrying a blocking finding, exit 1, naming template and pattern | **red-first** | `grep -rn scanText src/core src/storage` → no output on `5b885fd5`: no caller |
| 3 — `initWingfoilStorage` on an initialized clean repo refuses like `initWingfoilProject` | **red-first** | it has no `detectInitState` check on `5b885fd5`, so it overwrites and commits |

**Decisions for the approver to confirm.**

1. **The abort message names the template, not a path.** `spec-007` §4 step 5 says "naming the failing
   template path and `pattern_id`". A `BuiltinTemplateSource` carries `name`, `kind` and `content`, no
   path, and the REQ-SEC-10 schema-check messages name the template the same way. The message is
   `built-in <kind> template secret scan failed: <name> (<pattern_id>, line <n>)`; §4 step 5 is
   amended to "naming the failing template and `pattern_id`". The alternative, a `path` field on
   `BuiltinTemplateSource`, touches every fixture that builds one.
2. **Guard order in `initWingfoilStorage`:** git repo → identity → integrity (schema, then secret scan)
   → dirty/uninspectable target (task-092, task-131) → **already initialized** (new). In
   `initWingfoilProject` the already-initialized check is second. Placing it last here keeps the two
   target guards' messages, which name the offending path, and their tests unchanged
   (`write-guard-dirty-target.test.ts` AC3, `write-guard-uninspectable-target.test.ts`); nothing is
   written on any branch either way. Every target that guard 4 refuses also lies inside an initialized
   `.wingfoil/`, so guard 5 alone would also refuse them, with the generic message.
3. **No `force` parameter** (`bug-088` asked to decide rather than assume): no caller re-scaffolds on
   purpose, and `initWingfoilStorage` is in no `CORE_MODULES` operation.
4. **The secret scan lives in `verifyBuiltinTemplates`**, not as a second call in each init path, so
   the two write paths cannot drift apart (the `bug-018` lesson). A source is scanned after its schema
   check passes, so one source reports one failure. Warn-level findings are not surfaced: `init` has no
   warning channel and spec-007 §4 step 7's "warnings are always returned" concerns the scan result,
   which `verifyBuiltinTemplates` consumes internally. No `security-ignore` list applies, because the
   project being initialized has none yet.

### red (developer)

`448e6df5` adds:
- `test/validation/secret-scan.test.ts` — a `describe` with 6 prefixed positives (indentation, tab,
  `export`, indentation plus `export`, `-` and `*` list markers, all with short values so only the
  dotenv pattern can catch them), the column-0 form, 5 negatives (prose, a code assignment, a YAML
  colon mapping, an unrelated key, an empty value) and a prefixed placeholder that must be `info`.
- `test/core/builtin-template-secret-scan.test.ts` — `verifyBuiltinTemplates` on a schema-valid
  directive and a workflow carrying a PEM private-key header, first-failure order, warn-only and
  placeholder sources passing; then both init write paths through the `builtinTemplates` seam:
  VALIDATION, exit 1, no `.wingfoil/`, zero commits; and the derived list still succeeds.
- `test/core/init.test.ts` — re-initialization: a committed hand-authored `dna.yaml` stays byte-equal
  with HEAD and the tree unchanged; a second `initWingfoilStorage` commits nothing; the message equals
  `initWingfoilProject`'s; an incomplete (empty) `.wingfoil/` still initializes.
- the P3.8 BDD scenario "Error - a built-in template carries a secret".

`npx jest test/core/init.test.ts test/core/builtin-template-secret-scan.test.ts
test/validation/secret-scan.test.ts` → **15 failed, 61 passed**: 7 prefix tests (`Received` lacks
`dotenv-style-secret-line`), 5 secret-scan tests (`Received: null`, and `ok: true` on both write
paths), 3 re-init tests (`ok: true`). The passing ones in the new blocks are the negatives, the
column-0 case, the warn/placeholder case, the derived-list success and the incomplete-project case —
all behaviour that already held (characterization inside a red-first AC).

### green (developer)

`9f725193`:
- `src/validation/secret-scan.ts` — the dotenv regex becomes
  `^\s*(?:export\s+|[-*]\s+)?[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*\S+`
  (case-insensitive), the comment quoting the amended spec-007 string; the `scanText` doc names its
  new caller.
- `src/core/builtin-integrity.ts` — `secretScanFailure` runs `scanText` on each source after its
  schema check; `BuiltinIntegrityFailure` gains an optional `patternId`.
- `src/core/init.ts` — guard 5 in `initWingfoilStorage` (`detectInitState(root) === 'initialized'` →
  `WINGFOIL_ALREADY_INITIALIZED`); guard-order and module docs updated.
- `test/core/write-guard-dirty-target.test.ts` — the header and the AC3 title no longer say
  `initWingfoilStorage` has no already-initialized guard (same-class stale prose).

The 15 red tests pass; the neighbouring suites (`write-guard-*`, `project-directives`,
`builtin-integrity`, `init-project`, `test/storage`) → 24 suites, 368 tests, all passing.

### refactor (developer)

Run with the spec-007 amendment in the working tree.

| Gate | Command | Result |
|---|---|---|
| unit + BDD-backed suites | `npm test` | 178 suites, **2995 passed** |
| coverage | `npm run test:coverage` | All files `98.82 / 95.07 / 94.45 / 99.52`; `main` `5b885fd5` measured in a detached temp worktree with `npx jest --coverage --maxWorkers=2`: `98.82 / 95.06 / 94.44 / 99.52`, 2969 tests — no regression. `builtin-integrity.ts` 100 %; `init.ts`'s uncovered lines are the two pre-existing `IO` catch arms |
| lint | `npm run lint` | exit 0 |
| API docs | `npm run docs:api` | exit 0, no warning |
| typecheck | `npx tsc --noEmit -p tsconfig.json`; `npx tsc -p tsconfig.build.json --noEmit` | exit 0, exit 0 |
| e2e smoke | `npm run build && node scripts/e2e-smoke.cjs -- node "$PWD/dist/cli.js"` | exit 0, 19 `ok` lines, none failing |
| examples | `WINGFOIL="node $PWD/dist/cli.js" bash docs/examples/0N-*/run.sh`, N = 1..5 | all five exit 0 |

The smoke script and the examples use `wingfoil init` (`initWingfoilProject`), which already refused
re-initialization; the new refusal is on the library entry point only. The repository's own scan
surface still has zero blocking findings under the widened pattern (`secret-scan.test.ts`
"matches 0 blocking secret patterns across this repository's indexed surface", passing).

### review (self, reviewer)

- AC 1: met — prefixed positives and negatives in `secret-scan.test.ts`; spec-007 §2 regex, the stale
  `warn` note and a Revision note in the pending amendment (`git diff --
  docs/04_memory/design/specs/spec-007-secret-hygiene-patterns.md`).
- AC 2: met — both write paths, exit 1, message `built-in directive template secret scan failed:
  security (private-key-pem, line 12)`, nothing written.
- AC 3: met — `init.test.ts` "Error - re-initializing an initialized project (bug-088)".
- Same class: `grep -rn "no already-initialized\|already-initialized check" src test` → only the new
  task-135 / bug-088 lines; `grep -rn "task-044's \`init\` integrity check calls" src` → none left.

### review (independent)

Verdict: approve with fixes. All three were applied while the task stays `in-review`.

1. **The widened dotenv pattern also blocks indented code assignments** whose name contains a
   credential word (a `token` variable assigned a function call, a `max_tokens` setting, a CI step
   reading a token from a secrets store). Nothing in this repository's scan surface matches today (the
   surface test still passes), but the trade-off was not written down, and the negative
   `const token = getToken()` stepped around it. `a7bb4b64` pins the shape as blocking (3 cases,
   characterization: they pass on first run) and pins the `<!-- example -->` fence exemption. The
   pending spec-007 amendment now names the shape in §2's notes, along with its escape hatches
   (`<!-- example -->`, `security-ignore`), and §4 step 6 no longer calls the trigger "near-unambiguous".
2. **A regression from this task:** with `.wingfoil` a regular file, `initWingfoilStorage` threw
   `ENOTDIR` from `detectInitState`'s `readdirSync`. Before this task it returned an `IO` result.
   `initWingfoilProject` already threw there. Red-first: `a7bb4b64` adds a two-path table to
   `init.test.ts`; `npx jest test/core/init.test.ts -t "not a directory"` → 2 failed,
   `Error message: "ENOTDIR: not a directory, scandir …"`. Fixed in `8bc7f1b7` with one helper in
   `src/core/init.ts`, `refuseInitializedProject`, which both entry points call. It refuses a
   non-directory `.wingfoil` (VALIDATION, exit 1, the file left alone, no commit), then runs the
   already-initialized check. `detectInitState` (`src/storage/init-state.ts`) is unchanged, so it
   keeps spec-011's three states.
3. **Comment wording:** the guard-5 comment said "the same refusal and message as
   `initWingfoilProject`". The message is shared but the order is not (fifth here, second there).
   The comment and the function doc now say so (`8bc7f1b7`).

Gates after the fixes, with the amendment in the working tree:
- `npx jest --coverage --maxWorkers=4`: 178 suites, **3001 passed**; All files `98.82 / 95.08 / 94.45 / 99.52`.
- `npm run lint`, `npm run docs:api` and both `tsc` runs exit 0.
- `node scripts/e2e-smoke.cjs -- node "$PWD/dist/cli.js"` exits 0, with 19 `ok` lines and 0 failures.
- `docs/examples` 01–05 all exit 0.

**Follow-up the coordinator files (not fixed here; out of `bug-037`'s scope).** The dotenv pattern
still misses these forms: a commented `.env` line (a `#` before the key), a list item that is also
`export`-ed, `readonly` / `declare -x` assignments, and PowerShell `$env:` assignments.

### Pending amendments (approver)

- `spec-007-secret-hygiene-patterns` — proposed `--reason`: "task-135 (bug-037, bug-038): §2's
  dotenv-style-secret-line regex tolerates leading whitespace, an export keyword or a list marker, and
  its notes name indented code assignments as the known false-positive shape with the example-fence
  and security-ignore escape hatches; the stale note calling jwt-like a warn pattern is corrected; §4
  step 5 names the failing template rather than a path, since a built-in template source has none; §4
  step 6 no longer calls the dotenv trigger near-unambiguous. A dated Revision note records it."
