/**
 * Role-based approval authority (REQ-SEC-03, adr-006-git-identity-role-based-authz —
 * task-040-role-based-approval-authority).
 *
 * adr-006's second point fixes approval authority as role-based, never bound to a named person: a
 * `.wingfoil/dna.yaml` `team.members[]` entry holds one or more `roles` from the canonical
 * `team.roles` catalogue (`src/dna/schema.ts`'s `Team`), and only a member holding the `approver`
 * role may approve a Memory document — uniformly across every type. There is no per-type approver
 * role anywhere in `memory.yaml`/`dna.yaml`: every `approval: { by_role: ... }` step across
 * `.wingfoil/workflows/custom/*.yaml` already gates on the single `approver` role, so this module
 * does the same rather than inventing a per-type mapping no spec defines.
 *
 * "Who is asking" is the identity `requireGitIdentity` (REQ-SEC-01, `./git-identity.ts`) resolved and
 * returned, handed in by the caller rather than read again here (`dl-064` B.1, task-132) — git
 * identity is WingFoil's sole attribution mechanism (adr-001/adr-006), and the transition verbs pin
 * that same value as the commit's author, so authority is checked against the exact "who" the
 * resulting approval commit records (`bug-149`). This
 * is why `team.agents` is deliberately NOT consulted here: an AI agent has no git identity of its own
 * distinct from whichever human account runs the command, so there is no code-level signal this
 * git-identity-keyed check could use to single an agent out. Structurally preventing agents from
 * holding approval authority is instead a `dna.yaml` fact (`team.agents[].approval_authority: false`)
 * enforced by process/governance (AGENTS.md §4/§8: "AI agents ... never hold approval authority"), not
 * by this predicate.
 *
 * **"Who is authorized" is read from the COMMITTED `dna.yaml`, never from the working tree**
 * (task-090, `bug-079-uncommitted-dna-yaml-grants-approval-authority`). The two halves of the check
 * therefore take deliberately different baselines, and each takes the only one it can:
 *
 * - *who is asking* — the live git identity (environment, then config), a local setting git never
 *   commits, and exactly what the resulting commit records as its author;
 * - *who may approve* — `HEAD`'s `.wingfoil/dna.yaml`, because an approval is evidence and evidence
 *   is worth what an independent reader can re-derive from the artefact of record. An uncommitted
 *   grant used to be enough to put `Approver: … (approver)` into a permanent commit that the
 *   repository's own record, at that very commit, contradicted.
 */
import type { DnaYaml } from '../dna/schema';
import { ValidationError } from '../validation';

import type { GitIdentity } from './git-identity';
import { DNA_YAML_PATH, loadDnaYaml, loadDnaYamlAtHead } from './loaders';
import { coreErr, coreOk, type CoreResult } from './types';

/** The one role that carries approval authority, uniformly across every Memory type (adr-006). */
export const APPROVER_ROLE = 'approver' as const;

/**
 * The roles held by the `dna.yaml` `team.members[]` entry whose `email` matches `email`
 * (case-insensitively — git identities are free-form and casing is not semantically meaningful),
 * or `[]` when `email` is empty or matches no member. Pure lookup — no git/filesystem access; callers
 * needing the live git identity get it from `requireGitIdentity` (`./git-identity.ts`).
 */
export function resolveMemberRoles(dna: DnaYaml, email: string): readonly string[] {
  if (email.length === 0) return [];
  const normalized = email.toLowerCase();
  const member = dna.team.members.find((candidate) => candidate.email?.toLowerCase() === normalized);
  return member?.roles ?? [];
}

/** Whether the `dna.yaml` team member matching `email` holds the {@link APPROVER_ROLE}. */
export function hasApproverRole(dna: DnaYaml, email: string): boolean {
  return resolveMemberRoles(dna, email).includes(APPROVER_ROLE);
}

/**
 * Whether the working tree's `dna.yaml` grants `email` the `approver` role — a **diagnostic only**,
 * never a decision. It answers one question: is the user looking at a file that says something the
 * repository has not recorded? Any failure to read or parse it is simply "no" (`false`): an
 * unreadable working-tree file must never change the outcome of a check whose answer comes from
 * `HEAD`.
 */
