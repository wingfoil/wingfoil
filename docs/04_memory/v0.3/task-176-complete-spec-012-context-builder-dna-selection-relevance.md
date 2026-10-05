---
id: "task-176-complete-spec-012-context-builder-dna-selection-relevance"
type: task
title: "Complete the `spec-012` context builder: DNA selection, relevance-filtered Memory, the canonical §7 payload and its validation, all pinned to `stateRef`"
status: approved
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "context", "determinism"]
ref: "spec-012"
bug: []
depends_on: ["task-137-read-pillar-configuration-memory-documents-any-commit-not"]
tmpl_version: 260703
---

## Description

P5.4.4 ("structured context passed to agents at task start") and P5.3.3 (relevance filtering) are only half built. `assembleExecutionContext` returns the element alone as `memory` and serializes nothing. This task makes `context-builder` the single public entry of `spec-012` §1: - input: `ContextRequest {role, element, stateRef, limits}`; - every read goes through task-137's rev readers; - DNA selection follows §4, Memory follows §6 through `filterRelevantMemoryDocuments`, now fed at `stateRef`; - output: the §7 canonical Markdown payload, with `ExecutionContext.warnings` kept outside it (§5.1); - the context is validated before use (P5.4.4 sc. 3). `agent execute` (task-218) and the `{role}-session` Prompt (task-195) are its two consumers.

## Acceptance Criteria

- (red-first) P5.4.4 sc. 1: the assembled context exposes distinct, individually addressable `dna`, `memory` and `directives` sections, and the serialized payload carries the §7 section headings as fixed literals, including `## 4. Relevant Memory (0 documents)` when empty.
- (red-first) P5.4.4 sc. 2 / `spec-012` §8: two independent builds of the same `(role, element, stateRef, limits)` are byte-identical. A build at a different `stateRef` whose Memory differs is not. The payload holds no timestamp, host or absolute path, uses LF only, has exactly one trailing `\n`, and re-emits YAML with sorted keys.
- (red-first) P5.4.4 sc. 3: a context missing a section is refused with `invalid execution context: missing '<section>' section` (verbatim, e.g. `'directives'`) before any consumer uses it.
- (red-first) P5.3.3 sc. 1–3 on a 100-document fixture: exactly the relevant documents appear in `## 4`, a `deprecated` one is excluded, and none relevant → zero documents plus the recorded note `no relevant Memory found for task`. The note travels in the result's diagnostics, not inside the §7 payload.
- (characterization) P5.4.2 sc. 1–2: a directive bound to `developer` (and one added later) appears under `## 3. Directives` of a `developer` context. The globals are present, and the ids are sorted ascending (`spec-012` §5).
- (characterization) `ExecutionContext.warnings` keeps `spec-012` §5.1's three kinds in their fixed order and never enters the payload bytes (dl-050, dl-051).
- (red-first) `spec-012` §4 DNA selection: modules are filtered by the element's `modules:`/`scope:`, or all modules when it has none; every `paths` category is included, `runs` among them once task-138 lands; sections come in `dna.yaml` declared order.
- (characterization) REQ-PERF-05: a 1,000-document fixture stays within `DEFAULT_CONTEXT_LIMITS`.

## Implementation Notes

