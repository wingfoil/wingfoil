/**
 * The attributable-identity rule (task-260, `bug-261`) — one definition of "a `name`/`email` pair a
 * deliberately-configured identity carries", shared by the two places that judge an identity:
 *
 * - the attribution audit, `isValidAttribution` (`src/memory/audit.ts`, REQ-SEC-02, task-132, `bug-153`),
 *   which reads the author of a commit that already exists; and
 * - the `team.agents` entry schema, `AgentEntry` (`src/dna/schema.ts`, `spec-002`), whose `name` and
 *   `email` `git-conventions` §7 writes into every `Co-Authored-By:` trailer an agent's commits carry.
 *
 * The audit's verdict is its base check (`isConfiguredIdentity`, non-empty name and email after trimming)
 * followed by {@link isAttributableIdentity}, and nothing else; `AgentEntry` refuses a blank name and every
 * email {@link attributionEmailIssue} reports, and its own address shape admits no whitespace. So an agent
 * identity `dna.yaml` accepts is one the audit accepts too — the schema may be stricter (angle brackets,
 * bare GitHub noreply logins), never looser — and a later refinement of this rule (`bug-193`: the RFC 2606
 * second-level domains) reaches both. It lives in `src/validation` because both modules already depend on
 * it and on nothing of each other's.
 *
 * Pure predicates — no filesystem or git access.
 */

/**
 * The address shape the audit accepts: one `@`, a dotted domain, no whitespace, and no parenthesis in the
 * top-level label.
 */
const ATTRIBUTION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@()]+$/;

/**
 * The literal marker git itself appends to an author email when it falls back to a guessed identity
 * (user@hostname) and cannot determine a real domain — e.g. "root@buildhost.(none)". An identity carrying
 * it is not a deliberately-configured one.
 */
const GIT_GUESSED_DOMAIN_MARKER = '.(none)';

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

/** Why the audit would reject an email: see {@link attributionEmailIssue}. */
export type AttributionEmailIssue = 'guessed-domain' | 'malformed' | 'reserved-domain';

/**
 * Why `email` is not an attributable address, checked in this order: git's guessed-domain marker
 * (`.(none)`), an address outside {@link ATTRIBUTION_EMAIL_RE}, an RFC 2606 reserved top-level domain
 * ({@link hasReservedDomain}). `null` when none applies.
 */
export function attributionEmailIssue(email: string): AttributionEmailIssue | null {
  if (email.includes(GIT_GUESSED_DOMAIN_MARKER)) return 'guessed-domain';
  if (!ATTRIBUTION_EMAIL_RE.test(email)) return 'malformed';
  if (hasReservedDomain(email)) return 'reserved-domain';
  return null;
}

/**
 * Whether `name`/`email` is an attributable identity: a name that is not blank ({@link isBlankIdentityName})
 * and an email in which {@link attributionEmailIssue} finds nothing.
 */
export function isAttributableIdentity(name: string, email: string): boolean {
  return !isBlankIdentityName(name) && attributionEmailIssue(email) === null;
}
