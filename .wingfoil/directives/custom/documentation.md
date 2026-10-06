---
id: documentation
name: "Documentation"
type: directive
kind: custom
title: "Documentation"
tags: [custom, documentation]
ref: [P3.8]
scope: global
---

# Directive — Documentation

Custom stand-in directive. Applies to all roles.

> **Stand-in custom directive.** WingFoil ships its official built-in P3.8 templates, and
> `wingfoil init` installs them under `.wingfoil/directives/built-in/` (task-057). This repository's
> hand-authored configuration predates them, so this generic rule (adapted to the project
> methodology/tech-stack in `dna.yaml`) is kept here as `custom`; `ref: [P3.8]` names the built-in
> template it stands in for. Reconciling the stand-ins with the shipped templates is out of scope of
> bug-040, which corrected this note, and is not scheduled.

- Every command/feature is documented (README + command docs) before it ships (npm package includes docs).
- Decisions live in Memory (`adr` for architectural decisions, `decision-log` for product/process
  decisions), not scattered across the codebase.
- Keep cross-references intact (see the custom `traceability` directive).
- Update the relevant `docs/` artifact in the same change that alters behavior.
- **Code-level API docs (`dl-013`):** every public/exported declaration carries a TSDoc comment and
  `TypeDoc` must build clean; the `dev-loop` review gate rejects undocumented public elements.
  **Enforced (`ACTIVE`) as of `task-062-typedoc-tsdoc-backfill`** (which closed the `dl-014` B-DECISION
  Option 2 warn / new-code-only ramp): the `docs.api.public-complete` / `docs.api.build` `refactor`
  checks are now **hard-reject** — an undocumented exported declaration fails the gate. The check is
  `typedoc.json` (`validation.notDocumented: true` + `treatWarningsAsErrors: true`, scoped to exported
  declarations via `requiredToBeDocumented`), run through `npm run docs:api` and asserted by
  `test/docs/api-docs.test.ts`.
- **User-facing docs before release (`dl-013`):** `README.md`, the user guide, CLI reference, working
  examples, and `CHANGELOG` are written/aligned before `release-submit` — enforced by the `user-docs`
  phase in `release-cycle.yaml` (between `implementation` and `submit`).

## WingFoil-specific clauses (`dl-120`)

The five clauses in this section are WingFoil's own. They are not part of the generic P3.8 template
that this stand-in mirrors. They were ratified in `dl-120-documentation-directive-extensions`
(`ready`, Q1 (a)). When this stand-in is reconciled with the shipped built-in template, this section
is kept as a `custom` rule and is not dropped with the generic rules above. Each clause cites the
element that argued it.

- **D1 — Citations (`dl-075`).** A durable citation names something the file carries: an exported
  symbol, a heading, a YAML key path, or a verbatim quotation. When the cited state may move, the
  citation also pins the commit it was read at. A bare `path:line` offset is legal only in Execution
  Notes, Steps to Reproduce and triage notes, where a stale offset is a true record of what somebody
  read. Existing citations are fixed on touch: when a document is opened for another reason, its bare
  offsets are converted in that same change (`dl-075`, the approve `Reason:` of `0cf643ff`). The
  `claim-evidence` directive keeps its own restatement under *How a claim is recorded*.
- **D2 — Resolvable references.** A repository document references only what a reader of the
  repository can open: a versioned file, an element, a commit or ref, or a command that runs against
  them. When a document depends on something outside the repository, it integrates the needed
  content and drops the reference (approver ruling of 2026-09-28, `retrospective-rel-v0.2-plan` §2.2).
- **D3 — Transient facts name their remover.** Some sentences are true only until a known event: a
  merge, a fix, a release, a tool upgrade. Such a sentence names that event's element, and that
  element's Actions or acceptance criteria include removing or rewriting the sentence. A deferred
  step ("added when X ships") names the element that adds it, and that element's `depends_on` or
  acceptance criteria say so (precedents: `bug-040`, `bug-045`, `bug-062`, `bug-029`).
- **D4 — Premises carry their conditions.** A triage grade, a decision-log conclusion or a fix
  guidance states what it was measured under: the commit, and the tool version when a tool's
  behaviour decides the result. Whoever picks the element up re-checks the premise before acting on
  it (precedents: `dl-069`, `bug-062`, `bug-010`).
- **D5 — A gate names its rule, and the rule names its gate.** A decision-log that adds a gate for a
  rule a directive already states cites that directive in its Actions. The directive then points at
  the gate that enforces it (precedents: `dl-034`, `dl-044`). The pointers are in the `code-quality`
  and `testing` directives.

> Source: Features §P3.8 (Documentation).
