/**
 * `wingfoil workflow rekey <ref> --from <workflow>.<phase> --to <workflow>.<phase> --reason <text>` (task-295; P4.21,
 * `cp-002`, `dl-187` C5 and rule 7; `spec-017` §4.8, §7.12, §8 `RekeyResult`, §10, §11; `spec-008` §2, §12; design
 * D1–D6, ruled at the design gate, 2026-10-24).
 *
 * Remaps the records of an open instance from a renamed step key: every linkage, phase record and adoption of the
 * instance that names `<from>` (with any `@<scope>` suffix, which is kept) reads, from this commit on, as naming
 * `<to>` (the deduction applies it, `resolveProvenance`, `src/workflow/provenance.ts`). The record is **one commit
 * with no file change**, written by {@link writeProvenanceRecord} (task-294's shared writer):
 *
 * ```
 * workflow: rekey <instance-id> <from> <to>
 *
 * Approver: <name> <<email>> (approver)
 * Reason: <the dl-067 block>
 *
 * WingFoil-Instance: <instance-id>
 * WingFoil-Rekey-From: <from>
 * WingFoil-Rekey-To: <to>
 * WingFoil-Version: <semver> (<sha>)
 * ```
 *
 * **Refusal order** (design D1): the usage refusals (exit 2, before any read: `--from`, `--to`, their shape — D2,
 * two `[a-z][a-z0-9-]*` segments joined by one dot — and `--reason`) → the git identity (REQ-SEC-01) → approver
 * authority (rule 7, REQ-SEC-03; before the instance, so the answer does not depend on the state) → the instance →
 * `<from>` still declared → `<to>` not declared (any declared `<workflow>.<phase>`, D3) → the same mapping already
 * in the instance's walk: nothing written, exit 0 (D5; before the next check, §7.12) → `<from>` named by no record of
 * the instance after earlier rekeys → a clean index (`dl-106`) → the commit.
 *
 * `remapped` (D4) counts the instance's entries the commit remaps: one per element a linkage names, one per record,
 * one per adoption — the instance's orphans whose key, before any `@<scope>`, is `<from>`.
 *
 * **Baseline: `HEAD`, gating** (§11): the registry, the deduction and `dna.yaml` (authority) are read at `HEAD`;
 * nothing is read from the working tree but the index.
 */
import { deduceWorkflowState, resolveInstanceRef, type Baseline, type Deduction, type DeductionSnapshot, type Instance } from '../workflow/deduce';
import { resolveProvenance } from '../workflow/provenance';

import { requireApproverAuthority } from './approval-authority';
import { requireGitIdentity } from './git-identity';
import { rekeySubject, rekeyTrailers, writeProvenanceRecord } from './provenance-record';
import { missingOperandReason } from './registry';
import { requireReason } from './require-reason';
import { coreErr, coreOk, type CoreResult } from './types';
import { UsageError } from './usage-error';
import { instancePlanIds, readDeductionSnapshotAtHead } from './workflow-deduction';
import { buildStep, readNextInputs, stepLines, unresolvedRef, type Step } from './workflow-next';

/** `spec-017` §10: `workflow rekey` without approver authority. */
export const REKEY_UNAUTHORIZED = 'user not authorized to rekey';

/** `spec-008` §12 (design D2): an unscoped `<workflow>.<phase>`, both names in `spec-003`'s name class. */
const STEP_KEY_RE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

/** `workflow rekey`'s payload (`spec-017` §8 `RekeyResult`). */
export interface RekeyResult {
  /** The commit the rekey gated on — `HEAD` before its record. */
  readonly baseline: Baseline;
  readonly instance: Instance;
  readonly from: string;
  readonly to: string;
  /** The entries the record remaps (design D4); `0` when the mapping was already recorded. */
  readonly remapped: number;
  /** The record's sha; `null` when the mapping was already recorded and nothing was written (D5). */
  readonly commit: string | null;
  /** The instance's next step, deduced after the record (at `HEAD` on the no-op); `null` when it has none. */
  readonly next: Step | null;
}

/** What the caller asked for: `<ref>`, `--from`, `--to`, and the raw options `requireReason` reads `reason` from. */
export interface RekeyRequest {
  readonly ref?: string;
  readonly from?: string;
  readonly to?: string;
  readonly options?: Readonly<Record<string, string>>;
}

