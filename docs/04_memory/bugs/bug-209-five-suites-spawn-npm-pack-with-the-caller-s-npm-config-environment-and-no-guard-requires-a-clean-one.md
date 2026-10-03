---
id: bug-209-five-suites-spawn-npm-pack-with-the-caller-s-npm-config-environment-and-no-guard-requires-a-clean-one
type: bug
title: "Five suites spawn npm pack with the caller's npm_config_ environment, and no guard requires a clean one"
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

`task-146` added `withoutCallerNpmConfig` (`test/cli/helpers/npm-env.ts`) so that a spawned npm does not inherit the caller's `npm_config_*` (a suite run under `npm run -s` exported `npm_config_loglevel=silent`, which silenced an asserted npm line). Only `publish-pipeline` and `publish-secrets` use it. Five suites still run `npm pack --dry-run --json --ignore-scripts` with the inherited environment: `builtin-directive-templates`, `npm-distribution`, `publish-metadata`, `license-file` and `check-governance`. They pass today because `--json` output is not affected by the log level, but no guard requires the clean environment for every spawned npm.

## Steps to Reproduce

1. `grep -rnE "(execFileSync|spawnSync|execSync|spawn)\(\s*'npm'" test --include=*.ts` → six call sites: `test/cli/npm-distribution.test.ts:102`, `test/core/builtin-directive-templates.test.ts:294`, `test/cli/publish-metadata.test.ts:99`, `test/cli/publish-secrets.test.ts:289`, `test/cli/license-file.test.ts:102`, `test/cli/check-governance.test.ts:471`.
2. `grep -c withoutCallerNpmConfig` on the five `npm pack --dry-run` suites → `0` each; their options are `{ cwd: REPO_ROOT, encoding: 'utf-8' }` (no `env`).
3. `npm_config_loglevel=silent npm pack --dry-run --json --ignore-scripts | node -e '…JSON.parse…'` → `parsed entries: 1 files: 379` — harmless for the setting that bit `task-146`.

## Expected Behavior

Every test-spawned npm gets `withoutCallerNpmConfig(process.env)` (plus what it sets explicitly), and a lint-style guard — like `test/lint/pack-ignore-scripts.test.ts` does for `--ignore-scripts` — fails a new call site that omits it.

## Actual Behavior

Five of six npm spawns inherit the caller's npm configuration; correctness depends on no inherited `npm_config_*` affecting `npm pack --json`.

## Notes

- Found by `task-146`'s independent reviewer.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, from the independent reviews of wave 1
batch B4 (`dev-loop-rel-v0.3-plan`), against `main` at `243f8f05` (B4 merges up to `ea637c43`).