function workingTreeWouldGrant(root: string, email: string): boolean {
  try {
    return hasApproverRole(loadDnaYaml(root), email);
  } catch {
    return false;
  }
}

/**
 * Verify the principal `identity` holds the `approver` role — **as
 * the committed `.wingfoil/dna.yaml` records it** — before an approval (`memory.approve`, P1.7) or a
 * rejection (`memory.reject`, P1.8) proceeds. Returns a `CoreResult.error` (code `VALIDATION` — a
 * failed authorization precondition, mapped to exit `1` by `exitCodeForError`, mirroring
 * `requireGitIdentity`'s own precondition shape; `spec-005` §1 reserves `2` for a malformed
 * *invocation*, which none of these refusals is) carrying the exact REQ-SEC-03 fit-criterion message
 * `user not authorized to approve type '<type>'` when the git-configured email holds no `approver`
 * role at `HEAD` (including when it is unset, or matches no `team.members` entry at all); otherwise
 * `ok`. `typeName` is the Memory element type being approved (e.g. `task`, `adr`) — interpolated into
 * the refusal message only, it plays no role in the authority check itself (§ module doc comment: the
 * `approver` role is uniform across types).
 *
 * Three refusals, all fail-closed, all before anything is written:
 *
 * 1. **No authority at `HEAD`** — REQ-SEC-03's message verbatim. When the *working tree* would have
 *    granted it, a second sentence names the baseline, so a user whose editor shows them as an
 *    approver is told why the tool disagrees instead of being left to argue with the file on their
 *    screen. That diagnostic is the half of option (b) — refusing while `dna.yaml` is modified —
 *    worth keeping; the refusal itself remains a statement about the repository.
 * 2. **No committed `dna.yaml` at all** — an untracked file, or a repository with no commits: there
 *    is no record to read, so no authority can be established.
 * 3. **A committed `dna.yaml` that does not parse or validate** — the baseline is unreadable, which
 *    is not the same as "grants nothing", but leads to the same refusal.
 *
 * This function takes `root`, not a `DnaYaml`: a caller cannot hand it a parsed working-tree
 * configuration even by accident, which is what makes the committed baseline a property of the read
 * itself rather than of a precondition someone must remember to run (task-090, AC2).
 *
 * It takes the `identity`, by contrast, rather than reading it: the value must be the one
 * `requireGitIdentity` (REQ-SEC-01) validated and the one the commit will carry, and the way to
 * guarantee that is to leave this function nothing to read (`dl-064` B.1, task-132). Callers obtain it
 * from `beginMemoryTransition` (`./memory-transition.ts`), which runs the identity check first — an
 * unconfigured identity surfaces as REQ-SEC-01's own message, not this one.
 */
export function requireApprovalAuthority(root: string, typeName: string, identity: GitIdentity): CoreResult<void> {
  const { email } = identity;

  let committed: DnaYaml | null;
  try {
    committed = loadDnaYamlAtHead(root);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return coreErr({
      code: 'VALIDATION',
      message:
        `cannot resolve approval authority: the committed '${DNA_YAML_PATH}' (at HEAD) is not readable as DNA: ` +
        `${error.message}. Approval authority is read from the committed configuration, so the committed file ` +
        'must be valid; fix it and commit the fix, then retry.',
      details: { issues: error.issues },
    });
  }

  if (committed === null) {
    return coreErr({
      code: 'VALIDATION',
      message:
        `cannot resolve approval authority: '${DNA_YAML_PATH}' is not committed at HEAD. Approval authority is a ` +
        'property of the repository, not of a working tree (adr-006), so an approval can only rest on roles some ' +
        `commit records; commit '${DNA_YAML_PATH}' first, then retry.`,
    });
  }

  if (hasApproverRole(committed, email)) return coreOk<void>(undefined);

  const uncommittedGrant = workingTreeWouldGrant(root, email)
    ? ` — the working tree's '${DNA_YAML_PATH}' grants it, but that change is not committed, and approval authority ` +
      `is read from the committed configuration (adr-006); commit '${DNA_YAML_PATH}' first, then retry`
    : '';
  return coreErr({ code: 'VALIDATION', message: `user not authorized to approve type '${typeName}'${uncommittedGrant}` });
}
