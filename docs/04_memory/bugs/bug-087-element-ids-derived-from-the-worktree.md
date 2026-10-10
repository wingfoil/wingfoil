---
id: "bug-087-element-ids-derived-from-the-worktree"
type: bug
title: "`nextSequenceNumber` derives an element's id by counting files in the working tree, so a gapped sequence produces an id whose path is already occupied"
status: closed
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: "P1.3"
contributor: ""
credit: ""
tmpl_version: 260703
tags: ["pinned-build"]
---

## Summary

`nextSequenceNumber` (`src/memory/add.ts`) counts matching `.md` files with `readdirSync` of the
**working tree** and returns count + 1. A gap in the sequence — an element removed, or a working tree
that disagrees with `HEAD` — therefore yields an id whose path an existing element already occupies.

Before `task-092` the write was **unconditional**, so the collision silently overwrote the occupant:
`wf(adr): add adr-001-x` produced a commit that **deleted three lines of a committed ADR**. The
reviewer of that task then established the sharper form: it does not need a dirty tree at all. With
`adr-001-alpha` removed-and-committed and `adr-002-beta` clean and committed, `memory add` on a
**fully clean, fully committed** repository exits 0 and commits a diff deleting the real content of
`adr-002-beta.md`.

## Steps to Reproduce

1. In a scaffolded project (`bug-075` — a scratch project is required), add two elements of the same
   type so the directory holds `…-001-…` and `…-002-…`.
2. `git rm` the first and commit, leaving a gap: the directory now holds one file, numbered 002.
3. `wingfoil memory add --type adr --title "Beta"` → the counter reads one file and returns 2, so the
   id resolves to the path `…-002-…` already occupies.

Against `main` before `task-092`: exit 0 and a commit whose diff removes the occupant's content.
Against `task-092`'s branch: exit 1, `refusing to create …: something already exists there (at HEAD,
in the index, in the working tree)`.

## Expected Behavior

An element's id is derived from something that cannot collide. A count of files present at one moment
is not that — it is a guess that happens to be right while nothing has ever been removed.

## Actual Behavior

The id is a function of the working tree's current contents, and a gap makes it wrong.

## Notes

- **Reproduced on this repository (2026-09-29).** Since `task-111` and `task-123` put the
  configuration at the root with working template paths, `memory add` runs here. In `task-123`'s AC 4
  run on a throwaway clone, `memory add --type decision-log` issued `dl-130-ac4-probe-decision-log`,
  although `dl-130-visibility-steps-in-the-release-flow` exists: the `dl` sequence has a gap (no
  `dl-021`, `ls docs/04_memory/design/dls | grep -oE '^dl-[0-9]+'`). The slugs differed, so no file
  was overwritten, but the number was reused. Recorded in `task-123`'s Execution Notes. A per-release
  variant of the same counter is `bug-162`.

**Severity is contingent on `task-092` staying landed, and that is stated deliberately.** Before it,
this was CLI-reachable data loss and would have been `critical`. After it, the destructive face is
gone — the command refuses and tells the user to choose a different title — so what remains is a
usability defect: a legitimate add is refused because the counter guessed an occupied id. If
`task-092` were ever reverted this bug returns to `critical` without changing a line.

**It belongs to `dl-080`'s class even though it looks like arithmetic.** An element's id is a durable
attestation — it appears in the commit subject, in every cross-reference, and in `memory history` —
and it is derived here from the working tree. That is the same rule `dl-080` ratified for every other
gating read, and this read was simply never looked at: it surfaced from the Action-5 sweep that
`task-092` ran and nobody had run before.

Related: `bug-085` is a *different* working-tree read in the *same* verb (the type registry), and
`task-092` guards that verb's *write*. `memory add` therefore carries three instances of one class,
which is worth knowing when the fix is scoped — a single pass over `memoryAddFn` may settle more than
one of them.

## Triage & Execution Notes

- triage (2026-09-23): **medium**, **not a release blocker** — `task-092` removes the destructive
  face, and what is left refuses loudly rather than corrupting quietly.
- Scheduled to **v0.3**. No fix task filed: deriving the id from a non-colliding source is a small
  design question (highest existing number rather than a count; or the committed tree rather than the
  working one) and it should be answered under `dl-080`'s rule with `bug-085` in view.

## Correction (2026-09-24) — the destructive face is not gone, and the severity was re-derived rather than inherited

The Notes above say that after `task-092` "the destructive face is gone — the command refuses and
tells the user to choose a different title — so what remains is a usability defect". The first half
holds only when the **title also matches**. With a different title the path does not collide, the
absence guard sees nothing, and two elements are created with the same sequence number silently.

Measured on `main`'s build, in a throwaway `wingfoil init --template Scrum` repository, on a **fully
clean, fully committed** tree:

```
$ git rm -q docs/memory/adr/adr-001-alpha.md && git commit -q -m gap
$ git status --porcelain              -> (empty)
$ node dist/cli.js memory add --type adr --title 'Gamma'
{ "id": "adr-002-gamma", ... }           exit 0, no message
$ ls docs/memory/adr/
adr-002-beta.md   adr-002-gamma.md
```

Found independently by `task-095`'s implementer and its reviewer, and reproduced a third time by the
orchestrator before being recorded here.

**What this is and is not, stated precisely because the first framing was imprecise in both
directions.** Nothing is overwritten and no *id* collides — `adr-002-beta` and `adr-002-gamma` differ
by slug. What collides is the **sequence number**, which stops being an ordering key and makes any
reference to "adr-002" ambiguous. So it is an invariant violation, not data loss. The genuinely
destructive face — same type, same title, silent overwrite — is the one `task-092` closed, and that
half of the Notes stands.

**Severity: re-derived on 2026-09-24 and confirmed `medium`.** The approver ruled it stays, on the
ground that nothing is destroyed. It is recorded as a re-derivation rather than left as an inherited
grade because the sentence the original `medium` rested on is false, and a severity that survives on
a false premise is not the same thing as a severity that was reconsidered and held.

**Release unchanged at `v0.3`.** It does not block `v0.2`.

**One consequence for whoever fixes it.** The absence guard `task-092` added is title-sensitive, so it
cannot be the model for the fix here. Deriving the sequence number from the committed history is the
actual remedy, and it closes both faces at once — which is the `dl-080` framing the Notes above
already give.

**Reproduced on this repository with the published 0.2.2 (2026-09-29, v0.3 `release-planning`,
`decision-log-ingest-rel-v0.3-planning-decisions-plan`).** Six `memory add --type decision-log` calls
returned `dl-130` … `dl-135`, and `dl-130` already existed (`dl-130-visibility-steps-in-the-release-flow`,
`ready`). The directory holds 129 decision-logs before the call with one gap, `dl-021`
(`ls docs/04_memory/design/dls/dl-*.md | wc -l` → 129 before the adds; `dl-021-*` absent), so a count
plus one lands on an id in use: the "gaps reuse ids" face, on committed files this time, not only on
the worktree. The six local commits were undone (`git reset --keep c06b883b`, never pushed) and the
decision-logs added by hand as `dl-131` … `dl-136` (`8c13bb4a`). Until the fix lands, every `memory add`
on a type with a gap in its numbering must be checked against the highest existing id, not trusted.
