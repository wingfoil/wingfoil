/**
 * What of a {@link CoreError}'s `details` every surface shows (task-130, `dl-055` option 1,
 * `spec-005` §3, `spec-004`).
 *
 * Every core refusal built from a `ValidationError` carries `details: { issues }`, and two fields of
 * an issue are for the operator: the `file` it was found in (`bug-031`'s missing file name) and the
 * `detail` that explains a pinned contract message (`dl-032` option (c)). Until this module no surface
 * read either. A spec-003 loader refusal (task-136) carries `details: { diagnostics }` instead; each
 * diagnostic is shown in the reason form (see `diagnosticDetails`). Every other key is declared in
 * {@link DETAIL_KEYS} (task-375, `bug-303`). Deciding *which* fields are shown once, here, is what keeps the CLI (`src/cli/error.ts`)
 * and the MCP registrar (`src/mcp/registrar.ts`) from drifting apart (REQ-SYS-05); each surface only
 * decides how to write the list in its own format.
 */
import { formatDiagnostic, type Diagnostic } from '../validation';
import type { CoreError } from './types';

/** One operator-facing entry of a refusal: the file an issue names and/or its explanation. */
export interface ErrorDetail {
  readonly file?: string;
  readonly detail?: string;
}

/**
 * How each `details` key a core error uses reaches the operator (`spec-005` §3.1 "One rule for every
 * `details` key", `bug-303`, task-375): one closed table, every key of one of three classes.
 *
 * - `entry`: rendered by its own rule (see {@link errorDetails}): `diagnostics`, `issues`, `unreadable`,
 *   `cause`;
 * - `labelled`: a value the reason does not state, one `<key>: <value>` line;
 * - `stated`: a value the reason already states, data for a caller of `src/core`, no line.
 *
 * A key not in the table is rendered as a labelled one; `test/core/error-details-keys.test.ts` fails on
 * it wherever a core error is built, so a new key is declared here in the change that adds it.
 */
export const DETAIL_KEYS: Readonly<Record<string, 'entry' | 'labelled' | 'stated'>> = Object.freeze({
  adapter: 'stated',
  applied: 'labelled',
  argv: 'labelled',
  awaiting: 'stated',
  candidates: 'stated',
  cause: 'entry',
  diagnostics: 'entry',
  element: 'stated',
  exit_status: 'stated',
  file: 'labelled',
  frontier: 'labelled',
  id: 'stated',
  instance: 'stated',
  instances: 'stated',
  issues: 'entry',
  kinds: 'stated',
  markers: 'stated',
  missing: 'stated',
  name: 'stated',
  pid: 'stated',
  record: 'stated',
  ref: 'stated',
  referrers: 'stated',
  rev: 'stated',
  run_id: 'stated',
  staged: 'stated',
  step: 'stated',
  steps: 'stated',
  timeout: 'stated',
  type: 'stated',
  unreadable: 'entry',
});

/**
 * The operator-facing details of `error` (`spec-005` §3.1), in this order (REQ-SYS-07: within a key, the
 * order core recorded, never re-sorted):
 *
 * 1. `diagnostics` (spec-003, task-136; see `diagnosticDetails`) or else `issues`: an issue contributes an
 *    entry only when it names a non-empty `file` or `detail`, and the entry carries only the fields it has;
 * 2. `unreadable`: one entry per string, an issue-shaped object read as an issue;
 * 3. `cause`: a string, one entry;
 * 4. every `labelled` key of {@link DETAIL_KEYS}, and every key the table does not declare, in ascending
 *    key order, as one `<key>: <value>` entry (see `labelledLine`). A `stated` key adds nothing.
 *
 * An entry equal to one already listed is not repeated, so a `cause` an issue repeats prints once.
 *
 * A `file` the error's `message` already contains, verbatim, is not repeated (task-130 review):
 * `ValidationError`'s message embeds `(<file>)` for every issue, so repeating it would print the path
 * twice. The entry keeps its `detail`, and an entry left with neither field is dropped. What remains is
 * exactly what the reason does not already say — for the illegal-transition refusal, whose message is
 * the bare `dl-032` contract string, both the file and the explanation.
 */
export function errorDetails(error: CoreError): readonly ErrorDetail[] {
  const details = error.details;
  if (details === undefined) return [];
  const entries: ErrorDetail[] = [];
  const push = (entry: ErrorDetail): void => {
    if (entries.some((listed) => listed.file === entry.file && listed.detail === entry.detail)) return;
    entries.push(entry);
  };
  const diagnostics = details.diagnostics;
  if (Array.isArray(diagnostics)) {
    for (const entry of diagnosticDetails(error.message, diagnostics as readonly Diagnostic[])) push(entry);
  } else if (Array.isArray(details.issues)) {
    for (const issue of details.issues as readonly unknown[]) pushIssue(error.message, issue, push);
  }
  if (Array.isArray(details.unreadable)) {
    for (const item of details.unreadable as readonly unknown[]) {
      if (typeof item === 'string') {
        if (item !== '') push({ detail: item });
      } else {
        pushIssue(error.message, item, push);
      }
    }
  }
  if (typeof details.cause === 'string' && details.cause !== '') push({ detail: details.cause });
  for (const key of Object.keys(details).sort()) {
    const cls = Object.prototype.hasOwnProperty.call(DETAIL_KEYS, key) ? DETAIL_KEYS[key] : 'labelled';
    if (cls !== 'labelled') continue;
    const line = labelledLine(key, details[key]);
    if (line !== undefined) push({ detail: line });
  }
  return entries;
}

/** Push the entry one issue-shaped value contributes (its non-empty `file` the message lacks, its non-empty `detail`). */
function pushIssue(message: string, issue: unknown, push: (entry: ErrorDetail) => void): void {
  if (typeof issue !== 'object' || issue === null) return;
  const { file, detail } = issue as { file?: unknown; detail?: unknown };
  const entry: ErrorDetail = {
    ...(typeof file === 'string' && file !== '' && !message.includes(file) ? { file } : {}),
    ...(typeof detail === 'string' && detail !== '' ? { detail } : {}),
  };
  if (entry.file !== undefined || entry.detail !== undefined) push(entry);
}

/**
 * The `<key>: <value>` line of a labelled (or undeclared) key: a string as is, an array of strings
 * `, `-joined, any other value as compact JSON. An empty string or array, and `undefined`, give no line.
 */
function labelledLine(key: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value === '' ? undefined : `${key}: ${value}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (value.every((item) => typeof item === 'string')) return `${key}: ${(value as string[]).join(', ')}`;
  }
  return `${key}: ${JSON.stringify(value)}`;
}

/**
 * The details of a refusal that carries spec-003 `diagnostics` (task-136) rather than `issues`: one
 * entry per diagnostic, in the loader's order, its `detail` the diagnostic in the reason form
 * (`formatDiagnostic`: code, path, file and message), so every further error and every warning reaches
 * the operator. The diagnostic the reason already is — the first error — is not repeated.
 */
function diagnosticDetails(reason: string, diagnostics: readonly Diagnostic[]): readonly ErrorDetail[] {
  const entries: ErrorDetail[] = [];
  for (const diagnostic of diagnostics) {
    const line = formatDiagnostic(diagnostic);
    if (line !== reason) entries.push({ detail: line });
  }
  return entries;
}
