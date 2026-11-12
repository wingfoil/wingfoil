/**
 * `wingfoil agent execute`, the pre-launch half (`spec-016-agent-execution` §3, task-218): everything
 * the command does before it spawns the agent — the stepless (`adhoc`) form, `--element` with an
 * optional `--role` and `--agent`, and the step forms `--next`, `--workflow <ref>`, `--step <key>`
 * (task-235, `./step.ts`). The launch (§3.3 steps 13–18) is `./launch.ts` (task-228).
 *
 * The pipeline ({@link agentExecutePipeline}) is §3.3's, in its order, and the first failure stops it:
 *
 * 2. With a step form, `workflow next`'s deduction at `HEAD` first (task-235): its commit is the `HEAD`
 *    every later read takes, and a `spec-003` error in the registry refuses here. The deduction's
 *    diagnostics are printed as `warning:` lines, as `agent list` prints them, before any later refusal
 *    (task-330, `bug-339`). Then `dna.yaml` and
 *    `memory.yaml` at that `HEAD` (the stepless form resolves `HEAD` itself and reads no workflow file);
 *    the adapter tree listed, every entry that is not an adapter printed as a warning (`bug-290`).
 * 3. Resolution (§3.2 steps 1–7): the step ({@link selectFrontierStep}), its workflow and phase, a step
 *    that only waits refused without `--element` ({@link refuseWaitingStep}, task-335); the
 *    element (`--element`, else the step's, {@link stepTargetElement}) at `HEAD`; the role (`--role`, else
 *    the step's, {@link resolveStepRole}, else — stepless — the `developer` default with a warning,
 *    approver ruling R18); never `approver` (`REQ-SEC-03`); the agent ({@link selectAgent}); its adapter
 *    (`loadAdapter`, at `HEAD`); the launch kind ({@link resolveLaunchKind}, task-335): `--headless` /
 *    `--interactive`, else the phase's `launch`, else `interactive`, with a warning on a contradiction.
 * 4. The adapter declares that kind (`NO_LAUNCH_KIND`), then its `command` is on `PATH` or at its
 *    repository path ({@link agentCommandFound}), then, when it declares `mcp.conflict_args`, the agent's own
 *    configuration declares no MCP server named `wingfoil` ({@link mcpConflictCheck}, task-356, `MCP_SERVER_DECLARED`;
 *    a dry run included).
 * 5. The git identity (`requireGitIdentity`), since the record is committed.
 * 6. The run log declared and unmodified (`runLogPreflight`, task-206).
 * 7. The execution context assembled and validated at `state_ref` (`assembleExecutionContext`, task-176).
 * 8. Its warnings printed (`dl-050` option 4): `ExecutionContext.warnings` (the role's §5.1 directive
 *    warnings, in their order), then the documents the builder could not read (`W_MEMORY_UNREADABLE`,
 *    task-171's handover) — through the warning sink, so the CLI renders each one at once, before the
 *    pre-flight. The builder's `notes` (`spec-012` §3: the DNA note, P5.3.3 sc. 3's "no relevant
 *    Memory") are not warnings and are not printed: they reach the agent inside the session context, the
 *    session Resource (task-195, task-355).
 * 9. The run id (§4.3, `nextRunId`).
 * 10. The bootstrap (§2.4), `mcp.template` rendered once ({@link renderMcpTemplate}: a command or argument
 *    with an unpaired surrogate refused, a dry run included, task-355) and the temporary files (§2.3), in
 *    the OS temporary directory ({@link withRunFiles}), removed on every exit path.
 * 11. The MCP pre-flight against the running build ({@link mcpPreflight}, §2.5): `initialize`, then the
 *    session Resource the bootstrap names, the one carrier read (task-355, `bug-376`).
 * 12. The terminal check, last, so every earlier refusal is reachable without a terminal; an interactive
 *    launch only. A dry run, which spawns nothing, prints a warning there instead of refusing (`bug-392`).
 *
 * Then the caller's `launch` runs, with the temporary files still in place and the function that hands
 * the signals over from their cleanup to the launch (`withRunFiles`' `release`).
 *
 * Each distinct warning is printed once (`withDistinctWarnings`; task-218's review F5). Every read at the resolved
 * commit names its files `HEAD:` itself, since that commit is `HEAD`'s (task-354, `bug-317`).
 *
 * **Baseline.** Every gating read is at the one `HEAD` commit resolved at step 2 (`dl-080` (B), the
 * `command-baseline` directive), which is also `state_ref`. Nothing is written to the repository: the
 * only files written are the temporary ones, outside it.
 *
 * **Determinism.** The bootstrap and the run id are pure functions of committed state and the request
 * (`REQ-SYS-07`); the temporary-file paths and the Node executable are host values that never reach the
 * context (`spec-016` Consequences).
 */
