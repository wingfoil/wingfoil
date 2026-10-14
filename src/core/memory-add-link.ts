/**
 * `memory add --workflow <ref> [--step <key>]` — which workflow step the added element is linked to
 * (task-227; `spec-017` §4.8 "Linkage", §7.10, §10, §11; ruling R16).
 *
 * The link is the pair of trailers `WingFoil-Instance: <instance-id>` / `WingFoil-Step: <key>` on the add
 * commit, which the deduction reads back (`readFacts`, `./workflow-deduction.ts`) to list the element in the
 * step's `created`. This module decides the pair, before anything is written: one deduction at `HEAD`, the
 * one `workflow next` answers from (`spec-017` §11's `memory add --workflow` row), then the frontier steps of
 * the selected instance whose phase declares `memory.add(type: <T>)` for the `--type` given.
 *
 * A pure function of the repository as committed at `HEAD` (REQ-SYS-07): the frontier is in the deduction's
 * order, and nothing reads the clock or the working tree.
 */
import { memoryAddType, tokenName } from '../workflow/bindings';
import { deduceWorkflowState, resolveInstanceRef, type DeducedStep } from '../workflow/deduce';

import { coreErr, coreOk, type CoreResult } from './types';
import { instancePlanIds, readDeductionSnapshotAtHead } from './workflow-deduction';
import { unresolvedRef } from './workflow-next';

/** The step an added element is linked to: the values of its two trailers. */
export interface AddLink {
  /** The open instance's id — `WingFoil-Instance`. */
  readonly instance: string;
  /** The frontier step's key, `<workflow>.<phase>[@<scope>]` — `WingFoil-Step`. */
  readonly step: string;
}

/** The trailer lines that record `link` on the add commit (`spec-017` §4.8), in this order. */
export function addLinkTrailers(link: AddLink): string[] {
  return [`WingFoil-Instance: ${link.instance}`, `WingFoil-Step: ${link.step}`];
}

/** Whether `step`'s phase declares a `memory.add` of `type`. */
function addsType(step: DeducedStep, type: string): boolean {
  return step.actions.some((action) => tokenName(action.token) === 'memory.add' && memoryAddType(action.token) === type);
}

/**
 * Resolve `--workflow <ref> [--step <key>]` for an element of `type` (`spec-017` §7.10). Refusals, each
 * exit `1` (`spec-017` §10):
 *
 * - `<ref>` names no open instance: `workflow is not open: <ref>` when it is a loaded workflow's name or an
 *   instance plan's id, else `unknown workflow: <ref>` (`NOT_FOUND`) — `unresolvedRef`, the one answer `workflow
 *   next`, `status`, `finalize` and `end` give for the same `<ref>` (task-281, `bug-326`);
 * - `--step <key>` is not on the instance's frontier: `step '<key>' is not on the frontier of <instance>`
 *   (`CONFLICT`), as `workflow finalize` refuses it;
 * - no frontier step (or the `--step` one) adds a `type`: `no step of <instance> adds a <type>` (`CONFLICT`);
 * - several do and no `--step` picks one: the same refusal, listing their keys in frontier order and asking
 *   for `--step` (`CONFLICT`, the keys also in `details.steps`).
 *
 * @throws `DiagnosticsError` (`VALIDATION`) when the registry at `HEAD` has a `spec-003` error; `StorageError`
 *   when git cannot answer — mapped by the caller, as `workflow next` maps them.
 */
export function resolveAddLink(root: string, ref: string, stepKey: string | undefined, type: string): CoreResult<AddLink> {
  const snapshot = readDeductionSnapshotAtHead(root);
  const selected = resolveInstanceRef(deduceWorkflowState(snapshot), ref);
  if (selected === null) {
    return unresolvedRef({ workflows: snapshot.workflows, plans: instancePlanIds(snapshot.documents) }, ref);
  }
  const instance = selected.instance.id;
  if (stepKey !== undefined && !selected.frontier.some((step) => step.key === stepKey)) {
    return coreErr({ code: 'CONFLICT', message: `step '${stepKey}' is not on the frontier of ${instance}`, details: { instance, step: stepKey } });
  }
  const candidates = selected.frontier.filter((step) => (stepKey === undefined || step.key === stepKey) && addsType(step, type));
  const none = `no step of ${instance} adds a ${type}`;
  if (candidates.length === 0) return coreErr({ code: 'CONFLICT', message: none, details: { instance, type, steps: [] } });
  if (candidates.length > 1) {
    const steps = candidates.map((step) => step.key);
    return coreErr({ code: 'CONFLICT', message: `${none} alone: give --step, one of: ${steps.join(', ')}`, details: { instance, type, steps } });
  }
  return coreOk({ instance, step: candidates[0]!.key });
}
