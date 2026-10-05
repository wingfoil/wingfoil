---
id: spec-001-memory-yaml-schema
type: tech-spec
title: "memory.yaml schema (MemoryYaml): sequence/gates/waiting state machines"
status: approved
scope: ".wingfoil/memory.yaml"
supersedes: ""
tmpl_version: 260703   # Orignal template version
---

## Context

`memory.yaml` is the **Project Memory type registry** (feature **P1.13**). It declares every Memory
element type — `release-line, release, task, adr, decision-log, tech-spec, bug, plan, service` (the
eighth, `plan`, added by `dl-019-plans-as-memory-element`; the ninth, `service`, by
`dl-088-a-memory-type-for-state-that-lives-outside-the-repository`, in `memory.yaml` since 1.6,
`task-124-the-service-memory-type`) — giving each a path
pattern, an id pattern, human metadata, a template scaffold, and a state machine. It is consumed by
every `wingfoil memory *` command (add/submit/approve/reject/deprecate/show/search/history), by the
Workflow pillar (to resolve `element:` type declarations), by the ID-generation engine (reads
`id_pattern` + `path`), and by the state-machine validator that enforces **REQ-STATE-01** (every
transition validated against the type's declared machine).

The file exists today (authoritative under `.wingfoil/memory.yaml`), but it declares each
type's lifecycle with a **`transitions: {state: [target, ...]}` dict-of-arrays**. That shape is
**structurally ambiguous**: when a state lists two legal targets (e.g. the current default machine's
`pending: [ approved, rejected ]`, or the current `task`'s `in-review: [ approved, in-progress ]`),
nothing in the schema says which target is the `approve` outcome and which is the `reject` outcome.
Today that disambiguation is delegated out to Workflow-step declarations, so the same lifecycle cannot
be validated from `memory.yaml` alone — and two agents can read the same graph and drive `reject` to
different states. This spec fixes the ambiguity **inside the schema** by replacing `transitions` with a
`sequence` / `gates` / `waiting` triple. Every type/path/id_pattern below is unchanged from the current
file; **only the state-machine encoding changes.**

## Specification

### Top-level shape

```yaml
version: 1.0            # config-file format version — a positive NUMBER (float ok), not a string
defaults:              # optional; applies to any type without its own `states` block (REQ-STATE-08)
  states: <StateMachine>
types:                 # required; one entry per Memory element type
  <type-name>: <MemoryTypeEntry>
```

TypeScript / Zod (all objects `.passthrough()` — unknown fields preserved, not fatal, so a newer
file stays readable by an older client):

```ts
const MemoryYaml = z.object({
  version:  z.number().positive(),                 // NOT .int() — 1.0 is written as a float
  defaults: z.object({ states: StateMachine }).optional(),
  types:    z.record(z.string(), MemoryTypeEntry),
}).passthrough();
```

`version` MUST be `z.number().positive()`, **not** `z.number().int()`: the file's `version: 1.0` is a
YAML float and `.int()` would spuriously reject a future `1.1`.
Because it is a number, `version` is compared numerically, and a bump must increase it as a number:
`1.9` is followed by `2.0`, never `1.10`, which YAML reads as `1.1` (`task-168` review).

**Reserved type names.** No key of `types` may be `directive`, `dna` or `workflow`. Those are the
`wf({scope})` scopes that record a change to configuration, not to a Memory element (`spec-008` §2),
and the audit reader skips their commits; a type that took one would have every commit of its own
read as configuration. The list is `RESERVED_TYPE_NAMES` in `src/memory/schema.ts`, which the audit
reader's `CONFIGURATION_SCOPES` is. A reserved name fails validation with
`type name '<name>' is reserved: wf(<name>) commits record configuration, not Memory`
(BDD P1.13, `bug-177`); the loader reports it as `E_VALIDATION`, exit 1, as it reports every other
schema refusal.

### Sub-schema: `StateMachine` — the sequence/gates/waiting format (REPLACES `transitions`)

A type's lifecycle is an **ordered chain** plus two optional annotations — never a free-form graph:

```ts
const StateMachine = z.object({
  sequence: z.array(z.string()).min(1),                          // ordered chain of states
  gates:    z.record(z.string(), z.object({ reject: z.string() })).optional(),
  waiting:  z.array(z.string()).optional(),
}).passthrough();
```

| Field      | Meaning |
|------------|---------|
| `sequence` | The ordered list of states. `sequence[0]` is the state `memory.add` assigns (this replaces the old explicit `initial:` field — the first element *is* the initial state). Each consecutive pair `sequence[i] → sequence[i+1]` is the type's forward edge. |
| `gates`    | `{ <state>: { reject: <target> } }`. Listing a state here means its forward edge is an **approval gate**: the forward move (to the next state in `sequence`) fires only via `wingfoil memory approve`, and `reject` names the explicit target of `wingfoil memory reject`. |
| `waiting`  | States whose forward edge has **no CLI verb at all** — it fires only as a side effect of a Workflow step's `element.set_state(...)` action or an engine trigger (e.g. another element's `supersedes:` field). `submit`/`approve` on a `waiting` state is illegal. |

**Which verb drives each forward edge — fully determined by the schema:**

- state **not** in `gates` and **not** in `waiting` → forward edge fires via `wingfoil memory submit`
  (single legal target: next in `sequence`).
- state in `gates` → forward edge fires via `wingfoil memory approve` (target: next in `sequence`,
  **never written out** — by construction there is exactly one); `reject` target fires via
  `wingfoil memory reject` (**always written explicitly**). When a `gates.<state>.reject` edge fires,
  the document's `rejection_reason` frontmatter field is also set to the `--reason` text (cleared again
  on the next `memory.submit`) — the field itself is defined in `spec-010-memory-frontmatter-schema`
  ("Base fields"); this spec only owns which state the transition lands on.