import { accessSync, constants, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { readPathAtRev } from '../storage';
import { formatDiagnostic, ValidationError, type Diagnostic } from '../validation';
import { reportWarning, withDistinctWarnings } from '../validation/warning';
import { ambiguousReferenceError, resolveElementReference } from '../memory/reference';
import { findMemoryDocumentByTypeAndIdAtRev, loadMemoryDocumentsAtRev } from '../memory/query';
import { isRoleDefined } from '../dna/roles';
import type { AgentEntry, DnaYaml } from '../dna/schema';
import type { MemoryYaml } from '../memory/schema';
import { diagnosticWarning } from '../core/agent-list';
import { APPROVER_ROLE } from '../core/approval-authority';
import { assembleExecutionContext, type ExecutionContextElement } from '../core/context';
import { requireGitIdentity } from '../core/git-identity';
import { requireTeamMembership } from '../core/team-membership';
import { DNA_YAML_PATH, loadDnaYamlAtRev, loadMemoryYamlAtRev, MEMORY_YAML_PATH } from '../core/loaders';
import { resolveRevision, RevisionError } from '../core/revision';
import { coreErr, coreOk, type CoreResult } from '../core/types';

import type { Step } from '../core/workflow-next';
import type { LaunchKind } from '../workflow/schema';

import type { TimeBound } from './duration';
import { LOOKUP_TIMEOUT_MS, runConflictProbe, type LaunchHost, type LaunchKindRun } from './launch';
import type { AdapterManifest } from './schema';
import { adapterTreeDiagnosticsAtRev, duplicateAdapterRefusal, loadAdapter, type LoadedAdapter } from './discovery';
import { ADHOC_PHASE, executionNotesSection, nextRunId, NO_WORKFLOW, recordSubject, runLogPreflight } from './run-log';
import { readNextAtHead, refuseWaitingStep, resolveStepRole, selectFrontierStep, stepTargetElement, type StepSelector } from './step';

/**
 * The role of a run with no step and no `--role` (`X_cli-cmds.md` § "Parameters for Agent Execution", the
 * `--role` row; approver ruling R18).
 */
export const DEFAULT_ROLE = 'developer' as const;

/** The warning that says the role was defaulted (§3.2 step 3). */
export const DEFAULT_ROLE_WARNING = `no --role given and no workflow step to take one from: running as the default role '${DEFAULT_ROLE}'`;

/** The mode that runs: `fresh`, the only one in v0.3 (§3.2 step 6). */
export const FRESH_MODE = 'fresh' as const;

/** How long the MCP pre-flight may take, start-up included, before it counts as unreachable. */
export const MCP_PREFLIGHT_TIMEOUT_MS = 30000;

/** §3.3 step 12's dry-run warning (`bug-392`): a dry run spawns nothing, so it needs no terminal. */
export const DRY_RUN_TERMINAL_WARNING = 'interactive launch needs a terminal on stdin and stdout: a run without --dry-run is refused here';

/** The order `launch: any` tries the adapter's kinds in (`dl-183` Q3 (a)). */
const ANY_LAUNCH_ORDER: readonly LaunchKindRun[] = ['interactive', 'headless'];

/**
 * §3.2 step 7 (task-335, `dl-183` Q1–Q3 (a)): the kind a run launches as — `option` (`--headless` /
 * `--interactive`), else the phase's `declared` launch when it is `interactive` or `headless`, else
 * `interactive`: for a stepless run (`declared` `null`), for a phase without `launch`, and for `launch: any`,
 * which tries the adapter's declared kinds `interactive` first. `warning` is the clause, after `phase
 * '<workflow>.<phase>' `, that the pipeline prints when the option names the other kind than the declared
 * `interactive` or `headless`. Whether the adapter declares the kind is §3.3 step 4's check, not this one's.
 */
export function resolveLaunchKind(
  declared: LaunchKind | null,
  option: LaunchKindRun | undefined,
  manifest: AdapterManifest,
): { kind: LaunchKindRun; warning?: string } {
  const fixed = declared === 'interactive' || declared === 'headless' ? declared : undefined;
  if (option !== undefined) {
    return fixed !== undefined && fixed !== option ? { kind: option, warning: `declares launch: ${fixed}; launching ${option} (--${option})` } : { kind: option };
  }
  if (fixed !== undefined) return { kind: fixed };
  // `any`: the first kind the adapter declares, interactive first — interactive for every format-1 manifest (§2.2).
  if (declared === 'any') return { kind: ANY_LAUNCH_ORDER.find((kind) => manifest.launch[kind] !== undefined) ?? 'interactive' };
  return { kind: 'interactive' };
}

/** P5.4.3 sc. 3, verbatim (§3.7 `MCP_UNREACHABLE`). */
export const MCP_UNREACHABLE_MESSAGE = 'context pre-load failed: MCP server unreachable';

/** §2.4's two handoff literals. */
const HANDOFF_SECTION = 'Record your handoff in the element\'s "## Execution Notes" section.';
const HANDOFF_FALLBACK = "Record your handoff in the element's body and in your commit messages.";

/**
 * §2.4's `{handoff_line}`: the section line when the element type's template has a `## Execution
 * Notes` heading line, the fallback otherwise.
 */
export function handoffLine(templateHasExecutionNotes: boolean): string {
  return templateHasExecutionNotes ? HANDOFF_SECTION : HANDOFF_FALLBACK;
}

/** What the bootstrap is a function of (§2.4), plus the handoff line its type template selects. */
export interface BootstrapInput {
  readonly role: string;
  /** `<type>:<id>`. */
  readonly element: string;
  readonly runId: string;
  /** The full sha the context is assembled at. */
  readonly stateRef: string;
  /** {@link handoffLine}'s answer for the element's type. */
  readonly handoff: string;
  /**
   * The `team.agents` entry that runs and signs the agent's commits (`dl-158` Rule 1 (a)): its `name`
   * and `email`, which the attribution line hands to the agent (`dl-117` Action 4, ruling R20 Q8).
   */
  readonly agent: { readonly name: string; readonly email: string };
}

/** The fixed opening of §2.4's attribution line (task-228, `git-conventions` §7). */
export const ATTRIBUTION_LINE_PREFIX = 'End every commit you write, except an approve or reject commit, with the trailer paragraph';

/** §2.4's attribution line for `agent`: the rule of `git-conventions` §7, with the entry that signs. */
export function attributionLine(agent: { readonly name: string; readonly email: string }): string {
  return `${ATTRIBUTION_LINE_PREFIX} "Co-Authored-By: ${agent.name} <${agent.email}>" and "AI-Model: <the model identifier you run as>"; to a commit wingfoil writes, add them with git commit --amend --no-edit --trailer, never as a paragraph of their own (git-conventions §7, §8).`;
}

/**
 * The session Resource the bootstrap names (§2.4, task-236): `wingfoil://session/<role>/<type>:<id>/<sha>`, the
 * concrete form of the MCP server's `wingfoil://session/{role}/{element}/{state}` template (`spec-004` §2.1). A
 * Resource, not the `{role}-session` Prompt that serves the same text: an agent CLI may give its model a tool to
 * read Resources and none to get Prompts (Claude Code 2.1.296, the `claude-code` built-in's by-hand pass).
 */
function sessionContextUri(role: string, element: string, stateRef: string): string {
  return `wingfoil://session/${role}/${element}/${stateRef}`;
}

/**
 * The bootstrap prompt (§2.4): the only text WingFoil puts into the agent's initial prompt. Pure, with
 * no clock and no host data, LF-terminated. Its last line hands the agent the attribution rule and the
 * entry that signs (task-228). A change to any literal here is a revision of `spec-016`.
 */
export function renderBootstrap(input: BootstrapInput): string {
  const contextInstruction = `Read the MCP resource "${sessionContextUri(input.role, input.element, input.stateRef)}".`;
  return [
    `WingFoil run ${input.runId}: act as role "${input.role}" on element ${input.element}.`,
    `Your context is assembled at commit ${input.stateRef} and served by the "wingfoil" MCP server`,
    `registered for this session. Load it before any other action: ${contextInstruction}`,
    input.handoff,
    attributionLine(input.agent),
    '',
  ].join('\n');
}

/** An MCP server to start: an executable and its argv, never a shell line. */
export interface McpServerCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * The server `agent execute` registers and pre-flights (§2.5): the build that is running it — the Node
 * executable, and `[<that build's cli.js>, "mcp"]`, `cli.js` sitting one directory above this module in
 * the compiled layout (`dist/agent/` → `dist/cli.js`).
 */
export function runningBuildMcpServer(): McpServerCommand {
  return { command: process.execPath, args: [join(__dirname, '..', 'cli.js'), 'mcp'] };
}

/** `mcp.template`'s placeholder tokens: the narrow class, so JSON braces are left alone (§2.3). */
const TEMPLATE_TOKEN_RE = /\{([a-z][a-z0-9_]*)\}/g;

/** The first code unit of `text` that is half of no surrogate pair, or `undefined` when there is none. */
function firstUnpairedSurrogate(text: string): number | undefined {
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) i += 1;
      else return unit;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return unit;
    }
  }
  return undefined;
}

