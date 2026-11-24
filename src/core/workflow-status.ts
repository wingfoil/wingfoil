/**
 * `wingfoil workflow status [<ref>]` (task-225; `spec-017` §5.1–§5.4, §7.4, §8 `StatusResult` /
 * `PendingApproval`, §10, §11; BDD P4.5, P4.14, P4.15, X1.1, X1.2).
 *
 * **Baseline: `HEAD`, declared** (`spec-017` §1.1, approver ruling R15): the same snapshot and deduction
 * `workflow next` answers from (`readDeductionSnapshotAtHead`, `deduceWorkflowState`), so the two never disagree;
 * the working tree only explains (`W_UNCOMMITTED_INPUTS`, §1.2).
 *
 * **What it reports** (§7.4): every open instance, or the one `<ref>` selects — active first and marked — with its
 * top-level phase progress, its frontier (each step built by `workflow next`'s `buildStep`), and its `late`
 * candidates (§4.7); the **pending approvals** of those steps (§5.1), each routed to `dna.yaml` members; then the
 * **ungated elements**: Memory elements sitting in a `gates` state of their type that no pending approval of **any**
 * open instance carries, each with the open instance that **holds** it, if one does (`heldBy`, `bug-487`), counted per
 * type in `ungatedByType` (`bug-341`). Nothing is recorded: a pending approval changes nothing in Memory (§5.1).
 *
 * **The v0.3 notification channel** (§5.3, ruling R13): the console view prints one "human needed" line per pending
 * approval, naming the action (`approve or reject`, or `finalize` for an approval record), the step key, and the
 * routed members; the ungated elements are one summary line by default and one line each under the console flag
 * `--full` (`bug-341`, §7.4), the only flag the renderer reads. An ungated element has no workflow to route it, so its
 * line names the holders of the `approver` role, the one role that may decide it (REQ-SEC-03).
 *
 * **The transitory pre-marker rule made visible** (§2, §3.2, task-345): each reported instance whose start commit
 * carries no start marker gets `W_INSTANCE_PRE_MARKER`, last among the payload's diagnostics. No other command raises
 * it.
 *
 * **Stdout carries only the answer** (`dl-176` (a), `spec-017` §7.4; task-373): the console rendering prints no
 * diagnostic, no count line and no pre-marker line; the operation hands each entry of `diagnostics` to the CLI as a
 * success warning, one stderr `warning:` line each, in every format.
 */
import type { Diagnostic } from '../validation';
import {
  deduceWorkflowState,
  resolveInstanceRef,
  type Baseline,
  type Deduction,
  type ElementRef,
  type GatedElement,
  type Instance,
  type PhaseProgress,
  type TrailEntry,
} from '../workflow/deduce';

import { APPROVER_ROLE } from './approval-authority';
import { coreOk, type CoreResult } from './types';
import {
  approvalDiagnostics,
  approvalLine,
  buildStep,
  describeMembers,
  humanNeededLine,
  membersHoldingRole,
  NO_OPEN_WORKFLOWS,
  noApproverMessage,
  readNextInputs,
  unresolvedRef,
  type Awaiting,
  type Member,
  type NextInputs,
  type Step,
} from './workflow-next';
import { readDeductionSnapshotAtHead } from './workflow-deduction';

/** One pending approval (`spec-017` §5.1, §8 `PendingApproval`): a frontier step whose approval awaits. */
export interface PendingApproval {
  /** The step's key (§4.9). */
  readonly step: string | null;
  /** The instance the step belongs to. */
  readonly instance: string | null;
  readonly trail: readonly TrailEntry[];
  readonly awaiting: Extract<Awaiting, { readonly kind: 'approval' }>;
}

/** One open instance as `status` reports it (`spec-017` §7.4, §8). */
export interface StatusEntry {
  readonly instance: Instance;
  readonly complete: boolean;
  /** Its top-level phases (`complete` | `current` | `pending` | `skipped`). */
  readonly phases: readonly PhaseProgress[];
  /** Its frontier, in frontier order (§1.3). */
  readonly frontier: readonly Step[];
  /** The candidates a live query matched after a later phase closed it (§4.7). */
  readonly late: readonly ElementRef[];
}

/**
 * An ungated element (`spec-017` §5.1, §8 `UngatedElement`): with `heldBy` when an open instance holds it — a field of
 * it names an element scoping one of that instance's frontier steps — though no step of it approves it now (`bug-487`).
 */
export type UngatedElement = GatedElement;

/** How many ungated elements one type has (`spec-017` §7.4, §8 `ungatedByType`, `bug-341`). */
export interface UngatedCount {
  readonly type: string;
  readonly count: number;
}

/** The invocation's flags a console rendering reads (`spec-006` §2's `renderConsole` `call`): `full` here. */
export interface StatusConsoleCall {
  readonly flags: Readonly<Record<string, boolean>>;
}

