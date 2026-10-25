---
id: command-baseline
name: "Which baseline a command reads and writes"
type: directive
kind: custom
title: "Which baseline a command reads and writes"
tags: [custom, determinism, git, baseline]
ref: [REQ-SEC-02, REQ-STATE-02, REQ-SYS-07]
version: "1.6"
---

# Directive — Which baseline a command reads and writes

**Date:** 2026-10-10

Custom WingFoil rule. Applies to anyone adding or changing a command, a `src/core` operation, or an
MCP Tool — every surface, because both surfaces run the same core function (REQ-SYS-05,
`spec-006-core-domain-api`).

Ratified as `dl-080-which-baseline-each-command-reads` (`ready`) option **(B)**. This directive is
where the ruling is met; the decision-log is where it is argued. Do not re-open the choice here — if
you believe the rule is wrong for your case, file a `decision-log`, do not deviate in a TSDoc.

## Who this reaches, and which text is normative

- **Normative text: `spec-006-core-domain-api` §6** (`dl-085-how-tool-implementation-rules-reach-anyone-outside-this-repo`,
  `ready`, option (B)). That section states the rule for every `CoreOperation`, and it is what a
  reader of the specs meets without any role binding. This directive is the implementer's working
  form of it — the arguments, the primitives, the cases already decided — and it points there. Where
  the two disagree, `spec-006` §6 wins and this directive is the one to correct.
- **Audience** (`dl-085` option (A)). This directive reaches an agent executing under `developer`,
  `architect` or `reviewer` in **this repository's own** `.wingfoil/roles.yaml`, which auto-loads it
  (P3.6). It reaches nobody else: a contributor arriving through `COLLABORATION.md` meets it only by
  opening this file, and a project scaffolded by `wingfoil init` does not receive it. That is by
  design: the rule is about implementing `wingfoil` commands, which a user's project never does, so
  shipping it as a built-in directive (`dl-085` option (C)) is declined for this directive. Anyone
  implementing a command outside this configuration — in a fork, a contribution, a later
  release-line — is bound by `spec-006` §6, not by this file.

## The rule — both halves, and neither alone

- **Read half.** *A read that gates an operation resolves against the repository as committed at
  `HEAD`.* A read gates when its answer can change **whether the command refuses** or **what the
  command writes** — authority (`dna.yaml`), the state machine and the type registry
  (`memory.yaml`), the role catalogue and bindings (`roles.yaml`), the element's own committed
  `status`, and the id or path a verb is about to create.
- **Write half.** *A write refuses while its target carries modifications the command does not own.*
  Not "commit only my hunk": there are two candidate baselines on disk (index and working tree) and
  partial staging does not say onto which. Refuse, name what is different, and let the author decide.

Half a rule prevents half the class. `dl-080`'s own table splits its five founding instances across
both halves — `bug-076` and `bug-078` were fixed by refusing a write, `bug-079`, `bug-081` and
`bug-082` by moving a read to `HEAD` — and of the four found since (`bug-085`, `bug-086`, `bug-087`,
`bug-088`) one, `bug-087`, is a **read** of the working tree deciding the **path a write created**,
and another, `bug-088`, is a write with no guard at all, overwriting a clean committed file. Which
half a defect lands on is not obvious from the defect; state both halves or you have stated neither.

## Two baselines for a gating read — and no third

A read that decides anything resolves at `HEAD`, **whatever it is about** — including a read that
only resolves which file or element the argument names, when failing to resolve it is itself a
refusal. Do not introduce a sub-kind of gating read ("this one merely resolves a name") to justify
the working tree.