/** JSON text with every U+007F written as `\u007f`: TOML's basic string forbids it raw, JSON leaves it so (§2.3). */
function jsonForTemplate(value: string | readonly string[]): string {
  return JSON.stringify(value).replace(/\u007f/g, '\\u007f');
}

/**
 * Render `mcp.template` (§2.3): `{mcp_command}` becomes the executable as JSON string content (the
 * template quotes it; a quote or a backslash in the path stays valid), `{mcp_args}` the argv as a JSON
 * array, every U+007F written as the escape `\u007f` in both, so the text is valid JSON and valid TOML
 * (task-355, `bug-371`). The manifest validator admits no other placeholder there, so any other token is
 * left as is.
 *
 * @returns The rendered text, or `VALIDATION` when the command or an argument holds an unpaired surrogate,
 *   which neither JSON nor TOML can carry (§3.7): `mcp.template cannot carry the MCP server's command: it
 *   holds an unpaired surrogate (U+D800)`, or `… the MCP server's argument <n>: …` with `<n>` from 1.
 */
export function renderMcpTemplate(template: string, server: McpServerCommand): CoreResult<string> {
  const carried: [string, string][] = [['command', server.command], ...server.args.map((arg, index): [string, string] => [`argument ${index + 1}`, arg])];
  for (const [what, value] of carried) {
    const unit = firstUnpairedSurrogate(value);
    if (unit !== undefined) {
      const hex = unit.toString(16).toUpperCase().padStart(4, '0');
      return coreErr({ code: 'VALIDATION', message: `mcp.template cannot carry the MCP server's ${what}: it holds an unpaired surrogate (U+${hex})` });
    }
  }
  return coreOk(
    template.replace(TEMPLATE_TOKEN_RE, (token: string, name: string) => {
      if (name === 'mcp_command') return jsonForTemplate(server.command).slice(1, -1);
      if (name === 'mcp_args') return jsonForTemplate(server.args);
      return token;
    }),
  );
}

/** The temporary files a launch may need (§2.3), by the placeholder that names each one's path. */
export type RunFileName = 'bootstrap_file' | 'mcp_config_file';

/** Each file's basename inside the run's temporary directory. */
const RUN_FILE_BASENAMES: Readonly<Record<RunFileName, string>> = {
  bootstrap_file: 'bootstrap.txt',
  mcp_config_file: 'mcp-config.json',
};

