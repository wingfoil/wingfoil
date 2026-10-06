---
id: "task-181-name-attempted-move-not-verb-canonical-edge-illegal"
type: task
title: "Name the attempted move, not the verb's canonical edge, in illegal-transition errors"
status: in-review
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "memory", "errors"]
ref: "dl-032"
bug: ["bug-165"]
depends_on: ["task-130-show-coreerror-details-surface-give-refusal-shape-under"]
tmpl_version: 260703
---

## Description

`contractTarget` (`src/memory/state-machine.ts`) prints the verb's canonical edge, so `approve` on a `planned` bug reads `planned -> triaged` (backward) and on `triaged` `triaged -> resolved` (skipping three states). `bug-127`'s cases (task end, gate `(none)`, custom machine) were folded into this bug.

## Acceptance Criteria

- (red-first) `approve` from a state with no approve edge prints `<to>` = `(none)` or the detail line "`approve` is not available from `planned` (a waiting state)" — choice in design, pinned in BDD P1.6 sc.2 and `spec-004` §4.3's example.
- (red-first) the four cases carried from `bug-127` each have a test.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-032; dl-053 revisit; REQ-STATE-01.
- **Features:** P1.6, P1.7, P1.8.
- **Notes:** Proposal key: C31.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-181-name-attempted-move-not-verb-canonical-edge-illegal`, worktree
`../.wf2-wt/task-181`, cut from `main` at `0cf8b131` (wave 2, batch B3). Start `0b929ba9`; `bug-165`
`[planned → in-progress]` `8b42073f`.

### design (architect)

**`depends_on` read (dl-015).** `task-130` is `done` (`grep -n "^status" docs/04_memory/v0.3/task-130-*.md`
→ `status: done`). From its Execution Notes: since `dl-055` option 1 a refusal's `detail` reaches the
operator on both surfaces — the CLI prints it as an indented line after the `error:` line, the MCP
path carries it in `details`. That is what makes option (A) below safe: the explanation the `<to>`
target used to hint at is already on screen, one line down.

**Specs and decisions.** `spec-004-mcp-surface-contract` and `spec-005-cli-command-contract` are
`approved`; `dl-032-illegal-transition-message-contract` and
`dl-053-illegal-transition-target-for-verbless-edges` are `ready` (`grep -n "^status"` on each). The
rule being changed is written in four places (`grep -rn "canonical edge" docs src`): REQ-STATE-01's
Fit Criterion (`docs/02_requirements/03_sard/03_state-context.md:23`), `spec-004` §4.3's example and its
2026-09-21 Revision note, `dl-053` option 1, and `contractTarget`'s doc comment. The strings are pinned
by BDD `P1.6` sc.2, `P5.2.3` sc.2, `P5.1.4` ("a refusal's details follow its error line") and `P1.8`
sc.2 (`grep -rn "illegal transition" docs/02_requirements/02_bdd`), by `spec-005` §3.1's example and
by `docs/cli-reference.md:514` (whose `draft -> approved` was already wrong: the engine prints
`draft -> backlog` today).

**Reproduction** (`npm run build`, then a probe calling `resolveTypeTransition` from `dist/` against
`.wingfoil/memory.yaml`, a scaffold `memory.yaml` with no `states` (the `init` shape bug-127 used) and
bug-127's custom machine):

| type / machine | from | verb | message today |
|---|---|---|---|
| `bug` (real) | `planned` | `approve` | `planned -> triaged` (backward) |
| `bug` (real) | `triaged` | `approve` | `triaged -> resolved` (skips three states) |
| `task` (scaffold) | `approved` | `submit` | `approved -> pending` (behind) |
| `task` (scaffold) | `approved` | `reject` | `approved -> draft` (behind) |
| `task` (scaffold) | `pending` | `submit` | `pending -> (none)`, detail "a `gates` state — its forward edge requires `approve`, not `submit`" |
| custom | `ready` | `submit` | `ready -> done` (skips `in-progress`) |
| custom | `done` | `submit` | `done -> ready` (behind) |

**AC1 — the choice left to design.** Options:

- **(A) `<to>` is `(none)` for every refused verb call; the detail line is unchanged — recommended,
  implemented.** A transition verb names no target of its own, and a call is illegal exactly when the
  verb has no edge from `<from>` (`resolveTransitionTarget`: every refusal is "no edge of this verb
  here"; `deprecate` is never refused). So "the verb's target from here" is always `(none)`, and that
  is the only `<to>` that is true from `<from>`. The `<from> -> <to>` shape of REQ-STATE-01 / `dl-032`
  stays, so nothing that parses the line breaks; `(none)` is a token the contract already prints
  (`dl-053` option 1's own fallback). The *why* is already in the detail and already in the user's
  terms — it names the verb, the state and the reason: "a `gates` state — its forward edge requires
  `approve`, not `submit`" (bug-127's "'pending' is a gate: use memory approve"), "the last state in
  `sequence` — there is no forward edge" (bug-127's "'approved' is the last state"), "both a `gates`
  and `waiting` state — its forward edge is verb-less (fires only via a Workflow action), not
  `approve`" (bug-165's "`approve` is not available from `planned` (a waiting state)").
  `contractTarget` collapses to that constant and is removed. The `supersedes:` trigger's
  `<from> -> superseded` is not a verb and is untouched.
- **(B) keep the canonical edge, lead the detail with "`approve` is not available from `planned`
  (a waiting state)".** Rejected: the first line — the one BDD pins and `docs/agents.md` §6 tells agents
  to read — would still print `planned -> triaged`, the defect itself.
- **(C) the literal attempted move** (the forward edge for `submit`/`approve`, the gate's target for
  `reject`): `planned -> in-progress`. Rejected: it names an engine-only `waiting` edge, which
  `dl-053`'s Rationale ruled out ("misinforms exactly the user who has just made an illegal call"),
  and it still leaves `reject` off a gate and the last state with nothing to name.
- **(D) drop `<to>`** (`dl-053` option 4). Rejected: it reopens `dl-032` and REQ-STATE-01's format for no
  gain over (A).

(A) + a reworded detail (e.g. "`approve` is not available from `planned` (a waiting state)") is a
possible refinement; not done, because every current detail already says the same thing, and rewording
would re-pin a second string in every test and in `spec-005` for no information gained. **Decision for
the approver:** confirm (A), and whether `dl-053` is amended (pending amendment below) or replaced by a
new decision-log (agents add no Memory elements: a candidate for the coordinator).

**Changes the ACs require.** Committed by me: REQ-STATE-01's Fit Criterion; BDD `P1.6` sc.2 (its
`Given` line, which names the non-move `approved -> pending`, and its message), `P5.2.3` sc.2, `P5.1.4`,
`P1.8` sc.2; `docs/cli-reference.md`'s `approve` error example; the doc comments in
`src/memory/state-machine.ts` and `src/core/index.ts`. Pending amendments (approver, uncommitted):
`spec-004` §4.3 example + Revision note, `spec-005` §3.1 example + Revision note, `dl-053` Revision note.
None of these files carries a `version:` field (`grep -n "^version" ` on each → nothing), so the dated
Revision notes are the record (`dl-047`). BDD and SARD files carry no version either.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `approve` with no edge prints `<to>` = `(none)` (bug-165's `planned` and `triaged`) | **red-first** | the probe above prints `planned -> triaged` and `triaged -> resolved` |
| 2a — end of the chain: `submit` / `reject` on `approved` (scaffold machine) | **red-first** | prints `approved -> pending` / `approved -> draft` |
| 2b — a gate: `submit` on `pending` | **characterization** | already prints `pending -> (none)` with a detail naming `approve` (probe); pinned, not fabricated red |
| 2c — custom machine, `submit` on `ready` (a gate) | **red-first** | prints `ready -> done` |
| 2d — custom machine, `submit` on `done` (the last state) | **red-first** | prints `done -> ready` |

Merge order: `task-180` (merges first) adds `memory park` and touches `src/memory/state-machine.ts`;
this task's code edit is confined to `contractTarget` / `NO_TARGET` and `resolveTypeTransition`'s
message line, so a conflict, if any, is local to those lines.

### red (developer)

`a99062a7`. `test/memory/state-machine.test.ts` gains a `task-181` block: AC1's two `bug` cases
(`approve` on `planned`, on `triaged`), bug-127's cases on the `init`-shaped scaffold (`submit` and
`reject` on `approved`, `submit` on the gate `pending`) and on its custom machine (`submit` on `ready`,
on `done`), each pinning the message **and** the detail; plus a sweep over every state × `submit` /
`approve` / `reject` of every type in `.wingfoil/memory.yaml`, asserting each refusal reads
`<from> -> (none)` (with a vacuity guard). The `dl-053` option-1 cases it replaces (canonical edge,
next edge of the same verb) were deleted, since they pinned the rule being retired. The pins of the
old strings in `memory-submit`, `memory-approve`, `memory-reject`, `fresh-init-transitions` and
`program.integration` (P1.6 sc.2, P1.8 sc.2) move to `(none)`; `memory-reject` and P1.8 sc.2's
integration test pinned only a shape (`\S+`) and now pin `(none)`. `cli/error-details` and
`mcp/error-details` use a fixed synthetic message (rendering, not the rule) and were aligned for
consistency; they pass either way.

`npx jest <the 8 files above>` → **15 failed, 242 passed**. In `state-machine.test.ts` alone: 8
failed (P1.6 sc.2, AC1 ×2, AC2 end of chain ×2, custom ×2, the sweep); **AC2's gate case passed on
first run**, as classified (characterization). The other 7: one each in `memory-submit`,
`memory-approve`, `memory-reject`, `fresh-init-transitions`, three in `program.integration`.

### green (developer)

`9bb6c028`. `resolveTypeTransition` prints `NO_TARGET` (`(none)`) as `<to>`; `contractTarget` is
removed (`grep -rn contractTarget src` → nothing). `NO_TARGET`'s doc comment carries the rule and why
the canonical edge was dropped; the `src/core/index.ts` comment on `memoryApprove`'s steps follows.
`resolveTransitionTarget`, the detail texts and `resolveSupersedeTarget` (`-> superseded`, not a verb)
are unchanged. Same 8 files plus `memory-transition-head-baseline` → **282 passed**.

`e633dcdd`: REQ-STATE-01's Fit Criterion states the rule; BDD `P1.6` sc.2 (its `Given` now reads "has
no "submit" edge from approved" instead of naming the non-move `approved -> pending`), `P5.2.3` sc.2
(same), `P5.1.4`, `P1.8` sc.2; `docs/cli-reference.md` gains an "Unreleased (v0.3)" paragraph under
the exit codes and fixes `approve`'s example, whose `draft -> approved` matched neither rule (0.2.2
prints `draft -> backlog`: `resolveTypeTransition` from `node_modules/wingfoil-released/dist` on
`.wingfoil/memory.yaml`).

### refactor (developer)

- `npm test` (first run): 243 suites, 4604 tests, 3 failed: `name-resolvability` (real — spec-004's
  2026-09-21 Revision note names `contractTarget`, which this task removed) and two latency tests
  (`query-latency` P1.10 p95 1029.9 ms vs 1000; `resource-latency`) at load average ~60
  (`uptime`). Re-run alone: `npx jest test/core/query-latency.test.ts test/mcp/resource-latency.test.ts`
  → 8 passed. Fix for the real one, `f0b070bb`: a `historical` allowlist entry, the precedent being
  spec-006's `pathsQuery`; `npx jest test/docs/name-resolvability.test.ts` → 11 passed.
- `npm run test:coverage` → rc 0, **243 suites, 4604 tests, all passed**; `All files` 99.07 / 96.21 /
  96.17 / 99.68 (statements / branches / functions / lines). `main` per the dev-loop plan (`07000bc0`,
  code-identical to `0cf8b131`: `git diff --stat 07000bc0 0cf8b131` touches only `docs/04_memory/`
  and `docs/05_plans/`): 99.07 /
  96.18 / 96.18 / 99.68, 4609 tests (−13 deleted dl-053 cases +8 new = −5). Functions −0.01: lcov
  gives 1007 / 1047 covered (`awk` over `coverage/lcov.info` FNH/FNF), i.e. 40 uncovered; deleting
  one covered function (`contractTarget`) lowers the ratio without adding an uncovered one.
- `npm run lint` 0, `npm run docs:api` 0, `npx tsc --noEmit -p tsconfig.json` 0,
  `npx tsc -p tsconfig.build.json --noEmit` 0, `npm run typecheck` 0,
  `node scripts/check-governance.cjs --base 0cf8b131` → 0 findings, exit 0.
- All runs with the three pending amendments below in the working tree.

### review (reviewer)

- AC1: met with option (A) — `planned -> (none)` / `triaged -> (none)` for `bug`, detail naming the
  gate+waiting reason; pinned in BDD `P1.6` sc.2 (`approved -> (none)`) and `spec-004` §4.3's example
  (`draft -> (none)`, pending amendment). Option (A) vs (B) is a **decision for the approver**.
- AC2: all four bug-127 cases tested (end of chain as `submit` and `reject`, gate, custom ×2), each
  with message and detail; three red-first, the gate characterization.
- Same class in touched files: `grep -rn "canonical edge\|contractTarget" src test` → only the new
  rule's own comments and the allowlist; `grep -rn "illegal transition [a-z-]* -> [a-z]" test` → only
  the `superseded` trigger pins (not a verb) and `head-baseline`'s prefix-only `toContain`.
- Not changed, deliberately: `docs/agents.md` §6's row reads `<from> -> <to>` generically and stays
  true; the historical strings in `dl-032`, `dl-063`, `dl-108`, `bug-032` record what was printed then.

### review fixes (independent review: APPROVE WITH FIXES)

- **F3** — after the 13 dl-053 deletions nothing pinned the engine's approve-from-a-non-gate detail
  (the text `spec-004` §4.3's example quotes). Added an exact pin on the real machine: `task` /
  `draft` / `approve` → `draft -> (none)`, detail
  `` illegal `approve` from "draft": not a `gates` state — `approve` is only legal from a gate ``.
- **F4** — the sweep claimed "every legal call still returns its target" without asserting it. It now
  asserts `resolveTypeTransition` returns `resolveTransitionTarget`'s target on every legal call, pins
  every refusal's detail exactly by category (gate / waiting / gate+waiting / last state / not a gate,
  derived from the machine in the test, not from the engine), and runs as `it.each` over three files:
  this repository's `memory.yaml`, the `init` scaffold (REQ-STATE-08 default) and bug-127's custom
  machine, with vacuity guards on both outcomes per file.
- Runs: `npx jest test/memory/state-machine.test.ts` → 89 passed (86 − 1 old sweep + 1 pin + 3
  sweeps); `npm run lint` 0; both `tsc` 0; `test/lint/control-characters.test.ts` 19 passed;
  `node scripts/check-governance.cjs --base 0cf8b131` 0 findings.
- On hold, per the coordinator, pending the approver's ruling: the `dl-053` handling (amendment vs a
  new decision-log) and REQ-STATE-01's "Revised … by task-181" citation. Neither was touched.
- After `task-180` lands: merge `main` and add `park` to the sweep (coordinator's note).

### approver rulings (2026-10-06)

- **D1:** option (A) confirmed.
- **D2:** a new decision-log, `dl-154-an-illegal-transition-prints-none-as-its-target-replacing-dl-053-s-canonical-edge`
  (`ready`, v0.3, on `main`, not on this branch yet). Applied in `4d0c69b0`: REQ-STATE-01 now cites
  `dl-154` as the ratifying decision (task-181 as the implementer); the four BDD scenarios carry a
  `# dl-154 …` comment (precedent: `P3.2`'s `# dl-062 …`); `NO_TARGET`'s doc comment, the test
  comment and the `contractTarget` allowlist reason follow. The pending `spec-004`/`spec-005` Revision
  notes cite `dl-154` (dated 2026-10-06); `dl-053`'s pending section is now a one-line pointer.
