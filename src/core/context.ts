/**
 * The `spec-012-context-loader-relevance-filtering` context builder: the `directive-loader`
 * ({@link resolveRoleDirectives}, §5), the `dna-loader` (§4), the call into the `relevance-filter`
 * (`./relevance.ts`, §6), the validator (P5.4.4 sc. 3) and the canonical serializer (§7), behind one
 * public entry, {@link assembleExecutionContext} (task-176; task-037 built the directive half,
 * REQ-STATE-05).
 *
 * Every read is pinned to `spec-012` §2's `stateRef`: the entry resolves it once to a commit sha
 * (`resolveRevision`) and reads every pillar and every Memory document at that sha through task-137's
 * `…AtRev` readers. The working tree is never read, so the same `(role, element, stateRef, limits)`
 * yields the same bytes (§8, REQ-SYS-07).
 *
 * **Archived elements never reach a context** (REQ-STATE-06, the `{deprecated, superseded}` set
 * ratified by `dl-028-archived-states-excluded-from-context`): an archived subject element is refused,
 * and archived candidates are dropped by the relevance filter — both through the shared
 * `isArchivedStatus`.
 */
import * as jsYaml from 'js-yaml';
import { CORE_SCHEMA, dump, load, Type } from 'js-yaml';

import type { RolesYaml } from '../directives/schema';
import type { DnaYaml, Module, Paths, Project, Stacks, Team } from '../dna/schema';
import { isArchivedStatus, loadMemoryDocumentsAtRev, memoryUnreadableDiagnostic, type MemoryDocumentSummary } from '../memory';
import { readPathAtRev, readPathsAtRev, splitFrontmatter } from '../storage';
import { formatDiagnostic, parseYaml, type Diagnostic } from '../validation';

import { isRemovableCustomAssetPath } from './builtin-asset';
import {
  DNA_YAML_PATH,
  MEMORY_YAML_PATH,
  ROLES_YAML_PATH,
  loadDirectivesAtRev,
  loadDnaYamlAtRev,
  loadMemoryYamlAtRev,
  loadRolesYamlAtRev,
  type DirectiveFile,
} from './loaders';
import {
  DEFAULT_CONTEXT_LIMITS,
  selectRelevantMemoryDocuments,
  type ContextLimits,
  type RelevanceElementRef,
  type RelevantMemoryDocument,
} from './relevance';
import { resolveRevision, RevisionError } from './revision';
import { coreErr, coreOk, type CoreError, type CoreResult } from './types';

/**
 * The outcome of {@link resolveRoleDirectives}: the resolved directive files **and** any operator
 * diagnostics produced while resolving them.
 *
 * `warnings` is returned rather than written to `stderr` (or to a logger) on purpose: this is a
 * context-building path, where REQ-SYS-07 requires the output to be a pure function of the inputs.
 * A returned array keeps the diagnostic deterministic, unit-testable without capturing process
 * streams, and free for the eventual CLI/MCP surface (`task-055-auto-load-directives-by-role`) to
 * render however that surface renders warnings.
 */
export interface RoleDirectiveResolution {
  /** Deduplicated by directive id and sorted ascending by id — see {@link resolveRoleDirectives}. */
  readonly directives: readonly DirectiveFile[];
  /** Operator diagnostics, in a fixed order. Empty when the role's bindings are unremarkable. */
  readonly warnings: readonly string[];
}

/** `assignments` is a plain object parsed from YAML, so a role named `toString`, `constructor`,
 * `valueOf`, `hasOwnProperty` or `__proto__` would otherwise resolve to an inherited
 * `Object.prototype` member instead of `undefined`. Read own properties only. */
function ownAssignments(rolesYaml: RolesYaml, role: string): readonly string[] | undefined {
  return Object.prototype.hasOwnProperty.call(rolesYaml.assignments, role)
    ? rolesYaml.assignments[role]
    : undefined;
}

/**
 * The outcome of {@link selectDirectivesById}: one winning file per directive id, and one shadow
 * warning per id that more than one file defines.
 */
export interface DirectiveSelection {
  /** Winning file per directive id, keyed and iterated in ascending id order. */
  readonly byId: ReadonlyMap<string, DirectiveFile>;
  /** `directive '<id>' defined in <path>, <path>; using <winner>` — one per shadowed id, ascending by id. */
  readonly warnings: readonly string[];
}

/**
 * The single precedence rule between two directive files that share an id
 * (`dl-037-builtin-vs-custom-directive-precedence` A.1, `spec-012` §5): negative when `a` wins.
 *
 * A `custom/` file beats any other — "custom" decided by REQ-SEC-07's structural discriminator
 * {@link isRemovableCustomAssetPath}, which keys on the `custom` directory segment and accepts both
 * path separators (`loadDirectives` builds `path` with the platform `join`). `frontmatter.kind` is not
 * consulted: it can disagree with the directory, and the directory is what REQ-SEC-07 trusts. Within
 * the same tier the lexicographically smallest `path` wins, so the order is total and independent of
 * the order files arrive in (REQ-SYS-07).
 */
