/**
 * `wingfoil agent execute`, the launch half (`spec-016-agent-execution` §3.3 steps 13–18, task-228):
 * what follows the pre-launch pipeline (`./execute.ts`) once every check has passed.
 *
 * 13. The run's entry in the active registry (`./active-runs.ts`, §7, task-336): created exclusively, a live entry
 *     for the run id refusing the launch (`RUN_ACTIVE`), with a `warning:` line when git does not ignore it; then,
 *     for a headless run with `--log`, the file opened for appending (`./output.ts`; `LOG_UNWRITABLE`), with a
 *     `warning:` line when it is inside the repository and not ignored. Then the agent CLI's version, read before the
 *     launch as a post-run lookup runs (§2.6, task-337, `bug-366`): `agent_version`. Then the banner,
 *     `run <run-id>: launching <agent> (<adapter>) as <role> on <type>:<id>`, as a notice on stderr
 *     (`reportNotice`): the CLI renders it in the active `--format`. From here every exit path removes the entry
 *     and closes the log.
 * 14. The spawn: the adapter's `command` with `launch.<kind>.args`, then the permission fragment of the run's role
 *     ({@link launchPermissions}, task-339), then the trust fragment ({@link launchTrust}, task-353), then
 *     `session.assign_args` under `session.id: assign`, every placeholder filling whole argv elements
 *     ({@link renderLaunchArgv}), no shell, its working directory the project root (the directory the global
 *     `--project` names, a linked worktree of the repository included, `bug-499`), the environment passed
 *     through with three changes ({@link agentEnvironment}, task-338): the launching build's `wingfoil` shim
 *     first on `PATH`, `WINGFOIL_CLI` naming it, and `spec-018` §1.1's launcher marker set to the agent's name. An interactive agent inherits stdin, stdout and stderr; a headless one (the
 *     work run, §3.5, task-335) reads the null device, its stdout and stderr are both piped and forwarded line by
 *     line to the caller's stderr (`reportOutput`, `dl-182` Q1 (a), task-336) and, with `--log`, appended to that
 *     file — stdout also read for the session id under `session.id: output` and for the usage under `usage.from` naming
 *     `output`, step 16 — and on POSIX it runs in a
 *     session and process group of its own (approver ruling D6 (a)). Once spawned, the registry entry is rewritten
 *     with the agent's pid, and at the agent's exit with `agent execute`'s own again, each time only while the file
 *     still holds this launch's entry (§7). This is REQ-PERF-01's "agent ready".
 * 15. The wait. From the spawn until the record is committed, for an interactive launch `SIGINT`,
 *     `SIGQUIT` and `SIGHUP` are ignored (the terminal delivers them to the agent itself, in the same
 *     foreground process group: a forwarded `SIGHUP` reached it twice, task-355, `bug-318`) and only
 *     `SIGTERM` is forwarded to the agent while it runs; a headless agent has no terminal, so `SIGINT`,
 *     `SIGTERM` and `SIGHUP` are forwarded and only `SIGQUIT` is ignored. On POSIX a headless delivery goes
 *     to the agent's whole process group, and once an agent a signal reached has exited, what is left of
 *     the group is sent `SIGKILL` before the launch returns (task-355, `bug-516`). A run ended by a
 *     signal is still recorded as `signal:<NAME>`. With `--timeout` the bound runs from the spawn: at
 *     expiry `SIGTERM` through the same forwarding, then `SIGKILL` {@link TIMEOUT_GRACE_MS} later if the
 *     agent still runs; both timers stop when it exits.
 * 16. The end of a headless run's output: after the exit both streams are forwarded until each ends, at most
 *     {@link LOOKUP_TIMEOUT_MS}, then closed, a last line without a newline forwarded with one (approver ruling
 *     D11). The session id a headless run's stdout carried, under `session.id: output` (§2.6, task-356: one JSON
 *     document under `launch.headless.output: json`, the first line carrying it under `jsonl`; none found is
 *     `not-reported` and a `warning:` line). The post-run lookups (§2.6): `version_args` again
 *     (`agent_version_after`, a version other than the one read before the launch said in a `warning:` line,
 *     task-337), `session.lookup_args`, `usage.lookup_args`, each run as
 *     `command` + argv with a time limit ({@link LOOKUP_TIMEOUT_MS}); one argv declared twice runs once.
 *     A lookup that fails, times out or prints no JSON, and a value of the wrong type, yield
 *     `not-reported` and a `warning:` line; the lookup never fails the run. The usage sources `usage.from` names
 *     (`./usage.ts`, task-337) are tried in order — the lookup, a headless `output: json` run's stdout, the agent's
 *     session transcript — the first that yields a value supplying the model and the counts. The start-up hint (task-353,
 *     `bug-500`): a run that did not succeed, with `HEAD` still at `state_ref` and `notes` `none`, under
 *     `launch.<kind>.trust: prompt`, records {@link START_UP_HINT_NOTES} as its `notes` and, once committed, prints
 *     one `warning:` line naming the agent CLI's folder-trust step.
 * 17. The record (§4.2), appended and committed by `recordRun` (task-206): `agent: record <run-id>`; then, whatever
 *     its outcome, the registry entry removed (only while it is still this launch's) and the log closed.
 * 18. The outcome: success only when the agent exited `0`, the bound did not expire and the record was
 *     committed. An expired bound is `agent timed out after <duration>; run <run-id> recorded`, whatever
 *     the exit status. A headless success also prints the summary line as a notice (§3.5).
 *
 * **Determinism.** The argv, the session id and every record field but `duration_ms` are pure functions
 * of committed state, the run's inputs and, for an assigned session id, the clone's session salt (§2.6,
 * `./session-salt.ts`), the one random value of a launch; the temporary-file paths and the Node executable are host
 * values that never reach the context (`spec-016` Consequences). The agent version and the usage are read before and
 * after the run, never into the context; the transcript's host path is neither recorded nor printed (task-337). `duration_ms` is wall-clock by design:
 * a record of what happened, never part of a context (`dl-114` Q2); so is the registry entry's `started_ms` (§7,
 * {@link LaunchHost.now}), which never reaches the record.
 */
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import { execFile, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, posix, resolve, win32 } from 'node:path';
import { performance } from 'node:perf_hooks';

import { readBuildStamp, resolveCommitAtRev } from '../storage';
import { reportNotice, reportOutput, reportWarning, type OutputStream } from '../validation/warning';
import { AGENT_MARKERS } from '../core/agent-context';
import { coreErr, coreOk, type CoreResult } from '../core/types';

import type { TimeBound } from './duration';
import type { AdapterManifest } from './schema';
import { deriveNotesField, NOT_REPORTED, recordRun, START_UP_HINT_NOTES, type RunRecord, type RunTokens } from './run-log';
import { sessionSalt } from './session-salt';
import { activeRunPath, registerRun, REGISTRY_NOT_IGNORED_WARNING, removeRun, rewriteRunPid, type ActiveRunEntry } from './active-runs';
import { lineSplitter, logNotIgnoredWarning, notIgnoredInRepository, openLog, type OpenLog } from './output';
import { documentUsage, readJsonPath, readTranscriptLines, renderTranscriptPath, transcriptAccumulator, yieldsUsage, type SourceUsage } from './usage';

/**
 * How much one post-run lookup may print before it is stopped (§2.6): `execFile`'s `maxBuffer`, which
 * bounds stdout and stderr each, so a lookup with valid stdout and over 1 MiB on stderr loses its values.
 */
