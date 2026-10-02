---
id: "bug-054-adr-001-present-tense-stack-parenthetical-stale"
type: bug
title: "adr-001:32 describes the current stack in the present tense as \"Node.js 18+ … per dna.yaml\", and dna.yaml now says 22.12+ — the one adr-010 hit that is a live description, not a historical record"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

The adr-010 cascade (merged, `7bb95d6`) corrected every artefact that *states* the runtime floor. One
occurrence was left: `adr-001-git-backed-storage:32` contains a present-tense parenthetical describing
what is in the stack today — "TypeScript/Node.js 18+/Commander.js/MCP over stdio/Zod/Jest, per
`dna.yaml`" — and `dna.yaml` now says `22.12+`. The sentence cites `dna.yaml` as its authority and no
longer agrees with it. adr-001's own decision (git-backed storage) is untouched by this.

## Steps to Reproduce

Measured 2026-09-21 on `main` at `ba2cad0`.

1. The line, in an `accepted` ADR (`adr-001-git-backed-storage.md:5` → `status: accepted`), closing the
   Decision section at `:30-32`:

```
WingFoil's answer to "which database does the core tech stack use": none — `dna.yaml`'s
`tech_stack.storage` is `git`, and no DB client, ORM, or schema-migration tooling appears anywhere
in the stack (TypeScript/Node.js 18+/Commander.js/MCP over stdio/Zod/Jest, per `dna.yaml`).
```

2. What `dna.yaml` says, `.wingfoil/dna.yaml:73-75`:

```
    - name: Node.js
      category: runtime
      version: "22.12+"   # [SPEC] Product Brief §Technical Stack; floor set by adr-010 (supersedes adr-005's runtime clause)
```

3. The decision that moved it: `adr-010-node-22-runtime-floor`, `status: accepted`, title "The runtime
   floor is Node 22.12+, not Node 18+ — supersedes adr-005's runtime clause". `adr-005` is now
   `status: superseded`.

4. Every other live `Node.js 18+` occurrence in the documentation is either a historical record that
   the cascade deliberately left, or already carries a correction note:

```
$ grep -rn "Node.js 18\|node >=18\|>=18\.0\.0\|Node 18" docs/ --include=*.md | grep -v /bugs/
docs/05_plans/rl-v1/initial-design-rl-v1-plan.md:67   # a plan's record of what adr-005 decided — history
docs/self/…/dls/dl-001-typescript-over-python.md:19   # covered by its own Correction note at :37
docs/self/…/dls/dl-001-typescript-over-python.md:35   # covered by the same note
docs/self/…/adrs/adr-001-git-backed-storage.md:32     # <- THIS ONE: no note, present tense
docs/self/…/v0.2/task-060-publish-pipeline.md:123,125,259   # a done task's record of the state at the time
docs/self/…/v0.2/task-074-fix-engines-node-floor.md:17,19   # the task that will change package.json
```

5. The shape the cascade used for the same problem, `dl-001-typescript-over-python.md:37-45` — a dated
   block quote left in place above the original text:

```
> **Correction (2026-09-21) — the runtime clause reads Node.js 22.12+, not Node.js 18+.**
> `adr-010-node-22-runtime-floor` (`accepted`, `0627290`) sets WingFoil's supported runtime floor to
> **Node.js 22.12 or later** … Wherever this document says "Node.js 18+" … read **Node.js 22.12+**.
>
> **The substantive decision is unchanged and still holds.** …
```

adr-001 received no such note.

## Expected Behavior

A reader of adr-001 is not told, in the present tense and on `dna.yaml`'s authority, something
`dna.yaml` does not say.

## Actual Behavior

An `accepted` ADR asserts the current stack includes "Node.js 18+ … per `dna.yaml`", which is false by
two major versions, with nothing on the document indicating it.

## Notes

### The tension this bug exists to record

Memory elements are history and must not be rewritten casually — that is why the cascade left the
`18+` hits in `task-060`, `task-074` and the `initial-design` plan exactly as they were: each is a
record of what was true when it was written. adr-001:32 is not that. It is a **present-tense
description of the current stack**, written as a supporting aside to a decision about storage, and its
truth is pinned to a file that has since changed. Leaving it is asserting something false; rewriting
it is editing a ratified record. Both instincts are right, which is why the answer should be recorded
rather than improvised by whoever next notices.

### The project already has an answer, and it is not "rewrite"

`dl-001` got a dated `> **Correction (…)**` block: the original text untouched, the correction
adjacent, the substantive decision explicitly reaffirmed. Applying the same shape to adr-001 costs one
block quote, preserves the record, and removes the false present-tense claim — and it has the further
merit of being the pattern this project used **for this exact cascade, three days' worth of commits
ago**, so it needs no new convention.

A second, smaller option exists and should be named: the parenthetical is a passing illustration
inside an answer about *databases* — its job is "no DB client appears in this list", and the list's
exact version numbers carry no weight for that. Replacing `Node.js 18+` with plain `Node.js`, or
dropping the version from the aside entirely, would make the sentence permanently true without
asserting any floor. That is still an edit to an `accepted` ADR and needs the same authority; it just
produces a document that cannot go stale again the next time the floor moves.

This report does **not** choose between them.

### Not a duplicate, and not adr-010's unfinished business

The adr-010 cascade is merged and complete on its own terms: `7bb95d6` merged
`docs/adr-010-cascade`, which corrected the product brief, `dna.yaml`, `dl-001` and CLAUDE.md. This
occurrence was simply not in its scope. Filing it as a bug rather than reopening the cascade keeps
that record accurate.

### Severity `low`

adr-001's decision — git as the single source of truth — is entirely unaffected; nothing reads this
line programmatically; no gate checks it. It is one false clause in a supporting aside. Filed because
it is the only *present-tense* survivor of the cascade and because the decision about how to correct a
ratified record is worth having on the record once.

### Related

`adr-010-node-22-runtime-floor` (`accepted` — the decision that moved the floor),
`adr-005-typescript-node-stack` (`superseded` by adr-010),
`dl-001-typescript-over-python` (`ready` — carries the correction-note precedent at `:37`),
`adr-001-git-backed-storage` (`accepted` — this document), `bug-023-engines-node-floor-contradicts-commander`
(`planned` — the manifest instance), `task-074-fix-engines-node-floor` (`backlog` — sets
`engines.node`), `bug-049-types-node-pinned-to-superseded-floor` (`open`),
`bug-047-engines-guard-asserts-satisfies-not-equals` (`open`),
`dl-047-tech-specs-carry-no-version-field` (the amendment route for ratified documents),
`bug-008-claude-md-stale-project-status` / `dl-025-agent-facing-docs-ownership` (the general "no gate
owns this text" pattern this is another instance of), REQ-SYS-01, REQ-SYS-09, P2.4.

## Triage & Execution Notes

Raised during the round-6 governance ingest (2026-09-21), after the adr-010 cascade merged
(`7bb95d6`). Filed unfixed — the agent stops at `open`.

The line was read at `adr-001:32`, `dna.yaml`'s value at `:73-75`, and both documents' `status:`
fields, rather than recalled. The claim that this is the *only* present-tense survivor was settled by
grepping every `18+`-family occurrence under `docs/` and classifying each (step 4) — not by assuming
the cascade was exhaustive. The correction-note precedent was quoted from `dl-001` rather than
described.

Not attempted: any edit to adr-001, and no choice between the two correction shapes — that is the
approver's, since it concerns how a ratified record may be amended.
