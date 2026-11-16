/**
 * The active registry (`spec-016` §7, §3.3 steps 13, 14 and 17, §5; `dl-181`, `dl-135` Q1 (a); task-336): one file per
 * running launch, `.wingfoil/run/<element-id>/<phase>/<n>.json` under the project root — the working tree's, so each
 * linked worktree has its own — its path the run id's three segments (§4.3).
 *
 * - **The entry** ({@link ActiveRunEntry}): one JSON object and a newline, its keys in §7's order; nothing of the
 *   agent's output, no environment value, argv or path outside the root (`REQ-SEC-08`).
 * - **Created exclusively** at step 13 ({@link registerRun}): an entry already there whose process is alive refuses
 *   the launch (`RUN_ACTIVE`, approver ruling D3 (a)); one whose process is gone, or a file that is no entry, is pruned
 *   and the entry created. **Rewritten** at step 14 with the agent's pid, and at the agent's exit with `agent execute`'s
 *   own again ({@link rewriteRunPid}: a new file renamed over it). **Removed** after step 17, on every exit path once
 *   created ({@link removeRun}). A rewrite or a removal acts only while the file still holds this launch's entry (§7:
 *   the same `id` and `started_ms`, a `pid` that is `agent execute`'s or its agent's).
 * - **Read with pruning** ({@link readActiveRuns}): an entry is live while a process with its `pid` exists
 *   (`kill(pid, 0)` succeeds or fails with `EPERM`); a dead one is removed silently, a file that is not one JSON object
 *   of §7's keys and types (an `id` of three segments naming its own path, `started_ms` a valid date) with one `warning:`
 *   line (D10 (a)); a removal that fails is one `could not remove` line, never a failed read; a directory a removal left
 *   empty is removed, up to
 *   `.wingfoil/run/` exclusive; the live entries are listed in §5's active order, never directory order.
 *
 * It is a process cache git never holds (`.wingfoil/.gitignore`'s `/run/`, `spec-011` § `.gitignore` policy), so it is
 * read from the working tree, never at `HEAD` (`spec-016` §5.1; the `command-baseline` directive's filesystem-effect
 * rule), and writing it changes nothing git tracks (§8).
 */
import { mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync, type Dirent } from 'node:fs';
import { dirname, join, sep } from 'node:path';

import { coreErr, coreOk, type CoreResult } from '../core/types';
import { reportWarning } from '../validation/warning';

/** The registry's directory, relative to the project root (§7). */
export const ACTIVE_RUNS_DIR = '.wingfoil/run';

/** §7's entry: its keys in this order. */
export interface ActiveRunEntry {
  /** The run id, `<element-id>/<phase>/<n>` (§4.3). */
  readonly id: string;
  /** `agent execute`'s own pid from step 13 until the agent is spawned, then the agent's (step 14). */
  readonly pid: number;
  readonly workflow: string;
  readonly phase: string;
  /** `<type>:<id>`. */
  readonly element: string;
  readonly role: string;
  readonly agent: string;
  /** The assigned session id under `session.id: assign`, else `not-reported` (D12). */
  readonly session: string;
  /** The wall-clock instant of step 13, milliseconds since the epoch: a record of what happened, never part of a context. */
  readonly started_ms: number;
}

/** The largest `started_ms` (§7): the latest instant an ECMAScript `Date` holds, so every entry renders. */
const MAX_STARTED_MS = 8640000000000000;

/** A run id's `<n>` (§4.3, §7): a positive decimal integer without a leading zero. */
const RUN_NUMBER = /^[1-9][0-9]*$/;

/** §7's keys, in order. */
const ENTRY_KEYS = ['id', 'pid', 'workflow', 'phase', 'element', 'role', 'agent', 'session', 'started_ms'] as const;

/** §7's line for a file pruned as no entry, without the `warning: ` prefix. */
export function notAnEntryWarning(relativePath: string): string {
  return `${ACTIVE_RUNS_DIR}/${relativePath}: not an active run entry: removed`;
}

/** §7's line for a file a reader could not remove, without the `warning: ` prefix (review F5). */
export function couldNotRemoveWarning(relativePath: string, cause: string): string {
  return `${ACTIVE_RUNS_DIR}/${relativePath}: could not remove: ${cause}`;
}

/** §3.3 step 13's warning when the entry is not git-ignored, without the `warning: ` prefix (D8 (a)). */
export const REGISTRY_NOT_IGNORED_WARNING = '.wingfoil/run/ is not git-ignored: add "/run/" to .wingfoil/.gitignore, or a running launch can be committed';

/** The absolute path of run `runId`'s entry under `root`. */
export function activeRunPath(root: string, runId: string): string {
  return join(root, ACTIVE_RUNS_DIR, ...`${runId}.json`.split('/'));
}

