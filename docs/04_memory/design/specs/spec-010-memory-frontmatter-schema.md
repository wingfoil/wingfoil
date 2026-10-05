---
id: spec-010-memory-frontmatter-schema
type: tech-spec
title: "Memory document base frontmatter schema"
status: approved
scope: "docs/04_memory/**/*.md frontmatter"
supersedes: ""
tmpl_version: 260703   # Orignal template version
---

## Context

`spec-001-memory-yaml-schema` defines the **type registry** — `memory.yaml`'s `types.*` map, each
type's `path` pattern, `id_pattern`, and per-type `states` machine. This spec sits one layer below
it: it defines the **document-instance contract** — the actual YAML frontmatter block that every
file matching a type's `path` pattern under `docs/04_memory/` carries once
`wingfoil memory add`/`submit`/`approve`/`reject`/`deprecate` has touched it.

Without a single shared base-field definition, every consumer that reads Memory frontmatter
(the state-derivation logic behind REQ-STATE-01/REQ-STATE-02, `wingfoil memory show`/`search`,
the context loader in `spec-012-context-loader-relevance-filtering`, and any future Zod validator
per `spec-009-validation-strategy`) would have to re-derive which fields are common to every
type (`release-line, release, task, adr, decision-log, tech-spec, bug`, then `plan` and `service`)
versus which are
type-specific, and would disagree on where audit history and version bookkeeping live.

**Ground truth, not aspiration.** The scaffold files (seven when this spec was written) under
`.wingfoil/memory/templates/*.md` are the actual current definition of what a freshly
created document of each type looks like — this spec transcribes their common structure. It
deliberately does **not** invent a `wingfoil:` namespace block, a `state_history[]`/`review[]`
audit array, or a per-write incrementing `version` counter — none of those exist in the real
templates.

## Specification

### Zone model

A Memory document instance's frontmatter is **flat YAML** — a single top-level mapping, no nested
namespace block. Two zones, both flat:

1. **Base fields** — present on every type, defined below.
2. **Type-specific fields** — additional flat keys declared by that type's
   `template.frontmatter.required` list in `memory.yaml` (`spec-001`), scaffolded in that type's
   `.wingfoil/memory/templates/{type}.md`.

A `.md` file under a Memory `path` pattern without a `type` key matching a registered
`memory.yaml` type key is not a Memory document for state-derivation purposes.

### Base fields (every type)

