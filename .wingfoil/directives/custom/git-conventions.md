---
id: git-conventions
name: "Git conventions: branches, sync, tags, subjects, identity, id allocation, attribution"
type: directive
kind: custom
title: "Git conventions: branches, sync, tags, subjects, identity, id allocation, attribution"
tags: [custom, git, process, security]
scope: global
version: "2.2"   # 2.2 §4, §8: the non-Memory record subjects `workflow: finalize`, `workflow: adopt`, `agent: record`, and the `WingFoil-Adopted:` trailer of an adoption (task-294, dl-187) (prev 2.1 §9: the pre-push hook takes a new remote ref's base from the line the branch was cut from, the nearest merge-base among `origin/main` and each `origin/release/X.Y`, and CI stays the enforcing check (task-291, dl-185 C3 (i)) (prev 2.0 §1: the merge forward of a release line — rule 5's two kinds of colliding file and the bump in the merge commit, who runs it, when and where, the release/X.Y counterpart of the direct-commit list (task-290, dl-185 C1 (a)–(d); approver design-gate rulings 2026-10-22) (prev 1.9 §8: the trailer paragraph also carries the workflow `WingFoil-*` trailers (`-Instance`, `-Step`, `-Phase`, `-Element`, `-Item`), which a separate paragraph would unlink from their step (task-252, bug-236 amendment of 2026-10-11) (prev 1.8 §1: the quotation of `dev-loop.yaml`'s `done` merges into the task's integration branch, `git.merge(to: integration_branch, ff: false)`, which carries the on-branch commits into it (task-288, dl-159 A1.8, approver ruling D6) (prev 1.7 §1–§3, §6, §9: the release/X.Y maintenance line, the integration branch, the merge forward, a tag per line, push the add on both lines, the release worktree (task-286, dl-159 A1.6, dl-092 Action 3) (prev 1.6 §1: `dev-loop.yaml`'s `done` declares the on-branch order, approve, finalize and the bugs' sync before the merge (task-281, bug-313, approver ruling 2026-10-12 D6) (prev 1.5 §1: one worktree per task, no task commit in the shared working tree, a dev-loop task's approve/reject/finalize on its branch, `ingest/` for a `vision-change` run; §4: code-commit subjects (task-276, approver rulings 2026-10-10) (prev 1.4 §9: the governance check in CI, the opt-in pre-push hook, and which §§ the check enforces (task-208, dl-103 §1); 1.3 §2: who runs each main-sync in dev-loop and who resolves its conflicts (task-205 review F3, approver ruling 2026-10-09, option 2); 1.2 §7, task-260))))))))
ref: [P3.5, P3.7, REQ-SEC-01, REQ-SYS-08]
---

# Directive — Git conventions

**Date:** 2026-10-23

Custom WingFoil rule. Applies to **every role**: whoever writes a commit or names a branch in this
repository — a `developer` on a task branch, the `approver` whose `approve` commit an agent types, a
`facilitator` capturing a retrospective, a `product-owner` filing a decision-log. Bound in
`roles.yaml` `global:` (`dl-119-a-git-conventions-directive` Q2 (b)).

Ratified as `dl-119-a-git-conventions-directive` (`ready`), which gathers rules argued elsewhere. This
directive is where they are met; each decision-log is where its rule is argued, and stays `ready`:

- `dl-024-git-branch-tag-conventions` — branches and the version tag (§1, §3);
- `dl-152-ratify-the-intake-branch-prefix-and-the-commits-made-directly-on-main-and-settle-the-design-versus-qa-and-docs-overlap-in-git-conventions-section-1`
  — the `intake/` prefix, the operations made directly on `main`, and which phase prefix wins (§1);
- `dl-159-patch-a-released-minor-on-a-release-x.y-branch-merged-forward-into-main-alongside-the-next-minor-on-main`
  — the maintenance line `release/X.Y`, the integration branch, the merge forward, a tag per line and the
  release worktree (§1, §2, §3, §6);
- `dl-185-settle-the-undecided-parts-of-the-merge-forward-from-release-x.y-into-main-and-the-checks-of-a-release-x.y-line-before-its-first-push`
  — the merge forward's colliding files, its owner and timing, and the `release/X.Y` counterpart of the
  direct-commit list (§1);