**The one other category: a read that predicts a filesystem effect resolves on the filesystem.**
Ratified as `dl-086-a-guard-over-a-filesystem-effect-resolves-on-the-filesystem` (`ready`, adopted
as proposed): *a read whose purpose is to predict the target of an imminent filesystem mutation
resolves on the filesystem; every other gating read keeps `HEAD`.* The confinement and symlink
guards that run before `unlinkSync` and `writeFileSync` are this read (`requireConfinedTarget`,
`resolveConfinedMemoryPath`, `requireInspectableTarget`; `task-102`, `task-105`, `task-106`,
`task-131`). `HEAD` cannot answer their question: the syscall follows the symlinks **on disk** and
consults no commit, so a `HEAD`-resolved guard would permit an unlink through an uncommitted symlink
and refuse a crossing a committed-but-replaced one can no longer make. `dl-080` arbitrates what the
project *declares*; this read asks what a syscall *will touch*, which no commit records.

What that category does **not** license:

- **Not a name resolution next to a mutation.** The test is the read's *purpose* — predicting the
  syscall's target — not its proximity to one. `directiveRemoveFn`'s step 3 resolves a directive
  **name**, which is `dl-080`'s subject, and stays owed to `HEAD` (`bug-108`, below).
- **Not option (C) under another name.** (C) sorted reads by what they *produce*; this sorts by what
  the guarded *effect* touches, and permits one shape only.
- **Not an adversarial defence.** Between the read (`realpathSync`, `lstatSync`) and the syscall
  (`unlinkSync`, `writeFileSync`) there is a time-of-check-to-time-of-use window that **no path-based
  API closes**; only file-descriptor primitives (`openat`, `O_NOFOLLOW`) would, and Node's `fs`
  exposes none. The guard turns a routine, self-inflicted loss — a store aliased into shared space, a
  document linked into a folder — into a refusal. Name that residual as a limit wherever you cite
  the guard; never cite it as a defence against an attacker.

There is no third category. The ratification of `dl-080` closes this directly. `dl-080` offered
exactly one option that classified reads rather than applying one baseline — **(C)**, which sorted
them by *what a read produces*: a read whose outcome becomes a durable attestation resolves at
`HEAD`, while "a read that merely gates an operation whose result is itself committed, visible and
recoverable may read the working tree". The approver's `Reason:` (`333a3c0f`) withdraws it, and on a
ground worth reading precisely: (C) "is foreclosed by the decision to treat `bug-082` as blocking,
since (C) leaves that bug open by design; it is withdrawn rather than reshaped". Note what follows
for a `directive remove`-shaped read: under (C) *as written* it would have been **permitted**, since
what it gates is a deletion that is itself committed and recoverable. Withdrawing (C) withdrew that
permission. A classification by what a read is *for* — "this one only resolves a name" — is not even
(C); it is a further category the ratified rule does not contain, arriving after the only classifying
option on the table was refused.

The test in (B) is mechanical — *can this read change whether the command refuses, or what it
writes?* — and that is its whole value. If it can, the read resolves at `HEAD`, unless its purpose
is to predict an imminent filesystem effect.

**Where the shipped code still deviates — and it has an owner.** The Memory transition verbs used to
find the document their `<id>` names by scanning the working tree and to take the current `status`
from the working-tree frontmatter (`bug-187`); since `task-247`, `prepareMemoryTransition` resolves
`HEAD` once and reads both there (`findMemoryDocumentByIdAtRev`). The working tree supplies the
content to commit, is checked to be the same element `HEAD` records (present, same `id` and `type`),
and is otherwise read only to word a refusal — the pattern the paragraph after next prescribes. The case left, argued in full here, is `directive remove`. `directiveRemoveFn`
(`src/core/index.ts`, step 3 of its TSDoc: "This read stays on the **working tree**, deliberately")
resolves the directive it is asked to delete from the working tree, on exactly the "this read only
resolves a name" argument refused above — and that read returns a domain `NOT_FOUND` at exit `1`,
which is a refusal, which is a gate. It is **not** a filesystem-effect read: the confinement guard
that follows it is, and the two sit a few lines apart under different baselines on purpose. Nothing
can be destroyed by step 3: `requireUnmodifiedTarget` still decides whether the file may be deleted,
after it. So the deviation costs a message, not data — which is why it is a defect to be repaired
under this rule rather than an exception written into it. The measured trade runs both ways (an
untracked file gets a better message today; a directive committed at `HEAD` but deleted in the
working tree gets a false `unknown directive`), and that symmetry is the argument for deciding it
once, here, instead of per command. Filed as
**`bug-108-directive-remove-resolves-its-target-on-the-working-tree`** (`open`), still owed to `HEAD`
after `dl-086`; its repair is the paragraph below rather than a plain move to `HEAD`.