- **Size:** L · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-012 §3–§8; dl-050 (warnings stay out of the payload, spec-012 §5.1).
- **Features:** P5.3.3, P5.4.2, P5.4.4.
- **Notes:** Proposal key: B02. amend `spec-012` §4 with a `doc-versioning` bump. It still says "Always include … `conventions`" (removed by `spec-002` v1.1) and lists five `paths` categories. Verify both with `grep -n conventions docs/04_memory/design/specs/spec-012*.md` before editing. `src/core/context.ts`, `src/core/relevance.ts` (its "not pinned to a revision" doc sentence changes). Keep `resolveRoleDirectives` as the one resolver (dl-033 (b): binding lives in `src/dna/roles.ts` and `resolveRoleDirectives`, authority stays out).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-176-complete-spec-012-context-builder-dna-selection-relevance`, worktree
`../.wf2-wt/task-176`, cut from `main` at `c80167d6`; start commit `a4931ed2` (`[backlog → in-progress]`).
`bug: []`, so there is no bug to sync.

### design (architect)

**`depends_on` read (dl-015).** `task-137` is `done` (`grep -n "^status:" docs/04_memory/v0.3/task-137-*.md`).
Its notes hand this task a recipe: resolve the rev once with `resolveRevision`, pass the sha to every
`…AtRev` reader, feed the Memory readers the `memoryYaml` loaded at the same sha. Parse failures still
throw `ValidationError`. `task-138` (the `runs` paths category) is `done` too (`src/dna/schema.ts`
`Paths.runs`), so "`runs` among them once task-138 lands" applies now.

**Specs.** `spec-012`, `spec-016` and `spec-002` are `approved` (`awk '/^status:/{print $2;exit}'` on
each). `spec-016` §3.3 step 7 calls this builder at `state_ref = HEAD` and maps the P5.4.4 sc. 3
refusal to `INVALID_CONTEXT` = `VALIDATION`, with the message `invalid execution context: missing
'<section>' section` (§3.7 table). `spec-016` line 70 names the entry `assembleExecutionContext`, so
the entry keeps that name.

`spec-012` §4 needs the amendment the Implementation Notes announce. `grep -n conventions
docs/04_memory/design/specs/spec-012*.md` → `94:- Always include: \`project\`, \`team\` (roles/members),
\`conventions\`.`, a section `spec-002` v1.1 removed (its rules are now directives, which §5 loads).
The paths bullet lists five categories; `Paths` has six since `task-138`. The spec carries no
`version` field, and its two earlier Revision notes edited in place without a bump, so this edit does
the same (see Pending amendments).

**The entry.** `assembleExecutionContext(root, request: ContextRequest): CoreResult<AssembledExecutionContext>`
replaces the old `(inputs)` form, which read the working tree and returned the element as `memory`.
There is no other caller in `src/` (`grep -rn "assembleExecutionContext(" src` → the definition only).
Pipeline, in `spec-012` §3 order, every read at one sha:

1. `resolveRevision(root, stateRef)` → `sha`. A `RevisionError` becomes `coreErr(error.toCoreError())`.
2. `loadDnaYamlAtRev`, `loadMemoryYamlAtRev`, `loadRolesYamlAtRev`, `loadDirectivesAtRev` at `sha`.
   Directive bodies are read with `readPathAtRev` (`DirectiveFile` carries no body, and adding one
   would change every suite that deep-compares it).
3. resolve-element: `loadMemoryDocumentsAtRev` once; the element is found in that snapshot. Absent →
   `NOT_FOUND` `element '<type>:<id>' not found at <sha>`. Archived (`isArchivedStatus`) → `VALIDATION`
   `element '<type>:<id>' is <status>: an archived element never enters an execution context`
   (REQ-STATE-06; the old function returned an empty `memory` instead). `draft` still assembles.
4. dna-loader (§4): `project` and `team` always; `modules` filtered by the element's `modules:` /
   `scope:` names (string or list), or all of them when it declares neither; `paths` whole, so every
   category including `runs`. Section order is the key order of the raw `dna.yaml` text, because the
   Zod-parsed object puts schema keys first.
5. directive-loader (§5): `resolveRoleDirectives`, unchanged (dl-033 (b)).
6. relevance-filter (§6): `filterRelevantMemoryDocuments`'s ranking is split into a pure
   `selectRelevantMemoryDocuments(documents, element, limits)` over a snapshot. The working-tree wrapper
   keeps its signature and suites; the builder feeds the snapshot read at `sha`.
7. `validateExecutionContext` (P5.4.4 sc. 3), then `serializeExecutionContext` (§7).

A pillar file `stateRef` does not hold leaves its section unset, so the validator refuses it with the
verbatim message: no `roles.yaml` → `missing 'directives'`, no `dna.yaml` → `missing 'dna'`, no
`memory.yaml` → `missing 'element'` (the element cannot be resolved). Sections are checked in §7
order: `element`, `dna`, `directives`, `memory`.

