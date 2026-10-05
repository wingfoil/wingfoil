---
id: claim-evidence
name: "A claim about the code names the command that establishes it"
type: directive
kind: custom
title: "A claim about the code names the command that establishes it"
tags: [custom, determinism, documentation, review]
scope: global
ref: []   # pure WingFoil convention, from measured instances (no upstream feature/REQ)
---

# Directive — A claim about the code names the command that establishes it

Custom WingFoil rule. Applies to **every role**, because the measured instances were written by
implementers, reviewers and orchestration alike — acceptance criteria and bug fields as often as
TSDoc. A rule bound only to the coding roles would miss the sentences that have actually gone wrong
most often here, which is why this directive is `scope: global` rather than a section of the
`command-baseline` directive it shares a cause with.

## Who this reaches

Stated per `dl-085-how-tool-implementation-rules-reach-anyone-outside-this-repo` (`ready`, option
(A)). This directive reaches an agent executing under any role of **this repository's own**
`.wingfoil/roles.yaml`, which auto-loads it (P3.6). It reaches nobody else: a contributor arriving
through `COLLABORATION.md` meets it only by opening this file, and a project scaffolded by
`wingfoil init` does not receive it. Unlike `command-baseline`, the rule is not about implementing
`wingfoil` and could hold in any project, so shipping it as a built-in directive (`dl-085` option
(C)) stays open; it has not been done, and `dl-085` Action 3 requires this file to stay separate
from `command-baseline` if it ever is. No spec states this rule — `spec-011` and `spec-012` only list
the file — so this directive is its normative text; its citation half is stated in full in the
`documentation` directive, clause D1.

## The rule

**A sentence that asserts a fact about the code names the command that establishes it, and is true
when written.** If you did not run something that settles it, you do not know it — say what you
expect instead, and mark it unverified.

Claims that need a command, in practice:

- **Absence and presence.** "`--version` is not in `program.options`"; "no spec states this";
  "nothing else calls it". Absence is the easiest thing to believe and the easiest to check:
  `grep -rn`, and paste what it printed — including when it printed nothing.

  **An absence claim shows that its command could have found the thing.** An empty result is
  evidence only when the same command, or the same pattern, is shown hitting a known positive case,
  in the same note. A pattern that cannot match anything relevant proves nothing, however many times
  it prints nothing.

  (`dl-097` §1.) It holds wherever this directive does, including Execution Notes, bug fields,
  acceptance criteria, triage notes, decision-log bodies, approval `Reason:` blocks and the durable
  prose under *How a claim is recorded*.
- **Uniqueness and exhaustiveness.** "the only place a path is split", "all three callers".
- **Status of a file or a gate.** "this file is unchanged", "covered by the existing suite",
  "already handled upstream", "the suite is green without it". Open the file; run the suite; delete
  the line and watch what fails.
- **What a tool does.** "git C-quotes a path containing a space"; "Commander registers `--version`
  outside `.option()`". Behaviour of git, Commander, Jest and npm is measurable in one command and
  is wrong surprisingly often when it is not measured.

## How a claim is recorded

The citation rule is stated in full in the `documentation` directive, clause D1 (`dl-120`).

- **In Execution Notes, Steps to Reproduce and triage notes:** the command and its output, pasted.
  A bare `path:line` offset is legal only here (`dl-075`, `ready`).
- **In durable prose** — a comment or TSDoc, an acceptance criterion, a bug `Summary`/`Expected`/
  `Actual`, a spec sentence, a decision: name a symbol, heading, YAML key path or verbatim
  quotation, plus the commit you read it at when the cited state may move (`dl-075`). An offset
  rots; a symbol plus a sha does not.
- **When it cannot be run**, write the expectation as an expectation — "intended to", "not
  verified here" — never as a measurement. An honest gap is reviewable; a confident sentence is not.

## Two habits that produce most of the instances

- **A behaviour the code depends on deserves a test, not a sentence.** If removing a line leaves the
  suite green, the sentence explaining why the line is there is the only thing holding it
  (`bug-097`: `core.quotePath=false` and a probe's `stdio`; `bug-102`: `splitDnaPath` being the only
  splitter is "a fact about today's code, not an invariant anything checks").
- **A sentence you made stale in your own pass is yours to fix.** Present tense means current: a
  comment describing a grammar that was retired in the same release is a false sentence, not a
  historical note, unless it says it is one (`bug-096` item 3). Settled scope is not a licence for an
  untrue sentence.

## Why this is written down

Measured in one week of `minor-v0.2`, all with element ids:

- `bug-096` — three residues of `task-093` plus a mis-cited section (`spec-008` §1 for a word that
  is in §2). `task-093` was **rejected twice** (`ab5e752d`, `3570de87`) and approved over a third
  finding, all three for this one habit.
- `bug-097` item 3 — a `readStatusAt` TSDoc sentence describing "a discrimination the implementation
  does not perform".
- `task-096` — a TSDoc claiming git C-quotes a path containing a **space** (`3e2506c4`), next to a
  test whose fixture could not have caught it; corrected inside the same task (`ee689b31`).
- `bug-099` — the user-facing CLI reference still declaring a `--dry-run` that does not exist.
- `task-079` — a review summary read an empty `grep -rn 'REQ-SYS-09'` over the BDD feature files as
  "no BDD coverage" (corrected at `e693a289`). Feature files cite user stories, not `REQ-*` codes, so
  the pattern could not have matched anything: the command was run and reported, and the claim was
  still false. This is the instance the falsifiability clause exists for (`dl-097`).

The cost is not the sentence. It is that a reader downstream believes it, and that review has to
re-measure what the author could have measured once.

> Rationale: the Determinism Index is a claim about reproducibility, and a project whose own prose
> is not reproducible from the repository cannot make it. Companion to the `command-baseline`
> directive: that one says which state a command may believe, this one says which state a *sentence*
> may believe.
