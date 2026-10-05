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
import { dump } from 'js-yaml';

import type { RolesYaml } from '../directives/schema';
import type { DnaYaml, Module, Paths, Project, Team } from '../dna/schema';
import { isArchivedStatus, loadMemoryDocumentsAtRev, type MemoryDocumentSummary } from '../memory';
import { readPathAtRev, splitFrontmatter } from '../storage';
import { parseYaml } from '../validation';

import { isRemovableCustomAssetPath } from './builtin-asset';
import {
  DNA_YAML_PATH,
  loadDirectivesAtRev,
  loadDnaYamlAtRev,
  loadMemoryYamlAtRev,
  loadRolesYamlAtRev,
  type DirectiveFile,
} from './loaders';
import { DEFAULT_CONTEXT_LIMITS, selectRelevantMemoryDocuments, type ContextLimits, type RelevantMemoryDocument } from './relevance';
import { resolveRevision, RevisionError } from './revision';
import { coreErr, coreOk, type CoreResult } from './types';

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
}

/**
 * The DNA sections `spec-012` §4 selects. Its own keys are inserted in `dna.yaml`'s declared order, and
 * that order is the order §7 emits them in.
 */
export interface DnaSelection {
  readonly project?: Project;
  /** The element's `modules:`/`scope:` entries, or every module when it declares neither. */
  readonly modules: readonly Module[];
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
  /** §7 `## 4. Relevant Memory`, in §6 order and within the request's limits. */
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
  /** `no relevant Memory found for task` when nothing passed the relevance threshold (P5.3.3 sc. 3). */
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

/** YAML for the payload: keys sorted ascending (§7), no line folding and no anchors, so the text is a
 * function of the value alone. */
function canonicalYaml(value: unknown): string {
  return dump(value, { sortKeys: true, lineWidth: -1, noRefs: true });
}

function yamlBlock(value: unknown): string {
  return '```yaml\n' + canonicalYaml(value) + '```';
}

/** A body as §7 carries it: verbatim, without the blank lines around it. */
function trimBody(body: string): string {
  return body.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
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
 * Render a context as `spec-012` §7's canonical Markdown payload — the bytes §8 holds identical across
 * builds. Fixed headings in a fixed order; frontmatter and DNA sections as YAML with sorted keys;
 * directive and document bodies verbatim; ids rather than paths; the header names only role, element
 * and the resolved sha. `warnings` are not rendered.
 *
 * @throws Error `invalid execution context: missing '<section>' section` when `context` does not
 *   validate ({@link validateExecutionContext}): a partial payload is never rendered.
 */
export function serializeExecutionContext(context: ExecutionContext): string {
  const valid = validateExecutionContext(context);
  if (!valid.ok) throw new Error(valid.error.message);

  const { role, stateRef, element, dna, directives, memory } = context;
  // The header comment sits on the title's next line, as §7's template shows.
  const blocks: string[] = [
    `# WingFoil Agent Context\n<!-- role: ${role} | element: ${element.type}:${element.id} | state: ${stateRef} -->`,
  ];
  const push = (...items: string[]): void => {
    for (const item of items) if (item.length > 0) blocks.push(item);
  };

  push('## 1. Task', yamlBlock(element.frontmatter), trimBody(element.body));

  push('## 2. Project DNA');
  for (const [name, value] of Object.entries(dna)) push(`### ${name}`, yamlBlock(value));

  push(`## 3. Directives (${role} + global)`);
  for (const directive of directives) push(`### ${directive.frontmatter.id}`, trimBody(directive.body));

  push(`## 4. Relevant Memory (${memory.length} documents)`);
  for (const doc of memory) {
    push(`### ${doc.type ?? ''}:${doc.id ?? doc.path}`, yamlBlock(doc.frontmatter), trimBody(doc.body));
  }

  return canonicalize(blocks.join('\n\n'));
}

function asNames(value: unknown): string[] {
  if (typeof value === 'string') return value.length > 0 ? [value] : [];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : [];
}

/** The top-level keys of the committed `dna.yaml` text, in the order the file declares them. */
function declaredDnaOrder(root: string, sha: string): string[] {
  const raw = readPathAtRev(root, sha, DNA_YAML_PATH);
  const parsed = raw === null ? null : parseYaml(raw, `${sha}:${DNA_YAML_PATH}`);
  return isRecord(parsed) ? Object.keys(parsed) : [];
}

/**
 * `spec-012` §4, the `dna-loader`: `project` and `team` always, `paths` whole (every category), and
 * the `modules` named by the element's `modules:`/`scope:` — every module when it names none — in
 * `dna.yaml` order. Sections are inserted in `declaredOrder`, the file's own key order.
 */
function selectDnaSections(dna: DnaYaml, declaredOrder: readonly string[], frontmatter: Record<string, unknown>): DnaSelection {
  const named = new Set([...asNames(frontmatter.modules), ...asNames(frontmatter.scope)]);
  const sections: Record<string, unknown> = {
    project: dna.project,
    modules: named.size === 0 ? dna.modules : dna.modules.filter((module) => named.has(module.name)),
    team: dna.team,
    paths: dna.paths,
  };
  const selection: Record<string, unknown> = {};
  for (const key of declaredOrder) if (sections[key] !== undefined) selection[key] = sections[key];
  return selection as unknown as DnaSelection;
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
 * 2. **load-dna** (§4): see `selectDnaSections`.
 * 3. **load-directives** (§5): {@link resolveRoleDirectives} over the directives and `roles.yaml` at the
 *    commit; its warnings become `context.warnings`.
 * 4. **filter-memory** (§6): `selectRelevantMemoryDocuments` over the same snapshot, within
 *    `request.limits`.
 * 5. **validate** (P5.4.4 sc. 3) and **serialize** (§7).
 *
 * A pillar file the commit does not hold leaves its section unset, and step 5 refuses the context:
 * no `roles.yaml` → `missing 'directives'`, no `dna.yaml` → `missing 'dna'`, no `memory.yaml` →
 * `missing 'element'`.
 *
 * Expected failures are returned, never thrown: a `stateRef` that is malformed or names no commit is
 * the `RevisionError`'s own `CoreError`. A document or pillar file that does not parse still throws
 * `ValidationError`, as every loader does.
 */
export function assembleExecutionContext(root: string, request: ContextRequest): CoreResult<AssembledExecutionContext> {
  let sha: string;
  try {
    sha = resolveRevision(root, request.stateRef);
  } catch (error) {
    if (error instanceof RevisionError) return coreErr(error.toCoreError());
    throw error;
  }
  const { role, element: wanted } = request;
  const label = `${wanted.type}:${wanted.id}`;

  const memoryYaml = loadMemoryYamlAtRev(root, sha);
  const documents = memoryYaml === null ? null : loadMemoryDocumentsAtRev(root, sha, memoryYaml);
  const found = documents?.find(
    (doc) => stringField(doc.frontmatter, 'type') === wanted.type && stringField(doc.frontmatter, 'id') === wanted.id,
  );
  if (documents !== null && found === undefined) {
    return coreErr({ code: 'NOT_FOUND', message: `element '${label}' not found at ${sha}` });
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

  const dnaYaml = loadDnaYamlAtRev(root, sha);
  const dna = dnaYaml === null ? undefined : selectDnaSections(dnaYaml, declaredDnaOrder(root, sha), frontmatter);

  const rolesYaml = loadRolesYamlAtRev(root, sha);
  const resolution = rolesYaml === null ? undefined : resolveRoleDirectives(loadDirectivesAtRev(root, sha), rolesYaml, role);
  const directives = resolution === undefined ? undefined : withBodies(root, sha, resolution.directives);

  const relevant =
    documents === null
      ? undefined
      : selectRelevantMemoryDocuments(documents, { ...wanted, frontmatter }, request.limits ?? DEFAULT_CONTEXT_LIMITS);

  const validated = validateExecutionContext({
    role,
    stateRef: sha,
    element,
    dna,
    directives,
    memory: relevant?.documents,
    warnings: resolution?.warnings ?? [],
  });
  if (!validated.ok) return validated;

  const context = validated.value;
  const notes = relevant?.note === undefined ? [] : [relevant.note];
  return coreOk({ context, payload: serializeExecutionContext(context), notes });
}