**Payload (§7).** Header `<!-- role: … | element: <type>:<id> | state: <full sha> -->`: the resolved
sha, so `HEAD` and the sha it names give the same bytes. Frontmatter and DNA sections are fenced
` ```yaml ` blocks dumped by js-yaml with `sortKeys: true, lineWidth: -1, noRefs: true`. Bodies are
verbatim except for the canonicalization §7 makes mandatory: CRLF/CR → LF, trailing whitespace
stripped on every line, one trailing `\n`. `## 4. Relevant Memory (<n> documents)` keeps the literal
plural for every `n`. Diagnostics stay out of the bytes: `context.warnings` (§5.1) and the result's
`notes` (`no relevant Memory found for task`, P5.3.3 sc. 3).

**AC classification (T1, `testing` directive).**

| AC | Class | Why |
|---|---|---|
| 1 — P5.4.4 sc. 1, §7 headings | red-first | no payload exists (`grep -n "WingFoil Agent Context" src -r` → nothing) |
| 2 — P5.4.4 sc. 2, §8 byte identity at `stateRef` | red-first | nothing reads the context at a revision; nothing serializes |
| 3 — P5.4.4 sc. 3, refusal message | red-first | `grep -rn "invalid execution context" src` → nothing |
| 4 — P5.3.3 sc. 1–3 in `## 4`, note in diagnostics | red-first | the filter exists, but not at `stateRef` nor in a payload |
| 5 — P5.4.2 sc. 1–2 under `## 3` | characterization | `resolveRoleDirectives` already resolves and sorts; the tests pass once the entry exists |
| 6 — §5.1 warnings outside the payload | characterization | the resolver already emits the three kinds in order |
| 7 — §4 DNA selection | red-first | the context carries the whole `DnaYaml` today |
| 8 — REQ-PERF-05 within `DEFAULT_CONTEXT_LIMITS` | characterization | the bounding exists in `relevance.ts` |

The characterization rows are written in the same new suite. They cannot run before the new entry
compiles, so their first run is the green run.

BDD: no suite under `test/` runs `P5.4.4` or `P5.3.3`/`P5.4.2` by scenario name except
`test/core/relevance.test.ts` (P5.3.3 on the working-tree filter) and `test/dna/roles.test.ts` (P5.4.2
sc. 3, the binding refusal) (`grep -rln "P5.4.4\|P5.3.3\|P5.4.2" test`).
The scenarios are transcribed into `test/core/context-builder.test.ts`; the feature files need no change.

### red (developer)

`dc317563` adds `test/core/context-builder.test.ts`. `npx jest test/core/context-builder.test.ts` →
**1 suite failed, 35/35 tests failed**, every one with `TypeError: Cannot read properties of undefined
(reading 'assignments')`: the old `assembleExecutionContext(inputs)` received `(root, request)`. That is
the missing entry, not a fixture fault. The characterization rows (AC 5, 6, 8) fail the same way here,
because they go through the same entry; they are not reds of their own (design table).

### green (developer)

`c4513d0e`: `src/core/context.ts` (the builder, validator and serializer; the resolver unchanged),
`src/core/relevance.ts` (`selectRelevantMemoryDocuments` split out; `filterRelevantMemoryDocuments`
keeps its signature), `src/core/index.ts` (exports). Two deviations, both found by the first green run
(`3 failed, 32 passed`):

- The header comment sits on the title's next line, as §7's template shows; the first cut put a blank
  line between them.
- Directive bodies are verbatim and carry their own `# <id>` headings, so the heading test now checks
  the fixed literals (`# WingFoil …`, `## <n>. …`) only.

The old `(inputs)` suites were ported to the new entry in the same commit:
`test/core/context.test.ts` (fixtures now commit before building; an absent element is `NOT_FOUND`,
an archived one is refused, the subject is `context.element` and never one of its own `memory`
entries; the two fixture tasks no longer share the title word `task`, which §6 T4 would score) and
`test/core/builtin-directive-templates.test.ts` (the element is committed at `HEAD`).

### refactor (developer)