- `dl-035-task-branch-sync-with-main` — staying current with `main` (§2);
- `dl-054-submit-commit-subject-bracket` — the `wf()` subject bracket (§4);
- `dl-094-one-author-identity-per-act` — whose identity an act carries (§5);
- `dl-101-id-allocation-across-refs` §1 — allocating a Memory id (§6);
- `dl-117-ai-attribution-policy` — AI co-authorship (§7);
- `dl-158-decide-whether-git-conventions-section-7-keeps-the-two-attribution-rules-task-256-wrote-beyond-dl-117-and-the-approver-s-rulings-which-team.agents-entry-signs-and-what-an-entry-without-an-email-writes`
  — which `team.agents` entry signs, and that the signing entry declares an email (§7);
- `bug-236-a-wingfoil-commit-amended-by-hand-with-a-separate-co-authored-by-paragraph-loses-its-wingfoil-version-trailer-and-reads-it-into-the-reason-block` — amending a tool-written commit (§8); the mechanism it protects is
  `dl-111-tool-signature-in-commits` (the `WingFoil-Version:` trailer) and `dl-067-reason-trailer-contract`
  (the `Reason:` block).

Do not re-open a choice here — if you believe a rule is wrong for your case, file a `decision-log`,
do not deviate. The general commit bullet of `code-quality` (conventional messages, one state change
per commit, REQ-SEC-02) stays there; this directive adds the git-specific rules on top of it.

## 1. Branches (`dl-024` rule 1, as amended by `dl-119` Q1 (b), `dl-152`, `dl-159` and `dl-185`; `dl-014` G2–G3)

- **The integration branch** (`dl-159` Decision 1). `main` and `release/X.Y` are the two lines: each is
  the integration branch of the work done for it, and a line is never brought up to date from the other
  (the merge forward below is the one way between them). Every other branch — `task/`, a phase branch,
  `ingest/`, `backlog/`, `fix/`, `docs/` — has one integration branch: `release/X.Y` for work on a patch of
  the released minor `X.Y`, `main` otherwise. A `dev-loop` task runs on `task/<task-id>`, cut
  from its integration branch; a workflow phase runs on its own branch, cut from its integration branch.
  Both merge into their integration branch with `git merge --no-ff`, never fast-forward, so every unit of
  work stays one revertible merge commit. The one exception is `intake/` (below), which reaches `main` by
  fast-forward.
- **One worktree per task** (`dl-014` G2; `dev-loop-rel-v0.2-plan` §2 *Branch, worktree & merge*,
  `dev-loop-rel-v0.2.2-plan` §1 *Per-task contract*). A `dev-loop` task runs in its own worktree on
  `task/<task-id>`, created at `start` and removed after the merge, before the branch is deleted.
- **No task commit in the shared working tree** (`dev-loop-rel-v0.2.2-plan` §1 *Per-task contract*).
  The main working tree is shared with other sessions, and its checked-out branch can change under a
  session that works there: no task commit is made in it, and `git branch --show-current` is checked
  before every commit — it must name the task branch, or the commit is not made.
- A branch name starts with one prefix from this **closed list**; an unlisted prefix is a deviation
  to fix, not a new convention:

  | Prefix     | Meaning                                                                          |
  |------------|----------------------------------------------------------------------------------|
  | `task/`    | one `dev-loop` task: `task/<task-id>`                                             |
  | `design/`  | one lifecycle phase (`sw-life-cycle` / `release-cycle`): `design/<phase>_<version>` |
  | `ingest/`  | one ingest main (`bug-ingest`, `decision-log-ingest`, `adr-ingest`, `service-ingest`), or one `vision-change` run, which files a `change-proposal` (`dl-132`) — always `ingest/`, never `design/` |
  | `fix/`     | an out-of-band fix outside a `dev-loop` task                                     |
  | `docs/`    | a documentation-only change                                                      |
  | `qa/`      | a quality gate (e.g. the `e2e-smoke` phase)                                      |
  | `backlog/` | scheduling work (filing or re-planning tasks and bugs)                          |
  | `release/` | the maintenance line of the released minor `X.Y`: `release/X.Y` (e.g. `release/0.3`), cut lazily when its first patch is needed — from the commit on `main` that closes the minor's retrospective, or from the tag `vX.Y.0` for an urgent patch — long-lived, never deleted while the line is supported (`dl-159` Decision 1) |
  | `intake/`  | a capture-only session that files Memory elements, never code; reaches `main` by **fast-forward**, because each of its commits is already one `wf()` operation and a merge commit adds nothing to them (`dl-152` Q2 (a)) |

- **The specific prefix wins** (`dl-152` Q3 (i)). A quality-gate phase (`e2e-smoke`) runs on `qa/`, a
  documentation phase (`user-docs`) on `docs/`, and every other lifecycle phase on `design/`, although
  `e2e-smoke` and `user-docs` are `release-cycle` phases too.
