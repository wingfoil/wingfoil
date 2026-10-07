/**
 * Workflow state deduction (task-198, `spec-017` §1, §3.1–§3.5, §4.1–§4.5, §4.8 records, §4.9;
 * `adr-007` stateless state derivation, `adr-008` per-type state machines; P4.13, P4.11).
 *
 * One **pure** function, {@link deduceWorkflowState}, answers every consumer — `workflow next`,
 * `status`, `list`, the MCP Resources and `agent execute --next` — from one {@link DeductionSnapshot}:
 * the repository as committed at `HEAD`, read once by `src/core`'s snapshot reader
 * (`src/core/workflow-deduction.ts`). Nothing here touches the filesystem, git or the clock, and every
 * collection is iterated in a declared order (`spec-017` §1.3, REQ-SYS-07, REQ-STATE-09), so two runs
 * on one snapshot give the same value, byte for byte once serialized. No `.wingfoil/state/` exists or
 * is read (REQ-SYS-03): state is the frontmatter of the Memory documents, the files `HEAD` holds and
 * the phase records in history.
 *
 * What is deduced here:
 * - **Instances** (§3.1–§3.3): an open main is a `plan` element (`draft`/`active`, no `parent`) whose
 *   `workflow` is startable; most recently started first, the first one active. A plan naming a
 *   workflow the registry does not load is listed with an empty frontier (`W_INSTANCE_WORKFLOW_UNKNOWN`).
 * - **The bound element** (§3.4 "Declared" and "None"; §3.5 the context). A self-creating workflow's
 *   element is bound by step linkage, which is task-203's: until then it is `null` and its `{id}`
 *   tokens are pending, never unresolved.
 * - **Evidence** (§4.3): `state`, `produces`, `selection`, `include` (plain) and `record` decide a
 *   phase; `awaits` and a checkpoint complete by a record; an implicit-owner `produces` is shown and is
 *   not evidence. `created` is declared by a `memory.add`; with no linkage read yet (task-203) a step
 *   has created nothing, so the kind is satisfied when the phase declares other evidence and otherwise
 *   completes by a record — the rule §4.3 gives a step that created no element.
 * - **The frontier** (§4.9): phases are sequential; a plain `include` descends into its sub. An
 *   `iterate_over` phase is reported as its own leaf, unexpanded: the iteration of §4.6 is task-202's.
 *
 * Not here: §4.6–§4.7 (task-202), linkage and re-entry (§4.8, task-203), optional and archived
 * phases (§4.10–§4.11, task-202), approvals and routing (§5, task-225), action/check views and
 * directives (§6, the `next`/`status` tasks).
 */
import type { MemoryYaml, StateMachine } from '../memory/schema';
import { memoryUnreadableDiagnostic, type MemoryDocumentSummary } from '../memory/query';
import { resolveStateMachine, validateFrontmatterState } from '../memory/state-machine';
import type { Diagnostic, ValidationError } from '../validation';
// The modules, not the `../core` barrel: `src/core` imports this one.
import { creatingPhaseIndex, isImplicitOwnerProduces } from '../core/workflow-diagnostics';
import { workflowExitStates, type ExitStart, type PhaseExitState } from '../core/workflow-exit-state';

import { memoryAddType, tokenName } from './bindings';
import { workflowFacts, type Phase, type Workflow } from './schema';

/** `W_UNCOMMITTED_INPUTS` (`spec-017` §1.2): a deduction input differs from `HEAD`; the answer is `HEAD`'s. */
export const W_UNCOMMITTED_INPUTS = 'W_UNCOMMITTED_INPUTS';
/** `W_MEMORY_INVALID_STATE` (`spec-017` §1.4, P4.13 sc. 3): a status its type's machine does not declare. */
export const W_MEMORY_INVALID_STATE = 'W_MEMORY_INVALID_STATE';
/** `W_UNRESOLVED_TOKEN` (`spec-017` §4.1): a token with no value on the element it resolves against. */
export const W_UNRESOLVED_TOKEN = 'W_UNRESOLVED_TOKEN';
/** `W_INSTANCE_WORKFLOW_UNKNOWN` (`spec-017` §2): an open plan names a workflow the registry does not load. */
export const W_INSTANCE_WORKFLOW_UNKNOWN = 'W_INSTANCE_WORKFLOW_UNKNOWN';

