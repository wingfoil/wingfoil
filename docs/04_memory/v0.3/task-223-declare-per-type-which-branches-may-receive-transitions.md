---
id: "task-223-declare-per-type-which-branches-may-receive-transitions"
type: task
title: "Declare per type which branches may receive its transitions, and refuse elsewhere"
status: backlog
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "core", "memory", "git"]
ref: "dl-106"
bug: []
depends_on: ["task-210-add-dry-run-mutating-verb-through-commit-primitive"]
tmpl_version: 260703
---

## Description

Branch conventions (`task` transitions on `task/*`, `dl-014` G1; releases on `main`, `dl-024`) are written down only. Ratified W3 (b): `memory.yaml` declares branch patterns per type and the verb refuses on other branches.

## Acceptance Criteria

- (red-first) with `branches: ["task/*"]` on `task`, `memory approve` on `main` exits 1 naming the pattern; on `task/x` it succeeds; a type with no declaration is unrestricted.
- (red-first) a detached HEAD is refused for a restricted type.
- (characterization) `spec-001` carries the key; this repository's `memory.yaml` declares the practised patterns only if the approver confirms them in design (version bump).

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-106 W3 (b), Action 2 (spec-001).
- **Features:** P1.13.
- **Notes:** Proposal key: C25.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the parallel-release-lines decision (2026-10-07):** `dl-159` (`in-discussion`, to be ratified before the
  `v0.3.0` tag) opens `release/X.Y` maintenance lines beside `main`: patches land on `release/X.Y` and are merged
  forward into `main` with `--no-ff`, never cherry-picked or back-merged; patch tags go on the pushed `release/X.Y`.
  The per-type branch patterns this task declares must not refuse the maintenance line: the pattern grammar accepts
  `release/*`, and the patterns this repository declares (if the approver confirms them in design) admit a release's
  and a bug's transitions on `release/X.Y` as on `main`, and `task/*` branches cut from either line. A `wf()` commit
  made on `release/X.Y` reaches `main` through a merge commit; the check runs at commit time on the current branch,
  so do not make it read the branch from history. `dl-159` Decision 3 (an element changes state only on the line
  that owns its fix) is not this key's job; the `release` `branch` field is `dl-159` A2.3, deferred.

## Execution Notes

### Design (architect) — 2026-10-07, STOPPED for an approver ruling (batch notes W3 B2)

Design only. No test, no code, no config and no spec edit is made until the approver rules on D1–D9 below.

- **Dependencies (dl-015).** `task-210` is `done` (`grep -n "^status:" docs/04_memory/v0.3/task-210-*.md`). Its
  Design notes defer nothing to this task (`grep -n "223\|branch" docs/04_memory/v0.3/task-210-*.md` → only coverage
  "branches" columns). What it hands over is structural: every transition verb writes through `writeAndCommit`
  (`src/storage/commit.ts:213`), reached from `commitMemoryTransition` (`src/core/memory-transition.ts:695`); a check
  placed before that call refuses a `--dry-run` identically.
- **Specs and decisions.** `spec-001-memory-yaml-schema` `approved`; `dl-106` `ready` (W3 (b), Action 2); `dl-014` and
  `dl-024` `ready`; `dl-159` **`in-discussion`** (`grep -n "^status:"` on each). `spec-001` has no branch key today
  (`grep -c branches docs/04_memory/design/specs/spec-001-*.md` → 0), nor have `src/memory/schema.ts` or
  `.wingfoil/memory.yaml` (`grep -n branches` → nothing). No branch reader exists in `src/`
  (`grep -rn "symbolic-ref\|abbrev-ref\|show-current" src` → nothing).

#### Finding — practice does not fit a per-type pattern

Measured on `4fd77678`: a first-parent walk of `main`; a non-merge first-parent `wf()` commit counts as made on
`main`, and the commits a first-parent merge `M` brings (`M^1..M^2`) count as made on the branch its subject names
(`Merge branch '<b>'`). Fast-forwarded branches (`intake/`, `dl-152` Q2 (a)) are indistinguishable from `main` and are
counted there. Transition verbs only (`submit`, `approve`, `reject`, `deprecate`; `park` has no commit yet):