- **Commits made directly on `main`** (`dl-152` Q1 (A)). This **closed list** of operations may be
  committed on `main` itself, with no branch and no merge commit, because each is one `wf()` commit
  whose subject, `Approver:` and `Reason:` already are the record (P1.7, P1.10); each may equally be
  committed on the branch of the run that makes it (an `ingest/` or `backlog/` triage):
  1. the approver's `approve` and `reject` commits that are not part of a `dev-loop` task's run — triage
     (`[open → triaged]`), a task's `[pending → backlog]`, a decision-log's ratification;
  2. the triage mechanics that follow them: `assign`, `sync`, and the `amend` of the tasks that
     absorb an approved change;
  3. the `dev-loop` coordinator's `docs(plans)` bookkeeping of a plan already merged.

  Everything else — captures, new elements, content, code — goes through a branch. A commit on
  `main` outside this list is a deviation to fix, not a new convention.

  **The counterpart on `release/X.Y`** (`dl-185` C1 (c) (i)). The same closed list may be committed
  directly on `release/X.Y` for the elements that line owns, and those operations are never committed on
  `main` for them: they reach `main` by the merge forward (rule 4 below). A triage that decides an
  element's owning line is made on an `ingest/` or `backlog/` branch cut from that line.

  A `dev-loop` task's `approve`, `reject` and `finalize` are committed on `task/<task-id>`, before
  the merge, so the merge carries them into its integration branch with the rest of the task
  (`dev-loop-rel-v0.2-plan` §2 *Branch, worktree & merge*; the merge itself is `--no-ff`, `dl-014`
  G3): they are ancestors of that branch, not on its first-parent line. `finalize` is a declared verb
  (`dl-079-wf-commit-verbs-outside-the-declared-grammar` option (A), `spec-008-cli-grammar` §2).
  `dev-loop.yaml`'s `done` declares the same order
  (`bug-313-dev-loop.yaml-done-orders-approve-merge-then-set-state-done-while-practice-finalizes-the-task-on-its-branch-before-the-merge`):
  `memory.approve`, `element.set_state(done)` and `bug.sync_state(for_each: task.bug)` on the task branch, then
  `git.merge(to: integration_branch, ff: false)`, then `git.remove_worktree`; the linked bugs' `sync` commits of `done` are
  therefore on `task/<task-id>` too.

- **Two release lines: merge forward, never back** (`dl-159` Decision 2–3). This is the parallel-release
  rule `dl-092` Action 3 asked for; `dl-159` supersedes `dl-092`'s option (a), the partial freeze, and
  `dl-002` point 3, for every patch from 0.3.1 on. While a `release/X.Y` is open, `main` carries the next
  minor and `release/X.Y` the patches of `X.Y`:
  1. A fix lands on the oldest affected line first; that line is then merged into `main` with
     `git merge --no-ff`. A fix needed only on the newer line stays on `main`.
  2. Never cherry-pick or rebase between lines: a cherry-picked `approve` or `reject` is a second commit
     for one transition, with an `Approver:` line the approver did not write on that line (§2).
  3. `main` is never merged into `release/X.Y`.
  4. A Memory element changes state only on the line that owns its fix, and reaches `main` by the merge
     forward, so the merge never reconciles two transitions of one frontmatter.
  5. The merge forward conflicts on two kinds of file (`dl-185` C1 (a) (i)). On the version-bearing files
     — `package.json` `version`, `server.json`, `CHANGELOG.md`, the `dl-095` pin — the resolution keeps
     `main`'s values. On every versioned file both lines changed — a directive, a `.wingfoil` YAML or any
     document whose `version:` `doc-versioning` governs — the `version:` and `**Date:**` resolve to
     `main`'s, and a file whose merged content differs from `main`'s is bumped once more on `main`, in the
     merge commit itself, by a numeric increase and with the merge's date. Both resolutions are recorded in
     the merge commit. That bump is what lets the merge forward pass `test/lint/version-bump.test.ts`, with
     no change to either the test or its helper (`dl-185` C1 (d) (ii)): during the merge, that pending-change
     gate judges the change strictly against `main`'s `version:` at `HEAD`. The governance check's `config`
     rule, which compares the pushed range, is satisfied by the same bump in the merge commit.
  6. **Who, when, where** (`dl-185` C1 (b) (i)). The merge forward is run once per patch, by the
     coordinator of the patch's `release-publishing`, as that phase's last step, after the patch tag (§3),
     in a worktree of its own on `main`: a detached worktree at `main`'s head, since `main` is checked out
     in the shared working tree — never the shared working tree or the release worktree. A conflict it
     cannot resolve trivially is aborted, recorded, and resolved by a developer, as §2 does for syncs.
     Until a workflow declares the step, it is run by hand.
