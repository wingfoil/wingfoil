---
id: "bug-133-e2e-smoke-never-revalidates-what-a-command-wrote"
type: bug
title: "The dl-023 smoke never re-loads a written artifact through its own loader, so \"no schema-invalid artifact produced by any command\" is only proxied"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P2.4"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`e2e-smoke.yaml` declares two schema-validity post-checks. `fresh-init` requires that *"scaffolded
dna.yaml/memory.yaml/directives round-trip their own loaders (schema-valid)"*, and `drive-cli`
requires *"no schema-invalid artifact produced by any command"*. The smoke asserts neither directly: it
relies on the next command failing when it reads what the previous one wrote, plus a clean
working tree.

## Steps to Reproduce

1. `grep -n "round-trip\|schema-invalid" docs/self/.wingfoil/workflows/custom/e2e-smoke.yaml` shows
   the two post-checks.
2. `sed -n '/^function smokeTemplate/,/^}/p' scripts/e2e-smoke.cjs` shows that after the steps, the
   only artifact-level assertion is `git status --porcelain` being empty.
3. The last writer of each artifact is followed by no reader of it:
   - `dna set` is followed by `paths`, which reads `dna.yaml`'s `paths`;
   - the `memory submit` added by `task-107` is followed by no `memory` read of the document;
   - the directive files are read once, by `directives list`, and never re-read after a write.

## Expected Behavior

After the steps, the smoke re-loads each written artifact through its own loader and asserts that it is
schema-valid. The artifacts are `dna.yaml`, `memory.yaml`, the directive files and the Memory
document written by `memory add`/`submit`. The check could run through a read command
(`dna show`, `memory search`/`history`, `directives list`) placed after the last writer.

## Actual Behavior

A command that writes a schema-invalid artifact which no *later* step reads passes the smoke. The proxy
catches the `bug-005`/`bug-006` class only when a later step happens to read the artifact.

## Notes

- The proxy has real value, and `e2e-smoke-rel-v0.2-plan` §3.2 records why: each command in the list
  reads its predecessors' output through the real loader. This bug is about the artifacts that the
  *last* writer leaves unread.
- H1 of the same plan applies. The script is the publish pipeline's staging smoke, so any added step is
  a publish-gate change.
- H3: `memory history` writes `fatal:` to stderr on success (`bug-071`). A reader step added
  here must not assert an empty stderr until `bug-071` is fixed.

## Triage & Execution Notes

- capture: found by the v0.2 `e2e-smoke` phase delta audit (`e2e-smoke-rel-v0.2-plan` §3.2 and its
  Execution Notes, 2026-09-25), filed under `bug-ingest-rel-v0.2-e2e-smoke-findings-plan` on
  2026-09-28. Proposed severity is `low`, because the gate is staged (`warn` until a release runs it
  green) and the gap is measured and recorded. `release` is left empty: the approver's decision of
  2026-09-22 authorises the gaps other than G1 to the next release.