/** The plan statuses of an open instance (`spec-017` §3.2). */
export const OPEN_PLAN_STATUSES: readonly string[] = ['draft', 'active'];

/** The Memory type that records a workflow instance (`spec-017` §3.1, `dl-019`). */
export const PLAN_TYPE = 'plan';

/** Where an instance started: the commit that added its plan file, and its index in `git rev-list --topo-order HEAD`. */
export interface StartCommit {
  readonly commit: string;
  /** `0` is `HEAD`; a larger number is an older start. */
  readonly position: number;
}

/** One phase record (`spec-003` § "Evidence"): a commit carrying the `WingFoil-Phase: <w>.<p> completed` trailers. */
export interface PhaseRecord {
  readonly commit: string;
  /** `<workflow>.<phase>`, without the trailing ` completed`. */
  readonly phase: string;
  readonly instance: string;
  /** `WingFoil-Element`, `<type>:<id>`, or `null`. */
  readonly element: string | null;
  /** `WingFoil-Item`, `<collection>#<key>`, or `null`. */
  readonly item: string | null;
}

/**
 * Everything the deduction reads, as `HEAD` holds it (`spec-017` §1.1), gathered by the snapshot reader
 * in `src/core`. Pure data: the deduction is a function of this value alone.
 */
export interface DeductionSnapshot {
  /** The full sha `HEAD` resolved to. */
  readonly commit: string;
  /** The registry's workflows, in manifest `include` order. */
  readonly workflows: readonly Workflow[];
  /** Each workflow's file, repository-relative (`.wingfoil/workflows/custom/x.yaml`), parallel to `workflows`. */
  readonly workflowFiles: readonly string[];
  /** The registry's load-time diagnostics (warnings only: an error refuses the load), in `spec-003`'s order. */
  readonly registryDiagnostics: readonly Diagnostic[];
  /** `memory.yaml` at `HEAD`, or `null` when the commit holds none. */
  readonly memoryYaml: MemoryYaml | null;
  /** Every Memory document at `HEAD`, in sorted path order, the unparsable ones already left out. */
  readonly documents: readonly MemoryDocumentSummary[];
  /** The scan's `W_MEMORY_UNREADABLE` reports for the documents it left out, in path order. */
  readonly scanDiagnostics: readonly Diagnostic[];
  /** Every file path `HEAD` holds, sorted (`produces` evidence). */
  readonly tree: readonly string[];
  /** The start commit of each candidate plan, by its path. */
  readonly starts: ReadonlyMap<string, StartCommit>;
  /** The phase records in each instance's walk (§4.8), by the instance's start commit, oldest first. */
  readonly records: ReadonlyMap<string, readonly PhaseRecord[]>;
  /** The deduction inputs that differ from `HEAD` in the working tree, sorted (§1.2). */
  readonly dirty: readonly string[];
}

/** The baseline an answer comes from (`spec-017` §8, `dl-084` (A)). */
export interface Baseline {
  readonly rev: 'HEAD';
  readonly commit: string;
}

/** A Memory element as deduction reports it (`spec-017` §8). */
export interface ElementRef {
  readonly type: string;
  readonly id: string;
  readonly status: string;
}

/** What a step runs on: an element or a collection entry (`spec-017` §8). */
export type ScopeRef = { readonly element: ElementRef } | { readonly item: { readonly collection: string; readonly key: string } };

/** A workflow instance (`spec-017` §3, §8). */
export interface Instance {
  readonly id: string;
  readonly workflow: string;
  /** The bound element (§3.4), or `null`: none declared, not found, or not yet created. */
  readonly element: ElementRef | null;
  /** The context element (§3.5) of a workflow that declares no element, or `null`. */
  readonly context: ElementRef | null;
  /** The elements the instance's steps created — none until linkage is read (task-203). */
  readonly created: readonly ElementRef[];
  readonly planStatus: 'draft' | 'active';
  readonly startCommit: string;
  readonly active: boolean;
  /** §4.11 (task-202); always `false` here. */
  readonly abandoned: boolean;
}

/** One link of a step's trail, from the instance down to the step itself (`spec-017` §4.9). */
export interface TrailEntry {
  readonly workflow: string;
  readonly phase: string;
  readonly scope: ScopeRef | null;
}

/** The evidence kinds of `spec-017` §4.3. */
export type EvidenceKind = 'state' | 'created' | 'produces' | 'selection' | 'include' | 'awaits' | 'record';

