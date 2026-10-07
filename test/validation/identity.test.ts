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

  it.each(['noreply@anthropic.com', 'a@test.example.com', 'a@example.org', 'a@localhost.dev'])('%j is not (only the top-level label counts)', (email) => {
    expect(hasReservedDomain(email)).toBe(false);
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
