---
id: "task-239-serve-wingfoil-workflows-next-wingfoil-workflows-status-production"
type: task
title: "Serve `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status` on the production MCP server"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "workflow", "mcp"]
ref: "spec-017"
bug: ["bug-258", "bug-259", "bug-292"]
depends_on: ["task-147-detect-created-files-commits-req-sec-05-nopersistence", "task-225-add-workflow-status-pending-approvals-role-routing-fallback"]
tmpl_version: 260703
---

## Description

The two read-only Resources are registered next to `registerWorkflowResources` in `registerReadOnlyResources`, answer `NextResult` / `StatusResult` from `HEAD`, and cannot collide with `wingfoil://workflows/{name}` (second segment `-`, third segment present).

## Acceptance Criteria

- (red-first) `resources/read` on both URIs returns the same JSON as `workflow next|status --format json` at the same commit; a workflow named `next` stays at `wingfoil://workflows/next`.
- (red-first) The REQ-SEC-05 no-persistence guard covers both handlers (no file written, no commit — using `bug-036`'s widened helper if merged).
- (characterization) `docs/examples/04-mcp-server/run.sh`'s static-resource assertion (`"wingfoil://dna wingfoil://workflows"`) is updated and the example still self-checks; `npm run check:mcp` passes with the new resource count.
- (characterization) `spec-004` §2.1 lists the two URIs with the non-collision rule; §4.1's `workflow.next` Tool row moves to v1.0 step advancement (spec-006 Q1); dated Revision notes (`dl-047`).

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-017 §9 (the two v0.3 Resources); ruling R12; R15; spec-004 §2.1 and §4.1 amendments; spec-006 §3 rows.
- **Features:** P4.4, P4.5.
- **Notes:** Proposal key: A11.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the W2 B4a triage (2026-10-06).** `bug-258` and `bug-259` are absorbed here. With this task's
  `spec-004` §4.1 amendment: the nine mutating verbs as rows (`dna set`, `add`, `update`, `remove`; `directive
  create`, `assign`, `remove`; `memory amend`, `memory park`), §4.2's Memory sentence, and `spec-005` §Context's
  noun list gaining `directives`; remove the matching entries from `test/docs/enumeration-parity.allowlist.ts`.
  Both specs are approved elements: their amendments are recorded by the approver at the gate.

## Execution Notes

Branch `task/task-239-serve-wingfoil-workflows-next-wingfoil-workflows-status-production`, worktree
`../.wf2-wt/task-239`, cut from `main` at `3e692099` (pre-batch `0671d035` plus the B6 bug-absorption merge).
Start `c0e7536e`; bugs 258, 259, 292 `[planned → in-progress]` at `40daca02`, `682745f3`, `841edfd3`.

### Design (architect, 2026-10-11)

**Inputs read (dl-015).** Execution Notes of `depends_on` task-147 (the widened no-persistence snapshot: files,
status with untracked and ignored, `HEAD`, symbolic `HEAD`, refs; `snapshotFiles` refuses a dirty tree) and
task-225 (`workflowStatusAtHead`, `StatusResult`; "No MCP Resource (`-/status` is a later task's)"), plus
task-216 (`workflowNextAtHead`, its merge note "task-239 serves the Resource from `workflowNextAtHead`") and
task-187 (the parity gates; review fix F2 put the two `workflow.next` entries under `WORKFLOW_NEXT_ROW` with
`plannedBy: ['task-239']`; the ten first-run `UNTRIAGED` keys). The W2 B4a handover (bugs 258, 259) and B6
notes (bug-292: `check:mcp` must read the dev build's Resources too).

**Specs.** `grep -m1 '^status' docs/04_memory/design/specs/spec-00{4,5,6}-*.md docs/04_memory/design/specs/spec-017-*.md`
→ `approved` each. `tech-spec` is `amendable: true` (`grep -n amendable .wingfoil/memory.yaml`).

**What exists.** `grep -c "workflows/-/" src/mcp/*.ts` → 0 on every file: no state Resource. The production
server registers only `registerReadOnlyResources` + Prompts + an empty Tools channel (`src/mcp/server.ts`). The
SDK (`@modelcontextprotocol/sdk` 1.32.0) dispatches `resources/read` to an exact static URI first and only
then to templates (`node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js:423-440`), so a static
`wingfoil://workflows/-/next` cannot be shadowed by `wingfoil://workflows/{name}`. `check:mcp`
(`scripts/check-mcp-registration.cjs`) only counted each channel's list (`grep -n "readResource\|getPrompt"` → nothing).

**Shape.**
- `src/mcp/workflow-resource.ts`: `registerWorkflowStateResources` registers `workflows.next` /
  `workflows.status` at `WORKFLOW_NEXT_URI` / `WORKFLOW_STATUS_URI`; each read runs `workflowNextAtHead(root)` /
  `workflowStatusAtHead(root)` (the functions the CLI operations run, no operand) inside `withRefusalDetails`, after
  `refuseIfWriteIntent`. `registerReadOnlyResources` calls it after `registerWorkflowResources` (spec-017 §9).
- `src/mcp/read-only.ts`: `coreResultResource(uri, result)` — the value as `jsonResourceResult` (the CLI's
  `JSON.stringify` bytes without the newline), warnings beside `contents`, a `CoreResult.error` thrown as
  `readRefusalError` with the CLI's details. Exported from `src/core`: `workflowNextAtHead` (barrel).
- `scripts/check-mcp-registration.cjs` (bug-292): the observation also reads every listed static Resource and
  gets every listed Prompt (no arguments: every WingFoil Prompt argument is optional, spec-004 §3.1).
  `KNOWN_READ_FAILURES` declares, by pinned version and URI, the reads the pin is known to fail — today
  `0.2.2 wingfoil://workflows` (spec-017 §12) — and the verdict names each one; an entry that no longer applies
  (its read answers, it names another version than the pin, or the URI is not listed) fails the check, so the
  pin advance removes it. `DEV_BUILD_ENTRY` (`node dist/cli.js mcp`) is observed the same way with no known
  failure allowed; a missing `dist/cli.js` fails the check, naming `npm run build`.
- Docs: spec-004 §1/§2.1/§4.1/§4.2, spec-005 §Context, spec-006 §3's Resource bullet (pending amendments);
  `docs/cli-reference.md`, `docs/user-guide.md`, `docs/agents.md`, `docs/examples/04-mcp-server/run.sh` +
  README; `e2e-smoke.yaml` 1.4 → 1.5 (bug-292's "the release process says so"), its conformance row and
  `WORKFLOW.md`'s mcp-registration node.

**AC classification** (testing directive, T1).

| AC | Class | Why |
|---|---|---|
| 1 — both URIs return the CLI's `--format json` at the same commit | red-first | no state Resource (`grep -c "workflows/-/" src/mcp/*.ts` → 0) |
| 1 — a workflow named `next`/`status` stays `wingfoil://workflows/<name>`; `-` and `-/ghost` resolve to nothing | characterization | the shipped `{name}` template already behaves so; pinned so the new static URIs cannot change it |
| 2 — the REQ-SEC-05 no-persistence guard covers both handlers | red-first | the handlers do not exist, so the guard cannot read them |
| 3a — `docs/examples/04-mcp-server/run.sh` updated and self-checking | characterization | a documentation example; it fails after green until its assertion is updated |
| 3b — `check:mcp` passes with the new count, and reads every Resource/Prompt (bug-292) | red-first | the script reads nothing today (bug-292 step 4) |
| 4 — spec-004 §2.1 / §4.1 (+ bug-258's nine rows, §4.2), spec-005 §Context (bug-259) | characterization | documents; the parity gates are green before and after (allowlist entries replaced by the amendments) |

### Red (qa, 2026-10-11)

`93dd9b87`: `test/mcp/workflow-state-resources.test.ts` (AC 1, AC 2, the refusal path) and new cases in
`test/cli/mcp-registration.test.ts` (bug-292). Runs on that tree:
- `npx jest test/mcp/workflow-state-resources.test.ts` → **6 failed, 4 passed**; each failure
  `MCP error -32602: Resource wingfoil://workflows/-/next not found` (or `-/status`); the 4 passing are the
  characterization cases (`next`/`status` by name, `-` and `-/ghost` not found).
- `npx jest test/cli/mcp-registration.test.ts` → **8 failed, 21 passed**: the 7 new pure cases
  (`evaluateDevBuild`/`KNOWN_READ_FAILURES`/`DEV_BUILD_ENTRY` undefined, reads not judged) and the new
  real-repository case.

Red correction `e372f245` (before green, reason in the body): the refusal case asserted non-empty
`error.data.details`; the CLI's own `--format json` error for an invalid workflow file has none (probe in a
scratch repo: `node dist/cli.js workflow next --format json` → `{"error":"E_VALIDATION phases (workflows/custom/next.yaml): …"}`,
exit 1), so the case now compares the read error with that document (same reason, same details or none).

### Green (developer, 2026-10-11)

`f9226c3b`: the Resources, `coreResultResource`, the barrel export, `check:mcp`'s reads + known failures +
dev build (`.d.cts` updated), example 04 (`assert_eq` on four static URIs; reads `-/status` and compares its
`message` with `workflow status --format json`). One pre-existing case changed with the new parameter: "accepts
a registration of the pinned build that answers as declared" passes `[]` as known failures, since its fixture
pins 0.2.1 and the repository's entry is 0.2.2's (an entry for another version than the pin fails, tested).
Three helper cases added in `test/mcp/workflow-state-resources.test.ts` (the registration lists exactly the two
URIs; `coreResultResource` value/warnings; error/details) — the `CoreResult.error` arm is unreachable with no
operand today (only an unresolvable `<ref>` returns one, spec-017 §10), so it is tested on the helper.

- `npx jest test/mcp/workflow-state-resources.test.ts test/cli/mcp-registration.test.ts` → 13 + 29 passed.
- `node scripts/check-mcp-registration.cjs` → exit 0:
  `… runs the pinned wingfoil 0.2.2, advertising [prompts, resources] (prompts: 8, resources: 2)`, then
  `- known failure: the read of wingfoil://workflows fails (bug-292: …)`, then
  `the build under development (dist/cli.js) serves [prompts, resources, tools] (prompts: 8, resources: 4, tools: 0); every listed Resource read and Prompt get answered`.
- `WINGFOIL="node $PWD/dist/cli.js" bash docs/examples/04-mcp-server/run.sh` → `OK: MCP server: resources,
  templates, role prompts, a Memory read, the workflow status`; examples 01, 02, 03, 05 → exit 0 each.

`3e644cc8`: user docs, the parity allowlists, e2e-smoke 1.5 (+ conformance row, `WORKFLOW.md`), and the
non-collision note moved into the function doc so `src/mcp/workflow-resource.ts:34-37` (cited by spec-017 §9)
still holds the two shipped URI constants (`git show 3e692099:src/mcp/workflow-resource.ts | sed -n 34,37p`
equals the same range at HEAD).

Allowlist (`grep -o "reason: [A-Z_0-9]*" test/docs/enumeration-parity.allowlist.ts | sort | uniq -c`): before
planned 1, untriaged 10, `TOOLS_V04` 9, `AUDIT_V04` 2, `WORKFLOW_NEXT_ROW` 2; after **planned 1, untriaged 0,
`TOOLS_V04` 18, `AUDIT_V04` 2**. The ten `UNTRIAGED` and two `WORKFLOW_NEXT_ROW` entries are removed (the
amendments fix them); the nine new §4.1 rows are surplus against the empty production Tools channel, the same
class as the existing `memory.*` rows, so they carry `TOOLS_V04`. `WORKFLOW_NEXT_ROW` is deleted.

### Refactor (developer, 2026-10-11)

Main has not moved (`git -C ../../WingFoil2 log --oneline 3e692099..main` → empty): no main-sync.

| Command | Result |
|---|---|
| `npm run test:coverage -- --maxWorkers=2` (at `3e644cc8` + the uncommitted spec amendments, under the dl-170 slot, load 3.1) | exit 0; **383 suites, 7088 passed**. All files **99.3 / 97.22 / 97.94 / 99.7**, against main's W3 B5 gate 99.3 / 97.22 / 97.93 / 99.7 (`gate-w3b5-cov.log`). `src/mcp/read-only.ts` 100 / 100 / 100 / 100; `src/mcp/workflow-resource.ts` 100 / 50 / 100 / 100, the uncovered branch line 58 (the shipped `workflows.list` sort comparator) exactly as on main (`gate-w3b5-cov2.log`) |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` (under the slot) | exit 0 |
| `node scripts/check-governance.cjs --base 0671d035` | 8 `wf()` commits checked, `gated: 0 findings` |
| `node scripts/lint-claims.cjs --base 0671d035` | `0 warnings in 0 files (warn-only), 8 files read` |
| `npm run check:mcp` | exit 0 (output under Green) |

BDD: `docs/02_requirements/02_bdd/features/p5-interaction/P5.2.1-mcp-resources.feature` states the read
contract and the write refusal for every Resource; it names no URI list (`grep -n "workflows" <file>` → none),
so no scenario changes. The P4.4/P4.5 scenarios are the commands', pinned by task-216/225.

### Review (reviewer self-check, 2026-10-11)

| AC | Status | Evidence |
|---|---|---|
| 1 | met | `AC 1 — %s returns the JSON …` (×2): `text` equals the CLI's stdout less its newline, `mimeType` JSON, no extra field, `baseline.commit` = `git rev-parse HEAD`; next is the active `rl-minor-2`, status lists 2 open and 1 pending approval; `wingfoil://workflows/next` and `/status` return those workflows; `-` and `-/ghost` → not found; an invalid workflow at `HEAD` fails both reads with the CLI's `--format json` error |
| 2 | met | `AC 2 — a read of each, and both write shapes against each, persist nothing`: `snapshotFiles` → 2 reads + 4 write attempts (each `resources are read-only`) → `assertFilesUnchanged` (task-147's files/status/HEAD/refs) |
| 3 | met | example 04 OK (Green); `node scripts/check-mcp-registration.cjs` exit 0 with resources 2 (pin) and 4 (dev build); bug-292: every Resource read, every Prompt got, the known failure named, a stale entry fails (7 pure cases) |
| 4 | met | spec-004 §2.1 block + bullet, §4.1 without the next row (moved to v1.0 in prose), §4.2; spec-005 §Context; dated Revision notes (uncommitted, below); `npx jest test/docs` → 191 passed with them |

Same-class sweep: the two `CORE_MODULES` comments and the two `parity.test.ts` comments that called the
Resources "task-239's" / "a later task's" are updated; `grep -rn "is task-239's\|a later task's" src test` now
finds only `src/agent/placeholders.ts:9`, which is about an agent step, not these Resources. `grep -rn "wingfoil://dna wingfoil://workflows\"" docs test scripts` → none left.

### Pending amendments (approver)

Uncommitted in the worktree; the gates ran with them. spec-004/005 must be amended before the parity gates are
green on the merged branch (the allowlist entries they replace are already gone).
- `spec-004-mcp-surface-contract`: `--reason "task-239 serves wingfoil://workflows/-/next and -/status, so §2.1 lists both with their payload and the non-collision rule of spec-017 §9. §4.1 drops the workflow next row, which spec-017 §9 makes a read-only Resource, and says a step-advancing Tool belongs with v1.0 (spec-006 §3 open question 1). It gains the nine state-mutating verbs shipped since it was written, as v0.4 Tools, and §4.2 counts them, as bug-258 asks. No rule changes."` (after task-211's spec-004 amendment, in merge order)
- `spec-005-cli-command-contract`: `--reason "bug-259: §Context's noun list gains directives, the noun wingfoil directives list ships under and spec-008 §1 names. No exit code, format or rule changes."`
- `spec-006-core-domain-api`: `--reason "task-239 registers the two v0.3 workflow Resources through registerWorkflowStateResources, so §3's bullet names that function and its file instead of the src/mcp/index.ts line range the new call moved. No row, payload or baseline changes."` (after task-211's and task-240's spec-006 amendments)

### Decisions for the approver

1. **`check:mcp` reads, and the pinned build's failure is declared, not hidden** (bug-292). The pinned 0.2.2
   fails `wingfoil://workflows` on this repository, so a check that reads every Resource is red until the pin
   moves. The AC asks that it pass; bug-292 asks that the failure be named. `KNOWN_READ_FAILURES` does both: one
   entry, keyed by version 0.2.2, printed on every run, and it fails the check once it no longer applies — so
   `advance-pinned-build` must delete it (or `check:mcp` stays red).
2. **`check:mcp` now also starts the build under development** and needs `npm run build` first. A run on a
   clone without `dist/` fails, naming the build. Today it runs in `advance-pinned-build` and e2e-smoke's
   `mcp-registration` (no CI job runs it: `grep -rn check:mcp .github` → none).
3. **The nine new §4.1 rows are `TOOLS_V04` allowlist entries.** bug-258 asked for the nine `UNTRIAGED`
   entries to go; the rows they become are surplus against the production server's empty Tools channel, the
   class every other §4.1 row already is. Net: −12 entries, +9.
4. **The `workflow.next` row is removed, not kept with a v1.0 marker.** Its replacement is a sentence under the
   table (a row would count as a declared Tool in the parity gate). spec-017's `workflow.next` name-resolvability
   entry changes reason from `PLANNED` (task-239) to "retired on purpose" (spec-017's Consequences name the
   removed row), so it does not turn into a spent `planned` entry when this task is done.
5. **`e2e-smoke.yaml` 1.4 → 1.5** (description and the third post-check text) to name the reads and the
   known failure, as bug-292 asks. `release-planning.yaml`'s `advance-pinned-build` is not edited (task-230 and
   task-277 own it in B6): proposed text for its `checks.pre` comment — "`npm run check:mcp` exit 0; a
   KNOWN_READ_FAILURES entry for the old pin fails it: delete the entry when the new pin reads the Resource".
6. **`docs/agents.md`** gains two rows in its MCP ↔ CLI table; it is in no phase's `produces:` (CLAUDE.md §2).

### Candidate findings (not filed)

- **spec-017's Context cites `src/mcp/index.ts:79-84`** for `registerReadOnlyResources`; the function now spans
  84-90 (`grep -n "^export function registerReadOnlyResources" src/mcp/index.ts`). An offset citation of the
  `dl-075` class; not amended here (spec-017 is task-211's in B6).
- **A single-diagnostic workflow refusal prints no details** on the CLI or in MCP (`errorDetails` drops the
  diagnostic the reason already is): consistent, but an operator sees no other diagnostic of the load. Only a
  note, from the red correction.

### Retrospective

- The red correction `e372f245` came from asserting a property ("some details") instead of parity with the CLI
  document; writing parity assertions first would have avoided it.
