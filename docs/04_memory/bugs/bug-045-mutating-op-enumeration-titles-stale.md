---
id: "bug-045-mutating-op-enumeration-titles-stale"
type: bug
title: "Test titles and module docs in the registry/parity/agent-channel enumerations name counts and op lists their own assertions have outgrown"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

Across `test/core/production-registry.test.ts`, `test/core/parity.test.ts` and
`test/mcp/read-only-agent-channel.test.ts`, several `describe`/`it` titles and module docs still name the
mutating-operation set as it stood several tasks ago — some claiming zero mutating ops, some listing five
or six of the eight the assertion beneath them checks. Every suite passes; the assertions are correct.
What is wrong is the prose a reader meets first.

## Steps to Reproduce

Against `main` at `b7e39f9`:

```
$ npx jest test/core/production-registry.test.ts test/core/parity.test.ts test/mcp/read-only-agent-channel.test.ts
Test Suites: 3 passed, 3 total
Tests:       24 passed, 24 total
```

Then read the titles against the arrays they assert (line numbers below).

## Expected Behavior

A test title describes what the assertion below it checks. When an enumeration test is the registry's
regression guard, its title is where a reader confirms what the surface currently is — so a title that
names a count or a list must name the current one.

## Actual Behavior

The mutating set on `main` is **eight** operations —
`directive.directiveAssign`, `directive.directiveCreate`, `dna.dnaSet`, `memory.memoryAdd`,
`memory.memoryApprove`, `memory.memoryDeprecate`, `memory.memoryReject`, `memory.memorySubmit`
(`test/core/production-registry.test.ts:43-52`, sorted). Against that:

### `test/core/production-registry.test.ts`

| Line | Text | Status |
|---|---|---|
| `:6-8` (module doc) | "The full memory/dna/directives/workflow domain operations tables in spec-006 §3 (`memoryAdd`, `dnaSet`, …) are feature work for task-018..030 and are deliberately NOT registered here yet; **there is intentionally zero mutating operation in production today**" | **wrong** — all of them are registered; eight mutate |
| `:15` (`it`) | "registers the currently-existing operations, **incl. the mutating ops `dna.dnaSet` (task-025), `memory.memoryAdd` (task-020) + `directive.directiveCreate` (task-050)**" | **stale** — names 3 of 8. Hedged by "incl.", so not false, but it is the reader's index into a 14-entry list and it stopped at task-050 |
| `:41` (`it`) | "**eight** operations mutate today — `directive.directiveAssign` (P3.2), `directive.directiveCreate` (P3.1), `dna.dnaSet` (P2.1), `memory.memoryAdd` (P1.3), `memory.memorySubmit` (P1.6), `memory.memoryApprove` (P1.7), `memory.memoryReject` (P1.8) + `memory.memoryDeprecate` (P1.9); the rest are read-only" | **correct today** — count and list both match `:43-52`. Listed here because it is the one that has been kept current, and because it is the title every new mutating op must edit |

### `test/core/parity.test.ts`

| Line | Text | Status |
|---|---|---|
| `:16-20` (module doc) | "a production registry **with zero mutating ops**, see below, would make this assertion vacuously true"; "the actual regression guard that **will start catching real drift once task-018+ registers real mutating operations**; **today it legitimately reports 0 mutating ops on both surfaces**" | **wrong** — the production registry has reported eight on both surfaces since `task-051` |
| `:132` (`it`) | "reports 0 unmatched operations — the mutating ops `directive assign`, `directive create`, `dna set`, `memory add`, `memory submit`, `memory reject` + `memory deprecate` are on BOTH surfaces (task-051/050/025/020/045/047/048)" | **wrong** — names **7**, omits `memory approve`; the assertions at `:143-144` list all **8**, and the task list omits task-046 |
| `:148` (`it`) | "the read-only production operations are Resources, the mutating ops (`directive assign`, `directive create`, `dna set`, `memory add`, `memory submit`, `memory reject`) are Tools, never both" | **wrong** — names **6**, omits `memory approve` and `memory deprecate`; the Tools assertion at `:175-183` lists all **8** |
| `:169-172` (comment) | "`directive.directiveAssign`, `directive.directiveCreate`, `dna.dnaSet`, `memory.memoryAdd`, `memory.memorySubmit`, `memory.memoryReject` + `memory.memoryDeprecate` are `mutates: true`" | **wrong** — names **7**, omits `memory.memoryApprove`, immediately above an 8-entry assertion |

