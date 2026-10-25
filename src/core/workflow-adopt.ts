/**
 * `wingfoil workflow adopt <ref> [--step <key>] [--element <type>:<id>] [--plan [--apply]] [--reason <text>]`
 * (task-294; P4.21, `cp-002`, REQ-STATE-11; `spec-017` §7.11, §8 `AdoptResult` / `AdoptPlanResult`, §10, §11;
 * `spec-008` §2, §12; `dl-187` rules 1–7; design D1–D10 as ruled at the design gate, 2026-10-24).
 *
 * Records which step of an open instance an existing element counts as created by — an **adoption**, one empty
 * commit written by {@link writeProvenanceRecord} — without changing the element or rewriting history. Three forms:
 *
 * - **single** (`--step` and/or `--element`, `--reason`): one adoption, any role (rule 7);
 * - **`--plan`**: the adoptions the declared rules propose (`planAdoptions`, `src/workflow/adopt.ts`), the
 *   instance's recorded adoptions first, and its orphans; writes nothing;
 * - **`--plan --apply`** (`--reason`): one adoption per proposed step with a single candidate, in plan order, each
 *   checked as the single form checks it at its own `HEAD`, with an `Approver:` line; the approver role is required
 *   (REQ-SEC-03), checked before anything else is read, even when nothing is left to write (D8).
 *
 * **Refusal order** (design "The command"): the usage refusals (exit 2, before any read: `--apply` without
 * `--plan`, `--plan` with `--step`/`--element`, none of the three, a malformed `--element`, a missing or
 * unrecordable `--reason` — validated, unused, with `--plan` alone, D6) → the git identity (REQ-SEC-01; not on
 * `--plan` alone) → approver authority (`--plan --apply`) → the instance → the step (on the frontier; else the one
 * frontier step adding `--element`'s type) → it adds a type → `--element`'s type is one of them (before existence,
 * D10) → it lacks its created element (D1) → `--element` exists at `HEAD` → not owned (§4.8) → without
 * `--element`, its one candidate (several: their `<type>:<id>` in `details.candidates`; several frontier steps: their keys
 * in `details.steps`) → a clean index (`dl-106`) → the commit.
 *
 * **Baseline: `HEAD`, gating** (§11): the deduction, the candidates' frontmatter and `dna.yaml` (authority) are
 * read at `HEAD`. `--plan` reads `HEAD`, declared; the deduction's `W_UNCOMMITTED_INPUTS` go out as success
 * warnings and the payload keeps §8's shape (D5).
 */
import type { MemoryDocumentSummary } from '../memory/query';
import { planAdoptions } from '../workflow/adopt';
import { deduceWorkflowState, resolveInstanceRef, W_UNCOMMITTED_INPUTS, type Baseline, type DeducedStep, type Deduction, type DeductionSnapshot, type ElementRef, type Instance } from '../workflow/deduce';
import { resolveProvenance } from '../workflow/provenance';

import { requireApproverAuthority } from './approval-authority';
import { parseElementRef } from './element-ref';
import { requireGitIdentity, type GitIdentity } from './git-identity';
import { missingOperandReason } from './registry';
import { adoptionSubject, adoptionTrailers, writeProvenanceRecord } from './provenance-record';
import { optionalReason, requireReason } from './require-reason';
import { coreErr, coreOk, type CoreResult } from './types';
import { UsageError } from './usage-error';
import { instancePlanIds, readDeductionSnapshotAtHead } from './workflow-deduction';
import { buildStep, readNextInputs, stepLines, unresolvedRef, type Step } from './workflow-next';

/** `spec-017` §10: `--plan --apply` without approver authority. */
export const BULK_ADOPT_UNAUTHORIZED = 'user not authorized to apply adoptions in bulk';

/** `spec-008` §12: the usage refusals of `workflow adopt`. */
const APPLY_NEEDS_PLAN = 'invalid flag combination: --apply needs --plan';
const PLAN_TAKES_NO_TARGET = 'invalid flag combination: --plan proposes every step; drop --step and --element';
const MISSING_FORM = 'missing required argument: --step, --element or --plan';

/** One adoption (`spec-017` §8 `Adoption`): `commit` is `null` for one proposed, or already recorded. */
export interface Adoption {
  readonly step: string;
  readonly element: ElementRef;
  readonly commit: string | null;
}

