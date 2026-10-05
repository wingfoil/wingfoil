---
id: "task-164-file-new-release-under-folder-siblings-use"
type: task
title: "File a new release under the folder its siblings use"
status: approved
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "memory", "config"]
ref: "spec-001"
bug: ["bug-163"]
depends_on: ["task-128-allocate-element-ids-highest-number-ref-across-folder"]
tmpl_version: 260703
---

## Description

`release`'s path is `planning/{release-line}/{id}.md` filled from the field, but every release sits under `planning/rl-v1/` while carrying `release-line: "v1"` (6 of 6), so no value puts a new release next to its siblings (`bug-163`).

## Acceptance Criteria

- (red-first) `memory add --type release --set release-line=v1 …` writes under `planning/rl-v1/` (path pattern resolved from the release-line id), and the field keeps `v1`.
- (characterization) existing releases are untouched; `.wingfoil/memory.yaml` version bumped.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-001 path tokens.
- **Features:** P1.11.
- **Notes:** Proposal key: C30.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-164-file-new-release-under-folder-siblings-use`, worktree `../.wf2-wt/task-164`,
cut from `main` at `1127a0fd` (B4 + B5 merged). Start `0942687f`; `bug-163` `[planned → in-progress]`
at `6dbe2873`.

### design (architect)

**`depends_on` read (dl-015).** `task-128` (`done`): its counter turns every non-`{id}` `path` token
into a wildcard of one or more segments, and the literal prefix it scans is the pattern up to the last
`/` before the first `{`. A token sharing a segment with literal text (`rl-{release-line}`) therefore
still matches, and `release`'s `{kind}-{version}` has no `{n}`, so the counter is not involved.
`task-163` (`done`, B5): `memory add` writes `--set` fields through the shared setter and renders the
path with `resolveConfinedMemoryPath`, a plain token substitution (`src/storage/memory-path.ts`
`renderMemoryPath`), so `rl-{release-line}` needs no code. Both are confirmed by the green run below.

**Specs.** `spec-001-memory-yaml-schema` is `approved` (`grep -m1 '^status:'` → `approved`). Its
worked example gives `release` the path `planning/{release-line}/{id}.md`; the AC changes it, so the
spec edit is a **pending amendment** (below).

**Design decision (for the approver to confirm).** `bug-163` offers two directions: resolve the folder
from the release-line's id while the field keeps the version, or make the field hold the id. The AC
picks the first. It is done in configuration: `release.path` becomes
`docs/04_memory/planning/rl-{release-line}/{id}.md`. The literal `rl-` restates `release-line`'s
`id_pattern` (`rl-{version}`); a lookup of the parent release-line's id by its version would avoid
the restatement, but that is a dotted/element-chain token, `dl-090`'s scope (`bug-163` Notes), and
not built. The field keeps its declared meaning (`initial-design`'s `seed-releases` writes
`release-line: "{release-line.version}"`), so none of the six release documents changes.

**Same class, in this task.** Everything that restates the `release` path: the `produces:` of
`initial-design`'s `seed-releases` and `release-planning`'s `define-scope`, `.wingfoil/WORKFLOW.md`,
`.wingfoil/README.md` (it also said the folder is the release-line's *version*, which was false),
`CLAUDE.md` §3/§5, `docs/cli-reference.md`'s `memory add` example, the `release` scaffold's comment
on `release-line` ("also the path folder for this file", false), and the two `memory add` test
fixtures whose headers say they mirror this repository's `release` type
(`grep -rn "planning/{release-line}" . --include=*.ts --include=*.yaml --include=*.md` outside
`node_modules`/`dist`/closed v0.1–v0.2 Memory). *Corrected at review:* that sweep missed two more
fixtures that say they mirror `.wingfoil/memory.yaml`'s path patterns, `test/core/helpers/reference-repo.ts`
and `test/mcp/resource-latency.test.ts`; they are fixed under *Review fixes*. The other test files
still carrying `planning/{release-line}` (`element-schema`, `memory-path`, `read-only-resources`,
`relevance`, `query`) claim no mirroring (`grep -n -i "mirror\|real path"` on each → no such claim).

**BDD.** The engine's behaviour does not change (no `src/` file changes), so no `.feature` scenario
is added: the ACs are about this repository's configuration, pinned by Jest against the `memory.yaml`
committed at `HEAD`.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `memory add --type release --set release-line=v1 …` writes under `planning/rl-v1/`, field keeps `v1` | **red-first** | `bug-163`'s step 2: the committed pattern gives `planning/v1/` |
| 2 — existing releases untouched; `memory.yaml` version bumped | characterization | no release document moves; the bump is configuration |

AC 2's test ("each sits where the committed path pattern puts it") was red too, as a consequence of
AC 1's rule, not by construction: on `main` the committed pattern and the six committed releases
disagree, which is `bug-163` itself.

### red (developer)

`6b09b010`: `test/core/memory-add-release-folder.test.ts`. AC 1 runs the registered `memoryAdd` in a
scratch repository seeded with this repository's `memory.yaml` and `release` scaffold read by
`git show HEAD:…`, plus one sibling under `planning/rl-v1/`. AC 2 renders the committed `release`
pattern for each committed release document (`git ls-tree HEAD docs/04_memory/planning/`) from its own
`release-line` and `id`. `npx jest test/core/memory-add-release-folder.test.ts` → **2 failed, 1
passed of 3**: AC 1 received `docs/04_memory/planning/v1/patch-v0.2.3.md`; AC 2 listed all six
releases resolving to `planning/v1/…`. The pass is the "there are releases to check" guard.

### green (developer)

`63745534`, `fix(config)`: `.wingfoil/memory.yaml` 2.2 → **2.3**, `release.path:
"docs/04_memory/planning/rl-{release-line}/{id}.md"`; the `release` scaffold's `release-line` comment
says where the file sits, `tmpl_version` 261002 → 261005. The tests read `memory.yaml` at `HEAD`
(`dl-080` (B)), so they pass only once it is committed: same command → **3 passed**.

`0cb2bbcd`, `fix(workflow)`: `initial-design` 1.1 → 1.2 and `release-planning` 1.5 → 1.6 (`produces:`),
`WORKFLOW.md`, `.wingfoil/README.md`, `CLAUDE.md`, `docs/cli-reference.md`, and the fixtures of
`test/core/memory-add-id-tokens.test.ts` and `test/cli/memory-add-set.integration.test.ts`.
`npx jest test/core/memory-add-id-tokens.test.ts test/cli/memory-add-set.integration.test.ts test/workflow test/core/memory-add-scaffold-paths.test.ts test/memory/schema.test.ts`
(after `npm run -s build`) → 6 suites, 78 passed.

### refactor (developer)

No code to refactor (`git diff 1127a0fd --stat -- src` → empty). Gates on `0cb2bbcd`, with the
pending `spec-001` amendment in the working tree:

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 215 suites / 3849 tests; 98.88 / 95.53 / 95.34 / 99.58 |
| `npm test` | exit 0; 215 suites / 3849 tests |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

Coverage cannot regress: no `src/` line changed, and only tests were added.
`test/docs/name-resolvability.test.ts` passes with the spec edit (in the run above).

### review (reviewer)

- AC 1: `memory-add-release-folder.test.ts` "writes under planning/rl-v1/, beside the sibling, and
  keeps release-line: \"v1\"" (also asserts no `planning/v1/` is created).
- AC 2: `git diff 1127a0fd --stat -- docs/04_memory/planning` → empty (no release touched);
  "each sits where the committed path pattern puts it…" (all six); `grep -n '^version' .wingfoil/memory.yaml`
  → `2.3`.

For the approver:
- The design decision above (literal `rl-` in the path vs. a release-line id lookup, `dl-090`).
- `release-planning`'s and `initial-design`'s bare `{release-line}` in `produces:` is read as the
  release's field value, as in `memory.yaml`; no workflow engine resolves it yet.

### Pending amendments (approver)

- `spec-001-memory-yaml-schema` — worked example `release.path` → `planning/rl-{release-line}/{id}.md`,
  one sentence in the `path` placeholder paragraph, and a dated *Revision (2026-10-05)* note.
  Proposed `--reason`: "task-164 (bug-163): the release worked example files a release under
  planning/rl-{release-line}/, the release-line's id, as memory.yaml 2.3 does; the release-line field
  keeps the version, so no release moves; counter step 1 says a placeholder's wildcard may start
  inside its segment. Edited in place with no version bump (dl-047)."

### Review fixes (coordinator review, 2026-10-05: approve with fixes)

1. **Same-class sweep.** `test/core/helpers/reference-repo.ts` and `test/mcp/resource-latency.test.ts`
   (both "Mirrors .wingfoil/memory.yaml's real path patterns") now carry
   `planning/rl-{release-line}/{id}.md`. Neither plants a release document, so no assertion changes.
2. **Drift guard.** `memory-add-release-folder.test.ts` "the folder of release.path is release-line's
   id_pattern with {version} read from {release-line}": on the committed `memory.yaml`, the last folder
   of `release.path` must equal `release-line`'s `id_pattern` with `{version}` replaced by
   `{release-line}`, so the `rl-` literal cannot drift from `rl-{version}` unnoticed. Characterization
   (it passes on the green configuration).
3. **spec-001 counter step 1** (pending amendment, still uncommitted): the wildcard of a non-`{id}`
   placeholder begins and ends where the placeholder does, so `rl-{release-line}` matches inside a
   segment (the code, `PATH_TOKEN_SOURCE` in `src/memory/add.ts`, already behaves so). The Revision
   note says it.

`npx jest test/core/memory-add-release-folder.test.ts test/core/query-latency.test.ts test/mcp/resource-latency.test.ts test/docs/name-resolvability.test.ts`
→ 4 suites, 23 passed (`test/cli/command-latency.test.ts`, the third user of `reference-repo.ts`,
is opt-in via `npm run test:latency` and was not run under load). `npm run -s lint`,
`npx tsc --noEmit -p tsconfig.json`, `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