/** One `produces` entry of a step, resolved (`spec-017` §8). */
export interface ProducesView {
  readonly pattern: string;
  /** The type that owns it: the workflow's element type, `T` of `{ type: T, path }`, or `null` (no element, or an implicit owner). */
  readonly owner: string | null;
  readonly resolved: readonly string[];
  readonly exists: boolean;
  /** `false` for an implicit-owner entry, which is shown but is not evidence (§4.3), and for a created-owned one. */
  readonly evidence: boolean;
}

/** A leaf step on an instance's frontier (`spec-017` §4.9; the part of §8's `Step` deduction decides). */
export interface DeducedStep {
  /** `<workflow>.<phase>`, then `@<type>:<id>` when the step runs on an element. */
  readonly key: string;
  readonly instance: string;
  readonly trail: readonly TrailEntry[];
  readonly workflow: string;
  readonly phase: string;
  readonly scope: ScopeRef | null;
  readonly role: string | null;
  readonly optional: boolean;
  readonly produces: readonly ProducesView[];
  readonly created: readonly ElementRef[];
  readonly evidence: {
    readonly kinds: readonly EvidenceKind[];
    readonly missing: readonly EvidenceKind[];
    /** `true` when the only evidence missing is a `record` (`workflow finalize`, §7.9). */
    readonly finalizable: boolean;
  };
}

/** One top-level phase of an instance (`spec-017` §7.4). */
export interface PhaseProgress {
  readonly phase: string;
  readonly state: 'complete' | 'current' | 'pending';
}

/** One open instance, deduced. */
export interface InstanceDeduction {
  readonly instance: Instance;
  /** `true` when every phase is complete (an empty frontier of a known workflow). */
  readonly complete: boolean;
  readonly phases: readonly PhaseProgress[];
  readonly frontier: readonly DeducedStep[];
}

/** The whole answer at one commit. */
export interface Deduction {
  readonly baseline: Baseline;
  /** The active instance's id, or `null` when none is open. */
  readonly active: string | null;
  /** The open instances, most recently started first (§3.3). */
  readonly instances: readonly InstanceDeduction[];
  /** The registry's diagnostics, then this deduction's, in `spec-017` §1.3's order. */
  readonly diagnostics: readonly Diagnostic[];
}

// --- Elements --------------------------------------------------------------------------------------