/** The single form's payload (`spec-017` §8 `AdoptResult`). */
export interface AdoptResult {
  /** The commit the adoption gated on — `HEAD` before it. */
  readonly baseline: Baseline;
  readonly instance: Instance;
  readonly adopted: readonly Adoption[];
  /** The instance's next step after the adoption, deduced at the new `HEAD`; `null` when it has none. */
  readonly next: Step | null;
}

/** `--plan`'s payload (`spec-017` §8 `AdoptPlanResult`). */
export interface AdoptPlanResult {
  readonly baseline: Baseline;
  readonly instance: Instance;
  /** The recorded adoptions first (`recorded: true`, D3), then the proposals, in walk order. */
  readonly steps: readonly { readonly step: string; readonly type: string; readonly candidates: readonly ElementRef[]; readonly recorded: boolean }[];
  /** The records of the instance naming a step the registry does not declare (§4.8). */
  readonly orphans: readonly { readonly commit: string; readonly key: string; readonly element: ElementRef | null }[];
  /** The adoptions `--apply` wrote; empty without `--apply`. */
  readonly applied: readonly Adoption[];
}

/** What the caller asked for. */
export interface AdoptRequest {
  readonly ref?: string;
  readonly step?: string;
  readonly element?: string;
  readonly plan: boolean;
  readonly apply: boolean;
  /** The raw options, as `requireReason` / `optionalReason` read `reason`. */
  readonly options?: Readonly<Record<string, string>>;
}

/** A frontmatter value as text. */
function fieldText(value: unknown): string {
  return String(value);
}

/** The element `<type>:<id>` as `HEAD` holds it, or `null`. */
function elementAt(documents: readonly MemoryDocumentSummary[], type: string, id: string): ElementRef | null {
  const found = documents.find((entry) => fieldText(entry.frontmatter['type']) === type && fieldText(entry.frontmatter['id']) === id);
  return found === undefined ? null : { type, id, status: fieldText(found.frontmatter['status']) };
}

/** Ascending `(type, id)`. */
function compareRefs(a: { type: string; id: string }, b: { type: string; id: string }): number {
  return Number(a.type > b.type) - Number(a.type < b.type) || Number(a.id > b.id) - Number(a.id < b.id);
}

/** The open instances, as `resolveProvenance` takes them. */
function openInstances(deduction: Deduction): { id: string; startCommit: string }[] {
  return deduction.instances.map((entry) => ({ id: entry.instance.id, startCommit: entry.instance.startCommit }));
}

