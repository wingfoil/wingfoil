---
id: "task-156-state-what-format-console-prints-today-until"
type: task
title: "State what `--format console` prints today, until P5.1.4 gives it a human rendering"
status: in-review
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "cli", "docs"]
ref: "spec-008"
bug: ["bug-152", "bug-203"]
depends_on: []
tmpl_version: 260703
---

## Description

`console` (the default) falls back to indented JSON (`src/cli/output.ts`), while `spec-008` §2 promises colour and `✓/⚠/✗` (`bug-152`). The rendering is `dl-043`'s decision, deferred to v0.4 at gate 3 (F2). The honest v0.3 fix declares the fallback; the alternative is to pull `dl-043` into v0.3 and replace this task with its generic renderer (M).

## Acceptance Criteria

- (characterization) `spec-008` §2 and `docs/cli-reference.md` state that `console` prints indented JSON until P5.1.4, citing `dl-043`; `--help` text matches.
- (red-first) a test pins that the default output equals `--format json`'s indented form, so the v0.4 change is a visible, deliberate break.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-008 §2 (`console` row).
- **Features:** P5.1.4.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R20, Q2): documentation-only fix in v0.3; the human rendering of `console` stays with `dl-043` in v0.4.
- **Notes:** Proposal key: C46.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-156-state-what-format-console-prints-today-until`, worktree `../.wf2-wt/task-156`,
cut from `main` at `1127a0fd` (B4 and B5 merged). Start `359c0178`; `bug-152` `[planned → in-progress]`
`56db92fc`; `bug-203` `[planned → in-progress]` `6087f76e`. `bug-203` was absorbed at the approver's
triage of 2026-10-03 (amend `78fd1540`, the `bug:` list).

### design (architect)

**`depends_on`:** none (dl-015 read is empty).

**Specs and decisions.** `spec-008-cli-grammar` is `approved` (`grep -m1 "^status:"` → `approved`).
`dl-043-console-format-human-rendering` is `in-discussion`; the planning ruling R20
(`release-planning-rel-v0.3-plan`, 2026-09-30) fixes `bug-152` in the documents only and keeps
`dl-043`, and with it the rendering, in v0.4. `spec-008` §2 was wrong on two rows:

- `--format`: "`console` for humans (colour, `✓`/`⚠`/`✗` prefixes)". `renderSuccess`
  (`src/cli/output.ts`) prints `JSON.stringify(value, null, 2)`.
- `--color`: colour that `--no-color` and a non-empty `NO_COLOR` turn off. `grep -rn NO_COLOR src` and
  `grep -rn 'x1b' src` → no output (`bug-203`'s reproduction, re-run on `1127a0fd`).

**What spec-008 says about the colour flags today (decision, approver to confirm).** The flags stay
registered and accepted (removing them would break invocations that pass them). §2's `--color` row keeps
its rule, `NO_COLOR` included, as the contract the colour P5.1.4 adds must honour, and says that today
no output is coloured, so `--no-color` and `NO_COLOR` change nothing. §3 keeps the negatable pattern
(it still governs registration) and says nothing reads the colour check yet; its example carries the
new `--help` text. The alternative, deleting the `NO_COLOR` rule until P5.1.4, would lose a decided
contract and was not taken.

**`--help` wording (decision).** The help does not cite `P5.1.4` or `dl-043`, which mean nothing to
a user: `--format` reads `output format (console|json|yaml); console prints indented JSON for now`,
`--no-color` reads `disable ANSI colors (accepted; no output is colored yet)` (American spelling, as
the existing `colors`). `docs/cli-reference.md` and `spec-008` carry the citations.

**Name-resolvability allowlist.** `NO_COLOR` stays named in `spec-008` (§2, §3), so its `UNTRIAGED`
entry gets a real reason (`external: the no-color.org environment variable …`). No other name I write
in `spec-008` is unresolvable (`npx jest test/docs/name-resolvability` → 11 passed; untriaged count
77 → 76, `spec-008` 3 left, none mine: `tech_stack.cli`, `src/mcp-server`, `E_UNKNOWN_COMMAND`).

**BDD.** No scenario mentions console rendering or colour
(`grep -rn -i "format console\|--no-color\|NO_COLOR\|colou\?r" docs/02_requirements/02_bdd/features/` →
no output). None added: the ACs are a spec and help declaration.

**AC classification (testing directive).**

| AC | Classification | Why |
|---|---|---|
| 1 — spec-008 §2 and `docs/cli-reference.md` state the fallback, citing `dl-043` | characterization (documents) | Documentation edits; verified by the commands below. |
| 1 — `--help` text matches | **red-first** | New behaviour: the help strings change. `test/cli/program.test.ts` pins both descriptions. |
| 2 — default output equals `--format json`'s indented form | **characterization** (corrected from red-first) | The behaviour exists: the default already prints `JSON.stringify(v, null, 2)`. Checked before writing the test on this repository: `paths`, `dna show`, `directives list`, `workflow list` with no `--format` are byte-equal to the re-indented `--format json` output. A red here would be fabricated. The suite still makes the v0.4 change a visible break, which is the AC's purpose. |

The same suite pins `bug-203`'s declared no-op: `--no-color` and `NO_COLOR=1` give byte-identical
stdout with no escape character (characterization).

### red

`b2cf5ec6` — `npx jest test/cli/program.test.ts test/cli/console-format-fallback.integration.test.ts`
→ 1 failed, 43 passed: `Expected: "output format (console|json|yaml); console prints indented JSON
for now"`, `Received: "output format (console|json|yaml)"`. The new
`test/cli/console-format-fallback.integration.test.ts` (4 commands × 2 checks) → 8 passed on first
run, as classified.