/** The signals that end `agent execute` before the spawn, and so must not leave the temporary files behind. */
const CLEANUP_SIGNALS: readonly NodeJS.Signals[] = process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * Write `files` into a fresh directory of the operating system's temporary directory (never the
 * repository, §2.3), owner-only, run `work` with their absolute paths, and remove the directory when
 * `work` settles — resolved, rejected or thrown alike.
 *
 * A `SIGINT`, `SIGTERM` or `SIGHUP` that arrives meanwhile (a pre-flight interrupted from the keyboard,
 * task-218's review) removes the directory too, then ends the process by that same signal. `work`
 * receives `release`, which removes that handling: the launch calls it when it takes the signals over
 * (§3.3 step 15).
 */
export async function withRunFiles<T>(
  files: Partial<Record<RunFileName, string>>,
  work: (paths: Partial<Record<RunFileName, string>>, release: () => void) => Promise<T>,
): Promise<T> {
  // The listeners go in before the directory exists (review fix 1), so no signal can leave it behind.
  let dir: string | undefined;
  const listeners = CLEANUP_SIGNALS.map((signal): [NodeJS.Signals, () => void] => [
    signal,
    () => {
      // The directory goes before the listeners: a second signal meanwhile runs this again, harmlessly.
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
      release();
      process.kill(process.pid, signal);
    },
  ]);
  let held = true;
  function release(): void {
    if (!held) return;
    held = false;
    for (const [signal, listener] of listeners) process.removeListener(signal, listener);
  }
  for (const [signal, listener] of listeners) process.on(signal, listener);
  try {
    dir = mkdtempSync(join(tmpdir(), 'wingfoil-run-'));
    const paths: Partial<Record<RunFileName, string>> = {};
    for (const name of Object.keys(RUN_FILE_BASENAMES).sort() as RunFileName[]) {
      const text = files[name];
      if (text === undefined) continue;
      const path = join(dir, RUN_FILE_BASENAMES[name]);
      writeFileSync(path, text, { encoding: 'utf-8', mode: 0o600 });
      paths[name] = path;
    }
    return await work(paths, release);
  } finally {
    // Removed before the last listeners come out, so no signal in between can leave it behind.
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    release();
  }
}

/** Whether `path` is a regular file this process may execute. */
function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * §3.3 step 4: whether the adapter's `command` can be started — a name holding no path separator is
 * looked up on `searchPath` (`PATH`), in order; anything else is a path, resolved against the project
 * root when relative. Either way it must be an executable regular file. Nothing is run, and no shell is
 * involved (`dl-090` Q3 (a)).
 */
export function agentCommandFound(root: string, command: string, searchPath: string | undefined): boolean {
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) return isExecutableFile(resolve(root, command));
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')] : [''];
  return (searchPath ?? '')
    .split(delimiter)
    .filter((dir) => dir !== '')
    .some((dir) => extensions.some((extension) => isExecutableFile(join(dir, `${command}${extension}`))));
}

/**
 * §3.2 step 4 (the role already checked): with `agentName`, that `team.agents` entry, which must
 * execute `role` and declare an `adapter`; without it, the first entry in declared order that does both.
 */
export function selectAgent(dna: DnaYaml, role: string, agentName: string | undefined): CoreResult<AgentEntry> {
  const agents = dna.team.agents ?? [];
  const refuse = (message: string): CoreResult<AgentEntry> => coreErr({ code: 'VALIDATION', message });
  if (agentName === undefined) {
    const found = agents.find((agent) => agent.adapter !== undefined && agent.executes_as.includes(role));
    return found === undefined ? refuse(`no agent in dna.yaml with an adapter executes as role '${role}'`) : coreOk(found);
  }
  const named = agents.find((agent) => agent.name === agentName);
  if (named === undefined) return refuse(`unknown agent '${agentName}'`);
  if (!named.executes_as.includes(role)) return refuse(`agent '${agentName}' does not execute as role '${role}'`);
  if (named.adapter === undefined) return refuse(`agent '${agentName}' declares no adapter`);
  return coreOk(named);
}

/** `text` on one line, every spelling of `root` removed (`<root>/x` → `x`), so no absolute path leaks. */
function withoutRoot(text: string, root: string): string {
  return text.replace(/\s*\n\s*/g, '; ').trim().split(`${root}/`).join('').split(root).join('.');
}

/** What {@link mcpPreflight} needs. */
export interface McpPreflightInput {
  readonly root: string;
  readonly server: McpServerCommand;
  readonly role: string;
  /** `<type>:<id>`. */
  readonly element: string;
  readonly stateRef: string;
  readonly timeoutMs: number;
}

/**
 * §3.3 step 11: start the server, complete MCP `initialize`, read the session Resource the bootstrap names
 * (§2.4, task-236), and close. The project's own registration (`.mcp.json`) is not read (§2.5). Any
 * failure — the server does not start, exits, refuses the Resource, returns no text, or exceeds
 * `timeoutMs` — is `IO` with P5.4.3 sc. 3's message verbatim, its cause as a `dl-055` detail line with the
 * project root removed.
 *
 * The Resource is the one carrier checked, the one the agent reads: the `{role}-session` Prompt serves the
 * same text from the same builder and is not fetched, so the context is assembled once per pre-flight
 * (task-355, `bug-376`). One deadline covers the whole exchange.
 */