function compareDirectivePrecedence(a: DirectiveFile, b: DirectiveFile): number {
  const aCustom = isRemovableCustomAssetPath('directive', a.path);
  const bCustom = isRemovableCustomAssetPath('directive', b.path);
  if (aCustom !== bCustom) return aCustom ? -1 : 1;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * Deduplicate `directiveFiles` by `frontmatter.id` — the one place WingFoil decides which of several
 * same-id directive files is in force. Both {@link resolveRoleDirectives} (context assembly) and the
 * `directives list` payload (`./directives-list.ts`, `dl-042-directives-list-output-contract` A) call
 * this, so the rule the listing *reports* is the rule context assembly *applies*.
 *
 * - Precedence: `custom/` wins over `built-in/`, then smallest path (see `compareDirectivePrecedence`).
 * - A shadowed file is **reported, never silently dropped** (dl-037 B.1): one warning per shadowed id,
 *   naming every file that defines it (in precedence-independent path order) and the winner.
 * - `ids`, when given, restricts selection (and warnings) to those directive ids.
 */
export function selectDirectivesById(
  directiveFiles: readonly DirectiveFile[],
  ids?: ReadonlySet<string>,
): DirectiveSelection {
  const candidates = new Map<string, DirectiveFile[]>();
  for (const file of directiveFiles) {
    const id = file.frontmatter.id;
    if (ids !== undefined && !ids.has(id)) continue;
    const list = candidates.get(id);
    if (list === undefined) candidates.set(id, [file]);
    else list.push(file);
  }

  const byId = new Map<string, DirectiveFile>();
  const warnings: string[] = [];
  // Ascending by id (REQ-SYS-07): never `roles.yaml` listing order or file-system enumeration order.
  // `candidates` is keyed by id, so no two keys are equal and a two-way compare is total here.
  for (const [id, files] of [...candidates].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [winner] = [...files].sort(compareDirectivePrecedence) as [DirectiveFile, ...DirectiveFile[]];
    byId.set(id, winner);
    if (files.length > 1) {
      const paths = files.map((file) => file.path).sort();
      warnings.push(`directive '${id}' defined in ${paths.join(', ')}; using ${winner.path}`);
    }
  }
  return { byId, warnings };
}

/**
 * Resolve the directives bound to `role` — its own `roles.yaml` `assignments[role]` entries plus every
 * `global` directive — per `spec-012-context-loader-relevance-filtering` §5 and
 * `dl-029-role-with-no-directive-assignments` (`ready`, option (c)).
 *
 * Behaviour, point by point:
 *
 * - **Globals are unconditional** (spec-012 §5). Every role gets them, including a role with no
 *   bindings of its own — globals exist precisely so that no role can be configured out of
 *   `security-secrets` (dl-029, Rationale).
 * - **A role that contributes no assignments of its own** — absent from `assignments`, or bound to an
 *   explicitly empty list — resolves to exactly the globals **and** produces the warning
 *   `no directives assigned to role '<role>'`. This is dl-029's ratified hybrid, and it is the
 *   behaviour the edge scenario of `p3-directives/P3.6-auto-load-by-role.feature` specifies
 *   ("the agent context contains only the global directives" + that warning). Never an error.
 *   Role-name lookup reads **own** properties only, so a role named after an `Object.prototype`
 *   member (`toString`, `constructor`, …) is treated as unbound like any other unknown role.
 * - **Deduplicated by directive id, `custom/` winning over `built-in/`** (spec-012 §5, dl-037 A.1),
 *   through the shared {@link selectDirectivesById}; each shadowed id the role is bound to adds a
 *   warning naming the files and the winner (dl-037 B.1).
 * - **A dangling binding is reported** — an id bound to the role (own assignment or global) with no
 *   file in `directiveFiles` adds `directive '<id>' bound to role '<role>' has no directive file`
 *   (`dl-042-directives-list-output-contract` D). It is still not an error: the rest resolves.
 * - **Sorted ascending by directive id** (spec-012 §5: "never rely on `roles.yaml` listing order or
 *   file-system enumeration order", REQ-SYS-07).
 * - `warnings` has a fixed order: the no-assignments warning, then dangling ids ascending, then
 *   shadowed ids ascending.
 *
 * This is REQ-STATE-05's Fit Criterion made concrete: for any two distinct roles with disjoint
 * `assignments`, the resolved sets are disjoint too (100% of one role's directives, 0% of the other's).
 */
export function resolveRoleDirectives(
  directiveFiles: readonly DirectiveFile[],
  rolesYaml: RolesYaml,
  role: string,
): RoleDirectiveResolution {
  const assigned = ownAssignments(rolesYaml, role);
  const warnings = assigned === undefined || assigned.length === 0
    ? [`no directives assigned to role '${role}'`]
    : [];

  const allowedIds = new Set<string>([...(assigned ?? []), ...rolesYaml.global]);
  const selection = selectDirectivesById(directiveFiles, allowedIds);

  const dangling = [...allowedIds].filter((id) => !selection.byId.has(id)).sort();
  for (const id of dangling) warnings.push(`directive '${id}' bound to role '${role}' has no directive file`);
  warnings.push(...selection.warnings);

  return { directives: [...selection.byId.values()], warnings };
}

// --- The context builder (spec-012 §1–§8, task-176) ----------------------------------------------

/** The active Memory element a context is built for (`spec-012` §2 `ContextRequest.element`). */
export interface ExecutionContextElement {
  readonly type: string;
  readonly id: string;
}

/**
 * `spec-012` §2's `ContextRequest`: everything a context is a function of. Nothing else is read — no
 * clock, no environment, no working tree.
 */
export interface ContextRequest {
  /** The role the agent executes under (`roles.yaml` binding, §5). */
  readonly role: string;
  /** The element the context is built for, usually a `task`. */
  readonly element: ExecutionContextElement;
  /** The revision every read is pinned to — a sha, or any name of one commit (`HEAD`, a branch). It is
   * resolved once; the payload records the full sha. */
  readonly stateRef: string;
  /** Memory caps (§6); {@link DEFAULT_CONTEXT_LIMITS} when omitted. */
  readonly limits?: ContextLimits;
}

/** The subject element as `stateRef` holds it (§3 stage 1, `resolve-element`). */
export interface ContextElementDocument extends MemoryDocumentSummary {
  readonly type: string;
  readonly id: string;
  /** As the document wrote it: a timestamp value is a {@link WrittenTimestamp} (its text as written), never a `Date`. */
  readonly frontmatter: Record<string, unknown>;
}

/**
 * The DNA sections `spec-012` §4 selects. Its own keys are inserted in `dna.yaml`'s declared order, and
 * that order is the order §7 emits them in.
 */
export interface DnaSelection {
  readonly project?: Project;
  /** The element's `modules:`/`scope:` entries, or every module when it declares neither. */
  readonly modules: readonly Module[];
  /** Whole, technologies and methodologies (`dl-151` option A). */
  readonly stacks?: Stacks;
  readonly team?: Team;
  /** Every category, `runs` included. */
  readonly paths?: Paths;
}

/** A resolved directive and its Markdown body, which §7 carries verbatim. */
export interface ContextDirective extends DirectiveFile {
  readonly body: string;
}

/**
 * The assembled execution context (P5.4.4 sc. 1: "distinct DNA, Memory, and Directives sections",
 * "each section is individually addressable"; REQ-STATE-05). Each section is its own property, checked
 * by {@link validateExecutionContext} before {@link serializeExecutionContext} renders it.
 */
export interface ExecutionContext {
  readonly role: string;
  /** The full sha `ContextRequest.stateRef` resolved to. */
  readonly stateRef: string;
  /** §7 `## 1. Task`. */
  readonly element: ContextElementDocument;
  /** §7 `## 2. Project DNA`. */
  readonly dna: DnaSelection;
  /** §7 `## 3. Directives`: the role's directives and the globals, ascending by id ({@link resolveRoleDirectives}). */
  readonly directives: readonly ContextDirective[];
  /** §7 `## 4. Relevant Memory`, in §6 order and within the request's limits. Each `frontmatter` is as
   * the document wrote it: a timestamp value is a {@link WrittenTimestamp} (its text as written), never a `Date`. */
  readonly memory: readonly RelevantMemoryDocument[];
  /** {@link RoleDirectiveResolution.warnings}: §5.1's three kinds in their fixed order. Diagnostics
   * *about* the context, never part of the payload (dl-050, dl-051). */
  readonly warnings: readonly string[];
}

/** What {@link assembleExecutionContext} returns: the context, its §7 bytes, and the notes recorded
 * while building it — diagnostics, kept out of `payload` like `context.warnings`. */
export interface AssembledExecutionContext {
  readonly context: ExecutionContext;
  /** The canonical §7 payload: UTF-8, LF-only, exactly one trailing `\n`. */
  readonly payload: string;
  /** In §3 stage order: `no module matches the element's modules:/scope: (…); all modules included`
   * when the element names modules and none matches (§4, ruling D3), then `no relevant Memory found
   * for task` when nothing passed the relevance threshold (P5.3.3 sc. 3). */
  readonly notes: readonly string[];
}

/**
 * The sections {@link validateExecutionContext} checks, in §7 order, with the shape each must have.
 * The name is the {@link ExecutionContext} property, so the refusal names what to address.
 */
const REQUIRED_SECTIONS: readonly (readonly [string, (value: unknown) => boolean])[] = [
  ['element', (value) => isRecord(value)],
  ['dna', (value) => isRecord(value) && Array.isArray(value.modules)],
  ['directives', (value) => Array.isArray(value)],
  ['memory', (value) => Array.isArray(value)],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function missingSection(name: string): string {
  return `invalid execution context: missing '${name}' section`;
}

/**
 * Validate an assembled context before anything uses it (P5.4.4 sc. 3). The first section that is
 * absent, or not of its section's shape, refuses the context with `VALIDATION` and the scenario's
 * message, verbatim: `invalid execution context: missing '<section>' section`. Sections are checked in
 * §7 order — `element`, `dna`, `directives`, `memory` — so the refusal is deterministic.
 */
export function validateExecutionContext(candidate: unknown): CoreResult<ExecutionContext> {
  const value = isRecord(candidate) ? candidate : {};
  for (const [name, hasShape] of REQUIRED_SECTIONS) {
    if (!hasShape(value[name])) return coreErr({ code: 'VALIDATION', message: missingSection(name) });
  }
  return coreOk(candidate as unknown as ExecutionContext);
}

/**
 * The payload's format version (`dl-150` option B, the `dl-149` format key): the first field of the
 * header comment. A change to the bytes §7 pins is a new format.
 */
export const CONTEXT_PAYLOAD_FORMAT = 1;

/**
 * A YAML timestamp scalar exactly as its document wrote it (`bug-232`, review F1 of task-255): the
 * frontmatter the payload carries holds one of these where js-yaml's default schema would hold a
 * `Date`, so `2026-10-05`, `2026-10-05T00:00:00Z` and `2026-10-05 10:00:00 +02:00` are re-emitted
 * unchanged rather than normalized to an instant.
 */
export class WrittenTimestamp {
  constructor(
    /** The scalar's text, as written. */
    readonly text: string,
  ) {}

  /** The text as written, so `JSON.stringify` of a context renders the timestamp as the document did. */
  toJSON(): string {
    return this.text;
  }
}

// js-yaml 4 exports its built-in types as `types`; `@types/js-yaml` does not declare that export.
const types = (jsYaml as unknown as { readonly types: Readonly<Record<'merge' | 'binary' | 'omap' | 'pairs' | 'set' | 'timestamp', Type>> }).types;

/** js-yaml's timestamp tag and resolution, constructing a {@link WrittenTimestamp} instead of a `Date`. */
const WRITTEN_TIMESTAMP_TYPE = new Type('tag:yaml.org,2002:timestamp', {
  kind: 'scalar',
  resolve: (data: unknown) => types.timestamp.resolve(data),
  construct: (data: string) => new WrittenTimestamp(data),
  instanceOf: WrittenTimestamp,
  represent: (value: object) => (value as WrittenTimestamp).text,
});

/**
 * The schema the payload's frontmatter is read and dumped with: js-yaml's default schema (same implicit
 * and explicit types, so it accepts what the scan accepted) with {@link WRITTEN_TIMESTAMP_TYPE} in place
 * of the timestamp type. A timestamp is written back as written; a quoted date is a string that a reader
 * could take for a timestamp, so the dump keeps it quoted.
 */
const PAYLOAD_YAML_SCHEMA = CORE_SCHEMA.extend({
  implicit: [WRITTEN_TIMESTAMP_TYPE, types.merge],
  explicit: [types.binary, types.omap, types.pairs, types.set],
});

/** `value` with every `Date` — a value a caller built itself, never one the builder read — as its
 * ISO-8601 UTC text, at any depth, so {@link serializeExecutionContext} accepts it. */
function withDatesAsWritten(value: unknown): unknown {
  if (value instanceof WrittenTimestamp) return value;
  if (value instanceof Date) return new WrittenTimestamp(value.toISOString());
  if (Array.isArray(value)) return value.map(withDatesAsWritten);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, withDatesAsWritten(entry)]));
  return value;
}

