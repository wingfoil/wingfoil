/**
 * The run log (task-206, `spec-016` §4): one JSON Lines record per agent run, in one file per element
 * under `dna.yaml` `paths.runs`, committed on its own as `agent: record <run-id>`.
 *
 * This is the library `agent execute` (task-228), `agent list` (task-240) and `agent show` (task-220)
 * build on. It owns:
 * - the 18-key record of §4.2, written in a fixed key order with no insignificant whitespace, where an
 *   unreported value is the literal {@link NOT_REPORTED}, never `0` or `null` (`dl-114` Q2 (b), Q3 (i));
 * - the run id `<element-id>/<phase>/<n>` of §4.3, `n` counted at `state_ref` (`dl-135` Q3 (a)), so
 *   every clone derives the same id from the same history (`REQ-SYS-07`);
 * - the strict reader of §4.5, which every reader goes through;
 * - the §4.4 commit, which contains only the element's run-log file (`commitPaths --only`), and the
 *   §4.3 collision rule, checked against the then-current `HEAD`;
 * - the `notes` field (`dl-135` Q2 (c)).
 *
 * **Baseline.** The id is counted at `state_ref`, the collision is checked at `HEAD`, and `notes`
 * compares the element at `state_ref` with the element at `HEAD`: all committed states, never the
 * working tree, so notes an agent wrote but did not commit yield `none` (§4.2 key 18).
 */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';

import { commitPaths, pathPorcelainStatus, readPathAtRev, StorageError, unstagePaths } from '../storage';
import { resolveConfinedMemoryPath } from '../storage/memory-path';
import { isIdPiece } from '../validation/id';
import { requireConfinedWriteTarget } from '../core/confinement';
import { resolveRevision, RevisionError } from '../core/revision';
import { coreErr, coreOk, type CoreResult } from '../core/types';

/** The literal of a value the agent did not report (§2.6): never `0`, `null` or an absent key. */
export const NOT_REPORTED = 'not-reported' as const;

/** `workflow` of a run with no step (§4.2 key 3). */
export const NO_WORKFLOW = 'n/a' as const;

/** `phase`, and the id's phase segment, of a run with no step (§4.3; reserved by `spec-003`). */
export const ADHOC_PHASE = 'adhoc' as const;

/** The record's keys, in the order §4.2 fixes and every line carries. */
export const RUN_RECORD_KEYS = [
  'id',
  'element',
  'workflow',
  'phase',
  'role',
  'mode',
  'agent',
  'adapter',
  'agent_version',
  'model',
  'session',
  'tokens',
  'wingfoil',
  'state_ref',
  'duration_ms',
  'exit_status',
  'result',
  'notes',
] as const;

/** The keys of the record's `tokens` object, in order (§4.2 key 12). */
export const RUN_TOKEN_KEYS = ['input', 'output', 'cache_read', 'cache_write'] as const;

/** A count the agent reported, or {@link NOT_REPORTED}. */
export type ReportedCount = number | typeof NOT_REPORTED;

/** The record's `tokens` (§4.2 key 12, `dl-114` Q2 (b)). */
export interface RunTokens {
  readonly input: ReportedCount;
  readonly output: ReportedCount;
  readonly cache_read: ReportedCount;
  readonly cache_write: ReportedCount;
}

