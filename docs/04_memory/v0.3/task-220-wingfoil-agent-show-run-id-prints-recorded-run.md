---
id: "task-220-wingfoil-agent-show-run-id-prints-recorded-run"
type: task
title: "`wingfoil agent show <run-id>` prints one recorded run and the commit that added it"
status: in-review
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "agent", "cli", "read-only"]
ref: "dl-135"
bug: []
depends_on: ["task-206-agent-execute-records-run-json-lines-line-under"]
tmpl_version: 260703
---

## Description

`agentShow` (`mutates: false`, CLI only in v0.3) reads `<runs>/<element-id>.jsonl` at `HEAD` and finds the commit that added the line (`git log -S`). Console prints `key: value` lines in §4.2 order; JSON/YAML prints `{baseline, run, commit}`.

## Acceptance Criteria

- (red-first) A recorded run → console lines in §4.2 order, with `tokens.input` and the other token fields flattened, then `commit: <sha>`, where `<sha>` is the `agent: record <run-id>` commit. JSON carries `baseline.rev: "HEAD"`.
- (red-first) A malformed id → exit 2 `error: invalid run id "<value>", expected <element-id>/<phase>/<n>`.
- (red-first) An unknown id → exit 1 `run not found: <run-id>`. If the run exists only in the working tree, a `hint:` line says so, and the refusal stands (`command-baseline`).
- (characterization) Docs, each with a `doc-versioning` bump: new BDD `p5-interaction/P5.3.5-agent-show.feature`; `06_features.md` new row "agent show" (proposed `P5.3.5`); the `spec-006` §3 feature column; `minor-v0.3` `features:` through `memory amend`; `docs/cli-reference.md` entry.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-135 point 4 (v0.3 half); spec-016 §6, §5.1; R15.
- **Features:** new P5.3 row "agent show.
- **Notes:** Proposal key: B13. a run id contains `/`. It is a CLI positional here; the URI encoding is v0.4 (spec-016 §7).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-220-wingfoil-agent-show-run-id-prints-recorded-run`, cut from `main` at `4fd77678`
(wave 3, batch B2); start `c35d4bd6`. `bug: []`, so no bug syncs.

### design (architect)

**`depends_on` (dl-015).** `task-206` is `done` (`grep -m1 "^status:"`). Its notes hand this task the
run-log API (`readRunLogAt`, `parseRunLog`, `isRunId`, `resolveRunLogPath`, `RUN_RECORD_KEYS`) and this
repository's `paths.runs: [docs/06_runs/]`; both are used as given.

**Specs.** `spec-016` (§4.2–§4.5, §5.1, §6, §8), `spec-005`, `spec-006`, `spec-008` are `approved`;
`dl-135` and `dl-084` are `ready` (`grep -m1 "^status:"`).

**What §6 needs that no seam carried** (both recorded as `spec-006` §2 pending amendments):
- a refusal that keeps its code and exit `1` while a `hint:` line explains it → `CoreError.hint`
  (optional), printed by the CLI registrar through `emitError`'s existing `hint` option;
- a console rendering of its own (`key: value` lines) where `spec-008` §2 declares indented JSON for
  every command → `CoreOperation.renderConsole` (optional), used by the registrar under `--format
  console` only; `json`/`yaml` and MCP never call it.

**Placement.** `src/core/agent-show.ts` (the `CoreFn` and the renderer), registered as
`agent.agentShow` in `CORE_MODULES` — the `agent` module's first operation. `src/agent/run-log.ts` gains
`runIdElementId(value)` (the run-id parse for a caller that only has the id) and an `action`
parameter on `resolveRunLogPath` (`'write'` default, `'read'` for this reader's confinement wording).
Baseline: `HEAD` resolved once; `dna.yaml` and the log are read at that sha (`spec-016` §5.1, declared).
The adding commit is found with `git log -S '{"id":"<run-id>",' --format=%H <head> -- <log>` (refined
by review F2 below: the first listed commit whose log blob holds the line).

**Parity.** `spec-005` Context already names the `agent` noun, `spec-008` §1 and §11 already name
`agent show` (`grep -n agent` on both), so neither needs an enumeration amendment: the three
allowlist entries this command makes stale are removed instead (`npx jest
test/docs/commands-parity.test.ts` reported them `stale`, then none). No exit code or Memory
type/state is added. `spec-008` §2 does need a sentence (the console exception) — pending amendment.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 recorded run → console lines, JSON `{baseline, run, commit}` | red-first | no operation existed (`agent` module had `operations: {}`) |
| 2 malformed id → exit 2 | red-first | new |
| 3 unknown id → exit 1, working-tree `hint:` | red-first | new |
| 4 docs | characterization (documentation) | BDD, `06_features.md`, `spec-006` §3, `minor-v0.3` `features:`, `docs/cli-reference.md` |

### red (developer)

`ad1e1d29` — `test/core/agent-show.test.ts` (core operation) and
`test/cli/agent-show.integration.test.ts` (compiled CLI bytes). `npx jest test/core/agent-show.test.ts
test/cli/agent-show.integration.test.ts` → **35 failed, 35 total**: `"agentShow" is not registered on
the agent module` (core) and `error: unknown command 'agent'` (CLI).

### green (developer)

`f216d8ff` — `src/core/agent-show.ts`, the registration, `CoreError.hint`,
`CoreOperation.renderConsole`, the registrar's two uses, `runIdElementId`, `resolveRunLogPath`'s
`action`; `docs/cli-reference.md` gains `## Agent` / `### wingfoil agent show` (and the *Git side
effects* read bullet names `agent show`'s `HEAD`); the allowlist loses its three stale entries;
`test/core/parity.test.ts` and `test/agent/module.test.ts` list the new read-only Resource / operation.
One test defect fixed in the same commit: both fixtures' `dna.yaml` lacked the required `stacks`
section (the loader refused it), which no assertion depended on. Same command → **35 passed**.

