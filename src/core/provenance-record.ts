/**
 * The provenance-record writer (task-294, plan ruling W1-3; `spec-017` §4.8, §7.11–§7.12; `dl-187` "The commit",
 * D4; git-conventions §8, `bug-236`) — shared by `workflow adopt` and `workflow rekey` (task-295).
 *
 * A provenance record is **one commit with no file change**, in the `workflow finalize` family:
 *
 * ```
 * workflow: adopt <instance> <key> <type>:<id>      ← or `workflow: rekey <instance> <from> <to>`
 *
 * Approver: <name> <<email>> (approver)              ← a bulk adoption and a rekey only
 * Reason: <the dl-067 block>
 *
 * WingFoil-Instance: <instance>                      ← the record's trailers, in the final paragraph
 * WingFoil-Step: <key>
 * WingFoil-Adopted: <type>:<id>
 * WingFoil-Version: <semver> (<sha>)                 ← last, written by `commitEmpty`
 * ```
 *
 * The trailers share the final paragraph with `WingFoil-Version:` because git, and the workflow deduction
 * (`readAdoption` / `readRekey`, `src/workflow/provenance.ts`), read trailers from that paragraph only; the
 * `Approver:` / `Reason:` lines are a body paragraph before it. The keys come from `src/workflow/provenance.ts`, so
 * writer and reader share one spelling. A dry run (`spec-008` §2) is `commitEmpty`'s: `{dryRun: true, subject,
 * message, paths: [], diff: ''}`.
 */
import { commitEmpty } from '../storage';
import { ADOPT_SUBJECT_PREFIX, ADOPTED_TRAILER, INSTANCE_TRAILER, STEP_TRAILER } from '../workflow/provenance';

import { APPROVER_ROLE } from './approval-authority';
import type { GitIdentity } from './git-identity';
import { coreOk, type CoreResult } from './types';
import { requireCleanIndex } from './write-guard';

/** One provenance record to commit. */
export interface ProvenanceRecord {
  /** `workflow: adopt …` / `workflow: rekey …`. */
  readonly subject: string;
  /** The reason in its declared normal form (`requireReason`'s value, `dl-067`). */
  readonly reason: string;
  /** Non-null on a bulk adoption and a rekey: the body starts `Approver: <name> <<email>> (approver)`. */
  readonly approver: GitIdentity | null;
  /** The record's `Key: value` trailer lines, written in the final paragraph before `WingFoil-Version:`. */
  readonly trailers: readonly string[];
}

/** The record's message before its trailer paragraph: the subject, then one body paragraph. Pure. */
export function provenanceMessage(record: Pick<ProvenanceRecord, 'subject' | 'reason' | 'approver'>): string {
  const approver = record.approver === null ? '' : `Approver: ${record.approver.name} <${record.approver.email}> (${APPROVER_ROLE})\n`;
  return `${record.subject}\n\n${approver}Reason: ${record.reason}`;
}

/**
 * Commit `record` as an empty commit authored by `author`, returning its sha — or the `requireCleanIndex` refusal
 * while the index holds staged changes (`dl-106`), with nothing written.
 *
 * @throws `CommitFailure` when git refuses the commit; under a dry run, the commit primitive's plan.
 */
export function writeProvenanceRecord(root: string, author: GitIdentity, record: ProvenanceRecord): CoreResult<string> {
  const clean = requireCleanIndex(root, record.subject);
  if (!clean.ok) return clean;
  return coreOk(commitEmpty(root, provenanceMessage(record), { author, trailers: record.trailers }));
}

/** An adoption's subject: `workflow: adopt <instance> <key> <type>:<id>` (`spec-017` §4.8). */
export function adoptionSubject(instance: string, step: string, element: { readonly type: string; readonly id: string }): string {
  return `${ADOPT_SUBJECT_PREFIX}${instance} ${step} ${element.type}:${element.id}`;
}

/** An adoption's trailers, in this order: `WingFoil-Instance`, `WingFoil-Step`, `WingFoil-Adopted` (`spec-017` §4.8). */
export function adoptionTrailers(instance: string, step: string, element: { readonly type: string; readonly id: string }): string[] {
  return [`${INSTANCE_TRAILER}: ${instance}`, `${STEP_TRAILER}: ${step}`, `${ADOPTED_TRAILER}: ${element.type}:${element.id}`];
}
