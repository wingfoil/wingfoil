---
id: "task-138-dna-yaml-declares-team-agents-adapter-runs-paths"
type: task
title: "`dna.yaml` declares `team.agents[].adapter` and the `runs` paths category"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "dna", "schema"]
ref: "spec-016"
bug: []
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`spec-016` needs two DNA declarations that the schema tolerates today but does not validate: - `team.agents[].adapter`, the link from *who* runs to *how* it is launched; - `paths.runs`, a sixth `paths` category holding exactly one directory, the run log. Until `spec-002` declares them, `dna set` / `dna update` refuse the paths (`spec-002` "Unknown keys: accepted on read, refused on write", `adr-012` Consequences), and `wingfoil paths runs` is not a documented category.

## Acceptance Criteria

- (red-first) `AgentEntry` validates an optional `adapter` string in `spec-009`'s id class. `dna update team.agents.<name> --entry-adapter <a>` succeeds; a non-string value is refused.
- (red-first) `Paths` declares `runs` (an array holding exactly one entry). Two entries are a validation error naming `paths.runs`.
- (red-first) `wingfoil paths runs` prints the declared directory, and the positional description at `src/core/index.ts:1833` lists `runs`.
- (red-first) `wingfoil init` scaffolds `paths.runs: [docs/runs/]` (`spec-016` §4.1); `src/storage/templates.ts`.
- (characterization) This repository's `.wingfoil/dna.yaml` still loads (no `adapter`, no `runs` yet: task-206 and task-236 add them).
- (characterization) Docs, each with a `doc-versioning` bump: `spec-002` (both fields, and `runs` in §Categories); `docs/cli-reference.md` `paths` entry.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §2.1 (adapter link), §4.1 (`paths.runs`, R18); dl-114 Action 2; dl-135 Action 5 (v0.3 half).
- **Features:** P2.4, P2.5, P5.3.1.
- **Notes:** Proposal key: B04. `src/dna/schema.ts`, `src/storage/templates.ts`, `src/core/index.ts`. The first `team.agents` entry in a project with none meets `bug-126`, which domain A/B's comment-stripping cluster owns; not claimed here. The `X_cli-cmds.md` rows for `runs` / `--entry-adapter` are task-245's (one owner for that file).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-138-dna-yaml-declares-team-agents-adapter-runs-paths`, worktree `../.wf2-wt/task-138`,
cut from `main` at `5b885fd5`; start `da8f5cb7`. No `bug:` entries, so no bug syncs.

### design (architect)

**`depends_on`:** none (`depends_on: []`), so no upstream Execution Notes to read (dl-015).

**Specs.** `spec-002-dna-yaml-schema`, `spec-009-validation-strategy` and `spec-016-agent-execution` are
all `approved` (`grep -n "^status:"` over the three files). `spec-016` §2.1 makes `adapter` an optional
`team.agents[]` field, "moves from tolerated by `.passthrough()` to validated"; §4.1 makes `runs` a
sixth `paths` category "holding exactly one directory" and has `init` scaffold `paths.runs: [docs/runs/]`.
`spec-009` §1's id class is `[a-z0-9-.]`, exported by `src/validation/id.ts` as `ID_CHAR_CLASS` /
`isIdPiece`; `src/workflow/schema.ts` already imports from that module, so `src/dna` doing the same
adds no new kind of cross-module edge (`test/core/pillar-isolation.test.ts` stays green, refactor).

**Spec edit the ACs require:** `spec-002` (AC 6) gains both fields in its Zod definition, `runs` in
§Categories, and a dated Revision note. `spec-002` declares no `version:` (the `version: 1.1` at its
line 221 is inside the example YAML), so `doc-versioning` (`dl-047`) asks for the Revision note, not a
number; likewise `docs/cli-reference.md` declares no version, so the "doc-versioning bump" of AC 6 is
nothing for that file. `spec-002` is past its first state: the edit is a **pending amendment** (below),
left uncommitted in the worktree.

**AC classification (T1).**

| AC | Class | Why (measured before green, red run below) |
|---|---|---|
| 1 — `adapter`, `--entry-adapter`, non-string refused | **red-first** | `dnaUpdate ... --entry-adapter` was refused as "not a field of 'team.agents' entries"; `adapter: 42` loaded |
| 2 — `paths.runs` exactly one entry | **red-first** | two entries loaded; `dna add paths.runs` refused as an unknown key |
| 3 — `paths runs` prints the directory; description lists `runs` | **split** | the lookup is by raw key over a `.passthrough()` node, so a declared `runs` was already printed → **characterization** (passed on the red run). The positional description and the fresh-`init` end-to-end case → **red-first** |
| 4 — `init` scaffolds `paths.runs: [docs/runs/]` | **red-first** | the scaffold had no `runs` |
| 5 — this repository's `.wingfoil/dna.yaml` still loads | characterization | pinned by the existing `test/dna/schema.test.ts` "validates the real, live .wingfoil/dna.yaml"; the file is not touched (task-206/task-236 add `adapter`/`runs`) |
| 6 — docs | characterization (documentation) | `spec-002` amendment + `docs/cli-reference.md` |

`"a non-string value is refused"`: the CLI only ever passes strings, so the non-string half is pinned at
the schema (`adapter: 42 | true | [..]`) and at the loader (a `dna.yaml` carrying `adapter: 42` does not
load, naming `team.agents.0.adapter`). The CLI half is an adapter name outside the id class
(`"Claude Code"`), refused at exit `1` by `dna update`'s schema re-validation.

**BDD.** `P2.5-paths.feature` gains the scenario "Query the run-log category of a freshly initialized
project"; BDD here is mirrored by hand in Jest (no runner reads `.feature` files —
`grep -rn "02_bdd" test` hits comments only), and the scenario is driven by the end-to-end case in
`test/core/dna-agent-adapter-runs.test.ts`.

### red (developer)

`48df1a06`: `test/dna/schema.test.ts` (adapter + `paths.runs` cases), `test/dna/path.test.ts`
(`team.agents` entry fields gain `adapter`; `paths.runs` resolves as a `string-list`),
`test/cli/derived-option-namespace.test.ts` (the DRIVES row for `team.agents` sets `--entry-adapter`
through the compiled CLI), `test/storage/templates.test.ts` (each template scaffolds `paths.runs:
[docs/runs/]` and loads), new `test/core/dna-agent-adapter-runs.test.ts` (verbs, loader, `paths`
op, positional description, fresh-`init` `wingfoil paths runs`), and the BDD scenario.
`npx jest test/dna/schema.test.ts test/dna/path.test.ts test/storage/templates.test.ts
test/core/dna-agent-adapter-runs.test.ts test/cli/derived-option-namespace.test.ts` → **23 failed, 89
passed**. Every failure is for the expected reason (e.g. `'--entry-adapter' is not a field of
'team.agents' entries`, `Received function did not throw`, description `"sources, tests, docs, config
or governance ..."`, e2e `no paths mapped for category 'runs'`). The one new test that passed is AC 3's
characterization (`paths runs` over a declared `runs`).