/** One run record (`spec-016` §4.2). Field names are the JSON keys. */
export interface RunRecord {
  /** Run id, `<element-id>/<phase>/<n>` (§4.3). */
  readonly id: string;
  /** `<type>:<id>` (`spec-008` §7). */
  readonly element: string;
  /** Workflow name, or {@link NO_WORKFLOW}. */
  readonly workflow: string;
  /** Phase name, or {@link ADHOC_PHASE}. */
  readonly phase: string;
  readonly role: string;
  /** The mode that ran: `fresh` in v0.3. */
  readonly mode: string;
  /** `team.agents[].name`. */
  readonly agent: string;
  /** `<built-in|custom>/<name>`. */
  readonly adapter: string;
  readonly agent_version: string;
  readonly model: string;
  readonly session: string;
  readonly tokens: RunTokens;
  /** The launching build, `"<semver> (<sha>)"` (`dl-111`). */
  readonly wingfoil: string;
  /** Full sha the context was assembled at. */
  readonly state_ref: string;
  /** Wall-clock, spawn to exit. A record of what happened; it never enters a context. */
  readonly duration_ms: number;
  /** The agent's exit code, or `signal:<NAME>`. */
  readonly exit_status: number | string;
  /** `n/a` for an interactive launch; `PASS`/`FAIL`/`ERROR` for a headless one. */
  readonly result: string;
  /** `<element-id>#execution-notes`, or `none` (§4.2 key 18). */
  readonly notes: string;
}

/** A phase segment: `spec-003`'s phase-name class. */
const PHASE_SOURCE = '[a-z][a-z0-9-]*';
/** `n`: decimal, no padding, from 1. */
const COUNT_SOURCE = '[1-9][0-9]*';
const SIGNAL_RE = /^signal:[A-Z][A-Z0-9]*$/;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether `id` is a run id of the element `elementId` (§4.3): the element id, a `/`, a phase segment
 * in `spec-003`'s phase-name class (a lowercase letter, then lowercase letters, digits and `-`), a
 * `/`, and a decimal count from 1 with no padding; `elementId` itself in `spec-009`'s ID class.
 */
export function isRunId(id: string, elementId: string): boolean {
  if (!isIdPiece(elementId)) return false;
  return new RegExp(`^${escapeRegExp(elementId)}/${PHASE_SOURCE}/${COUNT_SOURCE}$`).test(id);
}

/**
 * The run id `<element-id>/<phase>/<n>` (§4.3).
 *
 * @throws Error when the result would not be a run id ({@link isRunId}): a caller passing a malformed
 *   element id, phase or count has a defect, not a refusal to report.
 */
export function formatRunId(elementId: string, phase: string, n: number): string {
  const id = `${elementId}/${phase}/${n}`;
  if (!Number.isSafeInteger(n) || !isRunId(id, elementId)) throw new Error(`not a run id: '${id}'`);
  return id;
}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Plain object, not an array and not `null`. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The first difference between the keys `actual` has, in order, and `expected`: a missing, an
 * unexpected or an out-of-order key, named with `prefix` (`tokens.` inside the token object).
 */
function keyOrderDefect(actual: readonly string[], expected: readonly string[], prefix = ''): string | null {
  for (let i = 0; i < Math.max(actual.length, expected.length); i += 1) {
    const [have, want] = [actual[i], expected[i]];
    if (have === want) continue;
    if (have === undefined || (want !== undefined && !actual.includes(want))) return `missing key '${prefix}${want}'`;
    if (want === undefined || !expected.includes(have)) return `unexpected key '${prefix}${have}'`;
    return `key '${prefix}${have}' out of order: expected '${prefix}${want}' at position ${i + 1}`;
  }
  return null;
}

/** The defect of one field's value, or `null` (§4.2 types). The token object's key order is checked here too. */
function fieldDefect(key: (typeof RUN_RECORD_KEYS)[number], value: unknown, ordered: boolean): string | null {
  switch (key) {
    case 'tokens': {
      if (!isPlainObject(value)) return "'tokens' must be an object";
      const keys = Object.keys(value);
      const order = ordered
        ? keyOrderDefect(keys, RUN_TOKEN_KEYS, 'tokens.')
        : keyOrderDefect([...keys].sort(), [...RUN_TOKEN_KEYS].sort(), 'tokens.');
      if (order !== null) return order;
      for (const token of RUN_TOKEN_KEYS) {
        const count = value[token];
        if (count !== NOT_REPORTED && !isNonNegativeInteger(count)) {
          return `'tokens.${token}' must be a non-negative integer or "${NOT_REPORTED}"`;
        }
      }
      return null;
    }
    case 'duration_ms':
      return isNonNegativeInteger(value) ? null : "'duration_ms' must be a non-negative integer";
    case 'exit_status':
      return (typeof value === 'number' && Number.isSafeInteger(value)) || (typeof value === 'string' && SIGNAL_RE.test(value))
        ? null
        : `'exit_status' must be an integer or "signal:<NAME>"`;
    default:
      return typeof value === 'string' ? null : `'${key}' must be a string`;
  }
}