`4c34d248`. The first coverage run came back below `main` on branches and functions. Changes:
unreachable branches removed (the `dna.yaml` raw read now decides presence, so the parse of its key
order cannot meet `null`; `selectRelevantMemoryDocuments` takes `limits` without a default, both
callers pass one); tests added for no `dna.yaml` / no `memory.yaml` at `stateRef`, wrong-shaped
sections, a malformed `stateRef`, a root git cannot read (throws), an empty `scope:`, an empty body, a
relevant document with no `type`/`id`, the barrel re-exports, and working-tree vs snapshot ranking
agreeing on the same documents.

| Gate | Result |
|---|---|
| `npm test` (worktree, `4c34d248`) | 219 suites / 3933 tests passed |
| `npm run test:coverage` (same) | 98.90 / 95.67 / 95.59 / 99.59 (stmts / branches / funcs / lines) |
| the same on `main` `c80167d6`, temporary detached worktree | 218 suites / 3887 tests; 98.88 / 95.54 / 95.34 / 99.58 — no regression |
| new code | `context.ts` 100 / 98.92 / 100 / 100 (one branch: `withBodies`' `?? ''` for a directive git has just listed); `relevance.ts` 100 / 87.32 / 100 / 100 (`main`: 85.91, same lines) |
| `npm run lint` | exit 0 |
| `npm run docs:api` | exit 0, 0 warning lines (`grep -ci warning`) |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` | exit 0 / exit 0 |

No wall-clock assertion was added (`test/core/latency-budget-placement.test.ts` keeps clocks in one
helper): REQ-PERF-05 is pinned by size, the 1,000-document build carrying exactly `maxDocs` = 40
documents within `maxBytes`.

### review (reviewer)

| AC | Status | Evidence (`test/core/context-builder.test.ts`) |
|---|---|---|
| 1 — P5.4.4 sc. 1 | met | "exposes element, dna, directives and memory as distinct properties"; "carries the §7 headings in their fixed order"; "renders `## 4. Relevant Memory (0 documents)`…" |
| 2 — P5.4.4 sc. 2 / §8 | met | "two independent builds … byte-identical" (`toBe`); "a build at a different stateRef whose Memory differs is not"; "holds no timestamp, host or absolute path; LF only; one trailing newline; no trailing whitespace" (CRLF body fixture); "re-emits frontmatter YAML with sorted keys…" |
| 3 — P5.4.4 sc. 3 | met | `it.each` over the four sections, verbatim message; assembly with no `roles.yaml` → `missing 'directives'`, no payload; `serializeExecutionContext` throws rather than rendering |
| 4 — P5.3.3 sc. 1–3, 100 documents | met | "sc. 1" (5 of 100), "sc. 2" (deprecated excluded, 4), "sc. 3" (`notes` = `[no relevant Memory found for task]`, absent from the payload); a working-tree-only document is absent |
| 5 — P5.4.2 sc. 1–2 | met | "sc. 1" `doc-versioning, testing` under `## 3`; "sc. 2" `code-quality` appears at the commit that binds it, not before |
| 6 — §5.1 warnings | met | the three kinds in order on `context.warnings`; none of the texts, nor the shadowed body, in the payload |
| 7 — §4 DNA selection | met | declared order `project, paths, modules, team` (fixture declares `paths` first); all six `paths` categories incl. `runs`; `modules:` list, `scope:` string, none, empty |
| 8 — REQ-PERF-05 | met | 1,000-document fixture → exactly 40 documents, bytes ≤ 262144 |

Determinism: `grep -nE "Date\.now|new Date|Math\.random|process\.env" src/core/context.ts src/core/relevance.ts`
→ nothing. Every list in the payload is ordered by the resolver (ids ascending), §6's total order, or
`dna.yaml`'s declared order.

**Decisions for the approver to confirm.**

1. `stacks` is not in the DNA section: §4 names `project`, `team`, `modules`, `paths` only, and this
   task follows it literally. An agent therefore does not see the technology stack. Whether §4 should
   add `stacks` is a spec question (candidate below).
2. An archived subject element is **refused** (`VALIDATION`), and an absent one is `NOT_FOUND`; the old
   entry returned an empty `memory` for both. A context's `## 1. Task` cannot be built from nothing.
3. A pillar file `stateRef` does not hold leaves its section missing, refused with the P5.4.4 sc. 3
   message (`roles.yaml` → `'directives'`, `dna.yaml` → `'dna'`, `memory.yaml` → `'element'`).
4. The header records the **resolved full sha**, so `HEAD` and the sha it names produce the same bytes.
5. `## 4. Relevant Memory (1 documents)` keeps §7's literal plural.

### Pending amendments (approver)

- `spec-012-context-loader-relevance-filtering` (§4 bullets, §5's global enumeration, §6's
  archived-default sentence, and two dated Revision notes; no `version` field, so no bump, as the
  earlier Revision notes did). Proposed reason: `§4 named the conventions section spec-002 v1.1
  removed, listed five paths categories where the schema has six since task-138 added runs, and
  matched modules by name only, which never selected a tech-spec's path scope; it now matches by name
  or path prefix and falls back to all modules with a diagnostic note (approver ruling D3,
  2026-10-05). §5 enumerated four global directives where roles.yaml binds five since task-133 bound
  security (dl-059). §6's task-171 sentence said the loader resolves the element through primitives
  that exclude archived documents by default; the builder reads the whole snapshot at stateRef and
  keeps archived content out itself, and the sentence now names the lookups that have the default.
  The selection order and the §7 envelope are unchanged. Edited by task-176, which implements §4–§7.`
- `spec-016-agent-execution` (one citation, line 70: `src/core/context.ts:267` → `src/core/context.ts`).
  Proposed reason: `The citation pinned assembleExecutionContext to a line offset that task-176's
  rewrite of src/core/context.ts made stale; it now names the file only, so it cannot drift again. The
  entry's name is unchanged.`

### review fixes (independent review: approve with fixes)

Commit `c06119db`; the task stays `in-review`.

- **F1** (pending amendment, uncommitted): §4's `paths` bullet now has its verb ("… is included");
  §5's global enumeration gains `security` (`grep -n -A8 '^global' .wingfoil/roles.yaml` → five
  globals), recorded in the same Revision note. Reason above extended.