/** A Memory element deduction may use: its frontmatter read, its status legal for its type. */
interface Element {
  readonly type: string;
  readonly id: string;
  readonly status: string;
  readonly path: string;
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

/** Code-unit order (`Array.prototype.sort`'s default), as a comparator. */
function compareText(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

/**
 * A `memory.yaml` type `path` pattern as a whole-path regular expression. A token in the file name is one
 * name; a token in a directory is one or more directories, since a value such as the plan's `{scope}`
 * nests (`rl-v1/rel-v0.3`, `.wingfoil/memory.yaml` `plan.path`).
 */
function pathPatternRegExp(pattern: string): RegExp {
  const slash = pattern.lastIndexOf('/');
  const convert = (part: string, token: string): string =>
    part
      .split(/\{[^{}]+\}/)
      .map((piece) => piece.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))
      .join(token);
  return new RegExp(`^${convert(pattern.slice(0, slash + 1), '[^/]+(?:/[^/]+)*')}${convert(pattern.slice(slash + 1), '[^/]+')}$`);
}

/** A frontmatter value as a non-blank string, or `null`. */
function scalarText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function hasType(memoryYaml: MemoryYaml | null, type: string): memoryYaml is MemoryYaml {
  return memoryYaml !== null && Object.prototype.hasOwnProperty.call(memoryYaml.types, type);
}

/**
 * The elements of the snapshot, and the `W_MEMORY_*` reports of the documents left out (§1.4): no
 * frontmatter, no `type`, a type `memory.yaml` does not declare, no `id`, no `status` —
 * `W_MEMORY_UNREADABLE`; a status the type's machine does not declare — `W_MEMORY_INVALID_STATE`,
 * decided by `validateFrontmatterState`, the rule every Memory verb applies (P4.11).
 */
function readElements(snapshot: DeductionSnapshot): { elements: Element[]; diagnostics: Diagnostic[] } {
  const elements: Element[] = [];
  const diagnostics: Diagnostic[] = [...snapshot.scanDiagnostics];
  const { memoryYaml } = snapshot;
  const typePaths = Object.values(memoryYaml?.types ?? {}).map((entry) => pathPatternRegExp(entry.path));
  for (const document of snapshot.documents) {
    const { path, frontmatter } = document;
    const unreadable = (reason: string): void => {
      diagnostics.push(memoryUnreadableDiagnostic(path, reason));
    };
    if (Object.keys(frontmatter).length === 0) {
      // A file on no type's path is not a Memory document at all — the `X_*` plans `dl-019` grandfathers at
      // the top of `docs/05_plans/` — and is left out silently; one on a type's path is a document §1.4 reports.
      if (typePaths.some((pattern) => pattern.test(path))) unreadable('no frontmatter');
      continue;
    }
    const type = scalarText(frontmatter['type']);
    if (type === null) {
      unreadable("no 'type' field");
      continue;
    }
    if (!hasType(memoryYaml, type)) {
      unreadable(`type '${type}' is not declared in memory.yaml`);
      continue;
    }
    const id = scalarText(frontmatter['id']);
    if (id === null) {
      unreadable("no 'id' field");
      continue;
    }
    const status = scalarText(frontmatter['status']);
    if (status === null) {
      unreadable("no 'status' field");
      continue;
    }
    try {
      validateFrontmatterState(resolveStateMachine(memoryYaml, type), type, status, path);
    } catch (error) {
      const issue = (error as ValidationError).issues[0]!;
      diagnostics.push({ code: W_MEMORY_INVALID_STATE, severity: 'warning', file: path, path: 'status', message: `${issue.message} in ${path}` });
      continue;
    }
    elements.push({ type, id, status, path, frontmatter });
  }
  // By path; a stable sort keeps one file's reports in the order they were made.
  diagnostics.sort((a, b) => compareText(a.file, b.file));
  return { elements, diagnostics };
}

/**
 * `<type>:<id>` of an element scope. A collection-entry scope (`WingFoil-Item`, `@<collection>#<key>`)
 * arrives with `iterate_over` (task-202); until then deduction builds element scopes only.
 */
function elementKey(scope: ScopeRef): string {
  const { element } = scope as { element: ElementRef };
  return `${element.type}:${element.id}`;
}

function refOf(element: Element): ElementRef {
  return { type: element.type, id: element.id, status: element.status };
}

// --- Scope and tokens (§4.1) -------------------------------------------------------------------------

/** One enclosing scope: the element a workflow runs on. */
interface Frame {
  readonly type: string;
  /** `null` when the element is not found, or (with `pending`) not yet created. */
  readonly element: Element | null;
  /** A self-creating workflow before its element exists: its tokens are pending, not unresolved (§3.4). */
  readonly pending: boolean;
}

/** A pattern after token substitution. */
interface Resolved {
  /** The text with every token replaced, or `null` when a token has no value (or is pending). */
  readonly value: string | null;
  /** Each token with no value, and why. */
  readonly unresolved: readonly { readonly token: string; readonly reason: string }[];
  readonly pending: boolean;
}

const TOKEN_RE = /\{([^{}]+)\}/g;

/**
 * Substitute the `{…}` tokens of `text` against `frames` (innermost last), as whole values, never
 * evaluated (`dl-090` Q3 (a)): `{<type>.<field>}` against the nearest element of `<type>`; `{id}`,
 * `{<field>}` and `{element.<field>}` against the innermost one. `{item…}` needs a collection scope,
 * which only `iterate_over` gives (task-202), so it has no value here.
 */
function resolveTokens(text: string, frames: readonly Frame[]): Resolved {
  const unresolved: { token: string; reason: string }[] = [];
  let pending = false;
  const value = text.replace(TOKEN_RE, (token, inner: string) => {
    let frame: Frame | undefined;
    let field: string;
    const dot = inner.indexOf('.');
    if (inner === 'item' || inner.startsWith('item.')) {
      unresolved.push({ token, reason: 'no collection entry in scope' });
      return token;
    }
    if (dot === -1) {
      frame = frames[frames.length - 1];
      field = inner;
    } else {
      const head = inner.slice(0, dot);
      field = inner.slice(dot + 1);
      frame = head === 'element' ? frames[frames.length - 1] : [...frames].reverse().find((candidate) => candidate.type === head);
    }
    if (frame === undefined) {
      unresolved.push({ token, reason: 'no element in scope' });
      return token;
    }
    if (frame.element === null) {
      if (frame.pending) pending = true;
      else unresolved.push({ token, reason: `no ${frame.type} element is bound` });
      return token;
    }
    const raw = field === 'id' ? frame.element.id : scalarText(frame.element.frontmatter[field]);
    if (raw === null) {
      unresolved.push({ token, reason: `${frame.element.type}:${frame.element.id} has no value for '${field}'` });
      return token;
    }
    return raw;
  });
  return { value: unresolved.length === 0 && !pending ? value : null, unresolved, pending };
}

// --- Evidence (§4.3) ---------------------------------------------------------------------------------

/** The untyped verbs that, before any `memory.add` and outside a selection, move the bound element (`spec-003` § "Evidence"). */
const STATE_VERBS: readonly string[] = ['memory.submit', 'memory.approve', 'element.set_state'];
const TYPED_SET_STATE_RE = /^([a-z][a-z0-9-]*)\.set_state$/;

/** Whether `phase` declares `state` evidence on an element of `boundType` (`spec-003` § "Evidence", `spec-017` §4.2). */
export function declaresState(phase: Phase, boundType: string | null): boolean {
  if (boundType === null) return false;
  const selection = phase.where !== undefined && phase.iterate_over === undefined;
  let added = false;
  for (const action of phase.actions ?? []) {
    const name = tokenName(action);
    if (name === 'memory.add') {
      added = true;
      continue;
    }
    if (STATE_VERBS.includes(name) && !added && !selection) return true;
    if (TYPED_SET_STATE_RE.exec(name)?.[1] === boundType) return true;
  }
  return false;
}

/** Whether `status` is at or after `exit` in `machine`'s `sequence` (§4.3 `state`, §4.4). */
function atOrAfter(machine: StateMachine, status: string, exit: string): boolean {
  const at = machine.sequence.indexOf(status);
  const target = machine.sequence.indexOf(exit);
  if (at === -1 || target === -1) return status === exit;
  return at >= target;
}

/** `spec-003`'s `where` match rule: equal, member, or (for a list field) a shared element. Absent reads as `""`. */
function matches(field: unknown, wanted: readonly string[]): boolean {
  const have = field === undefined || field === null ? [''] : Array.isArray(field) ? field.map(String) : [String(field)];
  return have.some((value) => wanted.includes(value));
}

// --- The walk ----------------------------------------------------------------------------------------

/** What one evaluation of a workflow on a scope yields. */
interface WorkflowResult {
  readonly complete: boolean;
  readonly phases: PhaseProgress[];
  readonly frontier: DeducedStep[];
  /** The `W_UNRESOLVED_TOKEN`s of the frontier steps, in frontier order. */
  readonly diagnostics: Diagnostic[];
}

/** The read-only context of one deduction. */
class Deducer {
  private readonly byName = new Map<string, Workflow>();
  private readonly fileOf = new Map<string, string>();
  private readonly tree: ReadonlySet<string>;
  private readonly elements: readonly Element[];

