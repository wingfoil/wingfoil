---
id: "dl-106-memory-writes-on-a-dirty-tree"
type: decision-log
title: "`memory submit` sweeps uncommitted edits of the element into a commit whose subject names only the transition; a safe-write contract (declared content, dry run, target branch) for the CLI and any future writer"
status: ready
context: "retrospective"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

The v0.2 retrospective (`retro-v0.2`) files this decision-log. It joins two dispositions, both
targeted at v0.3:
- "`submit` still sweeps uncommitted edits into a state-looking commit", found by using WingFoil
  outside this repository and reproduced on `wingfoil@0.2.1`;
- "a future UI or automation needs safe writes: dry run, target branch, refusal on a dirty tree",
  from the retrospective's completeness pass.

It was kept out of the v0.2.2 patch on purpose, because it changes command behaviour.

**What v0.2 already fixed.** `bug-076` and `bug-078` (both `closed`) made every write refuse while
its target carries modifications the command does not own. That is `dl-080`'s ratified option (B),
implemented as `requireUnmodifiedTarget` in `src/core/write-guard.ts`. The guard is per path, never
per tree. `commitPaths` commits with `git commit --only`, so an unrelated dirty file cannot ride
along (`bug-027`), and `dl-080` rejected a per-tree refusal (its option D).

**What it deliberately left open.** `memory submit` is exempt. `DocumentScope` in
`src/memory/frontmatter-edit.ts` gives it `carries-content`: "the operation is defined as filling
content *and* moving state" (`spec-010-memory-frontmatter-schema`, § "Field-write ownership").
The consequence is that whatever sits uncommitted in the element's file when `submit` runs goes into
the submit commit. Its subject, `wf(<type>): submit <id>`, names neither the content nor the
transition. The subject carries no `[from → to]` bracket, unlike `approve`'s.

**Reproduction on `wingfoil@0.2.1`.** This uses a throw-away project. The identity comes from the
environment only; `git config` is never run.

```sh
T=$(mktemp -d) && npm install --silent --prefix "$T" wingfoil@0.2.1 && W="$T/node_modules/.bin/wingfoil"
export GIT_AUTHOR_NAME=Scratch GIT_AUTHOR_EMAIL=scratch@example.invalid \
  GIT_COMMITTER_NAME=Scratch GIT_COMMITTER_EMAIL=scratch@example.invalid \
  GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=Scratch \
  GIT_CONFIG_KEY_1=user.email GIT_CONFIG_VALUE_1=scratch@example.invalid
cd "$(mktemp -d)" && git init -q -b main && git commit -q --allow-empty -m init
"$W" init --template Kanban
"$W" dna add team.members --value Scratch --entry-email scratch@example.invalid --entry-roles approver
"$W" memory add --type release --title "First release"
F=docs/memory/release/release-001.md
printf 'Scope: the first slice.\n' >> "$F"          # an edit nobody committed
"$W" memory submit release-001
git show HEAD -- "$F" | grep '^[-+][^-+]'
printf 'Second uncommitted line.\n' >> "$F"
"$W" memory approve release-001 --reason "scope agreed"; echo "exit $?"
```

Observed results:
- `submit` exits 0 and commits `wf(release): submit release-001`. The diff is `-status: draft`,
  `+status: pending` and `+Scope: the first slice.`, so the body line is committed under a subject
  that does not mention it.
- `approve` on the same kind of edit refuses with exit 1: "refusing to commit
  docs/memory/release/release-001.md: it carries uncommitted modifications this transition does not
  own [git status ' M'] — the body."
- The `GIT_CONFIG_*` variables are needed only because the authority check reads `git config`
  while the author comes from the environment (`bug-149`).

**Why this is more than a message problem.** The pieces a writer other than the CLI needs do not
exist. A future UI (`dl-008` keeps it post-MVP), a scheduled job (`dl-105`) or an agent through the
engine all need three of them:
- **A dry run.** `grep -rniE "dry.run|dryRun" src` finds nothing. The same pattern over `test/`
  finds `npm pack --dry-run` calls, so the pattern works.
- **A choice of branch.** Every verb commits to whatever `HEAD` is.
- **A predictable refusal.** Today the rule is uniform except for `submit`.

## Decision

Every write through WingFoil declares, before and in its commit, everything it changes. The open
points follow, each with a recommendation.