const LOOKUP_MAX_BYTES = 1024 * 1024;

/** How long `--timeout`'s `SIGTERM` waits before `SIGKILL` (§3.3 step 15; approver ruling D5 (a): fixed, 10 s). */
export const TIMEOUT_GRACE_MS = 10000;

/** How long one post-run lookup may run (§2.6, §3.3 step 16). */
export const LOOKUP_TIMEOUT_MS = 10000;

/**
 * The namespace of the assigned session ids (§2.6): the version 5 UUID of the name
 * `wingfoil:spec-016:session` in RFC 4122's URL namespace, fixed here so no clock or random source is
 * involved.
 */
export const SESSION_ID_NAMESPACE = 'a432dcd6-576d-5991-9503-2b23aa4139db';

/** RFC 4122 §4.3 name-based UUID, version 5 (SHA-1) of `name` in `namespace`. */
export function uuidV5(namespace: string, name: string): string {
  const hash = createHash('sha1')
    .update(Buffer.concat([Buffer.from(namespace.replace(/-/g, ''), 'hex'), Buffer.from(name, 'utf-8')]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The session id WingFoil assigns (§2.6 `assign`): the v5 UUID of `<session salt>\n<run id>` in
 * {@link SESSION_ID_NAMESPACE}, `salt` the clone's ({@link sessionSalt}, task-338, `dl-168` Q1 (b)). Unique per
 * clone and run, derived, and it discloses nothing about the host; the run id is the identifier across clones
 * (`dl-135` Q3 (a)). Records committed before the salt hashed the repository root instead and keep those ids.
 */
export function assignedSessionId(salt: string, runId: string): string {
  return uuidV5(SESSION_ID_NAMESPACE, `${salt}\n${runId}`);
}

/** The variable that names the launching build's `wingfoil` shim in the agent's environment (§2.4). */
export const CLI_VARIABLE = 'WINGFOIL_CLI';

/**
 * The environment the agent is spawned with (§2.4, §3.3 step 14, task-338): a copy of `env` with, when `cliShim` (the
 * shim's absolute path) is given, the shim's directory first on `PATH` (the key found case-insensitively on win32;
 * `PATH` is the directory alone when absent) and {@link CLI_VARIABLE} set to the shim's path; and always `spec-018`
 * §1.1's launcher marker — the first of `AGENT_MARKERS`, read from there so no marker name is spelled here — set to
 * `agentName`, whatever it held. `env` is not changed; an unset variable is left out. `platform` (the process's by
 * default) picks the path rules: win32's `;` separator and backslashes, and its case-insensitive `Path` key.
 */
export function agentEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  cliShim: string | undefined,
  agentName: string,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) if (value !== undefined) out[name] = value;
  if (cliShim !== undefined) {
    const rules = platform === 'win32' ? win32 : posix;
    const pathKey = (platform === 'win32' ? Object.keys(out).find((name) => name.toUpperCase() === 'PATH') : undefined) ?? 'PATH';
    const current = out[pathKey];
    const dir = rules.dirname(cliShim);
    out[pathKey] = current === undefined || current === '' ? dir : `${dir}${rules.delimiter}${current}`;
    out[CLI_VARIABLE] = cliShim;
  }
  // Read at call time: `src/core` and `src/agent` import each other, so the table may still be loading at module time.
  out[AGENT_MARKERS[0]!.id] = agentName;
  return out;
}

/** The values the launch placeholders take (§2.3). */
export interface LaunchValues {
  readonly bootstrap: string;
  /** Absolute paths of the temporary files the launch declared. */
  readonly files: Partial<Record<'bootstrap_file' | 'mcp_config_file', string>>;
  readonly mcpServer: { readonly command: string; readonly args: readonly string[] };
  /** The rendered `mcp.template`, passed as one whole argv element; read only under `mcp.via: config-arg`. */
  readonly mcpConfig?: string | undefined;
  /** The assigned session id; read only under `session.id: assign`. */
  readonly sessionId: string;
}

/** One argv template rendered: each `{name}` element replaced by its value, `{mcp_args}` by several. */
function renderArgv(template: readonly string[], values: LaunchValues): string[] {
  const single: Record<string, string | undefined> = {
    '{bootstrap}': values.bootstrap,
    '{bootstrap_file}': values.files.bootstrap_file,
    '{mcp_config_file}': values.files.mcp_config_file,
    '{mcp_config}': values.mcpConfig,
    '{mcp_command}': values.mcpServer.command,
    '{session_id}': values.sessionId,
  };
  return template.flatMap((element) => {
    if (element === '{mcp_args}') return [...values.mcpServer.args];
    // The manifest validator admits a placeholder only as a whole element, and only where it has a
    // value (§2.3), so every token here is one of these.
    return [single[element] ?? element];
  });
}

/** The kind a launch runs as (`spec-016` §3.2 step 7, task-335). */
export type LaunchKindRun = 'interactive' | 'headless';

/**
 * The permission fragment of a run (§3.3 step 14, §2.2 `launch.<kind>.permissions`, `dl-223` (b), task-339): the
 * declared fragment itself, for every role; or the role map's entry for `role`, else its `default` (Pass 2 makes a
 * map declare one); `[]` when the launch kind declares none. It holds no placeholder (§2.3), so it is not rendered.
 *
 * @param manifest - A validated manifest.
 * @param kind - The launch kind of the run; `interactive` never reads the headless field.
 * @param role - The run's resolved role (§3.2).
 */
export function launchPermissions(manifest: AdapterManifest, kind: LaunchKindRun, role: string): readonly string[] {
  const permissions = kind === 'headless' ? manifest.launch.headless?.permissions : manifest.launch.interactive.permissions;
  if (permissions === undefined) return [];
  if (Array.isArray(permissions)) return permissions;
  // An own key only: a role named like an `Object.prototype` member picks `default`, never an inherited value.
  return (Object.hasOwn(permissions, role) ? permissions[role] : permissions['default']) ?? [];
}

/**
 * The trust fragment of a launch kind (§2.2 `launch.<kind>.trust`, §3.3 step 14, `bug-500`, task-353): the declared
 * fragment; `[]` under `implied`, `prompt` or no `trust`. It holds no placeholder (§2.3), so it is not rendered.
 *
 * @param manifest - A validated manifest.
 * @param kind - The launch kind of the run; each kind reads its own field.
 */
export function launchTrust(manifest: AdapterManifest, kind: LaunchKindRun): readonly string[] {
  const trust = kind === 'headless' ? manifest.launch.headless?.trust : manifest.launch.interactive.trust;
  return Array.isArray(trust) ? trust : [];
}

/**
 * The launch argv (§3.3 step 14): `launch.<kind>.args` rendered, then the permission fragment of `role`
 * ({@link launchPermissions}; the `default` entry when no role is given), then the trust fragment
 * ({@link launchTrust}), then `session.assign_args` rendered when the session id is assigned. The `command` is not
 * part of it. A headless launch of an adapter without `launch.headless` is refused before (§3.3 step 4,
 * `NO_LAUNCH_KIND`), so its argv is never rendered here.
 */
export function renderLaunchArgv(manifest: AdapterManifest, values: LaunchValues, kind: LaunchKindRun = 'interactive', role = 'default'): string[] {
  const assign = manifest.session.id === 'assign' ? (manifest.session.assign_args ?? []) : [];
  const args = kind === 'headless' ? (manifest.launch.headless?.args ?? []) : manifest.launch.interactive.args;
  return [...renderArgv(args, values), ...launchPermissions(manifest, kind, role), ...launchTrust(manifest, kind), ...renderArgv(assign, values)];
}

export { readJsonPath };

/** What starts the agent: `child_process.spawn`'s shape, overridable by an in-process caller (tests). */
export type SpawnAgent = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

/** The agent's `command`, as spawned: a name stays a name (the OS searches `PATH`), a path is resolved against the root. */
function commandToSpawn(root: string, command: string): string {
  return isAbsolute(command) || command.includes('/') || command.includes('\\') ? resolve(root, command) : command;
}

/** How the agent process ended: its exit code, or `signal:<NAME>` (§4.2 key 16). */
type ExitStatus = number | string;

const WINDOWS = process.platform === 'win32';

/**
 * The signals `agent execute` takes over while the agent runs (§3.3 step 15), per launch kind: an interactive
 * agent shares the terminal's foreground process group, so the keyboard's signals and the terminal's hang-up
 * reach it directly and are ignored here — `SIGHUP` included, which `agent execute` cannot tell from one sent
 * to it alone (task-355, `bug-318`, approver ruling D1 (a)); a headless agent has no terminal, so `SIGINT` and
 * `SIGHUP` are forwarded to it as well (task-335, D6 (a)). Windows has only the subsets that exist there.
 */
const TAKEN_OVER: Readonly<Record<LaunchKindRun, { readonly ignored: readonly NodeJS.Signals[]; readonly forwarded: readonly NodeJS.Signals[] }>> = {
  interactive: { ignored: WINDOWS ? ['SIGINT'] : ['SIGINT', 'SIGQUIT', 'SIGHUP'], forwarded: ['SIGTERM'] },
  headless: { ignored: WINDOWS ? [] : ['SIGQUIT'], forwarded: WINDOWS ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP'] },
};

/** §3.3 step 15's signal handling, installed before the spawn and attached to the agent once it exists. */
interface SignalTakeover {
  /** Hand the agent over: a forwarded signal that arrived before it existed is sent to it now. */
  attach(child: ChildProcess): void;
  /**
   * The one forwarding path, which a received signal and the time bound both take: `signal` is sent to the
   * agent while it runs — on POSIX, for a headless agent with a pid, to its whole process group — remembered
   * until it is attached, and dropped once it has exited.
   */
  send(signal: NodeJS.Signals): void;
  /**
   * After the agent has exited: when a signal was delivered to its process group, send what is left of the
   * group one `SIGKILL` (task-355, `bug-516`, approver ruling D2 (a)); otherwise nothing. A delivery that
   * fails is a `warning:` line, never an error: the run's outcome is already decided.
   */
  sweep(): void;
  /** Remove every listener installed. */
  restore(): void;
}

/**
 * Install §3.3 step 15's signal handling **before the spawn** (review fix 1: a signal between the
 * pre-launch cleanup's release and the spawn must neither kill `agent execute` nor orphan the agent):
 * the `kind`'s ignored signals ignored, its forwarded ones forwarded to the agent while it runs. One that
 * arrives before the agent exists is remembered and sent as soon as it is attached; once the agent has
 * exited they are ignored, until the record is committed. A headless agent on POSIX runs in a process group
 * of its own (its pid is the group id), so each delivery goes to the group through `signalGroup`, and the
 * processes the agent started receive it too; the interactive kind, Windows and a child with no pid keep
 * `child.kill` (task-355, `bug-516`).
 */
function takeOverSignals(kind: LaunchKindRun, signalGroup: (pgid: number, signal: NodeJS.Signals) => void): SignalTakeover {
  let child: ChildProcess | undefined;
  let pending: NodeJS.Signals | undefined;
  let signalled = false;
  // A group delivery that fails (`EPERM`, say) neither throws out of a signal listener or a timer nor replaces
  // the run's outcome: §3.3 step 18 decides that from the agent's exit, the bound and the record alone.
  // The launch's context, so the warning reaches the operation's sink from a signal listener too.
  const inLaunch = AsyncLocalStorage.snapshot();
  const deliver = (pgid: number, signal: NodeJS.Signals): void => {
    try {
      signalGroup(pgid, signal);
    } catch (error) {
      inLaunch(reportWarning, `could not send ${signal} to the agent's process group ${pgid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const groupOf = (agent: ChildProcess): number | undefined => (kind === 'headless' && !WINDOWS && typeof agent.pid === 'number' ? agent.pid : undefined);
  const send = (signal: NodeJS.Signals): void => {
    if (child === undefined) {
      pending = signal;
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) return;
    const pgid = groupOf(child);
    if (pgid === undefined) {
      child.kill(signal);
      return;
    }
    signalled = true;
    deliver(pgid, signal);
  };
  const { ignored, forwarded } = TAKEN_OVER[kind];
  const installed: [NodeJS.Signals, () => void][] = [
    ...ignored.map((signal): [NodeJS.Signals, () => void] => [signal, () => undefined]),
    ...forwarded.map((signal): [NodeJS.Signals, () => void] => [signal, () => send(signal)]),
  ];
  for (const [signal, listener] of installed) process.on(signal, listener);
  return {
    attach(spawned) {
      child = spawned;
      if (pending !== undefined) send(pending);
    },
    send,
    sweep() {
      if (!signalled || child === undefined || (child.exitCode === null && child.signalCode === null)) return;
      const pgid = groupOf(child);
      if (pgid !== undefined) deliver(pgid, 'SIGKILL');
    },
    restore() {
      for (const [signal, listener] of installed) process.removeListener(signal, listener);
    },
  };
}

/**
 * The spawn options of each launch kind (§3.3 step 14). Headless: stdin the null device, stdout and stderr both piped
 * (forwarded line by line by {@link runAgent}, `dl-182` Q1 (a), task-336; stdout also handed to the session-id reader
 * under `session.id: output`), and on POSIX a session and process group of its own, so the agent has no controlling
 * terminal to open and gets each signal once (approver ruling D6 (a)).
 */
function spawnOptions(kind: LaunchKindRun, root: string, env: NodeJS.ProcessEnv): SpawnOptions {
  if (kind === 'interactive') return { cwd: root, stdio: 'inherit', env };
  return { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env, detached: !WINDOWS };
}

/**
 * What a headless run's output feeds (§3.5, task-336): every line of either stream (the forwarding to the caller's
 * stderr and the `--log` copy), every raw chunk of stdout to each of `stdout`'s consumers in order (the session-id
 * reader of `session.id: output`, task-356, and the usage's document reader of `usage.from` naming `output`,
 * task-337), and how long to wait after the agent exits for both streams to end.
 */
interface HeadlessOutput {
  readonly line: (line: string, stream: OutputStream) => void;
  readonly stdout: readonly ((chunk: Buffer) => void)[];
  readonly drainMs: number;
}

/**
 * Feed one piped stream to `output` (§3.5): each chunk to its line splitter (and, for stdout, to every consumer). The
 * promise settles when the stream ends, closes or fails; {@link close} stops it early, flushing the pending line. The
 * listeners are bound to the launch's async context, so a line reaches the sinks the surface installed around the
 * launch (`withOutputSink`) whoever emits the stream's events.
 */
function feedStream(stream: NodeJS.ReadableStream & { destroy?: () => void }, name: OutputStream, output: HeadlessOutput): { ended: Promise<void>; close: () => void } {
  const splitter = lineSplitter((line) => output.line(line, name));
  const consumers = name === 'stdout' ? output.stdout : [];
  let open = true;
  const close = (): void => {
    if (!open) return;
    open = false;
    splitter.end();
  };
  const ended = new Promise<void>((resolve) => {
    for (const event of ['end', 'close', 'error'] as const) {
      stream.once(
        event,
        AsyncResource.bind(() => {
          close();
          resolve();
        }),
      );
    }
  });
  stream.on(
    'data',
    AsyncResource.bind((chunk: Buffer | string) => {
      if (!open) return;
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      for (const consume of consumers) consume(bytes);
      splitter.write(bytes);
    }),
  );
  return {
    ended,
    close: () => {
      close();
      stream.destroy?.();
    },
  };
}

/**
 * Spawn the agent and wait for it: its exit status and the wall-clock duration, or why it could not start. With
 * `output` (a headless launch, §3.5), both piped streams are fed to it ({@link feedStream}); after the exit the wait goes
 * on until both streams end or `output.drainMs` passes (a process the agent left behind may hold a pipe open, §3.3 step
 * 16), then the streams are closed, a pending last line forwarded, so nothing is forwarded after this settles; the
 * duration is still measured to the exit. A pipe the child does not have (a test's stand-in) is passed over.
 */
function runAgent(
  spawnAgent: SpawnAgent,
  command: string,
  args: readonly string[],
  options: SpawnOptions,
  onSpawn: (child: ChildProcess) => void,
  onExit: () => void,
  output?: HeadlessOutput,
): Promise<{ ok: true; exitStatus: ExitStatus; durationMs: number } | { ok: false; reason: string }> {
  return new Promise((settle) => {
    let child: ChildProcess;
    const start = performance.now();
    try {
      child = spawnAgent(command, args, options);
    } catch (error) {
      settle({ ok: false, reason: error instanceof Error ? error.message : String(error) });
      return;
    }
    const piped = [
      ['stdout', child.stdout ?? null],
      ['stderr', child.stderr ?? null],
    ] as const;
    const fed: { ended: Promise<void>; close: () => void }[] = [];
    for (const [name, stream] of piped) {
      if (stream === null) continue;
      if (output !== undefined) fed.push(feedStream(stream, name, output));
      else stream.resume();
    }
    onSpawn(child);
    let spawned = false;
    child.once('spawn', () => {
      spawned = true;
    });
    child.once('error', (error) => {
      if (!spawned) {
        for (const stream of fed) stream.close();
        settle({ ok: false, reason: error.message });
      }
    });
    child.once('exit', (code, signal) => {
      onExit();
      const durationMs = Math.max(0, Math.round(performance.now() - start));
      const result = { ok: true as const, exitStatus: signal !== null ? `signal:${signal}` : (code ?? 0), durationMs };
      if (output === undefined || fed.length === 0) return settle(result);
      let handle: NodeJS.Timeout | undefined;
      const bound = new Promise<void>((resolve) => {
        handle = setTimeout(resolve, output.drainMs);
      });
      void Promise.race([Promise.all(fed.map((stream) => stream.ended)), bound]).then(() => {
        clearTimeout(handle);
        for (const stream of fed) stream.close();
        settle(result);
      });
    });
  });
}

/** One lookup's outcome: its stdout, or why it failed (one line, for a warning). */
type LookupOutcome = { ok: true; stdout: string } | { ok: false; reason: string; exitCode?: number };

/** Run `command` + `args` with the time limit, no shell, in the root; stdout captured. */
function runLookup(command: string, args: readonly string[], root: string, timeoutMs: number): Promise<LookupOutcome> {
  return new Promise((settle) => {
    execFile(command, [...args], { cwd: root, env: process.env, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: LOOKUP_MAX_BYTES, encoding: 'utf-8' }, (error, stdout) => {
      if (error === null) return settle({ ok: true, stdout });
      const failed = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string; signal?: string | null };
      if (failed.killed === true) return settle({ ok: false, reason: `timed out after ${timeoutMs} ms` });
      if (failed.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return settle({ ok: false, reason: `printed more than ${LOOKUP_MAX_BYTES / 1024 / 1024} MiB on stdout or stderr` });
      if (typeof failed.code === 'number') return settle({ ok: false, reason: `exited ${failed.code}`, exitCode: failed.code });
      if (failed.signal) return settle({ ok: false, reason: `ended by ${failed.signal}` });
      return settle({ ok: false, reason: failed.code !== undefined ? `could not start: ${failed.code}` : failed.message });
    });
  });
}

/** What the conflict probe answered (§3.3 step 4): a server named `wingfoil` declared, none, or no answer. */
export type ConflictProbe = { readonly kind: 'declared' } | { readonly kind: 'none' } | { readonly kind: 'failed'; readonly reason: string };

/**
 * §3.3 step 4's conflict probe (task-356, `bug-372`; §2.5): the adapter's `mcp.conflict_args` run as a post-run
 * lookup runs (§2.6: the `command`, no shell, the project root, WingFoil's environment, `timeoutMs`). Only the exit
 * status is read, never the output: `0` is `declared`, another exit `none`, and a probe that timed out, was ended by
 * a signal or could not be started is `failed`, with the reason.
 */
export async function runConflictProbe(root: string, command: string, args: readonly string[], timeoutMs: number): Promise<ConflictProbe> {
  const outcome = await runLookup(commandToSpawn(root, command), args, root, timeoutMs);
  if (outcome.ok) return { kind: 'declared' };
  if (outcome.exitCode !== undefined) return { kind: 'none' };
  return { kind: 'failed', reason: outcome.reason };
}

/** The first JSON value a lookup printed, or why there is none. */
function parseLookup(outcome: LookupOutcome): { ok: true; document: unknown } | { ok: false; reason: string } {
  if (!outcome.ok) return outcome;
  try {
    return { ok: true, document: JSON.parse(outcome.stdout) as unknown };
  } catch {
    return { ok: false, reason: 'printed no JSON' };
  }
}

/**
 * How much of a headless run's stdout the session id is read from (§2.6 `session.id: output`): the whole document
 * under `launch.headless.output: json`, one line under `jsonl`; past it, `json` yields `not-reported` and a `jsonl`
 * line is passed over.
 */
const OUTPUT_MAX_BYTES = 1024 * 1024;

/** The session id a headless run's stdout carried, or why there is none (one phrase, for a warning). */
type OutputSession = { ok: true; id: string } | { ok: false; reason: string };

/** A headless run's stdout as one JSON document (§2.6 `json`), or why it is not one (one phrase, for a warning). */
type OutputDocument = { ok: true; document: unknown } | { ok: false; reason: string };

/** A reader of a headless run's stdout: fed chunk by chunk, asked once the stream is over. */
interface OutputReader<T> {
  readonly write: (chunk: Buffer) => void;
  readonly end: () => T;
}

/** A reader of a headless run's stdout for the session id. */
type SessionOutputReader = OutputReader<OutputSession>;

/**
 * Under `launch.headless.output: json` (§2.6): the whole stdout, at most {@link OUTPUT_MAX_BYTES}, is one JSON
 * document — the session id's source under `session.id: output` (task-356) and the usage's under `usage.from` naming
 * `output` (task-337). A pure function of the bytes written, in their order.
 */
function jsonDocumentReader(): OutputReader<OutputDocument> {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    write: (chunk) => {
      size += chunk.length;
      if (size <= OUTPUT_MAX_BYTES) chunks.push(chunk);
      else chunks.length = 0;
    },
    end: () => {
      if (size > OUTPUT_MAX_BYTES) return { ok: false, reason: `the headless output is over ${OUTPUT_MAX_BYTES / 1024 / 1024} MiB` };
      try {
        return { ok: true, document: JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown };
      } catch {
        return { ok: false, reason: 'the headless output is not one JSON document' };
      }
    },
  };
}

/** The non-empty string at `field` of `document`, else `undefined` (no such value, another type). */
function sessionIdAt(document: unknown, field: string): string | undefined {
  const value = readJsonPath(document, field);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The non-empty string at `field` of the JSON `text`, else `undefined` (not JSON, no such value, another type). */
function sessionIdIn(text: string, field: string): string | undefined {
  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  return sessionIdAt(document, field);
}

const NO_SESSION_ID = 'the headless output carries no session id';

/**
 * §2.6 `session.id: output` (task-356, `bug-375`): under `jsonl` each line is one JSON value, read in order, and the
 * first non-empty string at `field` is the id (a line that is not JSON, has no such value or is over
 * {@link OUTPUT_MAX_BYTES} is passed over); under `json` the whole stdout is one document ({@link jsonDocumentReader})
 * and the id is at `field`. A pure function of the bytes written, in their order.
 */
function sessionOutputReader(output: 'json' | 'jsonl', field: string): SessionOutputReader {
  if (output === 'json') {
    const document = jsonDocumentReader();
    return {
      write: document.write,
      end: () => {
        const read = document.end();
        if (!read.ok) return read;
        const id = sessionIdAt(read.document, field);
        return id === undefined ? { ok: false, reason: NO_SESSION_ID } : { ok: true, id };
      },
    };
  }
  let id: string | undefined;
  let line: Buffer[] = [];
  let lineSize = 0;
  let skipping = false;
  const append = (piece: Buffer): void => {
    if (skipping || piece.length === 0) return;
    lineSize += piece.length;
    if (lineSize > OUTPUT_MAX_BYTES) {
      skipping = true;
      line = [];
    } else {
      line.push(piece);
    }
  };
  const close = (): void => {
    if (!skipping && lineSize > 0) id = sessionIdIn(Buffer.concat(line).toString('utf-8'), field);
    line = [];
    lineSize = 0;
    skipping = false;
  };
  return {
    write: (chunk) => {
      let from = 0;
      while (id === undefined) {
        const newline = chunk.indexOf(0x0a, from);
        if (newline === -1) {
          append(chunk.subarray(from));
          return;
        }
        append(chunk.subarray(from, newline));
        close();
        from = newline + 1;
      }
    },
    end: () => {
      if (id === undefined) close();
      return id === undefined ? { ok: false, reason: NO_SESSION_ID } : { ok: true, id };
    },
  };
}

/** The facts §3.3 step 16 reads after the agent exited. */
interface PostRunFacts {
  /** `version_args` read after the agent exited (§4.2 key 19). */
  readonly agent_version_after: string;
  readonly model: string;
  readonly session: string;
  readonly tokens: RunTokens;
}

/**
 * Every count unreported. A function, not a module constant: `./run-log` can still be loading when this
 * module is first evaluated (`src/core` ↔ `src/agent` import cycle), so `NOT_REPORTED` is read at call time.
 */
const noTokens = (): RunTokens => ({ input: NOT_REPORTED, output: NOT_REPORTED, cache_read: NOT_REPORTED, cache_write: NOT_REPORTED });

/** What {@link postRunFacts} needs. */
interface PostRunInput {
  readonly root: string;
  readonly adapterName: string;
  readonly manifest: AdapterManifest;
  /** The assigned session id, under `session.id: assign`. */
  readonly assigned: string | undefined;
  readonly values: LaunchValues;
  readonly timeoutMs: number;
  /** What the headless run's stdout carried under `session.id: output` (§2.6); `undefined` when it was not read. */
  readonly output: OutputSession | undefined;
  /** The headless run's stdout as one JSON document, for the `output` usage source (§2.6); `undefined` when not kept. */
  readonly outputDocument: OutputDocument | undefined;
  /** `agent_version`, read before the launch (§2.6): compared with the read after the run. */
  readonly agentVersion: string;
  /** The home directory `{home}` renders to (§2.3). */
  readonly homeDir: string;
}

/** The first non-blank line `version_args` printed, or the warning cause (§2.6: `printed nothing`, `failed (<reason>)`). */
async function readAgentVersion(outcome: Promise<LookupOutcome>): Promise<{ ok: true; version: string } | { ok: false; cause: string }> {
  const read = await outcome;
  const first = read.ok ? read.stdout.split('\n').map((line) => line.trim()).find((line) => line !== '') : undefined;
  if (first !== undefined) return { ok: true, version: first };
  return { ok: false, cause: read.ok ? 'printed nothing' : `failed (${read.reason})` };
}

/**
 * §2.6 "The agent CLI's version", the read before the launch (task-337, `dl-180` version (b), `bug-366`): `version_args`
 * run as a lookup runs, right before §3.3 step 13's banner, its first non-blank line `agent_version`. Absent
 * `version_args` is `not-reported` silently; a read that fails or prints nothing is `not-reported` and one warning.
 */
async function agentVersionBefore(root: string, adapterName: string, manifest: AdapterManifest, values: LaunchValues, timeoutMs: number): Promise<string> {
  if (manifest.version_args === undefined) return NOT_REPORTED;
  const read = await readAgentVersion(runLookup(commandToSpawn(root, manifest.command), renderArgv(manifest.version_args, values), root, timeoutMs));
  if (read.ok) return read.version;
  reportWarning(`adapter '${adapterName}': version_args ${read.cause} before the launch: agent_version recorded as not-reported`);
  return NOT_REPORTED;
}

/** The sources `usage.from` names, in order (§2.6): none for `none`. */
function usageSources(from: AdapterManifest['usage']['from']): readonly ('output' | 'lookup' | 'transcript')[] {
  if (from === 'none') return [];
  return Array.isArray(from) ? from : [from];
}

/**
 * §3.3 step 16: `agent_version_after`, the session id, the model and the tokens, from the adapter's
 * declarations (§2.2, §2.6). Every lookup runs after the agent exited; an argv declared for both the
 * session and the usage runs once. The usage sources are tried in `usage.from`'s order, the first that yields a value
 * supplying the model and the counts (task-337). A failure is `not-reported` and one warning; never a refusal.
 */
async function postRunFacts(input: PostRunInput): Promise<PostRunFacts> {
  const { manifest, adapterName } = input;
  const command = commandToSpawn(input.root, manifest.command);
  const warn = (text: string): void => reportWarning(`adapter '${adapterName}': ${text}`);
  const runs = new Map<string, Promise<LookupOutcome>>();
  const lookup = (argv: readonly string[]): Promise<LookupOutcome> => {
    const rendered = renderArgv(argv, input.values);
    const key = JSON.stringify(rendered);
    if (!runs.has(key)) runs.set(key, runLookup(command, rendered, input.root, input.timeoutMs));
    return runs.get(key)!;
  };

  // The read after the run (§2.6, task-337): never merged with the read before the launch.
  let agentVersionAfter: string = NOT_REPORTED;
  if (manifest.version_args !== undefined) {
    const read = await readAgentVersion(lookup(manifest.version_args));
    if (read.ok) agentVersionAfter = read.version;
    else warn(`version_args ${read.cause} after the run: agent_version_after recorded as not-reported`);
  }
  if (input.agentVersion !== NOT_REPORTED && agentVersionAfter !== NOT_REPORTED && input.agentVersion !== agentVersionAfter) {
    warn(`the agent CLI changed during the run: version_args printed '${input.agentVersion}' before the launch and '${agentVersionAfter}' after it`);
  }

  let session: string = input.assigned ?? NOT_REPORTED;
  if (input.output !== undefined) {
    if (input.output.ok) session = input.output.id;
    else warn(`${input.output.reason}: session recorded as not-reported`);
  }
  if (manifest.session.id === 'lookup' && manifest.session.lookup_args !== undefined && manifest.session.field !== undefined) {
    const parsed = parseLookup(await lookup(manifest.session.lookup_args));
    if (!parsed.ok) warn(`the session lookup failed (${parsed.reason}): session recorded as not-reported`);
    else {
      const value = readJsonPath(parsed.document, manifest.session.field);
      if (typeof value === 'string' && value !== '') session = value;
      else warn("the session lookup's session id is not a non-empty string: recorded as not-reported");
    }
  }

  // The usage (§2.6): the first source that yields a value supplies the model and the counts; nothing is mixed.
  const source = async (name: 'output' | 'lookup' | 'transcript'): Promise<SourceUsage | undefined> => {
    switch (name) {
      case 'lookup': {
        if (manifest.usage.lookup_args === undefined) return undefined;
        const parsed = parseLookup(await lookup(manifest.usage.lookup_args));
        if (!parsed.ok) {
          warn(`the usage lookup failed (${parsed.reason}): model and tokens recorded as not-reported`);
          return undefined;
        }
        return documentUsage(parsed.document, manifest.usage.fields ?? {}, "the usage lookup's");
      }
      case 'output': {
        // An interactive launch's stdout belongs to the agent: nothing, silently (`outputDocument` is not kept).
        if (input.outputDocument === undefined) return undefined;
        if (!input.outputDocument.ok) {
          warn(`${input.outputDocument.reason}: model and tokens not read from it`);
          return undefined;
        }
        return documentUsage(input.outputDocument.document, manifest.usage.fields ?? {}, "the headless output's");
      }
      case 'transcript':
        return transcriptSource(input, session, (text) => warn(`usage.transcript: ${text}`));
    }
  };
  let usage: Pick<SourceUsage, 'model' | 'tokens'> = { model: NOT_REPORTED, tokens: noTokens() };
  for (const name of usageSources(manifest.usage.from)) {
    const read = await source(name);
    if (read === undefined) continue;
    for (const warning of read.warnings) {
      if (name === 'transcript') warn(`usage.transcript: ${warning}`);
      else warn(warning);
    }
    if (yieldsUsage(read)) {
      usage = read;
      break;
    }
  }
  return { agent_version_after: agentVersionAfter, model: usage.model, session, tokens: usage.tokens };
}

/**
 * §2.6 `transcript` (task-337, `dl-188` part 1 (a)): the file at `usage.transcript.path`, rendered with the record's
 * session id, the home directory and the launch directory's slug (its symbolic links resolved), streamed line by line
 * under the lookup's limit. A session id that is not reported, a path that does not render as an absolute path, a file
 * absent, unreadable or not read in time yield nothing and one warning (through `warn`), which never names the path.
 */
async function transcriptSource(input: PostRunInput, session: string, warn: (text: string) => void): Promise<SourceUsage | undefined> {
  const declaration = input.manifest.usage.transcript;
  if (declaration === undefined) return undefined;
  if (session === NOT_REPORTED) {
    warn('the session id is not-reported: the transcript is not read');
    return undefined;
  }
  let launchDir = input.root;
  try {
    launchDir = realpathSync(input.root);
  } catch {
    // The root as given: a launch directory that cannot be resolved still names a folder, which may be absent.
  }
  const path = renderTranscriptPath(declaration.path, { home: input.homeDir, launchDir, sessionId: session });
  if (path === undefined) {
    warn('the path does not render as an absolute path: the transcript is not read');
    return undefined;
  }
  const accumulator = transcriptAccumulator(declaration);
  const read = await readTranscriptLines(path, input.timeoutMs, accumulator.add);
  if (!read.ok) {
    warn(`the transcript of session ${session} ${read.reason}`);
    return undefined;
  }
  return accumulator.result();
}

/** The host facts the launch reads, each overridable by an in-process caller (tests). */
export interface LaunchHost {
  /** What starts the agent; `child_process.spawn` by default. */
  readonly spawn?: SpawnAgent;
  /** {@link LOOKUP_TIMEOUT_MS} by default. */
  readonly lookupTimeoutMs?: number;
  /**
   * Arms a timer that calls `fire` after `delayMs` and returns the function that cancels it (`--timeout`,
   * §3.3 step 15); `setTimeout` / `clearTimeout` by default. A test injects a recorder, so no wall clock runs.
   */
  readonly timer?: (delayMs: number, fire: () => void) => () => void;
  /**
   * Sends `signal` to the process group `pgid` (§3.3 step 15, task-355, `bug-516`): how a headless agent on
   * POSIX, which leads a process group of its own, and the processes it started receive a forwarded signal,
   * the time bound's signals and the sweep's `SIGKILL`. `process.kill(-pgid, signal)` by default, an empty
   * group (`ESRCH`) ignored; any other error it throws is reported as a `warning:` line and changes nothing of
   * the run. A test injects a recorder, so no real process group is signalled.
   */
  readonly signalGroup?: (pgid: number, signal: NodeJS.Signals) => void;
  /**
   * The wall-clock instant of §3.3 step 13, in milliseconds since the epoch: the registry entry's `started_ms` (§7,
   * task-336), a record of what happened, never part of a context. `Date.now` by default; a test injects a fixed one.
   */
  readonly now?: () => number;
  /**
   * The home directory `usage.transcript.path`'s `{home}` renders to (§2.3, task-337): the operating system's
   * (`os.homedir()`) by default; a test injects a temporary one, so no test changes `HOME`.
   */
  readonly homeDir?: string;
}

/** {@link LaunchHost.signalGroup}'s default: the signal to every process of the group, none left being no error. */
function killGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

/** {@link LaunchHost.timer}'s default: a real timer. */
function realTimer(delayMs: number, fire: () => void): () => void {
  const handle = setTimeout(fire, delayMs);
  return () => clearTimeout(handle);
}

/** What the launch needs from the pre-launch pipeline (`PreparedLaunch`, `./execute.ts`). */
export interface LaunchInput {
  readonly runId: string;
  /** `<type>:<id>`. */
  readonly element: string;
  readonly workflow: string;
  readonly phase: string;
  readonly role: string;
  readonly mode: string;
  readonly agent: { readonly name: string };
  readonly adapter: { readonly name: string; readonly kind: string; readonly manifest: AdapterManifest };
  readonly stateRef: string;
  readonly logPath: string;
  /** Root-relative path of the element's document at `state_ref`. */
  readonly elementPath: string;
  /** Root-relative path of the element type's template file, when the type declares one. */
  readonly templatePath: string | undefined;
  readonly bootstrap: string;
  readonly mcpServer: { readonly command: string; readonly args: readonly string[] };
  readonly files: Partial<Record<'bootstrap_file' | 'mcp_config_file', string>>;
  /** The rendered `mcp.template` under `mcp.via: config-arg` (§2.3 `{mcp_config}`); `undefined` otherwise. */
  readonly mcpConfig?: string | undefined;
  /** The launch kind §3.2 step 7 resolved (task-335). */
  readonly kind: LaunchKindRun;
  /** `--timeout`'s bound: its length and the value as given (§3.1); absent, the run is unbounded. */
  readonly timeout?: TimeBound | undefined;
  /** Absolute path of the launching build's `wingfoil` shim in the run's temporary directory (§2.4), when written. */
  readonly cliShim?: string | undefined;
  /**
   * `--log <path>` as given (§3.1, task-336): a headless run's forwarded lines are appended to it, the path resolved
   * against the current directory when the file is opened (§3.3 step 13). An interactive launch never has one (§3.2
   * step 7 refuses it).
   */
  readonly log?: string | undefined;
}

/** A launched run, recorded: what `agent execute` reports (§3.4's `{ "run": <record> }`). */
export interface RecordedLaunch {
  readonly run: RunRecord;
  /** The `agent: record <run-id>` commit. */
  readonly sha: string;
}

/** §3.4's post-run summary line, without a prefix. */
export function runSummaryLine(record: RunRecord, sha: string): string {
  return `run ${record.id}: agent exited ${String(record.exit_status)} after ${(record.duration_ms / 1000).toFixed(1)} s (recorded in ${sha.slice(0, 7)})`;
}

/** The step-13 banner (§3.3), without a prefix. */
export function launchBanner(input: LaunchInput): string {
  return `run ${input.runId}: launching ${input.agent.name} (${input.adapter.kind}/${input.adapter.name}) as ${input.role} on ${input.element}`;
}

/**
 * Whether §3.3 step 16's start-up hint applies (`bug-500`, task-353): all four of — the run did not succeed (a
 * non-zero exit, a signal, or the expired bound), `HEAD` is still `state_ref` (the agent committed nothing), `notes`
 * would be `none`, and the adapter declares `launch.<kind>.trust: prompt` for the kind that ran. A function of the
 * exit status, two committed shas and the manifest: no wall clock. A `HEAD` git cannot read gives no hint, so the
 * record is never lost to it.
 */
function startUpHint(root: string, input: LaunchInput, run: { readonly expired: boolean; readonly exitStatus: ExitStatus; readonly notes: string }): boolean {
  const { launch } = input.adapter.manifest;
  const trust = input.kind === 'headless' ? launch.headless?.trust : launch.interactive.trust;
  if (trust !== 'prompt' || run.notes !== 'none' || (run.exitStatus === 0 && !run.expired)) return false;
  try {
    return resolveCommitAtRev(root, 'HEAD') === input.stateRef;
  } catch {
    return false;
  }
}

/** §3.3 step 16's start-up hint warning, without the `warning: ` prefix. */
function startUpHintWarning(record: RunRecord, input: LaunchInput): string {
  return (
    `run ${record.id}: the agent exited ${String(record.exit_status)} with no commit since state_ref: its CLI may have stopped at its ` +
    `folder-trust step (adapter '${input.adapter.name}' declares launch.${input.kind}.trust: prompt)`
  );
}

/**
 * A headless run's output wiring (§3.5, task-336): each line forwarded to the caller (`reportOutput`) and, with
 * `--log`, appended to the file in the console form; `stdout` the raw-chunk consumers (the session-id reader, the
 * usage's document reader). A log
 * that fails mid-run is reported once, as a `warning:` line, and no longer written: the run goes on.
 */
function forwardOutput(log: { readonly file: OpenLog; readonly given: string } | undefined, stdout: readonly ((chunk: Buffer) => void)[], drainMs: number): HeadlessOutput {
  let copying = log !== undefined;
  return {
    line(line, stream) {
      reportOutput(line, stream);
      if (!copying) return;
      try {
        log!.file.append(line);
      } catch (error) {
        copying = false;
        reportWarning(`cannot write the log ${log!.given}: ${error instanceof Error ? error.message : String(error)}; the rest of the output is not copied`);
      }
    },
    stdout,
    drainMs,
  };
}

/**
 * §3.3 steps 13–18 for a launch every pre-launch check has passed. `releaseSignals` is called right
 * before the spawn, after the launch has installed its own listeners: it hands the process's signals
 * over from the pre-launch cleanup (`withRunFiles`) to the launch (§3.3 step 15) with no gap between.
 *
 * @returns The recorded run (the agent exited `0`, the bound did not expire, and the record was
 *   committed); otherwise `IO` `agent command '<command>' could not be started …` (no run, no record), `IO`
 *   `agent timed out after <duration>; run <run-id> recorded` with `details: {run_id, exit_status, timeout}`,
 *   `IO` `agent exited <exit_status>; run <run-id> recorded` with `details: {run_id, exit_status}` — each
 *   with the summary as a detail line — or `recordRun`'s refusal, the record in its `details` (the run is
 *   never lost).
 */
export async function launchAgent(root: string, input: LaunchInput, host: LaunchHost, releaseSignals: () => void): Promise<CoreResult<RecordedLaunch>> {
  const { manifest } = input.adapter;
  // §2.6: the clone's salt, before the banner, so a salt refused launches and records nothing (task-338).
  let assigned: string | undefined;
  if (manifest.session.id === 'assign') {
    const salt = sessionSalt(root);
    if (!salt.ok) return coreErr(salt.error);
    assigned = assignedSessionId(salt.value, input.runId);
  }
  const values: LaunchValues = {
    bootstrap: input.bootstrap,
    files: input.files,
    mcpServer: input.mcpServer,
    mcpConfig: input.mcpConfig,
    sessionId: assigned ?? '',
  };
  const argv = renderLaunchArgv(manifest, values, input.kind, input.role);

  // Step 13 — the run's registry entry (§7, task-336, approver ruling D3 (a)): created exclusively, `agent execute`'s pid
  // until the spawn; a live entry for the run id refuses the launch (RUN_ACTIVE), before anything is printed.
  const entry: ActiveRunEntry = {
    id: input.runId,
    pid: process.pid,
    workflow: input.workflow,
    phase: input.phase,
    element: input.element,
    role: input.role,
    agent: input.agent.name,
    session: assigned ?? NOT_REPORTED,
    started_ms: (host.now ?? Date.now)(),
  };
  const registered = registerRun(root, entry);
  if (!registered.ok) return registered;
  // From here every exit path removes the entry and closes the log (§3.3 step 13). `spawned.pid` is the agent's, once
  // spawned: the second pid an entry of this launch may hold (§7 "This launch's entry").
  const spawned: { pid: number | undefined } = { pid: undefined };
  let log: OpenLog | undefined;
  try {
    // D8 (a): a project initialized before v0.4 has no `.wingfoil/.gitignore`; warned of, never refused.
    if (notIgnoredInRepository(root, activeRunPath(root, input.runId))) reportWarning(REGISTRY_NOT_IGNORED_WARNING);
    // Step 13 — the `--log` file (§3.5): a headless run's only, §3.2 step 7 having refused it on an interactive one.
    if (input.log !== undefined && input.kind === 'headless') {
      const opened = openLog(input.log);
      if (!opened.ok) return coreErr({ code: 'IO', message: `cannot write the log ${input.log}: ${opened.cause}` });
      log = opened.log;
      if (notIgnoredInRepository(root, input.log)) reportWarning(logNotIgnoredWarning(input.log));
    }
    return await launchRun(root, input, host, releaseSignals, { assigned, values, argv, log, entry, spawned });
  } finally {
    // The entry first, only while it is still this launch's (§7), then the log: a close that throws can neither
    // leave the entry behind nor replace the run's result (review F2, F3).
    removeRun(root, entry, spawned.pid);
    try {
      log?.close();
    } catch (error) {
      reportWarning(`cannot close the log ${input.log ?? ''}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * {@link launchAgent} once the run is registered and its log open (§3.3 steps 13–18): the banner, the spawn, the wait,
 * the post-run lookups, the record and the outcome. A headless run's output is forwarded line by line to the caller
 * (`reportOutput`) and, with `--log`, appended to `log` (§3.5).
 */
async function launchRun(
  root: string,
  input: LaunchInput,
  host: LaunchHost,
  releaseSignals: () => void,
  launch: { readonly assigned: string | undefined; readonly values: LaunchValues; readonly argv: string[]; readonly log: OpenLog | undefined; readonly entry: ActiveRunEntry; readonly spawned: { pid: number | undefined } },
): Promise<CoreResult<RecordedLaunch>> {
  const { manifest } = input.adapter;
  const { assigned, values, argv, log, entry, spawned } = launch;
  const lookupTimeoutMs = host.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS;
  // §2.6 — the agent CLI's version, read before the launch, right before the banner (task-337, `bug-366`).
  const agentVersion = await agentVersionBefore(root, input.adapter.name, manifest, values, lookupTimeoutMs);
  // Step 13 — the banner; step 14 — the spawn; step 15 — the wait, with the signals taken over.
  reportNotice(launchBanner(input));
  // The launch's listeners go in before the pre-launch cleanup's come out: no signal finds neither.
  const signals = takeOverSignals(input.kind, host.signalGroup ?? killGroup);
  releaseSignals();
  // The time bound (step 15): from the spawn, SIGTERM at expiry, SIGKILL after the grace; both stop at the exit.
  const timer = host.timer ?? realTimer;
  const { timeout } = input;
  let expired = false;
  const cancels: (() => void)[] = [];
  const armBound = (): void => {
    if (timeout === undefined) return;
    cancels.push(
      timer(timeout.ms, () => {
        expired = true;
        signals.send('SIGTERM');
        cancels.push(timer(TIMEOUT_GRACE_MS, () => signals.send('SIGKILL')));
      }),
    );
  };
  const stopBound = (): void => {
    for (const cancel of cancels.splice(0)) cancel();
  };
  // §2.6 `session.id: output`: a headless run's stdout carries the session id (task-356); an interactive one's
  // belongs to the agent, and its session is `not-reported` silently.
  const headlessOutput = input.kind === 'headless' ? manifest.launch.headless?.output : undefined;
  const reader =
    manifest.session.id === 'output' && manifest.session.field !== undefined && (headlessOutput === 'json' || headlessOutput === 'jsonl')
      ? sessionOutputReader(headlessOutput, manifest.session.field)
      : undefined;
  // §2.6 `output`: a headless `output: json` run's stdout, kept whole for the usage when `usage.from` names it (task-337).
  const document = headlessOutput === 'json' && usageSources(manifest.usage.from).includes('output') ? jsonDocumentReader() : undefined;
  const stdoutReaders = [reader?.write, document?.write].filter((write): write is (chunk: Buffer) => void => write !== undefined);
  try {
    const ran = await runAgent(
      host.spawn ?? spawn,
      commandToSpawn(root, manifest.command),
      argv,
      // The agent only: the lookups, the pre-flight and the probe keep `agent execute`'s own environment (§2.4).
      spawnOptions(input.kind, root, agentEnvironment(process.env, input.cliShim, input.agent.name)),
      (child) => {
        // Step 14 — the registry entry names the agent from now on (§7); a child with no pid keeps `agent execute`'s.
        if (typeof child.pid === 'number') {
          spawned.pid = child.pid;
          rewriteRunPid(root, { ...entry, pid: child.pid }, child.pid);
        }
        signals.attach(child);
        armBound();
      },
      () => {
        stopBound();
        // Step 14 — at the agent's exit the entry names `agent execute` again, live through steps 16–17 (§7, review F2).
        if (spawned.pid !== undefined) rewriteRunPid(root, entry, spawned.pid);
      },
      input.kind === 'headless' ? forwardOutput(log === undefined ? undefined : { file: log, given: input.log ?? '' }, stdoutReaders, lookupTimeoutMs) : undefined,
    );
    if (!ran.ok) {
      return coreErr({ code: 'IO', message: `agent command '${manifest.command}' could not be started (adapter '${input.adapter.name}'): ${ran.reason}` });
    }

    // Step 16 — the post-run lookups.
    const facts = await postRunFacts({
      root,
      adapterName: input.adapter.name,
      manifest,
      assigned,
      values,
      timeoutMs: lookupTimeoutMs,
      output: reader?.end(),
      outputDocument: document?.end(),
      agentVersion,
      homeDir: host.homeDir ?? homedir(),
    });
    const elementId = input.element.slice(input.element.indexOf(':') + 1);
    const notes =
      input.templatePath === undefined
        ? 'none'
        : deriveNotesField(root, { elementId, elementPath: input.elementPath, templatePath: input.templatePath, stateRef: input.stateRef });
    // Step 16 — the start-up hint (bug-500): a failed run that committed nothing, under `trust: prompt`.
    const hint = startUpHint(root, input, { expired, exitStatus: ran.exitStatus, notes });
    const record: RunRecord = {
      id: input.runId,
      element: input.element,
      workflow: input.workflow,
      phase: input.phase,
      role: input.role,
      mode: input.mode,
      agent: input.agent.name,
      adapter: `${input.adapter.kind}/${input.adapter.name}`,
      agent_version: agentVersion,
      model: facts.model,
      session: facts.session,
      tokens: facts.tokens,
      wingfoil: readBuildStamp(),
      state_ref: input.stateRef,
      duration_ms: ran.durationMs,
      exit_status: ran.exitStatus,
      result: 'n/a',
      notes: hint ? START_UP_HINT_NOTES : notes,
      agent_version_after: facts.agent_version_after,
    };

    // Step 17 — append and commit.
    const recorded = recordRun(root, input.logPath, record);
    if (!recorded.ok) return recorded;
    if (hint) reportWarning(startUpHintWarning(record, input));

    // Step 18 — the outcome: an expired bound first, whatever the exit status (§3.7 `TIMED_OUT`).
    if (expired && timeout !== undefined) {
      return coreErr({
        code: 'IO',
        message: `agent timed out after ${timeout.label}; run ${record.id} recorded`,
        details: { run_id: record.id, exit_status: record.exit_status, timeout: timeout.label, issues: [{ detail: runSummaryLine(record, recorded.value.sha) }] },
      });
    }
    if (record.exit_status !== 0) {
      return coreErr({
        code: 'IO',
        message: `agent exited ${String(record.exit_status)}; run ${record.id} recorded`,
        details: { run_id: record.id, exit_status: record.exit_status, issues: [{ detail: runSummaryLine(record, recorded.value.sha) }] },
      });
    }
    // A work run's stdout carries the record (§3.5), so its summary line is a notice on stderr.
    if (input.kind === 'headless') reportNotice(runSummaryLine(record, recorded.value.sha));
    return coreOk({ run: record, sha: recorded.value.sha });
  } finally {
    stopBound();
    // What is left of a signalled headless agent's process group does not outlive the run (bug-516).
    signals.sweep();
    signals.restore();
  }
}
