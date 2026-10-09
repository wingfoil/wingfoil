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
 * - **What is not an adapter is said, not skipped** (`bug-290`). The listing offers only names
 *   {@link loadAdapter} can select — a basename in `spec-009`'s ID class — and
 *   {@link adapterTreeDiagnosticsAtRev} reports every other entry under `.wingfoil/agents/` (another
 *   extension, a nested file, a file outside the two directories, a basename outside the ID class) as a
 *   `W_ADAPTER_IGNORED` warning naming its path, except the `.gitkeep` `wingfoil init` reserves the
 *   directories with. `agent execute` prints them where it lists the adapter tree (§3.3 step 2).
 */
import { readPathAtRev } from '../storage';
import { isIdPiece, ValidationError, type Diagnostic, type ValidationIssue, ID_CHAR_CLASS } from '../validation';
import { listPathsAtCommit, resolveRevision, atHeadOr, RevisionError } from '../core/revision';
import { coreErr, coreOk, type CoreResult } from '../core/types';

import { parseAdapterManifest, type AdapterKind } from './manifest';
import type { AdapterManifest } from './schema';

/** Root-relative POSIX path of the adapter tree (`spec-016` §2.1). */
export const ADAPTERS_DIR_PATH = '.wingfoil/agents' as const;

/** The `E_*` code of a name declared in both adapter directories. */
export const E_ADAPTER_DUPLICATE = 'E_ADAPTER_DUPLICATE';

/** The `W_*` code of an entry under the adapter tree that is not an adapter (`bug-290`). */
export const W_ADAPTER_IGNORED = 'W_ADAPTER_IGNORED';

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

/** The placeholder `wingfoil init` reserves an empty adapter directory with: never reported. */
const GITKEEP = '.gitkeep';

/** Why the entry at `path` is not an adapter, or `null` when it is one (or is a `.gitkeep`). */
function notAnAdapter(path: string): string | null {
  const match = ENTRY_RE.exec(path);
  if (match === null) {
    return path.endsWith(`/${GITKEEP}`)
      ? null
      : `not an adapter: an adapter is a .yaml file directly inside ${ADAPTERS_DIR_PATH}/built-in/ or ${ADAPTERS_DIR_PATH}/custom/ (spec-016 §2.1)`;
  }
  const name = match[2]!;
  return isIdPiece(name)
    ? null
    : `not an adapter: its name '${name}' is not an id, characters [${ID_CHAR_CLASS}] only (spec-009 §1), so no agent can select it`;
}

/** The adapters commit `sha` holds, by name then kind, duplicates included; only names that are ids. */
function entriesAtCommit(root: string, sha: string): AdapterEntry[] {
  const entries: AdapterEntry[] = [];
  for (const path of listPathsAtCommit(root, sha, ADAPTERS_DIR_PATH)) {
    const match = ENTRY_RE.exec(path);
    if (match === null || !isIdPiece(match[2]!)) continue;
    entries.push({ name: match[2]!, kind: match[1] as AdapterKind, path });
  }
  return entries.sort((a, b) => byteOrder(a.name, b.name) || byteOrder(a.kind, b.kind));
}

/**
 * Every entry under `.wingfoil/agents/` at `rev` that is not an adapter (`bug-290`, `spec-016` §2.1): a
 * file of another extension, a nested file, a file outside `built-in/` and `custom/`, or a `.yaml`
 * basename outside `spec-009`'s ID class — one `W_ADAPTER_IGNORED` warning each, naming the path in
 * `file`, in path order (byte order). A `.gitkeep` is not reported. Nothing is parsed.
 *
 * @param rev - A revision naming one commit; `HEAD` for the gating read. At `HEAD`, a repository with
 *   no commit has no entry and no diagnostic.
 * @throws `RevisionError` when `rev`, other than `HEAD`, names no commit.
 */
