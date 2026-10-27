---
id: "task-130-show-coreerror-details-surface-give-refusal-shape-under"
type: task
title: "Show `CoreError.details` on every surface and give every refusal one shape under `--format`"
status: done
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "cli", "mcp", "errors"]
ref: "dl-055"
bug: ["bug-114", "bug-123"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`emitError` (`src/cli/error.ts:14-20`) prints only `reason` and `hint`, and the MCP registrar keeps only `error.message`, so `details` (the offending file, `dl-032`'s `detail`) reach no operator (`dl-055`). Parse-path errors hard-code `format: 'console'` (`src/cli/program.ts:103,144`; `bug-114`), and the same confinement refusal is `IO` from `memory add` and `VALIDATION` from the transition verbs (`bug-123`). Agents under `agent execute` parse `--format json`; B's `spec-016` error shape (`{error, hint?, details?}`) builds on this.

## Acceptance Criteria

- (red-first) console: detail lines follow the contract line; json/yaml: an additive `details` array; MCP: `error.data.details` (`dl-055` option 1).
- (red-first) an unknown option, a missing option argument and an unknown command under `--format json` print one JSON object on stderr, same shape as a core refusal; exit codes unchanged.
- (red-first) a path outside the project root is refused with one code from `memory add` and from all four transition verbs (the code chosen in design and stated in `spec-005` §3).
- (characterization) `spec-005` §3 carries the details rule and the chosen confinement code, with a Revision note.

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-055 option 1; spec-005 §3 (REQ-INT-08), §3.2; spec-004 (MCP `error.data`).
- **Features:** P5.1.4, P5.2.1.
- **Notes:** Proposal key: C09.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-130-show-coreerror-details-surface-give-refusal-shape-under`, worktree
`../.wf2-wt/task-130`, cut from `main` at `c43221c4`. Start `b3eee21b`; `bug-114` `[planned →
in-progress]` `4adb9e58`; `bug-123` `[planned → in-progress]` `4756dd53`. Batch B1, merged after
`task-131` (same refusal paths of `memory add` and the transition verbs).

### design (architect)

**`depends_on`.** Empty; no upstream Execution Notes to read (dl-015).

**Specs.** `spec-005-cli-command-contract` and `spec-004-mcp-surface-contract` are `approved`
(`grep -n "^status:"` on both). `dl-055` is `ready`. Option 1 was ratified by its approve commit
`b410c09f` (`git show b410c09f`: "Options: 1 (detail lines after the contract line; additive `details`
array in json/yaml; MCP `error.data`)"), although the body's Decision section still reads "*Approver to
choose.*". `spec-005` §3 had no slot for details and no statement on
parse-path errors or on the confinement code. `spec-004` had no error-details rule. Both need a
revision, which is made in place and left uncommitted (see "Pending amendments" below).
`.wingfoil/memory.yaml` declares `tech-spec` `amendable: true`.

**Measured on `main` before any change** (`npm run build`, then `node dist/cli.js …`):

| invocation | stderr | exit |
|---|---|---|
| `--format json nosuchpillar` | `error: unknown command 'nosuchpillar'` | 2 |
| `--format json dna show --bogus` | `error: unknown option '--bogus'` | 2 |
| `--format json memory add --type` | `error: option '--type <type>' argument missing` | 2 |
| `--format json dna` | 14 lines of `Usage: wingfoil dna …` help, then `error: missing required argument: wingfoil dna <command>` | 2 |

`grep -rn "details" src` found every `CoreError.details` in `src/` written as `{ issues:
ValidationIssue[] }`: approval-authority, memory-add-type, directive-assign ×4, core/index ×2,
memory-transition ×2. `src/cli/registrar.ts` and `src/mcp/registrar.ts` never read it.

**Decisions taken (approver to confirm):**

1. **What is shown.** Per issue, `file` and `detail` when non-empty, as `dl-055` option 1 lists. An
   issue with neither is left out. `code`, `path` and `message` are not shown, because
   `ValidationError.message` already joins them into the reason. For the same reason, after the
   independent review, a `file` the reason already contains verbatim is not repeated either (see
   review (independent)). The selection is done once, in
   `src/core/error-details.ts` (`errorDetails`), and the CLI and MCP surfaces use the same function
   (REQ-SYS-05).
2. **Console order.** `error:`, then `hint:` (spec-005 §3.1 calls it the "second line"), then the
   detail lines. Each detail line is indented two spaces, as `<file>: <detail>`. Continuation lines
   are indented four, so no detail line can start with `error: ` or `hint: `. No core refusal carries
   a hint today, so the hint-before-details order is never actually exercised.
3. **MCP.** A Tool refusal is an SDK *result* (`isError: true`), not a JSON-RPC error: the SDK
   catches a thrown error from a tool handler and turns it into a text result
   (`node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js`, `createToolError`), so a tool
   result has no `error.data`. So, for a **Resource** read, the details go in
   JSON-RPC `error.data.details` (`shared/protocol.js` forwards an error's `data`). For a **Tool**,
   they go in `structuredContent: {error, details}`, which is the CLI's `--format json` object. The
   text content stays the bare reason, which keeps parity with the CLI (spec-004 §4.3 item 3). The
   production `wingfoil mcp` server does not call `registerCoreModules` (`src/mcp/server.ts`), so
   today this path is reached only by the registrar's own consumers and tests.
4. **Parse path under a machine format.** Commander's `outputError` and `writeErr` hooks are set
   with `configureOutput`, before the first `.command()`, because `copyInheritedSettings` copies the
   configuration at that point. Under `console` the output is byte-identical. Under `json` or `yaml`
   the message becomes `{error, hint?}`, and Commander's `(Did you mean X?)` line becomes `hint: "Did
   you mean X?"`. The wording stays Commander's because `bug-104` owns it. The usage text Commander
   writes to stderr for an incomplete invocation is **not written**, which answers `bug-114`'s
   counter-argument: stderr is then one object. `--help` writes to stdout and is not affected. An
   invalid `--format` value is still refused in console text (spec-005 §2, unchanged).
5. **Confinement code: `VALIDATION`.** The transition verbs (`requireConfinedWriteTarget`) and
   `directive remove` (`requireConfinedTarget`) already return it (`src/core/confinement.ts`), so the
   only change is in `memoryAddFn`. There, a `StorageError` with code `E_PATH_ESCAPES_ROOT` or
   `E_TARGET_IS_SYMLINK` now maps to `VALIDATION`, and every other `StorageError` stays `IO`. The CLI's
   JSON shape carries no `code`, so the code is visible only to a core caller (and to MCP if it
   exposes it later).

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — details on console / json / yaml / MCP | **red-first** | no surface read `details` |
| 2 — parse refusals are one JSON object under `--format json` | **red-first** | console text today (table above) |
| 3 — one confinement code: `memory add` | **red-first** | `IO` today |
| 3 — one confinement code: submit/approve/reject/deprecate (+ amend) | characterization | already `VALIDATION`. The test pins it so the two halves cannot drift apart again |
| 4 — spec-005 §3 states the rule and the code | characterization (documentation) | text only, pending amendment |

### red (developer)

`83214c32`. Four new suites:
- `test/cli/error-details.test.ts`: the CLI through `buildCliCommands`, with a synthetic registry.
- `test/mcp/error-details.test.ts`: the registrar over the SDK's in-memory transport, with a real `Client`.
- `test/cli/parse-error-format.integration.test.ts`: spawns the compiled `dist/`.
- `test/core/confinement-error-code.test.ts`: 7 cases. The path-out-of-root refusal for `memory add`
  and the five `commitMemoryTransition` verbs (1 + 5), and the symlinked-leaf refusal for `memory add`
  only (1). The review added the symlinked-leaf case for the five verbs (now 12).

`npx jest` on the four → **19 failed, 12 passed, 31 total**. The 12 that pass are the
characterizations:
- the CLI and MCP no-details cases;
- the five transition-verb `VALIDATION` cases;
- the four console-unchanged and `--help` cases.

Two vacuous passes in the first draft were fixed before the commit:
- The `yaml` case used a one-line refusal. `error: unknown option '--bogus'` is itself valid YAML for
  `{error: …}`, so the case passed on the old code. It now uses the two-field `memroy` suggestion case.
- A trailing-`--format` case returned early instead of being excluded. It is now filtered out of the
  table.

### green (developer)

`8e38ab16`:
- `src/core/error-details.ts` (new) selects the details.
- `src/cli/error.ts`: `emitError` takes `details`.
- `src/cli/registrar.ts` passes `errorDetails(result.error)`.
- `src/mcp/registrar.ts` carries the details on both channels.
- `src/cli/program.ts`: `activeFormat`, `commanderRefusal`, and the `configureOutput` hooks. The two
  hard-coded `{ format: 'console' }` sites (missing-verb line, `init`'s resolve-root failure) now use
  the active format.
- `src/core/index.ts`: `memoryAddFn`'s confinement codes map to `VALIDATION`.

Existing tests changed because the behaviour they pinned changed on purpose:
- `test/cli/program.test.ts`: the `--format json help nosuchnoun` case now expects the JSON object.
  An `init --format json` resolve-root case was added. On the pre-change `program.ts`
  (`git show HEAD:src/cli/program.ts`) the suite has **2 failed**, the two changed or added cases.
- `test/cli/program.integration.test.ts`: `memory submit` sc.2 and `memory reject` sc.2 used to assert
  the whole stderr. They now assert the contract line first and the `dl-032` detail line after it.
  The first full run caught exactly these two, which is the dl-055 gap closed on a real document.

### refactor (developer)

- Added in-process `program.test.ts` cases for `commanderRefusal`, because the spawned suite does not
  count toward coverage. A `null` issue in `error-details.test.ts` covers the guard in
  `errorDetails`.
- Fixed the stale `program.ts` comment that said Commander's messages are unaffected.
- BDD: two `P5.1.4-cli-ux.feature` scenarios, cited from the test headers (`4b829041`).
- `docs/cli-reference.md` and `docs/user-guide.md` §10 now describe the error format
  (`test/docs` 4/4).

Gates, run with the two pending spec amendments in the working tree:

| command | result |
|---|---|
| `npm test` | exit 0; 170 suites / 2797 tests |
| `npm run test:coverage` | exit 0; 170 suites / 2797 tests; 98.74 / 94.6 / 94.1 / 99.49 (stmts / branches / funcs / lines). `main` `c43221c4`, measured in a temporary worktree: 98.73 / 94.58 / 94.01 / 99.49 (2759 tests), so no regression. Before the two in-process `commanderRefusal` cases were added, the run read 98.45 / 94.39 / 93.27 / 99.33, with `program.ts` lines 322-326 uncovered |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

### review (reviewer)

Checked against the code-review directive:

- **AC1.** Console, json and yaml are covered by `test/cli/error-details.test.ts` (6/6 at first
  submit, 8/8 after the review). A real
  `memory submit` illegal transition is covered end to end by `program.integration.test.ts` sc.2.
  MCP is covered by `test/mcp/error-details.test.ts` (4/4).
- **AC2.** Unknown command, unknown option, missing option argument and missing verb are each one
  JSON object at exit 2, with `--format` before or after the failing token. The keys match a core
  refusal's (`parse-error-format.integration.test.ts`, 14/14).
- **AC3.** `VALIDATION` from `memory add` (both refusals) and from submit/approve/reject/deprecate/amend
  (`confinement-error-code.test.ts`, 7/7 at first submit, 12/12 after the review).
- **AC4.** The `spec-005` §3 text and its Revision note are a pending amendment.

Same-class sweep in the files I touched: `grep -n "format: 'console'" src/cli/*.ts` now finds no
hard-coded format at an error site. The remaining console-only refusal is the registrar's invalid
`--format` value, which is deliberate (spec-005 §2).

Out of scope, not filed (for the coordinator):
- `spec-008-cli-grammar` §6 still defines only `{"error": "<reason>"}`. Addressed at the review: a
  third pending amendment.
- `dl-055`'s Decision section still reads "Approver to choose", although the task implements option 1.
- A thrown `ValidationError` on the CLI's throw path (`exitCodeForThrow`) still drops its issues.
  Only `CoreError.details` is in this task's scope.

### review (independent)

The coordinator's independent review returned **approve with fixes**. Each finding and what was done:

1. **`spec-008` §6 was not amended**, although `dl-055`'s Actions name it and `b410c09f` ratified
   them. §6 now shows `hint?` and `details?`, says the shape covers the parser's refusals, and points
   to `spec-005` §3.1–§3.2 for the rules. A dated Revision note was added. This is a third pending
   amendment.
2. **Detail lines repeated the file the reason already names.** `ValidationError.message` embeds
   `(<file>)`, so `dna show` on a broken `dna.yaml` printed the path twice.
   - Red: `f41603ba`, `error-details.test.ts` "a file the reason already names is not repeated" fails.
   - Green: `d5455452`. `errorDetails` leaves out a `file` that `error.message` contains verbatim,
     keeps the `detail`, and drops an entry left empty.
   - Measured after the change on a scratch repo with `modules: [` in `.wingfoil/dna.yaml`: `node
     dist/cli.js dna show` prints the path once, and `--format json` prints `{"error": …}` with no
     `details`.
   - The spec-005 and spec-004 Revision notes no longer say "the file … reached no operator". That
     was true only for the illegal-transition refusal, whose message is the bare contract string.
3. **The BDD scenario pinned Commander's wording** (`"Did you mean memory?"`), which `bug-104` owns.
   It now asks for a `hint` that names `memory` (`397601dc`).
4. **`src/cli/init-command.ts` emitted without details.** It now passes `errorDetails(result.error)`.
   - Red: `f41603ba`, an `init-command.test.ts` case fails.
   - Green: `d5455452`.
5. **Tests.**
   - Added a multi-line continuation-indent case, which backs "no detail line can begin with `error:`".
     It is characterization and passed on first run.
   - Corrected the red section's confinement count (7 = 1 + 5 + 1).
   - Added the symlinked-leaf case for the five transition verbs. It is characterization: they were
     already `VALIDATION`.
6. **The spec-005 §3.2 listing called `detailLine` without showing it.** The listing now includes
   it, so `src/cli/error.ts`'s "written from the spec's own code listing" holds.
7. **Ratification.** The design section now cites `b410c09f`.

Recorded, no fix: the production `wingfoil mcp` server (`src/mcp/server.ts`) does not use
`registerCoreModules`, so its Resources carry no `error.data`. The coordinator files a follow-up.

Gates re-run after the fixes, with the three pending amendments in the working tree:

| command | result |
|---|---|
| `npm test` | exit 0; 170 suites / 2805 tests |
| `npm run test:coverage` | exit 0; 98.74 / 94.65 / 94.1 / 99.49 (`main` `c43221c4`: 98.73 / 94.58 / 94.01 / 99.49) |
| `npm run lint`, `npm run docs:api`, both `tsc --noEmit` | exit 0 |

### Pending amendments (approver)

Edits left uncommitted in the worktree for `memory amend` (tech-spec is `amendable: true`). The gates
above ran with all three edits in the working tree.

- `spec-005-cli-command-contract`: `--reason "§3 gives refusal details a slot (indented console
  detail lines, an additive details array, a file the reason already names not repeated), states that
  every refusal has the §3.2 shape under --format whichever layer raises it, shows detailLine in the
  code listing, and names VALIDATION as the one code of the confinement refusal, per task-130
  (dl-055 option 1 as ratified in b410c09f, bug-114, bug-123). Dated Revision note added."`
- `spec-004-mcp-surface-contract`: `--reason "§4.3 item 4 states where a refusal's details reach an
  MCP client: error.data.details on a failed read, structuredContent on a tool refusal, per task-130
  (dl-055 option 1 as ratified in b410c09f). Dated Revision note added."`
- `spec-008-cli-grammar`: `--reason "§6 shows the optional hint and details fields, states that the
  shape covers the argument parser's refusals, and points to spec-005 §3.1-§3.2 for their rules, per
  task-130 (dl-055 option 1 as ratified in b410c09f, whose Actions name this section; bug-114). Dated
  Revision note added."`