- **One clone, a long-lived worktree for the maintenance line** (`dl-159` Decision 5, `dl-101` §2 (a)).
  `release/X.Y` is worked in a long-lived worktree of this clone (e.g. `.wf2-wt/release-0.3`), kept while
  the line is supported — never a second clone. Worktrees of one clone share `refs/heads`, so
  `memory add`'s allocator sees the other line's `add` commits at once; a second clone sees them only
  after a push and a fetch.

## 2. Staying current (`dl-035`, `dl-159`)

- Bring a branch up to date with `git merge --no-edit <integration branch>` (§1: `main`, or
  `release/X.Y` on the maintenance line), run from inside its own worktree — never from the other line: a
  fix reaches `main` only by the merge forward (§1). **Never rebase a branch that carries `wf()`
  commits**: a rebase rewrites the approve/reject records the audit trail is made of (P1.2, P1.7, P1.10).
- A task branch merges its integration branch at two points: when the task **resumes** — after a reject
  or a park, and after `dev-loop`'s `done` fallback — before any `red` work; and again **before
  re-submitting**, if it has moved since. In `dev-loop` the first is
  run by the developer at the start of `red`, before `qa` writes a test; the second is the last action
  of `refactor`, so `refactor`'s checks and the review gate measure the tree that will exist after
  the merge, and `review` itself never merges.
- The developer runs both merges and resolves their conflicts; `qa` never resolves a conflict in
  implementation files. A conflict is never force-resolved: one that is not trivially resolvable is
  aborted and recorded in the task's Execution Notes, and the developer then resolves it — at `red`'s
  merge before `qa` starts; at `refactor`'s merge, when it cannot be resolved there, the task returns
  to `red`, since the conflict may touch `red`'s frozen tests.

## 3. Tags (`dl-024` rule 2, as amended by `dl-074-tag-must-be-on-pushed-main` and `dl-159` Decision 4)

A minor tag `vX.Y.0` is created on `main`, after the release's last phase branch has merged **and after
`main` has been pushed to `origin`**. A patch tag `vX.Y.Z` (Z ≥ 1) is created on `release/X.Y`, after the
patch's last phase branch has merged into it **and after `release/X.Y` has been pushed to `origin`** —
`dl-074`'s pushed-ref precondition, extended to the maintenance line. A version tag is never created on a
phase branch. The publish gate checks the pushed-line part of this rule, not which line a tag belongs
to: the tagged commit must be an ancestor of `origin/main` or of
`origin/release/X.Y`, `X.Y` being the tag's own major.minor, one rule for every `vX.Y.Z` (`task-265`;
`spec-015` §4 as `task-267` amends it).

## 4. Commit subjects (`dl-054`; code commits: `dev-loop-rel-v0.2-plan` §2)

- Subjects take the form `wf({type}): {verb} {ids}`.
- `approve`, `reject` and `deprecate` end in a `[{from} → {to}]` bracket, written with `→` as in
  `spec-004-mcp-surface-contract` §4.3. `add` and `submit` carry no bracket.
- The verbs are a closed, declared list — `add`, `submit`, `approve`, `reject`, `deprecate`,
  `start`, `finalize`, `sync`, `amend`, `park`, `assign` — each with its bracket rule and emitter
  (`dl-079-wf-commit-verbs-outside-the-declared-grammar` option (A), `spec-008-cli-grammar` §2).
- **Records that are not Memory operations** take a subject of their own, outside the `wf()` grammar, so
  `memory history` and the governance check never read them as Memory operations:
  `workflow: finalize <instance> <key>` (a phase record, `spec-017` §7.9),
  `workflow: adopt <instance> <key> <type>:<id>` (an adoption, `spec-017` §7.11, `dl-187`) and
  `agent: record <run-id>` (`spec-016` §4.4). Each is written by its command; the first two are empty commits.
