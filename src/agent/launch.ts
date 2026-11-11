/**
 * `wingfoil agent execute`, the launch half (`spec-016-agent-execution` §3.3 steps 13–18, task-228):
 * what follows the pre-launch pipeline (`./execute.ts`) once every check has passed.
 *
 * 13. The banner, `run <run-id>: launching <agent> (<adapter>) as <role> on <type>:<id>`, as a notice
 *     on stderr (`reportNotice`): the CLI renders it in the active `--format`.
 * 14. The spawn: the adapter's `command` with `launch.<kind>.args` (+ `session.assign_args` under
 *     `session.id: assign`), every placeholder filling whole argv elements ({@link renderLaunchArgv}),
 *     no shell, its working directory the project root, the environment passed through unchanged
 *     (`adr-012` point 1). An interactive agent inherits stdin, stdout and stderr; a headless one (the
 *     work run, §3.5, task-335) reads the null device, its stdout is piped and drained (and read for the
 *     session id under `session.id: output`, step 16), its stderr is
 *     `agent execute`'s, and on POSIX it runs in a session and process group of its own (approver ruling
 *     D6 (a)). This is REQ-PERF-01's "agent ready".
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
 * 16. The session id a headless run's stdout carried, under `session.id: output` (§2.6, task-356: one JSON
 *     document under `launch.headless.output: json`, the first line carrying it under `jsonl`; none found is
 *     `not-reported` and a `warning:` line). The post-run lookups (§2.6): `version_args`, `session.lookup_args`,
 *     `usage.lookup_args`, each run as
 *     `command` + argv with a time limit ({@link LOOKUP_TIMEOUT_MS}); one argv declared twice runs once.
 *     A lookup that fails, times out or prints no JSON, and a value of the wrong type, yield
 *     `not-reported` and a `warning:` line; the lookup never fails the run.
 * 17. The record (§4.2), appended and committed by `recordRun` (task-206): `agent: record <run-id>`.
 * 18. The outcome: success only when the agent exited `0`, the bound did not expire and the record was
 *     committed. An expired bound is `agent timed out after <duration>; run <run-id> recorded`, whatever
 *     the exit status. A headless success also prints the summary line as a notice (§3.5).
 *
 * **Determinism.** The argv, the session id and every record field but `duration_ms` are pure functions
 * of committed state and the run's inputs; the temporary-file paths and the Node executable are host
 * values that never reach the context (`spec-016` Consequences). `duration_ms` is wall-clock by design:
 * a record of what happened, never part of a context (`dl-114` Q2).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { readBuildStamp } from '../storage';
import { reportNotice, reportWarning } from '../validation/warning';
import { coreErr, coreOk, type CoreResult } from '../core/types';

import type { TimeBound } from './duration';
import type { AdapterManifest } from './schema';
import { deriveNotesField, NOT_REPORTED, recordRun, type ReportedCount, type RunRecord, type RunTokens } from './run-log';

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
 * The session id WingFoil assigns (§2.6 `assign`): the v5 UUID of `<absolute repository root>\n<run id>`
 * in {@link SESSION_ID_NAMESPACE}. Unique per clone and run, derived, never random. Per clone by design
 * (it hashes the root): the run id is the identifier across clones (`dl-135` Q3 (a)).
 */
