/**
 * Workflow state deduction (task-198, task-203, task-202; `spec-017` §1, §3.1–§3.5, §4.1–§4.11, §5.2
 * re-entry; `adr-007` stateless state derivation, `adr-008` per-type state machines; P4.13, P4.16,
 * P4.11).
 *
 * One **pure** function, {@link deduceWorkflowState}, answers every consumer — `workflow next`,
 * `status`, `list`, the MCP Resources and `agent execute --next` — from one {@link DeductionSnapshot}:
 * the repository as committed at `HEAD`, read once by `src/core`'s snapshot reader
 * (`src/core/workflow-deduction.ts`). Nothing here touches the filesystem, git or the clock, and every
 * collection is iterated in a declared order (`spec-017` §1.3, REQ-SYS-07, REQ-STATE-09), so two runs
 * on one snapshot give the same value, byte for byte once serialized. No `.wingfoil/state/` exists or
 * is read (REQ-SYS-03): state is the frontmatter of the Memory documents, the files `HEAD` holds and
 * the commit history reachable from `HEAD` (each instance's walk, §4.8).
 *
 * What is deduced here:
 * - **Instances** (§3.1–§3.3): an open main is a `plan` element (`draft`/`active`, no `parent`) whose
 *   `workflow` is startable; most recently started first, the first one active. A plan naming a
 *   workflow the registry does not load is listed with an empty frontier (`W_INSTANCE_WORKFLOW_UNKNOWN`).
 * - **The bound element** (§3.4; §3.5 the context). A self-creating workflow's element is the element
 *   of its creating phase's type that its creating step created (step linkage, §4.8) with the oldest add
 *   commit; until then it is `null` and its `{id}` tokens are pending, never unresolved. Further linked
 *   elements are listed in `Instance.created` and do not rebind. An archived bound element
 *   (`deprecated`, or `superseded`) abandons the instance (§4.11).
 * - **Evidence** (§4.3): `state`, `produces`, `selection`, `include` and `record` decide a phase;
 *   `awaits` and a checkpoint complete by a record; an implicit-owner `produces` is shown and is not
 *   evidence. `created` (a `memory.add`) is satisfied when, for each type the phase adds, the step
 *   created an element at or after the state the phase leaves it in, with each `{ type, path }` entry
 *   committed for it; a step that created nothing leaves the kind to its other evidence, or to a record.
 * - **Re-entries** (§4.8, §5.2): after a `reject`/`park` that moved the pass's element back, the
 *   `record` and `state` evidence of the phases from the `fallback.step` of the phase whose gate state
 *   was `<from>` onward counts only if newer than the re-entry; those steps report `reentered: true`.
 *   An `iterate_over` does not hand its own cutoff to its iterations: each iterated element has its own
 *   re-entries.
 * - **`iterate_over`** (§4.6): over a Memory type, the `where` splits into the entry filter (`status`)
 *   and the scope filter, and each candidate is eligible, entered, complete or ignored; over a
 *   collection (`dna:<path>`, `bindings:<name>`, `dl-104` D2 (b)) every matching entry is a candidate,
 *   keyed per `spec-003` § "Collections" and interpolated as `{item}` / `{item.<field>}`. Zero counted
 *   candidates make the phase **vacuously** complete, with the note
 *   {@link NO_ITERATION_NOTE}.
 * - **Live queries and optional phases** (§4.7, §4.10): a selection or `iterate_over` phase is also
 *   complete once a later phase of the same pass is complete other than vacuously, its open candidates
 *   reported `late`; an optional phase is then skipped instead. A vacuous completion closes nothing.
 * - **The frontier** (§4.9): phases are sequential; a plain `include` descends into its sub, an
 *   `iterate_over` into the sub once per eligible or entered candidate, in iteration order. An optional
 *   current phase is reported together with the phases up to the next non-optional one.
 *
 * Not here: approvals and routing (§5, task-225), action/check views and directives (§6, the
 * `next`/`status` tasks).
 */
import type { MemoryYaml, StateMachine } from '../memory/schema';
import { memoryUnreadableDiagnostic, type MemoryDocumentSummary } from '../memory/query';
import { isArchivedStatus, resolveStateMachine, validateFrontmatterState } from '../memory/state-machine';
import { isNumericToken, patternToSource, type Diagnostic, type ValidationError } from '../validation';
// The modules, not the `../core` barrel: `src/core` imports this one.
import { creatingPhaseIndex, isImplicitOwnerProduces } from '../core/workflow-diagnostics';
import { iterationStartState, workflowExitStates, type ExitStart, type PhaseExitState } from '../core/workflow-exit-state';

import type { DnaYaml } from '../dna/schema';

import { collectionEntryKey, memoryAddType, tokenName, typedStateType, type BindingsYaml, type CollectionEntry } from './bindings';
import { workflowFacts, type Phase, type Workflow } from './schema';

/** `W_UNCOMMITTED_INPUTS` (`spec-017` §1.2): a deduction input differs from `HEAD`; the answer is `HEAD`'s. */
export const W_UNCOMMITTED_INPUTS = 'W_UNCOMMITTED_INPUTS';
/** `W_MEMORY_INVALID_STATE` (`spec-017` §1.4, P4.13 sc. 3): a status its type's machine does not declare. */
export const W_MEMORY_INVALID_STATE = 'W_MEMORY_INVALID_STATE';
/** `W_UNRESOLVED_TOKEN` (`spec-017` §4.1): a token with no value on the element it resolves against. */
export const W_UNRESOLVED_TOKEN = 'W_UNRESOLVED_TOKEN';
/** `W_INSTANCE_WORKFLOW_UNKNOWN` (`spec-017` §2): an open plan names a workflow the registry does not load. */
export const W_INSTANCE_WORKFLOW_UNKNOWN = 'W_INSTANCE_WORKFLOW_UNKNOWN';

/** The note of an `iterate_over` phase no candidate was counted for (`spec-017` §4.6, P4.16 sc. 3). */
export const NO_ITERATION_NOTE = 'no elements matched the iterate_over filter';

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

/**
 * A commit's place in the history walk (`spec-017` §4.8): its index in the `git log --topo-order` of
 * the union of the open instances' walks, `0` the commit at `HEAD`. A smaller position is listed first;
 * whether evidence is **newer than a re-entry** is decided by ancestry, not by position (review F1).
 */
export interface WalkPosition {
  readonly commit: string;
  readonly position: number;
}

/** One phase record (`spec-003` § "Evidence"): a commit carrying the `WingFoil-Phase: <w>.<p> completed` trailers. */
export interface PhaseRecord extends WalkPosition {
  /** `<workflow>.<phase>`, without the trailing ` completed`. */
  readonly phase: string;
  readonly instance: string;
  /** `WingFoil-Element`, `<type>:<id>`, or `null`. */
  readonly element: string | null;
  /** `WingFoil-Item`, `<collection>#<key>`, or `null`. */
  readonly item: string | null;
}

/**
 * One step linkage (`spec-017` §4.8): an add commit, `wf(<type>): add <id>`, whose trailers carry
 * `WingFoil-Instance` and `WingFoil-Step` — the element it adds was **created by** that step. One entry
 * per id the subject names.
 */
