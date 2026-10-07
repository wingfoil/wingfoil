/**
 * task-260 — the placeholder-identity rule (`src/validation/identity.ts`, `bug-261`), the one predicate
 * `isValidAttribution` (`src/memory/audit.ts`) and `AgentEntry` (`src/dna/schema.ts`) share. Its two
 * consumers are pinned in `test/memory/audit*.test.ts` and `test/dna/agent-identity-placeholder.test.ts`;
 * this file pins the predicates themselves.
 */
import { hasReservedDomain, isBlankIdentityName, isPlaceholderIdentity } from '../../src/validation';

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

describe('isPlaceholderIdentity — either half', () => {
  it.each<[string, string, boolean]>([
    ['Claude', 'noreply@anthropic.com', false],
    ['', 'noreply@anthropic.com', true],
    ['Claude', 'bot@agents.test', true],
    ['  ', 'bot@agents.test', true],
  ])('%j <%s> → %s', (name, email, expected) => {
    expect(isPlaceholderIdentity(name, email)).toBe(expected);
  });
});
