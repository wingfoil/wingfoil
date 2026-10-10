/**
 * `wingfoil agent execute`, the launch half (`spec-016-agent-execution` §3.3 steps 13–18, task-228):
 * what follows the pre-launch pipeline (`./execute.ts`) once every check has passed.
 *
 * 13. The banner, `run <run-id>: launching <agent> (<adapter>) as <role> on <type>:<id>`, as a notice
 *     on stderr (`reportNotice`): the CLI renders it in the active `--format`.
 * 14. The spawn: the adapter's `command` with `launch.interactive.args` (+ `session.assign_args` under
 *     `session.id: assign`), every placeholder filling whole argv elements ({@link renderLaunchArgv}),
 *     no shell, the agent inheriting stdin, stdout and stderr, its working directory the project root,
 *     the environment passed through unchanged (`adr-012` point 1). This is REQ-PERF-01's "agent ready".
 * 15. The wait. From the spawn until the record is committed `SIGINT` and `SIGQUIT` are ignored (the
 *     terminal delivers them to the agent itself, in the same foreground process group) and `SIGTERM`
 *     and `SIGHUP` are forwarded to the agent while it runs, so a run ended by a signal is still recorded
 *     as `signal:<NAME>`.
 * 16. The post-run lookups (§2.6): `version_args`, `session.lookup_args`, `usage.lookup_args`, each run as
 *     `command` + argv with a time limit ({@link LOOKUP_TIMEOUT_MS}); one argv declared twice runs once.
 *     A lookup that fails, times out or prints no JSON, and a value of the wrong type, yield
 *     `not-reported` and a `warning:` line; the lookup never fails the run.
 * 17. The record (§4.2), appended and committed by `recordRun` (task-206): `agent: record <run-id>`.
 * 18. The outcome: success only when the agent exited `0` and the record was committed.
 *
 * **Determinism.** The argv, the session id and every record field but `duration_ms` are pure functions
 * of committed state and the run's inputs; the temporary-file paths and the Node executable are host
 * values that never reach the context (`spec-016` Consequences). `duration_ms` is wall-clock by design:
 * a record of what happened, never part of a context (`dl-114` Q2).
 */
import { execFile, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { readBuildStamp } from '../storage';
import { reportNotice, reportWarning } from '../validation/warning';
import { coreErr, coreOk, type CoreResult } from '../core/types';

import type { AdapterManifest } from './schema';
import { deriveNotesField, NOT_REPORTED, recordRun, type ReportedCount, type RunRecord, type RunTokens } from './run-log';

/** How much one post-run lookup may print on stdout before it is stopped (§2.6). */
const LOOKUP_MAX_BYTES = 1024 * 1024;

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
  /** The assigned session id; read only under `session.id: assign`. */
  readonly sessionId: string;
}