export function assignedSessionId(root: string, runId: string): string {
  return uuidV5(SESSION_ID_NAMESPACE, `${root}\n${runId}`);
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
 * The launch argv (§3.3 step 14): `launch.<kind>.args` rendered, then `session.assign_args` rendered when
 * the session id is assigned. The `command` is not part of it. A headless launch of an adapter without
 * `launch.headless` is refused before (§3.3 step 4, `NO_LAUNCH_KIND`), so its argv is never rendered here.
 */
export function renderLaunchArgv(manifest: AdapterManifest, values: LaunchValues, kind: LaunchKindRun = 'interactive'): string[] {
  const assign = manifest.session.id === 'assign' ? (manifest.session.assign_args ?? []) : [];
  const args = kind === 'headless' ? (manifest.launch.headless?.args ?? []) : manifest.launch.interactive.args;
  return [...renderArgv(args, values), ...renderArgv(assign, values)];
}

/**
 * The value at the dotted `path` of a JSON value (§2.2 `session.field`, `usage.fields`): each segment a
 * key of a plain object; `undefined` when a segment is absent or the value on the way is not an object.
 */
export function readJsonPath(document: unknown, path: string): unknown {
  let value: unknown = document;
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

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
 * The spawn options of each launch kind (§3.3 step 14). Headless: stdin the null device, stdout piped (and
 * drained by {@link runAgent}, which hands it to the session-id reader under `session.id: output`), stderr inherited, and on POSIX a session and process group of its own, so the
 * agent has no controlling terminal to open and gets each signal once (approver ruling D6 (a)).
 */
function spawnOptions(kind: LaunchKindRun, root: string): SpawnOptions {
  if (kind === 'interactive') return { cwd: root, stdio: 'inherit', env: process.env };
  return { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: process.env, detached: !WINDOWS };
}

/**
 * Where a headless run's stdout goes besides being drained (§2.6 `session.id: output`, task-356): each chunk, in
 * order, and how long to wait after the agent exits for the rest of it, unless `satisfied` says nothing more is
 * needed.
 */
interface StdoutSink {
  readonly write: (chunk: Buffer) => void;
  readonly satisfied: () => boolean;
  readonly drainMs: number;
}

/**
 * Spawn the agent and wait for it: its exit status and the wall-clock duration, or why it could not start. With
 * `stdout`, a headless agent's stdout is handed to it chunk by chunk, and the wait goes on after the exit until the
 * stream ends, `stdout.satisfied()` holds, or `stdout.drainMs` passes (a process the agent left behind may hold the
 * pipe open); the duration is still measured to the exit.
 */
function runAgent(
  spawnAgent: SpawnAgent,
  command: string,
  args: readonly string[],
  options: SpawnOptions,
  onSpawn: (child: ChildProcess) => void,
  onExit: () => void,
  stdout?: StdoutSink,
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
    // A headless agent's stdout is captured and not echoed (§3.5): read to its end, written nowhere, so a
    // full pipe never blocks the agent. Only the session id is read from it, under `session.id: output` (§2.6).
    const piped = child.stdout ?? null;
    let ended: Promise<void> = Promise.resolve();
    if (piped !== null && stdout !== undefined) {
      ended = new Promise((resolve) => {
        for (const event of ['end', 'close', 'error'] as const) piped.once(event, () => resolve());
      });
      piped.on('data', (chunk: Buffer | string) => stdout.write(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    } else {
      piped?.resume();
    }
    onSpawn(child);
    let spawned = false;
    child.once('spawn', () => {
      spawned = true;
    });
    child.once('error', (error) => {
      if (!spawned) settle({ ok: false, reason: error.message });
    });
    child.once('exit', (code, signal) => {
      onExit();
      const durationMs = Math.max(0, Math.round(performance.now() - start));
      const result = { ok: true as const, exitStatus: signal !== null ? `signal:${signal}` : (code ?? 0), durationMs };
      if (stdout === undefined || stdout.satisfied()) return settle(result);
      let handle: NodeJS.Timeout | undefined;
      const bound = new Promise<void>((resolve) => {
        handle = setTimeout(resolve, stdout.drainMs);
      });
      void Promise.race([ended, bound]).then(() => {
        clearTimeout(handle);
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

/** A reader of a headless run's stdout for the session id: fed chunk by chunk, asked once the stream is over. */
interface SessionOutputReader {
  readonly write: (chunk: Buffer) => void;
  /** Whether the id is known already, so the rest of the stream is not needed (`jsonl` only). */
  readonly found: () => boolean;
  readonly end: () => OutputSession;
}

/** The non-empty string at `field` of the JSON `text`, else `undefined` (not JSON, no such value, another type). */
function sessionIdIn(text: string, field: string): string | undefined {
  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  const value = readJsonPath(document, field);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

const NO_SESSION_ID = 'the headless output carries no session id';

/**
 * §2.6 `session.id: output` (task-356, `bug-375`): under `jsonl` each line is one JSON value, read in order, and the
 * first non-empty string at `field` is the id (a line that is not JSON, has no such value or is over
 * {@link OUTPUT_MAX_BYTES} is passed over); under `json` the whole stdout, at most {@link OUTPUT_MAX_BYTES}, is one
 * document and the id is at `field`. A pure function of the bytes written, in their order.
 */
function sessionOutputReader(output: 'json' | 'jsonl', field: string): SessionOutputReader {
  if (output === 'json') {
    const chunks: Buffer[] = [];
    let size = 0;
    return {
      write: (chunk) => {
        size += chunk.length;
        if (size <= OUTPUT_MAX_BYTES) chunks.push(chunk);
        else chunks.length = 0;
      },
      found: () => false,
      end: () => {
        if (size > OUTPUT_MAX_BYTES) return { ok: false, reason: `the headless output is over ${OUTPUT_MAX_BYTES / 1024 / 1024} MiB` };
        const text = Buffer.concat(chunks).toString('utf-8');
        try {
          JSON.parse(text);
        } catch {
          return { ok: false, reason: 'the headless output is not one JSON document' };
        }
        const id = sessionIdIn(text, field);
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
    found: () => id !== undefined,
    end: () => {
      if (id === undefined) close();
      return id === undefined ? { ok: false, reason: NO_SESSION_ID } : { ok: true, id };
    },
  };
}

/** The facts §3.3 step 16 reads after the agent exited. */
interface PostRunFacts {
  readonly agent_version: string;
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
}

/**
 * §3.3 step 16: `agent_version`, the session id, the model and the tokens, from the adapter's
 * declarations (§2.2, §2.6). Every lookup runs after the agent exited; an argv declared for both the
 * session and the usage runs once. A failure is `not-reported` and one warning; never a refusal.
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

  let agentVersion: string = NOT_REPORTED;
  if (manifest.version_args !== undefined) {
    const outcome = await lookup(manifest.version_args);
    const first = outcome.ok ? outcome.stdout.split('\n').map((line) => line.trim()).find((line) => line !== '') : undefined;
    if (first !== undefined) agentVersion = first;
    else warn(`version_args ${outcome.ok ? 'printed nothing' : `failed (${outcome.reason})`}: agent_version recorded as not-reported`);
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

  let model: string = NOT_REPORTED;
  let tokens: RunTokens = noTokens();
  if (manifest.usage.from === 'lookup' && manifest.usage.lookup_args !== undefined) {
    const parsed = parseLookup(await lookup(manifest.usage.lookup_args));
    if (!parsed.ok) warn(`the usage lookup failed (${parsed.reason}): model and tokens recorded as not-reported`);
    else {
      const fields = manifest.usage.fields ?? {};
      if (fields.model !== undefined) {
        const value = readJsonPath(parsed.document, fields.model);
        if (typeof value === 'string' && value !== '') model = value;
        else if (value !== undefined) warn("the usage lookup's model is not a non-empty string: recorded as not-reported");
      }
      const count = (key: keyof RunTokens): ReportedCount => {
        const path = fields[key];
        if (path === undefined) return NOT_REPORTED;
        const value = readJsonPath(parsed.document, path);
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
        if (value !== undefined) warn(`the usage lookup's ${key} is not a non-negative integer: recorded as not-reported`);
        return NOT_REPORTED;
      };
      tokens = { input: count('input'), output: count('output'), cache_read: count('cache_read'), cache_write: count('cache_write') };
    }
  }
  return { agent_version: agentVersion, model, session, tokens };
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
  const assigned = manifest.session.id === 'assign' ? assignedSessionId(root, input.runId) : undefined;
  const values: LaunchValues = {
    bootstrap: input.bootstrap,
    files: input.files,
    mcpServer: input.mcpServer,
    mcpConfig: input.mcpConfig,
    sessionId: assigned ?? '',
  };
  const argv = renderLaunchArgv(manifest, values, input.kind);

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
  const lookupTimeoutMs = host.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS;
  try {
    const ran = await runAgent(
      host.spawn ?? spawn,
      commandToSpawn(root, manifest.command),
      argv,
      spawnOptions(input.kind, root),
      (child) => {
        signals.attach(child);
        armBound();
      },
      stopBound,
      reader === undefined ? undefined : { write: reader.write, satisfied: reader.found, drainMs: lookupTimeoutMs },
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
    });
    const elementId = input.element.slice(input.element.indexOf(':') + 1);
    const record: RunRecord = {
      id: input.runId,
      element: input.element,
      workflow: input.workflow,
      phase: input.phase,
      role: input.role,
      mode: input.mode,
      agent: input.agent.name,
      adapter: `${input.adapter.kind}/${input.adapter.name}`,
      agent_version: facts.agent_version,
      model: facts.model,
      session: facts.session,
      tokens: facts.tokens,
      wingfoil: readBuildStamp(),
      state_ref: input.stateRef,
      duration_ms: ran.durationMs,
      exit_status: ran.exitStatus,
      result: 'n/a',
      notes:
        input.templatePath === undefined
          ? 'none'
          : deriveNotesField(root, { elementId, elementPath: input.elementPath, templatePath: input.templatePath, stateRef: input.stateRef }),
    };

    // Step 17 — append and commit.
    const recorded = recordRun(root, input.logPath, record);
    if (!recorded.ok) return recorded;

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
