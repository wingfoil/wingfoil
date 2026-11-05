---
id: "dl-125-approving-documents-that-are-not-memory-elements"
type: decision-log
title: "Vision, feature and requirement documents declare themselves *Approved* but no verb can approve them, so their approvals are hand-written commits `memory history` cannot see"
status: ready
context: "retrospective"
release: "v1.0"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed by the v0.2 retrospective (`retro-v0.2`, being filed now). The retrospective's completeness
pass over the notes kept during the release surfaced a proposal no existing element carried, and the
approver accepted it at the `additional-points` gate with target release v0.4: documents that are not
Memory elements need a way to be approved by a verb.

**The documents that govern everything else are outside Memory.** Memory has eight types
(`memory.yaml` `types:` — `release-line`, `release`, `task`, `adr`, `decision-log`, `tech-spec`,
`bug`, `plan`). The vision package and the requirements are not among them:

- all nine vision documents carry a hand-written status line, `**Status:** Approved`
  (`git grep -h -E '^\*\*Status:\*\* ' a20b346c -- docs/01_vision | sort | uniq -c` → `9 **Status:** Approved`);
- the requirements documents under `docs/02_requirements/` carry no status at all
  (`git grep -l -E '^\*\*Status:\*\*' a20b346c -- docs/02_requirements | wc -l` → `0`);
- 20 commits on `main` touch `docs/01_vision/` or `docs/02_requirements/`
  (`git log --format='%h %s' a20b346c -- docs/01_vision docs/02_requirements | wc -l`), and none is a
  `wf()` commit (the same list piped through `grep -c '^[0-9a-f]* wf('` → `0`, against `1056` for
  `docs/04_memory`, so the pattern finds them where they exist).

So an approval of a vision document is whatever its author wrote: a status line and a commit
subject, with no `Approver:` line, no `Reason:`, no state machine and no authority check. `wingfoil
memory history` (P1.10) reads Memory documents only; the audit trail P1.2 promises "for all pillars"
does not reach the documents the specs themselves trace back to.

**It is about to matter more.** This retrospective filed two vision edits
(`dl-112-positioning-as-a-governance-layer`, `dl-113-personas-revisited`) and scheduled a
correction to `docs/01_vision/06_features.md`. Each will change a document marked *Approved*, and
each approval will again be a hand-written commit that no reader can tell from any other edit.

## Decision

Documents outside the eight Memory types can be approved by a verb, with the same evidence an
approval records for a Memory element (P1.7: approver identity, timestamp, reason), and `memory
history` can read it. The open choices below remain for the approver.

**Q1 — the mechanism:**
- **(A) a generic `document` Memory type.** Tracked documents gain frontmatter (`id`, `type:
  document`, `status`) and the default machine (`draft → pending → approved`, reject back to `draft`).
  Every verb, check and reader then works on them unchanged. Its `path` pattern must match documents
  that stay where they are (`docs/01_vision/…`, `docs/02_requirements/…`).
- **(B) an approval verb for tracked documents.** `memory.yaml` (or `dna.yaml` `paths:`) declares a
  list of tracked paths; `wingfoil document approve <path> --reason …` writes a `wf(document):
  approve <path>` commit with the approval body, and changes nothing in the document itself. Status
  is derived from the last such commit.
- **(C) status stays in the documents**, and only the commit format is fixed by convention, with no
  verb.

**Q2 — what "approved" covers after an edit:**
- **(a)** any edit after approval returns the document to `draft` (the next approval covers the new
  text);
- **(b)** approval covers a version: the document's `**Version:**` line, and an edit that bumps it
  needs a new approval.

**Recommendation:** Q1 (A), Q2 (b).
- **Q1 (A)** reuses everything v0.2 built (the verbs, the authority check, the audit reader) instead
  of a second approval path to maintain. Its cost, frontmatter on documents that have none, is a
  one-time migration that `wingfoil init` and the templates can then apply to new projects.
- **Q2 (b)** matches how these documents are already versioned (`doc-versioning`: bump on the first
  edit after commit), so "approved at version 1.3" is exactly what the files already say.

## Rationale

- **The authority of the specs rests on an approval nobody can audit.** The `traceability` directive
  maintains the chain feature → user story → BDD scenario → SARD requirement → task, and its first
  four links live in these documents. Their own approval is the least recorded state in the repository.
- **One audit trail, not two.** An approval path only for Memory leaves the most consequential
  approvals outside the tool built to record approvals.
- **Why v0.4.** v0.3 is already the largest release, and the Workflow pillar comes first; the
  vision edits filed for v0.3 are few and can be approved by hand until then, with an `Approver:` line
  and a `Reason:` block in the commit body.
- **Trade-off.** (A) adds frontmatter to documents humans read directly and changes their first lines;
  (B) leaves the documents untouched but adds a verb and a second status source.

Alternatives considered:
- **Move vision and requirements into Memory paths.** Rejected: every trace, citation and link to
  `docs/01_vision/` and `docs/02_requirements/` would move, and `docs/design.md`'s documentary chain
  depends on those locations.

## Actions

1. **Ratify, choosing Q1 and Q2.** Owner: approver. The choice goes in the approve commit's `Reason:`.
2. **Until then**, a change to an *Approved* vision document is committed with the approval body of
   `memory.approve` by hand (`Approver:` and `Reason:`), so it can be backfilled into whichever
   mechanism is chosen.
3. **Amend `spec-001-memory-yaml-schema`** (a `document` type, or tracked paths),
   `spec-004-mcp-surface-contract` §4 and `spec-008-cli-grammar` for the verb under Q1 (B), and
   P1.10's feature description.
4. **Tasks are derived by v0.4 `release-planning` (`build-backlog`)**, not created here.

## Relations

- **Origin:** `retro-v0.2`, from the completeness pass over the notes kept during the release
  (`retrospective-rel-v0.2-plan` §4.10).
- **Related:** `dl-112-positioning-as-a-governance-layer` and `dl-113-personas-revisited` (the next
  approvals of vision documents); `dl-019-plans-as-memory-element` (the last time a document kind
  was brought into Memory); `dl-103-governance-enforced-outside-the-agent`.
- **Traceability:** P1.2 (audit trail for all pillars), P1.7 (approval evidence), P1.10
  (`memory history`), P1.13 (Memory element schema).