/**
 * The frontmatter of each document at `paths`, as commit `sha` holds it, read with
 * {@link PAYLOAD_YAML_SCHEMA} so its timestamps keep their text (`bug-232`). Every path was read and
 * parsed at `sha` by the scan already, with a schema that accepts the same documents, and each one
 * has a frontmatter block: the element is found, and a document carried, by its frontmatter's `type`
 * and `id`.
 */
function writtenFrontmatter(root: string, sha: string, paths: readonly string[]): Record<string, unknown>[] {
  return readPathsAtRev(root, sha, [...paths]).map(
    (raw) => load(splitFrontmatter(raw!).frontmatter!, { schema: PAYLOAD_YAML_SCHEMA }) as Record<string, unknown>,
  );
}

/** YAML for the payload: keys sorted ascending (§7), no line folding and no anchors, dates as written
 * (`bug-232`), so the text is a function of the value alone. */
function canonicalYaml(value: unknown): string {
  return dump(withDatesAsWritten(value), { schema: PAYLOAD_YAML_SCHEMA, sortKeys: true, lineWidth: -1, noRefs: true });
}

function yamlBlock(value: unknown): string {
  return '```yaml\n' + canonicalYaml(value) + '```';
}

/** A body as §7 carries it: verbatim, without the blank lines before it or the whitespace after it. */
function trimBody(body: string): string {
  return body.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
}

