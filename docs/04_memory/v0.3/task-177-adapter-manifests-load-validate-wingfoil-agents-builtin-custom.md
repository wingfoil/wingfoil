---
id: "task-177-adapter-manifests-load-validate-wingfoil-agents-builtin-custom"
type: task
title: "Adapter manifests load and validate from `.wingfoil/agents/{built-in,custom}/`, and the `agent` module is registered"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "schema", "validation"]
ref: "adr-012"
bug: []
depends_on: ["task-138-dna-yaml-declares-team-agents-adapter-runs-paths"]
tmpl_version: 260703
---

## Description

Creates `src/agent` (`spec-016` §1). It adds the module to `dna.yaml` `modules` beside the nine that exist, and registers `CoreModule` `agent` with no operations yet. The first code in it is the manifest: - a strict Zod schema for every §2.2 field, run through `spec-009`'s two-pass entry; - the closed placeholder set of §2.3, with whole-argv-element filling (`dl-090` Q3 (a)) and the per-field legality; - discovery of `built-in/` and `custom/` at `HEAD`, where a name present in both directories is an error. Nothing launches yet.

## Acceptance Criteria

- (red-first) A manifest with an unknown key, a missing required field, or `format` ≠ 1 is refused with `adapter '<name>': <zod issue>`. The detail lines follow `dl-055`.
- (red-first) `§2.3` rules are enforced: an unknown placeholder is a validation error; so is a placeholder concatenated inside an argv element (`--x={bootstrap}`); so is `{bootstrap}` used when `prompt.via` ≠ `arg`; so is `{session_id}` in `session.lookup_args` or `usage.lookup_args` under `session.id: output|lookup`; so is `prompt.via: stdin` combined with an interactive launch.
- (red-first) Required-with rules: `mcp.template` with `config-file`, `session.assign_args` with `assign`, the `*_args` + `field(s)` with `output`/`lookup`, `verified_with` on a built-in. `mcp.via` has no `none`.
- (red-first) The same basename under `built-in/` and `custom/` is refused at discovery. The file basename must equal `name`.
- (red-first) Manifests are read at `HEAD` (`dl-080` (B), `command-baseline`): an uncommitted manifest edit does not change the loaded adapter.
- (red-first) Only the adapter a caller selects is parsed and validated (`spec-016` §3.2 step 5); a broken unrelated manifest does not block it.
- (characterization) `.wingfoil/dna.yaml` `modules` gains `agent` (path `src/agent`), and the API-docs gate (`test/docs/`) covers the new module.

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** adr-012 points 2, 6; spec-016 §1, §2.1–§2.3, §2.6 (declarations only).
- **Features:** P5.3.1.
- **Notes:** Proposal key: B05. fixture manifests live under `test/fixtures/agents/`. The fake **script** is task-200.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-177-adapter-manifests-load-validate-wingfoil-agents-builtin-custom`, worktree
`../.wf2-wt/task-177`, cut from `main` at `c80167d6`; start `777b3b3c`. `bug: []`, so no bug syncs.

### design (architect)

**`depends_on`** (dl-015): `task-138` is `done` (`grep -n "^status" docs/04_memory/v0.3/task-138*.md`).
Its notes hand over: `team.agents[].adapter` is validated in the id class, `paths.runs` exists, and
`dna.yaml` was left untouched for later tasks. Nothing it defers lands here (the run log is task-206's).

**Specs.** `spec-016` and `spec-009` are `approved`, `adr-012` `accepted`, `dl-055`/`dl-080`/`dl-090`
`ready` (`grep -n "^status:"` over the six files). No spec edit was needed: every AC is stated in
`spec-016` §2.1–§2.3 and §3.2 step 5.

**Placement.** `src/agent` = `schema.ts` (Pass 1, every object `z.strictObject`), `manifest.ts`
(`parseAdapterManifest`: YAML → `runValidation` with one Pass-2 check: basename, required-with,
placeholders), `placeholders.ts` (§2.3), `discovery.ts` (`listAdaptersAtRev`, `loadAdapter`), `index.ts`.
It reads git through `storage.readPathAtRev` and `core/revision`'s `resolveRevision` /
`listPathsAtCommit` / `atHeadOr`, as `src/memory/query.ts` already does; `src/core/index.ts` does not
import `src/agent`, so there is no cycle. `CORE_MODULES` gains `{ name: 'agent', operations: {} }`.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 strict schema, `adapter '<name>': <zod issue>` + dl-055 details | red-first | no `src/agent` existed (`ls src` on `c80167d6`) |
| 2 §2.3 placeholder rules | red-first | same |
| 3 required-with rules | red-first | same |
| 4 duplicate basename at discovery; basename = `name` | red-first | same |
| 5 read at `HEAD` | red-first | same |
| 6 only the selected adapter parsed | red-first | same |
| 7 `dna.yaml` `modules` gains `agent`; API-docs gate covers it | characterization | `test/core/module-layout.test.ts` already forces every `src/` dir into `dna.yaml`, and `typedoc.json` `entryPoints: ["src"]` with `expand` already covers any new directory |

The `CoreModule` registration (the title, not an AC) was written test-first in `test/agent/module.test.ts`.

### red (developer)

`a675ddae`: `test/agent/manifest.test.ts`, `test/agent/discovery.test.ts`, `test/agent/module.test.ts`,
and the fixture `test/fixtures/agents/custom/fake.yaml` (a custom adapter declaring every §2.2 field;
its script is task-200's). `npx jest test/agent` → **3 suites failed, 0 tests ran**: `Cannot find
module '../../src/agent'` in each — the genuine red for a module that does not exist.

### green (developer)

`e0c9e958`: `src/agent/*`, `CORE_MODULES` entry, `.wingfoil/dna.yaml` (`agent` at `src/agent`, version
1.2 → 1.3). `npx jest test/agent test/core/module-layout.test.ts test/core/production-registry.test.ts
test/core/parity.test.ts` → **6 suites, 110 passed**.

### refactor (developer)

The first full `npm run test:coverage` failed one test: `test/cli/help-describes-every-command.test.ts`
expected every `CoreModule` to show as a CLI noun with its description, but a module with no operation
derives no command (`buildCliCommands` iterates `enumerateOperations`). `2c35af67` makes the test assert
that such a module shows **no** noun, rather than giving `agent` an empty noun; it also covers the
module's exported codes and the non-`HEAD` revision refusal (agent function coverage was 83.78%).

Gates on `2c35af67`:
- `npm run test:coverage` → **221 suites, 3979 passed**; All files **98.88 | 95.65 | 95.53 | 99.57**
  (stmts | branch | funcs | lines), against `main`'s last recorded figure in `task-160`'s notes,
  `98.88 | 95.56 | 95.34 | 99.58`. Lines is 0.01 lower; that is rounding over a larger total, since
  `src/agent` itself is 98.78 | 97.87 | 100 | 99.23. Its one uncovered line is `discovery.ts`'s
  re-throw of a non-`RevisionError`.
- `npm test` → 3978 passed, 1 failed: `test/core/query-latency.test.ts`, a wall-clock test, while
  other worktrees ran jest. Re-run alone: `npx jest test/core/query-latency.test.ts` → **4/4 passed**.
- `npm run lint` → 0; `npm run docs:api` → 0; `npx tsc --noEmit -p tsconfig.json` → 0;
  `npx tsc -p tsconfig.build.json --noEmit` → 0; `node scripts/check-governance.cjs --base c80167d6` → 0.

### review (reviewer, self)

- AC 1: an unknown key (top level and nested, including `env`), a missing required field (8 top-level, 8
  nested) and `format` 2 / 0 / `"1"` / 1.5 are each refused (`manifest.test.ts`). Through
  `loadAdapter`, the message is `adapter 'fake': <path>: <message>` for the first issue, and
  `errorDetails` (dl-055, `src/core/error-details.ts`) gives one entry per issue, each with its `file`
  `HEAD:.wingfoil/agents/custom/fake.yaml` and its `<path>: <message>` detail (`discovery.test.ts`). Met.
- AC 2: unknown placeholder (argv and `mcp.template`); concatenation (`--x={bootstrap}`, `{bootstrap}x`,
  `{mcp_command} {mcp_args}`); `{bootstrap}` under `prompt.via` stdin/file; `{session_id}` in
  `session.lookup_args` / `usage.lookup_args` under `lookup` and `output`; `prompt.via: stdin` with the
  interactive launch. Also refused: a placeholder in a field §2.3 does not list. Met.
- AC 3: `mcp.template`/config-file, `session.assign_args`/assign, `session.lookup_args`+`field`/lookup,
  `session.field`/output, `usage.lookup_args`+`fields`/lookup, `usage.fields`/output, `verified_with`
  on a built-in only; `mcp.via: none` is outside the enum. Met.
- AC 4: the same basename in both directories → `listAdaptersAtRev` throws `E_ADAPTER_DUPLICATE` naming
  both files, and `loadAdapter` of **any** adapter is refused `adapter 'fake': declared in both …`.
  A `name` other than the basename → `adapter 'other': name: must equal the file basename …`. Met.
- AC 5: an uncommitted edit (valid or broken), an untracked manifest, and an untracked same-name file
  change nothing at `HEAD`; `rev` reads another commit. Met.
- AC 6: with a broken `custom/broken.yaml` and a nameless built-in committed, `loadAdapter('fake')` is
  ok, and only `loadAdapter('broken')` fails. Met.
- AC 7: `module-layout.test.ts` and `test/agent/module.test.ts` pass; the API-docs gate passes over
  `src/agent` (`npm run docs:api` → 0). Met.

**Decisions for the approver to confirm** (none of them is stated in `spec-016`):
1. An adapter name that neither directory holds is `NOT_FOUND`, `adapter '<name>': no
   .wingfoil/agents/built-in/<name>.yaml or .wingfoil/agents/custom/<name>.yaml at HEAD`. §3.7 has no row
   for it.
2. Only `<kind>/<name>.yaml` directly inside a directory is an adapter. `.yml`, nested files and other
   extensions are ignored silently.
3. `launch.headless.args` is required inside `launch.headless` (the table marks it "no", read as
   "headless is optional").
4. The duplicate check runs at discovery over all names, so a duplicate pair blocks every adapter, as
   §3.3 step 2 orders. AC 6's isolation covers parse errors only.
5. `prompt.via: stdin` is always refused in format 1, because `launch.interactive` is required. The enum
   value is unreachable until a headless-only manifest exists (v1.0).

**Same-class sweep.** No other place lists the nine modules: `grep -rn "nine\b" .wingfoil/README.md
README.md docs/user-guide.md docs/agents.md` finds nothing. `CLAUDE.md` §1/§2/§4 still says nine modules;
that is `align-agent-docs`'s, not changed here.

### Pending amendments (approver)

None.
