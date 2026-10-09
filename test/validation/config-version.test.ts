/**
 * task-208 (`bug-249`) — `isVersionIncrease`, the one comparison the version-bump gate
 * (`test/lint/helpers/version-bump.ts`) and the governance check's range rule
 * (`scripts/check-governance.cjs`) share: a bump of a versioned config file's `version:` is a numeric
 * increase of the value YAML reads, not any difference.
 */
import { isVersionIncrease } from '../../src/validation';

describe('isVersionIncrease (bug-249)', () => {
  it.each([
    [1, 1.1, true],
    [2.6, 2.7, true],
    [1.9, 2, true],
    ['1.3', '1.4', true],
    ['1.0', 1.1, true],
    ['1.2.3', '1.10.0', true],
  ])('%p → %p is an increase', (before, after, expected) => {
    expect(isVersionIncrease(before, after)).toBe(expected);
  });

  it.each([
    [1, 1],
    [1, '1.0'],
    [1.0, '1'],
    [2.5, 2.4],
    [1.1, 1.1],
    ['1.10.0', '1.2.3'],
    [null, 1],
    [1, null],
    ['one', 'two'],
    ['1.2', '1.2.0-beta'],
  ])('%p → %p is not', (before, after) => {
    expect(isVersionIncrease(before, after)).toBe(false);
  });
});
