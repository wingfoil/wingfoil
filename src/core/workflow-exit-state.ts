/**
 * The exit-state computation of `spec-017` §4.4 (task-194): a phase's exit state for the element a
 * workflow is bound to, computed **statically** by applying the phase's state-changing actions, in
 * order, along the element's machine (`spec-001`), from the state the previous phase leaves it in.
 * The same computation, applied from a type's first state at a `memory.add`, gives the state the
 * elements a phase **creates** are left in (§4.3 `created`).
 *
 * Pure: it reads the workflow and `memory.yaml` it is handed and nothing else — no filesystem, no git,
 * no clock (REQ-SYS-07). The core checks (`./workflow-core-checks.ts`) run it at load time for
 * `W_PHASE_EXIT_STATE_UNDETERMINED`, `W_PHASE_FALLBACK_STATE_MISMATCH` and
 * `W_PHASE_FALLBACK_NOT_REENTRANT`; state deduction (task-198) reuses it for `state` and `created`
 * evidence.
 *
 * What an action targets is `spec-017` §4.2's table:
 * - `memory.add(type: T)` creates an element of `T` in `T`'s first state; in a self-creating
 *   workflow's creating phase the first one created **is** the bound element (§3.4);
 * - the untyped `memory.submit|approve|reject|deprecate` and `element.set_state(s)` act on the element
 *   the latest `memory.add` of the phase created; before any `memory.add`, on the phase's selection
 *   (which this function does not move: a selection's elements have no single state) or else on the
 *   bound element;
 * - `<T>.set_state(s)` acts on the bound element when `T` is its type, otherwise on the elements of
 *   `T` an earlier phase of the same workflow pass created (its **run** elements), otherwise on the
 *   phase's selection when it selects `T` (not moved either; it holds each selected gate state whose
 *   approve target is `s`, §5.1), otherwise on nothing;
 * - every other token (`<T>.sync_state`, `element.set_release`, `agent.*`, `git.*`, …) changes no
 *   state.
 *
 * The verbs: `memory.submit|approve|reject|deprecate` take the edge `resolveTransitionTarget`
 * (`src/memory/state-machine.ts`) gives — the one engine every Memory verb uses, so a phase is never
 * judged by a rule the CLI does not apply. `set_state(s)` yields `s` (`spec-003`'s verb rule), when `s`
 * is a state of the type and lies **after** the current state in its `sequence`: a workflow action
 * moves an element forward along its machine, and only a reject (or `memory park`) moves it back.
 */
import type { MemoryYaml } from '../memory/schema';
import { DEPRECATED_STATE, resolveStateMachine, resolveTransitionTarget, type TransitionOp } from '../memory/state-machine';
import type { StateMachine } from '../memory/schema';
import type { ValidationError } from '../validation';
import { memoryAddType, tokenName } from '../workflow/bindings';
import { workflowFacts, type Workflow } from '../workflow/schema';

/** Where the computation starts: the bound element's type and state when the first phase begins. */
export interface ExitStart {
  /** The Memory type the workflow is bound to, or `null` when it is bound to none (yet). */
  readonly boundType: string | null;
  /** The bound element's state at the first phase, or `null` when it is not known. */
  readonly state: string | null;
  /**
   * `true` when the workflow runs as an **instance** (started on its own): a startable workflow that
   * declares no `element` then binds the first element its creating phase adds (`spec-017` §3.4). An
   * included workflow never self-binds.
   */
  readonly instance: boolean;
}

/** One element a phase created, or moved as a run element: its type, the creating action, its state. */
export interface InstanceState {
  /** The element's Memory type. */
  readonly type: string;
  /** The index, in the **creating** phase's `actions`, of the `memory.add` that created it. */
  readonly action: number;
  /** The state the phase leaves it in, or `null` when it cannot be computed. */
  readonly state: string | null;
}