/** The line that closes the body keyed `key` (`dl-150` B). */
function endMarker(key: string): string {
  return `<!-- end:${key} -->`;
}

/**
 * A body between its markers: `<!-- begin:<key> -->`, the trimmed body, `<!-- end:<key> -->`, each on
 * its own line; an empty body leaves the two markers adjacent.
 */
function markedBody(key: string, body: string): string {
  const trimmed = trimBody(body);
  return [`<!-- begin:${key} -->`, ...(trimmed.length > 0 ? [trimmed] : []), endMarker(key)].join('\n');
}

/**
 * Whether `body`, once canonicalized (§7), holds the line that closes it — the one body a reader could
 * not split by `dl-150` B's rule, so it never enters a payload.
 */
function closesItself(key: string, body: string): boolean {
  const marker = endMarker(key);
  return canonicalize(body).split('\n').includes(marker);
}

function selfClosingProblem(what: string, key: string): string {
  return `${what} cannot enter an execution context: its body holds the line ${JSON.stringify(endMarker(key))} that closes it`;
}

/** The marker key of a directive body. */
function directiveKey(id: string): string {
  return `directive:${id}`;
}

/** Whether a Memory document can be named in the payload: a string `type` and `id`, each fit for a
 * heading and a marker (no control character, no `-->`). */
function isNameable(type: unknown, id: unknown): boolean {
  return (
    typeof type === 'string' &&
    typeof id === 'string' &&
    type.length > 0 &&
    id.length > 0 &&
    headerFieldProblem('type', type) === undefined &&
    headerFieldProblem('id', id) === undefined
  );
}