| Type | Branches the type's transitions were made on (count of approve brackets where telling) |
|------|----------------------------------------------------------------------------------------|
| `task` | `pending → backlog`: `design/*` 122, `main` 34, `backlog/*` 5, `ingest/*` 4, `task/*` 3 · `in-review → approved/in-progress` and `in-progress → in-review`: `task/*` only (212 + 28 + 78) · `submit` (draft): `task/*`, `design/*`, `main`, `backlog/*`, `ingest/*` |
| `bug` | every prefix: `main`, `design/*`, `backlog/*`, `ingest/*`, `fix/*`, `task/*`, `docs/*`, `qa/*` |
| `decision-log` | `design/*`, `main`, `backlog/*`, `ingest/*`, `docs/*`; one `deprecate` on `task/*` |
| `release` | `design/*` (planning, submit, publishing phases); one `mark-released` on `main` |
| `release-line` | `main` (3 commits, `rl-v1`) |
| `plan` | `main`, `design/*`, `ingest/*`, `docs/*`, `qa/*` |
| `adr` | `design/*`, `main`, `ingest/*` |
| `tech-spec` | `design/*`, `task/*` |
| `service` | `main`, `design/*`, `ingest/*`, `task/*` |

Consequence: the AC's example, `task: branches: ["task/*"]`, matches `dl-014` G1 for the `dev-loop` edges but would
refuse the 156 `pending → backlog` approvals made on `main` and `design/*` — the approvals `git-conventions` §1
("Commits made directly on `main`", item 1) and `release-planning` make by design. A per-type list can only be the
**union** of practice, which for `bug` is the whole closed prefix list and for `task` excludes only `fix/`, `docs/`, `qa/`.

#### Proposed design (for ruling)

- **Key.** `MemoryTypeEntry.branches` — optional list of patterns (`z.array(z.string()).min(1).optional()`); absent =
  unrestricted (AC 1). No `defaults.branches`: like `amendable`, never inherited (an inherited policy would silently
  restrict every type a project adds). Read from the `memory.yaml` committed at `HEAD` (`prepared.memoryYaml`,
  `dl-080` (B)), like the machine.
- **Pattern grammar.** Matched against the whole short branch name (`refs/heads/` stripped). Literal characters, plus
  `*` = one or more characters other than `/`. So `task/*` admits `task/task-223-…`, `release/*` admits `release/0.3`,
  `main` admits only `main`. No `**`, no negation, no regex. Load-time validation (`E_INVALID_MEMORY_SCHEMA`): empty
  list, empty pattern, whitespace, `**`, a leading/trailing `/`, `..`.
- **Current branch.** Read at command time from the working tree's `HEAD` — `git symbolic-ref --quiet --short HEAD`
  (per worktree) — never from history (`dl-159` handover: a `wf()` commit made on `release/X.Y` reaches `main` by a
  merge; the merge is not re-checked). A new reader in `src/storage/git-read.ts`.
- **Detached HEAD (AC 2).** `symbolic-ref` fails → no branch → refused for a type that declares `branches`, allowed
  for one that does not. No override flag; `--branch` (W3 (a)) stays out (`dl-106`: "when a non-CLI writer exists").
- **Which writes.** Every state-moving verb: `submit`, `approve`, `reject`, `deprecate`, `park`, and the
  `supersedes:` finalize commit of the superseded document (checked before either commit is written, as
  `checkMemoryTransition` already is). Not `memory add` (creates, moves nothing) and not `memory amend` (a self-loop;
  the 54 task amends on `main` are `git-conventions` §1 item 2).
- **Where and in what order.** Inside `checkMemoryTransition` (`src/core/memory-transition.ts:616`), first, before
  confinement: it runs for every document of a command before any write, so the two-commit `approve` refuses whole,
  and it runs before `writeAndCommit`, so `--dry-run` refuses with the same code. Usage, identity, lookup and the
  approver-authority check stay before it (`spec-006` §7). Code `VALIDATION` (exit 1, `src/core/exit-code.ts:41`); no
  new code, so no `spec-009` change. Message (AC 1, "naming the pattern"):
  `refusing to approve <id>: memory.yaml declares <type> transitions only on branches matching task/*, main; the current branch is 'x'`
  (detached: `…; HEAD is detached (on no branch)`).
- **`release/X.Y` lines (`dl-159`).** Admitted by the grammar (`release/*`). In this repository's lists `main` and
  `release/*` always appear together — what is legal on one integration line is legal on the other — so a `release`'s
  or a `bug`'s transitions on `release/0.3` pass as on `main`, and `task/*` admits task branches cut from either line.
  Not done here: `dl-159` Decision 3 (one owning line per change) and the `release` `branch` field (A2.3, deferred).
- **Where the policy lives.** `src/memory/schema.ts` (`MemoryTypeEntry`), `spec-001` § `MemoryTypeEntry` (the key, a
  `branches` paragraph beside `amendable`, the worked examples, a dated Revision note) — a **pending amendment**,
  uncommitted, for the coordinator; `.wingfoil/memory.yaml` header comment + per-type lines if D1 says so, `version`
  2.5 → 2.6 (this task is the only B2 writer); `docs/cli-reference.md` (the refusal, under the transition verbs).
  The `init` scaffolds declare nothing (unrestricted).

