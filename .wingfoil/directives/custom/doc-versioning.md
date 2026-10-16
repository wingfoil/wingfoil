---
id: doc-versioning
name: "Documentation versioning"
type: directive
kind: custom
title: "Documentation versioning"
tags: [custom, documentation, versioning]
scope: global
ref: []   # pure WingFoil convention (no upstream feature/REQ)
---

# Directive — Documentation versioning

Custom WingFoil rule. Applies to all roles editing versioned docs.

## Scope of the bump rule (`dl-047`, option 1)

- **The bump rule applies where a document declares a version**, as a frontmatter `version:` key or a
  `**Version:**` body line. Examples are the vision documents under `docs/01_vision/`, `plan`
  elements, and directives that declare one. A directive declares it as the frontmatter `version:`
  key (`spec-013`; approver ruling 2026-10-01), not a body line. A document that declares no version
  is not given one in order to satisfy this rule. Tech-specs, ADRs, decision-logs and tasks declare none: their templates
  have no `version:` key. The `version:` of a `release` or `release-line` names the release (e.g.
  `"v0.3"`), not a revision of the document, so the bump rule does not apply to it.
- **An `approved` or `accepted` Memory element edited in place** records a dated
  `**Revision (YYYY-MM-DD) — reason, per <element>.**` entry instead, in its Process Notes or the
  equivalent closing section. `<element>` is what required the edit: e.g. the decision-log, bug or task, an approver ruling or a plan.
  Git already versions every Memory element per commit (P1.2, P1.10), so the note records the human
  reason, not a number. The edit is committed with `memory amend`, which needs approver authority,
  for every type that `memory.yaml` declares `amendable: true`. An `adr` takes such a note too
  (`amendable: true`, approver ruling at `task-158`), but only for a correction: a changed decision
  is a new ADR (`dl-108` A3).

## The bump rule

- **Bump the version only on the first edit after the file was last committed to the branch's
  integration branch** (`git-conventions` §1, `dl-159`). The baseline is the version on the branch's
  integration branch, `release/X.Y` or `main` (for a commit made on a line itself, that line), not the last
  commit on the branch you work on: a task branch bumps a document once, and further edits on the same
  branch — review fixes included — do not bump it again, even though each of them is committed (approver ruling 2026-10-01).
- Update the `**Date:**` to the edit date when bumping, where the document has one.
- **Gate (the four versioned config files only).** `test/lint/version-bump.test.ts`, run by `npm test`,
  fails when the pending change (the working tree against `HEAD`) changes `.wingfoil/dna.yaml`,
  `memory.yaml`, `workflows.yaml` or `roles.yaml` — comments included — without changing its
  `version:` as YAML reads it, unless the branch already bumped that file since it left its integration
  branch (`task-183`, `bug-143`, `task-287`). "Changes" is `git diff HEAD`'s verdict, so eol conversion
  is honoured. The integration branch it reads is a local branch: of the local `main` and every local
  `release/<major>.<minor>`, the one whose fork point with `HEAD` descends from every other's — the line
  `HEAD` left most recently (`main` on a tie, e.g. a `release/X.Y` just cut, or `HEAD` at a merge-forward
  commit both lines contain; on a line itself the fork point is `HEAD`, so the check there is strict).
  A stale local branch can credit a bump the branch did not make, a line with no local branch is not
  seen, and with no candidate, or with fork points that do not order, the check is strict, against
  `HEAD` alone. Committed history is not re-judged.

> Rationale: keeps version numbers meaningful (one bump per revision that reaches its integration branch) rather than
> churning on every micro-edit or review fix. Mirrors the standing project convention.