### `test/mcp/read-only-agent-channel.test.ts`

| Line | Text | Status |
|---|---|---|
| `:12-14` (module doc) | "The remaining AC case — a *mutating* Tool call rejected on an illegal state-machine transition, identical to the CLI — **awaits a real mutating operation (task-018+; `CORE_MODULES` is read-only today)**" | **wrong** — eight mutating ops exist; whether the AC case is now covered elsewhere is a separate question, but the stated reason for the gap no longer holds |
| `:81` (`describe`) | "the real surface exposes the mutating Tools today **(directive.assign, directive.create, dna.set, memory.add, memory.submit — task-051/050/025/020/045)**" | **wrong** — names **5** of 8 |
| `:82` (`it`) | "the Tools write-channel is advertised, and the real registry contributes `directive.assign` + `directive.create` + `dna.set` + `memory.add` + `memory.submit` — **the mutating ops**" | **wrong** — names **5**, and "the mutating ops" claims the list is complete; the assertions at `:97-105` and `:108-117` each list **8** |

## Notes

### Why it is worth filing rather than fixing in passing

These three suites are the enumerations a reader consults to answer "what does the surface expose right
now?" — the registry guard, the REQ-SYS-05 parity guard, and the REQ-SEC-05 channel guard. Their titles
are the first thing read and the only part not checked by anything. Jest prints the title, not the array,
so a green run positively reinforces the wrong sentence, and `:12-14` above states a *reason for a
coverage gap* that has stopped being true — the kind of note a later task reads as licence to leave the
gap open.

The pattern is also self-worsening in a specific way: **every new mutating operation makes all of them
wrong again**, because each title hard-codes the set. `task-052-directive-remove` (`in-review`) adds
`directive.directiveRemove` as the ninth, and its own acceptance criteria list "parity /
production-registry / agent-channel enumerations widened" as AC4 — so the next author is already going to
open all three files.

**Whoever adds the next mutating op should fix all of them in that change**, and preferably stop
enumerating: `production-registry.test.ts:41` is the only title that stayed correct, and it stayed correct
only because someone maintained it by hand each time. A title that says "every `mutates: true` operation
is registered on both surfaces" with the list left to the assertion cannot decay at all.

### Not a duplicate

This is prose decay in test files, distinct from `bug-040-builtin-directive-docs-stale-after-task-057`
(stale built-in *directive documentation*) and from `bug-026-type-error-on-main-untested-by-any-gate`
(a real type error on `main`). No assertion is wrong here and no behaviour is affected — hence **low**.

### Suggested fix — do NOT apply as part of this report

Rewrite the eight entries above to describe the property rather than the roster, and delete the three
"zero mutating ops today" module-doc passages outright (`production-registry.test.ts:6-8`,
`parity.test.ts:16-20`, `read-only-agent-channel.test.ts:12-14`) — each documents a scope note from
`task-006`/`task-016` that the release has since closed. Cheapest as part of `task-052`'s AC4 widening,
since that change opens all three files anyway.

## Triage & Execution Notes

Found while verifying the Wave-2 round-4 ingest batch against `main`; every line number above was read on
`main` at `b7e39f9` and every "wrong" verdict is a count of the title against the array directly beneath
it. The three suites were run (24 tests, all passing) to confirm this is documentation decay and not a
failing assertion. Filed unfixed per the ingest plan — the agent stops at `open`.

Related: `task-006` (the registry + parity guards), `task-016-read-only-agent-channel`,
`task-051-directive-assign`, `task-045`/`046`/`047`/`048` (the four Memory verbs whose arrivals the titles
missed), `task-052-directive-remove` AC4, `bug-040-builtin-directive-docs-stale-after-task-057`,
REQ-SYS-05, REQ-SEC-05.
