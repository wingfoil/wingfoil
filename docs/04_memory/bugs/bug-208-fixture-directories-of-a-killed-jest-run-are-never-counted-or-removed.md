---
id: bug-208-fixture-directories-of-a-killed-jest-run-are-never-counted-or-removed
type: bug
title: "Fixture directories of a killed jest run are never counted or removed"
status: triaged
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: ""            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: ""            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`test/global-teardown.cjs` (`task-152`) sweeps only the fixture directories carrying the current run's tag, `wf-storage-r<pid>-…`, and only when that tag is its own (`teardownRun`). A jest run that is killed before teardown leaves its `wf-storage-r<deadpid>-…` directories behind, and no later run counts or removes them, because each sweeps its own tag only. Directories created before the tag existed (`wf-storage-clone-…`, `wf-storage-cwd-…`) are likewise never seen.

## Steps to Reproduce

1. `sed -n 30,45p test/global-teardown.cjs` → `sweepFixtureDirs` filters on `` `wf-storage-${tag}-` ``; `teardownRun` returns `null` unless `tag === \`r${pid}\``.
2. In a scratch temp root, create `wf-storage-r999999-aaa` (a dead pid) and `wf-storage-r<live pid>-bbb`, then call `require('./test/global-teardown.cjs').teardownRun({ tag: 'r'+pid, pid, tmpRoot })` →
   ```
   "fixture teardown: this run left 1 fixture directory behind; removed 1"
   [ 'wf-storage-r999999-aaa' ]
   ```
   — the dead run's directory survives and is not counted.
3. `ls /tmp | grep '^wf-storage-' | sed -E 's/^(wf-storage-[^-]+)-.*/\1/' | sort | uniq -c` on this machine → `335 wf-storage-clone`, `335 wf-storage-cwd` (pre-`task-152` prefixes, created between 2026-09-25 and 2026-10-02), none of which any sweep reaches.

## Expected Behavior

A run reports — and, if the policy says so, removes — fixture directories whose owning run is gone: a `wf-storage-r<pid>-` tag whose pid is not alive (the same dead-pid test `dist-lock.cjs` already applies to the build lock), and optionally the legacy untagged prefixes.

## Actual Behavior

Leftovers of killed runs accumulate unreported, which is the aggregate-visibility gap `bug-064` was about, now limited to runs that never reached teardown.

## Notes

- Found by `task-152`'s independent reviewer.
- Whether a leak should fail the run is still undecided (`bug-064` Notes); this bug is only about counting and sweeping other runs' dead leftovers.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, from the independent reviews of wave 1
batch B4 (`dev-loop-rel-v0.3-plan`), against `main` at `243f8f05` (B4 merges up to `ea637c43`).
