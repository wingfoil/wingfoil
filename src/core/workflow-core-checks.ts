/**
 * The Workflow pillar's **core** checks (spec-003-workflows-yaml-schema § "Diagnostics", rows whose
 * "Runs in" is `core`; `spec-017` §2; task-194, `bug-150`): the checks that need `memory.yaml` or
 * `dna.yaml` as well as the loaded workflow files, and therefore cannot run in the pillar-isolated
 * loader (`./loaders.ts`, REQ-SYS-02). They run on a registry the loader has already accepted — a load
 * with an error throws before they are reached, so the error the user must fix first is the one
 * reported (spec-003).
 *
 * Rows, in table order: `E_PHASE_ROLE_UNKNOWN`, `E_PHASE_APPROVER_UNKNOWN`,
 * `E_WORKFLOW_ELEMENT_TYPE_UNKNOWN`, `E_WORKFLOW_COLLECTION_UNRESOLVED`, `E_PHASE_CADENCE_EVENT_UNKNOWN`
 * (spec-003 open question 3: an event that can never fire), then the warnings
 * `W_PHASE_TOKEN_OUT_OF_SCOPE`, `W_PHASE_EXIT_STATE_UNDETERMINED`, `W_PHASE_FALLBACK_STATE_MISMATCH`,
 * `W_PHASE_FALLBACK_NOT_REENTRANT`.
 *
 * Order (REQ-SYS-07): files in manifest `include` order; within a file the workflow-level row before
 * the phases, phases in declared order, and per phase the rows in table order; within one row, the
 * fields in the order each check visits them. The caller appends the result after the loader's own
 * diagnostics.
 *
 * A check is not decided when its input is missing (spec-003's rule for loader checks, applied here):
 * without `dna.yaml` no role, approver or `dna:` collection is checked; without `memory.yaml` no type,
 * cadence event, token, exit state or fallback; without a type's template its fields are not checked.
 * The first two skips are reported, each as one `W_WORKFLOW_CHECKS_NOT_RUN` warning ahead of the per-file
 * rows (`bug-281`, task-204), so an empty result means the checks ran and found nothing.
 */
import { resolveDnaPath } from '../dna/path';
import type { DnaYaml } from '../dna/schema';
import type { MemoryYaml } from '../memory/schema';
import { resolveStateMachine } from '../memory/state-machine';
import type { Diagnostic } from '../validation';
import { collectionKeyIssues, memoryAddType, tokenName, typedStateType, type BindingsYaml } from '../workflow/bindings';
import { workflowFacts, type Workflow } from '../workflow/schema';

import { iterationStartState, machineStates, workflowExitStates, type ExitStart, type PhaseExitState } from './workflow-exit-state';

/** What the core checks read besides the workflow files: the other pillars, from one baseline. */
export interface WorkflowCoreInputs {
  /** `memory.yaml`, or `null` when the project has none. */
  readonly memoryYaml: MemoryYaml | null;
  /** `dna.yaml`, or `null` when the project has none. */
  readonly dnaYaml: DnaYaml | null;
  /**
   * The frontmatter fields the template of `type` declares, or `null` when the type has no template or
   * it cannot be read (the field half of `W_PHASE_TOKEN_OUT_OF_SCOPE` is then not decided).
   */
  readonly templateFields: (type: string) => ReadonlySet<string> | null;
}

/** The registry the checks run on: the loader's accepted result. */
export interface CheckedRegistry {
  /** The manifest's `include` list — the diagnostics' `file`, one per workflow. */
  readonly include: readonly string[];
  /** The workflows, in `include` order. */
  readonly workflows: readonly Workflow[];
  /** `workflows/bindings.yaml`, or `null` when the project has none. */
  readonly bindings: BindingsYaml | null;
}