- **F3**: the REQ-PERF-05 block now asserts ids, not counts. K = 25 relevant among 1,000 → exactly
  those 25, in §6 order. K = 60 with 8,000-byte bodies → the first 32 ids, every one `-hot`, because a
  33rd would pass `maxBytes` (the byte bound can now fail). K = 60 with small bodies → the first 40.
- **F6**:
  - `src/core/loaders.ts` `loadRolesYaml`'s comment no longer says the context reads it; the context
    reads `loadRolesYamlAtRev`.
  - `spec-016` line 70's stale offset: a pending amendment (above).
  - A role, element type or element id holding a control character or `-->` is refused before any
    read (`VALIDATION`, `invalid role "<role>": it may hold no control character and no '-->'`), and
    `serializeExecutionContext` throws on one rather than writing it into the header comment.
  - `limits` must be positive integers: `NaN`, `0`, `1.5` and `-1` are refused (`VALIDATION`,
    `invalid context limits: …`).
  - A section left unset by an absent pillar file carries `details.cause` naming it, e.g.
    `no .wingfoil/roles.yaml at <sha>`; the message stays P5.4.4's, verbatim.
- **Held, per the coordinator**: module matching by name only (`scope: "src/core"` → no module)
  awaits an approver ruling; the task-171 integration lands by merging `main` after it.

| Gate (after `c06119db`) | Result |
|---|---|
| `npm run test:coverage` | 219 suites / 3941 tests passed; 98.91 / 95.70 / 95.60 / 99.59 (`main` `c80167d6`: 98.88 / 95.54 / 95.34 / 99.58) |
| `src/core/context.ts` | 100 / 99.15 / 100 / 100; the one branch left is `withBodies`' `?? ''`, for a directive git has just listed |
| `npm run lint` / `npm run docs:api` (0 warning lines) | exit 0 / exit 0 |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` | exit 0 / exit 0 |

### approver ruling D3 (2026-10-05) — module matching

Red `18e8574b` (`npx jest test/core/context-builder.test.ts -t "ruling D3"` → 5 failed), green
`9fcc398a`, plus `bfb66651`/the pathless-module test. Each `modules:`/`scope:` entry is read by its
leading token, which selects a module by `name`, or by `path` when equal to it or a prefix of it at a
segment boundary. When the element names entries and none selects a module, every module is included
and `no module matches the element's modules:/scope: (<entries>); all modules included` is recorded in
`notes` (before the relevance note, §3 stage order), never in the payload. Order stays `dna.yaml`'s.
Tests: path equality, path prefix at segment boundaries, a prose `scope:` led by a path, name + path
together, a pathless module, nothing matching → all + note. The §4 amendment above carries the rule.