Behaviour per AC, as built:
- AC 1: payload `{baseline: {rev: "HEAD", commit: <HEAD sha>}, run: <record in §4.2 key order>, commit:
  <adding sha>}`; console `id: …` … `tokens.input: …` … `notes: …`, then `commit: <sha>`. The adding
  commit is the `agent: record <run-id>` commit, also when the record reached `HEAD` through a merge
  (tested). `paths.runs` is read from `HEAD`'s `dna.yaml`, so a working-tree edit does not change the
  answer (tested).
- AC 2: `error: invalid run id "<value>", expected <element-id>/<phase>/<n>`, exit `2`, refused before
  the project is read (tested outside an initialized project); a missing operand is the registrar's one
  missing-operand form with `hint: usage: wingfoil agent show <run-id>`.
- AC 3: `run not found: <run-id>`, `NOT_FOUND`, exit `1`; when the working tree's log (a regular file,
  parsed strictly) holds the id, `hint: the working tree's <log> holds <id>, but HEAD does not: agent
  show reads HEAD; commit the run log to show it`; a working-tree log that does not parse gives no hint.

`df8bae77` — AC 4 docs: `06_features.md` 1.10 → 1.11 (2026-10-07), P5.3.5 row in the P5.3 table and
the v0.3 table, total 63 → 64; new `p5-interaction/P5.3.5-agent-show.feature` (5 scenarios), listed in
the BDD index; `docs/01_vision/00_index.md` re-synced (06_features row and ranges). task-141's index
script, with its two excluded `06_features.md` code-block lines moved from `(380,414)` to `(382,416)`
by the two inserted rows → `mismatches: []`.

### refactor (developer)

`04f348e0` — tests only: `test/core/production-registry.test.ts` (roster gains `agent.agentShow`),
`test/cli/journey-0a.integration.test.ts` (`agent execute` now fails on `unknown command 'execute'`,
the noun exists), `test/cli/registrar.test.ts` (renderConsole under console and not under json; a
`CoreError.hint` as the `hint:` line, exit 1), `test/core/agent-show.test.ts` (invalid `dna.yaml` at
HEAD → `VALIDATION` with issues; an unwalkable history → `IO`).