/**
 * The first defect of `value` as a run record of element `elementId`, or `null`.
 *
 * @param ordered - `true` for a line read back (§4.5: keys in the declared order); `false` for an
 *   object a caller built, whose key order the writer fixes itself.
 */
function recordDefect(value: unknown, elementId: string, ordered: boolean): string | null {
  if (!isPlainObject(value)) return 'not a JSON object';
  const keys = Object.keys(value);
  const order = ordered
    ? keyOrderDefect(keys, RUN_RECORD_KEYS)
    : keyOrderDefect([...keys].sort(), [...RUN_RECORD_KEYS].sort());
  if (order !== null) return order;
  for (const key of RUN_RECORD_KEYS) {
    const defect = fieldDefect(key, value[key], ordered);
    if (defect !== null) return defect;
  }
  const id = value.id as string;
  if (!isRunId(id, elementId)) return `'id' '${id}' is not a run id of element '${elementId}' (the file's basename)`;
  return null;
}

/** The element id `<type>:<id>`'s id: everything after the first `:`. */
const elementIdOf = (element: string): string => element.slice(element.indexOf(':') + 1);

/** `record` as an object whose keys, and whose token keys, are in §4.2 order. */
function ordered(record: RunRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of RUN_RECORD_KEYS) {
    out[key] = key === 'tokens' ? Object.fromEntries(RUN_TOKEN_KEYS.map((token) => [token, record.tokens[token]])) : record[key];
  }
  return out;
}

/**
 * The record as its log line (§4.2): one JSON object, keys in {@link RUN_RECORD_KEYS} order whatever
 * order `record` was built in, no insignificant whitespace, `\n`-terminated.
 *
 * The record is validated first, with the reader's rules except key order, so the writer can never
 * produce a line the reader refuses: an absent key, a `null`, a fractional count is refused rather than
 * written.
 *
 * @throws Error `run record is not valid: <detail>` — a caller defect.
 */
export function serializeRunRecord(record: RunRecord): string {
  const defect = recordDefect(record, typeof record?.id === 'string' ? record.id.split('/')[0]! : '', false);
  if (defect !== null) throw new Error(`run record is not valid: ${defect}`);
  return `${JSON.stringify(ordered(record))}\n`;
}

/** `run log <path>: line <k> is not a valid run record: <detail>` (§4.5). */
const invalidLine = (path: string, k: number, detail: string): CoreResult<never> =>
  coreErr({ code: 'VALIDATION', message: `run log ${path}: line ${k} is not a valid run record: ${detail}` });

/**
 * Read a run log strictly (§4.5): every line JSON, exactly the §4.2 keys in order with valid types, an
 * `id` whose element segment is the file's basename (`<runs>/<element-id>.jsonl`), and no id twice.
 * The last line must be `\n`-terminated, since an append to an unterminated line would corrupt both.
 *
 * @param text - The file's content.
 * @param path - Root-relative path of the file; its basename without `.jsonl` is the element id, and it
 *   is named in every refusal.
 * @returns The records in line order, or `VALIDATION` with the §4.5 message for the first violation.
 */