/** The value of `--<name>`, present and well formed, or a `UsageError` (`spec-008` §12). */
function stepKeyOption(name: 'from' | 'to', value: string | undefined): string {
  if (value === undefined) throw new UsageError(`missing required argument: --${name}`);
  if (!STEP_KEY_RE.test(value)) throw new UsageError(`invalid flag value: --${name} must be <workflow>.<phase>`);
  return value;
}

/** The instance's next step in `deduction`, as `workflow next` reports it, or `null`. */
function nextOf(root: string, snapshot: DeductionSnapshot, deduction: Deduction, instance: string): Step | null {
  const step = deduction.instances.find((entry) => entry.instance.id === instance)?.frontier[0];
  return step === undefined ? null : buildStep(step, readNextInputs(root, snapshot, deduction));
}

/**
 * `workflow rekey` at `HEAD` (`spec-017` §7.12). See the module comment for the record and the refusal order.
 *
 * @throws `UsageError` (exit 2) for a missing or malformed `--from` / `--to`, a missing `<ref>`, or a missing or
 *   unrecordable `--reason`.
 * @throws `DiagnosticsError` (`VALIDATION`) when the registry at `HEAD` has a `spec-003` error; `StorageError` when
 *   git cannot answer; `CommitFailure` when git refuses the commit.
 */
export function workflowRekeyAtHead(root: string, request: RekeyRequest): CoreResult<RekeyResult> {
  const from = stepKeyOption('from', request.from);
  const to = stepKeyOption('to', request.to);
  const reason = requireReason(request.options);
  // A required positional: the CLI registrar refuses its absence first; an in-process caller gets the same refusal.
  const ref = request.ref;
  if (ref === undefined) throw new UsageError(missingOperandReason('ref'));

  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;
  const authorized = requireApproverAuthority(root, identity.value, REKEY_UNAUTHORIZED);
  if (!authorized.ok) return authorized;

  const snapshot = readDeductionSnapshotAtHead(root);
  const deduction = deduceWorkflowState(snapshot);
  const selected = resolveInstanceRef(deduction, ref);
  if (selected === null) return unresolvedRef({ workflows: snapshot.workflows, plans: instancePlanIds(snapshot.documents) }, ref);
  const { instance } = selected;

  const declared = new Set<string>();
  for (const workflow of snapshot.workflows) for (const phase of workflow.phases) declared.add(`${workflow.name}.${phase.name}`);
  if (declared.has(from)) return coreErr({ code: 'CONFLICT', message: `cannot rekey ${from}: it is still declared` });
  if (!declared.has(to)) return coreErr({ code: 'CONFLICT', message: `unknown step: ${to}` });

  const rekeys = snapshot.history.get(instance.startCommit)?.rekeys ?? [];
  if (rekeys.some((entry) => entry.instance === instance.id && entry.from === from && entry.to === to)) {
    return coreOk({ baseline: deduction.baseline, instance, from, to, remapped: 0, commit: null, next: nextOf(root, snapshot, deduction, instance.id) });
  }

  // `<from>` is not declared (above), so every entry still naming it after earlier rekeys is an orphan.
  const remapped = resolveProvenance(snapshot, [{ id: instance.id, startCommit: instance.startCommit }]).orphans.filter(
    (orphan) => orphan.instance === instance.id && orphan.key.split('@')[0] === from,
  ).length;
  if (remapped === 0) return coreErr({ code: 'CONFLICT', message: `no record of ${instance.id} names ${from}` });

  const written = writeProvenanceRecord(root, identity.value, {
    subject: rekeySubject(instance.id, from, to),
    reason,
    approver: identity.value,
    trailers: rekeyTrailers(instance.id, from, to),
  });
  if (!written.ok) return written;

  const after = readDeductionSnapshotAtHead(root);
  const next = nextOf(root, after, deduceWorkflowState(after), instance.id);
  return coreOk({ baseline: deduction.baseline, instance, from, to, remapped, commit: written.value, next });
}

/** `workflow rekey`'s `--format console` rendering (design D6). Pure. */
export function renderRekeyConsole(value: unknown): string {
  const result = value as RekeyResult;
  const lines = [`workflow: ${result.instance.workflow} (${result.instance.id})`];
  if (result.commit === null) lines.push(`already rekeyed: ${result.from} -> ${result.to}, nothing written`);
  else lines.push(`rekeyed: ${result.from} -> ${result.to}, ${result.remapped} record(s) remapped (${result.commit})`);
  if (result.next === null) lines.push('no next step');
  else lines.push(...stepLines(result.next, 'next step'));
  return `${lines.join('\n')}\n`;
}