Gates, with the pending amendments in the working tree:
- `npm run test:coverage` (run before the registrar block was added) → 293 suites, **5469 passed, 0
  failed**. A first run had 3 failures: the two pinned rosters fixed in `04f348e0`, and
  `test/core/query-latency.test.ts` under load (≈50, `uptime`), which passed alone (`npx jest
  test/core/query-latency.test.ts …` → passed).
- Coverage All files **99.24 | 96.94 | 97.12 | 99.70** against the W3 B1 gate's **99.29 | 97.05 |
  97.11 | 99.72** (`devloop-kit/gate-w3b1-cov.log`). Per directory the drop is `src/core` (99.79 →
  99.66 stmts, the new `agent-show.ts` at 95.18 | 83.33 | 100 | 98.48: line 126, a non-`RevisionError`
  rethrow) and `src/cli/registrar.ts` branches (100 → 97.22, before the registrar block that now
  exercises both renderConsole arms and the hint). Above 80%; the coordinator's gate run decides the
  regression question on merged `main`.
- After `04f348e0`: `npx jest test/core/agent-show.test.ts test/cli/registrar.test.ts
  test/core/production-registry.test.ts test/cli/journey-0a.integration.test.ts` → **82 passed**.
- `npm run lint` 0; `npm run docs:api` 0; `npx tsc --noEmit -p tsconfig.json` 0; `npx tsc -p
  tsconfig.build.json --noEmit` 0; `node scripts/check-governance.cjs --base 4fd77678` → 0 findings.

### review (reviewer, self)

- AC 1–3: met, by the cases named above (28 core + 9 CLI tests, green).
- AC 4: BDD, `06_features.md`, `docs/cli-reference.md` committed; `spec-006` §3 and `minor-v0.3`
  `features:` are pending (below).
- Same-class sweep in touched files: the global `--format` row of `docs/cli-reference.md` and
  `spec-008` §2 both said every `console` is indented JSON — both now name the exception;
  `spec-016` §8 says its rows equal `spec-006` §3 "cell for cell", so its `agentShow` module cell is
  amended with `spec-006`'s.
