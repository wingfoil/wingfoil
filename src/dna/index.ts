/**
 * `dna` module — Project DNA pillar; structured project map (P2.4). `dna.yaml`'s schema
 * (spec-002-dna-yaml-schema) lives here — the pillar owns its own independent schema (REQ-SYS-02);
 * `src/core`'s loader wires it through the shared validation pipeline. `./roles` adds the
 * role-based binding resolver (REQ-SYS-08, task-034-role-based-binding): `team.roles` is the sole
 * role catalogue, `resolveRoleHolders` reads `team.members`/`team.agents` alone to answer "who holds
 * this role today" — the foundation the Directives pillar (P3) builds on. Approval routing is *not*
 * here (`dl-033-canonical-role-resolver`, option b): "may this principal approve?" is answered by
 * `src/core/approval-authority.ts`. Further DNA behavior (`wingfoil dna show/set`, `wingfoil paths`)
 * lands in later tasks.
 */
export const MODULE_NAME = 'dna' as const;

export {
  DnaYaml,
  Project,
  Module,
  TechEntry,
  MethodologyEntry,
  Stacks,
  TeamMember,
  AgentEntry,
  RoleEntry,
  Team,
  Paths,
} from './schema';

// `splitDnaPath` (task-099, `dl-083-dotted-entry-names-in-paths`) is the pillar's path parser: the one
// place a dotted path is split, and therefore the one definition of the quoted-segment rule that makes
// an entry named `Node.js` addressable. `isValidKeyPath` is that parser reduced to a boolean, and
// `quoteDnaSegment` is its inverse, used where a refusal echoes part of a path.
export { isValidKeyPath, quoteDnaSegment, splitDnaPath, DNA_KEY_ALIASES } from './set';
export type { DnaPathSplit } from './set';

// task-093-dna-mutation-surface-add-remove-update — the mutation surface `dl-081-dna-mutation-surface-shape`
// ratified (option (E)): one schema-driven traversal (`./path`), the pure add|remove|update semantics
// over it (`./mutate`), and the comment-preserving structural edit that writes the result (`./edit`).
// `setDnaValue` is gone with them: it treated every path segment as an object key and created an object
// for any segment it could not descend into, which is the mechanism `bug-084` filed.
export {
  resolveDnaPath,
  dnaCollectionPaths,
  dnaEntryOptionNames,
  DNA_ENTRY_OPTION_PREFIX,
  dnaEntryOptionName,
  dnaEntryFieldOfOption,
} from './path';
export type { DnaEntryField, DnaFieldKind, DnaPathResolution, DnaPathTarget, DnaTargetKind } from './path';

export { applyDnaMutation } from './mutate';
export type { DnaMutationRequest, DnaMutationResult, DnaMutationVerb } from './mutate';

export { applyDnaEditInText } from './edit';
export type { DnaTextEdit, DnaTextStep } from './edit';

export {
  isRoleDefined,
  assertRoleDefined,
  resolveRoleHolders,
  UnknownRoleError,
} from './roles';
export type { RoleHolders } from './roles';
