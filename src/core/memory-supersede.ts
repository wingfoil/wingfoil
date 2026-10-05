/**
 * The `supersedes:` engine trigger (task-162; `dl-065` Q1.1; `spec-001` § `StateMachine`, `spec-010`
 * § Field-write ownership, `spec-008` §2's `finalize` row).
 *
 * `superseded` is the last state of the `adr` and `tech-spec` machines, behind a `waiting` state, so
 * no verb drives the edge into it. It fires when an element whose `supersedes:` names another element
 * of its type is **approved into** that `waiting` state: `memory approve adr-B` (`pending → accepted`)
 * moves the `adr-A` that `adr-B`'s `supersedes:` names `accepted → superseded`.
 *
 * The move is its own commit, because `memory history` reads a document's record by its path: one
 * commit moving both documents under the `approve` subject would put an approval, with the approver's
 * identity and the wrong bracket, into `adr-A`'s history. The engine-driven `set_state` into the last
 * state of a `sequence` emits `finalize` (`spec-008` §2), so the commit is
 * `wf({type}): finalize {A} [{state} → superseded]`, with no `Approver:` line (the decision is the
 * approve's) and a `Reason:` that names the superseding element and cites the approve commit.
 *
 * The decision is taken at `HEAD`, at the same sha the approve was decided at: the `supersedes:` value
 * as that commit records it, the named element's type and `status` as that commit records them
 * (task-247, `command-baseline` 1.4). Every refusal is returned before either commit is written.
 */
import { supersedesEdgeFrom, resolveStateMachine } from '../memory';

import { prepareMemoryTransitionAtRev, type BegunMemoryTransition } from './memory-transition';
import { coreErr, coreOk, type CoreResult } from './types';

/** The frontmatter field that names the element an approval supersedes (`spec-010`). */
export const SUPERSEDES_FIELD = 'supersedes';

/**
 * Resolve the `supersedes:` trigger for an approval already prepared and authorized: `null` when it
 * does not fire, the superseded element's prepared transition when it does, or a refusal.
 *
 * It fires only when the approve's target is a `waiting` state whose forward edge leads to
 * `superseded` ({@link supersedesEdgeFrom}) and the approved element's committed `supersedes:` is a
 * non-empty string. On any other approval the field is not read: a type without that edge has nothing
 * for it to trigger. Refusals (exit `1`), each worded `cannot approve <B>: its supersedes: field names
 * …`:
 *
 * - a value that is not a string → `VALIDATION`;
 * - no element at `HEAD` carries that id → `NOT_FOUND`;
 * - an element of another type → `VALIDATION`;
 * - an element not in the approve's target state, the approved element itself included (it is in its
 *   gate state at `HEAD`) → `INVALID_TRANSITION`, `illegal transition <s> -> superseded for type '<t>'`;
 * - every working-tree refusal a transition target meets (`prepareMemoryTransitionAtRev`).
 *
 * The caller still runs `checkMemoryTransition` on the result before writing anything, which adds the
 * unmodified-document and confinement guards.
 */
export function prepareSupersede(
  root: string,
  approved: BegunMemoryTransition,
): CoreResult<BegunMemoryTransition | null> {
  const machine = resolveStateMachine(approved.memoryYaml, approved.type);
  if (!supersedesEdgeFrom(machine, approved.to)) return coreOk(null);

  const value = approved.committedFrontmatter[SUPERSEDES_FIELD];
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return coreOk(null);

  const prefix = `cannot approve ${approved.id}: its ${SUPERSEDES_FIELD}: field names `;
  if (typeof value !== 'string') {
    return coreErr({
      code: 'VALIDATION',
      message: `${prefix}${JSON.stringify(value)}, but it must be a single element id (a string)`,
    });
  }
  const target = value.trim();
  const prepared = prepareMemoryTransitionAtRev(root, approved.sha, approved.memoryYaml, target, 'supersede', approved.type);
  if (!prepared.ok) {
    const message = prepared.error.message.startsWith(`${target},`)
      ? `${prefix}${prepared.error.message}`
      : `${prefix}${target}, which cannot be superseded: ${prepared.error.message}`;
    return coreErr({ ...prepared.error, message });
  }
  return coreOk({ ...prepared.value, identity: approved.identity });
}

/** The `Reason:` of the trigger's `finalize` commit: what superseded the element, and where it was approved. */
export function supersedeReason(approvedId: string, approveSha: string): string {
  return `superseded by ${approvedId} (its ${SUPERSEDES_FIELD}: field), approved in ${approveSha}.`;
}