export interface StepLink extends WalkPosition {
  readonly instance: string;
  /** The step key, `<workflow>.<phase>[@<scope>]`, as `WingFoil-Step` gives it. */
  readonly step: string;
  readonly type: string;
  readonly id: string;
}

/**
 * One re-entry (`spec-017` §4.8): a `reject` or `park` commit, `wf(<type>): reject|park <ids> [<from> → <to>]`,
 * that moved the element to an earlier position of its type's `sequence`. One entry per id the subject names.
 */
export interface Reentry extends WalkPosition {
  readonly verb: 'reject' | 'park';
  readonly type: string;
  readonly id: string;
  /** The bracket's first state. */
  readonly from: string;
  /** The bracket's last state. */
  readonly to: string;
}

/**
 * A `wf(<type>): <verb> <ids> [… → <to>]` commit naming a re-entered element: the candidates for the
 * commit that put the element in its current status (§4.8, `state` evidence after a re-entry).
 */
export interface TransitionCommit extends WalkPosition {
  readonly type: string;
  readonly id: string;
  /** The bracket's last state. */
  readonly to: string;
}

/** What one instance's walk holds (§4.8): the commits reachable from `HEAD` and not from its start commit's parents. */
export interface InstanceHistory {
  /** Its phase records, newest first. */
  readonly records: readonly PhaseRecord[];
  /** Its step linkages, newest first. */
  readonly links: readonly StepLink[];
  /** Its re-entries, newest first. */
  readonly reentries: readonly Reentry[];
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
  /** What each instance's walk holds (§4.8) — records, linkages, re-entries — by the instance's start commit. */
  readonly history: ReadonlyMap<string, InstanceHistory>;
  /** The transition commits in the walk that name a re-entered element, newest first. */
  readonly transitions: readonly TransitionCommit[];
  /** The latest commit in the walk that changed each re-entered element's file, by `<type>:<id>` (one lookup each). */
  readonly lastChanges: ReadonlyMap<string, WalkPosition>;
  /**
   * The parent links of every commit of the walk, by sha (parents outside the walk included). "Newer than a
   * re-entry" means "descends from the re-entry commit", decided through them (§4.8, review F1 ruling (a)).
   */
  readonly parents: ReadonlyMap<string, readonly string[]>;
  /** The deduction inputs that differ from `HEAD` in the working tree, sorted (§1.2). */
  readonly dirty: readonly string[];
  /**
   * The entries of each collection a loaded workflow iterates over (`dna:<path>`, `bindings:<name>`,
   * `spec-003` § "Collections"), in declared order, by reference. A reference with no entry here has
   * no candidates. Absent: no collection is iterated.
   */
  readonly collections?: ReadonlyMap<string, readonly CollectionEntry[]>;
  /**
   * `workflows/bindings.yaml` at the snapshot's commit, as the registry loaded it, or `null` (none). Carried so
   * `workflow next` and `show` resolve bindings from the one registry load (task-216; W3 B3 handover). Absent:
   * not read.
   */
  readonly bindings?: BindingsYaml | null;
  /** `dna.yaml` at the snapshot's commit, or `null` (none): `next`'s role holders and agent roles (task-216). Absent: not read. */
  readonly dnaYaml?: DnaYaml | null;
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
  /** Every element a step of the instance created (§4.8 linkage), ascending `(type, id)`; the bound one included. */
  readonly created: readonly ElementRef[];
  readonly planStatus: 'draft' | 'active';
  readonly startCommit: string;
  readonly active: boolean;
  /** `true` when the bound element is archived (`deprecated`, `superseded`): the frontier is empty (§4.11). */
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

/** What an action acts on (`spec-017` §4.2, §8 `ActionView.target`). */
export type ActionTarget = 'bound' | 'selection' | 'created' | 'run' | 'none';

/**
 * One action of a step, as deduction resolves it (`spec-017` §4.1, §4.2): its text with the tokens
 * substituted, the tokens with no value, and the elements it acts on at `HEAD`. Its binding is `next`'s
 * (§6.1, `src/core/workflow-next.ts`).
 */
export interface DeducedAction {
  readonly token: string;
  /** The token with each `{…}` that has a value substituted; a pending or unresolved one is kept as written. */
  readonly text: string;
  /** The `{…}` tokens with no value (each reported `W_UNRESOLVED_TOKEN`), in order. */
  readonly unresolved: readonly string[];
  readonly target: ActionTarget;
  /** The Memory type the action acts on when deduction knows it (`null`: a selection of several types, or none). */
  readonly targetType: string | null;
  /**
   * The elements the action acts on, known at `HEAD`, ascending `(type, id)`: the bound element, the
   * selected ones, the ones the step (or, for a `run` target, an earlier step of the pass) created, or those a
   * `<T>.sync_state(for_each: <type>.<field>)` names. Empty when none is known yet.
   */
  readonly targets: readonly ElementRef[];
  /** The bound element's state just before this action, computed statically (§4.4), or `null`. */
  readonly boundFrom: string | null;
  /** For a `<T>.sync_state(for_each: <S>.<field>)`: the type and the state of the source element `S` at this action. */
  readonly source?: { readonly type: string; readonly state: string | null };
}

/** A leaf step on an instance's frontier (`spec-017` §4.9; the part of §8's `Step` deduction decides). */
export interface DeducedStep {
  /** `<workflow>.<phase>`, then `@<type>:<id>` or `@<collection>#<key>` when the step runs on a scope. */
  readonly key: string;
  readonly instance: string;
  readonly trail: readonly TrailEntry[];
  readonly workflow: string;
  readonly phase: string;
  readonly scope: ScopeRef | null;
  readonly role: string | null;
  readonly optional: boolean;
  readonly produces: readonly ProducesView[];
  /** The elements this step created (§4.8 linkage), ascending `(type, id)`. */
  readonly created: readonly ElementRef[];
  readonly evidence: {
    readonly kinds: readonly EvidenceKind[];
    readonly missing: readonly EvidenceKind[];
    /** `true` when the only evidence missing is a `record` (`workflow finalize`, §7.9). */
    readonly finalizable: boolean;
  };
  /**
   * `true` when a re-entry of the element the pass runs on (§4.8) reaches this phase — it lies at or
   * after the `fallback.step` of the phase whose gate the re-entry left — so its `record` and `state`
   * evidence count only if newer than the re-entry (§5.2).
   */
  readonly reentered: boolean;
  /** The first listed such re-entry commit (the newest in a linear history), or `null`. */
  readonly reentryCommit: string | null;
  /** The phase's actions, resolved (§4.1, §4.2), in declared order (task-216). */
  readonly actions: readonly DeducedAction[];
}

/** How an `iterate_over` phase's candidates stand (`spec-017` §4.6, §4.7, §8). */
export interface IterationCounts {
  readonly eligible: number;
  readonly entered: number;
  readonly complete: number;
  /** The candidates still open when a later phase closed the live query (§4.7). */
  readonly late: number;
  /** {@link NO_ITERATION_NOTE} when no candidate was counted (P4.16 sc. 3). */
  readonly note?: string;
}

/** One top-level phase of an instance (`spec-017` §7.4, §8). */
export interface PhaseProgress {
  readonly phase: string;
  /** `skipped`: an optional phase a later non-vacuous completion passed over (§4.10). */
  readonly state: 'complete' | 'current' | 'pending' | 'skipped';
  /** `true` on a phase complete only vacuously (§4.7): a live query that found nothing. */
  readonly vacuous?: boolean;
  /** The candidates of an `iterate_over` phase, once it is complete or current. */
  readonly iterations?: IterationCounts;
}

/** One open instance, deduced. */
export interface InstanceDeduction {
  readonly instance: Instance;
  /** `true` when every phase is complete (an empty frontier of a known workflow). */
  readonly complete: boolean;
  readonly phases: readonly PhaseProgress[];
  readonly frontier: readonly DeducedStep[];
  /** The elements a live query matches after a later phase closed it (§4.7), ascending `(type, id)`. */
  readonly late: readonly ElementRef[];
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

/** `<type>:<id>` of an element scope, `<collection>#<key>` of a collection-entry scope (`spec-017` §4.8, §4.9). */
function scopeKey(scope: ScopeRef): string {
  if ('item' in scope) return `${scope.item.collection}#${scope.item.key}`;
  return `${scope.element.type}:${scope.element.id}`;
}

function refOf(element: Element): ElementRef {
  return { type: element.type, id: element.id, status: element.status };
}

/** Ascending `(type, id)` (`spec-017` §1.3, "elements a step created or awaits"). */
function compareRefs(a: ElementRef, b: ElementRef): number {
  return compareText(a.type, b.type) || compareText(a.id, b.id);
}

// --- Scope and tokens (§4.1) -------------------------------------------------------------------------

/** One enclosing scope: the element a workflow runs on. */
interface ElementFrame {
  readonly kind: 'element';
  readonly type: string;
  /** `null` when the element is not found, or (with `pending`) not yet created. */
  readonly element: Element | null;
  /** A self-creating workflow before its element exists: its tokens are pending, not unresolved (§3.4). */
  readonly pending: boolean;
  /**
   * A self-creating workflow's element, bound by its creating step's linkage (§3.4). Before it existed
   * the instance's steps had no scope, so a linkage written then names the unscoped key.
   */
  readonly selfBound?: boolean;
}

/** One enclosing scope: the collection entry an `iterate_over` over a collection runs on (§4.6). */
interface ItemFrame {
  readonly kind: 'item';
  /** The `iterate_over` reference, `dna:<path>` or `bindings:<name>`. */
  readonly collection: string;
  readonly key: string;
  readonly entry: CollectionEntry;
}

type Frame = ElementFrame | ItemFrame;

/** The scope a step runs on: its innermost frame's element or collection entry (§4.9). */
function scopeOf(frames: readonly Frame[]): ScopeRef | null {
  const frame = frames[frames.length - 1];
  if (frame === undefined) return null;
  if (frame.kind === 'item') return { item: { collection: frame.collection, key: frame.key } };
  return frame.element === null ? null : { element: refOf(frame.element) };
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

/** A collection reference (`dna:<path>`, `bindings:<name>`) rather than a Memory type (`spec-003` § "Collections"). */
const COLLECTION_REF_RE = /^(dna|bindings):/;

/** `{item}` / `{item.<field>}` against the innermost collection entry (§4.1, `spec-003` § "Collections"). */
function itemValue(inner: string, frames: readonly Frame[]): { value: string } | { reason: string } {
  const frame = [...frames].reverse().find((candidate): candidate is ItemFrame => candidate.kind === 'item');
  if (frame === undefined) return { reason: 'no collection entry in scope' };
  if (inner === 'item') return { value: frame.key };
  const field = inner.slice('item.'.length);
  const raw = typeof frame.entry === 'object' && frame.entry !== null ? scalarText(frame.entry[field]) : null;
  return raw === null ? { reason: `${frame.collection}#${frame.key} has no value for '${field}'` } : { value: raw };
}

/**
 * Substitute the `{…}` tokens of `text` against `frames` (innermost last), as whole values, never
 * evaluated (`dl-090` Q3 (a)): `{<type>.<field>}` against the nearest element of `<type>`; `{id}`,
 * `{<field>}` and `{element.<field>}` against the innermost element; `{item}` and `{item.<field>}`
 * against the innermost collection entry.
 */
function resolveTokens(text: string, frames: readonly Frame[]): Resolved {
  const unresolved: { token: string; reason: string }[] = [];
  let pending = false;
  const elementFrames = frames.filter((frame): frame is ElementFrame => frame.kind === 'element');
  const value = text.replace(TOKEN_RE, (token, inner: string) => {
    let frame: ElementFrame | undefined;
    let field: string;
    const dot = inner.indexOf('.');
    if (inner === 'item' || inner.startsWith('item.')) {
      const item = itemValue(inner, frames);
      if ('value' in item) return item.value;
      unresolved.push({ token, reason: item.reason });
      return token;
    }
    if (dot === -1) {
      frame = elementFrames[elementFrames.length - 1];
      field = inner;
    } else {
      const head = inner.slice(0, dot);
      field = inner.slice(dot + 1);
      frame = head === 'element' ? elementFrames[elementFrames.length - 1] : [...elementFrames].reverse().find((candidate) => candidate.type === head);
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
/** The untyped tokens that act on the created elements, the selection or the bound element (`spec-017` §4.2). */
const UNTYPED_TARGET_VERBS: readonly string[] = ['memory.submit', 'memory.approve', 'memory.reject', 'memory.deprecate', 'element.set_state', 'element.set_release'];

/** A frontmatter value as a list of strings (absent: none). */
function asStrings(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}
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
  /** `true` when some phase is complete other than vacuously (§4.6 "entered", §4.7). */
  readonly progressed: boolean;
  readonly phases: PhaseProgress[];
  readonly frontier: DeducedStep[];
  /** The `W_UNRESOLVED_TOKEN`s of the frontier steps, in frontier order. */
  readonly diagnostics: Diagnostic[];
  /** The late elements (§4.7) of the phases that ran, unsorted. */
  readonly late: ElementRef[];
}

/** The history of an instance with nothing in its walk. */
const EMPTY_HISTORY: InstanceHistory = { records: [], links: [], reentries: [] };

/** `<type>:<id>` of an element. */
function keyOf(element: { readonly type: string; readonly id: string }): string {
  return `${element.type}:${element.id}`;
}

/** Ascending `(type, id)` (`spec-017` §1.3, "elements a step created"). */
function byTypeThenId(a: Element, b: Element): number {
  return compareText(a.type, b.type) || compareText(a.id, b.id);
}

/** The newest of the re-entries that reach a step (the smallest walk position), for display; `null` for none. */
function newest(reentries: readonly WalkPosition[]): WalkPosition | null {
  return reentries.reduce<WalkPosition | null>((best, entry) => (best === null || entry.position < best.position ? entry : best), null);
}

/** One phase, evaluated on its own, before the sequence rules of §4.7, §4.9 and §4.10 apply. */
interface PhaseEval {
  readonly complete: boolean;
  /** Complete only because a live query found nothing (§4.7). */
  readonly vacuous: boolean;
  /** A selection or an `iterate_over` phase: a live query §4.7 may close. */
  readonly liveQuery: boolean;
  readonly frontier: DeducedStep[];
  readonly diagnostics: Diagnostic[];
  readonly iterations?: IterationCounts;
  /** The late elements its subs report while it is complete or current. */
  readonly late: ElementRef[];
  /** When a later phase closes it (§4.7): the elements reported `late`, and how many candidates that is. */
  readonly closed: { readonly late: ElementRef[]; readonly count: number };
}

/** The read-only context of one deduction. */
class Deducer {
  private readonly byName = new Map<string, Workflow>();
  private readonly fileOf = new Map<string, string>();
  private readonly tree: ReadonlySet<string>;
  private readonly elements: readonly Element[];
  /** The walk's child links (the inverse of `snapshot.parents`), built on first use. */
  private children: Map<string, string[]> | null = null;
  /** The strict descendants in the walk of each re-entry commit asked about. */
  private readonly descendantsOf = new Map<string, ReadonlySet<string>>();

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

  /** What the walk of the instance started at `startCommit` holds (§4.8). */
  private history(startCommit: string): InstanceHistory {
    return this.snapshot.history.get(startCommit) ?? EMPTY_HISTORY;
  }

  /**
   * The elements an instance's steps created (§4.8 linkage): the add commits of its walk whose
   * `WingFoil-Instance` is the instance and whose `WingFoil-Step` is one of `steps` (every step when
   * `null`), each element once, ascending `(type, id)`. An element `HEAD` does not hold is left out.
   */
  createdBy(instanceId: string, startCommit: string, steps: readonly string[] | null): Element[] {
    const found = new Map<string, Element>();
    for (const link of this.history(startCommit).links) {
      if (link.instance !== instanceId || (steps !== null && !steps.includes(link.step))) continue;
      const element = this.find(link.type, link.id);
      if (element !== null) found.set(keyOf(element), element);
    }
    return [...found.values()].sort(byTypeThenId);
  }

  /**
   * The commit that put `element` in its current status (§4.8, `state` after a re-entry): the latest
   * transition commit naming it whose bracket ends at that status, else the latest commit in the walk that
   * changed its file; `null` (older than anything in the walk) when neither.
   */
  private stateCommit(element: Element): string | null {
    const named = this.snapshot.transitions.find((entry) => entry.type === element.type && entry.id === element.id && entry.to === element.status);
    return named?.commit ?? this.snapshot.lastChanges.get(keyOf(element))?.commit ?? null;
  }

  /** The strict descendants of `commit` within the walk, through its parent links (§4.8, review F1). */
  private descendants(commit: string): ReadonlySet<string> {
    const known = this.descendantsOf.get(commit);
    if (known !== undefined) return known;
    if (this.children === null) {
      this.children = new Map();
      for (const [child, parents] of this.snapshot.parents) {
        for (const parent of parents) this.children.set(parent, [...(this.children.get(parent) ?? []), child]);
      }
    }
    const found = new Set<string>();
    const pending = [...(this.children.get(commit) ?? [])];
    while (pending.length > 0) {
      const next = pending.pop()!;
      if (found.has(next)) continue;
      found.add(next);
      pending.push(...(this.children.get(next) ?? []));
    }
    this.descendantsOf.set(commit, found);
    return found;
  }

  /** Whether `commit` is newer than every re-entry in `reentries`: a strict descendant of each (§4.8). */
  private newerThan(commit: string | null, reentries: readonly WalkPosition[]): boolean {
    return reentries.every((reentry) => commit !== null && this.descendants(reentry.commit).has(commit));
  }

  /**
   * The re-entry cutoff of each phase of a pass of `workflow` on `element` (§4.8 re-entries, §5.2): for
   * every re-entry of the element in the instance's walk, the phase whose gate state was its `<from>` —
   * the first phase that holds that gate (§5.1) and declares a `fallback` — names a `fallback.step`; from
   * that phase onward the `record` and `state` evidence counts only if newer than the re-entry — a
   * descendant of its commit. A phase reached by several re-entries keeps them all, and its evidence must
   * descend from each; `inherited` is what reaches the including phase. A
   * re-entry from a state no phase holds as a gate with a fallback reaches no phase: the element's state
   * alone tells the deduction where the pass stands.
   */
  private cutoffs(
    startCommit: string,
    workflow: Workflow,
    exits: readonly PhaseExitState[],
    element: Element | null,
    inherited: readonly WalkPosition[],
  ): WalkPosition[][] {
    const out: WalkPosition[][] = workflow.phases.map(() => [...inherited]);
    if (element === null) return out;
    for (const reentry of this.history(startCommit).reentries) {
      if (reentry.type !== element.type || reentry.id !== element.id) continue;
      const gate = workflow.phases.findIndex(
        (phase, p) => phase.fallback !== undefined && exits[p]!.held.some((held) => held.type === reentry.type && held.gate === reentry.from),
      );
      if (gate === -1) continue;
      // A `fallback.step` naming no phase is refused at load time (`E_PHASE_FALLBACK_STEP_UNKNOWN`, spec-003).
      const from = workflow.phases.findIndex((phase) => phase.name === workflow.phases[gate]!.fallback!.step);
      for (let q = from; q < out.length; q += 1) out[q]!.push(reentry);
    }
    return out;
  }

  /**
   * Run a workflow on `frames`, from `start` (§4.4), under `trail`; `inherited` are the re-entries reaching
   * the including phase (§4.8). In declared order, a phase is complete
   * when its evidence is; a live query (§4.7) is also complete, and an optional phase (§4.10) skipped,
   * when a later phase is complete other than vacuously; the first other phase is current and gives the
   * frontier. A phase is evaluated only when one of these rules needs it, at most once.
   */
  run(
    instanceId: string,
    startCommit: string,
    workflow: Workflow,
    frames: readonly Frame[],
    start: ExitStart,
    trail: readonly TrailEntry[],
    inherited: readonly WalkPosition[] = [],
  ): WorkflowResult {
    // `memory.yaml` is present: a workflow runs only for an open plan, an element of a declared type.
    const exits = workflowExitStates(workflow, this.snapshot.memoryYaml!, start, this.byName);
    const last = frames[frames.length - 1];
    // A collection entry has no re-entries: only an element scope cuts evidence (§4.8).
    const cutoffs = this.cutoffs(startCommit, workflow, exits, last?.kind === 'element' ? last.element : null, inherited);
    const scope = scopeOf(frames);
    const evals: PhaseEval[] = [];
    const evaluated = (p: number): PhaseEval =>
      (evals[p] ??= this.evaluate(
        instanceId,
        startCommit,
        workflow,
        p,
        frames,
        exits[p]!,
        [...trail, { workflow: workflow.name, phase: workflow.phases[p]!.name, scope }],
        scope,
        cutoffs[p]!,
      ));
    const closedFrom = (p: number): boolean => {
      for (let q = p + 1; q < workflow.phases.length; q += 1) {
        const later = evaluated(q);
        if (later.complete && !later.vacuous) return true;
      }
      return false;
    };

    const phases: PhaseProgress[] = [];
    let frontier: DeducedStep[] = [];
    let diagnostics: Diagnostic[] = [];
    const late: ElementRef[] = [];
    let current = false;
    let progressed = false;

    workflow.phases.forEach((phase, p) => {
      if (current) {
        phases.push({ phase: phase.name, state: 'pending' });
        return;
      }
      const evaluation = evaluated(p);
      if (evaluation.complete) {
        phases.push(progress(phase.name, 'complete', evaluation.vacuous, evaluation.iterations));
        late.push(...evaluation.late);
        progressed ||= !evaluation.vacuous;
        return;
      }
      if (evaluation.liveQuery && closedFrom(p)) {
        const { iterations } = evaluation;
        const closed = iterations === undefined ? undefined : { eligible: 0, entered: 0, complete: iterations.complete, late: evaluation.closed.count };
        phases.push(progress(phase.name, 'complete', false, closed));
        late.push(...evaluation.closed.late);
        progressed = true;
        return;
      }
      if (phase.optional && closedFrom(p)) {
        phases.push({ phase: phase.name, state: 'skipped' });
        return;
      }
      current = true;
      phases.push(progress(phase.name, 'current', false, evaluation.iterations));
      late.push(...evaluation.late);
      frontier = [...evaluation.frontier];
      diagnostics = [...evaluation.diagnostics];
      // An optional current phase is reported together with the phases up to the next non-optional one (§4.10).
      for (let q = p + 1; phase.optional && q < workflow.phases.length; q += 1) {
        const later = evaluated(q);
        if (later.complete) continue;
        frontier.push(...later.frontier);
        diagnostics.push(...later.diagnostics);
        if (!workflow.phases[q]!.optional) break;
      }
    });
    return { complete: !current, progressed, phases, frontier, diagnostics, late };
  }

  /** Evaluate phase `p` on its own: a plain `include`, an `iterate_over` or a leaf step. */
  private evaluate(
    instanceId: string,
    startCommit: string,
    workflow: Workflow,
    p: number,
    frames: readonly Frame[],
    exit: PhaseExitState,
    trail: readonly TrailEntry[],
    scope: ScopeRef | null,
    reentries: readonly WalkPosition[],
  ): PhaseEval {
    const phase = workflow.phases[p]!;
    // The include resolves: the registry refuses one naming no loaded workflow (`spec-003` loader rows).
    if (phase.include !== undefined && phase.iterate_over !== undefined) {
      return this.iterate(instanceId, startCommit, workflow, p, frames, exit, trail, scope, reentries);
    }
    // A plain `include` (§4.5): the sub runs on the same element, from the state this phase starts in.
    if (phase.include !== undefined) {
      const sub = this.byName.get(phase.include)!;
      const result = this.run(instanceId, startCommit, sub, frames, { boundType: sub.element ?? exit.boundType, state: exit.entry, instance: false }, trail, reentries);
      return {
        complete: result.complete,
        vacuous: result.complete && !result.progressed,
        liveQuery: false,
        frontier: result.frontier,
        diagnostics: result.diagnostics,
        late: result.late,
        closed: { late: [], count: 0 },
      };
    }
    const leaf = this.leaf(instanceId, startCommit, workflow, p, frames, exit, trail, scope, reentries);
    const { kinds, missing } = leaf.step.evidence;
    const complete = missing.length === 0;
    const selection = kinds.includes('selection');
    return {
      complete,
      // A selection that matches nothing, with no other evidence than an empty `created` (§4.7).
      vacuous: complete && selection && leaf.step.created.length === 0 && kinds.every((kind) => kind === 'selection' || kind === 'created'),
      liveQuery: selection,
      frontier: [leaf.step],
      diagnostics: leaf.diagnostics,
      late: [],
      closed: { late: leaf.selected, count: leaf.selected.length },
    };
  }

  /** The `where` values of `phase`, resolved against `frames`, by key in byte order; `null` when a token has no value. */
  private wanted(phase: Phase, p: number, frames: readonly Frame[], report: (path: string, resolved: Resolved) => void): [string, string[]][] | null {
    const wanted: [string, string[]][] = [];
    let decidable = true;
    for (const key of Object.keys(phase.where ?? {}).sort()) {
      const raw = phase.where![key]!;
      const values = (Array.isArray(raw) ? raw : [raw]).map((value) => {
        if (typeof value !== 'string') return String(value);
        const resolved = resolveTokens(value, frames);
        report(`phases[${p}].where.${key}`, resolved);
        if (resolved.value === null) decidable = false;
        return resolved.value ?? value;
      });
      wanted.push([key, values]);
    }
    return decidable ? wanted : null;
  }

  /** The `W_UNRESOLVED_TOKEN` reporter of one step of `workflow`. */
  private reporter(workflow: Workflow, stepName: string, diagnostics: Diagnostic[]): (path: string, resolved: Resolved) => void {
    const file = this.fileOf.get(workflow.name)!;
    return (path, resolved) => {
      for (const { token, reason } of resolved.unresolved) {
        diagnostics.push({ code: W_UNRESOLVED_TOKEN, severity: 'warning', file, path, message: `token '${token}' of ${stepName} has no value: ${reason}` });
      }
    };
  }

  /**
   * Comparator of the iteration order over `type` (`spec-017` §1.3): ascending by the `{n}` token of the
   * type's `id_pattern` when it has one — an id that does not match the pattern after every one that
   * does — else byte-wise ascending `id`.
   */
  private iterationOrder(type: string): (a: Element, b: Element) => number {
    const pattern = this.snapshot.memoryYaml!.types[type]!.id_pattern;
    const numeric = pattern !== undefined && [...pattern.matchAll(TOKEN_RE)].some((match) => isNumericToken(match[1]!));
    const byId = (a: Element, b: Element): number => compareText(a.id, b.id);
    if (!numeric) return byId;
    const re = new RegExp(`^${patternToSource(pattern, { captureNumeric: true })}$`);
    const n = (element: Element): number => {
      const match = re.exec(element.id);
      return match === null ? Number.POSITIVE_INFINITY : Number(match[1]);
    };
    return (a, b) => {
      const [x, y] = [n(a), n(b)];
      return x === y ? byId(a, b) : x < y ? -1 : 1;
    };
  }

  /**
   * An `iterate_over` phase (§4.6): the sub once per candidate, in iteration order. Over a Memory type the
   * `status` key of `where` is the entry filter and the other keys the scope filter; archived elements are
   * never candidates (§4.11). Over a collection every entry matching `where` is a candidate. A candidate is
   * complete when the sub is, entered when one of its phases is complete other than vacuously, eligible
   * when it matches the entry filter, otherwise ignored. A `where` token with no value leaves the phase a
   * single unexpanded step, reported with the token.
   */
  private iterate(
    instanceId: string,
    startCommit: string,
    workflow: Workflow,
    p: number,
    frames: readonly Frame[],
    exit: PhaseExitState,
    trail: readonly TrailEntry[],
    scope: ScopeRef | null,
    reentries: readonly WalkPosition[],
  ): PhaseEval {
    const phase = workflow.phases[p]!;
    const over = phase.iterate_over!;
    const sub = this.byName.get(phase.include!)!;
    const whereDiagnostics: Diagnostic[] = [];
    const wanted = this.wanted(phase, p, frames, this.reporter(workflow, `${workflow.name}.${phase.name}`, whereDiagnostics));
    if (wanted === null) {
      const leaf = this.leaf(instanceId, startCommit, workflow, p, frames, exit, trail, scope, reentries);
      return { complete: false, vacuous: false, liveQuery: true, frontier: [leaf.step], diagnostics: [...whereDiagnostics, ...leaf.diagnostics], late: [], closed: { late: [], count: 0 } };
    }

    // Each candidate: the frame it adds, the state its sub starts from, whether it passes the entry filter.
    const candidates: { frame: Frame; start: ExitStart; entry: boolean; ref: ElementRef | null }[] = [];
    if (COLLECTION_REF_RE.test(over)) {
      for (const item of this.snapshot.collections?.get(over) ?? []) {
        // Every key exists: the registry refuses a collection with a key problem (`E_BINDING_COLLECTION_KEY`,
        // `E_WORKFLOW_COLLECTION_UNRESOLVED`).
        const key = collectionEntryKey(item)!;
        const fields = typeof item === 'object' && item !== null ? item : {};
        if (!wanted.every(([field, values]) => matches(fields[field], values))) continue;
        candidates.push({ frame: { kind: 'item', collection: over, key, entry: item }, start: { boundType: null, state: null, instance: false }, entry: true, ref: null });
      }
    } else {
      const status = wanted.find(([key]) => key === 'status')?.[1];
      const scopeFilter = wanted.filter(([key]) => key !== 'status');
      const start: ExitStart = { boundType: sub.element ?? over, state: iterationStartState(this.snapshot.memoryYaml!, over, phase.where), instance: false };
      this.elements
        .filter((element) => element.type === over && !isArchivedStatus(element.status) && scopeFilter.every(([key, values]) => matches(element.frontmatter[key], values)))
        .sort(this.iterationOrder(over))
        .forEach((element) => {
          candidates.push({
            frame: { kind: 'element', type: over, element, pending: false },
            start,
            entry: status === undefined || status.includes(element.status),
            ref: refOf(element),
          });
        });
    }

    const counts = { eligible: 0, entered: 0, complete: 0 };
    const frontier: DeducedStep[] = [];
    const diagnostics: Diagnostic[] = [];
    const late: ElementRef[] = [];
    const completeLate: ElementRef[] = [];
    const open: ElementRef[] = [];
    let openCount = 0;
    for (const candidate of candidates) {
      // No cutoff is handed to an iteration: each iterated element has its own re-entries, which its sub's
      // run finds (§4.8; approver ruling 2026-10-09).
      const result = this.run(instanceId, startCommit, sub, [...frames, candidate.frame], candidate.start, trail);
      if (result.complete) {
        counts.complete += 1;
        completeLate.push(...result.late);
        continue;
      }
      if (result.progressed) counts.entered += 1;
      else if (candidate.entry) counts.eligible += 1;
      else continue;
      openCount += 1;
      if (candidate.ref !== null) open.push(candidate.ref);
      frontier.push(...result.frontier);
      diagnostics.push(...result.diagnostics);
      late.push(...result.late);
    }
    const counted = counts.eligible + counts.entered + counts.complete;
    return {
      complete: openCount === 0,
      vacuous: counted === 0,
      liveQuery: true,
      frontier,
      diagnostics,
      iterations: { ...counts, late: 0, ...(counted === 0 ? { note: NO_ITERATION_NOTE } : {}) },
      late: [...completeLate, ...late],
      closed: { late: [...completeLate, ...open], count: openCount },
    };
  }

  /** Evaluate one phase as a leaf step: its evidence, its `produces`, its unresolved tokens, what its selection matches. */
  private leaf(
    instanceId: string,
    startCommit: string,
    workflow: Workflow,
    p: number,
    frames: readonly Frame[],
    exit: PhaseExitState,
    trail: readonly TrailEntry[],
    scope: ScopeRef | null,
    reentries: readonly WalkPosition[],
  ): { step: DeducedStep; diagnostics: Diagnostic[]; selected: ElementRef[] } {
    const phase = workflow.phases[p]!;
    const stepName = `${workflow.name}.${phase.name}`;
    const key = scope === null ? stepName : `${stepName}@${scopeKey(scope)}`;
    const diagnostics: Diagnostic[] = [];
    const report = this.reporter(workflow, stepName, diagnostics);
    const last = frames[frames.length - 1];
    const frame = last?.kind === 'element' ? last : undefined;
    const kinds: EvidenceKind[] = [];
    const missing: EvidenceKind[] = [];
    let selected: ElementRef[] = [];

    // An `iterate_over` phase whose `where` cannot be resolved stays one unexpanded step (§4.6).
    if (phase.iterate_over !== undefined) {
      kinds.push('include');
      missing.push('include');
    }

    // state — the bound element at or after the phase's exit state (§4.4), set by a commit newer than every
    // re-entry that reaches this phase (§4.8).
    if (declaresState(phase, exit.boundType)) {
      kinds.push('state');
      const element = frame?.element ?? null;
      const satisfied =
        element !== null &&
        exit.exit !== null &&
        atOrAfter(resolveStateMachine(this.snapshot.memoryYaml!, element.type), element.status, exit.exit) &&
        this.newerThan(this.stateCommit(element), reentries);
      if (!satisfied) missing.push('state');
    }

    // What the step created (§4.8 linkage). A self-bound instance's steps had no scope before its element
    // existed, so a linkage written then names the unscoped key.
    const created = this.createdBy(instanceId, startCommit, frame?.selfBound ? [key, stepName] : [key]);

    // produces — every string entry, resolved, names a committed path; implicit owners are shown only. A
    // `{ type: T, path }` entry resolves against each element of `T` the step created and belongs to `created`.
    const produces: ProducesView[] = [];
    let producesEvidence = false;
    let producesMissing = false;
    let createdPathsMissing = false;
    (phase.produces ?? []).forEach((entry, k) => {
      if (typeof entry !== 'string') {
        const owned = created.filter((element) => element.type === entry.type);
        const resolved: string[] = [];
        for (const element of owned) {
          const result = resolveTokens(entry.path, [...frames, { kind: 'element', type: entry.type, element, pending: false }]);
          report(`phases[${p}].produces[${k}].path`, result);
          if (result.value !== null) resolved.push(result.value);
        }
        const exists = owned.length > 0 && resolved.length === owned.length && resolved.every((path) => this.exists(path));
        if (!exists) createdPathsMissing = true;
        produces.push({ pattern: entry.path, owner: entry.type, resolved, exists, evidence: false });
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

    // created — for each type the phase adds, the step created at least one element, each at or after the
    // state the phase leaves it in (§4.4), with each `{ type, path }` entry committed for it (§4.3). A step
    // that created nothing leaves the kind to its other evidence, or to a record (below).
    if ((phase.actions ?? []).some((action) => tokenName(action) === 'memory.add')) {
      kinds.push('created');
      if (created.length > 0 && (createdPathsMissing || !this.createdReachTargets(exit, created))) missing.push('created');
    }

    if (producesEvidence) {
      kinds.push('produces');
      if (producesMissing) missing.push('produces');
    }

    // selection — no Memory document at HEAD matches the phase's `where`; an archived one never does (§4.11).
    if (phase.where !== undefined && phase.iterate_over === undefined) {
      kinds.push('selection');
      const wanted = this.wanted(phase, p, frames, report);
      if (wanted !== null) {
        selected = this.elements
          .filter((element) => !isArchivedStatus(element.status) && wanted.every(([field, values]) => matches(element.frontmatter[field], values)))
          .map(refOf);
      }
      if (wanted === null || selected.length > 0) missing.push('selection');
    }

    // awaits — evaluated from v1.0 (P4.12); the step completes by a record (§5.4).
    if (phase.awaits !== undefined) kinds.push('awaits');

    // record — a checkpoint, an `awaits` (always, §4.3 `awaits` row, §5.4), or a `created` step that
    // created nothing and has no other evidence (§4.3).
    const recordNeeded = phase.awaits !== undefined || (created.length === 0 && !kinds.some((kind) => kind !== 'created'));
    if (recordNeeded) {
      kinds.push('record');
      if (!this.hasRecord(instanceId, startCommit, stepName, scope, frame?.selfBound === true, reentries)) missing.push('record');
    }

    const actions = this.actionsOf(instanceId, startCommit, workflow, p, frames, exit, scope, created, selected, report);

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
        created: created.map(refOf),
        evidence: { kinds, missing, finalizable: missing.length === 1 && missing[0] === 'record' },
        reentered: reentries.length > 0,
        reentryCommit: newest(reentries)?.commit ?? null,
        actions,
      },
      diagnostics,
      selected,
    };
  }

  /**
   * The actions of phase `p`, resolved (`spec-017` §4.1, §4.2; task-216): each token's text with its `{…}`
   * substituted against `frames`, the tokens with no value (reported `W_UNRESOLVED_TOKEN` at
   * `phases[p].actions[k]`), and what it acts on — the targets of §4.2's table, read at `HEAD`. A `{T.<field>}`
   * whose `T` the phase's selection selects and no enclosing scope binds resolves per selected element when
   * the action runs (§4.1), so it is kept as written and is not unresolved.
   */
  private actionsOf(
    instanceId: string,
    startCommit: string,
    workflow: Workflow,
    p: number,
    frames: readonly Frame[],
    exit: PhaseExitState,
    scope: ScopeRef | null,
    created: readonly Element[],
    selected: readonly ElementRef[],
    report: (path: string, resolved: Resolved) => void,
  ): DeducedAction[] {
    const phase = workflow.phases[p]!;
    const selectedTypes = phase.where !== undefined && phase.iterate_over === undefined ? asStrings(phase.where['type']) : [];
    const last = frames[frames.length - 1];
    const bound = last?.kind === 'element' ? last.element : null;
    const sorted = (elements: readonly ElementRef[]): ElementRef[] => [...elements].sort(compareRefs);
    let addedType: string | null = null;
    return (phase.actions ?? []).map((token, a): DeducedAction => {
      const resolved = resolveTokens(token, frames);
      const unresolved = resolved.unresolved.filter(
        ({ token: name, reason }) => !(reason === 'no element in scope' && selectedTypes.includes(name.slice(1, -1).split('.')[0]!)),
      );
      report(`phases[${p}].actions[${a}]`, { ...resolved, unresolved });
      // Each token with a value substituted; a pending or unresolved one (no value) kept as written.
      const text = token.replace(TOKEN_RE, (whole) => resolveTokens(whole, frames).value ?? whole);
      // The bound element's state before this action: the static state (§4.4) once an earlier action of the phase
      // moved it; until then its status at `HEAD`, since the static start of an instance is its type's first state.
      // `actionStates` holds one entry per action (`workflow-exit-state.ts`).
      const statics = exit.actionStates;
      const boundFrom = bound !== null && statics[a] === statics[0] ? bound.status : (statics[a] as string | null);
      const base = { token, text, unresolved: unresolved.map((entry) => entry.token), boundFrom };
      const target = this.actionTarget(instanceId, startCommit, workflow, p, frames, exit, scope, created, selected, token, boundFrom, addedType);
      if (tokenName(token) === 'memory.add') addedType = memoryAddType(token);
      return { ...base, ...target, targets: sorted(target.targets) };
    });
  }

  /**
   * What one action of phase `p` acts on (`spec-017` §4.2's table): `created` after (or at) a `memory.add` of
   * the phase, else the phase's selection, else the bound element, for the untyped verbs; for `<T>.set_state`
   * the bound element of `T`, else the elements of `T` an earlier step of the pass created (`run`), else the
   * selection of `T`; for `<T>.sync_state(for_each: <S>.<field>)` the elements of `T` that field of the
   * nearest `S` names; otherwise nothing.
   */
  private actionTarget(
    instanceId: string,
    startCommit: string,
    workflow: Workflow,
    p: number,
    frames: readonly Frame[],
    exit: PhaseExitState,
    scope: ScopeRef | null,
    created: readonly Element[],
    selected: readonly ElementRef[],
    token: string,
    boundFrom: string | null,
    addedType: string | null,
  ): Pick<DeducedAction, 'target' | 'targetType' | 'targets' | 'source'> {
    const phase = workflow.phases[p]!;
    const name = tokenName(token);
    const last = frames[frames.length - 1];
    const frame = last?.kind === 'element' ? last : undefined;
    const boundRefs = frame?.element ? [refOf(frame.element)] : [];
    const ofType = (elements: readonly Element[], type: string | null): ElementRef[] => elements.filter((element) => element.type === type).map(refOf);
    const none = { target: 'none' as const, targetType: null, targets: [] };
    if (name === 'memory.add') {
      const type = memoryAddType(token);
      return { target: 'created', targetType: type, targets: ofType(created, type) };
    }
    if (UNTYPED_TARGET_VERBS.includes(name)) {
      if (addedType !== null) return { target: 'created', targetType: addedType, targets: ofType(created, addedType) };
      if (phase.where !== undefined && phase.iterate_over === undefined) return { target: 'selection', targetType: null, targets: selected };
      return frame === undefined ? none : { target: 'bound', targetType: frame.type, targets: boundRefs };
    }
    const typed = typedStateType(token);
    if (typed === null) return none;
    if (name.endsWith('.set_state')) {
      if (frame?.type === typed) return { target: 'bound', targetType: typed, targets: boundRefs };
      if (exit.run.some((element) => element.type === typed)) {
        // The elements of `T` an earlier step of the same pass created (§4.2): the earlier phases' keys on this scope.
        const suffix = scope === null ? '' : `@${scopeKey(scope)}`;
        const earlier = workflow.phases.slice(0, p).flatMap(({ name: earlierName }) => {
          const stepName = `${workflow.name}.${earlierName}`;
          return frame?.selfBound ? [stepName + suffix, stepName] : [stepName + suffix];
        });
        return { target: 'run', targetType: typed, targets: ofType(this.createdBy(instanceId, startCommit, earlier), typed) };
      }
      const selection = phase.where !== undefined && phase.iterate_over === undefined && asStrings(phase.where['type']).includes(typed);
      return { target: selection ? 'selection' : 'none', targetType: typed, targets: selection ? selected.filter((element) => element.type === typed) : [] };
    }
    // `<T>.sync_state(for_each: <S>.<field>)`: the elements of `T` the field of the nearest `S` names (§4.2).
    const named = /for_each\s*:\s*["']?([a-z][a-z0-9-]*)\.([A-Za-z0-9_-]+)/.exec(token);
    if (named === null) return { target: 'run', targetType: typed, targets: [] };
    const sourceType = named[1]!;
    const sourceFrame = [...frames].reverse().find((candidate): candidate is ElementFrame => candidate.kind === 'element' && candidate.type === sourceType);
    const source = sourceFrame?.element ?? null;
    const ids = asStrings(source?.frontmatter[named[2]!]);
    const targets = ids.map((id) => this.find(typed, id)).filter((element): element is Element => element !== null);
    const state = sourceFrame === frame ? boundFrom : (source?.status ?? null);
    return { target: 'run', targetType: typed, targets: targets.map(refOf), source: { type: sourceType, state } };
  }

  /**
   * Whether, for each type the phase adds (`exit.created`, its first `memory.add` of that type), the step
   * created an element of it and each such element is at or after the state the phase leaves it in (§4.3,
   * §4.4). An undetermined target state is never reached.
   */
  private createdReachTargets(exit: PhaseExitState, created: readonly Element[]): boolean {
    const targets = new Map<string, string | null>();
    for (const added of exit.created) if (!targets.has(added.type)) targets.set(added.type, added.state);
    for (const [type, target] of targets) {
      const owned = created.filter((element) => element.type === type);
      if (owned.length === 0 || target === null) return false;
      const machine = resolveStateMachine(this.snapshot.memoryYaml!, type);
      if (!owned.every((element) => atOrAfter(machine, element.status, target))) return false;
    }
    return true;
  }

  /**
   * Whether the instance's walk holds a record of step `stepName` on `scope` (§4.8 records) — its
   * `WingFoil-Element` or `WingFoil-Item` — newer than every re-entry that reaches the step (a descendant
   * of each). A self-bound scope also accepts a record with no element, written before the element existed.
   */
  private hasRecord(instanceId: string, startCommit: string, stepName: string, scope: ScopeRef | null, selfBound: boolean, reentries: readonly WalkPosition[]): boolean {
    const element = scope !== null && 'element' in scope ? scopeKey(scope) : null;
    const item = scope !== null && 'item' in scope ? scopeKey(scope) : null;
    return this.history(startCommit).records.some(
      (record) =>
        record.phase === stepName &&
        record.instance === instanceId &&
        (record.element === element || (selfBound && record.element === null)) &&
        record.item === item &&
        this.newerThan(record.commit, reentries),
    );
  }

  /** The frames an instance of `workflow` starts with, its bound element and its context (§3.4, §3.5). */
  bind(workflow: Workflow, plan: Element, startCommit: string): { frames: Frame[]; start: ExitStart; element: Element | null; context: ElementRef | null } {
    const id = scalarText(plan.frontmatter['element']);
    if (workflow.element !== undefined) {
      const element = id === null ? null : this.find(workflow.element, id);
      return {
        frames: [{ kind: 'element', type: workflow.element, element, pending: false }],
        start: { boundType: workflow.element, state: this.firstState(workflow.element), instance: true },
        element,
        context: null,
      };
    }
    const contextElement = id === null ? null : this.findAny(id);
    const context = contextElement === null ? null : refOf(contextElement);
    const creating = creatingPhaseIndex(workflow);
    // The creating phase is the one holding the first `memory.add`, so it has actions; a `memory.add` with
    // no `type:` names no type, and the instance then has no frame.
    const type = creating === -1 ? null : (workflow.phases[creating]!.actions!.map(memoryAddType).find((t): t is string => t !== null) ?? null);
    const start: ExitStart = { boundType: null, state: null, instance: true };
    if (type === null) return { frames: [], start, element: null, context };
    // Self-creating (§3.4): bound to the element of `type` its creating step created with the oldest add
    // commit (ties by ascending id); until then unbound, its tokens pending.
    const step = `${workflow.name}.${workflow.phases[creating]!.name}`;
    const bound =
      this.history(startCommit)
        .links.filter((link) => link.instance === plan.id && link.step === step && link.type === type)
        .sort((a, b) => b.position - a.position || compareText(a.id, b.id))
        .map((link) => this.find(link.type, link.id))
        .find((element): element is Element => element !== null) ?? null;
    if (bound === null) return { frames: [{ kind: 'element', type, element: null, pending: true }], start, element: null, context };
    return { frames: [{ kind: 'element', type, element: bound, pending: false, selfBound: true }], start, element: bound, context };
  }
}

/** A phase's progress entry, with `vacuous` and `iterations` only where they apply. */
function progress(phase: string, state: PhaseProgress['state'], vacuous: boolean, iterations: IterationCounts | undefined): PhaseProgress {
  return { phase, state, ...(vacuous ? { vacuous: true } : {}), ...(iterations !== undefined ? { iterations } : {}) };
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
    const startCommit = start?.commit ?? '';
    const base = {
      id: plan.id,
      workflow: workflowName,
      created: deducer.createdBy(plan.id, startCommit, null).map(refOf),
      planStatus: plan.status as 'draft' | 'active',
      startCommit,
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
      return { instance: { ...base, element: null, context: null }, complete: false, phases: [], frontier: [], late: [] };
    }
    const bound = deducer.bind(workflow, plan, startCommit);
    const element = bound.element === null ? null : refOf(bound.element);
    // An archived bound element abandons the instance: nothing is deduced for it (§4.11).
    if (bound.element !== null && isArchivedStatus(bound.element.status)) {
      return { instance: { ...base, element, context: bound.context, abandoned: true }, complete: false, phases: [], frontier: [], late: [] };
    }
    const result = deducer.run(plan.id, startCommit, workflow, bound.frames, bound.start, []);
    stepDiagnostics.push(...result.diagnostics);
    const late = new Map(result.late.map((ref) => [`${ref.type}:${ref.id}`, ref] as const));
    return {
      instance: { ...base, element, context: bound.context },
      complete: result.complete,
      phases: result.phases,
      frontier: result.frontier,
      late: [...late.values()].sort(compareRefs),
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