/** A gate state a phase holds an element in (`spec-017` §5.1): approving or rejecting it is the phase's decision. */
export interface HeldGate {
  /** The element's Memory type. */
  readonly type: string;
  /** The `gates` state the element sits in while the phase awaits its decision. */
  readonly gate: string;
  /** The state `memory.yaml` sends the element to on a reject from that gate. */
  readonly reject: string;
}

/** The first state-changing action of a phase that its machine cannot apply (`W_PHASE_EXIT_STATE_UNDETERMINED`). */
export interface UndeterminedAction {
  /** The action's index in the phase's `actions`. */
  readonly action: number;
  /** The type of the element it acts on. */
  readonly type: string;
  /** The state the action starts from, or `null` when that state is itself unknown. */
  readonly from: string | null;
  /** Why it cannot be applied: the state engine's refusal, or the `set_state` rule's. */
  readonly reason: string;
}

/** The exit-state computation's result for one phase. */
export interface PhaseExitState {
  /** The phase's name. */
  readonly phase: string;
  /** The type the workflow is bound to while the phase runs (`null`: none yet). */
  readonly boundType: string | null;
  /** The bound element's state when the phase starts, or `null` (unknown, or no bound element). */
  readonly entry: string | null;
  /** The bound element's state when the phase ends — its **exit state** — or `null` (unknown, or none). */
  readonly exit: string | null;
  /** The first action the machine cannot apply, or `null`. */
  readonly undetermined: UndeterminedAction | null;
  /** The elements the phase creates, in action order, with the state the phase leaves each in. */
  readonly created: readonly InstanceState[];
  /** The elements an earlier phase of this pass created that a `<T>.set_state` here moves, after the move. */
  readonly run: readonly InstanceState[];
  /** The gate states the phase holds an element in, in action order, each listed once. */
  readonly held: readonly HeldGate[];
}

/** An element whose state the computation tracks. */
interface Tracked {
  type: string;
  action: number;
  state: string | null;
}

/** The machine of `type`, or `null` when `memory.yaml` does not register it (that is a separate diagnostic). */
function machineOf(memoryYaml: MemoryYaml, type: string): StateMachine | null {
  return Object.prototype.hasOwnProperty.call(memoryYaml.types, type) ? resolveStateMachine(memoryYaml, type) : null;
}

/** Every state an element of a type can be in: its `sequence`, its reject and return targets, and `deprecated`. */
export function machineStates(machine: StateMachine): ReadonlySet<string> {
  const states = new Set<string>(machine.sequence);
  for (const gate of Object.values(machine.gates ?? {})) states.add(gate.reject);
  for (const target of Object.values(machine.returns ?? {})) states.add(target);
  states.add(DEPRECATED_STATE);
  return states;
}

/**
 * The state an element enters a workflow run under `iterate_over` in (`spec-017` §4.4): the
 * lowest-`sequence` value of the governing `where.status`, otherwise the type's first state. `null`
 * when `memory.yaml` does not register `type`.
 */
export function iterationStartState(memoryYaml: MemoryYaml, type: string, where: Readonly<Record<string, unknown>> | undefined): string | null {
  const machine = machineOf(memoryYaml, type);
  if (!machine) return null;
  const raw = where?.['status'];
  const statuses = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map(String);
  const positions = statuses.map((status) => machine.sequence.indexOf(status)).filter((index) => index !== -1);
  return machine.sequence[positions.length > 0 ? Math.min(...positions) : 0]!; // a sequence is never empty (spec-001)
}

/** The first state of `type`, or `null` for an unregistered type. */
function firstState(memoryYaml: MemoryYaml, type: string): string | null {
  return machineOf(memoryYaml, type)?.sequence[0] ?? null;
}

/** An untyped Memory verb token's transition, or `null` for any other token. */
const UNTYPED_VERBS: Readonly<Record<string, TransitionOp>> = {
  'memory.submit': 'submit',
  'memory.approve': 'approve',
  'memory.reject': 'reject',
  'memory.deprecate': 'deprecate',
};

/** The `s` of `….set_state(s)`, unquoted, or `null`. */
function setStateArgument(token: string): string | null {
  const match = /\(\s*["']?([^"'()\s]+)["']?\s*\)/.exec(token);
  return match ? match[1]! : null;
}