/** §7's canonicalization: LF only, no trailing whitespace on any line, exactly one trailing `\n`. */
function canonicalize(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n+$/, '') + '\n'
  );
}

/**
 * Why `value` cannot sit in the payload's header comment, or `undefined` when it can. The header is one
 * line inside `<!-- … -->`: a line break would split it, and `-->` would close the comment early and
 * let the rest of the value pass for payload content. Control characters are refused with them.
 */
function headerFieldProblem(name: string, value: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value) || value.includes('-->')) {
    return `invalid ${name} ${JSON.stringify(value)}: it may hold no control character and no '-->'`;
  }
  return undefined;
}

/** The first body in `context` that {@link closesItself}, as its refusal; `undefined` when none does.
 * The element first, then directives in payload order. */
function selfClosingBody(context: ExecutionContext): string | undefined {
  const { element } = context;
  const elementKey = `${element.type}:${element.id}`;
  if (closesItself(elementKey, element.body)) return selfClosingProblem(`element '${elementKey}'`, elementKey);
  for (const directive of context.directives) {
    const key = directiveKey(directive.frontmatter.id);
    if (closesItself(key, directive.body)) return selfClosingProblem(`directive '${directive.frontmatter.id}'`, key);
  }
  return undefined;
}

/**
 * Render a context as `spec-012` §7's canonical Markdown payload, format {@link CONTEXT_PAYLOAD_FORMAT}
 * (`dl-150` option B) — the bytes §8 holds identical across builds. Fixed headings in a fixed order,
 * one blank line between blocks; frontmatter and DNA sections as fenced YAML with sorted keys; every
 * directive and document body verbatim between `<!-- begin:<key> -->`/`<!-- end:<key> -->` markers
 * (`<type>:<id>` for the element and Memory, `directive:<id>` for a directive), so a body's own
 * headings never pass for §7's; ids rather than paths; the header names only the format, role, element
 * and the resolved sha. `warnings` are not rendered.
 *
 * @throws Error `invalid execution context: missing '<section>' section` when `context` does not
 *   validate ({@link validateExecutionContext}): a partial payload is never rendered. Error `invalid
 *   role …` (or `element type`/`element id`/`directive id`) when a header field or a directive id holds
 *   a control character or `-->`; `invalid Memory document <path>: …` for a document it cannot name;
 *   `… cannot enter an execution context: its body holds the line … that closes it` for a body that
 *   holds its own end marker.
 */
export function serializeExecutionContext(context: ExecutionContext): string {
  const valid = validateExecutionContext(context);
  if (!valid.ok) throw new Error(valid.error.message);
  const unsafe =
    headerFieldProblem('role', context.role) ??
    headerFieldProblem('element type', context.element.type) ??
    headerFieldProblem('element id', context.element.id) ??
    context.directives.map((directive) => headerFieldProblem('directive id', directive.frontmatter.id)).find((problem) => problem !== undefined) ??
    selfClosingBody(context);
  if (unsafe !== undefined) throw new Error(unsafe);

  const { role, stateRef, element, dna, directives, memory } = context;
  // The header comment sits on the title's next line, as §7's template shows.
  const blocks: string[] = [
    `# WingFoil Agent Context\n<!-- format: ${CONTEXT_PAYLOAD_FORMAT} | role: ${role} | element: ${element.type}:${element.id} | state: ${stateRef} -->`,
  ];

  blocks.push('## 1. Task', yamlBlock(element.frontmatter), markedBody(`${element.type}:${element.id}`, element.body));

  blocks.push('## 2. Project DNA');
  for (const [name, value] of Object.entries(dna)) blocks.push(`### ${name}`, yamlBlock(value));

  blocks.push(`## 3. Directives (${role} + global)`);
  for (const directive of directives) {
    blocks.push(`### ${directive.frontmatter.id}`, markedBody(directiveKey(directive.frontmatter.id), directive.body));
  }

  blocks.push(`## 4. Relevant Memory (${memory.length} documents)`);
  for (const doc of memory) {
    if (!isNameable(doc.type, doc.id)) {
      throw new Error(
        `invalid Memory document ${doc.path}: an execution context names a document by a type and an id that hold no control character and no '-->'`,
      );
    }
    const key = `${doc.type!}:${doc.id!}`;
    if (closesItself(key, doc.body)) throw new Error(selfClosingProblem(`Memory document '${key}'`, key));
    blocks.push(`### ${key}`, yamlBlock(doc.frontmatter), markedBody(key, doc.body));
  }

  return canonicalize(blocks.join('\n\n'));
}

function asNames(value: unknown): string[] {
  const entries = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  return entries.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

/** A path with `\` read as `/` and no trailing `/`, so `src/core/` and `src/core` compare equal. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Leading characters an entry's token never starts with: quotes and backticks. */
const TOKEN_LEAD = /^[`'"]+/;
/** Trailing characters an entry's token never ends with: list and sentence punctuation, quotes and
 * backticks (`bug-233`). */
const TOKEN_TRAIL = /[`'".,;:!?]+$/;

/**
 * The tokens one `modules:`/`scope:` value names (`spec-012` §4, `bug-233`): parenthesised text is
 * set aside, the rest is split on commas into entries, and each entry is read by its leading token
 * with surrounding quotes, backticks and trailing punctuation stripped — `src/mcp/server.ts, src/cli
 * (the \`wingfoil mcp\` command)` names `src/mcp/server.ts` and `src/cli`.
 */
function entryTokens(entry: string): string[] {
  let text = entry;
  for (let previous = ''; previous !== text; ) {
    previous = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  }
  return text
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0]!.replace(TOKEN_LEAD, '').replace(TOKEN_TRAIL, ''))
    .filter((token) => token.length > 0);
}

