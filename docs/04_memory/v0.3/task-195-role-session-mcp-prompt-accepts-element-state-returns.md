---
id: "task-195-role-session-mcp-prompt-accepts-element-state-returns"
type: task
title: "The `{role}-session` MCP Prompt accepts `element` and `state` and returns the `spec-012` §7 payload at that commit"
status: in-review
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "mcp", "context"]
ref: "spec-016"
bug: ["bug-231", "bug-263"]
depends_on: ["task-174-settle-mcp-prompts-contract-server-preflight-answer-tools", "task-176-complete-spec-012-context-builder-dna-selection-relevance"]
tmpl_version: 260703
---

## Description

`adr-012` point 3 and approver ruling R18 make the `{role}-session` Prompt the MCP primitive that carries the assembled context. It gains two optional arguments, `element="<type>:<id>"` and `state="<sha>"`. With both, it returns task-176's §7 payload for `(role, element, state)`, resolved at `state`. Without them it behaves exactly as today. This is the "via MCP" half of `REQ-INT-07`, the context that `agent execute`'s pre-flight (task-218) and the fake adapter (task-200) fetch.

## Acceptance Criteria

- (red-first) `prompts/list` declares `element` and `state` as optional arguments of every `{role}-session` Prompt.
- (red-first) `prompts/get developer-session` with `element="task:<id>"` and `state="<sha>"` returns one message whose text is byte-equal to task-176's payload for the same request. A later commit, or an uncommitted edit to that element, does not change the answer.
- (characterization) Without arguments the Prompt returns the current role header plus directive blocks unchanged, so `test/mcp/role-prompts.test.ts` and `mcp-prompts.feature.test.ts` stay green.
- (red-first) The refusals are `InvalidParams` (-32602, the code of `spec-004` §3.4 per dl-048): only one of the two arguments given; a malformed element-ref (`spec-008` §7); an unknown element at `state`; a `state` that is not a commit. Each message is fixed in the `spec-004` amendment.
- (red-first) The server still exposes no Tool, and the handler writes nothing (REQ-SEC-05). The existing byte-for-byte round-trip test extends to a call with arguments.
- (characterization) `spec-004` §3.1–§3.2 amended with a `doc-versioning` bump: the two optional arguments, and the embedding contract (the §7 payload resolved at `state`, not per request against the working tree).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §2.4 (R18); spec-004 §3.1–§3.2 amendment; adr-012 point 3.
- **Features:** P5.4.3, P5.4.4, P5.2.2.
- **Notes:** Proposal key: B03. `src/mcp/prompt.ts`, `docs/04_memory/design/specs/spec-004-mcp-surface-contract.md`. **Belongs with C's MCP work for file ownership**: if C's dl-039/048/049 task is scheduled first, this task rebases on it. The `agent` Resources stay v0.4 (R5, spec-016 §7).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 2 B1 (2026-10-05, `task-171` and `task-176`).** `assembleExecutionContext`
  (`src/core/context.ts`) reads Memory tolerantly: an unreadable document is left out and reported as
  `W_MEMORY_UNREADABLE` in the result's `warnings` (`CoreResult`, third argument of `coreOk`), and a malformed subject
  element comes back as `NOT_FOUND` with `details.unreadable`. Neither is in the payload. Forward both to the
  surface this task builds (stderr / `--format json` warnings, or the MCP response), so they are never dropped.
- **Handover from wave 2 B4a (2026-10-06, `task-255`).** The context payload's bytes are pinned as format 1
  (`spec-012` §7, `dl-150` (B)): consume them only as `task-255` left them, through `assembleExecutionContext`, and
  never re-serialize the context yourself. `CONTEXT_PAYLOAD_FORMAT` and `WrittenTimestamp` are re-exported from
  `src/core`: a YAML date in the carried frontmatter is a `WrittenTimestamp` holding the text as written, not a `Date`,
  and its `toJSON()` returns that text, so a `--format json` rendering keeps the document's own spelling.
