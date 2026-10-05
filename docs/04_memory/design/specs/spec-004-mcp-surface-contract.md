---
id: spec-004-mcp-surface-contract
type: tech-spec
title: "MCP server surface contract (Resources, Prompts, Tools)"
status: approved
scope: "src/mcp"
supersedes: ""
tmpl_version: 260703
---

## Context

WingFoil's Interaction Layer (P5) is dual: a CLI for humans and an **MCP server** for agents (P5.2).
Nothing under `src/mcp` exists yet — this spec is the forward-looking contract that the future
implementation must satisfy, so agent-facing behaviour is defined once rather than re-derived ad hoc
per feature (P5.2.1/P5.2.2/P5.2.3) when `src/mcp` is finally built.

Without a single shared surface definition, two risks emerge: (1) the read channel (Resources) could
drift into accepting writes, silently violating the least-privilege boundary that REQ-INT-01 and
REQ-SEC-05 require between reading project state and mutating it; (2) the MCP Tools surface could
diverge from the CLI's state-mutating command set, breaking the CLI/MCP parity mandated by REQ-SYS-05
(every CLI state-mutating operation reachable via MCP and vice versa). This spec fixes the URI scheme,
the refusal contract for Resources, the Prompt embedding contract, and the Tool-to-CLI-verb mapping so
that whichever agent implements `src/mcp` produces a server compatible with this contract, not a
divergent reinterpretation.

## Specification

### 1. Transport & channels

The MCP server exposes exactly three channel types, matching the MCP protocol's own primitives —
**Resources**, **Prompts**, **Tools** — plus no additional custom channel. Read access and mutation
access are strictly partitioned by channel: Resources and Prompts are read-only; only Tools mutate
state (REQ-SEC-05).

```
MCP server surface
├── Resources   (read-only)   — wingfoil://dna, wingfoil://memory/*, wingfoil://workflows
├── Prompts     (read-only)   — one per role, e.g. "developer-session", "reviewer-session"
└── Tools       (mutating)    — memory.* and workflow.* actions, 1:1 with CLI state-mutating verbs
```

### 2. Resources (REQ-INT-01, REQ-SEC-05)

#### 2.1 URI scheme

```
wingfoil://dna
wingfoil://dna/{section}                      # e.g. wingfoil://dna/team, wingfoil://dna/paths
wingfoil://memory/{type}                      # list of elements of that type
wingfoil://memory/{type}/{id}                 # a single Memory document (content + frontmatter)
wingfoil://workflows
wingfoil://workflows/{name}                   # a single workflow definition (main or sub)
```

- `{type}` is any type key declared in `memory.yaml` `types:` (`release-line, release, task, adr,
  decision-log, tech-spec, bug, plan, service`).
- `{id}` is the element's `id` frontmatter value (e.g. `task-042-foo`), not its filesystem path —
  the server resolves `id → path` via each type's `path` pattern in `memory.yaml`.
- Listing a collection (`wingfoil://memory/{type}` with no `{id}`) returns each element's frontmatter
  only (id, title, status, tags) — not full body content — to keep listing calls cheap; fetching
  `wingfoil://memory/{type}/{id}` returns full content + metadata.

#### 2.2 Read contract

A `resources/read` request against any resolvable URI returns:

```json
{
  "uri": "wingfoil://memory/task/task-042-foo",
  "mimeType": "text/markdown",
  "text": "<full file content, frontmatter + body>",
  "metadata": {
    "id": "task-042-foo",
    "type": "task",
    "status": "in-progress",
    "title": "..."
  }
}
```

An unresolvable URI (unknown type, unknown id, malformed scheme) returns a standard MCP "resource not
found" error — this is a read-path error, distinct from the write-refusal below.

#### 2.3 Write refusal (fit criterion, verbatim)

The Resources channel implements **no** `resources/write` capability. Per REQ-INT-01 / REQ-SEC-05, any
client attempt to write through the Resources channel — whatever transport-level shape that attempt
takes (an unsupported `resources/write` call, or a `resources/read` request carrying a write
intent/payload) — MUST be refused with the exact message:

```
resources are read-only
```

The refusal persists nothing: the underlying Memory/DNA/Workflow files are byte-for-byte unchanged
after a refused attempt (asserted by the channel-enumeration test in REQ-SEC-05's fit criterion — the
only agent write path that successfully mutates state is a Tool call).