#### Decisions the approver must take

- **D1 — what this repository declares** (AC 3):
  (a) nothing — the key ships, this repository stays unrestricted;
  (b) **the practised per-type unions** (recommended): every list = `main`, `release/*` plus the prefixes measured
      above, and `intake/*` for the types an intake session files —
      `release-line: [main, release/*, design/*]`;
      `release: [main, release/*, design/*]`;
      `task: [main, release/*, task/*, design/*, backlog/*, ingest/*, intake/*]`;
      `bug: [main, release/*, task/*, design/*, ingest/*, fix/*, docs/*, qa/*, backlog/*, intake/*]`;
      `decision-log: [main, release/*, design/*, ingest/*, backlog/*, docs/*, task/*, intake/*]`;
      `plan: [main, release/*, design/*, ingest/*, docs/*, qa/*, backlog/*]`;
      `adr: [main, release/*, design/*, ingest/*, intake/*]`;
      `tech-spec: [main, release/*, design/*, task/*]`;
      `service: [main, release/*, design/*, ingest/*, task/*, intake/*]`.
      Gain: a detached HEAD and an unlisted prefix (`git-conventions` §1: "a deviation to fix") are refused; `release`
      transitions leave `task/*`, `fix/*`. It does **not** enforce `dl-014` G1.
  (c) a per-from-state form as well, e.g. `task: branches: { in-progress: [task/*], in-review: [task/*] }` (states not
      listed unrestricted), which is the only shape that enforces `dl-014` G1 without refusing the `pending → backlog`
      approvals on `main`. Adds an AC (and probably M → L); recommended as a follow-up decision-log instead.
- **D2 — grammar**: `*` within one segment, whole-name match, no `**` (above). Confirm.
- **D3 — scope**: the five transition verbs + the supersede finalize; `add` and `amend` exempt. Confirm.
- **D4 — detached HEAD**: refused for restricted types only, no override. Confirm.
- **D5 — refusal**: `VALIDATION`, exit 1, checked first in `checkMemoryTransition` (after usage, identity, lookup,
  authority). Confirm, or prefer `CONFLICT`.
- **D6 — `release/*` now, while `dl-159` is `in-discussion`**: declare it now (no `release/*` branch exists, so it
  admits nothing yet, and it must be in the tree `v0.3.0` is cut from — `dl-159` Rationale), or wait for ratification.
  Recommended: now.
- **D7 — no `defaults.branches`** (no inheritance). Confirm.
- **D8 — `intake/*`**: included for the capture types in D1 (b) (fast-forwarded intake commits are invisible in the
  measurement, so this is from `git-conventions` §1's definition, not from counts). Confirm the type set.
- **D9 — ordering with the pinned build**: the approver's `npm run -s wingfoil` (0.2.1) ignores the key; only the code
  version (task sessions, the coordinator) enforces it until the pin advances. Noted, no action proposed.

#### AC classification (provisional, pending D1)

| AC | Classification | Why |
|----|----------------|-----|
| 1 `branches: ["task/*"]` refuses `approve` on `main` (exit 1, names the pattern), passes on `task/x`; undeclared type unrestricted | red-first | no key, no branch read (`grep` above) |
| 2 detached HEAD refused for a restricted type | red-first | same |
| 3 `spec-001` carries the key; this repository declares the practised patterns if confirmed (version bump) | characterization (config) | `spec-001` is a pending amendment (uncommitted); `memory.yaml`'s declaration is pinned by a test that every transition this repository's practice needs (the D1 table) is admitted, which passes on first run against the schema once AC 1 lands. Under D1 (c) a third red-first AC is added. |

Also planned (refactor): a `--dry-run` row proving the refusal precedes the commit point (AC 1 on `--dry-run`), and the
two-document `approve` (supersede) refused whole when the superseded type's policy refuses.

### Deferred (approver, 2026-10-07)

The design above was done on `task/task-223-…` (commit `3add51e0`) during wave 3 batch B2 and is copied here. The
approver deferred the task to v0.4: no WingFoil build up to 0.2.2 checks the branch and no bug reports a transition
on a wrong branch; a per-type list can only be the union of the practised prefixes, so it would add little; the one
rule that matters (`dl-014` G1, development transitions on `task/*`) needs the per-starting-state variant (D1 (c));
and `dl-159`'s maintenance lines change the branch model this policy has to describe. The task is deprecated rather
than moved, because a task's path carries its release; v0.4 planning re-creates it from these notes.
