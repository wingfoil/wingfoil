---
id: "dl-043-console-format-human-rendering"
type: decision-log
title: "--format console falls back to JSON for every read-only command, against spec-008 §2"
status: in-discussion
context: "dev-loop-review"
release: "v0.4"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

`spec-008-cli-grammar.md:52` promises that `console` is the format "for humans (colour, `✓`/`⚠`/`✗`
prefixes)". `renderSuccess` (`src/cli/output.ts:22-26`) falls back to pretty-printed JSON instead —
for **every** `CORE_MODULES`-derived read-only command alike: `dna show`, `workflow list`, `paths`,
`memory search`, `memory history`, `directives list`.

Surfaced by `task-053`'s review, which declined to invent a table for one command. That was the right
call: pinning a human rendering per command is exactly the "notes nobody re-reads" pattern, and the
gap is not `directives list`'s — it is the default output mode of the whole read-only surface, against
an **approved** spec.

## Decision

Open. Two directions:

- **(a) Build the rendering.** `console` gets a real human format — a table or key/value block per
  operation, with the `✓`/`⚠`/`✗` prefixes spec-008 promises. Requires deciding *where* the
  per-command shape is specified: a tech-spec per payload, a generic renderer driven by the payload's
  structure, or per-operation metadata on `CoreOperation`. A generic renderer is the only option that
  does not re-open every time an operation is added.
- **(b) Amend spec-008 §2** to say `console` is pretty-printed JSON, and drop the colour/prefix
  promise until a release owns the UX work.

Note that P5.1.4 (`p5-interaction/P5.1.4-cli-ux.feature`) is the feature that owns CLI presentation,
and that the root `--help` output has the adjacent gap: no noun carries a description today.
Whichever option is chosen, the answer should be coherent with how P5.1.4 gets scheduled.

## Rationale

This is a divergence between shipped behaviour and an approved spec, so it cannot simply be left: one
of the two has to move. It is filed separately from `dl-042` because `dl-042` asks what fields
`directives list`'s payload carries, whereas this asks how **every** payload is rendered — different
scope, different owner, and folding them would bury the cross-cutting half.

Nothing is broken for machine consumers: `--format json` and `--format yaml` work correctly
everywhere, and `REQ-INT-05`'s machine-readable requirement is satisfied.

## Actions

- Choose (a) or (b); if (a), name the release and the specifying mechanism.
- Amend `spec-008` §2 either way — it is wrong today under both options.

Related: `spec-008` §2, `REQ-INT-05`, `P5.1.4`, `dl-042`, `task-053`.
