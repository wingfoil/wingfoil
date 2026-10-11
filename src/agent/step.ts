/**
 * `agent execute`'s step forms (task-235; `spec-016-agent-execution` §3.1 `--next`, `--workflow <ref>`,
 * `--step <key>`; §3.2 steps 1–3; §3.7's step rows; approver ruling R16): the step comes from `spec-017`'s
 * `workflow next` deduction (`NextResult`, task-216), and gives the run its workflow, phase, element and
 * role.
 *
 * - {@link readNextAtHead}: the deduction for the instance `--workflow <ref>` selects, else the active
 *   instance (`spec-017` §3.3), at `HEAD`; a `spec-003` error in the registry is `VALIDATION` with every
 *   diagnostic in `details`, as `workflow next` refuses it (§3.7's second row).
 * - {@link selectFrontierStep}: `--step <key>` on that instance's frontier, else `NextResult.next`.
 * - {@link stepTargetElement}: `--element`, else the step's scope element, else the instance's bound element.
 * - {@link resolveStepRole}: `--role`, else the step's role, which `dna.yaml` must define.
 *
 * All four are pure but the first, which reads `HEAD` only (`dl-080` (B)): the step a run takes is a
 * function of committed state and the request (`REQ-SYS-07`). The phase's separation of executors is not
 * checked (P4.12, v1.0) and every v0.3 run is `fresh` whatever the phase allows (§3.2 step 6, `dl-135`
 * point 3): neither executor attribute of the step is read here.
 */
import { isRoleDefined } from '../dna/roles';
import type { DnaYaml } from '../dna/schema';
import type { ExecutionContextElement } from '../core/context';
import { coreErr, coreOk, type CoreResult } from '../core/types';
import { workflowNextAtHead, type NextResult, type Step } from '../core/workflow-next';
import { DiagnosticsError, ValidationError } from '../validation';
import type { Instance } from '../workflow/deduce';

/** P5.3.1 sc. 3, verbatim (§3.7 `NO_NEXT_STEP`). */
export const NO_NEXT_STEP_MESSAGE = 'no next step to execute';

/** Which step a run takes (§3.1): absent fields select the active instance and its next step. */
export interface StepSelector {
  /** `--workflow <ref>`: a workflow name (its most recently started open instance) or an open instance id. */
  readonly workflow?: string;
  /** `--step <key>`: a `spec-017` §4.9 step key on the selected instance's frontier. */
  readonly key?: string;
}

/**
 * `workflow next`'s deduction for `ref` at `HEAD` (`workflowNextAtHead`), its throws mapped as `workflow
 * next` maps them: a `spec-003` error in the registry is `VALIDATION`, its first error the message and every
 * diagnostic in `details.diagnostics`; another invalid committed file (`roles.yaml`, a directive) is
 * `VALIDATION` with its issues. A `ref` naming no workflow, or no open instance, is the `NOT_FOUND` it returns.
 */
export function readNextAtHead(root: string, ref: string | undefined): CoreResult<NextResult> {
  try {
    return workflowNextAtHead(root, ref);
  } catch (error) {
    if (error instanceof DiagnosticsError) return coreErr({ code: 'VALIDATION', message: error.message, details: { diagnostics: error.diagnostics } });
    if (error instanceof ValidationError) return coreErr({ code: 'VALIDATION', message: error.message, details: { issues: error.issues } });
    throw error;
  }
}

/**
 * §3.2 step 1: the frontier step `key` names — `NextResult.next` or one of the further ready steps — else,
 * without `key`, `NextResult.next`. No open instance, or an empty frontier without `key`, is `NO_NEXT_STEP`;
 * a `key` that is not on the selected instance's frontier is `spec-017` §10's `CONFLICT`.
 */
export function selectFrontierStep(next: NextResult, key: string | undefined): CoreResult<Step> {
  const noNextStep = coreErr({ code: 'NOT_FOUND', message: NO_NEXT_STEP_MESSAGE });
  if (next.instance === null) return noNextStep;
  if (key === undefined) return next.next === null ? noNextStep : coreOk(next.next);
  const found = [...(next.next === null ? [] : [next.next]), ...next.more].find((step) => step.key === key);
  if (found !== undefined) return coreOk(found);
  const instance = next.instance.id;
  return coreErr({ code: 'CONFLICT', message: `step '${key}' is not on the frontier of ${instance}`, details: { step: key, instance } });
}

/**
 * §3.2 step 2: `--element` if given, else the step's scope element, else the instance's bound element
 * (`spec-017` §3.4). A step with none of the three — a collection-entry or empty scope on an instance with no
 * bound element — is `NO_STEP_ELEMENT`. Whether the element exists at `HEAD` is the pipeline's check.
 */
export function stepTargetElement(step: Step, instance: Instance | null, override: ExecutionContextElement | undefined): CoreResult<ExecutionContextElement> {
  if (override !== undefined) return coreOk(override);
  const scope = step.scope !== null && 'element' in step.scope ? step.scope.element : (instance?.element ?? null);
  if (scope !== null) return coreOk({ type: scope.type, id: scope.id });
  return coreErr({ code: 'VALIDATION', message: `step '${step.key}' has no element: give --element <type>:<id>` });
}

/**
 * §3.2 step 3 (P5.3.2): `--role` if given — the pipeline checks it as it checks every `--role` — else the
 * step's role. A step with no role is `NO_STEP_ROLE`; a step role `dna.yaml` does not define is refused here as a
 * defence only: the registry refuses such a role at load (`E_PHASE_ROLE_UNKNOWN`, task-194, P5.3.2 sc. 3) against
 * the same `dna.yaml`, so this check holds only for a step deduced from a registry that did not check it.
 */
export function resolveStepRole(dna: DnaYaml, step: Step, override: string | undefined): CoreResult<string> {
  if (override !== undefined) return coreOk(override);
  if (step.role === null) return coreErr({ code: 'VALIDATION', message: `step '${step.key}' declares no role: give --role <role>` });
  if (!isRoleDefined(dna, step.role)) return coreErr({ code: 'VALIDATION', message: `step role '${step.role}' not defined in dna.yaml` });
  return coreOk(step.role);
}
