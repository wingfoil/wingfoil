/**
 * Role-based **directive binding** resolver (REQ-SYS-08, task-034-role-based-binding) — the DNA-only
 * primitives directive binding (P3.2/P3.7) and auto-load-by-role (P3.6) build on. Directives bind to
 * roles, never to named persons (ADR-006): every function here reads only the already-parsed
 * `DnaYaml` (`team.roles`/`team.members`/`team.agents`, spec-002-dna-yaml-schema) — never a directive
 * or workflow file — so reassigning a person's role in `dna.yaml` changes the resolved binding with
 * zero edits anywhere else (the REQ-SYS-08 Fit Criterion).
 *
 * **Approval routing is deliberately out of scope here** (`dl-033-canonical-role-resolver`, option b).
 * "Who holds this role?" and "may this principal approve?" are different questions with different
 * answers: AI agents do hold `developer`/`reviewer` via `team.agents[].executes_as` — correct for
 * directive binding — but never hold approval authority (ADR-006, REQ-SEC-03). The canonical answer
 * to the authority question is `src/core/approval-authority.ts` (task-040), which resolves the
 * approver from `team.members` by live git identity and never consults `team.agents` at all. Note
 * that `team.agents[].approval_authority` is **not** what grants or denies authority in code: no code
 * path in this tree reads that field — it is a declarative `dna.yaml` marker, enforced by
 * process/governance (ADR-006, AGENTS.md §4/§8), as `approval-authority.ts`'s own header states.
 * BDD `p4-workflow/P4.14-approval-routing.feature`'s routing scenarios belong to `task-046-memory-approve`,
 * built on that module. Nothing in this file decides who may approve.
 *
 * No `CORE_MODULES` operation is registered here: this is the pure resolver later tasks (task-051/056
 * `directive assign`/role-based assignment) wire into their own CLI/MCP surfaces.
 */
import type { AgentEntry, DnaYaml, TeamMember } from './schema';

/**
 * Raised when a role name is referenced (e.g. a directive binding or an approval step) but is not
 * registered in `dna.yaml`'s `team.roles` catalogue. Message matches BDD
 * `p5-interaction/P5.4.2-role-directives-binding.feature` "Error - binding references an undefined
 * role" verbatim.
 */
export class UnknownRoleError extends Error {
  /** The role name that was not found in `team.roles`. */
  readonly role: string;

  constructor(role: string) {
    super(`unknown role '${role}' (not defined in dna.yaml)`);
    this.name = 'UnknownRoleError';
    this.role = role;
    // Restore the prototype chain so `instanceof UnknownRoleError` holds after transpilation.
    Object.setPrototypeOf(this, UnknownRoleError.prototype);
  }
}

/** Whether `role` is registered in `dna.team.roles` — the sole role catalogue (REQ-SYS-08). */
export function isRoleDefined(dna: DnaYaml, role: string): boolean {
  return dna.team.roles.some((entry) => entry.name === role);
}

/** Throws {@link UnknownRoleError} unless `role` is registered in `dna.team.roles`. */
export function assertRoleDefined(dna: DnaYaml, role: string): void {
  if (!isRoleDefined(dna, role)) throw new UnknownRoleError(role);
}

/** The team members and agents currently holding a role, as resolved by {@link resolveRoleHolders}. */
export interface RoleHolders {
  /** `team.members` entries whose `roles` include the resolved role. */
  readonly members: readonly TeamMember[];
  /** `team.agents` entries whose `executes_as` include the resolved role. */
  readonly agents: readonly AgentEntry[];
}

/**
 * Resolves who currently holds `role`, reading only `dna.team.members`/`dna.team.agents` — no
 * directive or workflow file. Throws {@link UnknownRoleError} if `role` is not in `team.roles`;
 * returns empty lists (not an error) when the role is defined but nobody currently holds it.
 *
 * Agents are included because they genuinely hold the roles they `executes_as` for **directive
 * binding** purposes (P3.6). This is **not** an authority check: a holder returned here may not
 * approve anything (ADR-006, REQ-SEC-03) — use `src/core/approval-authority.ts` for that.
 */
export function resolveRoleHolders(dna: DnaYaml, role: string): RoleHolders {
  assertRoleDefined(dna, role);
  return {
    members: dna.team.members.filter((member) => member.roles.includes(role)),
    agents: (dna.team.agents ?? []).filter((agent) => agent.executes_as.includes(role)),
  };
}