  constructor(
    private readonly snapshot: DeductionSnapshot,
    elements: readonly Element[],
  ) {
    // Names are unique: the registry refuses a duplicate at load time (`spec-003`), so no entry is overwritten.
    snapshot.workflows.forEach((workflow, i) => {
      this.byName.set(workflow.name, workflow);
      this.fileOf.set(workflow.name, snapshot.workflowFiles[i]!);
    });
    this.tree = new Set(snapshot.tree);
    this.elements = elements;
  }

  workflow(name: string): Workflow | undefined {
    return this.byName.get(name);
  }

  /** The first element of `type` with `id`, in path order. */
  find(type: string, id: string): Element | null {
    return this.elements.find((element) => element.type === type && element.id === id) ?? null;
  }

  /** The first element of any type with `id`, in path order. */
  findAny(id: string): Element | null {
    return this.elements.find((element) => element.id === id) ?? null;
  }

  plans(): readonly Element[] {
    return this.elements.filter((element) => element.type === PLAN_TYPE);
  }

  private exists(path: string): boolean {
    if (!path.endsWith('/')) return this.tree.has(path);
    return this.snapshot.tree.some((file) => file.startsWith(path));
  }

  /**
   * The first state of `type`. Called only to bind an instance, i.e. for a plan element, which exists only
   * when `memory.yaml` does; and a workflow's `element` type is one `memory.yaml` declares, or the registry
   * refuses it (`E_WORKFLOW_ELEMENT_TYPE_UNKNOWN`).
   */
  private firstState(type: string): string {
    return resolveStateMachine(this.snapshot.memoryYaml!, type).sequence[0]!;
  }