- **Handover from the W2 B4a triage (2026-10-06).** `bug-263` is absorbed here: a subject element in a newer
  `format:` must answer `E_INVALID_FORMAT`, not the unknown-element refusal. `bug-231`'s silent drop in the MCP
  `wingfoil://memory/{type}` listing now also hides a newer-format element (`task-257` routes it to the same
  `W_MEMORY_UNREADABLE` path), so fixing `bug-231` covers it. `bug-265` (v0.4): the payload's body markers are not
  unique (a Memory document whose frontmatter says `type: directive`, or two documents with one `type:id`), so do
  not index the payload's bodies by marker key alone.

## Execution Notes

Branch `task/task-195-role-session-mcp-prompt-accepts-element-state-returns`, worktree
`../.wf2-wt/task-195`, cut from `main` at `ed4607a4` (W3 batch B1). Start `84a43ad7`; bug syncs `[planned →
in-progress]`: `bug-231` `4af79774`, `bug-263` `90f08649`.

### design (architect)

**`depends_on` (dl-015).** Both are `done` (`grep -m1 "^status" docs/04_memory/v0.3/task-17{4,6}-*.md`).
`task-174` fixed the role set at server start (`registerRolePrompts({roles})`), made the `prompts/get`
handler a low-level one on `server.server` (so this task adds arguments there, not through
`registerPrompt`), wrote spec-004 §3.4 (the two `-32602` refusals) and gave failed reads
`error.data.details` (`withRefusalDetails`, `readRefusalError` in `src/mcp/read-only.ts`). `task-176`
built `assembleExecutionContext(root, {role, element, stateRef, limits})` → `{context, payload, notes}`
plus `CoreResult.warnings`; the handovers in this task's Implementation Notes (task-171, task-255, the
W2 B4a triage) are the rest of the contract.

**Specs.** `spec-004`, `spec-008`, `spec-012`, `spec-016` are `approved`, `adr-012` is `accepted`
(`grep -m1 "^status"` on each). `tech-spec` is `amendable: true` (`grep -n amendable .wingfoil/memory.yaml`),
so the spec-004 edit is a **pending amendment, left uncommitted**. spec-004 has no `version:` field:
like its earlier edits it gets a dated Revision note (`dl-047`), which is the "doc-versioning bump" of
the last AC. spec-012 lists no builder refusal codes (`grep -n "NOT_FOUND" docs/04_memory/design/specs/spec-012-*.md`
→ nothing), so `bug-263`'s fix needs no spec-012 edit.

**Design.**
- *Arguments (AC 1).* `prompts/list` declares, on every `{role}-session` Prompt, `arguments: [{name:
  "element", required: false}, {name: "state", required: false}]`, each with a description.
- *With both arguments (AC 2).* The handler checks the arguments, resolves `state` once with
  `resolveRevision` (so a branch name or `HEAD` is pinned to one sha before anything is read), and calls
  `assembleExecutionContext(root, {role, element: {type, id}, stateRef: <sha>})`. The single message's
  text is `result.value.payload` as returned — never re-serialized, never indexed by body marker
  (`bug-265`). Everything the builder reads is at the sha, so a later commit or an uncommitted edit
  cannot change the answer (that is the builder's own guarantee; the test pins it on this surface).
- *Diagnostics.* A successful result carries a top-level `warnings: string[]` beside `messages`, only
  when non-empty, in a fixed order: `context.warnings` (`spec-012` §5.1 order), then `notes` (§3 stage
  order), then `CoreResult.warnings` (the `W_MEMORY_UNREADABLE` lines, path order). The payload is
  untouched. The SDK's `GetPromptResultSchema` extends the loose `ResultSchema`
  (`grep -n "ResultSchema = z.looseObject" node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js`),
  so the field reaches the client; the name follows `structuredContent.warnings` (§4.3 item 5).
- *Without arguments (AC 3).* Unchanged code path (`buildRolePrompt`).
- *Refusals (AC 4), all `-32602`, messages fixed in spec-004 §3.4:*
  - one argument without the other → `prompt arguments 'element' and 'state' go together: '<missing>' is missing`;
  - any other argument name → `unknown prompt argument '<name>': '{role}-session' takes only 'element' and 'state'`
    (not in the AC: decision for the approver — a silently ignored argument would let a misspelt
    `State` fall back to the argument-less Prompt);
  - an element that is not `<type>:<id>` → `malformed element-ref <json>: expected <type>:<id>`. The
    rules (exactly one `:`, both parts non-empty, no whitespace, control character or `-->`) are this
    task's: `spec-008` §7 states only the form `<type>:<id>` (corrected at review, F3 — the first
    version of this note attributed them to §7, which it did not say; §7 now does, pending amendment);
  - a `state` that is not a commit → `RevisionError`'s own message (`malformed revision "<rev>": …` or
    `revision "<rev>" does not name a commit`);
  - an element the commit does not hold → the builder's `element '<type>:<id>' not found at <sha>`, its
    `details.unreadable` lines forwarded as `error.data.details` (`{detail}` per line), so a subject that
    does not parse is not reported as merely absent (task-171 handover).
  Every other builder refusal is about the repository, not the request — an archived subject, a newer
  `format:` (`bug-263`), a missing pillar file (`invalid execution context: missing '<s>' section`), a
  self-closing body — and is a failed read, as a failed Resource read is: the SDK's `-32603` with the
  core message and `error.data.details` (`errorDetails`, plus `details.cause` as a detail). Decision for
  the approver: the archived subject is on this side, since the element exists.