**The working tree may be read to *explain* a refusal, never to decide one.** When resolving at
`HEAD` would produce a true refusal with a poor message — a file that exists on the author's screen
but in no commit — the repair is to say so in the message ("no commit of this repository contains
it; it is present in the working tree — commit it first"), not to move the decision onto the working
tree. A refusal that reads the working tree for its wording still cannot be reached by an
uncommitted state. (A filesystem-effect read is a different clause: there the filesystem **decides**,
because only the filesystem can.)

## Consequences already decided — do not re-derive them

- **A refusal exits `1`**, never `2`: it is a well-formed invocation failing on business logic
  (`spec-005-cli-command-contract` §1, ruled on `bug-076`). Exit `2` stays for malformed invocations.
- **Make the working-tree value unreachable rather than guarded.** `task-090`'s shape, followed by
  `task-091`: remove the parameter that could carry a working-tree document, so no later caller can
  reintroduce it. A guard that merely checks is one refactor away from being skipped.
- **A path or target that does not resolve is refused, never created** — `dl-081`, option (E),
  sub-section "`--field` holds the full path, and what that settles": "a path that does not resolve
  must be **rejected**, not created — one cannot add to a collection that does not exist"
  (`bug-084`). `dl-082` later moved the path out of `--field` into a positional; that sentence's
  semantics are unchanged, as `dl-081`'s own closing Revision records.
- **A read that gates nothing keeps reporting the working tree** — `dna show`, `paths`,
  `directives list`, the MCP Resources (`loadDnaYamlAtHead`'s own TSDoc names that list), and
  `memory search` / `memory history`, which call the working-tree `loadMemoryYaml`
  (`memorySearchFn`, `memoryHistoryFn`, `src/core/index.ts`). That is what those exist to do: a
  draft you have not committed is exactly what `memory search` should find. Which verb reads which
  baseline is documented once, for users, in `spec-008-cli-grammar` § "Which baseline each command
  reads" and the CLI reference's *Git side effects* (`dl-084-which-baseline-a-read-only-verb-reports-from`,
  `ready`, option (A)); when the working tree defines a type the commit does not, `memory add`'s
  refusal already says the change is not committed (option (D), delivered by `task-095`). The MCP half of `dl-084` E3 waits for the MCP
  Tools (v0.4).
- **Except where a non-gating read is declared to read `HEAD`** (next section): a read that gates
  nothing *may* read the working tree; it is not required to.

## Declared `HEAD` reads — a read that gates nothing, resolved at `HEAD` anyway, by name

A read that gates nothing may still be required to answer from `HEAD`, where two answers from two
baselines would themselves be the defect. Only this section names such a read.

| Read | Declared baseline | Why `HEAD` and not the working tree | Source |
|------|-------------------|-------------------------------------|--------|
| `workflow status`, `workflow list`, `workflow show`, `workflow adopt --plan` (`patch-v0.3.1`), `agent list`, `agent show`, and the two v0.3 workflow Resources `wingfoil://workflows/-/next` and `wingfoil://workflows/-/status` | `HEAD`; when the working tree differs under the paths the deduction reads (Memory, `.wingfoil/workflows*`, a `produces:` pattern, the run logs), the operation still answers from `HEAD` and emits the diagnostic `W_UNCOMMITTED_INPUTS` naming those paths | determinism: one deduction function answers `next`, `status`, the agent commands and the Resources, and it must not answer from two baselines; the working tree explains the answer, never decides it | approver ruling R15 (2026-09-30, `release-planning-rel-v0.3-plan`); `spec-006` §6; `spec-017` §1.1–§1.2; `spec-016` §5.1 |

This is an exception to `dl-084` (A)'s default for read-only verbs, not to the read half: none of
these reads decides from the working tree. `workflow next` is not in the table because it needs no
exception: it refuses an unresolvable `<ref>` and its first step is what `agent execute --next`
launches, so it gates and resolves at `HEAD` under the read half (`spec-017` §1.1); R15 and
`spec-006` §6 item 6 name it only for completeness. The shipped `wingfoil://workflows` and
`wingfoil://workflows/{name}` Resources keep the working tree in v0.3 (`spec-017` §9).

## Declared baselines — a read wider than `HEAD`, by name

A read may resolve against more than `HEAD` only where this section names it, with the baseline it
reads and why the wider read cannot be reached by an uncommitted state to the operation's harm.

| Read | Declared baseline | Why it is not `HEAD` alone | Source |
|------|-------------------|----------------------------|--------|
| `memory add`'s `{n}` sequence counter (`nextSequenceNumber`, `src/memory/add.ts`) | the trees of every local branch (`refs/heads/*`), every remote-tracking ref (`refs/remotes/*`) and `HEAD`, plus the working tree as git sees it (the index and the untracked, non-ignored files), over every folder the type's `path` can resolve to; no network | a number is taken wherever any of those holds it; the read takes the **highest** number and adds one, so a wider baseline can only raise the id, never lower it onto an occupied one or change whether the command refuses | `dl-101` §2 (a); `task-128` (`bug-087`, `bug-162`) |
| The WIP-limit holder count (`requireWipSlot`, `src/core/memory-transition.ts`), on every verb that keeps the check (`memory add` for the initial state, `submit`, `approve`, the `supersedes:` trigger) | the commit the transition is decided at, plus the tips of the refs the counter reads (`refBaselineCommits`, `src/memory/add.ts`: every local branch, every remote-tracking ref, `HEAD`) and each tip's merge-base with the decided commit (`mergeBasesWith`, `src/storage/commit.ts`); never the working tree; no network | with one branch per task (`git-conventions` §1) a holder started on another branch is invisible at `HEAD`, so a limit counted there refuses nothing; the read uses only commits, each element counts once — in the state a ref records only when that ref changed its `status` since the merge-base, otherwise in the decided commit's (approver ruling 2026-10-11 at `task-274`'s review) — and the refusal says the count depends on which refs were fetched. It **can** refuse the command — the one declared baseline that does — which `dl-156` ratified knowing it | `dl-156` Q1 (a); `task-274` |

The counter's read still gates what the command writes, so it follows the rest of this directive: a
git read that fails is an error of the operation, never an empty answer (an empty answer would
reissue `1`). The same holds for the WIP count, whose empty answer would admit any transition. Both
read the refs through the one listing, `refBaselineCommits`, so they cannot disagree about which refs
exist. The write half is unchanged: `requireAbsentTarget` still refuses an occupied target.

## Reach for the primitive — there is no third mechanism to write

Read at `9642ab5f` (`main`):

| Need | Primitive | Where |
|------|-----------|-------|
| `dna.yaml` as committed | `loadDnaYamlAtHead` | `src/core/loaders.ts` |
| `memory.yaml` as committed | `loadMemoryYamlAtHead` | `src/core/loaders.ts` |
| any path at a revision | `readPathAtRev` | `src/storage/commit.ts` (what both loaders above call) |
| refuse a dirty write target | `requireUnmodifiedTarget` / `requireUnmodifiedTargets` | `src/core/write-guard.ts` |
| prove the produced commit touched only its declared scope | `verifyCommittedScope` | `src/core/memory-transition.ts` |

`loadDnaYamlAtHead` and `loadMemoryYamlAtHead` return `null` when no commit contains the path —
decide explicitly what that means for your operation (for `roles.yaml`, absent at `HEAD` means "no
bindings yet", not a failure) and say so where you decide it.

## Why this is written here at all

Four tasks — `task-091`, `task-092`, `task-093`, `task-096` — each implemented this rule and each
restated it in its own TSDoc, because it lived only in a decision-log. `dl-080`'s own rationale calls
that a **determinism** finding before a security one: two agents given the same defect class produced
two different architectures. This is not a retrospective rule: two instances of the class were open
when it was written (`bug-087`, `bug-088`, both `release: v0.3`), and so is the deviation this
directive names (`bug-108`). `bug-087` is fixed by `task-128`, whose read is the first entry under
*Declared baselines*.

> Rationale: what the tool treats as authoritative must be what the repository records. A commit that
> attests something no clone can re-derive is not an audit trail (`adr-006-git-identity-role-based-authz`,
> REQ-SEC-02 / REQ-STATE-02). Source: `dl-080-which-baseline-each-command-reads` (`ready`, option (B))
> and its approve commit `333a3c0f`.

**Revision 1.1 (2026-09-30, `task-128-allocate-element-ids-highest-number-ref-across-folder`).** Adds
*Declared baselines* with its first entry, `memory add`'s sequence counter, as `dl-101` Action 3
requires, and records that `bug-087` is fixed by that task. Version 1.0 is the text `task-094` wrote,
which carried no version; this revision adds a `**Version:**` line (`doc-versioning`) in the body
rather than a `version:` frontmatter key, which the directive loader would report as an unknown field.

**Revision 1.2 (2026-10-01, `task-161-revise-command-baseline-which-verbs-read-head-filesystem`).**
One revision for the `dl-080` family, ratified at `release-planning-rel-v0.3-plan` gate 3. *Who this
reaches, and which text is normative* is new: `spec-006` §6 is the normative text and this directive
points to it (`dl-085` (B)), and the audience is stated (`dl-085` (A); (C) declined). *There is no
third category of read* becomes *Two baselines for a gating read — and no third*: the
filesystem-effect read of `dl-086` (adopted), with the time-of-check-to-time-of-use residual named as
a limit and `bug-108` still owed to `HEAD`. The `dl-084` bullet under *Consequences* records the
ratified (A)+(D) instead of "`in-discussion`". *Declared `HEAD` reads* is new, with the R15
exception for the workflow and agent read commands and the two v0.3 workflow Resources.
*Declared baselines* (`task-128`'s counter) is unchanged.

**Revision 1.3 (2026-10-02, `task-144-declare-directive-scope-report-when-disagrees-roles-yaml`).** The
version moves from the body's `**Version:**` line to the frontmatter `version:` key, which `spec-013`
now declares (approver ruling 2026-10-01, at `task-128`'s review). The rule text is unchanged.

**Revision 1.4 (2026-10-02, `task-247-decide-every-memory-transition-from-the-element-s-committed-status-and-resolve-its-document-at-head`).**
*Where the shipped code still deviates* no longer lists the Memory transition verbs: their id lookup
and status read resolve at `HEAD` (`bug-187`). `directive remove` (`bug-108`) is the deviation left.
The rule text is unchanged.

**Revision 1.5 (2026-10-10, `task-274-count-wip-limit-holders-across-every-ref-and-exempt-reject-and-returns-edges-from-the-limit`).**
*Declared baselines* gains its second entry, the WIP-limit holder count, which `dl-156` Q1 (a) moved
from the decided commit alone to that commit plus every local and remote-tracking branch tip, a tip's
copy counting only when that ref changed the element since its merge-base with the decided commit
(approver ruling 2026-10-11, option (a), at the task's review). Unlike the counter it can refuse the
command; the row says so. `reject` and `park` no longer take the check
(`dl-156` Q2 (i)). The rule text is unchanged.

**Revision 1.6 (2026-10-25, `task-294-add-workflow-adopt-with-its-single-plan-and-apply-forms-p4.21`).**
`workflow adopt --plan` joins the declared `HEAD` reads (`spec-017` §11, `spec-008` §11): it writes nothing,
answers from the deduction at `HEAD`, and reports a working tree that differs as `W_UNCOMMITTED_INPUTS` warnings. The
writing forms — the single `workflow adopt` and `--plan --apply` — gate on `HEAD` like `workflow finalize` and write
empty commits. The rule text is unchanged.
