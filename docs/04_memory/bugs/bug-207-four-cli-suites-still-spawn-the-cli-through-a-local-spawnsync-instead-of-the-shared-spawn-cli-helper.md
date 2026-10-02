---
id: bug-207-four-cli-suites-still-spawn-the-cli-through-a-local-spawnsync-instead-of-the-shared-spawn-cli-helper
type: bug
title: "Four CLI suites still spawn the CLI through a local spawnSync instead of the shared spawn-cli helper"
status: open
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: ""            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P5.1"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`bug-197` (closed by `task-152`) moved the CLI suites onto `test/cli/helpers/spawn-cli.ts`. Four suites that spawn `dist/cli.js` still use a local `spawnSync`: `derived-option-namespace`, `extra-operand-refusal`, `dirty-target-refusal` and `workflow-list-diagnostics`. Five more suites spawn scripts rather than the CLI through local `spawnSync` (`mcp-registration`, `check-lockfile-pins`, `publish-metadata`, `publish-pipeline`, `publish-secrets`). None coalesces `status ?? 1`, so none reads a killed child as exit 1 — this is consistency, not a hazard.

## Steps to Reproduce

1. `for f in $(grep -rl spawnSync test/cli | grep -v helpers); do echo "$f helper=$(grep -c helpers/spawn-cli $f) spawnSync_calls=$(grep -c 'spawnSync(' $f)"; done` → `helper=0` with local calls for: `derived-option-namespace.test.ts` (1), `extra-operand-refusal.integration.test.ts` (1), `dirty-target-refusal.integration.test.ts` (1), `workflow-list-diagnostics.integration.test.ts` (4), `mcp-registration.test.ts` (4), `check-lockfile-pins.test.ts` (2), `publish-metadata.test.ts` (1), `publish-pipeline.test.ts` (1), `publish-secrets.test.ts` (4).
2. `grep -n "spawnSync(" test/cli/extra-operand-refusal.integration.test.ts` → `31: const result = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf-8' });` (the same shape in the other three CLI suites).

## Expected Behavior

Every suite that spawns the CLI does so through `spawn-cli.ts`; the script-spawning suites either use a shared helper too or are named as the declared exception.

## Actual Behavior

Four CLI-spawning suites and five script-spawning suites keep local `spawnSync` calls; `status` stays `number | null` in each, so no exit-code misreading follows today.

## Notes

- Found by `task-152`'s independent reviewer, as the residual of `bug-197`.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, from the independent reviews of wave 1
batch B4 (`dev-loop-rel-v0.3-plan`), against `main` at `243f8f05` (B4 merges up to `ea637c43`).
