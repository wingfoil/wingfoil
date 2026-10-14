/**
 * `wingfoil workflow finalize [<ref>] [--step <key>] [--reason <text>]` (task-226; `spec-017` §7.9, §4.3
 * `record`, §5.1, §5.4, §8 `FinalizeResult`, §10, §11; ruling R11; `dl-104` D1 (b)–(c); REQ-SEC-01,
 * REQ-SEC-03, P1.7).
 *
 * Records a phase's completion where the phase has no Memory or file evidence to deduce it from: a
 * checkpoint, an `awaits` (§5.4), a `created` step that created nothing, and an approval no element carries
 * (§5.1). The record is **one commit with no file change** (`commitEmpty`, `src/storage/commit.ts`):
 *
 * ```
 * workflow: finalize <instance-id> <key>
 *
 * Approver: <name> <<email>> (approver)      ← an `approval:` phase only
 * Reason: <the dl-067 block>                 ← when `--reason` is given
 *
 * WingFoil-Phase: <workflow>.<phase> completed
 * WingFoil-Instance: <instance-id>
 * WingFoil-Element: <type>:<id>              ← or WingFoil-Item: <collection>#<key>; none when unscoped
 * WingFoil-Version: <semver> (<sha>)
 * ```
 *
 * The subject is outside the `wf(<type>)` grammar (`spec-003` verb table), so `memory history` never reads it
 * as a Memory operation; the trailers are the phase record of `spec-003` § "Evidence", which the deduction
 * reads with git's `%(trailers)` — from the **final** paragraph only, which is why they share it with the
 * build signature (`CommitOptions.trailers`).
 *
 * **Baseline: `HEAD`, gating** (`spec-017` §1.1, §11): the deduction that names the frontier, and
 * `dna.yaml` for approval authority, are read at `HEAD`; nothing is read from the working tree except the
 * index, whose staged changes refuse the commit (`requireCleanIndex`, `dl-106`).
 *
 * **Refusal order**, every one before the commit: an unrecordable `--reason` (exit 2, before any read) →
 * the git identity (REQ-SEC-01) → the instance → the step on the frontier → its evidence → on an
 * `approval:` phase, a missing `--reason` (exit 2) and approver authority (REQ-SEC-03, the identity read
 * once, `bug-149`) → a dirty index.
 */
import { commitEmpty } from '../storage';
import { deduceWorkflowState, resolveInstanceRef, type Baseline, type DeducedStep, type Instance, type ScopeRef } from '../workflow/deduce';

import { APPROVER_ROLE, requireApprovalAuthority } from './approval-authority';
import { requireGitIdentity } from './git-identity';
import { optionalReason, requireReason } from './require-reason';
import { coreErr, coreOk, type CoreResult } from './types';
import { instancePlanIds, readDeductionSnapshotAtHead } from './workflow-deduction';
import { buildStep, emptyFrontierMessage, readNextInputs, stepLines, unresolvedRef, type Step } from './workflow-next';
import { requireCleanIndex } from './write-guard';

/** The refusal when no `<ref>` is given and no instance is open (as `workflow end`'s, `spec-017` §10). */
export const NO_ACTIVE_WORKFLOW_TO_FINALIZE = 'no active workflow to finalize';

/** `workflow finalize`'s payload (`spec-017` §8 `FinalizeResult`). */
export interface FinalizeResult {
  /** The commit the finalize gated on — `HEAD` before its record. */
  readonly baseline: Baseline;
  readonly instance: Instance;
  /** The step the record completes, as `workflow next` reported it at the baseline. */
  readonly finalized: Step;
  /** The instance's next step after the record, deduced at the new `HEAD`; `null` when it has none. */
  readonly next: Step | null;
  /** The record's commit sha. */
  readonly commit: string;
}

/** What the caller asked for: `<ref>`, `--step`, and the raw `--reason` (as `optionalReason` reads it). */
export interface FinalizeRequest {
  readonly ref?: string;
  readonly step?: string;
  readonly options?: Readonly<Record<string, string>>;
}

/** `<type>:<id>` or `<collection>#<key>`, as the record's trailer and the step key write a scope. */
function scopeTrailer(scope: ScopeRef): string {
  return 'item' in scope ? `WingFoil-Item: ${scope.item.collection}#${scope.item.key}` : `WingFoil-Element: ${scope.element.type}:${scope.element.id}`;
}

/** The phase-record trailers of `step` (`spec-003` § "Evidence"), in the order the spec lists them. */
export function phaseRecordTrailers(step: Pick<DeducedStep, 'workflow' | 'phase' | 'instance' | 'scope'>): string[] {
  return [`WingFoil-Phase: ${step.workflow}.${step.phase} completed`, `WingFoil-Instance: ${step.instance}`, ...(step.scope === null ? [] : [scopeTrailer(step.scope)])];
}

