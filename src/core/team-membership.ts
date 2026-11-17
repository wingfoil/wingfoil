/**
 * Team membership pre-flight (`dl-220` Q2 (b), Action 3; `spec-006` §7 "Membership"; the `command-baseline` read
 * half; task-333).
 *
 * Every mutating operation but `init` — the `mutates: true` operations of `CORE_MODULES`, `agent execute` included —
 * runs {@link requireTeamMembership} right after `requireGitIdentity` (`./git-identity.ts`, REQ-SEC-01): the identity
 * that check resolved must be a `team.members` entry of the `dna.yaml` **committed at `HEAD`**, matched on the email,
 * case-insensitively, as `resolveMemberRoles` matches it (`./approval-authority.ts`). Otherwise the operation stops
 * at exit `1`, `VALIDATION`, before anything past the identity is read and before anything is written.
 *
 * Two cases are not refused, because there is no team to be outside of: no `dna.yaml` committed at `HEAD`, and a
 * committed `team.members: []` (the `init` scaffold, until the first member is added) — design D1. A committed
 * `dna.yaml` that does not parse or validate is refused, fail-closed, as the authority check refuses it. The working
 * tree's `dna.yaml` never decides: a member added and not committed is not yet a member. `init` takes no step, since
 * it writes the first `dna.yaml`.
 *
 * Run before transition legality and before the authority check (design D2), so a non-member asking for an approval
 * gate is told `E_NOT_A_MEMBER`, and REQ-SEC-03's `user not authorized …` stays the refusal of a member without the
 * `approver` role.
 */
import type { DnaYaml } from '../dna/schema';
import { ValidationError } from '../validation';

import type { GitIdentity } from './git-identity';
import { DNA_YAML_PATH, loadDnaYamlAtHead } from './loaders';
import { coreErr, coreOk, type CoreResult } from './types';

/** The code that opens the membership refusal's message (`spec-006` §7). */
export const E_NOT_A_MEMBER = 'E_NOT_A_MEMBER';

/**
 * `ok` when `identity` is a `team.members` entry of the `dna.yaml` committed at `HEAD` of `root`, or when there is no
 * team to be outside of (no committed `dna.yaml`, or an empty `team.members`); otherwise the `VALIDATION` refusal of
 * `spec-006` §7 with its `hint`. A committed `dna.yaml` that does not validate is refused, whoever asks.
 *
 * It takes `root`, not a parsed `DnaYaml`, so no caller can hand it the working tree's file; and the `identity`, not
 * a read of its own, so the identity judged is the one the commit will carry (`dl-064` B.1).
 */
export function requireTeamMembership(root: string, identity: GitIdentity): CoreResult<void> {
  let committed: DnaYaml | null;
  try {
    committed = loadDnaYamlAtHead(root);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return coreErr({
      code: 'VALIDATION',
      message:
        `cannot resolve team membership: the committed '${DNA_YAML_PATH}' (at HEAD) is not readable as DNA: ` +
        `${error.message}. Membership is read from the committed configuration, so the committed file must be ` +
        'valid; fix it and commit the fix, then retry.',
      details: { issues: error.issues },
    });
  }
  if (committed === null || committed.team.members.length === 0) return coreOk<void>(undefined);

  const email = identity.email.toLowerCase();
  if (committed.team.members.some((member) => member.email?.toLowerCase() === email)) return coreOk<void>(undefined);

  const { name } = identity;
  return coreErr({
    code: 'VALIDATION',
    message:
      `${E_NOT_A_MEMBER}: the git identity ${name} <${identity.email}> is not a team member: no team.members entry of ` +
      `the dna.yaml committed at HEAD has the email ${identity.email}, and only a member changes this project (dl-220)`,
    hint:
      `a member adds you with 'wingfoil dna add team.members --value "${name}" --entry-email ${identity.email} ` +
      "--entry-roles <role>', or run the command as a member's git identity",
  });
}
