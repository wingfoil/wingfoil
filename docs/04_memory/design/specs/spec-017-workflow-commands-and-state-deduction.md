---
id: spec-017-workflow-commands-and-state-deduction
type: tech-spec
title: "Workflow commands and state deduction"
status: approved
scope: "src/workflow — `wingfoil workflow start|end|next|status|finalize|list|show|create|remove`, the active-workflow context and the deduction of workflow state from Memory"
supersedes: ""
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703   # Orignal template version
---

## Context

`minor-v0.3` ("WingFoil v0.3 - Project Workflow") lists P4.1–P4.9, P4.11, P4.13–P4.16, X1.1 and X1.2
among its `features:` (`docs/04_memory/planning/rl-v1/minor-v0.3.md:8`). Its Scope says that in v0.3
WingFoil "tells humans and agents what to do next and tracks it" but does not execute steps (P4.10) or
run checks (P4.12), both v1.0 (ruling R3, `release-planning-rel-v0.3-plan`). Two of its Success
Criteria bind this spec directly: "`workflow next` names the current step's verb, role and element",
and "The workflows under `.wingfoil/workflows/custom/` load through the workflow commands with zero
errors". The identify-specs rulings of the same plan (R11–R14, 2026-09-30) add a ninth command,
`workflow finalize` (R11), serve the `next` and `status` MCP Resources in v0.3 (R12), move git-hook
notifications to v0.4 (R13), and fold `dl-104` into the `spec-003` revision reviewed with this spec
(R14).

**What ships today.** One workflow operation, `workflowList`, registered under the `workflow` module
(`src/core/index.ts:1840-1851`). It returns `loadWorkflowsYaml`'s result verbatim
(`src/core/loaders.ts:196-233`): the manifest plus every included file, validated against
`spec-003-workflows-yaml-schema`'s two layers, with two semantic checks, `E_WORKFLOW_FILE_NOT_FOUND`
and `E_NO_MAIN_WORKFLOW`. No check resolves a phase's `include:` against the loaded names (`bug-145`),
which is why the Kanban scaffold's include-by-path (`bug-144`) passes. The production MCP server
registers the read-only Resources `wingfoil://workflows` and `wingfoil://workflows/{name}`
(`src/mcp/workflow-resource.ts:34-37`, wired by `registerReadOnlyResources`, `src/mcp/index.ts:79-84`)
and deliberately does not call `registerCoreModules` (`src/mcp/server.ts:19-26`), so the mechanical
`wingfoil://workflow/list` URI exists only in tests.