- **Code commits on a task branch** (`dev-loop-rel-v0.2-plan` §2 *Commits*). A commit that is not a
  Memory operation takes the subject `test|feat|fix|refactor|docs({module}): {task.id} — <summary>`:
  `test` for `red`'s failing tests, `feat` or `fix` for `green` (a `fix` cites the bugs it closes, in
  parentheses), `refactor` for `refactor`, `docs` for documentation and the task's own Execution Notes.
  `{module}` is the `dna.yaml` module or area the change belongs to: e.g. `mcp`, `memory` (also
  `docs(memory)` for the Execution Notes), `docs`, `lint`. A fix made at review is a `fix` commit.

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
   pushed, the id is only a local proposal. While a `release/X.Y` is open this is mandatory on both
   lines, `main` and `release/X.Y`, not a recommendation (`dl-159` Decision 5).
3. **Re-scan immediately before merging.** On a collision, the element pushed later yields and is
   renumbered on its own branch, with a commit that names both ids; its `add`/`submit` history is kept.
4. **Cite no id before its element exists.** A draft, a data file or a plan refers to "the
   decision-log this proposes", never to a number, until `memory add` has created the file.
5. **Agents do not allocate in parallel worktrees.** They report the elements they propose, and one
   orchestrating session files them.

## 7. AI attribution (`dl-117` Q1 (B), Q2 (c); `dl-158` Rule 1 (a), Rule 2 (ii))

- **Which commits.** Every commit whose content an agent produced, in whole or in part — Memory
  operations performed on the approver's instruction included — carries AI co-authorship, **except
  `approve` and `reject` commits**: those record the approver's decision and carry no AI co-author even
  when an agent typed them (`dna.yaml` declares every agent `approval_authority: false`).
- **Which name.** The `Co-Authored-By:` identity is the agent entry declared in `dna.yaml`
  `team.agents`, written as its `name` and `email`: `Co-Authored-By: <name> <<email>>` (`bug-240`).
  A separate `AI-Model:` trailer, in the same trailer paragraph, carries the model identifier the
  running agent reports. A commit an agent co-authors ends with this trailer paragraph, the values read from
  `dna.yaml` (`wingfoil dna show team`), never typed from memory:

  ```
  Co-Authored-By: <team.agents name> <<team.agents email>>
  AI-Model: <the model identifier the running agent reports>
  ```

- **Which entry signs** (`dl-158` Rule 1 (a)). The entry `agent execute` launches signs that agent's
  commits: its `adapter` resolves it (`spec-016`). A hand session signs with the entry whose `name` is
  the agent's own; when no entry has that name, it signs with the first entry and says so in the commit
  body, naming the entry it used.
- **The signing entry declares an email** (`dl-158` Rule 2 (ii)). Every commit an agent co-authors keeps
  its `Co-Authored-By:` line (`dl-117` Q1 (B)); there is no form of it without an address. `dna.yaml`
  refuses an entry that declares an `adapter` but no `email`. A hand session whose signing entry has no
  `email` declares one first (`wingfoil dna update team.agents.<name> --entry-email <address>`, its own
  commit) and only then commits. An entry that signs nothing yet may still omit it (approver ruling F1).
- **Which email** (approver ruling F1, `task-256`). By default it is the address the agent's vendor
  publishes for co-authorship (for Claude, `noreply@anthropic.com`). A project may
  instead trace every agent under one account of its own: a machine account, in GitHub's id-qualified
  noreply form `<id>+<login>@users.noreply.github.com`, or any address the project owns. `dna.yaml`
  refuses a bare `<login>@users.noreply.github.com`: an unregistered login can be claimed by anyone, who
  would then be credited with every commit naming it. It also refuses, through the same rule, every
  identity the attribution audit rejects (`bug-261`): an empty or blank `name`, and an `email`
  on an RFC 2606 reserved top-level domain (`.test`, `.example`, `.invalid`, `.localhost`) or carrying
  git's guessed `.(none)` domain.
- **Who applies it.** Hand sessions — an agent writing commits with `git commit` — apply this section
  from `task-256-give-team.agents-an-email-and-state-the-intake-prefix-and-on-main-operations-in-git-conventions`'s
  merge on, in place of the model-named trailer they wrote before. A commit written by `wingfoil`
  keeps its `WingFoil-Version:` trailer and takes these two in the same paragraph (§8).
- **Past commits are not rewritten.** The policy applies from `dl-117`'s ratification. `agent execute`
  carries this rule to the agents it launches (approver ruling R20, `release-planning-rel-v0.3-plan`).

## 8. Amending a tool-written commit (`bug-236-a-wingfoil-commit-amended-by-hand-with-a-separate-co-authored-by-paragraph-loses-its-wingfoil-version-trailer-and-reads-it-into-the-reason-block`)