/** The entry's bytes: one JSON object, keys in §7's order, and a newline. */
function serialize(entry: ActiveRunEntry): string {
  const ordered: Record<string, unknown> = {};
  for (const key of ENTRY_KEYS) ordered[key] = entry[key];
  return `${JSON.stringify(ordered)}\n`;
}

/** Whether a process with `pid` exists: `kill(pid, 0)` succeeds, or fails only for want of permission (§7). */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * `text` as §7's entry for the file at `relativePath` (`<element-id>/<phase>/<n>.json`), or `undefined` when it is not
 * one JSON object of exactly §7's keys and types, or its `id` is not the run id its path names.
 */
function parseEntry(text: string, relativePath: string): ActiveRunEntry | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== ENTRY_KEYS.length || !ENTRY_KEYS.every((key) => key in record)) return undefined;
  const { id, pid, workflow, phase, element, role, agent, session, started_ms } = record;
  const strings = [id, workflow, phase, element, role, agent, session];
  if (!strings.every((field) => typeof field === 'string' && field !== '')) return undefined;
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) return undefined;
  if (typeof started_ms !== 'number' || !Number.isSafeInteger(started_ms) || started_ms < 0 || started_ms > MAX_STARTED_MS) return undefined;
  // The run id: three non-empty segments, `<n>` a positive decimal without a leading zero, naming the file's own path.
  const segments = (id as string).split('/');
  if (segments.length !== 3 || segments.some((segment) => segment === '') || !RUN_NUMBER.test(segments[2]!)) return undefined;
  if (`${id as string}.json` !== relativePath) return undefined;
  return { id: id as string, pid, workflow: workflow as string, phase: phase as string, element: element as string, role: role as string, agent: agent as string, session: session as string, started_ms };
}

/** Remove the directories from `dir` up to the registry's own, exclusive, while each is empty. */
function removeEmptyDirs(root: string, dir: string): void {
  const top = join(root, ACTIVE_RUNS_DIR);
  for (let current = dir; current.startsWith(`${top}${sep}`); current = dirname(current)) {
    try {
      rmdirSync(current);
    } catch {
      return; // not empty, or already gone: the rest of the chain stays
    }
  }
}

/** Remove the file at `path` (gone already is no error) and the directories it leaves empty. */
function removeFile(root: string, path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  removeEmptyDirs(root, dirname(path));
}

/** `a` before `b` in byte order (the UTF-8 bytes compared). */
function byteOrder(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
}

/** §5's active order: element id (byte order), then phase (byte order), then `n` as a number. */
function activeOrder(a: ActiveRunEntry, b: ActiveRunEntry): number {
  const [ae, ap, an] = a.id.split('/') as [string, string, string];
  const [be, bp, bn] = b.id.split('/') as [string, string, string];
  return byteOrder(ae, be) || byteOrder(ap, bp) || Number(an) - Number(bn) || byteOrder(an, bn);
}

