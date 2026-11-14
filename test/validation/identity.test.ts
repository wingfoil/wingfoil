/**
 * task-260 — the attributable-identity rule (`src/validation/identity.ts`, `bug-261`), the one predicate
 * `isValidAttribution` (`src/memory/audit.ts`) and `AgentEntry` (`src/dna/schema.ts`) share. Its two
 * consumers are pinned in `test/memory/audit*.test.ts` and `test/dna/agent-identity-placeholder.test.ts`;
 * this file pins the predicates themselves.
 */
import { attributionEmailIssue, hasReservedDomain, isAttributableIdentity, isBlankIdentityName } from '../../src/validation';

describe('hasReservedDomain — RFC 2606 reserved top-level domains', () => {
  it.each(['a@b.invalid', 'a@b.example', 'a@b.test', 'a@b.localhost', 'a@B.TEST', 'a@b.test.', 'a@b.test..'])('%j is on a reserved TLD', (email) => {
    expect(hasReservedDomain(email)).toBe(true);
  });

  it.each(['noreply@anthropic.com', 'a@localhost.dev'])('%j is not (a reserved word below the top level is an ordinary label)', (email) => {
    expect(hasReservedDomain(email)).toBe(false);
  });
});

/**
 * task-352 AC 2 (`bug-193`, RFC 2606 §3; design D7): the three reserved second-level domains and every subdomain of
 * one are reserved too — case-insensitive, trailing dot ignored, label-bounded. Red until `hasReservedDomain` knows
 * them: today only the top-level label counts.
 */
describe('task-352 AC 2 — hasReservedDomain: RFC 2606 reserved second-level domains (bug-193, D7)', () => {
  it.each(['a@example.com', 'a@example.net', 'a@example.org', 'a@EXAMPLE.COM', 'a@mail.example.org', 'a@test.example.com', 'a@example.com.'])(
    '%j is reserved',
    (email) => {
      expect(hasReservedDomain(email)).toBe(true);
    },
  );

  it.each(['noreply@anthropic.com', 'a@notexample.com', 'a@examples.org', 'a@example.com.au', 'a@localhost.dev'])('%j is not (label-bounded)', (email) => {
    expect(hasReservedDomain(email)).toBe(false);
  });

  it("attributionEmailIssue('bot@example.org') is 'reserved-domain'", () => {
    expect(attributionEmailIssue('bot@example.org')).toBe('reserved-domain');
  });
});

describe('isBlankIdentityName', () => {
  it.each(['', ' ', '\t', ' \n '])('%j is blank', (name) => {
    expect(isBlankIdentityName(name)).toBe(true);
  });

  it.each(['Claude', ' Claude ', 'AI agent (Claude/Cursor/etc.)'])('%j is not', (name) => {
    expect(isBlankIdentityName(name)).toBe(false);
  });
});

describe('attributionEmailIssue — the reasons the audit rejects an email, in order', () => {
  it.each<[string, string | null]>([
    ['noreply@anthropic.com', null],
    ['root@host.(none)', 'guessed-domain'],
    ['root@host.(none).test', 'guessed-domain'],
    ['a@b.c(d)', 'malformed'],
    ['no-at.example.org', 'malformed'],
    ['a@nodot', 'malformed'],
    ['a b@example.org', 'malformed'],
    ['bot@agents.test', 'reserved-domain'],
  ])('%j → %s', (email, expected) => {
    expect(attributionEmailIssue(email)).toBe(expected);
  });
});

describe('isAttributableIdentity — a non-blank name and an email with no issue', () => {
  it.each<[string, string, boolean]>([
    ['Claude', 'noreply@anthropic.com', true],
    ['', 'noreply@anthropic.com', false],
    ['Claude', 'bot@agents.test', false],
    ['Claude', 'root@host.(none)', false],
    ['  ', 'bot@agents.test', false],
  ])('%j <%s> → %s', (name, email, expected) => {
    expect(isAttributableIdentity(name, email)).toBe(expected);
  });
});