export async function mcpPreflight(input: McpPreflightInput): Promise<CoreResult<undefined>> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const transport = new StdioClientTransport({ command: input.server.command, args: [...input.server.args], cwd: input.root, env, stderr: 'pipe' });
  let serverStderr = '';
  transport.stderr?.on('data', (chunk: Buffer | string) => {
    serverStderr += chunk.toString();
  });
  const client = new Client({ name: 'wingfoil-agent-execute', version: '1' }, { capabilities: {} });
  // One deadline for the whole exchange, start-up included (task-218's review: a limit per request let
  // the pre-flight take about twice it against REQ-PERF-01's 30 s).
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${input.timeoutMs} ms`)), input.timeoutMs);
  });
  const exchange = async (): Promise<void> => {
    await client.connect(transport, { timeout: input.timeoutMs });
    // task-236: the Resource the bootstrap names — what the agent will actually read.
    const uri = sessionContextUri(input.role, input.element, input.stateRef);
    const resource = await client.readResource({ uri }, { timeout: input.timeoutMs });
    const entry = resource.contents[0];
    if (entry === undefined || !('text' in entry) || entry.text === '') {
      throw new Error(`the session resource ${uri} returned no context text`);
    }
  };
  try {
    await Promise.race([exchange(), deadline]);
    return coreOk(undefined);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const said = serverStderr.trim().split('\n').filter((line) => line.trim() !== '').pop();
    const cause = withoutRoot(said === undefined ? reason : `${reason} (server: ${said})`, input.root);
    return coreErr({ code: 'IO', message: MCP_UNREACHABLE_MESSAGE, details: { cause, issues: [{ detail: cause }] } });
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => undefined);
  }
}

/**
 * The request (§3.1): `--element`, `--role`, `--agent`, and, for a step form, the step selector. At least one
 * of `element` and `step` is given (the caller's usage check, §3.1).
 */
export interface AgentExecuteRequest {
  /** `--element`; with a step form it overrides the step's element and keeps its phase and role. */
  readonly element?: ExecutionContextElement;
  /** `--next`, `--workflow <ref>`, `--step <key>` (task-235): present for a step form, even empty (`--next`). */
  readonly step?: StepSelector;
  /**
   * `--role`; absent → the step's role (a step form), else {@link DEFAULT_ROLE} with
   * {@link DEFAULT_ROLE_WARNING}.
   */
  readonly role?: string;
  /** `--agent`; absent → the first agent with an adapter that executes the role. */
  readonly agent?: string;
  /** `--headless` / `--interactive` (task-335); absent → the step's phase `launch`, else interactive (§3.2 step 7). */
  readonly launch?: LaunchKindRun;
  /** `--timeout`, parsed (§3.1); absent → unbounded. */
  readonly timeout?: TimeBound;
  /** `--dry-run` is active: step 12 warns instead of refusing, since nothing is spawned (`bug-392`). */
  readonly dryRun?: boolean;
}

/** The host facts the pipeline reads, each overridable by a caller (tests) and defaulted from the process. */
export interface AgentExecuteHost extends LaunchHost {
  /** The server the pre-flight starts; {@link runningBuildMcpServer} by default. */
  readonly mcpServer?: McpServerCommand;
  /** Whether stdin and stdout are both terminals (§3.3 step 12); the process's own by default. */
  readonly isTerminal?: () => boolean;
  /** The `PATH` step 4 searches; `process.env.PATH` by default. */
  readonly searchPath?: string;
  /** {@link MCP_PREFLIGHT_TIMEOUT_MS} by default. */
  readonly mcpTimeoutMs?: number;
}

/** A launch every pre-launch check has passed: what step 13 on needs. */
export interface PreparedLaunch {
  readonly runId: string;
  /** `<type>:<id>`. */
  readonly element: string;
  readonly workflow: string;
  readonly phase: string;
  readonly role: string;
  readonly mode: string;
  /** The `team.agents` entry that runs, and signs its commits (`dl-158` Rule 1 (a)). */
  readonly agent: AgentEntry;
  readonly adapter: LoadedAdapter;
  /** The full sha everything was read at. */
  readonly stateRef: string;
  /** Root-relative path of the run-log file the record will be committed to. */
  readonly logPath: string;
  /** Root-relative path of the element's document at `state_ref` (the record's `notes`, §4.2 key 18). */
  readonly elementPath: string;
  /** Root-relative path of the element type's template file, when the type declares one. */
  readonly templatePath: string | undefined;
  /** §2.4's bytes. */
  readonly bootstrap: string;
  /** The server the agent is registered with (§2.5). */
  readonly mcpServer: McpServerCommand;
  /** Absolute paths of the temporary files (§2.3), valid until the launch callback settles. */
  readonly files: Partial<Record<RunFileName, string>>;
  /** The rendered `mcp.template` under `mcp.via: config-arg` (§2.3 `{mcp_config}`); `undefined` otherwise. */
  readonly mcpConfig?: string | undefined;
  /** The launch kind §3.2 step 7 resolved (task-335). */
  readonly kind: LaunchKindRun;
  /** `--timeout`'s bound, when given. */
  readonly timeout?: TimeBound | undefined;
}

/** The process's own terminals: stdin and stdout both. */
function processHasTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/** `VALIDATION` from a loader's `ValidationError`, its issues as `dl-055` details. */
function validationRefusal(error: ValidationError): CoreResult<never> {
  return coreErr({ code: 'VALIDATION', message: error.message, details: { issues: error.issues } });
}

/** The committed pillar files the pipeline reads, or the refusal of an absent or invalid one. */
function loadCommittedConfig(root: string, sha: string): CoreResult<{ dna: DnaYaml; memoryYaml: MemoryYaml }> {
  try {
    const dna = loadDnaYamlAtRev(root, sha, 'HEAD');
    if (dna === null) return coreErr({ code: 'NOT_FOUND', message: `${DNA_YAML_PATH} is not committed at HEAD, which agent execute reads: commit it first` });
    const memoryYaml = loadMemoryYamlAtRev(root, sha, 'HEAD');
    if (memoryYaml === null) return coreErr({ code: 'NOT_FOUND', message: `${MEMORY_YAML_PATH} is not committed at HEAD, which agent execute reads: commit it first` });
    return coreOk({ dna, memoryYaml });
  } catch (error) {
    if (error instanceof ValidationError) return validationRefusal(error);
    throw error;
  }
}

/**
 * §3.2 step 2: the element must exist at `HEAD` → else `NOT_FOUND` `element not found: <type>:<id>`, the
 * documents the scan could not read as `details.unreadable` (task-171) so the refusal does not read as
 * a bare absence. An archived element is found here and refused by the context builder.
 *
 * `--element <type>:<ref>` takes a short reference (task-332, `spec-008` §7): a miss of the exact id is retried
 * as `<type prefix>-<n>` or a unique prefix, among the documents of that type at `HEAD`, archived ones included.
 * The answer is the element with its FULL id, which the rest of the run (context, run id, log file, record) uses;
 * several matches are `CONFLICT` with every candidate listed.
 */
function requireElement(root: string, sha: string, memoryYaml: MemoryYaml, element: ExecutionContextElement): CoreResult<{ element: ExecutionContextElement; path: string }> {
  const unreadable: Diagnostic[] = [];
  const found = findMemoryDocumentByTypeAndIdAtRev(root, sha, memoryYaml, element.type, element.id, {
    includeArchived: true,
    onDiagnostic: (diagnostic) => unreadable.push(diagnostic),
  });
  if (found !== undefined) return coreOk({ element, path: found.path });
  const scanned: Diagnostic[] = [];
  const resolution = resolveElementReference(loadMemoryDocumentsAtRev(root, sha, memoryYaml, { onDiagnostic: (diagnostic) => scanned.push(diagnostic) }), memoryYaml, element.id, {
    type: element.type,
  });
  if (resolution.kind === 'ambiguous') return coreErr(ambiguousReferenceError(element.id, resolution.candidates));
  if (resolution.kind === 'found') return coreOk({ element: { type: element.type, id: String(resolution.document.frontmatter['id']) }, path: resolution.document.path });
  for (const diagnostic of scanned) if (!unreadable.some((known) => known.file === diagnostic.file)) unreadable.push(diagnostic);
  return coreErr({
    code: 'NOT_FOUND',
    message: `element not found: ${element.type}:${element.id}`,
    ...(unreadable.length > 0 ? { details: unreadableDetails(unreadable.map(formatDiagnostic)) } : {}),
  });
}

/**
 * `details` naming the documents a scan could not read: `unreadable` (task-171's key) and the same
 * lines as `dl-055` detail lines, so the CLI and the MCP surface show them (`errorDetails`).
 */
function unreadableDetails(lines: readonly string[]): Record<string, unknown> {
  return { unreadable: lines, issues: lines.map((detail) => ({ detail })) };
}

/** Root-relative path of the element type's template file, or `undefined` when the type declares none. */
function templatePathOf(memoryYaml: MemoryYaml, type: string): string | undefined {
  const file = memoryYaml.types[type]?.template?.file;
  return file === undefined ? undefined : `.wingfoil/${file}`;
}

/** Whether the element type's template, at `sha`, has a `## Execution Notes` heading line (§2.4). */
function templateHasExecutionNotes(root: string, sha: string, templatePath: string | undefined): boolean {
  if (templatePath === undefined) return false;
  const text = readPathAtRev(root, sha, templatePath);
  return text !== null && executionNotesSection(text) !== null;
}