### 3. Prompts (REQ-INT-02)

#### 3.1 Naming & enumeration

One Prompt is registered per role declared in `dna.yaml` `team.roles` / the DNA role set (`developer,
reviewer, qa, architect, product-owner, tech-lead, facilitator, approver`), named `{role}-session`,
e.g. `developer-session`, `reviewer-session`. `prompts/list` returns this fixed set derived from DNA at
server start — it is not hand-maintained.

#### 3.2 Embedding contract

Invoking `prompts/get` for `{role}-session` returns a prompt whose message content embeds **100% of
that role's currently assigned directives** (per `roles.yaml`, resolved at session-start time — not
cached from server boot), each as a distinct, clearly delimited block:

```
prompts/get("developer-session") →
  messages: [
    {
      role: "system",
      content:
        "# Role: developer\n\n"
      + "## Directive: code-quality\n<full directive body>\n\n"
      + "## Directive: testing\n<full directive body>\n\n"
      + "## Directive: determinism\n<full directive body>\n\n"
      + "## Directive: doc-versioning\n<full directive body>\n\n"   # global, all roles
      + "## Directive: documentation\n<full directive body>\n\n"    # global, all roles
      + "## Directive: security-secrets\n<full directive body>\n\n" # global, all roles
    }
  ]
```