A commit written by `wingfoil` ends with a `WingFoil-Version: <semver> (<sha>)` trailer paragraph
(`dl-111-tool-signature-in-commits`). The same paragraph carries the workflow trailers when a step wrote
the commit — the other `WingFoil-*` trailers: `WingFoil-Instance:` and `WingFoil-Step:` on a `memory add
--workflow … --step …`; `WingFoil-Phase:`, `WingFoil-Instance:` and `WingFoil-Element:` or `WingFoil-Item:` on a
`workflow finalize` record; `WingFoil-Instance:`, `WingFoil-Step:` and `WingFoil-Adopted:` on a `workflow adopt`
record. To add a trailer to such a
commit (e.g. `Co-Authored-By:`), amend with `git commit --amend --no-edit --trailer "Co-Authored-By: …"`,
which joins the existing trailer paragraph. Never add a new paragraph after it: the trailer paragraph
would no longer be the last one, so a reader of the `Reason:` block (`dl-067-reason-trailer-contract`)
would take the `WingFoil-Version:` line into the reason, and the workflow deduction, which reads only the
final paragraph (`%(trailers:only)`), would lose the element's link to its step or the phase record. Two
limits:

- **Only a commit not yet pushed.** Amending a pushed `wf()` commit rewrites an audit record, which §2
  forbids.
- **Never an `approve` or `reject` commit.** §7 excludes them from AI co-authorship, so there is no
  trailer to add.

## 9. Checks on pushed commits (`dl-103` §1)

- **CI is the enforcement point.** `.github/workflows/governance.yml` runs
  `scripts/check-governance.cjs` over every range pushed to `main` or to a `release/X.Y` line and every
  pull request into either (`task-267`). It
  checks §4's `wf()` subjects and brackets (not its code-commit subjects), the `Reason:`/`Approver:`
  shape (`dl-067`), approval authority (§5, `dl-094`), state legality and the verb each transition
  uses, status changes outside a `wf()` operation (`dl-139`), an approve whose `supersedes:` target is
  not `superseded` at `HEAD` (`bug-218`), and §7's exclusion of `approve` and `reject` (`bug-307`),
  enforced as: those commits carry no `Co-Authored-By:` and no `AI-Model:` line at all, anywhere in the body,
  whoever it names. With `--base` only (CI passes it), it also checks the version bump of the four versioned
  config files over the range (`bug-249`); a whole-history run has no range and does not judge it. Each rule
  fails only commits after the one that introduced it; older history is reported, never rewritten (§2, §8).
  Beside it, a warn-only lint (`scripts/lint-claims.cjs`, `dl-097` §2 (b)) annotates claims with no command in
  the Memory documents the range changed.
- **Branch protection makes it binding.** Requiring the `governance` status on `main` is a repository
  setting only the approver changes (`dl-103` §1 (C)), recorded as a `service` element.
- **The pre-push hook is a local convenience** (`dl-103` §1 (B)). Opt in once per clone with
  `git config core.hooksPath .githooks`; `.githooks/pre-push` then runs the same check over the commits
  about to be pushed (it needs `npm run build`). It is per clone and `git push --no-verify` skips it, so
  it never replaces CI. In this repository's worktrees the setting is shared configuration: the approver
  decides whether it is set.
- **The hook's base** (`dl-185` C3 (i)). For a remote ref that already exists the hook checks from the commit
  it replaces. For a new remote ref it takes its base from the line the branch was cut from (§1): the
  merge-base of `HEAD` nearest to it among `origin/main` and each `origin/release/X.Y` (local tracking refs,
  no fetch; the pushed ref's own tracking ref is skipped; a tie keeps `origin/main`) — so `origin/main` for a
  branch of `main`, `origin/release/X.Y` for a branch of a patch line, and `origin/main` for a new
  `release/X.Y` itself. CI has no range on a branch-creating push and checks the whole history; the
  difference is accepted, because the hook is a convenience and CI stays the enforcing check.

> Source: `dl-119-a-git-conventions-directive` (Actions 2–4), `dl-117-ai-attribution-policy` (Action 2),
> `dl-158` (Action 2), `dl-159` (Action A1.6, §1–§3, §6), `dl-185` (C1, §1),
> `dl-101-id-allocation-across-refs` (Action 2),
> `dl-103-governance-enforced-outside-the-agent` §1 (§9), `dl-185` C3 (i) (§9, the hook's base). Features P3.5, P3.7; REQ-SEC-01 (every state change
> carries a git identity), REQ-SYS-08 (bindings by role).