### green (developer)

`efaba769`:
- `src/dna/schema.ts` — `AgentEntry.adapter: z.string().refine(isIdPiece, …).optional()` (message names
  the class); `Paths.runs: z.array(z.string()).length(1, 'paths.runs holds exactly one directory, the
  run log (spec-016 §4.1)').optional()`. `--entry-adapter` and the `paths.runs` write path follow
  mechanically: the option set and the path resolver are derived from the schema (`dnaEntryOptionNames`,
  `resolveDnaPath`), so no verb code changes.
- `src/storage/templates.ts` — the dna scaffold writes `runs: [docs/runs/]` with a one-line comment.
- `src/core/index.ts` — only the `paths` positional description: "sources, tests, docs, config,
  governance or runs".
Same five suites → **5 passed, 303 tests passed** (run together with `test/dna`, pillar-isolation and
module-layout).

`5fdade93` — `docs/cli-reference.md`: the `dna add` field table gains `adapter` for `team.agents`; the
`paths` entry lists `runs` and states its one-entry rule and the `init` default.
`npx jest test/docs` → 4/4.

### refactor (developer)

Run with the `spec-002` amendment in the working tree:
- `npm run test:coverage` → 178 suites, **2994 passed, 1 failed**: `test/cli/publish-secrets.test.ts`
  "publishes (dry run) the tarball …" (a real `npm publish --dry-run`, empty output under parallel
  load). Re-run alone: `npx jest test/cli/publish-secrets.test.ts` → **24/24 passed**; it touches no file
  this task changed. Coverage All files **98.82 | 95.14 | 94.44 | 99.52** (stmts | branch | funcs |
  lines), against the last figure recorded on `main` in `task-139`'s notes, `98.73 | 94.58 | 94.01 |
  99.49` — not regressing. `src/dna/schema.ts` 97.05 | 90 | 100 | 100: its one uncovered line (41) is
  `uniquelyNamed`'s pre-existing non-string-name guard, not a line this task added.
- `npm run lint` → exit 0. `npm run docs:api` → exit 0.
- `npx tsc --noEmit -p tsconfig.json` → exit 0; `npx tsc -p tsconfig.build.json --noEmit` → exit 0.

No refactor commit was needed.

### review (reviewer, self)

- AC 1: `dna update team.agents.claude --entry-adapter claude-code` → ok, committed, loads back
  (`dna-agent-adapter-runs.test.ts`); also `dna add team.agents … --entry-adapter claude-code` through
  the compiled CLI (`derived-option-namespace.test.ts`). Non-string refused at schema and loader; out-of-
  class name refused at exit 1, file and HEAD untouched. Met.
- AC 2: two entries → issue at `paths.runs` whose message names `paths.runs` (schema), loader throws
  naming it, a second `dna add paths.runs` refused at exit 1 with HEAD unchanged. Zero entries are
  refused too (`length(1)`): "exactly one" read literally. Met.
- AC 3: `paths runs` → `{category: 'runs', paths: ['docs/runs/']}` from the core op and from the compiled
  CLI after `wingfoil init`; positional description lists `runs`. (The AC's `src/core/index.ts:1833`
  citation has drifted; the description is now at the `paths` operation, `grep -n "governance or runs"
  src/core/index.ts`.) Met.
- AC 4: both templates (Scrum, Kanban) scaffold `paths.runs: [docs/runs/]` and load
  (`templates.test.ts`). Met.
- AC 5: `.wingfoil/dna.yaml` untouched (`git diff 5b885fd5 -- .wingfoil/dna.yaml` empty) and still
  loads (`schema.test.ts` live-file case, green in the full run). Met.
- AC 6: `docs/cli-reference.md` committed (`5fdade93`); `spec-002` amended in the working tree, pending
  the approver's `memory amend` (below). Met, pending the amendment.
- Same-class sweep in touched files: the other place listing the five categories,
  `docs/01_vision/X_cli-cmds.md` (lines 74 and 91), is task-245's per this task's Implementation Notes
  and is left alone.

### review (independent)

**Verdict: APPROVE** (coordinator's independent review, 2026-10-01), with one wording fix applied on
this branch: the `docs/cli-reference.md` `paths` entry said a `dna.yaml` declaring *two* run-log
directories is refused; zero is refused too, and the way to change the directory is `dna update`.
It now says "declares none or two" and names `wingfoil dna update paths.runs --value <dir>`. Checked
on a fresh `init` with the built CLI: `dna remove paths.runs --value docs/runs/` → exit `1`
(`E_VALIDATION paths.runs … holds exactly one directory`); `dna update paths.runs --value other/` →
exit `0`, and `paths runs --format json` → `{"category":"runs","paths":["other/"]}`.

Follow-ups the coordinator files (not done here):
- the five-category text still in `docs/01_vision/06_features.md` (P2.5 row), `spec-011:111` and
  `spec-012:97`;
- `spec-016` §4.1's stale offsets (`src/dna/schema.ts:186-194`, "no schema change is needed");
- for `task-206`: `paths.runs` accepts `''`, absolute and `../` paths — the schema checks only the
  cardinality, so the run log must be confined at write time, with its file path built by `path.join`.

### Pending amendments (approver)

- `spec-002-dna-yaml-schema` — proposed `--reason`: "Declares team.agents[].adapter (id class, spec-009)
  and the sixth paths category runs (exactly one directory), per task-138 and spec-016 sections 2.1 and
  4.1; the Zod definition, the Categories section and a dated Revision note change, nothing else."