- *`bug-263`.* In `assembleExecutionContext`, when the snapshot has no subject, the lookup
  `findMemoryDocumentByTypeAndIdAtRev(…, {includeArchived: true})` decides whether the subject exists in
  a newer format: it throws the `dl-149` `ValidationError` for exactly that case (`refuseNewerElement`).
  Then the refusal is `VALIDATION`, `element '<type>:<id>' at <sha> is written in a newer format:
  <E_INVALID_FORMAT text>`, `details.issues` the loader's issues. Only the not-found path pays the
  second scan.
- *`bug-231`.* `memory.list` and `memory.show` pass `onDiagnostic` and return the diagnostics as the same
  top-level `warnings: string[]` (`formatDiagnostic` lines, as the CLI prints them), only when non-empty.
  A `memory.show` that finds nothing after skipping unreadable files answers `resource not found:
  memory/<type>/<id>` with those lines as `error.data.details`. Same class, in a file the change
  touches: the registrar's core-derived Resources (`src/mcp/registrar.ts`) dropped `CoreResult.warnings`
  ("no read-only operation returns warnings today" — false since task-171: `memorySearch` returns them);
  they get the same field. One helper in `read-only.ts` builds it for all three.
- *Read-only (AC 5).* No new write path: the handler calls readers only. The round-trip test
  (`read-only-agent-channel.test.ts`, production server) extends to a call with arguments and the fixture
  gains `memory.yaml` and a task; `tools/list` stays `[]`.
- *Specs (AC 6, pending amendment).* spec-004 §3.1 (the two optional arguments on every Prompt), §3.2
  (the embedding contract with arguments: the `spec-012` §7 payload at `state`, the `warnings` field),
  §3.4 (the new refusals and the `-32603` side), §2.2 + §4.3 item 5 (Resource reads carry `warnings`,
  replacing "A Resource read is not given a field"), one Revision note.
- *Docs.* `docs/user-guide.md` §9.1 and `docs/cli-reference.md` (`wingfoil mcp`) gain an "Unreleased
  (v0.3)" sentence on the arguments and the `warnings` field, as those files mark v0.3 changes.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `prompts/list` declares `element`, `state` optional | **red-first** | today `prompts/list` entries carry no `arguments` (`src/mcp/prompt.ts` `ListPromptsRequestSchema` handler) |
