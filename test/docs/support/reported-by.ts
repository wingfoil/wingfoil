/**
 * The `reported_by:` check — the engine of `test/docs/reported-by.test.ts`
 * (`task-271-add-a-reported-by-field-citing-a-consumer-feedback-note-as-pinned-provenance-checked-by-a-test`,
 * `dl-163` S3c, R2).
 *
 * A Memory element that answers a note a consumer filed in its feedback inbox may cite that note in an
 * optional `reported_by:` list, as provenance only: `<service id>/F-<nnn>@<sha>`. `dl-163` R8 keeps the
 * feedback loop out of the product in v0.3 (product-level validation is `bug-195`, v0.4), so this module
 * is the check, applied to every Memory document of this repository. An entry is accepted when:
 *
 * - **its shape** is `<service id>/F-<nnn>@<sha>`: a full `svc-<n>-<slug>` id (the service's file stem, as
 *   `supersedes:` takes a full id), `F-` and three digits or more (`dl-163` R4), and the consumer commit
 *   read as a full, lowercase object name (40 hexadecimal digits, or 64 in a SHA-256 repository), so the
 *   pin cannot become ambiguous;
 * - **its service** is registered here, `active`, and has a `feedback_inbox` that `feedbackInboxProblems`
 *   (`task-269`, `dl-163` S3b) accepts — which also requires `kind: repository`;
 * - **its document's type** declares the field (its scaffold carries a `reported_by:` key).
 *
 * The field itself is optional: absent, `null` or `[]` is accepted on every type that declares it.
 *
 * Pure apart from {@link readMemoryTree}, which reads a directory tree; findings come back in a fixed
 * order: documents by path, then entries in the order the document lists them (REQ-SYS-07).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

import { load } from 'js-yaml';

import { splitFrontmatter } from '../../../src/storage';
import { feedbackInboxProblems } from '../../core/helpers/service-fields';

/** The frontmatter field this module checks. */
export const REPORTED_BY = 'reported_by';

/** `<service id>/F-<nnn>@<sha>`: a full service id, a note id, a full object name. */
export const REPORTED_BY_ENTRY = /^(svc-\d+-[a-z0-9][a-z0-9.-]*)\/(F-\d{3,})@([0-9a-f]{40}|[0-9a-f]{64})$/;

/** The service state an inbox must be in to be cited (`dl-163` R2: a registered inbox). */
export const ACTIVE = 'active';

/** One Memory document: its repository-relative path and parsed frontmatter. */
export interface MemoryDocument {
  readonly path: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

/** One reason a document's `reported_by:` is refused. */
export interface ReportedByFinding {
  readonly path: string;
  readonly problem: string;
}

/** What the check needs to know about this repository's configuration and services. */
export interface ReportedByContext {
  /** The Memory types whose scaffold declares `reported_by:`. */
  readonly declaringTypes: ReadonlySet<string>;
  /** Every registered service's frontmatter, keyed by its id (the file stem). */
  readonly services: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

/**
 * Why one `reported_by:` entry is refused, in a fixed order; `[]` when it is accepted.
 *
 * @param entry - One item of the list, as parsed YAML.
 * @param services - Every registered service's frontmatter, keyed by id.
 */
export function entryProblems(entry: unknown, services: ReportedByContext['services']): string[] {
  if (typeof entry !== 'string') return [`entry ${JSON.stringify(entry)} is not a string`];
  const match = REPORTED_BY_ENTRY.exec(entry);
  if (match === null) return [`entry '${entry}' is not <service id>/F-<nnn>@<sha> (a full service id, F- and three digits or more, a full lowercase commit sha)`];
  const serviceId = match[1] as string;
  const service = services.get(serviceId);
  if (service === undefined) return [`entry '${entry}' names no registered service`];
  const problems: string[] = [];
  if (service.status !== ACTIVE) problems.push(`entry '${entry}' names a service that is not ${ACTIVE} (status: ${String(service.status)})`);
  const inbox = service.feedback_inbox;
  if (inbox === undefined || inbox === null || inbox === '') {
    problems.push(`entry '${entry}' names a service with no feedback_inbox`);
  } else {
    for (const problem of feedbackInboxProblems(service)) problems.push(`entry '${entry}' names a service whose ${problem}`);
  }
  return problems;
}

/**
 * Every finding on one document's `reported_by:`; `[]` when the field is absent, `null`, `[]`, or
 * every entry is accepted.
 */
export function documentProblems(document: MemoryDocument, context: ReportedByContext): ReportedByFinding[] {
  const value = document.fields[REPORTED_BY];
  if (value === undefined || value === null) return [];
  const finding = (problem: string): ReportedByFinding => ({ path: document.path, problem });
  const type = String(document.fields.type);
  if (!context.declaringTypes.has(type)) return [finding(`type '${type}' does not declare ${REPORTED_BY}`)];
  if (!Array.isArray(value)) return [finding(`${REPORTED_BY} must be a list`)];
  return value.flatMap((entry) => entryProblems(entry, context.services).map(finding));
}

/** Every finding over a set of documents, documents by path. */
export function reportedByProblems(documents: readonly MemoryDocument[], context: ReportedByContext): ReportedByFinding[] {
  return [...documents]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .flatMap((document) => documentProblems(document, context));
}

/** A document's frontmatter, parsed; `{}` when it has none. */
export function parseFields(content: string): Record<string, unknown> {
  const frontmatter = splitFrontmatter(content).frontmatter;
  if (frontmatter === null) return {};
  const parsed = load(frontmatter);
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

/**
 * Every `.md` file under `root/dir`, recursively, in sorted order, with its frontmatter parsed; `path`
 * is relative to `root`, with `/` separators.
 */
export function readMemoryTree(root: string, dir: string): MemoryDocument[] {
  const documents: MemoryDocument[] = [];
  const walk = (absolute: string): void => {
    const entries = readdirSync(absolute, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const child = join(absolute, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        documents.push({ path: relative(root, child).split(sep).join(posix.sep), fields: parseFields(readFileSync(child, 'utf-8')) });
      }
    }
  };
  walk(join(root, dir));
  return documents;
}

/** The services among `documents`, keyed by id (the file stem), in path order. */
export function servicesById(documents: readonly MemoryDocument[]): Map<string, Readonly<Record<string, unknown>>> {
  return new Map(
    documents
      .filter((document) => document.fields.type === 'service')
      .map((document) => [posix.basename(document.path, '.md'), document.fields] as const),
  );
}