/** Whether `inner` equals `outer` or lies under it at a segment boundary. */
function isAtOrUnder(inner: string, outer: string): boolean {
  return outer.length > 0 && (inner === outer || inner.startsWith(`${outer}/`));
}

/**
 * Whether one token of a `modules:`/`scope:` entry selects `module` (`spec-012` §4, approver ruling D3
 * and `bug-233`): it equals the module's `name`, or — as a path, compared at segment boundaries — the
 * module's `path` equals it, lies under it (`src` selects `src/core`), or holds it (`src/mcp/server.ts`
 * selects `src/mcp`). `src/co` selects nothing.
 */
function tokenSelectsModule(token: string, module: Module): boolean {
  if (token === module.name) return true;
  if (module.path === undefined) return false;
  const named = normalizePath(token);
  const path = normalizePath(module.path);
  return isAtOrUnder(path, named) || isAtOrUnder(named, path);
}

/** The note recorded when the element names modules and none of them matches (ruling D3). */
function noModuleMatchNote(entries: readonly string[]): string {
  return `no module matches the element's modules:/scope: (${entries.map((entry) => JSON.stringify(entry)).join(', ')}); all modules included`;
}

/** The top-level keys of a `dna.yaml` text that has already validated, in the order the file
 * declares them. */
function declaredKeyOrder(raw: string, label: string): string[] {
  return Object.keys(parseYaml(raw, label) as Record<string, unknown>);
}

/**
 * `spec-012` §4, the `dna-loader`: `project`, `stacks` (`dl-151` A) and `team` always, `paths` whole
 * (every category), and the `modules` the tokens of the element's `modules:`/`scope:` entries select
 * ({@link entryTokens}, {@link tokenSelectsModule}), in
 * `dna.yaml` order. Every module when it names none — and also when it names some and none matches,
 * which then returns a note (ruling D3) for the caller's diagnostics. Sections are inserted in
 * `declaredOrder`, the file's own key order.
 */
function selectDnaSections(
  dna: DnaYaml,
  declaredOrder: readonly string[],
  frontmatter: Record<string, unknown>,
): { readonly selection: DnaSelection; readonly note?: string } {
  const entries = [...asNames(frontmatter.modules), ...asNames(frontmatter.scope)];
  const tokens = entries.flatMap(entryTokens);
  const matched = dna.modules.filter((module) => tokens.some((token) => tokenSelectsModule(token, module)));
  const unmatched = entries.length > 0 && matched.length === 0;
  const sections: Record<string, unknown> = {
    project: dna.project,
    modules: matched.length === 0 ? dna.modules : matched,
    stacks: dna.stacks,
    team: dna.team,
    paths: dna.paths,
  };
  const selection: Record<string, unknown> = {};
  for (const key of declaredOrder) if (sections[key] !== undefined) selection[key] = sections[key];
  return unmatched
    ? { selection: selection as unknown as DnaSelection, note: noModuleMatchNote(entries) }
    : { selection: selection as unknown as DnaSelection };
}

/** The Markdown body of each resolved directive, read at `sha` (`DirectiveFile.path` is relative to
 * `.wingfoil/`). */
function withBodies(root: string, sha: string, directives: readonly DirectiveFile[]): ContextDirective[] {
  return directives.map((directive) => {
    const raw = readPathAtRev(root, sha, `.wingfoil/${directive.path.split(/[\\/]/).join('/')}`) ?? '';
    return { ...directive, body: splitFrontmatter(raw).body };
  });
}

function stringField(frontmatter: Record<string, unknown>, key: string): string | undefined {
  const value = frontmatter[key];
  return typeof value === 'string' ? value : undefined;
}

/** The pillar file whose absence at `stateRef` leaves each section unset, keyed by the refusal. */
const ABSENT_PILLAR_FILE: Readonly<Record<string, string>> = {
  [missingSection('element')]: MEMORY_YAML_PATH,
  [missingSection('dna')]: DNA_YAML_PATH,
  [missingSection('directives')]: ROLES_YAML_PATH,
};

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * A request the builder refuses before reading anything (`VALIDATION`): a role or element field that
 * cannot sit in the payload header (`headerFieldProblem`), or limits that are not positive integers —
 * `NaN`, a fraction, zero or a negative number would make §6's bounding meaningless.
 */
function requestProblem(request: ContextRequest): CoreError | undefined {
  const header =
    headerFieldProblem('role', request.role) ??
    headerFieldProblem('element type', request.element.type) ??
    headerFieldProblem('element id', request.element.id);
  if (header !== undefined) return { code: 'VALIDATION', message: header };
  const { limits } = request;
  if (limits !== undefined && !(isPositiveInteger(limits.maxDocs) && isPositiveInteger(limits.maxBytes))) {
    return {
      code: 'VALIDATION',
      message: `invalid context limits: maxDocs and maxBytes must be positive integers (got ${String(limits.maxDocs)}, ${String(limits.maxBytes)})`,
    };
  }
  return undefined;
}