**What is undefined.** Nothing states where an open main workflow is recorded, what "the current step"
is, how a phase's completion is known, how an `iterate_over` phase is walked, how a pending approval
is found, or what `workflow next` prints. Every consumer would re-derive these: `wingfoil agent
execute --next` (P5.3.1, `spec-016`), `agent list --waiting` (which `dl-135` point 1 defines as "a
step that is ready (`workflow next`, P4.4) and whose role is an agent role"), the X1 notification
baseline, and the MCP Resources. Two consumers deducing differently would give two agents two
different "next steps" from one commit — the failure REQ-SYS-07 and REQ-STATE-09 exist to prevent.

**What this spec does not redefine.** The YAML schema, its load-time diagnostics (codes, order, shape)
and the built-in token bindings are `spec-003`'s, as revised on 2026-09-30 with `dl-090`, `dl-104`,
`dl-105`, `dl-109`, `dl-134` and `dl-135`; until the code implements that revision, the fields it adds
reach the loader through `.passthrough()` (`src/workflow/schema.ts:73-91`). State machines are
`spec-001`'s; directive resolution is `spec-012` §5's; exit codes and formats are `spec-005`'s; the
grammar is `spec-008`'s; the MCP naming is `spec-004`'s; the operation table is `spec-006` §3's; the
baseline rules are `spec-006` §6's.

## Specification

### 0. Release boundaries

| Concern | v0.3 (this spec) | v0.4 | v1.0 |
|---|---|---|---|
| Workflow commands | `start`, `end`, `next`, `status`, `finalize`, `list`, `show`, `create`, `remove` (P4.2–P4.9; `finalize` ruling R11) | — | — |
| Step execution | reported, never run (`next` names the verb) | — | P4.10, REQ-STATE-04, REQ-INT-06 |
| `checks.pre/post`, `awaits.evidence` | listed with their binding, never evaluated | — | P4.12 |
| Phase records | written by `workflow finalize` (§7.9) | — | also written by the engine |
| Fallback (P4.15) | deduced: after a reject, the fallback step is reported as current | — | the engine applies `set_state` |
| Approval routing (P4.14) | resolved and reported; pending approvals listed | — | — |
| Notifications (X1.1/X1.2) | CLI output of `workflow status` / `next` (§5.3) | git hooks, the enabling setting, decision-type routing (ruling R13) | — |
| `mode` / `distinct_from` (`dl-134`, `dl-135`) | surfaced read-only in `next`/`show` | `--resume`/`--ref` (`dl-135`) | enforced with P4.12 |
| `cadence` (`dl-105`) | surfaced read-only | — | engine trigger |
| Collections in `iterate_over` (`dl-104` D2 (b)) | deduced (§4.6) | — | — |
| MCP Resources `next`, `status` | served (§9, ruling R12) | URI unification (`dl-040`) | — |
| MCP Tools for the mutating ops | declared `mutates: true`; not served (§9) | P5.2.3 | — |

### 1. Inputs, baseline and determinism

**1.1 One baseline.** Every operation of this spec reads the repository **as committed at `HEAD`**:
`workflows.yaml` and the files it includes, `bindings.yaml`, `memory.yaml`, `dna.yaml`, `roles.yaml`,
the directive files, every Memory document's frontmatter, the existence of `produces:` artefacts, and
the commit history walk of §4.8. The normative rule is `spec-006` §6 (`dl-080` (B)):

- The mutating operations (`start`, `end`, `finalize`, `create`, `remove`) gate on what they read, so
  item 1 ("a read that gates resolves at `HEAD`") applies.
- `next` gates too: it refuses an unresolvable `<ref>` (§10), and its first step is what `agent
  execute --next` launches on and records a run for (`spec-016`), so item 1 applies to it. R15 lists
  `next` with the exception; under item 1 it needs none, and the §6 sentence names it only for
  completeness.
- `status`, `list` and `show` gate nothing beyond resolving their operand, and `spec-006` §6 item 4
  would let them read the working tree (as the `command-baseline` directive's default, "a read that
  gates nothing keeps reporting the working tree", in its *Consequences already decided*,
  and `dl-084` (A), approve `2985b0ee`). This spec makes them read `HEAD` as well, as a **declared
  exception** to `dl-084` (A), `spec-006` §6 item 4 and that `command-baseline` bullet, justified by
  determinism: one deduction function answers `next`, `status` and the MCP Resources of §9, and it must
  not answer from two baselines. The exception is decided (approver ruling R15, 2026-09-30, `release-planning-rel-v0.3-plan`), and
  covers `agent list` and `agent show` as well (`spec-016` §5.1); `spec-006` §6 gains the sentence
  that declares it in the implementing task (Consequences).

Every payload carries the baseline it answered from (`dl-084` (A)).

**1.2 The working tree explains, never decides.** When the working tree differs from `HEAD` under the
Memory paths, `.wingfoil/workflows*`, a `produces:` pattern or the run-log files (`dna.yaml`
`paths.runs`, `<runs>/<element-id>.jsonl`, `spec-016` §4.1), the read-only operations emit the
diagnostic `W_UNCOMMITTED_INPUTS` naming the paths, and still answer from `HEAD`
(the `command-baseline` directive's "The working tree may be read to *explain* a refusal, never to decide one"; approver ruling R15, 2026-09-30, `release-planning-rel-v0.3-plan`). `spec-016`'s `agent list` and
`agent show` reuse this code and rule unchanged (`spec-016` §5, §5.1). The one exception is a guard over a filesystem effect (`dl-086`): `create`
checks that its target file does not exist on disk.

**1.3 Determinism rules** (REQ-SYS-07, REQ-STATE-09, REQ-SYS-03, REQ-STATE-02):
- No wall-clock value and no random value enters any deduction or output. Nothing is cached between
  invocations: recomputing at the same commit yields the same result byte-for-byte. The one future
  exception is `dl-105` R3 (a)'s "overdue", which, when it is computed at all, is computed only for
  the status display (§6.4); v0.3 does not compute it.
- Every collection has a declared order:

| Collection | Order |
|---|---|
| workflows (in `list`, MCP) | byte-wise ascending `name` |
| phases | declared order |
| iterations over Memory elements | ascending by the `{n}` token of the type's `id_pattern` when it has one (an id the pattern does not match after every one it does), else byte-wise ascending `id` |
| iterations over a collection | the collection's declared order (`spec-003` § "Collections") |
| open instances | most recently started first (§3.3); ties by byte-wise ascending instance id |
| frontier steps (§4.9) | instance order, then depth-first phase order, then iteration order |
| elements a step created or awaits | ascending `(type, id)` |
| directives | ascending id (`spec-012` §5) |
| approvers routed to | ascending `(name, email)` |
| diagnostics | load-time diagnostics in `spec-003`'s order, then this spec's: `W_UNCOMMITTED_INPUTS` first, then `W_MEMORY_*` by path, then `W_INSTANCE_WORKFLOW_UNKNOWN` by instance order, then step-attached codes in frontier order |

- Memory documents are enumerated from `HEAD`'s tree in sorted path order, never by directory
  listing order.

**1.4 Tolerant reads** (`bug-031`, P4.13 scenario 3). A Memory document whose frontmatter does not
parse, has no `status`, or holds a status its type's machine does not declare is excluded from
deduction and reported as a diagnostic, never as a crash (`W_MEMORY_INVALID_STATE`:
`invalid state '<status>' for type '<type>' in <file>`, P4.13; `W_MEMORY_UNREADABLE`:
`unreadable frontmatter in <file>: <reason>`). The reasons are the parser's first line, `no frontmatter`,
`no 'type' field`, `type '<type>' is not declared in memory.yaml`, `no 'id' field` and `no 'status' field`.
The six pre-`dl-019` plan files that carry no frontmatter (for example
`docs/05_plans/rl-v1/initial-design-rl-v1-plan.md`) are reported this way. A file with no frontmatter whose
path matches no type's `path` pattern is not a Memory document and is left out silently: the top-level
`docs/05_plans/X_*.md` plans `dl-019` grandfathers (`.wingfoil/memory.yaml` `plan.path`). In a `path` pattern a
token in the file name stands for one name, a token in a directory for one or more directories (the plan's
`{scope}` nests, as in `rl-v1/rel-v0.3`).

### 2. The workflow registry and its diagnostics

The registry is the loader's result (`spec-003` Layers 1–3) plus `spec-003`'s *core* checks, which need
`memory.yaml` or `dna.yaml` at `HEAD` (none reads `roles.yaml`) and therefore run in the workflow
operations of `src/core`, not in the loader (`spec-003` § "Diagnostics", "Runs in"). Every load-time code, its
severity, its message and its order are `spec-003`'s; this spec adds none.

Deduction raises its own diagnostics, in the same shape (`spec-003`: `{ code, severity, file, path,
message }`, one array named `diagnostics`; for these codes `file` is repository-relative), all of them warnings, because deduction never refuses:

| Code | Severity | Condition |
|---|---|---|
| `W_UNCOMMITTED_INPUTS` | warning | §1.2 |
| `W_MEMORY_INVALID_STATE` | warning | §1.4, P4.13 sc. 3 |
| `W_MEMORY_UNREADABLE` | warning | §1.4 |
| `W_UNRESOLVED_TOKEN` | warning | a token of a `where`, `produces` or action argument has no value on the element it resolves against (§4.1) — the element lacks the field, or the field is blank |
| `W_INSTANCE_WORKFLOW_UNKNOWN` | warning | an open plan names a workflow the registry does not load; the instance is listed with an empty frontier |
| `W_APPROVAL_ROLE_WITHOUT_AUTHORITY` | warning | a member an approval is routed to does not hold the `approver` role (§5.1) |

An error among `spec-003`'s diagnostics makes every workflow operation exit `1` (`VALIDATION`, §10).
"Startable" and "includable" are `dl-109` K1 (a)'s two booleans; `kind: main` reads as startable-only
and `kind: sub` as includable-only, which is the alias `dl-109` ratified.

### 3. Workflow instances and the active context (REQ-STATE-03)

**3.1 The record of an open main — a `plan` element.** A started workflow is a **workflow
instance**, recorded as a Memory element of type `plan` (`dl-019`; `memory.yaml` `plan`,
`.wingfoil/memory.yaml:198-210`): its `workflow` field names the workflow; its `element` field holds
the bound element's id when the workflow declares `element:`, or the context element's id (§3.5)
when it does not; its `parent` field (a new optional plan field) is empty. A plan whose `parent` is set
(`<workflow>.<phase>`) is a **phase plan**, not an instance. The instance id is the plan's id. No
other store exists: no `.wingfoil/state/`, no index file (REQ-SYS-03, `adr-007`). This keeps the
record inside Memory, where it can be inspected, amended and approved like any element, and it is the
practice already in use: `git log --format=%s | grep '^wf(plan)'` counts 26 `add`, 26 `submit` and 20
`finalize` commits at `997e8998`.

**3.2 Open.** An instance is open when its plan's status is `draft` or `active`. A plan whose
`workflow` names a workflow that is not startable, or whose `parent` is set, is ignored here.

**3.3 Start order and the active instance.** An instance's **start commit** is the commit that added
its plan file; its start position is that commit's position in `git rev-list --topo-order HEAD`. The
open instances are ordered most recently started first; the **active instance** is the first.
`workflow end` of the active instance therefore makes the previous one active again (P4.3 sc. 2), and
ending the last open instance leaves no active instance (P4.3 sc. 1). Every operation that works on
one instance takes an optional positional `<ref>` — a workflow name (the most recently started open
instance of it) or an open instance id — and otherwise uses the active instance (REQ-STATE-03 fit
criterion).

**3.4 The bound element** (`dl-109` K2 (a) with (b); `spec-003` Layer 2 `element`). Three cases:

- **Declared.** A workflow that declares `element: T` is started with `--element T:<id>`
  (`spec-008` §7). When the argument is absent, the bound element of the active instance is inherited
  if its type is `T`; otherwise `start` refuses. The element must exist at `HEAD`.
- **Self-creating.** A startable workflow that declares no `element` and whose own phases contain a
  `memory.add(type: T)` — the four ingest mains (`bug-ingest.yaml:9-11`: "No fixed `element:`") and
  `sw-life-cycle` (`seed-first-release-line`, `sw-life-cycle.yaml:31-38`) — starts **unbound**. Its
  **creating phase** is the first of its own phases that declares a `memory.add`, and `T` is that
  action's type. The instance's element is **bound when its first element is created**: it is the
  element of type `T` that the creating phase's step created (§4.8, linkage) with the oldest add
  commit. From then on every rule that resolves against "the bound element" — `{id}` in `produces`,
  `state` evidence, approval detection, completion — resolves against it. Until then the instance
  reports `element: null`, its frontier is deduced as usual (for the ingest mains, whose creating
  phase is the first, that is the creating step), and its `{id}` tokens are pending, not
  unresolved (no `W_UNRESOLVED_TOKEN`). Further elements linked to the same step are listed in
  `Instance.created` and do not change the binding: an ingest main captures one element per instance
  ("Capture a single defect report", `bug-ingest.yaml`'s `description`).
- **None.** A workflow that declares no `element` and adds none has no bound element.

A workflow that is includable as well as startable (`dl-109`) self-binds only when it runs as an
instance; included, it has the element its includer provides (`spec-003` Layer 2 `element`).

**3.5 The context element.** When a workflow that declares no `element` is started while the active
instance has a bound element, `start` writes that element's id into the plan's `element` field as the
instance's **context** (`Instance.context`) — as the practised plans do
(`docs/05_plans/rl-v1/rel-v0.3/bug-ingest-rel-v0.3-planning-findings-plan.md`: `workflow:
"bug-ingest"`, `element: "minor-v0.3"`). The context never binds and never enters deduction; what the
bug-ingest comment's "the created Memory file inherits that element" means for the created element's
frontmatter is the Memory pillar's, not this spec's.

### 4. State deduction (P4.13, `adr-007`, `adr-008`)

**4.1 Scope chain and tokens.** Deduction walks an instance's workflow with a scope: the bound element
(or collection entry) of each enclosing workflow, from the instance down to the phase. In a `where`
value, a `produces` pattern or an action argument:
- `{<type>.<field>}` resolves to `<field>` of the nearest enclosing element of type `<type>`;
- `{<field>}` and `{element.<field>}` resolve to a field of the innermost bound element; `{id}` is
  that element's id;
- `{item}` and `{item.<field>}` resolve to the innermost collection entry's key and field
  (`spec-003` § "Collections");
- inside a `{ type: T, path }` `produces` entry, `{T.<field>}` resolves against each element the step
  created of type `T` (`dl-104` D3);
- in an action argument of a phase that declares a selection (`spec-003` § "Selections"),
  `{T.<field>}` for a type `T` the selection selects resolves against each selected element of type
  `T`, so the action runs once per such element (`release-planning.build-backlog`'s
  `memory.add(type: task, …, bug: "{bug.id}")`: one fix task per selected bug); `{element.<field>}`
  still names the innermost bound element.

A token with no value leaves its pattern unresolved: the evidence that uses it is not satisfied, and
`W_UNRESOLVED_TOKEN` names it. A token whose type is in no enclosing scope is caught at load time
(`spec-003` `W_PHASE_TOKEN_OUT_OF_SCOPE`). Tokens are substituted as whole values, never evaluated
(`dl-090` Q3 (a)).

**4.2 What an action acts on.** Each Memory action of a phase has a **target**, fixed by its position
and its token:

| Action | Target |
|---|---|
| `memory.add(type: T, …)` | creates an element; the element is **created by** the step when its add commit carries the step's linkage (§4.8) |
| `memory.submit\|approve\|reject\|deprecate`, `element.set_state`, `element.set_release` **before** any `memory.add` in the phase | the phase's **selection** when it declares one (`spec-003` § "Selections"); otherwise the bound element |
| the same tokens **after** a `memory.add(type: T)` in the phase | the elements of type `T` the step created — in a self-creating workflow's creating phase, that is the bound element (§3.4) |
| `<T>.set_state(…)` | the bound element when `T` is its type; otherwise the elements of type `T` created by an earlier step of the same workflow pass (same instance, same enclosing scope); otherwise the phase's selection when it selects `T`; otherwise nothing |
| `<T>.sync_state(…)` | the elements its argument names; a sync is derived from other elements' state and is never evidence |
| every other token (`agent.*`, `git.*`, `tests.*`, `cli.run`, …) | nothing |

An untyped Memory action with no target at all is `spec-003`'s load-time `W_PHASE_ACTION_UNTARGETED`
(none on this repository since `task-199` gave `end-of-life.deprecate` a selection).

**4.3 Evidence** (`spec-003` § "Evidence", `dl-104` D1 (c), D3, D4). A phase is **complete** when every
kind of evidence it declares is satisfied:

| Kind | Satisfied when |
|---|---|
| `state` | the bound element's status is at or after the phase's exit state (§4.4) in its type's `sequence` |
| `created` | for each type `T` the phase adds: the step created at least one element of `T`, each of them is at or after the state the phase's later actions leave it in (§4.4 applied to it), and each `{ type: T, path }` entry resolves to a committed path for each of them. A step that created **no** element leaves this kind satisfied when the phase declares other evidence, and otherwise **missing**, completed only by a `record` |
| `produces` | every string entry, resolved (§4.1), matches at least one path in `HEAD`'s tree (a pattern ending in `/` matches when a committed file lies under it). An entry `spec-003` flags `W_PHASE_PRODUCES_OWNER_IMPLICIT` is shown but is **not evidence** until it is rewritten in the `{ type, path }` form: under `dl-104` D3's default it would name a file of the workflow's element that the phase never writes (a task-named spec), or one that exists from the start (the release-line's own file) |
| `selection` | no Memory document at `HEAD` matches the phase's `where`; an archived document (`deprecated`, or `superseded`, §4.11) never matches |
| `include` | the included workflow is complete for the element(s) or entries it runs on (§4.5, §4.6) |
| `awaits` | never in v0.3 — its `evidence` is a check, evaluated from v1.0 (P4.12); the phase completes by a `record` |
| `record` | a phase record for the step exists (§4.8) |

A phase that declares none of the first six is a **checkpoint**: its only evidence is `record`. A phase
with `approval:` also needs what §5.1 says. The evidence of a completed phase is not re-checked in any
other way: files are not diffed, checks are not run (P4.12, v1.0).

**4.4 Exit states.** A phase's exit state for the bound element is computed statically, by applying
the phase's actions that target the bound element (§4.2) in order along its machine (`spec-001`),
starting from the state the previous phase leaves it in. The first phase of a workflow starts from:
the lowest-`sequence` value of the governing `where.status` when the workflow runs under
`iterate_over`; the including workflow's state at the including phase under a plain `include`; the
type's first state at the `memory.add` of a self-creating workflow's creating phase; otherwise the
type's first state. `element.set_state(s)` and `<T>.set_state(s)` yield `s`; `memory.submit` yields
the target of the forward edge from the current state; `memory.approve` yields the gate's approve
target. The same computation, applied to a created element from the type's first state at its
`memory.add`, gives the `created` target state. A state reached by a reject edge that lies forward in
the `sequence` (a `bug` rejected `open → closed`) is "at or after" the exit state, so the phase counts
as complete: the decision was taken. If the exit state cannot be computed, `spec-003`'s
`W_PHASE_EXIT_STATE_UNDETERMINED` is raised at load and the phase's `state` evidence is unsatisfied.

**4.5 Plain `include`.** The sub runs on the including workflow's bound element (or on none). The
phase is complete when every phase of the sub is complete or skipped (§4.10).

**4.6 `iterate_over`** (P4.16, REQ-STATE-07, `adr-003`'s live query).

*Over a Memory type.* The `where` map is split in two: its `status` key is the **entry filter**, every
other key is the **scope filter**. Candidates are the documents of type `iterate_over`, at `HEAD`,
whose frontmatter matches the scope filter by `spec-003`'s match rule (an equal value; membership in a
list value; a list-valued field matches when the two lists share an element —
`release-cycle.yaml:27`'s `tags: ["{release.version}"]` against a task's `tags:` list). A candidate is:
- **eligible** when it also matches the entry filter and no phase of the sub before its current phase is
  complete other than vacuously;
- **entered** when a phase of the sub before the sub's current phase (§4.9) is complete for it other than
  vacuously (§4.7), and the sub is not complete;
- **complete** when the sub is complete for it;
- otherwise ignored.

The entry filter alone would drop an element the moment the sub moves it on (a `task` leaves
`backlog` in `dev-loop`'s `start`), so entered elements stay visible through the scope filter.

*Over a collection* (`dl-104` D2 (b)). Candidates are the collection's entries at `HEAD` that match
`where`, in declared order; collections carry no status, so every candidate is eligible until the sub
is complete for it, entered once a phase of it before its current phase is complete other than vacuously, and
complete with the sub.

The phase is complete when no candidate is eligible or entered. When no candidate is eligible, entered
or complete — there is none, or every one is ignored (P4.16 sc. 3's "no task has `status: backlog`",
where an empty scope filter makes every task a candidate) — it completes with the note
`no elements matched the iterate_over filter` (P4.16 sc. 3) and is **vacuously complete** (§4.7). A
`where` token with no value leaves the candidates undecided: the phase is then one unexpanded step,
missing `include`, and the token is reported (`W_UNRESOLVED_TOKEN`). REQ-STATE-07's "N elements matching the `where` filter" is read as the eligible
plus entered candidates defined here, which keeps an element counted after the sub moves it out of
the entry filter; the SARD wording is amended with this spec (Consequences), together with `dl-104`
Action 1's "or collection entries".

**4.7 Live queries after the workflow has moved on.** A selection or `iterate_over` phase is a live
query over current Memory (REQ-SYS-03): an element that matches later reopens it. Two rules keep that
from undoing finished work:
- a live-query phase is also **complete** once a later phase of the same workflow pass is complete
  other than vacuously; a candidate that matches after that point is reported as `late` in
  `status` (and, if it sits in a gate state, among the ungated elements of §5.1), never put back on
  the frontier — a bug opened while a release is in development does not reopen that release's
  planning. For an `iterate_over` phase the late candidates are the ones still eligible or entered;
  each is counted in the `late` count of `iterations` (§8), and an element (not a collection entry, which is no
  `ElementRef`) is listed in the instance's `late`; for a selection they are the elements it matches;
- a phase that is complete only **vacuously** (an `iterate_over` with no candidate counted, a selection
  matching nothing whose only other evidence is a `created` with no element, or a plain `include` whose
  sub completed only vacuously) never makes an earlier phase complete or skipped by this rule or by §4.10.

**4.8 The history walk: records, linkage and re-entry.** Deduction reads commit history once per
invocation, per open instance, over a bounded **walk**: the commits reachable from `HEAD` and not
reachable from the parents of the instance's start commit, read with their subject and trailers.
Three things are found there.

- **Linkage.** An add commit (`wf(<type>): add <id>`) whose trailers carry
  `WingFoil-Instance: <instance-id>` and `WingFoil-Step: <step key>` makes the element it adds
  **created by** that step. `memory add` writes them when given `--workflow <ref>` (§7.10); `next`
  reports every `memory.add` action with those options filled, so following the reported command
  links the element.
- **Records** (`dl-104` D1 (b); `spec-003` § "Evidence"). A commit whose trailers carry
  `WingFoil-Phase: <workflow>.<phase> completed`, `WingFoil-Instance: <instance-id>` and the step's
  `WingFoil-Element: <type>:<id>` or `WingFoil-Item: <collection>#<key>` is the phase record of that
  step. In v0.3 it is written by `workflow finalize` (§7.9).
- **Re-entries.** A commit that moved an element to an earlier position of its `sequence` — a
  `reject` (`wf(<type>): reject <ids> [<from> → <to>]`) or a `park` (`dl-110`) naming it. After a
  re-entry of the element a workflow pass runs on, the `record` and `state` evidence of the phases
  from the `fallback.step` of the phase whose gate state was `<from>` onward counts only if its
  commit is newer than the re-entry commit. For `state`, that commit is the latest commit in the walk
  whose `wf(<type>): <verb> <ids> [<from> → <to>]` subject names the element with `<to>` equal to its
  current status, or, when no subject does, the latest commit that changed the element's file. Phases
  before `fallback.step` keep their evidence, and `produces` evidence is not affected. This is how the
  fallback step becomes current after a reject (§5.2): after `dev-loop.review` is rejected, `start`
  and `design` stay complete, `red` needs a new record, and `review`'s `state` needs a new `submit`.
  **Newer** means *descends from*: a commit is newer than the re-entry commit when the re-entry commit
  is a strict ancestor of it, decided through the parent links the walk reads. Neither the commit date
  nor the position in `--topo-order` decides it. A record made on a branch that had not seen the reject
  does not count once that branch is merged, whichever parent order the merge has. When several
  re-entries reach a phase, its evidence must descend from each. A plain `include` runs on the same
  element, so the re-entries that reach the including phase reach every phase of its sub. An
  `iterate_over` phase does not hand its own re-entries to its iterations: each iteration runs on
  another element (or a collection entry, which has none), and only that element's re-entries cut its
  sub's evidence (approver ruling 2026-10-09, `task-202`).

A commit older than the start commit is outside the walk: a record, linkage or reject from before
the instance was started does not count for it.

**Cost** (REQ-PERF-03, `workflow next` < 1,000 ms p95). One deduction reads `HEAD`'s tree once and the
Memory frontmatter once. It reads history with one `git merge-base --octopus` over every open instance's
start commit and one `git log` over the union of the open instances' walks: the commits reachable from
`HEAD` and not from that merge base's parents. With no common ancestor, the walk is not bounded. It then
makes one lookup per element that has a re-entry in the walk. The merge base is an ancestor of every
start, so no commit any instance's walk holds is cut off. The oldest start alone would cut one off in a
branching history: a commit on another branch that precedes the oldest start.
Nothing scales with the full history. The fit criterion is verified by a timing test in the
implementing task, on this repository's history; it is not measured here.

**4.9 The current step and the frontier.** An instance's phases are sequential. The **current phase**
is the first phase that is neither complete nor skipped. When it is an `include` or `iterate_over`
phase, deduction descends into the sub for each eligible or entered candidate, in iteration order. The
**frontier** of an instance is the list of leaf steps reached this way; a leaf step is
`(instance, trail, scope, phase)`, where `trail` is the chain of `(workflow, phase, scope)` from the
instance to the step and `scope` is the step's element or collection entry. A step's **key** is
`<workflow>.<phase>`, followed by `@<type>:<id>` or `@<collection>#<key>` when it has a scope (e.g.
`dev-loop.red@task:task-130`); within one instance a key names one step. Several steps are ready at
once when several iterations are in flight (parallel `dev-loop`s, `dl-014`). An instance is
**complete** when its frontier is empty, except an instance whose workflow the registry does not load
(`W_INSTANCE_WORKFLOW_UNKNOWN`, §2): its frontier is empty because nothing can be deduced, and it is
reported `complete: false`; and an abandoned instance (§4.11), whose frontier is empty for the same reason,
is reported `complete: false` too.

**4.10 Optional phases.** A phase with `optional: true` whose evidence is unsatisfied is **skipped**
when a later phase of the same workflow is complete other than vacuously (§4.7); otherwise it is
current, and the step reports `optional: true`; the frontier then also carries the steps of the following
phases that are not complete, up to and including the next non-optional one, which the optional phase does
not hold back. From v1.0 an
optional phase is also skipped when its `checks.pre` are unmet (`spec-003` `optional` row).

**4.11 Archived elements.** A candidate or bound element in `deprecated`, or in `superseded` on
`adr`/`tech-spec` (REQ-STATE-06, `dl-065`), is neither eligible nor entered; an instance whose bound
element (declared or self-bound, §3.4) is archived reports `abandoned: true`, an empty frontier, no phase progress and
`complete: false` (§4.9). A self-bound element stays bound when it is archived: a later element the creating
step linked does not rebind the instance. A selection never matches an archived element either (§4.3).

### 5. Approvals, fallback, notifications and third parties

**5.1 Pending approvals and routing** (P4.14, P4.5, X1.1). A phase that declares `approval:` holds an
approval on every element its actions move through a `gates` state — its **carried elements**:

| Carrier | Awaiting while |
|---|---|
| the bound element | it sits in a gate state the phase's actions pass through: the state an approve edge leaves (`memory.approve`, or a `set_state` to a gate's approve target — `release-line-cycle.approve`, release-line `planning`, `.wingfoil/memory.yaml:89`), or the gate state a `memory.submit` enters (`dev-loop.review`, task `in-review`) |
| the selection (`spec-003` § "Selections") | each selected element sits in a gate state of its type (`release-planning.triage-bugs`: bugs `open`; `reconcile-governance`: decision-logs `in-discussion`, ADRs `pending`) |
| the created elements | each element the step created sits in a gate state the phase's later actions pass through (`identify-specs`, `record-adrs`, `dev-loop.design`: `tech-spec`/`adr` `pending`; `end-of-life.announce`: a decision-log `in-discussion`) |
| the run elements of a typed `<T>.set_state(s)` | each targeted element (§4.2) sits in the gate whose approve target is `s` (`release-planning.commit-backlog`: tasks `pending → backlog`) |

The approval is given when no carried element awaits any more — by `memory approve` (or a `reject`,
§4.4) on each of them — and the phase's other evidence is satisfied. A phase whose actions carry
**no** element through a gate has its approval recorded by `workflow finalize` with approver
authority (§7.9): the step awaits that record once its other evidence is satisfied. On this repository
those are `user-docs.align-user-docs`, `agent-docs.align-agent-docs` (included by `user-docs` and
`release-line-cycle`), `e2e-smoke.gate`, `release-submit.approve-release`, `release-publishing.publish`
and `retrospective.additional-points` (§12); `retrospective.approve` carries its decision-log since
`task-199` (`decision-log.set_state(ready)`, the run elements row).

A **pending approval** is a frontier step with at least one awaiting carried element, or awaiting its
approval record. It is routed per `spec-003`'s `approval`: `by_role: R` to every `dna.yaml`
`team.members[]` entry whose `roles` include `R`, `by_person: P` to the one member whose `name` or
`email` is `P` (P4.14 sc. 1–2), read at `HEAD`, in the order of §1.3. When no member holds `R`, the
approval carries `routedTo: []` and `routingError: "no approver found for role '<R>' in dna.yaml"`
(P4.14 sc. 3); this is reported, not an exit `1`, because `status` and `next` do not refuse on it.
Routing reports who is asked and does not change who may decide: authority stays with the `approver`
role (REQ-SEC-03, `APPROVER_ROLE`, `src/core/approval-authority.ts:43`), so a routed member who lacks
it is flagged `W_APPROVAL_ROLE_WITHOUT_AUTHORITY`. The routed members are reported (`routedTo`), not
recorded anywhere: nothing in Memory changes when an approval becomes pending.

Separately, `status` lists **ungated elements**: Memory elements sitting in a `gates` state of their
type that no pending approval of an open instance carries. They are the "human needed" set that
exists outside any started workflow.

**5.2 Fallback** (P4.15). After a reject, §4.8 makes the `fallback.step` the current step; `next`
reports it with `reentered: true`, the reject commit, and the `fallback.set_state` the phase
declares. WingFoil does not apply `set_state` in v0.3: the element's state after a reject is always
`memory.yaml`'s reject target, written by `memory reject`. When the reject target already equals
`set_state` (true of the three reject-reachable fallbacks with `set_state` in this repository:
`dev-loop.review`, `release-planning.triage-bugs`, `release-planning.reconcile-governance`, checked
against `.wingfoil/memory.yaml:120-121,137-138,153-154,187-188`), the reject itself produced it; a
difference is `spec-003`'s load-time `W_PHASE_FALLBACK_STATE_MISMATCH`. A reject whose target lies
forward (`bug-ingest.triage`: bug `open → closed`) completes the phase instead of re-entering it; a
`fallback.step` naming an earlier phase there is `spec-003`'s `W_PHASE_FALLBACK_NOT_REENTRANT`
(`bug-ingest.triage` declared one until `task-199`). `dev-loop.done`'s `fallback`
answers a failed merge, which is P4.10 (v1.0), not a reject, and is reported only. A `fallback.step`
that names no phase is a load-time error (`E_PHASE_FALLBACK_STEP_UNKNOWN`), not a runtime refusal of
the reject: `memory reject` reads no workflow.

**5.3 Notification baseline** (X1.1, X1.2; ruling R13). In v0.3 the notification channel is the CLI
output: `workflow status` prints every pending approval and every ungated element as a "human needed"
line naming the required action (`approve or reject`, or `finalize` for an approval record), the
element id(s) or step key, and the routed members; `workflow next` prints the same line when its first
step awaits approval. Steps between automated states print none (X1.1 sc. 2). Role routing is §5.1's
(X1.2 sc. 1). Delivery through git hooks, the "notifications enabled" setting, delivery failure
(X1.1 sc. 3) and decision-type routing (X1.2 sc. 2) are v0.4 (ruling R13).

**5.4 Third parties** (`dl-104` D4). A step whose phase declares `awaits:` reports
`awaiting: { kind: "party", party, evidence }` once its other evidence is satisfied. Its `evidence`
check is not evaluated in v0.3, so the step completes by a record (`workflow finalize`, §7.9), which
needs approver authority only when the phase also declares `approval:`.

### 6. What a step reports beyond its position

**6.1 Actions and checks** (`dl-090`). Each action is reported with its interpolated text and its
binding: the built-in bindings of `spec-003` (§ "Action expressions", the built-in table: binding
kind, command, Memory verb), then the project's `bindings.yaml`, otherwise `unbound`. A `wingfoil`
binding carries its argv (`memory.add` with `--workflow <instance-id> --step <key>` filled, §4.8); an
`agent` binding carries `wingfoil agent execute --workflow <instance-id> --step <key>` with the phase's
role (`dl-090` Q6 (a), `spec-016` §3.1), so that each frontier step's binding launches on that step
and not on the instance's first (approver ruling R16, 2026-09-30, `release-planning-rel-v0.3-plan`); a `manual` binding (`dl-090` Q2 (c)) carries the commit subject
`spec-003`'s verb rule prescribes, e.g. `wf(task): start task-130 [backlog → in-progress]`. Checks and
`awaits.evidence` are listed with their binding and `evaluated: false`; an unbound check is reported
`unbound`, never passed (`dl-090` Q2 (c)). Nothing is executed.

**6.2 Role and directives** (P4.4, P3.6, REQ-STATE-05). The step reports its `role`, the members who
hold it (§5.1 ordering), and the role's directives resolved by `spec-012` §5 (`resolveRoleDirectives`,
`src/core/context.ts:159`): ids and titles, role-bound and global, plus that resolution's warnings.
Directive content is not inlined; it is `agent execute`'s (`spec-012` §7). A phase references
directives only through its role (`dl-066` option 1).

**6.3 Executor attributes** (`dl-134` §4 (c), `dl-135` points 3–4). `allowedModes` lists what the
phase's `mode` allows (`fresh` always, plus the declared non-fresh mode), and `mode` is the mode that
runs — `fresh` in every v0.3 run, because `--resume`/`--ref` are v0.4. `distinct_from` (phase names) is
reported as declared. `agentRole: true` marks a role listed in `dna.yaml`
`team.agents[].executes_as` (`.wingfoil/dna.yaml:127`), which is the predicate `dl-135` point 1 uses
for `agent list --waiting`. Nothing enforces them in v0.3.

**6.4 Cadence** (`dl-105`). A declared `cadence` is reported. "Overdue" needs the current time and the
last run's evidence, which `dl-105` R2 (c) keeps outside the repository while the trigger is
provisional; v0.3 reports `lastRun: "not-recorded"` and never computes overdue (`spec-003`
§ "Recurring phases", release boundaries).

### 7. Commands

Grammar (`spec-008` §1; target positional per `dl-082`; the shared selector `<ref>` of §3.3):

```
wingfoil workflow start    <name> [--element <type>:<id>] [--title <t>] [--set phase=<v>] [--set scope=<v>]
wingfoil workflow end      [<ref>]
wingfoil workflow next     [<ref>] [--assigned-to <who>]
wingfoil workflow status   [<ref>]
wingfoil workflow finalize [<ref>] [--step <key>] [--reason <text>]
wingfoil workflow list     [--all]
wingfoil workflow show     <ref>
wingfoil workflow create   <name> (--kind main|sub | [--startable] [--includable]) [--element <type>] [--description <t>]
wingfoil workflow remove   <ref>
```

`create` requires `--kind` or at least one of `--startable` / `--includable` (`spec-003`
`E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE`), never both forms. On `show` and `remove`, `<ref>`
resolves to a workflow: a name, or an open instance id standing for its workflow. All accept the
global flags of `spec-008` §2, including `--format console|json|yaml` (REQ-INT-05). No `--name`
option exists (§ Consequences, BDD amendment).

**7.1 `start`** (P4.2). Refuses unless `<name>` is a startable workflow
(`cannot start a sub workflow directly: <name>`, P4.2 sc. 3). Resolves the element (§3.4, §3.5).
Derives the plan's `id_pattern`/`path` tokens (`{workflow}-{phase}-plan`,
`docs/05_plans/{scope}/{id}.md`, `.wingfoil/memory.yaml:199-200`) by a declared rule, each overridable
with `--set` (`spec-008` §10, whose invalid-value errors apply unchanged):
- `phase` = the bound element's id; with no bound element, the context element's id; with neither,
  `1` (approver ruling R18, 2026-09-30, `release-planning-rel-v0.3-plan`). When the resulting plan id exists at `HEAD` or on any ref `dl-101` names, the lowest suffix
  `-<n>` (`n ≥ 2`) that makes it free is appended to `phase`. A `--set phase=` value that collides is
  refused (`CONFLICT`).