  /** Run a workflow on `frames`, from `start` (§4.4), under `trail`. */
  run(instanceId: string, startCommit: string, workflow: Workflow, frames: readonly Frame[], start: ExitStart, trail: readonly TrailEntry[]): WorkflowResult {
    // `memory.yaml` is present: a workflow runs only for an open plan, an element of a declared type.
    const exits = workflowExitStates(workflow, this.snapshot.memoryYaml!, start, this.byName);
    const phases: PhaseProgress[] = [];
    let frontier: DeducedStep[] = [];
    let diagnostics: Diagnostic[] = [];
    let current = false;

    workflow.phases.forEach((phase, p) => {
      if (current) {
        phases.push({ phase: phase.name, state: 'pending' });
        return;
      }
      const frame = frames[frames.length - 1];
      const scope: ScopeRef | null = frame?.element ? { element: refOf(frame.element) } : null;
      const here: TrailEntry = { workflow: workflow.name, phase: phase.name, scope };

      // A plain `include` (§4.5): the sub runs on the same element, from the state this phase starts in.
      // The include resolves: the registry refuses one naming no loaded workflow (`spec-003` loader rows).
      if (phase.include !== undefined && phase.iterate_over === undefined) {
        const sub = this.byName.get(phase.include)!;
        const exit = exits[p]!;
        const result = this.run(instanceId, startCommit, sub, frames, { boundType: sub.element ?? exit.boundType, state: exit.entry, instance: false }, [...trail, here]);
        if (result.complete) {
          phases.push({ phase: phase.name, state: 'complete' });
          return;
        }
        current = true;
        phases.push({ phase: phase.name, state: 'current' });
        frontier = result.frontier;
        diagnostics = result.diagnostics;
        return;
      }

      const leaf = this.leaf(instanceId, startCommit, workflow, p, frames, exits[p]!, [...trail, here], scope);
      if (leaf.step.evidence.missing.length === 0) {
        phases.push({ phase: phase.name, state: 'complete' });
        return;
      }
      current = true;
      phases.push({ phase: phase.name, state: 'current' });
      frontier = [leaf.step];
      diagnostics = leaf.diagnostics;
    });
    return { complete: !current, phases, frontier, diagnostics };
  }

