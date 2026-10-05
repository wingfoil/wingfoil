---
id: bug-163-release-line-folder-and-field-disagree
type: bug
title: "A release's `release-line` field holds `v1` while its folder is `planning/rl-v1/`, so `memory add --type release` files a new release under a folder no other release uses, or with a field value no other release has"
status: in-progress
severity: "medium"
release-origin: "v0.2.2"
release: "v0.3"
feature: "P1.13"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`memory.yaml` gives `release` the path `docs/04_memory/planning/{release-line}/{id}.md`, filled from
the release's `release-line` field (`task-110`'s `--set`). Every committed release sits under
`planning/rl-v1/`, the release-line's **id**, but carries `release-line: "v1"`, the release-line's
**version** (`grep -h "^release-line" docs/04_memory/planning/rl-v1/*.md` → 6 × `"v1"`). No value of
the field puts a new release in the same folder as the existing ones with the same field value.

## Steps to Reproduce

1. On a clone of this repository at `68f64091` or later, build it.
2. Run `memory add --type release --title x --set kind=patch --set version=v0.2.3 --set
   release-line=v1`.
3. Run the same with `--set release-line=rl-v1`.

## Expected Behavior

One value that is both the folder and the field the other releases carry: either the path is
resolved from the release-line's id while the field keeps its declared meaning, or the field holds
the release-line's id everywhere.

## Actual Behavior

Observed in `task-123`'s AC 4 run (2026-09-29):
- Step 2 creates `docs/04_memory/planning/v1/patch-v0.2.3.md`, in a new `planning/v1/` folder beside
  `planning/rl-v1/`.
- Step 3 lands in `planning/rl-v1/`, with `release-line: "rl-v1"`, a value no other release has.

## Notes

- Found at `task-123`'s review (2026-09-29). The approver ruled it a bug.
- Origin: the v0.1 retrospective's T11 (`retro-v0.1`, "path/naming inconsistencies") moved the
  release folder from `planning/v1/` to `planning/rl-v1/`, after the release-line's id, and left the
  field at the version. `bug-080` is about reading states across that same rename, a different
  defect.
- Which of the two is right, the field's meaning (version or id) or the path pattern, is a
  `memory.yaml` / `spec-001` question. The fix may need a decision first.
- `dl-090` (arguments of workflow tokens, e.g. `{release.version}`) may be where a path such as
  `planning/rl-{release-line}/` or a lookup of the release-line's id belongs.

## Triage & Execution Notes

<!-- triage (bug-ingest): severity call; fix: pointer to the fix task(s). -->
