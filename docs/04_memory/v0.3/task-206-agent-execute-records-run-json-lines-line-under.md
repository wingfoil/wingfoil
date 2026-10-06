---
id: "task-206-agent-execute-records-run-json-lines-line-under"
type: task
title: "`agent execute` records each run as one JSON Lines line under `paths.runs`, commits it as `agent: record <run-id>`, and reads it back strictly"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "run-record", "determinism"]
ref: "dl-114"
bug: []
depends_on: ["task-127-add-memory-amend-id-reason-approver-gated-verb", "task-131-make-dirty-target-guard-refuse-path-cannot-inspect", "task-138-dna-yaml-declares-team-agents-adapter-runs-paths", "task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin"]
tmpl_version: 260703
---

## Description

This is the run-log library, used by `agent execute` (task-228), `agent list` (task-240) and `agent show` (task-220). It covers: - the 18-key record of §4.2 in fixed key order, with the literal `not-reported`, never `0` or `null`; - the run id `<element-id>/<phase>/<n>`, with `n` counted at `state_ref` (§4.3; `adhoc` for a run with no step); - the strict reader of §4.5; - the §4.4 commit: only the element's `<runs>/<element-id>.jsonl`, via `commitPaths --only`, subject `agent: record <run-id>`, `dl-111` trailer, no other body; - the collision rule: a record whose id is already at the then-current `HEAD` is refused with `CONFLICT`, and the record goes to stderr as a `details` line.

## Acceptance Criteria

- (red-first) Serialization: one line, keys in §4.2 order, no insignificant whitespace, `\n`-terminated. `tokens` carries four integer-or-`not-reported` fields. `workflow: "n/a"` and `phase: "adhoc"` for a run with no step.
- (red-first) The run id is 1 + the count of matching `(element, phase)` records **at `state_ref`**. It is deterministic across two clones of the same history. A malformed id fails `^<element-id>/[a-z][a-z0-9-]*/[1-9][0-9]*$`.
- (red-first) The reader refuses non-JSON, a missing, extra or out-of-order key, a wrong type, an id whose element segment is not the file basename, and a duplicate id. Each refusal uses the §4.5 message (`VALIDATION`, exit 1).
- (red-first) The commit contains exactly the run-log file. The agent's uncommitted edits elsewhere stay uncommitted and unstaged. The subject is `agent: record <run-id>` and the trailer block holds `WingFoil-Version:`. `memory history` does not report the commit as a Memory operation.
- (red-first) Collision: pre-commit the same id at `HEAD`, then record. The result is `CONFLICT` `run id <run-id> already recorded at HEAD`, nothing is appended, and the full record is on stderr.
- (red-first) A failed commit returns `IO` `run <run-id> not recorded: <cause>` with the record as a `details` line.
- (red-first) The `notes` field is `<element-id>#execution-notes` when the element's `## Execution Notes` differs between `state_ref` and `HEAD`, else `none`. It is always `none` for a type whose template lacks the section.
- (characterization) This repository's `.wingfoil/dna.yaml` gains `paths.runs` (value chosen and recorded in Execution Notes), with a `doc-versioning` bump.
- (characterization) `dl-135` Action 2: `dl-114`'s body gains the session-id field through `memory amend` (`dl-108`'s verb), one `wf(decision-log): amend …` commit. If the verb has not shipped when this task reaches review, the task records that fact and leaves the action open. It does not hand-edit the file.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-114 (Q1 (A), Q2 (b), Q3 (i)); dl-135 point 2, Q2 (c), Q3 (a), Action 2; spec-016 §4.1–§4.5; dl-111 (trailer on the record commit).
- **Features:** P5.3.1.
- **Notes:** Proposal key: B08. `src/agent/run-log.ts` (or similar). `dl-114` Action 3 (cost metrics in `dl-089`'s catalogue) is optional and owned by `dl-089`'s task; not claimed.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B2 (2026-10-02, `task-138`'s independent review).** `paths.runs` (`task-138`) accepts an empty string, an absolute path and a `../` path, so the run log must be confined when it is written (REQ-SEC-06, `resolveConfinedMemoryPath`). The scaffold value `docs/runs/` has a trailing slash: build `<runs>/<id>.jsonl` with `path.join`, not string concatenation. This repository's `.wingfoil/dna.yaml` does not declare `runs` or an agent `adapter` yet; this task and `task-236` add them.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
