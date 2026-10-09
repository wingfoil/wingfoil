---
id: code-review
name: "Code Review"
type: directive
kind: custom
title: "Code Review"
tags: [custom, code-review, approval]
ref: [P3.8]
---

# Directive — Code Review

Custom stand-in directive. Applies to reviewers (and the approver gate).

> **Stand-in custom directive.** WingFoil ships its official built-in P3.8 templates, and
> `wingfoil init` installs them under `.wingfoil/directives/built-in/` (task-057). This repository's
> hand-authored configuration predates them, so this generic rule (adapted to the project
> methodology/tech-stack in `dna.yaml`) is kept here as `custom`; `ref: [P3.8]` names the built-in
> template it stands in for. Reconciling the stand-ins with the shipped templates is out of scope of
> bug-040, which corrected this note, and is not scheduled.

- Review checklist: correctness, tests present + passing, claims re-run (below), adherence to other
  directives, no secrets.
- Verify the change matches its task/deliverable acceptance criteria.
- When reviewing a `tech-spec` or `adr` for approval, apply the **spec-review gate** from the
  `architecture` directive (`dl-022`): internal + cross-spec + BDD/vision + traceability consistency.
- Approve via `wingfoil memory approve` (records reason); reject via `wingfoil memory reject`
  (returns to the workflow `fallback` step with feedback).
- Approval binds to the `reviewer`/`approver` role, not a person.
- **No gated transition by an unattended run** (`dl-103` §2 (i)): every `approve` and `reject` is a
  human-authored commit; a process without a human present may `add`, `submit`, `start`, `sync` and
  write content, never approve or reject — the governance check's authority rule enforces it.

## Claims are re-run before the verdict (`dl-097` (a))

- **Re-run each state claim of the review-ready summary** — the task's Execution Notes, the review
  section first — with the command the claim names, and compare what it prints with what the note
  says. A state claim with no command is a finding in itself (the `claim-evidence` directive).
- **Every absence claim shows its positive case.** An empty result counts only when the same command,
  or the same pattern, is shown hitting a known positive case in the same note (`claim-evidence`,
  *Absence and presence*). Without one, re-run the check with a pattern that can match before
  accepting the claim.
- This item is the enforcement point `dl-097` §2 (a) chose. The matching `checks.pre` entry of the
  `dev-loop` `review` phase is that workflow's declaration (`dl-097` Action 3), not this directive's.

## Re-review: the previous reject is checked first (`dl-098`)

When the task under review has at least one earlier `wf(task): reject` commit, do this before any
new finding (`dl-098` §1):

1. **Read the previous reason through `memory history`** (`dl-098` §2 (a)): `wingfoil memory history
   <task-id>` lists the reject as an entry whose `operation` is `reject`, with the commit's `Reason:`
   block in its `reason` field — for the latest one,
   `wingfoil memory history <task-id> | jq -r '[.entries[] | select(.operation == "reject")] | last | .reason'`.
   The frontmatter copy cannot be used: `memory submit` removes `rejection_reason`, so it is gone by
   the time the task is back in `in-review`.
2. **Re-verify each item of that `Reason:`** with the command that settles it. An item is resolved
   only when the command says so; a note saying it is resolved does not count. The implementer's
   per-item lines in the Execution Notes (`dl-098` §2 (b), the task template) are the checklist to
   re-run, not the evidence.
3. **Search the new pass for the same class**: a false claim in the passages rewritten since the
   reject, a defect class in the code the fix touched. The sentence written to fix a false sentence
   is the likeliest place for the next one.
4. **State the result in the verdict's `Reason:`, one line per previous item**: the item, the
   command re-run, resolved or not — in an approve and a reject alike. Write the lines as prose or a
   list, never as a closing paragraph of `Key: value` lines, and never begin a line with `Approver:`
   or `Reason:` (`dl-067`, the shape of the `Reason:` block).

> Source: Features §P3.8 (Code Review); `dl-097` (a) and `dl-098` §1 for the two sections above;
> `dl-103` §2 (i) for the unattended-run policy.
> Used by the `dev-loop` review step.