export function adapterTreeDiagnosticsAtRev(root: string, rev: string): Diagnostic[] {
  const sha = rev === 'HEAD' ? atHeadOr(root, () => resolveRevision(root, rev), null) : resolveRevision(root, rev);
  if (sha === null) return [];
  const diagnostics: Diagnostic[] = [];
  for (const path of [...listPathsAtCommit(root, sha, ADAPTERS_DIR_PATH)].sort(byteOrder)) {
    const message = notAnAdapter(path);
    if (message !== null) diagnostics.push({ code: W_ADAPTER_IGNORED, severity: 'warning', file: path, path: '', message });
  }
  return diagnostics;
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
 * Every adapter commit `rev` declares, sorted by name (byte order): only the names {@link loadAdapter}
 * can select; {@link adapterTreeDiagnosticsAtRev} reports the rest. Nothing is parsed.
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

/**
 * The refusal of a name declared in both adapter directories at `rev` (§2.1), in {@link loadAdapter}'s
 * shape — `adapter '<first name>': declared in both …`, every duplicated name a `dl-055` detail line —
 * or `undefined` when every name is unique. `agent execute` asks it where it lists the adapter tree
 * (§3.3 step 2), before it resolves the element, the role or the agent.
 *
 * @param rev - A revision naming one commit (a sha, or `HEAD`; at `HEAD` a repository with no commit has
 *   no adapter).
 */
export function duplicateAdapterRefusal(root: string, rev: string): CoreResult<never> | undefined {
  const sha = rev === 'HEAD' ? atHeadOr(root, () => resolveRevision(root, rev), null) : resolveRevision(root, rev);
  if (sha === null) return undefined;
  const duplicates = duplicateIssues(entriesAtCommit(root, sha), `${rev}:${ADAPTERS_DIR_PATH}`);
  if (duplicates.length === 0) return undefined;
  const [first] = duplicates;
  return coreErr({
    code: 'VALIDATION',
    message: `adapter '${first!.name}': ${first!.issue.message}`,
    details: { issues: duplicates.map(({ issue }) => ({ ...issue, detail: render(issue) })) },
  });
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
 *   name is the one named, and every duplicated name is a `dl-055` detail line); the manifest is invalid (§3.7: the first issue in the message, every issue
 *   a `dl-055` detail line with its file);
 * - `NOT_FOUND` — no `built-in/<name>.yaml` or `custom/<name>.yaml` at `rev` (at `HEAD`, a repository
 *   with no commit has no adapter);
 * - a `RevisionError`'s own code and message when `rev`, other than `HEAD`, names no commit.
 *
 * @param rev - Defaults to `HEAD` (`dl-080` (B)).
 */
export function loadAdapter(root: string, name: string, rev = 'HEAD'): CoreResult<LoadedAdapter> {
  const refuse = (
    code: 'VALIDATION' | 'NOT_FOUND',
    reason: string,
    issues?: readonly ValidationIssue[],
    subject = name,
  ): CoreResult<LoadedAdapter> =>
    coreErr({
      code,
      message: `adapter '${subject}': ${reason}`,
      ...(issues === undefined ? {} : { details: { issues: issues.map((issue) => ({ ...issue, detail: render(issue) })) } }),
    });
  if (!isIdPiece(name)) {
    return refuse('VALIDATION', `not an adapter name: an adapter name is an id, characters [${ID_CHAR_CLASS}] only (spec-009 §1)`);
  }

  let sha: string | null;
  try {
    sha = rev === 'HEAD' ? atHeadOr(root, () => resolveRevision(root, rev), null) : resolveRevision(root, rev);
  } catch (error) {
    if (error instanceof RevisionError) return coreErr(error.toCoreError());
    throw error;
  }
  const entries = sha === null ? [] : entriesAtCommit(root, sha);

  // Every duplicated name is a dl-055 detail line; the message names the first (task-177 review F2).
  const duplicates = duplicateIssues(entries, `${rev}:${ADAPTERS_DIR_PATH}`);
  if (duplicates.length > 0) {
    const [first] = duplicates;
    return refuse('VALIDATION', first!.issue.message, duplicates.map(({ issue }) => issue), first!.name);
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
