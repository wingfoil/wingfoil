---
id: bug-162-task-counter-restarts-per-release
type: bug
title: "`memory add --type task` numbers from 1 in every release, because the `{n}` counter only counts the type's folder and a task's folder is per release"
status: closed
severity: "medium"
release-origin: "v0.2.2"
release: "v0.3"
feature: "P1.3"
contributor: ""
credit: ""
tmpl_version: 260703
tags: ["pinned-build"]
---

## Summary

`nextSequenceNumber` (`src/memory/add.ts:85`) returns 1 + the number of matching files in the
directory the type's `path` resolves to. For `task` that directory is `docs/04_memory/{release}/`, so
each release starts again at `task-001`. This repository numbers tasks across releases: it is at
`task-123` in `v0.2.2`, which started at `task-109`. So `memory add` can never produce the next id
this repository expects, and the ids it does produce repeat numbers already used in other releases.

## Steps to Reproduce

1. Take a clone of this repository at `68f64091` or later.
2. Build it and run `node dist/cli.js memory add --type task --title probe --set release=v0.2.3`.

## Expected Behavior

The next task id continues the project's sequence, here `task-124-probe`. Or, if per-release
numbering is intended, `memory.yaml` declares the counter's scope, and this repository's config says
it counts across releases.

## Actual Behavior

`task-001-probe`, observed in `task-123`'s AC 4 run on a throwaway clone (2026-09-29, recorded in
`task-123`'s Execution Notes). The same holds in any release directory, since the counter never sees
other releases' tasks.

## Notes

- Found at `task-123`'s review (2026-09-29). The approver ruled it a bug.
- Not covered by `bug-087` (count + 1 over a gapped sequence) or by `dl-101` (`ready`, v0.3, id
  allocation across refs), because both keep the scan inside the type's own directory.
- Any type whose `path` contains a field token other than `{id}` has the same property. In this
  repository's `memory.yaml` that is `task` (`{release}`) and `release` (`{release-line}`, but its
  id has no `{n}`).

## Triage & Execution Notes

<!-- triage (bug-ingest): severity call; fix: pointer to the fix task(s). -->