### integration with task-171

`git merge main` (`a350cdd0`, carrying task-171/250/249/185/177) → merge commit `2c03c504`; `npm ci`
after it (task-250 changed the lockfile). Conflicts in `src/core/context.ts` and
`test/core/context.test.ts` were resolved to this task's rewrite. 171's facts were folded in where
they still hold:

1. **Tolerant reads.** The builder passes `onDiagnostic` to `loadMemoryDocumentsAtRev`. A document
   that does not parse is left out, and its `W_MEMORY_UNREADABLE` line (`formatDiagnostic`) rides the
   `CoreResult` **`warnings`** channel (`coreOk`'s third argument), never the payload. I chose
   `warnings` over `notes` because an unreadable file is a fact about the repository, not about the
   context. It is the channel `memory search` already uses for the same diagnostic (task-171), and the
   one each surface renders on stderr (task-169); `notes` stay the context's own diagnostics (§4 D3,
   P5.3.3 sc. 3).
2. **A subject that does not parse** → `NOT_FOUND` with `details.unreadable` listing those lines, so
   it does not read as a bare "not found". An element that is absent while every file is readable
   carries no `details`.
3. **Tests.** The old "propagates a ValidationError" test is now "no longer aborts assembly", with the
   warning asserted. New tests in `context-builder.test.ts` cover a malformed sibling (reported, not
   in the payload), a malformed would-be-relevant document (reported, not silently dropped; the
   readable relevant set is unchanged), a malformed subject (`NOT_FOUND` + details) and a clean build
   (no `warnings` key).
4. **Archived subject.** `loadMemoryDocumentsAtRev` takes `MemoryScanOptions` only, with no archived
   default (`grep -n "MemoryTypeScanOptions" src/memory/query.ts` → the three type-scoped lookups). It
   returns archived documents, so the builder keeps refusing an archived subject; the REQ-STATE-06
   tests pass unchanged.
5. **spec-012 §6.** 171's committed sentence said the loader resolves the element through primitives
   that exclude archived documents by default, which is not how the builder reads. The pending
   amendment corrects it and adds its own Revision note (reason above). The §4 example path was
   reworded after `test/docs/name-resolvability.test.ts` flagged a non-existent path in it.

**`main` `a350cdd0` does not build.** `npx tsc --noEmit` fails at `src/agent/discovery.ts:128`:
task-177 calls `atHeadOr(read, fallback)`, task-171 changed it to `atHeadOr(root, read, fallback)`,
and jest's `globalSetup` build then fails, so no suite runs on that commit (measured in a temporary
detached worktree). Fixed here in `5afefa32`, a separate one-line commit, so it can be cherry-picked
to `main` on its own.

| Gate (branch `bfb66651`, pending amendments in the tree) | Result |
|---|---|
| `npm run test:coverage` | 228 suites / 4178 tests passed; 98.95 / 96.05 / 95.91 / 99.59; `src/core/context.ts` 100 / 99.21 / 100 / 100 (line 451, `withBodies`' `?? ''`) |
| baseline: `main` `a350cdd0` + the one-line discovery fix, temporary detached worktree | 227 suites / 4113 tests; 98.92 / 95.89 / 95.65 / 99.58 — no regression |
| `npm run lint` / `npm run docs:api` (0 warning lines) | exit 0 / exit 0 |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` | exit 0 / exit 0 |
| `node scripts/check-governance.cjs --base c80167d6` | exit 0 |