/**
 * The Memory type named in the authority refusal (`user not authorized to approve type '<type>'`): the
 * step's scope element's type, else the instance's bound element's, else `plan` — the instance itself.
 */
function authorityType(step: DeducedStep, instance: Instance): string {
  if (step.scope !== null && 'element' in step.scope) return step.scope.element.type;
  return instance.element?.type ?? 'plan';
}

/**
 * Why `step` cannot be finalized: its phase completes from other evidence (`spec-017` §7.9, `dl-104` D1
 * rationale). Names the missing kinds other than `record`, or — when none is missing — the kinds the phase
 * declares other than `record`.
 */
function evidenceRefusal<T>(step: DeducedStep): CoreResult<T> {
  const missing = step.evidence.missing.filter((kind) => kind !== 'record');
  const kinds = missing.length > 0 ? missing : step.evidence.kinds.filter((kind) => kind !== 'record');
  return coreErr({
    code: 'CONFLICT',
    message: `phase '${step.workflow}.${step.phase}' completes from its evidence: ${kinds.join(', ')}`,
    details: { step: step.key, kinds: [...step.evidence.kinds], missing: [...step.evidence.missing] },
  });
}

/**
 * `workflow finalize` at `HEAD` (`spec-017` §7.9). See the module comment for the record and the order of
 * the refusals.
 *
 * @throws `UsageError` (exit 2) for an unrecordable `--reason`, or a missing one on an `approval:` phase.
 * @throws `DiagnosticsError` (`VALIDATION`) when the registry at `HEAD` has a `spec-003` error;
 *   `StorageError` when git cannot answer; `CommitFailure` when git refuses the commit.
 */
export function workflowFinalizeAtHead(root: string, request: FinalizeRequest): CoreResult<FinalizeResult> {
  const given = optionalReason(request.options);
  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;

  const snapshot = readDeductionSnapshotAtHead(root);
  const deduction = deduceWorkflowState(snapshot);
  const selected = resolveInstanceRef(deduction, request.ref);
  if (selected === null) {
    if (request.ref !== undefined) return unresolvedRef({ workflows: snapshot.workflows, plans: instancePlanIds(snapshot.documents) }, request.ref);
    return coreErr({ code: 'NOT_FOUND', message: NO_ACTIVE_WORKFLOW_TO_FINALIZE });
  }
  const { instance, frontier } = selected;
  if (frontier.length === 0) return coreErr({ code: 'CONFLICT', message: emptyFrontierMessage(selected), details: { instance: instance.id } });
  const step = request.step === undefined ? frontier[0]! : frontier.find((candidate) => candidate.key === request.step);
  if (step === undefined) {
    return coreErr({
      code: 'CONFLICT',
      message: `step '${request.step}' is not on the frontier of ${instance.id}`,
      details: { frontier: frontier.map((candidate) => candidate.key) },
    });
  }
  if (!step.evidence.finalizable) return evidenceRefusal(step);

  // A frontier step's workflow and phase are loaded (deduction puts only loaded phases on a frontier).
  const phase = snapshot.workflows.find((workflow) => workflow.name === step.workflow)!.phases.find((candidate) => candidate.name === step.phase)!;
  const body: string[] = [];
  if (phase.approval !== undefined) {
    const reason = requireReason(request.options);
    const authorized = requireApprovalAuthority(root, authorityType(step, instance), identity.value);
    if (!authorized.ok) return authorized;
    body.push(`Approver: ${identity.value.name} <${identity.value.email}> (${APPROVER_ROLE})`, `Reason: ${reason}`);
  } else if (given !== undefined) {
    body.push(`Reason: ${given}`);
  }

  const subject = `workflow: finalize ${instance.id} ${step.key}`;
  const clean = requireCleanIndex(root, subject);
  if (!clean.ok) return clean;

  const finalized = buildStep(step, readNextInputs(root, snapshot, deduction));
  const message = body.length === 0 ? subject : `${subject}\n\n${body.join('\n')}`;
  const sha = commitEmpty(root, message, { author: identity.value, trailers: phaseRecordTrailers(step) });

  const after = readDeductionSnapshotAtHead(root);
  const deducedAfter = deduceWorkflowState(after);
  const nextStep = deducedAfter.instances.find((entry) => entry.instance.id === instance.id)?.frontier[0];
  const next = nextStep === undefined ? null : buildStep(nextStep, readNextInputs(root, after, deducedAfter));
  return coreOk({ baseline: deduction.baseline, instance, finalized, next, commit: sha }, { sha, message });
}

/** `workflow finalize`'s `--format console` rendering (`spec-017` §8). Pure. */
export function renderFinalizeConsole(result: FinalizeResult): string {
  const lines = [`workflow: ${result.instance.workflow} (${result.instance.id})`, `finalized: ${result.finalized.key} (${result.commit})`];
  if (result.next === null) lines.push('no next step');
  else lines.push(...stepLines(result.next, 'next step'));
  return `${lines.join('\n')}\n`;
}