- Decisions for the approver: (1) the two new seams `CoreError.hint` and `CoreOperation.renderConsole`;
  (2) `dna.yaml` absent at `HEAD` → `NOT_FOUND` `.wingfoil/dna.yaml is not committed at HEAD, which agent
  show reads: commit it first`; no `paths.runs` → the recorder's `VALIDATION` `dna.yaml declares no run
  log (paths.runs)`; (3) feature id `P5.3.5` (proposed by the AC) while `P5.3.4` stays reserved for
  `agent list` (task-240), so the table has a gap until it lands; (4) BDD index: only the row and the
  pillar count changed — its dated 2026-06-26 verification block (63 files, 190 scenarios) is stale
  already and was left as is; (5) the `git log` `IO` message carries git's text including the absolute
  root, as `memory history`'s does.

### Review fixes

Coordinator review, 2026-10-07: **APPROVE WITH FIXES**; the task stays `in-review`, no re-submit.

- Red `1ec2ea83`: `npx jest test/core/agent-show.test.ts -t "review fixes"` → **2 failed, 2 passed**.
  - F1: with `log.showSignature=true` and an ssh-signed record commit, `commit` was `"No signature"`.
  - F2: a side branch that drops the record and is merged keeping both records (so the merge equals
    neither parent and `git log -- <log>` walks both) made `commit` the removing commit.
  - F7 (characterization, passes on first run): the working tree's log path is a directory, or a
    symbolic link to a log that holds the run → `NOT_FOUND`, exit 1, no hint (`agent-show.ts`'s
    `lstatSync(...).isFile()` arm).
- Green `d965cf23`: `git log --no-show-signature -S …`; every listed name must match
  `^[0-9a-f]{40}([0-9a-f]{24})?$`, else `IO`; the listed shas are walked in order and the first whose
  log blob (`readPathAtRev`) holds the record's exact serialized line is the adding commit; docstring
  rewritten. `npx jest test/core/agent-show.test.ts` → **33 passed**.
- F3/F6 `f521a77c`: the `--format` help text (`src/cli/program.ts`, pinned in
  `test/cli/program.test.ts`) is `console prints indented JSON for now, unless the command defines its
  own`; `renderSuccess`'s docstring names the `renderConsole` exception; the `agent` module's
  description is `read recorded agent runs (launching an agent arrives with agent execute)`.
- F3/F4 in `spec-008` (pending amendment, reason updated below): §3's quoted help text matches the
  new one; §2's exception is a sentence of its own after the P5.1.4 sentence, so "its human rendering"
  no longer reads as `agent show`'s.
- F5 `e82d7a4c`: `01_product-brief.md` 1.7 → 1.8 (2026-10-07), `63 features` → `64 features`
  (document list; the line-254 `~63` story-point estimate was changed too and reverted at re-review); its `00_index.md` row follows (line count unchanged).
  task-141's index script (excluded lines `(382,416)`) → `mismatches: []`. `08_mvp-canvas.md:207` is
  task-261's and is left to the gate merge.
- Defensive arms left untested, by design: the non-`RevisionError` rethrow after `resolveRevision`,
  the non-`ValidationError` rethrow after `loadDnaYamlAtRev`, the non-`StorageError` rethrow after
  `git log` (each a defect, not a refusal), and in `addingCommit` the non-sha name and the "no commit
  adds its line" `IO` — with `--no-show-signature` and `%H` git prints only names, and a line `HEAD`
  holds was added by some commit `git log -S` lists.
- Same class (F1), reported not fixed: `src/memory/git-log.ts` (`walkGitLogFields`) and
  `src/memory/history.ts` (the `--follow` probes) run `git log --format=…` without
  `--no-show-signature`; `git -c log.showSignature=true log --format=%H` on the reviewer's `g3` prints
  `No signature` on stdout before the shas.
- Re-review R1 (red `3450d10b`, 2 failed; green in the next commit): the F2 fix matched a
  re-serialized line, so a valid record written with a `\u` escape or a CRLF ending matched no commit;
  `addingCommit` now takes the line's bytes from `HEAD`'s blob and matches them, and a line edited after
  it was added is `IO` (tested). `npx jest` on agent-show, registrar, program, `test/agent`, `test/docs`
  (23 suites) → **351 passed**; lint, both `tsc` 0; index script `mismatches: []`.
- Gates: `npx jest` on the touched suites + `test/docs` + `test/agent` (28 suites) → **395 passed**;
  `npm run lint` 0; both `tsc` 0; `npm run docs:api` 0; `node scripts/check-governance.cjs --base
  4fd77678` → 0 findings.

### Pending amendments (approver)

- `spec-006-core-domain-api` — proposed `--reason`: "agentShow ships (task-220): its spec-006 §3 row
  loses the planned marker and gains P5.3.5, and §2 declares the optional CoreError.hint and
  CoreOperation.renderConsole that spec-016 §6 needs; no other function or surface changes."
- `spec-008-cli-grammar` — proposed `--reason`: "agent show ships (task-220) with the console
  rendering spec-016 §6 defines, so §2's --format row names it, in a sentence of its own, as the one
  exception to indented JSON, and §3's --format help text says so too; flags, exit codes and the error
  format are unchanged."
- `spec-016-agent-execution` — proposed `--reason`: "agentShow is registered (task-220), so §8's
  module cell loses the planned marker, keeping §8 equal to spec-006 §3 cell for cell."
- `minor-v0.3` `features:` gains `P5.3.5` — **`memory amend` refuses it**: the `release` type is
  `amendable: false` (`.wingfoil/memory.yaml`). The edit is in the worktree, uncommitted, for a hand
  amend on the approver's instruction (precedent `a143909e`, `minor-v1.0`). Proposed reason: "P5.3.5
  (wingfoil agent show) is delivered by task-220 and enters minor-v0.3's features as dl-135 Action 3
  asks; recorded by hand because the release type is amendable: false."
