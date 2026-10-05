---
id: git-conventions
name: "Git conventions: branches, sync, tags, subjects, identity, id allocation, attribution"
type: directive
kind: custom
title: "Git conventions: branches, sync, tags, subjects, identity, id allocation, attribution"
tags: [custom, git, process, security]
scope: global
version: "1.0"
ref: [P3.5, P3.7, REQ-SEC-01, REQ-SYS-08]
---

# Directive — Git conventions

**Date:** 2026-10-05

Custom WingFoil rule. Applies to **every role**: whoever writes a commit or names a branch in this
repository — a `developer` on a task branch, the `approver` whose `approve` commit an agent types, a
`facilitator` capturing a retrospective, a `product-owner` filing a decision-log. Bound in
`roles.yaml` `global:` (`dl-119-a-git-conventions-directive` Q2 (b)).

Ratified as `dl-119-a-git-conventions-directive` (`ready`), which gathers rules argued elsewhere. This
directive is where they are met; each decision-log is where its rule is argued, and stays `ready`:

- `dl-024-git-branch-tag-conventions` — branches and the version tag (§1, §3);
- `dl-035-task-branch-sync-with-main` — staying current with `main` (§2);
- `dl-054-submit-commit-subject-bracket` — the `wf()` subject bracket (§4);
- `dl-094-one-author-identity-per-act` — whose identity an act carries (§5);
- `dl-101-id-allocation-across-refs` §1 — allocating a Memory id (§6);
- `dl-117-ai-attribution-policy` — AI co-authorship (§7);
- `bug-236-a-wingfoil-commit-amended-by-hand-with-a-separate-co-authored-by-paragraph-loses-its-wingfoil-version-trailer-and-reads-it-into-the-reason-block` — amending a tool-written commit (§8); the mechanism it protects is
  `dl-111-tool-signature-in-commits` (the `WingFoil-Version:` trailer) and `dl-067-reason-trailer-contract`
  (the `Reason:` block).

Do not re-open a choice here — if you believe a rule is wrong for your case, file a `decision-log`,
do not deviate. The general commit bullet of `code-quality` (conventional messages, one state change
per commit, REQ-SEC-02) stays there; this directive adds the git-specific rules on top of it.

## 1. Branches (`dl-024` rule 1, as amended by `dl-119` Q1 (b))

- A `dev-loop` task runs on `task/<task-id>`, cut from `main`. A workflow phase runs on its own branch.
  Both merge into `main` with `git merge --no-ff`, never fast-forward, so every unit of work stays one
  revertible merge commit.
- A branch name starts with one prefix from this **closed list**; an unlisted prefix is a deviation
  to fix, not a new convention:

  | Prefix     | Meaning                                                                          |
  |------------|----------------------------------------------------------------------------------|
  | `task/`    | one `dev-loop` task: `task/<task-id>`                                             |
  | `design/`  | one lifecycle phase (`sw-life-cycle` / `release-cycle`): `design/<phase>_<version>` |
  | `ingest/`  | one ingest main (`bug-ingest`, `decision-log-ingest`, `adr-ingest`, `service-ingest`) — always `ingest/`, never `design/` |
  | `fix/`     | an out-of-band fix outside a `dev-loop` task                                     |
  | `docs/`    | a documentation-only change                                                      |
  | `qa/`      | a quality gate (e.g. the `e2e-smoke` phase)                                      |
  | `backlog/` | scheduling work (filing or re-planning tasks and bugs)                          |

## 2. Staying current (`dl-035`)

- Bring a branch up to date with `git merge --no-edit main`, run from inside its own worktree. **Never
  rebase a branch that carries `wf()` commits**: a rebase rewrites the approve/reject records the
  audit trail is made of (P1.2, P1.7, P1.10).
- A task branch merges `main` at two points: when the task **resumes after a reject**, before any
  `red` work; and again **before re-submitting**, if `main` has moved since. The review gate then
  measures the tree that will exist after the merge.
- A conflict that is not trivially resolvable is not force-resolved: abort the merge, record it in
  the task's Execution Notes, and return the task to `red`.

## 3. Tags (`dl-024` rule 2, as amended by `dl-074-tag-must-be-on-pushed-main`)

