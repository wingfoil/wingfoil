---
id: bug-204-spec-004-spec-008-and-spec-015-name-paths-and-keys-that-do-not-exist
type: bug
title: "spec-004, spec-008 and spec-015 name paths and keys that do not exist"
status: triaged
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: ""            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`task-151`'s name check (`test/docs/name-resolvability.test.ts`) found backticked names in three specs that resolve to nothing in the repository. They are allowlisted as `UNTRIAGED` (first-run findings; from v0.4 an `UNTRIAGED` entry fails the gate): `spec-008` names `src/mcp-server` and `tech_stack.cli`, `spec-015` names `scripts/publish-staging`, and `spec-004` names `workflow.yaml`. Each is stale doc text; the real names are `src/mcp`, `stacks.technologies`, `scripts/publish-staging.cjs` and `workflows.yaml`.

## Steps to Reproduce

1. `grep -n "spec-008\|spec-015\|spec-004" test/docs/name-resolvability.allowlist.ts` → among others:
   - `spec-008-cli-grammar.md`, `config`, `tech_stack.cli`, `UNTRIAGED`;
   - `spec-008-cli-grammar.md`, `path`, `src/mcp-server`, `UNTRIAGED`;
   - `spec-015-packaging-publishing.md`, `path`, `scripts/publish-staging`, `UNTRIAGED`;
   - `spec-004-mcp-surface-contract.md`, `path`, `workflow.yaml`, `UNTRIAGED`.
2. `grep -n 'src/mcp-server\|tech_stack.cli' docs/04_memory/design/specs/spec-008*.md` → lines 13, 579, 587.
3. `grep -n 'scripts/publish-staging`' docs/04_memory/design/specs/spec-015*.md` → lines 115, 117, 121, 243.
4. `grep -n '`workflow.yaml`' docs/04_memory/design/specs/spec-004*.md` → line 179.
5. `ls src/mcp-server .wingfoil/workflow.yaml` → `No such file or directory` for both; `ls scripts | grep publish` → `publish-staging.cjs`, `publish-staging.d.cts`; `grep -rn tech_stack .wingfoil/dna.yaml` → no output (the key is `stacks.technologies`).

## Expected Behavior

Each spec names what exists, amended through `memory amend`, and its allowlist entry is removed (or, if a name is quoted on purpose, given its real reason).

## Actual Behavior

Four stale names in three specs, allowlisted as `UNTRIAGED`.

## Notes

- Found by `task-151`'s independent reviewer. One bug for this doc-drift set; the other `UNTRIAGED` entries of the same specs (for example `spec-008`'s `NO_COLOR`, `bug-203`, and `spec-001`/`spec-009`'s `E_INVALID_*` codes, `bug-205`) are filed separately because they are not plain renames.
- `spec-015`'s `docs/user-docs-v0.2` and `NPM_TOKEN` are also `UNTRIAGED` and were not part of this finding.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, from the independent reviews of wave 1
batch B4 (`dev-loop-rel-v0.3-plan`), against `main` at `243f8f05` (B4 merges up to `ea637c43`).