export function parseRunLog(text: string, path: string): CoreResult<RunRecord[]> {
  const elementId = basename(path, '.jsonl');
  const lines = text.split('\n');
  const terminated = lines[lines.length - 1] === '';
  if (terminated) lines.pop();
  const records: RunRecord[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i += 1) {
    if (i === lines.length - 1 && !terminated) return invalidLine(path, i + 1, 'not terminated by a newline');
    let value: unknown;
    try {
      value = JSON.parse(lines[i]!);
    } catch {
      return invalidLine(path, i + 1, 'not JSON');
    }
    const defect = recordDefect(value, elementId, true);
    if (defect !== null) return invalidLine(path, i + 1, defect);
    const record = value as RunRecord;
    if (seen.has(record.id)) return coreErr({ code: 'VALIDATION', message: `run log ${path}: run id ${record.id} recorded twice` });
    seen.add(record.id);
    records.push(record);
  }
  return coreOk(records);
}

/**
 * The run log `path` as commit `rev` holds it, read strictly ({@link parseRunLog}); a log the commit
 * does not hold is no records.
 *
 * @returns `VALIDATION`/`NOT_FOUND` from a `rev` that is malformed or names no commit.
 */
export function readRunLogAt(root: string, rev: string, path: string): CoreResult<RunRecord[]> {
  let sha: string;
  try {
    sha = resolveRevision(root, rev);
  } catch (error) {
    if (error instanceof RevisionError) return coreErr(error.toCoreError());
    throw error;
  }
  const text = readPathAtRev(root, sha, path);
  return text === null ? coreOk([]) : parseRunLog(text, path);
}

/**
 * The run-log file of `elementId` (§4.1): `<runs>/<element-id>.jsonl`, joined as a path (a trailing
 * slash, `./` or a doubled `/` in `paths.runs` changes nothing) and confined to the project root
 * (`REQ-SEC-06`): `paths.runs` accepts an absolute or a `../` value, so the file it names is checked
 * where it is resolved.
 *
 * @param runs - `dna.yaml` `paths.runs` (one directory; absent when undeclared).
 * @returns The root-relative POSIX path, or `VALIDATION`: `dna.yaml declares no run log (paths.runs)`
 *   (`NO_RUN_LOG`, §3.7) for an absent or blank value; a confinement refusal; an element id outside
 *   `spec-009`'s ID class.
 */
export function resolveRunLogPath(root: string, runs: readonly string[] | undefined, elementId: string): CoreResult<string> {
  const dir = runs?.[0];
  if (dir === undefined || dir.trim() === '') {
    return coreErr({ code: 'VALIDATION', message: 'dna.yaml declares no run log (paths.runs)' });
  }
  if (!isIdPiece(elementId)) {
    return coreErr({ code: 'VALIDATION', message: `not an element id: '${elementId}'` });
  }
  const joined = posix.join(dir.split(sep).join('/'), `${elementId}.jsonl`);
  let target: string;
  try {
    // The joined path is the token's value, not the pattern, so a `{` in paths.runs is not a placeholder.
    target = resolveConfinedMemoryPath(root, '{log}', { log: joined });
  } catch (error) {
    if (error instanceof StorageError) return coreErr({ code: 'VALIDATION', message: `paths.runs: ${error.message}` });
    throw error;
  }
  return coreOk(relative(resolve(root), target).split(sep).join('/'));
}

/** What {@link nextRunId} counts. */
export interface NextRunIdInput {
  /** Root-relative run-log path ({@link resolveRunLogPath}). */
  readonly logPath: string;
  /** `<type>:<id>`. */
  readonly element: string;
  /** Phase name, or {@link ADHOC_PHASE}. */
  readonly phase: string;
  /** The commit the context is assembled at. */
  readonly stateRef: string;
}

/**
 * The next run id (§4.3): `<element-id>/<phase>/<n>`, `n` = 1 + the records in the log **at
 * `state_ref`** whose `element` and `phase` match, whatever their workflow. Later commits and the
 * working tree do not count, so two clones of the same history derive the same id.
 *
 * @returns The id, or the strict reader's `VALIDATION` for a log at `state_ref` it refuses.
 */