  /** Evaluate one phase as a leaf step: its evidence, its `produces`, its unresolved tokens. */
  private leaf(
    instanceId: string,
    startCommit: string,
    workflow: Workflow,
    p: number,
    frames: readonly Frame[],
    exit: PhaseExitState,
    trail: readonly TrailEntry[],
    scope: ScopeRef | null,
  ): { step: DeducedStep; diagnostics: Diagnostic[] } {
    const phase = workflow.phases[p]!;
    const file = this.fileOf.get(workflow.name)!;
    const stepName = `${workflow.name}.${phase.name}`;
    const diagnostics: Diagnostic[] = [];
    const report = (path: string, resolved: Resolved): void => {
      for (const { token, reason } of resolved.unresolved) {
        diagnostics.push({ code: W_UNRESOLVED_TOKEN, severity: 'warning', file, path, message: `token '${token}' of ${stepName} has no value: ${reason}` });
      }
    };
    const frame = frames[frames.length - 1];
    const kinds: EvidenceKind[] = [];
    const missing: EvidenceKind[] = [];

    // An `iterate_over` phase is a leaf until task-202 expands its candidates (§4.6).
    if (phase.iterate_over !== undefined) {
      kinds.push('include');
      missing.push('include');
    }

    // state — the bound element at or after the phase's exit state (§4.4).
    if (declaresState(phase, exit.boundType)) {
      kinds.push('state');
      const element = frame?.element ?? null;
      const satisfied = element !== null && exit.exit !== null && atOrAfter(resolveStateMachine(this.snapshot.memoryYaml!, element.type), element.status, exit.exit);
      if (!satisfied) missing.push('state');
    }

    // created — a `memory.add`; no step has created an element until linkage is read (task-203).
    if ((phase.actions ?? []).some((action) => tokenName(action) === 'memory.add')) kinds.push('created');

    // produces — every string entry, resolved, names a committed path; implicit owners are shown only.
    const produces: ProducesView[] = [];
    let producesEvidence = false;
    let producesMissing = false;
    (phase.produces ?? []).forEach((entry, k) => {
      if (typeof entry !== 'string') {
        produces.push({ pattern: entry.path, owner: entry.type, resolved: [], exists: false, evidence: false });
        return;
      }
      const resolved = resolveTokens(entry, frames);
      report(`phases[${p}].produces[${k}]`, resolved);
      const implicit = isImplicitOwnerProduces(workflow, p, entry);
      const exists = resolved.value !== null && this.exists(resolved.value);
      produces.push({
        pattern: entry,
        owner: implicit ? null : (frame?.type ?? null),
        resolved: resolved.value === null ? [] : [resolved.value],
        exists,
        evidence: !implicit,
      });
      if (implicit) return;
      producesEvidence = true;
      if (!exists) producesMissing = true;
    });
    if (producesEvidence) {
      kinds.push('produces');
      if (producesMissing) missing.push('produces');
    }

    // selection — no Memory document at HEAD matches the phase's `where`.
    if (phase.where !== undefined && phase.iterate_over === undefined) {
      kinds.push('selection');
      const wanted: [string, string[]][] = [];
      let decidable = true;
      for (const key of Object.keys(phase.where).sort()) {
        const raw = phase.where[key]!;
        const values = (Array.isArray(raw) ? raw : [raw]).map((value) => {
          if (typeof value !== 'string') return String(value);
          const resolved = resolveTokens(value, frames);
          report(`phases[${p}].where.${key}`, resolved);
          if (resolved.value === null) decidable = false;
          return resolved.value ?? value;
        });
        wanted.push([key, values]);
      }
      const selected = decidable && this.elements.some((element) => wanted.every(([key, values]) => matches(element.frontmatter[key], values)));
      if (!decidable || selected) missing.push('selection');
    }

    // awaits — evaluated from v1.0 (P4.12); the step completes by a record (§5.4).
    if (phase.awaits !== undefined) kinds.push('awaits');

    // record — a checkpoint, an `awaits` (always, §4.3 `awaits` row, §5.4), or a `created` step with no
    // other evidence (§4.3).
    const recordNeeded = phase.awaits !== undefined || !kinds.some((kind) => kind !== 'created');
    if (recordNeeded) {
      kinds.push('record');
      if (!this.hasRecord(instanceId, startCommit, stepName, scope)) missing.push('record');
    }

    const key = scope === null ? stepName : `${stepName}@${elementKey(scope)}`;
    return {
      step: {
        key,
        instance: instanceId,
        trail,
        workflow: workflow.name,
        phase: phase.name,
        scope,
        role: phase.role ?? null,
        optional: phase.optional,
        produces,
        created: [],
        evidence: { kinds, missing, finalizable: missing.length === 1 && missing[0] === 'record' },
      },
      diagnostics,
    };
  }

  /** Whether the instance's walk holds a record of step `stepName` on `scope` (§4.8 records). */
  private hasRecord(instanceId: string, startCommit: string, stepName: string, scope: ScopeRef | null): boolean {
    const element = scope === null ? null : elementKey(scope);
    return (this.snapshot.records.get(startCommit) ?? []).some(
      (record) => record.phase === stepName && record.instance === instanceId && record.element === element && record.item === null,
    );
  }

