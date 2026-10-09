---
id: wingfoil-cli
name: "Which WingFoil build runs which command in this repository"
type: directive
kind: custom
title: "Which WingFoil build runs which command in this repository"
tags: [custom, process, cli, determinism]
scope: global
version: "1.0"
ref: [P3.5, P3.7, REQ-SYS-08]
---

# Directive — Which WingFoil build runs which command in this repository

**Date:** 2026-10-09

Custom WingFoil rule. Applies to **every role**: whoever runs a `wingfoil` command in this repository —
a `developer` submitting a task, the `approver` whose approve commit is written by a verb, a
`facilitator` capturing a retrospective, an agent reading through MCP. Bound in `roles.yaml` `global:`
(`dl-163-consumer-projects-feedback-sources-and-the-feedback-loop` S3e).

Ratified as `dl-163` S3e (`ready`), which makes a directive of the `dev-loop-rel-v0.3-plan` ruling of
2026-09-30 ("Which build runs the Memory operations") and builds on
`dl-095-which-wingfoil-build-develops-wingfoil` (the pin, and Q3's procedure). This directive is where
they are met; the decision-logs are where they are argued. Do not re-open a choice here — if you
believe a rule is wrong for your case, file a `decision-log`, do not deviate.

## Who this reaches

This directive reaches an agent executing under any role of **this repository's own**
`.wingfoil/roles.yaml` — `wingfoil/wingfoil`, the repository WingFoil is developed in — which
auto-loads it (P3.6). It reaches nobody else, by design: this repository is the only one that can
run WingFoil from its own source, so the rule has no meaning in a project scaffolded by
`wingfoil init`, and it is not a candidate built-in directive.

## 1. Two builds, each for its own job

| Job | Build | How it is run, from the repository root |
|-----|-------|------------------------------------------|
| **Memory operations** — `memory add`, `submit`, `approve`, `reject`, `deprecate`, `amend`, `park`, and every other verb that writes a `wf()` commit | the **code build**, compiled from this checkout | `npm run build`, then `node dist/cli.js <command>` |
| **Read commands** — `dna show`, `paths`, `directives list`, `workflow list`, `memory search`, `memory history` — and **MCP** | the **pinned build**, the devDependency `wingfoil-released` | `npm run -s wingfoil -- <command>`; the MCP server `.mcp.json` registers (`npm run check:mcp`) |

- **Why the code build for Memory operations.** This repository is the only one that can run WingFoil
  from its own source, so a fix merged into `main` is used for the Memory operations as soon as it lands.
  Run it from the worktree you are working in, after `npm run build`, so the build is the code of that
  worktree.
- **Why the pinned build for the reads and MCP.** They answer as the build WingFoil's users have
  (`dl-095` Q1 (a), Q2 (i)), so the pinned build's surprises surface here, where they can be filed.
- **Which version is pinned** is what `package.json` declares for `wingfoil-released`
  (`grep -n wingfoil-released package.json`), and `npm run -s wingfoil -- --version` prints it. This
  directive names no version: it would go stale at the next pin advance.
- **Never `npx wingfoil`.** Once `dist/` is built it runs this checkout's own CLI, so the command no
  longer says which build it is.

## 2. Verb or hand procedure

- **Where the build in use has the verb, the verb is used.** A step is not done by hand because doing it
  by hand is quicker.
- **Where it has none, the declared hand procedure is followed:** the `wf()` commit, one operation and
  one element type per commit, in the format the verbs write — subject per `git-conventions` §4, the
  `Reason:` block per `dl-067-reason-trailer-contract`, approvals and rejections only on the approver's
  instruction.
- **A defect that blocks a step** follows `dl-095` Q3: move the pin forward to a published build that
  fixes it; if none exists, do the step by hand for that occurrence, record the workaround in the active
  plan's Execution Notes, and file the defect through `bug-ingest`.
- **A read the pinned build cannot run** is run with the code build only when a `pinned-build` bug (§3)
  records that it cannot, and the note that reports the read names that bug.

## 3. The pinned build's surprises live in bugs tagged `pinned-build`

- Every behaviour of the pinned build that a session here would not expect — a refusal, a wrong answer,
  a file it cannot read — is a `bug` whose `tags:` carry `pinned-build`. The tag is added when the bug is
  filed, or by `memory amend` on the approver's instruction.
- **This directive points to the tag; it does not list the surprises.** Each surprise has one record,
  closed by the element that fixes it. Read them with
  `npm run -s wingfoil -- memory search --type bug --tag pinned-build`.
- A surprise stops applying when the pin reaches a published build that ships its fix — the release the
  bug's fix is delivered in — not when the bug is closed: a fix merged into `main` reaches the code build
  at once and the pinned build only at the next pin advance.

## 4. Re-checked at every pin advance

`release-planning`'s `advance-pinned-build` phase re-checks this directive whenever it moves the pin:
it reads the `pinned-build` bugs against the new pinned build, notes which surprises the new build no
longer shows, and confirms the table in §1 still holds — a read that §2's last clause sent to the code
build goes back to the pinned build once the surprise is gone. A change to this directive is its own
commit, after the switch commit, which changes only `package.json` and `package-lock.json`.

## 5. No inbox here

Consumer projects keep their notes about WingFoil in a versioned inbox (`dl-163` R1). This repository
keeps none: a WingFoil defect found here goes straight to `bug-ingest`, reproduced in this repository
as every bug is.

> Rationale: the Determinism Index needs two sessions to run the same build for the same job. Naming
> the build per job, and keeping each surprise in one closable record, makes that a declared fact of
> the repository rather than a habit of whoever ran the last session.