/** The core rows, in spec-003's table order — the order the diagnostics of one phase come out in. */
const ROWS = [
  'E_PHASE_ROLE_UNKNOWN',
  'E_PHASE_APPROVER_UNKNOWN',
  'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN',
  'E_WORKFLOW_COLLECTION_UNRESOLVED',
  'E_PHASE_CADENCE_EVENT_UNKNOWN',
  'W_PHASE_TOKEN_OUT_OF_SCOPE',
  'W_PHASE_EXIT_STATE_UNDETERMINED',
  'W_PHASE_FALLBACK_STATE_MISMATCH',
  'W_PHASE_FALLBACK_NOT_REENTRANT',
] as const;
type Row = (typeof ROWS)[number];

/** A `{<type>.<field>}` token. `{item…}` (a collection entry) is not a Memory element and is skipped. */
const TYPED_TOKEN_RE = /\{([a-z][a-z0-9-]*)\.([A-Za-z0-9_-]+)\}/g;

const DNA_COLLECTION = 'dna:';
const BINDINGS_COLLECTION = 'bindings:';

/** Collects diagnostics by position, dedupes them by `(file, path, code)`, and emits them in order. */
class Collector {
  private readonly entries: { file: number; phase: number; row: number; seq: number; diagnostic: Diagnostic }[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly include: readonly string[]) {}