| 2 — with both: payload byte-equal to the builder's, pinned at `state` | **red-first** | today arguments are ignored and the role header is returned |
| 3 — without arguments: unchanged | **characterization** | `test/mcp/role-prompts.test.ts`, `mcp-prompts.feature.test.ts` already pin it; they must stay green |
| 4 — the four `InvalidParams` refusals | **red-first** | no argument is read today, so none is refused |
| 5 — no Tool, no write; round trip with arguments | **red-first** (call with arguments); **characterization** (no Tool) | the arguments are ignored today, so the extended assertion on a context payload fails; `tools/list` → `[]` already holds |
| 6 — spec-004 §3.1–§3.2 amended | **characterization** | spec text |
| `bug-263` — newer-format subject → `VALIDATION` `E_INVALID_FORMAT` | **red-first** | today `NOT_FOUND` (bug's reproduction) |
| `bug-231` — Resource reads carry `W_MEMORY_UNREADABLE` | **red-first** | today the diagnostics are dropped (`src/mcp/memory-resource.ts` passes no `onDiagnostic`) |

### red

`e7defac5`: `test/mcp/role-prompt-context.test.ts` (new, production server over the in-memory transport),
`test/mcp/resource-warnings.test.ts` (new), `test/core/context-builder.test.ts` (three `bug-263` cases),
`test/mcp/read-only-agent-channel.test.ts` (the production round trip gains `memory.yaml`, a task and a
`prompts/get` with `element`/`state`). `npx jest` on those four files → 4 suites failed, **31 failed**,
76 passed. Every failure is behavioural (the suites compile): no `arguments` on `prompts/list`; the role
header returned where the payload was expected; no refusal for any argument ("expected the prompt
request to be refused"); no `warnings` on the Resource reads; `NOT_FOUND` instead of `VALIDATION` for
the newer-format subject. The three other new `context-builder` cases (newer-format sibling stays a
warning; absent subject beside it stays `NOT_FOUND`) and the registrar "no warnings" cases pass on first
run: they are characterization guards around the red ones.

### green

`4df3c4c0`, as designed:
- `src/core/context.ts`: `newerFormatSubject` — on the not-found path only, the (`type`, `id`) lookup at
  the sha decides whether the subject is held in a newer format, and its `dl-149` `ValidationError`
  becomes `VALIDATION` `element '<type>:<id>' at <sha> is written in a newer format: E_INVALID_FORMAT …`,
  `details.issues` (`bug-263`).
- `src/mcp/read-only.ts`: `withWarnings(result, warnings)` (top-level `warnings`, absent when empty) and
  `warningDetails(lines)` (`{detail}` entries).
- `src/mcp/memory-resource.ts`: both Memory Resources pass `onDiagnostic`; success carries `warnings`,
  a `memory.show` miss carries the lines as `error.data.details` (`bug-231`). `src/mcp/registrar.ts`:
  core-derived Resources carry `CoreResult.warnings` the same way; its doc comment corrected.
- `src/mcp/prompt.ts`: `ROLE_PROMPT_ARGUMENTS` on `prompts/list`; on `prompts/get`, the refusals in
  spec-004 §3.4 order (unknown argument, by sorted name; pairing; `parseElementRef`), then
  `buildContextPrompt`: `resolveRevision` once (`RevisionError` → `-32602` with its message),
  `assembleExecutionContext` at the sha, `NOT_FOUND` → `-32602` with `details.unreadable` as
  `error.data.details`, any other refusal → `readRefusalError` (`errorDetails` + `details.cause`), success
  → one `user` message with `payload` verbatim and `warnings` = `context.warnings`, `notes`,
  `CoreResult.warnings`. The argument-less path is the untouched `buildRolePrompt`.
`npx jest test/mcp test/core/context-builder.test.ts` → 14 suites, **199 passed**.

Real stdio run of the built CLI (`npm run -s build`, an SDK `StdioClientTransport` on `node dist/cli.js
mcp` in this worktree): `prompts/list` arguments `[["element",false],["state",false]]`; `prompts/get
developer-session` with `element=task:task-195-…`, `state=<HEAD sha>` → the payload, header
`<!-- format: 1 | role: developer | element: task:task-195-… | state: 4df3c4c0… -->`, 339,880 bytes,
no `warnings`; `element=task:nope` → `-32602 MCP error -32602: element 'task:nope' not found at 4df3c4c0…`.

### refactor

`dd77e7e6`: `docs/user-guide.md` §9.1 and `docs/cli-reference.md` (`wingfoil mcp`) state the two
arguments and the `warnings` field, inside those files' "Unreleased (v0.3)" sentences (neither file
has a `version:` field). `4b8e6d12`: one more test — a root that is not a repository fails the context
Prompt as a read (`-32603`), not as a refused `state` — covering `buildContextPrompt`'s rethrow of a
non-`RevisionError`. No code refactor after green.

Gates (worktree, with the uncommitted spec-004 amendment on disk; load average 60–110 from the batch):

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` / `npx tsc -p tsconfig.build.json --noEmit` | both clean |
| `node scripts/check-governance.cjs --base ed4607a4` | exit 0, 0 findings (3 `wf()` commits at the time; 6 after submit and the bug syncs, re-run in Review fixes) |
| `npm run test:coverage` | 275 suites, **5107 passed**; 99.2 / 96.7 / 96.57 / 99.7 (stmts/branches/funcs/lines). Last recorded `main` (plan, `f15096a2`): 99.23 / 96.72 / 96.53 / 99.7 — not re-measured on `ed4607a4`. Touched files: `prompt.ts` 98.87 / 97.82 / 100 / 98.76 (before `4b8e6d12`; line 156 is the rethrow that commit covers), `memory-resource.ts`, `read-only.ts`, `registrar.ts` 100 / 100 / 100 / 100, `context.ts` 99.62 / 98.26 / 100 / 100 (the new `newerFormatSubject`'s rethrow of a non-format error — a failed git read — is the one new uncovered branch) |
| `npm test` | 275 suites, 5108 tests: 5104 passed, 4 failed, all in `test/mcp/resource-latency.test.ts` and `test/core/query-latency.test.ts` (wall-clock p95 budgets) at load average ~110 (`uptime`). Re-run alone: `resource-latency` passed (load 98), `query-latency` 4/4 passed (load 71). No budget touched; the idle latency run is the coordinator's |

BDD: no scenario of `P5.2.2-mcp-prompts.feature` or `P5.4.3`/`P5.4.4` speaks of Prompt arguments
(`grep -n "element\|state" docs/02_requirements/02_bdd/features/p5-interaction/P5.2.2-mcp-prompts.feature`
→ nothing); `test/mcp/mcp-prompts.feature.test.ts` stays green in the runs above (AC 3).

### review (self, reviewer)

- **AC 1, met.** `role-prompt-context.test.ts` › "declares exactly element then state, both not required…".
- **AC 2, met.** › "returns one user message whose text is byte-equal to the builder payload" (and
  reviewer role, `HEAD` pinned to its sha) and › "a later commit and an uncommitted edit … do not change
  the answer".
- **AC 3, met.** `role-prompts.test.ts` and `mcp-prompts.feature.test.ts` unchanged and green; the
  argument-less branch calls the same `buildRolePrompt`.
- **AC 4, met.** › the `-32602` cases: pairing (both directions), malformed element-ref (7 forms),
  unknown element (absent, and added after the state), `state` not a commit (unknown sha, malformed, a
  tree sha). Messages are written into spec-004 §3.4 (pending amendment).
- **AC 5, met.** `read-only-agent-channel.test.ts`: the production round trip now includes a call with
  `element`/`state`, `tools/list` → `[]`, every file and the repository state unchanged
  (`assertFilesUnchanged`). `src/mcp/prompt.ts` imports no writer (`grep -n "write\|commit" src/mcp/prompt.ts`
  → only comments and two description strings).
- **AC 6, met** as a pending amendment (spec-004 §2.2, §3.1, §3.2, §3.4, §4.3 item 5, one Revision note).
- **Handovers.** `W_MEMORY_UNREADABLE` warnings and `details.unreadable` both reach the client
  (› "forwards the builder diagnostics…", › "a subject whose frontmatter does not parse…"); the payload is
  `result.value.payload` untouched and nothing indexes it by marker (`bug-265`); `bug-263` ›
  "a subject written in a newer format…" in both `context-builder.test.ts` and on the Prompt.
- **`bug-231`** › `resource-warnings.test.ts` (collection, single document, not-found details,
  core-derived Resources).
- Same-class sweep in touched files: every read in `src/mcp` that scans Memory now passes `onDiagnostic`
  (`grep -n "listMemoryDocumentsByType\|findMemoryDocumentByTypeAndId\|assembleExecutionContext" src/mcp/*.ts`
  → three call sites, all collecting); `dna-resource.ts` and `workflow-resource.ts` scan no Memory.
- **Return shape for task-200/task-218** (documented in spec-004 §3.2 and `buildContextPrompt`'s doc):
  `{messages: [{role: "user", content: {type: "text", text: <§7 payload>}}], warnings?: string[]}`.

**Pending amendments (approver).**
- `spec-004-mcp-surface-contract` — proposed `--reason`: "task-195: §3.1 declares the optional element
  and state arguments of every {role}-session Prompt, §3.2 the embedding contract with them (the
  spec-012 §7 payload resolved at state) and where the context diagnostics go, §3.4 the six new -32602
  refusals and the failed-read side, an empty argument counting as absent; §2.2 and §4.3 item 5 give
  Resource reads and Prompts a top-level warnings array — every unreadable file for a collection, the
  files passed before the match for a single document (bug-231, bug-263, approver ruling R18)."
- `spec-008-cli-grammar` — proposed `--reason`: "task-195: §7 states the element-ref grammar (exactly
  one ':', non-empty type and id, no whitespace, control character or '-->') and its refusal text, lists
  the {role}-session Prompt's element argument beside agent execute --element, and names the one core
  parser both use (parseElementRef), so task-218 inherits the same rules."

**Decisions for the approver.**
1. `state` accepts any name of one commit (`HEAD`, a branch), as `spec-012` §2's `stateRef` does; it is
   resolved once and the payload header records the sha. The alternative — a full sha only — would make
   `state="HEAD"` a refusal.
2. An argument other than `element`/`state` is refused (`-32602`) rather than ignored.
3. An archived subject, a newer-format subject and a missing pillar file are failed reads (`-32603`
   with details), not `InvalidParams`: the element exists, the request is well-formed.
4. Diagnostics ride as a top-level `warnings` array (beside `messages`/`contents`), not under `_meta`,
   following the existing top-level `metadata` of `memory.show` and the `warnings` name of §4.3 item 5.

### Review fixes (approve with fixes, 2026-10-06)

Status stays `in-review`; no re-submit. Code `3805d97c`, docs `aa15f03a`; the two spec edits stay
uncommitted pending amendments (reasons above).
- **F1** — an empty `element` or `state` is now an absent argument (`src/mcp/prompt.ts`): both empty is
  the argument-less Prompt, one empty beside one set is the pairing refusal. Before, a client that
  submits every declared field got `malformed element-ref ""`. The test that pinned `""` as malformed
  now pins `"task:a-->b"`. New cases in `role-prompt-context.test.ts`: element empty with state set,
  element set with state empty (both `-32602` pairing), both empty (equal to the argument-less result).
  This is a behaviour change made at review: the fix and its tests are in one commit, so there is no
  separate red run. spec-004 §3.1/§3.4 state the rule.
- **F2** — spec-004 §2.2 now says it exactly: a collection read reports every unreadable file; a
  single-document read is a lookup that stops at its match, so it reports only the files it passed
  before the match (`findFirst`, `src/memory/query.ts`), and on a miss it has passed them all.
- **F3** — the element-ref grammar was this task's, not `spec-008` §7's (§7 gave only `<type>:<id>`); the
  design note's attribution is corrected. The parser moved to `src/core/element-ref.ts`
  (`parseElementRef` → `CoreResult<{type, id}>`, `malformedElementRefMessage`, exported from
  `src/core`), so `agent execute --element` (task-218) reuses it; `prompt.ts` maps its `VALIDATION` to
  `-32602`. Unit tests: `test/core/element-ref.test.ts` (3 accepted, 12 refused forms). spec-008 §7
  gains the grammar, the Prompt row and a dated Revision note — a second pending amendment. No command,
  flag or exit code changed, so no other spec is touched.
- **F4** — `docs/cli-reference.md` and `docs/user-guide.md` say `state="<commit>"`, any name of one
  commit, a sha recommended.
- Gates after the fixes (spec edits on disk): `npm run lint` exit 0; both `tsc` clean; `npm run docs:api`
  exit 0; `npx jest test/mcp test/core/context-builder.test.ts test/core/element-ref.test.ts test/docs`
  → 29 suites, 289 passed (load average 35); `node scripts/check-governance.cjs --base ed4607a4` → exit
  0, 6 `wf()` commits, 0 findings.
