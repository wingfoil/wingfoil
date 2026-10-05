---
id: "task-188-correct-spec-011-bindings-id-stale-builtin-templates"
type: task
title: "Correct `spec-011` (bindings by id) and every stale \"built-in templates not yet implemented\" text"
status: in-review
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "docs", "directives"]
ref: "dl-060"
bug: ["bug-040", "bug-191", "bug-213"]
depends_on: ["task-153-reconcile-req-state-08-p1-13-scenario-memory"]
tmpl_version: 260703
---

## Description

`spec-011` says `roles.yaml` binds by directive name (`:113,:126`), the code binds by id (`dl-060`). `.wingfoil/roles.yaml:3`, the six stand-ins' line 15, `spec-011:45-46,122` and `src/core/builtin-asset.ts:8` still say the P3.8 built-ins are not implemented (`bug-040`). One edit of `spec-011`, after task-153's row fix.

## Acceptance Criteria

- (characterization) `grep -rn "not yet implemented" .wingfoil src docs/04_memory/design/specs` finds none of the listed sites; `spec-011` says "id" with a Revision note; config files version-bumped.
- (characterization) the positive control is recorded: the same grep at the task's base commit hits each listed site; `src/core/builtin-asset.ts`'s "empty today" is corrected; the stand-in reconciliation itself is stated as out of scope in the stand-ins' text (from proposal D05).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-060; spec-011.
- **Features:** P3.7, P3.8.
- **Notes:** Proposal key: C37 (merged: D05). Merged with proposal D05 (same `dl-060`/`bug-040` change). Runs after task-153 because both edit the same `spec-011` passage; task-196 extends `spec-011`'s layout after this task.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B3 (2026-10-02, `task-169`'s independent review).** `dl-062`'s approve Reason (`4cd18767`) keeps the Action "the write contract into spec-011, merged with dl-060's and bug-040's corrections": a `roles.yaml` write-contract subsection in `spec-011`. This task edits `spec-011` for `dl-060` and `bug-040`, so it carries that subsection too. `task-169` shipped the behaviour it describes: `directive assign` refuses the whole-file rewrite unless `--force`.

## Execution Notes

### design (architect, 2026-10-05)

- **Inputs.** `depends_on: [task-153]`, `done`; its Execution Notes (dl-015) leave two things here:
  it fixed `spec-011`'s `memory.yaml`/`dna.yaml` cells (so this task edits the same file after it, as
  planned), and its review says "`spec-009` §1 still quotes `states.values`", which is `bug-213`.
  `task-169` (`done`) shipped the `dl-062` behaviour and pinned the strings in `spec-008` §6/§12, and
  handed `dl-062`'s `spec-011` Action here (its notes, "dl-062's spec-011 Action"). Status check:
  `grep -m1 "^status"` → `spec-002`, `spec-008`, `spec-009`, `spec-011`, `spec-012` `approved`;
  `adr-008` `accepted`; `dl-060`, `dl-062` `ready`.
- **Bugs carried** (`bug:`): `bug-040` (stale "not implemented" texts), `bug-191` (five `paths`
  categories listed after `task-138` added `runs`), `bug-213` (`spec-009` §1, `state-machine.ts` TSDoc
  and `adr-008` name the retired `values`/`initial`/`transitions` encoding). Their acceptance, beyond
  the ACs (`dl-045`): `bug-191` — the six categories or a pointer to `spec-002`'s Categories section at
  `06_features.md` P2.5, `spec-011` and `spec-012`; `bug-213` — `spec-009`'s example names a field that
  exists, the TSDoc follows it, `adr-008` carries a dated note (adr is `amendable: true`,
  `memory.yaml` `grep -n amendable` on the `adr` entry).
- **Already fixed on main, nothing to do** (`git grep` at `0cf8b131`): `.wingfoil/roles.yaml:3` (rewritten by
  `task-133`, `4cbd666f`: "predates the P3.8 built-in templates `wingfoil init` now installs");
  `spec-012`'s category list (line 105 already adds `runs`).
- **AC classification** (testing directive): all characterization — documentation, config comments
  and TSDoc; no behaviour changes, so no red is possible without fabricating one.

  | AC | Class | Evidence |
  |---|---|---|
  | AC1 — no "not yet implemented" at the listed sites; `spec-011` says "id" with a Revision note; config files version-bumped | characterization | grep below |
  | AC2 — positive control at base; `builtin-asset.ts` "empty today" corrected; reconciliation stated out of scope in the stand-ins | characterization | `git grep` at `0cf8b131` below |
  | `bug-191`, `bug-213` | characterization | grep below |