/** One adoption at the current `HEAD`, checked as the single form checks it (refusal order from the instance on). */
function adoptOne(
  root: string,
  identity: GitIdentity,
  ref: string,
  stepKey: string | undefined,
  named: { type: string; id: string } | null,
  reason: string,
  approver: GitIdentity | null,
): CoreResult<AdoptResult> {
  const snapshot = readDeductionSnapshotAtHead(root);
  const deduction = deduceWorkflowState(snapshot);
  const selected = resolveInstanceRef(deduction, ref);
  if (selected === null) return unresolvedRef({ workflows: snapshot.workflows, plans: instancePlanIds(snapshot.documents) }, ref);
  const { instance, frontier } = selected;

  let step: DeducedStep | undefined;
  if (stepKey !== undefined) {
    step = frontier.find((candidate) => candidate.key === stepKey);
    if (step === undefined) return coreErr({ code: 'CONFLICT', message: `step '${stepKey}' is not on the frontier of ${instance.id}`, details: { frontier: frontier.map((entry) => entry.key) } });
  } else {
    const type = named!.type;
    const adding = frontier.filter((candidate) => candidate.additions.some((addition) => addition.type === type));
    const none = `no step of ${instance.id} adds a ${type}`;
    if (adding.length === 0) return coreErr({ code: 'CONFLICT', message: none, details: { instance: instance.id, type, steps: [] } });
    if (adding.length > 1) {
      const steps = adding.map((entry) => entry.key);
      return coreErr({ code: 'CONFLICT', message: `${none} alone: give --step, one of: ${steps.join(', ')}`, details: { instance: instance.id, type, steps } });
    }
    step = adding[0]!;
  }

  const { key, additions } = step;
  if (additions.length === 0) return coreErr({ code: 'CONFLICT', message: `${key} adds no element to adopt`, details: { step: key } });
  if (named !== null && !additions.some((addition) => addition.type === named.type)) {
    return coreErr({ code: 'VALIDATION', message: `${key} adds a ${additions.map((addition) => addition.type).join(', ')}, not a ${named.type}`, details: { step: key } });
  }
  const lacking = additions.filter((addition) => addition.created.length === 0 && (named === null || addition.type === named.type));
  if (lacking.length === 0) return coreErr({ code: 'CONFLICT', message: `${key} already has its created element`, details: { step: key } });

  let element: ElementRef;
  if (named !== null) {
    const found = elementAt(snapshot.documents, named.type, named.id);
    if (found === null) return coreErr({ code: 'NOT_FOUND', message: `element not found: ${named.type}:${named.id}` });
    const provenance = resolveProvenance(snapshot, openInstances(deduction));
    const ownerKey = `${named.type}:${named.id}`;
    const owner = provenance.owners.get(ownerKey) ?? provenance.conflicts.find((conflict) => `${conflict.element.type}:${conflict.element.id}` === ownerKey)?.claims[0];
    if (owner !== undefined) {
      return coreErr({
        code: 'CONFLICT',
        message: `${ownerKey} is already owned by ${owner.instance} ${owner.step}; move it with workflow transfer`,
        details: { element: ownerKey, instance: owner.instance, step: owner.step },
      });
    }
    element = found;
  } else {
    const candidates = lacking.flatMap((addition) => addition.candidates).sort(compareRefs);
    if (candidates.length === 0) return coreErr({ code: 'CONFLICT', message: `no candidate for ${key}; name one with --element`, details: { step: key, candidates: [] } });
    if (candidates.length > 1) {
      const listed = candidates.map((ref) => `${ref.type}:${ref.id}`);
      return coreErr({ code: 'CONFLICT', message: `${candidates.length} candidates for ${key} (${listed.join(', ')}); name one with --element`, details: { step: key, candidates: listed } });
    }
    element = candidates[0]!;
  }

  const written = writeProvenanceRecord(root, identity, {
    subject: adoptionSubject(instance.id, key, element),
    reason,
    approver,
    trailers: adoptionTrailers(instance.id, key, element),
  });
  if (!written.ok) return written;

  const after = readDeductionSnapshotAtHead(root);
  const deducedAfter = deduceWorkflowState(after);
  const nextStep = deducedAfter.instances.find((entry) => entry.instance.id === instance.id)?.frontier[0];
  const next = nextStep === undefined ? null : buildStep(nextStep, readNextInputs(root, after, deducedAfter));
  return coreOk({ baseline: deduction.baseline, instance, adopted: [{ step: key, element, commit: written.value }], next });
}

/** `--plan`'s payload at `HEAD`, without applications, and the deduction's uncommitted-input warnings (D5). */
function planAt(snapshot: DeductionSnapshot, deduction: Deduction, instance: Instance): { value: AdoptPlanResult; warnings: string[] } {
  const plan = planAdoptions(snapshot, instance.id);
  const orphans = resolveProvenance(snapshot, openInstances(deduction))
    .orphans.filter((orphan) => orphan.instance === instance.id)
    .map((orphan) => ({ commit: orphan.commit, key: orphan.key, element: orphan.element === null ? null : elementAt(snapshot.documents, orphan.element.type, orphan.element.id) }));
  const warnings = deduction.diagnostics.filter((diagnostic) => diagnostic.code === W_UNCOMMITTED_INPUTS).map((diagnostic) => diagnostic.message);
  return { value: { baseline: deduction.baseline, instance, steps: plan.steps, orphans, applied: [] }, warnings };
}

/**
 * `workflow adopt` at `HEAD` (`spec-017` §7.11). See the module comment for the forms and the refusal order.
 *
 * @throws `UsageError` (exit 2) for a malformed invocation (`spec-008` §12) or an unrecordable `--reason`.
 * @throws `DiagnosticsError` (`VALIDATION`) when the registry at `HEAD` has a `spec-003` error; `StorageError`
 *   when git cannot answer; `CommitFailure` when git refuses a commit.
 */
