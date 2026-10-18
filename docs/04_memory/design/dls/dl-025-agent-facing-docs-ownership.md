---
id: "dl-025-agent-facing-docs-ownership"
type: decision-log
title: "Give agent-facing docs (CLAUDE.md) an owning release gate, like dl-013 did for user-facing docs"
status: ready
context: "process"
release: "v0.3"
tmpl_version: 260703
---

## Context

`dl-013` made documentation a hard release blocker instead of an unenforced convention, and wired it in
as the `user-docs` sub-workflow between implementation and `release-submit`. Its `align-user-docs` phase
declares five `produces:` entries — `README.md`, `docs/user-guide.md`, `docs/cli-reference.md`,
`docs/examples/`, `CHANGELOG.md` — with a post-check that they match *"the release's shipped CLI/feature
surface"*. Every one of them is **human**-facing.

The repository's **agent**-facing entry point, `CLAUDE.md`, appears in no `produces:` and no `checks:`
anywhere under `.wingfoil/workflows/`. Neither does `.wingfoil/README.md`, the
config-package entry point it delegates to. Nothing in the delivery loop re-aligns them when a release
ships.

The cost is already measurable. `bug-008-claude-md-stale-project-status` records that `CLAUDE.md` §1 —
the first status statement any agent reads — has claimed *"no source code yet / the `wingfoil` CLI/MCP
tool is not implemented"* since before `minor-v0.1` reached `released`, and that the claim passed
untouched through `v0.1`'s `user-docs` gate, its `release-submit`, and the whole `v0.2` `release-planning`.
It was found only because a session-start question about the MCP server happened to contradict it.

This matters more than an ordinary doc drift: the entry point is the single highest-leverage document in
the project. An error there is inherited by *every* agent session before any other file is read, which is
a direct attack on the North Star (the Determinism Index — two agents, same specs and config, equivalent
software) rather than a cosmetic issue.

## Decision

Extend the `dl-013` documentation gate so it owns
**agent-facing** documentation alongside user-facing documentation.

Concretely, two candidate shapes (choose at ratification):

- **(A) Extend the existing phase.** Add `CLAUDE.md` and `.wingfoil/README.md` to
  `user-docs.yaml` → `align-user-docs` → `produces:`, and add a post-check asserting that the entry
  point's *project status*, *doc-map paths*, *element/state tables*, and *golden rules* match the shipped
  surface and the current `memory.yaml`/`workflows.yaml`.
- **(B) Add a sibling phase.** A separate `align-agent-docs` phase in `user-docs.yaml`, `role: architect`
  (the role that owns `dna.yaml`/`memory.yaml` coherence) rather than `developer`, running after
  `align-user-docs` and before `release-submit`.

Either way: bump `user-docs.yaml`'s `version:` and cite this DL, per the field-provenance convention.

**Revision (2026-10-17, `dl-137`, `task-252`).** The ratified shape is **(B)**: the `align-agent-docs` phase,
role `architect`. Since `task-199` it lives in `.wingfoil/workflows/custom/agent-docs.yaml`, a workflow of its own
that `user-docs` includes once per release and `release-line-cycle` includes right before
`plan-next-release-line`, which answers the open question below. Since `dl-137` the agent-facing entry point is
`AGENTS.md`, and `CLAUDE.md` holds only its `@AGENTS.md` import: `agent-docs.yaml` 1.1 lists `AGENTS.md` and
`CLAUDE.md` (the pointer) in `produces:`, its four prose checks read `AGENTS.md`, and a fifth checks that
`CLAUDE.md` is a pointer that imports it. Where this decision names `CLAUDE.md` as the entry point or
`user-docs.yaml` as the phase's file, read `AGENTS.md` and `agent-docs.yaml`; the Context keeps the names of its
time.

## Rationale

- **Determinism (REQ-SYS-07).** A wrong entry point propagates into every session deterministically —
  the failure mode is systematic, not random, which is exactly the class of defect the harness exists to
  eliminate.
- **Consistency with `dl-013`'s own reasoning.** That DL's argument was "documentation as blocker, not
  convention". The argument applies with *more* force to the document that configures the agents doing
  the work, yet it was the one category left out.
- **Dogfooding.** WingFoil's claim is that a project managed through Memory + Workflow does not drift.
  An ungoverned, load-bearing document at the root of the repository is a counter-example sitting in the
  repository itself.
- **Trade-offs considered:**
  - *Fix `CLAUDE.md` ad hoc whenever someone notices* — rejected. `bug-008` is the empirical refutation:
    nobody noticed for an entire release, through two gates designed to catch exactly this.
  - *Make each task responsible for updating `CLAUDE.md` when it changes the surface* — rejected. No
    single task owns the entry point, and diffuse ownership is what produced the gap. Release-scoped
    alignment matches how the document is actually written (holistically, not per-task).
  - *Handle it via the global `documentation` / `doc-versioning` directives instead of a workflow gate* —
    partially rejected. Those directives govern how a doc is written and when its `version` is bumped;
    they have no enforcement point in the release flow, so they cannot block a release. A gate can.

## Actions

- [ ] Ratify this decision and choose shape (A) or (B) (owner: approver).
- [ ] On `ready`, derive the config task(s) at the next `release-planning` → `build-backlog`:
  - [ ] Amend `.wingfoil/workflows/custom/user-docs.yaml` per the chosen shape; bump its
        `version:` and cite `dl-025`.
  - [ ] Define the post-check concretely enough to be executable by an agent (which sections of
        `CLAUDE.md` are checked against which config files).
  - [ ] Decide whether `.wingfoil/README.md` and the §2 doc-map table fall under the same check.
- [ ] Open question for ratification: is a release-scoped gate sufficient, or should agent-facing docs
      also re-align at `release-line-cycle` close (`plan-next-release-line`), where structural changes
      like new Memory types or pillars land?
- [ ] Relationship to `bug-008`: that bug fixes the current wrong text (symptom); this DL prevents
      recurrence (cause). Fixing only the bug leaves the same drift free to reappear at `v0.2` close.
