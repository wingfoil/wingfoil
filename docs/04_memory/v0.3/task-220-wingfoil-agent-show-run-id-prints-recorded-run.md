---
id: "task-220-wingfoil-agent-show-run-id-prints-recorded-run"
type: task
title: "`wingfoil agent show <run-id>` prints one recorded run and the commit that added it"
status: in-progress
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

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
