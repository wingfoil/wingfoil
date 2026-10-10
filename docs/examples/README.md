# WingFoil examples

Runnable scenarios for WingFoil **0.2.2**. Each one is a `run.sh` script that:

- creates a throwaway git repository in a temporary directory, and deletes it on exit;
- prints every `wingfoil` command it runs, followed by that command's real output;
- **checks** the results (exit codes, states, audit trail) and ends with `OK: …`, or stops with
  `FAIL: …` and a non-zero exit.

Because they check themselves, they double as a smoke test: run against a build, an example that no
longer matches the tool fails loudly instead of going stale.

| Example | What it shows |
|---|---|
| [`01-first-project`](01-first-project/run.sh) | `init` → configure an approver → `memory add` → `submit` → `approve` → `history` / `search` |
| [`02-custom-memory-type`](02-custom-memory-type/run.sh) | Declare a `story` type with its own state machine and a gate; why configuration must be committed |
| [`03-directives-per-role`](03-directives-per-role/run.sh) | Write a custom directive, assign it to a role, list a role's rules, unassign and remove it |
| [`04-mcp-server`](04-mcp-server/run.sh) | Speak MCP to `wingfoil mcp` over stdio: Resources, Resource templates, role Prompts, a Memory read |
| [`05-ci-json-exit-codes`](05-ci-json-exit-codes/run.sh) | `--format json`, the `0`/`1`/`2` exit codes, and a CI gate on pending approvals |

## Running them

Requirements: Node.js 22.12+, git, bash, and `wingfoil` on your `PATH` (`npm install -g wingfoil`).

```bash
bash docs/examples/01-first-project/run.sh
```

To run them against a local build instead of the installed CLI, point `WINGFOIL` at it:

```bash
WINGFOIL="node $PWD/dist/cli.js" bash docs/examples/01-first-project/run.sh
```

All five in one go:

```bash
for e in docs/examples/0*/run.sh; do bash "$e" || break; done
```

Commit hashes and timestamps in the printed output differ on every run; everything the scripts check
does not.

`01-first-project/demo.tape` records example 01 with [VHS](https://github.com/charmbracelet/vhs) for the
README's demo, and waits for its `OK:` line, so a recording of a failing example is never produced. How to
regenerate it is in [`docs/assets/README.md`](../assets/README.md).

`lib.sh` holds the small helpers the scripts share (`step`, `expect_exit`, `json_field`, …). It is
sourced by each script and is not meant to be run on its own.
