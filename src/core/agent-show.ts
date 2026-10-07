/**
 * `wingfoil agent show <run-id>` (task-220, `spec-016` §6; P5.3.5): one recorded agent run, read from
 * the run log at `HEAD`, and the commit that added its line.
 *
 * **Baseline: `HEAD`, declared** (`spec-016` §5.1, approver ruling R15; `spec-006` §6 item 6;
 * `spec-008` §11). `dna.yaml`'s `paths.runs` and the run log are both read at the one `HEAD` commit the
 * payload's `baseline` names, so `agent show` answers from the baseline `agent execute` counts run ids
 * at (§4.3) and `agent list` lists from. The working tree is opened only to explain a refusal — a run
 * that only an uncommitted log holds gets a `hint:` — never to decide one (the `command-baseline`
 * directive).
 *
 * The reading itself is task-206's run-log library (`src/agent/run-log.ts`): its strict §4.5 reader,
 * its run-id grammar and its path resolution. This module adds the lookup, the `git log -S` search for
 * the adding commit (§4.2 chose JSON Lines so that this search works), and the console rendering.
 */
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseRunLog,
  readRunLogAt,
  resolveRunLogPath,
  RUN_RECORD_KEYS,
  RUN_TOKEN_KEYS,
  runIdElementId,
  type RunRecord,
} from '../agent/run-log';
import { readPathAtRev, runGitRead, StorageError } from '../storage';
import { ValidationError } from '../validation';
import { requireInitializedProject } from './init';
import { DNA_YAML_PATH, loadDnaYamlAtRev } from './loaders';
import { missingOperandReason, type CoreFn } from './registry';
import { resolveRevision, RevisionError } from './revision';
import { coreErr, coreOk, type CoreResult } from './types';
import { UsageError } from './usage-error';

/** `agent show` params: the run id rides the bare positional (`spec-008` §1). */
export interface AgentShowParams {
  readonly root: string;
  readonly positional?: string;
}

/**
 * `agent show`'s payload (`spec-016` §6): the baseline it answered from (`spec-017` §8's shape,
 * `dl-084` (A)), the record as the log holds it (§4.2 key order), and the full sha of the commit that
 * added the record's line — for a record `agent execute` wrote, its `agent: record <run-id>` commit.
 */
export interface AgentShowResult {
  readonly baseline: { readonly rev: 'HEAD'; readonly commit: string };
  readonly run: RunRecord;
  readonly commit: string;
}

/** The usage refusal of a positional that is not a run id (exit `2`, `spec-016` §6). */
export const invalidRunIdReason = (value: string): string => `invalid run id "${value}", expected <element-id>/<phase>/<n>`;

/**
 * The `hint:` of a run the working tree's log holds and `HEAD`'s does not, or `undefined`. The file is
 * read only when it is a regular file (a symbolic link is not followed), and a log that does not parse
 * gives no hint: the hint explains, it never decides (the `command-baseline` directive).
 */
function workingTreeHint(root: string, logPath: string, runId: string): string | undefined {
  const absolute = join(root, logPath);
  let text: string;
  try {
    if (!lstatSync(absolute).isFile()) return undefined;
    text = readFileSync(absolute, 'utf-8');
  } catch {
    return undefined;
  }
  const parsed = parseRunLog(text, logPath);
  if (!parsed.ok || !parsed.value.some((record) => record.id === runId)) return undefined;
  return `the working tree's ${logPath} holds ${runId}, but HEAD does not: agent show reads HEAD; commit the run log to show it`;
}

/** A full object name as `--format=%H` prints it: SHA-1 (40 hex) or SHA-256 (64 hex). */
const FULL_SHA_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * The commit that added `record`'s line to `logPath`, searched from `commit` back.
 *
 * `git log -S` (the search §4.2 names) lists every commit that changed how often the needle
 * `{"id":"<run-id>",` occurs — the line opens with its `id`, §4.2 key 1, written with no whitespace —
 * newest first. That list holds the commits that removed a copy of the line too: a side branch that
 * dropped or reverted it and was merged keeping it, since a merge that equals neither parent makes
 * git walk both (task-220 review F2). So each listed commit is checked in order, and the first whose
 * log blob holds the line's exact bytes — as `commit`'s blob stores them, never re-serialized (R1) —
 * is the one that added the line `HEAD` holds. A merge itself
 * is not diffed, so a record that arrived through one is attributed to the commit on its branch that
 * wrote it.
 *
 * `--no-show-signature` keeps a `log.showSignature` configuration from printing signature text in
 * place of the names, and every name is checked to be a full sha (review F1); anything else is `IO`.
 */