  /** The frames an instance of `workflow` starts with, its bound element and its context (§3.4, §3.5). */
  bind(workflow: Workflow, plan: Element): { frames: Frame[]; start: ExitStart; element: ElementRef | null; context: ElementRef | null } {
    const id = scalarText(plan.frontmatter['element']);
    if (workflow.element !== undefined) {
      const element = id === null ? null : this.find(workflow.element, id);
      return {
        frames: [{ type: workflow.element, element, pending: false }],
        start: { boundType: workflow.element, state: this.firstState(workflow.element), instance: true },
        element: element === null ? null : refOf(element),
        context: null,
      };
    }
    const contextElement = id === null ? null : this.findAny(id);
    const context = contextElement === null ? null : refOf(contextElement);
    const creating = creatingPhaseIndex(workflow);
    // The creating phase is the one holding the first `memory.add`, so it has actions; a `memory.add` with
    // no `type:` names no type, and the instance then has no frame.
    const type = creating === -1 ? null : (workflow.phases[creating]!.actions!.map(memoryAddType).find((t): t is string => t !== null) ?? null);
    return {
      frames: type === null ? [] : [{ type, element: null, pending: true }],
      start: { boundType: null, state: null, instance: true },
      element: null,
      context,
    };
  }
}

// --- The deduction -----------------------------------------------------------------------------------

/**
 * Deduce every open workflow instance at the snapshot's commit (`spec-017` §3–§4): its bound element,
 * its top-level phase progress and its frontier, plus the ordered diagnostics of §1.3 — the registry's,
 * then `W_UNCOMMITTED_INPUTS`, then `W_MEMORY_*` by path, then `W_INSTANCE_WORKFLOW_UNKNOWN` in
 * instance order, then the step-attached `W_UNRESOLVED_TOKEN` in frontier order. Never throws on a
 * Memory document it cannot use: it leaves the document out and reports it (§1.4).
 */
export function deduceWorkflowState(snapshot: DeductionSnapshot): Deduction {
  const { elements, diagnostics: memoryDiagnostics } = readElements(snapshot);
  const deducer = new Deducer(snapshot, elements);

  const open = deducer
    .plans()
    .filter((plan) => OPEN_PLAN_STATUSES.includes(plan.status) && scalarText(plan.frontmatter['parent']) === null)
    .map((plan) => {
      const start = snapshot.starts.get(plan.path);
      return { plan, workflowName: scalarText(plan.frontmatter['workflow']) ?? '', start, position: start?.position ?? Number.MAX_SAFE_INTEGER };
    })
    .filter(({ workflowName }) => {
      const workflow = deducer.workflow(workflowName);
      return workflow === undefined || workflowFacts(workflow).startable;
    })
    .sort((a, b) => a.position - b.position || compareText(a.plan.id, b.plan.id));

  const unknownDiagnostics: Diagnostic[] = [];
  const stepDiagnostics: Diagnostic[] = [];
  const instances = open.map(({ plan, workflowName, start }, index): InstanceDeduction => {
    const workflow = deducer.workflow(workflowName);
    const base = {
      id: plan.id,
      workflow: workflowName,
      created: [],
      planStatus: plan.status as 'draft' | 'active',
      startCommit: start?.commit ?? '',
      active: index === 0,
      abandoned: false,
    };
    if (workflow === undefined) {
      unknownDiagnostics.push({
        code: W_INSTANCE_WORKFLOW_UNKNOWN,
        severity: 'warning',
        file: plan.path,
        path: 'workflow',
        message: `open plan ${plan.id} names workflow '${workflowName}', which the registry does not load`,
      });
      return { instance: { ...base, element: null, context: null }, complete: false, phases: [], frontier: [] };
    }
    const bound = deducer.bind(workflow, plan);
    const result = deducer.run(plan.id, base.startCommit, workflow, bound.frames, bound.start, []);
    stepDiagnostics.push(...result.diagnostics);
    return {
      instance: { ...base, element: bound.element, context: bound.context },
      complete: result.complete,
      phases: result.phases,
      frontier: result.frontier,
    };
  });

  const uncommitted: Diagnostic[] = snapshot.dirty.map((path) => ({
    code: W_UNCOMMITTED_INPUTS,
    severity: 'warning',
    file: path,
    path: '',
    message: `uncommitted change to a deduction input, not read (the answer is computed from HEAD): ${path}`,
  }));

  return {
    baseline: { rev: 'HEAD', commit: snapshot.commit },
    active: instances[0]?.instance.id ?? null,
    instances,
    diagnostics: [...snapshot.registryDiagnostics, ...uncommitted, ...memoryDiagnostics, ...unknownDiagnostics, ...stepDiagnostics],
  };
}

/**
 * The open instance `ref` names (`spec-017` §3.3): a workflow name selects its most recently started
 * open instance, an instance id that instance; no `ref` selects the active instance. `null` when none.
 */
export function resolveInstanceRef(deduction: Deduction, ref?: string): InstanceDeduction | null {
  if (ref === undefined) return deduction.instances[0] ?? null;
  return deduction.instances.find((entry) => entry.instance.workflow === ref) ?? deduction.instances.find((entry) => entry.instance.id === ref) ?? null;
}
