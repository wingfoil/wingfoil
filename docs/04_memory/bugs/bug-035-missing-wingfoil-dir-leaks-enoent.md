---
id: "bug-035-missing-wingfoil-dir-leaks-enoent"
type: bug
title: "In a git root with no `.wingfoil/`, `wingfoil mcp` starts anyway and every DNA read fails with a raw ENOENT carrying an absolute path"
status: closed
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P5.2.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`spec-014` §1 says `wingfoil mcp`'s pre-flight refuses to start when the current directory "is not
inside an initialized WingFoil project". The implementation checks only for a git root
(`resolveProjectRoot`, `src/storage/git-root.ts:35-45`), so in a git repository that never ran
`wingfoil init` the server starts, and every DNA-dependent request then fails with
`MCP error -32603: ENOENT: no such file or directory, open '<absolute path>/.wingfoil/dna.yaml'` — an
internal-error code, a leaked absolute filesystem path, and no hint to run `wingfoil init`. This is
the MCP-side counterpart of `bug-002` (closed), which fixed the CLI's stack dump **outside** a git root
but not this **inside-a-git-root, not-initialised** case — and the CLI shows the same raw message here
too.

## Steps to Reproduce

On `main` (`8a6a091`), built with `npm run build`:

1. In an empty directory: `git init`, set a git identity, one empty commit. Do **not** run `init`.
2. CLI: `node <repo>/dist/cli.js dna show` → exit 1, stderr
   `error: ENOENT: no such file or directory, open '<abs-tmp-dir>/.wingfoil/dna.yaml'`.
3. MCP: spawn `node <repo>/dist/cli.js mcp` with the SDK's `StdioClientTransport` (`cwd` = that
   directory). The connection **succeeds** (no pre-flight refusal). Then:
   - `readResource({ uri: 'wingfoil://dna' })` → wire error
     `{"code":-32603,"message":"ENOENT: no such file or directory, open '<abs-tmp-dir>/.wingfoil/dna.yaml'"}`,
     client message `MCP error -32603: ENOENT: …`;
   - `readResource({ uri: 'wingfoil://dna/roles' })` → identical.
   - `listPrompts()` → `MCP error -32601: Method not found` (no Prompts channel on `main`).
4. Prompts (unmerged): on `task/task-058-mcp-prompts-role-based` (`3f27d98`), read-only via
   `git show 3f27d98:src/mcp/prompt.ts` — `prompts/list` and `prompts/get` call
   `loadRoleNames(options.resolveRoot())` → `loadDnaYaml(root)` per request, and the module doc states
   that with no `.wingfoil/dna.yaml` "the missing DNA surfaces as the error of each Prompts request
   instead of aborting the process start" — i.e. the same ENOENT, now on every Prompts call too.

## Expected Behavior

Per `spec-014` §1: in a directory that is not an initialised WingFoil project, `wingfoil mcp` emits the
standard `error: <reason>` line (`spec-008` §6) and exits `1` without starting the server. Any request
that does reach an uninitialised project fails with a user-level reason (e.g. `not a WingFoil project
(no .wingfoil/ found) — run wingfoil init`), a non-internal error code, and no absolute path.

## Actual Behavior

The server starts, then returns `-32603` Internal Error with Node's raw `ENOENT` message, including
the absolute path, for every DNA read. The CLI prints the same raw message.

## Notes

- **Why the pre-flight is weaker than the spec:** `runMcp` (`src/cli/mcp-command.ts:39-53`) treats
  "`resolveRoot` did not throw" as "initialised project", but `resolveProjectRoot` only throws
  `E_NO_GIT_ROOT` / `E_NOT_AT_GIT_ROOT`. `wingfoil init` shares the same resolver legitimately (it must
  run in an uninitialised git root); `mcp` needs an additional `.wingfoil/` existence check.
- **Bears on `dl-026`** (a repo-versioned `.mcp.json` registering `wingfoil mcp` at this repository's
  root): when this was filed, this repository had **no** `.wingfoil/` at its root (the dogfooded
  config lived under `docs/self/.wingfoil/`), so every agent session opened in a clone would have hit
  exactly this failure. **Updated 2026-09-29:** `task-111` moved the configuration to the root (merge
  `582ec08a`), so a clone of this repository no longer hits it, and `dl-026`'s registration
  (`task-112`) is no longer blocked by it. The bug itself stands for any git root without a
  `.wingfoil/`.
- **Bears on `dl-049`**: under `task-058`'s per-request DNA read, a construction/start-time check is the
  only place this can be refused cleanly; option (b) there routes that failure through `runMcp`'s
  format-aware pre-flight.
- Related: `bug-002` (closed; CLI, outside a git root), `spec-014` §1, `spec-008` §6.

## Triage & Execution Notes

- capture: raised by the second-pass review of `task-058-mcp-prompts-role-based` (Wave 2, 2026-09-17),
  reproduced on `main`; filed under `bug-ingest-rel-v0.2-wave2-review-findings-plan`. Severity `low`
  as proposed by the orchestrator; the approver may weigh `medium`, given the spec-014 §1 contradiction
  and that `dl-026` would expose it to every clone of this repository.