/** A selection's types and statuses, each a list (`spec-003` § "Selections"). */
function asList(value: unknown): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

/**
 * The exit states of every phase of `workflow` (`spec-017` §4.4), in declared order.
 *
 * A plain `include:` phase runs the included workflow on the same element (§4.5) — found by name in
 * `workflows` — and leaves the element in the state the included workflow's last phase leaves it in.
 * An `iterate_over` phase runs its sub on other elements: the bound element's state is unchanged.
 *
 * @param workflow - The workflow whose phases are computed.
 * @param memoryYaml - The `memory.yaml` the machines come from.
 * @param start - The bound element's type and state at the first phase.
 * @param workflows - The registry, by name, a plain `include:` is resolved in (default: none).
 */
export function workflowExitStates(
  workflow: Workflow,
  memoryYaml: MemoryYaml,
  start: ExitStart,
  workflows: ReadonlyMap<string, Workflow> = new Map(),
): PhaseExitState[] {
  return compute(workflow, memoryYaml, start, workflows, new Set([workflow.name]));
}

function compute(
  workflow: Workflow,
  memoryYaml: MemoryYaml,
  start: ExitStart,
  workflows: ReadonlyMap<string, Workflow>,
  visiting: ReadonlySet<string>,
): PhaseExitState[] {
  const creating =
    start.instance && start.boundType === null && workflow.element === undefined && workflowFacts(workflow).startable
      ? workflow.phases.findIndex((phase) => (phase.actions ?? []).some((action) => tokenName(action) === 'memory.add'))
      : -1;
  let bound: Tracked | null = start.boundType === null ? null : { type: start.boundType, action: -1, state: start.state };
  // The elements created by earlier phases of this pass, the targets of a typed `<T>.set_state`.
  const earlier: Tracked[] = [];
  const out: PhaseExitState[] = [];

  workflow.phases.forEach((phase, p) => {
    const entry = bound?.state ?? null;
    const held: HeldGate[] = [];
    const created: Tracked[] = [];
    const run = new Set<Tracked>();
    let undetermined: UndeterminedAction | null = null;

    const hold = (type: string, gate: string, reject: string): void => {
      if (!held.some((h) => h.type === type && h.gate === gate)) held.push({ type, gate, reject });
    };

    /** Apply one transition to `target`, recording the first refusal and the gates it holds. */
    const apply = (target: Tracked, action: number, op: TransitionOp | { setState: string }): void => {
      const machine = machineOf(memoryYaml, target.type);
      if (!machine) return; // an unregistered type is E_WORKFLOW_ELEMENT_TYPE_UNKNOWN's, not this
      const from = target.state;
      const refuse = (reason: string): void => {
        undetermined ??= { action, type: target.type, from, reason };
        target.state = null;
      };
      if (typeof op === 'object') {
        const to = op.setState;
        if (!machineStates(machine).has(to)) return refuse(`'${to}' is not a state of ${target.type}`);
        if (from !== null) {
          const fromIndex = machine.sequence.indexOf(from);
          const toIndex = machine.sequence.indexOf(to);
          if (fromIndex !== -1 && toIndex !== -1 && toIndex <= fromIndex) {
            return refuse(`'${to}' does not lie after '${from}' in ${target.type}'s sequence`);
          }
          const gate = machine.gates?.[from];
          if (gate && fromIndex !== -1 && machine.sequence[fromIndex + 1] === to) hold(target.type, from, gate.reject);
        }
        target.state = to;
        return;
      }
      if (from === null) {
        if (op === 'deprecate') target.state = DEPRECATED_STATE;
        else refuse('the state it starts from is undetermined');
        return;
      }
      let to: string;
      try {
        to = resolveTransitionTarget(machine, from, op);
      } catch (error) {
        // `resolveTransitionTarget` refuses only with an `E_INVALID_TRANSITION` ValidationError.
        return refuse((error as ValidationError).issues[0]!.message);
      }
      const leftGate = machine.gates?.[from];
      if ((op === 'approve' || op === 'reject') && leftGate) hold(target.type, from, leftGate.reject);
      const enteredGate = machine.gates?.[to];
      if (op === 'submit' && enteredGate) hold(target.type, to, enteredGate.reject);
      target.state = to;
    };

    if (phase.include !== undefined) {
      const sub = workflows.get(phase.include);
      if (phase.iterate_over === undefined && sub && !visiting.has(sub.name)) {
        const subType = sub.element ?? bound?.type ?? null;
        const sameElement = bound !== null && subType === bound.type;
        const subStates = compute(
          sub,
          memoryYaml,
          { boundType: subType, state: sameElement ? bound!.state : subType === null ? null : firstState(memoryYaml, subType), instance: false },
          workflows,
          new Set([...visiting, sub.name]),
        );
        const last = subStates[subStates.length - 1];
        if (sameElement && last) bound!.state = last.exit;
      }
      out.push({ phase: phase.name, boundType: bound?.type ?? null, entry, exit: bound?.state ?? null, undetermined: null, created: [], run: [], held: [] });
      return;
    }

    const selection = phase.where !== undefined && phase.iterate_over === undefined;
    let latest: Tracked | null = null;
    let actsOnSelection = false;
    // `<T>.set_state(s)` on the selection (§4.2 last fallback): the `(T, s)` pairs, in action order.
    const selectionSets: { type: string; to: string }[] = [];
    (phase.actions ?? []).forEach((action, a) => {
      const name = tokenName(action);
      if (name === 'memory.add') {
        const type = memoryAddType(action);
        if (type === null) return;
        const element: Tracked = { type, action: a, state: firstState(memoryYaml, type) };
        created.push(element);
        latest = element;
        if (p === creating && bound === null) bound = element;
        return;
      }
      const verb = UNTYPED_VERBS[name];
      const untypedSet = name === 'element.set_state';
      if (verb !== undefined || untypedSet) {
        const op = untypedSet ? { setState: setStateArgument(action) ?? '' } : verb!;
        if (latest) apply(latest, a, op);
        else if (selection) actsOnSelection = true;
        else if (bound) apply(bound, a, op);
        return;
      }
      const typed = /^([a-z][a-z0-9-]*)\.set_state$/.exec(name);
      if (typed) {
        const type = typed[1]!;
        const op = { setState: setStateArgument(action) ?? '' };
        if (bound && bound.type === type) {
          apply(bound, a, op);
          return;
        }
        const earlierOfType = earlier.filter((candidate) => candidate.type === type);
        for (const element of earlierOfType) {
          apply(element, a, op);
          run.add(element);
        }
        if (earlierOfType.length === 0 && selection && asList(phase.where!['type']).includes(type)) {
          selectionSets.push({ type, to: op.setState });
        }
      }
    });

    if (selection && actsOnSelection) {
      const statuses = asList(phase.where!['status']);
      for (const type of asList(phase.where!['type'])) {
        const machine = machineOf(memoryYaml, type);
        if (!machine) continue;
        for (const status of statuses) {
          const gate = machine.gates?.[status];
          if (gate) hold(type, status, gate.reject);
        }
      }
    }
    for (const { type, to } of selectionSets) {
      const machine = machineOf(memoryYaml, type);
      if (!machine) continue;
      for (const status of asList(phase.where!['status'])) {
        const gate = machine.gates?.[status];
        if (gate && machine.sequence[machine.sequence.indexOf(status) + 1] === to) hold(type, status, gate.reject);
      }
    }

    earlier.push(...created.filter((element) => element !== bound));
    out.push({
      phase: phase.name,
      boundType: bound?.type ?? null,
      entry,
      exit: bound?.state ?? null,
      undetermined,
      created: created.map((element) => ({ type: element.type, action: element.action, state: element.state })),
      run: [...run].map((element) => ({ type: element.type, action: element.action, state: element.state })),
      held,
    });
  });
  return out;
}
