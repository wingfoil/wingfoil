/**
 * task-179 (`bug-104`) — the closest-match suggestion for an unknown command (`spec-008-cli-grammar` §1:
 * Levenshtein distance ≤ 2), owned by `src/cli/suggest.ts` rather than delegated to Commander's
 * Damerau–Levenshtein matcher (distance ≤ 3, similarity > 0.4). Pure and deterministic (REQ-SYS-07):
 * the nearest candidate wins, and a tie goes to the first in code-unit order, whatever order the
 * candidates arrive in.
 */
import { closestCommand, levenshtein, unknownCommandHint } from '../../src/cli/suggest';

describe('levenshtein', () => {
  it.each([
    ['memory', 'memory', 0],
    ['memroy', 'memory', 2],
    ['memry', 'memory', 1],
    ['memxyz', 'memory', 3],
    ['', 'dna', 3],
    ['paths', '', 5],
  ] as const)('%s → %s is %d', (a, b, distance) => {
    expect(levenshtein(a, b)).toBe(distance);
    expect(levenshtein(b, a)).toBe(distance);
  });
});

describe('closestCommand', () => {
  const nouns = ['init', 'mcp', 'directive', 'directives', 'dna', 'memory', 'paths', 'workflow', 'help'];

  it('suggests the nearest command within distance 2', () => {
    expect(closestCommand('memroy', nouns)).toBe('memory');
    expect(closestCommand('pahts', nouns)).toBe('paths');
  });

  it('suggests nothing at distance 3 or more', () => {
    expect(closestCommand('memxyz', nouns)).toBeUndefined();
    expect(closestCommand('zzzzzzzz', nouns)).toBeUndefined();
  });

  it('breaks a tie by code-unit order, independent of the candidates\' order', () => {
    // `directivex` is 1 edit from both `directive` and `directives`.
    expect(closestCommand('directivex', ['directives', 'directive'])).toBe('directive');
    expect(closestCommand('directivex', ['directive', 'directives'])).toBe('directive');
  });

  it('never suggests the token itself, and ignores duplicates', () => {
    expect(closestCommand('dna', ['dna', 'dna'])).toBeUndefined();
  });
});

describe('unknownCommandHint', () => {
  it('is spec-005 §3.1\'s `did you mean "<name>"?`', () => {
    expect(unknownCommandHint('memory')).toBe('did you mean "memory"?');
  });
});