/** One argv template rendered: each `{name}` element replaced by its value, `{mcp_args}` by several. */
function renderArgv(template: readonly string[], values: LaunchValues): string[] {
  const single: Record<string, string | undefined> = {
    '{bootstrap}': values.bootstrap,
    '{bootstrap_file}': values.files.bootstrap_file,
    '{mcp_config_file}': values.files.mcp_config_file,
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

/**
 * The launch argv (§3.3 step 14): `launch.interactive.args` rendered, then `session.assign_args`
 * rendered when the session id is assigned. The `command` is not part of it.
 */
export function renderLaunchArgv(manifest: AdapterManifest, values: LaunchValues): string[] {
  const assign = manifest.session.id === 'assign' ? (manifest.session.assign_args ?? []) : [];
  return [...renderArgv(manifest.launch.interactive.args, values), ...renderArgv(assign, values)];
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

/** The signals `agent execute` takes over while the agent runs (§3.3 step 15). */
const IGNORED_SIGNALS: readonly NodeJS.Signals[] = process.platform === 'win32' ? ['SIGINT'] : ['SIGINT', 'SIGQUIT'];
const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = process.platform === 'win32' ? ['SIGTERM'] : ['SIGTERM', 'SIGHUP'];

/** §3.3 step 15's signal handling, installed before the spawn and attached to the agent once it exists. */
interface SignalTakeover {
  /** Hand the agent over: a forwarded signal that arrived before it existed is sent to it now. */
  attach(child: ChildProcess): void;
  /** Remove every listener installed. */
  restore(): void;
}

/**
 * Install §3.3 step 15's signal handling **before the spawn** (review fix 1: a signal between the
 * pre-launch cleanup's release and the spawn must neither kill `agent execute` nor orphan the agent):
 * `SIGINT`/`SIGQUIT` ignored, `SIGTERM`/`SIGHUP` forwarded to the agent while it runs. One that arrives
 * before the agent exists is remembered and sent as soon as it is attached; once the agent has exited
 * they are ignored, until the record is committed.
 */
function takeOverSignals(): SignalTakeover {
  let child: ChildProcess | undefined;
  let pending: NodeJS.Signals | undefined;
  const forward = (signal: NodeJS.Signals): void => {
    if (child === undefined) pending = signal;
    else if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  };
  const installed: [NodeJS.Signals, () => void][] = [
    ...IGNORED_SIGNALS.map((signal): [NodeJS.Signals, () => void] => [signal, () => undefined]),
    ...FORWARDED_SIGNALS.map((signal): [NodeJS.Signals, () => void] => [signal, () => forward(signal)]),
  ];
  for (const [signal, listener] of installed) process.on(signal, listener);
  return {
    attach(spawned) {
      child = spawned;
      if (pending !== undefined) forward(pending);
    },
    restore() {
      for (const [signal, listener] of installed) process.removeListener(signal, listener);
    },
  };
}

/** Spawn the agent and wait for it: its exit status and the wall-clock duration, or why it could not start. */
function runAgent(
  spawnAgent: SpawnAgent,
  command: string,
  args: readonly string[],
  root: string,
  onSpawn: (child: ChildProcess) => void,
): Promise<{ ok: true; exitStatus: ExitStatus; durationMs: number } | { ok: false; reason: string }> {
  return new Promise((settle) => {
    let child: ChildProcess;
    const start = performance.now();
    try {
      child = spawnAgent(command, args, { cwd: root, stdio: 'inherit', env: process.env });
    } catch (error) {
      settle({ ok: false, reason: error instanceof Error ? error.message : String(error) });
      return;
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
      const durationMs = Math.max(0, Math.round(performance.now() - start));
      settle({ ok: true, exitStatus: signal !== null ? `signal:${signal}` : (code ?? 0), durationMs });
    });
  });
}

/** One lookup's outcome: its stdout, or why it failed (one line, for a warning). */
type LookupOutcome = { ok: true; stdout: string } | { ok: false; reason: string };

/** Run `command` + `args` with the time limit, no shell, in the root; stdout captured. */
function runLookup(command: string, args: readonly string[], root: string, timeoutMs: number): Promise<LookupOutcome> {
  return new Promise((settle) => {
    execFile(command, [...args], { cwd: root, env: process.env, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: LOOKUP_MAX_BYTES, encoding: 'utf-8' }, (error, stdout) => {
      if (error === null) return settle({ ok: true, stdout });
      const failed = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string; signal?: string | null };
      if (failed.killed === true) return settle({ ok: false, reason: `timed out after ${timeoutMs} ms` });
      if (failed.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return settle({ ok: false, reason: `printed more than ${LOOKUP_MAX_BYTES / 1024 / 1024} MiB` });
      if (typeof failed.code === 'number') return settle({ ok: false, reason: `exited ${failed.code}` });
      if (failed.signal) return settle({ ok: false, reason: `ended by ${failed.signal}` });
      return settle({ ok: false, reason: failed.code !== undefined ? `could not start: ${failed.code}` : failed.message });
    });
  });
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
 * @returns The recorded run (the agent exited `0` and the record was committed); otherwise `IO`
 *   `agent command '<command>' could not be started …` (no run, no record), `IO` `agent exited
 *   <exit_status>; run <run-id> recorded` with `details: {run_id, exit_status}` and the summary as a
 *   detail line, or `recordRun`'s refusal, the record in its `details` (the run is never lost).
 */
export async function launchAgent(root: string, input: LaunchInput, host: LaunchHost, releaseSignals: () => void): Promise<CoreResult<RecordedLaunch>> {
  const { manifest } = input.adapter;
  const assigned = manifest.session.id === 'assign' ? assignedSessionId(root, input.runId) : undefined;
  const values: LaunchValues = { bootstrap: input.bootstrap, files: input.files, mcpServer: input.mcpServer, sessionId: assigned ?? '' };
  const argv = renderLaunchArgv(manifest, values);

  // Step 13 — the banner; step 14 — the spawn; step 15 — the wait, with the signals taken over.
  reportNotice(launchBanner(input));
  // The launch's listeners go in before the pre-launch cleanup's come out: no signal finds neither.
  const signals = takeOverSignals();
  releaseSignals();
  try {
    const ran = await runAgent(host.spawn ?? spawn, commandToSpawn(root, manifest.command), argv, root, (child) => signals.attach(child));
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
      timeoutMs: host.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS,
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

    // Step 18 — the outcome.
    if (record.exit_status !== 0) {
      return coreErr({
        code: 'IO',
        message: `agent exited ${String(record.exit_status)}; run ${record.id} recorded`,
        details: { run_id: record.id, exit_status: record.exit_status, issues: [{ detail: runSummaryLine(record, recorded.value.sha) }] },
      });
    }
    return coreOk({ run: record, sha: recorded.value.sha });
  } finally {
    signals.restore();
  }
}