| Field          | Type    | Required | Set by                                    | Description / constraints                                                                                                                                                   |
|----------------|---------|----------|--------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`           | string  | yes      | `memory.add` (from the type's `id_pattern`) | Placeholder `"{auto}"` in the raw scaffold before `memory.add` resolves it; thereafter the generated id (e.g. `task-042-implement-cli-grammar`, `adr-004-...`, `rl-v1`). Must match the file stem (`{id}.md`) and the type's `id_pattern` in `memory.yaml`. |
| `type`         | string  | yes      | `memory.add` (fixed by the scaffold used)  | Must be a key registered in `memory.yaml` `types:` (`release-line, release, task, adr, decision-log, tech-spec, bug, plan, service`; `spec-001`).                                                |
| `title`        | string  | yes      | `memory.add` (if the add action sets it) or `memory.submit` | Human-readable title. Empty in the freshly added `draft` scaffold; **must** be filled before `memory.submit` moves the document past `draft` — every type lists `title` in its `template.frontmatter.required` (verified against all seven templates when written; `plan` and `service` list it too). |
| `status`       | string  | yes      | every state transition (`memory.add`/`submit`/`approve`/`reject`/`deprecate`) | Current lifecycle state. The declared rule: `memory.add` sets it to the head of the type's machine — its own `states.sequence`, or `defaults.states.sequence` (the built-in default machine when the file declares no `defaults`) for a type with no machine of its own; `draft` for every type currently declared. (Today `memory.add` writes `draft` literally; aligning it with this rule is tracked separately.) thereafter must be a state of that type's machine (`spec-001`). This is the **only** state carrier — REQ-STATE-01/02: no separate `.wingfoil/state/` index; state is recomputed by reading `status` at a given git commit. |
| `tmpl_version` | integer | yes      | `memory.add` (copied from the scaffold)    | The originating template scaffold's build stamp, `YYMMDD` as an integer (e.g. `260703`). Fixed at creation and **not** touched again by WingFoil — it identifies which revision of `.wingfoil/memory/templates/{type}.md` produced this file, for detecting documents scaffolded from a stale template. It is not a per-write counter (see "No document-version counter" below). |
| `rejection_reason` | string | no (optional) | `memory.reject` (set); `memory.submit` (cleared) | Absent until the document's first `memory.reject`. Set to the exact `--reason` text passed to `wingfoil memory reject` at the same time `status` moves to the type's `gates.<state>.reject` target (`spec-001`). The next `memory.submit` on this document clears it (removes the key from frontmatter) as part of moving `status` forward again — it reflects only the **most recent** reject, not a history. Its presence is therefore itself a signal: a document carrying `rejection_reason` was submitted at least once (had real content) and sent back, distinguishing it from a document still in its first, never-submitted `draft`. This is a convenience mirror of the `Reason:` trailer that `memory.reject`'s commit body already carries (P1.7/REQ-SEC-04) — the commit body remains the authoritative audit-trail record; see "No document-version counter" below for why this does not reopen the door to a fuller in-frontmatter audit trail. |

All type-specific required fields (e.g. `adr.sard_ref`, `task.release`, `release.kind` / `version` /
`pillar` / `features` / `requirements` / `release-line`, `release-line.version`, `bug.severity`)
are out of scope here — they belong to each type's own template and, at the schema-registry level,
to `spec-001`'s `template.frontmatter.required` list per type. This spec guarantees the five required
fields above are present, in that role, on every type, plus the one optional `rejection_reason` field
whose presence/absence is itself meaningful (see its row above).

### Document template shape (what `memory.add` produces)

Every scaffold under `.wingfoil/memory/templates/*.md` follows this shape. The block is an
**example** (task shown; other types differ only in which type-specific keys appear after `status`):
the type-specific keys belong to each type's template and its `template.frontmatter` declaration in
`memory.yaml` (`spec-001`), which are authoritative for them.

```yaml
---
id: "{auto}"           # auto-generated by wingfoil
type: task
title: ""              # REQUIRED — e.g. "Implement git-backed Memory store (REQ-SYS-01)"
status: draft
release: ""            # REQUIRED — target release version, e.g. "v0.1"      <- type-specific
kind: ""               # REQUIRED — feature | fix                           <- type-specific
priority: ""           # optional — high | medium | low                     <- type-specific
tags: []               # optional — additional labels                      <- type-specific
ref: ""                # optional — backlog item ID                        <- type-specific
bug: []                # optional — list of bug ids the task closes        <- type-specific
depends_on: []         # optional — ids of tasks this one depends on       <- type-specific
tmpl_version: 260703   # Orignal template version
---
## <body sections, template placeholder comments>
```

`memory.add` resolves `id` from `"{auto}"`, sets `type`/`status`/`tmpl_version`, and otherwise
copies the scaffold verbatim — the body stays as template placeholder comments, with no content
written yet at this step. `memory.submit` fills `title` and all
other required fields and replaces every placeholder comment with real content, moving `status` to
the type's post-submit state.

### No document-version counter, no in-frontmatter audit array

The base schema carries **no** `version` (per-write increment), `state_history[]`, or `review[]`
field. `rejection_reason` (above) does **not** contradict this: it is a single scalar mirroring only
the *current* document state (present ⇔ "this document was rejected and has not yet been
resubmitted"), overwritten in place on every reject and cleared on every submit — it never
accumulates entries and carries no history of its own, so it is not a counter and not an audit array.
This is a deliberate departure from prior-art draft `F-04-frontmatter-schema.md`, which
proposed a nested `wingfoil:` block with exactly those three fields as the audit trail. Two
grounds for the departure:

1. **It does not match the real templates.** None of the `.wingfoil/memory/templates/*.md`
   scaffolds declare `version`, `state_history`, or `review`; every one uses the flat five-field
   shape above plus `tmpl_version`.
2. **It is redundant with git, and the git-based design is already normative.** REQ-STATE-02
   requires state to be recomputable purely from Memory files at a given commit, with no
   `.wingfoil/state/` artifact needed for correctness; git itself already carries the audit
   role (REQ-SEC-02) — every `memory.submit`/`approve`/`reject`/`deprecate` is exactly one commit,
   and `memory.approve`/`memory.reject` commits carry the approver identity and reason as explicit
   `Approver:` / `Reason:` trailers in the commit body (REQ-SEC-04), with the timestamp supplied by the git
   commit itself. `wingfoil memory history` (P1.10) reconstructs the same audit trail F-04 wanted
   to keep in-frontmatter by walking `git log` on the file's path, not by reading a frontmatter
   array. Keeping a parallel in-frontmatter copy would be two sources of truth for one fact.

### Field-write ownership

| Operation           | Fields it may change                                                        |
|----------------------|-------------------------------------------------------------------------------|
| `memory.add`         | `id` (from placeholder), `type`, `status: draft`, `tmpl_version`, any field the specific add action pins (e.g. `version` for a `release-line`); everything else stays at template defaults |
| `memory.submit`      | `title`, all other required type-specific fields, `status` (→ the type's post-submit state), body content, and clears `rejection_reason` if present (removes the key) |
| `memory.approve`     | `status` only (frontmatter); approver identity + reason live in the commit message, not frontmatter |
| `memory.reject`      | `status` (frontmatter) and `rejection_reason` (set to the `--reason` text); approver identity + reason also live in the commit message per P1.7 — the frontmatter copy is a convenience, not a replacement |
| `memory.deprecate`   | `status: deprecated` (or a type-specific deprecate-adjacent state first, e.g. `accepted → superseded`) |
| `memory.amend`       | the body and every frontmatter field **except** `status`, `id`, `type`, `release`, `rejection_reason` and `supersedes`, as the author edited them in the working tree; those six stay as committed (`release` only on a type whose scaffold committed at `HEAD` declares a `release` field), and past the type's initial state `title` and the required fields must stay non-empty (§ Validation rules). Only on a type whose `memory.yaml` entry declares `amendable: true` (`spec-001`); approver identity + reason live in the commit message, as for `memory.approve` (`dl-108`) |

`memory.approve` changes **only** the `status` field and no other frontmatter field. `memory.reject`
changes `status` plus `rejection_reason` — the one exception to "status only" among the transition
verbs, matching the field-write ownership table above. `memory.amend` is not a transition: it owns
the content and never `status`. It also leaves alone the fields other operations own:
- `id` and `type` locate the element and select its path and machine, so a change to either is a
  new element rather than a correction to this one;
- `release` is written by `assign` (`element.set_release`), on the types whose scaffold declares it
  with the `traceability` directive's meaning. The scaffold committed at `HEAD` (`template.file` of
  the committed `memory.yaml`) decides: a type whose scaffold has no `release` field has no
  assign-owned `release`, so an amendment may remove a `release` key left on one of its documents
  (`service`, whose set-up release is `set_up_in` since `task-170`). With no readable committed
  scaffold, `release` stays reserved;
- `rejection_reason` is written by `memory.reject` and cleared by `memory.submit`;
- `supersedes` is the trigger of the `superseded` edge.

### Validation rules

| Rule                                                                                   | Failure                                                    |
|------------------------------------------------------------------------------------------|-------------------------------------------------------------|
| `id` must match the file stem (`{id}.md`)                                               | id/filename mismatch                                        |
| `id` must match the owning type's `id_pattern` (`memory.yaml`, `spec-001`)              | invalid id for type                                          |
| `type` must be a key registered in `memory.yaml` `types:`                               | unknown type                                                  |
| `status` must be a state of the type's machine (`spec-001`)                             | invalid state for type                                        |
| `tmpl_version` must be present and equal to an integer the type's template has carried  | stale/unknown template version (non-fatal — informational)   |
| `title` must be non-empty once `status` is anything other than `draft`                  | missing title on submit                                      |
| Every field in the type's `template.frontmatter.required` must be non-empty once `status` is anything other than `draft` | missing required field on submit                              |
| A required field may hold a not-applicable value only if the type lists it in `template.frontmatter.not_applicable_allowed` (`spec-001`), and only as `n/a — <reason>` with a non-blank reason | not-applicable value on submit: `<field>` does not accept one / needs a reason / must be written "n/a — <reason>" |

**What "non-empty" means** (`bug-147`, approver rulings 2026-10-02 at `task-168`'s reviews). A
required field is empty when it is absent, `null` (an empty YAML value, `features:`), a blank string,
or a mapping. A list is the field's value only on a field the type declares in
`template.frontmatter.lists` (`spec-001`). There any list is filled, an explicit `[]` included: the
author declared "none". On every other required field, `title` included, a list counts as missing
(`[]`, `[""]`, `[x]` alike). A number, a boolean or a date is a value. A scaffold that must not pass a
submit untouched leaves a list field empty (`features:`) rather than `[]`.

**The not-applicable value** (`dl-124` Q1 (A), Q3 (ii), `task-168`). A required field that does not
apply to one element of its type says so with the reserved value `n/a — <reason>`: `n/a`, an em
dash, then the reason. Letter case and whitespace around the em dash do not matter (`N/A — x` and
`n/a—x` are accepted). Quoting the value is recommended but not enforced: the em-dash form is a plain
YAML string unquoted, but a mistyped unquoted `n/a: <reason>` is not valid YAML. Any string value whose text starts with `n/a` in any case, not followed by a letter,
digit or `_` (`n/a`, `N/A`, `n/a — patch release`), is read as a not-applicable value; `n/available`
or `P1 (n/a for docs)` are ordinary data. On a listed field the full form counts as filled. Bare
`n/a`, or a blank reason, is refused as needing a reason. A reason after any other separator
(`n/a - x`, `n/a: x`) is refused as the wrong form. On any other required field — `title` always included — the
value is refused whatever its form, so a field the type does not list cannot be skipped by writing
`n/a` in it. Optional fields are not checked. The same rule applies to `memory.amend` past the type's
initial state (the § Field-write ownership row).

*Note (non-normative):* readers of these fields, such as queries and the MCP Resources, should treat
a value starting `n/a` as "does not apply" rather than as data. No reader does so yet.

## Consequences

- Any future frontmatter validator (`spec-009-validation-strategy`) targets this flat five-field
  base plus per-type required fields — **not** a nested `wingfoil:` object. Schema code (Zod or
  otherwise) should define one base object merged with each type's specific-field object, matching
  the flat shape shown here.
- State-derivation and history tooling (`wingfoil memory history`, the workflow phase-completion
  deduction per REQ-SYS-03) reads `status` directly off frontmatter for current state, and
  walks `git log --follow <path>` for history — it must **not** expect a `state_history[]` array in
  the file.
- If a future release genuinely needs an in-file audit cache (e.g. for fast reads without a git
  walk), that is a new, explicitly-justified addition to this spec — not an assumption carried over
  from the unmerged `F-04` draft.
- Type-specific field schemas (the second zone) are each type's own contract, out of scope here;
  changing a type's required fields is a change to `memory.yaml`'s `template.frontmatter.required`
  and that type's `.wingfoil/memory/templates/{type}.md`, not to this spec.

## Process Notes

Grounded against the ground truth in `.wingfoil/memory/templates/{adr,task,release,...}.md`,
which uses a flat schema and a static `tmpl_version` build stamp — not a nested `wingfoil:` block,
`state_history[]`/`review[]` audit arrays, or a per-write incrementing `version` counter. This spec has
no per-write counter or audit array to get wrong, since the audit trail is git commits (REQ-SEC-02,
REQ-SEC-04), not a frontmatter log.

**Revision (2026-09-29) — the type enumeration.** This spec named the seven types of its time in five
places. `plan` (`dl-019`) had already made those lists stale, and `service` (`dl-088`) adds a ninth.
The lists now defer to `spec-001` / `memory.yaml`, and `release.kind` (`dl-092`; its companion `patch-of` is optional)
joins the example of type-specific fields. The five base fields and `rejection_reason` are unchanged: the `plan` template
carries all five (`.wingfoil/memory/templates/plan.md`), and the `service` template that implements
`dl-088` must carry them too. Written in v0.2.2 `release-planning/identify-specs`. Edited in place — no
supersede, no state change, no `version:` field (`dl-047`) — per the precedent `spec-015` set.

**Revision (2026-09-29, `task-124-the-service-memory-type`) — `service` has landed.** `memory.yaml`
1.6 declares `service`, so the `type` row no longer says "once `dl-088`'s configuration change
lands", and `.wingfoil/memory/templates/service.md` carries the five base fields
(`id`, `type`, `title`, `status`, `tmpl_version`) the revision above requires of it. Edited in place,
as above; pending the approver's sign-off at `task-124`'s review.

**Revision (2026-10-01, `task-127-add-memory-amend-id-reason-approver-gated-verb`) — the
`memory.amend` row.** `dl-108` (`ready`, A1 (a), A2 (i), A3) adds a verb that records a content
correction without a state change, and its Action 1 asks this section to say what it owns: the body
and the non-status fields. The row and the paragraph after the table say so, and add `id` and `type`
to the fields it may not change (a design decision of `task-127`, to be confirmed at its review).
Edited in place, with no supersede, no state change and no `version:` field (`dl-047`); pending the
approver's sign-off at `task-127`'s review.
At the review (2026-10-01) the approver ruled that `release`, `rejection_reason` and `supersedes` are
also outside an amendment (ruling (b)). Review F1 added the § Validation rules clause to the row.

**Revision (2026-10-01, `task-170-give-service-set-up-release-field-name-own`) — `release` is
reserved where the scaffold declares it.** `bug-166`: a `service`'s `release` meant the release it was
set up in, not the assigned release. `task-170` renamed it `set_up_in`, and the approver's ruling of
2026-10-01 (option (A)) narrowed ruling (b): `release` is outside an amendment only on a type that
carries the assign-owned field, keyed on the type's scaffold committed at `HEAD`. The row and the
`release` bullet say so. Edited in place, with no supersede, no state change and no `version:` field
(`dl-047`).

**Revision (2026-10-02, `task-168-accept-declared-not-applicable-value-required-fields-explicit`) —
the not-applicable value.** `dl-124` (`ready`; Q1 (A), Q2 (a), Q3 (ii)) reserves `"n/a — <reason>"`
for a required field the type declares in `template.frontmatter.not_applicable_allowed` (`spec-001`);
its Action 2 asks this spec for the value and its reading. § Validation rules gains a row and the
paragraph after the table. It also gains the paragraph on what "non-empty" means (`bug-147`).
Following the approver's rulings of 2026-10-02 at `task-168`'s reviews, a list is filled only on a
field the type declares in `template.frontmatter.lists`, `[]` included. On any other field a list or
a mapping is missing. The `release` scaffold leaves `features:` empty, so an untouched one still
fails. The reader note on `n/a` is non-normative. Edited in place, with no supersede, no state change and no `version:`
field (`dl-047`); pending the approver's sign-off at `task-168`'s review.

**Revision (2026-10-02, `task-153-reconcile-req-state-08-p1-13-scenario-memory`) — the example
block, and `status` in the `sequence` encoding.** `bug-196`: the illustrative task frontmatter under
"Document template shape" showed `bug: ""`, a list since `dl-045`, and had neither `kind` (`task-150`)
nor `depends_on` (`dl-015`). It now matches `.wingfoil/memory/templates/task.md`'s keys and says it
is an example, pointing to `spec-001` for type-specific fields. The `status` row named the retired
`states.initial`/`states.values` keys (the `bug-053` class); it names the head of the type's machine,
own or default, as the declared rule,
and the § Validation rules row on `status` names a state of the type's machine.
No field, requirement or ownership changes. Edited in place, with no supersede, no state change and
no `version:` field (`dl-047`); pending the approver's sign-off at `task-153`'s review.