export function nextRunId(root: string, input: NextRunIdInput): CoreResult<string> {
  const records = readRunLogAt(root, input.stateRef, input.logPath);
  if (!records.ok) return records;
  const n = 1 + records.value.filter((record) => record.element === input.element && record.phase === input.phase).length;
  return coreOk(formatRunId(elementIdOf(input.element), input.phase, n));
}

/** The heading line that opens the section `notes` watches (§4.2 key 18, §2.4). */
const NOTES_HEADING = '## Execution Notes';
const FENCE_RE = /^ {0,3}(```|~~~)/;
const SECTION_END_RE = /^#{1,2}(?:\s|$)/;

/**
 * The body of the `## Execution Notes` section of a Markdown document, or `null` when it has none.
 *
 * The section is found by its **heading line** — a line that is exactly `## Execution Notes` — never
 * by substring, so an inline `` `## Execution Notes` `` in prose, a YAML frontmatter value or
 * `## Triage & Execution Notes` is not it. It runs to the next level-1 or level-2 heading, or the end;
 * lines inside a fenced code block are not headings. CRLF reads as LF.
 */
export function executionNotesSection(markdown: string): string | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let i = 0;
  if (lines[0] === '---') {
    const close = lines.indexOf('---', 1);
    i = close === -1 ? lines.length : close + 1;
  }
  let fenced = false;
  let start = -1;
  for (; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (FENCE_RE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (start === -1) {
      if (line === NOTES_HEADING) start = i + 1;
    } else if (SECTION_END_RE.test(line)) {
      break;
    }
  }
  if (start === -1) return null;
  return lines.slice(start, i).map((line) => `${line}\n`).join('');
}

/** The three texts {@link notesField} compares; `null` for one that does not exist. */
export interface NotesFieldInput {
  /** The element type's template (`template.file`), read at `HEAD`. */
  readonly template: string | null;
  /** The element at `state_ref`. */
  readonly atStateRef: string | null;
  /** The element at `HEAD` after the run. */
  readonly atHead: string | null;
}

/**
 * The record's `notes` (§4.2 key 18, `dl-135` Q2 (c)): `<element-id>#execution-notes` when the
 * element's `## Execution Notes` section differs between `state_ref` and `HEAD`, else `none`. Always
 * `none` for a type whose template has no such section.
 */
export function notesField(elementId: string, input: NotesFieldInput): string {
  if (input.template === null || executionNotesSection(input.template) === null) return 'none';
  const before = input.atStateRef === null ? null : executionNotesSection(input.atStateRef);
  const after = input.atHead === null ? null : executionNotesSection(input.atHead);
  return before === after ? 'none' : `${elementId}#execution-notes`;
}

/** Where {@link deriveNotesField} reads. */
export interface DeriveNotesFieldInput {
  readonly elementId: string;
  /** Root-relative path of the element's document. */
  readonly elementPath: string;
  /** Root-relative path of the type's `template.file`. */
  readonly templatePath: string;
  readonly stateRef: string;
}

/**
 * {@link notesField} over git: the template and the element at `HEAD`, the element at `state_ref`.
 * Committed states only, so notes left uncommitted yield `none`.
 */
export function deriveNotesField(root: string, input: DeriveNotesFieldInput): string {
  return notesField(input.elementId, {
    template: readPathAtRev(root, 'HEAD', input.templatePath),
    atStateRef: readPathAtRev(root, input.stateRef, input.elementPath),
    atHead: readPathAtRev(root, 'HEAD', input.elementPath),
  });
}

/** What a recorded run returns: the record and the commit that holds it. */
export interface RecordedRun {
  readonly record: RunRecord;
  readonly sha: string;
}

/** The record as the `details` of a refusal that loses it: one `dl-055` detail line, the JSON line. */
const recordDetails = (record: RunRecord, line: string): Record<string, unknown> => ({
  run_id: record.id,
  record,
  issues: [{ detail: line.replace(/\n$/, '') }],
});

/** The operator-facing cause of a failed git invocation: git's (or a hook's) first stderr line. */
function gitCause(error: unknown): string {
  const failure = error as { stderr?: unknown; status?: unknown };
  const stderr = typeof failure.stderr === 'string' ? failure.stderr : Buffer.isBuffer(failure.stderr) ? failure.stderr.toString('utf-8') : '';
  const first = stderr.split('\n').map((line) => line.trim()).find((line) => line !== '');
  if (first !== undefined) return first;
  return typeof failure.status === 'number' ? `git exited with status ${failure.status}` : 'git failed';
}

/**
 * Append `record` to its run log and commit it (§4.4, §4.3 collision, §3.7).
 *
 * The commit contains only `logPath` (`commitPaths`, `--only`): the agent's uncommitted and staged
 * edits elsewhere stay as they are. Its subject is `agent: record <run-id>`, outside the `wf()`
 * grammar because the run log is not Memory, and `commitPaths` adds `dl-111`'s `WingFoil-Version:`
 * trailer; there is no other body.
 *
 * Refusals, in order, none of which writes anything:
 * - `VALIDATION` — `record` is not a valid record, or not one of this log's element (its id's element
 *   segment is not the file's basename); the log path leaves the project root or is a symlink;
 * - `CONFLICT` `run log <path> has uncommitted changes` — the file differs from `HEAD` in the index or
 *   the working tree, which the append would overwrite;
 * - the strict reader's `VALIDATION` for the log at `HEAD`;
 * - `CONFLICT` `run id <run-id> already recorded at HEAD`, the full record as a `details` line, so the
 *   run is not lost (§4.3).
 *
 * A commit that fails (a refusing hook, …) is `IO` `run <run-id> not recorded: <cause>` with the record
 * as a `details` line; the file and its index entry are put back as `HEAD` holds them.
 */
export function recordRun(root: string, logPath: string, record: RunRecord): CoreResult<RecordedRun> {
  let line: string;
  try {
    line = serializeRunRecord(record);
  } catch (error) {
    return coreErr({ code: 'VALIDATION', message: (error as Error).message });
  }
  const elementId = basename(logPath, '.jsonl');
  if (!isRunId(record.id, elementId)) {
    return coreErr({
      code: 'VALIDATION',
      message: `run log ${logPath}: run id ${record.id} is not a run id of element '${elementId}' (the file's basename)`,
    });
  }
  const confined = requireConfinedWriteTarget(root, logPath, 'write');
  if (!confined.ok) return confined;
  if (pathPorcelainStatus(root, logPath) !== '') {
    return coreErr({ code: 'CONFLICT', message: `run log ${logPath} has uncommitted changes` });
  }

  const atHead = readPathAtRev(root, 'HEAD', logPath);
  const existing = atHead === null ? coreOk<RunRecord[]>([]) : parseRunLog(atHead, logPath);
  if (!existing.ok) return existing;
  if (existing.value.some((recorded) => recorded.id === record.id)) {
    return coreErr({
      code: 'CONFLICT',
      message: `run id ${record.id} already recorded at HEAD`,
      details: recordDetails(record, line),
    });
  }

  const absolute = join(root, logPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${atHead ?? ''}${line}`, 'utf-8');
  const message = `agent: record ${record.id}`;
  try {
    const sha = commitPaths(root, [logPath], message);
    return coreOk({ record, sha }, { sha, message });
  } catch (error) {
    if (atHead === null) unlinkSync(absolute);
    else writeFileSync(absolute, atHead, 'utf-8');
    unstagePaths(root, [logPath]);
    return coreErr({
      code: 'IO',
      message: `run ${record.id} not recorded: ${gitCause(error)}`,
      details: recordDetails(record, line),
    });
  }
}
