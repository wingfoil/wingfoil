---
id: "task-143-make-directive-loader-robust-dangling-symlinks-project"
type: task
title: "Make the directive loader robust to dangling symlinks and to a project with no configuration"
status: done
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "directives", "first-use"]
ref: "spec-013"
bug: ["bug-125", "bug-154"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`statSync` in `src/core/loaders.ts:35` follows links, so one dangling symlink under `.wingfoil/directives/` makes every directive read throw a raw ENOENT (`bug-125`); a missing directory returns `[]` (`loaders.ts:29`), so `directives list` answers an empty listing with exit 0 in a project with no configuration (`bug-154`). `agent execute` (B) loads role directives through this loader.

## Acceptance Criteria

- (red-first) a dangling symlink is skipped with a warning naming it; other directives load.
- (red-first) `directives list` and `directives list --role x` in a git root with no `.wingfoil/` exit 1 with the "not initialized" message (same as task-174's MCP pre-flight wording).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-013; spec-012.
- **Features:** P3.4, P5.4.2.
- **Notes:** Proposal key: C15.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-143-make-directive-loader-robust-dangling-symlinks-project`, worktree
`../.wf2-wt/task-143`, cut from `main` at `cac8a447`. Start `7f22b857`; `bug-125` `[planned →
in-progress]` `a48f5fc1`; `bug-154` `[planned → in-progress]` `e641d686`.

### design (architect)

**`depends_on`:** none (`depends_on: []`), so no upstream Execution Notes to read (dl-015).
Downstream, `task-174` depends on this task and reuses the not-initialized message (below).

**Specs.** `spec-013` and `spec-012` are `approved`, and so is `spec-011`, whose init-marker
algorithm this task applies (`grep -m1 "^status" docs/04_memory/design/specs/spec-01[123]-*.md` →
`approved` ×3). `spec-013` defines the per-file frontmatter only. It says nothing about how the
directory is walked or about symlinks (`grep -n -i "symlink\|symbolic" docs/04_memory/design/specs/spec-013-*.md`
→ nothing), so skipping an unresolvable entry contradicts no spec. `spec-011`'s table already gives
the action for the `absent` state: "Not initialized / Suggest `wingfoil init`". No spec is missing
or needs revision.

**Design.**
- *bug-125.* `listMarkdownFilesSorted` (`src/core/loaders.ts`) resolves each entry through
  `resolveEntry`. `statSync` is tried first, so a symlink whose target exists is still followed,
  which keeps today's behaviour. When `stat` fails, `lstatSync` tells a dangling link apart from
  other failures. Such an entry is **skipped** and returned with its reason. The warning is
  `directive entry '.wingfoil/directives/<rel>' skipped: <reason>`: root-relative, never absolute.
  The reasons are phrased like `requireInspectableTarget`'s (task-131): `it is a symbolic link whose
  target does not exist` / `it cannot be read (<CODE>)`. New `loadDirectiveInventory(root)` returns
  `{files, warnings}`. `loadDirectives(root)` keeps its signature for its other callers (`directive
  remove`, the MCP role Prompts) and writes each warning to stderr as `Warning: <warning>`, the line
  spec-009 §2's unknown-field warning uses. `directives list` reads the inventory, and the warnings
  lead its dl-042 `warnings` array, so `--format json` and MCP readers see them too.
- *bug-154.* Define the refusal once: `WINGFOIL_NOT_INITIALIZED` + `requireInitializedProject(root)`
  in `src/core/init.ts`, beside `WINGFOIL_ALREADY_INITIALIZED`, both exported from `src/core`. The
  message is `WingFoil not initialized (no .wingfoil/ directory at the project root): run 'wingfoil
  init' first`. It mirrors the already-initialized message and init's `not a git repository: run 'git
  init' first`. It names no path, as `bug-035` and `task-174` AC 1 require. It is a `VALIDATION`
  error (exit 1). `directivesListFn` (`src/core/index.ts`) runs it as a pre-flight.
  `src/core/directives-list.ts`, which `task-144` shares, changes only in how it gets the files
  (`loadDirectiveInventory`) and gains an optional `skippedWarnings` parameter on
  `buildDirectiveListing`. Only spec-011's `absent` state is refused (plus a `.wingfoil` that is
  not a directory). An empty or partial `.wingfoil/` keeps today's answer, as `bug-154`'s Expected
  Behavior asks.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — a dangling symlink is skipped with a warning naming it; other directives load | **red-first** | today the CLI exits 1 with `{"error":"ENOENT: … stat '<abs>/.wingfoil/directives/custom/dangling.md'"}` |
| 2 — `directives list` (± `--role x`) with no `.wingfoil/` exits 1 with the not-initialized message | **red-first** | today it exits 0 with an empty listing (and the false `--role` warning) |

Characterization tests added alongside: a symlink whose target exists is still followed and loaded;
an initialized project that declares no directives still lists `{entries: [], warnings: []}`,
exit 0.

### red

`a08e8633`: tests in `test/core/loaders.test.ts`, `test/core/directives-list.test.ts` and
`test/cli/program.integration.test.ts` (the real CLI through `dist/`).
`npx jest test/core/loaders.test.ts test/core/directives-list.test.ts test/cli/program.integration.test.ts`
→ 3 suites failed, **12 failed**, 116 passed. The CLI failures were behavioural: the dangling case
exited 1 with the raw `ENOENT … stat '/tmp/…/dangling.md'`, and both no-configuration cases exited
0. The core-level failures include the missing `loadDirectiveInventory` / `WINGFOIL_NOT_INITIALIZED`
exports. The characterization "symlink whose target exists" test was in that count only because the
export was missing. The "initialized project with no directives" characterization passed on first
run.

### green

`bb493051`: the design above. One red-phase test expectation was corrected in the same commit: under
`--role developer`, the fixture's `roles.yaml` binds `security-secrets` globally without installing
it, so the dangling-binding warning for it is genuine. That was my fixture, not behaviour. Then
`npx jest` on the three suites → 128 passed.

`72ce0109`: `docs/cli-reference.md` (`directives list` describes its `warnings` and gains an
**Errors** line with the exact not-initialized message). The P3.4 feature gains `Scenario: Edge - a
directive entry that cannot be read`, transcribed by the dangling-symlink describe in
`test/core/directives-list.test.ts`. This repo has no Gherkin runner: features are transcribed into
Jest (`grep -rln "\.feature'" test` → nothing). The no-configuration case is **not** added to P3.4:
its `Background: Given an initialized WingFoil project` cannot hold for it. It is pinned in Jest
only.

### refactor

Same-class sweep in the function I touched (review directive). `readdirSync` on a subdirectory that
cannot be listed also threw a raw `EACCES` out of every directive read: the same "one entry kills
the pillar" defect. `1f83a3cc` skips it with `it cannot be read (EACCES)`. The directives directory
itself still fails the read, since it is the pillar. I confirmed that test red first, by stashing
`src/core/loaders.ts`: `npx jest test/core/loaders.test.ts` → 1 failed (`EACCES: permission
denied, scandir '…/locked'`). The symlink-loop reason (`ELOOP`) is pinned too. `063c9a97` pins an
entry behind a directory with no search permission (`EACCES` from both `stat` and `lstat`) and a
`.wingfoil` that is a file (refused as not initialized). The permission tests are skipped under uid
0, where mode bits do not bind.

Coverage follow-up. A first coverage run on `063c9a97` came out 98.83 / 95.19 / 94.92 / 99.55,
below the branch base. I compared per file (istanbul `coverage-final.json`, branch vs a detached
worktree of `cac8a447`). The drop came from new barrel re-exports, which count as getter functions,
plus two untested branches. `3a76cb8f` pins `requireInitializedProject` through `src/core` (the
import `task-174` will use) and the optional `skippedWarnings` default. It also drops a
`loadDirectiveInventory` re-export nothing needed. `b6b712da` pins that an unreadable directives
directory still fails the read.

Gates on `b6b712da`:
- `npm run test:coverage` (runs the whole suite) → 188 suites, **3213 tests**, all passed. Coverage
  98.85 / 95.27 / 95.16 / 99.55 (stmts / branches / funcs / lines). The branch base `cac8a447`,
  measured the same way in a detached worktree, gives 188 suites, 3192 tests, 98.84 / 95.24 /
  95.01 / 99.54, so no metric regresses. Uncovered lines left in touched files predate this task:
  `loaders.ts` 216 (`git blame -L216,216` → `fff886c7a`) and `init.ts` 192 and 268 (pre-existing
  `IO` catch paths).
- `npm run lint` → exit 0; `npm run docs:api` → exit 0; `npx tsc --noEmit -p tsconfig.json` → exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0; `npx jest test/docs` → 6 passed
  (`cli-reference.test.ts` included).

### review (self, reviewer)

- **AC 1, met.** `test/core/loaders.test.ts` › "a dangling symlink under directives/": the inventory
  holds the other directive plus one warning naming the link, and `loadDirectives` returns the
  others and writes `Warning: …` to stderr. `test/core/directives-list.test.ts` covers the listing,
  with and without `--role`. On the real CLI, `test/cli/program.integration.test.ts` › "`directives
  list` robustness (task-143)" checks exit 0 and the warning in the JSON payload.
- **AC 2, met.** The same CLI describe checks `directives list` and `directives list --role
  developer` in a git root with no `.wingfoil/`: exit 1, empty stdout, stderr exactly `error:
  WingFoil not initialized (no .wingfoil/ directory at the project root): run 'wingfoil init'
  first`. At core level the error code is `VALIDATION` and the message does not contain the root
  path. The "same as task-174" half is satisfied by construction: the message is one exported
  constant (`WINGFOIL_NOT_INITIALIZED`, `src/core/init.ts`) with a `CoreResult` guard
  (`requireInitializedProject`) that `task-174`'s pre-flight can call.
- **Other callers of the loader** (`grep -rn "loadDirectives(" src/` → `src/core/index.ts`
  (`directive remove`) and `src/mcp/prompt.ts`): both now get the skip + stderr warning instead of
  the throw. The MCP server writes only to stderr, never stdout, so the stdio protocol channel is
  untouched. The no-configuration refusal is wired only into `directives list`, as the AC scopes it.
  The MCP side is `task-174`'s.
- No spec edits. No pending amendments.

### review (independent)

Verdict: **approve with fixes**, four findings. Each was fixed red-first: `46888afe` holds the
failing tests (`npx jest` on `test/core/loaders.test.ts`, `test/core/directive-remove.test.ts` and
`test/cli/program.integration.test.ts` → **7 failed**, 118 passed) and `d5b3ef53` the fix.

1. **A directory symlink to an ancestor** (`custom/loop -> ..`) made `directives list` exit 0 with
   every directive listed about 41 times, a corrupt inventory reported as success. `main` had failed
   with ELOOP. The walk now keeps the `realpath` of each directory on its stack. A directory whose
   realpath is already an ancestor is skipped with `it is a symbolic link to an ancestor directory`.
   A link to a sibling directory is still walked (characterization test). The old "symlink loop"
   test covered only a file linked to itself and is renamed to say so. On the CLI with a dev build,
   `ln -s .. .wingfoil/directives/custom/loop` then `directives list --format json` → one entry, that
   warning, exit 0.
2. **An unreadable directive file** (`chmod 000`) still failed the whole read with a raw `EACCES` and
   an absolute path. The walk now returns entries in traversal order, and `loadDirectiveInventory`
   reads each file itself. A read failure is a skip, `it cannot be read (EACCES)`. A file that is read
   and fails to parse or validate stays fatal: dropping a rule an agent must obey silently is worse
   than refusing the read. The `E_MISSING_FRONTMATTER` test still passes.
3. **`src/core` printed.** `loadDirectives` wrote `Warning:` to stderr, so `directive remove ghost
   --format json` put a Warning line ahead of the `{"error"}` object, against spec-005 §3.2. Now
   `loadDirectives` returns the files only and drops the warnings. The MCP role Prompts already drop
   `resolveRoleDirectives`' warnings (`src/mcp/prompt.ts` `buildRolePrompt` doc). `directiveRemoveFn`
   reads the inventory and adds the skip warnings to its `unknown directive` refusal as
   `details.issues[].detail`, which both surfaces render (task-130). The CLI test parses stderr as
   exactly one JSON object. Its other refusals concern a directive that was found, so they carry no
   skip warnings. **Merge note:** task-169's success-warning channel can carry these warnings on a
   successful `remove` later.
4. **The directives root.** If `.wingfoil/directives` is itself a dangling symlink, the inventory is
   now empty with `directive entry '.wingfoil/directives' skipped: it is a symbolic link whose target
   does not exist`. If it cannot be listed, the read is refused as a `ValidationError`, which the CLI
   prints as `error: E_DIRECTIVES_UNREADABLE (.wingfoil/directives): it cannot be read (EACCES)`
   (exit 1, no absolute path; checked on the CLI as above). A genuinely absent directory, or one
   under a `.wingfoil` that is a file, is still "no directives", with no warning.

`docs/cli-reference.md` now lists the cases that are skipped, and adds the unreadable root as an
error.

Gates on `d5b3ef53`:
- `npm run test:coverage` → 188 suites, **3219 tests**, all passed. Coverage 98.84 / 95.25 / 95.17 /
  99.55, against base `cac8a447` 98.84 / 95.24 / 95.01 / 99.54, so nothing regresses.
- lint, `docs:api` and both `tsc` runs → exit 0.

**Follow-ups for the coordinator (not filed):**
- An empty `.wingfoil/` (spec-011 `incomplete`) passes `requireInitializedProject`. `directives list
  --role x` there still warns `no directives assigned to role 'x'`, which states something nothing
  was read to establish. spec-011 says to warn "incomplete init", but no command does that today.
- When `.wingfoil` is a file, the advice "run 'wingfoil init' first" loops: `init` refuses with `.wingfoil
  exists but is not a directory`. task-174's pre-flight reuses this message, so it inherits the loop.
- Other read commands (`dna show`, `paths`, `workflow list`, `memory search`) still leak a raw
  `ENOENT` with an absolute path when there is no `.wingfoil/`. They could adopt
  `requireInitializedProject`.
- Merge order: task-143 merges before task-144 (both touch `src/core/directives-list.ts`) and before
  task-174.