- **Shape.** One edit of `spec-011` carrying `dl-060` (id), `bug-040` (built-ins ship; this repo's
  `built-in/` still empty), `bug-191` (`dna.yaml` cell) and `dl-062`'s write contract, as a new
  "`roles.yaml` write contract" subsection that states what `task-169` shipped and points to
  `spec-008` §6/§12 for the strings and the flag rather than copying them (one home per string).
  Same-class, same paragraphs: the `custom/` listing gains `git-conventions.md` (`task-178`) and the
  tree's `security.md` line says it is global since `task-133` (`ls .wingfoil/directives/custom/*.md |
  wc -l` → 13); the Context and the `wingfoil init` consequence no longer call the tool unbuilt.
  Same-class outside the bug's list: `.wingfoil/dna.yaml`'s `paths` comment listed five categories
  (`git grep -n "config, governance)" 0cf8b131 -- .wingfoil/dna.yaml` → line 169) — fixed, `version`
  1.4 → 1.5.
- **Out of scope, left (ownership):** `CLAUDE.md` §3 and `.wingfoil/README.md` "interim decision" say
  reconciling the stand-ins is `bug-040`'s scope; both are `align-agent-docs` outputs (`dl-025`), the
  same exclusion `bug-191` makes for `CLAUDE.md`. `X_cli-cmds.md` (owned by `task-245`) and
  `docs/user-guide.md` (`user-docs`) likewise, per `bug-191`'s Notes. Reported, not filed.
- No test added: the ACs are greps over prose; a test pinning the absence of a phrase would guard
  wording, not behaviour (testing directive, "a guard says exactly what it asserts").

### red (2026-10-05)

No red commit: every AC is characterization (design above). Positive control at the base commit
(AC2), `git grep -n "not yet implemented" 0cf8b131 -- .wingfoil src docs/04_memory/design/specs` → 8
hits: the six stand-ins (`architecture.md:15`, `code-quality.md:15`, `code-review.md:15`,
`documentation.md:16`, `security.md:16`, `testing.md:15`) and `spec-011` lines 46 and 211. Also at
`0cf8b131`: `git grep -n "empty today" -- src/core/builtin-asset.ts` → line 8; `spec-011` "directive
names" / "directive **name**" → lines 113, 126; `states.values` → `spec-009:62`,
`src/memory/state-machine.ts:15`; five categories → `06_features.md:51`, `spec-011:111`,
`.wingfoil/dna.yaml:169`.

### green (2026-10-05)

- `aba38511` — the six stand-ins' note: the built-ins ship and `init` installs them (`task-057`), this
  configuration predates them, reconciliation is out of scope of `bug-040` and not scheduled.
  `roles.yaml` 1.3 → 1.4: header drops "(bug-040)" as the reconciliation's owner and states bindings
  are ids (`dl-060`).
- `3038996a` — `builtin-asset.ts` TSDoc (`bug-040`); `state-machine.ts` TSDoc quotes `spec-009`'s new
  example (`bug-213`). The name-resolvability gate then reported `states.values` unlisted in
  `spec-009`/`spec-010` (the TSDoc had been the only source resolving it); both Revision-note mentions
  are allowlisted as "retired on purpose", and `spec-010`'s `states.initial` entry gets the same reason
  instead of `UNTRIAGED`.
- `370ee013` — `06_features.md` 1.7 → 1.8 (P2.5 row, six categories + `spec-002` Categories),
  `00_index.md` row and "Last indexed"; `dna.yaml` 1.4 → 1.5 (`paths` comment) (`bug-191`).
- Uncommitted, pending amendments (below): `spec-011` (id; built-ins as shipped; six categories;
  `roles.yaml` write contract; `git-conventions.md` and `security.md` listing lines; Revision note),
  `spec-009` §1 example + Revision note, `adr-008` dated Correction note.

After: `grep -rn "not yet implemented" .wingfoil src docs/04_memory/design/specs` → no output (exit 1).
`grep -n "directive \*\*id" docs/04_memory/design/specs/spec-011-storage-layout.md` → lines 114, 131,
306. `grep -rn "states\.values" src docs/04_memory/design/specs` → only the two Revision notes
(`spec-009:277`, `spec-010:272`).

### refactor (2026-10-05) — gates, with the pending amendments in the working tree

- `npm test` → 243 suites, 4609 tests: 2 failures, both explained — `name-resolvability`
  (fixed in `3038996a`, then `npx jest test/docs` → 7 suites, 34 passed) and
  `test/mcp/resource-latency.test.ts` (perf, load average ~50 with B3 in parallel; alone → 4 passed).
- `npm run test:coverage` → 243 suites, 4609 tests, coverage 99.07 / 96.18 / 96.18 / 99.68 — equal to
  main's recorded 99.07 / 96.18 / 96.18 / 99.68 (dev-loop plan, B2 gates on `07000bc0`). One perf
  failure in that run, `test/core/query-latency.test.ts` (REQ-PERF-02, `uptime` load average 50);
  alone it failed once more, then `npx jest test/core/query-latency.test.ts` → 4 passed. No code path
  it measures was touched (the only `src/` changes are TSDoc).
- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`,
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- `node scripts/check-governance.cjs --base 0cf8b131` → exit 0 (0 findings).
- Name-resolvability: 52 untriaged, 35 stale entries (`npx jest test/docs/name-resolvability.test.ts`);
  no stale entry names a document this task edits.