**W1 — `submit` and uncommitted content.**
- **(a) Keep `carries-content`, declare it.** The subject gains the transition bracket, `wf(<type>):
  submit <id> [draft → pending]`. When content changed as well, the body names what changed, using
  the same `describeDocumentChanges` that already words the refusal: "the body", or a list of
  frontmatter fields.
- **(b) Refuse on a dirty element, like the gated verbs.** Content must be committed first, in a
  `docs` commit, and `submit` becomes state-only. `spec-010`'s ownership table changes, and so does
  the long-standing practice that a submit carries the element's content.
- **(c) Two commits per submit:** one for content, one for the transition.

*Recommendation: (a).* The harm is a commit that does more than its subject declares, and (a)
removes exactly that while keeping `submit`'s specified purpose. (b) turns every submit into two
user actions. (c) breaks the one-commit-per-operation rule that `memory history` relies on.

**W2 — Dry run.** Every verb registered with `mutates: true` in `CORE_MODULES` (`src/core/index.ts`)
accepts `--dry-run`. It prints the transition, the paths and the diff that the commit would contain,
writes nothing and exits 0. When the real run would refuse, it exits with the refusal's code.
*Recommendation:* adopt. It is the one piece every other writer needs first.

**W3 — Target branch.**
- **(a) `--branch <name>`:** commit to a named branch without checking it out, using `git
  commit-tree` and `update-ref`, so the user's working tree is never touched.
- **(b) A declared policy:** `memory.yaml` declares, per type, which branch patterns may receive its
  transitions. For example, `task` transitions go on `task/*`, as in `dl-014` G1, and the release tag
  goes on `main` (`dl-024`). The verb refuses elsewhere.
- **(c) Neither:** the writer checks out the branch itself.

*Recommendation: (b) now, (a) when a non-CLI writer exists.* (b) turns into an enforced rule the
branch conventions that are today only written down. (a) is only worth its plumbing once something
writes without a human at the terminal.

**W4 — The scope of a dirty-tree refusal stays per path.** `dl-080`'s ruling holds: an unrelated
dirty file never blocks a verb. `bug-118` (`open`) remains the known hole in that guard, a path
beyond a symlink.

## Rationale

- **An audit trail must say what it did.** `bug-076` was a release blocker because an approval
  carried content under an approver's name. A submit carrying content is legitimate under `spec-010`,
  but a subject that hides it is the same defect in a milder form.
- **Automation raises the stakes.** A human who runs `submit` knows what they edited. A UI, a
  scheduled job or an agent does not, and a dry run is how it finds out before it commits.
- **W3 (b) costs a config field, not plumbing.** It enforces conventions that already exist as
  decision-logs, and it is the cheaper of the two branch mechanisms.

## Actions

On ratification, with W1–W3 chosen in the approve commit's `Reason:`:
1. Amend `spec-010-memory-frontmatter-schema` § "Field-write ownership" (W1) and
   `spec-008-cli-grammar` (the `submit` subject and body; `--dry-run`, W2).
2. Amend `spec-001-memory-yaml-schema` for a per-type branch policy under W3 (b).
3. Amend `docs/cli-reference.md` and the scaffolded templates' wording in the same change (compare
   `bug-146`).

v0.3 `release-planning` (`build-backlog`) derives the tasks. None are created here.

**Note (2026-10-07, approver).** Action 2 (W3 (b)) is deferred to v0.4: `task-223` stopped at design in wave 3
and was deprecated. A per-type branch list would only be the union of the prefixes this repository practises
(its design notes count them), so it would add little; the rule worth enforcing, `dl-014` G1, needs a policy per
starting state, and `dl-159`'s maintenance lines change the branch model it must describe. v0.4 planning
re-creates the task from `task-223`'s Execution Notes. W1 and W2 are delivered (`task-209`, `task-210`).

## Relations

- **Filed by:** `retro-v0.2` (external-use finding "`submit` sweeps uncommitted edits", and the
  completeness-pass proposal for safe writes).
- **Builds on:** `dl-080` (option B, ratified), `bug-076`, `bug-078` (closed), `bug-027`.
- **Related:** `bug-118` (open), `bug-146` (templates promise that `submit` fills content),
  `bug-149` (authority and author read different identities), `dl-079` (the `wf()` grammar),
  `dl-008` (UI), `dl-105` (scheduled writers), `dl-014` G1 and `dl-024` (branch conventions).
- **Traceability:** P1.6, P1.10; REQ-SEC-02, REQ-INT-04.
