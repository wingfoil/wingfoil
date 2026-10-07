---
id: decision-log-ingest-rel-v0.3-consumer-feedback-loop-plan
type: plan
title: "Decision-log-ingest — rel-v0.3 consumer feedback loop"
status: active
version: "1.0"
workflow: "decision-log-ingest"
phase: "rel-v0.3-consumer-feedback-loop"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 261006   # Orignal template version
---

## Context

Three projects that use WingFoil (WingFoil-UI, WingFoil-Templates, WingFoil2-Benchmark) keep notes about
WingFoil's defects, gaps and requests in three unversioned formats; nothing in this repository says where they
are, the retrospective cannot read them, and the projects never learn which element or release answered them.
The approver agreed on 2026-10-07 to capture the rulings that close this loop as a decision-log, filed
`in-discussion` for later ratification. It is captured through `decision-log-ingest`
(`.wingfoil/workflows/custom/decision-log-ingest.yaml` v1.0), during v0.3's dev-loop (wave 3), on branch
`ingest/consumer-feedback-loop` (`git-conventions` §1) in the worktree `.wf2-wt/dl-feedback`, cut from `main` at
`25b513b8`. No push, no merge.

Build: the build under development (`npm ci && npm run build`, then `node dist/cli.js memory …`;
`node dist/cli.js --version` → `0.2.2 (25b513b8…)`), as the v0.3 dev-loop does for Memory operations. The pinned
build is `wingfoil@0.2.2` (`grep -n 'wingfoil-released' package.json`).

No source outside this repository is cited: the consumers are named, their content is not, and no hold-out
repository is a source (the decision-log's R2 and R7).

## Phases / Steps

1. **capture** (product-owner): `memory add --type decision-log` → `dl-163`, filled (Context facts each with
   the command that establishes it; Decision R1–R8; Rationale; Actions S3b–S3e with their scheduling
   constraints; Relations), `memory submit` → `in-discussion`.
2. **approve** (⛔ approver): ratify `dl-163` (`in-discussion → ready`), or reject it to `draft`; then S3b–S3e
   become tasks through normal triage and backlog, before the v0.3 retrospective.

## Handoff

- **Approver:** the ratification and the open questions below.
- **Agent:** capture and the fact checks.
- **Completion criteria:** `dl-163` `ready` (or rejected to `draft`); this plan `active → done`.

## Execution Notes

- **capture done (2026-10-07)** on `ingest/consumer-feedback-loop`: plan add `7433fde3`; `dl-163` add
  `f3e6e621`, submit `59388c19` (`in-discussion`). Every tool-written commit carries the `git-conventions` §7
  trailers, added with `git commit --amend --no-edit --trailer …` (§8).
- **Conflicts with existing elements found at capture:**
  1. `retrospective.yaml` is already at 1.3 (`task-199`); S3d is the next version after `task-213` and
     `task-222`, not 1.3.
  2. `task-213`'s AC gives `additional-points` a `checks.pre` that every proposal has one of `dl-115`'s **four**
     outcomes; S3d proposes **six** per-note outcomes (`declined` and `needs-info` have no `dl-115` counterpart).
  3. `dl-088` Actions and `dl-089` (D01) already call for registering the benchmark repository as a `service`;
     none is registered (`grep -l -i benchmark docs/04_memory/services/*.md | wc -l` → `0`). S3b's
     `feedback-source` for the benchmark would be a second unit of state on the same repository, or the same one.
  4. `dl-147` (`in-discussion`) restates benchmark figures and links the benchmark's published findings;
     `dl-148` (`in-discussion`) describes the consumers' configurations for a showcase. Both read against R2.
  5. `memory.yaml` has a single writer per batch in W3 (`task-212` B4, `task-217` B5, `task-230` B6); S3b and
     S3c both write it and the `bug` template (`task-213`, B3).
- **Open questions for the approver:**
  1. S3d: amend `task-213`, or a separate task after `task-213` and `task-222`?
  2. S3d vs `dl-115`: map the six per-note outcomes onto `dl-115`'s four, or extend `task-213`'s `checks.pre`?
  3. S3b: one `svc-*` for the benchmark repository serving both D01 (`dl-089`) and the inbox, or two of
     different kinds?
  4. S3c: is the `reported_by:` check a repository test (`test/lint/`), consistent with R8 (no product feature),
     or a validation in `src/`?
  5. S3d: where the per-machine local checkout of a consumer is recorded, given that the triage file may not
     hold a consumer's paths (an untracked, git-ignored local file?).
  6. `dl-147`/`dl-148`: do they conform to R2 as written (public, tagged permalinks; a showcase by design), or
     do they need an amendment at ratification?
