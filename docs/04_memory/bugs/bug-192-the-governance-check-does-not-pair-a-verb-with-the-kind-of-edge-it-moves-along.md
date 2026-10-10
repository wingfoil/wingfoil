---
id: bug-192-the-governance-check-does-not-pair-a-verb-with-the-kind-of-edge-it-moves-along
type: bug
title: "The governance check does not pair a verb with the kind of edge it moves along"
status: closed
severity: "medium"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.10"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`scripts/check-governance.cjs` (`task-167`) checks that a bracket's hops are edges of the machine, but not that the verb matches the kind of edge, as `spec-008` §2 ("Which verb a set_state emits") pairs them.

## Steps to Reproduce

1. In a fixture, commit `wf(task): reject t [pending → backlog]`, which uses a forward edge.
2. Commit `wf(task): approve t [pending → draft]`, which uses a reject edge.
3. Commit `wf(task): finalize t [backlog → in-progress]`, which does not move into the last state.
4. Run `node scripts/check-governance.cjs --base <first>`.

## Expected Behavior

Each is a finding. A `sync` that crosses a reject edge must cite the approver's reject sha (`dl-061` B.1).

## Actual Behavior

All pass with exit 0. A document deleted at `HEAD` is also only partly checked: single edges, but not a bracket/frontmatter mismatch. Reproduced by `task-167`'s independent reviewer.

## Notes

- `task-208` enforces the check in CI. This rule could land before or with it.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b2-review-findings-plan`, from the independent reviews of wave 1
batch B2 (`dev-loop-rel-v0.3-plan`).