- BDD: no scenario changes — no behaviour changed. P3.2 (`directive assign`) keeps its scenarios; the
  write contract `spec-011` now states is the one `task-169` pinned by tests.

### review (reviewer, 2026-10-05)

- AC1 met: grep above; `spec-011` says id at both former sites (`:114`, `:131`) with a dated Revision
  note; `roles.yaml` 1.4, `dna.yaml` 1.5, `06_features.md` 1.8 bumped once (baseline main).
- AC2 met: positive control recorded (red); `builtin-asset.ts` corrected; each stand-in states the
  reconciliation is out of scope (`grep -c "out of scope" .wingfoil/directives/custom/{architecture,code-quality,code-review,documentation,security,testing}.md` → 1 each).
- `bug-191`: P2.5 row, `spec-011` cell, `dna.yaml` comment name six; `spec-012` already did.
- `bug-213`: `spec-009` §1, `state-machine.ts` TSDoc and `adr-008` note; the `adr-008` Context, Negative
  and Neutral bullets keep the old words under the note's "wherever this document says" clause (the
  `adr-001` Correction precedent).
- `dl-062` write contract: each clause checked against `src/core/directive-assign.ts`
  (`updateRoleAssignments`: confinement, unmodified-target, newer-format refusal, unchanged list →
  no commit, `CONFLICT` without `force`, warning with it, missing file written whole) and
  `src/directives/roles-edit.ts` (`setRoleAssignmentsInText`'s refusal list).
- Decisions for the approver: (1) the write contract points at `spec-008` §6/§12 for the strings and
  the flag instead of repeating them; (2) the same-class fixes beyond the bug lists (`dna.yaml` comment,
  `git-conventions.md`/`security.md` listing lines, `spec-011` Context sentence); (3) `spec-010`'s
  `states.initial` allowlist reason changed from `UNTRIAGED`.

### Pending amendments (approver)

Uncommitted in the worktree; the gates above ran with them.
- `spec-011-storage-layout` — `--reason "roles.yaml binds by directive id (dl-060); the P3.8 templates ship and init installs them, while this repository's built-in/ stays empty (bug-040); the dna.yaml cell names the six paths categories (bug-191); a new roles.yaml write contract subsection states what task-169 shipped for dl-062 Q1 option 3, including the VALIDATION refusal of an invalid or newer-format file. The custom/ listing gains git-conventions.md and the security.md line says global (task-188)."`
- `spec-009-validation-strategy` — `--reason "Section 1's cross-file example names the states of spec-001's machine instead of the retired states.values key (bug-213, task-188)."`
- `adr-008-per-type-state-machines` — `--reason "A dated correction note: machines use spec-001's sequence/gates/waiting encoding, the default machine has no rejected state, and decision-log has its own machine. The decision is unchanged (bug-213, task-188)."`
- `spec-013-directive-frontmatter-schema` — `--reason "The P3.8 anchor no longer says reconciling the stand-ins with the shipped templates is bug-040's: bug-040 corrected only the documentation, and the reconciliation is out of its scope and not scheduled, as spec-011 and the stand-ins now say (task-188 review)."`

### review fixes (2026-10-05, coordinator: approve with fixes; no re-submit)

- Same-class: `spec-013` §Context (P3.8 anchor) said "reconciling the two is `bug-040`", contradicting
  the new text. Reworded the same way (out of `bug-040`'s scope, not scheduled) with a dated Revision
  note — a fourth pending amendment, uncommitted (`--reason` above). `grep -rn "bug-040" docs/04_memory/design/specs`
  → only `spec-011`'s and `spec-013`'s Revision notes and the reworded anchor.
- Polish, `spec-011` write contract: a file that is not valid YAML, fails the `roles.yaml` schema or
  has a newer `format:` is refused with `VALIDATION` (exit `1`) before any write, `--force` included —
  checked against `updateRoleAssignments` (`parseRoles` runs before the edit and the `force` branch)
  and `src/core/exit-code.ts` (`VALIDATION: 1`). `spec-011`'s `--reason` updated above.
- `npx jest test/docs` → 7 suites, 34 passed.