/** What `payloadCandidates` returns: the documents §6 may rank, and the reports of those left out. */
interface PayloadCandidates {
  readonly carried: readonly MemoryDocumentSummary[];
  /** `W_MEMORY_UNREADABLE` diagnostics, in path order. */
  readonly left: readonly Diagnostic[];
}

/** Ranks with no bound: used only to learn which unnameable documents would have been relevant. */
const UNBOUNDED: ContextLimits = { maxDocs: Number.MAX_SAFE_INTEGER, maxBytes: Number.MAX_SAFE_INTEGER };

/**
 * The Memory documents §7 can carry (`dl-150` B), before §6 ranks them: a document needs a nameable
 * `type` and `id` ({@link isNameable}) for its heading and markers, and a body that does not hold its
 * own end marker ({@link closesItself}). An unnameable document is reported only when §6 would have
 * found it relevant — a repository's frontmatter-less files (grandfathered plans) would otherwise be
 * reported in every context; a self-closing one is always reported. Neither takes a slot in the
 * bounds, so the documents carried are what §6 selects among the rest.
 */
function payloadCandidates(documents: readonly MemoryDocumentSummary[], element: RelevanceElementRef): PayloadCandidates {
  const carried: MemoryDocumentSummary[] = [];
  const unnamed: MemoryDocumentSummary[] = [];
  const left: { readonly path: string; readonly diagnostic: Diagnostic }[] = [];
  for (const doc of documents) {
    const { type, id } = doc.frontmatter;
    if (!isNameable(type, id)) {
      unnamed.push(doc);
      continue;
    }
    const key = `${type as string}:${id as string}`;
    if (closesItself(key, doc.body)) {
      const reason = `its body holds the line ${JSON.stringify(endMarker(key))} that closes it in an execution context`;
      left.push({ path: doc.path, diagnostic: memoryUnreadableDiagnostic(doc.path, reason) });
    } else carried.push(doc);
  }
  for (const doc of selectRelevantMemoryDocuments(unnamed, element, UNBOUNDED).documents) {
    const reason = 'no string type and id, so an execution context cannot name it';
    left.push({ path: doc.path, diagnostic: memoryUnreadableDiagnostic(doc.path, reason) });
  }
  // A path is reported at most once, so no two compare equal.
  left.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { carried, left: left.map((entry) => entry.diagnostic) };
}

/**
 * Build the execution context for `request` — `spec-012`'s single public entry (§1), the context
 * `agent execute` (task-218) and the `{role}-session` Prompt (task-195) hand an agent.
 *
 * The §3 pipeline, every read at the one commit `request.stateRef` resolves to:
 *
 * 1. **resolve-element**: every Memory document at that commit is read once
 *    (`loadMemoryDocumentsAtRev`); the element is found in that snapshot. Absent → `NOT_FOUND`;
 *    archived (`isArchivedStatus`) → `VALIDATION`, since an archived document never enters a context
 *    (REQ-STATE-06). A `draft` element assembles.
 * 2. **load-dna** (§4): see `selectDnaSections`; modules match by name or path (ruling D3, `bug-233`).
 * 3. **load-directives** (§5): {@link resolveRoleDirectives} over the directives and `roles.yaml` at the
 *    commit; its warnings become `context.warnings`.
 * 4. **filter-memory** (§6): `selectRelevantMemoryDocuments` over the same snapshot, within
 *    `request.limits`, among the documents §7 can carry (`dl-150` B, `payloadCandidates`): one with
 *    no nameable `type` and `id` is left out, and reported only when it would have been relevant; one
 *    whose body holds its own end marker is left out and reported. Both reports are
 *    `W_MEMORY_UNREADABLE` lines on the success warnings, after the scan's own, in path order.
 * 5. **validate** (P5.4.4 sc. 3) and **serialize** (§7).
 *
 * A pillar file the commit does not hold leaves its section unset, and step 5 refuses the context:
 * no `roles.yaml` → `missing 'directives'`, no `dna.yaml` → `missing 'dna'`, no `memory.yaml` →
 * `missing 'element'`; the refusal's `details.cause` names the file (`no .wingfoil/roles.yaml at <sha>`).
 * Before any read, a role or element field holding a control character or `-->`, or limits that are
 * not positive integers, are refused as `VALIDATION`. After the reads, an element or directive body
 * that holds its own end marker, or a directive id holding a control character or `-->`, refuses the
 * context as `VALIDATION`: neither may be dropped (§5 never truncates a directive).
 *
 * A Memory document that does not parse is left out and reported (task-171): as a `W_MEMORY_UNREADABLE`
 * line in the result's `warnings` on success, and in `details.unreadable` of a `NOT_FOUND` refusal, so
 * a subject that does not parse is not reported as merely absent. Neither reaches the payload.
 *
 * Expected failures are returned, never thrown: a `stateRef` that is malformed or names no commit is
 * the `RevisionError`'s own `CoreError`. A pillar file (`dna.yaml`, `roles.yaml`, a directive) that
 * does not parse still throws `ValidationError`, as its loader does.
 */