/** `workflow status`'s payload (`spec-017` §8). */
export interface StatusResult {
  readonly baseline: Baseline;
  /** The active instance's id (the most recently started open one), or `null`. */
  readonly active: string | null;
  readonly open: readonly StatusEntry[];
  /** The pending approvals of the listed instances, in frontier order. */
  readonly pendingApprovals: readonly PendingApproval[];
  /** The elements in a gate state that no pending approval of an open instance carries, ascending `(type, id)`. */
  readonly ungated: readonly UngatedElement[];
  /** {@link ungated} counted per type, ascending by type in byte order, one entry per type that has one (§7.4). */
  readonly ungatedByType: readonly UngatedCount[];
  /**
   * Whom an ungated element's "human needed" line names (§5.3): no workflow routes it, so the holders of the
   * `approver` role, the one role that may decide it (REQ-SEC-03), ascending `(name, email)`; `[]` when none does.
   */
  readonly ungatedRoutedTo: readonly Member[];
  /** `no open workflows` when no instance is open (BDD P4.5 sc. 3), whatever is ungated. */
  readonly message?: string;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * `W_INSTANCE_PRE_MARKER` (`spec-017` §2, transitory, §3.2; task-345): an open instance `workflow status` reports is
 * kept only by the pre-marker rule — its start commit carries no start marker. Removed with the rule (`bug-515`).
 */
export const W_INSTANCE_PRE_MARKER = 'W_INSTANCE_PRE_MARKER';

/** The message of the {@link W_INSTANCE_PRE_MARKER} entry of instance `id`. */
function preMarkerMessage(id: string): string {
  return `instance ${id} is kept by the pre-marker rule: restart it with workflow start`;
}

/** `ungated` counted per type, ascending by type in code-unit order (§7.4). */
function countByType(ungated: readonly UngatedElement[]): UngatedCount[] {
  const counts = new Map<string, number>();
  for (const element of ungated) counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
  return [...counts.keys()].sort().map((type) => ({ type, count: counts.get(type)! }));
}

/** `<type>:<id>`. */
function keyOf(element: ElementRef): string {
  return `${element.type}:${element.id}`;
}

/**
 * `workflow status`'s answer from one deduction (`spec-017` §7.4, §10). Pure. Exit `0` in every deduced case;
 * `NOT_FOUND` for a `ref` naming no open instance — `workflow is not open: <ref>` for a loaded workflow or an
 * instance plan, `unknown workflow: <ref>` otherwise, as `workflow next` (`unresolvedRef`).
 */
export function statusWorkflow(inputs: NextInputs, deduction: Deduction, ref?: string): CoreResult<StatusResult> {
  let shown = deduction.instances;
  if (ref !== undefined) {
    const selected = resolveInstanceRef(deduction, ref);
    if (selected === null) return unresolvedRef(inputs, ref);
    shown = [selected];
  }

  const open: StatusEntry[] = shown.map((entry) => ({
    instance: entry.instance,
    complete: entry.complete,
    phases: entry.phases,
    frontier: entry.frontier.map((step) => buildStep(step, inputs)),
    late: entry.late,
  }));
  const steps = open.flatMap((entry) => entry.frontier);
  const pendingApprovals: PendingApproval[] = steps.flatMap((step) =>
    step.awaiting?.kind === 'approval' ? [{ step: step.key, instance: step.instance, trail: step.trail, awaiting: step.awaiting }] : [],
  );

  // Carried by a pending approval of any open instance, `<ref>` or not (§5.1): its awaiting elements.
  const carried = new Set(deduction.instances.flatMap((entry) => entry.frontier.flatMap((step) => (step.approval?.elements ?? []).map(keyOf))));
  const ungated = deduction.gated.filter((element) => !carried.has(keyOf(element)));

  // The instances the transitory pre-marker rule keeps open (the classification in `./workflow-deduction`'s
  // `startMarker`, removed by `bug-515`; `spec-017` §3.2), in the order of `open`.
  const shownIds = new Set(shown.map((entry) => entry.instance.id));
  const preMarker = (deduction.preMarker ?? [])
    .filter((entry) => shownIds.has(entry.instance))
    .map((entry): Diagnostic => ({ code: W_INSTANCE_PRE_MARKER, severity: 'warning', file: entry.file, path: '', message: preMarkerMessage(entry.instance) }));

  // BDD P4.5 sc. 3: the message says no instance is open; the ungated elements are listed after it.
  const nothing = deduction.instances.length === 0;
  return coreOk({
    baseline: deduction.baseline,
    active: deduction.active,
    open,
    pendingApprovals,
    ungated,
    ungatedByType: countByType(ungated),
    ungatedRoutedTo: membersHoldingRole(inputs.dnaYaml, APPROVER_ROLE),
    ...(nothing ? { message: NO_OPEN_WORKFLOWS } : {}),
    diagnostics: [...deduction.diagnostics, ...approvalDiagnostics(steps, inputs.dnaYaml), ...preMarker],
  });
}

/**
 * `workflow status [<ref>]` at `HEAD` (`spec-017` §7.4): the deduction snapshot (with `bindings.yaml` and
 * `dna.yaml`), then `roles.yaml` and the directive files at the snapshot's commit, read only when a step is
 * reported.
 *
 * @throws `DiagnosticsError` (`VALIDATION`) when the registry at `HEAD` has a `spec-003` error; a
 *   `ValidationError` for an invalid `roles.yaml` or directive file at `HEAD`; `StorageError` when git
 *   cannot answer.
 */
export function workflowStatusAtHead(root: string, ref?: string): CoreResult<StatusResult> {
  const snapshot = readDeductionSnapshotAtHead(root);
  const deduction = deduceWorkflowState(snapshot);
  return statusWorkflow(readNextInputs(root, snapshot, deduction), deduction, ref);
}

// --- console --------------------------------------------------------------------------------------

/** One phase as `<name> <state>`, with its iteration counts or `(vacuous)`. */
function describePhase(progress: PhaseProgress): string {
  const counts = progress.iterations;
  const parts =
    counts === undefined
      ? []
      : (['eligible', 'entered', 'complete', 'late'] as const).filter((name) => counts[name] > 0).map((name) => `${name} ${counts[name]}`);
  const note = counts?.note !== undefined ? [counts.note] : progress.vacuous === true ? ['vacuous'] : [];
  const detail = [...parts, ...note];
  return `${progress.phase} ${progress.state}${detail.length === 0 ? '' : ` (${detail.join(', ')})`}`;
}

/** The console lines of one open instance. */
function instanceLines(entry: StatusEntry): string[] {
  const { instance } = entry;
  const flags = [instance.active ? 'active' : null, entry.complete ? 'complete' : null, instance.abandoned ? 'abandoned' : null].filter((flag): flag is string => flag !== null);
  const lines = [`${instance.active ? '*' : ' '} ${instance.id} (${instance.workflow})${flags.length === 0 ? '' : ` — ${flags.join(', ')}`}`];
  const element = instance.element;
  lines.push(`    element: ${element === null ? '(none)' : `${element.type}:${element.id} (${element.status})`}`);
  if (entry.phases.length > 0) lines.push(`    phases: ${entry.phases.map(describePhase).join(', ')}`);
  if (entry.frontier.length > 0) lines.push('    frontier:');
  for (const step of entry.frontier) {
    const missing = step.evidence.missing.length === 0 ? '' : `; missing: ${step.evidence.missing.join(', ')}`;
    const manualOnly = step.evidence.manualOnly ? '; manual only' : '';
    lines.push(`      - ${step.key} (${step.role ?? 'no role'}${missing}${manualOnly})${step.reentered ? ` re-entered after ${step.reentryCommit}` : ''}`);
    // A third party's line is the step's own; approvals are listed once, below.
    if (step.awaiting?.kind === 'party') lines.push(`        ${humanNeededLine(step)!}`);
  }
  if (entry.late.length > 0) lines.push(`    late: ${entry.late.map((late) => `${late.type}:${late.id} (${late.status})`).join(', ')}`);
  return lines;
}

/** The `--full` line of one ungated element (`spec-017` §7.4): a held one names its holder (`bug-487`). */
function ungatedLine(element: UngatedElement, routed: string): string {
  const carried =
    element.heldBy === undefined
      ? 'no open workflow carries it'
      : `held by ${element.heldBy.instance}'s ${element.heldBy.element.type} ${element.heldBy.element.id}, no step of it approves it now`;
  return `  human needed: approve or reject ${element.id} (${element.type}, ${element.status}; ${carried}) — routed to ${routed}`;
}

/**
 * `workflow status`'s `--format console` rendering (`spec-017` §5.3, §7.4, §8): the answer only, no diagnostic.
 * `call.flags.full` (the console flag `--full`, `spec-006` §2) lists the ungated elements one per line instead of the
 * summary line. Pure.
 */
export function renderStatusConsole(result: StatusResult, call?: StatusConsoleCall): string {
  const lines: string[] = [];
  if (result.message !== undefined) lines.push(result.message);
  else lines.push(`open workflows: ${result.open.length}`); // no message: some instance is open
  for (const entry of result.open) lines.push(...instanceLines(entry));
  if (result.pendingApprovals.length > 0) {
    lines.push(`pending approvals: ${result.pendingApprovals.length}`);
    for (const approval of result.pendingApprovals) lines.push(`  ${approvalLine(approval.awaiting, approval.step!)} (${approval.instance}, ${approval.step})`);
  }
  if (result.ungated.length > 0) {
    const routed = describeMembers(result.ungatedRoutedTo, noApproverMessage(APPROVER_ROLE));
    if (call?.flags['full'] === true) {
      lines.push(`ungated elements: ${result.ungated.length}`);
      for (const element of result.ungated) lines.push(ungatedLine(element, routed));
    } else {
      const counts = result.ungatedByType.map((entry) => `${entry.type} ${entry.count}`).join(', ');
      lines.push(`ungated elements: ${result.ungated.length} (${counts}) — routed to ${routed}; --full lists them`);
    }
  }
  return `${lines.join('\n')}\n`;
}