export function workflowAdoptAtHead(root: string, request: AdoptRequest): CoreResult<AdoptResult | AdoptPlanResult> {
  const { plan, apply } = request;
  if (apply && !plan) throw new UsageError(APPLY_NEEDS_PLAN);
  if (plan && (request.step !== undefined || request.element !== undefined)) throw new UsageError(PLAN_TAKES_NO_TARGET);
  if (!plan && request.step === undefined && request.element === undefined) throw new UsageError(MISSING_FORM);
  let named: { type: string; id: string } | null = null;
  if (request.element !== undefined) {
    const parsed = parseElementRef(request.element);
    if (!parsed.ok) throw new UsageError(parsed.error.message);
    named = parsed.value;
  }
  const reason = plan && !apply ? optionalReason(request.options) : requireReason(request.options);
  // A required positional: the CLI registrar refuses its absence before the operation runs; an in-process caller
  // that leaves it out gets the same usage refusal.
  const ref = request.ref;
  if (ref === undefined) throw new UsageError(missingOperandReason('ref'));

  if (!plan) {
    const identity = requireGitIdentity(root);
    if (!identity.ok) return identity;
    return adoptOne(root, identity.value, ref, request.step, named, reason!, null);
  }

  let identity: GitIdentity | null = null;
  if (apply) {
    const checked = requireGitIdentity(root);
    if (!checked.ok) return checked;
    const authorized = requireApproverAuthority(root, checked.value, BULK_ADOPT_UNAUTHORIZED);
    if (!authorized.ok) return authorized;
    identity = checked.value;
  }

  const snapshot = readDeductionSnapshotAtHead(root);
  const deduction = deduceWorkflowState(snapshot);
  const selected = resolveInstanceRef(deduction, ref);
  if (selected === null) return unresolvedRef({ workflows: snapshot.workflows, plans: instancePlanIds(snapshot.documents) }, ref);
  const { value, warnings } = planAt(snapshot, deduction, selected.instance);
  if (identity === null) return coreOk<AdoptResult | AdoptPlanResult>(value, undefined, warnings);

  const applied: Adoption[] = [];
  for (const entry of value.steps) {
    if (entry.recorded || entry.candidates.length !== 1) continue;
    const one = adoptOne(root, identity, selected.instance.id, entry.step, entry.candidates[0]!, reason!, identity);
    if (!one.ok) return coreErr({ ...one.error, details: { ...(one.error.details as Record<string, unknown> | undefined), applied } });
    applied.push(...one.value.adopted);
  }
  return coreOk<AdoptResult | AdoptPlanResult>({ ...value, applied }, undefined, warnings);
}

/** `<type>:<id>`. */
const refText = (ref: { readonly type: string; readonly id: string }): string => `${ref.type}:${ref.id}`;

/** `workflow adopt`'s `--format console` rendering, both forms (design "Output"). Pure. */
export function renderAdoptConsole(value: unknown): string {
  const result = value as AdoptResult | AdoptPlanResult;
  const lines = [`workflow: ${result.instance.workflow} (${result.instance.id})`];
  if (!('steps' in result)) {
    for (const adoption of result.adopted) lines.push(`adopted: ${refText(adoption.element)} into ${adoption.step} (${adoption.commit})`);
    if (result.next === null) lines.push('no next step');
    else lines.push(...stepLines(result.next, 'next step'));
    return `${lines.join('\n')}\n`;
  }
  for (const entry of result.steps) {
    const [first] = entry.candidates;
    if (entry.recorded) lines.push(`step ${entry.step}: adopted ${refText(first!)} (recorded)`);
    else if (entry.candidates.length === 0) lines.push(`step ${entry.step}: no candidate of type ${entry.type}`);
    else if (entry.candidates.length === 1) lines.push(`step ${entry.step}: 1 candidate ${refText(first!)}`);
    else lines.push(`step ${entry.step}: ${entry.candidates.length} candidates ${entry.candidates.map(refText).join(', ')}`);
  }
  for (const orphan of result.orphans) lines.push(`orphan: ${orphan.key} (${orphan.commit})${orphan.element === null ? '' : ` ${refText(orphan.element)}`}`);
  for (const adoption of result.applied) lines.push(`applied: ${refText(adoption.element)} into ${adoption.step} (${adoption.commit})`);
  if (result.steps.length === 0 && result.orphans.length === 0 && result.applied.length === 0) lines.push('nothing to adopt');
  return `${lines.join('\n')}\n`;
}
