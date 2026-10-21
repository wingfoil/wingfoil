---
id: "dl-077-types-track-the-node-major-not-the-declared-minor"
type: decision-log
title: "`@types/node` can only track the Node major, never the declared minor, so the type surface necessarily overshoots the `>=22.12.0` floor — and no guard can catch it"
status: ready
context: "build-contract"
release: "v0.4"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

`adr-010-node-22-runtime-floor` declares `engines.node: ">=22.12.0"`. `task-087-fix-types-node-floor-pin`
raised `@types/node` from the superseded Node 18 line to `^22.20.4`, closing the direction that
actually bit: the compiler was rejecting APIs that exist on the supported runtime.

The opposite direction remains open and **cannot be closed by the same means**. DefinitelyTyped
publishes one type surface per Node **major**, not per minor, so `^22` describes the Node 22 line as
a whole — including APIs added in 22.13 through 22.23 that a machine running exactly 22.12.0 does not
have. A project pinned at the floor therefore typechecks against a surface slightly larger than the
runtime it promises.

## Evidence

Measured 2026-09-22 and reproduced independently by `task-087`'s reviewer:

- **DT's minor is its own counter, not Node's.** `@types/node@22.20.0` was published 2026-06-20;
  Node v22.20.0 was released 2025-09-24. The two numbers do not denote the same thing and are not
  released together.
- **DT's 22 line stops short of Node's.** DT publishes up to `22.20.4` while Node 22 has reached
  v22.23.2. There is no `@types/node` describing 22.12.0 specifically, and none describing the
  newest 22.x either.
- **The guard `task-087` added cannot see this.** It asserts that `@types/node`'s major equals the
  `engines.node` floor's major — which is the right relation for the failure it exists to catch (a
  pin at `^24` against a `>=22.12.0` floor), and is structurally blind to a residual *inside* the
  major, because major is the only granularity the ecosystem offers.
- The residual is the same class as `bug-049-types-node-pinned-to-superseded-floor`, three majors
  smaller: the type surface and the promised runtime do not describe the same thing.

## Decision

Open. Three candidate positions, stated with what each costs:

### (A) Accept the residual and say so

Record in the build contract that the type surface tracks the Node **major** of the floor, and that a
consumer running exactly the floor version may find the compiler permits an API their runtime lacks.
*Cost:* the gap stays real; a developer can write code that typechecks here and fails on a 22.12.0
machine. *What it buys:* the truth is written down instead of being discovered, and no machinery is
built for a risk nobody has yet measured as harmful.

### (B) Raise the declared floor to the newest minor the types describe

Move `engines.node` to whatever minor DT's line implies, so the two agree.
*Cost:* this inverts the direction of `adr-010`'s reasoning — the floor was chosen as the lowest
version every dependency accepts and as a deliberate compatibility promise, not as a function of a
types package's release cadence. It would also have to move again every time DT publishes.
*It is listed because it closes the gap exactly, not because it is recommended.*

### (C) Detect the residual instead of removing it

Run a check — in CI or as a gate — that compiles against the floor's actual API surface, however that
is obtained (a container running the floor version, or a generated subset).
*Cost:* there is no off-the-shelf mechanism for "the API surface of Node 22.12.0 specifically", so
this is real engineering for a defect that has produced no observed failure. `dl-076` is the natural
place for it if a runner at the floor version is introduced for other reasons.

## Rationale

- The residual is **structural, not an oversight**: no pin can express it, because no published
  artefact describes it. Any position that treats it as a fixable pin will churn without closing it.
- Its severity is genuinely unknown. Nothing in this repository currently uses a 22.13+ API, and
  nothing measures whether it does. That is a cheap check and would make this decision better
  informed — whichever position is taken, knowing the current exposure is worth more than arguing
  about the shape of the risk.
- The costlier direction was the one `bug-049` described and `task-087` closed. This one is the
  quieter half and should not be conflated with it in severity.

## Actions

1. **Choose a position.** Owner: approver; recorded in this document's approve commit `Reason:`.
2. **Measure the current exposure before acting** — whether any `src/` file uses an API introduced
   after 22.12.0. That number belongs in this document before it is ratified, not after.
3. If (A), the statement belongs in the build contract next to `engines.node`, not only here.
4. If (C), fold it into `dl-076-toolchain-divergence-unexercised-until-tag` rather than standing it
   up separately — it is the same class of question about which environment is authoritative.

## Relations

- **Successor to:** `bug-049-types-node-pinned-to-superseded-floor` (`in-review` at the time of
  writing, closing through `task-087`), whose costlier direction is closed and whose residual this is.
- **Adjacent:** `dl-076-toolchain-divergence-unexercised-until-tag` (`in-discussion`) — same family,
  one level up: which environment is authoritative and when the difference is exercised.
- **Derives from:** `adr-010-node-22-runtime-floor` (`accepted`), which sets the floor this measures
  against.