  /**
   * @param problem - What tells two problems of one row at one path apart (review F1): the token for
   *   `W_PHASE_TOKEN_OUT_OF_SCOPE`, the message for `E_WORKFLOW_COLLECTION_UNRESOLVED`; empty for the
   *   rows that report at most one problem per path. The same problem raised again on another include
   *   path is reported once, with the first path's message (deterministic traversal).
   */
  add(file: number, phase: number, row: Row, path: string, message: string, problem = ''): void {
    const code = row;
    const key = `${file}\u0000${path}\u0000${code}\u0000${problem}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const severity = code.startsWith('E_') ? 'error' : 'warning';
    this.entries.push({
      file,
      phase,
      row: ROWS.indexOf(row),
      seq: this.entries.length,
      diagnostic: { code, severity, file: this.include[file]!, path, message },
    });
  }

  ordered(): Diagnostic[] {
    return [...this.entries]
      .sort((a, b) => a.file - b.file || a.phase - b.phase || a.row - b.row || a.seq - b.seq)
      .map((entry) => entry.diagnostic);
  }
}

/** `W_WORKFLOW_CHECKS_NOT_RUN` (`bug-281`, spec-003 "Where each check runs"): a core check skipped for want of its input. */
export const W_WORKFLOW_CHECKS_NOT_RUN = 'W_WORKFLOW_CHECKS_NOT_RUN';

/**
 * Every core diagnostic of `registry` (spec-003 § "Diagnostics", `core` rows), in spec-003's order.
 * Pure: it reads only its arguments.
 */
export function workflowCoreDiagnostics(registry: CheckedRegistry, inputs: WorkflowCoreInputs): Diagnostic[] {
  const out = new Collector(registry.include);
  registry.workflows.forEach((workflow, i) => staticChecks(out, i, workflow, registry.bindings, inputs));
  if (inputs.memoryYaml) contextChecks(out, registry, inputs.memoryYaml, inputs);
  return [...notRunDiagnostics(registry, inputs), ...out.ordered()];
}

/**
 * One `W_WORKFLOW_CHECKS_NOT_RUN` warning per missing input of the core checks, `dna.yaml` first, naming the
 * checks that did not run (`bug-281`): the skip itself is spec-003's rule, but without a trace an empty
 * `diagnostics` could not tell "checked and clean" from "not checked". `file` is the missing file relative to
 * `.wingfoil/`, as the other diagnostics' `file`; `path` is empty. None for a registry with no workflow, which
 * no check would have read.
 */
function notRunDiagnostics(registry: CheckedRegistry, inputs: WorkflowCoreInputs): Diagnostic[] {
  if (registry.workflows.length === 0) return [];
  const missing: Diagnostic[] = [];
  const notRun = (file: string, checks: string): void => {
    missing.push({ code: W_WORKFLOW_CHECKS_NOT_RUN, severity: 'warning', file, path: '', message: `${file} is absent: the ${checks} checks were not run` });
  };
  if (inputs.dnaYaml === null) notRun('dna.yaml', 'role, approver and dna: collection');
  if (inputs.memoryYaml === null) notRun('memory.yaml', 'type, cadence event, token, exit state and fallback');
  return missing;
}

// ---- the rows that read one workflow and the other pillars, with no include context ---------------

function staticChecks(out: Collector, i: number, workflow: Workflow, bindings: BindingsYaml | null, inputs: WorkflowCoreInputs): void {
  const { memoryYaml, dnaYaml } = inputs;
  const knownType = (type: string): boolean => memoryYaml !== null && Object.prototype.hasOwnProperty.call(memoryYaml.types, type);
  const unknownType = (type: string): string => `unknown memory type '${type}' (not defined in memory.yaml)`;

  if (memoryYaml && workflow.element !== undefined && !knownType(workflow.element)) {
    out.add(i, -1, 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', 'element', unknownType(workflow.element));
  }

  const roles = new Set((dnaYaml?.team.roles ?? []).map((role) => role.name));
  workflow.phases.forEach((phase, p) => {
    const at = (field: string): string => `phases[${p}].${field}`;

    if (dnaYaml) {
      const unknownRole = (role: string): string => `unknown role '${role}' (not defined in dna.yaml)`;
      if (phase.role !== undefined && !roles.has(phase.role)) out.add(i, p, 'E_PHASE_ROLE_UNKNOWN', at('role'), unknownRole(phase.role));
      const approval = phase.approval as { by_role?: string; by_person?: string } | undefined; // one of the two (schema union)
      if (approval?.by_role !== undefined && !roles.has(approval.by_role)) {
        out.add(i, p, 'E_PHASE_ROLE_UNKNOWN', at('approval.by_role'), unknownRole(approval.by_role));
      }
      const person = approval?.by_person;
      if (person !== undefined && !dnaYaml.team.members.some((member) => member.name === person || member.email === person)) {
        out.add(i, p, 'E_PHASE_APPROVER_UNKNOWN', at('approval.by_person'), `unknown approver '${person}' (no team.members[] name or email in dna.yaml)`);
      }
    }

    const over = phase.iterate_over;
    const isCollection = over !== undefined && (over.startsWith(DNA_COLLECTION) || over.startsWith(BINDINGS_COLLECTION));
    if (memoryYaml) {
      if (over !== undefined && !isCollection && !knownType(over)) out.add(i, p, 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', at('iterate_over'), unknownType(over));
      // A selection's `where.type` (`bug-282`): only without `iterate_over` (with it, `where` filters the
      // iteration and `type` may be a collection entry's field); a value with a `{…}` token is not decided.
      const selected = over === undefined ? phase.where?.['type'] : undefined;
      if (selected !== undefined) {
        const values = Array.isArray(selected)
          ? selected.map((value, k) => [String(value), at(`where.type[${k}]`)] as const)
          : [[String(selected), at('where.type')] as const];
        for (const [type, path] of values) {
          if (!type.includes('{') && !knownType(type)) out.add(i, p, 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', path, unknownType(type));
        }
      }
      (phase.actions ?? []).forEach((action, a) => {
        // `memory.add(type: T)`, and the `T` of a typed `<T>.set_state` / `<T>.sync_state` (`bug-282`).
        const type = memoryAddType(action) ?? typedStateType(action);
        if (type !== null && !knownType(type)) out.add(i, p, 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', at(`actions[${a}]`), unknownType(type));
      });
      (phase.produces ?? []).forEach((entry, k) => {
        if (typeof entry !== 'string' && !knownType(entry.type)) out.add(i, p, 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', at(`produces[${k}].type`), unknownType(entry.type));
      });
    }

    if (over !== undefined && isCollection) {
      for (const message of collectionProblems(over, dnaYaml, bindings)) out.add(i, p, 'E_WORKFLOW_COLLECTION_UNRESOLVED', at('iterate_over'), message, message);
    }

    const cadence = phase.cadence as unknown;
    const event = typeof cadence === 'object' && cadence !== null ? (cadence as { recurring?: { on?: string } }).recurring?.on : undefined;
    if (memoryYaml && event !== undefined && !eventFires(memoryYaml, event)) {
      out.add(
        i,
        p,
        'E_PHASE_CADENCE_EVENT_UNKNOWN',
        at('cadence.recurring.on'),
        `cadence event '${event}' names no memory.yaml type and state (<memory-type>-<state>)`,
      );
    }
  });
}

/**
 * `E_WORKFLOW_COLLECTION_UNRESOLVED`'s messages for a collection reference (`spec-003` § "Collections"):
 * a `dna:` path that names no list, a `bindings:` name that names no collection, and the key problems
 * of a `dna.yaml` list's entries (a `bindings.yaml` collection's keys are the loader's
 * `E_BINDING_COLLECTION_KEY`). A `dna:` reference without `dna.yaml` is not decided.
 */
function collectionProblems(reference: string, dnaYaml: DnaYaml | null, bindings: BindingsYaml | null): string[] {
  if (reference.startsWith(BINDINGS_COLLECTION)) {
    const name = reference.slice(BINDINGS_COLLECTION.length);
    const collections = bindings?.collections ?? {};
    return Object.prototype.hasOwnProperty.call(collections, name) ? [] : [`collection '${reference}' names no collection in bindings.yaml`];
  }
  if (!dnaYaml) return [];
  const resolved = resolveDnaPath(dnaYaml, reference.slice(DNA_COLLECTION.length));
  const listed = resolved.ok && (resolved.target.kind === 'collection' || resolved.target.kind === 'string-list') && Array.isArray(resolved.target.value);
  if (!listed) return [`collection '${reference}' names no list in dna.yaml`];
  const entries = (resolved as { target: { value: unknown[] } }).target.value as Parameters<typeof collectionKeyIssues>[0];
  return collectionKeyIssues(entries).map((issue) => `collection '${reference}' entry ${issue.index}: ${issue.message}`);
}

/**
 * Whether a cadence event `<memory-type>-<state>` can fire (`spec-003` § "Recurring phases", open
 * question 3): some split at a `-` gives a type `memory.yaml` registers and a state an element of that
 * type can enter — a `sequence` state, a reject or return target, or `deprecated`.
 */
function eventFires(memoryYaml: MemoryYaml, event: string): boolean {
  for (let cut = event.indexOf('-'); cut !== -1; cut = event.indexOf('-', cut + 1)) {
    const type = event.slice(0, cut);
    if (!Object.prototype.hasOwnProperty.call(memoryYaml.types, type)) continue;
    if (machineStates(resolveStateMachine(memoryYaml, type)).has(event.slice(cut + 1))) return true;
  }
  return false;
}

// ---- the rows that need the include context: tokens, exit states, fallbacks -----------------------

/** One walk position: a workflow reached on some include path, with what encloses it there. */
interface Context {
  /** The Memory types of the enclosing scopes, outermost first, each once (`spec-017` §4.1). */
  readonly scope: readonly string[];
  readonly start: ExitStart;
}

function contextChecks(out: Collector, registry: CheckedRegistry, memoryYaml: MemoryYaml, inputs: WorkflowCoreInputs): void {
  const byName = new Map<string, number>();
  // Names are unique and every phase include resolves: the loader refuses a registry where either
  // fails (E_WORKFLOW_DUPLICATE_NAME, E_WORKFLOW_INCLUDE_UNRESOLVED), and the core checks run only on
  // an accepted one.
  registry.workflows.forEach((workflow, i) => byName.set(workflow.name, i));
  const workflowsByName = new Map(registry.workflows.map((workflow) => [workflow.name, workflow] as const));
  const done = new Set<string>();
  const reached = new Set<number>();

  // Termination: a position is visited once (`done`), and a position is a finite combination (scope
  // types are deduplicated, states are a machine's), so even an include cycle — which the loader
  // refuses anyway (E_WORKFLOW_INCLUDE_CYCLE) — could not loop.
  const visit = (i: number, context: Context, tokens: boolean): void => {
    const key = `${i}|${context.scope.join(',')}|${context.start.boundType}|${context.start.state}|${context.start.instance}|${tokens}`;
    if (done.has(key)) return;
    done.add(key);
    reached.add(i);
    const workflow = registry.workflows[i]!;
    const states = workflowExitStates(workflow, memoryYaml, context.start, workflowsByName);
    stateDiagnostics(out, i, workflow, states, memoryYaml);

    // A self-creating instance's element is in scope for all of its phases (its `{id}` before the
    // element exists is not reported, spec-003).
    const selfType = states.find((state) => state.boundType !== null)?.boundType ?? null;
    const own = workflow.element ?? (context.start.instance ? selfType : null);
    const scope = own === null || context.scope.includes(own) ? context.scope : [...context.scope, own];
    if (tokens) tokenDiagnostics(out, i, workflow, scope, inputs);

    workflow.phases.forEach((phase, p) => {
      if (phase.include === undefined) return;
      const target = byName.get(phase.include)!;
      const sub = registry.workflows[target]!;
      const over = phase.iterate_over;
      let start: ExitStart;
      let subScope = scope;
      if (over !== undefined && over.includes(':')) {
        start = { boundType: null, state: null, instance: false };
      } else if (over !== undefined) {
        start = { boundType: over, state: iterationStartState(memoryYaml, over, phase.where), instance: false };
        if (!subScope.includes(over)) subScope = [...subScope, over];
      } else {
        const type = sub.element ?? states[p]!.boundType;
        const same = type !== null && type === states[p]!.boundType;
        start = { boundType: type, state: same ? states[p]!.entry : null, instance: false };
      }
      visit(target, { scope: subScope, start }, tokens);
    });
  };

  registry.workflows.forEach((workflow, i) => {
    if (workflowFacts(workflow).startable) {
      const element = workflow.element ?? null;
      const start: ExitStart = {
        boundType: element,
        state: element === null ? null : iterationStartState(memoryYaml, element, undefined),
        instance: true,
      };
      visit(i, { scope: [], start }, true);
    }
  });
  // A workflow no startable one reaches still gets its exit states checked, from its type's first
  // state (`spec-017` §4.4 "otherwise"); its tokens have no include path to be out of scope on.
  registry.workflows.forEach((workflow, i) => {
    if (reached.has(i)) return;
    const element = workflow.element ?? null;
    visit(i, { scope: [], start: { boundType: element, state: element === null ? null : iterationStartState(memoryYaml, element, undefined), instance: false } }, false);
  });
}

/** `W_PHASE_EXIT_STATE_UNDETERMINED`, `W_PHASE_FALLBACK_STATE_MISMATCH`, `W_PHASE_FALLBACK_NOT_REENTRANT`. */
function stateDiagnostics(out: Collector, i: number, workflow: Workflow, states: readonly PhaseExitState[], memoryYaml: MemoryYaml): void {
  workflow.phases.forEach((phase, p) => {
    const state = states[p]!;
    const at = (field: string): string => `phases[${p}].${field}`;
    const undetermined = state.undetermined;
    if (undetermined) {
      const action = phase.actions![undetermined.action]!; // an undetermined action is one of them
      const message =
        undetermined.from === null
          ? `cannot apply '${action}' to ${undetermined.type}: ${undetermined.reason}`
          : `cannot apply '${action}' to ${undetermined.type} from state '${undetermined.from}': ${undetermined.reason}`;
      out.add(i, p, 'W_PHASE_EXIT_STATE_UNDETERMINED', at(`actions[${undetermined.action}]`), message);
    }
    const fallback = phase.fallback;
    if (!fallback) return;
    const setState = fallback.set_state;
    if (setState !== undefined) {
      const differing = state.held.find((held) => held.reject !== setState);
      if (differing) {
        out.add(
          i,
          p,
          'W_PHASE_FALLBACK_STATE_MISMATCH',
          at('fallback.set_state'),
          `fallback set_state '${setState}' differs from the reject target '${differing.reject}' of ${differing.type} gate '${differing.gate}'`,
        );
      }
    }
    const stepIndex = workflow.phases.findIndex((candidate) => candidate.name === fallback.step);
    if (stepIndex !== -1 && stepIndex < p) {
      const forward = state.held.find((held) => {
        const sequence = resolveStateMachine(memoryYaml, held.type).sequence;
        const gate = sequence.indexOf(held.gate);
        const reject = sequence.indexOf(held.reject);
        return gate !== -1 && reject !== -1 && reject > gate;
      });
      if (forward) {
        out.add(
          i,
          p,
          'W_PHASE_FALLBACK_NOT_REENTRANT',
          at('fallback.step'),
          `fallback step '${fallback.step}' is an earlier phase, but a reject from ${forward.type} gate '${forward.gate}' goes forward to '${forward.reject}': the reject completes this phase`,
        );
      }
    }
  });
}

/**
 * The types a phase's **selection** names (`spec-003` § "Selections": `where` without `iterate_over`; its
 * `type` key, a scalar or a list), in declared order, minus those already in `scope`. Empty for any other
 * phase: an iterating phase's `where` filters candidates and binds the iterated type in the sub instead.
 */
function selectedTypes(phase: Workflow['phases'][number], scope: readonly string[]): string[] {
  if (phase.where === undefined || phase.iterate_over !== undefined) return [];
  const declared = phase.where['type'];
  const types = (Array.isArray(declared) ? declared : declared === undefined ? [] : [declared]).map(String);
  return types.filter((type, k) => !scope.includes(type) && types.indexOf(type) === k);
}

/**
 * `W_PHASE_TOKEN_OUT_OF_SCOPE` for one workflow on one include path: every `{<type>.<field>}` token in
 * a `where` value, a `produces` pattern or an action argument, visited in that order. `{element.<f>}`
 * names the innermost scope; inside a `{ type: T, path }` entry, `T` is in scope (`dl-104` D3); in an
 * action argument of a phase that declares a selection, each type it selects is in scope too — the
 * token names each selected element of that type (`spec-017` §4.1, task-199) — while `{element.<f>}`
 * still names the innermost bound element.
 */
function tokenDiagnostics(out: Collector, i: number, workflow: Workflow, scope: readonly string[], inputs: WorkflowCoreInputs): void {
  workflow.phases.forEach((phase, p) => {
    const at = (field: string): string => `phases[${p}].${field}`;
    const check = (text: string, path: string, extra: string | null, selected: readonly string[] = []): void => {
      const local = extra === null || scope.includes(extra) ? scope : [...scope, extra];
      for (const match of text.matchAll(TYPED_TOKEN_RE)) {
        const [token, named, field] = match as unknown as [string, string, string];
        if (named === 'item') continue;
        const type =
          named === 'element' ? (local[local.length - 1] ?? null) : local.includes(named) || selected.includes(named) ? named : null;
        if (type === null) {
          const inScope = local.length > 0 ? local.join(', ') : 'none';
          const where = selected.length > 0 ? `${inScope}; selected: ${selected.join(', ')}` : inScope;
          out.add(i, p, 'W_PHASE_TOKEN_OUT_OF_SCOPE', path, `token '${token}' names no enclosing element (in scope: ${where})`, token);
          continue;
        }
        const fields = inputs.templateFields(type);
        if (fields !== null && !fields.has(field)) {
          out.add(i, p, 'W_PHASE_TOKEN_OUT_OF_SCOPE', path, `token '${token}': the ${type} template declares no field '${field}'`, token);
        }
      }
    };
    for (const [key, value] of Object.entries(phase.where ?? {})) {
      if (Array.isArray(value)) value.forEach((item, k) => check(String(item), at(`where.${key}[${k}]`), null));
      else check(String(value), at(`where.${key}`), null);
    }
    (phase.produces ?? []).forEach((entry, k) => {
      if (typeof entry === 'string') check(entry, at(`produces[${k}]`), null);
      else check(entry.path, at(`produces[${k}].path`), entry.type);
    });
    const selected = selectedTypes(phase, scope);
    (phase.actions ?? []).forEach((action, a) => {
      if (tokenName(action) !== action) check(action, at(`actions[${a}]`), null, selected);
    });
  });
}