export function assembleExecutionContext(root: string, request: ContextRequest): CoreResult<AssembledExecutionContext> {
  const refused = requestProblem(request);
  if (refused !== undefined) return coreErr(refused);

  let sha: string;
  try {
    sha = resolveRevision(root, request.stateRef);
  } catch (error) {
    if (error instanceof RevisionError) return coreErr(error.toCoreError());
    throw error;
  }
  const { role, element: wanted } = request;
  const label = `${wanted.type}:${wanted.id}`;

  // The scan is tolerant (task-171, `bug-031`): a document it cannot read is left out and reported as
  // `W_MEMORY_UNREADABLE`, so one malformed sibling no longer fails every context. It reads archived
  // documents too — the archived subject is refused below, and §6 drops archived candidates itself.
  const diagnostics: Diagnostic[] = [];
  const memoryYaml = loadMemoryYamlAtRev(root, sha);
  const documents =
    memoryYaml === null
      ? null
      : loadMemoryDocumentsAtRev(root, sha, memoryYaml, { onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) });
  const unreadable = diagnostics.map(formatDiagnostic);
  const found = documents?.find(
    (doc) => stringField(doc.frontmatter, 'type') === wanted.type && stringField(doc.frontmatter, 'id') === wanted.id,
  );
  if (documents !== null && found === undefined) {
    // A subject whose own frontmatter does not parse is among the unreadable files: name them, so the
    // refusal does not read as a bare "not found".
    return coreErr({
      code: 'NOT_FOUND',
      message: `element '${label}' not found at ${sha}`,
      ...(unreadable.length > 0 ? { details: { unreadable } } : {}),
    });
  }
  const status = found === undefined ? undefined : stringField(found.frontmatter, 'status');
  if (isArchivedStatus(status)) {
    return coreErr({
      code: 'VALIDATION',
      message: `element '${label}' is ${status}: an archived element never enters an execution context`,
    });
  }
  const element = found === undefined ? undefined : { ...found, type: wanted.type, id: wanted.id };
  const frontmatter = element?.frontmatter ?? {};

  // `loadDnaYamlAtRev` validates; the raw text gives the declared section order, which the
  // Zod-parsed object loses (schema keys come first there). `loadDnaYamlAtRev` is non-null whenever
  // the raw read is: both read the same path at the same sha.
  const dnaRaw = readPathAtRev(root, sha, DNA_YAML_PATH);
  const dnaSelected =
    dnaRaw === null
      ? undefined
      : selectDnaSections(loadDnaYamlAtRev(root, sha)!, declaredKeyOrder(dnaRaw, `${sha}:${DNA_YAML_PATH}`), frontmatter);
  const dna = dnaSelected?.selection;

  const rolesYaml = loadRolesYamlAtRev(root, sha);
  const resolution = rolesYaml === null ? undefined : resolveRoleDirectives(loadDirectivesAtRev(root, sha), rolesYaml, role);
  const directives = resolution === undefined ? undefined : withBodies(root, sha, resolution.directives);

  const candidates =
    documents === null ? undefined : payloadCandidates(documents, { ...wanted, frontmatter });
  const relevant =
    candidates === undefined
      ? undefined
      : selectRelevantMemoryDocuments(candidates.carried, { ...wanted, frontmatter }, request.limits ?? DEFAULT_CONTEXT_LIMITS);

  // The payload carries the frontmatter as written (`bug-232`): the element and the selected documents
  // are re-read at the commit with the payload's schema. Selection above used the scan's parse.
  const carried = [...(element === undefined ? [] : [element]), ...(relevant?.documents ?? [])];
  const written = writtenFrontmatter(root, sha, carried.map((doc) => doc.path));
  const offset = carried.length - (relevant?.documents.length ?? 0);
  const validated = validateExecutionContext({
    role,
    stateRef: sha,
    element: element === undefined ? undefined : { ...element, frontmatter: written[0]! },
    dna,
    directives,
    memory: relevant?.documents.map((doc, index) => ({ ...doc, frontmatter: written[offset + index]! })),
    warnings: resolution?.warnings ?? [],
  });
  if (!validated.ok) {
    // Every section the builder can leave unset is unset by an absent pillar file (an absent
    // `memory.yaml` unsets `element` before `memory`), so the refusal always names one. The message
    // stays P5.4.4's, verbatim.
    const cause = `no ${ABSENT_PILLAR_FILE[validated.error.message]!} at ${sha}`;
    return coreErr({ ...validated.error, details: { cause } });
  }

  const context = validated.value;
  const unfit =
    context.directives.map((directive) => headerFieldProblem('directive id', directive.frontmatter.id)).find((problem) => problem !== undefined) ??
    selfClosingBody(context);
  if (unfit !== undefined) return coreErr({ code: 'VALIDATION', message: unfit });
  // In §3 stage order: the DNA note (ruling D3), then the relevance note (P5.3.3 sc. 3).
  const notes = [dnaSelected?.note, relevant?.note].filter((note): note is string => note !== undefined);
  // Unreadable files are about the repository, not the context: they ride the success-warning channel
  // (task-169), as `memory search` carries them (task-171), and never enter the payload.
  // `candidates` is set whenever `memory.yaml` is, and without it the context was refused above.
  const warnings = [...unreadable, ...candidates!.left.map(formatDiagnostic)];
  return coreOk({ context, payload: serializeExecutionContext(context), notes }, undefined, warnings);
}
