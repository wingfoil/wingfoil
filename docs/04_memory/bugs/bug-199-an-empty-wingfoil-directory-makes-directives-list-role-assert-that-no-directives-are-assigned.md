---
id: bug-199-an-empty-wingfoil-directory-makes-directives-list-role-assert-that-no-directives-are-assigned
type: bug
title: "An empty .wingfoil directory makes directives list --role assert that no directives are assigned"
status: closed
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3.2"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P3.4"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

With an empty `.wingfoil/` (spec-011's `incomplete` state), `directives list --role developer` answers exit 0 with the warning `no directives assigned to role 'developer'`, an assertion nothing was read to establish: there is no `roles.yaml`. That is the sentence `bug-154` objected to.

## Steps to Reproduce

1. `git init`, one commit, `mkdir .wingfoil`.
2. `node dist/cli.js directives list --role developer --format json`.

## Expected Behavior

An `incomplete` warning naming what is missing, or no role assertion when `roles.yaml` is absent.

## Actual Behavior

`{"entries":[],"warnings":["no directives assigned to role 'developer'"]}`, exit 0 (re-run on `main` on 2026-10-02).

## Notes

- Found by `task-143`'s independent reviewer. `task-143` deliberately refuses only the `absent` state.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b3-review-findings-plan`, from the independent reviews of wave 1
batch B3 (`dev-loop-rel-v0.3-plan`).

### Retrospective

None.