/** The relative paths of every file under the registry, `/`-separated; a name starting with `.` (a rewrite's temporary file) is passed over. */
function registryFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (relativeDir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(join(root, ACTIVE_RUNS_DIR, relativeDir), { withFileTypes: true });
    } catch (error) {
      // A directory removed by another reader between the listing and this read holds nothing.
      if (relativeDir !== '' && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const path = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk('');
  return files;
}

/**
 * Read the registry under `root` (§7), pruning as it reads: an entry whose process is gone is removed; a file that is no
 * entry (unreadable, not JSON, not §7's keys and types, an `id` its path does not name) is removed with one `warning:`
 * line, {@link notAnEntryWarning}; a directory left empty is removed, `.wingfoil/run/` itself kept.
 *
 * @returns the live entries in §5's active order; an absent `.wingfoil/run/` is `[]`; one that cannot be listed is
 *   `IO` `cannot read the active registry .wingfoil/run/: <cause>`.
 */
export function readActiveRuns(root: string): CoreResult<ActiveRunEntry[]> {
  let files: string[];
  try {
    files = registryFiles(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return coreOk([]);
    return coreErr({ code: 'IO', message: `cannot read the active registry ${ACTIVE_RUNS_DIR}/: ${error instanceof Error ? error.message : String(error)}` });
  }
  const live: ActiveRunEntry[] = [];
  for (const relativePath of files) {
    const path = join(root, ACTIVE_RUNS_DIR, ...relativePath.split('/'));
    let text: string | undefined;
    try {
      text = readFileSync(path, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; // pruned by another reader meanwhile
      text = undefined;
    }
    const entry = text === undefined ? undefined : parseEntry(text, relativePath);
    if (entry !== undefined && processAlive(entry.pid)) {
      live.push(entry);
      continue;
    }
    // Pruned: a file that is no entry says so first; a removal that fails is a warning, never a failed read (§7, F5).
    if (entry === undefined) reportWarning(notAnEntryWarning(relativePath));
    try {
      removeFile(root, path);
    } catch (error) {
      reportWarning(couldNotRemoveWarning(relativePath, error instanceof Error ? error.message : String(error)));
    }
  }
  return coreOk(live.sort(activeOrder));
}

/**
 * §3.3 step 13: create run `entry.id`'s file exclusively. An existing file whose entry is live refuses the launch; one
 * whose process is gone, or that is no entry (with {@link notAnEntryWarning}), is pruned and the file created.
 *
 * @returns `ok` once the file is created; `CONFLICT` `run <run-id> is already running (pid <pid>)` with `details`
 *   `{ run_id, pid }` (`RUN_ACTIVE`), the existing file untouched; `IO` when it cannot be written.
 */
export function registerRun(root: string, entry: ActiveRunEntry): CoreResult<void> {
  const path = activeRunPath(root, entry.id);
  const relativePath = `${entry.id}.json`;
  const unwritable = (error: unknown): CoreResult<never> =>
    coreErr({ code: 'IO', message: `cannot write the active registry entry ${ACTIVE_RUNS_DIR}/${relativePath}: ${error instanceof Error ? error.message : String(error)}` });
  /** Create the file exclusively: `true` once created, `false` when one is there, the error otherwise. */
  const create = (): boolean | { error: unknown } => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, serialize(entry), { flag: 'wx' });
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EEXIST' ? false : { error };
    }
  };
  const first = create();
  if (first === true) return coreOk(undefined);
  if (first !== false) return unwritable(first.error);
  let existing: ActiveRunEntry | undefined;
  try {
    existing = parseEntry(readFileSync(path, 'utf-8'), relativePath);
  } catch {
    existing = undefined;
  }
  if (existing !== undefined && processAlive(existing.pid)) {
    return coreErr({ code: 'CONFLICT', message: `run ${entry.id} is already running (pid ${existing.pid})`, details: { run_id: entry.id, pid: existing.pid } });
  }
  if (existing === undefined) reportWarning(notAnEntryWarning(relativePath));
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return unwritable(error);
  }
  // A second launch that took the pruned slot meanwhile makes this one fail exclusively, as it should.
  const second = create();
  if (second === true) return coreOk(undefined);
  return unwritable(second === false ? 'the entry was created by another launch meanwhile' : second.error);
}

/**
 * Whether the file at `path` still holds this launch's entry (§7 "This launch's entry"): the same `id` and `started_ms`
 * as `entry`, and a `pid` that is `agent execute`'s own or `agentPid`, the agent it spawned. Another launch's entry, a
 * file that is no entry and a file that is gone are not.
 */
function holdsOwnEntry(path: string, entry: ActiveRunEntry, agentPid: number | undefined): boolean {
  let current: ActiveRunEntry | undefined;
  try {
    current = parseEntry(readFileSync(path, 'utf-8'), `${entry.id}.json`);
  } catch {
    return false;
  }
  return current !== undefined && current.id === entry.id && current.started_ms === entry.started_ms && (current.pid === process.pid || (agentPid !== undefined && current.pid === agentPid));
}

/**
 * §3.3 step 14: rewrite run `entry.id`'s file with `entry` — the agent's pid at the spawn, `agent execute`'s at the
 * agent's exit — as a new file renamed over it, so a reader never sees it half-written; only while the file holds this
 * launch's entry (`agentPid` the spawned agent's). A rewrite skipped or failed leaves the file as it was and returns
 * `false`.
 */
export function rewriteRunPid(root: string, entry: ActiveRunEntry, agentPid?: number): boolean {
  const path = activeRunPath(root, entry.id);
  // Only this launch's entry (§7): another launch's, written meanwhile, is left as it is (review F2).
  if (!holdsOwnEntry(path, entry, agentPid)) return false;
  const temporary = join(dirname(path), `.${entry.id.slice(entry.id.lastIndexOf('/') + 1)}.json.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, serialize(entry));
    renameSync(temporary, path);
    return true;
  } catch {
    try {
      unlinkSync(temporary);
    } catch {
      // nothing written, or already gone
    }
    return false;
  }
}

/**
 * §3.3 step 17 (and every exit path after step 13): remove run `entry.id`'s file and the directories it leaves empty,
 * only while the file still holds this launch's entry (§7: the same `id` and `started_ms`, a `pid` that is `agent
 * execute`'s own or `agentPid`); another launch's entry is left byte for byte. The check and the removal are two steps,
 * a window §7 states as a known limit.
 */
export function removeRun(root: string, entry: ActiveRunEntry, agentPid?: number): void {
  const path = activeRunPath(root, entry.id);
  if (!holdsOwnEntry(path, entry, agentPid)) return;
  try {
    removeFile(root, path);
  } catch {
    // An entry that cannot be removed is pruned by the next reader once its process is gone.
  }
}