Directive resolution order for a role R: `roles.yaml[R].directives` ∪ the `global (all roles)` binding
defined in `roles.yaml` (this project's own dogfooded config, generalized per-project). A directive assigned to R
after server start but before the next `prompts/get("{R}-session")` call MUST appear in that next
call's output — Prompts are resolved per-request, not baked in at server boot (fit criterion: "a newly
assigned directive appears on the next session start").

#### 3.3 No mutation

Prompts are, like Resources, read-only: invoking a Prompt returns instructional text; it has no side
effect on Memory/DNA/Workflow state.

### 4. Tools (REQ-INT-03, REQ-SYS-05)

#### 4.1 Naming convention

Tool names mirror the CLI verb they wrap, using `.` in place of the CLI's space-separated subcommand
form, so the mapping is mechanical and auditable:

```
CLI command                    → MCP Tool name
wingfoil memory add             → memory.add
wingfoil memory submit          → memory.submit
wingfoil memory approve         → memory.approve
wingfoil memory reject          → memory.reject
wingfoil memory deprecate       → memory.deprecate
wingfoil workflow start         → workflow.start
wingfoil workflow end           → workflow.end
wingfoil workflow next          → workflow.next        (advances/reads active step)
```

Read-only CLI query commands (`memory search`, `memory history`, `dna show`, `paths`, `workflow
status/list/show`) are **not** duplicated as Tools — they are already served by the Resources channel
(§2) or are non-mutating enough to be exposed as Resources in a future revision; this spec scopes Tools
to the **state-mutating** surface only, per REQ-INT-03's own scope ("Tools for agents to submit
deliverables and update workflow state").

#### 4.2 Parity requirement (REQ-SYS-05)

Every CLI command that mutates state MUST have a corresponding Tool, and vice versa — no Tool exists
without a CLI equivalent, no state-mutating CLI verb exists without a Tool equivalent. This is a
closed bijection, not a best-effort overlap:

```
{ CLI state-mutating verbs } ≡ { MCP Tools }
```

Concretely, for the Memory pillar this is exactly the five lifecycle verbs (`add, submit, approve,
reject, deprecate` — features P1.3/P1.6/P1.7/P1.8/P1.9) plus whatever workflow-action verbs `workflows.yaml` steps
invoke (`element.set_state`, `git.*` actions wrapped by `agent.execute`, etc., per P4.10) once those
ship in v1.0.

The two **bootstrap commands** are outside both sets: `wingfoil init`, which mutates state but must run
before a WingFoil project exists, and `wingfoil mcp`, which starts this server. Neither has a Tool or a
Resource, and REQ-SYS-05's Fit Criterion exempts both by name
(`dl-046-bootstrap-commands-in-spec-006-section-3` A(a); `spec-006-core-domain-api` §3).

#### 4.3 Input/output shape

Each Tool's input schema mirrors its CLI's required flags one-to-one (e.g. `memory.approve` requires
`type`, `id`, `reason` — matching REQ-SEC-04's mandatory `--reason`). Each Tool call:

1. Performs the **same validation** as the CLI path (state-machine legality per `memory.yaml`, role
   authority per REQ-SEC-03, mandatory-reason per REQ-SEC-04).
2. On success, produces **exactly one git commit** (two when `memory.approve` fires the `supersedes:`
   trigger: the approve, then a `finalize` of the superseded element, `spec-008` §2) in the `wf({type}): {verb} {id}` format, authored
   as the invoking agent's configured git identity (REQ-SEC-01/02) — identical commit shape to the CLI
   path, so `memory history` and audit tooling cannot distinguish CLI-originated from MCP-originated
   transitions except by author.
3. On an illegal transition, is **rejected identically to the CLI path** (REQ-INT-03 fit criterion):
   same error message, same exit-equivalent status, no partial write.
4. On any refusal, carries the same operator-facing **details** the CLI prints (`dl-055` option 1;
   `spec-005` §3 defines the entries, `{file?, detail?}` per issue, selected once in
   `src/core/error-details.ts`, which leaves out a file the reason already names). A tool refusal is an `isError: true` result rather than a JSON-RPC
   error, so it has no `error.data`: its text content stays the bare reason (item 3), and the details
   ride as `structuredContent: {"error": "<reason>", "details": [...]}` — the CLI's `--format json`
   error object. A failed Resource read *is* a JSON-RPC error, and carries them as
   `error.data.details`. A refusal with no details carries neither field.
5. On success, carries the operation's warnings (`CoreResult.warnings`, `spec-006` §2), which the CLI
   prints on stderr (`spec-008` §6). A Tool has no stderr, so they ride as
   `structuredContent: {"value": <payload>, "warnings": ["<text>", …]}`, the success counterpart of
   item 4's `{error, details}`. The text content stays the payload's JSON, so a client that reads
   only `content` sees what it always saw. A success with no warnings carries no `structuredContent`.
   This is the registrar's rule (`src/mcp/registrar.ts`). The shipped `wingfoil mcp` server registers
   no Tools until P5.2.3 (v0.4), so no client receives the field yet. When Tools ship, a flag such as
   `directive assign`'s `--force` must become a Tool input as well.

**The `[{from} → {to}]` bracket belongs to the verbs of the `spec-003` verb table that carry one**
(`dl-079` (A); the list and each verb's bracket rule are `spec-008-cli-grammar` §2's). Those are the
state-transition verbs `approve`, `reject` and `deprecate`, whose subject must say which edge was
taken, because the edge is a decision rather than a derivation (`approve` and `reject` sit on a gate;
`deprecate` is not an approval gate, `dl-027`). They are also
the workflow verbs `start`, `finalize` and `sync` (whose bracket may chain states), and `amend`
(`[s → s]`) and `park`. `add` and `submit` subjects stay **plain**
(`wf({type}): submit {id}`, exactly the item-2 format above): their target state is derivable from the
type's state machine in `memory.yaml`, so the bracket would add nothing a reader or `memory history`
cannot already resolve. `assign` (`element.set_release`) is plain too, because it never changes
`status` (`spec-008` §2). Ratified by `dl-054-submit-commit-subject-bracket` (option 2), which chose the
form already written here over the hand-made bracketed `submit` subjects that accumulated in this
repository's history; those stay readable — `src/memory/audit.ts` parses both shapes, and its consistency check
skips a plain `add`/`submit` subject — they simply stop being produced. The split applies to the CLI
and MCP paths identically, since item 2 makes their commit shape one and the same.

```json
// memory.approve tool call
{
  "name": "memory.approve",
  "arguments": {
    "type": "task",
    "id": "task-042-foo",
    "reason": "meets acceptance criteria, tests pass"
  }
}
// → success: { "committed": true, "commit": "<sha>", "old_state": "in-review", "new_state": "approved" }
// → illegal transition (the same call on a `task` in `draft`): MCP tool-error, message identical
//   to the CLI's — REQ-STATE-01's pinned string, `dl-032` option (c):
//   "illegal transition draft -> backlog for type 'task'"
//   `<to>` is `approve`'s canonical edge on the `task` machine (`pending -> backlog`), not the next
//   state in `sequence`, per `dl-053-illegal-transition-target-for-verbless-edges`; the engine's
//   explanation ("not a `gates` state — `approve` is only legal from a gate") rides as the detail.
```

## Consequences

- Any future task implementing `src/mcp` (v0.1 read-only skeleton per `06_features.md` P5.2.1, full
  endpoints in v0.4 per P5.2.2/P5.2.3) must conform to the URI scheme (§2.1), the exact refusal string
  `"resources are read-only"` (§2.3), the per-request Prompt embedding contract (§3.2), and the Tool
  naming/parity rule (§4.1–4.2) defined here — deviating requires revising this spec first.
- The v0.1 "read-only skeleton" milestone (`06_features.md` P5.2.1 notes) is scoped to implementing
  §2 only; §3 and §4 land with v0.2 (P5.2.2) and v0.4 (P5.2.3) respectively — this spec covers all
  three because the contract is a single coherent surface even though delivery is staged.
- If a new Memory element type or a new workflow-action verb is introduced later, its Resources URI
  and, if mutating, its Tool follow the same naming rules automatically — no separate spec revision is
  needed unless the naming *rule itself* changes.
- If REQ-SYS-05's parity requirement is ever relaxed (e.g. some CLI verb becomes CLI-only by design),
  this spec must be revised and the exception recorded explicitly in §4.2, since parity is currently
  stated as an unconditional bijection.

## Process Notes

Authored proactively during `initial-design` for rl-v1, ahead of any `src/mcp` implementation task,
grounded entirely in `docs/02_requirements/03_sard/04_integrations.md` (REQ-INT-01/02/03),
`docs/02_requirements/03_sard/05_security-compliance.md` (REQ-SEC-05), and
`docs/01_vision/06_features.md` (P5.2.1/P5.2.2/P5.2.3, plus the release-staging notes for v0.1/v0.2/v0.4).
No prior-art source material was identified or used; this is authored fresh from the ground-truth specs.

**Revision (2026-09-17) — §4.3 states the `[{from} → {to}]` split explicitly, per
`dl-054-submit-commit-subject-bracket`.** §4.3 item 2 pinned the subject only as
`wf({type}): {verb} {id}`, generically; it never said which verbs carry the state bracket, so
`task-045-memory-submit` had to re-derive that from `src/memory/audit.ts`'s parsing convention and
CLAUDE.md §5.1. `dl-054` (`ready`, approved `194ff91`) ratified option 2 — the bracket belongs to the
state-transition verbs (`approve`, `reject`, `deprecate`), `add` and `submit` stay plain — so the next
verb does not have to rediscover it. The decision changes nothing already written or built: item 2's
format is unchanged, `task-045`'s shipped subject builder already conforms, and no commit message was
rewritten. Edited in place without a supersede or a state change, per the `spec-001` precedent
`dl-041` cites.

**Revision (2026-09-21) — §4.3's illegal-transition example carries the ratified message, per
`dl-053-illegal-transition-target-for-verbless-edges` (and `dl-032`, `bug-032`).** The example ended
with `illegal transition: task cannot go from draft to approved`, a pre-`dl-032` wording that
`dl-032`'s implementation (`2cd936f`) never reached — the one MCP-side rendering of the refusal
contradicted REQ-STATE-01, BDD `P1.6` sc.2 and `P5.2.3` sc.2, while §4.3 item 3 promises the MCP path
is "rejected identically to the CLI path". It now shows the string the shipped engine emits for that
example's own call (`approve` on a `task` in `draft`):
`illegal transition draft -> backlog for type 'task'`, with `<to>` computed as `approve`'s canonical
edge by `contractTarget` (`src/memory/state-machine.ts`) under `dl-053` option 1 — verified by running
`resolveTypeTransition` against `.wingfoil/memory.yaml`, not transcribed. The spec's contract
is unchanged: only an illustrative comment moved, and no Tool is registered on the running server yet.
Edited in place without a supersede or a state change, per the `spec-001` precedent `dl-041` cites; the
tech-spec template carries no `version:` field, so this dated note is the record (`dl-047`).

**Revision (2026-09-29) — the `{type}` enumeration, per `task-124-the-service-memory-type`
(`dl-088`).** The parenthesised list of type keys named the seven types of its time; `plan`
(`dl-019`) had already made it stale, and `service` (`dl-088`, `memory.yaml` 1.6) adds a ninth. It
now lists all nine, as `spec-001`'s Context does. The rule it illustrates — `{type}` is any key
`memory.yaml` declares — is unchanged, and no URI or Tool changes. Edited in place without a
supersede or a state change, per the `spec-001` precedent `dl-041` cites (`dl-047`: no `version:`
field); pending the approver's sign-off at `task-124`'s review.

**Revision (2026-09-30) — §4.3's bracket sentence follows the `spec-003` verb table, per
`dl-079-wf-commit-verbs-outside-the-declared-grammar` (`ready`, option (A)), carried out by
`task-126-declare-closed-wf-operation-grammar-bracket-set-state`.** The sentence gave the bracket "to
the approver-gated verbs only". `dl-079` (A) ratified the bracketed `start`, `finalize` and `sync` of
practice, and `amend` (`dl-108`) and `park` (`dl-110`) follow them. `spec-003`'s Consequences carried
this amendment to the `dl-079` task. The sentence now names the table and lists the bracketed verbs.
`add` and `submit` stay plain: `dl-054` holds, and the approver ruled at `release-planning` that it
prevails over `dl-106` W1 (a) (R20). At `task-126`'s review (2026-10-01) the approver added
`assign` to the list as `element.set_release`'s verb. It is plain, because it never changes
`status`, and the sentence says so. Item 2's format and the Tools are unchanged. Edited in place without a
supersede or a state change, per the `spec-001` precedent `dl-041` cites (`dl-047`: no `version:`
field).

**Revision (2026-10-01) — §4.3 item 4: refusal details reach the MCP client, per `task-130`
(`dl-055` option 1).** The registrar kept only `CoreError.message`, so `dl-032`'s explanation of the
illegal-transition message reached no agent, and neither did the file that refusal concerns (its
message is the bare contract string; a validation reason already embeds its file). Item 4 says where they go on each channel: `error.data.details` for a failed read,
where JSON-RPC defines `data` for exactly this, and `structuredContent` for a tool refusal, which the SDK
returns as a result and never as a JSON-RPC error. The text of a refusal is unchanged, so item 3's
parity with the CLI holds. Edited in place without a supersede or a state change, per `dl-047` (no
`version:` field).

**Revision (2026-10-02) — §4.3 item 5: success warnings reach the MCP client, per
`task-169-make-directive-assign-refuse-whole-file-rewrite-unless` (`dl-062-roles-yaml-unwritable-fallback`,
`ready`, Q1 option 3; scheduling addendum §2, which asks how an MCP Tool result carries a warning when
there is no stderr).** A successful Tool result carries `structuredContent: {value, warnings}` when
the operation returned warnings. A Resource read is not given a field: no read-only operation returns
warnings. The rule is implemented and tested in the registrar. The shipped `wingfoil mcp` registers no
Tools before P5.2.3 (v0.4), so it is not reachable from a client yet. No other item changed. Edited in place without a supersede or a state change, per `dl-047`
(no `version:` field).

**Revision (2026-10-02, `task-162-fire-supersedes-trigger-superseding-element-approval`) — "state-transition
verbs", and the `supersedes:` trigger's second commit.** `dl-065` (`ready`). Q3: §4.3 called
`approve`, `reject` and `deprecate` "approver-gated", twice (the bracket sentence and the `dl-054`
Revision note). `deprecate` is not an approval gate (`dl-027`, REQ-SEC-04), so both now say
"state-transition verbs". The 2026-09-30 note keeps its quotation of the old text. Q1.1: item 2's
"exactly one git commit" gains the one exception, an approve that fires the `supersedes:` trigger.
Edited in place without a supersede or a state change, per `dl-047` (no `version:` field); pending
the approver's sign-off at `task-162`'s review.

**Revision (2026-10-05, `task-165-put-bootstrap-commands-command-surface-mcp-specs-bootstrap`) — §4.2
states the bootstrap exemption, and names the workflow configuration file correctly, per
`dl-046-bootstrap-commands-in-spec-006-section-3` (`ready`, A(a)) and `bug-204`.** §4.2's bijection
covered every state-mutating CLI command, so `wingfoil init`, which has no Tool, contradicted it.
`dl-046` A(a) exempts the bootstrap commands from REQ-SYS-05, and §4.2 now says so, naming `init` and
`mcp`. §4.2 also named the workflow configuration with a singular file name that never existed; it is
`workflows.yaml`. No Tool, Resource or other rule changed. Edited in place without a supersede or a
state change, per `dl-047` (no `version:` field).