function addingCommit(root: string, commit: string, logPath: string, record: RunRecord): CoreResult<string> {
  const needle = `{"id":${JSON.stringify(record.id)},`;
  // The line's bytes as `commit` stores them — not a re-serialization, which differs from a valid line
  // written with a `\u` escape or a CRLF ending (re-review R1). The reader has accepted that blob, so
  // it holds exactly one line of this id (§4.5: ids are unique) and it opens with the needle.
  const lines = (readPathAtRev(root, commit, logPath) ?? '').split('\n');
  const line = lines.find((candidate) => candidate.startsWith(needle));
  if (line === undefined) return coreErr({ code: 'IO', message: `run ${record.id}: its line is not in ${logPath} at ${commit}` });
  let stdout: string;
  try {
    stdout = runGitRead(root, ['log', '--no-show-signature', '-S', needle, '--format=%H', commit, '--', logPath]).stdout;
  } catch (error) {
    if (!(error instanceof StorageError)) throw error;
    return coreErr({ code: 'IO', message: error.message });
  }
  const shas = stdout.split('\n').filter((name) => name !== '');
  for (const sha of shas) {
    if (!FULL_SHA_RE.test(sha)) {
      return coreErr({ code: 'IO', message: `run ${record.id}: git log printed '${sha}' where a commit name was expected` });
    }
    const text = readPathAtRev(root, sha, logPath);
    if (text !== null && text.split('\n').includes(line)) return coreOk(sha);
  }
  return coreErr({ code: 'IO', message: `run ${record.id}: no commit in the history of HEAD adds its line to ${logPath}` });
}

/**
 * `agent show` `CoreOperation.fn` (`mutates: false`; `spec-006` §3, `spec-016` §8).
 *
 * 1. The operand: absent is the one missing-operand form; anything but a run id (§4.3) is
 *    `invalid run id "<value>", expected <element-id>/<phase>/<n>`. Both are usage errors (exit `2`),
 *    refused before the project is read.
 * 2. `HEAD`, resolved once; `dna.yaml` at that commit, and its `paths.runs` (`dna.yaml declares no run
 *    log (paths.runs)` when absent, the recorder's own refusal).
 * 3. `<runs>/<element-id>.jsonl` at that commit, through the strict reader (a §4.5 violation is
 *    `VALIDATION`). No record with that id is `NOT_FOUND` `run not found: <run-id>`, with a `hint` when
 *    the working tree's log holds it.
 * 4. The adding commit, by `git log -S`.
 */
export const agentShowFn: CoreFn<unknown, AgentShowResult> = async (params) => {
  const { root, positional } = params as AgentShowParams;
  if (positional === undefined) throw new UsageError(missingOperandReason('run-id'));
  const elementId = runIdElementId(positional);
  if (elementId === null) throw new UsageError(invalidRunIdReason(positional));
  const runId = positional;

  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  let commit: string;
  try {
    commit = resolveRevision(root, 'HEAD');
  } catch (error) {
    if (error instanceof RevisionError) return coreErr(error.toCoreError());
    throw error;
  }

  let runs: readonly string[] | undefined;
  try {
    const dna = loadDnaYamlAtRev(root, commit);
    if (dna === null) {
      return coreErr({ code: 'NOT_FOUND', message: `${DNA_YAML_PATH} is not committed at HEAD, which agent show reads: commit it first` });
    }
    runs = (dna.paths as Record<string, readonly string[] | undefined>)['runs'];
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return coreErr({ code: 'VALIDATION', message: error.message, details: { issues: error.issues } });
  }

  const logPath = resolveRunLogPath(root, runs, elementId, 'read');
  if (!logPath.ok) return logPath;

  const records = readRunLogAt(root, commit, logPath.value);
  if (!records.ok) return records;
  const run = records.value.find((record) => record.id === runId);
  if (run === undefined) {
    const hint = workingTreeHint(root, logPath.value, runId);
    return coreErr({ code: 'NOT_FOUND', message: `run not found: ${runId}`, ...(hint === undefined ? {} : { hint }) });
  }

  const added = addingCommit(root, commit, logPath.value, run);
  if (!added.ok) return added;
  // `run` is the parsed line, so its keys are in §4.2's order: the strict reader accepts no other.
  return coreOk({ baseline: { rev: 'HEAD', commit }, run, commit: added.value });
};

/**
 * `agent show`'s `--format console` (`spec-016` §6): one `key: value` line per record field in §4.2
 * order, `tokens` flattened to `tokens.input`, `tokens.output`, `tokens.cache_read` and
 * `tokens.cache_write`, then `commit: <sha>`. Values print as they are stored: a string verbatim, an
 * integer in decimal.
 */
export function renderAgentShowConsole(value: unknown): string {
  const { run, commit } = value as AgentShowResult;
  const lines: string[] = [];
  for (const key of RUN_RECORD_KEYS) {
    if (key === 'tokens') {
      for (const token of RUN_TOKEN_KEYS) lines.push(`tokens.${token}: ${run.tokens[token]}`);
    } else {
      lines.push(`${key}: ${run[key]}`);
    }
  }
  lines.push(`commit: ${commit}`);
  return `${lines.join('\n')}\n`;
}