- `scope` = the workflow's name (ruling R18).
- `title` = `--title`, else `<workflow> — <phase>`.

No `--set` is therefore ever mandatory. A project that nests its plans otherwise, as this repository
does (`docs/05_plans/rl-v1/rel-v0.3/…`, `phase: "rel-v0.3"`), keeps its layout by passing `--set`. `start` then writes **two commits**, each touching only the
plan file (`verifyCommittedScope`, `spec-006` §6 item 2): `wf(plan): add <id>` through `memoryAdd`
(fields `workflow`, `phase`, `element`, `title`, `status: draft`, the template body), then
`wf(plan): submit <id>` (`draft → active`; the template's `required: [title, workflow, phase]` are all
filled, `.wingfoil/memory.yaml:206-207`). If the second commit fails, the plan stays `draft`, the
instance is open, and the error names `wingfoil memory submit <id>` as the way on. The new instance
becomes active (P4.2 sc. 2; the others stay open). The output is the instance and its first frontier
step ("its first step is initialized", P4.2 sc. 1). A project whose `memory.yaml` declares no `plan`
type is refused (§10).

**7.2 `end`** (P4.3). Resolves the instance (§3.3); with none open: `no active workflow to end`
(P4.3 sc. 3). A plan still in `draft` is refused with `workflow '<name>' was not submitted: run
wingfoil memory submit <id>` (`INVALID_TRANSITION`). An instance whose deduction is not complete is
refused: `workflow '<name>' is not complete: current step <key>`, with the hint that
`memory deprecate <id>` abandons it. Otherwise moves the plan `active → done` — the `waiting` edge
`memory.yaml` declares for `plan` (`.wingfoil/memory.yaml:210`) — writing
`wf(plan): finalize <id> [active → done]` (`dl-079` (A)'s `finalize`, as the 20 practised commits
write it). The output names the ended instance and the instance now active, or none.