- `npx jest test/docs/name-resolvability.test.ts test/memory/state-machine.test.ts` → 1 failed, 99
  passed. The one failure is `name-resolvability`, listing `dl-154-…` as unresolved in
  `03_state-context.md`, `spec-004` and `spec-005` — only because `dl-154` is not on this branch; it
  resolves once `main` is merged (coordinator's instruction: record and leave). `npm run lint` 0, both
  `tsc` 0.

### integration with main (2026-10-06)

- `git merge main` → `780d4935`, no conflict (task-180's `park` op and `returns` edges landed in
  `resolveTransitionTarget`; `resolveTypeTransition` already prints `NO_TARGET` for every refused op,
  so `park` refusals read `<from> -> (none)` with no code change). The pending amendments were set
  aside as a patch before the merge and re-applied with `git apply --3way` (clean); the
  `spec-004`/`spec-005` Revision notes stay in date order (`grep -o "^\*\*Revision ([0-9-]*"` → the
  2026-10-06 note last). `npm ci` re-run (task-190's lock).
- `park` in the sweep: `OPS` gains `park`, with its reason by category; new tests: `park` refused with
  `(none)` from every state of the scaffold and the custom machine (no `returns`), and on the real
  `task` machine legal only from `in-progress` (→ `backlog`). task-180's target-agnostic park pins
  (`state-machine-returns-limits`, `memory-park`) now pin `(none)` exactly. REQ-STATE-01 names `park`
  among the verbs and "no `returns` edge" among the reasons; `docs/cli-reference.md`'s `memory park`
  errors show the line. No versioned config file touched (`git diff --stat 780d4935 -- .wingfoil` → empty).
- Gates: `npm run test:coverage` → rc 0, **259 suites, 4861 tests, all passed** (name-resolvability
  included: `dl-154` now resolves); `All files` 99.11 / 96.33 / 96.27 / 99.69. `npm run lint` 0,
  both `tsc` 0, `npm run typecheck` 0, `node scripts/check-governance.cjs --base 0cf8b131` → 91 `wf()`
  commits, 0 findings.