### green

`d97bfa89` — `src/cli/program.ts` (the two help descriptions), `src/cli/output.ts` (the
`renderSuccess` comment names spec-008 §2, P5.1.4, `dl-043` and the pinning suite),
`docs/cli-reference.md` (Global options: `--format` and `--no-color` rows). Re-run of the two suites
plus `test/docs` → 8 suites, 73 passed. `7a16aaf3` — the `NO_COLOR` allowlist reason.

`spec-008` §2/§3 and its Revision note are a **pending amendment**, uncommitted (below).

### refactor

All with the `spec-008` amendment in the working tree:

- `npm test` → 215 suites, 3855 tests passed, exit 0.
- `npm run test:coverage` → 215 suites, 3855 passed; All files 98.88 / 95.56 / 95.34 / 99.58
  (main at B5: 98.88 / 95.53 / 95.34 / 99.57 — not regressing).
- `npm run lint` → 0; `npm run docs:api` → 0; `npx tsc --noEmit -p tsconfig.json` → 0;
  `npx tsc -p tsconfig.build.json --noEmit` → 0.
- `test/docs/cli-reference.test.ts` green (in `npm test`).

### review (self, reviewer)

- AC 1: `spec-008` §2 `--format` row says `console` prints `json`'s payload indented, citing P5.1.4
  and `dl-043` (`git diff -- docs/04_memory/design/specs/spec-008-cli-grammar.md`);
  `docs/cli-reference.md` Global options say the same (`grep -n "dl-043" docs/cli-reference.md` → 2
  rows); `node dist/cli.js --help` prints the two new descriptions. Met.
- AC 2: `console-format-fallback.integration.test.ts` asserts `stdout === JSON.stringify(JSON.parse(json), null, 2) + "\n"`
  for four read commands, and that `--format console` equals the default. Met.
- `bug-203`: `spec-008` and the help say the flags are accepted and change nothing; the suite pins it.
- Same-class sweep in touched files: `src/core/directives-list.ts:84` already says console "renders the
  payload as pretty-printed JSON today" (consistent). `spec-005` §2 calls `console` "colour-capable",
  which is a capability, not a promise; left (outside the AC's scope).
- Found while measuring AC 2 (not filed, reported to the coordinator): stdout is cut at 65 536 bytes
  when piped — `node dist/cli.js memory search --type bug | wc -c` → `65536` (to a file: 86 465). The
  suite's payloads stay far below it.

### review (coordinator, 2026-10-05) — approve with fixes, applied in-task

1. `docs/cli-reference.md` `--format` row and `spec-008` §2 (pending) said `console` prints the
   `json` payload, which holds for **success** stdout only. Errors and warnings under `console`
   already have their own human lines (`error: <reason>`, `hint:`, `warning:`), and under `json` an
   error is `{"error": …}` on stderr. Both now say "on success" and that errors and warnings keep
   their `error:`/`warning:` lines; the Revision note says the same.
2. The `NO_COLOR` allowlist reason said no code reads the variable. Commander 15 does:
   `grep -n "NO_COLOR" node_modules/commander/lib/command.js` → `useColor()`, which strips colour
   from its help (and the help has none). The reason now says no *WingFoil* code reads it and gives
   Commander's use. `spec-008` §2's `--color` row (pending) adds that Commander honours `NO_COLOR` but
   not `--no-color`, for P5.1.4.

Re-run with the amendment in the working tree: `npx jest test/docs test/cli/program.test.ts
test/cli/console-format-fallback.integration.test.ts` → 8 suites, 73 passed;
`npx jest test/docs/name-resolvability` → 11 passed, 76 untriaged (unchanged); `npm run lint`,
`npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` → 0. The 64 KiB pipe
truncation is filed separately by the coordinator.


- `spec-008-cli-grammar` (tech-spec, `approved`): §2 `--format` and `--color` rows, §3 closing
  paragraph and example help strings, Revision note 2026-10-05. Proposed `--reason`:
  "Records task-156: section 2 states that, on success, console prints the json payload indented, and that no output is coloured, so --no-color and NO_COLOR change nothing until P5.1.4 (dl-043, v0.4), per bug-152, bug-203 and planning ruling R20. Errors and warnings keep their section 6 lines, and Commander honours NO_COLOR but not --no-color."