/**
 * §3.3 step 4's conflict check (task-356, `bug-372`; §2.5, §3.7 `MCP_SERVER_DECLARED`): when the adapter declares
 * `mcp.conflict_args`, that argv is run ({@link runConflictProbe}); exit `0` means the agent's own configuration
 * declares an MCP server named `wingfoil`, which the agent would merge into the server `agent execute` registers,
 * and refuses the launch (`CONFLICT`, `details` the adapter and the argv). A non-zero exit passes; a probe that times
 * out or cannot be started passes with one `warning:` line naming the adapter and the cause (approver ruling D1.3).
 */
export async function mcpConflictCheck(root: string, adapter: string, manifest: AdapterManifest, timeoutMs: number): Promise<CoreResult<undefined>> {
  const argv = manifest.mcp.conflict_args;
  if (argv === undefined) return coreOk(undefined);
  const probe = await runConflictProbe(root, manifest.command, argv, timeoutMs);
  if (probe.kind === 'failed') reportWarning(`adapter '${adapter}': the MCP server conflict check (mcp.conflict_args) ${probe.reason}: going on without it`);
  if (probe.kind !== 'declared') return coreOk(undefined);
  return coreErr({
    code: 'CONFLICT',
    message: `adapter '${adapter}': the agent's own configuration declares an MCP server named 'wingfoil', which it would merge into the server agent execute registers: remove or rename it`,
    details: { adapter, argv: [...argv] },
  });
}

/**
 * Run `agent execute`'s pipeline up to the spawn (§3.3 steps 2–12, see the module doc), then
 * `launch` with the prepared launch, while its temporary files exist. Warnings go through the warning
 * sink as they arise. Returns the first refusal, or what `launch` returns.
 *
 * @param root - The project root, already known to be initialized.
 */
export async function agentExecutePipeline<T>(
  root: string,
  request: AgentExecuteRequest,
  host: AgentExecuteHost,
  launch: (prepared: PreparedLaunch, releaseSignals: () => void) => Promise<CoreResult<T>>,
): Promise<CoreResult<T>> {
  // Each distinct warning is printed once — the pipeline and the context builder both load dna.yaml
  // (task-218's review F5). The reads name the resolved commit `HEAD:` themselves, the baseline every read of
  // the run is at (spec-008 §6, task-354): no warning is rewritten after the fact.
  return withDistinctWarnings(() => runPipeline(root, request, host, launch));
}