A version tag is created on `main`, after the release's last phase branch has merged **and after
`main` has been pushed to `origin`**. It is never created on a phase branch.

## 4. Memory-operation subjects (`dl-054`)

- Subjects take the form `wf({type}): {verb} {ids}`.
- `approve`, `reject` and `deprecate` end in a `[{from} → {to}]` bracket, written with `→` as in
  `spec-004-mcp-surface-contract` §4.3. `add` and `submit` carry no bracket.
- Which verbs beyond the declared five are legal is not decided here: that is
  `dl-079-wf-commit-verbs-outside-the-declared-grammar`.

## 5. Identity (`dl-094` (ii))

Never write `user.name` or `user.email` with `git config` inside the repository or any of its
worktrees: inside a worktree it writes the configuration every worktree shares. A command that needs a
throw-away identity runs in a throw-away repository outside this one and passes the identity for that
command only — `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` / `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL`
in its environment, or `git -c user.email=… commit`. Which identity a real act carries is `dl-094`'s
rule; this clause only keeps a test identity from leaking into it.

## 6. Allocating a Memory id (`dl-101` §1)

`memory add` allocates the number. When an id is allocated, by the verb or by hand:

1. **Fetch, then scan every ref.** `git fetch --all --prune` first: `git branch -a` lists only the
   remote-tracking refs already fetched. The number is the highest found in the type's directory
   across every ref, plus one.
2. **Push the `add` commit at once**, on its branch, so the next session's scan sees it. Until it is
   pushed, the id is only a local proposal.
3. **Re-scan immediately before merging.** On a collision, the element pushed later yields and is
   renumbered on its own branch, with a commit that names both ids; its `add`/`submit` history is kept.
4. **Cite no id before its element exists.** A draft, a data file or a plan refers to "the
   decision-log this proposes", never to a number, until `memory add` has created the file.
5. **Agents do not allocate in parallel worktrees.** They report the elements they propose, and one
   orchestrating session files them.

## 7. AI attribution (`dl-117` Q1 (B), Q2 (c))

- **Which commits.** Every commit whose content an agent produced, in whole or in part — Memory
  operations performed on the approver's instruction included — carries AI co-authorship, **except
  `approve` and `reject` commits**: those record the approver's decision and carry no AI co-author even
  when an agent typed them (`dna.yaml` declares every agent `approval_authority: false`).
- **Which name.** The `Co-Authored-By:` trailer names the agent entry declared in `dna.yaml`
  `team.agents` (its `name:`), so the name stays stable across model upgrades. A separate `AI-Model:`
  trailer, in the same trailer paragraph, carries the model identifier the running agent reports.
- **Past commits are not rewritten.** The policy applies from `dl-117`'s ratification. `agent execute`
  carries this rule to the agents it launches (approver ruling R20, `release-planning-rel-v0.3-plan`).

## 8. Amending a tool-written commit (`bug-236-a-wingfoil-commit-amended-by-hand-with-a-separate-co-authored-by-paragraph-loses-its-wingfoil-version-trailer-and-reads-it-into-the-reason-block`)

A commit written by `wingfoil` ends with a `WingFoil-Version: <semver> (<sha>)` trailer paragraph
(`dl-111-tool-signature-in-commits`). To add a trailer to it (e.g. `Co-Authored-By:`), amend with
`git commit --amend --no-edit --trailer "Co-Authored-By: …"`, which joins the existing trailer
paragraph. Never add a new paragraph after `WingFoil-Version:`: the trailer paragraph would no longer
be the last one, and a reader of the `Reason:` block (`dl-067-reason-trailer-contract`) would take the
`WingFoil-Version:` line into the reason. Two limits:

- **Only a commit not yet pushed.** Amending a pushed `wf()` commit rewrites an audit record, which §2
  forbids.
- **Never an `approve` or `reject` commit.** §7 excludes them from AI co-authorship, so there is no
  trailer to add.

> Source: `dl-119-a-git-conventions-directive` (Actions 2–4), `dl-117-ai-attribution-policy` (Action 2),
> `dl-101-id-allocation-across-refs` (Action 2). Features P3.5, P3.7; REQ-SEC-01 (every state change
> carries a git identity), REQ-SYS-08 (bindings by role).
