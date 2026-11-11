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
 * - `claude-code` — Claude Code (task-236; its headless block, task-335).
 * - `codex-cli` — Codex CLI (task-237; its headless block, task-335; its conflict check and session id, task-356).
 *
 * Each declares a `launch.headless` block for the work run (`spec-016` §2.8, §3.5; `dl-181` Q3 (c)), read
 * from its CLI's help at `verified_with`: `claude-code`'s with `output: none` (its stdout is not read), `codex-cli`'s
 * with `output: jsonl`, its stdout read for the session id only (`session.id: output`, task-356).
 *
 * Each `launch.headless` also declares `permissions`, a role map (`spec-016` §2.8's posture table, `dl-223` (b),
 * task-339): `default` reads only, `developer`, `qa` and `architect` edit, run the tests and commit but never publish,
 * `reviewer` reads and runs the tests; no entry bypasses the CLI's permission checks or sandbox. Neither declares
 * `launch.interactive.permissions`: at a terminal a person answers the CLI's own prompts.
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
 * Claude Code, checked against `claude --help` of 2.1.296 (task-236), and every flag re-read in the help of
 * 2.1.310 when the headless block was added (task-335): `-p, --print` ("print response and exit") runs it
 * without a terminal. The prompt comes first in both launch argvs because `--mcp-config <configs...>` takes
 * several values: placed after it, the bootstrap would be read as a second MCP configuration. The
 * `--session-id` option `session.assign_args` appends closes that list. No command of this CLI prints a past
 * session's model or token counts, so `usage.from` is `none` and both are recorded `not-reported`
 * (`spec-016` §2.6). The headless role map (task-339) is read from the same help of 2.1.310: `--permission-mode
 * <mode>` with its choice `dontAsk`, and `--allowedTools` / `--disallowedTools` ("Comma or space-separated list of
 * tool names", the example `"Bash(git *) Edit"`).
 */
const CLAUDE_CODE: BuiltinAdapterManifest = {
  name: 'claude-code',
  content: `# Claude Code, a built-in adapter (spec-016 section 2.8). Every flag below is read from the
# --help output of the version in verified_with, checked by hand (task-236; headless, task-335;
# the headless permissions, task-339).
name: claude-code
format: 1
command: claude
verified_with: "2.1.310 (Claude Code)"
version_args: [ --version ]
launch:
  interactive:
    # The prompt first: --mcp-config takes several values and would read a following prompt as one.
    args: [ "{bootstrap}", --mcp-config, "{mcp_config_file}" ]
    terminal: required
  headless:
    # -p (--print) prints the response and exits; the prompt first, for the reason above.
    args: [ -p, "{bootstrap}", --mcp-config, "{mcp_config_file}" ]
    output: none
    # The posture of each role (dl-223 (b), task-339), appended after args: --permission-mode
    # dontAsk denies every tool no rule allows, so a headless agent never waits on a prompt;
    # --allowedTools and --disallowedTools take a list, closed by the next option. default, the
    # posture of every role not named here, reads only; no entry publishes.
    permissions:
      default: [ --permission-mode, dontAsk, --allowedTools, Read, Glob, Grep ]
      developer: [ --permission-mode, dontAsk, --allowedTools, Read, Glob, Grep, Edit, Write, "Bash(git *)", "Bash(npm *)", "Bash(npx *)", "Bash(node *)", --disallowedTools, "Bash(git push *)", "Bash(npm publish *)" ]
      qa: [ --permission-mode, dontAsk, --allowedTools, Read, Glob, Grep, Edit, Write, "Bash(git *)", "Bash(npm *)", "Bash(npx *)", "Bash(node *)", --disallowedTools, "Bash(git push *)", "Bash(npm publish *)" ]
      architect: [ --permission-mode, dontAsk, --allowedTools, Read, Glob, Grep, Edit, Write, "Bash(git *)", "Bash(npm *)", "Bash(npx *)", "Bash(node *)", --disallowedTools, "Bash(git push *)", "Bash(npm publish *)" ]
      reviewer: [ --permission-mode, dontAsk, --allowedTools, Read, Glob, Grep, "Bash(git log *)", "Bash(git show *)", "Bash(git diff *)", "Bash(git status *)", "Bash(npm test *)", "Bash(npm run *)", "Bash(npx jest *)" ]
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
 * Codex CLI, checked against `codex --help` of `codex-cli 0.145.0` (task-237); its headless block against
 * `codex exec --help` of the same version (task-335): `codex exec` runs non-interactively, takes the same `-c`
 * override and the prompt as its positional. Codex has no option that
 * takes an MCP configuration file, only `-c <key=value>` overrides parsed as TOML, so the server is
 * registered with `mcp.via: config-arg`: the rendered template is one `-c` value, a whole argv element
 * (`spec-016` §2.3). `enabled` and `required` make a same-named server elsewhere, or a failed start,
 * unable to leave the session without it. A `-c` override merges into a same-named table of a trusted project
 * (`env = {}` included, observed by hand with `codex-cli 0.145.0`, task-356, `bug-372`), so `mcp.conflict_args` asks
 * Codex itself: `codex mcp get wingfoil` exits `0` exactly when Codex would load a `wingfoil` table, and `agent
 * execute` then refuses the launch (`spec-016` §2.5). No option assigns a session id and no command prints a past
 * session's id, but `codex exec --json` prints its events to stdout as JSONL, the first (`thread.started`) carrying
 * the session id as `thread_id`, which `codex exec resume <id>` accepts (observed by hand, task-356, `bug-375`): a
 * headless run's session is read from it (`session.id: output`), an interactive one's is `not-reported`. Resume is
 * not supported until `spec-016` §7's ships; the model and token counts are recorded `not-reported` (§2.6). The
 * headless role map (task-339) is read from `codex exec --help` of the same version: `-s, --sandbox <SANDBOX_MODE>`,
 * with `read-only`, `workspace-write` and `danger-full-access` (never shipped).
 */
const CODEX_CLI: BuiltinAdapterManifest = {
  name: 'codex-cli',
  content: `# Codex CLI, a built-in adapter (spec-016 section 2.8). Every flag below is read from the
# --help output of the version in verified_with, checked by hand (task-237; headless, task-335; the
# conflict check and the session id, task-356; the headless permissions, task-339).
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
  headless:
    # codex exec runs non-interactively; --json prints its events to stdout as JSONL; the same -c
    # override, the prompt as its positional.
    args: [ exec, --json, -c, "{mcp_config}", "{bootstrap}" ]
    output: jsonl
    # The posture of each role (dl-223 (b), task-339), appended after the prompt, where codex exec
    # still reads an option: --sandbox. default, the posture of every role not named here, reads
    # only; the roles that edit, and the reviewer, who runs the tests and so writes the build, get
    # workspace-write, the narrowest sandbox they can work in.
    permissions:
      default: [ --sandbox, read-only ]
      developer: [ --sandbox, workspace-write ]
      qa: [ --sandbox, workspace-write ]
      architect: [ --sandbox, workspace-write ]
      reviewer: [ --sandbox, workspace-write ]
prompt:
  via: arg
mcp:
  via: config-arg
  template: 'mcp_servers.wingfoil={command = "{mcp_command}", args = {mcp_args}, enabled = true, required = true}'
  # -c merges into a same-named table of a trusted project: exit 0 here (a wingfoil table Codex
  # would load) refuses the launch.
  conflict_args: [ mcp, get, wingfoil ]
session:
  # A headless run's first --json event (thread.started) carries the id; codex exec resume takes it.
  id: output
  field: thread_id
  resume:
    supported: false
usage:
  from: none
`,
};

/** The built-in adapters `wingfoil init` installs, in name order. */
export const BUILTIN_ADAPTERS: readonly BuiltinAdapterManifest[] = [CLAUDE_CODE, CODEX_CLI];