- state in `waiting` → forward edge has no verb; advanced only by a Workflow action / engine trigger.
- a state MAY be **both** in `waiting` and a key in `gates`: its forward edge is verb-less (picked up
  automatically) while it still exposes a manual `reject`/decline path.

This is why the ambiguity of the old format cannot arise: `approve`'s target is structurally fixed
(next in `sequence`), and `reject`'s target is always spelled out in `gates.<state>.reject`.

**`deprecated` is implicit.** It is a built-in wildcard edge from *any* state to a reserved
`deprecated` state, always legal, invoked via `wingfoil memory deprecate`. It is **never** declared in
`sequence`/`gates`/`waiting`; the literal string `"deprecated"` is reserved and may not appear as a
state name or a `reject` target.

**Semantic validation (post-parse):** every key in `gates` and every entry in `waiting` MUST be a
member of `sequence`. A `gates.<state>.reject` target need **not** be a member of `sequence`: it may
revert into the chain (e.g. `pending: { reject: draft }`) or name an off-chain decline state reached by
no forward edge (e.g. `bug`'s `open: { reject: closed }`). The only universal constraint on any state
name anywhere is that none may be `"deprecated"`. Errors: `E_INVALID_MEMORY_SCHEMA` (Zod shape),
`E_INVALID_STATE_GRAPH` (gate/waiting not in sequence, or `"deprecated"` declared explicitly).

### Sub-schema: `MemoryTypeEntry`

```ts
const MemoryTypeEntry = z.object({
  path:        z.string(),                       // required — document path pattern, contains {id}
  id_pattern:  z.string().optional(),            // ID template; absence ⇒ --id mandatory on add
  name:        z.string().optional(),
  description: z.string().optional(),
  tags:        z.array(z.string()).optional(),
  template:    TemplateConfig.optional(),
  states:      StateMachine.optional(),          // absent ⇒ defaults.states applies (REQ-STATE-08)
  amendable:   z.boolean().optional(),           // absent ⇒ false: `memory amend` refuses the type (dl-108 A3)
}).passthrough();

const TemplateConfig = z.object({
  frontmatter: z.object({
    required:               z.array(z.string()),             // fields enforced on submit (P4.12)
    not_applicable_allowed: z.array(z.string()).optional(),  // required fields that may hold "n/a — <reason>" (dl-124)
    lists:                  z.array(z.string()).optional(),  // required fields whose value is a list; [] is filled there (bug-147)
  }),
  file:        z.string(),                                   // scaffold path, relative to config root
}).passthrough();
```

`path` MAY contain named placeholders **besides** `{id}` (e.g. `task`'s `{release}`,
`release`'s `{release-line}`). Those are resolved by the Workflow pillar from the active
`element:` chain **before** the ID engine runs; the ID engine only ever substitutes `{id}` → `*`.

**`amendable` — which types `memory amend` may correct** (`dl-108` A3, `task-127`). `true` lets
`memory amend` record a content correction on the type's documents in any state, with no state
change (`spec-008` §2, `spec-010` § Field-write ownership). Absent or `false`, the verb refuses the
type at exit `1`. Absent means `false` so that amending is a choice made per type: a type whose
content is a decision, such as `adr`, is corrected by a new element and declares `false` explicitly.
The key is read from the `memory.yaml` committed at `HEAD`, like the state machine (`dl-080` (B)).
There is no `defaults.amendable`: the choice is never inherited.

**`not_applicable_allowed` — which required fields may say "does not apply"** (`dl-124` Q2 (a),
`task-168`). A field listed here may hold the reserved not-applicable value `"n/a — <reason>"`
instead of data, and `memory submit` (and `memory amend` past the initial state) counts it as filled;
the value and how it is read are `spec-010`'s § Validation rules. Absent means no field accepts it.
Semantic validation: every entry must be a member of `required` (`not_applicable_allowed entry
'<field>' is not in template.frontmatter.required`), and `title` may never be listed, since
`spec-010` requires a title of every type.

**`lists` — which required fields take a list** (`bug-147`, `task-168`, approver ruling 2026-10-02).
On a field listed here a list is the field's value, and an explicit `[]` counts as filled: the author
declared "none". On every other required field a list, or a mapping, counts as missing (`spec-010`
§ Validation rules). Absent means no field takes a list. The same two semantic checks as
`not_applicable_allowed` apply: every entry must be a member of `required` (`lists entry '<field>'
is not in template.frontmatter.required`), and `title` may never be listed. The declaration lives here,
not in the scaffold: a scaffold that must not pass a submit untouched leaves the field empty
(`features:`), and nothing in it has to say the field is a list.

### `id_pattern` placeholder notation

An `id_pattern` is a string template: literal characters (which must respect the ID charset
`[a-z0-9\-.]`) plus placeholders expanded by the ID-generation engine.

| Placeholder | Expansion | Source |
|-------------|-----------|--------|
| `{n}`       | Next available integer, no padding (e.g. `12`) | counter algorithm (below) |
| `{n:N}`     | Next available integer, zero-padded to a **minimum** of N digits (`{n:3}` → `001`; overflow past N digits uses natural width) | counter algorithm (below) |
| `{slug}`    | Normalized kebab-case slug from `--slug` or `--title`. A `.` between two alphanumerics is **kept** (`v0.2` → `v0.2`); every other run of characters outside `[a-z0-9]` collapses to `-`. The slugifier and the id validator share this one character rule (`dl-107` S1 (a)) | user input |
| `{version}` | The release-line / release version string (e.g. `v1`, `v0.1`, `v0.2.2`) — used by `release-line` (`rl-{version}`) and `release` (`{kind}-{version}`) | a frontmatter field (below) |
| `{kind}`    | The release kind, `minor` or `patch` — used by `release` (`{kind}-{version}` → `minor-v0.3`, `patch-v0.2.2`; `dl-092` Q1 (A), implemented as `{kind}-{version}` in `92908e8c`; the optional `patch-of` field names the released minor a patch belongs to) | a frontmatter field (below) |
| `{<field>}` | Any other token names a **frontmatter field of the same name**, given to `memory add` on the command line — through an option `spec-008-cli-grammar` defines, in the amendment `dl-107` Action 2 requires (not `--field`, which `spec-008` retired for DNA paths under `dl-082`) — or pinned by the workflow action. `memory add` also writes the value into that field, so the id and the field cannot disagree (`dl-107` S2 (a)) | a frontmatter field |
| `{workflow}`, `{phase}`, `{scope}` | Execution **context** of the workflow that runs the add. The workflow engine fills them; from the CLI they must be given explicitly, as any other `{<field>}` (`dl-107` S2 (c)). Where the type also has a frontmatter field of that name (`plan` requires `workflow` and `phase`), there is one value, not two: the context value is written into the field, as S2 (a) does for any token | workflow engine / user input |
| `{date}`    | Current date `YYYYMMDD` (UTC) | system clock |
| `{author}`  | Slug-normalized git `user.name` | git identity |

Expansion order is fixed — `{date}` → `{author}` → every frontmatter and context token (`{kind}`,
`{version}`, `{<field>}`, `{workflow}`, …) → `{slug}` → `{n}` — so the `{n}` counter regexp always
sees a fully-materialized prefix. A token with no value is an error that names the token; it never
expands to an empty string.

**Per-action override (`dl-107` S3 (a)).** A workflow action may give one add its own pattern, e.g.
`memory.add(type: decision-log, id_pattern: "retro-{release.version}")`, for an id its type's pattern
cannot express. The override is declared in the workflow file, where it is used, and is validated
like any other `id_pattern`. A dotted token such as `{release.version}` reads a field of an element
in the workflow's `element:` chain; that resolution is `dl-090`'s, which `dl-107` names as S3's
prerequisite, and until it lands only undotted tokens are defined. There is no free-form `--id`.

**Counter algorithm (no central ID registry — the repository is the source of truth, consistent with
"state deduced from Memory", REQ-STATE-01/REQ-STATE-02; revised by `dl-101` §2 (a), see the
*Revision (2026-09-30)* note below):**

1. Build a pattern from the type's `path` by replacing `{id}` with the materialized `id_pattern` and
   **every other `path` placeholder with a wildcard** (one or more path segments), whatever value the
   add itself gives it — so a `task`'s counter spans every `docs/04_memory/{release}/` folder, not
   only the release being added to (`bug-162`).
2. Collect the candidate paths from **every baseline a number can be taken on**: the tree of each
   local branch (`refs/heads/*`), of each remote-tracking ref (`refs/remotes/*`) and of `HEAD`, plus
   the working tree as git sees it (the index and the untracked, non-ignored files). No network is
   used: what the remotes hold is what was last fetched (`git fetch` stays the operator's step,
   `dl-101` §1.1).
3. Keep the paths the pattern matches, and from each capture the numeric group at the `{n}`-family
   token's position (`{n}`, `{nn}`, `{nnn}`: the tokens the implementation accepts; `{n:N}`, defined
   in the placeholder table above, is not implemented) (e.g. `docs/04_memory/{release}/{id}.md` with `task-{n}-{slug}` →
   `^docs/04_memory/<any>/task-(\d+)-<slug>\.md$`).
4. `next_n = max(captured) + 1`, defaulting to `1` when nothing matches. The **highest** number, not
   a count, so a gap left by a removed element never reissues a number (`bug-087`); and a maximum is
   independent of the order the refs and paths are enumerated in (REQ-SYS-07).
5. A git read that fails is an error of the add, never an empty answer: a counter that silently saw
   nothing would reissue `1`.

### Worked examples — every current type in the new format

The `defaults` machine and the types below reproduce **exactly** the legal transition set of
`memory.yaml` (1.7: the `dl-123` `triaged`/`planned` reject edges landed with `task-114`, the
`service` type with `task-124`, the `amendable` keys with `task-127`); only the encoding changes (except the deliberate default-machine collapse called
out in Consequences). The first seven were written with this spec; `plan`, `service`, the `release`
id pattern and the two `bug` decline edges were added later (see the *Revision (2026-09-29)* note
below).

```yaml
# DEFAULT machine — was: draft→pending, pending→{approved,rejected}, rejected→draft
defaults:
  states:
    sequence: [ draft, pending, approved ]
    gates:
      pending: { reject: draft }        # reject sends straight back to draft (see Consequences)

types:
  release-line:
    path: "docs/04_memory/planning/{id}.md"
    id_pattern: "rl-{version}"
    amendable: false
    states:
      sequence: [ draft, planning, active, done ]
      gates:
        planning: { reject: draft }     # approve: planning→active · reject: →draft
      waiting: [ active ]               # active→done: fires when every release under it is `released`

  release:
    path: "docs/04_memory/planning/{release-line}/{id}.md"
    id_pattern: "{kind}-{version}"      # dl-092: minor-v0.3, patch-v0.2.2 (ids added earlier are immutable)
    amendable: false
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
      # draft→planning: memory.submit; the rest are workflow-phase transitions (no CLI verb)
      waiting: [ planning, in-development, releasing ]

  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
    amendable: true
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }        # approve: pending→backlog · reject: →draft
        in-review: { reject: in-progress }  # approve: in-review→approved · reject: →in-progress
      waiting: [ backlog, approved ]        # backlog→in-progress (dev-loop starts);
                                            # approved→done (dev-loop finalizes)

  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
    id_pattern: "adr-{n}-{slug}"
    amendable: false   # dl-108 A3: a change to the decision is a new ADR
    states:
      sequence: [ draft, pending, accepted, superseded ]
      gates:
        pending: { reject: draft }      # approve: pending→accepted · reject: →draft
      waiting: [ accepted ]             # accepted→superseded: triggered by a later ADR's `supersedes:`

  decision-log:
    path: "docs/04_memory/design/dls/{id}.md"
    id_pattern: "dl-{n}-{slug}"
    amendable: true
    states:
      sequence: [ draft, in-discussion, ready ]
      gates:
        in-discussion: { reject: draft }  # approve: in-discussion→ready · reject: →draft
      waiting: [ ]                         # `ready` is terminal (record-with-approval, mirrors adr/tech-spec).
                                          # in-develop/done removed per dl-017 (task→DL back-reference never implemented)

  tech-spec:
    path: "docs/04_memory/design/specs/{id}.md"
    id_pattern: "spec-{n}-{slug}"
    amendable: true
    states:
      sequence: [ draft, pending, approved, superseded ]
      gates:
        pending: { reject: draft }      # approve: pending→approved · reject: →draft
      waiting: [ approved ]             # approved→superseded: triggered by a later spec's `supersedes:`

  bug:
    path: "docs/04_memory/bugs/{id}.md"
    id_pattern: "bug-{n}-{slug}"
    amendable: true
    states:
      sequence: [ draft, open, triaged, planned, in-progress, in-review, resolved, closed ]
      gates:
        open:      { reject: closed }        # approve: open→triaged · reject: →closed (wontfix/dup)
        triaged:   { reject: closed }        # dl-123 (A): wontfix after triage · forward edge stays verb-less (waiting)
        planned:   { reject: closed }        # dl-123 (A): wontfix before the fix starts · forward edge stays verb-less (waiting)
        in-review: { reject: in-progress }   # approve: in-review→resolved · reject: reopen →in-progress
        resolved:  { reject: in-progress }   # approve: resolved→closed · reject: reopen →in-progress
      waiting: [ triaged, planned ]          # triaged→planned (release-planning schedules it);
                                             # planned→in-progress (dev-loop starts the fix)

  plan:                                      # dl-019
    path: "docs/05_plans/{scope}/{id}.md"
    id_pattern: "{workflow}-{phase}-plan"
    amendable: true
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]                    # active→done: fires once the phase's produces:/checks hold

  service:                                   # dl-088
    path: "docs/04_memory/services/{id}.md"
    id_pattern: "svc-{n}-{slug}"
    amendable: true
    states:
      sequence: [ draft, pending, active ]
      gates:
        pending: { reject: draft }           # approve: pending→active (the approver ran `verify`) · reject: →draft
      waiting: [ ]                           # `active` is terminal; retirement is memory.deprecate
```

`triaged` and `planned` are the first states in any machine that are **both** in `waiting` and keys
in `gates` — the case the *Which verb drives each forward edge* rules above already allow: the
forward edge stays verb-less, and `reject` is a manual decline to `closed`, behind the same
authority check as every other gate. The ruling lives in the `Reason:` block and in
`rejection_reason`, as for `open → closed`.

Every one of these preserves the file's legal-transition set. Verification for the two
multi-target cases the old graph left ambiguous: old `task in-review: [ approved, in-progress ]` →
`approve`=approved, `reject`=in-progress; old `bug in-review: [ resolved, in-progress ]` →
`approve`=resolved, `reject`=in-progress; old `bug resolved: [ closed, in-progress ]` →
`approve`=closed, `reject`=in-progress; old `bug open: [ triaged, closed ]` → `approve`=triaged,
`reject`=closed. All now unambiguous by construction.

## Consequences

- **DELIBERATE BEHAVIOR CHANGE — the default machine loses its `rejected` state.** The current default
  is a five-value machine `draft → pending → approved/rejected → deprecated` in which `rejected` is a
  **real, frontmatter-visible status** with its own re-open edge (`rejected → draft`). Migrating it to
  `sequence: [draft, pending, approved]` + `gates: { pending: { reject: draft } }` collapses that:
  `memory.reject` from `pending` now writes `status: draft` **directly**, and **no document ever
  records `status: rejected` again.** This is a genuine change to what appears on disk, not a cosmetic
  rename — REQ-STATE-08's wording (`draft → pending → approved/rejected → deprecated`) describes the
  *old* behavior and must be reconciled. The rejection is **not** lost: its reason lives in the `wf(...): reject ...` git commit
  body (approver identity + reason, per P1.7), just no longer as a status value.
- **`adr` and `tech-spec` drop their `rejected` state the same way.** They currently expose an explicit
  `rejected → draft` re-open loop; the new `gates.pending.reject: draft` preserves the re-open (you land
  back on `draft`, ready to resubmit) while removing the intermediate visible `rejected` status —
  identical trade-off to the default machine.
- **`initial:` is retired.** The old machines carried an explicit `initial:` field; the new format
  derives it as `sequence[0]`, so `memory.add`'s starting state is read from the chain head.
- **State can be validated from `memory.yaml` alone.** `approve`/`reject`/`submit` targets are now
  fully determined by the schema, so the validator no longer needs Workflow-step context to know which
  edge a verb takes. Workflow `fallback.set_state` values must be *consistent with* (not independently
  choose) the type's `gates.<state>.reject`.
- **Consumers that must change with this spec:** the state-machine validator (parses
  `sequence`/`gates`/`waiting` instead of `transitions`), the ID engine (unchanged — still reads
  `path` + `id_pattern`), and `memory.yaml` itself (rewritten to this encoding). Any doc citing the
  old `transitions` shape (REQ-STATE-08, the P1.8 BDD) is downstream of this spec.
- **`decision-log`'s worked example follows `dl-012-decision-log-state-machine` as reduced by
  `dl-017-decision-log-remove-delivery-states`.** `dl-012` gave the DL its own machine; `dl-017`
  (approved) removed the `in-develop`/`done` delivery states — the task→DL back-reference they
  presupposed was never implemented — leaving `draft → in-discussion → ready (→ deprecated)`, a
  record-with-approval lifecycle mirroring `adr`/`tech-spec`. The block above reflects the reduced machine.

## Process Notes

Grounded in the current `.wingfoil/memory.yaml` (source of every path, id_pattern, and legal
transition here), `docs/02_requirements/03_sard/03_state-context.md` (REQ-STATE-01/-02/-08), and P1.13.

**Revision (2026-09-29) — the `release` id pattern, the `{kind}` and frontmatter tokens, the slug's
dots, the per-action override, two `bug` decline edges, and the `plan` and `service` types.** Written
in v0.2.2 `release-planning/identify-specs` (`release-planning-rel-v0.2.2-plan` step 5), ahead of the
tasks and configuration changes that implement it:

- **`release`: `id_pattern: "{kind}-{version}"`**, the `{kind}` token and the optional `patch-of`
  field (`dl-092` Q1 (A), approve commit `864d8bdf`). `dl-092` proposed a `patch-{version}` form;
  the `kind` field that lets one pattern serve both is the implementation the approver chose on
  2026-09-29, and `memory.yaml` already carries it (`92908e8c`). The five `minor-*` ids predate it
  and are immutable.
- **Token sources** (`dl-107`, ratified S1 (a), S2 (a)+(c), S3 (a)). The `{version}` row previously
  read "supplied by the workflow or `--version`". No such option existed (`wingfoil memory add --help`
  on `wingfoil@0.2.1` lists `--type`, `--title`, `--tags`), so any token other than `{n}` and `{slug}`
  failed with `missing value for token`. The table now names where each token's value comes from,
  and `{slug}` keeps version dots. Until the `dl-107` task lands, the code still behaves as that
  decision-log's reproduction shows.
- **`bug`: `triaged` and `planned` gain `reject: closed`** (`dl-123` (A)(i), approve commit
  `34fb30c9`). This is a configuration change to `memory.yaml`, and no engine change is needed,
  because the schema already allowed a state to be both `waiting` and gated. Landed in
  `memory.yaml` 1.5 by `task-114-bug-decline-edges-from-triaged-and-planned`.
- **`plan`** (`dl-019`) was missing from the worked examples. Since `dl-019` the Context listed eight
  types while this block showed seven. **`service`** (`dl-088`, route (a) out of flow, state machine
  (a)) is added with it. Its frontmatter fields belong to its template, not to this spec.

Edited in place — no supersede, no state change, and no `version:` bump, because tech-specs carry no
`version:` field (`dl-047`) — per the precedent `spec-015`'s revisions set.

**Revision (2026-09-29, `task-124-the-service-memory-type`) — `service` lands in `memory.yaml`.** The
approver replaced `dl-088`'s route (a), out of flow, with a task in the v0.2.2 dev-loop
(`dev-loop-rel-v0.2.2-plan` §2), so the bullet above that says "route (a) out of flow" describes the
plan of 2026-09-29, not how it landed. `memory.yaml` 1.5 → 1.6 declares `service` exactly as the
worked example above, with `template.file: "memory/templates/service.md"` — relative to the
configuration root, per `TemplateConfig`'s `file` comment and `bug-156` — and not the
`.wingfoil/memory/templates/service.md` spelling `dl-088` quotes. The worked-examples caveat that the
file "has no `service` type" until then, and the matching "`dl-088` caveat" in the verification
paragraph, are removed; the Context's type list now says where `service` is declared. No schema,
field or edge changes. Edited in place, as the revision above; **pending the approver's sign-off at
`task-124`'s review.**

**Revision (2026-09-30, `task-128-allocate-element-ids-highest-number-ref-across-folder`) — the
counter scans every ref and every folder.** `dl-101` (`ready`, direction (a)) replaces "the
filesystem is the source of truth" in the counter algorithm: the number is the highest taken on any
local branch, remote-tracking ref, `HEAD` or the working tree, plus one. Step 1 no longer treats the
other `path` placeholders as literal values: they are wildcards, which is the fix for `bug-162` (a
`task`'s counter restarted at `1` in every `{release}` folder). The code had also never followed the
old step 5: it counted the matching files rather than taking their maximum (`bug-087`). This baseline
reads more than `HEAD`, so it is declared in the `command-baseline` directive (`dl-080`, `dl-101`
Action 3). Remote reservation (`dl-101` §2 (b)) is not part of it. Step 3 names only the `{n}`-family
tokens the code accepts (`{n}`, `{nn}`, `{nnn}`). `{n:N}` stays in the placeholder table, but
`idPatternIssues('task-{n:3}-{slug}')` reports it as a malformed token, a gap that predates this
revision. Edited in place, as the revisions
above, with no `version:` bump (`dl-047`); **pending the approver's sign-off at `task-128`'s review.**

**Revision (2026-10-01, `task-127-add-memory-amend-id-reason-approver-gated-verb`) — the per-type
`amendable` key.** `dl-108` (`ready`) adds `memory amend`, and its A3 leaves the choice of which
types may be amended to the approver, per type, in `memory.yaml`; its Action 2 asks this spec for the
key. `MemoryTypeEntry` gains `amendable: z.boolean().optional()`, absent meaning `false`, described in
the paragraph after the Zod block. The worked examples carry `memory.yaml` 1.7's values, as the approver ruled
at `task-127`'s review (2026-10-01, ruling (a)): `true` for `tech-spec`, `decision-log`, `service`,
`task`, `bug` and `plan`; `false` for `adr` (`dl-108` A3), `release` and `release-line`. The
`wingfoil init` scaffold follows the same rule for the types it declares (ruling (c)). Edited in place, with no `version:` bump
(`dl-047`); pending the approver's sign-off at `task-127`'s review.

**Revision (2026-10-02, `task-168-accept-declared-not-applicable-value-required-fields-explicit`) —
`template.frontmatter.not_applicable_allowed`.** `dl-124` (`ready`; Q1 (A), Q2 (a), Q3 (ii)) lets a
type declare which required fields accept a not-applicable value; its Action 2 asks this spec for the
declaration. `TemplateConfig.frontmatter` gains the optional list, described in the paragraph after
the `amendable` one, with its two semantic checks (a member of `required`; never `title`). At the
approver's ruling of 2026-10-02 (`task-168` re-review, `bug-147`) it also gains `lists`, the required
fields whose value is a list, with the same two checks. This
repository's `memory.yaml` 2.0 declares `not_applicable_allowed: [ pillar, requirements ]` on
`release` (`dl-124` Action 4, approver ruling 2026-10-02), and `lists: [ features ]`. `features` is
not in `not_applicable_allowed`: as a declared list field, an explicit `[]` already says "none"
(`spec-010`). The same commit
moved `version` from 1.9 to 2.0, not 1.10. `version` is a number, compared numerically, and YAML
reads `1.10` as 1.1, below 1.9 (approver ruling, `task-168` review). Edited in
place, with no `version:` bump (`dl-047`); pending the approver's sign-off at `task-168`'s review.

**Revision (2026-10-02, `task-153-reconcile-req-state-08-p1-13-scenario-memory`) — reserved type
names, and the reconciliation § Consequences asked for.** `bug-177`: the paragraph after `version`'s
reserves the three configuration commit scopes as type names. `bug-052`: § Consequences said
REQ-STATE-08's wording "must be reconciled"; REQ-STATE-08 and its P1.13 scenario now name this spec's
default machine, so that bullet records history, not an open debt. `dl-072` (A) + S1: the `wingfoil
init` scaffold keeps the shared `defaults` block and shows a commented per-type `states:` example on
`bug`, which `spec-011` states. No field, edge or worked example changes. Edited in place, with no
`version:` bump (`dl-047`); pending the approver's sign-off at `task-153`'s review.
