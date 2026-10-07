/**
 * The placeholder-identity rule (task-260, `bug-261`) — one definition of "a `name`/`email` pair that no
 * deliberately-configured identity carries", shared by the two places that judge an identity:
 *
 * - the attribution audit, `isValidAttribution` (`src/memory/audit.ts`, REQ-SEC-02, task-132, `bug-153`),
 *   which reads the author of a commit that already exists; and
 * - the `team.agents` entry schema, `AgentEntry` (`src/dna/schema.ts`, `spec-002`), whose `name` and
 *   `email` `git-conventions` §7 writes into every `Co-Authored-By:` trailer an agent's commits carry.
 *
 * Holding both to this one rule means an agent identity `dna.yaml` accepts is one the audit would accept
 * too, and a later refinement of the rule (`bug-193`: the RFC 2606 second-level domains) reaches both.
 * It lives in `src/validation` because both modules already depend on it and on nothing of each other's.
 *
 * Pure predicates — no filesystem or git access.
 */

/**
 * RFC 2606 §2 reserves these four top-level domains for testing, documentation, invalid addresses and
 * loopback. No mailbox exists under them, so an identity on one is a placeholder — the same class of
 * "not a deliberately-configured identity" as git's guessed-domain marker (task-132, `bug-153`).
 */
const RFC2606_RESERVED_TLDS: readonly string[] = ['invalid', 'example', 'test', 'localhost'];

/**
 * Whether `email`'s domain is, or ends in, an RFC 2606 reserved top-level domain (case-insensitive).
 * Only the top-level label counts — `test.example.com` is an ordinary domain.
 */
export function hasReservedDomain(email: string): boolean {
  // A trailing dot is the fully-qualified spelling of the same domain (`foo.test.` is `foo.test`).
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase().replace(/\.+$/, '');
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return RFC2606_RESERVED_TLDS.includes(tld);
}

/** Whether `name` is empty or holds only whitespace — a name no identity is recognisable by. */
export function isBlankIdentityName(name: string): boolean {
  return name.trim().length === 0;
}

/**
 * Whether `name`/`email` is a placeholder identity: a blank name ({@link isBlankIdentityName}) or an
 * address on a reserved top-level domain ({@link hasReservedDomain}).
 */
export function isPlaceholderIdentity(name: string, email: string): boolean {
  return isBlankIdentityName(name) || hasReservedDomain(email);
}