**7.3 `next`** (P4.4, REQ-PERF-03). Deduces the selected instance's frontier. With `--assigned-to`,
keeps the steps whose role the named party holds: `me` is the git identity's email matched against
`team.members[]` (the same "who" as `readGitIdentity`), otherwise a member name, email, or role name
(P4.4 sc. 2). The first step of the result is **the next step** — the one `agent execute --next`
consumes; the rest are reported as further ready steps. Exit `0` in every deduced case: with no open
instance it prints `no open workflows`; with an empty frontier,
`no next step: workflow '<name>' is complete` (P4.4 sc. 3).

**7.4 `status`** (P4.5, REQ-INT-05). Every open instance (or the one `<ref>` selects), active first
and marked, each with its top-level phase progress (`complete` | `current` | `pending` | `skipped`),
its frontier, its pending approvals and its `late` candidates (§4.7); then the ungated elements
(§5.1). With no open instance and nothing ungated: `no open workflows`, exit `0` (P4.5 sc. 3).

**7.5 `list`** (P4.6). Without `--all`: the startable workflows, plus every includable workflow that
is the current phase's sub on some open instance's frontier (P4.6 sc. 1–2). With `--all`: every
loaded workflow (P4.6 sc. 3). Each entry: `name`, `startable`, `includable`, `description`, and
`executableNow`. This replaces today's payload, which is the raw loader result (§ Consequences).
With no manifest: `no workflows defined`, exit `0` (P4.6 sc. 4; `spec-003` Layer 1, "an absent
manifest is an empty registry").

**7.6 `show`** (P4.7). The workflow's declaration resolved: each phase with role, the role's
directive ids (§6.2), actions and checks with their bindings (§6.1), `produces` with its owner,
`approval`, `awaits`, `fallback`, `iterate_over`/`where` or the selection, `mode`/`distinct_from`,
`cadence`, the phase's evidence kinds (§4.3), and each included sub nested under its phase,
recursively (P4.7 sc. 2; `spec-003`'s `E_WORKFLOW_INCLUDE_CYCLE` bounds the recursion). Unknown name:
`unknown workflow: <name>` (P4.7 sc. 3). No instance state is involved.

**7.7 `create`** (P4.8). Writes `.wingfoil/workflows/custom/<name>.yaml` — never under `built-in/`
(REQ-SEC-07's structural discriminator) — with `name`, the startable/includable declaration (`--kind`
maps through `dl-109`'s alias), optional `element` and `description`, `version: 1.0`, and one phase
`name: step-1` (Layer 2 requires one); and appends `workflows/custom/<name>.yaml` to `workflows.yaml`
`include`. One commit with both files, subject `wf(workflow): create <name>`, on the precedent of
`wf(directive): create <name>` (`src/core/index.ts:1378`). Refused when a workflow of that name is
loaded at `HEAD`, or when the target file exists on disk (`dl-086`):
`workflow already exists: <name>` (P4.8 sc. 3); the write guard refuses a modified `workflows.yaml`.
`<name>` must match `spec-003`'s name class `[a-z][a-z0-9-]*` (else exit `2`). Instances in flight
are untouched (P4.8 sc. 2), since deduction reads each instance's own workflow. Interactive creation
is not in v0.3 (`dl-082` point 3 records that only `init` prompts).

**7.8 `remove`** (P4.9, REQ-SEC-07, `dl-030`, `dl-066`). Refused for a workflow whose file is under
`workflows/built-in/`: `built-in workflows cannot be removed` (P4.9 sc. 3). Refused while another
loaded workflow's phase includes it: `cannot remove '<name>': included by '<referrer>'` (P4.9 sc. 2;
all referrers in `details`, ascending) — the check always runs, so there is no `--verify-includes`
flag. The referrer source is `include:` alone: under `dl-066` option 1 no phase references a
directive, so removal checks no directive, and `directive remove` checks no workflow. Refused while an
open instance of it exists: an open instance is a referrer in REQ-SEC-07's sense ("prevent dangling
references"). Otherwise deletes the file and its `include` line in one commit,
`wf(workflow): remove <name>` (P4.9 sc. 1).

**7.9 `finalize`** (ruling R11; `dl-104` D1 (b)–(c)). Records a phase's completion where the phase
has no Memory or file evidence to deduce it from.
- Resolves the instance (§3.3) and the step: `--step <key>` (§4.9), else the instance's next step.
  The step must be on the frontier at `HEAD`: `step '<key>' is not on the frontier of <instance>`
  (`CONFLICT`).
- The step's missing evidence must be `record` alone — a checkpoint (§4.3), an approval no element
  carries (§5.1), an `awaits` (§5.4), or `created` evidence of a step that created nothing (§4.3).
  Otherwise: `phase '<workflow>.<phase>' completes from its evidence: <missing kinds>` (`CONFLICT`) —
  a phase that should produce a document or move an element is never completed by a record
  (`dl-104` D1 rationale).
- When the phase declares `approval:`, the git identity must hold approver authority (REQ-SEC-03,
  the same check `memory approve` makes) and `--reason` is required, non-blank and shaped as
  `dl-067`'s `Reason:` block; the body carries `Approver: <name> <email> (approver)` and
  `Reason: …`, as `memory approve` writes them (P1.7). Without `approval:`, `--reason` is optional.
- Writes one commit with no file change: subject `workflow: finalize <instance-id> <key>`, which is
  outside the `wf({type})` grammar (`spec-003` verb table, closing paragraph) so `memory history`
  does not read it as a Memory operation; the trailer block carries `spec-003`'s phase-record
  trailers. A git identity is required (REQ-SEC-01).
- Output: the finalized step and the instance's new next step.

**7.10 What this spec requires of `memory add`** (`spec-008` owns the grammar; Consequences;
approver ruling R16, 2026-09-30, `release-planning-rel-v0.3-plan`). `wingfoil memory add … --workflow <ref> [--step <key>]` links the
element it adds to a step (§4.8), which is explicit and survives concurrent instances:
- `<ref>` resolves to an open instance (§3.3); `--step` selects a frontier step whose phase declares
  `memory.add(type: T)` for the `--type` given; without `--step`, the one such frontier step of the
  instance. None: `no step of <instance> adds a <type>` (`CONFLICT`); several: the same refusal
  listing their keys, asking for `--step`.
- The add commit carries the trailers `WingFoil-Instance: <instance-id>` and `WingFoil-Step: <key>`.
- Without `--workflow`, `memory add` is unchanged and links nothing.

### 8. Output shapes

`--format json|yaml` carry these values on stdout (`spec-005` §2); errors follow `spec-005` §3.

```ts
interface Baseline { rev: "HEAD"; commit: string }            // full sha
interface Diagnostic { code: string; severity: "error" | "warning"; file: string; path: string; message: string }  // spec-003 shape
interface ElementRef { type: string; id: string; status: string }
type ScopeRef = { element: ElementRef } | { item: { collection: string; key: string } };
interface Member { name: string; email: string }
interface Instance {
  id: string; workflow: string; element: ElementRef | null; context: ElementRef | null;
  created: ElementRef[]; planStatus: "draft" | "active"; startCommit: string;
  active: boolean; abandoned: boolean;
}
interface TrailEntry { workflow: string; phase: string; scope: ScopeRef | null }
interface ActionView {
  token: string; text: string; unresolved: string[];
  target: "bound" | "selection" | "created" | "run" | "none";
  binding: { kind: "wingfoil" | "command" | "agent" | "manual" | "unbound";
             argv?: string[]; expectedCommit?: string };
}
interface CheckView { token: string; binding: ActionView["binding"]; evaluated: false }
type Awaiting =
  | { kind: "approval"; byRole?: string; byPerson?: string; elements: ElementRef[]; recordNeeded: boolean;
      routedTo: Member[]; routingError?: string }
  | { kind: "party"; party: string; evidence: CheckView };
type EvidenceKind = "state" | "created" | "produces" | "selection" | "include" | "awaits" | "record";
interface Step {
  key: string; instance: string; trail: TrailEntry[]; workflow: string; phase: string;
  scope: ScopeRef | null; role: string | null; agentRole: boolean; members: Member[];
  directives: { id: string; title: string }[];
  actions: ActionView[]; checks: { pre: CheckView[]; post: CheckView[] };
  produces: { pattern: string; owner: string | null; resolved: string[]; exists: boolean; evidence: boolean }[];  // evidence: false for an implicit-owner entry (shown, §4.3) and a created-owned one
  created: ElementRef[];
  evidence: { kinds: EvidenceKind[]; missing: EvidenceKind[]; finalizable: boolean };
  optional: boolean; awaiting: Awaiting | null;
  fallback: { step: string; setState: string | null } | null;
  reentered: boolean; reentryCommit: string | null;
  mode: "fresh"; allowedModes: ("fresh" | "resume" | "reference")[]; distinctFrom: string[];
  cadence: unknown | null;
}
interface NextResult { baseline: Baseline; instance: Instance | null; complete: boolean;
                       next: Step | null; more: Step[]; message?: string; diagnostics: Diagnostic[] }
interface PhaseProgress { phase: string; state: "complete" | "current" | "pending" | "skipped";
                          vacuous?: boolean;
                          iterations?: { eligible: number; entered: number; complete: number; late: number; note?: string } }
interface PendingApproval { step: string | null; instance: string | null; trail: TrailEntry[];
                            awaiting: Extract<Awaiting, { kind: "approval" }> }
interface StatusResult { baseline: Baseline; active: string | null;
                         open: { instance: Instance; complete: boolean; phases: PhaseProgress[]; frontier: Step[];
                                 late: ElementRef[] }[];
                         pendingApprovals: PendingApproval[]; ungated: ElementRef[];
                         message?: string; diagnostics: Diagnostic[] }
interface StartResult    { baseline: Baseline; instance: Instance; next: Step | null; commits: string[] }
interface EndResult      { baseline: Baseline; ended: Instance; active: Instance | null; commit: string }
interface FinalizeResult { baseline: Baseline; instance: Instance; finalized: Step; next: Step | null; commit: string }
interface ListResult     { baseline: Baseline; workflows: { name: string; startable: boolean; includable: boolean;
                           description: string | null; executableNow: boolean }[]; message?: string; diagnostics: Diagnostic[] }
```

`show` returns the resolved declaration of §7.6 with the `Baseline` and `diagnostics`. Console
rendering is free-form (`spec-005` §2) but always prints, for `next`, the step's key, trail, role,
scope, the actions with their bindings, the directive ids and any "human needed" line (§5.3);
`dl-043`'s generic console renderer is v0.4 scope.

### 9. Core API and MCP exposure

These rows implement `spec-006` §3's planned Workflow rows, add `workflowFinalize` (ruling R11), and
reconcile `workflowList` in place.

| function | module | mutates | CLI | MCP (production server) |
|---|---|---|---|---|
| `workflowStart` | `workflow` | true | `wingfoil workflow start` | Tool `workflow.start` *(v0.4, P5.2.3)* |
| `workflowEnd` | `workflow` | true | `wingfoil workflow end` | Tool `workflow.end` *(v0.4)* |
| `workflowNext` | `workflow` | false | `wingfoil workflow next` | Resource `wingfoil://workflows/-/next` (the active instance) — v0.3, ruling R12 |
| `workflowStatus` | `workflow` | false | `wingfoil workflow status` | Resource `wingfoil://workflows/-/status` — v0.3, ruling R12 |
| `workflowFinalize` | `workflow` | true | `wingfoil workflow finalize` | Tool `workflow.finalize` *(v0.4)* |
| `workflowList` | `workflow` | false | `wingfoil workflow list` | the shipped `wingfoil://workflows` keeps its payload in v0.3 (below) |
| `workflowShow` | `workflow` | false | `wingfoil workflow show` | the shipped `wingfoil://workflows/{name}` keeps its payload in v0.3 (below) |
| `workflowCreate` | `workflow` | true | `wingfoil workflow create` | Tool `workflow.create` *(v0.4)* |
| `workflowRemove` | `workflow` | true | `wingfoil workflow remove` | Tool `workflow.remove` *(v0.4)* |

**The two v0.3 Resources** (ruling R12) extend the already-shipping `wingfoil://workflows…` family
(`src/mcp/workflow-resource.ts:34-37`) without colliding with `wingfoil://workflows/{name}`: their
second segment is `-`, which no workflow name can be (`spec-003` names start with a letter), and they
have a third segment, which the single-segment `{name}` template never matches. A workflow named
`next` or `status` stays `wingfoil://workflows/next` / `wingfoil://workflows/status`. The payloads are
`NextResult` and `StatusResult`, read at `HEAD` (§1.1, ruling R15). Because the production server serves
only `registerReadOnlyResources` (`src/mcp/server.ts:19-26`), both are registered there, next to
`registerWorkflowResources`, with the same read-only refusal. Unifying the workflow URIs with
`spec-006`'s `wingfoil://workflow/…` form is `dl-040`'s (v0.4).

**The two shipped Resources are unchanged in v0.3**: `wingfoil://workflows` and
`wingfoil://workflows/{name}` keep their payload and their working-tree baseline (`spec-006` §6
item 4), so v0.3 introduces no breaking change on the MCP surface; aligning them with `ListResult` and
`show`'s view belongs with the URI unification (`dl-040`, v0.4). The mutating operations' Tools arrive
with P5.2.3 (v0.4); the production server serves no Tool today.

### 10. Errors and exit codes (REQ-INT-04, `spec-005` §1, `spec-008` §5)

| Case | Message | `CoreError.code` | Exit |
|---|---|---|---|
| any `spec-003` error | the first error's message, in `spec-003`'s order; every diagnostic in `details` | `VALIDATION` | 1 |
| unknown workflow name (`start`, `show`, `remove`, a name `<ref>`) | `unknown workflow: <name>` | `NOT_FOUND` | 1 |
| not startable | `cannot start a sub workflow directly: <name>` | `VALIDATION` | 1 |
| no `plan` type in `memory.yaml` | `memory type 'plan' is not declared in memory.yaml; workflow start records an instance as a plan element` | `VALIDATION` | 1 |
| element required and absent | `workflow '<name>' needs a <type> element: give --element <type>:<id>` | `VALIDATION` | 1 |
| element not found at `HEAD` | `element not found: <type>:<id>` | `NOT_FOUND` | 1 |
| `--set phase=` collides (`start`) | `plan id already exists: <id>` | `CONFLICT` | 1 |
| second `start` commit failed | `plan <id> was added but not submitted: run wingfoil memory submit <id>` | as the failure | 1 |
| no open instance (`end`) | `no active workflow to end` | `NOT_FOUND` | 1 |
| `<ref>` names no open instance | `workflow is not open: <ref>` | `NOT_FOUND` | 1 |
| plan in `draft` at `end` | `workflow '<name>' was not submitted: run wingfoil memory submit <id>` | `INVALID_TRANSITION` | 1 |
| incomplete at `end` | `workflow '<name>' is not complete: current step <key>` | `CONFLICT` | 1 |
| step not on the frontier (`finalize`) | `step '<key>' is not on the frontier of <instance>` | `CONFLICT` | 1 |
| step has deducible evidence (`finalize`) | `phase '<workflow>.<phase>' completes from its evidence: <kinds>` | `CONFLICT` | 1 |
| approval phase without authority (`finalize`) | the message `memory approve` gives (REQ-SEC-03) | as today | 1 |
| approval phase without `--reason`, or a blank or malformed one (`finalize`) | `spec-008` / `dl-067` reason messages | — | 2 |
| duplicate name (`create`) | `workflow already exists: <name>` | `CONFLICT` | 1 |
| built-in (`remove`) | `built-in workflows cannot be removed` | `VALIDATION` | 1 |
| included elsewhere (`remove`) | `cannot remove '<name>': included by '<referrer>'` | `CONFLICT` | 1 |
| open instance (`remove`) | `cannot remove '<name>': open instance <id>` | `CONFLICT` | 1 |
| dirty write target, missing git identity | the existing messages of `write-guard.ts` and REQ-SEC-01 | as today | 1 |
| missing `<name>`; malformed `--element` (`spec-008` §7); invalid `<name>` syntax; `--kind` with `--startable`/`--includable`; `create` with neither; unknown flag | `spec-008` §2/§5 messages | — | 2 |

`next`, `status`, `list` and `show` exit `0` for every deduced outcome and `1` only for a `spec-003`
error or an unresolvable `<ref>`/name (`spec-005` §1's read-only rule).

### 11. Command baseline

| Operation | Gating reads (at `HEAD`) | Reads on the filesystem | Writes (guarded by `requireUnmodifiedTarget`) |
|---|---|---|---|
| `start` | registry, `memory.yaml`, `dna.yaml`, the element, existing plans (id collision, `dl-101`) | — | the new plan file (two commits) |
| `end` | registry, the plan, deduction | — | the plan file |
| `finalize` | registry, deduction, `dna.yaml` (authority) | — | nothing (an empty commit) |
| `create` | registry (name uniqueness) | target file existence (`dl-086`) | the new file, `workflows.yaml` |
| `remove` | registry, referrers, open instances | — | the removed file, `workflows.yaml` |
| `memory add --workflow` (§7.10) | deduction of the named instance | — | as `memory add` |
| `next` | everything, at `HEAD` (§1.1, gating) | working-tree diff, for `W_UNCOMMITTED_INPUTS` only | — |
| `status`, `list`, `show`, the two Resources | everything, at `HEAD` (§1.1, declared exception, ruling R15) | working-tree diff, for `W_UNCOMMITTED_INPUTS` only | — |

### 12. Conformance of this repository

The minor-v0.3 criterion "load … with zero errors" is measured by running `workflow list --all` and
`workflow show` on each workflow at the release's `HEAD`, and requires zero `spec-003` **errors**;
warnings are reported and counted.

**Method.** Measured at `997e8998` (branch `design/release_planning_v0.3`; `git diff --stat 35a4c044
997e8998 -- .wingfoil src` is empty, so the drafts' earlier citations still hold). The files were
read with `git show 997e8998:.wingfoil/<path>`, and `spec-003`'s diagnostics table, §3.4 and §4.2–§5.1
were applied to them statically by a script written for this review (not part of the repository; the
characterization test below is its repository-side replacement). `npm run -s wingfoil -- workflow
list --format json` with the pinned build 0.2.2 loads the same 23 workflows and 85 phases, exit `0`.

**Load-time diagnostics** (`spec-003` table): **1 error, 103 warnings.**
- Error: `E_PHASE_PRODUCES_NOT_A_PATH` on `retrospective.explore`
  (`.wingfoil/workflows/custom/retrospective.yaml:23`, "retrospective friction inventory
  (source-cited, grouped by theme)"). **The criterion fails at `997e8998`** until the
  workflow-alignment task gives the phase a path (`dl-104` Action 2).
- `W_WORKFLOW_UNBOUND_TOKEN` × 90: 17 action occurrences of 13 distinct tokens (`npm.pin_advance`,
  `git.create_branch`, `git.create_worktree`, `tests.bdd.run`, `git.merge`, `git.remove_worktree`,
  `cli.run` in three `e2e-smoke` phases, `git.commit` in two phases, `git.tag`,
  `approver.execute`) and 73 check entries — no `bindings.yaml` exists.
- `W_PHASE_PRODUCES_OWNER_IMPLICIT` × 9: `initial-design.seed-releases|seed-adrs|seed-dls|seed-specs`
  (`initial-design.yaml:33,46,60,77`), `release-line-cycle.plan-next-release-line` (`:50`),
  `release-planning.record-adrs|identify-specs|build-backlog` (`release-planning.yaml:80,98,125`),
  `dev-loop.design` (`dev-loop.yaml:54`).
- `W_PHASE_TOKEN_OUT_OF_SCOPE` × 2: `release-planning.yaml:118,120` (`build-backlog`'s third and fifth
  actions; `:123,125` at `4fd77678`; `{dl.id}` names no Memory type;
  no enclosing scope is a `bug` for `{bug.id}`).
- `W_PHASE_ACTION_UNTARGETED` × 1: `end-of-life.deprecate` (`end-of-life.yaml:25`).
- `W_PHASE_FALLBACK_NOT_REENTRANT` × 1: `bug-ingest.triage` (bug `open` rejects to `closed`, forward;
  `bug-ingest.yaml:30`).
- No other code fires: every `include` resolves to an includable workflow, no cycle, every
  `fallback.step` exists, every name matches the class and none is `adhoc`, every `role`/`by_role` is
  one of `dna.yaml`'s eight roles, every type is a `memory.yaml` type, every include is
  element-compatible, both selections declare `type`, no exit state is undetermined, and every
  `fallback.set_state` equals its reject target.

**Consequence for deduction** (§3.4, §4, §5.1).
- *Self-creating instances:* `sw-life-cycle` (`release-line`), `bug-ingest`, `decision-log-ingest`,
  `adr-ingest`, `service-ingest` bind the element their creating phase creates, so their capture,
  approve and triage phases deduce from it and each instance can end.
- *Checkpoints:* 28 phases declare no evidence and complete by `workflow finalize`: the 11 phases of
  `user-story-mapping`, `specification-by-examples`, `volere-requirements` and `backlog-export`;
  `release-planning.advance-pinned-build`; `dev-loop.red|green|refactor`;
  `user-docs.check-implementation-complete`; the four `e2e-smoke` phases;
  `release-submit.pre-release-checks|approve-release`; `release-publishing.tag|publish`;
  `retrospective.additional-points|approve`; `end-of-life.deprecate|archive`. So a `sw-life-cycle`
  instance passes `specification` only by finalizing those 11 steps, and `dev-loop` passes
  `red`/`green`/`refactor` by one `finalize` each.
- *Approvals recorded by `finalize` with approver authority* (no element carried, §5.1): 7 phases,
  listed in §5.1. The other 13 approval phases are carried by Memory: `bug-ingest.triage`, the three
  ingest `approve` phases, `release-line-cycle.approve`, `release-planning.triage-bugs|
  reconcile-governance|record-adrs|identify-specs|commit-backlog`, `dev-loop.design|review`,
  `end-of-life.announce`.
- *Implicit owners:* `{id}` in a phase that adds an element is ambiguous until the entry takes
  `dl-104` D3's `{ type, path }` form. Until the alignment task rewrote the nine entries (`task-199`,
  below), they were not evidence (§4.3): `dev-loop.design`, `release-planning.record-adrs|identify-specs|build-backlog`
  and the four `initial-design` seeds complete through their `created` evidence (or, having created
  nothing, through `finalize`), and `plan-next-release-line` through its `state` evidence
  (release-line `done`). Read with D3's default instead, `dev-loop.design`'s pattern would name a
  task-named spec that never exists (dev-loop would stop at `design`) and `plan-next-release-line`'s
  the release-line's own file (satisfied from the start); `build-backlog`'s `{release}` is a field the
  release template does not declare.
- *Instances today.* Under §3, the only open instance at `997e8998` is
  `service-ingest-rel-v0.3-listings-plan` (`status: active`, `workflow: service-ingest`);
  `release-planning-rel-v0.3-plan` is a plan of a sub and is not an instance. It was started by hand,
  so no add commit carries its linkage trailers (`git log --format='%(trailers:key=WingFoil-Instance)'`
  prints none in the whole history): its frontier is `service-ingest.capture` with `element: null`,
  and it cannot be ended by `workflow end`. It is closed the way it was opened, by hand
  (`wf(plan): finalize`, as the 20 practised commits do), before the v0.3 commands ship; the three
  services it captured (`svc-010`…`svc-012`, e.g. `e284968b wf(service): submit
  svc-010-github-release-v0.2.1`) also show that practice captures several elements per ingest
  instance, where §3.4 binds one (ruling R16): under the v0.3 commands each is its own instance, or
  is added without `--workflow`. No `sw-life-cycle` instance exists until someone starts one.

**Re-measured after the alignment** (`task-199`, at its `HEAD`, through `loadWorkflowRegistryAtHead`
— the loader and the core checks at one commit). The configuration is 24 workflows and 87 phases:
`agent-docs` (one phase, `align-agent-docs`, `dl-025`) is new, and `release-line-cycle` includes it
before `plan-next-release-line`.
- Load-time diagnostics: **0 errors, 61 warnings**, every one a `W_WORKFLOW_UNBOUND_TOKEN` on a
  check that no command asserts yet (`frontmatter.required: […]` × 17, `spec-review.passed` × 4, the
  specification-phase quality criteria × 12, the release-state queries × 4, …; the task's Execution
  Notes give each a reason). Every action token resolves, built in or through the first
  `workflows/bindings.yaml`. The nine implicit owners take the `{ type, path }` form, the two
  out-of-scope tokens are rewritten against `build-backlog`'s selection (§4.1),
  `end-of-life.deprecate` selects what it deprecates, and `bug-ingest.triage` has no fallback (§5.2).
- *A selection that never empties:* `build-backlog`'s selection matches its `ready` decision-logs
  after the phase too (a decision-log stays `ready`, `dl-017`, and keeps its `release`), so its
  `selection` evidence is never satisfied on its own. The phase completes through §4.7 once
  `commit-backlog`'s `state` evidence holds (the release `in-development`); until then `status` and
  `next` show `build-backlog` on the frontier (approver ruling 2026-10-07, `task-199` review).
- *Late decision-logs (known consequence, approver ruling at `task-202`'s review):* because
  `build-backlog`'s selection never empties, an instance whose release passed `commit-backlog` lists every
  matching `ready` decision-log in its `late` (§4.7) — on this repository 124 late elements, 87 of them
  `ready` decision-logs (reviewer's probe, `task-202` review) — until `dl-160`'s actions (post-v0.3) let a
  decision-log leave the selection.
- *Instances started mid-release:* records before an instance's start commit do not count (§4.8), so an
  instance started after some tasks are done puts each done task's record checkpoints (`dev-loop.red|green|
  refactor`) back on the frontier (§4.9) unless the task's state evidence completes the sub.
- *Checkpoints:* 27 phases — the 28 above less `end-of-life.deprecate`, whose selection (the closing
  release-line's releases not yet released) is evidence.
  `retrospective.approve` stays one: its `decision-log.set_state(ready)` acts on the decision-log
  `capture` created (§4.2), which none of §4.3's kinds observes, so it completes by `workflow
  finalize` once the decision-log is approved.
- *Approvals recorded by `finalize` with approver authority:* 6 phases, listed in §5.1 —
  `retrospective.approve` now carries its decision-log, and `align-agent-docs` lives in `agent-docs`.
- *Implicit owners, rewritten:* `dev-loop.design`'s entry is `{ type: tech-spec, path:
  ".../{tech-spec.id}.md" }`, so it names the specs the step creates, never a task-named file;
  `plan-next-release-line`'s is `{ type: release-line, path: ".../{release-line.id}.md" }`, the
  release-line the step creates, never the iterated one's own file; `build-backlog`'s owner is the
  task, whose `release` field the template declares (`{task.release}`); `seed-releases` files under
  `rl-{release-line.version}/` (`bug-224`).

The pinned build 0.2.2 no longer loads the workflow files: its schema reads a `produces` entry as a
string only, so `workflow list` exits `1` on the four `{ type, path }` entries of `initial-design.yaml`
(`E_VALIDATION`), and the `.mcp.json` server of the same build fails `wingfoil://workflows`; the
measurement above is the code build's, and the pinned build reads the workflows again once
`advance-pinned-build` moves the pin past 0.2.2.

`test/core/workflow-repository-conformance.test.ts` pins these figures against the committed
configuration (zero errors, the exact warning set, the two phase lists, the `{ type, path }` owners),
so a regression in either the files or the loader is caught.

### 13. Open questions

**Settled at this revision** (review recommendation or approver ruling):
- *OQ-1, where an open main is recorded:* a `plan` element with a new optional `parent` field (§3.1),
  together with §3.4's binding and §7.1's add-then-submit, which make every started instance endable.
- *OQ-2, positional names:* positional `<ref>` on every workflow command, no `--name` alias (§7);
  BDD and REQ-STATE-03 amended (Consequences).
- *OQ-3, recording a checkpoint:* `workflow finalize` (ruling R11, §7.9).
- *OQ-4, `end` on an incomplete instance:* refused (§7.2); P4.3 fixtures use complete instances.
- *OQ-5, `by_person` and non-approver roles:* `approval: { by_role } | { by_person }` in `spec-003`;
  authority stays with `approver`, flagged by `W_APPROVAL_ROLE_WITHOUT_AUTHORITY` (§5.1).
- *OQ-6, "no workflows defined":* an absent manifest is an empty registry (`spec-003` Layer 1).
- *OQ-7, notification delivery:* CLI output in v0.3, hooks and the rest in v0.4 (ruling R13, §5.3).
- *OQ-8, `remove` with an open instance:* refused (§7.8); P4.9 gains a scenario.
- *OQ-9, `where` on a non-iterating phase:* a selection, named in `spec-003` from `dl-016` (§4.2).
- *OQ-10, `HEAD` for `status`, `list`, `show` and the two Resources:* Resolved: R15 (approver ruling,
  2026-09-30, `release-planning-rel-v0.3-plan`) — a declared exception to `dl-084` (A), `spec-006` §6
  item 4 and the `command-baseline` directive's *Consequences already decided* bullet "A read that gates nothing keeps reporting the working tree", with `W_UNCOMMITTED_INPUTS` covering the run-log paths too
  (§1.1, §1.2, §11). The rejected alternative, the working tree for those commands, would let
  `workflow status` and `workflow next` / `agent execute --next` disagree whenever the tree is dirty.
- *OQ-11, how a created element is tied to its step:* Resolved: R16 — the `WingFoil-Instance` /
  `WingFoil-Step` trailers written by `memory add --workflow <ref> [--step <key>]` (§4.8, §7.10); one
  bound element per self-creating instance, further elements listed but not bound (§3.4). The
  rejected alternatives: binding the first element of type `T` added after the start commit (two open
  ingest instances, or a hand-made add, bind the wrong element), and recording the element in the
  plan's frontmatter after the fact (a second commit on the plan per element).
- *OQ-12, default plan tokens at `start`:* Resolved: R18 — `phase` = the bound (or context) element's
  id, else `1`, with a collision suffix; `scope` = the workflow name (§7.1). The rejected alternative,
  a per-project `scope` rule in `memory.yaml`'s `plan` type, would have been a `spec-001` change.

**Open:** none.

## Consequences

- **Depends on this spec:** the agent-adapter spec (`spec-016`: `agent execute --next` takes
  `NextResult.next` and `--workflow <ref>` is §3.3's selector; P5.3.1's `no next step to execute` maps
  from `next: null`); `dl-135`'s `agent list --waiting` (every step of `StatusResult.open[].frontier`
  whose `agentRole` is true, in §1.3's frontier order); the build-backlog tasks for P4.2–P4.9,
  P4.13–P4.16, `bug-144`, `bug-145`, and the workflow-alignment task (§12, `spec-003` Consequences),
  which is a precondition of running `release-cycle` end to end.
- **Changes other documents must receive**, each through its own owner and carried to a task:
  - `spec-003`: revised in the same review (ruling R14) — nothing further.
  - `spec-004` §4.1: its `workflow.next` row reads "advances/reads active step" as a Tool
    (`spec-004:159`), but in v0.3 `workflowNext` is `mutates: false` and a Resource; the row moves to
    v1.0's step advancement.
  - `spec-004` §2.1: the URI scheme gains `wingfoil://workflows/-/next` and
    `wingfoil://workflows/-/status` (ruling R12), with the non-collision rule of §9 (a `-` second
    segment, which no workflow name can be), in the v0.3 task that registers them; the unification of
    the `workflows`/`workflow` families stays with `dl-040` (v0.4).
  - `spec-006` §6: the sentence declaring the `HEAD`-read exception of §1.1 for `workflow
    status|list|show` (and `next`, which item 1 already covers), `agent list|show` and the two v0.3 workflow Resources (ruling R15), in the
    implementing task.
  - `spec-006` §3: a `workflowFinalize` row; `workflowNext` / `workflowStatus` served in v0.3 as
    `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status` (ruling R12); `workflowList` /
    `workflowShow` note the shipped `wingfoil://workflows…` Resources, unchanged until `dl-040`; every
    workflow Tool *(v0.4)*.
  - `spec-008` §1/§7: the `workflow` grammar of §7, `--element` on `workflow start`, `memory add
    --workflow <ref> [--step <key>]` (§7.10) and `agent execute --step <key>` (§6.1, `spec-016` §3.1),
    both ruling R16, in a task.
  - `memory.yaml` / plan template: the optional `parent` field (§3.1); `src/storage/templates.ts`:
    the `plan` type in `wingfoil init`'s scaffold, which it does not declare today
    (`src/storage/templates.ts:171`).
  - `dl-079`'s declared list: nothing for this spec's Memory commits (`wf(plan): add|submit|finalize`
    are listed). The configuration subjects `wf(workflow): create|remove` join `wf(directive): …` as
    non-Memory `wf()` scopes the `dl-079` task declares so `memory history` ignores them; the phase
    record `workflow: finalize …` is outside `wf()` (`spec-003` verb table, closing paragraph).
  - SARD: REQ-SYS-03's description and REQ-STATE-02 read "from Memory files **and the commit history
    reachable from the commit**" — deduction reads plan start commits (§3.3), linkage, records and
    re-entries (§4.8) from history, which `dl-104` D1 (b) sanctions without amending the SARD;
    recomputability at a fixed commit is unchanged, and no `.wingfoil/state/` exists. REQ-STATE-03's
    `--name` wording becomes the positional `<ref>`. REQ-STATE-07's N is read as §4.6's eligible
    plus entered candidates, and counts collection entries (`dl-104` Action 1).
  - BDD (`docs/02_requirements/02_bdd/features/`):
    - P4.2 / P4.3 / P4.7 / P4.8: `--name <w>` becomes the positional; P4.2 sc. 1's fixture
      workflow either declares no `element` or the step gives `--element` or has an active context;
      P4.3 sc. 1–2 use complete instances, and a scenario covers `end` refusing an incomplete one.
    - P4.9: a scenario for `remove` refused by an open instance.
    - P4.14 sc. 1: "Morgan is recorded as the responsible approver" becomes "reported"; nothing is
      recorded (§5.1).
    - P4.15 sc. 1: holds in v0.3 only because the reject target equals `set_state`; its fixture keeps
      them equal, or it gains a v0.3 note (the engine applies a differing `set_state` from v1.0).
      sc. 2: "keeps its current state" becomes "has the reject target's state". sc. 3: the unknown
      `fallback.step` becomes a `workflow list` validation failure, not a refused reject (§5.2).
    - X1.1: the Background's "notifications enabled" and sc. 3 (delivery failure) move to v0.4 with
      the hooks (ruling R13). X1.2: sc. 2 (decision types) moves to v0.4; sc. 3's message
      `no recipient for notification: unrouted role '<role>'` becomes P4.14's
      `no approver found for role '<role>' in dna.yaml` in v0.3 (§5.1), or is kept for the v0.4
      delivery.
  - `docs/01_vision/X_cli-cmds.md` (`:163-170`): `workflow status --filter STATUS` is dropped (the
    output is the full status); `workflow remove --verify-includes` is dropped (the check always
    runs); interactive creation (`:169`) is not in v0.3; `workflow list` shows startable/includable,
    not `kind`; `workflow finalize` and `memory add --workflow` are added.
  - `docs/01_vision/06_features.md`: `dl-109` Action 3 (the P4.2 / P4.6 descriptions for startable and
    includable); P4.8's "interactive" (`:87`) marked post-v0.3.
  - `docs/cli-reference.md`: one entry per new command (`test/docs/cli-reference.test.ts` enforces
    it), with the baseline each reads (`dl-084` (A)).
- **Breaking change:** `workflow list`'s CLI payload changes from the loader result to `ListResult`, and
  its default view narrows to what is executable now (P4.6). The MCP Resources that already ship do
  not change in v0.3 (§9).
- **Revising this spec:** a change to the deduction rules of §3–§5 changes what every consumer reports
  as the next step; it is made here first, then in code, never in a consumer.

## Process Notes

Discovered proactively by `release-planning`'s `identify-specs` for rel-v0.3 (plan step 5): the
workflow commands are the core deliverable of `minor-v0.3` and had only `spec-006`'s planned rows.
Grounded in `src/workflow/schema.ts`, `src/core/loaders.ts`, `src/core/index.ts`, `src/mcp/`, the
committed `.wingfoil/` configuration and the BDD files under
`docs/02_requirements/02_bdd/features/p4-workflow/` and `x1-notification/`, read at `997e8998` on
branch `design/release_planning_v0.3`.

**Revised after the `dl-022` spec review** (same day, before submit): self-creating workflows bind the
element they create (§3.4); `start` adds and submits its plan with derived tokens (§7.1);
approvals are detected on every carrier, and approvals no element carries are recorded (§5.1); the
re-entry rule no longer invalidates the phases before `fallback.step` (§4.8); `dl-104` D1–D5 are
consumed through the `spec-003` revision (ruling R14) — records, `produces` ownership, collections,
`awaits`; `workflow finalize` is the ninth command (R11); the `next`/`status` Resources are served in
v0.3 without touching the shipped ones (R12); hook notifications are v0.4 (R13); load-time
diagnostics and built-in bindings are `spec-003`'s alone. §12 was recomputed from the corrected rules.

**Revised after approver rulings R15–R18** (2026-09-30, `release-planning-rel-v0.3-plan`): OQ-10
(R15), OQ-11 (R16) and OQ-12 (R18) are closed and stated as decided (§1.1, §7.1, §7.10, §13);
`W_UNCOMMITTED_INPUTS` covers the run-log paths (§1.2); the `agent` binding's argv carries
`--step <key>` (§6.1).

Confirming dl-022 pass (2026-09-30): N3, N5, N8, N9 applied.

The §12 figures differ from `dl-104`'s "17 of 81" phases without evidence because that count excluded
phases with any action, while §4.3 counts only actions that yield evidence (a `cli.run` or `git.*`
action yields none), and because the configuration has grown to 85 phases.

Mismatches with the acceptance contracts are all listed under Consequences → BDD, each carried to a
task: the `--name` spelling (P4.2/3/7/8), P4.2 sc. 1's element, P4.3's completeness, P4.9's open
instance, P4.14 sc. 1's "recorded", P4.15 sc. 1–3, and X1.1/X1.2's hook-era scenarios. P4.2's
example workflow `release-cycle` is `kind: main` in the BDD but a sub in this repository; the BDD is
generic and this is not a conflict.

**Revision (2026-10-01) — line-offset citations of the `command-baseline` directive replaced by
section names, per `dl-075-no-bare-line-offsets-in-memory` and `task-161-revise-command-baseline-which-verbs-read-head-filesystem`.**
`task-161` revised the directive to 1.2, which moved every line it had; the `command-baseline.md:<n>`
citations in §1.1, §1.2 and OQ-10 named lines that no longer held the quoted text (they had already drifted with
`task-128`'s 1.1). Each now names the section or bullet it meant. No rule changed. Edited in place
without a supersede or a state change (`dl-047`); recorded with `memory amend`.

**Revision (2026-10-07, `task-199-align-wingfoil-workflows-custom-v0-3-schema-commands`) — this
repository's workflows aligned; a selection's types in scope.** §4.1 gains the rule the workflow
alignment needed to rewrite `release-planning.build-backlog`'s `{dl.id}` / `{bug.id}` "against a
selection" (`spec-003` Consequences): in an action argument of a selecting phase, `{T.<field>}` names
each selected element of type `T`; `spec-003`'s `W_PHASE_TOKEN_OUT_OF_SCOPE` row follows. §12 is
re-measured after the alignment (zero errors, 61 unbound checks, 27 checkpoints, 6 approvals
recorded by `finalize`; `build-backlog`'s selection never empties and the phase completes through
§4.7; the pinned build 0.2.2 no longer loads the workflow files), §5.1's list and §4.2's untargeted example follow it, §5.2 records that
`bug-ingest.triage` no longer declares a fallback, and §2 no longer names `roles.yaml` among the core
checks' inputs (`spec-003` § "Where each check runs", task-194). The two out-of-scope citations of §12
gain the phase they named and their offsets at `4fd77678`; `dev-loop.done`'s fallback is cited by key
(`dl-075` (A), fix on touch). No command contract, code or diagnostic changes. Edited in place without
a supersede or a state change (`dl-047`); pending the approver's `memory amend` at `task-199`'s review.

**Revision (2026-10-07, `task-198-deduce-workflow-instances-phase-evidence-frontier-memory-head`) — three readings
the first implementation of the deduction needed, stated here.** §1.4 names every `W_MEMORY_UNREADABLE`
reason (no frontmatter, no `type`, an undeclared type, no `id`, no `status`) and leaves out silently a file with
no frontmatter that lies on no type's `path` pattern, so this repository reports exactly the six plans §1.4
counts and not the top-level `X_*` plans `dl-019` grandfathers; it also says how a `path` token matches
(a file-name token one name, a directory token one or more directories). §4.9 says that an instance whose
workflow the registry does not load is `complete: false` although its frontier is empty. §8's `produces`
entry gains `evidence: boolean`, which tells an entry that is shown but is not evidence (§4.3) from one of a
workflow with no element (both have `owner: null`). No deduction rule changed. Edited in place without a
supersede or a state change (`dl-047`); recorded with `memory amend`.

**Revision (2026-10-09, `task-203-read-instance-history-walk-step-linkage-created-elements`) — §4.8's
"newer" and the walk's bound, per the approver's rulings on task-203's review findings F1 and F3, both
option (a).** "Newer than the re-entry commit" is now defined by ancestry: the evidence commit is a
strict descendant of the re-entry commit, read from the walk's parent links. It is no longer read from
the commit date or the `--topo-order` position, which put a record made on a branch that never saw the
reject after it or before it depending on the merge's parent order. The Cost paragraph now bounds the
single union walk by the octopus merge base of the open instances' start commits. It is no longer bounded
by the oldest start, which dropped a younger instance's commits made on another branch before that
start. One `git merge-base` spawn is added; nothing else scales with the full history. No other
deduction rule changed. Edited in place without a supersede or a state change (`dl-047`); pending the
approver's `memory amend` at task-203's review.

**Revision (2026-10-09, `task-202-deduce-iterate-over-over-memory-types-collections-live`) — readings the
`iterate_over`, live-query, optional and archived rules needed, and rules added.** Readings: §4.6, a candidate
is eligible when it matches the entry filter and no phase of the sub before the sub's current phase is
complete other than vacuously, and entered once such a phase is complete; the note
and vacuous completion apply when no candidate is eligible, entered or complete (an empty scope filter makes
every element of the type a candidate, so "zero candidates" alone would never hold for P4.16 sc. 3); an
unresolved `where` token leaves the phase one unexpanded step. §1.3, an id the `{n}` pattern does not match
iterates after every one it does. §4.7, which candidates are late, how they are counted and listed, and which
completions are vacuous. §4.10, the frontier of an optional current phase also carries the following phases up
to the next non-optional one. Rules added: §4.3 and §4.11, a selection never matches an archived element;
§4.9 and §4.11, an abandoned instance has no phase progress and is reported `complete: false`; §4.11, an
instance whose self-bound element is archived is abandoned, and a later linked element does not rebind it; §4.8, an
`iterate_over` phase does not hand its re-entry cutoff to its iterations, each element having its own
re-entries (approver ruling 2026-10-09), while a plain `include` passes it to its sub. §12 records two
known consequences: the late `ready` decision-logs of `build-backlog`'s selection (until `dl-160`) and the
record checkpoints an instance started mid-release reports again. Edited in place without a supersede or a
state change (`dl-047`); pending the approver's `memory amend` at `task-202`'s review.
