/**
 * Discovering and loading adapter manifests (`spec-016` §2.1, §3.2 step 5, §3.3 step 2, task-177).
 *
 * - **Where:** `.wingfoil/agents/built-in/<name>.yaml` and `.wingfoil/agents/custom/<name>.yaml`. Any
 *   other entry under `.wingfoil/agents/` (a `.gitkeep`, a nested directory, another extension) is
 *   not an adapter.
 * - **Baseline:** a revision, `HEAD` by default. Manifests gate what `agent execute` launches, so they
 *   are a gating read (`dl-080` (B), the `command-baseline` directive, `spec-006` §6): an uncommitted
 *   edit, or an untracked manifest, changes nothing.
 * - **Discovery lists, it does not parse.** A name in both directories is refused here, because the
 *   run record could not say which one launched (§2.1). Only the adapter a caller selects is then read
 *   and validated (§3.2 step 5), so a broken manifest blocks nobody but its own agents.
 */
import { readPathAtRev } from '../storage';
import { isIdPiece, ValidationError, type ValidationIssue, ID_CHAR_CLASS } from '../validation';
import { listPathsAtCommit, resolveRevision, atHeadOr, RevisionError } from '../core/revision';
import { coreErr, coreOk, type CoreResult } from '../core/types';

import { parseAdapterManifest, type AdapterKind } from './manifest';
import type { AdapterManifest } from './schema';

/** Root-relative POSIX path of the adapter tree (`spec-016` §2.1). */
export const ADAPTERS_DIR_PATH = '.wingfoil/agents' as const;

/** The `E_*` code of a name declared in both adapter directories. */
export const E_ADAPTER_DUPLICATE = 'E_ADAPTER_DUPLICATE';

/** An adapter found at a revision: its name (the file basename), its directory and its path. */
export interface AdapterEntry {
  readonly name: string;
  readonly kind: AdapterKind;
  /** Root-relative POSIX path, e.g. `.wingfoil/agents/custom/fake.yaml`. */
  readonly path: string;
}

/** A selected adapter, its manifest parsed and validated. */
export interface LoadedAdapter extends AdapterEntry {
  readonly manifest: AdapterManifest;
}

/** `.wingfoil/agents/<kind>/<basename>.yaml`, directly inside one of the two directories. */
const ENTRY_RE = /^\.wingfoil\/agents\/(built-in|custom)\/([^/]+)\.yaml$/;

/** Byte order, never locale order (REQ-SYS-07). */
const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The adapters commit `sha` holds, by name then kind, duplicates included. */
function entriesAtCommit(root: string, sha: string): AdapterEntry[] {
  const entries: AdapterEntry[] = [];
  for (const path of listPathsAtCommit(root, sha, ADAPTERS_DIR_PATH)) {
    const match = ENTRY_RE.exec(path);
    if (match === null) continue;
    entries.push({ name: match[2]!, kind: match[1] as AdapterKind, path });
  }
  return entries.sort((a, b) => byteOrder(a.name, b.name) || byteOrder(a.kind, b.kind));
}

/** One issue per name declared in both directories, in name order, paired with that name. */
function duplicateIssues(entries: readonly AdapterEntry[], file: string): { readonly name: string; readonly issue: ValidationIssue }[] {
  const issues: { readonly name: string; readonly issue: ValidationIssue }[] = [];
  for (let i = 1; i < entries.length; i += 1) {
    const [previous, entry] = [entries[i - 1]!, entries[i]!];
    if (previous.name !== entry.name) continue;
    issues.push({
      name: entry.name,
      issue: {
        code: E_ADAPTER_DUPLICATE,
        path: '',
        file,
        message: `declared in both ${previous.path} and ${entry.path}: an adapter name is unique across built-in/ and custom/, it is not an override (spec-016 §2.1)`,
      },
    });
  }
  return issues;
}

/**
 * Every adapter commit `rev` declares, sorted by name (byte order). Nothing is parsed.
 *
 * @param rev - A revision naming one commit; `HEAD` for the gating read.
 * @throws `ValidationError` (`E_ADAPTER_DUPLICATE`) when a name is in both `built-in/` and `custom/`;
 *   `RevisionError` when `rev` names no commit.
 */
export function listAdaptersAtRev(root: string, rev: string): AdapterEntry[] {
  const entries = entriesAtCommit(root, resolveRevision(root, rev));
  const duplicates = duplicateIssues(entries, `${rev}:${ADAPTERS_DIR_PATH}`);
  if (duplicates.length > 0) throw new ValidationError(duplicates.map(({ issue }) => issue));
  return entries;
}

/** An issue in the form a refusal shows it: `<path>: <message>`, or the message alone at the root. */
function render(issue: ValidationIssue): string {
  return issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`;
}

/**
 * Select, read and validate the adapter `name` at `rev` (`spec-016` §3.2 step 5): the gating read
 * `agent execute` makes. Only that manifest is parsed.
 *
 * Refusals, each `adapter '<name>': …`:
 * - `VALIDATION` — `name` is not an id (`spec-009` §1); a name is in both directories (the first such
 *   name is the one named); the manifest is invalid (§3.7: the first issue in the message, every issue
 *   a `dl-055` detail line with its file);
 * - `NOT_FOUND` — no `built-in/<name>.yaml` or `custom/<name>.yaml` at `rev` (at `HEAD`, a repository
 *   with no commit has no adapter);
 * - a `RevisionError`'s own code and message when `rev`, other than `HEAD`, names no commit.
 *
 * @param rev - Defaults to `HEAD` (`dl-080` (B)).
 */
export function loadAdapter(root: string, name: string, rev = 'HEAD'): CoreResult<LoadedAdapter> {
  const refuse = (code: 'VALIDATION' | 'NOT_FOUND', reason: string, issues?: readonly ValidationIssue[]): CoreResult<LoadedAdapter> =>
    coreErr({
      code,
      message: `adapter '${name}': ${reason}`,
      ...(issues === undefined ? {} : { details: { issues: issues.map((issue) => ({ ...issue, detail: render(issue) })) } }),
    });
  if (!isIdPiece(name)) {
    return refuse('VALIDATION', `not an adapter name: an adapter name is an id, characters [${ID_CHAR_CLASS}] only (spec-009 §1)`);
  }

  let sha: string | null;
  try {
    sha = rev === 'HEAD' ? atHeadOr(() => resolveRevision(root, rev), null) : resolveRevision(root, rev);
  } catch (error) {
    if (error instanceof RevisionError) return coreErr(error.toCoreError());
    throw error;
  }
  const entries = sha === null ? [] : entriesAtCommit(root, sha);

  const [duplicate] = duplicateIssues(entries, `${rev}:${ADAPTERS_DIR_PATH}`);
  if (duplicate !== undefined) {
    return coreErr({ code: 'VALIDATION', message: `adapter '${duplicate.name}': ${duplicate.issue.message}` });
  }

  const entry = entries.find((candidate) => candidate.name === name);
  const text = entry === undefined || sha === null ? null : readPathAtRev(root, sha, entry.path);
  if (entry === undefined || text === null) {
    return refuse('NOT_FOUND', `no ${ADAPTERS_DIR_PATH}/built-in/${name}.yaml or ${ADAPTERS_DIR_PATH}/custom/${name}.yaml at ${rev}`);
  }

  try {
    const manifest = parseAdapterManifest(text, { name, kind: entry.kind, file: `${rev}:${entry.path}` });
    return coreOk({ ...entry, manifest });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return refuse('VALIDATION', render(error.issues[0]!), error.issues);
  }
}
