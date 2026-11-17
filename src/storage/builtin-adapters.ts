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
 * from its CLI's help at `verified_with`: `claude-code`'s with `output: json` (`--output-format json`, one result
 * document, read for the usage when the transcript yields none, task-337), `codex-cli`'s with `output: jsonl`, its
 * stdout read for the session id only (`session.id: output`, task-356).
 *
 * Each `launch.headless` also declares `permissions`, a role map (`spec-016` §2.8's posture table, `dl-223` (b),
 * task-339): `default` reads only, `developer`, `qa` and `architect` edit, run the tests and commit but never publish,
 * `reviewer` reads and runs the tests; no entry bypasses the CLI's permission checks or sandbox. Neither declares
 * `launch.interactive.permissions`: at a terminal a person answers the CLI's own prompts.
 *
 * Each declares `trust` on both launches (`spec-016` §2.8's folder-trust table, `bug-500`, task-353), checked by hand
 * in a directory the CLI had never opened (`2.1.322 (Claude Code)`, `codex-cli 0.167.2`): `prompt` on the interactive
 * launch, where the CLI asks whether to trust the directory and a person answers, `implied` on the headless one,
 * which never stops to ask. Neither declares a fragment: neither help shows an option that trusts the launch
 * directory. Only `prompt` gives `agent execute`'s start-up hint (§3.3 step 16).
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
 * session's model or token counts; they are read after the run (`spec-016` §2.6, §2.8, `dl-188` part 1 (c), task-337)
 * from the session transcript first, `~/.claude/projects/<launch directory slug>/<session id>.jsonl`, where each
 * assistant line carries `message.id`, `message.model` and `message.usage` (the place and the keys as `dl-188`
 * describes them for 2.1.301), then from a headless run's `--output-format json` result, whose `usage` holds the
 * run's totals: both checked by hand on 2.1.322, the version `verified_with` names, the result's four counts equal to
 * the same session's transcript sums (task-337's design gate, H1 and H2). The headless role map (task-339) is read from the same help of 2.1.310: `--permission-mode
 * <mode>` with its choice `dontAsk`, and `--allowedTools` / `--disallowedTools` ("Comma or space-separated list of
 * tool names", the example `"Bash(git *) Edit"`). Its by-hand pass, one headless run per role, ran on 2.1.322, the
 * version `verified_with` names (task-339). The write roles' `"Bash(wingfoil *)"`, `"Bash(npx *)"` and
 * `"Bash(npm *)"` cover the three forms a project runs its own copy of wingfoil in: bare, `npx wingfoil …` and
 * `npm run wingfoil -- …` (task-339 review, approver ruling 2026-11-12).
 */
const CLAUDE_CODE: BuiltinAdapterManifest = {
  name: 'claude-code',
  content: `# Claude Code, a built-in adapter (spec-016 section 2.8). Every flag below is read from the
# --help output of the version in verified_with, checked by hand (task-236; headless, task-335;
# the headless permissions, task-339; the usage, task-337).
name: claude-code
format: 1
command: claude
verified_with: "2.1.322 (Claude Code)"
version_args: [ --version ]
launch:
  interactive:
    # The prompt first: --mcp-config takes several values and would read a following prompt as one.
    args: [ "{bootstrap}", --mcp-config, "{mcp_config_file}" ]
    terminal: required
    # Folder trust (task-353): in a directory it has not seen, a trust dialog comes before any
    # prompt, and the person at the terminal answers it; no option of the help skips it here.
    trust: prompt
  headless:
    # -p (--print) prints the response and exits; the prompt first, for the reason above.
    # --output-format json (with -p only) prints one JSON result document, read for the usage
    # when the transcript yields none (task-337).
    args: [ -p, "{bootstrap}", --output-format, json, --mcp-config, "{mcp_config_file}" ]
    output: json
    # The help says the workspace trust dialog is skipped under -p (task-353).
    trust: implied
    # The posture of each role (dl-223 (b), task-339), appended after args: --permission-mode
    # dontAsk denies every tool no rule allows, so a headless agent never waits on a prompt;
    # --allowedTools and --disallowedTools take a list, closed by the next option. default, the
    # posture of every role not named here, reads only; no entry publishes. The write roles run
    # the project's own copy of wingfoil: bare (node_modules/.bin on PATH, or an alias), through
    # npx, or through an npm script.
    permissions:
      default: [ --permission-mode, dontAsk, --allowedTools, Read, Glob, Grep ]
      developer: [ --permission-mode, dontAsk, --allowedTools, Read, Glob, Grep, Edit, Write, "Bash(git *)", "Bash(npm *)", "Bash(npx *)", "Bash(node *)", "Bash(wingfoil *)", --disallowedTools, "Bash(git push *)", "Bash(npm publish *)" ]
      qa: [ --permission-mode, dontAsk, --allowedTools, Read, Glob, Grep, Edit, Write, "Bash(git *)", "Bash(npm *)", "Bash(npx *)", "Bash(node *)", "Bash(wingfoil *)", --disallowedTools, "Bash(git push *)", "Bash(npm publish *)" ]
      architect: [ --permission-mode, dontAsk, --allowedTools, Read, Glob, Grep, Edit, Write, "Bash(git *)", "Bash(npm *)", "Bash(npx *)", "Bash(node *)", "Bash(wingfoil *)", --disallowedTools, "Bash(git push *)", "Bash(npm publish *)" ]
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
  # The session transcript first, which every launch writes under the launch directory's folder
  # and the assigned session id; then a headless run's JSON result (task-337, checked by hand
  # with the version in verified_with: each assistant message's usage, and the result's usage
  # equal to the transcript's sums).
  from: [ transcript, output ]
  transcript:
    path: "{home}/.claude/projects/{launch_dir_slug}/{session_id}.jsonl"
    select: { field: type, equals: assistant }
    message_id: message.id
    fields:
      model: message.model
      input: message.usage.input_tokens
      output: message.usage.output_tokens
      cache_read: message.usage.cache_read_input_tokens
      cache_write: message.usage.cache_creation_input_tokens
  fields:
    input: usage.input_tokens
    output: usage.output_tokens
    cache_read: usage.cache_read_input_tokens
    cache_write: usage.cache_creation_input_tokens
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
    # Folder trust (task-353): it asks whether to trust a folder it has not seen, and the person
    # at the terminal answers; no option of the help trusts the launch directory.
    trust: prompt
  headless:
    # codex exec runs non-interactively; --json prints its events to stdout as JSONL; the same -c
    # override, the prompt as its positional.
    args: [ exec, --json, -c, "{mcp_config}", "{bootstrap}" ]
    output: jsonl
    # codex exec runs in a git repository it has not seen with no trust step (task-353).
    trust: implied
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