/** {@link agentExecutePipeline}'s body. */
async function runPipeline<T>(
  root: string,
  request: AgentExecuteRequest,
  host: AgentExecuteHost,
  launch: (prepared: PreparedLaunch, releaseSignals: () => void) => Promise<CoreResult<T>>,
): Promise<CoreResult<T>> {
  // Step 2 — one HEAD, every gating read at it. A step form reads the deduction first, so the HEAD it was
  // deduced at is the one every later read takes (task-235); a registry error refuses here.
  const deduced = request.step === undefined ? undefined : readNextAtHead(root, request.step.workflow);
  if (deduced !== undefined && !deduced.ok && deduced.error.code === 'VALIDATION') return deduced;
  let sha: string;
  try {
    // The deduction of a repository with no commit has no commit either: resolving HEAD then refuses it.
    sha = deduced?.ok === true && deduced.value.baseline.commit !== '' ? deduced.value.baseline.commit : resolveRevision(root, 'HEAD');
  } catch (error) {
    if (error instanceof RevisionError) return coreErr(error.toCoreError());
    throw error;
  }
  // The deduction's diagnostics, as `workflow next` lists them, one `warning:` line each (§3.3 step 2, bug-339).
  if (deduced?.ok === true) for (const diagnostic of deduced.value.diagnostics) reportWarning(diagnosticWarning(diagnostic));
  const config = loadCommittedConfig(root, sha);
  if (!config.ok) return config;
  const { dna, memoryYaml } = config.value;
  for (const diagnostic of adapterTreeDiagnosticsAtRev(root, sha)) reportWarning(formatDiagnostic(diagnostic));
  // A name in both built-in/ and custom/ is refused where the tree is listed (§2.1), before resolution.
  // Every adapter read takes the one resolved commit, spelled `HEAD` in messages (task-235's review F3).
  const duplicate = duplicateAdapterRefusal(root, sha, 'HEAD');
  if (duplicate !== undefined) return duplicate;

  // Step 3 — resolution (§3.2 steps 1–5).
  // §3.2 step 1 — the step (a step form only), which names the run's workflow and phase.
  let step: Step | undefined;
  if (deduced !== undefined) {
    if (!deduced.ok) return deduced;
    const selected = selectFrontierStep(deduced.value, request.step!.key);
    if (!selected.ok) return selected;
    // A step that only waits is refused, unless `--element` makes it an explicit target (dl-171 (c), task-335).
    if (request.element === undefined) {
      const runnable = refuseWaitingStep(selected.value);
      if (!runnable.ok) return runnable;
    }
    step = selected.value;
  }
  // §3.2 step 2 — the element: `--element`, else the step's; it must exist at HEAD.
  let target: ExecutionContextElement;
  if (step === undefined) {
    target = request.element!; // the stepless form always names its element (the caller's usage check)
  } else {
    const stepElement = stepTargetElement(step, deduced!.ok ? deduced!.value.instance : null, request.element);
    if (!stepElement.ok) return stepElement;
    target = stepElement.value;
  }
  const element = requireElement(root, sha, memoryYaml, target);
  if (!element.ok) return element;
  target = element.value.element; // the full id, whatever reference `--element` gave
  const elementRef = `${target.type}:${target.id}`;
  // §3.2 step 3 — the role: `--role`, else the step's, else (stepless) the developer default, with a warning.
  let role: string;
  if (step === undefined) {
    if (request.role === undefined) reportWarning(DEFAULT_ROLE_WARNING);
    role = request.role ?? DEFAULT_ROLE;
  } else {
    const stepRole = resolveStepRole(dna, step, request.role);
    if (!stepRole.ok) return stepRole;
    role = stepRole.value;
  }
  if (!isRoleDefined(dna, role)) return coreErr({ code: 'VALIDATION', message: `unknown role '${role}' (not defined in dna.yaml)` });
  if (role === APPROVER_ROLE) return coreErr({ code: 'VALIDATION', message: `role '${APPROVER_ROLE}' is never executed by an agent` });
  const agent = selectAgent(dna, role, request.agent);
  if (!agent.ok) return agent;
  const adapter = loadAdapter(root, agent.value.adapter!, sha, 'HEAD');
  if (!adapter.ok) return adapter;
  const manifest = adapter.value.manifest;
  // §3.2 step 7 — the launch kind, after the approver rule above, which no option relaxes.
  const launchKind = resolveLaunchKind(step?.launch ?? null, request.launch, manifest);
  if (launchKind.warning !== undefined && step !== undefined) reportWarning(`phase '${step.workflow}.${step.phase}' ${launchKind.warning}`);
  const kind = launchKind.kind;

  // Step 4 — the adapter declares the kind (NO_LAUNCH_KIND, never a fallback to the other), and its CLI can be started.
  if (kind === 'headless' && manifest.launch.headless === undefined) {
    return coreErr({ code: 'VALIDATION', message: `adapter '${adapter.value.name}' declares no headless launch` });
  }
  if (!agentCommandFound(root, manifest.command, host.searchPath ?? process.env.PATH)) {
    return coreErr({ code: 'IO', message: `agent command '${manifest.command}' not found (adapter '${adapter.value.name}')` });
  }
  // Step 4, last — the agent's own configuration declares no server named `wingfoil` it would merge into ours
  // (§2.5, task-356, bug-372); a dry run asks too, since the probe launches no model (approver ruling D1.2).
  const conflict = await mcpConflictCheck(root, adapter.value.name, manifest, host.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS);
  if (!conflict.ok) return conflict;

  // Step 5 — the identity the record commit (step 17) needs, a team member's (`dl-220` Q2 (b), `spec-006` §7).
  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;
  const member = requireTeamMembership(root, identity.value);
  if (!member.ok) return member;

  // Step 6 — the run log, declared and unmodified (`runs` is spec-016 §4.1's declared category; `paths`
  // also admits a project's own categories through its typed catchall, task-312).
  const runs = (dna.paths as Record<string, readonly string[] | undefined> | undefined)?.['runs'];
  const logPath = runLogPreflight(root, runs, target.id);
  if (!logPath.ok) return logPath;

  // Step 7 — the context, assembled and validated at state_ref.
  const assembled = assembleExecutionContext(root, { role, element: target, stateRef: sha, label: 'HEAD' });
  // The element was found at this same commit (step 3), so the builder's NOT_FOUND with
  // `details.unreadable` cannot arise here; its refusals pass through as they are.
  if (!assembled.ok) return assembled;

  // Step 8 — its warnings, before the pre-flight (dl-050 option 4); the notes reach the agent inside the session Resource.
  for (const warning of [...assembled.value.context.warnings, ...(assembled.warnings ?? [])]) {
    reportWarning(warning);
  }

  // Step 9 — the run id.
  // `n` counts per (element, phase), whatever the workflow (§4.3).
  const phase = step?.phase ?? ADHOC_PHASE;
  const runId = nextRunId(root, { logPath: logPath.value, element: elementRef, phase, stateRef: sha });
  if (!runId.ok) return runId;

  // Step 10 — the bootstrap and the temporary files.
  const templatePath = templatePathOf(memoryYaml, target.type);
  const bootstrap = renderBootstrap({
    role,
    element: elementRef,
    runId: runId.value,
    stateRef: sha,
    handoff: handoffLine(templateHasExecutionNotes(root, sha, templatePath)),
    // A team.agents entry that declares an adapter declares an email (dna.yaml schema, dl-158 Rule 2 (ii)).
    agent: { name: agent.value.name, email: agent.value.email ?? '' },
  });
  const mcpServer = host.mcpServer ?? runningBuildMcpServer();
  // `mcp.template` rendered once, before anything is written or spawned: a command or argument it cannot carry
  // is refused here, a dry run included (§3.3 step 10, §3.7; task-355, bug-371).
  let rendered: string | undefined;
  if (manifest.mcp.via === 'config-file' || manifest.mcp.via === 'config-arg') {
    const template = renderMcpTemplate(manifest.mcp.template!, mcpServer);
    if (!template.ok) return template;
    rendered = template.value;
  }
  const files: Partial<Record<RunFileName, string>> = {
    ...(manifest.prompt.via === 'file' ? { bootstrap_file: bootstrap } : {}),
    ...(manifest.mcp.via === 'config-file' && rendered !== undefined ? { mcp_config_file: rendered } : {}),
  };
  // Under `config-arg` the rendered template is not a file but one whole argv element (§2.3 `{mcp_config}`).
  const mcpConfig = manifest.mcp.via === 'config-arg' ? rendered : undefined;

  return withRunFiles(files, async (paths, releaseSignals) => {
    // Step 11 — the MCP pre-flight.
    const preflight = await mcpPreflight({
      root,
      server: mcpServer,
      role,
      element: elementRef,
      stateRef: sha,
      timeoutMs: host.mcpTimeoutMs ?? MCP_PREFLIGHT_TIMEOUT_MS,
    });
    if (!preflight.ok) return preflight;

    // Step 12 — the terminal check, last; an interactive launch only. A dry run spawns nothing: it warns (bug-392).
    const isTerminal = host.isTerminal ?? processHasTerminal;
    if (kind === 'interactive' && manifest.launch.interactive.terminal === 'required' && !isTerminal()) {
      if (request.dryRun !== true) return coreErr({ code: 'VALIDATION', message: 'interactive launch needs a terminal on stdin and stdout' });
      reportWarning(DRY_RUN_TERMINAL_WARNING);
    }

    return launch({
      runId: runId.value,
      element: elementRef,
      workflow: step?.workflow ?? NO_WORKFLOW,
      phase,
      role,
      // Every v0.3 run is fresh, whatever the step's allowedModes; the phase's separation of executors is not checked (§3.2 step 6, P4.12 in v1.0).
      mode: FRESH_MODE,
      agent: agent.value,
      adapter: adapter.value,
      stateRef: sha,
      logPath: logPath.value,
      elementPath: element.value.path,
      templatePath,
      bootstrap,
      mcpServer,
      files: paths,
      mcpConfig,
      kind,
      timeout: request.timeout,
    }, releaseSignals);
  });
}

