/**
 * The built-in agent adapter manifests the `wingfoil` package ships (`spec-016-agent-execution` §2.1,
 * §2.8; `adr-012` point 2; task-196).
 *
 * **How they reach a project.** `wingfoil init` writes each one to `.wingfoil/agents/built-in/<name>.yaml`
 * (`templateScaffold`, ./templates), as it writes the P3.8 directive templates to
 * `directives/built-in/`. The installed copy pins the launch argv in the project's git history, so two
 * clones launch the same argv (REQ-SYS-07). Like the directive templates, they ship as DATA compiled
 * into `dist/` (`spec-015` §1 keeps the tarball allowlist at `files: ["dist", "README.md"]`).
 *
 * **What is checked.** Every manifest is derived back out of the scaffold by `builtinTemplateSources`
 * (kind `adapter`) and run through `verifyBuiltinTemplates` before anything is written: the task-177
 * manifest schema as a built-in (REQ-SEC-10), then the spec-007 §4 step 5 secret scan.
 *
 * **What ships.** One manifest per `spec-016` §2.8 built-in, each its own task with its `verified_with`
 * pass by hand: every flag a manifest declares is read from that agent CLI's own `--help` output at the
 * version `verified_with` names, never from memory. Listed in name order (REQ-SYS-07):
 * - `claude-code` — Claude Code (task-236).
 * - `codex-cli` — Codex CLI (task-237).
 *
 * With an empty list, `init` reserves the directory with a `.gitkeep` (the seam's empty case).
 */

/** One shipped built-in adapter: its name (the file basename) and its manifest's YAML text. */
export interface BuiltinAdapterManifest {
  /** The adapter's name; written as `<name>.yaml`, and the manifest's own `name` must equal it. */
  readonly name: string;
  /** The manifest, written byte for byte. */
  readonly content: string;
}

/**
 * Claude Code, checked against `claude --help` of 2.1.296 (task-236). The prompt comes first in the
 * launch argv because `--mcp-config <configs...>` takes several values: placed after it, the bootstrap
 * would be read as a second MCP configuration. The `--session-id` option `session.assign_args` appends
 * closes that list. No command of this CLI prints a past session's model or token counts, so
 * `usage.from` is `none` and both are recorded `not-reported` (`spec-016` §2.6).
 */
const CLAUDE_CODE: BuiltinAdapterManifest = {
  name: 'claude-code',
  content: `# Claude Code, a built-in adapter (spec-016 section 2.8). Every flag below is read from the
# --help output of the version in verified_with, checked by hand (task-236).
name: claude-code
format: 1
command: claude
verified_with: "2.1.296 (Claude Code)"
version_args: [ --version ]
launch:
  interactive:
    # The prompt first: --mcp-config takes several values and would read a following prompt as one.
    args: [ "{bootstrap}", --mcp-config, "{mcp_config_file}" ]
    terminal: required
prompt:
  via: arg
mcp:
  via: config-file
  template: |
    {"mcpServers": {"wingfoil": {"command": "{mcp_command}", "args": {mcp_args}}}}
session:
  id: assign
  assign_args: [ --session-id, "{session_id}" ]
  resume:
    supported: true
    args: [ --resume, "{session_id}" ]
usage:
  from: none
`,
};

/**
 * Codex CLI, checked against `codex --help` of `codex-cli 0.145.0` (task-237). Codex has no option that
 * takes an MCP configuration file, only `-c <key=value>` overrides parsed as TOML, so the server is
 * registered with `mcp.via: config-arg`: the rendered template is one `-c` value, a whole argv element
 * (`spec-016` §2.3). `enabled` and `required` make a same-named server elsewhere, or a failed start,
 * unable to leave the session without it. No option assigns a session id and no command prints a past
 * session's id, model or token counts, so all three are recorded `not-reported` (`spec-016` §2.6).
 */
const CODEX_CLI: BuiltinAdapterManifest = {
  name: 'codex-cli',
  content: `# Codex CLI, a built-in adapter (spec-016 section 2.8). Every flag below is read from the
# --help output of the version in verified_with, checked by hand (task-237).
name: codex-cli
format: 1
command: codex
verified_with: "codex-cli 0.145.0"
version_args: [ --version ]
launch:
  interactive:
    # -c takes one key=value; the prompt comes last and nothing is appended after it.
    args: [ -c, "{mcp_config}", "{bootstrap}" ]
    terminal: required
prompt:
  via: arg
mcp:
  via: config-arg
  template: 'mcp_servers.wingfoil={command = "{mcp_command}", args = {mcp_args}, enabled = true, required = true}'
session:
  id: none
  resume:
    supported: false
usage:
  from: none
`,
};

/** The built-in adapters `wingfoil init` installs, in name order. */
export const BUILTIN_ADAPTERS: readonly BuiltinAdapterManifest[] = [CLAUDE_CODE, CODEX_CLI];