/** The launch `--dry-run` prints (`spec-008` §2): the record commit it would make, and the run. */
export interface AgentLaunchPlan {
  readonly dryRun: true;
  /** `agent: record <run-id>`. */
  readonly subject: string;
  /** The run-log file the record commit would hold. */
  readonly paths: readonly string[];
  /** The record's fields known before the spawn, in §4.2 order. */
  readonly run: {
    readonly id: string;
    readonly element: string;
    readonly workflow: string;
    readonly phase: string;
    readonly role: string;
    readonly mode: string;
    readonly agent: string;
    readonly adapter: string;
    readonly state_ref: string;
  };
  /** §2.4's bootstrap, the bytes the agent would be given. */
  readonly bootstrap: string;
}

/** The plan of `prepared` (a pure function of it, host paths excluded). */
export function launchPlan(prepared: PreparedLaunch): AgentLaunchPlan {
  return {
    dryRun: true,
    subject: recordSubject(prepared.runId),
    paths: [prepared.logPath],
    run: {
      id: prepared.runId,
      element: prepared.element,
      workflow: prepared.workflow,
      phase: prepared.phase,
      role: prepared.role,
      mode: prepared.mode,
      agent: prepared.agent.name,
      adapter: `${prepared.adapter.kind}/${prepared.adapter.name}`,
      state_ref: prepared.stateRef,
    },
    bootstrap: prepared.bootstrap,
  };
}
